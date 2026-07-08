---
name: rw-architecture-contract
description: >
  The load-bearing design decisions of Resilientes Würzburg, WHY they exist, the
  invariants that MUST hold, and the known-weak points stated plainly. Load this
  BEFORE changing anything that touches data flow, CRS handling, the LST↔Zensus
  grid join, the parquet/in-memory caches, a router's response shape, or a
  single-source-of-truth file (simulation_params.py, vuln_formula.py,
  analysis.build_hvi_geodataframe, frontend simulate.js / useAppStore.js). Also
  load when reasoning about "why is this structured this way" — the grid merge,
  the °C-not-rescaled rule, the cache version constants, seal_pct vs cooling,
  or the three-way frontend↔backend coefficient mirror. This is the
  "understand before you change" reference; it does NOT grant permission to
  change an invariant (see rw-change-control) or explain the domain science
  (see rw-geo-climate-reference) or catalog the coefficient values
  (see rw-config-and-coefficients).
---

# Architecture Contract — Resilientes Würzburg

Verified against the repo on **2026-07-08**. This skill states the decisions that hold
the system together and what silently breaks if you violate them. Read it before
touching the pieces named in the description. It explains structure; it does not
authorize changing it.

**Audience:** a zero-context engineer or a Sonnet-class model driving a future session.
Treat every rule here as load-bearing until you have re-verified otherwise.

---

## Big picture (one screen)

```
Frontend (React 19 + Vite 8, plain JSX, Tailwind v4)      Backend (FastAPI, Python 3.11)
  deck.gl (MapboxOverlay+useControl) + MapLibre GL          routers/*.py  → GeoJSON / JSON only
  Zustand store, React Router v7, react-i18next    REST     utils/data_loader.py → parquet caches
                                                  JSON      utils/analysis.py    → build_hvi (ONLY HVI site)
                                                 ◄──────►    utils/vuln_formula.py→ WEIGHTS, shrinkage
                                                            simulation_params.py → ALL coefficients
                                                                     │
                                                     backend/data/ : GeoTIFF, GeoParquet, CSV, ZIP
```

Everything native to a source CRS is reprojected to **EPSG:4326 before it leaves the API**.
The frontend re-implements a slice of the backend's simulation constants by hand
(the three-way mirror, decision #6). Caches come in two lifetimes: on-disk parquet and
in-process memory (decision #7).

---

## Load-bearing decisions (Decision → Why → What breaks if violated)

### (1) THE GRID INVARIANT — LST and Zensus share an integer grid, joined by merge not sjoin

**Decision.** The LST GeoTIFF (`lst_wue_2023_2025_summer_median.tif`) was exported from
Google Earth Engine with `crs="EPSG:3035"` and
`crsTransform=[100, 0, 4_300_000, 0, -100, 2_985_000]` — snapped **exactly** onto the
Destatis 100 m census grid. So every LST pixel and every Zensus cell share the same
integer midpoint keys `x_mp_100m` / `y_mp_100m`. `build_hvi_geodataframe(zensus, lst)`
in `utils/analysis.py` joins them with a plain pandas `.merge(..., on=["x_mp_100m",
"y_mp_100m"], how="left")` — **no spatial join**.

**Why.** Identical grids make a keyed merge exact and cheap, and it removed an earlier
`gpd.sjoin` approach (and let a whole "grid mismatch" caveat be deleted from the
vulnerability page).

**What breaks if violated.** If anyone re-exports the LST GeoTIFF with a *different*
transform / CRS / resolution, the integer midpoints no longer line up, the `how="left"`
merge finds no LST partner, and **every HVI row silently becomes NaN** — no error, just
an empty-looking vulnerability map. A GeoTIFF swap therefore is never "just drop in a new
file": keep the same `crsTransform`, then follow the cache-invalidation ritual in
decision #4.

```
LST pixel  (x_mp=4310150, y_mp=2971850)  ┐
                                          ├─ pd.merge on (x_mp_100m, y_mp_100m) → 1 HVI row
Zensus cell(x_mp=4310150, y_mp=2971850)  ┘   (any drift in the transform → no match → NaN)
```

### (2) CRS conventions — one native CRS per source, 4326 at the door

| Data | Native CRS | Used for |
|---|---|---|
| Zensus + LST | **EPSG:3035** (LAEA Europe) | grid keys; Würzburg ≈ x 4.30–4.32 M, y 2.96–2.98 M |
| ATKIS shapefiles | **EPSG:25832** (UTM 32N) | **all metric area math** (`area_m2`, seal overlap) |
| Baumkataster | **OGC:CRS84** (= WGS84 lon/lat) | `to_epsg()` returns `None` — that is correct, not a bug |
| **Every API response** | **EPSG:4326** | serialized GeoJSON |

**Why.** Metric quantities (areas, distances) must be computed in a projected metric CRS
(25832), not in degrees. Grid alignment needs the Destatis CRS (3035). Clients (deck.gl /
MapLibre) want 4326.

**What breaks if violated.** Compute an area in 4326 and you get square-degrees garbage.
Reproject the grid before merging and you lose the integer keys (see #1). Forget the final
`to_crs("EPSG:4326")` and the frontend renders nothing.

### (3) LST °C comes straight from GEE band 1 — the backend does NOT rescale

**Decision.** `load_lst()` reads Band 1 directly as °C (`raw = src.read(1)`). Band 2 = NDVI,
Band 3 = NDBI. No DN→Kelvin→Celsius conversion, **no cos(latitude) correction**.

**Why.** GEE already applied the scale/offset and DN→K→°C on export. A cos(lat) correction
was once added (commit `ac3137b`) then **removed** when the raster was re-exported native to
EPSG:3035 — the projected grid already handles it.

**What breaks if violated.** Re-applying the °C formula double-scales the temperatures;
re-adding cos(lat) distorts them. Both silently produce wrong LST → wrong `lst_norm` →
wrong HVI. Valid-pixel mask is `finite & −10 °C < v < 70 °C & v ≠ nodata`; `lst_norm` is
**rank-normalized** via scipy `rankdata` (0..1), not min-max.

### (4) Parquet caches + model-version constants — lazy-add MISSING columns only (the trap)

**Decision.** `load_lst()` caches to `data/lst.parquet` and carries two module constants:
`_BESTAND_MODEL_VERSION = 2` and `_SEAL_MODEL_VERSION = 2`
(`utils/data_loader.py` lines ~46–47). On a cache hit it **lazy-adds a column only if it is
MISSING**, or recomputes `bestand_pct` / `seal_pct` only when the stored
`_bestand_model_version` / `_seal_model_version` is **below** the module constant.

**Why.** Avoids recomputing expensive derived columns on every request while still letting a
model change invalidate the cache automatically.

**THE TRAP.** If you change the *content of an existing column's formula* (`_compute_bestand_pct`
or `_compute_seal_pct`) **without bumping the version constant**, the stale cache is **NOT**
corrected — the column already exists and the version still matches, so old values persist.

**Rule after editing either compute function:** bump the matching version constant **OR**
delete `backend/data/lst.parquet` **OR** call the endpoint with `?refresh=true`.
**When the LST GeoTIFF itself is swapped:** delete `lst.parquet` (or `?refresh=true`) **AND
restart the backend** (clears in-memory caches, see #7), then re-hit `/api/lst`,
`/api/vulnerability`, `/api/zensus`, `/api/stadtbezirke`, `/api/hotspots` with `?refresh=true`.

### (5) Backend always returns GeoJSON / JSON — never a raw GeoDataFrame

**Decision.** Every router serializes to a GeoJSON `FeatureCollection` or a plain JSON dict
(e.g. `routers/lst.py` builds `{"type":"FeatureCollection","features":[...]}`).

**Why.** A GeoDataFrame is not JSON-serializable and leaks CRS/dtype internals; the contract
with the frontend is stable GeoJSON in EPSG:4326.

**What breaks if violated.** Returning a GDF throws at serialization or ships an unstable
shape the frontend can't parse. **Property-name contract:** `/api/zensus` and
`/api/vulnerability` return **`Einwohner`** (capital E); `/api/stadtbezirke` returns
lowercase **`einwohner`** (different endpoint — do not "fix" one to match the other). When
tests expected the wrong casing, the fix was to correct the *tests*, not the API.

### (6) Single-source-of-truth files — and the three-way frontend mirror (hand-synced)

One home per fact. Import, never re-declare.

| Fact | THE home | Do not duplicate |
|---|---|---|
| All simulation coefficients + the Crookston/Stage cover formulas | `backend/simulation_params.py` | never hardcode a coefficient elsewhere; import it |
| HVI weights + shrinkage | `backend/utils/vuln_formula.py` (`WEIGHTS`, `N_PRIOR=50`, `shrink_senior_rate`, `compute_hvi`) | — |
| Per-cell HVI computation | `backend/utils/analysis.py::build_hvi_geodataframe` — the **ONLY** place HVI is built | called by `vulnerability.py` + `stadtbezirke.py` **only**; never call `compute_hvi()` directly elsewhere |

**The three-way mirror (the sync burden).** The frontend re-declares a slice of the sim
constants for instant UI feedback, **hand-synced** with `simulation_params.py`:
- `frontend/src/utils/simulate.js` — mirrored sim constants (Ψ table, seal rates, surface order…).
- `frontend/src/store/useAppStore.js` — also mirrors `_CROWN_AREA_M2 = 50`,
  `_MIN_GROUND_PER_TREE_M2 = 100`, `_SEAL_RATE{}`, `_FROM_SURFACE{}`, `_SURFACE_ORDER`.

**Why.** The sliders/legends need the constants client-side without a round-trip.

**What breaks if violated.** Change a coefficient in Python and forget the two JS mirrors →
the UI preview and the API result disagree. There is **no build-time check** that they match
(see Known weak points). When you touch `simulation_params.py`, grep the two JS files for the
same value and update by hand.

### (7) In-memory router caches vs parquet caches — different lifetimes

| Cache kind | Where | Cleared by |
|---|---|---|
| **In-memory** module `_cache` | `routers/lst.py`, `zensus`, `vulnerability` (in-memory ONLY), `stadtbezirke` (aggregates), `hotspots` (in-memory ONLY) | **backend restart** or `?refresh=true` |
| **On-disk parquet** | `data/{trees,zensus,lst,entsiegelung,stadtbezirke}.parquet` | delete file or `?refresh=true` |

**Why.** In-memory is fast per-process; parquet survives restarts.
**What breaks if violated.** `?refresh=true` on the endpoint clears *its* in-memory cache and
rebuilds the parquet — but a sibling endpoint holding the old data in memory keeps serving it
until *it* is also refreshed or the process restarts. `/api/vulnerability` and `/api/hotspots`
have **no parquet at all** — a restart is the only full reset. This is why the GeoTIFF-swap
ritual (#4) says "restart AND refresh all affected endpoints".

### (8) seal_pct limits stem count, NOT the cooling denominator — orthogonal axes

**Decision.** `seal_pct` (area-weighted sealing 0–1 per 100 m cell) feeds only the
**plantable area / max stem count**: `plantable_m2 = 10_000 × (1 − seal_pct)` (computed
**live in `routers/lst.py` line ~54**, NOT stored in parquet);
`n_trees_max = floor(plantable_m2 / MIN_GROUND_PER_TREE_M2)` with `MIN_GROUND_PER_TREE_M2 = 100`.
The cooling model uses **projected canopy cover** (Crookston/Stage) as its denominator and is
independent of `seal_pct`. The `area_m2` sent to the sim API is the **full cell area** —
crowns overhang sealed ground.

**Why.** How many trees physically fit (ground) and how much a given canopy % cools (surface
temperature) are different physical questions. Conflating them was the bug that clamped
heavily sealed cells (Marktplatz, Talavera) to 0 plantable m² (fixed via the priority-union
seal model, commit `a7acf61`).

**What breaks if violated.** Feed `seal_pct` into the cooling math and you double-penalize
sealed cells; feed full area into stem count and you plant trees on asphalt.

---

## Invariants that must hold (checklist)

- [ ] **Grid keys align.** LST and Zensus share integer `x_mp_100m` / `y_mp_100m`; the HVI
      join is `pd.merge`, never `sjoin`. Any GeoTIFF re-export keeps
      `crsTransform=[100,0,4_300_000,0,-100,2_985_000]`, `crs=EPSG:3035`, 100 m.
- [ ] **Sum of HVI weights == 1.0.** `WEIGHTS = {lst_norm:0.6, anteil_65plus:0.4}` (asserted).
- [ ] **API responses are EPSG:4326 GeoJSON/JSON**, never a raw GeoDataFrame.
- [ ] **Metric areas/distances computed in EPSG:25832 (or 3035 for hotspots)**, never in degrees.
- [ ] **Coefficients imported from `simulation_params.py`**, never hardcoded; JS mirrors updated
      in the same change.
- [ ] **HVI computed in exactly one place** (`build_hvi_geodataframe`); `compute_hvi()` never
      called directly by a router.
- [ ] **LST °C used as-is** — no DN→K→°C rescale, no cos(lat).
- [ ] **After a `_compute_bestand_pct` / `_compute_seal_pct` content change:** version bump OR
      delete `lst.parquet` OR `?refresh=true`.
- [ ] **Property casing:** `Einwohner` on `/zensus` + `/vulnerability`; `einwohner` on
      `/stadtbezirke`.

---

## Known weak points (stated plainly)

- **Three-way manual sync burden.** `simulation_params.py` ↔ `simulate.js` ↔ `useAppStore.js`
  are kept in step by hand. No automated check; drift is easy and silent.
- **No CI pipeline.** Tests (`backend/tests/`, ~129 passing) run locally only. Nothing enforces
  them on push. Known owner TODO ("CI-Integration der Test-Suite").
- **Coefficients are transferred, not locally calibrated.** Tree cooling comes from a Munich
  study (García de León 2025); the unused unsealing→LST coefficient from Potsdam (Tervooren
  2015). The excellence bar is local calibration; until then every number ships with a caveat.
- **In-memory caches lost on restart + cold-start latency.** `/vulnerability` and `/hotspots`
  have no parquet; a restart rebuilds them from scratch. On Render's free tier the backend
  sleeps → first request after idle is slow and rebuilds caches.
- **Delta-analysis unfinished.** The LST baseline-vs-current difference work
  (`feature/delta-analyse`, commit `17d9fa2`) is stalled on striping / NoData artifacts and is
  **not merged**. Data files exist in `data/` but the feature is WIP.
- **`CO2_KG_PER_TREE_YEAR = 12.5` is not yet wiki-sourced.** Flagged "vor Produktionsrelease
  nachholen" — the one simulation constant without a citation ingested through the wiki workflow.

---

## When NOT to use this / use instead

- **"Am I *allowed* to change this invariant / add a coefficient / touch deployment or the wiki?"**
  → **`rw-change-control`**. This skill tells you what the invariants are and why; the change-
  control skill governs permission, the wiki ingest workflow, and deployment fences.
- **"What's the domain theory behind CRS choices / canopy cover / HVI / transpiration?"**
  → **`rw-geo-climate-reference`**.
- **"What is the exact numeric value / source of a coefficient, Ψ table, or seal rate?"**
  → **`rw-config-and-coefficients`** (the value catalog). This skill names the *home files*;
  that skill lists the *values*.

---

## Provenance and maintenance

Re-verify anything below if it feels stale (last verified **2026-07-08**):

```bash
# Cache version constants (must be integers; bump on formula-content change)
grep -nE "_(BESTAND|SEAL)_MODEL_VERSION" backend/utils/data_loader.py

# The grid merge keys — confirm it is .merge on x_mp_100m/y_mp_100m, NOT gpd.sjoin
grep -nE "merge|x_mp_100m|sjoin" backend/utils/analysis.py

# HVI is built in exactly one place; no router calls compute_hvi directly
grep -rn "build_hvi_geodataframe\|compute_hvi" backend/

# Routers registered (expect 8: trees, lst, simulate, zensus, vulnerability,
# entsiegelung, stadtbezirke, hotspots)
grep -n "include_router" backend/main.py

# plantable_m2 is computed live in the router, not stored in parquet
grep -n "plantable_m2" backend/routers/lst.py

# The three-way mirror — the JS values that must match simulation_params.py
grep -nE "_CROWN_AREA_M2|_MIN_GROUND_PER_TREE_M2|_SEAL_RATE" frontend/src/store/useAppStore.js

# HVI weights sum to 1.0
grep -nE "WEIGHTS|N_PRIOR" backend/utils/vuln_formula.py
```

**Drift found vs docs (2026-07-08 verification):**
- **CLAUDE.md endpoint table lists 7 endpoints; the code registers 8** — `/api/hotspots`
  (`routers/hotspots.py`) is missing from the doc table. `main.py` imports and includes it.
- **CLAUDE.md's `utils/simulate.js` note still says `MIN_GROUND_PER_TREE_M2 = 25`; the code
  uses `100`** (`useAppStore.js` line 6; raised from 25). `docs/handoff-baumscheiben.md` is
  likewise stale. The **code value 100 wins.**
- **CLAUDE.md tech table says React 18 / Router v6; `package.json` pins React 19 / Router v7 /
  Vite 8.** State the package.json values as truth.

Everything else in this skill was confirmed directly against `backend/main.py`,
`backend/utils/data_loader.py`, `backend/utils/analysis.py`, `backend/routers/lst.py`, and
`frontend/src/store/useAppStore.js` on 2026-07-08.
