---
name: rw-research-frontier
description: >-
  The open problems where Resilientes Würzburg could advance beyond its current
  state — each with why the current approach falls short, the repo's specific
  asset, the first three concrete steps IN THIS REPO, and a falsifiable "you have
  a result when…" milestone. LOAD THIS when planning a research extension, scoping
  a thesis-grade contribution, or answering "what should we build/improve next".
  Triggers: "what next", "research direction", "open problem", "extend the app",
  "thesis contribution", "local calibration", "Würzburg calibration", "Variante B",
  "per-cell sealing", "GHSL", "delta analysis", "temporal warming", "combined
  simulation", "district unsealing", "soil infiltration", "advance the state of
  the art". NOT the executable plan for the flagship air-temp problem
  (rw-air-temperature-campaign), NOT how to turn a hunch into an accepted result
  (rw-research-methodology), NOT the settled/stalled history (rw-failure-archaeology).
---

# rw-research-frontier

Open problems ranked-ish by defensibility × repo-asset-readiness. Each is stated so a
mid-level engineer or a cheaper model can start it without re-discovering context. None
is proven — everything here is OPEN or STALLED. Any coefficient that results must go
through wiki-INGEST + `rw-change-control` + `rw-validation-and-qa`; nothing is claimable
until it clears `rw-external-positioning`.

Format per problem: **Problem → Why current approach is insufficient → Repo's asset →
First 3 steps → Falsifiable milestone → Status → Cross-link.**

---

## F1 — Air-temperature / transpiration cooling dimension  ★ flagship
- **Problem:** the app models only surface temperature (LST); trees also cool AIR via
  transpiration, which the app cannot express.
- **Why insufficient:** LST ≠ air temperature; the LST coefficient cannot be reused for
  air (`rw-geo-climate-reference`).
- **Asset:** `TRANSPIRATION_LB3/LB6_KG_M2_DAY`, `LATENT_HEAT_KWH_PER_KG`, the documented-
  but-unbuilt "Schritt 3 Transpirationskühlleistung (kWh)" in `simulation-logic.md`.
- **First 3 steps + full executable plan:** delegated — see **rw-air-temperature-campaign**
  (do not duplicate its phases here).
- **Milestone:** a reproducible air-temp/transpiration output, source-traced and test-
  pinned, presented without conflating LST and air temperature.
- **Status:** OPEN (owner's #1 priority, 2026-07-08).

## F2 — Local Würzburg calibration of the tree-cooling coefficient ("Variante B")
- **Problem:** the applied −0.083 °C/% is transferred from Munich (García de León), not
  fitted to Würzburg.
- **Why insufficient:** R² ≈ 0.41–0.61 and a different city; the number is defensible as
  a transfer but not as *local* accuracy (`rw-external-positioning`).
- **Asset:** the harmonized LST↔Zensus 100 m grid, `bestand_pct` already computed as
  *projected* canopy cover (Crookston-Stage — the same quantity García de León used), and
  the 44,647-tree cadastre with `kronenbrei`.
- **First 3 steps:** (1) assemble per-100 m-cell pairs of `lst_celsius` (or a
  temperature anomaly) vs `bestand_pct` from `lst.parquet`; (2) regress LST on projected
  canopy cover (controlling for confounders as data allows) — keep the predictor as
  projected cover to stay consistent with the model; (3) ingest the derived coefficient +
  CI into the wiki, then (only after review) update `simulation_params.py`.
- **Milestone:** a Würzburg-derived °C/% with a confidence interval that either confirms
  −0.083 (overlapping CI) or replaces it — projected-cover-consistent, test-pinned.
- **Status:** OPEN. Cross-link: `docs/tree-sim-upgrade.md` (§ "Variante B"),
  `wiki/simulation-logic.md` "Offene Verbesserungen" #1.

## F3 — Per-cell sealing from GHSL (replace the type-lookup)
- **Problem:** `seal_pct` uses `SEAL_RATE_BY_TYPE` literature values per ATKIS/OSM type,
  not a measured continuous sealing fraction.
- **Why insufficient:** a type→rate lookup is coarse; two "Wohnbaufläche" cells get the
  same 0.60 regardless of actual built density.
- **Asset:** the v2 TODO already scoped in `simulation_params.py` (`# v2 (TODO): gemessene
  Per-Zellen-Versiegelung`) and the GHSL layer named in CLAUDE.md
  (`JRC/GHSL/P2023A/GHS_BUILT_S`); the existing GEE export tooling.
- **First 3 steps:** (1) export GHSL built-up fraction for Würzburg on the same 100 m
  EPSG:3035 grid (mirror the LST export transform to preserve the grid invariant);
  (2) sample it per cell into a candidate `seal_pct_measured` column behind a cache-
  version bump; (3) compare against the type-lookup `seal_pct` (agreement stats,
  scatter) before deciding to switch.
- **Milestone:** a measured per-cell `seal_pct` with agreement statistics vs the lookup,
  and a documented decision to adopt or reject.
- **Status:** OPEN. Cross-link: `simulation_params.py` v2 comment; CLAUDE.md data table.

## F4 — Delta-analysis: temporal warming (baseline 2014–16 vs current 2023–25)
- **Problem:** the app shows a single-period LST snapshot, not the change over time.
- **Why insufficient / STALLED:** a WIP implementation exists but has **striping +
  NoData artifacts** (unmerged commit `17d9fa2` on `feature/delta-analyse`).
- **Asset:** the data is already exported — `lst_delta.parquet`,
  `lst_wuerzburg_baseline_2014_2016.tif`, `lst_wuerzburg_current_2023_2025.tif` in
  `backend/data/`.
- **First 3 steps:** (1) reproduce the striping on the branch and characterise it
  (sensor/scene-line pattern? QA-mask gaps? cross-sensor Landsat 8 vs 9 offset?);
  (2) isolate the NoData handling in the delta computation (per-cell validity of BOTH
  periods before differencing); (3) fix the root cause, then validate the ΔLST map
  against known warm/cool areas.
- **Milestone:** a clean per-cell ΔLST map with striping/NoData resolved AND a documented
  root cause (not a cosmetic mask).
- **Status:** STALLED. Cross-link: `rw-failure-archaeology` (entry: delta-analyse),
  `rw-debugging-playbook` (hotspot striping is a related NoData failure mode).

## F5 — Combined tree+unsealing simulation & district-level unsealing Δ°C
- **Problem:** simulations are separate; and the unsealing Δ°C is deliberately unshown.
- **Why insufficient:** `LST_PER_PCT_UNSEALING = −0.03` is calibrated at *district*
  scale, so it is correctly not applied per polygon — but that means the app currently
  shows NO temperature benefit for unsealing at all.
- **Asset:** the coefficient exists; the Stadtbezirke aggregation already computes
  per-district areas.
- **First 3 steps:** (1) define unsealing % relative to a *reference area* (a
  Stadtbezirk); (2) compute Δ°C = −0.03 × unsealing_pct as a **district KPI** (not per
  polygon); (3) present it distinctly with its scale caveat.
- **Milestone:** a district-scale unsealing Δ°C KPI that respects the calibration scale,
  plus (optionally) a combined tree+unsealing scenario.
- **Status:** OPEN. Cross-link: `wiki/simulation-logic.md` "Offene Verbesserungen" #3/#4.

## F6 — Local soil infiltration (LfU Bayern kf-values)
- **Problem:** the Rational formula uses flat literature runoff coefficients, ignoring
  local soil permeability.
- **Why insufficient:** infiltration depends on soil type; a uniform Ψ overstates
  precision.
- **Asset:** the LfU Bayern soil WFS is named as a data source in CLAUDE.md; the Rational
  pipeline is already in place.
- **First 3 steps:** (1) obtain LfU soil-type / kf-value polygons for Würzburg;
  (2) join per unsealing polygon; (3) refine Ψ (or add a soil factor) with sourced values
  via wiki-INGEST.
- **Milestone:** per-soil-type Ψ that measurably improves on the flat DWA table for at
  least the mapped soil classes.
- **Status:** OPEN. Cross-link: `wiki/sources/dwa-a138-lfu-regenwasser-bayern.md`.

---

## How to pick one
Rank by **defensibility × repo-asset-readiness**. F4 has the most data ready (but is a
debugging slog); F1 is the owner's priority; F2 is the highest scientific payoff for the
"local calibration" claim gate. Whatever you pick: coefficients go through wiki-INGEST,
the change through `rw-change-control`, the evidence through `rw-validation-and-qa`, and
no external claim before `rw-external-positioning`.

## When NOT to use this / use instead
- The executable, phase-gated plan for F1 → **rw-air-temperature-campaign**.
- The discipline that turns a hunch into an accepted result → **rw-research-methodology**.
- What has already been tried/settled → **rw-failure-archaeology**.
- Hand-verifying the numbers a result needs → **rw-proof-and-analysis-toolkit**.

## Provenance and maintenance
Open-problem list compiled 2026-07-08 from `urban-heat-wiki/wiki/simulation-logic.md`
("Offene Verbesserungen"), the `# v2 (TODO)` comments in `backend/simulation_params.py`,
and `docs/tree-sim-upgrade.md`. Re-check status:
`grep -n "TODO\|Offene Verbesserungen\|v2" backend/simulation_params.py urban-heat-wiki/wiki/simulation-logic.md`
and `git log --oneline feature/delta-analyse` (is it merged yet?).
