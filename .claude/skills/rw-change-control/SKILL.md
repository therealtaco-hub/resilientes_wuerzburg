---
name: rw-change-control
description: >-
  Doctrine skill for Resilientes Würzburg. LOAD THIS FIRST — before making ANY
  change that touches simulation coefficients, the HVI / vulnerability formula,
  cache or data files (*.parquet, GeoTIFF, CSV), the wiki submodule, deployment
  (render.yaml, Render, Vercel, prod env), or a backend API contract (response
  property names, GeoJSON shape). Also load it whenever you need to CLASSIFY
  whether a proposed change is safe / who must approve it / what gate applies.
  Triggers: "can I change the coefficient", "is it safe to edit", "add a new
  endpoint", "why is my HVI NaN", "stale cache", "edit the wiki", "deploy",
  "hardcode", "refactor simulate", touching simulation_params.py,
  utils/analysis.py, utils/vuln_formula.py, data_loader.py, routers/*.py,
  frontend/src/utils/simulate.js, or store/useAppStore.js. Every other rw-* skill
  defers to this one for "am I allowed to do this."
---

# rw-change-control — how changes are gated and reviewed

You are working in **Resilientes Würzburg** (React 19 + FastAPI geodata app:
urban heat / LST, social vulnerability / HVI, unsealing potential, tree-planting
and water-infiltration what-if simulations). This skill is the **doctrine**: it
tells you which changes are allowed, what must happen before each, and who
decides. When any other rw-* skill and this one seem to conflict on "am I allowed
to do this," **this skill wins**.

Read this **before touching code**, not after. If after reading you are still
unsure which class a change falls in, treat it as the stricter class and **ask
the owner (Marvin)**.

Jargon defined once:
- **Owner** = Marvin, the solo developer. The only person who can sign off on
  coefficients, formulas, deployment, and wiki science.
- **Coefficient** = a domain/scientific number that feeds a simulation or score
  (e.g. `LST_PER_PCT_CANOPY_MIXED`, `N_PRIOR`, a runoff Ψ value).
- **Contract** = the exact shape and property names a backend endpoint returns;
  the frontend and tests depend on it verbatim.
- **Grid invariant** = LST pixels and Zensus cells share integer midpoints
  (`x_mp_100m`, `y_mp_100m`) so they join with a plain `pd.merge()`, no spatial
  join. See rw-architecture-contract.

---

## 1. Change-classification table

Classify the change FIRST, then apply the gate. When a change spans classes, the
**strictest** class applies.

| Class | Examples | Gate — what MUST happen first | Who decides |
|---|---|---|---|
| **trivial** | typo, comment, log text, dead-code delete, non-behavioral rename inside one file | none beyond the standard pre-merge checklist (§4) | you |
| **feature** | new endpoint, new deck.gl layer, new UI panel, new store slice — no coefficient / formula / contract change | scope confirmed as one task; simplest design; §4 checklist; run tests | you, but ask owner if it touches a single-source-of-truth file |
| **coefficient-or-formula** | any edit to `simulation_params.py`, `utils/vuln_formula.py` (`WEIGHTS`, `N_PRIOR`, `compute_hvi`), the Crookston/Rational math, adding a new domain number | number must come from owner **or** a cited wiki source ingested via the wiki workflow (§3 rule 7); flag uncertainty; predict the new output before running | **owner** (science sign-off) |
| **data-or-cache** | swap the LST GeoTIFF, edit `_compute_seal_pct` / `_compute_bestand_pct`, change any `data_loader.py` parsing, touch a `*.parquet` schema | plan the cache-invalidation (§3 rule 5) BEFORE editing; state which caches + restarts are needed | you may implement; owner reviews if data source changes |
| **deployment** | `render.yaml`, `backend/.python-version`, Render/Vercel settings, production env vars, CI config, committing data files for deploy | **explicit owner sign-off — off-limits without it** (§3 rule 6) | **owner only** |
| **wiki** | any content under `urban-heat-wiki/` | go through the wiki's own INGEST/UPDATE workflow — never hand-edit (§3 rule 7) | **owner** curates sources; wiki agent files them |

---

## 2. The NON-NEGOTIABLES

Each rule is **Rule → Why → Evidence → How to comply**. Violating one is a
merge-blocker regardless of who is reviewing.

### N1. Never invent domain coefficients or formulas
- **Rule:** LST scaling, the vulnerability score, the Rational formula, the
  canopy model, CO₂ per tree, any runoff Ψ — none may be guessed, interpolated,
  or "reasonable-defaulted." They come from the **owner** or a **cited wiki
  source**.
- **Why:** The project's excellence bar is *scientific defensibility* —
  submission/publication grade, every number source-backed and locally
  calibrated. An invented number silently poisons a result that looks credible.
- **Evidence:** CLAUDE.md ("Fachliche Formeln … werden vom Nutzer vorgegeben –
  niemals selbst erfinden"). `docs/handoff-baumscheiben.md` §5.1 makes even a
  *plausible* `BAUMSCHEIBEN_RATE` conditional on the owner supplying a sourced
  value — the whole task is gated on "ask first, don't invent."
- **How to comply:** If you need a number that does not yet exist, STOP and ask
  the owner, or request it be ingested into the wiki first (N7). Label anything
  unproven as `# candidate — unsourced, do not ship` and flag it in your summary.

### N2. Coefficients live only in `backend/simulation_params.py` — never hardcoded
- **Rule:** Every simulation coefficient is imported from
  `backend/simulation_params.py` (flat file at the backend root — **not**
  `backend/simulation/params.py`). Never inline a magic number in a router,
  loader, or test.
- **Why:** One home per fact. A hardcoded copy drifts silently and defeats the
  source-comment audit trail.
- **Evidence:** CLAUDE.md ("Keine Koeffizienten hardcoden — immer aus
  `simulation_params` importieren"). Verified: `simulation_params.py` sits at
  backend root; `LST_PER_PCT_CANOPY_MIXED = -0.083` and `LST_PER_PCT_UNSEALING
  = -0.03` live there.
- **How to comply:** Add the constant (with a source comment matching the
  existing pattern) to `simulation_params.py`, then import it. See
  rw-config-and-coefficients for the add-a-coefficient checklist. Grep before
  merge: `grep -rnE "[-0-9]\.[0-9]{2,}" backend/routers backend/utils` to catch
  stray literals.

### N3. HVI is computed only in `utils/analysis.py → build_hvi_geodataframe()`
- **Rule:** The Heat-Vulnerability-Index is calculated in exactly one place:
  `build_hvi_geodataframe(zensus, lst)`. Never call `compute_hvi()` directly
  anywhere else.
- **Why:** Two endpoints (`/api/vulnerability`, `/api/stadtbezirke`) need HVI; if
  each computed it, the population-weighted global rate, the Bayesian shrinkage,
  and the merge keys would diverge between them.
- **Evidence:** CLAUDE.md ("`build_hvi_geodataframe()` — einzige HVI-Berechnung
  … nirgendwo sonst HVI berechnen"). Verified: only `routers/vulnerability.py`
  and `routers/stadtbezirke.py` import it.
- **How to comply:** Need HVI somewhere new? Call `build_hvi_geodataframe()`.
  Need the formula changed? That is a **coefficient-or-formula** change (owner
  sign-off) and it happens inside `vuln_formula.py`, consumed via `analysis.py`.

### N4. Backend returns GeoJSON / JSON — never a raw GeoDataFrame
- **Rule:** Every endpoint serializes to a GeoJSON FeatureCollection or plain
  JSON. All geometries convert to **EPSG:4326** before serialization.
- **Why:** It is a stated architecture convention and the frontend contract;
  raw GeoDataFrames don't serialize and leak the native CRS (3035 / 25832).
- **Evidence:** CLAUDE.md ("Backend gibt immer GeoJSON oder JSON zurück, nie
  rohe GeoDataFrames"). Native CRS: Zensus/LST 3035, ATKIS 25832, Baumkataster
  CRS84 — all `to_crs(4326)` before response.
- **How to comply:** Build the response dict yourself (properties + geometry),
  or `json.loads(gdf.to_crs(4326).to_json())`. Never `return gdf`.

### N5. Bump the cache version or delete `lst.parquet` after a formula change (the stale-cache trap)
- **Rule:** After editing `_compute_bestand_pct` or `_compute_seal_pct` (or any
  content of an already-existing parquet column), you MUST bump the matching
  version constant (`_BESTAND_MODEL_VERSION` / `_SEAL_MODEL_VERSION`) **or**
  delete `backend/data/lst.parquet` **or** call the endpoint with
  `?refresh=true`.
- **Why:** `load_lst()` lazy-adds only **missing** columns and re-computes
  bestand/seal only when the stored version is *below* the module constant. If
  you change a formula's *content* without bumping the version, the stale cached
  values survive and your change appears to do nothing.
- **Evidence:** CLAUDE.md "Daten-Caching" + Ground-truth §2 "CACHE VERSIONING
  TRAP." The seal double-count fix (`_SEAL_MODEL_VERSION = 2`, commit `a7acf61`)
  and the Crookston `bestand_pct` fix (`_BESTAND_MODEL_VERSION = 2`) both relied
  on the version bump to force recompute.
- **How to comply:** When the LST GeoTIFF itself is swapped: delete
  `lst.parquet` (or `?refresh=true`) **and restart the backend** (clears the
  in-memory caches of `/lst`, `/vulnerability`, `/zensus`, `/stadtbezirke`,
  `/hotspots`), then re-hit those endpoints with `?refresh=true`.

### N6. Deployment is off-limits without explicit owner sign-off
- **Rule:** Do not change `render.yaml`, `backend/.python-version`, Render or
  Vercel settings, production env vars, or CI without the owner explicitly
  approving *that specific change*.
- **Why:** Deploy is GitHub CI/CD to Render (backend) + Vercel (frontend); a
  bad change breaks the live app for everyone.
- **Evidence:** Ground-truth §0.7 (owner rule). `.env` files are never
  committed; `PYTHON_VERSION=3.11.0` is pinned in `render.yaml`.
- **How to comply:** Propose the change in prose, wait for a clear "yes, do it,"
  then act. No liveness endpoint exists besides root `GET /` — do not invent a
  `/health` route to satisfy a probe.

### N7. The wiki changes only through its INGEST/UPDATE workflow
- **Rule:** `urban-heat-wiki/` is a git submodule with its own governing
  `CLAUDE.md`. Never hand-edit a wiki page. All changes go through the wiki's
  INGEST (new source) or UPDATE (revise page) workflow, which also updates
  `index.md` and `log.md`.
- **Why:** The wiki is the scientific source of record. Coefficients get sourced
  *there* before they enter `simulation_params.py` (N1). Ad-hoc edits break the
  index/log invariant and the source→claim provenance chain.
- **Evidence:** `urban-heat-wiki/CLAUDE.md` — `raw/` is read-only, `wiki/` is
  LLM-owned but every change must run the workflow and touch `index.md` +
  `log.md`. Ground-truth §0.8.
- **How to comply:** To add science: run INGEST (read raw source → discuss →
  create `wiki/sources/<slug>.md` → update touched concept/entity pages →
  update `overview.md`, `index.md`, `log.md`). Only after the source page exists
  should the coefficient enter `simulation_params.py`.

### N8. One scoped task; ask, don't assume; flag uncertainty; simplest first; don't touch unrelated code
- **Rule:** Implement exactly one clearly-scoped task per session. Ask before
  assuming intent/architecture/requirements. State uncertainty out loud.
  Implement the simplest thing that works. Leave unrelated files alone.
- **Why:** These five are the project's core working agreement; each session's
  reviewer is often a cheaper model, so tight scope prevents cascading damage.
- **Evidence:** CLAUDE.md "Arbeitsweise" + rules 1–4. `handoff-baumscheiben.md`
  is the canonical example: it forces a *decision* conversation before any code,
  and recommends Option A (UI hint, no invented coefficient) precisely because
  of "simplest solution first."
- **How to comply:** If a fix tempts you to refactor a neighbor, don't — note it
  for a separate task. "Confidence without certainty causes more damage than
  admitting a gap."

### N9. Respect the API property-name contract exactly
- **Rule:** `/api/zensus` and `/api/vulnerability` return **`Einwohner`**
  (capital E). `/api/stadtbezirke` returns lowercase **`einwohner`** (a
  different endpoint — do not "harmonize" them). Do not rename response
  properties to fix a test.
- **Why:** The frontend reads `p.Einwohner` verbatim (e.g.
  `Vulnerabilitaet.jsx`). Renaming the API would drag frontend + docs + a second
  endpoint along; the casing difference between endpoints is intentional.
- **Evidence:** `docs/handoff-zensus-tests.md`: two zensus tests broke expecting
  lowercase `einwohner`; the sanctioned fix (commit `45171ef`) corrected the
  **TESTS**, not the API — two one-line edits in `tests/test_zensus.py`.
- **How to comply:** When a test disagrees with a documented contract, verify
  which side is authoritative (CLAUDE.md + frontend usage), then fix the wrong
  side. Default assumption: the **contract** is right, the test is wrong.

### N10. Keep the three-way sim-constant sync
- **Rule:** Simulation constants are mirrored in three files that must stay in
  sync **by hand**: `backend/simulation_params.py` (authoritative) ↔
  `frontend/src/utils/simulate.js` ↔ `frontend/src/store/useAppStore.js`.
- **Why:** No build step syncs them; the UI preview math must match the backend
  or the slider lies about the result.
- **Evidence:** CLAUDE.md notes `utils/simulate.js` is "gespiegelt (sync mit
  `backend/simulation_params.py`)"; the store mirrors `_CROWN_AREA_M2`,
  `_MIN_GROUND_PER_TREE_M2`, `_SEAL_RATE`. **Live drift found 2026-07-08:**
  `MIN_GROUND_PER_TREE_M2 = 100` in both `simulate.js:92` and
  `useAppStore.js:6` (FLL norm, trees 2nd order, raised from 25), but CLAUDE.md
  and `handoff-baumscheiben.md` still say **25** — the docs are stale, the code
  is correct at 100. Note: `MIN_GROUND_PER_TREE_M2` is a frontend-only
  planting-practical cap; it is **not** in `simulation_params.py`.
- **How to comply:** Change a mirrored constant in one file → update the other
  two in the same task. After any sim-constant edit, grep all three (see
  Provenance) and reconcile before merge.

---

## 3. Pre-merge checklist

Adapted from `docs/code-review-skill.md` §5, with its stale
`simulation/params.py` path **corrected to `simulation_params.py`**. Run through
every line before considering a change done.

```
[ ] No hardcoded coefficients — all imported from backend/simulation_params.py   (N2)
[ ] HVI computed only in utils/analysis.py → build_hvi_geodataframe()             (N3)
[ ] New data endpoint documented in CLAUDE.md (endpoint table + data_loader note)
[ ] ?refresh=true supported (if it is a data endpoint)
[ ] Backend returns GeoJSON/JSON, converted to EPSG:4326 — never a raw GeoDataFrame (N4)
[ ] deck.gl layer: parameters { depthTest:false, blend:true }, pickable:true, onHover prop
[ ] New state added to store/useAppStore.js
[ ] Colors via utils/colors.js (COLORS map); labels/sources via utils/sources.js
[ ] Numbers formatted via fmt.* (utils/format.js)
[ ] No secrets in code — only .env / import.meta.env
[ ] Cache invalidation planned if a parquet-backed formula changed              (N5)
[ ] Sim constants synced across simulation_params.py / simulate.js / useAppStore.js (N10)
[ ] API property names unchanged (Einwohner capital E on /zensus + /vulnerability) (N9)
[ ] Tests present / existing tests still green (see rw-validation-and-qa)
[ ] Deployment files untouched unless owner signed off                          (N6)
[ ] Wiki changes (if any) went through the INGEST/UPDATE workflow               (N7)
```

Extra checks from `code-review-skill.md`: if CRS is missing/wrong, flag the
`to_crs(4326)` requirement; if Zensus data is processed, verify
`pd.to_numeric(..., errors="coerce")` + `.clip(0,1)` on `anteil_65plus`; new sim
logic must be documented in the wiki with sourced coefficients.

---

## 4. When NOT to use this / use instead

This skill answers **"am I allowed to do this, and what gate applies."** For the
rest, defer to a sibling and don't duplicate its content here:

- **rw-architecture-contract** — the *why* behind the invariants: the grid
  invariant (`pd.merge` on `x_mp_100m`/`y_mp_100m`, no spatial join), CRS
  conventions, endpoint/router map, single-source-of-truth files.
- **rw-config-and-coefficients** — the step-by-step *how-to-add-a-coefficient*
  checklist (wiki-source → `simulation_params.py` → three-way sync → tests).
- **rw-validation-and-qa** — evidence standards: how to run the pytest suite
  (129 passed, conda env `resilientes`), the frontend smoke test, predict-then-
  verify discipline, what counts as proof a change works.

If a question is purely "how do I run the app / tests," that is
rw-validation-and-qa, not this skill.

---

## 5. Provenance and maintenance

Verified against the repo on **2026-07-08**. Re-run these one-liners when a fact
might have drifted:

```bash
# N2/N10 — confirm the coefficient file path is flat (NOT backend/simulation/params.py)
ls backend/simulation_params.py

# N10 — catch the 25-vs-100 MIN_GROUND_PER_TREE_M2 drift across all three mirrors
grep -rn "MIN_GROUND_PER_TREE_M2" backend frontend/src   # expect frontend = 100

# Doctrine coefficients still present
grep -nE "LST_PER_PCT_CANOPY_MIXED|LST_PER_PCT_UNSEALING|N_PRIOR" backend/simulation_params.py backend/utils/vuln_formula.py

# Router set (expect 8 include_router lines: trees, lst, simulate, zensus,
# vulnerability, entsiegelung, stadtbezirke, hotspots)
grep -n "include_router" backend/main.py

# N3 — HVI must be imported in only these two routers, nowhere else
grep -rn "build_hvi_geodataframe" backend/routers

# N7 — wiki governance file exists (submodule; init if empty)
ls urban-heat-wiki/CLAUDE.md   # if missing: git submodule update --init --recursive
```

**Known stale docs to NOT propagate** (repo is authoritative where they
disagree): CLAUDE.md + `handoff-baumscheiben.md` say `MIN_GROUND_PER_TREE_M2 =
25` (code = **100**); `docs/code-review-skill.md` references
`backend/simulation/params.py` (real path = **`backend/simulation_params.py`**);
CLAUDE.md tech table says React 18 / Router v6 (package.json = **React 19 /
Router v7 / Vite 8**); `Tool-Logik-und-Quellen.md` is v1, superseded by
`docs/Dokumentation.md` (Doku v2). Update this skill's date stamp whenever you
re-verify.
