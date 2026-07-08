"""
inspect_parquet.py — READ-ONLY parquet inspector for Resilientes Würzburg.

Prints row count, columns + dtypes, cache-version columns
(_bestand_model_version / _seal_model_version) and summary stats for the
key derived columns (lst_celsius, seal_pct, bestand_pct, lst_norm).
Its main job: let you spot a STALE cache WITHOUT modifying it.

READ-ONLY: opens the parquet with gpd.read_parquet / pd.read_parquet and only
prints. It NEVER writes, and it NEVER calls load_lst() (which would lazy-rebuild
the cache). Safe to run against a live cache at any time.

Run (conda env `resilientes`, from repo root):
    C:/Users/Marvi/miniconda3/envs/resilientes/python.exe \
        .claude/skills/rw-diagnostics-and-tooling/scripts/inspect_parquet.py

    # any parquet:
    ... inspect_parquet.py backend/data/zensus.parquet
    ... inspect_parquet.py backend/data/entsiegelung.parquet

Default path: backend/data/lst.parquet

Expected output shape (against a healthy lst.parquet, 2026-07-08):
    file        : backend/data/lst.parquet
    rows        : ~14500
    columns     : x_mp_100m, y_mp_100m, lst_celsius, lst_norm, ndvi, ndbi,
                  bestand_pct, seal_pct, dominant_type_key, geometry,
                  _bestand_model_version, _seal_model_version
    cache versions:
      _bestand_model_version : 2   (module constant _BESTAND_MODEL_VERSION = 2)  OK
      _seal_model_version    : 2   (module constant _SEAL_MODEL_VERSION    = 2)  OK
    stats: lst_celsius min/mean/max, seal_pct/bestand_pct distribution ...
"""

import sys
from pathlib import Path

import pandas as pd

# Repo root = five parents up from this file
# (repo / .claude / skills / rw-diagnostics-and-tooling / scripts / inspect_parquet.py)
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DEFAULT = _REPO_ROOT / "backend" / "data" / "lst.parquet"

# Module constants the cache versions are compared against. Kept in sync by hand;
# re-verify with:  grep _MODEL_VERSION backend/utils/data_loader.py
_EXPECTED_VERSIONS = {
    "_bestand_model_version": 2,   # data_loader._BESTAND_MODEL_VERSION
    "_seal_model_version":    2,   # data_loader._SEAL_MODEL_VERSION
}


def _read(path: Path):
    """Read a parquet as a (Geo)DataFrame without triggering any rebuild."""
    try:
        import geopandas as gpd
        return gpd.read_parquet(path)
    except Exception:
        # Fallback for non-geo parquets or missing geopandas
        return pd.read_parquet(path)


def main(argv):
    path = Path(argv[1]).resolve() if len(argv) > 1 else _DEFAULT
    if not path.exists():
        print(f"[MISSING] {path}")
        print("  -> cache not built yet. Hit the endpoint once (see rw-run-and-operate)")
        print("     or run pytest (rw-validation-and-qa) to build data caches.")
        return 2

    gdf = _read(path)

    print(f"file        : {path}")
    print(f"rows        : {len(gdf)}")
    print(f"columns     : {list(gdf.columns)}")
    print()
    print("dtypes:")
    for col, dt in gdf.dtypes.items():
        print(f"  {col:<26} {dt}")

    # --- cache-version check (the stale-cache detector) --------------------
    print()
    print("cache versions (stale if BELOW module constant):")
    any_version = False
    for col, expected in _EXPECTED_VERSIONS.items():
        if col in gdf.columns:
            any_version = True
            got = int(gdf[col].iloc[0])
            verdict = "OK" if got >= expected else "STALE -> rebuild"
            print(f"  {col:<26} {got}   (expected >= {expected})  {verdict}")
        else:
            # Absent version col == treated as version 0 by load_lst() -> would rebuild.
            print(f"  {col:<26} <absent>  (load_lst treats as 0 -> lazy rebuild on next load)")
    if not any_version:
        print("  (no cache-version columns — this is not an lst.parquet)")

    # --- summary stats for the load-bearing derived columns ----------------
    print()
    print("summary stats:")
    for col in ("lst_celsius", "lst_norm", "seal_pct", "bestand_pct"):
        if col in gdf.columns:
            s = pd.to_numeric(gdf[col], errors="coerce")
            print(
                f"  {col:<26} "
                f"min={s.min():.3f}  mean={s.mean():.3f}  max={s.max():.3f}  "
                f"nan={int(s.isna().sum())}"
            )
    if "seal_pct" in gdf.columns:
        s = pd.to_numeric(gdf["seal_pct"], errors="coerce")
        print(f"  seal_pct == 0 (unsealed cells) : {int((s == 0).sum())} / {len(s)}")
        print(f"  seal_pct == 1 (fully sealed)   : {int((s == 1).sum())} / {len(s)}")
    if "dominant_type_key" in gdf.columns:
        n_none = int(gdf["dominant_type_key"].isna().sum())
        print(f"  dominant_type_key is None      : {n_none} / {len(gdf)}")
        top = gdf["dominant_type_key"].value_counts().head(5)
        print("  top dominant_type_key values:")
        for k, v in top.items():
            print(f"    {k}: {v}")

    print()
    print("How to read this:")
    print("  * A cache-version BELOW the module constant = STALE. Do NOT edit the")
    print("    parquet. Rebuild via  GET /api/lst?refresh=true  or delete lst.parquet")
    print("    and re-hit the endpoint (see rw-run-and-operate / GROUND_TRUTH §2).")
    print("  * seal_pct pinned at 1.0 for many cells can indicate the pre-fix v1")
    print("    double-count bug (should be _seal_model_version 2 / Priority-Union).")
    print("  * lst_celsius outside ~10–55 °C for summer median = suspect input TIF.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
