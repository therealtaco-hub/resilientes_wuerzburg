"""
Unit-Tests für _compute_bestand_pct (negativ-exponentielles Überlappungsmodell)
und den Cache-Migrations-Pfad in load_lst().

Struktur analog test_seal_pct.py: Baumkataster-Quelle wird per monkeypatch durch
synthetische Punkte ersetzt; lst_gdf enthält 100×100-m-Zellen in EPSG:4326.

Ausführen:
    cd backend
    python -m pytest tests/test_bestand_pct.py -v
"""

import math

import geopandas as gpd
import pandas as pd
import pytest
from shapely.geometry import Point, box

from utils import data_loader
from simulation_params import inverse_ratio, projected_cover_pct


# ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

def _make_trees(entries, crs="EPSG:4326"):
    """entries: Liste von (lon, lat, kronenbrei_m)."""
    return gpd.GeoDataFrame(
        {"kronenbrei": [e[2] for e in entries]},
        geometry=[Point(e[0], e[1]) for e in entries],
        crs=crs,
    )


def _kronenbrei_for_area(target_m2):
    """Kronendurchmesser (m), so dass π×(d/2)² == target_m2."""
    return 2 * math.sqrt(target_m2 / math.pi)


# Einfache 100×100-Gitterzelle in Würzburg-Koordinaten (EPSG:4326).
# Die Zellgröße in Grad spielt für die Formel keine Rolle — die Zellfläche
# ist in _compute_bestand_pct hart auf 10.000 m² kodiert.
_LON, _LAT = 9.93, 49.79
_CELL = box(_LON, _LAT, _LON + 0.001, _LAT + 0.001)  # ~70×111 m – genug für within-Tests


@pytest.fixture
def single_cell():
    return gpd.GeoDataFrame({"lst_celsius": [30.0]}, geometry=[_CELL], crs="EPSG:4326")


@pytest.fixture
def three_cells():
    """Drei nebeneinander liegende Zellen."""
    cells = [
        box(_LON + i * 0.002, _LAT, _LON + i * 0.002 + 0.001, _LAT + 0.001)
        for i in range(3)
    ]
    return gpd.GeoDataFrame({"lst_celsius": [30.0] * 3}, geometry=cells, crs="EPSG:4326")


def _center(cell_idx=0, offset_lon=0, offset_lat=0):
    """Mittelpunkt der i-ten Testzelle."""
    return _LON + cell_idx * 0.002 + 0.0005 + offset_lon, _LAT + 0.0005 + offset_lat


# ─── Tests ────────────────────────────────────────────────────────────────────

def test_bekannte_kronensumme_39_3_pct(single_cell, tmp_path, monkeypatch):
    """Σ Kronenfläche = 5.000 m² → ratio 0,5 → (1−e^−0,5)×100 ≈ 39,3 %."""
    lon, lat = _center()
    trees = _make_trees([(lon, lat, _kronenbrei_for_area(5_000))])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    expected = round((1 - math.exp(-0.5)) * 100, 1)  # 39.3
    assert result.iloc[0] == expected


def test_literalwert_39_3(single_cell, tmp_path, monkeypatch):
    """Literalwert-Pin: darf nicht durch gespiegelten Vorzeichenfehler unentdeckt bleiben."""
    lon, lat = _center()
    trees = _make_trees([(lon, lat, _kronenbrei_for_area(5_000))])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    assert result.iloc[0] == 39.3


def test_dichte_ueberlappung_bleibt_unter_100(single_cell, tmp_path, monkeypatch):
    """Σ = 50.000 m² (ratio 5) → asymptotisch ~99,3 %, nie ≥ 100 (kein clip nötig)."""
    lon, lat = _center()
    # Zehn Bäume à 5.000 m² Krone = 50.000 m²
    trees = _make_trees([(lon + i * 0.00001, lat, _kronenbrei_for_area(5_000)) for i in range(10)])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    assert result.iloc[0] < 100.0
    assert result.iloc[0] > 99.0  # Erwarteter Bereich: (1−e^−5)×100 ≈ 99,3 %


def test_kein_kataster_liefert_null(single_cell, tmp_path, monkeypatch):
    """Keine Quelldatei vorhanden → Fallback 0,0 für alle Kacheln."""
    monkeypatch.setattr(data_loader, "_TREES_CACHE", tmp_path / "trees.parquet")
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    assert (result == 0.0).all()


def test_leerer_sjoin_liefert_null(three_cells, tmp_path, monkeypatch):
    """Bäume außerhalb aller Kacheln → sjoin leer → alle Kacheln 0,0."""
    # Baum weit außerhalb der drei Testzellen
    trees = _make_trees([(0.0, 0.0, 10.0)])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(three_cells)

    assert (result == 0.0).all()


def test_index_deckungsgleich_mit_lst_gdf(three_cells, tmp_path, monkeypatch):
    """Rückgabe-Index muss deckungsgleich mit lst_gdf.index sein."""
    # Einen Baum in Zelle 0 setzen
    lon, lat = _center(0)
    trees = _make_trees([(lon, lat, 10.0)])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    # Benutzerdefinierter Index
    gdf = three_cells.copy()
    gdf.index = [10, 20, 30]

    result = data_loader._compute_bestand_pct(gdf)

    assert list(result.index) == [10, 20, 30]


def test_rueckgabe_gerundet_auf_1_dezimale(single_cell, tmp_path, monkeypatch):
    """Rückgabewerte sind auf 1 Dezimalstelle gerundet."""
    lon, lat = _center()
    # Kronenfläche so wählen, dass der rohe Wert viele Dezimalstellen hat
    trees = _make_trees([(lon, lat, _kronenbrei_for_area(3_333))])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    val = result.iloc[0]
    assert val == round(val, 1)


def test_mehrere_baeume_summieren_korrekt(single_cell, tmp_path, monkeypatch):
    """Mehrere Bäume in einer Zelle: Kronensumme = Σ einzelner Flächen."""
    lon, lat = _center()
    # 4 Bäume à 1.250 m² = 5.000 m² → ratio 0,5 → 39,3 %
    trees = _make_trees([
        (lon + i * 0.00001, lat, _kronenbrei_for_area(1_250)) for i in range(4)
    ])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(single_cell)

    assert result.iloc[0] == 39.3


def test_baeume_nur_in_einer_von_drei_zellen(three_cells, tmp_path, monkeypatch):
    """Bäume nur in Zelle 0 → Zelle 1 und 2 bleiben 0,0."""
    lon, lat = _center(0)
    trees = _make_trees([(lon, lat, _kronenbrei_for_area(5_000))])
    cache = tmp_path / "trees.parquet"
    trees.to_parquet(cache)
    monkeypatch.setattr(data_loader, "_TREES_CACHE", cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")

    result = data_loader._compute_bestand_pct(three_cells)

    assert result.iloc[0] == pytest.approx(39.3, abs=0.1)
    assert result.iloc[1] == 0.0
    assert result.iloc[2] == 0.0


# ─── Cache-Migrations-Tests ────────────────────────────────────────────────────

def test_stale_cache_ohne_version_triggert_recompute(single_cell, tmp_path, monkeypatch):
    """lst.parquet mit altem bestand_pct (naive Summe) ohne Versionsmarker
    wird von load_lst() automatisch mit der Crookston-Exp-Formel neu berechnet.

    Naiver Wert: Σ/10.000 × 100 = 5.000/10.000 × 100 = 50,0 %
    Exp-Formel:  (1 − exp(−0,5)) × 100 ≈ 39,3 %
    """
    # Stale parquet bauen: bestand_pct = 50 (naiver Wert), kein _bestand_model_version
    stale_gdf = single_cell.copy()
    stale_gdf["lst_celsius"] = 30.0
    stale_gdf["lst_norm"] = 0.5
    stale_gdf["x_mp_100m"] = 4312500
    stale_gdf["y_mp_100m"] = 2972500
    stale_gdf["bestand_pct"] = 50.0  # falscher naiver Wert — kein Versionsmarker
    lst_cache = tmp_path / "lst.parquet"
    stale_gdf.to_parquet(lst_cache)

    # Baumkataster: ein Baum mit 5.000 m² Krone in der Zelle → erwartet 39,3 %
    lon, lat = _center()
    trees = _make_trees([(lon, lat, _kronenbrei_for_area(5_000))])
    trees_cache = tmp_path / "trees.parquet"
    trees.to_parquet(trees_cache)

    monkeypatch.setattr(data_loader, "_LST_CACHE", lst_cache)
    monkeypatch.setattr(data_loader, "_LST_TIF", tmp_path / "tif_not_used.tif")
    monkeypatch.setattr(data_loader, "_TREES_CACHE", trees_cache)
    monkeypatch.setattr(data_loader, "_TREES_SOURCE", tmp_path / "src.parquet")
    monkeypatch.setattr(data_loader, "_ENTSIEGELUNG_CACHE", tmp_path / "entsiegelung.parquet")
    monkeypatch.setattr(data_loader, "_ATKIS_ZIP", tmp_path / "atkis.zip")

    result = data_loader.load_lst(force_refresh=False)

    # Naiver 50 %-Wert wurde durch Exp-Wert ersetzt
    assert result["bestand_pct"].iloc[0] == 39.3
    # Versionsmarker ist gesetzt
    assert "_bestand_model_version" in result.columns
    assert int(result["_bestand_model_version"].iloc[0]) == data_loader._BESTAND_MODEL_VERSION


def test_aktueller_cache_wird_nicht_neu_berechnet(single_cell, tmp_path, monkeypatch):
    """lst.parquet mit korrektem Versionsmarker wird NICHT neu berechnet."""
    current_gdf = single_cell.copy()
    current_gdf["lst_celsius"] = 30.0
    current_gdf["lst_norm"] = 0.5
    current_gdf["x_mp_100m"] = 4312500
    current_gdf["y_mp_100m"] = 2972500
    current_gdf["bestand_pct"] = 39.3  # bereits korrekt
    current_gdf["_bestand_model_version"] = data_loader._BESTAND_MODEL_VERSION
    current_gdf["seal_pct"] = 0.0
    current_gdf["dominant_type_key"] = None
    current_gdf["_seal_model_version"] = data_loader._SEAL_MODEL_VERSION
    lst_cache = tmp_path / "lst.parquet"
    current_gdf.to_parquet(lst_cache)

    monkeypatch.setattr(data_loader, "_LST_CACHE", lst_cache)
    monkeypatch.setattr(data_loader, "_LST_TIF", tmp_path / "tif_not_used.tif")

    result = data_loader.load_lst(force_refresh=False)

    # Wert bleibt unverändert — kein Recompute
    assert result["bestand_pct"].iloc[0] == 39.3


# ─── Multi-Cell-Aggregation ────────────────────────────────────────────────────

def test_multi_cell_aggregation_naeherung():
    """Dokumentiert die Frontend-Näherung: mean(bestand_pct_i) als existing_coverage_pct.

    Bei heterogener Kronendeckung weicht der Mittelwert der projizierten Prozente
    vom exakten kombinierten Ratio ab. Der Näherungsfehler ist für typische Werte
    (< 80 %) gering (< 5 Prozentpunkte).
    """
    pcts = [20.0, 60.0]

    # Näherung (Frontend-Ansatz): Mittelwert der projizierten Prozente
    approx_mean = sum(pcts) / len(pcts)  # 40,0 %

    # Exakt: Mittelwert der Ratios → projizierte Gesamtdeckung
    combined_ratio = sum(inverse_ratio(p) for p in pcts) / len(pcts)
    exact_pct = projected_cover_pct(combined_ratio)

    # Fehler bleibt gering für moderate Eingaben
    assert abs(approx_mean - exact_pct) < 5.0
