# Resilientes Würzburg

Interaktive Geodaten-Webanwendung zur Analyse urbaner Hitzeinseln, sozialer Vulnerabilität und Entsiegelungspotenzial in Würzburg — mit Was-wäre-wenn-Simulationen für Baumpflanzung und Flächenentsiegelung.

**Frontend:** [Vercel](https://vercel.com) · **Backend:** [Render.com](https://render.com) · **Daten:** Google Earth Engine, Destatis Zensus 2022, ATKIS Basis-DLM Bayern

---

## Features

| Tab | Funktion |
|---|---|
| **Dashboard** | KPI-Strip (heißeste Zone, vulnerabelster Bezirk, Baumanzahl, Entsiegelungspotenzial) + Top-3-Listen je Dimension auf Stadtbezirksebene |
| **Hitzeatlas** | LST-Choropleth (Landsat 8+9, Sommer-Median 2023–2025, 100 m) + Baumkataster-Overlay (44.647 Bäume) + Stadtbezirks-Choropleth + Klick-Popup pro Baum |
| **Vulnerabilität** | Heat Vulnerability Index (HVI 1–10): gewichteter Score aus LST (60 %) + Seniorenanteil 65+ (40 %, Bayesian Shrinkage) + Demografie-Layer |
| **Entsiegelung** | ATKIS + OSM-Flächen nach Nutzungsklasse eingefärbt (kein Score, reine Visualisierung) |
| **Simulation** | Baumpflanzung → Δ°C LST + CO₂/Jahr + Kronendeckung; Entsiegelung → m³ Versickerung/Jahr + Grundwasserschätzwert |

---

## Tech Stack

**Frontend**
- React 18 + Vite · Plain JSX · Tailwind CSS v4
- deck.gl (`MapboxOverlay + useControl`) + MapLibre GL + react-map-gl
- Zustand (State Management) · React Router v6

**Backend**
- FastAPI + uvicorn · GeoPandas + Shapely · Rasterio + rasterstats
- osmnx (OSM-Abfragen) · earthengine-api · PyArrow (GeoParquet)

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js ≥ 18
- Python ≥ 3.11
- Manuelle Daten (nicht im Repo — siehe unten)

### Backend starten

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend starten

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Environment Variables

`backend/.env`:
```
GEE_PROJECT_ID=dein-gee-projekt
```

`frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000
```

---

## Manuelle Daten (nicht im Git)

Diese Dateien müssen manuell in `backend/data/` abgelegt werden:

| Datei | Quelle | Hinweis |
|---|---|---|
| `lst_wue_2023_2025_summer_median.tif` | Google Earth Engine Export | EPSG:3035, 100 m, Band 1 = LST °C |
| `baumkataster_stadt_wuerzburg.parquet` | [opendata.wuerzburg.de](https://opendata.wuerzburg.de/api/explore/v2.1/catalog/datasets/baumkataster_stadt_wuerzburg) | GeoParquet Bulk-Export |
| `bkg_shape_712.zip` | [geodaten.bayern.de](https://geodaten.bayern.de/opengeodata/) | ATKIS Basis-DLM Bayern (EPSG:25832) |
| `Zensus_Bevoelkerung_*.csv` | [destatis.de](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/) | 100m-Gitter Alter + Bevölkerung |

Abgeleitete Caches (`*.parquet`) werden beim ersten API-Aufruf automatisch gebaut. Nach einem LST-Tausch: `backend/data/lst.parquet` löschen und alle Endpoints mit `?refresh=true` aufrufen.

---

## Ordnerstruktur

```
resilientes-wuerzburg/
├── backend/
│   ├── main.py                  ← FastAPI App, CORS, Router
│   ├── simulation_params.py     ← Alle Koeffizienten mit Quellen
│   ├── routers/                 ← trees, zensus, lst, vulnerability,
│   │                               entsiegelung, stadtbezirke, simulate
│   ├── utils/
│   │   ├── data_loader.py       ← load_lst/zensus/trees/entsiegelung/stadtbezirke
│   │   ├── analysis.py          ← build_hvi_geodataframe() — einzige HVI-Berechnung
│   │   └── vuln_formula.py      ← WEIGHTS, Bayesian Shrinkage, compute_hvi()
│   └── data/                    ← lokale Daten (gitignored)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── map/             ← MapSurface, Layer-Overlays, Legenden
│       │   └── simulation/      ← BaumSimPanel, WasserSimPanel, SimResultCard
│       ├── pages/               ← Dashboard, Hitzeatlas, Vulnerabilitaet,
│       │                           Entsiegelung, Simulation
│       ├── store/               ← useAppStore.js (Zustand)
│       ├── api/                 ← fetch-Wrapper je Endpoint
│       └── utils/               ← format.js, colors.js, simulate.js, sources.js
├── docs/
│   ├── Design-System.html              ← UI-Referenz
│   └── Tool-Logik-und-Quellen.html     ← Wissenschaftliche Dokumentation
├── urban-heat-wiki/             ← Git-Submodul: Koeffizienten & Quellen
└── CLAUDE.md                    ← Vollständige Projektdokumentation für AI-Assistenten
```

---

## Backend-Endpoints

| Endpoint | Beschreibung |
|---|---|
| `GET /api/lst` | LST-Raster als GeoJSON (~14.500 Features, `lst_celsius`, `lst_norm`) |
| `GET /api/trees` | Baumkataster als GeoJSON (44.647 Punkte) |
| `GET /api/zensus` | Zensus-100m-Gitter als GeoJSON (~3.089 Features, `anteil_65plus`, `Einwohner`) |
| `GET /api/vulnerability` | HVI-Score als GeoJSON (`hvi` 1–10, Bayesian-adjustiert) |
| `GET /api/entsiegelung` | ATKIS + OSM-Polygone nach `type_key` |
| `GET /api/stadtbezirke` | 13 Stadtbezirke mit aggregierten Kennzahlen |
| `GET /api/simulate/baeume` | Neupflanzungen → `delta_lst_celsius`, `co2_kg_year`, `delta_coverage_pct` |
| `GET /api/simulate/wasser` | Entsiegelung → `infiltration_m3_year`, `retention_pct` |

Alle Endpoints unterstützen `?refresh=true` zum Cache-Invalidieren.

---

## Simulationsformeln

**Baumpflanzung** (García de León et al. 2022, München):
```
Δ LST = −0,083 °C × Δ Kronendeckung [%]   (Mischgebiet)
CO₂   = n_trees × 12,5 kg/Jahr
```

**Entsiegelung** (Rational-Formel, DWA-A138):
```
Versickerung [m³/Jahr] = A [m²] × 0,5735 [m/Jahr] × (Ψ_von − Ψ_zu)
```
Jahresniederschlag: DWD Station 05705 Würzburg, Klimanormalperiode 1991–2020.

**HVI** (Vulnerabilitäts-Score):
```
HVI = (0,6 × lst_norm + 0,4 × anteil_65plus_adj) × 9 + 1   → Skala 1–10
```

---

## Wissenschaftliche Dokumentation

Alle Formeln, Koeffizienten und Datenquellen sind vollständig dokumentiert:

- [`docs/Tool-Logik-und-Quellen.html`](docs/Tool-Logik-und-Quellen.html) — Im Browser öffnen
- [`docs/Tool-Logik-und-Quellen.md`](docs/Tool-Logik-und-Quellen.md) — Markdown-Version
- [`urban-heat-wiki/wiki/simulation-logic.md`](urban-heat-wiki/wiki/simulation-logic.md) — Autoritative Berechnungslogik

---

## Deployment

| Service | Konfiguration |
|---|---|
| **Frontend** | Vercel · `frontend/` als Root · `VITE_API_URL` als Environment Variable |
| **Backend** | Render.com Free Tier · `uvicorn main:app --host 0.0.0.0 --port $PORT` |

Beide Services sind via GitHub CI/CD verbunden (push to `main` → automatisches Deploy).
