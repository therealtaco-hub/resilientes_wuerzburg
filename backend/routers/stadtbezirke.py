import math

import geopandas as gpd
import pandas as pd
from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping

from utils.data_loader import (
    load_entsiegelung,
    load_lst,
    load_stadtbezirke,
    load_tree_cadastre,
    load_zensus,
)
from utils.analysis import build_hvi_geodataframe

router = APIRouter()

_cache = None


def _safe(val):
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


@router.get("")
async def get_stadtbezirke(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        bezirke = load_stadtbezirke(force_refresh=refresh)
        lst     = load_lst()
        zensus  = load_zensus()
        ents    = load_entsiegelung()
        trees   = await load_tree_cadastre()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Daten konnten nicht geladen werden: {exc}")

    bezirke = bezirke.reset_index(drop=True)
    bezirke["bz_idx"] = bezirke.index
    bz_keys = bezirke[["bz_idx", "name", "nummer", "geometry"]]

    # --- LST per Stadtbezirk ---
    lst_join = gpd.sjoin(
        lst[["lst_celsius", "geometry"]],
        bz_keys[["bz_idx", "geometry"]],
        how="inner",
        predicate="intersects",
    )
    lst_agg = lst_join.groupby("bz_idx")["lst_celsius"].agg(["max", "median", "mean"]).rename(
        columns={"max": "lst_max", "median": "lst_median", "mean": "lst_mean"}
    )

    # --- HVI per Stadtbezirk ---
    vuln_gdf, _ = build_hvi_geodataframe(zensus, lst)

    vuln_bz = gpd.sjoin(
        vuln_gdf[["hvi", "Einwohner", "geometry"]].dropna(subset=["hvi"]),
        bz_keys[["bz_idx", "geometry"]],
        how="inner",
        predicate="intersects",
    )
    hvi_agg = vuln_bz.groupby("bz_idx").agg(
        hvi_max=("hvi", "max"),
        hvi_mean=("hvi", "mean"),
        einwohner=("Einwohner", "sum"),
    )

    # --- Entsiegelungspotenzial per Stadtbezirk ---
    ents_join = gpd.sjoin(
        ents[["area_m2", "geometry"]],
        bz_keys[["bz_idx", "geometry"]],
        how="inner",
        predicate="intersects",
    )
    ents_agg = ents_join.groupby("bz_idx")["area_m2"].sum().to_frame("entsiegelung_m2")

    # --- Bäume per Stadtbezirk ---
    trees_gdf = trees.copy()
    if trees_gdf.geometry.name != "geometry":
        trees_gdf = trees_gdf.rename_geometry("geometry")
    if trees_gdf.crs is None or str(trees_gdf.crs).upper() == "OGC:CRS84":
        trees_gdf = trees_gdf.set_crs("EPSG:4326", allow_override=True)
    trees_join = gpd.sjoin(
        trees_gdf[["geometry"]],
        bz_keys[["bz_idx", "geometry"]],
        how="inner",
        predicate="within",
    )
    tree_agg = trees_join.groupby("bz_idx").size().to_frame("tree_count")

    # --- Merge alle Aggregate auf bezirke ---
    out = bezirke.merge(lst_agg,  on="bz_idx", how="left") \
                 .merge(hvi_agg,  on="bz_idx", how="left") \
                 .merge(ents_agg, on="bz_idx", how="left") \
                 .merge(tree_agg, on="bz_idx", how="left")

    features = []
    for _, row in out.iterrows():
        features.append({
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": {
                "name":   row["name"],
                "nummer": row["nummer"],
                "lst_max":         _safe(row.get("lst_max")),
                "lst_median":      _safe(row.get("lst_median")),
                "lst_mean":        _safe(row.get("lst_mean")),
                "hvi_max":         _safe(row.get("hvi_max")),
                "hvi_mean":        _safe(row.get("hvi_mean")),
                "einwohner":       int(row["einwohner"]) if pd.notna(row.get("einwohner")) else 0,
                "entsiegelung_m2": _safe(row.get("entsiegelung_m2")),
                "tree_count":      int(row["tree_count"]) if pd.notna(row.get("tree_count")) else 0,
            },
        })

    _cache = {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"total_count": len(features)},
    }
    return _cache
