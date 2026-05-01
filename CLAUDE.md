# Resilientes Würzburg – Projektzusammenfassung

**Ziel:** Interaktive Web-App zur Analyse von urbanen Hitzeinseln, sozialer Vulnerabilität und Entsiegelungspotenzial in Würzburg, mit Was-wäre-wenn-Simulationen für Baumneupflanzung und Flächenentsiegelung.

---

## Arbeitsweise
- Immer nur einen klar abgegrenzten Task pro Session umsetzen
- Keine Logik implementieren, die nicht explizit angefragt wurde
- Fachliche Formeln (LST-Skalierung, Vulnerabilitäts-Score, 
  Rational-Formel) werden vom Nutzer vorgegeben – niemals selbst erfinden
- Nach jedem Task kurz zusammenfassen, was erstellt wurde und was als 
  nächstes sinnvoll wäre

  ---

## Gesamtarchitektur

```
┌─────────────────────────────────┐     REST/JSON      ┌──────────────────────────────┐
│         FRONTEND                │◄──────────────────►│         BACKEND              │
│  React + Vite                   │                    │  FastAPI (Python)            │
│  deck.gl  → Karten              │                    │  GeoPandas, Rasterio         │
│  Recharts/Nivo → Charts         │                    │  rasterstats, SciPy          │
│  Tailwind CSS + shadcn/ui       │                    │  osmnx, earthengine-api      │
│  Zustand → State Management     │                    │                              │
└─────────────────────────────────┘                    └──────────────┬───────────────┘
                                                                       │
                                                         ┌─────────────▼──────────────┐
                                                         │         DATEN              │
                                                         │  GeoParquet, GeoTIFF, CSV  │
                                                         └────────────────────────────┘
```

**Deployment:** Backend → Render.com (Free Tier) | Frontend → Vercel (Free Tier) | beide via GitHub CI/CD

---

## Alle Datenquellen

### 🌡️ Hitze (LST)
| Datensatz | Quelle | Format | Zugang |
|---|---|---|---|
| Landsat 8/9 Surface Temperature Band `ST_B10` | Google Earth Engine – `LANDSAT/LC09/C02/T1_L2` | GeoTIFF (30m) | GEE Community Account, Export via `ee.batch` |

### 🌳 Vegetation
| Datensatz | Quelle | Format | Zugang |
|---|---|---|---|
| Baumkataster Würzburg (Art, Pflanzjahr, Standort) | [opendata.wuerzburg.de](https://opendata.wuerzburg.de/api/explore/v2.1/catalog/datasets/baumkataster_stadt_wuerzburg/records) | GeoJSON / API | Kostenlos, REST-API direkt in Python abrufbar |

### 👥 Soziales (Zensus 2022)
| Datensatz | Quelle | Format | Zugang |
|---|---|---|---|
| Alter in 10er-Jahresgruppen (100m-Gitter) ✅ bereits vorhanden | Destatis Zensus 2022 | CSV + Gitter-ID | [zensus2022.de](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/_inhalt.html) |
| Bevölkerungszahl pro Zelle (100m-Gitter) | Destatis Zensus 2022 | CSV | Gleiche Quelle, separater Download |
| Gebäude- & Wohnungsdaten (100m-Gitter) | Destatis Zensus 2022 | CSV | Optional – für Versiegelungsvalidierung |

> ⚠️ Wichtig: Die 100m-Gitterdaten sind zu groß für Excel – direkt mit GeoPandas/Pandas einlesen und auf Würzburger Gitter-IDs filtern.

### 🏗️ Oberflächenbeschaffenheit & Entsiegelung
| Datensatz | Quelle | Format | Zugang |
|---|---|---|---|
| ATKIS Basis-DLM Bayern (Flächennutzung, Versiegelungsklassen) | LDBV Bayern OpenData | Shapefile / WFS | Kostenlos via [geodaten.bayern.de](https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=atkis_basis_dlm) |
| OSM Gebäude, Straßen, Parkplätze | OpenStreetMap via `osmnx` | GeoDataFrame | Python-direkt, kein Download nötig |
| GHSL Impervious Surface (Versiegelungsrate) | GEE – `JRC/GHSL/P2023A/GHS_BUILT_S` | GeoTIFF | GEE, zur Validierung der ATKIS-Daten |

### 💧 Hydrologie
| Datensatz | Quelle | Format | Zugang |
|---|---|---|---|
| Niederschlag Würzburg (~600mm/Jahr) | DWD Climate Data Center | CSV | [opendata.dwd.de](https://opendata.dwd.de) – Station Würzburg, kostenlos |
| Bodenarten / Abflussbeiwerte Bayern | LfU Bayern | WMS/WFS | [lfu.bayern.de](https://www.lfu.bayern.de) – für präzise C-Werte pro Fläche |

---

## Tech Stack (vollständig)

### Backend (Python)
```
fastapi + uvicorn        → API-Server
geopandas + shapely      → Vektor-Geodaten
rasterio + rasterstats   → Raster-Analyse (LST)
earthengine-api          → GEE-Zugriff
osmnx                    → OSM-Datenabfrage
pandas + numpy + scipy   → Analyse & Korrelation
pyarrow                  → GeoParquet (schnelles I/O)
```

### Frontend (JavaScript)
```
React + Vite             → App-Framework
deck.gl + react-map-gl   → Interaktive Geo-Karten (HeatmapLayer, GeoJsonLayer)
Recharts oder Nivo       → Charts & Simulation-Outputs
Tailwind CSS + shadcn/ui → Styling & UI-Komponenten
Zustand                  → State (aktive Layer, Simulation-Parameter)
```

---

## App-Seiten / Features

```
/ Dashboard         → Übersicht: Karte + KPIs (heißeste Zone, vulnerabelster Bezirk)
/hitzeatlas         → LST-Heatmap + Baumkataster-Overlay (deck.gl HeatmapLayer)
/vulnerabilitaet    → Choropleth: gewichteter Index aus LST + Senioren-Anteil
/entsiegelung       → ATKIS/OSM-Layer, versiegelte Flächen, Potenzial-Score
/simulation/baeume  → Slider: Anzahl Neupflanzungen → Δ Temperatur + CO₂
/simulation/wasser  → Slider: Entsiegelungsfläche (m²) → m³ Versickerung/Jahr
```

---

## Ordnerstruktur
resilientes-wuerzburg/
├── CLAUDE.md
├── .env (nie committen – GEE_PROJECT_ID, etc.)
├── .gitignore
├── backend/
│ ├── main.py (FastAPI App-Instanz, CORS, Router-Einbindung)
│ ├── requirements.txt
│ ├── routers/
│ │ ├── trees.py
│ │ ├── zensus.py
│ │ ├── lst.py
│ │ └── simulate.py
│ ├── utils/
│ │ ├── data_loader.py
│ │ └── analysis.py
│ ├── tests/
│ │ └── test_trees.py
│ └── data/ (lokale Datendateien: GeoTIFF, GeoParquet, CSV)
└── frontend/
├── src/
│ ├── components/
│ │ ├── maps/
│ │ └── charts/
│ ├── pages/
│ ├── store/ (Zustand State)
│ └── api/ (fetch-Wrapper für FastAPI-Endpoints)
└── ...

---

## Wichtige Konventionen
- Secrets ausschließlich über `.env` + `python-dotenv` / Vite `import.meta.env`
- Keine API-Keys oder Pfade hardcoden
- Backend gibt immer GeoJSON oder JSON zurück, nie rohe GeoDataFrames

---

## Implementierungsstand

### Backend-Endpoints
| Endpoint | Status | Beschreibung |
|---|---|---|
| `GET /api/trees` | ✅ | Baumkataster als GeoJSON FeatureCollection. Query-Param `?refresh=true` erzwingt API-Reload. Modul-Level-Cache + GeoParquet-Persistierung in `backend/data/trees.parquet`. |
| `GET /api/zensus` | ✅ | Zensus-100m-Gitter als GeoJSON FeatureCollection (Properties: `gitter_id`, `anteil_65plus`, `einwohner`). `?refresh=true` ignoriert Parquet-Cache. |
| `GET /api/lst` | ⏳ offen | LST-Raster aus GEE/GeoTIFF, vermutlich als aggregierte Zonenwerte pro 100m-Gitterzelle. |
| `GET /api/simulate/*` | ⏳ offen | Simulation Bäume / Entsiegelung. |

### `utils/data_loader.py`
- `load_tree_cadastre(force_refresh=False)` – paginierter Abruf der opendata.wuerzburg.de-API mit `httpx` (limit=100, ~447 Requests), GeoParquet-Cache.
- `load_zensus(force_refresh=False)` – merged Alter- + Bevölkerungs-CSV, filtert Würzburg-Bbox, baut 100×100m-Quadratzellen.

### Daten-Caching
- Erste Requests laden von Quelle und schreiben `backend/data/{trees,zensus}.parquet`.
- Folge-Requests lesen direkt aus Parquet (kein Netzwerk, kein CSV-Parsing).
- `_DATA_DIR.mkdir(parents=True, exist_ok=True)` beim Modul-Import.
- `*.parquet` ist global in `.gitignore`.

---

## Datenbesonderheiten & Abweichungen von ursprünglichen Annahmen

### Zensus-CSVs (Destatis 2022)
- **Trennzeichen:** Semikolon (`;`), nicht Komma → `pd.read_csv(..., sep=";")`.
- **Spaltennamen weichen vom Standardschema ab:**
  - `GITTER_ID_100m` (Großbuchstaben), nicht `Gitter_ID_100m`.
  - Altersklassen heißen `Unter18`, `a18bis29`, `a30bis49`, `a50bis64`, `a65undaelter` (5 Klassen, nicht 6).
- **Maskierte Werte:** Kleine Gitterzellen enthalten `–`/`�` (Geheimhaltungszeichen).
  → Konvertierung mit `pd.to_numeric(..., errors="coerce")`, NaN bleibt erhalten und wird im Frontend transparent gerendert.
- **CRS der Gitterkoordinaten:** EPSG:3035 (LAEA), **nicht** UTM Zone 32N. Würzburg liegt bei
  `x ≈ 4.307–4.320 Mio.`, `y ≈ 2.967–2.978 Mio.` Aktueller Filter mit Puffer:
  `x: 4_300_000–4_325_000`, `y: 2_960_000–2_985_000`.
- Geometrie: `Point(x_mp_100m, y_mp_100m).buffer(50, cap_style=3)` in EPSG:3035, danach `to_crs("EPSG:4326")`.

### Baumkataster-API
- Koordinatenfeld ist `geo_punkt` mit Unterfeldern `lon`/`lat` (kein GeoJSON-Geometrie-Objekt).
- Gesamtanzahl Records: 44.647 (Stand Implementierung).

---

## Offene TODOs

- [ ] `/api/zensus` erstmals triggern und Anzahl gelieferter Features validieren (Erwartung: ~8.000–12.000 Zellen). Bei Abweichung Bbox nachjustieren.
- [ ] `GET /api/lst` implementieren (LST aus GEE oder lokalem GeoTIFF).
- [ ] Vulnerabilitäts-Score: gewichtete Kombination aus LST + `anteil_65plus` (Formel kommt vom Nutzer).
- [ ] ATKIS/OSM-Endpoint für Entsiegelungs-Layer.
- [ ] Simulationsendpoints (Bäume → Δ°C/CO₂; Entsiegelung → m³ Versickerung).
- [ ] Frontend-Setup (React/Vite/deck.gl) noch nicht begonnen.
- [ ] `backend/tests/test_trees.py` ist manuell ausführbar; CI-Integration offen.