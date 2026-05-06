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

_ATKIS_ZIP          = _DATA_DIR / "bkg_shape_712.zip"
_ENTSIEGELUNG_CACHE = _DATA_DIR / "entsiegelung.parquet"

# Würzburg BBox in EPSG:25832 (UTM Zone 32N) für ATKIS-BBox-Filter
_WUE_ATKIS_BBOX = (540000, 5505000, 580000, 5540000)  # großzügiger Vorfilter, .cx macht Präzisfilter

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


def load_entsiegelung(force_refresh: bool = False) -> gpd.GeoDataFrame:
    if not force_refresh and _ENTSIEGELUNG_CACHE.exists():
        return gpd.read_parquet(_ENTSIEGELUNG_CACHE)

    if not _ATKIS_ZIP.exists():
        raise FileNotFoundError(
            "ATKIS-Quelldatei nicht gefunden: backend/data/bkg_shape_712.zip."
        )

    import re
    import osmnx as ox

    def _make_label(txt: str) -> str:
        s = str(txt).removeprefix("AX_")
        return re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', s)

    # --- ATKIS: sie02_f.shp + ver01_f.shp (alle Features, kein Filter) ---
    atkis_parts = []
    for shp_name in ["sie02_f.shp", "ver01_f.shp"]:
        vsizip_path = f"/vsizip/{_ATKIS_ZIP}/{shp_name}"
        try:
            chunk = gpd.read_file(vsizip_path, bbox=_WUE_ATKIS_BBOX)
        except Exception:
            continue
        if chunk.empty:
            continue
        atkis_parts.append(chunk[["OBJART_TXT", "geometry"]].copy())

    if not atkis_parts:
        raise ValueError("Keine ATKIS-Features für Würzburg gefunden.")

    atkis_gdf = gpd.GeoDataFrame(pd.concat(atkis_parts, ignore_index=True), crs="EPSG:25832")
    atkis_gdf["type_key"] = atkis_gdf["OBJART_TXT"]
    atkis_gdf["area_m2"]  = atkis_gdf.geometry.area.round(1)  # in EPSG:25832 → m²
    atkis_gdf = atkis_gdf.to_crs("EPSG:4326").cx[9.87:10.01, 49.75:49.83].copy()
    atkis_gdf["source"] = "atkis"
    atkis_gdf["label"]  = atkis_gdf["type_key"].map(_make_label)

    # --- OSM: parking + square (nur Polygone) ---
    OSM_QUERIES = [
        ("osm_parking", {"amenity": "parking"}, "Parkplatz"),
        ("osm_square",  {"place": "square"},    "Platz"),
    ]

    osm_parts = []
    for type_key, tags, label in OSM_QUERIES:
        try:
            feats = ox.features_from_place("Würzburg, Germany", tags=tags)
        except Exception:
            continue
        polys = feats[feats.geometry.geom_type.isin(["Polygon", "MultiPolygon"])][["geometry"]].copy()
        if polys.empty:
            continue
        polys["type_key"] = type_key
        polys["label"]    = label
        polys["area_m2"]  = polys.to_crs("EPSG:25832").geometry.area.round(1)
        osm_parts.append(polys)

    # --- OSM: potenzielle Dachbegrünung ---
    # Flachdächer (roof:shape=flat) ODER geeignete Gebäudetypen (industrial/commercial/...).
    # Bereits begrünte Dächer werden ausgeschlossen.
    try:
        green_candidates = ox.features_from_place(
            "Würzburg, Germany",
            tags={"building": True},
        )
    except Exception:
        green_candidates = None

    if green_candidates is not None and not green_candidates.empty:
        polys = green_candidates[
            green_candidates.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
        ].copy()

        roof_shape    = polys["roof:shape"]    if "roof:shape"    in polys.columns else pd.Series(index=polys.index, dtype=object)
        building      = polys["building"]      if "building"      in polys.columns else pd.Series(index=polys.index, dtype=object)
        roof_material = polys["roof:material"] if "roof:material" in polys.columns else pd.Series(index=polys.index, dtype=object)
        roof_surface  = polys["roof:surface"]  if "roof:surface"  in polys.columns else pd.Series(index=polys.index, dtype=object)

        suitable_types = {"industrial", "commercial", "supermarket", "retail"}
        is_flat        = roof_shape.astype(str).str.lower() == "flat"
        is_suitable    = building.astype(str).str.lower().isin(suitable_types)
        already_green  = (
            (roof_material.astype(str).str.lower() == "grass")
            | (roof_surface.astype(str).str.lower() == "green")
        )

        keep = (is_flat | is_suitable) & ~already_green
        green_polys = polys[keep][["geometry"]].copy()

        if not green_polys.empty:
            green_polys["type_key"] = "osm_flat_roof_industrial"
            green_polys["label"]    = "Flachdach / Gewerbebau"
            green_polys["area_m2"]  = green_polys.to_crs("EPSG:25832").geometry.area.round(1)
            osm_parts.append(green_polys)

    if osm_parts:
        osm_gdf = gpd.GeoDataFrame(pd.concat(osm_parts, ignore_index=True), crs="EPSG:4326")
        osm_gdf["source"] = "osm"
    else:
        osm_gdf = gpd.GeoDataFrame(
            columns=["source", "type_key", "label", "area_m2", "geometry"],
            crs="EPSG:4326",
        )

    # --- Zusammenführen ---
    cols = ["source", "type_key", "label", "area_m2", "geometry"]
    gdf = gpd.GeoDataFrame(
        pd.concat([atkis_gdf[cols], osm_gdf[cols]], ignore_index=True),
        crs="EPSG:4326",
    )

    gdf.to_parquet(_ENTSIEGELUNG_CACHE)
    return gdf
