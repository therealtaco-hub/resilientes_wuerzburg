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

import httpx
import pandas as pd
import geopandas as gpd
from shapely.geometry import Point

_API_URL = (
    "https://opendata.wuerzburg.de/api/explore/v2.1/catalog/datasets"
    "/baumkataster_stadt_wuerzburg/records"
)
_TOTAL_RECORDS = 44_647
_PAGE_SIZE = 100
_FIELDS = ["baumart", "baumart_la", "kronenbrei", "baumhoehe", "stammumfan", "baumtyp", "source_id", "geo_punkt"]

_DATA_DIR = Path(__file__).parent.parent / "data"
_PARQUET_PATH = _DATA_DIR / "trees.parquet"
_ZENSUS_PARQUET_PATH = _DATA_DIR / "zensus.parquet"
_ZENSUS_ALTER_CSV = _DATA_DIR / "Zensus2022_Alter_in_5_Altersklassen_100m-Gitter.csv"
_ZENSUS_BEV_CSV = _DATA_DIR / "Zensus2022_Bevoelkerungszahl_100m-Gitter.csv"

_WUE_X_MIN, _WUE_X_MAX = 4_300_000, 4_325_000
_WUE_Y_MIN, _WUE_Y_MAX = 2_960_000, 2_985_000

_DATA_DIR.mkdir(parents=True, exist_ok=True)


async def load_tree_cadastre(force_refresh: bool = False) -> gpd.GeoDataFrame:
    if not force_refresh and _PARQUET_PATH.exists():
        return gpd.read_parquet(_PARQUET_PATH)

    records = []
    async with httpx.AsyncClient(timeout=30) as client:
        for offset in range(0, _TOTAL_RECORDS, _PAGE_SIZE):
            response = await client.get(
                _API_URL,
                params={"limit": _PAGE_SIZE, "offset": offset, "fields": ",".join(_FIELDS)},
            )
            response.raise_for_status()
            batch = response.json().get("results", [])
            records.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break

    geometries = []
    rows = []
    for r in records:
        geo = r.get("geo_punkt") or {}
        lon = geo.get("lon")
        lat = geo.get("lat")
        if lon is None or lat is None:
            continue
        geometries.append(Point(lon, lat))
        rows.append({
            "baumart": r.get("baumart"),
            "baumart_la": r.get("baumart_la"),
            "kronenbrei": r.get("kronenbrei"),
            "baumhoehe": r.get("baumhoehe"),
            "stammumfan": r.get("stammumfan"),
            "baumtyp": r.get("baumtyp"),
            "source_id": r.get("source_id"),
        })

    gdf = gpd.GeoDataFrame(rows, geometry=geometries, crs="EPSG:4326")
    gdf.to_parquet(_PARQUET_PATH)
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
    df["anteil_65plus"] = a65 / insgesamt.where(insgesamt > 0)
    df["Einwohner"] = pd.to_numeric(df["Einwohner"], errors="coerce")

    centroids = [Point(x, y) for x, y in zip(df["x_mp_100m"], df["y_mp_100m"])]
    gdf = gpd.GeoDataFrame(df, geometry=centroids, crs="EPSG:3035")
    gdf["geometry"] = gdf.geometry.buffer(50, cap_style=3)
    gdf = gdf.to_crs("EPSG:4326")

    gdf.to_parquet(_ZENSUS_PARQUET_PATH)
    return gdf
