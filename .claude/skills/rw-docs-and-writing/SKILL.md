---
name: rw-docs-and-writing
description: >-
  Maintain the docs of record, templates, and house style for Resilientes
  Würzburg. Load this when you finished a feature and must update the docs,
  when writing a handoff brief, when editing CLAUDE.md's Implementierungsstand
  endpoint/loader/store table, when touching docs/Dokumentation.md
  (Doku v2, the in-app /dokumentation page), when deciding WHICH doc is the
  source of record for a fact, or when a doc and the code disagree about a
  coefficient/path/version. Keywords: Doku, Dokumentation, handoff, CLAUDE.md,
  endpoint table, doc drift, source of record, house style, Tool-Logik-und-Quellen.
---

# rw-docs-and-writing — the docs of record, templates & house style

Runbook voice, for a zero-context engineer or a Sonnet-class model. This project
has **several doc surfaces that drift apart**. This skill says which one is
authoritative for what, how to keep them in sync, and how to write in house
style. Verified against the repo on **2026-07-08**.

## When NOT to use this — use a sibling instead
- Paper-, release-, or reviewer-facing writing and novelty/excellence claims →
  **rw-external-positioning**.
- Changing anything in `urban-heat-wiki/` (the scientific source of record) →
  **rw-change-control** (the wiki-ingest gate). This skill never hand-edits the wiki.
- The *actual coefficient values* and where they live in code →
  **rw-config-and-coefficients**. This skill describes docs, not the numbers.

---

## 1 · Map of doc surfaces (which doc owns what)

| Doc | What it's for | Authoritative for | Update when |
|---|---|---|---|
| `CLAUDE.md` (repo root) | Project manifest + `Implementierungsstand` | The endpoint/loader/store/component inventory: what exists, its cache, its properties | An endpoint, `utils/*` loader, `useAppStore` field, or component contract changes |
| `docs/Dokumentation.md` (+ `.en.md`) | **Doku v2** — the in-app `/dokumentation` page | "Every function, assumption, number, coefficient + its source" — the prose doc of record for methodology | Any function/number/coefficient/source shown in the UI changes |
| `docs/Tool-Logik-und-Quellen.md` | **v1, being retired** | Nothing new — superseded by Doku v2 | Do **not** extend it. It carries a "⚠️ Veraltet" banner; delete once `/dokumentation` ships |
| `docs/Design-System.html` | UI reference (tokens, components, KPI/legend patterns) | Look-and-feel; existing component patterns | Check **before** inventing a UI component; update only if the design system itself changes |
| `docs/code-review-skill.md` | The review checklist | The review procedure and merge checklist | The review process changes. ⚠️ Has a stale path — see §3 |
| `docs/handoff-*.md` | Single-task handoff briefs | The full story of one fix (problem→verification) | You complete a self-contained fix worth handing off (template in §4) |
| `urban-heat-wiki/` | Scientific source of record | The provenance of every coefficient/formula before it enters `simulation_params.py` | **Only via the INGEST/UPDATE workflow** in `urban-heat-wiki/CLAUDE.md`. Never hand-edit. Route through **rw-change-control** |
| `README.md` | Public front door / quickstart | Setup + feature summary for a newcomer | Setup steps or the feature list change |

**One home per fact.** A number lives in code; its provenance lives in the wiki;
its human-readable explanation lives in Doku v2; the API contract lives in
CLAUDE.md's endpoint table. Other docs *link*, they don't re-derive.

---

## 2 · The golden rule of consistency

From `docs/Dokumentation.md` § 0 (verbatim intent):

> Alle fachlichen Koeffizienten stammen aus `backend/simulation_params.py`
> (Backend) bzw. `frontend/src/utils/simulate.js` (gespiegelte Frontend-Kopie).
> Diese beiden Dateien sind die **einzige Wahrheit** … Sollten sich die Werte im
> Code und in dieser Doku je unterscheiden, **gilt der Code.**

Operationally:
1. Coefficients live **only** in `backend/simulation_params.py` and its mirror
   `frontend/src/utils/simulate.js` (plus a few values re-mirrored in
   `frontend/src/store/useAppStore.js` — a three-way hand-sync burden).
2. **Docs describe; code decides.** Prose docs never introduce a number that
   isn't already in code.
3. **If a doc and the code disagree, the code wins** and the *doc* is the bug —
   fix the doc, never bend the code to match stale prose.

---

## 3 · Known drift to fix on sight (2026-07-08)

Verified against the repo. When you touch any of these files, correct the drift
in passing (it's a doc fix, not unrelated code):

| Where | Says | Truth (code / package.json) |
|---|---|---|
| `CLAUDE.md`, `docs/handoff-baumscheiben.md`* | `MIN_GROUND_PER_TREE_M2 = 25` | **100** (`frontend/src/utils/simulate.js`, `useAppStore.js`; FLL, trees 2nd order) |
| `docs/code-review-skill.md` (line ~31) | import from `backend/simulation/params.py` | **`backend/simulation_params.py`** — flat file, there is no `simulation/` package |
| `CLAUDE.md` tech table, `README.md`, `docs/code-review-skill.md` | React 18 / React Router v6 | **React 19.2.5 / react-router-dom 7.14.2 / Vite 8** (package.json) |
| `docs/Tool-Logik-und-Quellen.md` | current methodology doc | **superseded** by `docs/Dokumentation.md` (Doku v2) |

\* `docs/handoff-baumscheiben.md` is referenced by CLAUDE.md; if it exists, it carries the same 25→100 staleness.

To re-detect drift: grep the value in code, then grep it in docs (see §7).

---

## 4 · Template — handoff brief (`docs/handoff-<topic>.md`)

The house pattern is **Problem → Cause → Why-it-matters → exact Fix →
Verification → project rules respected**. Copy-paste skeleton:

```markdown
# Handoff — <kurzer Titel>

**Stand:** 2026-07-08 · **Status:** erledigt / offen / kandidat

## Problem
Was war beobachtbar falsch? (Symptom, betroffene Datei:Zeile, ggf. Screenshot-Notiz.)

## Ursache
Root cause — warum passiert es? (Nicht das Symptom wiederholen.)

## Warum es zählt
Fachliche/architektonische Konsequenz (z. B. „klemmt seal_pct auf 100 % → 0 pflanzbare m²").

## Fix (exakt)
Die konkrete Änderung: Datei, Funktion, Vorher/Nachher. Koeffizienten NUR mit Quelle.

## Verifikation
Exakte Kommandos + erwartetes Ergebnis, z. B.:
`cd backend && <conda-python> -m pytest tests/test_seal_pct.py -q`  → alle grün.
Ggf. Endpoint-Check mit `?refresh=true` nach Cache-Invalidierung.

## Projektregeln beachtet
- [ ] Keine Koeffizienten hardcodiert (Import aus simulation_params.py)
- [ ] Cache invalidiert falls nötig (lst.parquet / ?refresh=true)
- [ ] Doc-of-record aktualisiert (CLAUDE.md-Tabelle / Dokumentation.md)
- [ ] Wiki unangetastet (Änderungen nur via INGEST)
```

## 5 · Template — CLAUDE.md endpoint-table row

Match the existing `Implementierungsstand` table exactly (3 columns:
Endpoint · Status · Beschreibung). Cover cache location + `?refresh=true`
behaviour + the properties returned:

```markdown
| `GET /api/<name>` | ✅ | <Was zurückkommt> als GeoJSON/JSON. Properties: `<feld>` (<Einheit/Bedeutung>), … `meta`: `<…>`. Cache: `backend/data/<name>.parquet` (+ In-Memory `_cache`). `?refresh=true` erzwingt Neuberechnung. |
```

## 6 · Template — Dokumentation.md function entry

Doku v2 entries follow **Funktion → Eingaben → Formel → Koeffizienten+Quellen →
Caveats**. Every scientific number cites a wiki page:

```markdown
### <Funktion / Endpoint>
**Funktion.** Ein Satz: was tut sie fachlich?
**Eingaben.** `param` (Einheit), … · Datengrundlage: <Datensatz + CRS>.
**Formel.** `ergebnis = …` (in Worten, plus die Gleichung).
**Koeffizienten & Quellen.**
| Koeffizient | Wert | Quelle (Wiki-Seite) |
|---|---|---|
| `LST_PER_PCT_CANOPY_MIXED` | −0,083 °C/%-Pkt | García de León 2025 → `urban-heat-wiki/wiki/sources/garcia-de-leon-lst-trees-munich.md` |
**Caveats.** Was gilt NICHT? (z. B. „LST ≠ Lufttemperatur"; Kalibrierbasis; bewusst nicht angewendete Koeffizienten.)
```

---

## 7 · Doc-update checklist after a feature

Run through this before calling a feature done:

1. **CLAUDE.md endpoint/loader/store table** — new/changed endpoint, `utils/*`
   loader, or `useAppStore` field reflected? (§5 row format.)
2. **docs/Dokumentation.md** — the affected methodology section updated; every
   new number cites its wiki source. Mirror to `.en.md` if it exists.
3. **Affected handoff** — if this closed a tracked problem, write/update
   `docs/handoff-<topic>.md` (§4).
4. **Coefficient changed?** → it must have entered the wiki **via INGEST first**
   (rw-change-control), *before* landing in `simulation_params.py`. Never
   hand-edit the wiki, and never let a doc introduce a number code doesn't have.
5. **Drift sweep** — grep any number you touched in code vs docs (§below); fix
   the §3 drift if you were in those files anyway.
6. **Do NOT extend** `docs/Tool-Logik-und-Quellen.md` (retired) or
   `docs/Design-System.html` (unless the design system itself changed).

---

## 8 · House style

- **German is the project language.** UI strings, doc prose, KPI/legend labels,
  and any quoted doc text stay **German**. Skill/comment prose may be English,
  but never translate an identifier, a UI string, or a German quote.
- **Dates are absolute** (`2026-07-08`), never "today"/"last week".
- **Every scientific number cites a wiki source** — no bare coefficient in prose.
- **Concise, no filler.** Mirror the terse, checklist-driven tone of
  `docs/code-review-skill.md`: tables and bullet lists over paragraphs.
- **Flag uncertainty** explicitly; label anything unproven `offen`/`kandidat`.
  Confidence without certainty is worse than an admitted gap (CLAUDE.md rule 4).
- One fact, one home — link, don't duplicate (§1).

---

## 9 · Provenance and maintenance

Re-verify these when they might have drifted (all paths relative to repo root):

- **Confirm the true coefficient values** (code wins):
  `grep -nE "MIN_GROUND_PER_TREE_M2|LST_PER_PCT_CANOPY" backend/simulation_params.py frontend/src/utils/simulate.js`
- **Find stale mentions in docs** (drift = code value ≠ doc value):
  `grep -rn "MIN_GROUND_PER_TREE_M2" docs/ CLAUDE.md`
- **Confirm the code-review path bug still needs fixing:**
  `grep -rn "simulation/params.py" docs/code-review-skill.md`  (should be `simulation_params.py`)
- **Confirm framework versions:**
  `grep -E '"react"|"react-router-dom"|"vite"' frontend/package.json`
- **Which methodology doc is current:** `docs/Dokumentation.md` (Doku v2) is of
  record; `docs/Tool-Logik-und-Quellen.md` carries a "⚠️ Veraltet" banner.
- **Wiki edit rule:** `urban-heat-wiki/CLAUDE.md` §Workflows (INGEST/UPDATE) —
  the only sanctioned way to change the wiki.

Facts date-stamped **2026-07-08**. If a re-verify command above disagrees with
this file, the repo wins — update this skill.
