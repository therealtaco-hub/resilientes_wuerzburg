import json
import math

from fastapi import APIRouter, HTTPException
from utils.data_loader import load_lst

router = APIRouter()

_cache = None


def _safe(value):
    if value is None:
        return None
    try:
        if isinstance(value, float) and math.isnan(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


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

    features = []
    for _, row in gdf.iterrows():
        features.append({
            "type": "Feature",
            "geometry": json.loads(json.dumps(row.geometry.__geo_interface__)),
            "properties": {
                "GITTER_ID_100m":      row["GITTER_ID_100m"],
                "lst_mean":            _safe(row["lst_mean"]),
                "lst_min":             _safe(row["lst_min"]),
                "lst_max":             _safe(row["lst_max"]),
                "lst_norm":            _safe(row["lst_norm"]),
                "anteil_65plus":       _safe(row["anteil_65plus"]),
                "Einwohner":           _safe(row["Einwohner"]),
            },
        })

    _cache = {"type": "FeatureCollection", "features": features}
    return _cache
