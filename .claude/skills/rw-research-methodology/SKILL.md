---
name: rw-research-methodology
description: >-
  The discipline that turns a hunch into an ACCEPTED result in Resilientes
  Würzburg — the evidence bar, the hypothesis-predicts-numbers rule, the idea
  lifecycle from experiment to adopted change or documented retirement, and where
  good ideas have historically come from. LOAD THIS when starting an investigation,
  proposing a model/coefficient/formula change, weighing competing explanations for
  an observation, or deciding whether a finding is solid enough to adopt. Triggers:
  "is this result solid", "how do I know I'm right", "hypothesis", "evidence bar",
  "adversarial", "refute", "competing explanation", "should we adopt this", "retire
  this idea", "experiment flag", "research process", "before I claim". NOT the list
  of open problems (rw-research-frontier), NOT the executable air-temp plan
  (rw-air-temperature-campaign), NOT the acceptance-test mechanics (rw-validation-
  and-qa), NOT hand-derivation recipes (rw-proof-and-analysis-toolkit).
---

# rw-research-methodology

How a claim earns the right to change this project. The bar is **scientific
defensibility** (owner, 2026-07-08): every accepted result must be reproducible and
traceable to a source, and no result is judged "by eye". This skill is the connective
tissue between `rw-research-frontier` (what to investigate),
`rw-proof-and-analysis-toolkit` (how to verify a number), and `rw-change-control` /
`rw-validation-and-qa` (the gates a result passes through).

## The evidence bar (all four must hold)

1. **One mechanism explains ALL observations — including the negatives.** A fix that
   explains the symptom but contradicts a passing test, a known-good cell, or a caveat is
   not accepted. Example: the seal_pct Priority-Union was accepted because it explained
   BOTH the Marktplatz over-clamp AND left low-sealing cells unchanged
   (`rw-failure-archaeology`).
2. **The hypothesis predicts the number BEFORE you run it.** Write down the expected
   value (with its assumption) first; then compute. A number you only rationalise
   afterward is not evidence. See `rw-proof-and-analysis-toolkit` for how to derive the
   prediction.
3. **It survives assigned adversarial refutation.** Before adopting, actively try to
   break it: wrong CRS? stale cache masking the real value? coefficient applied to the
   wrong quantity or scale? a confounder? If you cannot find a killer after a genuine
   attempt, the result is stronger. (Most historical bugs here were quantity/scale/cache
   mismatches — attack those first.)
4. **It reproduces.** Delete the relevant cache, `?refresh=true`, re-run — same number
   (`rw-run-and-operate`); and it is pinned by a test (`rw-validation-and-qa`).

If any one fails, the idea stays a **candidate**, not an accepted result, and may not be
claimed externally (`rw-external-positioning`).

## Hypothesis → numbers, not adjectives

State the expected magnitude, not a direction word. "Trees cool a bit" is untestable;
"50 trees on 120,000 m² → effective_new_pct ≈ 2.1 % → ΔLST ≈ −0.17 °C" is falsifiable
and matches the endpoint. Quantify the uncertainty too (Recipe 6 in
`rw-proof-and-analysis-toolkit`): if a defensible coefficient band flips your
conclusion, the conclusion is not yet a result.

## The idea lifecycle

```
hunch / frontier item (rw-research-frontier)
   │  predict numbers (hypothesis)
   ▼
experiment  ── source it first via wiki INGEST (never invent a coefficient)
   │          run behind an experiment flag / candidate column
   │          (e.g. a new cache column behind a version bump, or a candidate
   │           coefficient not yet applied)
   ▼
verify  ── rw-proof-and-analysis-toolkit (hand-derive) + rw-diagnostics-and-tooling (measure)
   │        meet all four evidence-bar tests
   ▼
gate  ── rw-change-control (coefficient/formula gate) + rw-validation-and-qa (pin the number)
   │
   ├─► ADOPT: land the change, bump the cache version if a derived column changed,
   │          update docs (rw-docs-and-writing), then it may be claimed
   │          (rw-external-positioning)
   │
   └─► RETIRE: if it fails the bar, document WHY in rw-failure-archaeology so no one
              re-fights it. A documented dead end is a real deliverable.
```

**Experiment flags in this project** are lightweight: a candidate coefficient added to
`simulation_params.py` but not yet applied; a new derived column gated behind a
`_*_MODEL_VERSION` bump so it recomputes without silently corrupting the old one; a
separate output field kept distinct from the production one (as the air-temp campaign
requires). There is no feature-flag framework — separation + version constants are the
mechanism.

## Where good ideas have historically come from

- **Calibration-basis scrutiny.** The biggest correctness wins came from asking "is this
  coefficient applied to the exact quantity it was fitted against?" → the Crookston-Stage
  projected-cover switch, and the decision NOT to apply the district-scale unsealing
  coefficient per polygon.
- **Small-numbers / statistical honesty.** The Bayesian-shrinkage HVI came from noticing
  a 3-resident cell producing HVI 10.
- **Grid/units discipline.** The EPSG:3035 re-export (grid harmonization) and the removal
  of the cos(lat) correction came from taking coordinate systems literally.
- **The wiki as a forcing function.** Requiring a cited source before a coefficient enters
  the code repeatedly caught invented or mis-scaled numbers.

Pattern: the wins are almost never new algorithms — they are *consistency* fixes
(quantity, scale, units, cache). Look there first.

## Anti-patterns (each a settled lesson)
- Judging a map "looks right" and shipping (banned — not evidence).
- Inventing a coefficient because a plausible one is needed now (violates
  `rw-change-control`; the air-temp campaign exists precisely to avoid this).
- Fixing a symptom while a test/known-good case still contradicts the fix.
- Changing a cached formula without a version bump (the stale-cache trap).

## When NOT to use this / use instead
- WHICH problem to work on → **rw-research-frontier**.
- The step-by-step for the flagship air-temp problem → **rw-air-temperature-campaign**.
- Mechanics of writing/running the pinning test → **rw-validation-and-qa**.
- Hand-deriving the predicted number → **rw-proof-and-analysis-toolkit**.
- Recording a retired idea → **rw-failure-archaeology**.

## Provenance and maintenance
Distilled 2026-07-08 from the project's actual investigation history (git log + docs +
wiki `log.md`) and the owner's scientific-defensibility bar. The lifecycle references the
cache-version mechanism in `backend/utils/data_loader.py` and the wiki INGEST workflow in
`urban-heat-wiki/CLAUDE.md`; re-verify those still exist if this skill feels stale.
