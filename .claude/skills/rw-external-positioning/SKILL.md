---
name: rw-external-positioning
description: >-
  Honest-positioning guardrail for talking about Resilientes Würzburg to the
  OUTSIDE world — abstracts, talks, submissions, READMEs, the Marktplatz pitch,
  grant text, ecosystem posts. LOAD THIS before you write any external-facing
  claim about what the project achieves, contributes, validates, or proves:
  a paper/poster abstract, a conference or Marktplatz talk, a submission cover
  letter, a "novel"/"first"/"validated"/"accurate" sentence, a results claim,
  a README "what this does", a comparison against prior work, or a reviewer
  reply. Its job is to PREVENT OVERCLAIMING: it separates genuine contribution
  from standard method, lists the exact claims you may NOT make yet and the
  evidence each needs (local calibration, air-temperature cooling, CO₂ authority,
  unsealing Δ°C), and pins the reproducibility standard (data provenance, the
  coefficient→wiki chain, deterministic cache rebuild, the 129-test anchor).
  Triggers: "abstract", "novel", "first", "validated", "accurate", "we prove",
  "contribution", "state of the art", "submission", "peer review", "poster",
  "Redemanuskript", "Kurzfassung", "claim", "reproducible".
---

# rw-external-positioning

How to describe Resilientes Würzburg to anyone outside the repo **without
overclaiming**. This is a **university project built to a scientific-defensibility
bar — it is NOT a peer-reviewed paper.** Nothing here has been through external
review; every simulation coefficient is **transferred from another city**
(Munich / Potsdam / literature), not locally calibrated on Würzburg data. The
`Marktplatz-Kurzfassung.pdf` and `Marktplatz-Redemanuskript.docx` in the repo are
a **pitch/talk**, not a validated result.

Your default posture when writing anything external: **claim the integration and
the transparency, cite (never claim) the standard methods, and label everything
unvalidated as exactly that.** An honest "transferred, not yet locally validated"
is a strength at this bar; a bare "validated" is a defect a reviewer will catch.

Facts verified against the repo + wiki on **2026-07-08**. If code/wiki disagrees
with a sentence here, **code/wiki wins** — fix this skill (see §7).

---

## 1. Novel vs. known — the honest table

Use this to decide what to foreground and what to merely cite. The **left column
is claimable as this project's contribution** (in a student-project framing); the
**right column must be attributed to prior work**, never presented as new.

| Genuine contribution HERE (claim, with the "integration/transparency" framing) | Standard / prior art (CITE, do NOT claim as novel) |
|---|---|
| **Grid harmonization**: Landsat LST snapped in GEE onto the **Destatis 100 m census grid** (EPSG:3035, `crsTransform=[100,0,4_300_000,0,-100,2_985_000]`) so LST pixels and Zensus cells share integer midpoints and join with a plain `pd.merge()` — no spatial join, no resampling. Done for a **mid-size German city**. | LST remote sensing itself (Landsat 8/9 ST_B10, thermal infrared → surface temperature). Standard since decades — cite USGS / the Landsat C2L2 product. |
| **Methodological consistency**: applying the Δ°C coefficient only to the **projected** canopy increment (`effective_new_pct`) via the Crookston & Stage (1999) negative-exponential overlap model — i.e. feeding the coefficient exactly the quantity García de León calibrated against, not a naive `Σ crown / area`. | The overlap equation `(1−e^−ratio)·100` itself (Crookston & Stage 1999, USDA RMRS-GTR-24) and the García de León (2025) regression — both are **cited sources**, not our inventions. |
| **Cell-level HVI with population-weighted Bayesian shrinkage** (`shrink_senior_rate`, Empirical Bayes, `N_PRIOR=50`, population-weighted city mean) to defuse the small-numbers problem (a 3-resident all-65+ cell no longer scores HVI=10). | The **HVI concept** (heat-vulnerability index = weighted heat + demographic exposure) is a well-established public-health/UHI construct. Cite it; claim only the shrinkage refinement + the weighting. |
| **Source-transparent what-if simulator**: every simulation number traces `simulation_params.py` → a wiki source page; caveats shipped in the API response; the deliberately-unused coefficient (`LST_PER_PCT_UNSEALING`) documented rather than silently applied. | The **Rational formula** (`Q = Ψ·i·A`) and the **runoff coefficients Ψ** (DWA-A138 / LfU Bayern / Bayreuth 2024) are textbook hydrology + published tables. Cite them; claim only the transparent integration. |
| The **integrated pipeline** (heat + vulnerability + unsealing + two simulations) as one reproducible open codebase for Würzburg. | Each individual layer's method (LST, NDVI, impervious surface, census demographics) is standard. The novelty is the **combination + provenance discipline**, not any single method. |

**One-line framing that is safe:** *"We integrate standard remote-sensing,
census, and hydrology methods into a source-transparent, grid-harmonized decision
tool for Würzburg, using cooling coefficients transferred from a comparable German
city (Munich) pending local calibration."* Every strong word in that sentence is
backed.

---

## 2. Claim gates — "You may NOT claim X until Y"

Each row is a sentence you must **not** write externally until the stated evidence
exists. If asked to write it anyway, downgrade to the "allowed instead" wording.

| ❌ You may NOT claim | ⛔ Because (current state) | ✅ Evidence needed to unlock | ✔ Allowed instead, today |
|---|---|---|---|
| "**locally accurate / validated for Würzburg**", "our coefficient", any R²/error figure for the app's cooling estimate | The applied tree coefficient is **`LST_PER_PCT_CANOPY_MIXED = −0.083 °C/%` from Munich** (García de León 2025, summer-2020, R²≈**0.41–0.61** by land-use). **No Würzburg LST×canopy regression has been run** (methodischer-plan Phase 2 = "ausstehend"). | A completed **Würzburg LST × canopy-cover regression** (per-land-use), its R², and a swapped-in local coefficient in `simulation_params.py` (wiki-sourced first). | "coefficient **transferred from Munich** (R²≈0.41–0.61 there), **not yet locally validated**; Würzburg calibration is future work." |
| any statement about **air-temperature cooling / transpiration cooling / how many degrees cooler it feels** | The app is **LST-only** (surface temperature). Trees also cool **air** via transpiration — a **different physical quantity**. `TRANSPIRATION_*` / `LATENT_HEAT_KWH_PER_KG` exist but **feed no endpoint**; "Schritt 3 Transpirationskühlleistung" is documented-but-unbuilt. The LST≠Lufttemperatur caveat is already a banner in the app. | The **air-temperature dimension campaign** landing a calibrated air-temp/transpiration model on its **own** basis (never an LST coefficient applied to air temp). See **rw-air-temperature-campaign**. | "results are **Landsat land-surface temperature (LST)**, which differs from air temperature; an air-temperature dimension is planned but not yet built." |
| presenting the **CO₂ number as authoritative** (e.g. "sequesters 12.5 kg CO₂/tree/yr, per our model") | `CO2_KG_PER_TREE_YEAR = 12.5` is **NOT yet ingested as a wiki source page** (flagged "vor Produktionsrelease nachholen"); it is extrapolated from a mature forest beech (Dr. D. Klein, Uni Münster), which **overestimates young street trees**. | Ingest a proper CO₂ source via the wiki INGEST workflow; ideally an urban-young-tree figure. Then it graduates from candidate to sourced. | "an **illustrative** CO₂ estimate (12.5 kg/tree/yr, mature-tree extrapolation, **not yet source-verified** — overestimates young plantings)." |
| any **Δ°C from unsealing / "unsealing cools by X °C"** | `LST_PER_PCT_UNSEALING = −0.03 °C/%` exists but is **deliberately NOT applied** in v1 — the Tervooren (2015, Potsdam) value is calibrated at **district scale**, physically invalid applied per-polygon. The Wasser sim returns **no** `delta_lst_celsius`. | A **district-scale** (`reference_m2`) unsealing-temperature KPI (methodischer-plan v2), keeping the calibration scale intact. | "unsealing is reported as **water infiltration** (m³/yr via the Rational formula); a temperature effect is **intentionally not claimed** at polygon scale." |
| "**peer-reviewed**", "**published**", "**state of the art**", "**first to**" | Nothing has been externally reviewed; it is a student project. | Actual peer review / publication. | "a **student research project** built to a scientific-defensibility standard; methods are standard, the **integration** is the contribution." |
| "**10 m LST**" / high-resolution accuracy | The shipped app uses **native 100 m** Landsat (EPSG:3035, grid-aligned). The 10 m downscaling (Onačillová 2022) is a methodischer-plan **aspiration**, and even it carries **RMSE ~4.2 °C** vs. in-situ — good for spatial patterns, not absolute temperatures. | Actually wiring downscaled 10 m LST into the pipeline (not done). | "**100 m** Landsat LST, suitable for **relative spatial patterns / hotspots**, not absolute-temperature claims." |

> **Rank normalization caveat (state it when quoting LST maps):** `lst_norm` is
> **rank-normalized** (scipy `rankdata`, 0–1), not min-max. So "hottest cell = 1.0"
> means **highest-ranked**, not a physical maximum. Do not present `lst_norm` as a
> temperature.

---

## 3. Reproducibility standard (what an external reader must be able to trace)

The bar: **anyone reproducing must trace every number `simulation_params.py` → a
wiki source page**, and rebuild the data deterministically. When you publish/submit,
include these so the claim is checkable.

### 3a. Data provenance — pin these exactly
| Layer | Provenance to cite | Identifier |
|---|---|---|
| LST | Google Earth Engine, Landsat Collection 2 L2 | `LANDSAT/LC08/C02/T1_L2` + `LANDSAT/LC09/C02/T1_L2`; band ST_B10; 3-yr summer median (Jun–Aug **2023–2025**); export EPSG:3035, 100 m |
| Rainfall | DWD Climate Data Center | Station **05705** (Würzburg), ref period **1991–2020**, 573.5 mm/yr |
| Demographics | Destatis **Zensus 2022** | 100 m grid, EPSG:3035, columns `GITTER_ID_100m` / `a65undaelter` / `Insgesamt_Bevoelkerung` |
| Land use / sealing | ATKIS Basis-DLM Bayern (LDBV) | `bkg_shape_712.zip` → `sie02_f.shp` + `ver01_f.shp`, EPSG:25832 |
| Trees | Stadt Würzburg open data | `baumkataster_stadt_wuerzburg.parquet` (44,647 records) via opendata.wuerzburg.de |
| Districts | opendata.wuerzburg.de API | `stadtbezirke` dataset (13 polygons) |
| OSM surfaces | OpenStreetMap via `osmnx` | `amenity=parking`, `place=square`, flat/industrial roofs |

### 3b. The coefficient → wiki-source chain (non-negotiable)
Every applied coefficient has a `# Source:` comment in `simulation_params.py`
pointing at a `urban-heat-wiki/wiki/sources/*` page. In external text, cite the
**underlying study**, not the code line:
- `−0.083 °C/%` → `garcia-de-leon-lst-trees-munich`
- Ψ runoff table → `dwa-a138-lfu-regenwasser-bayern` (+ Bayreuth 2024)
- `−0.03 °C/%` (unused) → `tervooren-2015-gruenvolumen-potsdam`
- Crookston-Stage overlap → `crookston-stage-1999-cover-equation`
- **Exception to disclose:** `CO2_KG_PER_TREE_YEAR` has **no wiki page yet** — do
  not cite it as sourced (see §2).

Coefficient values themselves live in **one home** — do not re-list them here;
see **rw-config-and-coefficients** for the exact-value catalog.

### 3c. Deterministic rebuild (so a reproducer gets your numbers)
Derived caches are `*.parquet` and are **gitignored** — they are rebuilt from the
raw inputs. To reproduce from clean:
```bash
# from repo root; conda env `resilientes` (Python 3.11)
git submodule update --init --recursive          # wiki is empty otherwise
# place required raw data in backend/data/ (not in git):
#   baumkataster_stadt_wuerzburg.parquet, lst_wue_2023_2025_summer_median.tif,
#   bkg_shape_712.zip, Zensus2022_*.csv, dwd_wuerzburg_monthly_kl_hist.zip
rm -f backend/data/lst.parquet                   # force recompute of derived cols
cd backend && python -m pytest tests/            # 129 passed ~122 s (builds caches)
```
> **Cache-version trap (mention if a reviewer asks how results stay current):**
> editing a formula in `_compute_bestand_pct`/`_compute_seal_pct` without bumping
> `_BESTAND_MODEL_VERSION`/`_SEAL_MODEL_VERSION` leaves stale caches. Rebuild =
> delete the parquet or `?refresh=true`. Full mechanics: **rw-config-and-coefficients**.

### 3d. The test anchor
**`cd backend && python -m pytest tests/` → 129 passed** (verified 2026-07-08).
This is the reproducibility anchor you may cite ("the pipeline is covered by a
129-test suite exercising the simulation math, HVI formula, seal/bestand models,
and routers"). **Do NOT claim CI** — there is **no CI pipeline**; tests are local
only (owner TODO). No confidence intervals are produced.

---

## 4. How to frame limitations — turn caveats into honest strengths

State these proactively. Volunteering a limitation reads as rigor; hiding it reads
as overclaim. Recommended framings:

| Limitation | Don't hide it — frame it | Why it's a strength here |
|---|---|---|
| **LST ≠ air temperature** | "We report surface temperature (Landsat LST); air temperature is a distinct quantity we do not yet model." | Shows you understand the physics; sets up the air-temperature campaign as principled future work. |
| **Statistical, not physical** | "A statistical regression model, not a physical microclimate model (no ENVI-met/WRF, no morphology feedback)." | Correctly scopes the tool as a fast screening/what-if instrument, not a claim of mechanistic simulation. |
| **Literature-transfer coefficients** | "Cooling coefficients transferred from Munich/Potsdam pending Würzburg calibration; the pipeline is built to swap in local coefficients." | Demonstrates the methodology is sound even before local data — and that you know the difference. |
| **No CI / no confidence intervals** | "Validated by a 129-test suite run locally; formal CI and uncertainty quantification are open items." | Honest about maturity while still pointing to real, runnable evidence. |
| **CO₂ figure un-sourced** | "CO₂ is an illustrative extrapolation, flagged for source-ingestion before any production claim." | Shows the provenance discipline is enforced, not decorative. |

Never write a sentence whose confidence exceeds the evidence. Per CLAUDE.md rule 4:
**"Confidence without certainty causes more damage than admitting a gap."**

---

## 5. Quick pre-flight checklist before sending anything external

- [ ] Does any sentence say **novel/first/validated/accurate/proven**? → check it
      against §1 and §2; downgrade or attribute.
- [ ] Is every **number** either wiki-sourced (§3b) or explicitly labeled
      candidate/illustrative (CO₂)?
- [ ] Any **air-temperature / "cooler air" / degrees-felt** claim? → remove (§2),
      it's LST-only.
- [ ] Any **unsealing Δ°C**? → remove; unsealing = water infiltration only.
- [ ] Is the **Munich-transfer / not-locally-calibrated** caveat present wherever a
      cooling number appears?
- [ ] Is "**LST = surface, not air temperature**" stated where temperature is shown?
- [ ] Did you claim **CI/peer-review**? → you have neither; say "129-test suite,
      local, student project".

---

## 6. When NOT to use this / use instead

- **Writing INTERNAL documents of record** (the `docs/Dokumentation.md` doc, handoffs,
  the wiki) rather than outward claims → **rw-docs-and-writing**. This skill governs
  *external* positioning; that one governs internal docs.
- **The open research problems themselves** (what to investigate next, the frontier)
  → **rw-research-frontier**. This skill only tells you what you may *claim*, not what
  to *pursue*.
- **The internal evidence bar / how good a result must be before it counts** →
  **rw-research-methodology**. This skill translates that bar into external wording.
- **Actually producing the proof a locked claim needs** (running the regression,
  generating the CI) → **rw-proof-and-analysis-toolkit**, then unlock the gate in §2.
- **Building the air-temperature dimension** that would unlock the air-temp claims →
  **rw-air-temperature-campaign**.
- **Exact coefficient values / where they live / applied-vs-unused status** →
  **rw-config-and-coefficients** (the catalog; one home per fact).
- **Getting sign-off to change a coefficient or wire in a reserved one** →
  **rw-change-control**.

---

## 7. Provenance and maintenance

Volatile facts date-stamped **2026-07-08**. Re-audit external claims against current
code/wiki before any submission with:

```bash
# Applied vs unused coefficients (confirm which the endpoint actually uses)
grep -nE 'LST_PER_PCT|CO2_KG_PER_TREE|TRANSPIRATION|LATENT_HEAT' backend/simulation_params.py
grep -n '_LAND_USE_INTERNAL\|LST_PER_PCT_UNSEALING\|delta_lst' backend/routers/simulate.py

# Confirm CO2 is still un-sourced (no wiki page); confirm Munich R² framing
grep -n 'Wiki-Seite\|nachholen\|R²' backend/simulation_params.py

# Confirm the app is still LST-only (no air-temp/transpiration endpoint wired)
grep -rn 'cooling_kwh_year\|air_temp\|lufttemp' backend/routers backend/simulation_params.py

# Re-run the test anchor (the reproducibility number you cite)
cd backend && python -m pytest tests/    # expect: 129 passed

# The authoritative simulation-logic page (claim source of record)
sed -n '1,40p' urban-heat-wiki/wiki/simulation-logic.md
```

**If any of these change, update the claim gates (§2) and the novel/known table (§1)
BEFORE writing new external text.** Specifically re-audit when:
- a **Würzburg local coefficient** replaces the Munich one → §2 row 1 unlocks;
- an **air-temperature endpoint** ships → §2 row 2 unlocks (coordinate with
  rw-air-temperature-campaign);
- the **CO₂ source** is ingested into the wiki → §2 row 3 unlocks;
- **CI** is added → §3d wording changes.

**Drift already known (do not propagate into external text):** CLAUDE.md's tech
table (React 18 / Router v6) lags `package.json` (React 19 / Router v7 / Vite 8);
CLAUDE.md & `handoff-baumscheiben.md` say `MIN_GROUND_PER_TREE_M2 = 25` while code
= **100**. Neither is externally material, but never quote the stale values.
