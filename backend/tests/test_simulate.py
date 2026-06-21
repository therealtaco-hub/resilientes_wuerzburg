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
    CONTEXT_PERSONS_M3_PER_YEAR,
    CROWN_AREA_M2_DEFAULT,
    LST_PER_PCT_CANOPY_MIXED,
    RUNOFF_COEFFICIENTS,
    inverse_ratio,
    projected_cover_pct,
)


def _projected_cover_pct(n_trees, area_m2, existing_pct=0.0):
    """Berechnet (total_coverage_pct, effective_new_pct) mit simulation_params-Helpern.

    Nutzt dieselben inverse_ratio / projected_cover_pct wie der Router — ein
    gespiegelter Vorzeichenfehler würde beide treffen und so sichtbar bleiben.
    """
    new_ratio = n_trees * CROWN_AREA_M2_DEFAULT / area_m2
    existing_r = inverse_ratio(existing_pct)
    total = max(existing_pct, projected_cover_pct(existing_r + new_ratio))
    return total, total - existing_pct


@pytest.fixture
def client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ─────────────────────────────────────────────────────────────────────────────
# Sim A — /api/simulate/baeume
# ─────────────────────────────────────────────────────────────────────────────


class TestSimulateBaeume:
    @pytest.mark.asyncio
    async def test_standardfall(self, client):
        # ratio = 100×50/10.000 = 0,5 → projizierte Deckung (1−e^−0,5)·100 ≈ 39,3 %
        resp = await client.get("/api/simulate/baeume?n_trees=100&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        total, eff = _projected_cover_pct(100, 10000)
        assert data["total_coverage_pct"] == round(total, 1)
        assert data["total_coverage_pct"] == 39.3  # Literal-Pin: ratio=0,5 → (1−e^−0,5)×100
        assert data["effective_new_pct"] == round(eff, 1)
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * eff, 2)
        assert data["co2_kg_year"] == round(100 * CO2_KG_PER_TREE_YEAR, 1)
        # delta_coverage_pct existiert nicht mehr; crown_area_ratio → new_crown_area_ratio
        assert "delta_coverage_pct" not in data
        assert "crown_area_ratio" not in data
        assert data["new_crown_area_ratio"] == 0.5

    @pytest.mark.asyncio
    async def test_ratio_1_ergibt_63_prozent(self, client):
        # 200 Bäume × 50 m² → ratio = 1,0 → (1−e^−1)·100 ≈ 63,2 % (nicht 100 %)
        resp = await client.get("/api/simulate/baeume?n_trees=200&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        total, eff = _projected_cover_pct(200, 10000)
        assert data["total_coverage_pct"] == round(total, 1)
        assert 62.0 < data["total_coverage_pct"] < 64.0
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * eff, 2)

    @pytest.mark.asyncio
    async def test_hohe_dichte_konvergiert_unter_100(self, client):
        # 300 Bäume → ratio = 1,5; Modell konvergiert asymptotisch, bleibt < 100 %
        resp = await client.get("/api/simulate/baeume?n_trees=300&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        total, _ = _projected_cover_pct(300, 10000)
        assert data["total_coverage_pct"] == round(total, 1)
        assert data["total_coverage_pct"] < 100.0

    @pytest.mark.asyncio
    async def test_1_baum_auf_1_kachel(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=1&area_m2=10000")
        assert resp.status_code == 200
        data = resp.json()
        total, eff = _projected_cover_pct(1, 10000)
        assert data["total_coverage_pct"] == round(total, 1)
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * eff, 2)

    @pytest.mark.asyncio
    async def test_viele_kacheln(self, client):
        resp = await client.get("/api/simulate/baeume?n_trees=1000&area_m2=500000")
        assert resp.status_code == 200
        data = resp.json()
        total, eff = _projected_cover_pct(1000, 500000)
        assert data["total_coverage_pct"] == round(total, 1)
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * eff, 2)

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
        for field in ["n_trees", "area_m2", "new_crown_area_ratio", "effective_new_pct",
                      "total_coverage_pct", "delta_lst_celsius", "co2_kg_year",
                      "coefficients_used", "caveats"]:
            assert field in data, f"Pflichtfeld fehlt: {field}"
        assert "delta_coverage_pct" not in data
        assert "crown_area_ratio" not in data

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
        """Ohne Param → existing=0, effective_new = projizierte Deckung des Zuwachses."""
        resp = await client.get("/api/simulate/baeume?n_trees=100&area_m2=10000")
        data = resp.json()
        total, eff = _projected_cover_pct(100, 10000, existing_pct=0.0)
        assert data["existing_coverage_pct"] == 0.0
        assert data["effective_new_pct"] == round(eff, 1)
        assert data["total_coverage_pct"] == round(total, 1)

    @pytest.mark.asyncio
    async def test_existing_coverage_addiert_im_projektionsraum(self, client):
        """30% Bestand + 100 Bäume: Bestand & Neu werden als Flächen-Verhältnis addiert,
        nicht als Prozente — Zuwachs ist kleiner als bei 0% Bestand (abnehmender Grenznutzen)."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=100&area_m2=10000&existing_coverage_pct=30"
        )
        data = resp.json()
        total, eff = _projected_cover_pct(100, 10000, existing_pct=30.0)
        assert data["existing_coverage_pct"] == 30.0
        assert data["effective_new_pct"] == round(eff, 1)
        assert data["total_coverage_pct"] == round(total, 1)
        assert data["delta_lst_celsius"] == round(LST_PER_PCT_CANOPY_MIXED * eff, 2)
        # Zuwachs bei 30% Bestand < Zuwachs bei 0% Bestand (gleiche Baumzahl)
        _, eff_leer = _projected_cover_pct(100, 10000, existing_pct=0.0)
        assert eff < eff_leer

    @pytest.mark.asyncio
    async def test_existing_coverage_hoch_kleiner_zuwachs(self, client):
        """Hoher Bestand → neue Bäume decken überwiegend bereits beschattete Fläche →
        kleiner, aber stets nicht-negativer effektiver Zuwachs."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=200&area_m2=10000&existing_coverage_pct=80"
        )
        data = resp.json()
        total, eff = _projected_cover_pct(200, 10000, existing_pct=80.0)
        assert data["effective_new_pct"] == round(eff, 1)
        assert data["effective_new_pct"] >= 0.0
        assert data["total_coverage_pct"] >= 80.0

    @pytest.mark.asyncio
    async def test_existing_coverage_100_kein_effekt(self, client):
        """Bestand bei 100% → kein Δ°C, effective_new nicht negativ (Log-Schutz + max-Guard)."""
        resp = await client.get(
            "/api/simulate/baeume?n_trees=50&area_m2=10000&existing_coverage_pct=100"
        )
        data = resp.json()
        assert data["effective_new_pct"] == 0.0
        assert data["delta_lst_celsius"] == 0.0
        assert data["co2_kg_year"] == round(50 * CO2_KG_PER_TREE_YEAR, 1)

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
        c_from = RUNOFF_COEFFICIENTS["asphalt"]
        c_to = RUNOFF_COEFFICIENTS["schotterrasen"]
        expected_infil = round(1000 * ANNUAL_RAINFALL_WUERZBURG_M * (c_from - c_to), 1)
        assert data["infiltration_m3_year"] == expected_infil
        assert data["retention_pct"] == round((1 - c_to) * 100, 1)
        assert data["context_persons"] == round(expected_infil / CONTEXT_PERSONS_M3_PER_YEAR, 1)

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
        assert data["retention_pct"] == round((1 - RUNOFF_COEFFICIENTS["asphalt"]) * 100, 1)
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
        expected_persons = round(expected_infil / CONTEXT_PERSONS_M3_PER_YEAR, 1)
        assert data["infiltration_m3_year"] == expected_infil
        assert data["context_persons"] == expected_persons
