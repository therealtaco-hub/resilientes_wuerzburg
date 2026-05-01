import json
import math

from fastapi import APIRouter, HTTPException
from utils.data_loader import load_zensus

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
def get_zensus(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = load_zensus(force_refresh=refresh)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Zensus konnte nicht geladen werden: {exc}")

    features = []
    for _, row in gdf.iterrows():
        features.append({
            "type": "Feature",
            "geometry": json.loads(json.dumps(row.geometry.__geo_interface__)),
            "properties": {
                "gitter_id": row["GITTER_ID_100m"],
                "anteil_65plus": _safe(row["anteil_65plus"]),
                "einwohner": _safe(row["Einwohner"]),
            },
        })

    _cache = {"type": "FeatureCollection", "features": features}
    return _cache
