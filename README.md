# Resilientes Würzburg

Interaktive Geodaten-Webanwendung zur Analyse urbaner Hitzeinseln, sozialer Vulnerabilität und Entsiegelungspotenzial in Würzburg — mit Was-wäre-wenn-Simulationen für Baumpflanzung und Flächenentsiegelung.

**Frontend:** [Vercel](https://vercel.com) · **Backend:** [Render.com](https://render.com) · **Daten:** Google Earth Engine, Destatis Zensus 2022, ATKIS Basis-DLM Bayern, opendata.wuerzburg.de

---

## Features

| Tab | Funktion |
|---|---|
| **Dashboard** | KPI-Strip (heißeste Zone, vulnerabelster Bezirk, Baumanzahl, Entsiegelungspotenzial) + Top-3-Listen je Dimension auf Stadtbezirksebene |
| **Hitzeatlas** | LST-Choropleth (Landsat 8+9, Sommer-Median 2023–2025, 100 m) + Baumkataster-Overlay (44.647 Bäume, Klick-Popup) + Stadtbezirks-Choropleth + NDVI-Layer + Top-5-Hitzespots-Card |
| **Vulnerabilität** | Heat Vulnerability Index (HVI 1–10): gewichteter Score aus LST (60 %) + Seniorenanteil 65+ (40 %, Bayesian Shrinkage) + Demografie-Layer + Stadtbezirks-Choropleth |
| **Entsiegelung** | ATKIS + OSM-Flächen nach Nutzungsklasse eingefärbt (reine Visualisierung, kein Score) + NDBI-Layer |
| **Simulation** | Baumpflanzung → Δ°C LST + CO₂/Jahr + Kronendeckung (Überlappungsmodell); Entsiegelung → m³ Versickerung/Jahr + Grundwasserschätzwert |

---

## Tech Stack

**Frontend**
- React 18 + Vite · Plain JSX · Tailwind CSS v4 (Tokens im `@theme`-Block, kein `tailwind.config.js`)
- deck.gl (`MapboxOverlay + useControl`) + MapLibre GL + react-map-gl · Basemap: CartoCDN dark-matter (kein Token)
- Zustand (State Management) · React Router v6 (Lazy-Routes)

**Backend**
- FastAPI + uvicorn · GeoPandas + Shapely · Rasterio + rasterstats
- osmnx (OSM-Abfragen) · earthengine-api (nur für Offline-Datenexport) · PyArrow (GeoParquet) · SciPy

---

## Lokale Entwicklung

### Voraussetzungen

- Node.js ≥ 18
- Python 3.11 (Production pinnt 3.11.0, siehe `render.yaml`)
- Manuelle Daten (nicht im Repo — siehe unten)

### Repo klonen (inkl. Wiki-Submodul)

```bash
git clone --recurse-submodules <repo-url>
# oder bei bereits geklontem Repo:
git submodule update --init --recursive
```

Das Verzeichnis `urban-heat-wiki/` ist ein Git-Submodul mit der wissenschaftlichen Quellenbasis und ist ohne diesen Schritt leer.

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
# Komma-separierte Liste erlaubter CORS-Origins (Default: http://localhost:5173)
ALLOWED_ORIGINS=http://localhost:5173
```

`frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000
```

> Hinweis: Das Backend fragt Google Earth Engine **nicht zur Laufzeit** ab, sondern liest die
> LST-GeoTIFFs als lokale Dateien (siehe „Manuelle Daten" unten) — ein GEE-Zugang ist zum
> **Betrieb** der App also nicht nötig. Die GeoTIFFs selbst wurden einmalig per GEE exportiert
> und liegen **nicht** im Repo; `earthengine-api` brauchst du nur, wenn du diese Daten selbst
> (neu) exportieren willst.

---

## Manuelle Daten (nicht im Git)

Diese Dateien müssen manuell in `backend/data/` abgelegt werden:

| Datei | Quelle | Hinweis |
|---|---|---|
| `lst_wue_2023_2025_summer_median.tif` | Google Earth Engine Export | EPSG:3035, 100 m, Band 1 = LST °C, Band 2 = NDVI, Band 3 = NDBI |
| `baumkataster_stadt_wuerzburg.parquet` | [opendata.wuerzburg.de](https://opendata.wuerzburg.de/api/explore/v2.1/catalog/datasets/baumkataster_stadt_wuerzburg) | GeoParquet Bulk-Export (44.647 Records) |
| `bkg_shape_712.zip` | [geodaten.bayern.de](https://geodaten.bayern.de/opengeodata/) | ATKIS Basis-DLM Bayern (EPSG:25832), enthält `sie02_f.shp` + `ver01_f.shp` |
| `Zensus_*.csv` (Alter + Bevölkerung) | [destatis.de](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/) | 100m-Gitter, Semikolon-getrennt, EPSG:3035 |

Abgeleitete Caches (`*.parquet`) werden beim ersten API-Aufruf automatisch gebaut. Nach einem
LST-Tausch: `backend/data/lst.parquet` löschen und `/api/lst`, `/api/vulnerability`,
`/api/zensus`, `/api/stadtbezirke` mit `?refresh=true` aufrufen.

---

## Ordnerstruktur

```
resilientes-wuerzburg/
├── backend/
│   ├── main.py                  ← FastAPI App, CORS, Router-Registrierung
│   ├── simulation_params.py     ← Alle Koeffizienten mit Quellenverweis
│   ├── requirements.txt
│   ├── routers/                 ← trees, lst, zensus, vulnerability, entsiegelung,
│   │                               stadtbezirke, simulate, hotspots
│   ├── utils/
│   │   ├── data_loader.py       ← load_lst/zensus/trees/entsiegelung/stadtbezirke
│   │   ├── analysis.py          ← build_hvi_geodataframe() — einzige HVI-Berechnung
│   │   └── vuln_formula.py      ← WEIGHTS, Bayesian Shrinkage, compute_hvi()
│   ├── tests/                   ← pytest (test_simulate, test_trees, test_vuln_formula)
│   └── data/                    ← lokale Daten + Caches (gitignored)
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── map/             ← MapSurface, Overlays (Heat/Tree/Vuln/Entsiegelung/…), Legenden
│       │   └── simulation/      ← BaumSimPanel, WasserSimPanel, SimResultCard
│       ├── pages/               ← Dashboard, Hitzeatlas, Vulnerabilitaet,
│       │                           Entsiegelung, Simulation
│       ├── store/               ← useAppStore.js (Zustand)
│       ├── api/                 ← fetch-Wrapper je Endpoint
│       └── utils/               ← format.js, colors.js, simulate.js, sources.js
├── docs/
│   ├── Design System.html               ← UI-Referenz
│   ├── Tool-Logik-und-Quellen.html/.md  ← Wissenschaftliche Dokumentation
│   ├── SIMULATION-PLAN.md · tree-sim-upgrade.md · code-review-skill.md
├── urban-heat-wiki/             ← Git-Submodul: Koeffizienten & Quellen
├── render.yaml                  ← Render.com Deploy-Konfiguration (Backend)
└── CLAUDE.md                    ← Vollständige Projektdokumentation für AI-Assistenten
```

---

## Backend-Endpoints

Alle unter Prefix `/api`. Endpoints mit Cache unterstützen `?refresh=true` zum Invalidieren.

| Endpoint | Beschreibung |
|---|---|
| `GET /` | Health-Check (`{"status": "ok"}`) |
| `GET /api/lst` | LST-Raster als GeoJSON (~14.500 Features: `lst_celsius`, `lst_norm`, `bestand_pct`, `seal_pct`, `dominant_type_key`, `plantable_m2`, `ndvi`, `ndbi`) |
| `GET /api/trees` | Baumkataster als GeoJSON (44.647 Punkte) |
| `GET /api/zensus` | Zensus-100m-Gitter als GeoJSON (~3.089 Features: `anteil_65plus`, `Einwohner`) |
| `GET /api/vulnerability` | HVI-Score als GeoJSON (`hvi` 1–10, Bayesian-adjustiert) |
| `GET /api/entsiegelung` | ATKIS + OSM-Polygone nach `type_key` (`source`, `label`, `area_m2`) |
| `GET /api/stadtbezirke` | 13 Stadtbezirke mit aggregierten Kennzahlen (LST/HVI/Entsiegelung/Bäume) |
| `GET /api/hotspots` | Top-5 Hitzespots (Focal-Mean-Glättung 200 m + Non-Maximum-Suppression 600 m, nur Innenstadtbezirke) |
| `GET /api/simulate/baeume` | Neupflanzungen → `delta_lst_celsius`, `co2_kg_year`, `effective_new_pct`, `total_coverage_pct` |
| `GET /api/simulate/wasser` | Entsiegelung → `infiltration_m3_year`, `retention_pct`, `context_persons` |

---

## Simulationsformeln

**Baumpflanzung** — projizierte Kronendeckung nach dem Überlappungsmodell (Crookston & Stage 1999),
Δ°C wirkt nur auf den realen Zuwachs (García de León et al. 2025, München; Daten Sommer 2020):

```
new_ratio       = (n_trees × 50 m²) / area_m2
existing_ratio  = −ln(1 − existing_coverage_pct / 100)
total_coverage  = (1 − exp(−(existing_ratio + new_ratio))) × 100
effective_new   = total_coverage − existing_coverage_pct          [≥ 0]

Δ LST = −0,083 °C × effective_new        (Mischgebiet-Koeffizient)
CO₂   = n_trees × 12,5 kg/Jahr
```

Das Slider-Maximum im Frontend ist ein pflanzpraktischer Cap (`pflanzbare Fläche / 100 m²/Baum`,
FLL-Richtlinie, Bäume 2. Ordnung) — kein Modell-Cap.

**Entsiegelung** — vereinfachte Rational-Formel (DWA-A138 / LfU Bayern):

```
Versickerung [m³/Jahr] = A [m²] × 0,5735 [m/Jahr] × (Ψ_von − Ψ_zu)
```

Jahresniederschlag: DWD Station 05705 Würzburg, Klimanormalperiode 1991–2020.
Die Wasser-Simulation liefert in v1 bewusst **kein** Δ°C (der Tervooren-Entsiegelungskoeffizient
−0,03 °C/% ist auf Stadtbezirks-, nicht auf Einzelflächenebene kalibriert).

**HVI** — Vulnerabilitäts-Score:

```
HVI = (0,6 × lst_norm + 0,4 × anteil_65plus_adj) × 9 + 1        → Skala 1–10
```

`anteil_65plus_adj` ist Bayesian-Shrinkage-korrigiert (Empirical Bayes, N_PRIOR = 50).

---

## Tests

```bash
cd backend
python -m pytest -v        # benötigt den vollen Geo-Stack aus requirements.txt
```

Abgedeckt: beide Simulationsendpoints (Rechenkontrollen, Überlappungsmodell, Validierung 422),
Baumkataster-Loader und die HVI-/Shrinkage-Formel.

---

## Wissenschaftliche Dokumentation

Alle Formeln, Koeffizienten und Datenquellen sind vollständig dokumentiert:

- [`docs/Tool-Logik-und-Quellen.html`](docs/Tool-Logik-und-Quellen.html) — Im Browser öffnen (Tab-für-Tab-Beschreibung)
- [`docs/Tool-Logik-und-Quellen.md`](docs/Tool-Logik-und-Quellen.md) — Markdown-Version
- [`urban-heat-wiki/wiki/simulation-logic.md`](urban-heat-wiki/wiki/simulation-logic.md) — Autoritative Berechnungslogik beider Simulationen
- `backend/simulation_params.py` — Alle Koeffizienten mit Quellverweis (Single Source of Truth)

---

## Deployment

| Service | Konfiguration |
|---|---|
| **Frontend** | Vercel · `frontend/` als Root · `VITE_API_URL` als Environment Variable |
| **Backend** | Render.com Free Tier · `render.yaml` (rootDir `backend`, `uvicorn main:app --host 0.0.0.0 --port $PORT`, `ALLOWED_ORIGINS` + `PYTHON_VERSION=3.11.0`) |

Beide Services sind via GitHub CI/CD verbunden (push to `main` → automatisches Deploy).
