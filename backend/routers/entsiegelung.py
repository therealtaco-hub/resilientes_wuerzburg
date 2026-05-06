import math

from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping

from utils.data_loader import load_entsiegelung

router = APIRouter()

_cache = None


@router.get("")
def get_entsiegelung(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = load_entsiegelung(force_refresh=refresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Entsiegelung konnte nicht geladen werden: {exc}")

    def _float_or_none(val):
        if val is None:
            return None
        try:
            f = float(val)
            return None if math.isnan(f) else f
        except (TypeError, ValueError):
            return None

    atkis_count = int((gdf["source"] == "atkis").sum())
    osm_count   = int((gdf["source"] == "osm").sum())

    features = [
        {
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": {
                "source":   row["source"],
                "type_key": row["type_key"],
                "label":    row["label"],
                "area_m2":  _float_or_none(row["area_m2"]),
            },
        }
        for _, row in gdf.iterrows()
    ]

    _cache = {
        "type": "FeatureCollection",
        "features": features,
        "meta": {
            "atkis_count": atkis_count,
            "osm_count":   osm_count,
            "total_count": len(features),
        },
    }
    return _cache
