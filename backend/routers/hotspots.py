import numpy as np
from fastapi import APIRouter, HTTPException
from shapely.geometry import mapping
from shapely.ops import unary_union
from utils.data_loader import load_lst, load_stadtbezirke

router = APIRouter()
_cache = None

# Nur diese Stadtbezirke werden für Hotspot-Kandidaten berücksichtigt.
_ALLOWED_BEZIRKE = {
    "Grombühl", "Sanderau", "Zellerau", "Frauenland",
    "Heidingsfeld", "Altstadt", "Steinbachtal", "Heuchelhof",
}


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

    try:
        bezirke = load_stadtbezirke()
        allowed = bezirke[bezirke["name"].isin(_ALLOWED_BEZIRKE)]
        if not allowed.empty:
            mask = unary_union(allowed.geometry.values)
            gdf = gdf[gdf.geometry.centroid.within(mask)].copy()
    except Exception:
        pass  # Fallback: gesamtes Stadtgebiet, falls Stadtbezirke nicht verfügbar

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

    # Project to EPSG:3035 (native LST CRS) for metric distance computation
    gdf_m = gdf.to_crs("EPSG:3035")
    centroids_m = gdf_m.geometry.centroid
    coords = np.array([[c.x, c.y] for c in centroids_m])

    vals = gdf["lst_celsius"].values.astype(np.float64)

    # Focal mean via radius query — neighbours include the pixel itself.
    # Two-stage edge filter applied before ranking:
    #   1. Count check: fewer than MIN_NEIGHBORS → likely near NoData boundary.
    #   2. Quadrant check: all four 90°-sectors around the cell must contain at
    #      least MIN_PER_QUADRANT valid neighbours (self excluded).  A cell with
    #      ~1/3 of its radius over a cloud/NoData gap will always leave one
    #      quadrant empty, which is exactly the failure mode we want to reject.
    MIN_NEIGHBORS    = 10
    MIN_PER_QUADRANT = 1

    tree   = cKDTree(coords)
    groups = tree.query_ball_point(coords, radius_m)

    smooth = np.empty(len(coords))
    for i, idxs in enumerate(groups):
        if len(idxs) < MIN_NEIGHBORS:
            smooth[i] = np.nan
            continue

        cx, cy    = coords[i]
        q         = [0, 0, 0, 0]          # NE, NW, SW, SE
        for j in idxs:
            dx, dy = coords[j, 0] - cx, coords[j, 1] - cy
            if dx == 0.0 and dy == 0.0:    # skip self
                continue
            if   dx >= 0 and dy >= 0: q[0] += 1
            elif dx <  0 and dy >= 0: q[1] += 1
            elif dx <  0 and dy <  0: q[2] += 1
            else:                     q[3] += 1

        if min(q) < MIN_PER_QUADRANT:
            smooth[i] = np.nan
        else:
            smooth[i] = vals[idxs].mean()

    # Greedy NMS: iterate valid pixels only, from hottest to coolest.
    # Sorting NaN with [::-1] is unreliable, so filter first.
    valid_idx = np.where(np.isfinite(smooth))[0]
    order = valid_idx[np.argsort(smooth[valid_idx])[::-1]]
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
