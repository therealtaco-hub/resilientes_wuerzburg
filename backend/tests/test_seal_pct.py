"""
Unit-Tests für _compute_seal_pct (Teil 2 — pflanzbare Fläche über Versiegelungsgrad).

Die Funktion ruft load_entsiegelung() intern auf → wird per monkeypatch durch
synthetische Polygone ersetzt. Alle Geometrien in EPSG:25832, damit die in der
Funktion erzwungene metrische Flächenberechnung exakt 10.000 m²/Kachel ergibt.

Ausführen:
    cd backend
    python -m pytest tests/test_seal_pct.py -v
"""

import geopandas as gpd
import pytest
from shapely.geometry import box

from utils import data_loader


def _ents(rows):
    return gpd.GeoDataFrame(
        {"type_key": [r[0] for r in rows], "geometry": [r[1] for r in rows]},
        crs="EPSG:25832",
    )


@pytest.fixture
def cells():
    # Drei 100×100-m-Kacheln (= 10.000 m²) nebeneinander, EPSG:25832.
    return gpd.GeoDataFrame(
        {"geometry": [box(0, 0, 100, 100), box(200, 0, 300, 100), box(400, 0, 500, 100)]},
        crs="EPSG:25832",
    )


def test_voll_in_wohnbau(cells, monkeypatch):
    """Kachel komplett in einer Wohnbaufläche → seal ≈ 0,60, dominant = AX_Wohnbauflaeche."""
    ents = _ents([("AX_Wohnbauflaeche", box(0, 0, 100, 100))])
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: ents)
    seal, dom = data_loader._compute_seal_pct(cells)
    assert seal.iloc[0] == pytest.approx(0.60, abs=1e-3)
    assert dom.iloc[0] == "AX_Wohnbauflaeche"


def test_keine_ueberdeckung_ist_unversiegelt(cells, monkeypatch):
    """Kachel ohne Polygon → seal = 0, dominant = None (E2: Grün-/Freifläche)."""
    ents = _ents([("AX_Wohnbauflaeche", box(0, 0, 100, 100))])
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: ents)
    seal, dom = data_loader._compute_seal_pct(cells)
    assert seal.iloc[1] == 0.0
    assert dom.iloc[1] is None


def test_flaechengewichteter_mischwert(cells, monkeypatch):
    """60 % Wohnbau (0,60) + 40 % Straße (0,98) → seal = 0,752; dominant = größere Fläche."""
    ents = _ents([
        ("AX_Wohnbauflaeche",  box(400, 0, 460, 100)),   # 6.000 m²
        ("AX_Strassenverkehr", box(460, 0, 500, 100)),   # 4.000 m²
    ])
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: ents)
    seal, dom = data_loader._compute_seal_pct(cells)
    assert seal.iloc[2] == pytest.approx(0.752, abs=1e-3)
    assert dom.iloc[2] == "AX_Wohnbauflaeche"


def test_keine_doppelzaehlung_bei_ueberlappung(cells, monkeypatch):
    """Regression (ATKIS/OSM-Doppelzählung): zwei deckungsgleiche Polygone dürfen nicht
    aufsummiert werden. Priority-Union → höchste Rate gewinnt (0,95), nicht clip auf 1,0."""
    ents = _ents([
        ("AX_IndustrieUndGewerbeflaeche", box(0, 0, 100, 100)),  # 0,80, volle Kachel
        ("osm_parking",                   box(0, 0, 100, 100)),  # 0,95, volle Kachel (Überlappung)
    ])
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: ents)
    seal, _ = data_loader._compute_seal_pct(cells)
    assert seal.iloc[0] < 1.0
    assert seal.iloc[0] == pytest.approx(0.95, abs=1e-3)


def test_teilueberlappung_priority_union(cells, monkeypatch):
    """Teilüberlappung: OSM-Parkplatz (0,95, halbe Kachel) über ATKIS-Mischnutzung
    (0,65, volle Kachel) → 0,5×0,95 + 0,5×0,65 = 0,80 — nie mehr als die Union-Fläche."""
    ents = _ents([
        ("AX_FlaecheGemischterNutzung", box(0, 0, 100, 100)),  # volle Kachel
        ("osm_parking",                 box(0, 0, 50, 100)),   # linke Hälfte, überlappend
    ])
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: ents)
    seal, _ = data_loader._compute_seal_pct(cells)
    assert seal.iloc[0] == pytest.approx(0.80, abs=1e-3)


def test_leere_entsiegelung_alles_unversiegelt(cells, monkeypatch):
    """Keine Polygone überhaupt → alle Kacheln seal = 0, dominant = None."""
    empty = gpd.GeoDataFrame({"type_key": [], "geometry": []}, crs="EPSG:25832")
    monkeypatch.setattr(data_loader, "load_entsiegelung", lambda: empty)
    seal, dom = data_loader._compute_seal_pct(cells)
    assert (seal == 0.0).all()
    assert dom.isna().all() or all(v is None for v in dom)
