---
name: rw-run-and-operate
description: >
  Operational runbook for running Resilientes Würzburg day to day. Load this when you
  need to START the app (backend uvicorn on :8000, frontend Vite on :5173), CALL an
  endpoint under /api/* and get the query params / cache location / valid surface keys
  right, understand what `?refresh=true` does per endpoint, know WHERE a cache file
  lands (backend/data/*.parquet vs in-memory router caches), or run THE DATA-SWAP DANCE
  after replacing the LST GeoTIFF or editing _compute_bestand_pct / _compute_seal_pct.
  Keywords: start server, uvicorn, npm run dev, curl the API, /api/simulate/baeume,
  /api/simulate/wasser, 422 unknown surface, refresh cache, lst.parquet, health check,
  status ok. NOT for first-time setup (use rw-build-and-env), NOT for debugging a broken
  run (use rw-debugging-playbook), NOT for inspecting cache CONTENTS (use
  rw-diagnostics-and-tooling), NOT for deploy (off-limits — see rw-change-control).
---

# rw-run-and-operate — running & operating the app

Verified against the repo on **2026-07-08** (`backend/main.py`, all 8 router files,
`.claude/launch.json`, `frontend/package.json`). Repo wins over prose; drift is flagged
at the bottom.

**Terms** (defined once): *parquet cache* = a `.parquet` file on disk in `backend/data/`
that survives restarts. *In-memory cache* = a module-level `_cache` variable inside a
router that is wiped when the backend process restarts. *The grid invariant* = LST pixels
and Zensus cells share integer midpoints, joined by `pd.merge`, no spatial join (see
`rw-architecture` / GRID INVARIANT).

---

## 1. Start commands

Two processes. Backend first (frontend expects it at `VITE_API_URL`, default
`http://localhost:8000`).

### Backend — FastAPI on port 8000
```bash
cd backend && uvicorn main:app --reload --port 8000
```
Conda-python variant (explicit interpreter, env `resilientes`, Python 3.11.15):
```bash
C:/Users/Marvi/miniconda3/envs/resilientes/python.exe -m uvicorn main:app --reload --port 8000
```
- `--reload` = auto-restart on code change. **NOTE:** every reload wipes ALL in-memory
  router caches (§4) — a code edit is effectively a restart for cache purposes.
- CORS origins come from `ALLOWED_ORIGINS` env (default `http://localhost:5173`).
- First request to a data endpoint BUILDS its cache (can take minutes; see §4/§5).

### Frontend — Vite dev server on port 5173
```bash
cd frontend && npm run dev
```
Opens `http://localhost:5173`. Scripts in `frontend/package.json`: `dev` (=`vite`),
`build` (=`vite build`), `lint` (=`eslint .`), `preview` (=`vite preview`).

### Preview servers (`.claude/launch.json`)
Two named configurations for the harness's preview tooling:
- **`Frontend (Vite)`** — `npm run dev`, cwd `frontend`, port 5173, `autoPort: true`.
- **`Backend (FastAPI)`** — `uvicorn main:app --reload --port 8000`, cwd `backend`, port 8000.

Start them by name via the preview `start` tool rather than hand-rolling the command
when you just need the app live.

---

## 2. Endpoint catalog

All endpoints are `GET`, live under `/api/*`, and return GeoJSON or JSON in **EPSG:4326**
— never a raw GeoDataFrame. Registered in `backend/main.py` lines 32–39.

| Method + path | Query params | Returns | Cache | `?refresh=true` |
|---|---|---|---|---|
| `GET /api/trees` | `refresh` | GeoJSON FeatureCollection, 44 647 trees | `data/trees.parquet` + in-memory `_cache` | re-reads bulk export → parquet, resets `_cache` |
| `GET /api/lst` | `refresh` | GeoJSON FC, ~14 500 LST pixels (`lst_celsius`, `lst_norm`, `bestand_pct`, `seal_pct`, `dominant_type_key`, `plantable_m2`, `ndvi`, `ndbi`) | `data/lst.parquet` + in-memory `_cache` | recomputes parquet, resets `_cache` |
| `GET /api/zensus` | `refresh` | GeoJSON FC, ~3 089 census cells (`gitter_id`, `anteil_65plus`, `anteil_65plus_clamped`, `Einwohner`) intersecting LST | `data/zensus.parquet` + in-memory `_cache` | reloads zensus parquet + resets `_cache`. **LST is loaded with `force_refresh=False`** even when you pass `refresh=true` (line 40) |
| `GET /api/vulnerability` | `refresh` | GeoJSON FC, HVI per cell (`hvi`, `anteil_65plus`, `anteil_65plus_adj`, `lst_celsius`, `lst_norm`, `Einwohner`) + `meta{weights, n_prior, global_65_rate}` | **in-memory `_cache` only** (no parquet) | reloads zensus+lst (`force_refresh=refresh`), recomputes HVI, resets `_cache` |
| `GET /api/entsiegelung` | `refresh` | GeoJSON FC, ATKIS+OSM polygons (`source`, `type_key`, `label`, `area_m2`) + `meta{atkis_count, osm_count, total_count}` | `data/entsiegelung.parquet` + in-memory `_cache` | recomputes parquet, resets `_cache` |
| `GET /api/stadtbezirke` | `refresh` | GeoJSON FC, 13 districts w/ aggregates (`name`, `nummer`, `lst_max/median/mean`, `hvi_max`, `hvi_mean`, `einwohner` (lowercase!), `entsiegelung_m2`, `tree_count`) + `meta` | `data/stadtbezirke.parquet` (polygons) + in-memory `_cache` (aggregates) | force-refreshes **only** the district polygons (`load_stadtbezirke`); lst/zensus/ents/trees are loaded **without** force_refresh (lines 50–53). Resets `_cache` |
| `GET /api/hotspots` | `refresh` | GeoJSON FC, top-5 heat centers (`rank`, `lst_celsius`, `lst_celsius_smooth`, `lon`, `lat`) + `meta{count}` | **in-memory `_cache` only** | reloads lst (`force_refresh=refresh`), recomputes, resets `_cache`. `load_stadtbezirke` is NOT force-refreshed |
| `GET /api/simulate/baeume` | `n_trees` (int ≥1, required), `area_m2` (float >0, required), `existing_coverage_pct` (float 0–100, default 0) | JSON: `delta_lst_celsius`, `co2_kg_year`, `total_coverage_pct`, `effective_new_pct`, `new_crown_area_ratio`, `coefficients_used`, `caveats` | none (pure compute) | n/a |
| `GET /api/simulate/wasser` | `area_m2` (float >0, required), `from_surface` (default `asphalt`), `to_surface` (default `schotterrasen`) | JSON: `infiltration_m3_year`, `retention_pct`, `context_persons`, `runoff_coefficients`, `rainfall_m_year`, `caveats` | none (pure compute) | n/a |

**Root / liveness:** `GET /` → `{"status":"ok","project":"Resilientes Würzburg"}`.
There is **no `/health` route** — root `/` is the probe (§6).

### Valid `to_surface` / `from_surface` keys (9, `RUNOFF_COEFFICIENTS`)
`asphalt`, `pflaster_dicht`, `pflaster_offen`, `lehm_kies`, `sickerpflaster`,
`schotterrasen`, `rasengitter`, `rasenwabe`, `rasendecke`.
Anything else → **HTTP 422** with `{"detail":[...]}`. Both params are validated
independently (either or both can 422).

### Example curl commands
```bash
# liveness
curl http://localhost:8000/

# layers (first call builds the cache — may take minutes)
curl "http://localhost:8000/api/trees"
curl "http://localhost:8000/api/lst"
curl "http://localhost:8000/api/zensus"
curl "http://localhost:8000/api/vulnerability"
curl "http://localhost:8000/api/entsiegelung"
curl "http://localhost:8000/api/stadtbezirke"
curl "http://localhost:8000/api/hotspots"

# force a fresh recompute of one layer
curl "http://localhost:8000/api/lst?refresh=true"

# tree-planting simulation: 40 trees on a 10 000 m² cell, 12% existing canopy
curl "http://localhost:8000/api/simulate/baeume?n_trees=40&area_m2=10000&existing_coverage_pct=12"

# unsealing simulation: 2000 m² asphalt → schotterrasen
curl "http://localhost:8000/api/simulate/wasser?area_m2=2000&from_surface=asphalt&to_surface=schotterrasen"

# 422 demo — bogus surface key
curl -i "http://localhost:8000/api/simulate/wasser?area_m2=2000&from_surface=beton&to_surface=rasendecke"
```

---

## 3. `?refresh=true` — what it actually does

`refresh=true` is a per-endpoint flag. It does **not** cascade across endpoints — each
router only refreshes the loaders it explicitly force-refreshes. Consequences that bite:

- `/api/zensus?refresh=true` reloads the **zensus** cache but re-uses the **cached LST**
  (line 40 loads LST with `force_refresh=False`). To refresh both, hit `/api/lst?refresh=true`
  first.
- `/api/stadtbezirke?refresh=true` re-pulls only the **district polygons** from
  opendata.wuerzburg.de and rebuilds the aggregate `_cache`; it reads lst/zensus/ents/trees
  from their existing caches. If those upstream layers are stale, refresh them first.
- `/api/hotspots?refresh=true` force-refreshes **LST** but not the district mask.
- `/api/vulnerability?refresh=true` force-refreshes both zensus and lst, then recomputes HVI.
- Simulation endpoints have no cache and ignore `refresh` entirely.

**Cache-Control header:** `trees`, `lst`, `vulnerability`, `entsiegelung`, `stadtbezirke`
set `Cache-Control: no-cache` when `refresh=true`, else `public, max-age=3600`.
`zensus` and `hotspots` do **not** set any Cache-Control header (their handlers take no
`Response` param).

---

## 4. Refresh & cache semantics

Two distinct cache tiers. Know which one you are fighting.

**Parquet caches** — `backend/data/`, survive restarts, cleared by `?refresh=true` or by
deleting the file:
`trees.parquet`, `zensus.parquet`, `lst.parquet`, `entsiegelung.parquet`,
`stadtbezirke.parquet`.

**In-memory router `_cache`** — a module global, wiped **only on backend restart** (and
`--reload` code edits) or a `?refresh=true` request:
- `/api/lst`, `/api/trees`, `/api/zensus`, `/api/entsiegelung`, `/api/stadtbezirke` — have
  BOTH tiers (parquet + in-memory).
- `/api/vulnerability` and `/api/hotspots` — **in-memory only**, no parquet. A plain
  restart alone forces them to recompute from their upstream (parquet-backed) inputs.

So: deleting a parquet file does nothing until the process next reads it (or you pass
`refresh=true`); restarting the process clears in-memory but leaves parquet intact.

---

## 5. THE DATA-SWAP DANCE (critical runbook)

**When you replace `backend/data/lst_wue_2023_2025_summer_median.tif`** (or any file that
feeds LST), the derived caches do NOT self-invalidate. `load_lst()` only lazy-adds
*missing* columns and only recomputes `bestand_pct`/`seal_pct` when the stored model
version is below the module constant — a changed GeoTIFF under the same schema is NOT
detected. Do all of this, in order:

1. **Delete `backend/data/lst.parquet`** (or plan to pass `?refresh=true` in step 3).
2. **Restart the backend** — this clears the in-memory caches of `/lst`, `/vulnerability`,
   `/zensus`, `/stadtbezirke`, `/hotspots`. Deleting the parquet alone does not.
3. **Re-hit these endpoints with `?refresh=true`**, LST first (others read from it):
   ```bash
   curl "http://localhost:8000/api/lst?refresh=true"
   curl "http://localhost:8000/api/vulnerability?refresh=true"
   curl "http://localhost:8000/api/zensus?refresh=true"
   curl "http://localhost:8000/api/stadtbezirke?refresh=true"
   curl "http://localhost:8000/api/hotspots?refresh=true"
   ```
   (`/zensus?refresh=true` reloads zensus but not LST — that's why LST goes first. Order matters.)

**When you edit `_compute_bestand_pct` or `_compute_seal_pct`** (`utils/data_loader.py`):
the same trap applies with an extra wrinkle. Changing a formula's CONTENT without bumping
`_BESTAND_MODEL_VERSION` / `_SEAL_MODEL_VERSION` leaves the stale column in place. So
either **bump the version constant** OR **delete `backend/data/lst.parquet`** OR pass
`?refresh=true`, then run steps 2–3 above.

Do NOT re-add a cos(lat) correction to LST — it was tried and deliberately removed once
the GeoTIFF was re-exported native EPSG:3035 (see `rw-architecture`).

---

## 6. Health check

```bash
curl http://localhost:8000/
# → {"status":"ok","project":"Resilientes Würzburg"}
```
`status: ok` means the process is up and routers registered. **There is no `/health`
route** — any allow-rule or doc that references `/health` is wrong; use `/`.

---

## 7. Where output lands

- **Derived caches** → `backend/data/*.parquet` (trees, zensus, lst, entsiegelung,
  stadtbezirke). Gitignored (`*.parquet`). Required SOURCE data files must already be
  present in `backend/data/` — see `rw-build-and-env`.
- **API responses** → GeoJSON / JSON, always reprojected to **EPSG:4326**.
- **Frontend production build** → `frontend/dist/` via `cd frontend && npm run build`.

**Do NOT deploy.** Deployment (Render backend, Vercel frontend, `render.yaml`, prod env
vars) is OFF-LIMITS without explicit owner sign-off — route through **rw-change-control**.
`npm run build` locally is fine; pushing/deploying is not.

---

## 8. When NOT to use this / use instead

| Situation | Use instead |
|---|---|
| First-time setup: conda env, `npm install`, submodule init, required data files | **rw-build-and-env** |
| It's broken — 404/500/422, empty map, hanging request, import error | **rw-debugging-playbook** |
| Want to inspect what's *inside* a parquet cache or a GeoTIFF band | **rw-diagnostics-and-tooling** |
| Architecture, the grid invariant, CRS conventions, single-source-of-truth files | **rw-architecture** |
| Changing coefficients, promoting a model, anything touching deploy/wiki | **rw-change-control** |

---

## 9. Provenance and maintenance

Re-verify these volatile facts if the app misbehaves (verified **2026-07-08**):

```bash
# confirm the 8 registered routers + their prefixes
grep -n "include_router" backend/main.py

# confirm the root/liveness handler (should be {"status":"ok",...}, no /health)
grep -n '@app.get' backend/main.py

# confirm ports & preview server names
cat .claude/launch.json

# confirm frontend scripts (dev/build/lint/preview)
grep -n -A6 '"scripts"' frontend/package.json

# confirm valid surface keys for /simulate/wasser
grep -n "RUNOFF_COEFFICIENTS" backend/simulation_params.py

# confirm which routers set Cache-Control (Response param present)
grep -rn "Cache-Control" backend/routers/
```

Drift found on 2026-07-08 (do not propagate the stale side):
- The GROUND_TRUTH brief said *"Cache-Control headers set by /lst."* — actually **five**
  routers set it (trees, lst, vulnerability, entsiegelung, stadtbezirke); `zensus` and
  `hotspots` set none. Documented correctly in §3 above.
- `/api/stadtbezirke` returns **lowercase `einwohner`**, while `/api/zensus` and
  `/api/vulnerability` return **capital `Einwohner`** — different contract per endpoint,
  don't normalize them (see `rw-architecture` / HVI).
- CLAUDE.md tech table says React 18 / Router v6; `package.json` pins **React 19.2.5,
  react-router-dom 7.14.2, Vite 8** — package.json is truth.
