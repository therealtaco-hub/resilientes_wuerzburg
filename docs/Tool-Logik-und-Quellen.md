# Resilientes Würzburg — Tool-Logik und Quellen

**Stand:** Juni 2026 | **Version:** 1.0  
**Projekttyp:** Interaktive Geodaten-Webanwendung zur Analyse urbaner Hitzeinseln, sozialer Vulnerabilität und Entsiegelungspotenzial in Würzburg  
**Stack:** FastAPI (Python) · React/Vite · deck.gl · Zustand · Landsat / GEE · Destatis Zensus 2022 · ATKIS Basis-DLM

---

## 1 · Systemüberblick

Das Tool verbindet drei thematische Datenebenen zu einer kohärenten Analyseoberfläche:

| Ebene | Inhalt | Primärquelle |
|---|---|---|
| **Hitze** | Land Surface Temperature (LST), 100 m-Raster | Landsat 8+9, Google Earth Engine |
| **Soziales** | Seniorenanteil 65+, Einwohnerdichte, 100 m-Gitter | Destatis Zensus 2022 |
| **Fläche** | Versiegelte Flächen nach Flächentyp | ATKIS Basis-DLM Bayern + OpenStreetMap |

Alle Datenebenen sind räumlich auf das **Destatis 100 m-LAEA-Gitter (EPSG:3035)** harmonisiert, was eine pixelgenaue Überlagerung ohne Resampling-Artefakte ermöglicht.

---

## 2 · Tab: Dashboard (`/`)

### Funktion
Einstiegsseite mit aggregierten Kennzahlen auf Stadtbezirksebene. Zeigt vier KPI-Kacheln und je drei Top-Listen pro Dimension.

### Daten und Verarbeitung
Der Backend-Endpoint `GET /api/stadtbezirke` führt räumliche Joins gegen alle vier Datensätze durch:

| Kennzahl | Berechnung | Datengrundlage |
|---|---|---|
| `lst_median` / `lst_max` | Median / Maximum aller LST-Pixel innerhalb des Bezirks-Polygons | Landsat 8+9 LST-GeoTIFF, Sommer-Median 2023–2025 |
| `hvi_mean` | Bevölkerungsgewichteter Durchschnitt: Σ(HVI × Einwohner) / Σ(Einwohner) | HVI-Score je Rasterzelle (→ Kap. 4) |
| `tree_count` | Anzahl Baumkataster-Punkte innerhalb des Bezirks | Baumkataster Würzburg, opendata.wuerzburg.de |
| `entsiegelung_m2` | Σ Fläche aller ATKIS+OSM-Polygone | ATKIS Basis-DLM + OSM |
| `einwohner` | Σ Einwohner aus Zensus-Rasterzellen mit Polygon-Schnitt | Destatis Zensus 2022 |

**Wichtig:** `hvi_mean` ist bewusst **bevölkerungsgewichtet** (nicht ungewichtet arithmetisch), um dünn besiedelte Randrandlagen mit zufällig hohem Score nicht überzubewerten.

### Quellen
- opendata.wuerzburg.de — Stadtbezirk-Polygone (13 Polygone, WGS84)
- Landsat 8+9 via GEE (→ Kap. 3)
- Destatis Zensus 2022 (→ Kap. 4)

---

## 3 · Tab: Hitzeatlas (`/hitzeatlas`)

### Funktion
Choropleth-Karte der Landoberflächentemperatur (LST) auf 100 m-Rasterebene. Überlagert mit dem vollständigen Baumkataster Würzburg (44.647 Einträge). Hover-Tooltip und klickbares Baum-Popup. Top-5-Hitzespots-Karte mit aufklappbarer Methodik.

### Daten: Landsat 8+9 LST

**Quelle:** Google Earth Engine (GEE) · Kollektionen `LANDSAT/LC08/C02/T1_L2` und `LANDSAT/LC09/C02/T1_L2`  
**Band:** `ST_B10` (Thermisches Infrarot, 10,6–12,5 μm), Level-2 Science Product  
**Zeitraum:** Sommer-Monate (Juni–August) 2023–2025, 3-Jahres-Median-Komposit  
**Räumliche Auflösung:** 100 m (exportiert mit `crsTransform=[100, 0, 4 300 000, 0, −100, 2 985 000]`, EPSG:3035, exakt auf Destatis-Gitter ausgerichtet)  
**QA-Masking:** `QA_PIXEL`-Band, Maske für Wolken, Wolkenschatten und Schnee  
**Skalierung:** GEE wendet DN→K→°C direkt an; Backend liest fertige °C-Werte aus Band 1 (kein weiteres Rescaling)  
**Normierung:** Rang-basierte Normierung (`scipy.stats.rankdata`) auf 0,0–1,0 für kartenübergreifende Vergleichbarkeit (Spalte `lst_norm`)

**Warum Median-Komposit statt Einzelszene?**  
Einzelszenen sind stark von kurzfristigen Wolken- und Staubanomalien abhängig. Der 3-Jahres-Median (2023–2025) stabilisiert das Signal und reduziert szenenspezifische Artefakte bei gleichzeitiger Aktualität.

### Daten: Baumkataster

**Quelle:** Stadt Würzburg, opendata.wuerzburg.de — Bulk-Export als GeoParquet  
**Umfang:** 44.647 Bäume mit Attributen `baumart`, `baumart_la`, `baumtyp`, `baumhoehe`, `kronenbrei` (Kronendurchmesser), `stammumfan`  
**Koordinatensystem:** OGC:CRS84 (= WGS84 lon/lat)  
**Nutzung im Tool:** Visualisierung (ScatterplotLayer), Radius = `max(3 m, kronenbrei / 2)` — Punkte skalieren maßstabstreu mit dem Zoom-Level  

**Hinweis:** Das Kataster enthält kein `pflanzjahr`-Feld im vorliegenden Export; die Baumarten-Information (`baumtyp`) differenziert Laub- und Nadelbäume (verschiedene Farben im Layer).

### Verarbeitungsschritte im Backend

```
1. load_lst()         → liest Band 1 aus GeoTIFF, berechnet Pixel-Bounding-Boxes
                         aus rasterio-Transform, speichert x_mp_100m / y_mp_100m
                         als Integer-Mittelpunkte (EPSG:3035) als Merge-Schlüssel
2. load_tree_cadastre() → liest lokales Parquet, reprojiziiert nicht (bereits WGS84)
3. GET /api/lst       → gibt GeoJSON mit Feldern lst_celsius, lst_norm zurück
4. GET /api/trees     → gibt GeoJSON mit allen 44.647 Punkt-Features zurück
```

---

## 4 · Tab: Vulnerabilität (`/vulnerabilitaet`)

### Funktion
Choropleth der **Hitzevulnerabilität (HVI)** auf 100 m-Rasterebene. Kombiniert thermische Belastung (LST) mit sozialer Verletzlichkeit (Seniorenanteil 65+). Separate Toggle-Layer für LST, Demografie und HVI. Stadtbezirks-Choropleth auf `hvi_max`.

### HVI-Formel

**Zentralformel (linear-gewichtet):**

```
HVI_raw = 0,6 × lst_norm + 0,4 × anteil_65plus_adj
HVI      = HVI_raw × 9 + 1        (Skalierung auf 1–10)
```

**Gewichtung:**
- `lst_norm` (Rang-normiert 0–1): Gewicht **0,6** — Hitzeexposition ist der dominante Faktor
- `anteil_65plus_adj` (Bayesian-adjustiert 0–1): Gewicht **0,4** — soziale Sensitivität

**Wichtig:** Beide Faktoren werden zu 1,0 normiert, was der Formel erfordert.

### Bayesian Shrinkage des Seniorenabteils

Das Destatis-Zensus-Gitter enthält viele dünn besiedelte Zellen (< 10 Einwohner). Ohne Korrektur würde eine Zelle mit 3 Einwohnern, von denen alle über 65 sind, `anteil_65plus = 1,0` erhalten und damit fälschlicherweise einen Extremwert HVI = 10 bekommen.

**Lösung: Empirischer Bayes-Schätzer (Credibility-Formel):**

```
anteil_65plus_adj = (n × beobachtet + N_prior × stadtmittel) / (n + N_prior)
```

mit `N_prior = 50` und `stadtmittel` = bevölkerungsgewichteter Stadtmittelwert für Würzburg.

*Interpretation:* Bei n = 50 Einwohnern liegt die Glaubwürdigkeit bei genau 50 % — die Zelle wird halb zur Stadtmittelrate, halb zum beobachteten Wert gezogen. Bei n >> 50 dominiert der beobachtete Wert.

### Daten: Destatis Zensus 2022

**Quelle:** Statistisches Bundesamt (Destatis), [zensus2022.de](https://www.destatis.de/DE/Themen/Gesellschaft-Umwelt/Bevoelkerung/Zensus2022/)  
**Gitter:** 100 m × 100 m LAEA-Gitter (EPSG:3035) — identisches Koordinatensystem wie LST-Export  
**Felder:**
- `GITTER_ID_100m` — Zellen-ID (Merge-Schlüssel mit LST)
- `a65undaelter` — Einwohner 65+
- `Einwohner` — Gesamtbevölkerung je Zelle

**Geheimhaltungsrundung (§ 16 BStatG):** Destatis rundet kleine Zellen stochastisch. Da Altersklassen und Gesamtbevölkerung aus getrennten CSVs stammen, kann `a65undaelter > Einwohner` entstehen. Fix im Backend: `.clip(0, 1)` mit Markierung `anteil_65plus_clamped: true`.

**Gitter-Harmonisierung:** Der LST-GeoTIFF wurde in GEE mit identischem `crsTransform=[100, 0, 4 300 000, 0, −100, 2 985 000]` exportiert. LST- und Zensus-Zellen können daher über Integer-Mittelpunkte `(x_mp_100m, y_mp_100m)` via `pd.merge()` verknüpft werden — kein `gpd.sjoin()` nötig.

### Verarbeitungsschritte im Backend

```
1. load_zensus()              → merged Alters- + Bevölkerungs-CSV,
                                 berechnet anteil_65plus, clip(0,1)
2. load_lst()                 → wie oben
3. build_hvi_geodataframe()   → merge auf (x_mp_100m, y_mp_100m),
                                 berechnet global_65_rate (bevölkerungsgewichtet),
                                 wendet shrink_senior_rate() an,
                                 ruft compute_hvi() auf → HVI 1–10
4. GET /api/vulnerability     → gibt GeoJSON mit hvi, lst_celsius,
                                 lst_norm, anteil_65plus_adj zurück
```

---

## 5 · Tab: Entsiegelung (`/entsiegelung`)

### Funktion
Karte aller versiegelten Flächen nach Flächentyp (ATKIS + OSM). Keine Scoring-Funktion — reine Visualisierung der Ausgangssituation. Kategorie-basierte Einfärbung, filterbar nach ATKIS/OSM-Quelle.

### Daten: ATKIS Basis-DLM Bayern

**Quelle:** Bayerisches Landesamt für Digitalisierung, Breitband und Vermessung (LDBV), [geodaten.bayern.de](https://geodaten.bayern.de/opengeodata/)  
**Datensatz:** `bkg_shape_712.zip` — ATKIS Basis-DLM Bayern  
**Relevante Layer:** `sie02_f.shp` (Siedlungsflächen), `ver01_f.shp` (Verkehrsflächen)  
**Koordinatensystem:** EPSG:25832 (UTM Zone 32N)  
**Filterung:** Würzburg-Bounding-Box `(540 000, 5 505 000, 580 000, 5 540 000)` beim Einlesen, anschließend präziser `.cx[9.87:10.01, 49.75:49.83]`-Clip in EPSG:4326  
**Flächentyp-Key:** `OBJART_TXT as-is` (z. B. `AX_Wohnbauflaeche`, `AX_IndustrieUndGewerbeflaeche`)  
**Fläche:** berechnet in EPSG:25832 vor Reprojizierung (metrisch korrekt)

### Daten: OpenStreetMap (OSM)

**Quelle:** OpenStreetMap via `osmnx`-Bibliothek (Python), kein separater Download  
**Extrahierte Objekttypen:**
- `amenity=parking` → `osm_parking` (Parkplätze)
- `place=square` → `osm_square` (Plätze/Märkte)
- `building=*` mit `roof:shape=flat` ODER `building ∈ {industrial, commercial, supermarket, retail}`, **ausgenommen** begrünte Dächer (`roof:material=grass` / `roof:surface=green`) → `osm_flat_roof_industrial` (Flachdächer)

**Hinweis:** Flachdächer sind in der Simulation nicht wählbar (kein Bodeneingriff), werden aber in der Entsiegelungskarte als Hinweis auf Begrünungspotenzial dargestellt.

---

## 6 · Tab: Simulation (`/simulation`)

Die Simulation ist in zwei Sub-Tabs gegliedert, die jeweils einen eigenen Backend-Endpoint ansprechen.

---

### 6a · Sub-Tab: Baumpflanzung

#### Funktion
Nutzer wählt LST-Kacheln (100 m × 100 m) in der Karte aus und stellt die Anzahl der Neupflanzungen ein. Das Tool berechnet:
- Δ Landoberflächentemperatur (°C)
- Δ CO₂-Bindung (kg/Jahr)
- Δ Kronendeckung (%)

#### Wissenschaftliche Grundlage

**Koeffizient LST × Kronendeckung:**

| Parameter | Wert | Quelle |
|---|---|---|
| ΔLST pro 1 % Kronendeckungszunahme (Mischgebiet) | **−0,083 °C** | García de León et al. (2025), München |
| ΔLST pro 1 % Kronendeckung (Gesamtstadt) | −0,069 °C | García de León et al. (2025), München |
| ΔLST pro 1 % Kronendeckung (Erholungsflächen) | −0,038 °C | García de León et al. (2025), München |
| CO₂-Bindung pro Baum und Jahr | 12,5 kg | Dr. Daniel Klein, Universität Münster |
| Kronenfläche pro Baum (Default) | 50 m² | Literaturmittelwert |
| Transpiration feuchtigkeitsadaptierte Arten (LB3) † | 0,19 kg H₂O m⁻² Tag⁻¹ | Stratopoulos-Le Chalony (2020), TU München (Dissertation) |
| Transpiration trockenheitstolerante Arten (LB6) † | 0,17 kg H₂O m⁻² Tag⁻¹ | Stratopoulos-Le Chalony (2020), TU München (Dissertation) |

† Die Transpirationsraten sind als Koeffizienten hinterlegt, fließen in **v1 aber noch nicht** in die Berechnung ein (die Transpirationskühlleistung in kWh ist für v2 vorgesehen — siehe `simulation-logic.md`, Schritt 3).

**Quelle zu García de León:** García de León, A. S. et al. (2025): *The Relation of Land Surface Temperature and Trees across Different Urban Land Use Classes based on Remote Sensing*. Joint Urban Remote Sensing Event (JURSE) 2025, IEEE (DOI 10.1109/JURSE…). Methodisch verwendete Koeffizienten aus linearer Regression LST ~ Baumkronenanteil über 8.584 ATKIS-Nutzungspolygone. Studienstadt München, Daten: downscaled LST-Produkt Sommer 2020 + >166.000 Einzelbäume aus Luftbild-Segmentierung. R² = 0,41 (Erholungsfl.) bis 0,61 (Verkehrsfl.). Autoren überwiegend Univ. Würzburg / DLR.

#### Berechnungsschritte (Backend: `GET /api/simulate/baeume`)

```
Schritt 1 — Projizierte Kronendeckung (Überlappungsmodell, Crookston & Stage 1999):
  crown_area_total   = n_trees × 50 m²
  new_ratio          = crown_area_total / area_m2          [Flächen-Verhältnis]
  existing_ratio     = −ln(1 − existing_coverage_pct / 100) [Bestand, inverse Formel]
  total_coverage_pct = (1 − exp(−(existing_ratio + new_ratio))) × 100 [%]
  effective_new_pct  = total_coverage_pct − existing_coverage_pct      [realer Zuwachs, ≥ 0]
  (berücksichtigt Kronenüberlappung; konvergiert gegen 100 %, kein harter Cap)

Schritt 2 — LST-Reduktion:
  delta_lst_celsius  = −0,083 × effective_new_pct   [Mischgebiet-Default]

Schritt 3 — CO₂-Bindung:
  co2_kg_year        = n_trees × 12,5 kg/Jahr
```

#### Eingabedaten im Panel

| Parameter | Herkunft |
|---|---|
| `area_m2` | Σ Fläche ausgewählter LST-Kacheln (n × 10.000 m²) |
| `existing_coverage_pct` | Ø Kronendeckung der ausgewählten Kacheln (Feld `bestand_pct` aus LST-GeoJSON) |
| `n_trees` | Slider-/Texteingabe, Max = pflanzbare Fläche / 100 m² (Mindeststandfläche je Baum nach FLL-Richtlinie, Bäume 2. Ordnung; Plausibilitäts-Cap) |

#### Pflanzbare Fläche (Versiegelungsgrad)

Nicht die ganze Kachel ist bepflanzbar — versiegelter Boden (Dächer, Straßen, Höfe) trägt keinen Stamm. Pro 100-m-Kachel wird beim Cache-Bau ein flächengewichteter **Versiegelungsgrad** `seal_pct` aus den überlappenden ATKIS-/OSM-Flächen vorberechnet (`seal_pct = Σ(Überlappungsfläche × seal_rate) / 10.000`), dazu die dominante Kategorie `dominant_type_key` fürs Label.

- **Pflanzbare Fläche** = `Zellfläche × (1 − seal_pct)` → begrenzt nur die **Stammzahl** (`n_trees`), **nicht** den Kühl-Nenner (`area_m2` bleibt die volle Fläche — Kronen überhängen versiegelten Boden, der García-de-León-Koeffizient ist gegen Deckung über die ganze Polygonfläche kalibriert).
- **Versiegelungsgrade** (`seal_rate` je Flächentyp): Literaturwerte (UBA Texte 141/2021, Leitfaden Bayreuth 2024, DIN 18005), Quelle Arnold & Gibbons (1996) für den Zusammenhang Landnutzung ↔ Versiegelung. v2: GHSL-Imperviousness (gemessen statt typbasiert).
- **Lücken-Annahme:** Geladen sind nur ATKIS `sie02` (Siedlung) + `ver01` (Verkehr) — Kacheln ohne Überdeckung gelten als **unversiegelt** (Grün-/Freifläche). Das Tool markiert solche Kacheln im Readout, damit eine leere Stelle nicht als „fehlende Daten" missverstanden wird.
- **Readout/Overlay:** Das Panel zeigt je Auswahl „überwiegend {Kategorie} · ~X % versiegelt · Y m² pflanzbar · max N Bäume". Ein optionaler ATKIS-Overlay-Toggle (Default aus) blendet die Polygone zur optischen Verifikation ein.

#### Einschränkungen (im Tool kommuniziert)

- Koeffizienten aus München — nicht mit Würzburger Daten kalibriert (Übertragbarkeit plausibel, R² variiert nach Nutzungsklasse)
- LST ≠ Lufttemperatur (Landoberflächentemperatur kann um mehrere °C von der gefühlten Temperatur abweichen)
- Kronenfläche 50 m² ist ein **konservativer Default** (Pretzsch 2015 / Moser-Reischl 2021); reife Würzburger Kronen liegen bei 62–124 m², junge Neupflanzungen deutlich darunter — Δ°C und Kronendeckung gelten für mittelalte bis reife Bäume
- Kronenüberlappung wird über das Poisson-Modell (zufällige Platzierung) angenähert; bei regelmäßigen Alleen leicht unterschätzt, bei Park-Clustern leicht überschätzt (Gray et al. 2021)
- Versiegelungsgrade sind grobe Typ-Mittelwerte (Literatur), keine gemessene Per-Zellen-Versiegelung; „unversiegelt" ≠ tatsächlich verfügbar (Privatgärten, Bestandsvegetation, Abstandsflächen) — die pflanzbare Fläche ist eine **Obergrenze**, kein Pflanzplan
- Modell rein statistisch, keine physikalische Mikroklimasimulation

---

### 6b · Sub-Tab: Entsiegelung

#### Funktion
Nutzer wählt Flächen-Polygone aus der Entsiegelungskarte aus und definiert je Flächentyp den Ausgangs- und Zielbelag (Von/Zu). Das Tool berechnet:
- Δ Versickerung in m³/Jahr
- Abflussanteil Vorher/Nachher (Wasserbalance-Visualisierung)
- Einordnung: Personen-Jahrestrinkwasserbedarf
- Schätzwert: Grundwasserneubildung

#### Berechnungsgrundlage: Rational-Formel

Der Backend-Endpoint `GET /api/simulate/wasser` verwendet die **vereinfachte Rational-Formel** für Niederschlag-Abfluss:

```
Versickerung [m³/Jahr] = A [m²] × N [m/Jahr] × (Ψ_von − Ψ_zu)
```

| Symbol | Bedeutung | Wert |
|---|---|---|
| A | Entsiegelungsfläche | Slider-Eingabe |
| N | Jahresniederschlag Würzburg | **0,5735 m/Jahr** (573,5 mm) |
| Ψ_von | Abflussbeiwert Ausgangsbelag | aus Tabelle (s. u.) |
| Ψ_zu | Abflussbeiwert Zielbelag | aus Tabelle (s. u.) |

**Jahresniederschlag:** DWD Klimanormalperiode 1991–2020, Station 05705 Würzburg, Monatssummen Jan–Dez. Quelle: Deutscher Wetterdienst, Climate Data Center, `climate_observations/germany/annual/kl/`.

#### Abflussbeiwerte Ψ je Belagstyp

| Belagstyp | Ψ | Primärquelle |
|---|---|---|
| Asphalt / Beton (fugenlos) | **0,90** | DWA-A138 / LfU Bayern |
| Pflaster mit dichten Fugen | **0,75** | DWA-A138 / LfU Bayern |
| Pflaster mit offenen Fugen | **0,50** | DWA-A138 / LfU Bayern |
| Lehm-/Kies-/Splittdecke | **0,40** | Leitfaden Flächenentsiegelung Bayreuth 2024 |
| Sickerpflaster | **0,30** | Leitfaden Flächenentsiegelung Bayreuth 2024 |
| Schotterrasen | **0,30** | DWA-A138 / LfU Bayern |
| Rasengitter | **0,15** | DWA-A138 / LfU Bayern |
| Rasenwabe | **0,15** | Leitfaden Flächenentsiegelung Bayreuth 2024 |
| Rasendecke / Wiese | **0,05** | DWA-A138 / LfU Bayern |

**DWA-A138:** Deutsche Vereinigung für Wasserwirtschaft, Abwasser und Abfall e.V. — *Planung, Bau und Betrieb von Anlagen zur Versickerung von Niederschlagswasser* (Ausgabe 2005, Neufassung 2020). Technische Norm, in Bayern durch LfU verbindlich eingeführt. Primärquelle für hydrologische Bemessung von Versickerungsanlagen.

**Leitfaden Bayreuth 2024:** Landratsamt Bayreuth — *Leitfaden Flächenentsiegelung* (2024). Ergänzt DWA-A138 um Kostenkennwerte und Bayern-spezifische Bandbreiten.

#### Versiegelungsgrade je Flächentyp (Slider-Maximum)

Das Slider-Maximum ist die **Summe der versiegelten Fläche** aller ausgewählten Polygone. Der Versiegelungsgrad je Flächentyp entstammt Literaturwerten (in `backend/simulation_params.py` und `frontend/src/utils/simulate.js` gespiegelt):

| Flächentyp (ATKIS/OSM) | Versiegelungsgrad | Basis |
|---|---|---|
| Straßenverkehrsfläche | 98 % | Literaturmittelwert |
| Parkplatz (OSM) | 95 % | Literaturmittelwert |
| Platz / Markt (OSM) | 90 % | Literaturmittelwert |
| Platz (ATKIS) | 88 % | Literaturmittelwert |
| Industrie- und Gewerbefläche | 80 % | Literaturmittelwert |
| Fläche gemischter Nutzung | 65 % | Literaturmittelwert |
| Wohnbaufläche | 60 % | Literaturmittelwert |
| Bes. funktionaler Prägung | 60 % | Literaturmittelwert |
| Sport & Freizeit, Friedhof | 20 % | Literaturmittelwert |

**Hinweis:** Diese Werte sind Schätzungen aus der Fachliteratur (keine Würzburg-spezifische Messung). Eine präzisere Datengrundlage wäre der Copernicus Imperviousness Layer (10 m, GEE: `JRC/GHSL/P2023A/GHS_BUILT_S`), dessen Einbindung als Verbesserung vorgesehen ist.

#### Ergebnisinterpretation: Personen-Jahrestrinkwasserbedarf

```
Entspricht ≈ X Personen-Jahresbedarf = Versickerung [m³/Jahr] / 46,4 [m³/Person/Jahr]
```

Grundlage: 127 L/Tag pro Person (BDEW Wasserstatistik 2023, Bundesverband der Energie- und Wasserwirtschaft, Branchenbild Wasser 2023). Umrechnung: 127 L/Tag × 365 Tage = 46.355 L/Jahr ≈ **46,4 m³/Person/Jahr**.

#### Ergebnisinterpretation: Grundwasserneubildung (Schätzwert)

```
Schätzbereich = Versickerung [m³/Jahr] × [0,15 ; 0,30]
```

Grundlage: Ca. 15–30 % der oberflächlich versickernden Niederschlagsmenge erreichen in Bayern das Grundwasser (LfU Bayern — *Grundwasser in Bayern*, Richtwert). Der Rest verdunstet, wird von Pflanzen aufgenommen oder fließt als Interflow ab. **Dieser Wert ist ein Richtwert** — lokale Bodeneigenschaften (kf-Wert), Grundwassertiefe und Bebauungsdichte im Einzugsgebiet sind nicht berücksichtigt.

**LfU Bayern:** Bayerisches Landesamt für Umwelt — zuständige Behörde für Wasserrecht und Hydrogeologie in Bayern. Der Richtwert 15–30 % ist der in Bayern gebräuchliche Planungsansatz für Versickerungsanlagen ohne detaillierte Bodenerkundung.

#### Realisierbarkeitsfaktoren (informativer Hinweis, kein harter Cap)

Das theoretische Slider-Maximum entspricht der gesamten versiegelten Fläche. In der Praxis ist ein Großteil davon nicht entsiegelbar (Gebäudefundamente, strukturell notwendige Befestigungen). Das Tool zeigt daher einen informativen Schätzwert:

```
Typisch entsiegelbar = versiegelte Fläche × Realisierbarkeitsfaktor
```

| Flächentyp | Faktor | Begründung |
|---|---|---|
| Parkplatz | 70 % | Großteil der Fläche funktional entbehrlich |
| Straße | 10 % | Nur Seitenstreifen/Bankette entsiegelbar |
| Industrie | 40 % | Teile der Hofflächen/Randstreifen entsiegelbar |
| Wohnbaufläche | 30 % | Einfahrten, Höfe, Vorgärten |
| Platz/Markt | 45 % | Je nach Nutzung Teilbegrünung möglich |

Diese Faktoren basieren auf fachlicher Plausibilitätsschätzung. Sie dienen ausschließlich der **Einordnung** ("Typisch realistisch: ~X m²") und begrenzen den Slider nicht — der Nutzer kann den vollen theoretischen Maximalwert simulieren.

---

## 7 · Datenquellen-Übersicht

| Quelle | Datensatz | Verwendung im Tool | Lizenz |
|---|---|---|---|
| **Google Earth Engine** | Landsat 8+9 `ST_B10`, Sommer-Median 2023–2025 | LST-Raster, alle temperaturbasierten Analysen | Landsat: USGS, frei (CC-PDM-1.0) |
| **Destatis** | Zensus 2022, 100 m-Gitter, Altersstruktur + Einwohner | HVI-Berechnung, Seniorenanteil, Bevölkerungsdichte | dl-de/by-2-0 |
| **Stadt Würzburg** | Baumkataster (44.647 Bäume), opendata.wuerzburg.de | Baumkarte, Simulation Kronendeckung | CC BY 4.0 |
| **LDBV Bayern** | ATKIS Basis-DLM, `sie02_f.shp` + `ver01_f.shp` | Entsiegelungskarte, Flächentypen | CC BY 4.0 |
| **OpenStreetMap** | Parkplätze, Plätze, Flachdächer | Ergänzung ATKIS-Layer | ODbL |
| **DWD** | Klimanormalperiode 1991–2020, Station 05705 Würzburg | Jahresniederschlag N = 573,5 mm | frei, DWD Open Data |
| **DWA-A138 / LfU Bayern** | Abflussbeiwerte nach Belagstyp | Versickerungsberechnung | Normwerk (kaufpflichtig) |
| **LRÄ Bayreuth 2024** | Leitfaden Flächenentsiegelung | Ergänzende Ψ-Werte, Kostenkennwerte | öffentlich |
| **García de León et al. (2025), München** | Regressionskoeffizienten LST × Baumkrone (München) | Δ°C je Baum in Simulation | Wissenschaftliche Publikation |
| **Stratopoulos-Le Chalony (2020), TU München** | Dissertation „Klimabäume für die Stadt", Transpirationsraten LB3/LB6 | Koeffizient hinterlegt, in v1 noch nicht in der Berechnung eingebunden | wissenschaftliche Publikation |
| **BDEW (2023)** | Wasserstatistik, Trinkwasserverbrauch 127 L/Tag | Ergebniseinordnung Simulation | öffentlich |
| **LfU Bayern** | Grundwasserneubildungsrichtwert 15–30 % | Grundwasserschätzwert in Simulation | öffentlich |

---

## 8 · Methodische Einschränkungen und Validierungsbedarf

### 8.1 Örtliche Übertragbarkeit der Koeffizienten

| Koeffizient | Ursprungsort | Würzburg-Transfer | Status |
|---|---|---|---|
| −0,083 °C / % Kronendeckung | München (Cfb/Dfb) | Gleiche Klimazone, ähnliche Stadtstruktur | **Angewendet** (Baum-Simulation), plausibel, nicht validiert |
| −0,03 °C / % Entsiegelung | Potsdam (Cfb) | Würzburg etwas kontinentaler (Dfb) | Koeffizient vorhanden, in **v1 nicht angewendet** (nur Stadtbezirksebene gültig) |
| Abflussbeiwerte Ψ | Bayern (DWA-A138) | Normwerk für Bayern direkt anwendbar | **Gültig** |
| Versiegelungsgrade | Literaturmittel | Keine Würzburg-spezifische Messung | Schätzung |

### 8.2 LST ≠ Lufttemperatur
Die Landoberflächentemperatur (LST) ist ein fernerkundlicher Proxy. Sie kann bei Vollsonne mehrere °C über der Lufttemperatur liegen; an bedeckten Tagen nähern sich beide an. Alle Δ-Werte im Tool beziehen sich auf LST. Für Komfortaussagen (PET, UTCI) wäre ein gesondertes Modell erforderlich.

### 8.3 Statistische Modelle, keine physikalische Simulation
Beide Simulationen basieren auf statistischen Regressionskoeffizienten aus Felddaten. Sie berücksichtigen keine Rückkopplungen (Windströmungen, Strahlungsgeometrie, Feuchtehaushalte). Eine physikalische Mikroklimasimulation (ENVI-met, WRF) würde Präzision erhöhen, erfordert aber deutlich mehr Rechenaufwand und lokale Eingangsdaten.

### 8.4 Zensus-Geheimhaltungsrundung
Destatis rundet Gitterzellen stochastisch, wenn Personenzahlen klein sind (§ 16 BStatG). Das Tool behandelt betroffene Zellen transparent: `anteil_65plus` wird auf [0, 1] geklippt; Zellen ohne Altersaufschlüsselung erhalten keinen HVI-Score (Tooltip-Hinweis im Frontend).

### 8.5 Ausstehende Verbesserungen

1. **Würzburg-Kalibrierung:** Eigene Regressionskoeffizienten LST × Baumkronendeckung aus Würzburger Daten ableiten (ATKIS-Nutzungsklassen × Baumkataster × LST-Raster)
2. **Lokale Bodenversickerung:** LfU Bayern Bodendaten (kf-Werte, WFS) für flächentyp-genaue Abflussbeiwerte
3. **Copernicus Imperviousness Layer:** Ersatz der Literaturschätzwerte für Versiegelungsgrade durch gemessene 10 m-Raster-Daten (GEE: `JRC/GHSL/P2023A`)
4. **Kronenfläche aus Kataster:** `kronenbrei`-Feld (Kronendurchmesser) für individuelle Kronenfläche nutzen statt Literatur-Defaultwert 50 m²

---

## 9 · Glossar

| Begriff | Definition |
|---|---|
| **LST** | Land Surface Temperature — Landoberflächentemperatur, gemessen als Strahlungstemperatur via Thermal-Infrarot-Sensor |
| **lst_norm** | Rang-normierter LST-Wert 0–1 (0 = kälteste Zelle, 1 = heißeste Zelle im Würzburger Stadtgebiet) |
| **HVI** | Heat Vulnerability Index — gewichteter Score 1–10 aus LST-Rang und Seniorenanteil |
| **Ψ (Abflussbeiwert)** | Dimensionsloser Beiwert 0–1: Anteil des Niederschlags, der oberflächlich abfließt (1 = vollständig undurchlässig) |
| **Versiegelungsgrad** | Anteil einer Flächeneinheit (Landnutzungsklasse), der physisch versiegelt ist |
| **Rational-Formel** | Vereinfachtes hydrologisches Modell: Abflussvolumen = Fläche × Niederschlag × Abflussbeiwert |
| **Bayesian Shrinkage** | Empirischer Bayes-Schätzer: kleine Rasterzellen werden zur Stadtmittelrate gezogen, um Small-Numbers-Verzerrung zu reduzieren |
| **LAEA** | Lambert Azimuthal Equal Area — Koordinatensystem EPSG:3035, das Destatis für Gitterdaten verwendet |
| **ATKIS** | Amtliches Topographisch-Kartographisches Informationssystem — amtliche Flächennutzungsklassifikation in Deutschland |
