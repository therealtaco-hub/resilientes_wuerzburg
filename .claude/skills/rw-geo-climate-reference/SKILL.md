---
name: rw-geo-climate-reference
description: >
  Domain-theory knowledge pack for Resilientes Würzburg — the geospatial and
  urban-climate science behind the app's numbers, scoped to how THIS codebase uses
  it. Load this when you need to understand WHY a number is what it is, before you
  touch geo/climate logic: LST vs. air temperature (the standing "LST ≠ Lufttemperatur"
  caveat), Landsat 8+9 thermal remote sensing / summer-median compositing / NDVI /
  NDBI, CRS & EPSG choices (3035 LAEA vs. 25832 UTM32N vs. 4326 WGS84 vs. CRS84) and
  why metric area needs a projected CRS, canopy cover vs. canopy closure and the
  Crookston-Stage negative-exponential overlap model, impervious surface / seal_pct /
  runoff coefficient Ψ / the Rational formula, and the vulnerability statistics
  (rank normalization, weighted HVI index, Empirical-Bayes / Bayesian shrinkage).
  Triggers: LST, land surface temperature, Lufttemperatur, air temperature,
  transpiration, EPSG, CRS, projection, 3035, 25832, 4326, LAEA, UTM, NDVI, NDBI,
  Landsat, canopy cover, Kronendeckung, Crookston, Stage, overlap model, runoff
  coefficient, Abflussbeiwert, Rational formula, seal_pct, Versiegelung, rank
  normalization, rankdata, Bayesian shrinkage, Empirical Bayes, N_PRIOR, HVI.
  NOT for the exact coefficient VALUES (use rw-config-and-coefficients) or the grid/CRS
  invariant contract (use rw-architecture-contract) — this explains the science, they
  hold the numbers and the rules.
---

# rw-geo-climate-reference — the science behind the numbers

**What this is.** The urban-climate + geospatial theory a mid-level engineer (or a
Sonnet-class model) needs to reason correctly about *Resilientes Würzburg*, grounded in
**how this app actually uses each concept** — not a textbook. Read a section before you
change any code that computes, transforms, or interprets a geo/climate number.

**What this is NOT.**
- Need the *exact value* of a coefficient (−0.083, Ψ=0.90, N_PRIOR=50, …)? → **rw-config-and-coefficients** (single source: `backend/simulation_params.py`, `utils/vuln_formula.py`).
- Need the *grid/CRS invariant* and cache rules (why `pd.merge` not `sjoin`, when to delete `lst.parquet`)? → **rw-architecture-contract**.
- Need to *verify a coefficient's calibration basis* against the wiki source? → **rw-proof-and-analysis-toolkit**.
- This file defines each term ONCE. Siblings link here instead of redefining.

Facts are date-stamped **2026-07-08** where they can drift. Coefficient values in this
file are shown only to make the physics legible; the authoritative copy is `simulation_params.py`.

---

## 1. LST vs. air temperature — READ THIS FIRST (the app's deepest caveat)

**The single most important conceptual fact in this project.**

- **LST = Land Surface Temperature** = the *radiometric skin temperature* of whatever the
  satellite's thermal-infrared (TIR) sensor sees from above — asphalt, roof, leaf-top,
  grass. It is what a thermal camera reads, driven by the surface energy balance
  (net radiation = sensible + latent + ground heat flux). Sealed surfaces dump most net
  radiation into **sensible heat** → high LST; vegetated surfaces spend it on **latent
  heat** (evapotranspiration) → low LST.
- **Air temperature (2 m / ~1.2–2 m, "Canopy UHI")** = what a weather station or a human
  body feels. It is a *different physical quantity*, measured at human height, not the
  surface skin. LST and air temperature correlate but diverge — most over shaded surfaces
  and at night.
- **This app is 100 % LST-based.** Every choropleth, HVI input, hotspot, and tree/unsealing
  simulation number is surface temperature. There is **no air-temperature layer** in v1.
- **`"LST ≠ Lufttemperatur"` is a standing caveat** — it ships in the `caveats` array of
  `/api/simulate/baeume`, is repeated in `simulation-logic.md`, and appears as a caveat
  banner in the UI. Never present an LST number to a user as "how hot it feels."
- **Why it matters for cooling.** Trees cool via **two pathways**: (a) *shade* — lowers the
  skin temperature of the shaded surface → this is what LST captures and what the García de
  León coefficient (§4) is calibrated on; and (b) **transpiration / evapotranspiration** —
  water released through leaf stomata absorbs latent heat and cools the **air**, a
  humidity/air-temperature effect that LST **barely registers**. So transpiration cools
  *air* more than it cools *skin*. Applying an LST-calibrated coefficient to air temperature
  would be a category error.

> **Seed for the air-temperature expansion.** The owner's hardest open problem is adding an
> **air-temperature / transpiration-cooling** dimension *alongside* (never merged into) the
> LST model. The transpiration assets already exist but are unwired:
> `TRANSPIRATION_LB3_KG_M2_DAY = 0.19`, `TRANSPIRATION_LB6_KG_M2_DAY = 0.17`
> (kg H₂O m⁻² d⁻¹, Stratopoulos-Le Chalony 2020, TUM), and `LATENT_HEAT_KWH_PER_KG = 0.628`.
> `simulation-logic.md` "Schritt 3 — Transpirationskühlleistung (kWh)" is documented but
> **not implemented** (no `cooling_kwh_year` field in v1). That work is governed by
> **rw-air-temperature-campaign** — do not start it from this reference; the campaign is
> decision-gated and must fence off the LST-vs-air calibration trap described above.

Provenance: `wiki/concepts/land-surface-temperature.md`, `wiki/concepts/urban-heat-island.md`
(Surface UHI vs. Canopy UHI), `wiki/concepts/evapotranspiration.md`.

---

## 2. Remote-sensing basics — where the LST raster comes from

The raster `backend/data/lst_wue_2023_2025_summer_median.tif` is a Google Earth Engine
export. Bands: **Band 1 = LST °C**, Band 2 = NDVI, Band 3 = NDBI.

| Term | Plain meaning | Use here |
|---|---|---|
| **Landsat 8 + 9 thermal** | US satellites; TIR band `ST_B10` gives surface temperature at 100 m (thermal), ~16-day revisit each, ~8-day combined. | Source of Band 1. GEE already applied DN→Kelvin→°C — **backend does NOT rescale**. |
| **NDVI** | Normalized Difference Vegetation Index `= (NIR − Red)/(NIR + Red)`, range −1…+1. Urban veg ≈ 0.2–0.6. Proxy for **green vegetation density**; negatively correlated with LST. | Band 2. Present in the raster but **not yet wired into any endpoint**. Proxy for *all* vegetation (grass + trees), not tree canopy specifically — canopy cover (§4) is the tree-specific variable. |
| **NDBI** | Normalized Difference Built-up Index. Proxy for **built-up / impervious** surface; positively correlated with LST. | Band 3. Also present, not yet wired in. |
| **Summer median composite** | Per pixel, take the **median** LST across all cloud-free Jun–Aug scenes. | The `.tif` is the median of **summer 2023–2025** (Landsat 8+9). |
| **Why a 3-year median** | Central-European summers yield only ~3–6 cloud-free Landsat overpasses per season. A single date is noisy; the **median** across three summers rejects cloud/haze/QA outliers and gives a stable "typical hot-summer surface." | This is the headline dataset; single-year `.tif`s exist but are **not wired in**. |
| **100 m resolution** | One pixel = one 100×100 m cell = **1 ha = 10 000 m²** (`CELL_AREA_M2`). | Chosen to snap exactly onto the Destatis census grid (§3, and the invariant in **rw-architecture-contract**). |

Valid-pixel mask (in `load_lst`): finite value AND −10 °C < LST < 70 °C AND ≠ nodata. A
**cos(lat) area correction was tried and then removed** (the raster is native EPSG:3035, so
pixels are already equal-area) — **do not re-add it**.

Caveat to remember: satellite LST maps *spatial patterns* well but absolute values carry
several °C of uncertainty (downscaling/retrieval); treat it as relative hot/cold mapping.

Provenance: `wiki/concepts/land-surface-temperature.md`, `wiki/concepts/ndvi.md`,
`wiki/concepts/remote-sensing-methods.md`; CLAUDE.md "LST-GeoTIFFs" section.

---

## 3. CRS / projections — why three different EPSG codes coexist

A **CRS** (Coordinate Reference System, named by an **EPSG** code) says what the x/y numbers
in a geometry *mean*. Get it wrong and areas, distances, and joins are silently garbage.

| EPSG / name | What it is | Where in this app |
|---|---|---|
| **EPSG:3035** — ETRS89-LAEA Europe | **Equal-area** projection for all of Europe; units = metres. Preserves *area* (great for pixel/cell stats) at some shape cost. | **Native CRS of LST + Zensus.** Würzburg ≈ x 4.30–4.32 M, y 2.96–2.98 M. Integer cell midpoints `x_mp_100m`/`y_mp_100m` live here. Hotspot distance math also done here. |
| **EPSG:25832** — ETRS89 / UTM zone 32N | **Metric, projected** UTM zone covering Germany. Accurate distances/areas locally. | **Native CRS of the ATKIS shapefiles.** All **`area_m2` values are computed here** (`.area` in a projected metric CRS) *before* reprojecting out. `seal_pct` overlay/intersection math runs here too. |
| **EPSG:4326** — WGS84 lon/lat | Geographic **degrees**, not metres. The web/GeoJSON lingua franca. **You cannot compute area or distance in degrees.** | **Every `/api` response is converted to 4326** before serialization (deck.gl/MapLibre expect it). |
| **OGC:CRS84** | WGS84 lon/lat, axis order lon,lat (same datum as 4326). `to_epsg()` returns `None` — that is **correct**, not a bug. | Native CRS of the Baumkataster parquet (`geo_punkt` column). |

**The one rule to never break:** compute any **area or distance in a projected metric CRS**
(25832 or 3035), **never in 4326**. Convert to 4326 only for the final API payload.

**Why the Destatis 100 m grid matters** (summary only — the enforceable invariant lives in
**rw-architecture-contract**): the LST GeoTIFF was exported from GEE snapped exactly onto the
Destatis 100 m census grid (`crs=EPSG:3035`, `crsTransform=[100,0,4_300_000,0,-100,2_985_000]`).
That is *why* LST pixels and Zensus cells share integer midpoints and are joined with a plain
`pd.merge` on `(x_mp_100m, y_mp_100m)` — **no spatial join**. Re-export with a different
transform and the merge silently produces NaN rows. Details, cache invalidation, and the
"do not sjoin" rule → rw-architecture-contract.

Provenance: CLAUDE.md "CRS der Gitterkoordinaten" + "Gitter-Harmonisierung"; GROUND_TRUTH §1.

---

## 4. Canopy cover vs. canopy closure + the Crookston-Stage overlap model

This is the subtlest piece of science in the app, and the easiest to get wrong.

**Two different quantities — define once:**
- **Canopy cover (Überschirmung / projected cover)** = the fraction of ground covered by a
  **vertical projection** of all crowns, viewed from above. Overlapping crowns count **once**.
  Bounded 0–100 %, asymptotic. **This is what the app models and what LST correlates with.**
- **Canopy closure** = the fraction of sky hidden when you look **up** from a point (angular,
  hemispherical). A *different* measurement. The app does **not** use closure — mentioned only
  so you never confuse the two (Jennings et al. 1999 is the classic distinction).

**Why naive summation overcounts.** The intuitive formula `Σ crown_area / area` treats crowns
as if they never overlap. Pack enough trees and it sails past 100 % — physically impossible,
and it *double-counts* ground already shaded by an overlapping crown.

**The fix — Crookston & Stage (1999) negative-exponential overlap model** (USDA RMRS-GTR-24).
Assume crowns fall in random (Poisson) positions; then expected **projected** cover is:

```
ratio                 = Σ crown_area / area          # "crown area ratio", NOT a percentage
projected_cover_pct   = (1 − exp(−ratio)) × 100      # asymptotes to 100 %, never exceeds it
inverse_ratio(pct)    = −ln(1 − pct/100)             # pct clamped ≤ 99.9 to avoid log(0)
```

Both live **only** in `simulation_params.py` (`projected_cover_pct()`, `inverse_ratio()`) and
are reused by `data_loader._compute_bestand_pct`, `routers/simulate.py`, and the tests. The
frontend `BaumSimPanel.jsx` mirrors the same formula by hand — keep them in sync.

**How the tree endpoint uses it** (`/api/simulate/baeume`): existing and new crowns are added
in **ratio space** (not percent), then converted back once:
`existing_ratio = −ln(1 − existing/100)`, `new_ratio = (n_trees × crown_area) / area`,
`total_pct = (1 − exp(−(existing_ratio + new_ratio))) × 100`,
`effective_new_pct = total_pct − existing_pct`. The ΔLST coefficient is applied **only to
`effective_new_pct`** — the real projected increment.

**Why calibration forces this.** The García de León coefficient (§ next) was regressed against
**projected cover** (the union area of crowns), *not* against Σ/area. Feeding it naive % would
apply the coefficient to a quantity it was never calibrated on. This is why the old naive
summation and a `headroom` cap were removed.

**Crown area from the cadastre.** The Baumkataster stores `kronenbrei` = crown **diameter**
(m). Preferred crown area = **`π × (kronenbrei/2)²`**. `CROWN_AREA_M2_DEFAULT = 50 m²` is a
conservative fallback for trees lacking the field (mature Würzburg crowns run 62–124 m² per
Moser-Reischl 2021; it is deliberately low so young plantings are not overestimated).

**Orthogonal limit — seal_pct caps stem COUNT, not cooling.** `seal_pct` (§5) limits how many
*stems* physically fit (`plantable_m2 = 10_000 × (1 − seal_pct)`, `n_trees_max = floor(plantable_m2 /
MIN_GROUND_PER_TREE_M2)`), because sealed ground carries no trunk. It does **not** shrink the
cooling denominator `area_m2` — crowns overhang sealed ground, and the coefficient is calibrated
against cover over the *whole* polygon area. (Exact `MIN_GROUND_PER_TREE_M2` value and its stale-doc
warning → **rw-config-and-coefficients**.)

Provenance: `wiki/sources/crookston-stage-1999-cover-equation.md`, `wiki/simulation-logic.md`
(Simulation A, Schritt 1), `simulation_params.py` helper docstrings; Jennings et al. 1999
(cover vs. closure).

---

## 5. Impervious surface / sealing → runoff & the Rational formula

**Impervious (sealed) surface / Versiegelung** = non-permeable urban ground (roads, parking,
roofs, paved plazas) that replaces vegetated soil. It is the primary land-use driver of the
Urban Heat Island: sealed surfaces have low albedo + high heat capacity, store daytime heat,
and — having no vegetation — produce **no evapotranspiration**, so their energy goes to
sensible heat (high LST). They also shed rain instead of infiltrating it.

**`seal_pct`** = area-weighted **fraction sealed (0–1)** of a 100 m cell, computed in
`_compute_seal_pct` by intersecting the cell with ATKIS/OSM polygons and assigning each m² the
**highest** `SEAL_RATE_BY_TYPE` of the polygons covering it ("Priority-Union", each m² counted
once — the fix that stopped heavily-sealed cells wrongly clamping to 100 %). Cells with no
sealing polygon → `seal=0` (treated as green/open). Mechanics & the model-version cache trap →
**rw-architecture-contract**; the seal-rate table values → **rw-config-and-coefficients**.

**Runoff coefficient Ψ** (`RUNOFF_COEFFICIENTS`) = the **share of rainfall that runs off** a
surface instead of infiltrating. `Ψ = 0.90` asphalt (almost all runs off) … `Ψ = 0.05`
Rasendecke/meadow (almost all soaks in). It is the hydrological complement of infiltration.

**The Rational formula — how `/api/simulate/wasser` turns unsealing into infiltration.**
Unsealing a surface *lowers* its Ψ; the extra rain that now infiltrates is:

```
ΔΨ                   = Ψ_from − Ψ_to
infiltration_m3_year = max(0, area_m2 × ANNUAL_RAINFALL_WUERZBURG_M × ΔΨ)
retention_pct        = (1 − Ψ_to) × 100
context_persons      = infiltration_m3_year / CONTEXT_PERSONS_M3_PER_YEAR   # ≈ 46.4 m³/person·yr
```

`ANNUAL_RAINFALL_WUERZBURG_M = 0.5735 m/yr` (573.5 mm, DWD station 05705, 1991–2020). Example:
1000 m² asphalt (0.90) → Schotterrasen (0.30): `1000 × 0.5735 × 0.60 = 344.1 m³/yr`. An unknown
`from_surface`/`to_surface` (not in `RUNOFF_COEFFICIENTS`) returns **HTTP 422**. `max(0, …)`
guards the case where the target is *more* sealed than the source (ΔΨ ≤ 0).

**No ΔLST in v1 for unsealing.** `LST_PER_PCT_UNSEALING = −0.03 °C/%` exists but is
**deliberately not applied**: the Tervooren (2015, Potsdam) coefficient is calibrated at
*district* scale and produces physically meaningless micro-values per polygon. The Wasser
simulation therefore returns **no** `delta_lst_celsius` (a v2 would apply it at reference-area
level, not per polygon).

**Provenance of Ψ:** primary **DWA-A138 / LfU Bayern** (the German standard worksheet for
rainwater infiltration design), secondary Leitfaden Landkreis Bayreuth 2024. These are
literature values, not measured on-site (a shipped caveat).

Provenance: `wiki/concepts/impervious-surface.md`, `wiki/simulation-logic.md` (Simulation B),
`wiki/sources/dwa-a138-lfu-regenwasser-bayern.md`, `wiki/sources/tervooren-2015-gruenvolumen-potsdam.md`.

---

## 6. Vulnerability statistics — HVI, rank normalization, Bayesian shrinkage

The **Heat Vulnerability Index (HVI)** per 100 m cell combines heat exposure with a sensitive
population share. Formula (`utils/vuln_formula.py`, computed **only** in
`utils/analysis.build_hvi_geodataframe`):

```
raw = 0.6 × lst_norm + 0.4 × anteil_65plus_adj      # WEIGHTS = {lst_norm:0.6, anteil_65plus:0.4}
hvi = raw × 9 + 1                                     # rescales 0..1 → 1..10; None if any input is NaN
```

Three statistical ideas make this defensible:

- **Rank normalization (not min-max).** `lst_norm` is `scipy.stats.rankdata(lst) / N` → each
  cell's **rank position** in 0..1, not `(x−min)/(max−min)`. Rank is **robust to outliers**: a
  single freak-hot pixel would stretch a min-max scale and crush everyone else toward 0; ranks
  keep the distribution uniform and comparable across the map. (The naming table below.)
- **Weighted index.** The 0.6/0.4 split says heat exposure weighs more than the senior share,
  and `assert sum(WEIGHTS) == 1.0` keeps the composite on a clean 0–1 base before rescaling.
- **Empirical-Bayes / Bayesian shrinkage** (`shrink_senior_rate`) solves the **small-numbers
  problem**. A cell with 3 residents who all happen to be 65+ has an *observed* senior rate of
  100 % — statistically meaningless, yet it would score `HVI = 10`. Shrinkage pulls each cell's
  rate toward the **population-weighted city mean** in proportion to how little data the cell has:

  ```
  adjusted = (n × observed + N_PRIOR × global_mean) / (n + N_PRIOR)      # N_PRIOR = 50
  ```

  Read `N_PRIOR` as a **pseudo-count** — "50 phantom residents at the city-average rate" added
  to every cell. A cell needs ~50 real residents before its own data outweighs the prior
  (≈ 50 % credibility). Big cells barely move; tiny cells snap to the city mean. `global_mean`
  is the **population-weighted** senior rate (`Σ seniors / Σ residents`), not a mean of rates.

**Data gotcha that produces null HVI:** Zensus masks age classes and total population
*independently* (§16 BStatG secrecy rounding). A cell can have `Einwohner` but a **null**
`anteil_65plus` → no HVI (tooltip: "⚠ Altersstruktur nicht verfügbar (Datenschutz)").
`anteil_65plus` is also `.clip(0, 1)`'d; `anteil_65plus_clamped` flags where raw > 1.

**API contract naming:** `/api/zensus` and `/api/vulnerability` return **`Einwohner`** (capital
E); `/api/stadtbezirke` uses lowercase `einwohner`. Do not "fix" a test by changing the API —
fix the test (this exact mistake happened, commit `45171ef`).

Provenance: `utils/vuln_formula.py`, `utils/analysis.py`, GROUND_TRUTH §3; CLAUDE.md
"Geheimhaltungsrundung Zensus 2022".

---

## 7. Compact glossary

| Term | One-line meaning | Where in code |
|---|---|---|
| **LST** | Radiometric surface skin temperature (°C) from Landsat TIR. | Band 1 of `lst_*.tif`; `lst_celsius` in `/api/lst`. |
| **Air temperature (2 m)** | Human-height temperature; a *different* quantity, not in the app. | — (future rw-air-temperature-campaign). |
| **Surface UHI / Canopy UHI** | UHI measured by LST vs. by 2 m air temperature. | Concept; app is Surface-UHI only. |
| **NDVI** | `(NIR−Red)/(NIR+Red)`; vegetation-density proxy, negative LST correlate. | Band 2 of the raster (not yet wired in). |
| **NDBI** | Built-up index; positive LST correlate. | Band 3 (not yet wired in). |
| **Summer median composite** | Per-pixel median LST over cloud-free Jun–Aug scenes, 3 summers. | The `.tif` itself. |
| **EPSG:3035 (LAEA)** | Equal-area metric CRS; native for LST + Zensus. | `x_mp_100m`/`y_mp_100m`, hotspot distances. |
| **EPSG:25832 (UTM32N)** | Metric CRS; native for ATKIS; all `area_m2` computed here. | `_compute_seal_pct`, `load_entsiegelung`. |
| **EPSG:4326 (WGS84)** | lon/lat degrees; API/GeoJSON output; no area in degrees. | Every `/api` response. |
| **OGC:CRS84** | WGS84 lon/lat; `to_epsg()`→None is correct. | Baumkataster `geo_punkt`. |
| **Canopy cover** | Vertical crown projection, overlaps counted once, 0–100 %. | `bestand_pct`, `total_coverage_pct`. |
| **Canopy closure** | Sky hidden looking up (angular). NOT used — don't confuse. | — |
| **Crookston-Stage model** | `cover% = (1−exp(−Σcrown/area))×100`; kills overcount. | `projected_cover_pct`/`inverse_ratio` in `simulation_params.py`. |
| **Crown area** | `π×(kronenbrei/2)²`; fallback `CROWN_AREA_M2_DEFAULT=50 m²`. | `_compute_bestand_pct`, sim. |
| **seal_pct** | Area-weighted fraction sealed (0–1) per cell, Priority-Union. | `_compute_seal_pct`; `/api/lst`. |
| **Ψ (runoff coefficient)** | Share of rain that runs off (0=all infiltrates, 1=all runs off). | `RUNOFF_COEFFICIENTS`. |
| **Rational formula** | `infiltration = area × rainfall × ΔΨ`. | `/api/simulate/wasser`. |
| **rank normalization** | `rankdata(x)/N` → 0..1; outlier-robust, not min-max. | `lst_norm`. |
| **HVI** | `(0.6·lst_norm + 0.4·senior_adj)×9+1` → 1..10. | `compute_hvi`. |
| **Bayesian shrinkage** | `(n·obs + N_PRIOR·mean)/(n+N_PRIOR)`; N_PRIOR=50 pseudo-count. | `shrink_senior_rate`. |

---

## 8. When NOT to use this / use instead

| You actually need… | Go to |
|---|---|
| The exact number of a coefficient / a value to import | **rw-config-and-coefficients** (`simulation_params.py`, `vuln_formula.py`) |
| The grid/CRS **invariant**, `pd.merge` vs `sjoin`, cache-version traps, when to delete `lst.parquet` | **rw-architecture-contract** |
| To **verify** a coefficient's calibration basis / re-derive it from a wiki source | **rw-proof-and-analysis-toolkit** |
| To build the **air-temperature / transpiration** dimension | **rw-air-temperature-campaign** (decision-gated) |
| Endpoint request/response shapes, params, caching behaviour | the API/endpoint skill (see rw-architecture-contract) |

Do not change coefficients or wiki pages from this skill. Coefficients are owner/wiki-sourced;
the wiki is edited **only** through its INGEST/UPDATE workflow in `urban-heat-wiki/CLAUDE.md`.

---

## 9. Provenance and maintenance (re-verify — facts drift)

Each concept is backed by a named wiki page. **Do not edit the wiki here** — it is a git
submodule governed by its own INGEST/UPDATE workflow; treat it as read-only reference.

| Section | Backing wiki page(s) |
|---|---|
| §1 LST vs air temp | `wiki/concepts/land-surface-temperature.md`, `urban-heat-island.md`, `evapotranspiration.md` |
| §2 Remote sensing | `wiki/concepts/land-surface-temperature.md`, `ndvi.md`, `remote-sensing-methods.md` |
| §3 CRS | CLAUDE.md (CRS sections); no dedicated wiki page |
| §4 Canopy / Crookston-Stage | `wiki/sources/crookston-stage-1999-cover-equation.md`, `wiki/simulation-logic.md` |
| §5 Impervious / Rational | `wiki/concepts/impervious-surface.md`, `wiki/simulation-logic.md`, `wiki/sources/dwa-a138-lfu-regenwasser-bayern.md`, `wiki/sources/tervooren-2015-gruenvolumen-potsdam.md` |
| §6 HVI / shrinkage | `backend/utils/vuln_formula.py`, `backend/utils/analysis.py` (code is the source of record) |

**Re-verification commands (2026-07-08):**

```bash
# The sim helpers + coefficients this file describes:
sed -n '1,160p' backend/simulation_params.py

# HVI weights, N_PRIOR, shrinkage, compute_hvi:
sed -n '1,120p' backend/utils/vuln_formula.py

# Authoritative simulation logic (formulas + I/O contracts):
sed -n '1,120p' urban-heat-wiki/wiki/simulation-logic.md

# What the wiki has ingested and when (append-only record):
tail -40 urban-heat-wiki/log.md
```

The wiki INGEST record lives in `urban-heat-wiki/log.md` (and the catalog in `index.md`). If a
concept page's `updated:` date is newer than **2026-07-08**, re-read it before trusting this
summary. If `simulation_params.py` and a wiki page ever disagree on a *value*, the code wins for
runtime but flag it — a value should never enter the code before its wiki source
(per `simulation_params.py` header + owner rule).

**Known drift to NOT propagate (2026-07-08):** CLAUDE.md's headline LST relationship cites
−0.069 °C/% (whole-city `OVERALL`), but the tree endpoint applies −0.083 (`MIXED`) — both are
real, the endpoint uses MIXED. `MIN_GROUND_PER_TREE_M2` is **100** in code; CLAUDE.md and
`docs/handoff-baumscheiben.md` still say 25 (stale). Exact values and this drift are owned by
**rw-config-and-coefficients** — don't re-assert numbers here, link there.
