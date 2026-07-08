---
name: rw-build-and-env
description: >
  Recreate the Resilientes-Würzburg dev environment from a fresh clone (LOCAL setup only).
  Load this when: setting up the repo on a new machine; a dependency/env error appears
  ("ModuleNotFoundError", "No module named fastapi/geopandas/rasterio", "module not found");
  the wrong Python is active or a Python-version mismatch (3.11 required, prod pins 3.11.0);
  the `urban-heat-wiki/` submodule is empty; endpoints 404 or a loader raises FileNotFoundError
  because a manual data file is missing (baumkataster/lst tif/bkg_shape/Zensus CSV/dwd zip);
  GDAL/GEOS/pyproj wheel install pain on Windows; a "requirements.txt encoding / BOM" deploy
  break; or you need the pytest env to reach the expected pass count. NOT for running the app
  day-to-day, deployment, runtime bugs, or test discipline — see the sibling skills below.
---

# rw-build-and-env — recreate the local dev environment

Runbook for standing up **Resilientes Würzburg** on a fresh clone. Scope is **LOCAL only** —
never touch `render.yaml`, Render/Vercel, or production env vars (owner rule; see
`rw-change-control`). Windows 11 + PowerShell is the primary environment; cross-platform notes
are called out where they differ.

Verified against the repo on **2026-07-08**.

---

## When NOT to use this / use instead
- **Running the app & calling endpoints day-to-day** → `rw-run-and-operate`.
- **A runtime bug / wrong numbers / a 500 while the app is up** → `rw-debugging-playbook`.
- **Test discipline, what to test, cache-invalidation before testing** → `rw-validation-and-qa`.
- **Anything deployment / `render.yaml` / prod env** → `rw-change-control`.

This skill gets you from `git clone` to "tests pass and both servers serve locally". Once
you're there, hand off to the siblings above.

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Git | any recent, with submodule support | wiki is a submodule; a plain `git clone` leaves it empty |
| Node.js | **≥ 18** | verified working on v24.15.0 (2026-07-08); `npm` ships with it |
| Python | **3.11** (prod pins **3.11.0** exactly) | `backend/.python-version` = `3.11.0`, `render.yaml` `PYTHON_VERSION=3.11.0` |

**Python environment (machine-specific vs. general):**
- On the owner's machine the interpreter is the conda env **`resilientes`** (Python 3.11.15) at
  `C:\Users\Marvi\miniconda3\envs\resilientes\python.exe`. That absolute path is **machine-specific** —
  it appears in commands below as `<conda-python>`. Do not assume it exists on a new machine.
- On a **fresh machine**, create your own isolated 3.11 environment. Either works:
  ```powershell
  # conda (matches the owner's setup; easiest for the geo stack — see §5)
  conda create -n resilientes python=3.11
  conda activate resilientes
  ```
  ```bash
  # or a plain venv (POSIX)
  python3.11 -m venv .venv && source .venv/bin/activate
  ```
  Everywhere below, `<conda-python>` means "the Python 3.11 interpreter of that env" — either the
  full path above, or just `python` once the env is activated.

---

## 2. Step-by-step setup

### 2.1 Clone WITH the wiki submodule
```bash
git clone --recurse-submodules <repo-url>
# already cloned without it? the wiki dir is empty — fix in place:
git submodule update --init --recursive
```
`urban-heat-wiki/` is a git submodule (`https://github.com/therealtaco-hub/urban-heat-wiki.git`,
see `.gitmodules`). It is the scientific source of record. **Never hand-edit wiki pages** — changes
go through the ingest workflow in `urban-heat-wiki/CLAUDE.md` (owner rule). If the folder is empty,
the submodule step above was skipped.

### 2.2 Backend dependencies
```powershell
cd backend
<conda-python> -m pip install -r requirements.txt
```
This pulls the heavy geo stack (see traps in §5). Expect a multi-minute first install.

### 2.3 Frontend dependencies
```bash
cd frontend
npm install
```

### 2.4 Environment files (never committed; `.env*` is gitignored)
Create `backend/.env`:
```
# Comma-separated list of allowed CORS origins. Default if unset: http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
```
Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000
```
Never hardcode secrets or paths; secrets go only through these files (`python-dotenv` on the
backend, `import.meta.env` on the frontend).

---

## 3. Required local data files (gitignored — supply manually)

These live in `backend/data/` and are **not in git**. The app does not fetch them at runtime;
loaders read them off disk. Obtain them from the owner or the original sources.

| File | Feeds | Missing → what breaks |
|---|---|---|
| `baumkataster_stadt_wuerzburg.parquet` | `load_tree_cadastre()` | `GET /api/trees` raises `FileNotFoundError` (500); Hitzeatlas tree overlay empty |
| `lst_wue_2023_2025_summer_median.tif` | `load_lst()` | `GET /api/lst` fails → cascades to `/vulnerability`, `/stadtbezirke`, `/hotspots`, `/simulate` inputs (LST is the backbone) |
| `bkg_shape_712.zip` (contains `sie02_f.shp` + `ver01_f.shp`) | `load_entsiegelung()` | `GET /api/entsiegelung` fails; `seal_pct`/`dominant_type_key` on `/api/lst` cannot compute |
| `Zensus2022_Alter_in_5_Altersklassen_100m-Gitter.csv` | `load_zensus()` | `GET /api/zensus` and `/api/vulnerability` (HVI needs the 65+ share) fail |
| `Zensus2022_Bevoelkerungszahl_100m-Gitter.csv` | `load_zensus()` | same as above (population column for `Einwohner` + shrinkage weighting) |
| `dwd_wuerzburg_monthly_kl_hist.zip` | rainfall reference (DWD station 05705) | monthly-rainfall context; keep present for completeness |

> Filenames are exact as they appear in `backend/data/` on 2026-07-08. The two Zensus CSVs are
> semicolon-separated Destatis exports — see `rw-debugging-playbook` for the parsing gotchas.

**Derived caches build themselves.** On first request each loader writes a `*.parquet` cache
(`trees.parquet`, `zensus.parquet`, `lst.parquet`, `entsiegelung.parquet`, `stadtbezirke.parquet`).
The **first run is slow** (minutes — it reads the TIF, does spatial overlays, etc.); later runs
read the cache. All `*.parquet` are gitignored. You do **not** supply these — only the source
files in the table above. (Cache-invalidation rules — when to delete `lst.parquet` or use
`?refresh=true` — live in `rw-run-and-operate` / `rw-validation-and-qa`; don't duplicate them here.)

---

## 4. Verify the environment works

### 4.1 Backend tests (the real proof the env is sound)
```powershell
cd backend
<conda-python> -m pytest tests/
```
- Expected: **129 passed** (~122 s on 2026-07-08). The **first** run builds the data caches and
  takes several minutes; subsequent runs are faster.
- `tests/conftest.py` puts `backend/` on `sys.path`, so `from main import app` and
  `from utils...` resolve — run pytest from `backend/`.
- Test files: `test_bestand_pct`, `test_data_loader`, `test_lst_router`, `test_seal_pct`,
  `test_simulate`, `test_trees`, `test_vuln_formula`, `test_zensus`.
- If tests error with `ModuleNotFoundError` for a geo package, §2.2 didn't complete or the wrong
  interpreter is active — re-run with the explicit `<conda-python>` path.

Frontend has **no vitest**. A hand-rolled smoke test exists:
```bash
cd frontend
node scripts/test-sim-store.mjs   # asserts Zustand sim-store actions
npm run lint                       # eslint
```

### 4.2 Servers serve locally
```bash
# backend
cd backend
uvicorn main:app --reload --port 8000
# or explicitly, without activating the env:
# C:\Users\Marvi\miniconda3\envs\resilientes\python.exe -m uvicorn main:app --port 8000

# frontend (separate terminal)
cd frontend
npm run dev        # → http://localhost:5173
```
Liveness check — note it is the **root path `/`**, there is **no `/health` endpoint**:
```bash
curl http://localhost:8000/      # → {"status":"ok", ...}
```
`.claude/launch.json` also defines these two as preview servers: "Frontend (Vite)" (port 5173) and
"Backend (FastAPI)" (port 8000).

---

## 5. Dependency notes / traps

- **The geo stack is heavy.** `geopandas>=1.0,<2`, plus `fiona`, `pyogrio`, `pyproj`, `rasterio==1.4.4`,
  `shapely>=2` all wrap native GDAL/GEOS/PROJ. On Windows these usually install fine from PyPI
  wheels via `pip`. **If a wheel fails to build or GDAL errors at import**, fall back to conda:
  ```powershell
  conda install -c conda-forge geopandas rasterio pyogrio
  ```
  conda-forge ships prebuilt GDAL binaries and sidesteps the toolchain pain. This is the single most
  common setup failure — reach for conda before fighting compilers.
- **`earthengine-api==1.7.25` is NOT needed to run the app.** GEE was used **offline, once**, to
  export the LST GeoTIFFs. The backend reads those TIFs as local files; it never calls GEE at
  runtime. You do not need GEE credentials to run or test anything. It's pinned only so re-exporting
  the raster stays reproducible.
- **`requirements.txt` must stay UTF-8 *without* BOM.** A BOM on line 1 broke the Linux/Render pip
  install once (fixed in commit `97c6ce7`). Verify before committing any edit to it:
  ```bash
  head -c 3 backend/requirements.txt | od -An -tx1   # must NOT be: ef bb bf
  ```
  On Windows, do not "Save As UTF-8 with BOM" from an editor; use the Write/Edit tools which keep it
  BOM-free. (Verified BOM-free 2026-07-08: first bytes `66 61 73` = "fas".)
- **Major-version bounds are intentional.** `numpy>=2.0,<3`, `pandas>=2.0,<4`, `scipy>=1.10,<2`,
  `geopandas>=1.0,<2`, `shapely>=2.0,<3`. Don't loosen upper bounds casually — numpy 2 / pandas 2
  are load-bearing and the geo stack is sensitive to ABI breaks.

---

## 6. Known doc drift to expect (don't propagate)
When you read the older docs during setup, these are **stale** — the repo is the truth:
- `README.md` and `CLAUDE.md` say **React 18 / React Router v6**. `frontend/package.json` actually
  pins **React 19.2.5 / react-router-dom 7.14.2 / Vite 8**. Trust `package.json`.
- `README.md`'s endpoint table calls `GET /` a "Health-Check". Correct — but there is **no separate
  `/health` route** despite tooling that references one. Root `/` is the probe.

(Broader doc-drift list — e.g. `MIN_GROUND_PER_TREE_M2` 25-vs-100 — lives in `rw-debugging-playbook`
/ the coefficient skill; not repeated here.)

---

## Provenance and maintenance
Facts here drift — re-verify with these one-liners and re-stamp the date:
- Python of the env: `C:\Users\Marvi\miniconda3\envs\resilientes\python.exe --version` (was 3.11.15).
- Prod pin: `cat backend/.python-version` + `render.yaml` `PYTHON_VERSION` (both `3.11.0`).
- Node: `node -v` (prereq ≥18; was v24.15.0).
- Deps: `cat backend/requirements.txt`; BOM check `head -c 3 backend/requirements.txt | od -An -tx1`.
- Frontend versions: `frontend/package.json` (React/Router/Vite).
- Test count: `cd backend && <conda-python> -m pytest tests/` (was **129 passed**, ~122 s).
- Required data files: `ls backend/data/` and cross-check §3 against the loaders in
  `backend/utils/data_loader.py`.
- Submodule URL/path: `cat .gitmodules`.

Verified 2026-07-08.
