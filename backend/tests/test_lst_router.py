"""
End-to-End-Tests für GET /api/lst — fokussiert auf Edge Cases des Routers.

Ausführen:
    cd backend
    python -m pytest tests/test_lst_router.py -v
"""

import pytest
import geopandas as gpd
import pandas as pd
from httpx import AsyncClient, ASGITransport
from shapely.geometry import box

from main import app
from routers import lst as lst_router


def _make_lst_gdf(dominant_type_key=None, seal_pct=0.0):
    """Synthetische LST-GeoDataFrame mit einer Zelle für Router-Tests."""
    geom = box(9.93, 49.79, 9.931, 49.791)
    gdf = gpd.GeoDataFrame(
        {
            "lst_celsius": [30.5],
            "lst_norm": [0.6],
            "bestand_pct": [15.0],
            "seal_pct": [seal_pct],
            "dominant_type_key": [dominant_type_key],
            "plantable_m2": [10_000.0 * (1 - seal_pct)],
            "_bestand_model_version": [2],
            "_seal_model_version": [1],
        },
        geometry=[geom],
        crs="EPSG:4326",
    )
    return gdf


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


class TestLstRouterNullPaths:
    @pytest.mark.asyncio
    async def test_dominant_type_key_none_wird_als_null_ausgegeben(self, client, monkeypatch):
        """dominant_type_key=None (pandas-Objekt) muss als JSON-null ankommen,
        nicht als NaN-Artefakt oder fehlender Key.

        Risiko: _compute_seal_pct gibt explizit None zurück, nicht NaN.
        Der Router muss den Unterschied None vs. NaN korrekt behandeln.
        """
        gdf = _make_lst_gdf(dominant_type_key=None, seal_pct=0.3)

        monkeypatch.setattr(lst_router, "load_lst", lambda force_refresh=False: gdf)
        lst_router._cache = None  # In-Memory-Cache leeren

        resp = await client.get("/api/lst?refresh=true")
        assert resp.status_code == 200

        features = resp.json()["features"]
        assert len(features) == 1
        props = features[0]["properties"]

        assert "dominant_type_key" in props
        assert props["dominant_type_key"] is None  # muss null sein, nicht fehlen

    @pytest.mark.asyncio
    async def test_seal_pct_und_plantable_m2_korrekt(self, client, monkeypatch):
        """seal_pct und plantable_m2 werden korrekt aus dem GDF übernommen."""
        gdf = _make_lst_gdf(dominant_type_key="AX_Wohnbauflaeche", seal_pct=0.6)

        monkeypatch.setattr(lst_router, "load_lst", lambda force_refresh=False: gdf)
        lst_router._cache = None

        resp = await client.get("/api/lst?refresh=true")
        assert resp.status_code == 200

        props = resp.json()["features"][0]["properties"]
        assert props["seal_pct"] == pytest.approx(0.6, abs=0.001)
        assert props["plantable_m2"] == pytest.approx(4000.0, abs=1.0)
        assert props["dominant_type_key"] == "AX_Wohnbauflaeche"

    @pytest.mark.asyncio
    async def test_beide_seal_spalten_muessen_vorhanden_sein(self, client, monkeypatch):
        """has_seal-Check erfordert beide Spalten. Fehlt dominant_type_key,
        dürfen weder seal_pct noch dominant_type_key im Output erscheinen."""
        geom = box(9.93, 49.79, 9.931, 49.791)
        gdf_ohne_dom = gpd.GeoDataFrame(
            {"lst_celsius": [30.0], "lst_norm": [0.5], "seal_pct": [0.5]},
            geometry=[geom],
            crs="EPSG:4326",
        )

        monkeypatch.setattr(lst_router, "load_lst", lambda force_refresh=False: gdf_ohne_dom)
        lst_router._cache = None

        resp = await client.get("/api/lst?refresh=true")
        assert resp.status_code == 200

        props = resp.json()["features"][0]["properties"]
        # Ohne dominant_type_key fällt has_seal-Check durch → keine seal-Props
        assert "seal_pct" not in props
        assert "dominant_type_key" not in props
