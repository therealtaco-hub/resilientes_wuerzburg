"""GET /api/lst — LST-Pixel als GeoJSON FeatureCollection (~14.500 Features, EPSG:4326)."""

import json

from fastapi import APIRouter, HTTPException, Response
from shapely.geometry import mapping
from utils.data_loader import load_lst

router = APIRouter()

_cache = None  # In-Memory-Cache; wird bei Backend-Neustart geleert


@router.get("")
def get_lst(refresh: bool = False, response: Response = None):
    global _cache
    response.headers["Cache-Control"] = "no-cache" if refresh else "public, max-age=3600"
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = load_lst(force_refresh=refresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LST konnte nicht geladen werden: {exc}")

    has_ndvi = "ndvi" in gdf.columns
    has_ndbi = "ndbi" in gdf.columns
    has_bestand = "bestand_pct" in gdf.columns
    has_seal = {"seal_pct", "dominant_type_key"} <= set(gdf.columns)

    features = []
    for _, row in gdf.iterrows():
        props = {
            "lst_celsius": float(row["lst_celsius"]),
            "lst_norm":    float(row["lst_norm"]),
        }
        if has_ndvi:
            v = row["ndvi"]
            props["ndvi"] = float(v) if v == v else None  # NaN → None
        if has_ndbi:
            v = row["ndbi"]
            props["ndbi"] = float(v) if v == v else None
        if has_bestand:
            v = row["bestand_pct"]
            props["bestand_pct"] = float(v) if v == v else 0.0
        if has_seal:
            sv = row["seal_pct"]
            seal = float(sv) if sv == sv else 0.0
            props["seal_pct"] = seal
            dv = row["dominant_type_key"]
            props["dominant_type_key"] = dv if (dv is not None and dv == dv) else None
            props["plantable_m2"] = round(10_000.0 * (1.0 - seal), 1)
        features.append({
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": props,
        })

    _cache = {"type": "FeatureCollection", "features": features}
    return _cache
