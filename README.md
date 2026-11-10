# Resilientes Würzburg

Interactive web app for exploring urban heat, heat vulnerability and unsealing potential in Würzburg (Germany), with what-if simulations for tree planting and surface unsealing.

**Live app:** [resilientes-wuerzburg.vercel.app](https://resilientes-wuerzburg.vercel.app) · **Documentation:** [in the app](https://resilientes-wuerzburg.vercel.app/dokumentation) · [English](docs/Dokumentation.en.md) · [Deutsch](docs/Dokumentation.md)

> The backend runs on a free hosting tier and sleeps when idle, so the first load can take 1–2 minutes.

## Features

| Page | What it shows |
|---|---|
| Dashboard | Key figures and top lists per city district |
| Heat atlas | Land surface temperature (Landsat 8/9, summer median 2023–2025, 100 m grid), tree cadastre, NDVI, top-5 heat spots |
| Vulnerability | Heat Vulnerability Index (1–10) from surface temperature and the share of residents aged 65+ (Census 2022) |
| Unsealing | Sealed surfaces by land-use type (ATKIS Basis-DLM, OpenStreetMap) |
| Simulation | Tree planting → change in surface temperature, CO₂ uptake, canopy cover · Unsealing → rainwater retained on site per year |

The app is available in German and English.

## Method in brief

- **Tree planting:** projected canopy cover from the negative-exponential overlap model (Crookston & Stage 1999), multiplied by −0.083 °C per percentage point of canopy cover (García de León et al. 2025, Munich).
- **Unsealing:** avoided surface runoff = area × annual rainfall (573.5 mm, DWD station Würzburg) × (Ψ<sub>before</sub> − Ψ<sub>after</sub>), with runoff coefficients Ψ after DWA-A 138.
- **Vulnerability:** HVI = (0.6 · LST rank + 0.4 · share 65+) × 9 + 1; the senior share is adjusted for small cells with empirical-Bayes shrinkage.

Results are first-order estimates based on literature coefficients, not local measurements. Land surface temperature is not air temperature. All formulas, coefficients, sources and limitations are in the [documentation](docs/Dokumentation.en.md); the coefficients themselves live in [`backend/simulation_params.py`](backend/simulation_params.py).

## Run locally

Requirements: Python 3.11 and Node.js 20.19+ (or 22.12+).

```bash
git clone https://github.com/therealtaco-hub/resilientes_wuerzburg.git
cd resilientes_wuerzburg
```

Backend (http://localhost:8000):

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend (http://localhost:5173):

```bash
cd frontend
npm install
npm run dev
```

The data the app needs is included in `backend/data/`; no API keys are required. Both `.env` files are optional and default to localhost (see `backend/.env.example` and `frontend/.env.example`).

## Data

`backend/data/` holds the source files and pre-built caches the app reads at runtime: the Landsat LST GeoTIFF (exported from Google Earth Engine with [`scripts/gee_export_lst.py`](scripts/gee_export_lst.py), snapped to the census 100 m grid), the Würzburg tree cadastre, the census grid, city districts and the ATKIS/OSM surface polygons.

Cached endpoints accept `?refresh=true`. Rebuilding the census and surface caches needs raw downloads that are too large for the repository: the Zensus 2022 100 m CSV files (Destatis) and the ATKIS Basis-DLM for Bavaria (`bkg_shape_712.zip`).

Sources, licences and required attributions: [`backend/data/LICENSES.md`](backend/data/LICENSES.md).

## Adapting to another city

The pipeline works for other German cities. Census grid and ATKIS are German datasets; outside Germany they need equivalents.

**Replace in `backend/data/`** (keep the file names or adjust the paths at the top of `backend/utils/data_loader.py`):

| File | Replace with |
|---|---|
| `lst_wue_2023_2025_summer_median.tif` | Re-run [`scripts/gee_export_lst.py`](scripts/gee_export_lst.py) with the new city's bounding box (band 1 = LST in °C, band 2 = NDVI, band 3 = NDBI; EPSG:3035, 100 m, aligned with the census grid) |
| `baumkataster_stadt_wuerzburg.parquet` | The city's tree cadastre as GeoParquet with the same column names (at least `kronenbrei` = crown diameter in m) |
| Zensus 2022 CSVs (not in repo) | Same nationwide Destatis files, only the bounding box changes |
| `bkg_shape_712.zip` (not in repo) | ATKIS Basis-DLM of the respective federal state (availability and licence vary by state) |

Then delete the derived caches (`lst.parquet`, `trees.parquet`, `zensus.parquet`, `entsiegelung.parquet`, `stadtbezirke.parquet`) so they are rebuilt.

**Adjust in code:**

- `backend/utils/data_loader.py`: bounding boxes (`_WUE_X_MIN` … `_WUE_Y_MAX`, `_WUE_ATKIS_BBOX`, the `.cx[...]` filter), the OSM place name `"Würzburg, Germany"`, and the district source `_STADTBEZIRKE_URL` with its field mapping in `load_stadtbezirke()`
- `backend/simulation_params.py`: rainfall of the nearest DWD station (`ANNUAL_RAINFALL_WUERZBURG_M`, `MONTHLY_RAINFALL_WUERZBURG_MM`)
- `frontend/src/utils/simulate.js`: groundwater recharge reference `GW_RECHARGE_LK_WUERZBURG_MM_YEAR`
- `frontend/src/components/map/MapSurface.jsx` (map centre) and `frontend/src/i18n/locales/*.json` (city name, rainfall and groundwater figures in the texts)

The tree coefficient comes from Munich and the sealing rates are own assumptions; check their transferability for the new city (see documentation).

## Tests

```bash
cd backend
python -m pytest
```

```bash
cd frontend
node scripts/test-sim-store.mjs
```

## Project structure

```
backend/           FastAPI API: routers/, utils/ (data loading, HVI), simulation_params.py, tests/, data/
frontend/          React + Vite app: pages/, components/, store/ (Zustand), i18n/ (DE/EN)
docs/              Documentation shown in the app (DE/EN), design system
urban-heat-wiki/   Git submodule with literature notes (not needed to run the app)
```

**Stack:** React 19, Vite, MapLibre GL, deck.gl, Tailwind CSS, Zustand, i18next · FastAPI, GeoPandas, Rasterio, SciPy, osmnx · Hosting: Vercel (frontend), Render (backend, [`render.yaml`](render.yaml)).

## License

Code: [MIT](LICENSE). Data: licences of the respective providers (Destatis, City of Würzburg, Bavarian Surveying Administration, © OpenStreetMap contributors, DWD, USGS), see [`backend/data/LICENSES.md`](backend/data/LICENSES.md).
