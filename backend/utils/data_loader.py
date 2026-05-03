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
    from rasterio.enums import Resampling
    from rasterio.transform import Affine
    from shapely.geometry import box

    with rasterio.open(_LST_TIF) as src:
        transform = src.transform
        crs = src.crs
        nodata = src.nodata
        src_w, src_h = src.width, src.height

        # Resample from ~30m to ~100m: 1° lat ≈ 111 320m → 100m ≈ 0.000899°
        pix_deg = abs(transform.e)
        scale = (100 / 111_320) / pix_deg
        out_w = max(1, round(src_w / scale))
        out_h = max(1, round(src_h / scale))

        raw = src.read(
            1,
            out_shape=(out_h, out_w),
            resampling=Resampling.average,
        )

    # New transform: same origin, larger pixels
    new_transform = Affine(
        transform.a * src_w / out_w,
        transform.b,
        transform.c,
        transform.d,
        transform.e * src_h / out_h,
        transform.f,
    )

    # GEE exports ST_B10 already converted to °C — values are directly usable
    celsius = raw.astype(np.float64)

    # Build validity mask
    mask = np.isfinite(celsius) & (celsius > -10) & (celsius < 70)
    if nodata is not None:
        mask &= raw != nodata

    valid_vals = celsius[mask]
    if valid_vals.size == 0:
        raise ValueError("Keine validen LST-Pixelwerte im GeoTIFF.")

    # Rank-based (quantile) normalisation: equal colour distribution across the full range
    from scipy.stats import rankdata
    ranks = rankdata(valid_vals, method="average")
    norm = np.full_like(celsius, np.nan)
    norm[mask] = (ranks - 1) / (ranks.max() - 1) if ranks.max() > 1 else 0.0

    # Vectorised polygon bounding boxes per resampled pixel
    rows, cols = np.where(mask)
    a, e = new_transform.a, new_transform.e   # pixel width (+), pixel height (-)
    west  = new_transform.c + cols       * a
    east  = new_transform.c + (cols + 1) * a
    north = new_transform.f + rows       * e
    south = new_transform.f + (rows + 1) * e   # south < north because e < 0

    geometries = [box(w, s, e_, n) for w, s, e_, n in zip(west, south, east, north)]
    lst_c  = np.round(celsius[mask], 1)
    lst_n  = np.round(norm[mask],    4)

    gdf = gpd.GeoDataFrame(
        {"lst_celsius": lst_c, "lst_norm": lst_n},
        geometry=geometries,
        crs=crs,
    )
    if gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs("EPSG:4326")

    gdf.to_parquet(_LST_CACHE)
    return gdf
