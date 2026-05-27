# Simulation-Feature — Design-Dokument

**Status:** In Planung · noch nicht implementiert  
**Zuletzt aktualisiert:** 2026-05-27  
**Autoritative Koeffizienten-Quelle:** `urban-heat-wiki/wiki/simulation-logic.md`  
**Koeffizienten-Datei:** `backend/simulation_params.py`

---

## Ziel

Die Simulation-Seite (`/simulation`) erlaubt Nutzern, zwei Was-wäre-wenn-Szenarien für ein selbst gewähltes Stadtgebiet durchzurechnen:

1. **Sim A — Baumpflanzung** — N neue Bäume → Δ°C LST-Reduktion + CO₂-Bindung (kg/Jahr) + Kronendeckung (%)
2. **Sim B — Flächenentsiegelung** — X m² versiegelte Fläche entsiegeln → m³ Versickerung/Jahr *(kein Δ°C in v1 — reference_m2-Problem)*

Auswahl der Bezugsfläche erfolgt **per Karte**: Sim A über anklickbare 100m-LST-Rasterkacheln, Sim B über anklickbare Entsiegelungs-Polygone aus `/api/entsiegelung`.

---

## Entscheidungsregister

Alle v1-Entscheidungen sind final. v2-Punkte sind explizit als solche markiert.

| Frage | Entscheidung | Status | Begründung |
|---|---|---|---|
| Bezugsfläche Sim A | **100m-LST-Kacheln, Einzelklick-Toggle** | v1 entschieden | 10.000 m²/Kachel, direkt aus LST-Layer |
| Bezugsfläche Sim B | **Entsiegelungs-Polygone, Einzelklick-Toggle** | v1 entschieden | `type_key` bekannt → Auto-Fill `from_surface` |
| Drag-to-select | **Nicht in v1** | v2 | Wie Desktop-Rechteck-Aufziehen; v1 nur Einzelklick |
| Kachel-ID für Selektion | **Index im deck.gl `data`-Array** | v1 entschieden | Kein stabiler ID-Key in LST-GeoJSON nötig; Selektion ist session-only |
| `from_surface` | **Auto-befüllt aus `FROM_SURFACE_BY_TYPE_KEY`**, überschreibbar | v1 entschieden | `osm_parking` → `asphalt`; reduziert Eingabeaufwand |
| Multi-`type_key`-Selektion | **Ein from/to-Paar pro `type_key`-Gruppe**, ein API-Aufruf je Gruppe, Σ Ergebnisse | v1 entschieden | Klare Trennung je Flächentyp; globaler Slider verteilt proportional |
| Slider-Max Bäume | **`floor(selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)`** | v1 entschieden | Formelgrenze: LST-Koeffizient basiert auf 2D-Kronendeckung (Landsat); keine Extrapolation über 100 % |
| Slider-Max Entsiegelung | **Σ `area_m2 × seal_rate` aller selektierten Polygone** | v1 entschieden | Natürlicher Deckel — mehr als das Versiegelte kann nicht entsiegelt werden |
| Globaler Slider Entsiegelung | **Ein Slider gesamt**, proportionale Aufteilung auf Gruppen | v1 entschieden | `area_for_call_i = slider × (sealable_i / total_sealable)` |
| `to_surface` | **Dropdown**, Default `"schotterrasen"` | v1 entschieden | Alle Keys aus `RUNOFF_COEFFICIENTS` wählbar |
| Δ°C Entsiegelung | **Nicht ausgegeben in v1** | v1 entschieden | Tervooren auf Stadtebene → auf Polygon-Ebene irreführend klein (0,005 % → −0,00015 °C) |
| Δ°C Entsiegelung v2 | Optional, nur mit Stadtbezirk als Bezugsfläche | v2 | Dann sinnvolle Prozentbasis |
| Flachdächer (`osm_flat_roof_industrial`) | **Aus Sim B ausgeschlossen** | v1 entschieden | Dächer ≠ Bodenbelag; Rational-Formel gilt nicht |
| `land_use` (Baum-Koeffizient) | Intern fest `"mixed"` (−0,083 °C/%) | v1 entschieden | Plausibler Default für Würzburg; kein Parameter nach außen |
| `species_type` (Transpiration) | **Entfernt in v1** | v1 entschieden | Beeinflusst nur kWh/Jahr (~12 % Unterschied LB3/LB6); kein Effekt auf Δ LST, CO₂ oder Deckung. v2 wenn kWh mit Kontext |
| `SimMiniMap` | **v1: Area-Info-Banner** (Σ ha + Anzahl + Zurücksetzen-Button) | v1 entschieden | Zweiter Map-Kontext zu aufwändig. v2: Thumbnail mit deck.gl StaticMap |
| `SimResultCard` | **Kompakte Variante von `KpiCard`** (22 px, kein Icon-Tile, optionaler `caveat`) | v1 entschieden | Passt in 3-spaltig Result-Grid |
| Tab-Design | **Zwei Pill-Buttons** (aktiv: grüner Rand + Tint, inaktiv: transparent) | v1 entschieden | Frei nach Design System; unterhalb Topbar, oberhalb Karte+Panel |
| Collapsible Sidebar | **App-weit**, 220 px ↔ 48 px (Icon-only), Toggle am unteren Rand | v1 entschieden | `sidebarCollapsed` in Store, `marginLeft` in `App.jsx` reaktiv |
| Selektion-Persistenz | **Session-only, kein localStorage** | v1 entschieden | Einfachheit; Indizes sind nach Seiten-Reload ohnehin ungültig |
| Versiegelungsgrade (`SEAL_RATE_BY_TYPE`) | **v1: Literaturwerte** je `type_key` | v1 entschieden | v2: Copernicus Imperviousness Layer (GEE `JRC/GHSL/P2023A/GHS_BUILT_S`, 10 m) |
| CO₂-Koeffizient | **12,5 kg/Baum/Jahr** (Dr. Klein, Uni Münster) | v1 entschieden | ⚠ Noch nicht als Wiki-Seite ingested — vor Produktionsrelease nachholen |
| Oberflächentemp. nach Belagstyp | Nicht in v1 | v2 | Quellenlage unvollständig (nur `rasendecke` belegt) |
| Desktop-only | **Ja** — `< 1024 px` zeigt Banner, kein Map-Rendering | v1 entschieden | Karte + Doppel-Panel nicht sinnvoll auf 375 px |
| Debouncing Slider | **300 ms** vor API-Aufruf | v1 entschieden | Vermeidet Request-Spam bei Slider-Bewegung |

---

## Wissenschaftliche Grundlage

Vollständige Herleitung in `urban-heat-wiki/wiki/simulation-logic.md` und `urban-heat-wiki/wiki/kuehleffekte-vergleich.md`.

| | Baumpflanzung | Entsiegelung |
|---|---|---|
| LST-Koeffizient | −0,083 °C / 1 % Kronendeckung (Mischgebiet) | −0,030 °C / 1 % Entsiegelung (Tervooren) |
| Δ°C in v1? | **Ja** | **Nein** — reference_m2-Problem |
| Δ°C in v2? | Ja | Nur mit Stadtbezirk als Bezugsfläche |
| Primäroutput v1 | Δ°C · CO₂ kg/Jahr · Kronendeckung % | m³/Jahr · Retention % · Personen-Kontext |
| Datenherkunft | García de León et al., München 2020 | Leitfaden Landkreis Bayreuth 2024 |
| CO₂-Quelle | Dr. Klein, Uni Münster (⚠ nicht im Wiki) | — |
| Niederschlag | — | DWD Station Würzburg (573,5 mm/Jahr, 1991–2020) |
| Lokale Validierung | Ausstehend | Ausstehend |

---

## API-Verträge

### `GET /api/simulate/baeume`

Alle Koeffizienten kommen ausschließlich aus `simulation_params.py`. Kein Hardcoding im Router.

#### Request-Parameter

| Parameter | Typ | Pflicht | Einheit | Validierung |
|---|---|---|---|---|
| `n_trees` | `int` | ja | Anzahl | ≥ 1; FastAPI: `Query(..., ge=1)` |
| `area_m2` | `float` | ja | m² | > 0; FastAPI: `Query(..., gt=0)` |

`land_use` und `species_type` sind intern fest / entfernt — kein API-Parameter.

#### Berechnung (Schritt für Schritt)

```
1. crown_area_total   = n_trees × CROWN_AREA_M2_DEFAULT           [m²]
2. delta_coverage_pct = crown_area_total / area_m2 × 100          [%]   (unkapped, kann > 100 sein)
3. coverage_capped    = min(delta_coverage_pct, 100.0)             [%]   (intern für LST-Berechnung)
4. delta_lst_celsius  = LST_PER_PCT_CANOPY_MIXED × coverage_capped [°C]  (LST_PER_PCT_CANOPY_MIXED = −0,083)
5. co2_kg_year        = n_trees × CO2_KG_PER_TREE_YEAR             [kg/Jahr]  (CO2_KG_PER_TREE_YEAR = 12,5)
```

`delta_coverage_pct` wird ungekürzt zurückgegeben, damit die UI den echten Deckungsgrad anzeigen kann. `delta_lst_celsius` basiert intern auf `coverage_capped` — die Formel ist ab 100 % nicht mehr valide.

#### Response (HTTP 200)

```json
{
  "n_trees": 250,
  "area_m2": 25000.0,
  "delta_coverage_pct": 50.0,
  "delta_lst_celsius": -4.15,
  "co2_kg_year": 3125.0,
  "coefficients_used": {
    "lst_per_pct_canopy": -0.083,
    "land_use": "mixed",
    "crown_area_m2": 50.0,
    "co2_kg_per_tree_year": 12.5
  },
  "caveats": ["..."]
}
```

| Feld | Typ | Einheit | Rundung | Immer vorhanden |
|---|---|---|---|---|
| `n_trees` | `int` | Anzahl | — | ja |
| `area_m2` | `float` | m² | ungerundet (Echo) | ja |
| `delta_coverage_pct` | `float` | % | 1 Dezimalstelle | ja |
| `delta_lst_celsius` | `float` | °C | 2 Dezimalstellen | ja |
| `co2_kg_year` | `float` | kg/Jahr | 1 Dezimalstelle | ja |
| `coefficients_used` | `object` | — | — | ja |
| `caveats` | `string[]` | — | — | ja, mind. 1 |

#### Fehlerfälle

| Eingabe | HTTP-Status | Verhalten |
|---|---|---|
| `n_trees=0` oder `n_trees=-1` | 422 | FastAPI Validation Error |
| `area_m2=0` oder `area_m2=-100` | 422 | FastAPI Validation Error |
| `n_trees` kein Integer | 422 | FastAPI Validation Error |
| `area_m2` kein Float/Int | 422 | FastAPI Validation Error |
| `n_trees > slider_max` (direkter API-Aufruf) | 200 | Gültige Antwort; `delta_coverage_pct` > 100; `delta_lst_celsius` trotzdem gecappt |

---

### `GET /api/simulate/wasser`

#### Request-Parameter

| Parameter | Typ | Pflicht | Einheit | Default | Erlaubte Werte |
|---|---|---|---|---|---|
| `area_m2` | `float` | ja | m² | — | > 0 |
| `from_surface` | `str` | nein | — | `"asphalt"` | Keys aus `RUNOFF_COEFFICIENTS` (siehe unten) |
| `to_surface` | `str` | nein | — | `"schotterrasen"` | Keys aus `RUNOFF_COEFFICIENTS` (siehe unten) |

**Erlaubte Surface-Keys** (autoritativ: `RUNOFF_COEFFICIENTS` in `simulation_params.py`):
`asphalt` · `sickerpflaster` · `schotterrasen` · `rasengitter` · `rasenwabe` · `lehm_kies` · `rasendecke`

#### Berechnung (Schritt für Schritt)

```
1. C_from             = RUNOFF_COEFFICIENTS[from_surface]
2. C_to               = RUNOFF_COEFFICIENTS[to_surface]
3. delta_C            = C_from - C_to                                     [dimensionslos]
4. infiltration_m3_year = max(0.0, area_m2 × ANNUAL_RAINFALL_WUERZBURG_M × delta_C)  [m³/Jahr]
5. retention_pct      = (1 - C_to) × 100                                  [%]   (Anteil Niederschlag der auf Zielbelag versickert)
6. context_persons    = infiltration_m3_year / 54.75                       [Personen]  (150 L/Tag × 365 = 54,75 m³/Person/Jahr)
```

`delta_C ≤ 0` (Zielbelag versiegelter als Ausgangsbelag) → `infiltration_m3_year = 0.0`; Caveat wird zurückgegeben.

#### Response (HTTP 200)

```json
{
  "area_m2": 3000.0,
  "from_surface": "asphalt",
  "to_surface": "schotterrasen",
  "infiltration_m3_year": 372.8,
  "retention_pct": 70.0,
  "context_persons": 6.8,
  "runoff_coefficients": { "from": 0.95, "to": 0.30, "delta": 0.65 },
  "rainfall_m_year": 0.5735,
  "caveats": ["..."]
}
```

| Feld | Typ | Einheit | Rundung | Immer vorhanden |
|---|---|---|---|---|
| `area_m2` | `float` | m² | ungerundet (Echo) | ja |
| `from_surface` | `str` | — | — | ja |
| `to_surface` | `str` | — | — | ja |
| `infiltration_m3_year` | `float` | m³/Jahr | 1 Dezimalstelle | ja |
| `retention_pct` | `float` | % | 1 Dezimalstelle | ja |
| `context_persons` | `float` | Personen | 1 Dezimalstelle | ja |
| `runoff_coefficients` | `object` | — | 3 Dezimalstellen (delta) | ja |
| `rainfall_m_year` | `float` | m/Jahr | ungerundet | ja |
| `caveats` | `string[]` | — | — | ja, mind. 1 |

#### Fehlerfälle

| Eingabe | HTTP-Status | Verhalten |
|---|---|---|
| `area_m2=0` oder `area_m2=-100` | 422 | FastAPI Validation Error |
| `from_surface="beton"` (unbekannt) | 422 | HTTP 422 mit Meldung inkl. erlaubter Werte |
| `to_surface="unknown"` (unbekannt) | 422 | HTTP 422 mit Meldung inkl. erlaubter Werte |
| `from_surface == to_surface` | 200 | `delta_C = 0` → `infiltration_m3_year = 0.0`; Caveat |
| `delta_C < 0` (Ziel versiegelter) | 200 | `infiltration_m3_year = 0.0`; Caveat |

---

## Konstanten & Parameter

### `backend/simulation_params.py` — Ergänzungen (noch hinzuzufügen)

```python
# ── CO₂-BINDUNG ───────────────────────────────────────────────────────────────
# Quelle: Dr. Daniel Klein, Wald-Zentrum Universität Münster
#   https://www.wildes-bayern.de/wp-content/uploads/2021/04/cUniversitaet_Muenster_CO2-Bindung-Baeume.pdf
#   Herleitung: Buche, 23 m, ∅ 30 cm → ~600 kg Trockenmasse → 1.000 kg CO₂ in 80 Jahren
# ⚠ Gilt für ausgewachsene Laubbäume im Forstbestand.
# ⚠ Noch nicht als Wiki-Seite ingested — vor Produktionsrelease nachholen.
CO2_KG_PER_TREE_YEAR = 12.5

# ── VERSIEGELUNGSGRADE JE FLÄCHENTYP ─────────────────────────────────────────
# v1: Literaturwerte (UBA Texte 141/2021, Leitfaden Bayreuth 2024, DIN 18005)
# ⚠ v2: Durch Copernicus Imperviousness Layer ersetzen
#   (GEE: JRC/GHSL/P2023A/GHS_BUILT_S, 10 m, via spatial join auf selektierte Polygone)
# Flachdächer (osm_flat_roof_industrial) explizit ausgeschlossen — kein Bodenbelag.
SEAL_RATE_BY_TYPE: dict[str, float] = {
    "osm_parking":                   0.95,
    "osm_square":                    0.90,
    "AX_Strassenverkehrsflaeche":    0.98,
    "AX_Platz":                      0.88,
    "AX_IndustrieUndGewerbeflaeche": 0.80,
    "AX_FlaecheGemischterNutzung":   0.65,
    "AX_Wohnbauflaeche":             0.60,
    "_default":                      0.70,
}
```

Bereits vorhanden in `simulation_params.py`:
- `LST_PER_PCT_CANOPY_MIXED = -0.083`
- `CROWN_AREA_M2_DEFAULT = 50.0`
- `RUNOFF_COEFFICIENTS` (alle 7 Belagstypen)
- `ANNUAL_RAINFALL_WUERZBURG_M = 0.5735` (DWD Station 05705, Ref. 1991–2020)

### `frontend/src/utils/simulate.js` — neue Datei

Spiegelt `simulation_params.py` für Frontend-Berechnungen (Slider-Max, Proportionierung). Bei Änderungen beide Dateien synchron halten.

```js
// Versiegelungsgrade — spiegelt SEAL_RATE_BY_TYPE aus simulation_params.py
export const SEAL_RATE = {
  'osm_parking':                   0.95,
  'osm_square':                    0.90,
  'AX_Strassenverkehrsflaeche':    0.98,
  'AX_Platz':                      0.88,
  'AX_IndustrieUndGewerbeflaeche': 0.80,
  'AX_FlaecheGemischterNutzung':   0.65,
  'AX_Wohnbauflaeche':             0.60,
  '_default':                      0.70,
}
export const getSealRate = (type_key) => SEAL_RATE[type_key] ?? SEAL_RATE['_default']

// Ausgangsbelag-Default je type_key (from_surface Auto-Fill)
export const FROM_SURFACE_BY_TYPE_KEY = {
  'osm_parking':                   'asphalt',
  'osm_square':                    'asphalt',
  'AX_Strassenverkehrsflaeche':    'asphalt',
  'AX_Platz':                      'asphalt',
  'AX_IndustrieUndGewerbeflaeche': 'asphalt',
  'AX_FlaecheGemischterNutzung':   'sickerpflaster',
  'AX_Wohnbauflaeche':             'sickerpflaster',
}
export const getFromSurface = (type_key) => FROM_SURFACE_BY_TYPE_KEY[type_key] ?? 'asphalt'

// Labels für Dropdowns
export const SURFACE_LABELS = {
  'asphalt':        'Asphalt / Beton',
  'sickerpflaster': 'Sickerpflaster',
  'schotterrasen':  'Schotterrasen',
  'rasengitter':    'Rasengitter',
  'rasenwabe':      'Rasenwabe',
  'lehm_kies':      'Lehm-/Kies-/Splittdecke',
  'rasendecke':     'Rasendecke / Wiese',
}

// Labels für type_key-Gruppen-Header im WasserSimPanel
export const TYPE_KEY_LABELS = {
  'osm_parking':                   'Parkplatz',
  'osm_square':                    'Platz / Markt',
  'AX_Strassenverkehrsflaeche':    'Straßenverkehrsfläche',
  'AX_Platz':                      'Platz (ATKIS)',
  'AX_IndustrieUndGewerbeflaeche': 'Industrie- u. Gewerbefläche',
  'AX_FlaecheGemischterNutzung':   'Fläche gemischter Nutzung',
  'AX_Wohnbauflaeche':             'Wohnbaufläche',
}

export const CROWN_AREA_M2_DEFAULT = 50  // spiegelt simulation_params.py
```

---

## Frontend-Architektur

### Seitenstruktur & Gesamtlayout

```
┌─ App.jsx ──────────────────────────────────────────────────────────────┐
│  Sidebar (48px collapsed ↔ 220px expanded)                             │
│  ┌─ main (flex-1, overflow-hidden) ────────────────────────────────┐  │
│  │  Topbar (48px)                                                   │  │
│  │  ┌─ Simulation.jsx (h-full, flex-col) ─────────────────────────┐│  │
│  │  │  Tab-Bar (shrink-0, ~52px)                                   ││  │
│  │  │  [ 🌳 Baumpflanzung ]   [ 💧 Entsiegelung ]                 ││  │
│  │  ├──────────────────────────────────────────────────────────────┤│  │
│  │  │  Karte (flex-1, relative)  │  Panel (w-[420px], shrink-0)   ││  │
│  │  │  MapSurface (h-full)       │  overflow-y-auto               ││  │
│  │  │  + SimCellLayer oder       │  BaumSimPanel | WasserSimPanel  ││  │
│  │  │    SimEntsiegelungLayer    │                                 ││  │
│  │  └──────────────────────────────────────────────────────────────┘│  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

Der Karten-Layer wechselt mit dem Tab: Bäume → `SimCellLayer` (LST-Kacheln); Entsiegelung → `SimEntsiegelungLayer` (Polygone, keine Flachdächer).

### Neue Komponenten

| Komponente | Pfad | Beschreibung |
|---|---|---|
| `SimCellLayer` | `components/map/overlays/SimCellLayer.jsx` | deck.gl GeoJsonLayer auf LST-Kacheln. Einzelklick-Toggle. Selektierte Kacheln: amber Outline (2 px) + heller Fill. Nicht-selektierte Kacheln: Alpha reduziert sobald ≥ 1 Kachel aktiv. Selektion per Feature-Index im `data`-Array. |
| `SimEntsiegelungLayer` | `components/map/overlays/SimEntsiegelungLayer.jsx` | deck.gl GeoJsonLayer auf Entsiegelungs-Polygonen. `osm_flat_roof_industrial` wird vor Layer-Erstellung herausgefiltert (kein Rendering, kein Klick). Selektierte Polygone: amber Outline. Gibt `{ idx, type_key, area_m2, label }` an Store. |
| `SimResultCard` | `components/simulation/SimResultCard.jsx` | Kompakte `KpiCard`-Variante. Props: `{ label, value, unit, caveat?, color, icon }`. 22 px Mono-Wert, kein Icon-Tile. `caveat`: gedimmte 10 px-Zeile direkt unter dem Wert (immer sichtbar wenn gesetzt). |
| `BaumSimPanel` | `components/simulation/BaumSimPanel.jsx` | Area-Info-Banner + Slider (`anzahl`, max = `floor(selectedCellsAreaM2 / 50)`) + Sekundärinfo (Deckungsgrad % + Formelgrenze-Label am Max) + Result-Grid (3 `SimResultCard`s: Δ°C · CO₂ · Kronendeckung) + Methodik-Toggle. |
| `WasserSimPanel` | `components/simulation/WasserSimPanel.jsx` | Area-Info-Banner + Belagstypen-Sektion (eine from/to-Zeile je `type_key`-Gruppe) + globaler Slider (max = Σ sealable) + Result-Grid (3 `SimResultCard`s: m³/Jahr · Retention % · Personen-Kontext) + Methodik-Toggle. Kein Δ°C. |

### Wiederverwendete Komponenten

- `MapSurface.jsx`, `DeckOverlay.jsx` — Karten-Infrastruktur
- `HeatLayer.jsx` — gedimmter Hintergrund auf Sim A (Opacity reduziert)
- `utils/format.js` — `fmt.temp`, `fmt.dT`, `fmt.area`, `fmt.num`, `fmt.pct`
- `api/lst.js` — Kacheldaten für `SimCellLayer`
- `api/entsiegelung.js` — Polygon-Daten für `SimEntsiegelungLayer`

### Store-Änderungen (`store/useAppStore.js`)

**Neue Top-Level-Keys:**
```js
sidebarCollapsed: false,
toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
```

**`sim`-Shape (ersetzt bisherigen Stand):**
```js
sim: {
  // Sim A
  selectedCells: [],          // number[] — Indizes im LST data-Array; session-only
  selectedCellsAreaM2: 0,     // abgeleitet: selectedCells.length × 10_000

  // Sim B
  selectedPolygons: [],       // { idx, type_key, area_m2, label }[]
  selectedPolygonsAreaM2: 0,  // abgeleitet: Σ area_m2

  baeume: {
    anzahl: 100,              // Slider-Wert; beim Auswahl-Reset auf min(anzahl, neues_max) kappen
  },
  wasser: {
    flaeche_m2: 1000,         // globaler Slider-Wert; max = Σ(area_m2 × seal_rate)
    groupConfig: {},           // { [type_key]: { from_surface: str, to_surface: str } }
                               // Eintrag wird auto-befüllt bei erstem Polygon-Klick des Typs
                               // Eintrag bleibt bei Tab-Wechsel erhalten
                               // Eintrag wird gelöscht wenn alle Polygone dieses Typs deselektiert werden
  },
}
```

**Neue Store-Actions:**

| Action | Effekt |
|---|---|
| `toggleSimCell(idx)` | Toggle Kachel-Index; `selectedCellsAreaM2` neu berechnen; `baeume.anzahl` auf `min(anzahl, neues_max)` kappen |
| `clearSimCells()` | `selectedCells = []`, `selectedCellsAreaM2 = 0`, `baeume.anzahl = 1` |
| `toggleSimPolygon({ idx, type_key, area_m2, label })` | Toggle Polygon; `selectedPolygonsAreaM2` neu berechnen; `wasser.flaeche_m2` auf `min(flaeche_m2, neues_max)` kappen; verwaiste `groupConfig`-Einträge bereinigen |
| `clearSimPolygons()` | `selectedPolygons = []`, `selectedPolygonsAreaM2 = 0`, `wasser.flaeche_m2 = 0`, `wasser.groupConfig = {}` |
| `setSimBaeumeAnzahl(n)` | Setzt `baeume.anzahl` |
| `setSimWasserFlaeche(m2)` | Setzt `wasser.flaeche_m2` |
| `setSimWasserGroupSurface(type_key, field, value)` | Schreibt `wasser.groupConfig[type_key][field]` (`field` ist `from_surface` oder `to_surface`) |

### API-Wrapper (`frontend/src/api/simulate.js`)

```js
import { apiFetch } from './client.js'

export const fetchSimulateBaeume = ({ n_trees, area_m2 }) =>
  apiFetch(`/api/simulate/baeume?n_trees=${n_trees}&area_m2=${area_m2}`)

export const fetchSimulateWasser = ({ area_m2, from_surface, to_surface }) =>
  apiFetch(`/api/simulate/wasser?area_m2=${area_m2}&from_surface=${from_surface}&to_surface=${to_surface}`)
```

Requests in den Panels werden **300 ms debounced** (Slider-Events).

---

## Panel-Layout-Spec

### Sim A — Baumpflanzung (`BaumSimPanel`)

```
┌─ Panel (420 px, overflow-y-auto) ───────────────────────────────────┐
│  Area-Info-Banner (shrink-0)                                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  🌳  2,5 ha · 25 Kacheln ausgewählt         [Zurücksetzen]    │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ── NEUPFLANZUNGEN ───────────────────────────────────────────────   │
│  [====●=========]  250 Bäume                                         │
│  ↳ 25,0 % Kronendeckung auf 2,5 ha                                   │
│  Max: 500 Bäume = 100 % Kronendeckung (Formelgrenze, Landsat)        │
│                                                                       │
│  ── ERGEBNISSE ───────────────────────────────────────────────────   │
│  ┌──────────────┬──────────────┬──────────────┐                      │
│  │  Δ LST       │  CO₂-Bindung │  Kronendeckg.│                      │
│  │  −2,07 °C    │   3,1 t/J    │  25,0 %      │                      │
│  │  ⚠ München- │  ⚠ Ausgewach-│              │                      │
│  │  Koeffizient │  sene Bäume  │              │                      │
│  └──────────────┴──────────────┴──────────────┘                      │
│                                                                       │
│  Methodik & Einschränkungen ▾                                         │
│  [vollständige Caveats + Koeffizienten, ausklappbar]                 │
└───────────────────────────────────────────────────────────────────────┘
```

- CO₂: Anzeige in kg/Jahr wenn < 1.000, sonst in t/Jahr (1 Dezimalstelle)
- Wichtigster Caveat je Karte als `caveat`-Prop (immer sichtbar, gedimmt)
- Vollständige Caveats + Quellen hinter Methodik-Toggle (konsistent mit Hitzeatlas)

### Sim B — Entsiegelung (`WasserSimPanel`)

```
┌─ Panel (420 px, overflow-y-auto) ───────────────────────────────────┐
│  Area-Info-Banner (shrink-0)                                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  💧  1,2 ha · 3 Polygone ausgewählt          [Zurücksetzen]   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ── BELAGSTYPEN ──────────────────────────────────────────────────   │
│  Parkplatz · 3.000 m²                                                │
│  Von [Asphalt / Beton    ▾]  →  Zu [Schotterrasen    ▾]             │
│                                                                       │
│  Industrie- u. Gewerbefläche · 9.000 m²                              │
│  Von [Asphalt / Beton    ▾]  →  Zu [Schotterrasen    ▾]             │
│  ──────────────────────────────────────────────────────────────────  │
│                                                                       │
│  ── ZU ENTSIEGELNDE FLÄCHE ────────────────────────────────────────  │
│  [====●=========]  6.500 m²                                          │
│  Max: 10.050 m² (Σ versiegelte Fläche, Literaturwerte)               │
│                                                                       │
│  ── ERGEBNISSE ───────────────────────────────────────────────────   │
│  ┌──────────────┬──────────────┬──────────────┐                      │
│  │  Versickerung│  Retention   │  Kontext     │                      │
│  │  3.720 m³/J  │  70,0 %      │  68 Pers.    │                      │
│  └──────────────┴──────────────┴──────────────┘                      │
│                                                                       │
│  Methodik & Einschränkungen ▾                                         │
└───────────────────────────────────────────────────────────────────────┘
```

- Belagstypen-Sektion: eine Zeile pro einzigartiger `type_key`-Gruppe; `type_key`-Label + Σ `area_m2`
- `from_surface` auto-befüllt aus `FROM_SURFACE_BY_TYPE_KEY`; überschreibbar; bleibt bei Tab-Wechsel
- `to_surface` Default `"schotterrasen"` je Gruppe
- Proportionale Aufteilung: `area_for_call_i = slider_value × (sealable_i / total_sealable)`
- Pro Gruppe ein API-Aufruf; `infiltration_m3_year` + `context_persons` werden summiert
- `retention_pct`: flächengewichteter Durchschnitt (Gewicht = `area_for_call_i` je Gruppe)
- Kontext-Karte: „entspricht Jahreswasserbedarf von X Personen (150 L/Tag)"

---

## Slider-Cap Bäume — UI-Dokumentationspflicht

**Warum die Grenze:** Der LST-Koeffizient −0,083 °C/% basiert auf 2D-Kronendeckung aus Landsat. Ab 100 % Deckung ist die Formel ungültig — weitere Bäume würden linear extrapoliert, obwohl der Sensor keinen Mehreffekt registrieren kann.

**UI-Anforderungen:**
- Slider-Max dynamisch: `floor(selectedCellsAreaM2 / 50)`, wird bei Kachelauswahl/-reset neu berechnet
- `baeume.anzahl` wird bei Kachel-Deselektierung auf `min(anzahl, neues_max)` gecappt (Store-Action `toggleSimCell`)
- Sekundärinfo am Slider: `↳ 25,0 % Kronendeckung auf X ha`
- Label am Slider-Maximum: `„Max: N Bäume = 100 % Kronendeckung (Formelgrenze, Landsat-basiert)"`
- Keine stille Kappung ohne Kontext für den Nutzer

---

## CO₂-Caveats

Caveats kommen aus dem `caveats[]`-Array der API-Antwort und werden im Methodik-Toggle angezeigt. Wichtigster Caveat zusätzlich als `caveat`-Prop direkt in der CO₂-`SimResultCard`.

1. „12,5 kg/Baum/Jahr ist ein Mittelwert für ausgewachsene Laubbäume im Forstbestand — Neupflanzungen binden in den ersten Jahren deutlich weniger."
2. „Stadtbäume wachsen oft langsamer als Waldbäume (Bodenverdichtung, Hitze, Wurzelraum)."
3. „CO₂-Bindung ist ein Nebeneffekt; die primäre Klimafunktion von Stadtbäumen ist Kühlung durch Transpiration und Beschattung."
4. „Kontext: 80 Bäume binden ~1 Tonne CO₂/Jahr — entspricht ca. einer Autobahnfahrt Würzburg–Hamburg und zurück."

> Die Quelle (Dr. Klein, Uni Münster) warnt selbst: *„Wie viel CO₂ ein Baum pro Jahr speichert, lässt sich seriös nicht sagen."* Der Wert 12,5 kg/Jahr ist eine Faustformel.

---

## Edge Cases & UX-Verhalten

### Keine Auswahl getroffen

- Area-Info-Banner zeigt: „Klicke auf [Kacheln / Polygone] in der Karte, um die Simulation zu starten."
- Slider deaktiviert (`disabled`), kein API-Aufruf
- Result-Grid ausgegraut (`opacity-50`), Werte als `—` dargestellt
- Methodik-Toggle kann trotzdem geöffnet werden

### API lädt

- Slider bleibt bedienbar (Debounce verhindert Spam)
- Result-Kacheln zeigen `Spinner` statt Werte
- Kein Disabled des Sliders während Laden

### API-Fehler / Timeout

- Fehlermeldung unterhalb Result-Grid: „Berechnung fehlgeschlagen — bitte erneut versuchen."
- Kein App-Crash; letztes valides Ergebnis bleibt sichtbar bis erneuter Fehler
- Timeout nach 10 s behandelt wie Fehler

### Mischselektion bei Entsiegelung (verschiedene `type_key`s)

**Entschieden:** Ein from/to-Dropdown-Paar pro `type_key`-Gruppe.

- Beim ersten Klick auf ein Polygon eines neuen `type_key` wird `groupConfig[type_key]` mit `from_surface` aus `FROM_SURFACE_BY_TYPE_KEY` und `to_surface = "schotterrasen"` initialisiert
- Bestehende `groupConfig`-Einträge werden bei weiteren Klicks desselben `type_key` nicht überschrieben
- Wenn alle Polygone eines `type_key` deselektiert werden, wird der zugehörige `groupConfig`-Eintrag gelöscht (nächstes Hinzufügen startet wieder mit Auto-Fill)
- Pro Gruppe ein separater API-Aufruf mit proportionierten `area_m2`
- Wenn `total_sealable = 0` (z. B. ungültiger Sonderfall): Slider disabled, Fehlermeldung

### Reset-Verhalten

- **[Zurücksetzen]-Button (Sim A):** `clearSimCells()` → Kachel-Selektion leer, `baeume.anzahl = 1`, Result-Grid zurück in Leer-Zustand
- **[Zurücksetzen]-Button (Sim B):** `clearSimPolygons()` → Polygon-Selektion leer, `wasser.flaeche_m2 = 0`, `groupConfig = {}`, Result-Grid leer
- **Tab-Wechsel (Bäume ↔ Entsiegelung):** Selektion und Slider der jeweils anderen Simulation bleiben **unverändert erhalten** — kein Reset beim Tab-Wechsel
- **Kachel-Deselektierung:** `baeume.anzahl` wird auf `min(anzahl, neues_max)` gecappt, nicht auf 1 zurückgesetzt (außer bei `clearSimCells`)

### Selektierte Features nach Datenneuladung nicht mehr gültig

- Selektion ist session-only (kein localStorage). Seiten-Reload verwirft die Selektion automatisch
- Wenn LST-Daten via `?refresh=true` neu geladen werden während die Simulation aktiv ist: `clearSimCells()` wird aufgerufen, Nutzer sieht Leer-Zustand (kein stiller Fehler)
- Gleiches gilt für Entsiegelungs-Daten

### Sehr große Auswahl

- LST-Layer hat ~14.500 Features; theoretisch alle selektierbar
- deck.gl rendert Farb-Callbacks pro Frame — kein Performance-Problem erwartet
- Bei sehr großer Selektion sind die Ergebniswerte naturgemäß groß (z. B. −8,3 °C bei 100 % Kronendeckung über gesamte Stadtfläche); keine Kappung im Backend oberhalb der physikalischen Formelgrenze

### Desktop-only

- Breakpoint `< 1024 px`: Vollseiten-Banner „Diese Seite ist für Desktop optimiert.", keine Karte, kein Panel
- Map + Panel werden bei `< 1024 px` nicht gerendert (kein LST-Fetch auf Mobilgeräten)

---

## Implementierungs-Milestones

### M1 — Backend (Voraussetzung für alle weiteren Schritte)

1. **`simulation_params.py`** ergänzen: `CO2_KG_PER_TREE_YEAR = 12.5`, `SEAL_RATE_BY_TYPE` (Dict)
2. **`backend/routers/simulate.py`** implementieren:
   - `GET /api/simulate/baeume` — Query-Parameter validieren, Berechnung nach Spec oben, JSON zurückgeben
   - `GET /api/simulate/wasser` — Query-Parameter validieren, Berechnung nach Spec, `infiltration_m3_year = max(0, ...)`, JSON zurückgeben
   - Keine Daten-I/O, kein Caching — reine Berechnung
3. Manuelle Smoke-Tests der Endpoints via `curl` oder Browser gegen laufendes Backend

### M2 — Store + Sidebar (App-weite Voraussetzung)

4. **`store/useAppStore.js`** aktualisieren: `sidebarCollapsed` + `toggleSidebar`, `sim`-Shape ersetzen, alle neuen Actions implementieren
5. **`App.jsx`** anpassen: `marginLeft` reaktiv auf `sidebarCollapsed`
6. **`layout/Sidebar.jsx`** anpassen: Collapse-Toggle-Button am unteren Rand, 220 px ↔ 48 px, Icon-only-Modus bei collapsed

### M3 — Frontend-Infrastruktur (parallel zu M2 möglich)

7. **`utils/simulate.js`** anlegen: `SEAL_RATE`, `getSealRate`, `FROM_SURFACE_BY_TYPE_KEY`, `getFromSurface`, `SURFACE_LABELS`, `TYPE_KEY_LABELS`, `CROWN_AREA_M2_DEFAULT`
8. **`api/simulate.js`** anlegen: `fetchSimulateBaeume`, `fetchSimulateWasser`

### M4 — Karten-Layer und Selektion

9. **`SimCellLayer.jsx`** anlegen: LST-Kacheln rendert, Klick → `toggleSimCell(index)`, selektierte Kacheln hervorgehoben, nicht-selektierte gedimmt wenn Selektion aktiv
10. **`SimEntsiegelungLayer.jsx`** anlegen: Polygone rendert (ohne `osm_flat_roof_industrial`), Klick → `toggleSimPolygon(...)`, selektierte Polygone hervorgehoben

### M5 — Panels und Result Cards

11. **`SimResultCard.jsx`** anlegen: kompakte `KpiCard`-Variante nach Spec
12. **`BaumSimPanel.jsx`** anlegen: Area-Info-Banner + Slider + Sekundärinfo + Result-Grid + Methodik-Toggle
13. **`WasserSimPanel.jsx`** anlegen: Area-Info-Banner + Belagstypen-Sektion + Slider + Result-Grid + Methodik-Toggle
14. **`Simulation.jsx`** vollständig implementieren: Tab-Layout, Karte + Panel, Layer-Switch per Tab, Desktop-only-Guard

### M6 — Loading, Error States, Debouncing

15. Debouncing (300 ms) auf Slider-Events in beiden Panels
16. Loading-State: Spinner in Result-Kacheln während API-Aufruf
17. Error-State: Fehlermeldung unter Result-Grid
18. Leer-Zustand: Panel-Inhalte ausgegraut wenn keine Auswahl

### M7 — QA

19. Backend-Tests ausführen (siehe Testplan unten)
20. Frontend-Unit-Tests für Store-Actions
21. Manuelle Durchsicht der UI: Slider-Cap-Erklärung, Caveats, Tab-Wechsel, Reset-Verhalten, Desktop-Banner
22. Cross-Check: Ergebnisse der UI gegen manuelle Berechnung per Taschenrechner

---

## Testplan

### Backend-Tests (`backend/tests/test_simulate.py`)

Testframework: `pytest` + `httpx.AsyncClient` (FastAPI-Testclient), analog zu `test_trees.py`.

#### Sim A — `/api/simulate/baeume`

**Normalfälle:**

| Testfall | Input | Erwartetes Ergebnis |
|---|---|---|
| Standardfall | `n_trees=100, area_m2=10000` | `delta_coverage_pct=50.0`, `delta_lst_celsius=-4.15`, `co2_kg_year=1250.0` |
| Genau 100 % Deckung | `n_trees=200, area_m2=10000` | `delta_coverage_pct=100.0`, `delta_lst_celsius=-8.3` |
| Über 100 % Deckung | `n_trees=300, area_m2=10000` | `delta_coverage_pct=150.0`, `delta_lst_celsius=-8.3` (gecappt) |
| 1 Baum auf 1 Kachel | `n_trees=1, area_m2=10000` | `delta_coverage_pct=0.5`, `delta_lst_celsius=-0.04` |
| Viele Kacheln | `n_trees=1000, area_m2=500000` | `delta_coverage_pct=10.0`, `delta_lst_celsius=-0.83` |
| CO₂ unter 1.000 kg | `n_trees=10, area_m2=10000` | `co2_kg_year=125.0` |

**Validierungstests (alle erwarten HTTP 422):**

- `n_trees=0`
- `n_trees=-1`
- `n_trees=0.5` (kein Integer)
- `area_m2=0`
- `area_m2=-100`
- Fehlende Parameter: kein `n_trees`, kein `area_m2`

**Strukturtests:**

- Response enthält alle Pflichtfelder: `n_trees`, `area_m2`, `delta_coverage_pct`, `delta_lst_celsius`, `co2_kg_year`, `coefficients_used`, `caveats`
- `caveats` ist eine nicht-leere Liste von Strings
- `coefficients_used.land_use == "mixed"`
- `coefficients_used.crown_area_m2 == 50.0`

#### Sim B — `/api/simulate/wasser`

**Normalfälle:**

| Testfall | Input | Erwartetes Ergebnis |
|---|---|---|
| Standardfall | `area_m2=1000, from_surface=asphalt, to_surface=schotterrasen` | `infiltration_m3_year=372.8`, `retention_pct=70.0`, `context_persons=6.8` |
| Maximale Entsiegelung | `area_m2=1000, from_surface=asphalt, to_surface=rasendecke` | `delta_C=0.90`, `infiltration_m3_year=516.2` |
| Gleicher Belag | `area_m2=1000, from_surface=asphalt, to_surface=asphalt` | `infiltration_m3_year=0.0`, `retention_pct=5.0` |
| Invertierter Fall | `area_m2=1000, from_surface=rasendecke, to_surface=asphalt` | `infiltration_m3_year=0.0` |
| Default-Parameter | `area_m2=5000` (kein from/to) | `from_surface="asphalt"`, `to_surface="schotterrasen"` |
| Alle Belagstypen | je ein Test für jeden der 7 Keys | HTTP 200, valide Werte |

**Validierungstests (alle erwarten HTTP 422):**

- `area_m2=0`
- `area_m2=-500`
- `from_surface="beton"` (unbekannt)
- `to_surface="unknown"` (unbekannt)
- Fehlender `area_m2`

**Strukturtests:**

- Response enthält alle Pflichtfelder: `area_m2`, `from_surface`, `to_surface`, `infiltration_m3_year`, `retention_pct`, `context_persons`, `runoff_coefficients`, `rainfall_m_year`, `caveats`
- `runoff_coefficients` enthält `from`, `to`, `delta`
- `rainfall_m_year == 0.5735`
- `caveats` ist nicht-leere Liste

**Rechenkontrolle:**
- `infiltration_m3_year` = `area_m2 × 0.5735 × delta_C` (auf 1 Stelle gerundet)
- `context_persons` = `infiltration_m3_year / 54.75` (auf 1 Stelle gerundet)

---

### Frontend / Store-Tests

Testframework: `vitest` + `@testing-library/react` (analog zu vorhandenem Setup).

#### Store-Actions (`useAppStore.sim`)

| Testfall | Aktion | Erwarteter Zustand |
|---|---|---|
| Kachel hinzufügen | `toggleSimCell(5)` auf leerem State | `selectedCells=[5]`, `selectedCellsAreaM2=10000` |
| Kachel entfernen | `toggleSimCell(5)` wenn 5 vorhanden | `selectedCells=[]`, `selectedCellsAreaM2=0` |
| Mehrere Kacheln | `toggleSimCell(3)`, `toggleSimCell(7)` | `selectedCells=[3,7]`, `selectedCellsAreaM2=20000` |
| Kachel-Reset | `clearSimCells()` nach 3 Kacheln | `selectedCells=[]`, `selectedCellsAreaM2=0`, `baeume.anzahl=1` |
| Anzahl-Kappung | 5 Kacheln (max=1000), dann 4 Kacheln deselektieren (max=200), `anzahl=500` | `anzahl` → `200` |
| Polygon hinzufügen | `toggleSimPolygon({idx:0, type_key:'osm_parking', area_m2:3000, label:'P'})` | `selectedPolygons.length=1`, `selectedPolygonsAreaM2=3000` |
| Polygon entfernen | Doppelklick (toggle) | `selectedPolygons=[]`, `selectedPolygonsAreaM2=0` |
| Polygon-Reset | `clearSimPolygons()` | `selectedPolygons=[]`, `selectedPolygonsAreaM2=0`, `groupConfig={}` |
| groupConfig init | Erstes Polygon `osm_parking` | `groupConfig['osm_parking'].from_surface='asphalt'`, `to_surface='schotterrasen'` |
| groupConfig persist | Zweites Polygon `osm_parking` | Bestehender `groupConfig`-Eintrag nicht überschrieben |
| groupConfig bereinigen | Alle `osm_parking`-Polygone entfernen | `groupConfig['osm_parking']` nicht mehr vorhanden |
| surface override | `setSimWasserGroupSurface('osm_parking', 'to_surface', 'rasengitter')` | `groupConfig['osm_parking'].to_surface='rasengitter'` |
| Tab-Wechsel | Kacheln selektieren, dann Polygon selektieren | Beide Selektionen unabhängig erhalten |

#### Slider-Max-Logik

| Testfall | Eingabe | Erwartetes Slider-Max |
|---|---|---|
| 0 Kacheln | `selectedCellsAreaM2=0` | 0 (disabled) |
| 1 Kachel | `selectedCellsAreaM2=10000` | `floor(10000/50) = 200` |
| 5 Kacheln | `selectedCellsAreaM2=50000` | `floor(50000/50) = 1000` |
| 0 Polygone | `selectedPolygonsAreaM2=0` | 0 (disabled) |
| 1 `osm_parking` (3000 m²) | — | `floor(3000 × 0.95) = 2850` |
| gemischt: `osm_parking` 3000 m² + `AX_IndustrieUndGewerbeflaeche` 5000 m² | — | `2850 + 4000 = 6850` |

#### Utils (`utils/simulate.js`)

- `getSealRate('osm_parking')` → `0.95`
- `getSealRate('unbekannt')` → `0.70` (Fallback `_default`)
- `getFromSurface('osm_parking')` → `'asphalt'`
- `getFromSurface('AX_Wohnbauflaeche')` → `'sickerpflaster'`
- `getFromSurface('unbekannt')` → `'asphalt'` (Fallback)
- `SURFACE_LABELS` enthält alle 7 Keys aus `RUNOFF_COEFFICIENTS`

---

### UI / Integrationstests (manuell oder mit Playwright)

#### Disabled- / Leer-Zustand

- Keine Auswahl → Slider disabled, Result-Kacheln zeigen `—`, Banner-Hinweistext sichtbar
- Panel-Inhalte ausgegraut (`opacity-50`)
- Kein Netzwerk-Request bei 0 Kacheln / 0 Polygonen

#### Sim A — Baumpflanzung

- Kachel anklicken → Area-Banner aktualisiert, Slider aktiviert, API-Aufruf nach 300 ms Debounce
- Slider an Maximum → Sekundärinfo zeigt `100 %`, Formelgrenze-Label erscheint
- Slider-Wert nach Kachel-Deselektierung nicht über neuem Max
- CO₂ < 1.000 kg → Anzeige in kg; CO₂ ≥ 1.000 kg → Anzeige in t/Jahr
- `[Zurücksetzen]` → Kacheln weg, Slider auf 1, Result-Grid leer

#### Sim B — Entsiegelung

- `osm_flat_roof_industrial`-Feature weder sichtbar noch klickbar in `SimEntsiegelungLayer`
- Polygon anklicken → Gruppe erscheint in Belagstypen-Sektion mit korrektem `from_surface`-Default
- Zweites Polygon anderen Typs → zweite Gruppen-Zeile erscheint
- from/to-Dropdown manuell ändern → bleibt bei Tab-Wechsel erhalten
- Slider-Max reflektiert korrekte Σ sealable area nach Selektion
- `[Zurücksetzen]` → alle Polygone weg, `groupConfig` leer, Slider auf 0

#### Loading- / Error-States

- Langsame Netzwerkverbindung (DevTools throttle) → Spinner sichtbar in Result-Kacheln
- API antwortet mit 422 → Fehlermeldung unterhalb Result-Grid, kein Crash
- API timeout → gleiche Fehlermeldung nach ~10 s

#### Collapsible Sidebar

- Toggle-Button kollabiert Sidebar auf 48 px, nur Icons sichtbar
- Re-expand → Labels erscheinen, Layout intakt
- Collapsible-Zustand persists bei Seitenwechsel (in-session)

#### Desktop-only

- Viewport `< 1024 px` → Desktop-Banner sichtbar, kein MapSurface-Rendering, kein LST-Fetch

---

## v2-Ideen (nicht in v1-Scope)

- **Drag-to-select:** Rechteck aufziehen → alle LST-Kacheln im Rechteck selektiert
- **SimMiniMap:** Echter zweiter Map-Kontext (deck.gl StaticMap) als Thumbnail im Panel
- **Transpirationskühlleistung (kWh/Jahr):** Nur wenn Wert in verständliche Einheit übersetzt wird (z. B. „entspricht X Klimaanlagen-Betriebsstunden")
- **Δ°C für Entsiegelung:** Nur wenn Nutzer Stadtbezirk als Bezugsfläche wählt (dann sinnvolle Prozentbasis)
- **Versiegelungsgrade via Copernicus:** Copernicus Imperviousness Layer (GEE `JRC/GHSL/P2023A/GHS_BUILT_S`, 10 m) per spatial join auf selektierte Polygone — ersetzt `SEAL_RATE_BY_TYPE`-Literaturwerte
- **Oberflächentemperatur nach Belagstyp:** `SURFACE_TEMP_CELSIUS`-Lookup; erst wenn alle 7 Typen aus Literatur belegt
- **Beschattung als eigene Variable:** m² Schatten bei Sonnenhöchststand; erfordert Sonnenwinkel + Kronenhöhe
- **species_type-Dropdown:** Nur sinnvoll wenn kWh/Jahr in v2 aufgenommen
- **Gründach-Simulation:** Wasserrückhalt, Evaporation, Schwammstadteffekt — eigenständiger Simulationspunkt
