"""
Tests für GET /api/simulate/baeume und GET /api/simulate/wasser.

Ausführen:
    cd backend
    python -m pytest tests/test_simulate.py -v
"""

import pytest
from httpx import AsyncClient, ASGITransport

from main import app
from simulation_params import (
    ANNUAL_RAINFALL_WUERZBURG_M,
    CO2_KG_PER_TREE_YEAR,
    CROWN_AREA_M2_DEFAULT,
    LST_PER_PCT_CANOPY_MIXED,
    RUNOFF_COEFFICIENTS,
)


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ─────────────────────────────────────────────────────────────────────────────
# Sim A — /api/simulate/baeume
# ─────────────────────────────────────────────────────────────────────────────


class TestSimulateBaeume:
    @pytest.mark.asyncio
    async def test_standardfall(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=100&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta_coverage_pct"] == 50.0
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * 50.0, 2)
        assert data["co2_kg_year"] == round(100 * CO2_KG_PER_TREE_YEAR, 1)

    @pytest.mark.asyncio
    async def test_genau_100_prozent_deckung(self, client):
        # 200 Bäume × 50 m² = 10.000 m² = 100 % auf 10.000 m²
        resp = await client.get("/api/simulate/baeume?n_trees=200&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta_coverage_pct"] == 100.0
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * 100.0, 2)

    @pytest.mark.asyncio
    async def test_ueber_100_prozent_lst_gecappt(self, client):
        # 300 Bäume → 150 % Deckung; δLST muss gecappt sein (wie bei 100 %)
        resp = await client.get("/api/simulate/baeume?n_trees=300&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta_coverage_pct"] == 150.0
        # LST basiert intern auf 100 % (nicht extrapoliert)
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * 100.0, 2)

    @pytest.mark.asyncio
    async def test_1_baum_auf_1_kachel(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=1&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta_coverage_pct"] == round(50.0 / 10000.0 * 100.0, 1)
        assert data["delta_lst_celsius"] == pytest.approx(
            round(LST_PER_PCT_CANOPY_MIXED * (CROWN_AREA_M2_DEFAULT / 10000.0 * 100.0), 2),
            abs=0.01,
        )

    @pytest.mark.asyncio
    async def test_viele_kacheln(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=1000&area_m2=500000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["delta_coverage_pct"] == round(1000 * 50.0 / 500000.0 * 100.0, 1)
        assert data["delta_lst_celsius"] == pytest.approx(
            round(LST_PER_PCT_CANOPY_MIXED * 10.0, 2), abs=0.01
        )

    @pytest.mark.asyncio
    async def test_co2_unter_1000kg(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=10&area_m2=10000")
        assert resp.status_code == 200
        assert resp.json()["co2_kg_year"] == round(10 * CO2_KG_PER_TREE_YEAR, 1)

    # ── Validierung ──────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    @pytest.mark.parametrize("params", [
        "n_trees=0&area_m2=10000",
        "n_trees=-1&area_m2=10000",
        "area_m2=10000",           # kein n_trees
        "n_trees=100&area_m2=0",
        "n_trees=100&area_m2=-100",
        "n_trees=100",             # kein area_m2
    ])
    async def test_validierungsfehler_422(self, client, params):
        resp = await client.get(f"/api/simulate/baeume?{params}")
        assert resp.status_code == 422

    # ── Struktur ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_pflichtfelder_vorhanden(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=50&area_m2=5000")
        assert resp.status_code == 200
        data = resp.json()
        for field in ["n_trees", "area_m2", "delta_coverage_pct",
                      "delta_lst_celsius", "co2_kg_year", "coefficients_used", "caveats"]:
            assert field in data, f"Pflichtfeld fehlt: {field}"

    @pytest.mark.asyncio
    async def test_caveats_nicht_leer(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=50&area_m2=5000")
        data = resp.json()
        assert isinstance(data["caveats"], list)
        assert len(data["caveats"]) >= 1
        assert all(isinstance(c, str) for c in data["caveats"])

    @pytest.mark.asyncio
    async def test_coefficients_used_inhalt(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=50&area_m2=5000")
        coeff = resp.json()["coefficients_used"]
        assert coeff["land_use"] == "mixed"
        assert coeff["crown_area_m2"] == CROWN_AREA_M2_DEFAULT
        assert coeff["co2_kg_per_tree_year"] == CO2_KG_PER_TREE_YEAR
        assert coeff["lst_per_pct_canopy"] == LST_PER_PCT_CANOPY_MIXED

    # ── existing_coverage_pct (Bestandsberücksichtigung) ─────────────────────

    @pytest.mark.asyncio
    async def test_existing_coverage_default_ist_null(self, client):
        """Ohne Param → existing=0, effective_new=delta_coverage_capped (Backward Compat)."""
        resp = await client.get("/api/simulate/baeume?n_trees=100&area_m2=10000")
        data = resp.json()
        assert data["existing_coverage_pct"] == 0.0
        assert data["effective_new_pct"] == 50.0
        assert data["total_coverage_pct"] == 50.0

    @pytest.mark.asyncio
    async def test_existing_coverage_30_neue_passt_in_headroom(self, client):
        """30% Bestand + 100 Bäume = 50% neu — passt in 70% Headroom, voller Δ°C."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=100&area_m2=10000&existing_coverage_pct=30"
        )
        data = resp.json()
        assert data["existing_coverage_pct"] == 30.0
        assert data["delta_coverage_pct"] == 50.0
        assert data["effective_new_pct"] == 50.0
        assert data["total_coverage_pct"] == 80.0
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * 50.0, 2)

    @pytest.mark.asyncio
    async def test_existing_coverage_30_neue_ueberschreitet_headroom(self, client):
        """30% Bestand + 200 Bäume = 100% neu, aber nur 70% Headroom — Δ°C basiert auf 70%."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=200&area_m2=10000&existing_coverage_pct=30"
        )
        data = resp.json()
        assert data["existing_coverage_pct"] == 30.0
        assert data["delta_coverage_pct"] == 100.0      # ungekürzt
        assert data["effective_new_pct"] == 70.0         # gekappt auf Headroom
        assert data["total_coverage_pct"] == 100.0
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * 70.0, 2)

    @pytest.mark.asyncio
    async def test_existing_coverage_100_kein_effekt(self, client):
        """Bestand bei 100% → Headroom 0 → kein Δ°C, CO₂ bleibt linear."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=50&area_m2=10000&existing_coverage_pct=100"
        )
        data = resp.json()
        assert data["effective_new_pct"] == 0.0
        assert data["delta_lst_celsius"] == 0.0
        assert data["co2_kg_year"] == round(50 * CO2_KG_PER_TREE_YEAR, 1)

    @pytest.mark.asyncio
    async def test_existing_coverage_caveat_bei_overflow(self, client):
        """Bei Headroom-Überschreitung erscheint ein zusätzlicher Caveat ganz vorne."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=300&area_m2=10000&existing_coverage_pct=40"
        )
        data = resp.json()
        assert any("Bestand bereits" in c for c in data["caveats"])

    @pytest.mark.asyncio
    @pytest.mark.parametrize("existing", [-1, 100.1, 150])
    async def test_existing_coverage_validierung_422(self, client, existing):
        resp = await client.get(
            f"/api/simulate/baeume?n_trees=10&area_m2=10000&existing_coverage_pct={existing}"
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_existing_coverage_pflichtfelder(self, client):
        resp = await client.get(
            "/api/simulate/baeume?n_trees=10&area_m2=10000&existing_coverage_pct=15"
        )
        data = resp.json()
        for field in ["existing_coverage_pct", "effective_new_pct", "total_coverage_pct"]:
            assert field in data, f"neues Pflichtfeld fehlt: {field}"


# ─────────────────────────────────────────────────────────────────────────────
# Sim B — /api/simulate/wasser
# ─────────────────────────────────────────────────────────────────────────────


class TestSimulateWasser:
    @pytest.mark.asyncio
    async def test_standardfall(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface=schotterrasen"
        )
        assert resp.status_code == 200
        data = resp.json()
        # delta_C = 0.95 - 0.30 = 0.65
        expected_infil = round(1000 * ANNUAL_RAINFALL_WUERZBURG_M * 0.65, 1)
        assert data["infiltration_m3_year"] == expected_infil
        assert data["retention_pct"] == round((1 - 0.30) * 100, 1)
        assert data["context_persons"] == round(expected_infil / 54.75, 1)

    @pytest.mark.asyncio
    async def test_maximale_entsiegelung(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface=rasendecke"
        )
        assert resp.status_code == 200
        data = resp.json()
        delta_c = RUNOFF_COEFFICIENTS["asphalt"] - RUNOFF_COEFFICIENTS["rasendecke"]
        expected = round(1000 * ANNUAL_RAINFALL_WUERZBURG_M * delta_c, 1)
        assert data["infiltration_m3_year"] == expected

    @pytest.mark.asyncio
    async def test_gleicher_belag(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface=asphalt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["infiltration_m3_year"] == 0.0
        assert data["retention_pct"] == round((1 - 0.95) * 100, 1)
        # Caveat muss enthalten sein
        assert any("gleich" in c or "keine" in c.lower() for c in data["caveats"])

    @pytest.mark.asyncio
    async def test_invertierter_fall(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=rasendecke&to_surface=asphalt"
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["infiltration_m3_year"] == 0.0

    @pytest.mark.asyncio
    async def test_default_parameter(self, client):
        resp = await client.get("/api/simulate/wasser?area_m2=5000")
        assert resp.status_code == 200
        data = resp.json()
        assert data["from_surface"] == "asphalt"
        assert data["to_surface"] == "schotterrasen"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("surface", list(RUNOFF_COEFFICIENTS.keys()))
    async def test_alle_belagstypen_als_to_surface(self, client, surface):
        resp = await client.get(
            f"/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface={surface}"
        )
        assert resp.status_code == 200
        assert resp.json()["infiltration_m3_year"] >= 0.0

    # ── Validierung ──────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    @pytest.mark.parametrize("params", [
        "area_m2=0&from_surface=asphalt&to_surface=schotterrasen",
        "area_m2=-500&from_surface=asphalt&to_surface=schotterrasen",
        "from_surface=asphalt&to_surface=schotterrasen",  # kein area_m2
    ])
    async def test_validierungsfehler_422(self, client, params):
        resp = await client.get(f"/api/simulate/wasser?{params}")
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unbekannter_from_surface_422(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=beton&to_surface=schotterrasen"
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_unbekannter_to_surface_422(self, client):
        resp = await client.get(
            "/api/simulate/wasser?area_m2=1000&from_surface=asphalt&to_surface=unknown"
        )
        assert resp.status_code == 422

    # ── Struktur ─────────────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_pflichtfelder_vorhanden(self, client):
        resp = await client.get("/api/simulate/wasser?area_m2=3000")
        assert resp.status_code == 200
        data = resp.json()
        for field in ["area_m2", "from_surface", "to_surface", "infiltration_m3_year",
                      "retention_pct", "context_persons", "runoff_coefficients",
                      "rainfall_m_year", "caveats"]:
            assert field in data, f"Pflichtfeld fehlt: {field}"

    @pytest.mark.asyncio
    async def test_runoff_coefficients_struktur(self, client):
        resp = await client.get("/api/simulate/wasser?area_m2=3000")
        rc = resp.json()["runoff_coefficients"]
        assert "from" in rc and "to" in rc and "delta" in rc

    @pytest.mark.asyncio
    async def test_rainfall_m_year(self, client):
        resp = await client.get("/api/simulate/wasser?area_m2=3000")
        assert resp.json()["rainfall_m_year"] == ANNUAL_RAINFALL_WUERZBURG_M

    @pytest.mark.asyncio
    async def test_caveats_nicht_leer(self, client):
        resp = await client.get("/api/simulate/wasser?area_m2=3000")
        caveats = resp.json()["caveats"]
        assert isinstance(caveats, list)
        assert len(caveats) >= 1

    @pytest.mark.asyncio
    async def test_rechenkontrolle(self, client):
        area = 2500.0
        resp = await client.get(
            f"/api/simulate/wasser?area_m2={area}&from_surface=asphalt&to_surface=rasengitter"
        )
        data = resp.json()
        delta_c = RUNOFF_COEFFICIENTS["asphalt"] - RUNOFF_COEFFICIENTS["rasengitter"]
        expected_infil = round(area * ANNUAL_RAINFALL_WUERZBURG_M * delta_c, 1)
        expected_persons = round(expected_infil / 54.75, 1)
        assert data["infiltration_m3_year"] == expected_infil
        assert data["context_persons"] == expected_persons
