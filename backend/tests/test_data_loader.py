"""
Unit-Tests für utils/data_loader.py – testen die Loader-Funktionen
direkt (ohne FastAPI-Layer).

    cd backend
    python -m pytest tests/test_data_loader.py -v
"""

import math

import pytest
import pandas as pd
import geopandas as gpd
from shapely.geometry import Polygon, Point

from utils import data_loader


# ---------- load_tree_cadastre ----------

@pytest.mark.asyncio
async def test_trees_returns_geodataframe():
    gdf = await data_loader.load_tree_cadastre()
    assert isinstance(gdf, gpd.GeoDataFrame)


@pytest.mark.asyncio
async def test_trees_crs_is_wgs84():
    gdf = await data_loader.load_tree_cadastre()
    assert gdf.crs is not None
    assert "WGS 84" in gdf.crs.name  # OGC:CRS84 und EPSG:4326 sind beide WGS84


@pytest.mark.asyncio
async def test_trees_geometry_is_point():
    gdf = await data_loader.load_tree_cadastre()
    assert (gdf.geometry.type == "Point").all()


@pytest.mark.asyncio
async def test_trees_expected_columns():
    gdf = await data_loader.load_tree_cadastre()
    expected = {"baumart", "baumart_la", "kronenbrei", "baumhoehe",
                "stammumfan", "baumtyp", "source_id"}  # geo_punkt ist die Geometriespalte
    assert expected <= set(gdf.columns)


@pytest.mark.asyncio
async def test_trees_parquet_persisted():
    await data_loader.load_tree_cadastre()
    assert data_loader._TREES_CACHE.exists()


@pytest.mark.asyncio
async def test_trees_no_null_geometries():
    gdf = await data_loader.load_tree_cadastre()
    assert gdf.geometry.notna().all()


# ---------- load_zensus ----------

def test_zensus_returns_geodataframe():
    gdf = data_loader.load_zensus()
    assert isinstance(gdf, gpd.GeoDataFrame)


def test_zensus_crs_is_wgs84():
    gdf = data_loader.load_zensus()
    assert gdf.crs.to_epsg() == 4326


def test_zensus_geometry_is_polygon():
    gdf = data_loader.load_zensus()
    assert (gdf.geometry.type == "Polygon").all()


def test_zensus_polygons_are_squares():
    """Quadrat: 4 Ecken + 1 (Schluss) = 5 Punkte im äußeren Ring."""
    gdf = data_loader.load_zensus()
    sample = gdf.head(20)
    for geom in sample.geometry:
        assert len(list(geom.exterior.coords)) == 5


def test_zensus_anteil_65plus_range():
    gdf = data_loader.load_zensus()
    valid = gdf["anteil_65plus"].dropna()
    assert (valid >= 0).all()
    assert (valid <= 1).all()


def test_zensus_anteil_65plus_uses_nan_for_masked():
    """Maskierte Werte (�) müssen NaN ergeben, kein Crash."""
    gdf = data_loader.load_zensus()
    assert gdf["anteil_65plus"].isna().any(), \
        "Erwartet: einige Zellen mit NaN durch maskierte Werte"


def test_zensus_einwohner_numeric():
    gdf = data_loader.load_zensus()
    assert pd.api.types.is_numeric_dtype(gdf["Einwohner"])


def test_zensus_filtered_to_wuerzburg():
    """Alle Zentroiden müssen nach Würzburg-Bbox-Filter in plausibler Region liegen."""
    gdf = data_loader.load_zensus()
    bounds = gdf.total_bounds  # [minx, miny, maxx, maxy] in WGS84
    assert 9.7 <= bounds[0] and bounds[2] <= 10.2
    assert 49.6 <= bounds[1] and bounds[3] <= 50.0


def test_zensus_parquet_persisted():
    data_loader.load_zensus()
    assert data_loader._ZENSUS_PARQUET_PATH.exists()


def test_zensus_force_refresh_rebuilds(tmp_path, monkeypatch):
    """force_refresh=True ignoriert den Parquet-Cache."""
    data_loader.load_zensus()
    assert data_loader._ZENSUS_PARQUET_PATH.exists()

    mtime_before = data_loader._ZENSUS_PARQUET_PATH.stat().st_mtime
    data_loader.load_zensus(force_refresh=True)
    mtime_after = data_loader._ZENSUS_PARQUET_PATH.stat().st_mtime

    assert mtime_after >= mtime_before


def test_zensus_unique_gitter_ids():
    gdf = data_loader.load_zensus()
    assert gdf["GITTER_ID_100m"].is_unique
