# Handoff: Baumscheiben — Bepflanzbarkeit versiegelter Flächen (Modell-Grenze)

Übergabe-Brief. **Achtung: Dies ist ein Diskussions- und Entscheidungs-Task, kein
reiner Coding-Task.** Bevor eine Zeile Code geschrieben wird, muss der Nutzer die
fachliche Entscheidung treffen (Abschnitt 5). Erst danach implementieren.

## 1. Kontext / Vorgeschichte

Die ATKIS/OSM-Doppelzählung beim Versiegelungsgrad (`seal_pct`) wurde bereits
behoben (Priority-Union, `_SEAL_MODEL_VERSION = 2` in
`backend/utils/data_loader.py`). Stark versiegelte Zellen zeigen jetzt
realistische Werte statt fälschlich 100 %:

- Marktplatz: 78,6 % versiegelt → 2.140 m² pflanzbar → max 85 Bäume
- Talavera-Parkplatz: 86 % versiegelt → 1.400 m² pflanzbar → max 56 Bäume

Dieser Handoff behandelt die dabei bewusst ausgeklammerte, **tiefere
Modell-Grenze** (war Punkt 7.2 im ursprünglichen Fix-Brief).

## 2. Problem (die Modell-Grenze)

Das Modell koppelt „Bepflanzbarkeit" strikt an **unversiegelten** Boden:

```
plantable_m2   = 10.000 × (1 − seal_pct)          # backend/routers/lst.py, Zeile 54
Slider-Max     = floor(plantable_m2 / 25 m²)       # frontend BaumSimPanel.jsx
                                                   # (MIN_GROUND_PER_TREE_M2 = 25,
                                                   #  frontend/src/utils/simulate.js)
```

Real ist das zu konservativ: In gepflasterte Plätze und Parkplätze kann man sehr
wohl Bäume setzen — über **Baumscheiben** (punktuelle Entsiegelung von ~4–10 m²
pro Baum im Belag). Städte machen genau das bei Platz-Umgestaltungen. Das Modell
sagt aber: Je versiegelter die Fläche, desto weniger Bäume möglich — auf einem
95-%-Parkplatz fast nichts, obwohl dort real Baumreihen entstehen könnten.

## 3. Betroffene Stellen (nur lesen, noch nichts ändern)

| Datei | Rolle |
|---|---|
| `backend/routers/lst.py` (Zeile 54) | berechnet `plantable_m2 = 10.000 × (1 − seal_pct)` als Property auf `/api/lst` |
| `frontend/src/components/simulation/BaumSimPanel.jsx` | Slider-Max = `floor(plantableAreaM2 / MIN_GROUND_PER_TREE_M2)`; Banner zeigt „~X % versiegelt · Y m² pflanzbar · max N Bäume" |
| `frontend/src/utils/simulate.js` | `MIN_GROUND_PER_TREE_M2 = 25` (pflanzpraktischer Cap, kein Modell-Cap) |
| `frontend/src/store/useAppStore.js` | `_baeumeSliderMax` grober Vor-Cap `floor(Fläche/25)` |
| `backend/simulation_params.py` | Ort für einen etwaigen neuen Koeffizienten (mit Quellverweis!) |
| `urban-heat-wiki/wiki/` | fachliche Wissensquelle — prüfen, ob es eine Seite zu Baumscheiben/Straßenbäumen gibt |

Wichtig: Die Kühlwirkungs-Berechnung (`/api/simulate/baeume`,
Überlappungsmodell Crookston & Stage) ist von dieser Frage **unabhängig** —
`area_m2` an die API ist bereits die volle Fläche, weil Kronen versiegelten
Boden überhängen. Es geht **nur** um den Slider-Max / die „max Bäume"-Anzeige.

## 4. Lösungsoptionen (dem Nutzer zur Entscheidung vorlegen)

**Option A — UI-Hinweis, kein Modellwechsel (simpelste Lösung):**
Im BaumSimPanel-Banner einen Hinweis ergänzen, z. B. „Zusätzliche Pflanzungen
in versiegelter Fläche über Baumscheiben möglich (nicht im Modell)". Kein
Backend-Change, kein neuer Koeffizient, keine Cache-Invalidierung.

**Option B — Baumscheiben-Anteil im Slider-Max:**
Ein Anteil der versiegelten Fläche wird als „per Baumscheibe erschließbar"
angerechnet, z. B.
`plantable_baumscheibe_m2 = seal_pct × 10.000 × BAUMSCHEIBEN_RATE`.
Braucht einen neuen Koeffizienten (`BAUMSCHEIBEN_RATE`, m²-Bedarf pro
Baumscheibe) → **fachliche Größe, muss vom Nutzer vorgegeben oder per Quelle
belegt werden** (Wiki-Ingest). Frontend + ggf. Backend-Property betroffen.

**Option C — getrennter zweiter Slider/Modus** („Bäume in Baumscheiben"):
Aufwendigste Variante, nur wenn der Nutzer das explizit will.

Empfehlung im Gespräch: mit Option A starten (kein erfundener Koeffizient,
folgt der Projektregel „simpelste Lösung"), Option B nur wenn der Nutzer eine
belegbare Quelle für die Parameter liefert.

## 5. Zwingender Ablauf (Projektregeln aus CLAUDE.md!)

1. **Zuerst nachfragen, nicht bauen.** Dem Nutzer die Optionen A/B/C mit dem
   Trade-off vorlegen und entscheiden lassen. Fachliche Formeln/Koeffizienten
   werden vom Nutzer vorgegeben — **niemals selbst erfinden.**
2. Bei Option B: Koeffizienten nur mit Quellverweis in
   `backend/simulation_params.py` aufnehmen (Muster: vorhandene Konstanten mit
   Quellkommentar). Vorher prüfen, ob `urban-heat-wiki/wiki/` eine passende
   Quelle enthält; wenn nein, den Nutzer um eine Quelle bitten.
3. Nur den entschiedenen Umfang umsetzen, nichts an unbeteiligtem Code anfassen.
4. Falls sich `plantable_m2` im Backend ändert: Das Property wird in
   `routers/lst.py` **live aus `seal_pct` berechnet** (nicht im Parquet-Cache
   gespeichert) — keine Cache-Invalidierung nötig, aber Backend-Restart, und
   `backend/tests/test_lst_router.py` (Zeilen 29, 69–81) muss angepasst werden.
5. Frontend-Änderungen gegen `docs/Design-System.html` prüfen (keine neuen
   UI-Komponenten erfinden).
6. Nach dem Task kurz zusammenfassen: was wurde entschieden, was gebaut, was wäre
   als Nächstes sinnvoll.

## 6. Verifikation (je nach gewählter Option)

- Option A: Frontend starten (`npm run dev` in `frontend/`, Backend via
  `uvicorn main:app --port 8000` in `backend/` mit Conda-Env `resilientes`),
  auf `/simulation` eine stark versiegelte Zelle wählen (Marktplatz,
  ca. lon 9.9294 / lat 49.7947) und prüfen, dass der Hinweis erscheint und der
  Slider-Max unverändert bleibt.
- Option B: zusätzlich `python -m pytest tests/` im Backend (Conda-Env
  `resilientes`) — 0 failed; Slider-Max auf der Marktplatz-Zelle muss
  nachvollziehbar aus der Formel folgen (Wert von Hand nachrechnen).
