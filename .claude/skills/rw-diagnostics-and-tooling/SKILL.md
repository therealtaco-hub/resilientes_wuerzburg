---
name: rw-diagnostics-and-tooling
description: >-
  Measurement scripts for Resilientes Würzburg — how to MEASURE the app's state
  instead of eyeballing the map. LOAD THIS when you need to inspect a parquet
  cache, check the LST↔Zensus grid alignment, look up one cell's exact values
  (lst_celsius / seal_pct / bestand_pct / plantable_m2 / n_trees_max), or confirm
  every endpoint is healthy with the right feature counts. Ships four READ-ONLY
  scripts under scripts/. Triggers: "inspect the cache", "is the grid aligned",
  "what does this cell say", "check seal_pct for Marktplatz", "are the endpoints
  up", "feature count", "stale cache?", "measure instead of guess", lst.parquet,
  zensus.parquet, x_mp_100m, _seal_model_version. NOT for deciding WHICH
  measurement a symptom calls for (that is rw-debugging-playbook), NOT for the
  pytest suite (rw-validation-and-qa), NOT for normal running (rw-run-and-operate).
---

# rw-diagnostics-and-tooling — measure, don't eyeball

The project's excellence bar is scientific defensibility (see `rw-change-control`).
"It looks right on the map" is not evidence. This skill ships small, **read-only**
diagnostic scripts that report the actual numbers so you can confirm or refute a
hunch. None of them mutate `backend/data/` and none call `load_lst()` (which would
lazily rebuild a cache) — they only open parquet files / hit the running API and print.

All commands assume the conda env **`resilientes`** (Python 3.11) and are run from the
repo root `C:\Users\Marvi\Code\AI\resilientes_wuerzburg`. Shorthand used below:

```
PY="C:/Users/Marvi/miniconda3/envs/resilientes/python.exe"
SCRIPTS=".claude/skills/rw-diagnostics-and-tooling/scripts"
```

On a different machine, substitute your own 3.11 interpreter (see `rw-build-and-env`).

## Pick the right tool

| I want to measure… | Run | Read it like… |
|---|---|---|
| What's in a cache + is it stale? | `inspect_parquet.py [path]` | version columns below the module constant ⇒ stale |
| Do LST and Zensus grids line up? | `check_grid_alignment.py` | near-total key overlap ⇒ grid invariant holds |
| One cell's real values | `inspect_cell.py [lon] [lat]` | hand-verify a sealed cell (Marktplatz) |
| Are all endpoints healthy? | `hit_endpoints.py [base_url]` | feature counts in expected ranges |

## Script 1 — `inspect_parquet.py`

Row count, columns + dtypes, cache-version columns
(`_bestand_model_version` / `_seal_model_version`) and summary stats for the key
derived columns. **Its main job: spot a stale cache WITHOUT touching it.**

```
$PY $SCRIPTS/inspect_parquet.py                       # default: backend/data/lst.parquet
$PY $SCRIPTS/inspect_parquet.py backend/data/zensus.parquet
$PY $SCRIPTS/inspect_parquet.py backend/data/entsiegelung.parquet
```

How to read it: the two version columns must equal the module constants in
`backend/utils/data_loader.py` (both are `2` as of 2026-07-08:
`_BESTAND_MODEL_VERSION`, `_SEAL_MODEL_VERSION`). If a version column is **below**
the constant, the cache is stale and `load_lst()` will recompute that column on next
load — but ONLY that column, and ONLY on a version bump. If you changed a formula
WITHOUT bumping the version, this script will still show the old (wrong) numbers with
an up-to-date version — that is the classic trap (see `rw-debugging-playbook`). Fix by
deleting `lst.parquet` or calling `?refresh=true` (see `rw-run-and-operate`).

## Script 2 — `check_grid_alignment.py`

Loads `lst.parquet` + `zensus.parquet` and counts how many integer
`x_mp_100m`/`y_mp_100m` keys match, plus LST-only and Zensus-only keys.

```
$PY $SCRIPTS/check_grid_alignment.py
$PY $SCRIPTS/check_grid_alignment.py backend/data/lst.parquet backend/data/zensus.parquet
```

How to read it: the LST↔Zensus join in `build_hvi_geodataframe()` is a plain
`.merge()` on these integer keys (the **grid invariant** — see
`rw-architecture-contract`). A healthy repo shows near-total overlap of Zensus keys
into LST. A sudden jump in "Zensus-only" keys means the LST GeoTIFF was re-exported
with a different `crsTransform` and the merge is silently NaN-ing rows. That is the
falsification test for the grid invariant.

## Script 3 — `inspect_cell.py`

Given a lon/lat, finds the covering LST cell and prints `lst_celsius`, `seal_pct`,
`dominant_type_key`, `bestand_pct`, and the two derived quantities computed live in
`routers/lst.py:54` and the frontend: `plantable_m2 = 10000 × (1 − seal_pct)` and
`n_trees_max = floor(plantable_m2 / 100)` (`MIN_GROUND_PER_TREE_M2 = 100`, FLL norm —
NOT 25; the docs are stale, see `rw-config-and-coefficients`).

```
$PY $SCRIPTS/inspect_cell.py                     # default: Marktplatz 9.9294 49.7947
$PY $SCRIPTS/inspect_cell.py 9.9350 49.8010      # Talavera-ish
$PY $SCRIPTS/inspect_cell.py 9.9294 49.7947 backend/data/lst.parquet
```

How to read it: a heavily-sealed square must NOT show `plantable_m2 = 0`. Anchor
values (healthy v2 cache): **Marktplatz ≈ 78.6 % sealed → ~2140 m² → ~21 trees**
(2140 ÷ 100); **Talavera ≈ 86 % → ~1400 m² → ~14 trees**. (Older docs say 85/56 —
those used the retired `MIN_GROUND = 25`; current divisor is 100.) A cell clamped to 100 % sealed / 0
plantable is the signature of the old v1 double-count bug (see `rw-failure-archaeology`).

## Script 4 — `hit_endpoints.py`

Pings every backend endpoint on a running server and reports status + feature counts,
plus one `/simulate/baeume` and one `/simulate/wasser` sanity call. Start the backend
first (`rw-run-and-operate`).

```
$PY $SCRIPTS/hit_endpoints.py                     # default http://localhost:8000
$PY $SCRIPTS/hit_endpoints.py http://localhost:8000
```

How to read it — expected feature-count ranges: **~14,500 LST**, **~3,089 zensus**,
**44,647 trees**, **13 stadtbezirke**, **5 hotspots**. `/simulate/wasser` with an
unknown surface returns **422** (that is correct behavior, not a failure).

## When NOT to use this / use instead
- Deciding which measurement a symptom needs → **rw-debugging-playbook**.
- The regression test suite / adding tests → **rw-validation-and-qa**.
- Starting the app, endpoint params, refresh semantics → **rw-run-and-operate**.
- Hand-deriving a number from first principles → **rw-proof-and-analysis-toolkit**.

## Provenance and maintenance
Scripts and anchor numbers verified 2026-07-08 against the live caches. They assume
the real column names (`x_mp_100m`, `y_mp_100m`, `lst_celsius`, `lst_norm`,
`bestand_pct`, `seal_pct`, `dominant_type_key`, `_bestand_model_version`,
`_seal_model_version`) and paths (`backend/data/*.parquet`). Re-verify column names by
running `inspect_parquet.py` itself. If `MIN_GROUND_PER_TREE_M2` changes in
`frontend/src/utils/simulate.js`, update the `/100` divisor in `inspect_cell.py`
(re-verify: `grep MIN_GROUND_PER_TREE_M2 frontend/src/utils/simulate.js`).
