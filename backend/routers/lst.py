import json

from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping
from utils.data_loader import load_lst

router = APIRouter()

_cache = None


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
