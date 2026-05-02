"""
Detaillierte Tests für GET /api/trees.

Ausführen:
    cd backend
    python -m pytest tests/test_trees.py -v

Hinweise:
    - Der erste Lauf kann lange dauern (~30-60s), wenn keine
      backend/data/trees.parquet existiert (kompletter API-Abruf).
    - Folgende Läufe lesen aus Parquet → schnell.
    - Tests, die einen frischen API-Abruf benötigen (refresh=True),
      sind mit @pytest.mark.slow markiert und standardmäßig
      übersprungen. Aktivierung via:  pytest -m slow
"""

import math

import pytest
from httpx import AsyncClient, ASGITransport

from main import app
from routers import trees as trees_router


@pytest.fixture(autouse=True)
def _reset_module_cache():
    """Setzt Modul-Level-Cache vor und nach jedem Test zurück."""
    trees_router._cache = None
    yield
    trees_router._cache = None


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ---------- Basics ----------

@pytest.mark.asyncio
async def test_status_200(client):
    response = await client.get("/api/trees")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_response_is_feature_collection(client):
    body = (await client.get("/api/trees")).json()
    assert body["type"] == "FeatureCollection"
    assert "features" in body
    assert isinstance(body["features"], list)


@pytest.mark.asyncio
async def test_features_not_empty(client):
    body = (await client.get("/api/trees")).json()
    assert len(body["features"]) > 0


@pytest.mark.asyncio
async def test_feature_count_plausible(client):
    """Bulk-Export enthält alle 44.647 Bäume aus dem Baumkataster Würzburg."""
    body = (await client.get("/api/trees")).json()
    n = len(body["features"])
    assert 40_000 < n <= 45_000, f"Unerwartete Anzahl Bäume: {n}"


# ---------- Feature-Struktur ----------

@pytest.mark.asyncio
async def test_feature_structure(client):
    body = (await client.get("/api/trees")).json()
    feat = body["features"][0]

    assert feat["type"] == "Feature"
    assert "geometry" in feat
    assert "properties" in feat


@pytest.mark.asyncio
async def test_geometry_is_point(client):
    body = (await client.get("/api/trees")).json()
    geom = body["features"][0]["geometry"]
    assert geom["type"] == "Point"
    assert isinstance(geom["coordinates"], (list, tuple))
    assert len(geom["coordinates"]) == 2


@pytest.mark.asyncio
async def test_coordinates_in_wuerzburg_bbox(client):
    """Würzburg liegt grob bei lon 9.85–10.05, lat 49.7–49.9 (WGS84)."""
    body = (await client.get("/api/trees")).json()
    out_of_bounds = []
    for f in body["features"]:
        lon, lat = f["geometry"]["coordinates"]
        if not (9.7 <= lon <= 10.2 and 49.6 <= lat <= 50.0):
            out_of_bounds.append((lon, lat))
    # Tolerieren: max 1% Ausreißer (z.B. fehlerhafte Geocodes)
    assert len(out_of_bounds) / len(body["features"]) < 0.01, \
        f"{len(out_of_bounds)} Bäume außerhalb Würzburg-Bbox"


@pytest.mark.asyncio
async def test_properties_contain_expected_fields(client):
    body = (await client.get("/api/trees")).json()
    expected = {"baumart", "baumart_la", "kronenbrei", "baumhoehe",
                "stammumfan", "baumtyp", "source_id"}
    props = body["features"][0]["properties"]
    missing = expected - set(props.keys())
    assert not missing, f"Fehlende Properties: {missing}"


@pytest.mark.asyncio
async def test_at_least_some_baumart_filled(client):
    """Sanity-Check: mindestens 50% der Bäume haben eine Baumart."""
    body = (await client.get("/api/trees")).json()
    with_art = sum(1 for f in body["features"] if f["properties"].get("baumart"))
    assert with_art / len(body["features"]) > 0.5


# ---------- Caching-Verhalten ----------

@pytest.mark.asyncio
async def test_module_cache_is_reused(client):
    """Zweiter Aufruf darf nicht erneut load_tree_cadastre() rufen."""
    await client.get("/api/trees")
    assert trees_router._cache is not None

    call_count = {"n": 0}
    real = trees_router.load_tree_cadastre

    async def spy(*args, **kwargs):
        call_count["n"] += 1
        return await real(*args, **kwargs)

    trees_router.load_tree_cadastre = spy
    try:
        await client.get("/api/trees")
        assert call_count["n"] == 0, "Cache wurde umgangen"
    finally:
        trees_router.load_tree_cadastre = real


# ---------- refresh-Parameter ----------

@pytest.mark.slow
@pytest.mark.asyncio
async def test_refresh_query_triggers_reload(client, monkeypatch):
    """?refresh=true muss force_refresh=True an den Loader durchreichen."""
    seen = {}
    real = trees_router.load_tree_cadastre

    async def spy(force_refresh: bool = False):
        seen["force_refresh"] = force_refresh
        return await real(force_refresh=force_refresh)

    monkeypatch.setattr(trees_router, "load_tree_cadastre", spy)

    await client.get("/api/trees?refresh=true")
    assert seen.get("force_refresh") is True


# ---------- Fehlerverhalten ----------

@pytest.mark.asyncio
async def test_loader_failure_returns_502(client, monkeypatch):
    async def boom(force_refresh: bool = False):
        raise RuntimeError("API down")

    monkeypatch.setattr(trees_router, "load_tree_cadastre", boom)
    response = await client.get("/api/trees?refresh=true")
    assert response.status_code == 502
    assert "Baumkataster" in response.json()["detail"]
