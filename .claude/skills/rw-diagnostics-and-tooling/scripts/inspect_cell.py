"""
inspect_cell.py — READ-ONLY per-cell inspector: verify ONE LST cell by hand.

Given a lon/lat, finds the LST cell whose polygon covers that point and prints its
measured values plus the two DERIVED quantities the app computes on the fly:

    plantable_m2 = 10_000 × (1 − seal_pct)                (routers/lst.py:54)
    n_trees_max  = floor(plantable_m2 / MIN_GROUND_PER_TREE_M2)   (frontend cap)

MIN_GROUND_PER_TREE_M2 = 100 (FLL norm, trees 2nd order — frontend
src/utils/simulate.js:92 / store line 6). NOTE: CLAUDE.md and
docs/handoff-baumscheiben.md STILL say 25 — those docs are STALE (GROUND_TRUTH §9).

READ-ONLY: reads lst.parquet directly, prints only. Never writes, never rebuilds.

Run (conda env `resilientes`, from repo root):
    C:/Users/Marvi/miniconda3/envs/resilientes/python.exe \
        .claude/skills/rw-diagnostics-and-tooling/scripts/inspect_cell.py

    # custom point (lon lat):
    ... inspect_cell.py 9.9350 49.8010          # Talavera-ish
    ... inspect_cell.py 9.9294 49.7947 backend/data/lst.parquet

Default point: Marktplatz ≈ (9.9294, 49.7947)

Expected output shape (Marktplatz, healthy v2 cache, 2026-07-08):
    point            : lon=9.9294 lat=49.7947
    covering cell    : index=<n>  x_mp_100m=<..> y_mp_100m=<..>
    lst_celsius      : ~ high-30s..40s °C
    seal_pct         : ~0.786  dominant_type_key=AX_Platz (or similar)
    bestand_pct      : low (few trees on the square)
    plantable_m2     : 10000*(1-0.786) = ~2140 m²
    n_trees_max      : floor(2140/100) = ~21 trees

  (Talavera ~0.86 sealed -> ~1400 m² -> ~14 trees at 100 m²/tree.)
"""

import math
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[4]
_LST_DEFAULT = _REPO_ROOT / "backend" / "data" / "lst.parquet"

# Marktplatz Würzburg
_DEFAULT_LON, _DEFAULT_LAT = 9.9294, 49.7947

# Ground truth per repo (frontend simulate.js:92, store line 6). Do NOT use 25.
MIN_GROUND_PER_TREE_M2 = 100
CELL_AREA_M2 = 10_000  # matches simulation_params.CELL_AREA_M2


def main(argv):
    lon = float(argv[1]) if len(argv) > 1 else _DEFAULT_LON
    lat = float(argv[2]) if len(argv) > 2 else _DEFAULT_LAT
    path = Path(argv[3]).resolve() if len(argv) > 3 else _LST_DEFAULT

    if not path.exists():
        print(f"[MISSING] {path} — build the LST cache first (GET /api/lst).")
        return 2

    import geopandas as gpd
    from shapely.geometry import Point

    gdf = gpd.read_parquet(path)      # EPSG:4326, polygon cells
    pt = Point(lon, lat)

    hit = gdf[gdf.geometry.contains(pt)]
    if hit.empty:
        # Fall back to nearest cell centroid so the caller still gets a readout.
        d = gdf.geometry.centroid.distance(pt)
        row = gdf.loc[d.idxmin()]
        print(f"point            : lon={lon} lat={lat}")
        print("covering cell    : NONE contains the point — showing NEAREST cell")
        print(f"  (distance ~{d.min():.5f} deg from cell centroid)")
    else:
        row = hit.iloc[0]
        print(f"point            : lon={lon} lat={lat}")
        print(f"covering cell    : index={row.name}", end="")

    def _g(col):
        return row[col] if col in gdf.columns else None

    x_mp, y_mp = _g("x_mp_100m"), _g("y_mp_100m")
    if x_mp is not None:
        print(f"  x_mp_100m={int(x_mp)} y_mp_100m={int(y_mp)}")
    else:
        print()

    lst_c   = _g("lst_celsius")
    lst_n   = _g("lst_norm")
    seal    = _g("seal_pct")
    dom     = _g("dominant_type_key")
    bestand = _g("bestand_pct")

    print(f"lst_celsius      : {lst_c}")
    print(f"lst_norm         : {lst_n}")
    print(f"seal_pct         : {seal}   dominant_type_key={dom}")
    print(f"bestand_pct      : {bestand}")

    # --- derived, by hand (matches routers/lst.py + frontend cap) ----------
    if seal is None or (isinstance(seal, float) and seal != seal):
        seal_val = 0.0
        print("  (seal_pct missing/NaN -> treated as 0.0, per routers/lst.py)")
    else:
        seal_val = float(seal)

    plantable = CELL_AREA_M2 * (1.0 - seal_val)
    n_trees = math.floor(plantable / MIN_GROUND_PER_TREE_M2)
    print()
    print("derived (verify by hand):")
    print(f"  plantable_m2 = 10000 * (1 - {seal_val:.3f}) = {plantable:.1f} m²")
    print(f"  n_trees_max  = floor({plantable:.1f} / {MIN_GROUND_PER_TREE_M2}) "
          f"= {n_trees} trees")
    print()
    print("How to read this:")
    print("  * A sealed square (Marktplatz ~0.786) should NOT show plantable_m2 = 0.")
    print("    If it does, the seal_pct cache is the pre-fix v1 double-count (should")
    print("    be _seal_model_version 2 / Priority-Union — check with inspect_parquet).")
    print(f"  * n_trees_max uses MIN_GROUND_PER_TREE_M2 = {MIN_GROUND_PER_TREE_M2} "
          "(repo truth). CLAUDE.md/handoff-baumscheiben.md say 25 — STALE docs.")
    print("  * plantable is a STEM-count limit; crowns may overhang sealed ground, so")
    print("    the cooling denominator (area_m2 sent to /simulate/baeume) stays full.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
