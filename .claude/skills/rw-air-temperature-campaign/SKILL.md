---
name: rw-air-temperature-campaign
description: >-
  Executable, decision-gated campaign to add an AIR-TEMPERATURE / transpiration
  cooling dimension to Resilientes Würzburg ALONGSIDE the existing surface-
  temperature (LST) model — the project's hardest live problem. LOAD THIS when
  working on air temperature, transpiration / evapotranspiration cooling, latent-
  heat cooling, a "second cooling model", the unbuilt kWh transpiration step, or
  any "the app only does LST, extend it" task. Triggers: "air temperature",
  "Lufttemperatur", "transpiration", "evapotranspiration", "Verdunstungskühlung",
  "latent heat", "kWh cooling", "second cooling model", "cooling_kwh_year",
  TRANSPIRATION_LB3/LB6, LATENT_HEAT_KWH_PER_KG. NOT the broad open-problem list
  (rw-research-frontier), NOT the LST-vs-air theory itself (rw-geo-climate-
  reference), NOT the gate paperwork (rw-change-control / rw-validation-and-qa).
---

# rw-air-temperature-campaign

**Goal:** add a defensible air-temperature / transpiration-cooling dimension to the
app without conflating it with the LST model. This is a campaign, not a patch — work
the phases in order, stop at each gate, and route promotion through change control.
Success is a reproducible number traceable to a cited source and pinned by a test —
never a value that "looks reasonable".

## The core hazard (read first — this is why the campaign exists)

**Land Surface Temperature (LST) ≠ 2 m air temperature.** LST is the radiometric skin
temperature of the ground/roofs/canopy from Landsat's thermal band; air temperature is
what a person feels at 2 m. They are *different physical quantities with different
calibration bases* (details in `rw-geo-climate-reference`). The whole app today models
LST only, and the standing UI caveat "LST ≠ Lufttemperatur" exists precisely because
transpiration cools the AIR more than it cools the skin.

> **Fenced wrong path #1 (most important):** the García de León coefficient
> `LST_PER_PCT_CANOPY_MIXED = −0.083 °C/%` is calibrated against LST. **Never reuse it
> for air temperature.** Doing so is a units/quantity mismatch that silently fabricates
> a result. An air-temperature effect needs its OWN sourced coefficient or its OWN
> derivation.

## Phase 0 — Grounding (NO code)

You may not invent a coefficient (hard project rule; see `rw-change-control`). Before
touching any code, get the science into the wiki via its INGEST workflow
(`urban-heat-wiki/CLAUDE.md`) — never hand-edit the wiki.

Actions:
1. Search the existing wiki for air-temp / evapotranspiration cooling
   (`urban-heat-wiki/wiki/concepts/evapotranspiration.md`, `land-surface-temperature.md`,
   `green-infrastructure.md`) and the transpiration source
   (`klimabaeume-fuer-die-stadt`).
2. Find at least one *citable* quantity: either (a) an empirical air-temperature-per-
   canopy coefficient with its study context, or (b) a transpiration→cooling energy
   pathway you can defend. Ingest it via the wiki INGEST workflow.

**GATE 0:** you have ≥1 citable air-temp or transpiration-cooling quantity with a
recorded study context in the wiki.
→ *If not:* STOP. Ask the owner for a source. Do not proceed on a guessed number.

## Phase 1 — Assets inventory (confirm what already exists)

The repo already carries reserved, currently-UNUSED assets for this exact expansion:

| Asset | Value | Location |
|---|---|---|
| `TRANSPIRATION_LB3_KG_M2_DAY` | 0.19 kg H₂O m⁻² d⁻¹ (moisture-adapted) | `backend/simulation_params.py` |
| `TRANSPIRATION_LB6_KG_M2_DAY` | 0.17 kg H₂O m⁻² d⁻¹ (drought-tolerant) | same |
| `LATENT_HEAT_KWH_PER_KG` | 0.628 kWh/kg (2260 kJ/kg ÷ 3600) | same |
| `MONTHLY_RAINFALL_WUERZBURG_MM` | 12-month table | same (for seasonality) |
| Documented-but-unbuilt "Schritt 3 Transpirationskühlleistung (kWh)" | — | `urban-heat-wiki/wiki/simulation-logic.md` |

Source of the transpiration rates: Stratopoulos/Le Chalony 2020 (TUM dissertation),
nursery measurements of tree classes LB3/LB6.

**GATE 1:** the constants above still exist.
→ Verify: `grep -n "TRANSPIRATION_LB\|LATENT_HEAT_KWH" backend/simulation_params.py`
→ *If a constant is gone/renamed:* update this skill and reconcile with
`rw-config-and-coefficients` before continuing.

## Phase 2 — Solution menu (ranked by defensibility × effort)

Each option lists its derivation obligation, the files it touches, the expected output
shape, and its fenced wrong path. Pick the highest-defensibility option your Phase-0
evidence supports.

### Option A — Latent-heat / energy-balance path (recommended first)
Compute a physically clean **energy** number, and only convert to °C_air through an
explicit, sourced assumption.

```
cooling_kwh_year = n_trees × CROWN_AREA_M2_DEFAULT × transpiration_rate × 365 × LATENT_HEAT_KWH_PER_KG
#   transpiration_rate ∈ {TRANSPIRATION_LB3, TRANSPIRATION_LB6}
```
- **Derivation obligation:** a kWh/year figure is directly defensible from the
  constants. To express it as a ΔT_air you MUST state the mixing volume / energy-balance
  assumption explicitly and cite it — do not divide your way to a °C and hide the
  assumption.
- **Expected magnitude:** report kWh (and optionally L H₂O transpired) as the primary,
  safe output. A °C_air claim is *secondary* and only appears with its assumption shown.
- **Files:** the endpoint math belongs in `routers/simulate.py` (a new output field on
  `/simulate/baeume`, or a new `/simulate/luft` endpoint); any new coefficient goes in
  `simulation_params.py` with a source comment; mirror into
  `frontend/src/utils/simulate.js` if the UI shows it (the three-way sync burden —
  `rw-config-and-coefficients`); add a distinct caveat block.
- **Fenced wrong path:** presenting `cooling_kwh_year` AS a °C without the sourced
  conversion.

### Option B — Empirical air-temp-per-canopy coefficient (if Phase 0 found one)
Mirror the LST pipeline but with a *separate* AIR coefficient applied to the same
projected canopy cover (`effective_new_pct` from the Crookston-Stage model).
- **Derivation obligation:** show the source study, its scale, and that it measures AIR
  temperature; give it its own caveat set (climate transfer, R², scale).
- **Files:** new `LST_PER_PCT_CANOPY_AIR`-style constant in `simulation_params.py`
  (name it so no one confuses it with the LST coefficient); new output field; frontend
  mirror; caveat.
- **Fenced wrong path:** reusing the −0.083 LST value; omitting that this is air, not skin.

### Option C — Physical microclimate model (ENVI-met / WRF)
Highest fidelity, heaviest effort.
- **Status:** research-only, **out of scope for the web app.** Note it as a frontier
  item (`rw-research-frontier`); do not wire a microclimate simulator into the FastAPI
  service.

## Fenced wrong paths (all options)
1. Reusing the LST coefficient (−0.083) for air temperature.
2. Presenting kWh as °C without a sourced conversion assumption.
3. Inventing a transpiration→°C factor (violates the no-invented-coefficients rule).
4. Editing the wiki by hand instead of via INGEST.
5. Dropping the "LST ≠ Lufttemperatur" distinction from the output/UI — the two models
   must stay visibly separate so no reader conflates skin and air cooling.

## Validation & promotion protocol

1. **Predict before you run:** write down the expected number (and its assumption)
   BEFORE executing — hypothesis predicts numbers (`rw-research-methodology`).
2. **Keep dimensions separate:** the air-temp output must be a distinct field/endpoint
   with its own caveats; never overwrite or merge with `delta_lst_celsius`.
3. **Pin it with a test:** add a test that encodes the expected number
   (`rw-validation-and-qa`); a coefficient/formula change without a pinning test is not
   done.
4. **Route the gates:** coefficient goes wiki-INGEST → `simulation_params.py` (sourced)
   → frontend mirror → change-control review (`rw-change-control`).
5. **Reproducible:** deleting caches + refresh + re-run yields the same number.

**You have a result when…** there is a reproducible air-temperature / transpiration
output where every number traces to a cited wiki source, a passing test pins it, and it
is presented WITHOUT conflating LST and air temperature (kWh-first if you took Option A;
a clearly-labelled AIR coefficient if Option B).

## When NOT to use this / use instead
- The broader menu of open problems (calibration, GHSL sealing, delta-analysis) →
  **rw-research-frontier**.
- The LST-vs-air-temperature science → **rw-geo-climate-reference**.
- Hand-deriving/validating the numbers → **rw-proof-and-analysis-toolkit**.
- The change gate and evidence bar → **rw-change-control** / **rw-validation-and-qa**.

## Provenance and maintenance
Owner-flagged as the hardest live problem, interview 2026-07-08. Re-verify assets:
`grep -n "TRANSPIRATION_LB\|LATENT_HEAT_KWH\|MONTHLY_RAINFALL" backend/simulation_params.py`.
Check whether an air-temperature endpoint/coefficient has since been added:
`grep -rn "luft\|air\|CANOPY_AIR" backend/routers backend/simulation_params.py` — if so,
this campaign is partly executed and the skill should be updated to reflect it.
