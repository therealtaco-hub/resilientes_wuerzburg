# Tree-Sim Upgrade — Kronenüberlappungs-Modell (negativ-exponentiell)

**Status:** Plan · ausgearbeitet, bereit zur Umsetzungsentscheidung
**Betrifft:** `bestand_pct`-Berechnung · `/api/simulate/baeume` · `BaumSimPanel.jsx` · Doku/Wiki
**Autoren-Hinweis:** Erstplanung von Sonnet, fachlich ausgearbeitet + quellengestützt für die Uni-Ausarbeitung.

> **Aufbau — zwei unabhängig umsetzbare Teile.** Dieses Dokument bündelt zwei Mechanismen, die sich fachlich ergänzen, aber **getrennt und in beliebiger Reihenfolge** implementiert werden können:
> - **Teil 1 (Abschnitte 1–9): Kronendeckungskalkulation.** Korrigiert die *Doppelzählung* von Kronenflächen (negativ-exponentielles Überlappungsmodell für `bestand_pct` + Deckungszuwachs).
> - **Teil 2 (Abschnitt 10): Bepflanzbare Fläche pro LST-Zelle.** Begrenzt die *plausible Baumanzahl* je Zelle auf den unversiegelten Flächenanteil (Versiegelungsgrad je dominanter ATKIS-Kategorie).
>
> **Einziger gemeinsamer Berührungspunkt im Code:** die `sliderMax`-Zeile in `BaumSimPanel.jsx` (Z. 97). Beide Teile fassen sie an — wer sie getrennt umsetzt, beachte den Merge-Hinweis in 10.7 (Fix D). Alle übrigen Änderungen sind disjunkt. Beide Teile erfordern je einen `lst.parquet`-Neuaufbau (`?refresh=true`).

---

# Teil 1 — Kronendeckungskalkulation (Überlappungsmodell)

*Korrigiert die Doppelzählung von Kronenflächen. Unabhängig von Teil 2 umsetzbar. Cache: erfordert `lst.parquet`-Neuaufbau, weil sich `bestand_pct` ändert.*

---

## 1. Problem

Die aktuelle Simulation und die `bestand_pct`-Berechnung addieren Kronenflächen **naiv**:

```
bestand_pct = Σ(crown_area_m2) / 10.000 m² × 100        # data_loader._compute_bestand_pct
delta_coverage_pct = n_trees × 50 m² / area_m2 × 100     # simulate.py
```

Das ignoriert Kronenüberschneidungen vollständig und führt zu drei systematischen Fehlern:

- **Ringpark-/Park-Problem:** Dichte Bestände erreichen `bestand_pct ≈ 99–100 %`, obwohl die reale Bodenabdeckung (= vertikale Projektion aller Kronen) eher bei 60–75 % liegt. Kronen überlappen sich, dieselbe Bodenfläche wird mehrfach gezählt.
- **Allee-Problem:** Eng stehende Straßenbäume zeigen eine unrealistisch hohe Kronendeckung.
- **200-Bäume-Problem:** In einer baumfreien 100×100-m-Zelle lassen sich 200 Bäume à 50 m² simulieren → 100 % Deckung, als ob die ganze Zelle (inkl. Gebäude, Straßen, Wegen) aus Baumkronen bestünde.

Der `headroom`-Cap (`100 % − bestand_pct`) erbt diesen Fehler, weil er auf dem verzerrten Basiswert aufsetzt.

### Warum das fachlich (nicht nur kosmetisch) falsch ist

Der Kühlkoeffizient −0,083 °C/% stammt aus **García de León et al. (2025, Studie München; Daten Sommer 2020)** und ist gegen **projizierte Kronendeckung** (canopy cover) kalibriert: Die Studie segmentiert >166.000 Einzelkronen aus Luftbildern und berechnet pro ATKIS-Polygon den Anteil der Bodenfläche, der von der Kronenprojektion bedeckt ist — Überlappungen sind dort bereits eliminiert (Vereinigungsfläche, nicht Summe). Unsere naive Summen-Prozente sind also **nicht die Größe, gegen die der Koeffizient kalibriert wurde.** Bei niedriger Deckung (wenige, einzeln stehende Bäume) ist der Unterschied vernachlässigbar; bei hoher Deckung überschätzt die Summe die echte Kronendeckung massiv — genau dort, wo die Simulation Δ°C berechnet.

> **Kernargument für die Uni-Ausarbeitung:** Die Umstellung auf projizierte Kronendeckung ist **keine Verschärfung gegenüber dem Koeffizienten, sondern stellt erst die methodische Konsistenz mit der Kalibrierungsgröße von García de León her.** Der ursprüngliche Plan führte das unter „offene Risiken" — tatsächlich ist es ein Argument *für* die Änderung.

---

## 2. Lösung: negativ-exponentielles Überlappungsmodell

### 2.1 Formel

```
projected_cover = 1 − exp(−Σ crown_area / cell_area)
```

In Prozent:

```
bestand_pct = (1 − exp(−ratio)) × 100        mit  ratio = Σ crown_area / cell_area
```

Die Formel bildet ab, dass jeder zusätzliche Quadratmeter Kronenfläche mit zunehmender Belegung immer häufiger auf bereits beschattete Fläche fällt. Sie konvergiert asymptotisch gegen 100 % — ein harter Cap entfällt, `.clip()` wird überflüssig.

### 2.2 Wissenschaftliche Grundlage

Das Modell ist der **Standardansatz der Forstökologie und der Stadtbaum-Assessment-Tools** für Kronendeckung bei räumlich zufälliger Baumverteilung:

| Quelle | Beitrag |
|---|---|
| **Crookston & Stage (1999)**, USDA Forest Service, GTR RMRS-GTR-24 | **Primärquelle der exakten Gleichung.** Definiert `CCpct = 100·(1 − exp(−Σ CAᵢ / A))` für den Forest Vegetation Simulator (FVS). Annahme: Kronen überlappen sich zufällig in der Horizontalen (Poisson-Verteilung der Kronenmittelpunkte); Anwendung der Beer-Lambert-Logik auf die Summe der Einzelkronenflächen. |
| **Jennings, Brown & Sheil (1999)**, *Forestry* 72(1):59–73 | Begriffsfundament: Unterscheidung **canopy cover** (vertikale Kronenprojektion auf den Boden — das, was wir modellieren) vs. **canopy closure** (hemisphärischer Verschluss vom Einzelpunkt aus). Standardreferenz, u. a. von FAO und nationalen Waldinventuren genutzt. |
| **iTree Canopy / iTree Eco** (USDA Forest Service) | Verwendet dieselbe Überlappungslogik in der operativen Stadtbaum-Bewertung — belegt die Praxistauglichkeit für urbane Anwendungen. |

### 2.3 Numerische Intuition

| Σ Kronenfläche / Zellfläche (`ratio`) | Naive Deckung | Projizierte Deckung |
|---|---|---|
| 0,3 | 30 % | 26 % |
| 0,5 | 50 % | 39 % |
| 1,0 (1× belegt) | 100 % | **63 %** |
| 2,0 (2× belegt) | 200 % (absurd) | **86 %** |
| 3,0 (3× belegt) | 300 % (absurd) | **95 %** |

Ringpark-typische Dichten (~2× Belegung) ergeben ~86 % statt 99 %. Bei geringer Belegung (Parkplatz mit Einzelbaum, ~0,3×) bleibt der Unterschied klein (26 % vs. 30 %) — das Modell korrigiert dort, wo es nötig ist, und lässt dünn bestockte Flächen nahezu unverändert.

### 2.4 Ehrliche Grenze des Modells (für die Methodenkritik)

Die Annahme ist **zufällige (Poisson-)Platzierung** der Kronen. Stadtbäume sind das oft nicht:

- **Straßenbäume / Alleen:** regelmäßig (über-dispers) gepflanzt → reale Überlappung *geringer* als zufällig → Modell **unterschätzt** die Deckung leicht.
- **Park-Cluster:** geklumpt → reale Überlappung *höher* als zufällig → Modell **überschätzt** geringfügig.

**Gray et al. (2021)**, *Forest Ecology and Management* 501:119682, zeigen empirisch, dass reine Zufallsüberlappung in produktiven, dicht stehenden Beständen Deckungen >90 % nicht ganz erreicht (RMSE ~14 %). Für unseren Zweck — eine planerische Was-wäre-wenn-Abschätzung auf 100-m-Raster, keine forstliche Bestandsinventur — ist die Zufallsannahme die **beste vertretbare Vereinfachung ohne Einzelbaum-Geometrie-Union** (die einen teuren räumlichen Verschnitt aller Kronenpolygone erfordern würde). Das gehört als Caveat in die Methodik, rechtfertigt aber nicht den Mehraufwand einer echten geometrischen Union.

### 2.5 Warum kein flächentyp-basierter Cap (ATKIS-Maximaldeckung)?

Eine Alternative wäre, nach ATKIS-Typ zu cappen (Park ≤ 80 %, Wohngebiet ≤ 35 %). Abzulehnen, weil:

1. Die selektierten LST-Kacheln tragen keinen ATKIS-Typ → zusätzlicher Spatial Join nötig (Aufwand, neue Fehlerquelle).
2. Willkürliche Schranken sind schwerer zu begründen als ein physikalisch motiviertes Modell.
3. Das Überlappungsmodell differenziert bereits selbst: 2× belegter Park → 86 %, dünn bestockter Parkplatz → 26 %.

---

## 3. Einordnung in den App-Gesamtkontext

### 3.1 Datenfluss von `bestand_pct`

```
_compute_bestand_pct()                    [backend/utils/data_loader.py]
        │  (schreibt Spalte in lst.parquet)
        ▼
GET /api/lst  →  props.bestand_pct        [backend/routers/lst.py]
        │
        ▼
lstData.features[i].properties.bestand_pct [Frontend]
        │  Ø über selektierte Kacheln = existingPct
        ▼
BaumSimPanel  →  existing_coverage_pct      [BaumSimPanel.jsx]
        │
        ▼
GET /api/simulate/baeume                    [backend/routers/simulate.py]
```

`bestand_pct` ist **ausschließlich** Eingang dieser Simulationskette. Verifiziert: HVI/Vulnerabilität (`analysis.py`, `vuln_formula.py`) und Stadtbezirks-Aggregate nutzen `bestand_pct` **nicht** → keine Seiteneffekte auf andere Tabs/Endpoints.

### 3.2 Cache-Konsequenz

`bestand_pct` ist Teil von `backend/data/lst.parquet`. Nach dem Fix in `_compute_bestand_pct` enthält ein alter Cache veraltete naive Werte. **Pflicht:** `lst.parquet` löschen **oder** `/api/lst?refresh=true` aufrufen. Das ist dieselbe Cache-Disziplin, die in `CLAUDE.md` bereits für den LST-Tausch dokumentiert ist — dort einen Hinweis ergänzen.

### 3.3 Konsistenz mit der geplanten Würzburg-Kalibrierung (TODO „Variante B")

Das offene TODO „eigene Baum-Koeffizienten für Würzburg ableiten" regressiert künftig LST gegen Baumkronenanteil je 100-m-Zelle. **Wichtig:** Dieser Kronenanteil muss dann **ebenfalls** als projizierte Deckung (Überlappungsmodell) berechnet werden — sonst entsteht eine zweite Inkonsistenz. Die jetzige Umstellung legt also die methodische Grundlage für die spätere lokale Kalibrierung. In der Wiki-Seite `lst-trees-wuerzburg.md` (sobald angelegt) entsprechend vermerken.

---

## 4. Konkrete Code-Änderungen

### Fix 1 — `backend/utils/data_loader.py`, `_compute_bestand_pct()` (Z. 143–146)

**Aktuell:**
```python
sum_per_cell = joined.groupby("index_right")["crown_area_m2"].sum()
pct = (sum_per_cell / 10_000.0 * 100.0).clip(0.0, 100.0)
return lst_gdf.index.to_series().map(pct).fillna(0.0).round(1)
```

**Neu:**
```python
sum_per_cell = joined.groupby("index_right")["crown_area_m2"].sum()
# Projizierte Kronendeckung nach Crookston & Stage (1999):
# Annahme zufälliger Kronenüberlappung → 1 − exp(−Σ Kronenfläche / Zellfläche).
# Liefert per Konstruktion [0, 100) — kein clip nötig.
ratio = sum_per_cell / 10_000.0
pct = (1.0 - np.exp(-ratio)) * 100.0
return lst_gdf.index.to_series().map(pct).fillna(0.0).round(1)
```

`np` ist bereits importiert (Z. 124 nutzt `np.pi`). Docstring der Funktion (Z. 109–111) auf das neue Modell anpassen.

### Fix 2 — `backend/routers/simulate.py`, `simulate_baeume()` (Z. 108–113)

Die neuen Bäume müssen im **selben Projektionsraum** wie der Bestand kombiniert werden, sonst addiert man projizierte und naive Prozente.

**Aktuell:**
```python
crown_area_total   = n_trees * CROWN_AREA_M2_DEFAULT
delta_coverage_pct = crown_area_total / area_m2 * 100.0
headroom_pct       = max(0.0, 100.0 - existing_coverage_pct)
effective_new_pct  = min(delta_coverage_pct, headroom_pct)
total_coverage_pct = existing_coverage_pct + effective_new_pct
delta_lst_celsius  = LST_PER_PCT_CANOPY_MIXED * effective_new_pct
```

**Neu:** (`import math` an den **Modulkopf** von `simulate.py` zu den übrigen Imports, nicht in den Funktionsrumpf)
```python
crown_area_total = n_trees * CROWN_AREA_M2_DEFAULT

# Bestehende projizierte Deckung → äquivalentes Kronenflächen-Verhältnis (inverse Formel).
# Schutz gegen log(0) bei existing_coverage_pct → 100.
existing_pct_safe = min(existing_coverage_pct, 99.9)
existing_ratio    = -math.log(1.0 - existing_pct_safe / 100.0)

# Neue Bäume als zusätzliches Flächen-Verhältnis, im selben Raum addieren.
new_ratio   = crown_area_total / area_m2
total_ratio = existing_ratio + new_ratio

total_coverage_pct = (1.0 - math.exp(-total_ratio)) * 100.0
effective_new_pct  = total_coverage_pct - existing_coverage_pct   # physikalisch korrekt begrenzt

# Δ°C nur auf den realen, projizierten Deckungszuwachs (= Kalibrierungsgröße García de León).
delta_lst_celsius = LST_PER_PCT_CANOPY_MIXED * effective_new_pct
```

`effective_new_pct` ist hier automatisch ≤ verbleibender Spielraum bis 100 % und stets ≥ 0 — der bisherige `min(…, headroom)`-Cap entfällt.

**Response-Feld `delta_coverage_pct`** (war: naive Summe / Fläche; jetzt semantisch überholt) →
**Empfehlung: entfernen.** Stattdessen ausreichend und klar: `effective_new_pct` (projizierter Zuwachs) + `total_coverage_pct`. Wer das rohe Verhältnis braucht, kann optional `crown_area_ratio = round(new_ratio, 3)` mitliefern (transparenter Modell-Input, keine irreführende „Deckungs"-Prozentzahl). Den Caveat-Block (Z. 27–33) anpassen: Überlappung wird jetzt berücksichtigt.

### Fix 3 — `frontend/src/components/simulation/BaumSimPanel.jsx`

Drei zusammenhängende Anpassungen:

**(a) `existingPct` / `newPctRaw` / `effectiveNewPct` (Z. 61–65, 96, 134–139)** auf das Projektionsmodell umstellen, damit der Kronendeckungs-Balken und das Vorher/Nachher konsistent zum Backend rechnen:

```js
const existingRatio   = existingPct >= 99.9 ? 6.9 : -Math.log(1 - Math.max(0, existingPct) / 100)
const newRatio        = (anzahl * CROWN_AREA_M2_DEFAULT) / selectedCellsAreaM2
const totalPct        = (1 - Math.exp(-(existingRatio + newRatio))) * 100
const effectiveNewPct = totalPct - existingPct
```

(Das Backend bleibt die Wahrheit; das Frontend rechnet nur für die unmittelbare Slider-Vorschau identisch nach.)

> ⚠ **Guards erhalten:** Das aktuelle `newPctRaw` (Z. 134–137) schützt gegen `!hasSel || anzahl < 1` (→ 0) und implizit gegen leere Selektion. Beim Umstellen müssen diese Bedingungen bleiben — zusätzlich `selectedCellsAreaM2 === 0` abfangen (Division-durch-Null bei `newRatio`). Das obige Snippet zeigt nur die Kernformel, nicht die Guards.

**(b) `sliderMax` (Z. 96–97)** — siehe Entscheidung 1 in Abschnitt 5. Empfehlung: praktischer Pflanzdichte-Cap statt physikalischem 100 %-Limit.

**(c) Texte:** Hinweis unter dem Slider (Z. 275–278) und der „überschreitet Headroom"-Warnhinweis (Z. 346–350) müssen weg von „bis zur vollen Kronendeckung (100 %)" hin zu „abnehmender Grenznutzen — jede weitere Pflanzung deckt zunehmend bereits beschattete Fläche". Der Stacked-Bar (Bestand/Neu/Frei) bleibt strukturell korrekt, nur die Werte ändern sich.

> ⚠ **Verwaister `sliderMax === 0`-Zweig:** Mit Entscheidung 1B (`sliderMax = floor(area / 100)` — finaler Wert, siehe Hinweis in Abschnitt 5) hängt `sliderMax` **nicht mehr** von `existingPct` ab. Der Warnzweig „Kronendeckung bereits bei X — kein Platz für weitere Bäume" (Z. 340–344) wird damit praktisch unerreichbar (nur noch bei Fläche 0). Diesen Zweig entfernen oder die Bedingung neu fassen (z. B. auf „keine Kachel selektiert").

---

## 5. Offene Entscheidungen — mit Empfehlung

### Entscheidung 1: Slider-Maximum — physikalisch oder pflanzpraktisch?

| Variante | Verhalten leere 10.000-m²-Zelle | Bewertung |
|---|---|---|
| **A — physikalisch** (`TARGET_RATIO ≈ 4,6` → 99 % Deckung) | ~920 Bäume | Modellkonsistent, aber 920 Bäume/Zelle sind als planerischer Vorschlag absurd; Slider-Auflösung leidet. |
| **B — pflanzpraktisch** (Mindeststandfläche je Baum) | ~200–400 Bäume | Realistisch begründbar, gute Slider-Auflösung, klarer Hinweistext. **Empfohlen.** |

> 🛑 **ÜBERHOLT (historischer Vorschlag).** Der hier vorgeschlagene Wert **25 m²/Baum**
> wurde **nicht** umgesetzt. Die finale Implementierung verwendet
> **`MIN_GROUND_PER_TREE_M2 = 100`** (≈ 10 m Pflanzabstand, FLL-Richtlinie „Empfehlungen
> für Baumpflanzungen", Teil 1, 2. Ausgabe 2015, Bäume 2. Ordnung). Maßgeblich sind
> `frontend/src/utils/simulate.js` und `frontend/src/store/useAppStore.js`. Der folgende
> Absatz dokumentiert nur die ursprüngliche Entscheidungsfindung.

**Empfehlung B (historisch):** Slider auf eine realistische maximale Pflanzdichte begrenzen, z. B. **eine Mindeststandfläche von ~25 m²/Baum** (= dichte, aber noch sinnvolle Neupflanzung; entspricht ~5 m Pflanzabstand):

```js
// ⚠ Überholt — finale Implementierung nutzt 100 (FLL, Bäume 2. Ordnung)
const MIN_GROUND_PER_TREE_M2 = 25
const sliderMax = Math.max(0, Math.floor(selectedCellsAreaM2 / MIN_GROUND_PER_TREE_M2))
```

Das ist **kein Modell-Cap**, sondern ein UX-/Plausibilitäts-Cap mit eigener Begründung. Innerhalb dieser Spanne zeigt die Poisson-Kurve den abnehmenden Grenznutzen ohnehin sichtbar. Quelle für die Größenordnung: Kronendurchmesser reif ~9–12 m (Moser-Reischl et al. 2021; Platanus ~12 m, Tilia ~8,9 m aus CPA); 25 m²/Baum (≈5 m Standabstand) ist die dichtere, jugendliche Annahme — bewusst großzügig, damit der Slider nicht künstlich beengt.

### Entscheidung 2: Kronenfläche neuer Bäume — `CROWN_AREA_M2_DEFAULT = 50 m²`

Der Wert ist ein **konservativer mittlerer Stadtbaumwert** (bewusst unter dem Reifewert), kein Endausbau-Default. Belastbare Einordnung:

- **Pretzsch et al. (2015)**, *Urban Forestry & Urban Greening* 14(3):466–479 — Kronengrößen/Standraum für 22 Arten in Innenstädten vs. Parks; Innenstadtbäume kleiner als Parkbäume.
- **Moser-Reischl et al. (2021)**, *Arboriculture & Urban Forestry* 47(4):150–169 — >2.000 Bäume, 6 süddeutsche Städte: *Platanus × hispanica* erreicht im Mittel 11,2 m Kronendurchmesser / **113,7 m² Kronenprojektion**; kleinere/jüngere Straßenbäume deutlich darunter.

→ **Empfehlung:** 50 m² als Default beibehalten (konservativer Mittelwert mittelalter Straßenbäume, bewusst unter dem Reifewert 62–124 m²). Als **konservativer Default** labeln — *nicht* als Endausbau-Annahme, da Quellen zeigen, dass reife Bäume deutlich größere Kronen haben. Caveat beibehalten: junge Neupflanzungen haben deutlich weniger Krone und damit geringere Kühlwirkung. Quelle in `simulation_params.py` ergänzt (Pretzsch 2015 / Moser-Reischl 2021). Ein Klein/Mittel/Groß-Selektor ist möglich, aber für v1 **Overengineering** — nicht empfohlen.

### Entscheidung 3: Response-Feld `delta_coverage_pct`

**Empfehlung: entfernen** (Option B des Erstplans). Optional `crown_area_ratio` als transparenter Modell-Input. Frontend liest bereits primär `effective_new_pct` / `total_coverage_pct` — Anpassung minimal (Z. 414 nutzt `result.effective_new_pct`, bleibt gültig).

---

## 6. Reihenfolge & Abhängigkeiten

```
Fix 1 (_compute_bestand_pct)  ──►  lst.parquet löschen / ?refresh=true
        │
        ▼
Fix 2 (simulate_baeume)        setzt Poisson-korrigierten existing_coverage_pct voraus
        │                       (sonst Ringpark existing_pct≈99 → existing_ratio explodiert)
        ▼
Fix 3 (BaumSimPanel)           Slider/Anzeige; erst sinnvoll wenn Backend stimmt
```

**Commit-Schnitt:** Fix 1 + Fix 2 **+ der Rewrite der betroffenen `test_simulate.py`-Tests** (siehe §7-Korrektur) gehören in einen Commit (gemeinsame Semantik; sonst rote CI/main). Fix 3 kann folgen. Cache-Löschung ist Teil des Deploy-/Test-Schritts, nicht des Codes.

> ⚠ **Lazy-Cache-Falle:** Der Lazy-Add in `load_lst()` (Z. 158–160) recomputet eine Spalte **nur, wenn sie fehlt**. Ein alter Cache enthält `bestand_pct` bereits (mit veralteten naiven Werten) → der Lazy-Pfad fasst ihn **nicht** an. Teil 1 erfordert daher zwingend `?refresh=true`/Löschen — Lazy-Add genügt hier **nicht** (anders als beim *neuen* Spaltennamen `seal_pct` in Teil 2, Fix B).

---

## 7. Validierung & Tests

1. **Unit-Test `_compute_bestand_pct` (neu):** synthetische Bäume mit bekannter Kronensumme in eine Zelle legen, gegen `(1−exp(−ratio))·100` prüfen. Randfälle: leere Zelle → 0,0; `ratio = 1` → ≈63,2 %; sehr dicht → < 100, nie ≥ 100.
2. **Unit-Test `simulate_baeume` (erweitern):** `existing_coverage_pct = 0` → Ergebnis = `(1−exp(−new_ratio))·100` (kein Bezug mehr auf die alte lineare Formel — Test-Erwartungen anpassen!). `existing_coverage_pct = 99,9` → kein Crash (log-Schutz), `effective_new_pct` klein und ≥ 0.
3. **Plausibilitäts-Check Ringpark:** eine bekannt dicht bestockte Zelle vor/nach dem Fix vergleichen — Erwartung: von ~99 % auf ~70–86 %.
4. **End-to-End:** `/api/lst?refresh=true` → `bestand_pct`-Verteilung inspizieren (Histogramm sollte oben nicht mehr an 100 % „kleben"). Dann `/simulation` Baum-Tab manuell: leere Kachel, 50 Bäume, plausibler Δ°C.

> ⚠ **Korrektur (verifiziert gegen Repo):** Die ursprüngliche Annahme „noch kein Test für `simulate_baeume`" ist **falsch**. `backend/tests/test_simulate.py` enthält bereits ~15 Tests für `simulate_baeume`, die **exakte Werte auf Basis der alten naiven Formel** und auf das zu entfernende Feld `delta_coverage_pct` asserten. Diese Tests **brechen** durch Fix 1+2 und müssen **mit umgeschrieben** werden — das ist Pflichtbestandteil des Fix-1+2-Commits (sonst ist `main`/CI rot), kein „Tests ergänzen nice-to-have".
>
> **Konkret betroffen (test_simulate.py):**
> - `test_standardfall` / `test_genau_100_prozent_deckung` / `test_ueber_100_prozent_lst_gecappt` / `test_1_baum_auf_1_kachel` / `test_viele_kacheln`: asserten `delta_coverage_pct` → Feld wird laut Entscheidung 3 **entfernt**.
> - `test_pflichtfelder_vorhanden` (Z. 110): verlangt `delta_coverage_pct` als Pflichtfeld → schlägt fehl.
> - `test_existing_coverage_default_ist_null` (Z. 139): erwartet `effective_new_pct == 50.0`; neues Modell liefert `(1−e^−0,5)·100 ≈ 39,3` → anpassen.
> - `test_existing_coverage_30_neue_passt_in_headroom` / `…_ueberschreitet_headroom` (Z. 143–164): asserten die **Headroom-Kappung**, die der Fix gerade abschafft → Erwartungen neu berechnen.
> - `test_existing_coverage_100_kein_effekt` (Z. 169–175): erwartet `effective_new_pct == 0.0`; mit dem `existing_pct_safe = min(…, 99.9)`-Log-Schutz wird das Ergebnis minimal **> 0** → Toleranz/Erwartung anpassen.
>
> **Teilaussage korrekt:** Für `_compute_bestand_pct` gibt es tatsächlich noch keinen Test (`test_data_loader.py` deckt nur trees/zensus ab) — diesen **neu** anlegen (passt zum offenen TODO „CI-Integration der Test-Suite").

---

## 8. Doku-Updates (Pflicht nach Umsetzung)

| Datei | Änderung |
|---|---|
| `urban-heat-wiki/wiki/simulation-logic.md` | Schritt 1 (Kronendeckungszuwachs) auf Überlappungsmodell umschreiben; Formel + Quellen Crookston & Stage 1999, Jennings 1999 ergänzen; Einschränkung „Zufallsplatzierung" aufnehmen. |
| `backend/simulation_params.py` | Quellenkommentar bei `CROWN_AREA_M2_DEFAULT` um Pretzsch 2015 / Moser-Reischl 2021 ergänzen; ggf. `MIN_GROUND_PER_TREE_M2` (UX-Konstante) — eher im Frontend `utils/simulate.js` spiegeln. |
| `docs/Tool-Logik-und-Quellen.md` + `.html` | Simulation-Baum-Abschnitt: neue Formel, neue Quellen, „at-maturity"-Caveat. |
| `CLAUDE.md` | `/api/simulate/baeume`-Zeile (Response-Felder) + LST-Cache-Hinweis (`bestand_pct` jetzt Poisson) aktualisieren; `_compute_bestand_pct`-Beschreibung in `data_loader.py`-Sektion anpassen. |
| `frontend/src/utils/simulate.js` | Falls `MIN_GROUND_PER_TREE_M2` dort als Konstante lebt: mit Begründungskommentar. |

---

## 9. Was sich NICHT ändert

- `LST_PER_PCT_CANOPY_MIXED` (−0,083 °C/%) bleibt unverändert — die Umstellung macht die Eingangsgröße erst *konsistent* mit diesem Koeffizienten.
- CO₂-Berechnung (`n_trees × CO2_KG_PER_TREE_YEAR`) ist deckungsunabhängig — unverändert.
- Die gesamte Wasser-/Entsiegelungs-Simulation — unberührt.
- UI-Struktur (Slider + Texteingabe + BeforeAfterRow + Stacked-Bar) — identisch; nur Werte und Hinweistexte ändern sich.
- HVI/Vulnerabilität und Stadtbezirks-Aggregate — nutzen `bestand_pct` nicht, kein Effekt.

---

---

# Teil 2 — Bepflanzbare Fläche pro LST-Zelle (Versiegelungsgrad)

*Begrenzt die plausible Baumanzahl je Zelle auf den unversiegelten Flächenanteil. Unabhängig von Teil 1 umsetzbar (einziger Berührungspunkt: `sliderMax`, siehe 10.7 Fix D). Cache: erfordert `lst.parquet`-Neuaufbau, weil neue Spalten `seal_pct`/`dominant_type_key` hinzukommen.*

---

## 10. Pflanzpotenzial je Zelle über Versiegelungsgrad begrenzen

### 10.1 Problem (eigenständig, unabhängig von Teil 1)

Die Slider-Obergrenze nimmt die **gesamte** Zellfläche (1 ha) als pflanzbar an. Konkret in `BaumSimPanel.jsx` (Z. 97):

```js
const sliderMax = Math.floor((headroomPct / 100) * selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)
//               = floor(1.0 × 10.000 / 50) = 200   (leere Kachel, voller Headroom)
```

→ In einer leeren 100×100-m-Zelle sind 200 Bäume simulierbar, bei zwei Kacheln 400. Wählt man eine überwiegend mit Wohngebäuden bebaute Zelle, ist das **Utopie** — dafür müssten die Häuser weichen. Die Simulation behandelt versiegelten Boden (Dächer, Straßen, Höfe) implizit als pflanzbar.

> Das ist ein **anderes** Problem als Teil 1: Teil 1 betrifft die *Doppelzählung von Kronen* (mehrere Kronen über derselben Bodenfläche), Teil 2 die Annahme *„die ganze Zelle ist Boden, der einen Stamm tragen kann"*. Selbst mit Teil 1 bleibt das 200–400-Problem bestehen.

### 10.2 Warum Teil 1 das nicht löst (Orthogonalität)

Das Überlappungsmodell korrigiert, **wie viel Deckung** eine gegebene Kronenmenge erzeugt — nicht, **wie viele Stämme** überhaupt auf den Boden passen. In einer leeren Wohngebietszelle erlaubt das Poisson-Modell weiterhin beliebig viele Bäume; es weiß nur nicht, dass 60 % der Fläche Gebäude und Straße sind.

→ Versiegelungsgrad begrenzt die **Stammzahl**, Poisson die **Deckung pro Krone**. Die Mechanismen sind komplementär und greifen an verschiedenen Stellen der Rechnung.

### 10.3 Abgrenzung zu Abschnitt 2.5 (dies ist *kein* Coverage-Cap)

§2.5 lehnt einen *Deckungs*-Cap je ATKIS-Typ ab (Park ≤ 80 %, Wohngebiet ≤ 35 %). Teil 2 ist etwas grundlegend anderes: ein *Flächen*-Cap auf die pflanzbare **Bodenfläche** (→ Stammzahl), nicht auf die **Kronendeckung**. Die drei Ablehnungsgründe aus §2.5 greifen hier nicht:

| §2.5-Ablehnungsgrund | Warum er auf Teil 2 nicht zutrifft |
|---|---|
| 1. „LST-Kacheln tragen keinen ATKIS-Typ → zusätzlicher Spatial Join, neue Fehlerquelle" | Der Join läuft **einmalig** beim Cache-Bau in `lst.parquet` (exakt wie `_compute_bestand_pct`), nicht pro Request. Kein Laufzeit-Overhead. |
| 2. „Willkürliche Schranken schwer zu begründen" | Versiegelungsgrade sind **literaturgestützt** (`SEAL_RATE_BY_TYPE`, UBA/DIN/Bayreuth) und begrenzen eine **physische** Größe — versiegelter Boden trägt keinen Stamm. Das ist besser begründbar als eine frei gewählte Deckungsobergrenze. |
| 3. „Überlappungsmodell differenziert schon selbst" | Es differenziert nach **Bestandsdichte**, nicht nach **Landnutzung**. Genau das ist die offene Lücke. |

→ §2.5 bleibt für *Coverage-Caps* gültig; Teil 2 fällt nicht darunter. **Doku-TODO:** In §2.5 einen Querverweis auf Teil 2 ergänzen, damit der scheinbare Widerspruch aufgelöst ist.

### 10.4 Mechanik: nur die unversiegelte Fläche ist pflanzbar

```
seal_pct_zelle     = flächengewichteter Versiegelungsgrad der überlappenden ATKIS-Polygone
pflanzbare_flaeche = zellflaeche × (1 − seal_pct_zelle)
sliderMax          = floor(pflanzbare_flaeche / MIN_GROUND_PER_TREE_M2)
```

`seal_pct_zelle` wird pro Zelle aus `SEAL_RATE_BY_TYPE` (Z. 94–106 in `simulation_params.py`) abgeleitet und in `lst.parquet` vorgerechnet (siehe 10.7). Beispiel mit `MIN_GROUND_PER_TREE_M2 = 25` (Teil-1-Entscheidung 1B) auf einer leeren 1-ha-Zelle:

| dominante Kategorie | seal | pflanzbar | max Bäume (Teil 2) | heute |
|---|---|---|---|---|
| Straßenverkehrsfläche | 0,98 | 200 m² | **8** | 200 |
| Parkplatz (OSM) | 0,95 | 500 m² | **20** | 200 |
| Industrie/Gewerbe | 0,80 | 2.000 m² | **80** | 200 |
| Fläche gemischter Nutzung | 0,65 | 3.500 m² | **140** | 200 |
| Wohnbaufläche | 0,60 | 4.000 m² | **160** | 200 |
| Sport/Freizeit | 0,20 | 8.000 m² | **320** | 200 |
| keine ATKIS-Überdeckung (E2) | ≈0,00 | 10.000 m² | **400** | 200 |

(„heute" = aktueller Code, leere Einzelkachel; skaliert linear mit der Kachelzahl.) Erst dieser Gradient macht den Unterschied zwischen Innenstadt-Asphalt und Stadtrand-Wiese sichtbar.

### 10.5 Wichtige fachliche Abgrenzung — Kronen überhängen versiegelten Boden

Der Versiegelungsgrad begrenzt **nur die Stammzahl**, **nicht** den Kühl-Nenner. Der García-de-León-Koeffizient ist gegen *Kronendeckung über die gesamte Polygonfläche* kalibriert, und Straßenbäume **überhängen** versiegelten Boden (Krone über Asphalt). Daher:

- `new_ratio = Kronenfläche / Zellfläche` behält die **volle** Zellfläche als Nenner.
- Die pflanzbare Fläche begrenzt ausschließlich `n_trees` (→ `sliderMax`).

Beispiel Wohnbau (seal 0,60): pflanzbar 4.000 m² → max 160 Bäume → Kronenfläche 8.000 m² → `ratio = 0,8` → projizierte Deckung **55 %**. Die Deckung (55 %) **übersteigt** den unversiegelten Anteil (40 %) — physikalisch korrekt (überhängende Kronen). Deshalb gibt es **keinen** harten Deckungs-Cap bei (1 − seal).

> ⚠ **Anti-Pattern:** `area_m2` in `fetchSimulateBaeume({ area_m2 })` **nicht** auf die pflanzbare Fläche reduzieren. Das würde die Kühlwirkung doppelt bestrafen und die Konsistenz zum Koeffizienten brechen. `area_m2` bleibt `selectedCellsAreaM2` (volle selektierte Fläche).

### 10.6 Transparenz & UI — zwei Stufen

**(a) Per-Zellen-Readout (immer sichtbar — der eigentliche Transparenz-Hebel).** Beim Klick/Hover auf eine Kachel zeigt das Panel die *abgeleitete* Modellgröße direkt:

> überwiegend **Wohnbaufläche** · ~60 % versiegelt · **4.000 m² pflanzbar** · max 160 Bäume

Das ist transparenter als rohe Geometrie, weil genau die Zahl sichtbar wird, die in `sliderMax` eingeht.

**(b) ATKIS-Overlay-Toggle (Verifikation).** Optionaler Layer wie `showBaumkataster`: rendert die `EntsiegelungLayer`-Polygone **unter** dem LST-Grid, **nicht-pickable** (sonst stiehlt es die Klicks der Kachel-Selektion), mit gedämpfter Alpha. **Default: aus** — zwei übereinanderliegende translucent Layer erschweren das LST-Farblesen; das Readout liefert die Transparenz bereits ohne Clutter.

**Lücken-Ehrlichkeit (Pflicht).** Geladen werden nur `sie02_f` (Siedlung) + `ver01_f` (Verkehr) — diese bedecken die Karte **nicht** flächendeckend (Vegetation/Gewässer/Felder fehlen). Kacheln ohne Überdeckung sind im Overlay **leer** und werden als unversiegelt angenommen (E2). Ohne Erklärung wirkt eine leere Stelle wie *fehlende Daten*, obwohl die Abwesenheit eines Polygons selbst die Modellannahme ist. Das Readout muss das benennen:

> ⚠ Keine ATKIS-Siedlungs-/Verkehrsfläche an dieser Stelle → als unversiegelt (Grün-/Freifläche) angenommen.

**Label vs. Rechnung.** Pro Zelle werden **zwei** Größen vorgerechnet: `seal_pct` (flächengewichtet — fürs Rechnen) und `dominant_type_key` (größte Überlappung — nur fürs lesbare Label via `TYPE_KEY_LABELS`). So bleibt die Rechnung exakt und das Label trotzdem zeigbar, und das Overlay bestätigt optisch genau dieses Label.

### 10.7 Konkrete Code-Änderungen

**Fix A — `backend/utils/data_loader.py`: neuer Helper `_compute_seal_pct(lst_gdf)`** (analog `_compute_bestand_pct`, Z. 106–146).
- Entsiegelungs-Polygone laden (`load_entsiegelung()`), nach `lst_gdf.crs` reprojizieren, `seal_rate = type_key.map(SEAL_RATE_BY_TYPE).fillna(_default)`.
- Verschnitt Polygone × Zellen (`gpd.overlay(..., how="intersection")` oder Sjoin + Clip), Überlappungsfläche in EPSG:25832 berechnen.
- Je Zelle: `seal_pct = Σ(overlap_area × seal_rate) / 10.000` (unbedeckter Rest gemäß E2), `dominant_type_key = type mit größter Überlappungsfläche`.
- Rückgabe als zwei Spalten; `SEAL_RATE_BY_TYPE` aus `simulation_params` importieren.

**Fix B — `load_lst()` / `lst.parquet`:** `gdf["seal_pct"]` + `gdf["dominant_type_key"]` neben Z. 226 setzen; Lazy-Add für alte Caches nach dem Muster Z. 158–160 (`if "seal_pct" not in gdf.columns: …`).

**Fix C — `backend/routers/lst.py`:** `seal_pct`, `dominant_type_key` (optional `plantable_m2`) in die GeoJSON-Properties aufnehmen.

**Fix D — `frontend/.../BaumSimPanel.jsx` (⚠ gemeinsamer Berührungspunkt mit Teil 1):**
- `avgSealPct` = Ø `seal_pct` über selektierte Kacheln (wie `existingPct`, Z. 61–65); `plantableAreaM2 = selectedCellsAreaM2 × (1 − avgSealPct)`.
- **`sliderMax`-Zeile (Z. 97):**
  - *Nur Teil 2 (Teil 1 noch nicht umgesetzt):* `floor((headroomPct/100) × plantableAreaM2 / CROWN_AREA_M2_DEFAULT)` — nur den Flächen-Faktor tauschen.
  - *Beide Teile:* `floor(plantableAreaM2 / MIN_GROUND_PER_TREE_M2)` — Teil-1-Entscheidung 1B mit pflanzbarer statt voller Fläche.
- Readout-Zeilen (10.6a) im Area-Banner; Lücken-Hinweis bei `dominant_type_key == null`.
- **`area_m2` an die API bleibt `selectedCellsAreaM2`** (unberührt, siehe 10.5).

**Fix E — Simulationsseite (Baum-Tab):** `EntsiegelungLayer` **unter** `SimCellLayer` rendern, `pickable={false}`, niedrigere Alpha, sichtbar via `sim.showSimAtkis`.

> ⚠ **Verifikation abgeschlossen — Wiederverwendung NICHT möglich:** In `Simulation.jsx` (Z. 62–68) wird `entsData` **ausschließlich** bei `tab === 'wasser'` geladen. Im Baum-Tab ist die Entsiegelungs-GeoJSON **nicht** im Scope. Fix E muss daher einen **zusätzlichen Fetch** im Baum-Tab anstoßen (Bedingung `tab === 'baeume'` ergänzen oder unbedingt laden) und das `entsData`-State an den Layer durchreichen.
>
> **Entwarnung:** Das betrifft **nur** das optionale Overlay (Default aus, E5). Die `seal_pct`/`dominant_type_key`-Logik kommt über die LST-GeoJSON-Properties (Fix C) und braucht das Entsiegelungs-GeoJSON im Frontend **nicht**. Teil 2 ist damit auch ohne Fix E voll funktionsfähig — das Overlay ist reine Verifikations-Kür und kann als letzter, optionaler Schritt umgesetzt (oder weggelassen) werden.

**Fix F — `frontend/.../store/useAppStore.js`:** `sim.showSimAtkis` (bool, default false) + `toggleSimAtkis` (Muster `showBaumkataster`).

**Fix G (optional) — `frontend/.../utils/simulate.js`:** `MIN_GROUND_PER_TREE_M2` (falls aus Teil 1 vorhanden, wiederverwenden; sonst hier mit Begründungskommentar).

### 10.8 Reihenfolge & Abhängigkeiten (Teil 2 isoliert)

```
Fix A + B  ──►  lst.parquet löschen / ?refresh=true
        │
        ▼
Fix C (API liefert seal_pct)  ──►  Fix D (Panel liest seal_pct, sliderMax)
        │
        ▼
Fix E + F (Overlay-Toggle)         unabhängig parallelisierbar
```

**Commit-Schnitt:** A+B+C (Datenpfad) zusammen; D–G Frontend. Cache-Löschung ist Teil des Deploy-/Test-Schritts.

### 10.9 Entscheidungen (festgelegt 2026-06-10)

**E1 — Versiegelungsgrad je Zelle: ✅ flächengewichtet.** Für die *Rechnung* **flächengewichteter** `seal_pct` (eine Kachel am Parkrand ist nicht „ganz Park"); die *dominante* Kategorie wird zusätzlich als `dominant_type_key` vorgerechnet, aber nur fürs Label (siehe 10.6).

**E2 — Kacheln ohne ATKIS-Polygon: ✅ als unversiegelt annehmen (`seal ≈ 0`).** Weil ausschließlich die *bebauten* Ebenen (`sie02`/`ver01`) geladen sind → Abwesenheit ≈ Grün-/Freifläche. **Pflicht:** im Readout markieren (10.6, Lücken-Ehrlichkeit). Verworfen: `_default = 0,70` (würde echte Grünflächen künstlich versiegeln) und „Kachel ausschließen" (würde Parks/Felder/Stadtrand pauschal aus der Sim nehmen).

**E3 — Datenquelle: ✅ v1 ATKIS-Typ-Lookup jetzt.** Über `SEAL_RATE_BY_TYPE` — Daten liegen bereits in der App. **v2 als dokumentiertes TODO:** den GHSL-Layer (`JRC/GHSL/P2023A/GHS_BUILT_S`) pro Zelle sampeln → kontinuierlicher `seal_pct` ohne Typ-Zuordnung. Steht schon als v2-Kommentar in `simulation_params.py` (Z. 91) und als Datenquelle in `CLAUDE.md`.

**E4 — zusätzlicher Realisierungsfaktor: ✅ nein für v1.** Kein zweiter Fudge-Faktor (analog `TYPICAL_REALIZATION_RATE`) auf die pflanzbare Fläche — der seal-Cap und `MIN_GROUND_PER_TREE_M2` begrenzen bereits. Das Reststück „unversiegelt ≠ tatsächlich bepflanzbar" (Privatgärten, Bestandsvegetation, Abstandsflächen) wird als **Caveat** benannt (10.10), nicht eingerechnet.

**E5 — ATKIS-Overlay Default: ✅ aus.** Zwei translucent Layer erschweren das LST-Farblesen; das Readout liefert die Transparenz ohne Clutter, der Toggle ist für die Verifikation (Begründung in 10.6b).

### 10.10 Ehrliche Grenzen (Methodenkritik)

- `seal`-Werte sind grobe **Typ-Mittelwerte** (Literatur), keine gemessene Per-Zellen-Versiegelung → v2 GHSL (E3).
- „Unversiegelt" ist nicht „tatsächlich verfügbar": Privatgärten, Bestandsbäume, Leitungstrassen, Abstandsflächen. Die pflanzbare Fläche ist eine **Obergrenze**, kein Pflanzplan.
- Flächengewichtung/dominante Kategorie auf 100-m-Raster glättet Binnenheterogenität.
- Gilt für planerische Was-wäre-wenn-Abschätzung, nicht für parzellenscharfe Planung — wie der Rest des Tools.

### 10.11 Validierung & Tests (Teil 2)

1. **Unit `_compute_seal_pct`:** synthetische Zelle voll in einem Wohnbau-Polygon → `seal ≈ 0,60`, `dominant = AX_Wohnbauflaeche`; Zelle ohne Polygon → `seal = 0`, `dominant = None`; Zelle 50/50 Park/Straße → flächengewichteter Mischwert.
2. **Plausibilität:** Altstadt-Kachel hohe `seal`, Stadtrand-Feld `seal ≈ 0`.
3. **E2E:** Wohngebiet-Kachel → `sliderMax` deutlich kleiner als leere-Wiese-Kachel; Readout zeigt Label + %; Overlay-Toggle ein/aus; Lücken-Kachel zeigt den Hinweis.

### 10.12 Doku-Updates (Pflicht nach Teil 2)

| Datei | Änderung |
|---|---|
| `CLAUDE.md` | `/api/lst`-Properties um `seal_pct`/`dominant_type_key` ergänzen; `data_loader`-Sektion um `_compute_seal_pct`; LST-Cache-Hinweis (lst.parquet trägt jetzt auch `seal_pct`); `useAppStore`-Sim-Slice um `showSimAtkis`. |
| `docs/Tool-Logik-und-Quellen.md` + `.html` | Baum-Simulation: pflanzbare Fläche, Versiegelungsgrad-Quelle, Lücken-Annahme, Readout/Overlay-Transparenz. |
| `urban-heat-wiki/wiki/simulation-logic.md` | Pflanzpotenzial-Schritt (Versiegelungsgrad → pflanzbare Fläche) dokumentieren. |
| Querverweis in §2.5 dieses Plans | Teil 2 als „kein Coverage-Cap" abgrenzen. |

### 10.13 Was sich NICHT ändert

- Kühl-Koeffizient (−0,083 °C/%) **und** Kühl-Nenner (volle Zellfläche) — unberührt (siehe 10.5).
- CO₂-Berechnung, Wasser-/Entsiegelungs-Simulation, Teil-1-Überlappungsmodell — unabhängig, komponieren.
- `area_m2` an `/api/simulate/baeume` bleibt die volle selektierte Fläche.
- HVI/Vulnerabilität und Stadtbezirks-Aggregate — nutzen weder `seal_pct` noch `dominant_type_key`.

---

## 11. Quellen (für die Uni-Ausarbeitung — beide Teile)

1. **Crookston, N. L. & Stage, A. R. (1999).** *Percent Canopy Cover and Stand Structure Statistics from the Forest Vegetation Simulator.* USDA Forest Service, Rocky Mountain Research Station, Gen. Tech. Rep. RMRS-GTR-24. — **Primärquelle der Gleichung** `CCpct = 100·(1 − exp(−Σ CAᵢ / A))`, Annahme zufälliger horizontaler Kronenüberlappung (Beer-Lambert).
2. **Jennings, S. B., Brown, N. D. & Sheil, D. (1999).** Assessing forest canopies and understorey illumination: canopy closure, canopy cover and other measures. *Forestry* 72(1), 59–73. — Begriffliche Grundlage canopy cover vs. closure; Standardreferenz.
3. **Gray, A. N. et al. (2021).** Predicting canopy cover of diverse forest types from individual tree measurements. *Forest Ecology and Management* 501, 119682. — Empirische Grenzen der Zufallsüberlappung (Unterschätzung in dichten Beständen, RMSE ~14 %).
4. **García de León, A. S. et al. (2025, JURSE/IEEE).** The Relation of Land Surface Temperature and Trees across Different Urban Land Use Classes based on Remote Sensing (Studie München, Daten Sommer 2020). — Kühlkoeffizient −0,083 °C/% (Misch-/Wohngebiet), kalibriert gegen **projizierte** Kronendeckung. Siehe `urban-heat-wiki/wiki/sources/garcia-de-leon-lst-trees-munich.md`.
5. **Pretzsch, H. et al. (2015).** Crown size and growing space requirement of common tree species in urban centres, parks, and forests. *Urban Forestry & Urban Greening* 14(3), 466–479. — Kronengrößen/Standraum, 22 Arten, Innenstadt vs. Park.
6. **Moser-Reischl, A., Rötzer, T., Pauleit, S. & Pretzsch, H. (2021).** Urban tree growth characteristics of four common species in South Germany. *Arboriculture & Urban Forestry* 47(4), 150–169. — Kronenprojektionsflächen süddeutscher Stadtbäume (u. a. *Platanus × hispanica* ~113,7 m²).
7. **USDA Forest Service — iTree** (i-Tree Canopy / Eco). — Operative Nutzung des Überlappungsmodells in der Stadtbaumbewertung.

**Zusätzlich für Teil 2 (Versiegelungsgrad / pflanzbare Fläche):**

8. **Arnold, C. L. & Gibbons, C. J. (1996).** Impervious Surface Coverage: The Emergence of a Key Environmental Indicator. *Journal of the American Planning Association* 62(2), 243–258. — Kanonische Quelle für den Zusammenhang Landnutzung ↔ Versiegelungsgrad; begründet die Typ-basierte Zuordnung.
9. **Versiegelungsgrade `SEAL_RATE_BY_TYPE`** — UBA Texte 141/2021, Leitfaden Flächenentsiegelung Landkreis Bayreuth (2024), DIN 18005. Literaturwerte je ATKIS/OSM-Flächentyp; dokumentiert in `backend/simulation_params.py` (Z. 89–106).
10. **JRC GHSL P2023A — `GHS_BUILT_S`** (Global Human Settlement Layer, Built-up Surface). — Kontinuierliche Per-Zellen-Versiegelung für die geplante **v2** (E3), ersetzt die Typ-basierte Schätzung durch gemessene Imperviousness.

> Forschungsgruppen-Kohärenz: García de León (4), Pretzsch (5), Moser-Reischl/Rötzer (6) stammen aus dem TUM/DLR-Umfeld mit Würzburg-Beteiligung — die gesamte Baum-Kühlkette stützt sich damit auf eine konsistente, regional einschlägige Quellbasis.
