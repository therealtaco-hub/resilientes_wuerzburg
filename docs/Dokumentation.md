# Resilientes Würzburg — Vollständige Dokumentation

**Stand:** Juli 2026 · **App-Version:** Doku v2 (löst Tool-Logik-und-Quellen.md v1.0 ab)
**Sprache/Format:** Deutsch, Markdown. Diese Datei ist als **In-App-Doku-Seite** (`/dokumentation`) vorgesehen und ersetzt die verteilten Hinweis- und Methodik-Aufklappfelder der einzelnen Tabs.

---

## 0 · Zweck dieses Dokuments

Dieses Dokument beschreibt **ausnahmslos jede Funktion, jede Annahme, jeden Zahlenwert, jeden Koeffizienten und dessen Herkunft** in der App *Resilientes Würzburg*. Es ist so gegliedert, dass jede Aussage in der Benutzeroberfläche (Tooltip, KPI, Legende, Methodik-Box) hier ihre vollständige Herleitung findet.

**Warum eine zentrale Doku statt vieler In-App-Hinweise?**
Die App enthält aktuell an vielen Stellen aufklappbare Methodik- und Hinweisfelder (Hitzeatlas-Hinweisbox, HVI-Formelkarte, Baum- und Wasser-Methodikboxen, Realisierbarkeits-Tabellen). Diese Felder wiederholen teilweise denselben Inhalt und blähen die Panels auf. Die Empfehlung: In der App nur je **einen kurzen Kernhinweis** pro Tab belassen (z. B. den `LST ≠ Luft`-Banner) und für Details auf diese Doku-Seite verlinken. Kapitel 11 listet konkret auf, welche Felder reduziert werden können.

**Wichtiger Grundsatz für die Verlässlichkeit:** Alle fachlichen Koeffizienten stammen aus `backend/simulation_params.py` (Backend) bzw. `frontend/src/utils/simulate.js` (gespiegelte Frontend-Kopie). Diese beiden Dateien sind die **einzige Wahrheit** — Zahlen werden nie im UI-Code hardcodiert. Sollten sich die Werte im Code und in dieser Doku je unterscheiden, gilt der Code.

---

## 1 · Systemüberblick

Das Tool verbindet drei thematische Datenebenen zu einer Analyseoberfläche für die Stadt Würzburg:

| Ebene | Inhalt | Primärquelle |
|---|---|---|
| **Hitze** | Land Surface Temperature (LST), 100-m-Raster | Landsat 8+9 via Google Earth Engine |
| **Soziales** | Seniorenanteil 65+, Einwohnerdichte, 100-m-Gitter | Destatis Zensus 2022 |
| **Fläche** | Versiegelte Flächen nach Flächentyp | ATKIS Basis-DLM Bayern + OpenStreetMap |

Alle drei Ebenen sind räumlich auf das **Destatis-100-m-LAEA-Gitter (EPSG:3035)** harmonisiert. Das LST-GeoTIFF wurde in Google Earth Engine mit exakt dem Gitter-Transform der Zensusdaten exportiert (`crsTransform = [100, 0, 4 300 000, 0, −100, 2 985 000]`). Dadurch lassen sich LST- und Zensuszellen pixelgenau über ganzzahlige Zellmittelpunkte `(x_mp_100m, y_mp_100m)` verknüpfen — kein Resampling, keine räumlichen Verschnitt-Artefakte, kein `sjoin`.

### Architektur

```
FRONTEND (React + Vite)                 BACKEND (FastAPI, Python)
  deck.gl → Karten          REST/JSON     GeoPandas, Rasterio
  Recharts → Charts        ◄─────────►    rasterstats, SciPy, osmnx
  Tailwind + Zustand                      earthengine-api
                                              │
                                          DATEN: GeoParquet, GeoTIFF, CSV
```

Das Backend gibt **immer GeoJSON oder JSON** zurück, nie rohe GeoDataFrames. Deployment: Backend → Render.com, Frontend → Vercel, beide via GitHub-CI/CD.

### Die sechs Seiten

| Route | Funktion |
|---|---|
| `/` Dashboard | Übersicht: KPI-Kacheln + Top-Listen je Stadtbezirk |
| `/hitzeatlas` | LST-Choropleth + Baumkataster + Top-5-Hitzespots |
| `/vulnerabilitaet` | Heat-Vulnerability-Index (LST + Seniorenanteil) |
| `/entsiegelung` | Versiegelte Flächen nach Typ (ATKIS + OSM) |
| `/simulation` | Was-wäre-wenn: Baumpflanzung + Entsiegelung |
| `/dokumentation` | Diese Doku (vorgesehen) |

---

## 2 · Datenquellen im Detail

### 2.1 🌡️ Landsat-LST (Oberflächentemperatur)

| Merkmal | Wert |
|---|---|
| Quelle | Google Earth Engine, Kollektionen `LANDSAT/LC08/C02/T1_L2` + `LANDSAT/LC09/C02/T1_L2` |
| Band | `ST_B10` (thermisches Infrarot, 10,6–12,5 µm), Level-2-Science-Product |
| Zeitraum | Sommer (Juni–August) 2023–2025, **3-Jahres-Median-Komposit** |
| Auflösung | 100 m, exportiert EPSG:3035, exakt auf Destatis-Gitter gesnappt |
| QA-Masking | `QA_PIXEL`-Band: Maske für Wolken, Wolkenschatten, Schnee |
| Skalierung | GEE liefert bereits fertige °C-Werte (DN→K→°C in GEE). Das Backend liest Band 1 direkt, **keine** weitere Umrechnung |
| Bänder im GeoTIFF | Band 1 = LST_C (°C), Band 2 = NDVI, Band 3 = NDBI |
| Datei | `lst_wue_2023_2025_summer_median.tif` |
| Valide Zellen | ~14.500 |

**Warum Median-Komposit statt Einzelszene?** Einzelne Satellitenüberflüge sind stark von kurzfristigen Wolken- und Staubanomalien abhängig. Der 3-Jahres-Median stabilisiert das Signal, filtert szenenspezifische Artefakte und bleibt gleichzeitig aktuell.

**`lst_norm` (Rang-Normierung):** Für den kartenübergreifenden Vergleich wird jede Zelle per `scipy.stats.rankdata` auf einen Rangwert 0,0–1,0 gebracht (0 = kälteste, 1 = heißeste Zelle im erfassten Gebiet). Dies ist bewusst rang- und nicht wertbasiert, damit Ausreißer die Farbskala nicht stauchen.

Einzeljahre (`..._2023_..`, `2024`, `2025`) liegen vor, sind aber noch nicht in die App eingebunden.

### 2.2 🌳 Baumkataster Würzburg

| Merkmal | Wert |
|---|---|
| Quelle | Stadt Würzburg, opendata.wuerzburg.de — Bulk-Export als GeoParquet |
| Umfang | **44.647** Bäume |
| CRS | OGC:CRS84 (= WGS84 lon/lat) |
| Geometriespalte | `geo_punkt` |
| Attribute | `baumart`, `baumart_la` (lat. Name), `baumtyp` (Laub/Nadel), `baumhoehe` (m), `kronenbrei` (Kronendurchmesser m), `stammumfan` (cm), `source_id` |
| Lizenz | CC BY 4.0 |

**Wichtig:** Der Export enthält **kein** `pflanzjahr`/`alter`-Feld. Dargestellt sind ausschließlich **Bäume im Bestand der Stadt** — Privatbäume auf Wohn- oder Firmengrundstücken sind nicht erfasst. (Historischer Hinweis: Die REST-API von opendata.wuerzburg.de erlaubt nur `offset + limit ≤ 10.000`, deshalb der Umstieg auf den vollständigen Bulk-Export.)

### 2.3 👥 Destatis Zensus 2022

| Merkmal | Wert |
|---|---|
| Quelle | Statistisches Bundesamt (Destatis), zensus2022.de |
| Gitter | 100 m × 100 m LAEA (EPSG:3035) |
| Genutzte Felder | `GITTER_ID_100m`, `a65undaelter` (65+), `Einwohner` |
| Lizenz | dl-de/by-2-0 |

**Datenbesonderheiten (wichtig für korrektes Lesen):**
- **Trennzeichen** der CSVs ist Semikolon (`;`), nicht Komma.
- **Spaltennamen weichen vom Standard ab:** `GITTER_ID_100m` (Großschreibung); Altersklassen heißen `Unter18`, `a18bis29`, `a30bis49`, `a50bis64`, `a65undaelter` (5 Klassen).
- **Maskierte Werte:** Kleine Zellen enthalten Geheimhaltungszeichen (`–`/`�`) → `pd.to_numeric(..., errors="coerce")`, NaN bleibt erhalten und wird transparent gerendert.
- **CRS-Bereich Würzburg:** x ≈ 4,307–4,320 Mio., y ≈ 2,967–2,978 Mio. (EPSG:3035). Filter mit Puffer x: 4,30–4,325 Mio., y: 2,96–2,985 Mio.

**Geheimhaltungsrundung (§ 16 BStatG):** Destatis rundet Zellen mit wenigen Personen stochastisch. Weil Altersklassen und Gesamtbevölkerung aus **getrennten** CSVs stammen, kann nach dem Merge `a65undaelter > Einwohner` und damit `anteil_65plus > 1,0` entstehen. Fix: `.clip(0, 1)` im Backend, Markierung `anteil_65plus_clamped: true`. Betroffen sind typisch < 2 % aller Würzburger Zellen. **Sonderfall:** `Einwohner` kann vorhanden sein, während `anteil_65plus` trotzdem `null` ist (Altersklassen und Gesamtzahl werden unabhängig maskiert) → dann kein HVI, Tooltip zeigt „Altersstruktur nicht verfügbar (Datenschutz)".

Im Zensus-Endpoint werden nur Zellen ausgegeben, die mindestens ein LST-Pixel schneiden (~3.089 Features) — deckungsgleich mit HVI- und LST-Extent.

### 2.4 🏗️ ATKIS Basis-DLM Bayern

| Merkmal | Wert |
|---|---|
| Quelle | Bayerisches Landesamt für Digitalisierung, Breitband und Vermessung (LDBV), geodaten.bayern.de |
| Datei | `bkg_shape_712.zip` |
| Genutzte Layer | `sie02_f.shp` (Siedlungsflächen), `ver01_f.shp` (Verkehrsflächen) |
| CRS | EPSG:25832 (UTM Zone 32N) |
| Lizenz | CC BY 4.0 |

**Filterung:** Vorfilter über Würzburg-Bounding-Box `(540 000, 5 505 000, 580 000, 5 540 000)` beim Einlesen, dann präziser `.cx[9.87:10.01, 49.75:49.83]`-Clip in EPSG:4326. **Flächentyp-Key:** `OBJART_TXT` unverändert (z. B. `AX_Wohnbauflaeche`, `AX_IndustrieUndGewerbeflaeche`). **Label:** AX_-Prefix entfernt, CamelCase → Leerzeichen. **Fläche** in EPSG:25832 berechnet (metrisch korrekt) vor der Reprojektion. Kein Score, kein `seal_rate` auf dieser Ebene — reine Flächenart-Visualisierung.

### 2.5 🗺️ OpenStreetMap (OSM)

Quelle: OSM via `osmnx` (Python, kein separater Download), Lizenz ODbL. Extrahierte Objekttypen:
- `amenity=parking` → `osm_parking` (Parkplätze)
- `place=square` → `osm_square` (Plätze/Märkte)
- Gebäude mit `roof:shape=flat` **oder** `building ∈ {industrial, commercial, supermarket, retail}`, **ausgenommen** begrünte Dächer (`roof:material=grass` / `roof:surface=green`) → `osm_flat_roof_industrial` (Flachdächer, Label „Flachdach / Gewerbebau")

### 2.6 💧 DWD-Niederschlag

| Merkmal | Wert |
|---|---|
| Quelle | Deutscher Wetterdienst, Climate Data Center |
| Station | Würzburg, ID **05705** (49,7704 °N, 9,9576 °E, 268 m ü. NN) |
| Datei | `monatswerte_KL_05705_18810101_20241231_hist.zip`, Spalte `MO_RR` |
| Referenzperiode | 1991–2020 (DWD-Klimanormalperiode), 360/360 gültige Monatswerte |
| **Jahresniederschlag** | **573,5 mm/Jahr = 0,5735 m/Jahr** (Σ MO_RR pro Jahr / 30 Jahre) |
| Bandbreite | 394 mm (1991) bis 806 mm (2002), Median 556 mm |

Monatsmittel (mm): Jan 40,0 · Feb 35,8 · Mär 40,2 · Apr 32,7 · Mai 57,3 · Jun 52,9 · Jul 65,8 · Aug 56,3 · Sep 47,2 · Okt 47,5 · Nov 46,2 · Dez 51,5. (Für künftige saisonale Simulationen hinterlegt, aktuell nur der Jahreswert genutzt.)

### 2.7 Stadtbezirke Würzburg

Quelle: opendata.wuerzburg.de (`stadtbezirke`-Datensatz), **13 Polygone**, Properties `name`, `nummer`. Alle Bezirks-Kennzahlen (LST, HVI, Entsiegelung, Bäume) werden im Backend live per Spatial-Join berechnet.

---

## 3 · Seite: Dashboard (`/`)

**Funktion:** Einstiegsseite mit vier KPI-Kacheln und vier Top-3-Listen, aggregiert auf Stadtbezirksebene. Datengrundlage ist `GET /api/stadtbezirke`, das räumliche Joins gegen alle vier Datensätze durchführt, plus `GET /api/entsiegelung` für die Gesamtfläche.

### KPI-Kacheln

| Kachel | Wert | Herkunft |
|---|---|---|
| **Heißeste Zone** | `lst_max` des heißesten Bezirks (°C) | Max aller LST-Pixel im Bezirks-Polygon |
| **Max. Vulnerabilität** | `hvi_max` des vulnerabelsten Bezirks (Index 1–10) | Höchster HVI-Zellwert im Bezirk |
| **Bäume in Würzburg** | Σ `tree_count` aller Bezirke; Unterzeile zeigt stadtweite Kronenbeschattung `city_canopy_pct` | Baumkataster + `bestand_pct` |
| **Potenzialflächen** | Σ `area_m2` aller ATKIS+OSM-Flächen | Entsiegelungs-Endpoint |

### Top-3-Listen
Heißeste Bezirke (`lst_max`, Unterzeile ⌀ `lst_mean`) · Vulnerabelste Bezirke (`hvi_max`) · Meiste Bäume (`tree_count`) · Top Entsiegelung (`entsiegelung_m2`).

### Berechnung der Bezirks-Kennzahlen (`/api/stadtbezirke`)

| Kennzahl | Berechnung |
|---|---|
| `lst_max` / `lst_median` / `lst_mean` | Max / Median / Mittel aller LST-Pixel im Polygon |
| `hvi_max` | höchster HVI-Zellwert im Bezirk |
| `hvi_mean` | **bevölkerungsgewichteter** Ø: Σ(HVI·Einwohner) / Σ(Einwohner), Fallback ungewichtet |
| `einwohner` | Σ Zensus-Einwohner der geschnittenen Zellen |
| `entsiegelung_m2` | Σ Fläche aller ATKIS+OSM-Polygone im Bezirk |
| `tree_count` | Anzahl Baumkataster-Punkte im Bezirk |
| `city_canopy_pct` (`meta`) | Ø `bestand_pct` nur über In-Stadt-Kacheln |
| `city_cell_count` (`meta`) | Anzahl In-Stadt-Kacheln (Nenner für stadtweite Hochrechnung) |

**Warum `hvi_mean` bevölkerungsgewichtet ist:** Ein ungewichteter Mittelwert würde dünn besiedelte Randlagen mit zufällig hohem Score überbewerten. Die Gewichtung mit der Einwohnerzahl stellt sicher, dass der Bezirks-Durchschnitt die tatsächlich betroffenen Menschen abbildet.

---

## 4 · Seite: Hitzeatlas (`/hitzeatlas`)

**Funktion:** Choropleth der Oberflächentemperatur auf 100-m-Raster, überlagerbar mit dem vollständigen Baumkataster, mit Hover-Tooltip, klickbarem Baum-Popup, Stadtbezirks-Overlay und einer Top-5-Hitzespots-Karte.

### Layer

- **Hitzeinsel (LST):** `GeoJsonLayer`-Choropleth. Farbe interpoliert `lst_norm` über einen Drei-Punkt-Gradienten grün → amber → rot. Hover-Tooltip zeigt LST (°C) und ggf. NDVI.
- **Baumkataster:** `ScatterplotLayer`, Radius = `max(3 m, kronenbrei/2)` (halber Kronendurchmesser, min. 3 m — skaliert maßstabstreu mit dem Zoom). Farbe: Laubbaum grün, Nadelbaum türkis. Klick öffnet Popup mit Art, lat. Name, Typ, Höhe, Kronendurchmesser, Stammumfang, ID.
- **Stadtbezirke:** Choropleth auf `lst_max`, weiße Umrisslinien, Hover-Tooltip mit LST/HVI/Einwohner/Bäumen.
- **NDVI (optional):** Vegetationsindex aus Band 2 des GeoTIFFs, Grün-Gradient 0 → 0,7+; transparent bei ≤ 0 (Wasser/Schatten).

### Top-5-Hitzespots (`GET /api/hotspots`)

Markiert die fünf stärksten Hitzezentren. Der Algorithmus:

1. **Focal Mean, Radius 200 m:** Jede Zelle wird durch den Mittelwert aller Zellen im 200-m-Umkreis geglättet. Das filtert kleinteilige Einzelpixel-Ausreißer (z. B. einzelne Blechdächer) heraus. Die angezeigte Temperatur ist dieser geglättete Wert (`lst_celsius_smooth`, „Ø 200 m").
2. **Kantenfilter:** Zellen mit < 10 Nachbarn oder einem leeren 90°-Quadranten (Nähe zu NoData/Wolkenlücken) werden verworfen.
3. **Greedy Non-Maximum Suppression, Mindestabstand 600 m:** Verhindert, dass eine große Hitzeinsel mehrere Ranking-Plätze belegt.
4. **Geografische Vorfilterung:** Nur die innerstädtischen Bezirke Grombühl, Sanderau, Zellerau, Frauenland, Heidingsfeld, Altstadt, Steinbachtal, Heuchelhof — Randlagen (Wald, Felder) würden das Ranking sonst dominieren, ohne Hitzeinsel-Relevanz zu haben.

Der „Zu diesem Ort springen"-Button nutzt MapLibres natives `flyTo`.

### Aktuelle In-App-Hinweise (durch diese Doku ablösbar)
Die Hinweisbox nennt: 100-m-Rasterauflösung (feinere Unterschiede innerhalb einer Zelle nicht dargestellt), LST ≠ Lufttemperatur, ungefärbte Flächen (außerhalb Stadtgrenze oder Wolken im Komposit), Baumkataster = nur Stadtbäume. Alle vier Punkte sind in Kap. 2.1 / 2.2 / 10 vollständig erklärt.

---

## 5 · Seite: Vulnerabilität (`/vulnerabilitaet`)

**Funktion:** Choropleth des **Heat Vulnerability Index (HVI)** auf 100-m-Raster — kombiniert thermische Belastung (LST) mit sozialer Verletzlichkeit (Seniorenanteil 65+). Getrennt zuschaltbare Layer für LST, Demografie 65+ und HVI, plus Stadtbezirks-Choropleth auf `hvi_max`.

### Die HVI-Formel (`utils/vuln_formula.py`, autoritativ)

```
HVI_raw = 0,6 · lst_norm + 0,4 · anteil_65plus_adj
HVI     = HVI_raw · 9 + 1            → Skala 1 (niedrig) bis 10 (hoch)
```

| Faktor | Gewicht | Begründung |
|---|---|---|
| `lst_norm` (Rang-normiert 0–1) | **0,6** | Hitzeexposition ist der dominante Faktor |
| `anteil_65plus_adj` (Bayes-adjustiert 0–1) | **0,4** | soziale Sensitivität älterer Menschen |

Die Gewichte summieren sich per Assertion exakt zu 1,0. `compute_hvi()` gibt `None` zurück, wenn LST oder Altersanteil fehlen (NaN) — solche Zellen bleiben ungefärbt.

### Bayesian Shrinkage des Seniorenanteils

**Problem (Small Numbers):** Eine Zelle mit 3 Einwohnern, die alle über 65 sind, hätte `anteil_65plus = 1,0` und damit fälschlich HVI = 10. **Lösung:** Empirischer Bayes-/Credibility-Schätzer:

```
anteil_65plus_adj = (n · beobachtet + N_prior · stadtmittel) / (n + N_prior)
```

mit **`N_prior = 50`** und `stadtmittel` = bevölkerungsgewichtete Stadtmittelrate (`global_65_rate`, im `meta` des Endpoints ausgewiesen). Interpretation: Bei n = 50 Einwohnern liegt die Glaubwürdigkeit bei genau 50 % (halb Stadtmittel, halb beobachtet); bei n ≫ 50 dominiert der beobachtete Wert. Beispiele aus dem Code: n=3, beob.=1,0, global=0,22 → adj ≈ 0,24; n=200, beob.=0,30, global=0,22 → adj ≈ 0,28.

### KPI-Kacheln & Tooltip
- **Vulnerabelster Bereich:** höchster HVI im Datensatz.
- **Betroffene Bevölkerung:** Σ Einwohner aller Zellen mit HVI > 7,0.
- **Tooltip je Zelle:** HVI, LST, Anteil 65+ (roh), 65+ korrigiert, Einwohner. Warnhinweise bei Zensus-Rundung (§ 16 BStatG) bzw. fehlender Altersstruktur.

Die Formelkarte im Panel zeigt Gewichte, `N_prior`, Stadt-Ø 65+ live aus dem `meta` des Endpoints. Die Interpretations-Box („auto-generiert") formuliert: Zellen mit hohem HVI vereinen überdurchschnittliche Oberflächentemperatur und erhöhten Seniorenanteil → Priorität für Baumpflanzung und Entsiegelung.

---

## 6 · Seite: Entsiegelung (`/entsiegelung`)

**Funktion:** Karte aller versiegelten Flächen nach Flächentyp (ATKIS + OSM). **Keine Scoring-Funktion** — reine Visualisierung der Ausgangssituation, kategoriebasiert eingefärbt, nach Quelle (ATKIS/OSM) filterbar.

- **KPI:** Erfasste Flächen (Anzahl ATKIS + OSM) und Gesamtfläche (Σ `area_m2`).
- **Layer-Panel:** ATKIS-Flächen und OSM-Parkplätze & Plätze getrennt zuschaltbar, mit Feature-Zähler aus `meta` (`atkis_count`, `osm_count`).
- **Tooltip:** Label + Quelle (ATKIS/OSM) + Fläche.
- **Flächentypen (`type_key`):** ATKIS `OBJART_TXT` as-is; OSM `osm_parking`, `osm_square`, `osm_flat_roof_industrial`.

Flachdächer werden als Hinweis auf Begrünungspotenzial dargestellt, sind aber in der Simulation **nicht** wählbar (kein Bodeneingriff).

---

## 7 · Seite: Simulation (`/simulation`)

Zwei Sub-Tabs mit je eigenem Backend-Endpoint. Bedienung: Der Nutzer wählt Flächen in der Karte aus (Kacheln bzw. Polygone), stellt einen Parameter per Slider/Zahleneingabe ein und sieht die Wirkung in einem Vorher/Nachher-Block. Alle API-Aufrufe sind mit 300 ms entprellt.

---

### 7a · Sub-Tab Baumpflanzung (`GET /api/simulate/baeume`)

**Ausgaben:** Δ Oberflächentemperatur (°C), CO₂-Bindung (kg/Jahr), Kronendeckung (%), plus stadtweite Beschattungs-Hochrechnung.

#### Berechnung (Schritt für Schritt)

```
Schritt 1 — Projizierte Kronendeckung (Überlappungsmodell, Crookston & Stage 1999):
  crown_area_total   = n_trees · 50 m²                          [50 m²/Baum, s. u.]
  new_ratio          = crown_area_total / area_m2               [Flächen-Verhältnis]
  existing_ratio     = −ln(1 − existing_coverage_pct / 100)     [Bestand, inverse Formel]
  total_coverage_pct = (1 − exp(−(existing_ratio + new_ratio))) · 100
  effective_new_pct  = total_coverage_pct − existing_coverage_pct   [realer Zuwachs, ≥ 0]

Schritt 2 — LST-Reduktion:
  delta_lst_celsius  = −0,083 · effective_new_pct               [Mischgebiet-Koeffizient]

Schritt 3 — CO₂-Bindung:
  co2_kg_year        = n_trees · 12,5 kg/Jahr
```

**Warum das Überlappungsmodell?** Die naive Summe `Σ Kronenfläche / Fläche` zählt Überlappungen doppelt. Das negativ-exponentielle Modell nach Crookston & Stage (1999, USDA RMRS-GTR-24) nimmt zufällige (Poisson-)Kronenplatzierung an und konvergiert asymptotisch gegen 100 % — ein harter Cap entfällt. Δ°C wirkt nur auf den **projizierten** Zuwachs, weil genau das die Größe ist, gegen die der García-de-León-Koeffizient kalibriert ist (Vereinigungsfläche der Kronen, nicht Summe). Der abnehmende Grenznutzen dichter Bestände ist dadurch automatisch abgebildet.

**Modellgrenze:** Bei regelmäßig gepflanzten Alleen wird die Deckung leicht **unter**schätzt, bei Park-Clustern leicht **über**schätzt (Gray et al. 2021).

#### Pflanzbare Fläche & Versiegelungsgrad

Nicht die ganze Kachel ist bepflanzbar — versiegelter Boden trägt keinen Stamm. Pro 100-m-Kachel wird beim Cache-Aufbau ein flächengewichteter **Versiegelungsgrad** `seal_pct` aus den überlappenden ATKIS/OSM-Polygonen vorberechnet:

```
seal_pct           = Σ(Überlappungsfläche · seal_rate) / 10.000 m²      [0–1]
pflanzbare_flaeche = Zellfläche · (1 − seal_pct)
n_trees_max        = floor(pflanzbare_flaeche / 100 m²)                 [Slider-Cap]
```

Wesentlich: Der Versiegelungsgrad begrenzt nur die **Stammzahl** (`n_trees`), **nicht** den Kühl-Nenner (`area_m2` bleibt die volle Fläche). Kronen überhängen versiegelten Boden, und der García-de-León-Koeffizient ist gegen Deckung über die ganze Polygonfläche kalibriert. Poisson-Modell und Versiegelungsgrad sind orthogonal: das eine begrenzt die Deckung *pro Krone*, das andere die *Stammzahl*.

**Lücken-Annahme (E2):** Geladen sind nur ATKIS `sie02` (Siedlung) + `ver01` (Verkehr). Kacheln ohne Überdeckung gelten als **unversiegelt** (Grün-/Freifläche) und werden im Panel markiert („⚠ Teils keine ATKIS-Siedlungs-/Verkehrsfläche → als unversiegelt angenommen"), damit eine Lücke nicht als „fehlende Daten" missverstanden wird.

**Versiegelungsgrade `seal_rate` je Flächentyp** (Literaturwerte — UBA Texte 141/2021, Leitfaden Bayreuth 2024, DIN 18005; Zusammenhang Landnutzung ↔ Versiegelung nach Arnold & Gibbons 1996):

| Flächentyp | `seal_rate` |
|---|---|
| Straßenverkehrsfläche (`AX_Strassenverkehr`) | 98 % |
| Parkplatz (`osm_parking`) | 95 % |
| Platz/Markt (`osm_square`) | 90 % |
| Platz (`AX_Platz`) | 88 % |
| Industrie/Gewerbe (`AX_IndustrieUndGewerbeflaeche`) | 80 % |
| Gemischte Nutzung (`AX_FlaecheGemischterNutzung`) | 65 % |
| Wohnbaufläche (`AX_Wohnbauflaeche`) | 60 % |
| Bes. funktionaler Prägung | 60 % |
| Sport & Freizeit (`AX_SportFreizeitUndErholungsflaeche`) | 20 % |
| Friedhof (`AX_Friedhof`) | 20 % |
| Default (unbekannt) | 70 % |

#### Slider-Maximum

`n_trees_max = floor(pflanzbare_flaeche / 100 m²)`. Die **100 m²/Baum** entsprechen ~10 m Pflanzabstand — dem empfohlenen Abstand für Bäume 2. Ordnung (bis 20 m Höhe) nach der **FLL-Richtlinie „Empfehlungen für Baumpflanzungen", Teil 1, 2. Ausgabe 2015**. Das ist ein pflanzpraktischer/UX-Cap, **kein Modell-Cap**. Die pflanzbare Fläche überschätzt tendenziell die real verfügbaren Standorte (unterkellerter Boden, private Hinterhöfe, Leitungskonflikte) — die Maximalzahl ist eine **rechnerische Obergrenze**, kein Pflanzplan. Ein Baumscheiben-Hinweis unter dem Slider erklärt, dass zusätzliche Pflanzungen in versiegelter Fläche über Baumscheiben möglich, aber nicht im Modell erfasst sind.

#### Vorher/Nachher-Block
Zeigt Baumanzahl (Bestand aus Bbox-Zählung + neu), Temperatur (Ø LST der Auswahl + Δ), CO₂-Bindung (Bestand aus `treeCount · Koeffizient` + neu) und Kronendeckung (Bestand/Neu/Frei als gestapelten Balken). Zusätzlich eine **stadtweite Beschattungs-Hochrechnung**: `effective_new_pct` wirkt auf die Auswahlfläche und wird auf `city_cell_count · 10.000 m²` skaliert.

#### Ausgabe-Beispiel (JSON)
```json
{ "n_trees": 50, "area_m2": 120000, "existing_coverage_pct": 0.0,
  "new_crown_area_ratio": 0.021, "effective_new_pct": 2.06,
  "total_coverage_pct": 2.06, "delta_lst_celsius": -0.17, "co2_kg_year": 625.0,
  "coefficients_used": { "lst_per_pct_canopy": -0.083, "land_use": "mixed",
    "crown_area_m2": 50.0, "co2_kg_per_tree_year": 12.5 }, "caveats": [ … ] }
```

---

### 7b · Sub-Tab Entsiegelung (`GET /api/simulate/wasser`)

**Ausgaben:** zusätzliche Versickerung (m³/Jahr), Abflussanteil vorher/nachher, Personen-Jahrestrinkwasserbedarf, Grundwasserneubildungs-Schätzwert. Bedienung: Polygone auswählen, je Flächentyp Von-/Zu-Belag setzen, Fläche per Slider.

#### Berechnung (Rational-Formel, nur Versickerung)

```
delta_C              = Ψ_von − Ψ_zu
infiltration_m3_year = max(0, A · N · delta_C)
retention_pct        = (1 − Ψ_zu) · 100
context_persons      = infiltration_m3_year / 46,4
```

mit A = entsiegelte Fläche (m²), **N = 0,5735 m/Jahr** (DWD Station 05705), Ψ = Abflussbeiwert. `max(0, …)` fängt den Fall ab, dass der Zielbelag stärker versiegelt ist als der Ausgangsbelag (dann zusätzliches Caveat). Unbekannte Belagstypen → HTTP 422.

**Beispiel:** 1.000 m² Asphalt → Schotterrasen: delta_C = 0,90 − 0,30 = 0,60 → Versickerung = 1.000 · 0,5735 · 0,60 = **344,1 m³/Jahr**.

#### Abflussbeiwerte Ψ je Belagstyp

Ψ = Anteil des Niederschlags, der **abfließt** (nicht versickert); 0 = alles versickert, 1 = nichts.

| Belagstyp (`key`) | Ψ | Primärquelle |
|---|---|---|
| Asphalt / Beton (`asphalt`) | **0,90** | DWA-A138 / LfU Bayern |
| Pflaster dichte Fugen (`pflaster_dicht`) | **0,75** | DWA-A138 / LfU Bayern |
| Pflaster offene Fugen (`pflaster_offen`) | **0,50** | DWA-A138 / LfU Bayern |
| Lehm-/Kies-/Splittdecke (`lehm_kies`) | **0,40** | Leitfaden Bayreuth 2024 |
| Sickerpflaster (`sickerpflaster`) | **0,30** | Leitfaden Bayreuth 2024 (0,0–0,6, Mitte) |
| Schotterrasen (`schotterrasen`) | **0,30** | DWA-A138 / LfU Bayern |
| Rasengitter (`rasengitter`) | **0,15** | DWA-A138 / LfU Bayern |
| Rasenwabe (`rasenwabe`) | **0,15** | Leitfaden Bayreuth 2024 |
| Rasendecke / Wiese (`rasendecke`) | **0,05** | DWA-A138 / LfU Bayern (0,0–0,1, Mitte) |

**DWA-A138:** technische Norm der Deutschen Vereinigung für Wasserwirtschaft, Abwasser und Abfall — *Planung, Bau und Betrieb von Anlagen zur Versickerung von Niederschlagswasser* (2005, Neufassung 2020); in Bayern durch das LfU verbindlich eingeführt. **Leitfaden Bayreuth 2024:** Landratsamt Bayreuth, *Leitfaden Flächenentsiegelung*, ergänzt DWA-A138 um Kostenkennwerte und Bayern-spezifische Bandbreiten. (Hinweis: Der Asphalt-Wert wurde von früher 0,95 aus dem Leitfaden auf 0,90 nach DWA-A138 angeglichen.)

#### Slider-Maximum & Realisierbarkeit

Das Slider-Maximum ist die **Σ versiegelte Fläche** der Auswahl (`Σ area_m2 · seal_rate`). Zusätzlich zeigt das Panel einen informativen Schätzwert „typisch entsiegelbar" (kein harter Cap), weil ein Großteil der versiegelten Fläche baulich gebunden ist (Fundamente, Hallen):

| Flächentyp | Realisierbarkeitsfaktor | Begründung |
|---|---|---|
| Parkplatz | 70 % | Großteil funktional entbehrlich |
| Platz/Markt | 45 % | Teilbegrünung je nach Nutzung |
| Industrie/Gewerbe | 40 % | Teile der Hof-/Randflächen |
| Gemischte Nutzung | 35 % | — |
| Bes. funktionaler Prägung | 35 % | — |
| Wohnbaufläche | 30 % | Einfahrten, Höfe, Vorgärten |
| Straße | 10 % | nur Seitenstreifen/Bankette |
| Default | 40 % | — |

Diese Faktoren sind fachliche Plausibilitätsschätzungen und dienen nur der Einordnung („Typisch realistisch: ~X m²").

#### Ergebnis-Einordnungen

- **Personen-Jahrestrinkwasserbedarf:** `infiltration / 46,4`. Grundlage: **127 L/Tag/Person** (BDEW Wasserstatistik 2023, Branchenbild Wasser) → 127 · 365 / 1000 ≈ **46,4 m³/Person/Jahr**.
- **Anschaulicher Kontext** (`formatWasserKontext`): < 2 m³ → Eimer à 10 L; < 150 m³ → Badewannen à 150 L; sonst → Schwimmbecken à 50 m³.
- **Grundwasserneubildung (Schätzwert):** `infiltration · [0,15 … 0,30]`. Grundlage: Ca. **15–30 %** der oberflächlich versickernden Menge erreichen in Bayern das Grundwasser (LfU Bayern, Planungsrichtwert ohne detaillierte Bodenerkundung). Der Rest verdunstet, wird von Pflanzen aufgenommen oder fließt als Interflow ab. Lokale Bodeneigenschaften (kf-Wert), Grundwassertiefe und Bebauungsdichte sind **nicht** berücksichtigt.

#### Warum die Entsiegelung kein Δ°C liefert
Der Koeffizient `LST_PER_PCT_UNSEALING = −0,03 °C/%` (Tervooren 2015, Potsdam) existiert in `simulation_params.py`, wird aber **bewusst nicht** angewendet: Er ist auf **Aggregatebene** (ganzes Bezugsgebiet) kalibriert. Auf eine einzelne Polygonfläche angewendet ergäbe er physikalisch unsinnige Mikro-Werte (z. B. −0,006 °C), die eine Scheingenauigkeit vortäuschen. Die Wasser-Simulation gibt deshalb nur den flächenscharf berechenbaren Wassernutzen aus. Eine v2 müsste das Δ°C auf **Bezugsgebiets-Ebene** ausweisen (z. B. „Δ°C für diesen Stadtbezirk bei X % Gesamtentsiegelung").

---

## 8 · Koeffizienten-Master-Referenz

Alle Werte aus `backend/simulation_params.py`. Die Frontend-Kopie `frontend/src/utils/simulate.js` muss synchron gehalten werden.

| Koeffizient | Wert | Quelle & Herleitung | Status in App |
|---|---|---|---|
| `LST_PER_PCT_CANOPY_MIXED` | **−0,083 °C/%** | García de León et al. 2025 (JURSE), München, Mischgebiet | **Angewendet** (Baum-Sim) |
| `LST_PER_PCT_CANOPY_OVERALL` | −0,069 °C/% | García de León et al. 2025, gesamtes Stadtgebiet | hinterlegt |
| `LST_PER_PCT_CANOPY_RECREATIONAL` | −0,038 °C/% | García de León et al. 2025, Erholungsflächen (R² 0,41) | hinterlegt |
| `CROWN_AREA_M2_DEFAULT` | **50 m²** | konservativer Default (s. u.) | angewendet |
| `TRANSPIRATION_LB3_KG_M2_DAY` | 0,19 kg/m²/Tag | Stratopoulos-Le Chalony 2020 (TUM-Diss.), feuchteadaptiert | hinterlegt, **nicht** in v1 gerechnet |
| `TRANSPIRATION_LB6_KG_M2_DAY` | 0,17 kg/m²/Tag | dieselbe Quelle, trockenheitstolerant (−11 %) | hinterlegt, nicht in v1 |
| `LATENT_HEAT_KWH_PER_KG` | 0,628 kWh/kg | Physik: 2260 kJ/kg ÷ 3600 | für v2 (Transpirationskühlung) |
| `LST_PER_PCT_UNSEALING` | −0,03 °C/% | Tervooren 2015, Potsdam (R² 0,75/0,80) | hinterlegt, **bewusst nicht** angewendet |
| `RUNOFF_COEFFICIENTS` (Ψ) | 0,90 … 0,05 | DWA-A138 / LfU Bayern; Leitfaden Bayreuth 2024 | **angewendet** (Wasser-Sim) |
| `ANNUAL_RAINFALL_WUERZBURG_M` | 0,5735 m/Jahr | DWD Station 05705, Normalperiode 1991–2020 | angewendet |
| `CO2_KG_PER_TREE_YEAR` | **12,5 kg** | Dr. Daniel Klein, Wald-Zentrum Uni Münster | angewendet |
| `SEAL_RATE_BY_TYPE` | 0,98 … 0,20 | Literaturwerte (UBA 141/2021, Bayreuth 2024) | angewendet (Slider-Cap) |
| `CELL_AREA_M2` | 10.000 m² | Geometrie 100×100 m | — |
| `MIN_GROUND_PER_TREE_M2` | 100 m² | FLL-Richtlinie, Bäume 2. Ordnung | Slider-Cap (kein Modell-Cap) |
| `WATER_USE` | 46,4 m³/Person/Jahr | BDEW 2023 (127 L/Tag) | Ergebnis-Einordnung |

**Zur Kronenfläche 50 m²:** Bewusst konservativ gewählt. Reife Kronen der vier Würzburger Hauptarten liegen laut Moser-Reischl et al. 2021 (Würzburg-Direktstudie, n=75–89 je Art) bei **62–124 m²**; Pretzsch et al. 2015 nennt für DBH 25 cm 65,6 m². 50 m² liegt bewusst darunter, um junge/mittelalte Neupflanzungen nicht zu überschätzen — **keine** Endausbau-Annahme. Typische Bandbreite 30–80 m² je nach Art und Alter. Für eine spätere Version ist die Nutzung des gemessenen `kronenbrei`-Felds vorgesehen (`CPA = π·(kronenbrei/2)²`), mit allometrischem Fallback aus Moser-Reischl 2021.

**Zur García-de-León-Quelle:** García de León, A. S. et al. (2025): *The Relation of Land Surface Temperature and Trees across Different Urban Land Use Classes based on Remote Sensing*, JURSE 2025, IEEE. Lineare Regression LST ~ Baumkronenanteil über 8.584 ATKIS-Nutzungspolygone; Studienstadt München, Daten Sommer 2020, > 166.000 Einzelbäume aus Luftbild-Segmentierung. R² = 0,41 (Erholung) bis 0,61 (Verkehr). Autoren überwiegend Univ. Würzburg / DLR → als methodisch und regional übertragbar eingestuft.

**Zur CO₂-Zahl 12,5 kg/Jahr:** Herleitung Dr. Daniel Klein (Wald-Zentrum Uni Münster): Buche, 23 m, ∅ 30 cm → ~600 kg Trockenmasse → 1.000 kg CO₂ in 80 Jahren. Gilt für **ausgewachsene** Laubbäume im Forstbestand; Neupflanzungen binden in den ersten Jahren deutlich weniger. (Diese Quelle ist noch nicht als eigene Wiki-Seite dokumentiert — vor einem Produktionsrelease nachzuholen.)

---

## 9 · Vergleich der Kühleffekte (Kontextwissen)

Zur Einordnung, warum Bäume und Entsiegelung unterschiedlich wirken:

| Maßnahme | Kühlkoeffizient | Quelle |
|---|---|---|
| +1 % Baumkronendeckung (München, Mischgebiet) | −0,083 °C LST | García de León 2025 |
| +1 % Baumkronendeckung (München, gesamt) | −0,069 °C LST | García de León 2025 |
| −1 % Versiegelung (Potsdam) | −0,030 °C LST | Tervooren 2015 |

→ Bäume kühlen pro Prozentpunkt **~2,3–2,8× stärker** als reine Entsiegelung. Entsiegelung liefert dafür zusätzlichen Wassernutzen (Versickerung, Grundwasser, Biodiversität). Weitere Benchmarks aus dem Wiki: Bäume vs. Stadtgewebe 8–12 K Kühleffekt in Zentraleuropa (Schwaab 2021); Bäume 2–4× effektiver als baumlose Grünflächen.

---

## 10 · Alle Annahmen & methodischen Einschränkungen

**10.1 Örtliche Übertragbarkeit der Koeffizienten**

| Koeffizient | Ursprung | Transfer nach Würzburg | Status |
|---|---|---|---|
| −0,083 °C/% Krone | München (Cfb/Dfb) | gleiche Klimazone, Würzburger Forscher | angewendet, plausibel, nicht validiert |
| −0,03 °C/% Entsiegelung | Potsdam (Cfb) | etwas kontinentaler (Dfb) | nicht angewendet (nur Aggregatebene gültig) |
| Ψ-Abflussbeiwerte | Bayern (DWA-A138) | Normwerk direkt anwendbar | gültig |
| Versiegelungsgrade | Literaturmittel | keine Würzburg-Messung | Schätzung |

**10.2 LST ≠ Lufttemperatur.** Die Landoberflächentemperatur ist ein fernerkundlicher Proxy. Bei Vollsonne liegt sie mehrere °C über der Lufttemperatur; an bedeckten Tagen nähern sich beide an. Alle Δ-Werte beziehen sich auf LST. Für Komfortaussagen (PET, UTCI) wäre ein eigenes Modell nötig. — *Dies ist der einzige Hinweis, der prominent in der App bleiben sollte (Banner `LST ≠ Luft`).*

**10.3 Statistische Modelle, keine physikalische Simulation.** Beide Simulationen beruhen auf Regressionskoeffizienten aus Felddaten. Sie berücksichtigen keine Rückkopplungen (Wind, Strahlungsgeometrie, Feuchtehaushalt). Eine physikalische Mikroklimasimulation (ENVI-met, WRF) wäre präziser, aber deutlich rechen- und dateneintensiver.

**10.4 100-m-Rasterauflösung.** Jede Zelle ist eine 100×100-m-Fläche; feinere Unterschiede innerhalb einer Zelle sind nicht dargestellt.

**10.5 Kronenfläche 50 m²** ist ein konservativer Default für mittelalte Bäume; reife Würzburger Kronen liegen bei 62–124 m², junge Neupflanzungen deutlich darunter. Δ°C und Kronendeckung gelten für mittelalte bis reife Bäume.

**10.6 Versiegelungsgrade** sind grobe Typ-Mittelwerte aus Literatur, keine gemessene Per-Zellen-Versiegelung. „Unversiegelt" ≠ tatsächlich verfügbar (Privatgärten, Bestandsvegetation, Abstandsflächen); die pflanzbare Fläche ist eine Obergrenze, kein Pflanzplan.

**10.7 CO₂ 12,5 kg/Jahr** gilt für ausgewachsene Waldbäume; Stadtbäume wachsen oft langsamer (Bodenverdichtung, Hitze, Wurzelraum). CO₂-Bindung ist ein Nebeneffekt — die primäre Klimafunktion von Stadtbäumen ist Kühlung durch Transpiration und Beschattung.

**10.8 Zensus-Geheimhaltung (§ 16 BStatG):** siehe Kap. 2.3. Betroffene Zellen werden transparent behandelt (`clip(0,1)`, Markierung, kein HVI bei fehlender Altersstruktur).

**10.9 Ungefärbte Kartenflächen** liegen außerhalb der Stadtgrenze oder wurden vom Sensor nicht erfasst (Wolken im Komposit-Zeitraum).

### Ausstehende Verbesserungen
1. **Würzburg-Kalibrierung** eigener LST×Kronen-Koeffizienten aus lokalen Daten.
2. **Lokale Bodenversickerung** aus LfU-Bayern-Bodendaten (kf-Werte, WFS) statt Literatur-Ψ.
3. **Copernicus/GHSL-Imperviousness** (10 m, `JRC/GHSL/P2023A/GHS_BUILT_S`) statt Literatur-Versiegelungsgrade.
4. **Kronenfläche aus Kataster** (`kronenbrei`) statt Default 50 m².
5. **Transpirationskühlleistung (kWh)** als v2-Output der Baum-Simulation.
6. **Entsiegelungs-Δ°C** auf Bezugsgebiets-Ebene.

---

## 11 · Konsolidierung der In-App-Hinweisfelder

Vorschlag, welche Felder nach Einführung dieser Doku-Seite reduziert werden können. Jede Zeile verweist auf das Doku-Kapitel, das den Inhalt vollständig trägt.

| In-App-Element | Empfehlung | Doku-Kapitel |
|---|---|---|
| Hitzeatlas · Hinweisbox (4 Punkte) | auf 1 Zeile + Doku-Link reduzieren | 2.1, 2.2, 10.4, 10.9 |
| Hitzeatlas · Top-5-Methodik-Aufklapp | Kurzsatz behalten, Details verlinken | 4 (Hotspots) |
| Vulnerabilität · Formelkarte (Aufklapp-Erklärtext) | Formel sichtbar lassen, Erklärtext verlinken | 5 |
| Vulnerabilität · Interpretations-Box | behalten (kurz) | 5 |
| Baum-Sim · Methodik & Einschränkungen | auf Doku-Link reduzieren | 7a, 8, 10 |
| Baum-Sim · Baumscheiben-Hinweis | behalten (kontextspezifisch) | 7a |
| Wasser-Sim · Methodik (Formel + 3 Tabellen) | auf Doku-Link reduzieren | 7b, 8 |
| `LST ≠ Luft`-Banner | **behalten** (wichtigster Kernhinweis) | 10.2 |

**Empfohlenes Muster:** je Tab ein dezenter „ℹ Methodik & Quellen"-Link, der auf den passenden Anker dieser Doku-Seite springt (z. B. `/dokumentation#7a-baumpflanzung`). Der einzige inhaltliche Hinweis, der prominent in den Karten bleiben sollte, ist `LST ≠ Luft`.

---

## 12 · Glossar

| Begriff | Definition |
|---|---|
| **LST** | Land Surface Temperature — Oberflächen-/Strahlungstemperatur, gemessen im thermischen Infrarot. Nicht die Lufttemperatur. |
| **`lst_norm`** | Rang-normierter LST-Wert 0–1 (0 = kälteste, 1 = heißeste Zelle im Stadtgebiet). |
| **HVI** | Heat Vulnerability Index — gewichteter Score 1–10 aus LST-Rang und (adjustiertem) Seniorenanteil. |
| **Ψ (Abflussbeiwert)** | dimensionslos 0–1: Anteil des Niederschlags, der oberflächlich abfließt (1 = vollständig undurchlässig). |
| **Versiegelungsgrad** | Anteil einer Flächeneinheit, der physisch versiegelt ist. |
| **Rational-Formel** | vereinfachtes Hydrologiemodell: Abflussvolumen = Fläche × Niederschlag × Abflussbeiwert. |
| **Bayesian Shrinkage** | Empirischer Bayes-Schätzer: kleine Rasterzellen werden zur Stadtmittelrate gezogen, um Small-Numbers-Verzerrung zu reduzieren. |
| **Crookston & Stage (1999)** | negativ-exponentielles Überlappungsmodell für projizierte Kronendeckung: `Deckung = 1 − exp(−Σ Kronenfläche / Fläche)`. |
| **NDVI** | Normalized Difference Vegetation Index — Vegetationsstärke, 0 (versiegelt) bis ~0,7+ (dichte Vegetation). |
| **LAEA / EPSG:3035** | Lambert Azimuthal Equal Area — Koordinatensystem der Destatis-Gitterdaten. |
| **ATKIS** | Amtliches Topographisch-Kartographisches Informationssystem — amtliche Flächennutzungsklassifikation. |
| **DWA-A138** | technische Norm für Versickerungsanlagen; Primärquelle der Abflussbeiwerte. |
| **FLL-Richtlinie** | „Empfehlungen für Baumpflanzungen" — Grundlage für den Pflanzabstand (100 m²/Baum, 2. Ordnung). |

---

## 13 · Quellenverzeichnis

| Quelle | Datensatz / Beitrag | Lizenz |
|---|---|---|
| Google Earth Engine (Landsat 8+9, USGS) | LST-Raster `ST_B10`, Sommer-Median 2023–2025 | CC-PDM-1.0 |
| Destatis | Zensus 2022, 100-m-Gitter (Alter, Einwohner) | dl-de/by-2-0 |
| Stadt Würzburg (opendata) | Baumkataster (44.647), Stadtbezirke | CC BY 4.0 |
| LDBV Bayern | ATKIS Basis-DLM (`sie02_f`, `ver01_f`) | CC BY 4.0 |
| OpenStreetMap | Parkplätze, Plätze, Flachdächer | ODbL |
| DWD (Climate Data Center) | Niederschlag Station 05705, 1991–2020 | DWD Open Data |
| DWA-A138 / LfU Bayern | Abflussbeiwerte Ψ | Normwerk |
| Landratsamt Bayreuth (2024) | Leitfaden Flächenentsiegelung, ergänzende Ψ/Kosten | öffentlich |
| García de León et al. (2025), München | LST×Kronen-Koeffizienten | wissenschaftl. Publikation |
| Crookston & Stage (1999), USDA RMRS-GTR-24 | Überlappungsmodell Kronendeckung | öffentlich |
| Moser-Reischl et al. (2021) | Würzburg-Kronenallometrie | wissenschaftl. Publikation |
| Pretzsch et al. (2015) | Kronengrößen 22 Baumarten | wissenschaftl. Publikation |
| Gray et al. (2021) | Beer-Lambert-Überlappungsmodell (Validierung) | wissenschaftl. Publikation |
| Stratopoulos-Le Chalony (2020), TU München | Transpirationsraten LB3/LB6 | Dissertation |
| Tervooren (2015), Potsdam | Entsiegelungskoeffizient −0,03 °C/% | wissenschaftl. Publikation |
| Dr. Daniel Klein, Wald-Zentrum Uni Münster | CO₂-Bindung 12,5 kg/Baum/Jahr | Expertenherleitung |
| BDEW (2023) | Trinkwasserverbrauch 127 L/Tag | öffentlich |
| LfU Bayern | Grundwasserneubildung 15–30 % | öffentlich |
| UBA Texte 141/2021; Arnold & Gibbons (1996); DIN 18005 | Versiegelungsgrade je Landnutzung | öffentlich / Normwerk |

---

*Diese Doku bündelt den Inhalt von `simulation_params.py`, `vuln_formula.py`, den Backend-Routern und dem Wiki-Submodul `urban-heat-wiki/wiki/`. Bei Koeffizientenänderungen zuerst die Wiki-Quellseite, dann `simulation_params.py`, dann diese Doku aktualisieren.*
