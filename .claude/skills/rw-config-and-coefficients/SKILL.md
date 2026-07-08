---
name: rw-config-and-coefficients
description: >-
  Catalog of every configuration axis and scientific coefficient in Resilientes
  Würzburg — tree-cooling / runoff / sealing / HVI coefficients, the frontend
  mirror (simulate.js + store) and its three-way hand-sync burden, cache-version
  constants, and env vars — with exact current values, sources, and applied-vs-unused
  status. LOAD THIS when you are about to add or change a coefficient in
  backend/simulation_params.py, a runoff/seal/rainfall value, an HVI weight or
  N_PRIOR in backend/utils/vuln_formula.py, a Zustand store default or map-layer
  toggle in frontend/src/store/useAppStore.js, a sim slider default, a cache-version
  constant (_BESTAND_MODEL_VERSION / _SEAL_MODEL_VERSION) in data_loader.py, or an
  env var (ALLOWED_ORIGINS / VITE_API_URL) — and whenever you need to look up "what
  is the current value of X and where does it come from". Triggers: LST_PER_PCT_*,
  CROWN_AREA_M2_DEFAULT, CO2_KG_PER_TREE_YEAR, RUNOFF_COEFFICIENTS, Ψ / Abflussbeiwert,
  SEAL_RATE_BY_TYPE, MIN_GROUND_PER_TREE_M2, WEIGHTS, N_PRIOR, ANNUAL_RAINFALL,
  MONTHLY_RAINFALL, TRANSPIRATION, LATENT_HEAT, CELL_AREA_M2.
---

# rw-config-and-coefficients

The single index of **every tunable number** in this project. In Resilientes
Würzburg there is no feature-flag system — the "flags" are (1) scientific
coefficients in `backend/simulation_params.py`, (2) the HVI formula constants in
`backend/utils/vuln_formula.py`, (3) their hand-maintained frontend mirrors, (4)
Zustand store defaults (layer visibility + sim sliders), (5) cache-version
constants, and (6) two env vars. This skill lists each with its **exact current
value, source, and status**, plus a checklist for changing one safely.

Values verified against the repo on **2026-07-08**. If a number here disagrees
with the code, the **code wins** — fix this skill and re-verify (see Provenance).

> **HARD RULE (CLAUDE.md):** Never invent a domain coefficient. Every scientific
> value is sourced in the wiki submodule FIRST (via its INGEST workflow), then
> copied into `simulation_params.py` with a source comment. See the checklist.

---

## 1. Coefficient catalog — `backend/simulation_params.py`

This file is the **single source of truth** for all simulation coefficients.
Never hardcode any of these elsewhere in the backend — `import` from here.

### 1a. Tree cooling → ΔLST (`/api/simulate/baeume`)
Source: `wiki/sources/garcia-de-leon-lst-trees-munich` — García de León et al.
(2025, JURSE), Munich, summer-2020 data, >166k trees, linear regression
(R² 0.41 Recreational – 0.61 Traffic).

| Constant | Value | Unit | Status | Note |
|---|---|---|---|---|
| `LST_PER_PCT_CANOPY_OVERALL` | `-0.069` | °C per 1 % canopy | **UNUSED** | whole-city coefficient, not selected |
| `LST_PER_PCT_CANOPY_MIXED` | `-0.083` | °C per 1 % canopy | **APPLIED** | endpoint uses this (`mixed`/residential land-use) |
| `LST_PER_PCT_CANOPY_RECREATIONAL` | `-0.038` | °C per 1 % canopy | **UNUSED** | recreational-area coefficient |
| `CROWN_AREA_M2_DEFAULT` | `50.0` | m² per tree | APPLIED | conservative mid-age default; mature Würzburg crowns 62–124 m² (Moser-Reischl 2021) — deliberately below to not overestimate young plantings |
| `CO2_KG_PER_TREE_YEAR` | `12.5` | kg CO₂/tree/yr | APPLIED | ⚠ **NOT yet ingested as a wiki page** — flagged "vor Produktionsrelease nachholen". Source: Dr. D. Klein, Uni Münster (mature beech, extrapolated). |

Δ°C is applied only to `effective_new_pct` (the real projected canopy increment),
not to a naive `Σ/area` percentage. See §1f for the projection helpers.

### 1b. Transpiration (reserved — the unbuilt air-temperature step)
Source: `wiki/sources/klimabaeume-fuer-die-stadt` — Stratopoulos/Le Chalony 2020
(TUM dissertation), nursery LB3/LB6 measurements.

| Constant | Value | Unit | Status |
|---|---|---|---|
| `TRANSPIRATION_LB3_KG_M2_DAY` | `0.19` | kg H₂O m⁻² d⁻¹ | **RESERVED** — moisture-adapted species |
| `TRANSPIRATION_LB6_KG_M2_DAY` | `0.17` | kg H₂O m⁻² d⁻¹ | **RESERVED** — drought-tolerant species (−11 %) |
| `LATENT_HEAT_KWH_PER_KG` | `0.628` | kWh per kg evaporated | **RESERVED** — 2260 kJ/kg ÷ 3600 |

These three feed no endpoint today. They are staged for the documented-but-unbuilt
"Schritt 3 Transpirationskühlleistung (kWh)" / air-temperature dimension. **Do not
wire transpiration into an LST endpoint** — LST ≠ Lufttemperatur are different
physical quantities (see the caveat banner in the app; route new work through
change control).

### 1c. Unsealing → water infiltration (`/api/simulate/wasser`)

| Constant | Value | Unit | Status |
|---|---|---|---|
| `LST_PER_PCT_UNSEALING` | `-0.03` | °C per 1 % unsealed | **EXISTS but deliberately UNUSED in v1** — Tervooren 2015 (Potsdam) is calibrated at district scale, invalid per-polygon. The Wasser sim returns **no** `delta_lst_celsius`. |
| `ANNUAL_RAINFALL_WUERZBURG_M` | `0.5735` | m/yr (573.5 mm) | APPLIED — DWD station 05705, ref period 1991–2020 |
| `CELL_AREA_M2` | `10_000` | m² | APPLIED — a 100×100 m cell |
| `DAILY_WATER_USE_L_PER_PERSON` | `127` | L/person/day | APPLIED — BDEW Wasserstatistik 2023 |
| `CONTEXT_PERSONS_M3_PER_YEAR` | `≈ 46.4` | m³/person/yr | APPLIED — derived: `127 × 365 / 1000` |

`MONTHLY_RAINFALL_WUERZBURG_MM` (dict, **RESERVED** for future seasonal sim):
`{1:40.0, 2:35.8, 3:40.2, 4:32.7, 5:57.3, 6:52.9, 7:65.8, 8:56.3, 9:47.2,
10:47.5, 11:46.2, 12:51.5}`.

Rational formula (in `routers/simulate.py`):
`infiltration_m3_year = max(0, area_m2 × 0.5735 × (Ψ_from − Ψ_to))`;
`retention_pct = (1 − Ψ_to) × 100`; `context_persons = infiltration / 46.4`.
Unknown surface key → **HTTP 422**.

### 1d. Runoff coefficients Ψ — `RUNOFF_COEFFICIENTS` (all 9)
Source: DWA-A138 / LfU Bayern (primary), Leitfaden Flächenentsiegelung Landkreis
Bayreuth 2024 (secondary). Ψ = share of rain that runs off (0 = all infiltrates,
1 = none).

| Key | Ψ | Source note |
|---|---|---|
| `asphalt` | `0.90` | DWA-A138 / LfU (was 0.95 in Bayreuth) |
| `pflaster_dicht` | `0.75` | DWA-A138 / LfU |
| `pflaster_offen` | `0.50` | DWA-A138 / LfU |
| `lehm_kies` | `0.40` | Bayreuth 2024 |
| `sickerpflaster` | `0.30` | Bayreuth 2024 (0.0–0.6, mid) |
| `schotterrasen` | `0.30` | DWA-A138 / LfU |
| `rasengitter` | `0.15` | DWA-A138 / LfU |
| `rasenwabe` | `0.15` | Bayreuth 2024 (>90 % green) |
| `rasendecke` | `0.05` | DWA-A138 / LfU (0.0–0.1, mid) |

### 1e. Sealing rates — `SEAL_RATE_BY_TYPE` (fraction sealed 0–1)
Source: literature (UBA Texte 141/2021 + Bayreuth 2024). Used by
`_compute_seal_pct` to weight each polygon's contribution to a cell's `seal_pct`.
Flat roofs (`osm_flat_roof_industrial`) are excluded entirely (no ground).

| Key | Rate |
|---|---|
| `osm_parking` | `0.95` |
| `osm_square` | `0.90` |
| `AX_Strassenverkehr` | `0.98` |
| `AX_Platz` | `0.88` |
| `AX_IndustrieUndGewerbeflaeche` | `0.80` |
| `AX_FlaecheGemischterNutzung` | `0.65` |
| `AX_Wohnbauflaeche` | `0.60` |
| `AX_FlaecheBesondererFunktionalerPraegung` | `0.60` |
| `AX_SportFreizeitUndErholungsflaeche` | `0.20` |
| `AX_Friedhof` | `0.20` |
| `_default` | `0.70` |

`plantable_m2 = 10_000 × (1 − seal_pct)` is computed **live in `routers/lst.py`**
(not stored in parquet). `n_trees_max = floor(plantable_m2 / MIN_GROUND_PER_TREE_M2)`.

### 1f. Overlap-model helpers (Crookston & Stage 1999)
The **only** definition of the canopy-projection forward/inverse formulas. Reused
by `data_loader._compute_bestand_pct`, `routers/simulate.py`, and the tests.
The frontend (`BaumSimPanel.jsx`) mirrors this formula independently.

- `projected_cover_pct(ratio) = (1 − exp(−ratio)) × 100`  where `ratio = Σ crown_area / area`
- `inverse_ratio(pct) = −ln(1 − pct/100)`  (clamps pct to ≤ 99.9 to avoid `log(0)`)

---

## 2. HVI / vulnerability constants — `backend/utils/vuln_formula.py`

The **only** authoritative source for the HVI formula. Changes here hit
`/api/vulnerability` and `/api/stadtbezirke` simultaneously (both go through
`analysis.build_hvi_geodataframe()` — never call `compute_hvi()` elsewhere).

| Constant | Value | Note |
|---|---|---|
| `WEIGHTS["lst_norm"]` | `0.6` | asserted to sum to 1.0 with the below |
| `WEIGHTS["anteil_65plus"]` | `0.4` | |
| `N_PRIOR` | `50` | Empirical-Bayes credibility threshold |
| HVI scale | `raw * 9 + 1` | maps `raw ∈ [0,1]` → HVI `1–10` |

`raw = 0.6 × lst_norm + 0.4 × anteil_65plus_adj`. `compute_hvi()` returns `None`
if either input is `NaN`/`None`. `lst_norm` is **rank-normalized** (scipy
`rankdata`, 0–1), not min-max. Shrinkage:
`adjusted = (n × observed + 50 × global_mean) / (n + 50)`, `global_mean` =
population-weighted city senior rate.

---

## 3. Frontend mirror & the three-way hand-sync

There is **no build-time sharing** between backend and frontend. The following
values are typed by hand into JS files and **MUST be kept identical to
`simulation_params.py` manually**. Three files carry copies:

**`frontend/src/utils/simulate.js`** (mirrors, exact current values):
- `SEAL_RATE` — full copy of `SEAL_RATE_BY_TYPE` (§1e)
- `RUNOFF_COEFFICIENTS` — full copy of §1d
- `CROWN_AREA_M2_DEFAULT = 50`
- `MIN_GROUND_PER_TREE_M2 = 100`  ← see drift note below
- `FROM_SURFACE_BY_TYPE_KEY`, `SURFACE_LABELS`, `SURFACE_ORDER` (9 stages,
  descending sealing), `getNextBetterSurface`, `getTypicalRealizationRate`
- `TYPICAL_REALIZATION_RATE` — **frontend-only** UI hint (not a hard cap, no
  backend counterpart); `_default 0.40`
- `WATER_USE_M3_PER_PERSON_YEAR = 127 * 365 / 1000` (≈ 46.4) — mirrors `CONTEXT_PERSONS_M3_PER_YEAR`

**`frontend/src/store/useAppStore.js`** (a *second* mirror of the sim constants):
- `_CROWN_AREA_M2 = 50`
- `_MIN_GROUND_PER_TREE_M2 = 100`
- `_CELL_AREA_M2 = 10_000`
- `_SEAL_RATE`, `_FROM_SURFACE`, `_SURFACE_ORDER` — copies again

> ⚠ **KNOWN DRIFT (as of 2026-07-08):** `MIN_GROUND_PER_TREE_M2 = 100` in the code
> (`simulate.js:92` and store line 6, FLL norm for 2nd-order trees, raised from 25
> in commit `ae01838`). **CLAUDE.md and `docs/handoff-baumscheiben.md` still say
> 25 — those docs are STALE. The code value (100) is correct.** Do not "fix" the
> code to match the docs; fix the docs.

### Store map-layer defaults (`layers`, true = visible)
These are UI defaults, not scientific — but they are config and live here:

| Layer key | Default |
|---|---|
| `heatmap` | `true` |
| `trees` | `false` |
| `zensus` | `false` |
| `vulnerabilitaet` | `true` |
| `entsiegelung_atkis` | `true` |
| `entsiegelung_osm` | `true` |
| `stadtbezirke` | `false` |
| `ndvi` | `false` |

### Store sim defaults (`sim`)
- `showBaumkataster: true`, `showSimLst: true`, `showSimAtkis: false`
- `baeume.anzahl: 100` (tree-count slider default)
- `wasser.flaeche_m2: 1000` (area slider default; capped to `Σ area × seal_rate`)
- `_baeumeSliderMax(area) = floor(area / _MIN_GROUND_PER_TREE_M2)` — a coarse
  pre-cap on full area; the seal-aware final clamp happens in `BaumSimPanel.jsx`.

---

## 4. Cache-version constants — `backend/utils/data_loader.py`

Two integer constants gate whether a cached derived column in `lst.parquet` gets
recomputed:

| Constant | Value | Guards column |
|---|---|---|
| `_BESTAND_MODEL_VERSION` | `2` | `bestand_pct` (1 = naive Σ/10.000 clip, 2 = Crookston-exp) |
| `_SEAL_MODEL_VERSION` | `2` | `seal_pct` / `dominant_type_key` (1 = naive sum, 2 = Priority-Union) |

**What bumping does:** `load_lst()` stamps these onto the parquet
(`_bestand_model_version` / `_seal_model_version` columns). On the next read it
recomputes the column **only if the stored version is below the module constant**.

⚠ **TRAP:** If you change the *content of a formula* inside `_compute_bestand_pct`
or `_compute_seal_pct` **without** bumping the constant, the stale cache is **not**
corrected (only missing columns are lazy-added; existing columns are trusted). So
after editing either function: **bump the version constant, OR delete
`backend/data/lst.parquet`, OR call the endpoint with `?refresh=true`.** When the
LST GeoTIFF itself is swapped, you must delete `lst.parquet` AND restart the
backend (clears in-memory caches of /lst, /vulnerability, /zensus, /stadtbezirke,
/hotspots), then re-hit those with `?refresh=true`.

---

## 5. Environment variables

| Var | Where | Local default | Note |
|---|---|---|---|
| `ALLOWED_ORIGINS` | backend (`main.py`, read via `os.getenv`) | `http://localhost:5173` | comma-split into CORS `allow_origins` |
| `VITE_API_URL` | frontend (`import.meta.env`, `api/client.js`) | set in `frontend/.env.local` | base URL for `apiFetch` |

**Production values are deployment-owned and OFF-LIMITS.** `render.yaml` sets
`ALLOWED_ORIGINS = https://resilientes-wuerzburg.vercel.app` and
`PYTHON_VERSION = 3.11.0`. Do not edit `render.yaml`, Render/Vercel settings, or
production env vars without explicit owner sign-off — route through
**rw-change-control**. Never hardcode secrets; never commit `.env`.

---

## 6. Checklist — how to add or change a coefficient

Do these **in order**. Skipping step 1 or 4 is the most common cause of a broken
or scientifically-indefensible change.

1. **Source it in the wiki FIRST.** Add/update the source page via the wiki's
   INGEST/UPDATE workflow (`urban-heat-wiki/CLAUDE.md`, which also updates
   `index.md` + `log.md`). **Never hand-edit wiki pages.** No wiki source → do not
   add the number. (Exception already in tree: `CO2_KG_PER_TREE_YEAR` is flagged
   as not-yet-ingested — match that flag if you must ship un-sourced.)
2. **Add to `backend/simulation_params.py`** (or `vuln_formula.py` for HVI) with a
   `# Source:` comment pointing at the wiki page. This is the canonical home.
3. **Mirror into the frontend if the UI uses it** — update BOTH
   `frontend/src/utils/simulate.js` AND `frontend/src/store/useAppStore.js` to the
   identical value (§3). If the value is backend-only (e.g. it only affects an
   endpoint response), skip this — but confirm no panel reads it.
4. **If it changes a cached derived column** (`bestand_pct` / `seal_pct`), bump the
   matching version constant in `data_loader.py` (§4) OR document a `?refresh=true`
   / delete-`lst.parquet` step. Otherwise old caches silently keep old numbers.
5. **Update tests** — the sim/HVI/seal tests assert specific numbers
   (`backend/tests/test_simulate.py`, `test_vuln_formula.py`, `test_seal_pct.py`,
   `test_bestand_pct.py`). Run `cd backend && <conda-python> -m pytest tests/`.
6. **Update `docs/Dokumentation.md`** (the current doc of record) — the coefficient
   tables there must reflect the new value + source.
7. **Route the change through rw-change-control** — coefficient changes are
   scientific-defensibility gated.

---

## 7. When NOT to use this / use instead

- **To understand what a coefficient MEANS** (the physics, the study, why −0.083
  and not −0.069, LST vs air temperature) → use **rw-geo-climate-reference**. This
  skill only tells you the *value, location, and status*.
- **To get sign-off before shipping a coefficient change** → **rw-change-control**
  (the gate). This skill is the catalog; it does not authorize edits.
- **Why the three-way sync burden exists at all** (backend ↔ simulate.js ↔ store)
  and the endpoint/grid contracts → **rw-architecture-contract**.
- **Editing the wiki / sourcing a new study** → the wiki submodule's own
  `CLAUDE.md` INGEST workflow — never hand-edit wiki pages.

---

## 8. Provenance and maintenance

Volatile facts are date-stamped **2026-07-08**. Re-verify with:

```bash
# List every backend coefficient with its value
grep -nE '^[A-Z_]+ *[:=]' backend/simulation_params.py

# Diff the seal rates: backend vs the two frontend mirrors (values must match)
grep -oE "'AX_[A-Za-z]+': *0\.[0-9]+" frontend/src/utils/simulate.js
grep -oE "'AX_[A-Za-z]+': *0\.[0-9]+" frontend/src/store/useAppStore.js
grep -nE 'AX_[A-Za-z]+' backend/simulation_params.py

# Confirm the MIN_GROUND drift: code says 100 (docs say 25 — docs are stale)
grep -rn 'MIN_GROUND_PER_TREE_M2' frontend/src backend docs

# HVI constants
grep -nE 'WEIGHTS|N_PRIOR|\* 9 \+ 1' backend/utils/vuln_formula.py

# Cache-version constants
grep -nE '_(BESTAND|SEAL)_MODEL_VERSION' backend/utils/data_loader.py

# Env vars
grep -n 'ALLOWED_ORIGINS' backend/main.py render.yaml
grep -rn 'VITE_API_URL' frontend/src
```

**Known drift to watch (do not silently propagate):**
- `MIN_GROUND_PER_TREE_M2`: code = **100**, CLAUDE.md & `docs/handoff-baumscheiben.md`
  = 25 (stale). Code wins.
- `CO2_KG_PER_TREE_YEAR = 12.5` is **not yet wiki-sourced** — ingest before
  production release.
- `LST_PER_PCT_UNSEALING` and the `TRANSPIRATION_*` / `LATENT_HEAT` constants exist
  but feed no endpoint (reserved). If a future session wires them in, update the
  status column in §1b/§1c.
