---
name: rw-proof-and-analysis-toolkit
description: >-
  First-principles verification recipes for Resilientes Würzburg — "prove it,
  don't just trust it." LOAD THIS when you must PROVE a coefficient or formula is
  right rather than assume it: verifying a coefficient's calibration basis before
  reuse, deriving projected canopy cover by hand, reproducing an endpoint's number
  by hand, checking the Bayesian-shrinkage adjustment, proving the grid join is
  sound, running a sensitivity/plausibility check, or reasoning about the seal_pct
  Priority-Union. Triggers: "prove", "derive", "verify by hand", "recompute",
  "calibration basis", "is this coefficient valid here", "sensitivity analysis",
  "reproduce the number", "sanity check the formula", Crookston, projected cover,
  Rational formula, shrink_senior_rate, Priority-Union. NOT for running the ready-
  made measurement scripts (rw-diagnostics-and-tooling), NOT for the underlying
  theory (rw-geo-climate-reference), NOT for encoding the proof as a test
  (rw-validation-and-qa).
---

# rw-proof-and-analysis-toolkit

The excellence bar is scientific defensibility (`rw-change-control`). This toolkit is
about **verifying** numbers, not producing plausible-looking ones. Each recipe is a
recipe (Goal → Method → Worked example with real repo numbers → What proves/disproves
it). Worked numbers below are hand-computed and match the code as of 2026-07-08.

---

## Recipe 1 — Verify a coefficient's calibration basis before using it
**Goal:** confirm a coefficient is applied to the SAME quantity it was calibrated
against. A units/quantity mismatch fabricates results silently.

**Method:** (1) find the wiki source page for the coefficient; (2) identify the exact
quantity it was fitted against; (3) check the code applies it to that same quantity, at
the same spatial scale.

**Worked example — García de León −0.083 °C/%:** the source
(`urban-heat-wiki/wiki/sources/garcia-de-leon-lst-trees-munich.md`) fits ΔLST against
**projected canopy cover** (the union/vertical projection of crowns, overlaps removed).
This is exactly why the naive `Σ crown / area × 100` summation was replaced by the
Crookston-Stage projected-cover model (see Recipe 2): applying the coefficient to naive
% would multiply it by the wrong quantity. **Proves it:** `simulate.py` multiplies by
`effective_new_pct`, which is a projected-cover delta — same quantity. ✓

**Second example — `LST_PER_PCT_UNSEALING = −0.03`:** Tervooren 2015 (Potsdam) is
calibrated at *district* scale. It is therefore **correctly NOT applied** per polygon
in `/simulate/wasser` (applying it to a single 1000 m² patch yields a physically
meaningless −0.006 °C). Correct handling = don't use it at the wrong scale.

**Disproves it:** the coefficient's source measures a different quantity (e.g. air
temperature, or a different spatial scale) than the code multiplies it by → do not use
it; see `rw-air-temperature-campaign` for the air-temp version of this trap.

---

## Recipe 2 — Derive projected canopy cover from scratch
**Goal:** be able to reproduce `projected_cover_pct` / `inverse_ratio` and the endpoint's
ΔLST by hand.

**Method:** `projected_cover = (1 − exp(−ratio)) × 100`, `ratio = Σ crown_area / area`.
Inverse: `ratio = −ln(1 − pct/100)`.

**Numeric-intuition table (hand-computed):**

| ratio | naive % | projected % = (1−e^−ratio)×100 |
|---|---|---|
| 0.3 | 30 | 25.9 |
| 0.5 | 50 | 39.3 |
| 1.0 | 100 | 63.2 |
| 2.0 | 200 (absurd) | 86.5 |
| 3.0 | 300 (absurd) | 95.0 |

**Worked example — reproduce `/simulate/baeume`** for 50 trees, 50 m²/tree, area
120,000 m², existing 0 %:
```
crown_total = 50 × 50            = 2500 m²
new_ratio   = 2500 / 120000      = 0.02083
total_ratio = 0 + 0.02083        = 0.02083
proj_cover  = (1 − e^−0.02083)×100 = 2.06 %   → effective_new_pct = 2.06
ΔLST        = −0.083 × 2.06       = −0.17 °C
co2         = 50 × 12.5           = 625 kg/yr
```
**Proves it:** matches the documented endpoint output in
`urban-heat-wiki/wiki/simulation-logic.md` (`effective_new_pct 2.06`,
`delta_lst_celsius −0.17`, `co2_kg_year 625`). ✓

---

## Recipe 3 — Reproduce the Rational-formula output by hand
**Goal:** verify `/simulate/wasser`.

**Method:** `infiltration_m3_year = max(0, area × 0.5735 × (Ψ_from − Ψ_to))`;
`context_persons = infiltration / 46.4`.

**Worked example — 1000 m² asphalt → schotterrasen:**
```
ΔΨ           = 0.90 − 0.30 = 0.60
infiltration = 1000 × 0.5735 × 0.60 = 344.1 m³/yr
persons      = 344.1 / 46.4          = 7.4
retention    = (1 − 0.30) × 100      = 70.0 %
```
**Proves it:** `test_simulate.py` pins 344.1 and derives it from `RUNOFF_COEFFICIENTS`
(asphalt 0.90, schotterrasen 0.30) × `ANNUAL_RAINFALL_WUERZBURG_M`. ✓
**Disproves it:** if `Ψ_to ≥ Ψ_from`, `delta ≤ 0` and the endpoint clamps to 0 with a
caveat — a positive infiltration for a *more*-sealed target would be a bug.

---

## Recipe 4 — Verify the Bayesian-shrinkage adjustment
**Goal:** reproduce `shrink_senior_rate` and the HVI.

**Method:** `adjusted = (n·observed + N_PRIOR·global) / (n + N_PRIOR)`, `N_PRIOR = 50`.
Then `hvi = (0.6·lst_norm + 0.4·adjusted)·9 + 1`.

**Worked example — small vs large cell (global = 0.22):**
```
n=3,   obs=1.0 : (3·1.0 + 50·0.22)/(3+50)   = 14/53  = 0.264   → collapses toward city mean
n=200, obs=0.30: (200·0.30 + 50·0.22)/(250)  = 71/250 = 0.284   → barely moved
```
> Note: the inline docstring example in `vuln_formula.py` rounds the first case to
> "≈0.24"; the exact value is **0.264**. That loose rounding in a comment is harmless,
> but it is exactly why you recompute rather than trust prose — the method is the point.

**Proves it:** a cell with 3 residents all 65+ no longer produces HVI = 10; it is pulled
to ~0.26 and yields a moderate HVI. This is the fix for the small-numbers problem
(`rw-failure-archaeology`). ✓

---

## Recipe 5 — Prove the grid join is sound
**Goal:** show the LST↔Zensus `.merge()` is exact, not approximate.

**Method:** both layers carry integer `x_mp_100m`/`y_mp_100m` midpoints in EPSG:3035,
snapped to the Destatis grid, so the merge is a key-equality join (the grid invariant,
`rw-architecture-contract`). Falsification = count non-matching keys.

**Worked check:** run `check_grid_alignment.py` (see `rw-diagnostics-and-tooling`) — do
not re-implement it here. **Proves it:** near-total overlap of Zensus keys into LST.
**Disproves it:** a spike in "Zensus-only" keys ⇒ the LST GeoTIFF was re-exported with a
different `crsTransform` and the merge is NaN-ing rows.

---

## Recipe 6 — Sensitivity / plausibility analysis
**Goal:** decide whether a claim survives the literature-transfer uncertainty
(Munich → Würzburg for the tree coefficient; Potsdam for unsealing).

**Method:** vary the coefficient by a defensible band (e.g. the coefficient's own range:
overall −0.069 vs mixed −0.083 vs recreational −0.038) and observe the output swing. If
the qualitative conclusion flips within that band, the claim is not robust and must be
labelled candidate (`rw-external-positioning`).

**Worked example:** the same 50-tree scenario at −0.038 vs −0.083 gives −0.08 °C vs
−0.17 °C — a >2× spread. A precise °C claim is therefore not defensible from a
transferred coefficient; a *directional* claim ("cooling on the order of tenths of a
degree") is. **Decides:** when uncertainty spans your claim, downgrade the claim.

---

## Recipe 7 — seal_pct Priority-Union by hand
**Goal:** verify a cell's `seal_pct` and understand why v2 replaced v1.

**Method:** for each m² of a cell, count it ONCE at the highest `seal_rate` of the
polygons covering it (rate groups descending, `difference()` against already-claimed
area). `seal_pct = Σ(claimed_area × rate) / 10000`.

**Worked example:** a cell fully covered by a parking polygon (0.95) that overlaps a
mixed-use polygon (0.65) over the same 4000 m²:
```
v2 (correct): 4000 m² counted once at 0.95 → 4000·0.95/10000 = 0.38
v1 (bug):     4000·0.95 + 4000·0.65 = 6400 → /10000 = 0.64 (double-counted)
```
**Proves it:** `test_seal_pct.py` pins the doppelzählung-regression value; heavily-
sealed cells (Marktplatz ≈0.786) no longer clamp to 1.0 (`rw-failure-archaeology`).

---

## When NOT to use this / use instead
- Run a ready-made measurement instead of hand-deriving → **rw-diagnostics-and-tooling**.
- The theory behind these formulas → **rw-geo-climate-reference**.
- Turn a proof into a regression test → **rw-validation-and-qa**.
- The overall evidence/adversarial-refutation bar → **rw-research-methodology**.
- Exact current coefficient values → **rw-config-and-coefficients**.

## Provenance and maintenance
Worked numbers hand-computed 2026-07-08 against the current coefficients
(−0.083, 50 m², 0.5735 m/yr, Ψ table, N_PRIOR 50). If any coefficient changes
(`rw-config-and-coefficients`), re-derive the affected recipe. Re-verify the endpoint
examples against `urban-heat-wiki/wiki/simulation-logic.md` and `backend/tests/test_simulate.py`.
