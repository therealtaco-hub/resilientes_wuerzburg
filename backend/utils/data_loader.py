"""
Datenlade-Funktionen für alle Quelldatensätze.

Geplante Funktionen:
    load_lst_raster(path: str) -> np.ndarray
        Lädt GeoTIFF mit Landsat LST-Band, gibt Array + Transform zurück.

    load_tree_cadastre() -> gpd.GeoDataFrame
        Ruft Baumkataster-API (opendata.wuerzburg.de) ab und gibt GeoDataFrame zurück.

    load_census_grid(path: str) -> gpd.GeoDataFrame
        Lädt Zensus-2022-CSV (100m-Gitter), filtert auf Würzburger Gitter-IDs.

    load_atkis_landuse(path: str) -> gpd.GeoDataFrame
        Lädt ATKIS Basis-DLM Shapefile mit Flächennutzungs- und Versiegelungsklassen.
"""

from pathlib import Path

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

_DATA_DIR = Path(__file__).parent.parent / "data"
_TREES_SOURCE = _DATA_DIR / "baumkataster_stadt_wuerzburg.parquet"  # Bulk-Export (alle 44.647 Records)
_TREES_CACHE  = _DATA_DIR / "trees.parquet"                         # verarbeiteter Cache
_ZENSUS_PARQUET_PATH = _DATA_DIR / "zensus.parquet"
_LST_TIF = _DATA_DIR / "lst_wuerzburg.tif"
_LST_CACHE = _DATA_DIR / "lst.parquet"
_ZENSUS_ALTER_CSV = _DATA_DIR / "Zensus2022_Alter_in_5_Altersklassen_100m-Gitter.csv"
_ZENSUS_BEV_CSV = _DATA_DIR / "Zensus2022_Bevoelkerungszahl_100m-Gitter.csv"

_WUE_X_MIN, _WUE_X_MAX = 4_300_000, 4_325_000
_WUE_Y_MIN, _WUE_Y_MAX = 2_960_000, 2_985_000

_DATA_DIR.mkdir(parents=True, exist_ok=True)


async def load_tree_cadastre(force_refresh: bool = False) -> gpd.GeoDataFrame:
    if _TREES_CACHE.exists() and not force_refresh:
        return gpd.read_parquet(_TREES_CACHE)

    if not _TREES_SOURCE.exists():
        raise FileNotFoundError(
            "Quelldatei nicht gefunden: backend/data/baumkataster_stadt_wuerzburg.parquet. "
            "Bitte manuell von opendata.wuerzburg.de exportieren und ablegen."
        )

    gdf = gpd.read_parquet(_TREES_SOURCE)
    gdf.to_parquet(_TREES_CACHE)
    return gdf


def load_zensus(force_refresh: bool = False) -> gpd.GeoDataFrame:
    if not force_refresh and _ZENSUS_PARQUET_PATH.exists():
        return gpd.read_parquet(_ZENSUS_PARQUET_PATH)

    alter = pd.read_csv(_ZENSUS_ALTER_CSV, sep=";")
    bev = pd.read_csv(_ZENSUS_BEV_CSV, sep=";")

    df = alter.merge(
        bev[["GITTER_ID_100m", "Einwohner"]],
        on="GITTER_ID_100m",
        how="inner",
    )

    df = df[
        df["x_mp_100m"].between(_WUE_X_MIN, _WUE_X_MAX)
        & df["y_mp_100m"].between(_WUE_Y_MIN, _WUE_Y_MAX)
    ].copy()

    a65 = pd.to_numeric(df["a65undaelter"], errors="coerce")
    insgesamt = pd.to_numeric(df["Insgesamt_Bevoelkerung"], errors="coerce")
    df["Einwohner"] = pd.to_numeric(df["Einwohner"], errors="coerce")
    # Zensus-Rohdaten können durch Geheimhaltungsrundung (§ 16 BStatG) in kleinen
    # Gitterzellen (< 5 Einwohner) anteil_65plus > 1.0 erzeugen, da Altersklassen
    # und Gesamtbevölkerung aus getrennten CSVs unabhängig gerundet werden.
    # Werte werden auf [0, 1] geclampt. NaN (maskierte Zellen) bleibt erhalten.
    raw_anteil = a65 / insgesamt.where(insgesamt > 0)
    df["anteil_65plus"] = raw_anteil.clip(0, 1)
    df["anteil_65plus_clamped"] = raw_anteil > 1.0  # NaN ergibt False – korrekt

    centroids = [Point(x, y) for x, y in zip(df["x_mp_100m"], df["y_mp_100m"])]
    gdf = gpd.GeoDataFrame(df, geometry=centroids, crs="EPSG:3035")
    gdf["geometry"] = gdf.geometry.buffer(50, cap_style=3)
    gdf = gdf.to_crs("EPSG:4326")

    gdf.to_parquet(_ZENSUS_PARQUET_PATH)
    return gdf


def load_lst(force_refresh: bool = False) -> gpd.GeoDataFrame:
    if not force_refresh and _LST_CACHE.exists():
        return gpd.read_parquet(_LST_CACHE)

    if not _LST_TIF.exists():
        raise FileNotFoundError(
            "LST-Quelldatei nicht gefunden: backend/data/lst_wuerzburg.tif. "
            "Bitte via Google Earth Engine exportieren und ablegen."
        )

    import rasterio
    from rasterstats import zonal_stats

    zensus_gdf = load_zensus()

    with rasterio.open(_LST_TIF) as src:
        tif_crs = src.crs

    zones = zensus_gdf.to_crs(tif_crs)

    stats = zonal_stats(
        zones,
        str(_LST_TIF),
        stats=["mean", "min", "max"],
        nodata=None,
        geojson_out=False,
    )

    gdf = zensus_gdf.copy()
    gdf["lst_mean"] = [s["mean"] for s in stats]
    gdf["lst_min"]  = [s["min"]  for s in stats]
    gdf["lst_max"]  = [s["max"]  for s in stats]

    valid = gdf["lst_mean"].dropna()
    if len(valid) > 0:
        v_min, v_max = valid.min(), valid.max()
        if v_max > v_min:
            gdf["lst_norm"] = (gdf["lst_mean"] - v_min) / (v_max - v_min)
        else:
            gdf["lst_norm"] = 0.0
    else:
        gdf["lst_norm"] = np.nan

    gdf.to_parquet(_LST_CACHE)
    return gdf
