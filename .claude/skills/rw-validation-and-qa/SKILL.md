---
name: rw-validation-and-qa
description: >
  Evidence, tests, and acceptance thresholds for Resilientes Würzburg. LOAD THIS
  when validating a change, adding or updating tests, deciding whether something is
  "done" / mergeable, or establishing proof for a coefficient/formula/data change
  (LST scaling, HVI/vulnerability score, Rational unsealing formula, Crookston canopy
  model, seal_pct, cache versions). Triggers: "is this done", "how do I test this",
  "add a test", "what counts as evidence", "did I break anything", "run the tests",
  "pytest", "test_simulate", "test_lst_router", "test-sim-store", editing
  backend/simulation_params.py, utils/vuln_formula.py, utils/analysis.py,
  utils/data_loader.py, or any routers/*.py. Excellence bar = scientific
  defensibility: "it looks right on the map" is NOT evidence.
---

# rw-validation-and-qa — What counts as proof, and how to prove it

Runbook voice. Audience: a zero-context mid-level engineer or a Sonnet-class model
running a future session. The owner's excellence bar is **scientific defensibility**
(every number source-backed, submission/publication grade). Therefore a screenshot of a
nice-looking map is **not** acceptance evidence for any numeric or scientific change.
Date-stamped facts verified **2026-07-08**.

---

## 0. TL;DR acceptance gate

Before you call anything "done" on a change that touches numbers, formulas, routers, or
data:

1. **0 failed tests.** Full suite green (`129 passed` as of 2026-07-08).
2. **Numbers are pinned.** A coefficient/formula change MUST add or update a test that
   encodes the **expected number** (not just "no crash / status 200").
3. **Reproducible.** A data/cache change is verified by deleting the cache + `?refresh=true`
   + re-run → **same numbers** twice.

If any of the three is missing, it is not done. See §5 for the discipline, §6 for the
regression anchors.

---

## 1. The test suite (backend, authoritative)

Python env: conda env `resilientes`, Python 3.11.15 at
`C:\Users\Marvi\miniconda3\envs\resilientes\python.exe` (call it `<conda-python>` below).

```bash
cd backend
C:/Users/Marvi/miniconda3/envs/resilientes/python.exe -m pytest tests/
```

Expected: **`129 passed` in ~122 s** (verified 2026-07-08). The **first** run is slower
(minutes) because it builds the derived data caches
(`trees/zensus/lst/entsiegelung/stadtbezirke.parquet`) from the required source files in
`backend/data/`. Subsequent runs read the caches and hit ~122 s.

`tests/conftest.py` does one job: it inserts `backend/` onto `sys.path` so
`from main import app` and `from utils... import ...` resolve when pytest runs from
`backend/`. Do not add project logic to conftest.

### The 8 test files and what each pins

| File | Scope | What it proves (expected numbers, not "no crash") |
|---|---|---|
| `test_bestand_pct.py` | `_compute_bestand_pct` + cache migration | Crookston-exp projected cover: Σ crown 5000 m² → ratio 0.5 → **39.3 %** (literal pin). Dense overlap stays < 100 %. Stale-cache-without-version auto-recomputes 50.0 → 39.3; correct version marker is NOT recomputed. |
| `test_data_loader.py` | loader plumbing | Zensus/LST/entsiegelung parsing, merge keys, clamping. |
| `test_lst_router.py` | `GET /api/lst` edge cases | `dominant_type_key=None` serializes as JSON `null` (not NaN, not missing); `seal_pct=0.6` → `plantable_m2 == 4000`; `has_seal` needs BOTH `seal_pct` and `dominant_type_key`. Uses synthetic GDF — see §2. |
| `test_seal_pct.py` | `_compute_seal_pct` priority-union | Full Wohnbau cell → **0.60**; 60/40 Wohnbau/Straße → **0.752**; overlapping ATKIS+OSM → highest rate **0.95** (NOT clamped to 1.0 — the doppelzählung regression); half-overlap → **0.80**; no polygon → 0.0 / dominant `None`. |
| `test_simulate.py` | both `/api/simulate/*` endpoints | Tree: 100 trees / 10000 m² → **39.3 %** cover, ΔLST = `-0.083 × effective_new_pct`, CO₂ = `n × 12.5`. Water: 1000 m² asphalt→schotterrasen → **344.1 m³/yr**. Unknown surface → **422**. Validation 422 cases. |
| `test_trees.py` | `GET /api/trees` | FeatureCollection shape, field presence, count sanity. |
| `test_vuln_formula.py` | `vuln_formula.py` units | `compute_hvi` max→10.0, min→1.0, weighted `{0.6,0.4}` → 6.4; None/NaN → None. `shrink_senior_rate`: n=N_PRIOR → exact midpoint; bounded in `[global_mean, observed]`. |
| `test_zensus.py` | `GET /api/zensus` | Property contract incl. **`Einwohner`** (capital E — API contract, see §4). |

Run one file/one test while iterating:

```bash
cd backend
C:/Users/Marvi/miniconda3/envs/resilientes/python.exe -m pytest tests/test_simulate.py -v
C:/Users/Marvi/miniconda3/envs/resilientes/python.exe -m pytest tests/test_seal_pct.py::test_flaechengewichteter_mischwert -v
```

### Frontend checks (lighter — no vitest)

```bash
cd frontend
node scripts/test-sim-store.mjs   # hand-rolled smoke test of the Zustand sim-store actions
npm run lint                       # eslint
```

`test-sim-store.mjs` imports the real store, mutates it via actions, and asserts state
(cell/polygon toggles, groupConfig auto-fill, area-capping on deselection). It prints
`N Tests grün` and sets a nonzero exit code on failure. There is **no** React component
or E2E test harness.

---

## 2. How router tests work (the pattern to copy)

Router tests must **not** need real data files. They inject **synthetic GeoDataFrames**
and swap the loader, then call the ASGI app in-process. Copy this exactly.

- HTTP driver: `httpx.AsyncClient(transport=ASGITransport(app=app))`, tests are
  `@pytest.mark.asyncio`.
- Loader swap: `monkeypatch.setattr(<router_module>, "load_lst", lambda force_refresh=False: gdf)`
  and clear the router's in-memory cache (`lst_router._cache = None`) before the request.
- Synthetic data: build a one-row (or few-row) `GeoDataFrame` with exactly the columns
  the router reads, `crs="EPSG:4326"`.

The canonical helper is `_make_lst_gdf` in `tests/test_lst_router.py`:

```python
def _make_lst_gdf(dominant_type_key=None, seal_pct=0.0):
    geom = box(9.93, 49.79, 9.931, 49.791)
    return gpd.GeoDataFrame(
        {
            "lst_celsius": [30.5], "lst_norm": [0.6], "bestand_pct": [15.0],
            "seal_pct": [seal_pct], "dominant_type_key": [dominant_type_key],
            "plantable_m2": [10_000.0 * (1 - seal_pct)],
            "_bestand_model_version": [2], "_seal_model_version": [1],
        },
        geometry=[geom], crs="EPSG:4326",
    )
```

Two other injection idioms already in the repo:

- **Loader unit tests** (`test_seal_pct.py`, `test_bestand_pct.py`) monkeypatch the
  loader's *dependencies* (`data_loader.load_entsiegelung`, or the module path constants
  `_TREES_CACHE` / `_TREES_SOURCE` / `_LST_CACHE` / `_ENTSIEGELUNG_CACHE`) so the function
  under test runs against synthetic polygons/points and a `tmp_path` parquet.
- **Pure-compute endpoints** (`/api/simulate/*`) need no injection at all — they take
  query params and compute; tests just assert the returned numbers against
  `simulation_params` constants.

`app.dependency_overrides` is the FastAPI-native way to swap a dependency-injected loader;
`monkeypatch.setattr` on the imported symbol is what the current tests use. Either is
acceptable — the rule is **no real-data dependency in a router/loader test**.

---

## 3. Evidence standard — what qualifies as proof here

Ranked. Higher is stronger. Map-eyeballing and screenshots are **not** on this list for
numeric/scientific changes.

1. **A passing test that encodes the EXPECTED NUMBER.** `status_code == 200` alone is
   worthless as scientific evidence — it proves the server didn't crash, not that the math
   is right. The test must assert the value, ideally with a **literal pin** alongside the
   formula-derived value so a mirrored sign error can't hide (see the `39.3` literal pins
   in `test_bestand_pct.py` and `test_simulate.py`, and the doppelzählung `0.95` pin in
   `test_seal_pct.py`).
2. **A hand-computable check** you can reproduce on paper:
   - Rational unsealing: 1000 m² **asphalt→schotterrasen** = `1000 × 0.5735 × (0.90 − 0.30)`
     = **344.1 m³/yr**.
   - Projected canopy: 100 trees × 50 m² / 10 000 m² → ratio 0.5 → `(1 − e^−0.5)×100`
     = **39.3 %**.
   - Sealing: Marktplatz **≈78.6 %** sealed → `10 000 × (1 − 0.786)` ≈ 2140 m² →
     `floor(2140 / 100)` = **21 trees**; Talavera ≈86 % → 1400 m² → **14 trees**.
     (`MIN_GROUND_PER_TREE_M2 = 100`; older docs saying 85/56 used the retired 25.)
3. **Reproducibility of a data/cache change:** delete the cache parquet, call the endpoint
   with `?refresh=true`, re-run — you get the **same** numbers. Twice.

Not evidence: "it looks right on the map", a screenshot, "the demo worked once", a green
status code with no value assertion, or agreement with a stale doc (docs drift — see §4).

---

## 4. Known contracts you must not accidentally "fix"

- **`Einwohner` (capital E)** is the API contract on `/api/zensus` and `/api/vulnerability`.
  `/api/stadtbezirke` uses lowercase `einwohner` (different endpoint). If a test expects
  the wrong casing, **fix the test, not the API** — this exact mistake was corrected in
  commit `45171ef` (`docs/handoff-zensus-tests.md`).
- **`MIN_GROUND_PER_TREE_M2 = 100`** (FLL norm) in code today.
  CLAUDE.md and `docs/handoff-baumscheiben.md` still say 25 — those docs are **stale**.
  Trust the code; do not pin 25 in a new test.
- **`LST_PER_PCT_UNSEALING = -0.03` exists but is deliberately NOT applied** in the water
  sim v1. A test that starts expecting `delta_lst_celsius` from `/api/simulate/wasser` is
  wrong by design.
- The **grid invariant**: LST↔Zensus join is a plain `pd.merge()` on `x_mp_100m`/`y_mp_100m`
  (no spatial join). If a merge starts producing NaN rows, suspect an LST re-export with a
  different `crsTransform`, not the test.

---

## 5. Acceptance-threshold discipline (the merge gate for QA)

| Change type | Required evidence before "done" |
|---|---|
| Any change | Full suite: **0 failed**. Run it, paste the `N passed` line. |
| Coefficient / formula change (`simulation_params.py`, `vuln_formula.py`, `analysis.py`, `_compute_*`) | Add OR update a test that **pins the new number** (literal + formula-derived). A coefficient change with no number-pinning test is rejected. |
| Data / cache change (loader, GeoTIFF swap, `_*_MODEL_VERSION` bump) | Reproduce with `?refresh=true`: delete the affected `*.parquet`, re-hit the endpoint, confirm identical numbers on a second refresh. Bump the model-version constant if a column's formula content changed (lazy-add only fills MISSING columns — it will NOT correct a stale column silently). |
| Frontend sim-store change | `node scripts/test-sim-store.mjs` green + `npm run lint` clean. |
| Sim constant mirrored in FE (`frontend/src/utils/simulate.js`, `useAppStore.js`) | Update the mirror by hand and re-run the store smoke test — this is a three-way sync burden (backend `simulation_params.py` is the source of truth). |

New numeric behavior with a green suite but **no number-pinning test** does not clear the
gate. "Tests still pass" is necessary, not sufficient — the tests must actually exercise
the thing you changed.

---

## 6. Golden / certified inventory (regression anchors)

These are the known-good anchor values as of **2026-07-08**. Treat them as the regression
baseline: if a refactor moves one of these without an intended, documented reason, you
broke something.

| Anchor | Value |
|---|---|
| Full backend suite | **129 passed** (~122 s) |
| LST features | ~14,500 |
| Zensus features (LST-intersecting) | ~3,089 |
| Baumkataster records | 44,647 |
| Stadtbezirke | 13 |
| Hotspots returned | top 5 |
| Projected canopy pin | 100 trees / 10 000 m² → **39.3 %** |
| Rational pin | 1000 m² asphalt→schotterrasen → **344.1 m³/yr** |
| Sealing (priority-union) | Marktplatz **≈78.6 %** → 2140 m² → 21 trees; Talavera **≈86 %** → 1400 m² → 14 trees; overlapping ATKIS+OSM → highest rate 0.95 (NOT 1.0) |
| HVI weights | `{lst_norm: 0.6, anteil_65plus: 0.4}`, scale 1–10 |
| Shrinkage | `N_PRIOR = 50`, `adjusted = (n·observed + 50·global_mean)/(n+50)` |

---

## 7. How to add a test

1. **Location:** `backend/tests/`, filename `test_<thing>.py` (mirrors the module:
   `_compute_seal_pct` → `test_seal_pct.py`; a router → `test_<router>_router.py`).
2. **No real data.** For loader/router logic, build a **synthetic GeoDataFrame** and
   monkeypatch the loader (§2). Only the pure-compute sim endpoints run without injection.
3. **Pin the expected number.** Assert the value, and where a mirrored sign error could
   hide, add a **literal pin** next to the formula-derived value (copy the `39.3` /
   `0.95` / `344.1` idioms). Import constants from `simulation_params` /
   `utils.vuln_formula` — never hardcode a coefficient in the test.
4. **Async router tests** use `httpx.AsyncClient(ASGITransport(app=app))` +
   `@pytest.mark.asyncio`; clear the router's `_cache` before the request.
5. **Run it, then run the whole suite.** File first (`-v`), then all of `tests/` to
   confirm you didn't perturb the 129 count or a shared cache.

---

## 8. Known gap — no CI (compensating discipline)

There is **no CI pipeline** (owner TODO: "CI-Integration der Test-Suite"). Tests run
**locally only**. Risk: a regression can land on `main` uncaught because nothing runs the
suite on push. Until CI exists, the manual discipline in §0 and §5 IS the gate — run the
full suite locally and confirm `0 failed` before you consider a change mergeable, and note
the `N passed` count in your handoff. Do not treat a green local run as a substitute for CI
guarantees on someone else's future commit.

---

## When NOT to use this / use instead

- Writing a throwaway measurement script (count features, probe a live endpoint, sanity a
  number) → **rw-diagnostics-and-tooling**. This skill is about *what proves a change is
  correct*, not ad-hoc measurement.
- The actual merge decision / change-control gate and off-limits rules (deployment, wiki
  ingest, one-task-per-session) → **rw-change-control**.
- The higher bar for *research claims* (one mechanism must explain all observations,
  adversarial self-refutation, predict-before-run) → **rw-research-methodology**. QA proves
  a code change is correct; research methodology proves a scientific claim is defensible.

---

## Provenance and maintenance

- **Test suite / count** — re-verify:
  `cd backend && C:/Users/Marvi/miniconda3/envs/resilientes/python.exe -m pytest tests/`
  → expect `129 passed`. Recount test files with `ls backend/tests/test_*.py` (8 files as
  of 2026-07-08).
- **Rational pin** — `1000 × 0.5735 × (0.90 − 0.30) = 344.1`; source Ψ values live in
  `backend/simulation_params.py` (`RUNOFF_COEFFICIENTS`, `ANNUAL_RAINFALL_WUERZBURG_M`).
- **Canopy / sealing pins** — see `test_bestand_pct.py`, `test_simulate.py`,
  `test_seal_pct.py`; formulas in `simulation_params.py` (`projected_cover_pct`,
  `inverse_ratio`, `SEAL_RATE_BY_TYPE`).
- **Frontend smoke test** — `cd frontend && node scripts/test-sim-store.mjs`.
- All values date-stamped **2026-07-08**. Re-check counts and the `129` after any change to
  `tests/`, `simulation_params.py`, or the loaders.
