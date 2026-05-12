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

## Design
- Design-Referenz: `docs/Design-System.html` – immer prüfen bevor neue 
  UI-Komponenten erfunden werden

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
deck.gl + react-map-gl   → Interaktive Geo-Karten (GeoJsonLayer, ScatterplotLayer)
Recharts oder Nivo       → Charts & Simulation-Outputs
Tailwind CSS + shadcn/ui → Styling & UI-Komponenten
Zustand                  → State (aktive Layer, Simulation-Parameter)
```

---

## App-Seiten / Features

```
/ Dashboard         → Übersicht: Karte + KPIs (heißeste Zone, vulnerabelster Bezirk)
/hitzeatlas         → LST-Choropleth (GeoJsonLayer) + Baumkataster-Overlay, Hover-Tooltip, Legende
/vulnerabilitaet    → Choropleth: gewichteter Index aus LST + Senioren-Anteil
/entsiegelung       → ATKIS/OSM-Layer, Flächenarten nach Kategorie eingefärbt, kein Score
/simulation/baeume  → Slider: Anzahl Neupflanzungen → Δ Temperatur + CO₂
/simulation/wasser  → Slider: Entsiegelungsfläche (m²) → m³ Versickerung/Jahr
```

---

## Ordnerstruktur
resilientes-wuerzburg/
├── CLAUDE.md
├── docs/
│   └── Design-System.html
├── .env (nie committen – GEE_PROJECT_ID, etc.)
├── .gitignore
├── backend/
│ ├── main.py (FastAPI App-Instanz, CORS, Router-Einbindung)
│ ├── requirements.txt
│ ├── routers/
│ │ ├── trees.py
│ │ ├── zensus.py
│ │ ├── lst.py
│ │ ├── vulnerability.py
│ │ ├── entsiegelung.py
│ │ ├── stadtbezirke.py
│ │ └── simulate.py
│ ├── utils/
│ │ ├── data_loader.py
│ │ ├── analysis.py      ← build_hvi_geodataframe() — einzige HVI-Berechnung
│ │ └── vuln_formula.py  ← WEIGHTS, N_PRIOR, shrink_senior_rate(), compute_hvi()
│ ├── tests/
│ │ ├── test_trees.py
│ │ └── test_vuln_formula.py
│ └── data/ (lokale Datendateien: GeoTIFF, GeoParquet, CSV)
└── frontend/
├── src/
│ ├── components/
│ │ ├── map/               ← MapSurface, LSTLegend, EntsiegelungLegend
│ │ │   └── overlays/      ← DeckOverlay, HeatLayer, TreeLayer, VulnLayer, EntsiegelungLayer
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
| `GET /api/trees` | ✅ | Baumkataster als GeoJSON FeatureCollection (alle 44.647 Bäume). Quelle: lokale Parquet-Datei. `?refresh=true` liest neu aus Quelldatei. Cache: `backend/data/trees.parquet`. |
| `GET /api/zensus` | ✅ | Zensus-100m-Gitter als GeoJSON FeatureCollection (Properties: `GITTER_ID_100m`, `anteil_65plus`, `anteil_65plus_clamped`, `Einwohner`). `?refresh=true` ignoriert Parquet-Cache. |
| `GET /api/lst` | ✅ | Natives GeoTIFF-Raster (`lst_wuerzburg.tif`), auf 100m resampelt (`Resampling.average`). ~13.900 Features. Properties: `lst_celsius` (°C, 1 Dez.), `lst_norm` (Rang-normiert 0–1). Cache: `backend/data/lst.parquet`. `?refresh=true` erzwingt Neuberechnung. |
| `GET /api/vulnerability` | ✅ | HVI-Score als GeoJSON FeatureCollection. Properties: `hvi`, `anteil_65plus` (Rohwert), `anteil_65plus_adj` (Bayesian-Shrinkage-korrigiert), `lst_norm`, `lst_celsius`, `Einwohner`. Formel + Shrinkage in `utils/vuln_formula.py`. `meta`: `weights`, `n_prior` (50), `global_65_rate` (bevölkerungsgewichteter Stadtmittelwert). Kein Parquet-Cache — nur In-Memory (`_cache`), reset bei Backend-Restart oder `?refresh=true`. |
| `GET /api/entsiegelung` | ✅ | ATKIS + OSM-Flächen als GeoJSON FeatureCollection. Properties: `source` (`"atkis"`/`"osm"`), `type_key` (OBJART_TXT as-is / `"osm_parking"` / `"osm_square"` / `"osm_flat_roof_industrial"`), `label`, `area_m2`. `meta`: `atkis_count`, `osm_count`, `total_count`. Cache: `backend/data/entsiegelung.parquet`. `?refresh=true` erzwingt Neuberechnung. Kein Score, kein seal_rate. |
| `GET /api/stadtbezirke` | ✅ | 13 Würzburger Stadtbezirke als GeoJSON FeatureCollection mit aggregierten Kennzahlen. Quelle: opendata.wuerzburg.de API (`stadtbezirke`-Datensatz). Properties: `name`, `nummer`, `lst_max`, `lst_median`, `lst_mean`, `hvi_max`, `hvi_mean`, `einwohner` (Σ aus Zensus-sjoin), `entsiegelung_m2` (Σ ATKIS+OSM-Flächen), `tree_count`. Spatial Joins gegen LST-Pixel, HVI-Zellen, Entsiegelung-Polygone, Baumkataster. `meta.total_count`. Cache: `backend/data/stadtbezirke.parquet`. `?refresh=true` lädt API neu. |
| `GET /api/simulate/*` | ⏳ offen | Simulation Bäume / Entsiegelung. |

### `utils/data_loader.py`
- `load_tree_cadastre(force_refresh=False)` – liest lokalen Bulk-Export `backend/data/baumkataster_stadt_wuerzburg.parquet` (alle 44.647 Records), schreibt verarbeiteten Cache nach `backend/data/trees.parquet`. Kein Netzwerkzugriff. Wirft `FileNotFoundError` wenn Quelldatei fehlt.
- `load_zensus(force_refresh=False)` – merged Alter- + Bevölkerungs-CSV, filtert Würzburg-Bbox, baut 100×100m-Quadratzellen. Berechnet `anteil_65plus` mit `.clip(0, 1)` gegen Geheimhaltungsrundung.
- `load_lst(force_refresh=False)` – liest `lst_wuerzburg.tif` direkt mit rasterio, resampelt auf ~100m (`Resampling.average`), erstellt Polygon-Bounding-Box pro Pixel. `lst_celsius` direkt aus GeoTIFF (GEE exportiert bereits °C). `lst_norm` via `scipy.stats.rankdata` (Rang-Normierung 0–1, gleichmäßige Farbverteilung). Cache: `backend/data/lst.parquet`. ⚠️ Resample-Scale wird **separat für X und Y** berechnet mit `cos(lat)`-Korrektur (`scale_x = (100 / (111_320 * cos_lat)) / pix_lon`), damit Zellen physisch ~100×100m sind (GEE exportiert quadratische Grad-Pixel, ohne Korrektur wären Zellen nur ~64m breit).
- `load_stadtbezirke(force_refresh=False)` – ruft opendata.wuerzburg.de `stadtbezirke`-API ab (13 Records, Polygon-Geometrien). Properties: `name`, `nummer`. Cache: `backend/data/stadtbezirke.parquet`. Nutzt `httpx`, parst Records via `shapely.geometry.shape`.
- `load_entsiegelung(force_refresh=False)` – liest `sie02_f.shp` + `ver01_f.shp` aus `bkg_shape_712.zip` (EPSG:25832, Würzburg-BBox-Vorfilter `_WUE_ATKIS_BBOX` + `.cx`-Präzisfilter nach Reprojektierung). `type_key = OBJART_TXT as-is`. `label` via Regex: AX_-Prefix entfernt, CamelCase → Leerzeichen. `area_m2` in EPSG:25832 vor Reprojektierung. OSM: `amenity=parking` + `place=square` + Gebäude (`building=*`) gefiltert auf `roof:shape=flat` ODER `building ∈ {industrial, commercial, supermarket, retail}`, ausgeschlossen sind bereits begrünte Dächer (`roof:material=grass` / `roof:surface=green`) → `type_key="osm_flat_roof_industrial"`, `label="Flachdach / Gewerbebau"`. Nur Polygon-Geometrien. Kein Score, kein seal_rate. Cache: `backend/data/entsiegelung.parquet`.

### `utils/vuln_formula.py`
- `WEIGHTS` – `{"lst_norm": 0.6, "anteil_65plus": 0.4}`. Assert sum == 1.0.
- `N_PRIOR = 50` – Credibility-Schwelle für Bayesian Shrinkage: Eine Zelle braucht ~50 Einwohner, um 50 % Glaubwürdigkeit gegenüber der Stadtmittelrate zu erreichen.
- `shrink_senior_rate(observed, n, global_mean, n_prior=N_PRIOR)` – Empirical-Bayes-Schätzer: `(n * observed + n_prior * global_mean) / (n + n_prior)`. Löst das Small-Numbers-Problem (Zellen mit 3 Einwohnern, alle 65+, erhalten sonst HVI = 10).
- `compute_hvi(row)` – Nimmt bereits adjustierten `anteil_65plus`-Wert entgegen. Gibt `None` bei NaN/None-Inputs zurück. Skaliert auf 1–10: `raw * 9 + 1`.

### `utils/analysis.py`
- `build_hvi_geodataframe(zensus, lst)` – **Einzige Stelle** für die HVI-Berechnung auf Zellebene. Führt Spatial Join (Zensus × LST), berechnet bevölkerungsgewichteten `global_65_rate`, wendet Bayesian Shrinkage an, ruft `compute_hvi()` auf. Gibt `(GeoDataFrame, global_65_rate)` zurück. Spalten im GeoDataFrame: `hvi`, `anteil_65plus`, `anteil_65plus_adj`, `lst_celsius`, `lst_norm`, `Einwohner`, `geometry`. Wird von `routers/vulnerability.py` und `routers/stadtbezirke.py` aufgerufen — nirgendwo sonst HVI berechnen.

### Frontend-Setup
- Framework: Vite + React 18, Plain JSX, Tailwind v4
- **Tailwind v4 Hinweis:** kein `tailwind.config.js` – Tokens im `@theme`-Block in `src/app/theme.css`. Klassen: `bg-bg-0`, `text-fg-1`, `bg-accent-green` etc.
- Karten: MapLibre GL + react-map-gl (MapLibre-Adapter) + deck.gl
- Basemap: CartoCDN dark-matter (kein Token nötig)
- **deck.gl Integration:** `MapboxOverlay` + `useControl` (nicht `DeckGL` direkt) – einzig korrekte Methode für Kamera-Synchronisation mit MapLibre
- State: Zustand (`useAppStore.js`)
- Routing: React Router v6, alle 6 Routen als Lazy-Chunks

#### Fertige Seiten
| Seite | Route | Status |
|---|---|---|
| Dashboard | `/` | ✅ KPI-Strip (4 Kacheln) + Top-3-Listen pro KPI (4×1-Grid) |
| Hitzeatlas | `/hitzeatlas` | ✅ inkl. Stadtbezirks-Choropleth-Layer + Bezirks-Hover-Tooltip |
| Vulnerabilität | `/vulnerabilitaet` | ✅ inkl. HVI-Legende + LST-Legende + Hinweis zu Gitter-Diskrepanz |
| Entsiegelung | `/entsiegelung` | ✅ |
| Simulation Bäume | `/simulation/baeume` | ⏳ Shell only |
| Simulation Wasser | `/simulation/wasser` | ⏳ Shell only |

#### Fertige Komponenten
- `MapSurface.jsx` – MapLibre-Wrapper, initialViewState Würzburg (9.932, 49.794, zoom 12)
- `DeckOverlay.jsx` – MapboxOverlay + useControl Wrapper; akzeptiert `...rest`-Props (z. B. `onHover`) und leitet sie an `setProps` weiter
- `HeatLayer.jsx` – deck.gl **GeoJsonLayer** (Choropleth), `getFillColor` interpoliert `lst_norm` über Drei-Punkt-Gradient grün→amber→rot, Alpha 180, `pickable: true`, akzeptiert `onHover`-Prop. Subtile weiße Zell-Outlines (Alpha 18, 1px) für Abgrenzung beim Reinzoomen; Hotspot-Pixel bekommen hellblaue 2px-Outline, gehoverter Hotspot weiße 4px-Outline.
- `TreeLayer.jsx` – deck.gl ScatterplotLayer, 4px Punkte, grün 70% Opacity
- `LayerPanel.jsx` – Toggles für heatmap + trees + stadtbezirke, Zustand-connected
- `StadtbezirkeLayer.jsx` (`overlays/`) – deck.gl GeoJsonLayer-Choropleth auf `lst_max`. Frontend normiert min/max aus den 13 Bezirken, Drei-Punkt-Gradient grün→amber→rot bei Alpha 140 (transparent genug, damit ein darunter liegender LST-Pixel-Layer sichtbar bleibt). 1.5px-weiße Outlines (`getLineColor: [255,255,255,200]`), `pickable: true`, akzeptiert `onHover`-Prop.
- `LSTLegend.jsx` – Gradient-Balken (160×8px) + drei `fmt.temp()`-Labels (min/median/max als Props); frosted-glass-Hintergrund
- `VulnLayer.jsx` – deck.gl GeoJsonLayer, Lila-Gradient auf `hvi` (0→transparent, 1→rgba(168,85,247,220)), pickable, akzeptiert `onHover`-Prop. Subtile weiße Zell-Outlines (Alpha 18, 1px, max 1px) für Abgrenzung beim Reinzoomen.
- `EntsiegelungLayer.jsx` (`overlays/`) – **ein** GeoJsonLayer für alle Features; `getFillColor` switcht per `type_key` auf feste RGBA-Farbe (Alpha 170); Filterung per `showAtkis`/`showOsm` vor Layer-Erstellung. Kein seal_rate. OSM-Cases: `osm_parking`, `osm_square`, `osm_flat_roof_industrial` (hellgrün `[134,239,172,170]`).
- `EntsiegelungLegend.jsx` – Kategorie-Legende; eine Zeile pro Flächenart (12×12px Farbquadrat + Label); ATKIS-Block / HR-Trennlinie / OSM-Block (inkl. „Flachdach / Gewerbebau"); frosted-glass-Hintergrund wie LSTLegend.
- `Sidebar.jsx` – 220px, 2 Nav-Gruppen, active NavLink via react-router-dom
- `Topbar.jsx` – 48px sticky, Breadcrumb via useLocation()
- `ui/KpiCard.jsx` – KPI-Card nach Design System § KPI Card. Props: `{ label, value, unit, sub?, color, icon }`. 11px-uppercase-Label, 32px-mono-Value mit Akzentfarbe aus `COLORS`, 14px-mono-Unit, optionaler 12px-Sub. 36×36 Icon-Tile mit getöntem Background + Border (Alpha aus `COLORS`-Map).
- `ui/Spinner.jsx` – 12×12px grüner Kreis-Spinner, 800ms linear infinite (Design System § Empty & Loading). `@keyframes spin` ist global in `App.css` definiert.
- `dashboard/TopList.jsx` – Top-N-Card im KPI-Frame (bg-bg-2, border, rounded 10px, p-5). Props: `{ title, sub?, color, items }` mit `items = [{ name, value, valueSub? }]`. #1-Eintrag in Akzentfarbe, andere Ränge in `text-fg-3`/`text-fg-1`. Optionaler `valueSub` rendert eine 10px-mono-Zeile unter dem Hauptwert (z. B. für ⌀ Mean).

#### Fertige Utils / Store / API
- `utils/format.js` – `fmt.num/temp/dT/pct/area/index` (de-DE Locale)
- `utils/colors.js` – `COLORS`-Map (green/amber/red/blue/purple)
- `store/useAppStore.js` – `layers`: `heatmap` (default true), `trees`, `zensus`, `vulnerabilitaet`, `entsiegelung_atkis` (default true), `entsiegelung_osm` (default true), `stadtbezirke`; `vulnWeights` (null | object), `setVulnWeights()`; `sim`-Parameter (baeume/wasser)
- `api/client.js` – `apiFetch()` mit `VITE_API_URL`
- `api/trees.js`, `api/zensus.js`, `api/lst.js`, `api/vulnerability.js`, `api/entsiegelung.js`, `api/stadtbezirke.js` – fetch-Wrapper

### Daten-Caching
- Baumkataster: Quelldatei `baumkataster_stadt_wuerzburg.parquet` manuell in `backend/data/` ablegen (nicht im Git – siehe `.gitignore`). Bezugsquelle: opendata.wuerzburg.de → Export als GeoParquet.
- Zensus: Erste Requests parsen CSVs und schreiben `backend/data/zensus.parquet`. Folge-Requests lesen direkt aus Parquet.
- Entsiegelung: Erste Requests lesen ATKIS-ZIP + OSM-Abfrage und schreiben `backend/data/entsiegelung.parquet`. Cache mit `?refresh=true` neu bauen.
- Stadtbezirke: Erste Requests ziehen 13 Polygone live von opendata.wuerzburg.de und schreiben `backend/data/stadtbezirke.parquet`. Aggregate (LST/HVI/Entsiegelung/Bäume) werden im Router live berechnet und in einem In-Memory-Cache gehalten (Reset bei Backend-Restart).
- LST-Tausch: Wenn `lst_wuerzburg.tif` ausgetauscht wird, **muss `backend/data/lst.parquet` gelöscht** oder `?refresh=true` gerufen werden, sonst liefert der Endpoint die alten Daten. Backend-Restart leert zusätzlich die In-Memory-Caches von `/api/vulnerability` und `/api/stadtbezirke`, die per Spatial-Join auf der LST aufsetzen.
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

### Baumkataster (Bulk-Export)
- Datenquelle: lokale Datei `backend/data/baumkataster_stadt_wuerzburg.parquet` (manuell von opendata.wuerzburg.de exportiert).
- Gesamtanzahl Records: 44.647. CRS: `OGC:CRS84` (= WGS84, lon/lat; `to_epsg()` gibt `None` zurück – ist korrekt).
- Geometriespalte heißt `geo_punkt` (nicht `geometry`). Extraspalten: `json_featuretype`, `category`, `city`.
- Hinweis API-Constraint (historisch): Die REST-API erlaubt nur `offset + limit ≤ 10.000` → max. 10.000 von 44.647 Records erreichbar. Deshalb Umstieg auf Bulk-Export.

### lst_wuerzburg.tif (GEE Export)
- Quelle: Google Earth Engine, `LANDSAT/LC09/C02/T1_L2`
- Zeitraum: Juni–August (Sommer-Median-Komposit, < 20% Wolken)
- ⚠️ Skalierung: GEE exportiert bereits fertige °C-Werte — Formel NICHT anwenden.
  `raw DN × 0.00341802 + 149.0 − 273.15` gilt nur für rohe DN-Downloads, nicht für GEE-Exporte.
- CRS Export: EPSG:4326, 30m Auflösung, Cloud-Optimized GeoTIFF
- Ablageort: `backend/data/lst_wuerzburg.tif` (nicht im Git)
- Backend liest mit `rasterio`, resampelt auf ~100m (`Resampling.average`), ~13.900 valide Features (nach cos(lat)-Korrektur des Resample-Scale)
- `lst_celsius`: direkt aus GeoTIFF, kein weiteres Scaling nötig (GEE exportiert fertige °C-Werte)
- `lst_norm`: **Rang-basierte Normierung** via `scipy.stats.rankdata` (0.0–1.0) — sorgt für gleichmäßige Farbverteilung über grün/amber/rot unabhängig von °C-Clustering
- `GDAL_DATA` Warning beim Start ist harmlos – kein Einfluss auf Berechnungen
- ⚠️ `rasterstats` wird **nicht** mehr für LST eingesetzt — Zensus-Zellen-Bindung wurde aufgegeben, GeoTIFF deckt gesamte Stadtfläche ab (direktes Raster-zu-Polygon via rasterio)

### ATKIS Basis-DLM (bkg_shape_712.zip)
- Datei enthält u. a. `sie02_f.shp` (Siedlungsflächen) und `ver01_f.shp` (Verkehrsflächen).
- CRS: EPSG:25832 (UTM Zone 32N). Würzburg-Vorfilter: `_WUE_ATKIS_BBOX = (540000, 5505000, 580000, 5540000)` als `bbox=`-Argument bei `gpd.read_file()`. Danach `.cx[9.87:10.01, 49.75:49.83]`-Präzisfilter in EPSG:4326.
- `type_key = OBJART_TXT as-is` (kein FKT-Split, kein Whitelist-Filter).
- `label`: AX_-Prefix entfernt + CamelCase → Leerzeichen via `re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', s)`.
- `area_m2` wird in EPSG:25832 berechnet, bevor `to_crs("EPSG:4326")` aufgerufen wird.
- Kein `seal_rate`-Score — reine Flächenart-Visualisierung.

### Gitter-Diskrepanz LST vs. Zensus/HVI
- LST-Zellen und Zensus/HVI-Zellen sind beide ~100m, aber **strukturell versetzt**: LST hat EPSG:4326-Ursprung (GEE-Export), Zensus hat EPSG:3035-Ursprung (Destatis-Gitter).
- Die Zellen überlappen nie pixel-genau. Im Vulnerability-Endpoint wird der `lst_celsius`-Tooltip-Wert als **Median aller LST-Pixel berechnet, die die jeweilige Zensus-Zelle schneiden** (typisch 1–4 Pixel via `intersects`-sjoin).
- Eine Homogenisierung auf ein gemeinsames Gitter ist nicht geplant. Hinweis zur Diskrepanz ist auf der Vulnerabilitäts-Seite am Ende der Right Rail sichtbar.

### Geheimhaltungsrundung Zensus 2022 (§ 16 BStatG)
- Destatis rundet kleine Gitterzellen (< 5 Einwohner) stochastisch.
- Altersklassen und Gesamtbevölkerung stammen aus getrennten CSVs → nach Merge kann `a65undaelter > Einwohner` entstehen → `anteil_65plus > 1.0`.
- Fix: `.clip(0, 1)` in `data_loader.py`; NaN (maskierte Zellen) bleibt erhalten.
- Betroffene Zellen werden mit `anteil_65plus_clamped: true` markiert (bool-Feld im GeoJSON).
- Typisch < 2% aller Würzburger Gitterzellen.

---

## Offene TODOs

- [x] `GET /api/lst` implementieren (LST aus GEE oder lokalem GeoTIFF).
- [x] Frontend-Setup (React/Vite/deck.gl) noch nicht begonnen.
- [x] Vulnerabilitäts-Score: gewichtete Kombination aus LST + `anteil_65plus` (Formel in `utils/vuln_formula.py`, Gewichte 0.6/0.4).
- [x] ATKIS/OSM-Endpoint für Entsiegelungs-Layer (`GET /api/entsiegelung`, Kategorie-Farben, kein Score).
- [x] Stadtbezirks-Endpoint (`GET /api/stadtbezirke`) inkl. Spatial-Join-Aggregaten (LST/HVI/Entsiegelung/Bäume).
- [x] Dashboard-Seite (`/`) mit KPI-Strip + Top-3-Listen pro KPI.
- [x] Stadtbezirks-Choropleth-Layer auf der Hitzeatlas-Seite (`StadtbezirkeLayer.jsx`).
- [x] HVI Small-Numbers-Problem behoben: Bayesian Shrinkage in `utils/vuln_formula.py` (`shrink_senior_rate`, `N_PRIOR=50`), zentrale HVI-Berechnung in `utils/analysis.py` (`build_hvi_geodataframe`).
- [ ] Stadtbezirks-Choropleth auf der Vulnerabilitäts-Seite (analog, aber auf `hvi_max`).
- [ ] Multi-Year-LST (zweiter GEE-Export) für Trend-Indikator in KPI-Cards (`↑ +X°C vs. <Jahr>`).
- [ ] Simulationsendpoints (Bäume → Δ°C/CO₂; Entsiegelung → m³ Versickerung).
- [ ] CI-Integration der Test-Suite (aktuell nur lokal ausführbar).