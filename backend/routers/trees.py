"""GET /api/trees — Baumkataster als GeoJSON FeatureCollection (44.647 Stadtbäume)."""

from fastapi import APIRouter, HTTPException
from utils.data_loader import load_tree_cadastre

router = APIRouter()

_cache = None  # In-Memory-Cache; wird bei Backend-Neustart geleert


@router.get("")
async def get_trees(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = await load_tree_cadastre(force_refresh=refresh)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Baumkataster-API nicht erreichbar: {exc}")

    _cache = gdf.__geo_interface__
    return _cache
