import numpy as np
from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping
from utils.data_loader import load_lst

router = APIRouter()
_cache = None


@router.get("")
def get_hotspots(refresh: bool = False):
    global _cache
    if not refresh and _cache is not None:
        return _cache

    try:
        gdf = load_lst(force_refresh=refresh)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LST konnte nicht geladen werden: {exc}")

    features = _compute_hotspots(gdf)
    _cache = {
        "type": "FeatureCollection",
        "features": features,
        "meta": {"count": len(features)},
    }
    return _cache


def _compute_hotspots(gdf, radius_m: float = 200.0, min_dist_m: float = 600.0, n: int = 5):
    """
    1. Focal mean: for each pixel, average lst_celsius of neighbours within radius_m.
    2. Greedy non-maximum suppression: pick up to n peaks with ≥ min_dist_m separation.
    """
    from scipy.spatial import cKDTree

    # EPSG:4326 centroids for output lon/lat
    centroids_wgs84 = gdf.geometry.centroid

    # Project to metric CRS for accurate distance computation
    gdf_m = gdf.to_crs("EPSG:25832")
    centroids_m = gdf_m.geometry.centroid
    coords = np.array([[c.x, c.y] for c in centroids_m])

    vals = gdf["lst_celsius"].values.astype(np.float64)

    # Focal mean via radius query — neighbours include the pixel itself
    tree = cKDTree(coords)
    groups = tree.query_ball_point(coords, radius_m)
    smooth = np.array([vals[idxs].mean() for idxs in groups])

    # Greedy NMS: iterate pixels from hottest to coolest
    order = np.argsort(smooth)[::-1]
    selected_coords: list[tuple[float, float]] = []
    selected_idxs: list[int] = []

    for i in order:
        cx, cy = coords[i]
        if not any(
            np.hypot(cx - sx, cy - sy) < min_dist_m
            for sx, sy in selected_coords
        ):
            selected_coords.append((cx, cy))
            selected_idxs.append(int(i))
        if len(selected_idxs) == n:
            break

    features = []
    for rank, idx in enumerate(selected_idxs, start=1):
        row = gdf.iloc[idx]
        c = centroids_wgs84.iloc[idx]
        features.append({
            "type": "Feature",
            "geometry": mapping(row.geometry),
            "properties": {
                "rank": rank,
                "lst_celsius": float(row["lst_celsius"]),
                "lst_celsius_smooth": round(float(smooth[idx]), 1),
                "lon": round(c.x, 5),
                "lat": round(c.y, 5),
            },
        })

    return features
