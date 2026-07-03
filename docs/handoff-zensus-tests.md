# Handoff: Zwei fehlschlagende Tests in `test_zensus.py` reparieren

Übergabe-Brief. Die Diagnose ist bereits abgeschlossen — es muss nur noch der
beschriebene Minimal-Fix umgesetzt und verifiziert werden. **Nicht die API ändern,
nur die Tests** (Begründung unten).

## 1. Problem (Symptom)

Zwei Tests in `backend/tests/test_zensus.py` schlagen fehl:

```
FAILED tests/test_zensus.py::test_properties_have_required_keys - AssertionError
FAILED tests/test_zensus.py::test_einwohner_non_negative - KeyError: 'einwohner'
```

Die Fehler bestehen unabhängig von anderen Änderungen (auf sauberem `main`
reproduziert). Alle übrigen 127 Backend-Tests sind grün.

## 2. Ursache (bereits diagnostiziert — nicht neu recherchieren)

Der Router `backend/routers/zensus.py` liefert das Property **`Einwohner`**
(großes E, Zeile 61):

```python
"properties": {
    "gitter_id": row["GITTER_ID_100m"],
    "anteil_65plus": _safe(row["anteil_65plus"]),
    "anteil_65plus_clamped": bool(row["anteil_65plus_clamped"]),
    "Einwohner": _safe(row["Einwohner"]),
},
```

Die beiden Tests erwarten aber **`einwohner`** (kleines e):

- `test_properties_have_required_keys` (Zeile 87): `required = {"gitter_id", "anteil_65plus", "einwohner"}`
- `test_einwohner_non_negative` (Zeile 144): `ew = feat["properties"]["einwohner"]`

## 3. Warum die Tests falsch sind, nicht die API

`Einwohner` (großes E) ist der dokumentierte und konsumierte API-Vertrag:

- `CLAUDE.md` dokumentiert `/api/zensus` mit Property `Einwohner`.
- Das Frontend liest `p.Einwohner` (großes E) in
  `frontend/src/pages/Vulnerabilitaet.jsx` (Zeilen 343, 347, 428–430).
- Auch `/api/vulnerability` liefert `Einwohner` (großes E).

Eine Umbenennung der API würde Frontend + Doku + zweiten Endpoint mitreißen —
das ist ausdrücklich **nicht** gewollt. (Das kleingeschriebene `einwohner`
existiert nur bei `/api/stadtbezirke` — anderer Endpoint, nicht verwechseln.)

## 4. Der Fix (exakt zwei Edits in `backend/tests/test_zensus.py`)

**Edit 1** — Zeile 87, in `test_properties_have_required_keys`:

```python
# vorher:
required = {"gitter_id", "anteil_65plus", "einwohner"}
# nachher:
required = {"gitter_id", "anteil_65plus", "Einwohner"}
```

**Edit 2** — Zeile 144, in `test_einwohner_non_negative`:

```python
# vorher:
ew = feat["properties"]["einwohner"]
# nachher:
ew = feat["properties"]["Einwohner"]
```

Sonst nichts ändern. Kein Code im Router, kein Frontend, keine anderen Tests.

## 5. Verifikation

Im Backend-Verzeichnis mit dem Conda-Env `resilientes` ausführen:

```
cd C:\Users\Marvi\Code\AI\resilientes_wuerzburg\backend
C:\Users\Marvi\miniconda3\envs\resilientes\python.exe -m pytest tests/test_zensus.py -v
```

Erwartung: **17 passed, 0 failed.** Danach zur Sicherheit die volle Suite:

```
C:\Users\Marvi\miniconda3\envs\resilientes\python.exe -m pytest tests/
```

Erwartung: **129 passed** (Stand Juli 2026; falls zwischenzeitlich Tests
dazukamen, entsprechend mehr — wichtig ist: 0 failed).

Hinweis: Der erste Lauf kann Daten-Caches aufbauen und einige Minuten dauern.

## 6. Projektregeln (aus CLAUDE.md)

- Nur diesen einen abgegrenzten Task umsetzen.
- Nichts an unbeteiligtem Code anfassen.
- Simpelste Lösung — die zwei Edits oben sind die vollständige Lösung.
