---
name: rw-debugging-playbook
description: >
  Fast symptom→cause→fix triage for the Resilientes Würzburg geodata app when
  something is broken or a number looks wrong. LOAD THIS when: a deck.gl map
  layer renders empty or 0 features; HVI is null/None for a cell; seal_pct,
  plantable_m2 or bestand_pct look wrong or a cell clamps to 100% sealed; a
  cell shows 0 plantable trees; HTTP 422 from /api/simulate/wasser; numbers are
  unchanged after swapping the LST GeoTIFF; the LST↔Zensus grid merge produces
  NaN rows; /api/hotspots shows striping or NoData artifacts near cloud gaps;
  pytest fails; CORS / preflight errors from the frontend; backend won't start
  or import errors; tree crown coverage is 0. Keywords: leerer Layer, 0
  features, NaN, None HVI, seal_pct falsch, plantable_m2, 422, stale cache,
  lst.parquet, x_mp_100m, Striping, CORS, ALLOWED_ORIGINS, conda resilientes,
  kronenbrei, refresh=true.
---

# Resilientes Würzburg — Debugging Playbook

You have a broken thing and need the fastest correct diagnosis. This is a
symptom→cause→confirm→fix table for THIS project's real failure modes, the
traps that repeatedly cost time, and experiments that tell two look-alike
causes apart. Imperative runbook voice; every command is copy-pasteable.

**Conventions used below**
- `PY` = the project Python. There is exactly one correct interpreter:
  `C:\Users\Marvi\miniconda3\envs\resilientes\python.exe` (conda env
  `resilientes`, Python 3.11). Never use a bare `python`/`py`.
- `API` = `http://localhost:8000`, `FE` = `http://localhost:5173`.
- "restart backend" = stop and re-run uvicorn; it clears every router's
  in-memory `_cache`. Deleting a parquet does NOT clear those.
- The grid invariant: LST pixels and Zensus cells share integer midpoints
  `x_mp_100m` / `y_mp_100m` and are joined with a plain `pd.merge()` (no spatial
  join). Break the grid and the merge silently yields NaN — see rows (d)/(f).

Verified against the repo on **2026-07-08**. Re-verification commands are in the
last section.

---

## SYMPTOM → LIKELY CAUSE → CONFIRM → FIX

| # | Symptom | Likely cause | Confirm | Fix |
|---|---|---|---|---|
| a | A deck.gl map layer is empty / 0 features (heat, vuln, trees, entsiegelung, hotspots) | Endpoint returned `[]`/404/500, or a source data file is missing in `backend/data/` | `curl "API/api/lst" \| head -c 300` — a 404 body names the missing file (`FileNotFoundError` → `load_*`). Also check FE console/Network for a red request. | Put the required source file in `backend/data/` (see rw-run-and-operate for the file list), then `?refresh=true`. If the endpoint returns features but the map is blank, it's a frontend layer/viewState issue, not backend — check `store/useAppStore.js` layer toggles and the layer's `getFillColor`/`visible`. |
| b | HVI (`hvi`) is `null` for a cell, tooltip shows `⚠ Altersstruktur nicht verfügbar (Datenschutz)` | **EXPECTED, not a bug.** `compute_hvi` returns `None` when either input is NaN/None. Zensus masks age classes and total population in **separate** CSVs, independently (§16 BStatG) — a cell can have `Einwohner` present but `anteil_65plus = null`. | In the `/api/vulnerability` feature, `Einwohner` is a number but `anteil_65plus` is `null`. That combination is the independent-masking signature. | Do nothing to the formula. This is correct behavior for ~small/masked cells. Only investigate if a cell with BOTH `Einwohner` and `anteil_65plus` present still has null HVI — then it's a join bug (row f), check `lst_norm` is also present. |
| c | `seal_pct` / `plantable_m2` look wrong; a heavily-sealed cell (Marktplatz, Talavera) clamps to ~100% sealed → 0 plantable m² / 0 trees | Stale `lst.parquet` computed with the old **v1** seal model (naive sum double-counted overlapping ATKIS+OSM polygons and clamped to 100%). The current code is Priority-Union (`_SEAL_MODEL_VERSION = 2`, `data_loader.py`). | Read the cache version: `PY -c "import geopandas as g; d=g.read_parquet(r'backend/data/lst.parquet'); print(d.get('_seal_model_version', 'MISSING').iloc[0] if '_seal_model_version' in d else 'MISSING')"`. `<2` or `MISSING` → stale. Expected post-fix: Marktplatz ≈78.6% → 2140 m² → 21 trees (2140÷100); Talavera ≈86% → 1400 m² → 14 trees. (Docs saying 85/56 predate the MIN_GROUND 25→100 change.) | `del backend\data\lst.parquet` (PowerShell) then `curl "API/api/lst?refresh=true"`. `plantable_m2` is computed LIVE in `routers/lst.py:54` as `10_000×(1−seal_pct)` (NOT stored), so it corrects automatically once `seal_pct` is right. |
| d | Numbers unchanged after swapping the LST GeoTIFF (`lst_wue_2023_2025_summer_median.tif`) | Two independent caches still hold the OLD data: the `lst.parquet` file AND the in-memory `_cache` of every LST-derived router. A parquet delete alone leaves the in-memory copy; a restart alone leaves the parquet. | `curl "API/api/lst" \| head -c 120` still shows old values after you replaced the .tif. | Do ALL THREE, in order: (1) `del backend\data\lst.parquet`; (2) **restart the backend** (clears in-memory `_cache` of `/lst`, `/vulnerability`, `/zensus`, `/stadtbezirke`, `/hotspots`); (3) re-hit each with `?refresh=true`: `curl "API/api/lst?refresh=true"`, then `/api/vulnerability?refresh=true`, `/api/zensus?refresh=true`, `/api/stadtbezirke?refresh=true`, `/api/hotspots?refresh=true`. |
| e | HTTP 422 from `/api/simulate/wasser` | Unknown `from_surface` or `to_surface` key. The endpoint validates against `RUNOFF_COEFFICIENTS` and returns 422 with a `detail` list naming the bad key. | Response body `{"detail":["from_surface=... unbekannt ..."]}`. | Send only these 9 valid keys: `asphalt`, `pflaster_dicht`, `pflaster_offen`, `lehm_kies`, `sickerpflaster`, `schotterrasen`, `rasengitter`, `rasenwabe`, `rasendecke`. If the FE sent a `type_key` (e.g. `AX_Strassenverkehr`) instead of a surface key, map it first via `frontend/src/utils/simulate.js` (`FROM_SURFACE_BY_TYPE_KEY`). |
| f | LST↔Zensus merge yields NaN rows (`lst_norm`/`lst_celsius` NaN for cells that clearly have LST); HVI collapses to null across the map | The LST GeoTIFF was re-exported with a `crsTransform` other than `[100,0,4_300_000,0,-100,2_985_000]` / a CRS other than EPSG:3035 → the integer midpoints no longer line up with the Destatis grid → `pd.merge()` in `analysis.build_hvi_geodataframe` (`how="left"`) matches nothing. | `PY -c "import geopandas as g; z=g.read_parquet(r'backend/data/zensus.parquet'); l=g.read_parquet(r'backend/data/lst.parquet'); print('zensus xmp', sorted(z.x_mp_100m)[:3]); print('lst xmp', sorted(l.x_mp_100m)[:3])"` — the two midpoint sets must overlap. Disjoint sets = broken transform. | Re-export the LST TIF with the exact GEE params `crs="EPSG:3035"`, `crsTransform=[100,0,4_300_000,0,-100,2_985_000]`, 100 m. Do NOT "fix" this by re-adding a spatial join or a cos(lat) correction (see Traps). Then invalidate caches per row (d). |
| g | `/api/hotspots` shows striping / spurious hot spots near cloud or NoData gaps | Edge cells adjacent to NoData get a biased focal mean. The main branch already guards this with a two-stage edge filter (`MIN_NEIGHBORS=10` + quadrant check, `hotspots.py:89–115`). If you still see it, either the filter thresholds are being hit at the study-area boundary, or you are on the stalled `feature/delta-analyse` branch which has an UNFIXED version of this bug. | `git branch --show-current`. On `main` the quadrant filter is present; on `feature/delta-analyse` (commit `17d9fa2`) it is not — that branch is explicitly stalled on "Striping/NoData Bugs". | If on `main` and it recurs, it's a real analysis edge case — do NOT loosen the quadrant filter without owner sign-off (it's the thing rejecting cloud-gap cells). If on `feature/delta-analyse`, you inherited a known-broken WIP — see rw-failure-archaeology before touching it. |
| h | Frontend CORS / preflight (OPTIONS) failures; browser blocks the API call | The requesting origin isn't in `ALLOWED_ORIGINS`. CORS is configured in `main.py` from the `ALLOWED_ORIGINS` env var (default `http://localhost:5173`). | Browser console: "blocked by CORS policy". Confirm the FE origin (port) matches the env value. | Add the origin to `backend/.env` `ALLOWED_ORIGINS` (comma-separated), restart backend. Do NOT touch production/deploy CORS config — deployment is off-limits without owner sign-off. Note: liveness probe is root `GET /`, there is NO `/health` endpoint. |
| i | Backend won't start / `ImportError` / `ModuleNotFoundError` (geopandas, rasterio, earthengine…) | Wrong interpreter — a system Python or the wrong conda env is on PATH. All deps live only in the `resilientes` env. | `PY -c "import sys, geopandas, rasterio; print(sys.version)"` should print 3.11.x with no error. A bare `python -c "import geopandas"` failing while `PY` succeeds confirms it. | Run with `PY`: `cd backend && C:\Users\Marvi\miniconda3\envs\resilientes\python.exe -m uvicorn main:app --reload --port 8000`. If a module is genuinely missing, `PY -m pip install -r backend/requirements.txt` — never add a new dep unasked. |
| j | Tree layer / `bestand_pct` is 0 everywhere (no crown coverage) | `_compute_bestand_pct` fell back to 0.0: the baumkataster source is missing, the `kronenbrei` column is absent, or the tree→cell spatial join was empty (CRS mismatch or no trees in extent). | `PY -c "import geopandas as g; t=g.read_parquet(r'backend/data/baumkataster_stadt_wuerzburg.parquet'); print(len(t), 'kronenbrei' in t.columns)"` — expect `44647 True`. | If the file/column is missing, restore the bulk export to `backend/data/`. Crown area = `π×(kronenbrei/2)²` (kronenbrei is the crown DIAMETER in m). After fixing, force `bestand_pct` recompute: bump `_BESTAND_MODEL_VERSION` OR `del backend\data\lst.parquet` then `?refresh=true` (a bare parquet keeps the stale 0s — see Traps). |

---

## Traps that cost real time

Each of these has bitten someone. Read before you "fix" the corresponding area.

- **Lazy cache only adds MISSING columns — it does not re-run changed formulas.**
  `load_lst()` recomputes `bestand_pct` / `seal_pct` only when the stored
  `_bestand_model_version` / `_seal_model_version` is BELOW the module constant
  (`data_loader.py:264, 274`). If you edit the CONTENT of `_compute_bestand_pct`
  or `_compute_seal_pct` **without bumping the version constant**, the old
  `lst.parquet` is silently kept and your change never takes effect. Rule: after
  editing either function, bump its `_*_MODEL_VERSION` OR delete `lst.parquet`
  OR call `?refresh=true`. Adding a genuinely new column is the only case the
  lazy path handles on its own.

- **`MIN_GROUND_PER_TREE_M2` drift: 25 vs 100.** The live value is **100**
  (FLL norm, 2nd-order trees), set in `frontend/src/utils/simulate.js:92` and
  mirrored in `store/useAppStore.js`. `CLAUDE.md` and
  `docs/handoff-baumscheiben.md` STILL SAY 25 — those docs are STALE. Trust the
  code (100). If a "max trees" number looks half of what a doc predicts, this is
  why. It's a frontend slider cap only; the backend never uses it.

- **The cos(lat) correction was added, then removed — do NOT re-add it.**
  A latitude area-correction was tried (commit `ac3137b`) and later removed once
  the LST TIF was re-exported natively on the EPSG:3035 Destatis grid.
  `load_lst` now reads pixel boxes straight from the rasterio transform with
  **no resampling and no cos(lat)** (`data_loader.py:293–294`). If you see NaN
  merge rows (row f), the fix is a correct re-export, NOT re-introducing cos(lat)
  or a spatial join.

- **`Einwohner` (capital E) vs `einwohner` (lowercase) are two different API
  contracts.** `/api/zensus` and `/api/vulnerability` return **`Einwohner`**;
  `/api/stadtbezirke` returns lowercase **`einwohner`**. `analysis.py` and
  `vuln_formula` key on capital `Einwohner`. Two zensus tests once broke by
  expecting lowercase; the correct fix was to fix the TESTS, not the API
  (commit `45171ef`). Do not "normalize" the casing.

- **In-memory router caches are NOT cleared by a parquet refresh alone.**
  `/lst`, `/vulnerability`, `/zensus`, `/stadtbezirke`, `/hotspots` each hold a
  module-level `_cache`. Deleting or rebuilding a parquet leaves that in-memory
  copy serving stale data until you **restart the backend** (or call the
  endpoint with `?refresh=true`, which bypasses and overwrites the cache). This
  is the #1 cause of "I changed the data but the API still shows old numbers".

---

## Discriminating experiments (tell two causes apart)

- **Cache problem vs formula problem?** Hit the endpoint twice:
  `curl "API/api/lst"` (cached) vs `curl "API/api/lst?refresh=true"` (recompute).
  If the values CHANGE with `?refresh=true`, it was a stale cache — invalidate
  per rows (c)/(d). If they're IDENTICAL and still wrong, the recompute path
  (formula / source data) is wrong — go read the relevant `_compute_*` in
  `data_loader.py` or the router math.

- **NaN = data-masking artifact vs join bug?** For a null-HVI cell, check
  whether its `x_mp_100m`/`y_mp_100m` exists in BOTH `zensus.parquet` and
  `lst.parquet` (see row f command). Present in both but HVI still null → it's
  masking (`anteil_65plus` or `lst_norm` is genuinely NaN → expected, row b).
  Midpoint present in zensus but ABSENT in lst → it's a grid/join break (row f).

- **Missing layer = backend empty vs frontend not rendering?** `curl` the
  endpoint. If it returns a non-empty `features` array, the backend is fine —
  the bug is frontend (layer toggle in `useAppStore.js`, `visible`,
  `getFillColor`, or viewState). If it returns `[]`/404/500, it's backend
  (row a).

- **seal_pct wrong = stale v1 cache vs live overlay math?** Read
  `_seal_model_version` from `lst.parquet` (row c command). `<2`/`MISSING` →
  stale v1, just refresh. Already `2` but still wrong → the Priority-Union
  overlay in `_compute_seal_pct` or the `SEAL_RATE_BY_TYPE` mapping is the
  suspect; verify against rw-diagnostics-and-tooling scripts before editing.

---

## When NOT to use this / use instead

- **Normal startup, ports, env, running the app** → use **rw-run-and-operate**.
  This playbook assumes the app already ran and then broke.
- **You want to MEASURE something** (validate seal_pct against a reference,
  audit hotspot outputs, inspect cache contents systematically) → use
  **rw-diagnostics-and-tooling** for the measurement scripts.
- **You need the full settled history of a past bug** (why the seal model
  changed, the delta-analyse dead end, the Crookston-Stage migration) → use
  **rw-failure-archaeology**. This file only carries the one-line "this was
  fixed in commit X" pointers needed to recognize a symptom.
- **Changing a coefficient, formula, or the wiki** → NOT a debugging task.
  Coefficients are never invented; they come from the owner or a cited wiki
  source and enter via `simulation_params.py` through change control. Stop and
  escalate.

---

## Provenance and maintenance

Verified against the repo on **2026-07-08**. Re-run these when a fact might have
drifted (`PY` = `C:\Users\Marvi\miniconda3\envs\resilientes\python.exe`):

- **Full test suite** (expect 129 passed, ~2 min; first run builds caches):
  `cd backend && C:\Users\Marvi\miniconda3\envs\resilientes\python.exe -m pytest tests/`
- **Endpoint liveness / shapes:**
  `curl "http://localhost:8000/"` (root probe, no `/health`),
  `curl "http://localhost:8000/api/lst" | head -c 200`,
  `curl "http://localhost:8000/api/simulate/wasser?area_m2=100&from_surface=asphalt&to_surface=schotterrasen"`.
- **422 valid-surface list** (must match row e):
  `grep -A14 "RUNOFF_COEFFICIENTS" backend/simulation_params.py`.
- **Cache version constants** (the lazy-refresh trap):
  `grep -nE "_BESTAND_MODEL_VERSION|_SEAL_MODEL_VERSION" backend/utils/data_loader.py`.
- **MIN_GROUND drift** (expect 100):
  `grep -n "MIN_GROUND_PER_TREE_M2" frontend/src/utils/simulate.js`.
- **Grid transform / cos(lat) removal** (expect the "keine cos(lat)" comment):
  `grep -n "cos(lat)\|EPSG:3035\|no Resampling\|kein Resampling" backend/utils/data_loader.py`.

### Drift found during authoring (2026-07-08)
- `CLAUDE.md` and `docs/handoff-baumscheiben.md` say `MIN_GROUND_PER_TREE_M2 = 25`;
  the live code says **100** (`frontend/src/utils/simulate.js:92`). Code wins.
- `CLAUDE.md` lists endpoints without `/api/hotspots`; the router exists
  (`backend/routers/hotspots.py`) and is a real, in-memory-cached endpoint.
  Rows (g) and (d) treat it as live.
- Everything else in the ground-truth brief matched the code as read
  (`data_loader.py`, `routers/lst.py`, `routers/hotspots.py`,
  `routers/simulate.py`, `utils/analysis.py`).
