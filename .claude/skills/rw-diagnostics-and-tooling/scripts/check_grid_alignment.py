"""
check_grid_alignment.py — READ-ONLY health check for the 100 m GRID INVARIANT.

The whole HVI pipeline relies on LST pixels and Zensus cells sharing integer
midpoints (x_mp_100m, y_mp_100m) so build_hvi_geodataframe() can join them with a
plain pd.merge() — NO spatial join (see GROUND_TRUTH §1 "GRID INVARIANT").
If someone re-exports the LST GeoTIFF with a different crsTransform, the keys stop
matching and the merge silently yields NaN rows. This script measures the overlap.

It reports:
  * LST key count, Zensus key count
  * matched keys (present in BOTH)
  * LST-only keys (LST pixel with no census cell — normal: fields/forest/river)
  * Zensus-only keys (census cell with no LST pixel — should be near zero;
    /api/zensus already filters to LST-intersecting cells, so a raw zensus.parquet
    legitimately has more cells than lst.parquet)

READ-ONLY: reads the two parquet caches directly, prints only. Never writes,
never calls load_lst()/load_zensus() (which would rebuild caches).

Run (conda env `resilientes`, from repo root):
    C:/Users/Marvi/miniconda3/envs/resilientes/python.exe \
        .claude/skills/rw-diagnostics-and-tooling/scripts/check_grid_alignment.py

    # override paths:
    ... check_grid_alignment.py backend/data/lst.parquet backend/data/zensus.parquet

Expected output shape (healthy repo, 2026-07-08):
    lst.parquet    keys : ~14500
    zensus.parquet keys : (Würzburg census cells)
    matched keys        : several thousand (near-total of the smaller set on the
                          shared inner-city extent)
    LST-only            : many (rural/river pixels with no residents) — EXPECTED
    Zensus-only         : ideally low; a large spike = grid drift or wrong TIF
    VERDICT: GRID OK  /  GRID DRIFT SUSPECTED
"""

import sys
from pathlib import Path

import pandas as pd

_REPO_ROOT = Path(__file__).resolve().parents[4]
_LST_DEFAULT = _REPO_ROOT / "backend" / "data" / "lst.parquet"
_ZENSUS_DEFAULT = _REPO_ROOT / "backend" / "data" / "zensus.parquet"

_KEYS = ["x_mp_100m", "y_mp_100m"]


def _read(path: Path):
    try:
        import geopandas as gpd
        return gpd.read_parquet(path)
    except Exception:
        return pd.read_parquet(path)


def _keyset(df, label):
    missing = [k for k in _KEYS if k not in df.columns]
    if missing:
        raise KeyError(
            f"{label} is missing grid key column(s) {missing}. "
            f"columns present: {list(df.columns)}"
        )
    # Integer midpoints are the merge key. Coerce to int to avoid float/dtype drift.
    return set(
        zip(df["x_mp_100m"].astype("int64"), df["y_mp_100m"].astype("int64"))
    )


def main(argv):
    lst_path = Path(argv[1]).resolve() if len(argv) > 1 else _LST_DEFAULT
    zen_path = Path(argv[2]).resolve() if len(argv) > 2 else _ZENSUS_DEFAULT

    for p in (lst_path, zen_path):
        if not p.exists():
            print(f"[MISSING] {p}")
            print("  -> build caches first (hit /api/lst and /api/zensus once).")
            return 2

    lst = _read(lst_path)
    zen = _read(zen_path)

    lst_keys = _keyset(lst, "lst.parquet")
    zen_keys = _keyset(zen, "zensus.parquet")

    matched   = lst_keys & zen_keys
    lst_only  = lst_keys - zen_keys
    zen_only  = zen_keys - lst_keys
    smaller   = min(len(lst_keys), len(zen_keys))
    overlap_pct = (100.0 * len(matched) / smaller) if smaller else 0.0

    print(f"lst.parquet    : {lst_path}")
    print(f"zensus.parquet : {zen_path}")
    print()
    print(f"lst    keys    : {len(lst_keys)}")
    print(f"zensus keys    : {len(zen_keys)}")
    print(f"matched keys   : {len(matched)}  ({overlap_pct:.1f}% of smaller set)")
    print(f"LST-only keys  : {len(lst_only)}   (LST pixel, no census cell — normal)")
    print(f"Zensus-only    : {len(zen_only)}   (census cell, no LST pixel)")
    print()

    # Verdict heuristic — base it on the ABSOLUTE matched count, NOT overlap_pct.
    # Raw zensus.parquet legitimately holds ALL Würzburg census cells (~6700), but
    # only ~3089 of them intersect an LST pixel (this is exactly the set /api/zensus
    # returns, deckungsgleich with the HVI/LST extent). So a healthy repo matches
    # ~3000-3100 cells and shows thousands of expected Zensus-only cells — that is
    # NOT drift. The real failure mode (LST re-exported with a wrong crsTransform)
    # collapses matched toward 0, because the integer midpoints no longer coincide.
    _EXPECTED_MATCH = 3089  # documented LST-intersecting census cells (CLAUDE.md)
    if len(matched) >= 2500:
        print(f"VERDICT: GRID OK — {len(matched)} cells share exact midpoints "
              f"(≈ the ~{_EXPECTED_MATCH} LST-intersecting census cells); "
              f"pd.merge() joins cleanly.")
        verdict = 0
    elif len(matched) >= 500:
        print(f"VERDICT: PARTIAL — only {len(matched)} matched (expected ~{_EXPECTED_MATCH}). "
              f"Something shifted; inspect before trusting HVI output.")
        verdict = 1
    else:
        print(f"VERDICT: GRID DRIFT SUSPECTED — only {len(matched)} matched keys "
              f"(expected ~{_EXPECTED_MATCH}).")
        print("  Likely cause: LST GeoTIFF re-exported with a different crsTransform")
        print("  than [100,0,4_300_000,0,-100,2_985_000]. build_hvi_geodataframe()")
        print("  will emit NaN rows. See rw-architecture-contract (GRID INVARIANT).")
        verdict = 1

    print()
    print("How to read this:")
    print("  * LST-only keys are EXPECTED and large (river/fields/forest have LST")
    print("    but no residents).")
    print("  * Zensus-only keys are ALSO expected and large: zensus.parquet holds all")
    print("    Würzburg cells, but /api/zensus restricts to LST-intersecting ones.")
    print("    The health signal is the MATCHED count (~3089), not the overlap %.")
    print("  * Drift shows as matched collapsing toward 0 — that is the real alarm.")
    return verdict


if __name__ == "__main__":
    sys.exit(main(sys.argv))
