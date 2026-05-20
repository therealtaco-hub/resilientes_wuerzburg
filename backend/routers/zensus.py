"""
GET /api/zensus — Zensus-2022-Gitterzellen als GeoJSON FeatureCollection.

Gibt nur Zellen zurück, die sich mit dem LST-Raster überschneiden,
damit Demografie- und Hitze-Layer denselben geografischen Bereich abdecken.
"""

import json
import math

import geopandas as gpd
from fastapi import APIRouter, HTTPException
from utils.data_loader import load_lst, load_zensus

router = APIRouter()

_cache = None  # In-Memory-Cache; wird bei Backend-Neustart geleert


def _safe(value):
    # NaN- und None-Guard für JSON-Serialisierung — Zensus enthält maskierte Zellen.
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
        lst = load_lst(force_refresh=False)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Zensus konnte nicht geladen werden: {exc}")

    # Nur Zensus-Zellen zurückgeben, die mindestens ein LST-Pixel schneiden,
    # damit der Demografie-Layer denselben Bereich wie HVI und LST abdeckt.
    try:
        hits = gpd.sjoin(gdf[["geometry"]], lst[["geometry"]], how="inner", predicate="intersects")
        gdf = gdf.loc[hits.index.unique()]
    except Exception:
        pass  # Bei Fehler: ungefiltertes GDF verwenden

    features = []
    for _, row in gdf.iterrows():
        features.append({
            "type": "Feature",
            "geometry": json.loads(json.dumps(row.geometry.__geo_interface__)),
            "properties": {
                "gitter_id": row["GITTER_ID_100m"],
                "anteil_65plus": _safe(row["anteil_65plus"]),
                "anteil_65plus_clamped": bool(row["anteil_65plus_clamped"]),
                "Einwohner": _safe(row["Einwohner"]),
            },
        })

    _cache = {"type": "FeatureCollection", "features": features}
    return _cache
