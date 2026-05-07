# Resilientes Würzburg

Interactive web app for urban heat islands, social vulnerability, and unsealing potential in Würzburg — with what-if simulations for tree planting and surface unsealing.

## Pages

| Route | Page | Status |
|---|---|---|
| `/` | Dashboard (KPIs + top-3 lists) | ✅ |
| `/hitzeatlas` | LST choropleth + tree overlay | ✅ |
| `/vulnerabilitaet` | HVI (LST + senior share) | ✅ |
| `/entsiegelung` | ATKIS + OSM surfaces | ✅ |
| `/simulation/baeume` | Trees → Δ°C / CO₂ | ⏳ |
| `/simulation/wasser` | Unsealing → m³ infiltration | ⏳ |

## Stack

- **Backend** — FastAPI, GeoPandas, Rasterio, SciPy, osmnx, earthengine-api
- **Frontend** — React + Vite, deck.gl + MapLibre GL, Tailwind v4, Zustand

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

- `lst_wuerzburg.tif` — Landsat LST, exported from Google Earth Engine
- `baumkataster_stadt_wuerzburg.parquet` — tree cadastre bulk export
- `bkg_shape_712.zip` — ATKIS Basis-DLM Bayern
- Zensus 2022 CSVs (age + population, 100m grid)

Generated `*.parquet` caches rebuild on first request, or via `?refresh=true`.

## More

See [`CLAUDE.md`](CLAUDE.md) for full architecture, endpoints, and data quirks.
