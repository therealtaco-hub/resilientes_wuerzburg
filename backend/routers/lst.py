import json

from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping
from utils.data_loader import load_lst, load_lst_delta

router = APIRouter()

_cache = None
_delta_cache = None


@router.get("/delta")
def get_lst_delta(refresh: bool = False):
    global _delta_cache
    if not refresh and _delta_cache is not None:
        return _delta_cache

    try:
        gdf = load_lst_delta(force_refresh=refresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LST-Delta konnte nicht berechnet werden: {exc}")

    features = [
        {
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": {
                "lst_delta": float(row["lst_delta"]),
            },
        }
        for _, row in gdf.iterrows()
    ]

    _delta_cache = {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "delta_min": round(float(gdf["lst_delta"].min()), 2),
            "delta_max": round(float(gdf["lst_delta"].max()), 2),
        },
    }
    return _delta_cache


@router.get("")
def get_lst(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = load_lst(force_refresh=refresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LST konnte nicht geladen werden: {exc}")

    features = [
        {
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": {
                "lst_celsius": float(row["lst_celsius"]),
                "lst_norm":    float(row["lst_norm"]),
            },
        }
        for _, row in gdf.iterrows()
    ]

    _cache = {"type": "FeatureCollection", "features": features}
    return _cache
