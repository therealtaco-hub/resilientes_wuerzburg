"""
Detaillierte Tests für GET /api/zensus.

Ausführen:
    cd backend
    python -m pytest tests/test_zensus.py -v

Hinweise:
    - Erste Ausführung: liest beide CSVs, baut GeoDataFrame, schreibt
      backend/data/zensus.parquet. Folgende Aufrufe lesen Parquet.
    - Setzt voraus, dass die beiden Zensus-CSVs unter backend/data/ liegen.
"""

import math

import pytest
from httpx import AsyncClient, ASGITransport

from main import app
from routers import zensus as zensus_router


@pytest.fixture(autouse=True)
def _reset_module_cache():
    zensus_router._cache = None
    yield
    zensus_router._cache = None


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------- Basics ----------

@pytest.mark.asyncio
async def test_status_200(client):
    response = await client.get("/api/zensus")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_response_is_feature_collection(client):
    body = (await client.get("/api/zensus")).json()
    assert body["type"] == "FeatureCollection"
    assert isinstance(body.get("features"), list)


@pytest.mark.asyncio
async def test_features_not_empty(client):
    body = (await client.get("/api/zensus")).json()
    assert len(body["features"]) > 0


@pytest.mark.asyncio
async def test_feature_count_plausible(client):
    """Erwartung für Würzburger Stadtgebiet: ~5.000–15.000 100m-Zellen."""
    body = (await client.get("/api/zensus")).json()
    n = len(body["features"])
    assert 3_000 < n < 20_000, f"Unerwartete Zellzahl: {n}"


# ---------- Feature-Struktur ----------

@pytest.mark.asyncio
async def test_geometry_is_polygon(client):
    """buffer(50, cap_style=3) erzeugt 100×100m-Quadrate."""
    body = (await client.get("/api/zensus")).json()
    geom = body["features"][0]["geometry"]
    assert geom["type"] in ("Polygon", "MultiPolygon")


@pytest.mark.asyncio
async def test_polygon_has_5_points(client):
    """Quadrat = 5 Koordinaten (4 Ecken + Schluss = Start)."""
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"][:20]:
        ring = feat["geometry"]["coordinates"][0]
        assert len(ring) == 5, f"Polygon-Ring hat {len(ring)} Punkte, erwartet 5"


@pytest.mark.asyncio
async def test_properties_have_required_keys(client):
    body = (await client.get("/api/zensus")).json()
    required = {"gitter_id", "anteil_65plus", "einwohner"}
    for feat in body["features"][:5]:
        assert required <= set(feat["properties"].keys())


@pytest.mark.asyncio
async def test_gitter_id_format(client):
    """GITTER_ID_100m beginnt mit 'CRS3035RES100m'."""
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"][:20]:
        gid = feat["properties"]["gitter_id"]
        assert isinstance(gid, str)
        assert gid.startswith("CRS3035RES100m"), f"Unerwartete Gitter-ID: {gid}"


# ---------- Geographische Plausibilität ----------

@pytest.mark.asyncio
async def test_coordinates_in_wuerzburg_bbox_wgs84(client):
    """Nach to_crs(EPSG:4326) müssen Koordinaten in Würzburger Bbox liegen."""
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"][:50]:
        ring = feat["geometry"]["coordinates"][0]
        for lon, lat in ring:
            assert 9.7 <= lon <= 10.2, f"lon out of bounds: {lon}"
            assert 49.6 <= lat <= 50.0, f"lat out of bounds: {lat}"


# ---------- Wertebereich der Properties ----------

@pytest.mark.asyncio
async def test_anteil_65plus_in_valid_range(client):
    """anteil_65plus muss None oder in [0, 1] liegen."""
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"]:
        v = feat["properties"]["anteil_65plus"]
        if v is None:
            continue
        assert 0.0 <= v <= 1.0, f"anteil_65plus außerhalb [0,1]: {v}"


@pytest.mark.asyncio
async def test_nan_serialized_as_null(client):
    """NaN aus pandas darf nicht als Float-NaN, sondern als JSON null durchkommen."""
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"]:
        v = feat["properties"]["anteil_65plus"]
        if v is None:
            continue
        assert isinstance(v, (int, float))
        assert not (isinstance(v, float) and math.isnan(v))


@pytest.mark.asyncio
async def test_einwohner_non_negative(client):
    body = (await client.get("/api/zensus")).json()
    for feat in body["features"]:
        ew = feat["properties"]["einwohner"]
        if ew is None:
            continue
        assert ew >= 0, f"Negative Einwohnerzahl: {ew}"


@pytest.mark.asyncio
async def test_some_zellen_have_senior_share(client):
    """Sanity: mindestens ein paar Zellen müssen einen anteil_65plus > 0 haben."""
    body = (await client.get("/api/zensus")).json()
    with_share = [f for f in body["features"]
                  if f["properties"]["anteil_65plus"] not in (None, 0)]
    assert len(with_share) > 100, "Zu wenige Zellen mit anteil_65plus > 0"


# ---------- Caching ----------

@pytest.mark.asyncio
async def test_module_cache_is_reused(client):
    await client.get("/api/zensus")
    assert zensus_router._cache is not None

    call_count = {"n": 0}
    real = zensus_router.load_zensus

    def spy(*args, **kwargs):
        call_count["n"] += 1
        return real(*args, **kwargs)

    zensus_router.load_zensus = spy
    try:
        await client.get("/api/zensus")
        assert call_count["n"] == 0
    finally:
        zensus_router.load_zensus = real


# ---------- refresh-Parameter ----------

@pytest.mark.asyncio
async def test_refresh_query_triggers_force_refresh(client, monkeypatch):
    seen = {}
    real = zensus_router.load_zensus

    def spy(force_refresh: bool = False):
        seen["force_refresh"] = force_refresh
        return real(force_refresh=force_refresh)

    monkeypatch.setattr(zensus_router, "load_zensus", spy)

    await client.get("/api/zensus?refresh=true")
    assert seen.get("force_refresh") is True


@pytest.mark.asyncio
async def test_no_refresh_param_means_false(client, monkeypatch):
    seen = {}
    real = zensus_router.load_zensus

    def spy(force_refresh: bool = False):
        seen["force_refresh"] = force_refresh
        return real(force_refresh=force_refresh)

    monkeypatch.setattr(zensus_router, "load_zensus", spy)

    await client.get("/api/zensus")
    assert seen.get("force_refresh") is False


# ---------- Fehlerverhalten ----------

@pytest.mark.asyncio
async def test_loader_failure_returns_500(client, monkeypatch):
    def boom(force_refresh: bool = False):
        raise RuntimeError("CSV missing")

    monkeypatch.setattr(zensus_router, "load_zensus", boom)
    response = await client.get("/api/zensus?refresh=true")
    assert response.status_code == 500
    assert "Zensus" in response.json()["detail"]
