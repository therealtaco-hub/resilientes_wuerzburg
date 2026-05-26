# Simulation-Feature — Design-Dokument

**Status:** In Planung · noch nicht implementiert  
**Zuletzt aktualisiert:** 2026-05-26  
**Autoritative Koeffizienten-Quelle:** `urban-heat-wiki/wiki/simulation-logic.md`  
**Koeffizienten-Datei:** `backend/simulation_params.py`

---

## Ziel

Die Simulation-Seite (`/simulation`) erlaubt Nutzern, zwei Was-wäre-wenn-Szenarien für ein selbst gewähltes Stadtgebiet durchzurechnen:

1. **Baumpflanzung** — N neue Bäume → Δ°C LST-Reduktion + Transpirationskühlleistung (kWh/Jahr) + CO₂-Bindung (kg/Jahr)
2. **Flächenentsiegelung** — X m² versiegelte Fläche → m³ Versickerung/Jahr *(kein Δ°C in v1 — reference_m2-Problem)*

Auswahl erfolgt **per Karte**: Sim A über anklickbare 100m-LST-Rasterkacheln, Sim B über anklickbare Entsiegelungs-Polygone aus `/api/entsiegelung`.

---

## Besprochene Designentscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Bezugsfläche Sim A (Bäume) | **100m-LST-Kacheln anklicken** | Area akkumuliert (10.000 m²/Kachel), direkt aus LST-Layer. Kachel-Selektion: Einzelklick toggle + Drag-to-select. |
| Bezugsfläche Sim B (Entsiegelung) | **Entsiegelungs-Polygone anklicken** | Semantisch korrekt (echter Parkplatz/Platz), `type_key` bekannt → Auto-Fill |
| `from_surface` (Entsiegelung) | **Auto-befüllt aus `type_key`**, manuell überschreibbar | `osm_parking` → „Asphalt"; reduziert Eingabeaufwand |
| Slider-Max Bäume | **`floor(area_m2 / CROWN_AREA_M2_DEFAULT)`** — 100 % Kronendeckung | Formel-Limit: Koeffizient basiert auf 2D-Landsat-Kronendeckung, extrapoliert nicht valide über 100 % hinaus. **UI muss das erklären** (siehe unten). |
| Slider-Max Entsiegelung | **Σ `area_m2` × `seal_rate` der Selektion** | Natürlicher Deckel — mehr als die versiegelte Fläche kann nicht entsiegelt werden |
| `to_surface` (Entsiegelung) | **Dropdown**, Default: `"schotterrasen"` | Zielbelag aus `RUNOFF_COEFFICIENTS` frei wählbar |
| Δ°C für Entsiegelung (v1) | **Nicht ausgegeben** | Tervooren-Formel ist stadtweite Korrelation — auf Polygonebene ergibt sich ein irreführend kleiner Wert (0,005% → −0,00015°C) |
| Δ°C für Entsiegelung (v2) | Optional, nur bei Stadtbezirk als Bezugsfläche | Dann sinnvolle Prozentbasis |
| Flachdächer (`osm_flat_roof_industrial`) | **Aus Entsiegelung ausgeschlossen** | Dächer ≠ Bodenbelag; Gründach ist separater zukünftiger Sim-Punkt |
| `land_use` (Baum-Koeffizient) | Fest `"mixed"` in v1 | Deckt Wohngebiet ab, plausibler Default für Würzburg |
| `species_type` (Transpirationsrate) | Dropdown (LB3 / LB6) | Reale Nutzerbedeutung: klimaadaptiert vs. trockenheitstolerant |

---

## Geplante Architektur

### Backend — `backend/routers/simulate.py`

#### `GET /api/simulate/baeume`

```
Query-Parameter:
  n_trees:      int    — Anzahl Neupflanzungen (Slider)
  area_m2:      float  — Bezugsfläche (aus Kachelauswahl)
  land_use:     str    — "mixed" | "recreational" | "overall"  (Default: "mixed")
  species_type: str    — "lb3" | "lb6"  (Default: "lb6")

Berechnung (vollständig in simulation-logic.md dokumentiert):
  1. crown_area_total = n_trees × CROWN_AREA_M2_DEFAULT (50 m²)
  2. delta_coverage_pct = crown_area_total / area_m2 × 100
  3. delta_lst_celsius = LST_PER_PCT_CANOPY_MIXED × delta_coverage_pct
  4. cooling_kwh_year = crown_area_total × TRANSPIRATION_LBx × 365 × LATENT_HEAT_KWH_PER_KG
  5. co2_kg_year = n_trees × CO2_KG_PER_TREE_YEAR

Antwort (JSON):
  n_trees, area_m2, delta_coverage_pct, delta_lst_celsius,
  cooling_kwh_year, co2_kg_year, species_type, land_use, coefficients_used, caveats[]
```

##### CO₂-Koeffizient

```python
# backend/simulation_params.py
CO2_KG_PER_TREE_YEAR = 12.5
# Quelle: Dr. Daniel Klein, Wald-Zentrum Universität Münster
# (via wildes-bayern.de: https://www.wildes-bayern.de/wp-content/uploads/2021/04/cUniversitaet_Muenster_CO2-Bindung-Baeume.pdf)
# Herleitung: Normal gewachsene Buche, 23 m, ∅ 30 cm → 600 kg Trockenmasse
# → bindet 1.000 kg CO₂ in ~80 Jahren → 12,5 kg CO₂/Baum/Jahr
# ⚠ KEINE WIKI-QUELLE: Diese Quelle ist noch nicht als Wiki-Seite ingested.
#   Vor Produktionsrelease in urban-heat-wiki/wiki/sources/ dokumentieren.
# ⚠ Gilt für ausgewachsene Laubbäume im Forstbestand — Stadtbäume wachsen
#   langsamer; Jungbäume binden in den ersten Jahren deutlich weniger.
```

**Kontextwert für die UI:** 80 Bäume binden ~1 Tonne CO₂/Jahr. Dieser Wert eignet
sich für relative Darstellung (z. B. „entspricht ~X Autofahrten von Würzburg nach München").

#### `GET /api/simulate/wasser`

> **v1-Entscheidung:** Kein `delta_lst_celsius`-Output. Die Tervooren-Formel (−0,03°C/%)
> bezieht sich auf den prozentualen Anteil an der **gesamten Stadtfläche** — ein einzelner
> Parkplatz (2.000 m²) in Würzburg (40 km²) ergibt 0,005% → −0,00015°C, also ein
> irreführend kleiner Wert. In v1 wird ausschließlich die Versickerung (m³/Jahr) ausgegeben.
> v2: LST-Reduktion nur wenn der Nutzer einen ganzen Stadtbezirk als Bezugsgebiet wählt.

```
Query-Parameter:
  area_m2:       float  — Entsiegelungsfläche in m² (Slider, max = selektierbare Fläche × seal_rate)
  from_surface:  str    — Ausgangsbelag (auto-befüllt aus type_key, überschreibbar, Default: "asphalt")
  to_surface:    str    — Zielbelag (Dropdown, Default: "schotterrasen")

Berechnung:
  1. delta_C = RUNOFF_COEFFICIENTS[from] - RUNOFF_COEFFICIENTS[to]
  2. infiltration_m3_year = area_m2 × ANNUAL_RAINFALL_WUERZBURG_M × delta_C

  # Kein LST-Schritt in v1 (reference_m2-Problem — siehe Notiz oben)

Antwort (JSON):
  area_m2, from_surface, to_surface,
  infiltration_m3_year,
  runoff_coefficients{ from, to, delta },
  rainfall_m_year,   ← aus ANNUAL_RAINFALL_WUERZBURG_M, zur Transparenz im Frontend
  caveats[]
```

##### Versiegelungsgrad-Schätzwerte (`SEAL_RATE_BY_TYPE`)

Der Slider „Entsiegelungsfläche" kann maximal `area_m2 × seal_rate` erreichen — man kann nicht
mehr entsiegeln als tatsächlich versiegelt ist.

**v1 — Literaturwerte + OSM-Logik:**

```python
# backend/simulation_params.py
# v1: Literaturwerte nach Flächentyp (ATKIS/OSM-Klassifizierung)
# OSM-Polygone (Parkplätze, Plätze) gelten als nahezu vollversiegelt per Definition.
# Quellen: UBA Texte 141/2021, Leitfaden Bayreuth 2024, DIN 18005 (Richtwerte)
#
# ⚠ v2-TODO: Durch Copernicus Imperviousness Layer ersetzen:
#   GEE-Datensatz: JRC/GHSL/P2023A/GHS_BUILT_S (10m Auflösung, pixel-genau)
#   → spatial join auf selektierte Polygone → echter gemessener Versiegelungsgrad

SEAL_RATE_BY_TYPE: dict[str, float] = {
    # OSM-Typen (per Definition vollversiegelt)
    "osm_parking":                   0.95,
    "osm_square":                    0.90,
    # ATKIS-Typen (Literaturwerte)
    "AX_Strassenverkehrsflaeche":    0.98,
    "AX_Platz":                      0.88,
    "AX_IndustrieUndGewerbeflaeche": 0.80,
    "AX_FlaecheGemischterNutzung":   0.65,
    "AX_Wohnbauflaeche":             0.60,
    # Fallback
    "_default":                      0.70,
}

# Explizit AUSGESCHLOSSEN aus der Entsiegelungssimulation:
# "osm_flat_roof_industrial" — Flachdächer sind kein Bodenbelag.
# Gründach-Begrünung ist ein separater Simulationspunkt (noch nicht implementiert).
```

##### Niederschlagsdaten

```python
# simulation_params.py — ✅ echter DWD-Wert, bereits eingebaut:
ANNUAL_RAINFALL_WUERZBURG_M = 0.5735  # m/Jahr (573,5 mm)
# Quelle: DWD Climate Data Center
#   Station Würzburg, ID 05705 (49.7704°N, 9.9576°E, 268 m ü. NN)
#   Datei: monatswerte_KL_05705_18810101_20241231_hist.zip → Spalte MO_RR
#   Referenzperiode 1991–2020 (DWD-Klimanormalperiode), 360/360 gültige Monatswerte
#   Jahressummen-Bandbreite: 394 mm (1991) – 806 mm (2002), Median 556 mm

MONTHLY_RAINFALL_WUERZBURG_MM = {
    1: 40.0, 2: 35.8, 3: 40.2, 4: 32.7, 5: 57.3,  6: 52.9,
    7: 65.8, 8: 56.3, 9: 47.2, 10: 47.5, 11: 46.2, 12: 51.5,
}
# ZIP liegt in backend/data/ (.gitignore) — kein Re-Download nötig
```

Alle Koeffizienten kommen ausschließlich aus `backend/simulation_params.py` — kein Hardcoding im Router.

---

### Frontend — `frontend/src/pages/Simulation.jsx`

#### Layout-Idee

```
┌──────────────────────────────────────────────────────────────┐
│  TOPBAR                                                       │
├───────────────────────────────┬──────────────────────────────┤
│  KARTE (MapSurface)           │  RECHTE PANEL-SEKTION        │
│  · LST-Choropleth (gedimmt)   │                              │
│  · SimCellLayer               │  [Kachelauswahl-Info]        │
│    (anklickbar, Selektion     │  X Kacheln · Y ha gewählt    │
│     wird hervorgehoben)       │                              │
│                               │  ── Simulation A ──          │
│                               │  Slider: Neupflanzungen      │
│                               │  Dropdown: Baumart           │
│                               │  → Δ°C · kWh/Jahr · kg CO₂  │
│                               │                              │
│                               │  ── Simulation B ──          │
│                               │  Slider: Entsiegelungsfläche │
│                               │  Dropdown: von / nach Belag  │
│                               │  → m³/Jahr  (kein Δ°C v1)   │
└───────────────────────────────┴──────────────────────────────┘
```

#### Neue Komponenten (geplant)

| Komponente | Pfad | Beschreibung |
|---|---|---|
| `SimCellLayer` | `components/map/overlays/SimCellLayer.jsx` | deck.gl GeoJsonLayer auf LST-Kacheln — für **Simulation A (Bäume)**. Kacheln anklickbar, selektierte hervorgehoben (gelbe Outline + heller Fill). Flachdach-Features (`osm_flat_roof_industrial`) werden nicht gerendert. |
| `SimEntsiegelungLayer` | `components/map/overlays/SimEntsiegelungLayer.jsx` | deck.gl GeoJsonLayer auf Entsiegelungs-Polygonen (`/api/entsiegelung`) — für **Simulation B**. Klick → Selektion akkumuliert, `type_key` wird an Panel übergeben. **Flachdächer (`osm_flat_roof_industrial`) explizit ausgeblendet** — kein Bodenbelag. |
| `SimAreaInfo` | `components/simulation/SimAreaInfo.jsx` | Zeigt gewählte Fläche (Kacheln für A / Polygone für B), Area in ha/m², „Auswahl zurücksetzen"-Button. |
| `BaumSimPanel` | `components/simulation/BaumSimPanel.jsx` | Slider (anzahl), Dropdowns (land_use, species_type), Result-Karten: Δ°C + kWh/Jahr + kg CO₂/Jahr. |
| `WasserSimPanel` | `components/simulation/WasserSimPanel.jsx` | Slider (flaeche_m2, max = Σ area_m2 × seal_rate der selektierten Polygone), `from_surface` auto-befüllt aus `type_key` (überschreibbar), `to_surface`-Dropdown. Result: **nur m³/Jahr** (kein Δ°C in v1). |
| `SimResultCard` | `components/simulation/SimResultCard.jsx` | Einheitliche Darstellung eines Sim-Outputs (Icon + Wert + Einheit + Caveat-Toggle). |

#### Bestehende Komponenten, die wiederverwendet werden

- `MapSurface.jsx` — Karten-Wrapper, unverändert
- `DeckOverlay.jsx` — für SimCellLayer
- `HeatLayer.jsx` — als gedimmter Hintergrund (Opacity reduziert)
- `ui/KpiCard.jsx` — evtl. für Result-Darstellung
- `api/lst.js` — Kacheldaten für SimCellLayer
- `utils/format.js` — `fmt.temp`, `fmt.dT`, `fmt.area`, `fmt.num`

#### Store-Änderungen (`store/useAppStore.js`)

Aktueller Stand:
```js
sim: {
  baeume: { anzahl: 500 },
  wasser: { flaeche: 5000, bodenart: 'lehmig' },   // bodenart passt nicht mehr zum Wiki-Spec
}
```

Geplanter Stand:
```js
sim: {
  // Sim A — Bäume: 100m-LST-Kacheln anklicken
  selectedCells: [],          // Array von Kachel-Feature-IDs
  selectedCellsAreaM2: 0,     // derived: selectedCells.length × 10_000

  // Sim B — Entsiegelung: Entsiegelungs-Polygone anklicken
  selectedPolygons: [],       // Array von { id, type_key, area_m2 }
  selectedPolygonsAreaM2: 0,  // derived: Σ area_m2 aller selektierten Polygone
  // Flachdächer (osm_flat_roof_industrial) werden im Layer erst gar nicht angeboten

  baeume: {
    anzahl: 100,
    land_use: 'mixed',        // fest in v1
    species_type: 'lb6',
  },
  wasser: {
    flaeche_m2: 1000,         // max = selectedPolygonsAreaM2 × seal_rate
    from_surface: 'asphalt',  // auto-befüllt aus type_key des zuletzt geklickten Polygons
    to_surface: 'schotterrasen',
  },
}
```

#### API-Wrapper (`frontend/src/api/simulate.js`)

```js
import { apiFetch } from './client.js'

export const fetchSimulateBaeume = ({ n_trees, area_m2, land_use, species_type }) =>
  apiFetch(`/api/simulate/baeume?n_trees=${n_trees}&area_m2=${area_m2}&land_use=${land_use}&species_type=${species_type}`)

export const fetchSimulateWasser = ({ area_m2, from_surface, to_surface }) =>
  apiFetch(`/api/simulate/wasser?area_m2=${area_m2}&from_surface=${from_surface}&to_surface=${to_surface}`)
  // Kein reference_m2 in v1 — LST-Output entfernt (reference_m2-Problem)
```

Requests werden debounced (300ms), damit der Slider nicht bei jedem Tick feuert.

---

## Offene Fragen / TODOs

- [x] **reference_m2 für Entsiegelung**: In v1 **kein Δ°C-Output** für Entsiegelung. Die Tervooren-Formel ist auf Stadtebene definiert — ein einzelnes Polygon ergibt einen irreführend kleinen Wert (z.B. 2.000 m² / 40 km² = 0,005% → −0,00015°C). v1 zeigt ausschließlich m³/Jahr Versickerung. v2: optional Δ°C wenn Nutzer Stadtbezirk als Bezugsfläche wählt.
- [x] **Flachdächer in Entsiegelung**: `osm_flat_roof_industrial` explizit ausgeschlossen — Dächer sind kein Bodenbelag, die Rational-Formel (Versickerung in Boden) gilt nicht. Gründach-Simulation ist ein **separater zukünftiger Simulationspunkt** (Wasserrückhalt, Evaporation, Schwammstadteffekt) — noch nicht geplant.
- [x] **Versiegelungsgrade**: v1 mit Literaturwerten je `type_key` in `SEAL_RATE_BY_TYPE` (`simulation_params.py`). OSM-Polygone (Parkplätze, Plätze) gelten per Definition als vollversiegelt. v2: Copernicus Imperviousness Layer (GEE: `JRC/GHSL/P2023A/GHS_BUILT_S`, 10m) via spatial join.
- [x] **Niederschlagsdaten**: ✅ Echter DWD-Wert eingebaut. Station Würzburg ID 05705, Datei `monatswerte_KL_05705_18810101_20241231_hist.zip`, Referenzperiode 1991–2020 (360/360 gültige Monatswerte). `ANNUAL_RAINFALL_WUERZBURG_M = 0.5735` m/Jahr (573,5 mm). Monatliche Mittelwerte ebenfalls in `simulation_params.py` hinterlegt (`MONTHLY_RAINFALL_WUERZBURG_MM`). ZIP liegt in `backend/data/` (.gitignore).
- [x] **land_use-Dropdown oder fest?** `"mixed"` als Default reicht für v1.
- [x] **Kachel-Selektion UX**: Beides — Einzelklick togglet eine Kachel, Drag-to-select markiert mehrere auf einmal.
- [x] **Slider-Range**: Kein willkürlicher Maximalwert. Bäume: Slider ohne hartes Cap (unrealistisch hohe Werte werden durch das Ergebnis selbst offensichtlich). Entsiegelung: Max = Σ `area_m2` aller selektierten Polygone × `seal_rate` — der natürliche Deckel durch die Flächenauswahl.
- [x] **Caveats anzeigen**: **A + B kombiniert** — wichtigster Caveat als Inline-Subtext direkt unter dem Wert (immer sichtbar, gedimmt), vollständige Quellenauflistung hinter einem `„Methodik & Einschränkungen ▾"`-Toggle am unteren Ende des Panels (konsistent mit Hitzeatlas).
- [x] **Kein Ergebnis ohne Kachelauswahl**: Beide Panels sichtbar aber ausgegraut, zentraler Hinweistext: *„Wähle Kacheln auf der Karte aus, um die Simulation zu starten."* Kein leerer Bildschirm — Nutzer soll sofort verstehen was zu tun ist.
- [x] **Mobile**: Desktop-only. Auf kleinen Screens einfacher Hinweis `„Diese Seite ist für Desktop optimiert"`. Karte + Doppel-Panel-Layout nicht sinnvoll auf 375px.
- [x] **CO₂-Bindung**: Als zusätzlicher Output in `/api/simulate/baeume` aufgenommen. Koeffizient **12,5 kg CO₂/Baum/Jahr** nach Dr. Daniel Klein (Wald-Zentrum Universität Münster). Quelle: https://www.wildes-bayern.de/wp-content/uploads/2021/04/cUniversitaet_Muenster_CO2-Bindung-Baeume.pdf — ⚠️ **noch nicht als Wiki-Seite ingested**, vor Produktionsrelease nachholen.

---

## Wissenschaftliche Grundlage (Zusammenfassung)

Alle Details: `urban-heat-wiki/wiki/simulation-logic.md`

| | Baumpflanzung | Entsiegelung |
|---|---|---|
| LST-Koeffizient | −0,083 °C / 1 % Kronendeckung (Mischgebiet) | −0,030 °C / 1 % Entsiegelung (Tervooren) |
| Δ°C in v1? | **ja** | **nein** — reference_m2-Problem, zu kleine Werte auf Polygonebene |
| Δ°C in v2? | ja | nur mit Stadtbezirk als Bezugsfläche |
| Primäroutput v1 | Δ°C + kWh/Jahr + kg CO₂/Jahr | **m³/Jahr Versickerung** |
| Datenherkunft | München 2020, García de León et al. | Leitfaden Bayreuth 2024 (Abflussbeiwerte) |
| CO₂-Quelle | Dr. Klein, Uni Münster (via wildes-bayern.de) — ⚠️ nicht im Wiki | — |
| Versiegelungsgrad | Kronenfläche aus `CROWN_AREA_M2_DEFAULT` | v1: `SEAL_RATE_BY_TYPE` (Literatur); v2: Copernicus |
| Niederschlag | — | ✅ **573,5 mm/Jahr** — DWD Station 05705, Referenz 1991–2020 |
| Lokale Validierung | ausstehend | ausstehend |

---

## Slider-Cap Bäume — UI-Dokumentationspflicht

Der Baum-Slider endet bei `floor(selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)` Bäumen (= 100 % Kronendeckung der gewählten Fläche).

**Warum das im Frontend zwingend erklärt werden muss:**
Kronenüberlappung ist in der Natur real (Untergeschoss-Bäume im Wald). Aber der LST-Koeffizient −0,083 °C/% basiert auf 2D-Kronendeckung aus Landsat-Satellitendaten — Bäume unterhalb einer geschlossenen Krone sind für den Sensor unsichtbar und stecken daher nicht im Koeffizienten. Ab 100 % Deckung macht die Formel keine validen Aussagen mehr; weitere Bäume würden linear extrapoliert, obwohl kein zusätzlicher Kühleffekt messbar wäre.

**Konkrete UI-Anforderungen:**
- Slider-Max = `floor(selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)`, dynamisch bei Kachelauswahl neu berechnet.
- Am Slider-Ende: Label oder Tooltip, z. B. `„Maximum: 100 % Kronendeckung — Formelgrenze (Landsat-basiert)"`.
- Der aktuelle Deckungsgrad sollte als Sekundär-Info am Slider angezeigt werden: z. B. `„↳ entspricht 42 % Kronendeckung"` — so ist die Grenze nicht abrupt sondern kontextualisiert.
- Keine stille Kappung: Der Slider darf nicht einfach aufhören, ohne dass der Nutzer versteht warum.

---

## CO₂-Caveats (für `caveats[]`-Array im API-Output und UI)

Folgende Caveats müssen im Frontend bei der CO₂-Result-Karte angezeigt werden:

1. **„12,5 kg/Baum/Jahr ist ein Mittelwert für ausgewachsene Laubbäume im Forstbestand — Neupflanzungen binden in den ersten Jahren deutlich weniger."**
2. **„Stadtbäume wachsen oft langsamer als Waldbäume (Bodenverdichtung, Hitze, Wurzelraum) — der tatsächliche Wert kann niedriger sein."**
3. **„CO₂-Bindung ist ein Nebeneffekt; die primäre Klimafunktion von Stadtbäumen ist Kühlung durch Transpiration und Beschattung."**
4. **„Kontext: 80 Bäume binden ~1 Tonne CO₂/Jahr — das entspricht ca. einer Autobahnfahrt Würzburg–Hamburg und zurück."**

> Die Quelle (Dr. Klein, Uni Münster) selbst warnt: *„Wie viel CO₂ ein Baum pro Jahr speichert, lässt sich seriös nicht sagen."* Der Wert 12,5 kg/Jahr ist eine Faustformel, keine präzise Messung.

---

## Implementierungs-Reihenfolge (wenn es losgeht)

1. `backend/routers/simulate.py` — beide Endpoints (reine Berechnung, kein Daten-I/O)
2. `frontend/src/api/simulate.js` — fetch-Wrapper
3. Store-Update (`sim`-Shape) + `setSimParam` anpassen
4. `SimCellLayer.jsx` — Kacheln anklickbar machen (reused LST-Daten)
5. `Simulation.jsx` — Layout + `SimAreaInfo`
6. `BaumSimPanel.jsx` + `WasserSimPanel.jsx` + `SimResultCard.jsx`
7. Debouncing + Loading-States
8. Caveats / Methodik-Sektion
