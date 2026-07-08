---
name: rw-failure-archaeology
description: >-
  The settled-battles chronicle for Resilientes Würzburg — every major
  investigation, dead end, rejected fix, and revert, with the commit/doc that
  closed it. Load this BEFORE you "improve", "clean up", "fix", or "simplify"
  any of: seal_pct / Versiegelungsgrad computation, bestand_pct / canopy /
  Kronendeckung, the HVI / vulnerability / small-numbers score, the LST↔Zensus
  100 m grid or pd.merge join, the top-5 hotspots distance math, or the
  tree/water simulation coefficients. Load it BEFORE you consider re-adding a
  cos(lat) raster correction, replacing pd.merge with gpd.sjoin, raising or
  lowering MIN_GROUND_PER_TREE_M2, touching the delta-analysis (baseline vs.
  current LST) work, editing the zensus tests, or restoring the deleted deploy
  docs. Also load it whenever a bug "feels familiar" or you think "surely the
  right fix is X" — X may already be a rejected fix. Reference skill: read it,
  don't re-fight. Keywords: seal_pct, Doppelzählung, Priority-Union, Bayesian
  shrinkage, N_PRIOR, EPSG:3035, cos-lat, Crookston-Stage, headroom cap,
  Baumscheiben, Einwohner vs einwohner, delta-analyse, striping, plantable_m2.
---

# rw-failure-archaeology — the chronicle of settled battles

**Purpose.** This project is worked by a solo developer and by cheaper
Sonnet-class models in future sessions. Each of the entries below is a problem
that already cost real time, was investigated, and was *closed with a specific
decision*. The failure mode this skill prevents: a fresh session sees a value
that "looks wrong" (a cell 100 % sealed, a naive-looking sum, a plain
`pd.merge` where you'd expect a spatial join) and "fixes" it — reopening a
battle that was won on purpose. **Before you touch any load-bearing formula,
find it here first. Repo wins over memory; if code and an entry disagree, trust
the code and update the entry (append-only, see the bottom).**

Date of last full re-verification against git: **2026-07-08**.

## How to read an entry

Each entry is: **Title** — Symptom → Root cause → Evidence (commit / doc /
test) → Resolution → **Status** → *Do not re-do X*.

Status vocabulary:
- **SETTLED** — closed, shipped on `main`, do not reopen without a new reason.
- **SETTLED-BY-DECISION** — closed by an owner decision, not a code change; the
  "simplest" alternative was consciously rejected.
- **DOC-STALE** — the *code* is settled and correct; a *doc* still describes the
  old value. Fix the doc if you touch it, never "fix" the code back.
- **STALLED** — real work, unfinished, parked on an unmerged branch. Advancing
  it is a real task — see `rw-research-frontier`, don't silently restart it.
- **OPEN** — not yet solved; owned elsewhere.

---

## 1. seal_pct ATKIS/OSM double-count → cells wrongly clamped to 100 %

- **Symptom.** Heavily sealed cells (Marktplatz, Talavera-Parkplatz) showed
  `seal_pct = 100 %` → `plantable_m2 = 0` → slider max 0 Bäume. Trees could not
  be planted anywhere dense, which is exactly where it matters.
- **Root cause.** ATKIS (`sie02_f`/`ver01_f`) and OSM polygons **overlap** in
  space. The v1 computation summed each source's sealed area independently, so
  a square metre covered by both an ATKIS `AX_Platz` and an OSM `osm_square`
  was counted twice and the fraction saturated at 1.0.
- **Evidence.** Commit `a7acf61` ("fixed polygon doppelzählung bei
  entsiegelungssimulation"); `backend/utils/data_loader.py::_compute_seal_pct`
  with `_SEAL_MODEL_VERSION = 2`; test `backend/tests/test_seal_pct.py`;
  `docs/handoff-baumscheiben.md` §1.
- **Resolution.** **Priority-Union.** Concat ATKIS + OSM (no verschnitt). Each
  m² counts **once**, at the **highest** `SEAL_RATE_BY_TYPE` of the polygons
  covering it — rate groups processed descending, `difference()` against
  already-claimed area. Result: Marktplatz 78,6 % → 2.140 m² pflanzbar;
  Talavera 86 % → 1.400 m² pflanzbar. (Der handoff-baumscheiben.md nennt „max 85
  / 56 Bäume" — das galt unter dem alten `MIN_GROUND = 25`; heute /100 → 21 bzw.
  14 Bäume. Der m²-Wert stimmt; nur der Baum-Divisor änderte sich, siehe
  rw-config-and-coefficients.)
- **Status: SETTLED.**
- *Do not re-do:* do not "merge" or "intersect" the two polygon sources to
  "dedupe" them — the overlap is intentional and the priority-union already
  resolves it per m². Do not min/max-clip seal_pct as a band-aid. If you change
  `_compute_seal_pct`, **bump `_SEAL_MODEL_VERSION`** (see entry 12, the cache trap).

## 2. Small-numbers HVI (3 residents, all 65+ → HVI 10)

- **Symptom.** Census cells with a handful of residents who happened to all be
  65+ got `anteil_65plus = 1.0` and therefore the maximum HVI (10), painting
  near-empty cells as the most vulnerable in the city.
- **Root cause.** A raw rate over a tiny denominator is not credible; the score
  treated `3/3` the same as `900/900`.
- **Evidence.** Commit `b206fb8` ("fix(hvi): löse Small-Numbers-Problem via
  Bayesian Shrinkage"); `backend/utils/vuln_formula.py`
  (`shrink_senior_rate`, `N_PRIOR = 50`); `backend/utils/analysis.py`
  (`build_hvi_geodataframe` — the single HVI call site);
  `backend/tests/test_vuln_formula.py`.
- **Resolution.** Empirical-Bayes shrinkage toward the **population-weighted**
  city senior rate: `adjusted = (n*observed + 50*global_mean) / (n + 50)`.
  A cell needs ~50 residents to reach 50 % credibility. HVI itself unchanged:
  `raw = 0.6*lst_norm + 0.4*anteil_65plus_adj`, `hvi = raw*9 + 1` (scale 1–10).
- **Status: SETTLED.**
- *Do not re-do:* do not drop the shrinkage to "show the real rate", and do not
  filter out small cells instead (that hides population). Do not change
  `N_PRIOR` or `WEIGHTS` without an owner-sourced justification — these are
  domain constants (project rule: never invent coefficients).

## 3. LST ↔ HVI grid mismatch → NaN rows / offset caveat

- **Symptom.** LST pixels (Landsat, once EPSG:4326) and Destatis census cells
  (EPSG:3035) did not line up; the vulnerability page carried a visible
  "grid offset / structural discrepancy" caveat, and joins were approximate.
- **Root cause.** The two grids were in different CRSs on different origins, so
  they were fused by `gpd.sjoin` + median aggregation — lossy and offset.
- **Evidence.** Commit `1eb8138` ("feat(lst): harmonize LST/HVI grid via
  EPSG:3035 GEE re-export"); `backend/utils/analysis.py`,
  `backend/utils/data_loader.py::load_lst`. Metric hotspot distance math moved
  to the same CRS in commit `da187ce` ("fix(hotspots): use EPSG:3035 for metric
  distance computation").
- **Resolution.** Re-export the LST GeoTIFF from GEE with `crs="EPSG:3035"` and
  `crsTransform=[100,0,4_300_000,0,-100,2_985_000]` — snapped exactly onto the
  Destatis 100 m grid. LST pixels and census cells now share integer midpoints
  `x_mp_100m`/`y_mp_100m`, so `build_hvi_geodataframe()` joins them with a plain
  **`pd.merge()`** on those keys — no spatial join. The offset caveat was
  removed. Hotspot focal-mean + NMS distances compute in EPSG:3035.
- **Status: SETTLED. This is the GRID INVARIANT.**
- *Do not re-do:* do not "upgrade" the `pd.merge` back to `gpd.sjoin` — the
  merge is exact *because* the grids are identical, and a spatial join would
  reintroduce the offset. If you ever re-export the LST TIFF with a different
  transform, the merge **silently yields NaN rows** — re-export with the exact
  transform above (and see entry 12 for the mandatory cache flush).

## 4. cos(lat) raster scaling — added, then removed

- **Symptom (original).** When LST was still in EPSG:4326, pixels were not true
  100 m × 100 m (longitude compression at Würzburg's latitude), so a cos(lat)
  correction was added to fix cell dimensions.
- **Root cause of its removal.** Once the LST TIFF was re-exported natively in
  EPSG:3035 (entry 3), pixels are metric and square by construction — the
  cos(lat) correction became not just unnecessary but *wrong* to keep.
- **Evidence.** Commit `ac3137b` ("fix: LST raster scaling (cos-lat) and UI
  improvements") **added** it; commit `1eb8138` **removed** the cos(lat)
  resampling ("remove cos(lat) resampling, read pixel bounds directly from
  rasterio transform"). `load_lst()` now reads bounds straight from the
  rasterio transform, no resampling.
- **Resolution.** No latitude correction anywhere in the raster path.
- **Status: SETTLED — do NOT re-add.**
- *Do not re-do:* if you see square-looking-but-you-doubt-it pixels, the answer
  is the native EPSG:3035 export, **not** a cos(lat) factor. Re-adding it
  double-corrects and desyncs LST from the census grid (breaks entry 3).

## 5. Naive canopy summation + headroom cap → overlap model

- **Symptom.** Dense stands (Ringpark, alleys) reached `bestand_pct ≈ 99–100 %`;
  200 trees × 50 m² in one empty 100×100 m cell "covered" 100 %. The Δ°C was
  applied to these inflated percentages.
- **Root cause.** `bestand_pct = Σ crown_area / cell_area` and
  `delta_coverage_pct = n×50/area` **sum overlapping crowns** — double-counting
  the same shaded ground. Worse: the −0,083 °C/% coefficient (García de León
  2025, München) is calibrated against **projected** canopy cover (union area,
  overlaps already removed), so naive-sum % is *not the quantity the coefficient
  measures*. The `headroom` cap (`100 − bestand_pct`) inherited the same error.
- **Evidence.** Commit `9385501` ("feat(sim): projizierte Kronendeckung statt
  naiver Summe (Überlappungsmodell)"), branch `tree-sim-overlap-model` (merged);
  `docs/tree-sim-upgrade.md` (Teil 1); wiki `log.md` 2026-06-10 update;
  `backend/tests/test_bestand_pct.py`, `test_simulate.py`.
- **Resolution.** Negative-exponential overlap model (Crookston & Stage 1999,
  empirically validated by Gray 2021): `projected_cover = (1 − exp(−ratio))×100`
  with `ratio = Σ crown_area / cell_area`; inverse `−ln(1 − pct/100)`. Existing +
  new crowns add in **ratio space**; Δ°C applies only to `effective_new_pct`
  (the real projected increment). Formulas live **only** in
  `simulation_params.py`. Headroom cap and `.clip()` removed; a `max()` guard
  keeps `effective_new_pct ≥ 0` at the `existing = 100` edge. Output JSON:
  `delta_coverage_pct` → `crown_area_ratio` + `effective_new_pct` +
  `total_coverage_pct`. `_BESTAND_MODEL_VERSION = 2`.
- **Status: SETTLED.**
- *Do not re-do:* do not "simplify" back to `Σ/area` (it re-breaks calibration
  consistency, not just cosmetics), and do not reintroduce a headroom cap. If
  you edit `_compute_bestand_pct`, bump `_BESTAND_MODEL_VERSION` (entry 12).

## 6. MIN_GROUND_PER_TREE_M2 raised 25 → 100

- **Symptom.** With 25 m²/tree, a 60 %-sealed Wohnbaufläche cell allowed ~160
  new trees — implausibly dense planting.
- **Root cause.** 25 m² is far below the real minimum spacing for 2nd-order
  street trees.
- **Evidence.** Commit `ae01838` ("fix(sim): Pflanzabstand-Cap auf FLL-Norm
  angehoben (25 → 100 m²/Baum)"); source FLL-Richtlinie "Empfehlungen für
  Baumpflanzungen", Teil 1, 2. Ausgabe 2015 (10 m spacing, 2nd order);
  `backend/simulation_params.py`, `frontend/src/utils/simulate.js`,
  `frontend/src/store/useAppStore.js`. Result: 60 %-sealed cell → ~40 trees.
- **Resolution.** `MIN_GROUND_PER_TREE_M2 = 100`. This is a plausibility slider
  cap on **stem count**, not the cooling denominator (`area_m2` sent to the API
  stays the full cell area — crowns overhang sealed ground).
- **Status: SETTLED (code) / DOC-STALE.**
- ⚠ **Doc drift (verified 2026-07-08):** `CLAUDE.md` and
  `docs/handoff-baumscheiben.md` (lines 27, 43) still say **25**. The **code is
  100** — trust the code. If you touch those docs, correct them to 100; never
  "fix" the code back to 25 to match the stale doc.
- *Do not re-do:* do not lower it to 25 on the authority of a doc. Changing it
  again needs an owner-sourced spacing norm.

## 7. Baumscheiben — sealed ground gives 0 plantable (model limit)

- **Symptom.** The model ties plantability strictly to *unsealed* ground
  (`plantable_m2 = 10_000 × (1 − seal_pct)`), so a 95 %-sealed parking lot
  allows almost no trees — yet cities plant tree rows there via **Baumscheiben**
  (point unsealing of ~4–10 m² per tree in the pavement).
- **Root cause.** Deliberate model scope, not a bug: plantability = unsealed
  fraction.
- **Evidence.** `docs/handoff-baumscheiben.md` (whole doc is a decision brief,
  not a coding task); the limit lives at `backend/routers/lst.py` (the
  `plantable_m2` line, computed live, **not** stored in parquet).
- **Resolution — decided Option A (UI hint only).** Add a Baumscheiben note in
  the BaumSimPanel; **no** new coefficient, **no** backend change, **no** cache
  invalidation. Options B/C (a `BAUMSCHEIBEN_RATE` coefficient, or a second
  slider) were **rejected** unless the owner supplies a sourced parameter —
  because inventing that coefficient violates the project's cardinal rule.
- **Status: SETTLED-BY-DECISION.**
- *Do not re-do:* do not invent `BAUMSCHEIBEN_RATE` or any m²-per-Baumscheibe
  factor to "make sealed cells plantable". That is exactly the rejected path. If
  the owner brings a citation, route it through the wiki ingest → then
  `simulation_params.py`. Otherwise the UI hint is the whole solution.

## 8. Zensus tests expected lowercase `einwohner`

- **Symptom.** `test_properties_have_required_keys` and
  `test_einwohner_non_negative` in `backend/tests/test_zensus.py` failed
  (AssertionError / `KeyError: 'einwohner'`) on clean `main`.
- **Root cause.** The tests expected `einwohner` (lowercase); the `/api/zensus`
  contract returns **`Einwohner`** (capital E).
- **Evidence.** Commit `45171ef` ("fix zensus-tests + überarbeite
  Simulation-Hinweistexte"); `docs/handoff-zensus-tests.md`.
- **Resolution.** **Fix the tests, not the API.** `Einwohner` (capital E) is the
  documented, frontend-consumed contract on both `/api/zensus` and
  `/api/vulnerability` (frontend reads `p.Einwohner` in `Vulnerabilitaet.jsx`).
  Two edits in the test file changed the expected key to `Einwohner`. Only
  `/api/stadtbezirke` uses lowercase `einwohner` — a **different endpoint**,
  don't conflate.
- **Status: SETTLED.**
- *Do not re-do:* do not rename the API property to lowercase to "match the
  tests" — it would drag frontend + docs + the second endpoint with it. The
  capital-E `Einwohner` is the contract on the two census-grid endpoints.

## 9. Delta-Analyse (baseline 2014–16 vs. current 2023–25)

- **Symptom.** WIP LST-difference layer shows **striping** artifacts and
  **NoData** handling bugs; not presentable.
- **Root cause.** Unresolved — striping + NoData in the baseline/current raster
  differencing.
- **Evidence.** Single WIP commit `17d9fa2` ("WIP: Delta-Analyse implementiert,
  aber Striping/NoData Bugs vorhanden") on branch `feature/delta-analyse`
  (unmerged; also on `origin/feature/delta-analyse`). Data present in
  `backend/data/`: `lst_delta.parquet`,
  `lst_wuerzburg_baseline_2014_2016.tif`, `lst_wuerzburg_current_2023_2025.tif`.
  Touches `backend/routers/lst.py`, `data_loader.py`, and several frontend
  files (`HeatLayer.jsx`, `LSTLegend.jsx`, `Hitzeatlas.jsx`).
- **Resolution.** None — parked.
- **Status: STALLED (unmerged).**
- *Do not re-do:* do not restart delta-analysis from scratch on `main` — the
  work exists on `feature/delta-analyse`. Advancing it (fixing striping/NoData,
  then a merge decision) is a **real task**, owned by `rw-research-frontier` —
  cross-link, don't duplicate the how-to here.

## 10. Deploy docs (DEPLOY-QUICKSTART / RENDER / VERCEL.md) deleted

- **Symptom.** Three deployment how-to docs once existed under `docs/` and are
  now gone; a fresh session might "helpfully" recreate them.
- **Root cause / why deleted.** Deployment is **off-limits** (hard project rule
  #7): GitHub CI/CD to Render (backend) + Vercel (frontend), owner-controlled.
  The step-by-step docs were removed to stop sessions editing deploy config
  (`render.yaml`, env vars) without sign-off.
- **Evidence.** Commits `f351138`, `140c4d3`, `ad3fe5b` (Delete
  DEPLOY-QUICKSTART / DEPLOY-RENDER / DEPLOY-VERCEL.md). Deploy plumbing still
  exists (`render.yaml`, added `c9d271a`; committed data files `572b2fd`) — that
  is *config*, not something to touch.
- **Resolution.** Docs intentionally absent; deployment is not a self-serve task.
- **Status: SETTLED-BY-DECISION (owner rule).**
- *Do not re-do:* do not recreate deploy docs or modify `render.yaml` /
  Render/Vercel settings / production env vars without explicit owner sign-off.

## 11. Baumkataster REST API offset+limit ≤ 10k cap → bulk export

- **Symptom.** Only ~10.000 of Würzburg's 44.647 tree records were reachable via
  the opendata REST API.
- **Root cause.** The API constrains `offset + limit ≤ 10.000`, so paginating
  past 10k is impossible.
- **Evidence.** Commit `9b14c53` ("refactor(trees): replace paginated API with
  local parquet export"); `backend/utils/data_loader.py::load_tree_cadastre`
  (reads the local bulk export, no network).
- **Resolution.** Switch to a manual bulk GeoParquet export
  (`backend/data/baumkataster_stadt_wuerzburg.parquet`, 44.647 records,
  geometry col `geo_punkt`, CRS `OGC:CRS84`, fields `baumart`, `kronenbrei`
  crown *diameter*, `baumhoehe`, `stammumfan`, `source_id`; **no**
  `pflanzjahr`/`alter`). The processed cache `trees.parquet` is derived from it.
- **Status: SETTLED.**
- *Do not re-do:* do not "restore" live paginated API fetching for the full
  cadastre — it cannot reach all records. The bulk export is the source of
  truth; `?refresh=true` re-reads it, no network.

---

## When NOT to use this / use instead

- **A live bug is happening right now** (stack trace, failing request, wrong
  number on screen) and you need to triage it → **`rw-debugging-playbook`**.
  This skill only tells you whether that bug is a *reopened settled battle*;
  it does not walk you through diagnosis.
- **You want to advance an OPEN / STALLED problem** (delta-analysis striping,
  the air-temperature dimension) → **`rw-research-frontier`**. Delta-analysis
  (entry 9) appears in both skills on purpose: this file records *that it
  stalled and why not to restart it blindly*; the frontier skill owns *how to
  advance it*. Cross-link, don't duplicate.
- **You need the current architecture / invariants** (grid, CRS, endpoints,
  single-source-of-truth files) as a positive reference, not a post-mortem →
  see the project `CLAUDE.md` and the sibling architecture skill.

Each fact has one home. If it's a *closed decision*, it lives here. If it's
*how the system works today*, it lives in the architecture reference. If it's
*how to fix a live failure*, it lives in the debugging playbook.

---

## The cache-versioning trap (read before any formula edit — cross-cutting)

Entries 1 and 5 both depend on this, so it is stated once here:
`load_lst()` **lazy-adds only MISSING columns** to an old
`backend/data/lst.parquet`, and recomputes `bestand_pct` / `seal_pct` **only
when** the stored `_bestand_model_version` / `_seal_model_version` is *below*
the module constant. If you change the *content* of an existing column's formula
**without bumping its version constant**, the stale cache is silently kept.

Rule after editing `_compute_bestand_pct` or `_compute_seal_pct`: **bump the
version constant, OR delete `backend/data/lst.parquet`, OR call `?refresh=true`.**
When the LST GeoTIFF itself is swapped: delete `lst.parquet` (or `?refresh=true`)
**and restart the backend** (clears in-memory caches of `/lst`, `/vulnerability`,
`/zensus`, `/stadtbezirke`, `/hotspots`), then re-hit those endpoints with
`?refresh=true`.

---

## How to add a new entry here

Append-only, **newest on top** (insert as new section 1, renumber is optional —
prefer stable numbers, add letters like "12a" if needed). Every entry MUST:

1. Follow the format: **Title** — Symptom → Root cause → Evidence → Resolution
   → **Status** → *Do not re-do X*.
2. Cite at least one **commit hash** or **doc/test path** as evidence. No
   citation → it isn't archaeology yet, it's a hunch (put it in
   `rw-research-frontier` as a candidate instead).
3. Use the exact Status vocabulary (SETTLED / SETTLED-BY-DECISION / DOC-STALE /
   STALLED / OPEN).
4. Never invent a coefficient, flag, or path to make an entry "cleaner". If code
   and this file disagree, the **repo wins** — update the entry.

---

## Provenance and maintenance

All entries verified against the repo on **2026-07-08** (branch `main`).
Regenerate / re-verify the history behind this file with (read-only):

```bash
git log --oneline -80                 # recent main history
git log --all --oneline               # includes stalled/feature branches
git branch -a                         # confirms feature/delta-analyse, tree-sim-overlap-model
git show a7acf61 --stat               # entry 1  seal_pct priority-union
git show b206fb8 --stat               # entry 2  Bayesian shrinkage
git show 1eb8138 --stat               # entry 3  EPSG:3035 grid harmonize (+ pd.merge)
git show da187ce --stat               # entry 3  hotspots metric CRS 3035
git show ac3137b --stat               # entry 4  cos(lat) added (removed in 1eb8138)
git show 9385501 --stat               # entry 5  Crookston-Stage overlap model
git show ae01838 --stat               # entry 6  MIN_GROUND_PER_TREE_M2 25 -> 100
git show 45171ef --stat               # entry 8  zensus tests fixed (not API)
git show 17d9fa2 --stat               # entry 9  delta-analyse WIP (feature branch)
git show f351138 140c4d3 ad3fe5b --stat   # entry 10 deploy docs deleted
git show 9b14c53 --stat               # entry 11 bulk export vs REST 10k cap
```

Docs backing the decisions: `docs/handoff-baumscheiben.md` (entries 1, 6, 7),
`docs/handoff-zensus-tests.md` (entry 8), `docs/tree-sim-upgrade.md` (entry 5),
`urban-heat-wiki/wiki/log.md` (2026-06-10 entries: overlap model + plantable
potential; 2026-06-19: allometry sources).

**Known doc drift to re-check periodically:** `MIN_GROUND_PER_TREE_M2` (code 100
vs. CLAUDE.md / handoff-baumscheiben.md = 25, entry 6). Verify current code with:

```bash
grep -rn "MIN_GROUND_PER_TREE_M2" backend/simulation_params.py frontend/src/utils/simulate.js frontend/src/store/useAppStore.js
```
