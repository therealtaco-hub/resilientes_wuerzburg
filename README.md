# Resilientes Würzburg

Interactive web app for urban heat islands, social vulnerability, and unsealing potential in Würzburg — with what-if simulations for tree planting and surface unsealing.

## Pages

| Route | Page | Status |
|---|---|---|
| `/` | Dashboard — KPI strip (4 tiles) + top-3 lists per KPI | ✅ |
| `/hitzeatlas` | LST choropleth + tree overlay + Stadtbezirke layer + NDVI layer | ✅ |
| `/vulnerabilitaet` | HVI choropleth (LST + senior share) + Demografie layer + NDBI layer | ✅ |
| `/entsiegelung` | ATKIS + OSM surfaces by category | ✅ |
| `/simulation` | Trees → Δ°C / CO₂ · Unsealing → m³ infiltration | ⏳ shell only |

## API Endpoints

| Endpoint | Description | Status |
|---|---|---|
| `GET /api/trees` | Tree cadastre as GeoJSON (44 647 trees) | ✅ |
| `GET /api/lst` | LST pixel grid as GeoJSON — `lst_celsius`, `lst_norm`, `ndvi`, `ndbi` | ✅ |
| `GET /api/zensus` | Zensus 100 m grid — `anteil_65plus`, `Einwohner` | ✅ |
| `GET /api/vulnerability` | HVI scores (Bayesian-shrinkage corrected) | ✅ |
| `GET /api/entsiegelung` | ATKIS + OSM unsealing surfaces | ✅ |
| `GET /api/stadtbezirke` | 13 districts with aggregated LST / HVI / unsealing / tree stats | ✅ |
| `GET /api/simulate/*` | Simulation endpoints | ⏳ |

All endpoints accept `?refresh=true` to bypass the Parquet cache.

## Stack

- **Backend** — FastAPI, GeoPandas, Rasterio, rasterstats, SciPy, osmnx, earthengine-api, PyArrow
- **Frontend** — React 18 + Vite, deck.gl + MapLibre GL + react-map-gl, Tailwind v4 + shadcn/ui, Zustand, React Router v6

## Setup

```bash
# Backend
cd backend
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload          # http://localhost:8000

# Frontend
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

Create `backend/.env` with `ALLOWED_ORIGINS=http://localhost:5173` and `frontend/.env` with `VITE_API_URL=http://localhost:8000`.

## Local Data (not in Git)

Place under `backend/data/` before first run:

| File | Description |
|---|---|
| `lst_wue_2023_2025_summer_median.tif` | 3-year summer median LST (Landsat 8+9, GEE export, EPSG:3035, 100 m). **Main dataset.** |
| `lst_wue_2023_summer_median.tif` | Single-year LST 2023 (same format, for trend analysis) |
| `lst_wue_2024_summer_median.tif` | Single-year LST 2024 |
| `lst_wue_2025_summer_median.tif` | Single-year LST 2025 |
| `baumkataster_stadt_wuerzburg.parquet` | Tree cadastre bulk export (44 647 records) |
| `bkg_shape_712.zip` | ATKIS Basis-DLM Bayern (includes `sie02_f.shp`, `ver01_f.shp`) |
| Zensus 2022 CSVs | Age groups + population, 100 m grid (Destatis, EPSG:3035) |

Generated `*.parquet` caches rebuild automatically on first request, or forcibly via `?refresh=true`.

> ⚠️ If `lst_wue_2023_2025_summer_median.tif` is replaced, delete `backend/data/lst.parquet` (or call `?refresh=true`) and restart the backend to clear in-memory caches for `/api/vulnerability`, `/api/zensus`, and `/api/stadtbezirke`.

## Deployment

| Service | Platform |
|---|---|
| Backend | Render.com (Free Tier) |
| Frontend | Vercel (Free Tier) |

Both services deploy automatically via GitHub CI/CD.

## Wiki

Simulation coefficients and their scientific derivation are documented in the wiki submodule:

```
urban-heat-wiki/wiki/
```

Key pages: `simulation-logic.md`, `kuehleffekte-vergleich.md`, `methodischer-plan-wuerzburg.md`.

## More

See [`CLAUDE.md`](CLAUDE.md) for full architecture, data quirks, component inventory, and open TODOs.
