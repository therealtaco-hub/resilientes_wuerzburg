# Resilientes Würzburg — Full documentation

**Status:** November 2026

This page describes the methodology, data sources, coefficients and assumptions for every tab of the app.

---

## 1 · System overview

The tool combines three thematic data layers into one analysis surface for the city of Würzburg:

| Layer | Content | Primary source |
|---|---|---|
| **Heat** | Land surface temperature (LST), 100 m grid | Landsat 8+9 via Google Earth Engine |
| **Social** | Senior share 65+, population density, 100 m grid | Destatis Census 2022 |
| **Surface** | Sealed areas by area type | ATKIS Basis-DLM Bavaria + OpenStreetMap |

All three layers are spatially harmonised onto the **Destatis 100 m LAEA grid (EPSG:3035)**. The LST GeoTIFF was exported in Google Earth Engine with exactly the grid transform of the census data (`crsTransform = [100, 0, 4 300 000, 0, −100, 2 985 000]`). This lets LST and census cells be joined pixel-precisely via integer cell centres `(x_mp_100m, y_mp_100m)` — no resampling, no spatial-overlay artefacts, no `sjoin`.

### Architecture

```
FRONTEND (React + Vite)                 BACKEND (FastAPI, Python)
  MapLibre + deck.gl → maps               GeoPandas, Rasterio
  Tailwind + Zustand       ◄─────────►    SciPy, osmnx
  i18next (DE/EN)            REST/JSON        │
                                          DATA: GeoParquet, GeoTIFF, CSV
                                          (LST GeoTIFF exported beforehand
                                           from Google Earth Engine)
```

The backend **always returns GeoJSON or JSON**, never raw GeoDataFrames. Deployment: backend → Render.com, frontend → Vercel, both via GitHub CI/CD.

### The six pages

| Route | Function |
|---|---|
| `/` Dashboard | Overview: KPI tiles + top lists per district |
| `/hitzeatlas` | LST choropleth + tree cadastre + top-5 heat spots |
| `/vulnerabilitaet` | Heat Vulnerability Index (LST + senior share) |
| `/entsiegelung` | Sealed areas by type (ATKIS + OSM) |
| `/simulation` | What-if: tree planting + unsealing |
| `/dokumentation` | This documentation |

---

## 2 · Data sources in detail

### 2.1 🌡️ Landsat LST (surface temperature)

| Attribute | Value |
|---|---|
| Source | Google Earth Engine, collections `LANDSAT/LC08/C02/T1_L2` + `LANDSAT/LC09/C02/T1_L2` |
| Band | `ST_B10` (thermal infrared, 10.6–12.5 µm), Level-2 science product |
| Period | Summer (June–August) 2023–2025, **3-year median composite** |
| Resolution | 100 m, exported EPSG:3035, snapped exactly to the Destatis grid |
| QA masking | `QA_PIXEL` band: mask for clouds, cloud shadow, snow |
| Scaling | GEE already delivers finished °C values (DN→K→°C in GEE). The backend reads band 1 directly, **no** further conversion |
| Bands in the GeoTIFF | Band 1 = LST_C (°C), band 2 = NDVI, band 3 = NDBI |
| File | `lst_wue_2023_2025_summer_median.tif` |
| Valid cells | ~15,900 |

**Why a median composite instead of a single scene?** Individual satellite overpasses depend heavily on short-term cloud and dust anomalies. The 3-year median stabilises the signal, filters scene-specific artefacts and stays current at the same time.

**`lst_norm` (rank normalisation):** For cross-map comparison each cell is mapped via `scipy.stats.rankdata` to a rank value 0.0–1.0 (0 = coldest, 1 = hottest cell in the captured area). This is deliberately rank-based rather than value-based so that outliers do not compress the colour scale.

### 2.2 🌳 Tree cadastre Würzburg

| Attribute | Value |
|---|---|
| Source | City of Würzburg, opendata.wuerzburg.de — bulk export as GeoParquet |
| Size | **44,647** trees |
| CRS | OGC:CRS84 (= WGS84 lon/lat) |
| Geometry column | `geo_punkt` |
| Attributes | `baumart` (species), `baumart_la` (Latin name), `baumtyp` (deciduous/conifer), `baumhoehe` (m), `kronenbrei` (crown diameter m), `stammumfan` (cm), `source_id` |
| Licence | CC BY 4.0 |

**Important:** The export contains **no** `pflanzjahr`/`alter` (planting-year/age) field. Only **trees owned by the city** are shown — private trees on residential or company grounds are not recorded. (Historical note: the opendata.wuerzburg.de REST API allows only `offset + limit ≤ 10,000`, hence the switch to the full bulk export.)

### 2.3 👥 Destatis Census 2022

| Attribute | Value |
|---|---|
| Source | Federal Statistical Office (Destatis), zensus2022.de |
| Grid | 100 m × 100 m LAEA (EPSG:3035) |
| Fields used | `GITTER_ID_100m`, `a65undaelter` (65+), `Einwohner` (population) |
| Licence | dl-de/by-2-0 |

**Data specifics (important for correct reading):**
- **Separator** of the CSVs is a semicolon (`;`), not a comma.
- **Column names deviate from the standard:** `GITTER_ID_100m` (upper case); age classes are `Unter18`, `a18bis29`, `a30bis49`, `a50bis64`, `a65undaelter` (5 classes).
- **Masked values:** small cells contain confidentiality markers (`–`/`�`) → `pd.to_numeric(..., errors="coerce")`, NaN is preserved and rendered transparently.
- **CRS range Würzburg:** x ≈ 4.307–4.320 M, y ≈ 2.967–2.978 M (EPSG:3035). Filter with buffer x: 4.30–4.325 M, y: 2.96–2.985 M.

**Confidentiality rounding (§ 16 BStatG):** Destatis rounds cells with few persons stochastically. Because age classes and total population come from **separate** CSVs, after the merge `a65undaelter > Einwohner` and thus `anteil_65plus > 1.0` can occur. Fix: `.clip(0, 1)` in the backend, marked `anteil_65plus_clamped: true`. Typically < 2 % of all Würzburg cells are affected. **Special case:** `Einwohner` may be present while `anteil_65plus` is still `null` (age classes and total are masked independently) → then no HVI, and the tooltip shows "Age structure unavailable (privacy)".

The census endpoint outputs only cells that intersect at least one LST pixel (~3,089 features) — coincident with the HVI and LST extent.

### 2.4 🏗️ ATKIS Basis-DLM Bavaria

| Attribute | Value |
|---|---|
| Source | Bavarian Agency for Digitisation, High-Speed Internet and Surveying (LDBV), geodaten.bayern.de |
| File | `bkg_shape_712.zip` |
| Layers used | `sie02_f.shp` (settlement areas), `ver01_f.shp` (traffic areas) |
| CRS | EPSG:25832 (UTM zone 32N) |
| Licence | CC BY 4.0 |

**Filtering:** Pre-filter via Würzburg bounding box `(540 000, 5 505 000, 580 000, 5 540 000)` on read, then a precise `.cx[9.87:10.01, 49.75:49.83]` clip in EPSG:4326. **Area-type key:** `OBJART_TXT` unchanged (e.g. `AX_Wohnbauflaeche`, `AX_IndustrieUndGewerbeflaeche`). **Label:** AX_ prefix removed, CamelCase → spaces. **Area** computed in EPSG:25832 (metrically correct) before reprojection. No score, no `seal_rate` at this level — pure area-type visualisation.

### 2.5 🗺️ OpenStreetMap (OSM)

Source: OSM via `osmnx` (Python, no separate download), licence ODbL. Extracted object types:
- `amenity=parking` → `osm_parking` (parking lots)
- `place=square` → `osm_square` (squares/markets)
- Buildings with `roof:shape=flat` **or** `building ∈ {industrial, commercial, supermarket, retail}`, **excluding** green roofs (`roof:material=grass` / `roof:surface=green`) → `osm_flat_roof_industrial` (flat roofs, label "Flat roof / commercial")

### 2.6 💧 DWD rainfall

| Attribute | Value |
|---|---|
| Source | German Weather Service (DWD), Climate Data Center |
| Station | Würzburg, ID **05705** (49.7704 °N, 9.9576 °E, 268 m a.s.l.) |
| File | `monatswerte_KL_05705_18810101_20241231_hist.zip`, column `MO_RR` |
| Reference period | 1991–2020 (DWD climate normal period), 360/360 valid monthly values |
| **Annual rainfall** | **573.5 mm/yr = 0.5735 m/yr** (Σ MO_RR per year / 30 years) |
| Range | 394 mm (1991) to 806 mm (2002), median 556 mm |

Monthly means (mm): Jan 40.0 · Feb 35.8 · Mar 40.2 · Apr 32.7 · May 57.3 · Jun 52.9 · Jul 65.8 · Aug 56.3 · Sep 47.2 · Oct 47.5 · Nov 46.2 · Dec 51.5. (Stored for future seasonal simulations, currently only the annual value is used.)

### 2.7 Districts of Würzburg

Source: opendata.wuerzburg.de (`stadtbezirke` dataset), **13 polygons**, properties `name`, `nummer`. All district metrics (LST, HVI, unsealing, trees) are computed live in the backend via spatial join.

---

## 3 · Page: Dashboard (`/`)

**Function:** Landing page with four KPI tiles and four top-3 lists, aggregated at district level. The data basis is `GET /api/stadtbezirke`, which performs spatial joins against all four datasets, plus `GET /api/entsiegelung` for the total area.

### KPI tiles

| Tile | Value | Origin |
|---|---|---|
| **Hottest zone** | `lst_max` of the hottest district (°C) | max of all LST pixels in the district polygon |
| **Max. vulnerability** | `hvi_max` of the most vulnerable district (index 1–10) | highest HVI cell value in the district |
| **Trees in Würzburg** | Σ `tree_count` of all districts; subline shows city-wide canopy shade `city_canopy_pct` | tree cadastre + `bestand_pct` |
| **Potential areas** | Σ `area_m2` of all ATKIS+OSM areas | unsealing endpoint |

### Top-3 lists
Hottest districts (`lst_max`, subline ⌀ `lst_mean`) · Most vulnerable districts (`hvi_max`) · Most trees (`tree_count`) · Top unsealing (`entsiegelung_m2`).

### Computing the district metrics (`/api/stadtbezirke`)

| Metric | Computation |
|---|---|
| `lst_max` / `lst_median` / `lst_mean` | max / median / mean of all LST pixels in the polygon |
| `hvi_max` | highest HVI cell value in the district |
| `hvi_mean` | **population-weighted** avg: Σ(HVI·population) / Σ(population), fallback unweighted |
| `einwohner` | Σ census population of the intersected cells |
| `entsiegelung_m2` | Σ area of all ATKIS+OSM polygons in the district |
| `tree_count` | number of tree-cadastre points in the district |
| `city_canopy_pct` (`meta`) | avg `bestand_pct` over in-city cells only |
| `city_cell_count` (`meta`) | number of in-city cells (denominator for the city-wide extrapolation) |

**Why `hvi_mean` is population-weighted:** An unweighted mean would over-rate sparsely populated fringes with a coincidentally high score. Weighting by population ensures the district average reflects the people actually affected.

---

## 4 · Page: Heat atlas (`/hitzeatlas`)

**Function:** Choropleth of the surface temperature on the 100 m grid, overlayable with the full tree cadastre, with a hover tooltip, a clickable tree popup, a district overlay and a top-5 heat-spots card.

### Layers

- **Heat island (LST):** `GeoJsonLayer` choropleth. Colour interpolates `lst_norm` over a three-point gradient green → amber → red. Hover tooltip shows LST (°C) and NDVI where available.
- **Tree cadastre:** `ScatterplotLayer`, radius = `max(3 m, kronenbrei/2)` (half the crown diameter, min. 3 m — scales true-to-scale with zoom). Colour: deciduous green, conifer teal. Clicking opens a popup with species, Latin name, type, height, crown diameter, trunk girth, ID.
- **Districts:** choropleth on `lst_max`, white outlines, hover tooltip with LST/HVI/population/trees.
- **NDVI (optional):** vegetation index from band 2 of the GeoTIFF, green gradient 0 → 0.7+; transparent at ≤ 0 (water/shadow).

### Top-5 heat spots (`GET /api/hotspots`)

Marks the five strongest heat centres. The algorithm:

1. **Focal mean, radius 200 m:** Each cell is smoothed by the mean of all cells within a 200 m radius. This filters out small-scale single-pixel outliers (e.g. individual metal roofs). The displayed temperature is this smoothed value (`lst_celsius_smooth`, "avg 200 m").
2. **Edge filter:** Cells with < 10 neighbours or an empty 90° quadrant (near NoData/cloud gaps) are discarded.
3. **Greedy non-maximum suppression, minimum distance 600 m:** Prevents a large heat island from occupying several ranking places.
4. **Geographic pre-filter:** Only the inner-city districts Grombühl, Sanderau, Zellerau, Frauenland, Heidingsfeld, Altstadt, Steinbachtal, Heuchelhof — otherwise fringe areas (forest, fields) would dominate the ranking without any heat-island relevance.

The "jump to this location" button uses MapLibre's native `flyTo`.

### Hint box
The hint box mentions: 100 m grid resolution (finer differences within a cell not shown), LST ≠ air temperature, uncoloured areas (outside the city boundary or clouds in the composite), tree cadastre = city trees only. All four points are fully explained in ch. 2.1 / 2.2 / 10.

---

## 5 · Page: Vulnerability (`/vulnerabilitaet`)

**Function:** Choropleth of the **Heat Vulnerability Index (HVI)** on the 100 m grid — combines thermal load (LST) with social vulnerability (senior share 65+). Separately toggleable layers for LST, demographics 65+ and HVI, plus a district choropleth on `hvi_max`.

### The HVI formula (`utils/vuln_formula.py`, authoritative)

```
HVI_raw = 0.6 · lst_norm + 0.4 · anteil_65plus_adj
HVI     = HVI_raw · 9 + 1            → scale 1 (low) to 10 (high)
```

| Factor | Weight | Rationale |
|---|---|---|
| `lst_norm` (rank-normalised 0–1) | **0.6** | heat exposure is the dominant factor |
| `anteil_65plus_adj` (Bayes-adjusted 0–1) | **0.4** | social sensitivity of older people |

The weights sum to exactly 1.0 via an assertion. `compute_hvi()` returns `None` when LST or the age share are missing (NaN) — such cells stay uncoloured.

### Bayesian shrinkage of the senior share

**Problem (small numbers):** A cell with 3 residents all over 65 would have `anteil_65plus = 1.0` and thus a false HVI = 10. **Solution:** empirical-Bayes / credibility estimator:

```
anteil_65plus_adj = (n · observed + N_prior · city_mean) / (n + N_prior)
```

with **`N_prior = 50`** and `city_mean` = population-weighted city mean rate (`global_65_rate`, exposed in the endpoint `meta`). Interpretation: at n = 50 residents the credibility is exactly 50 % (half city mean, half observed); at n ≫ 50 the observed value dominates. Examples from the code: n=3, obs.=1.0, global=0.22 → adj ≈ 0.26; n=200, obs.=0.30, global=0.22 → adj ≈ 0.28.

### KPI tiles & tooltip
- **Most vulnerable area:** highest HVI in the dataset.
- **Affected population:** Σ population of all cells with HVI > 7.0 in the analysis area. It extends beyond the city boundary (as of Nov. 2026: 43 of the 185 cells and about 1,900 of the 10,659 people lie outside Würzburg).
- **Per-cell tooltip:** HVI, LST, share 65+ (raw), 65+ adjusted, population. Warnings on census rounding (§ 16 BStatG) or missing age structure.

The formula card in the panel shows weights, `N_prior`, city avg 65+ live from the endpoint `meta`. The interpretation box ("auto-generated") states: cells with a high HVI combine above-average surface temperature and an elevated senior share → priority for tree planting and unsealing.

---

## 6 · Page: Unsealing (`/entsiegelung`)

**Function:** Map of all sealed areas by area type (ATKIS + OSM). **No scoring function** — pure visualisation of the baseline, coloured by category, filterable by source (ATKIS/OSM).

- **KPI:** recorded areas (count ATKIS + OSM) and total area (Σ `area_m2`).
- **Layer panel:** ATKIS areas and OSM parking & squares separately toggleable, with feature counters from `meta` (`atkis_count`, `osm_count`).
- **Tooltip:** label + source (ATKIS/OSM) + area.
- **Area types (`type_key`):** ATKIS `OBJART_TXT` as-is; OSM `osm_parking`, `osm_square`, `osm_flat_roof_industrial`.

Flat roofs are shown as an indication of greening potential but are **not** selectable in the simulation (no ground intervention).

---

## 7 · Page: Simulation (`/simulation`)

Two sub-tabs, each with its own backend endpoint. Operation: the user selects areas on the map (cells or polygons), sets a parameter via slider/number input, and sees the effect in a before/after block. All API calls are debounced by 300 ms.

---

### 7a · Sub-tab Tree planting (`GET /api/simulate/baeume`)

**Outputs:** Δ surface temperature (°C), CO₂ sequestration (kg/yr), canopy cover (%), plus a city-wide shading extrapolation.

#### Computation (step by step)

```
Step 1 — Projected canopy cover (overlap model, Crookston & Stage 1999):
  crown_area_total   = n_trees · 50 m²                          [50 m²/tree, see below]
  new_ratio          = crown_area_total / area_m2               [area ratio]
  existing_ratio     = −ln(1 − existing_coverage_pct / 100)     [existing, inverse formula]
  total_coverage_pct = (1 − exp(−(existing_ratio + new_ratio))) · 100
  effective_new_pct  = total_coverage_pct − existing_coverage_pct   [real gain, ≥ 0]

Step 2 — LST reduction:
  delta_lst_celsius  = −0.083 · effective_new_pct               [mixed-use coefficient]

Step 3 — CO₂ sequestration:
  co2_kg_year        = n_trees · 12.5 kg/yr
```

**Why the overlap model?** The naive sum `Σ crown area / area` double-counts overlaps. The negative-exponential model after Crookston & Stage (1999, USDA RMRS-GTR-24) assumes random (Poisson) crown placement and converges asymptotically toward 100 % — a hard cap is unnecessary. Δ°C acts only on the **projected** gain, because that is exactly the quantity the García de León coefficient is calibrated against (union area of the crowns, not the sum). The diminishing marginal return of dense stands is thereby captured automatically.

**Model limit:** For regularly planted avenues the cover is slightly **under**estimated, for park clusters slightly **over**estimated (Gray et al. 2021).

#### Plantable area & sealing degree

Not the whole cell is plantable — sealed ground carries no trunk. Per 100 m cell an area-weighted **sealing degree** `seal_pct` is precomputed at cache build from the overlapping ATKIS/OSM polygons:

```
seal_pct           = Σ(overlap area · seal_rate) / 10,000 m²      [0–1]
plantable_area     = cell_area · (1 − seal_pct)
n_trees_max        = floor(plantable_area / 100 m²)               [slider cap]
```

Crucially: the sealing degree limits only the **trunk count** (`n_trees`), **not** the cooling denominator (`area_m2` stays the full area). Crowns overhang sealed ground, and the García de León coefficient is calibrated against cover over the entire polygon area. Poisson model and sealing degree are orthogonal: one limits cover *per crown*, the other the *trunk count*.

**Gap assumption (E2):** Only ATKIS `sie02` (settlement) + `ver01` (traffic) are loaded. Cells without coverage are treated as **unsealed** (green/open space) and marked in the panel ("⚠ Partly no ATKIS settlement/traffic area → assumed unsealed"), so a gap is not misread as "missing data".

**Sealing degrees `seal_rate` by area type** — **own assumptions**, not values taken directly from the literature. Rough orientation: sealing levels after Böcker (1984), as reproduced in UBA Texte 141/2021, p. 60 (moderate 10–50 %, medium 45–75 %, strong 70–90 %, very strong 85–100 %):

| Area type | `seal_rate` |
|---|---|
| Road traffic area (`AX_Strassenverkehr`) | 98 % |
| Parking lot (`osm_parking`) | 95 % |
| Square/market (`osm_square`) | 90 % |
| Square (`AX_Platz`) | 88 % |
| Industry/commerce (`AX_IndustrieUndGewerbeflaeche`) | 80 % |
| Mixed use (`AX_FlaecheGemischterNutzung`) | 65 % |
| Residential (`AX_Wohnbauflaeche`) | 60 % |
| Special functional use | 60 % |
| Sport & recreation (`AX_SportFreizeitUndErholungsflaeche`) | 20 % |
| Cemetery (`AX_Friedhof`) | 20 % |
| Default (unknown) | 70 % |

#### Slider maximum

`n_trees_max = floor(plantable_area / 100 m²)`. The **100 m²/tree** correspond to ~10 m spacing — the recommended distance for 2nd-order trees (up to 20 m tall) per the **FLL guideline "Recommendations for tree plantings", part 1, 2nd ed. 2015**. This is a planting-practical/UX cap, **not a model cap**. The plantable area tends to over-estimate the actually available sites (basements, private backyards, utility conflicts) — the maximum count is a **computational upper bound**, not a planting plan. A tree-pit note under the slider explains that additional plantings in sealed areas are possible via tree pits but not captured by the model.

#### Before/after block
Shows tree count (existing from bbox counting + new), temperature (avg LST of the selection + Δ), CO₂ sequestration (existing from `treeCount · coefficient` + new) and canopy cover (existing/new/free as a stacked bar). Additionally a **city-wide shading extrapolation**: `effective_new_pct` acts on the selection area and is scaled to `city_cell_count · 10,000 m²`.

#### Output example (JSON)
```json
{ "n_trees": 50, "area_m2": 120000, "existing_coverage_pct": 0.0,
  "new_crown_area_ratio": 0.021, "effective_new_pct": 2.1,
  "total_coverage_pct": 2.1, "delta_lst_celsius": -0.17, "co2_kg_year": 625.0,
  "coefficients_used": { "lst_per_pct_canopy": -0.083, "land_use": "mixed",
    "crown_area_m2": 50.0, "co2_kg_per_tree_year": 12.5 }, "caveats": [ … ] }
```

---

### 7b · Sub-tab Unsealing (`GET /api/simulate/wasser`)

**Outputs:** additional rainwater retained on site (m³/yr), runoff share before/after, persons' annual tap-water use, groundwater-recharge context (LfU district value, not calculated). Operation: select polygons, set from/to surface per area type, area via slider.

#### Computation (runoff-coefficient method, annual volume)

```
delta_C              = Ψ_from − Ψ_to
infiltration_m3_year = max(0, A · N · delta_C)
retention_pct        = (1 − Ψ_to) · 100
context_persons      = infiltration_m3_year / 44.2
```

with A = unsealed area (m²), **N = 0.5735 m/yr** (DWD station 05705), Ψ = runoff coefficient. `max(0, …)` catches the case where the target surface is more sealed than the source surface (then an additional caveat). Unknown surface types → HTTP 422. `retention_pct` is the share of rainfall that does not run off the surface of the target material (1 − Ψ_to); it is not shown in the app.

**Example:** 1,000 m² asphalt → gravel lawn: delta_C = 0.90 − 0.30 = 0.60 → retained water = 1,000 · 0.5735 · 0.60 = **344.1 m³/yr**.

**What the number means:** `A · N · ΔΨ` is the amount of rainwater that **no longer runs off the surface** after unsealing and stays on site instead. The model does not distinguish whether it infiltrates or evaporates (e.g. from joints, depressions and vegetation) — the number is therefore an **upper bound for infiltration**. For compatibility, the API field is still called `infiltration_m3_year`.

#### Runoff coefficients Ψ by surface type

Ψ = share of rainfall that **runs off the surface**; 0 = nothing runs off, 1 = everything runs off.

| Surface type (`key`) | Ψ | Primary source |
|---|---|---|
| Asphalt / concrete (`asphalt`) | **0.90** | DWA-A 138 (2005) |
| Paving, tight joints (`pflaster_dicht`) | **0.75** | DWA-A 138 (2005) |
| Paving, open joints (`pflaster_offen`) | **0.50** | DWA-A 138 (2005) |
| Loam/gravel/grit surface (`lehm_kies`) | **0.40** | Bayreuth guideline 2024 |
| Infiltration paving (`sickerpflaster`) | **0.30** | Bayreuth guideline 2024 (0.0–0.6, mid) |
| Gravel lawn (`schotterrasen`) | **0.30** | DWA-A 138 (2005) |
| Grass pavers (`rasengitter`) | **0.15** | DWA-A 138 (2005) |
| Grass honeycomb (`rasenwabe`) | **0.15** | Bayreuth guideline 2024 |
| Grass / meadow (`rasendecke`) | **0.05** | DWA-A 138 (2005), range 0.0–0.1, mid |

**Limitation:** The Ψ values are mean runoff coefficients for the **design** of infiltration facilities, not measured annual water-balance values. For annual volumes they are an approximation; a robust split into runoff, infiltration and evaporation requires a water-balance calculation according to DWA-M 102-4/BWK-M 3-4 (2022), which is not implemented here.

**DWA-A 138:** worksheet of the German Association for Water, Wastewater and Waste — *Planning, construction and operation of facilities for the infiltration of precipitation water* (2005 edition). Since superseded by **DWA-A 138-1** (*Facilities for the infiltration of precipitation water – Part 1: Planning, construction, operation*, October 2024). The Ψ values are taken from the table of the 2005 edition as reproduced in a technical presentation by the Bavarian Environment Agency (LfU); they have not been checked against the new edition. **Bayreuth guideline 2024:** Bayreuth district office, *Guideline on surface unsealing* (May 2024), a practical guideline with runoff coefficients and cost figures for unsealed surfaces. (Note: the asphalt value was aligned from an earlier 0.95 in the guideline to 0.90 per DWA-A 138.)

#### Slider maximum & realisability

The slider maximum is the **Σ sealed area** of the selection (`Σ area_m2 · seal_rate`). Additionally the panel shows an informative estimate "typically unsealable" (no hard cap), because much of the sealed area is structurally bound (foundations, halls):

| Area type | Realisability factor | Rationale |
|---|---|---|
| Parking lot | 70 % | most of it functionally dispensable |
| Square/market | 45 % | partial greening depending on use |
| Industry/commerce | 40 % | parts of yard/edge areas |
| Mixed use | 35 % | — |
| Special functional use | 35 % | — |
| Residential | 30 % | driveways, yards, front gardens |
| Road | 10 % | only verges/shoulders |
| Default | 40 % | — |

These factors are **own estimates without a literature source** and serve only for context ("Typically realistic: ~X m²").

#### Result interpretations

- **Persons' annual tap-water use:** `infiltration / 44.2`. Basis: **121 L/day/person** — average drinking-water (tap-water) use in 2023 according to BDEW ([press release of 6 Aug 2024](https://www.bdew.de/presse/presseinformationen/zahl-der-woche-121-liter-leitungswasser/)) → 121 · 365 / 1000 ≈ **44.2 m³/person/yr**. This is total household use (showering, toilet, washing …), not drinking alone.
- **Illustrative context** (`formatWasserKontext`): < 2 m³ → buckets @ 10 L; < 150 m³ → bathtubs @ 150 L; otherwise → pools @ 50 m³.
- **Groundwater (context only):** The simulation does **not** calculate groundwater recharge — how much of the additionally retained water reaches the groundwater depends on soil, vegetation, evaporation and depth to the water table, none of which the model knows. For context, the panel states the mean **groundwater recharge from precipitation in the district of Würzburg incl. the city: 96 mm/yr** (Bavarian Environment Agency LfU 2025, model GWN-BW, dataset v2025.1, period 1991–2020, excluding water bodies). The value is an area average over all land uses and is deliberately **not** converted to the unsealed area.

#### Why unsealing yields no Δ°C
The sealing degree in the tool is a type value per land-use class. A surface change (e.g. asphalt → gravel lawn) changes the material and thus Ψ, but not this sealing degree. A coefficient in °C per percentage point of sealing — such as −0.03 °C/% from Tervooren (2015, Potsdam) — therefore cannot be applied meaningfully. The simulation reports the water benefit only.

---

## 8 · Coefficient master reference

All values from `backend/simulation_params.py`. The frontend copy `frontend/src/utils/simulate.js` must be kept in sync.

| Coefficient | Value | Source & derivation | Status in app |
|---|---|---|---|
| `LST_PER_PCT_CANOPY_MIXED` | **−0.083 °C/%** | García de León et al. 2025 (JURSE), Munich, mixed use | **Applied** (tree sim) |
| `LST_PER_PCT_CANOPY_OVERALL` | −0.069 °C/% | García de León et al. 2025, entire city area | stored |
| `LST_PER_PCT_CANOPY_RECREATIONAL` | −0.038 °C/% | García de León et al. 2025, recreational areas (R² 0.41) | stored |
| `CROWN_AREA_M2_DEFAULT` | **50 m²** | conservative default (see below) | applied |
| `TRANSPIRATION_LB3_KG_M2_DAY` | 0.19 kg/m²/day | Stratopoulos-Le Chalony 2020 (TUM diss.), moisture-adapted | stored, currently **not** computed |
| `TRANSPIRATION_LB6_KG_M2_DAY` | 0.17 kg/m²/day | same source, drought-tolerant (−11 %) | stored, currently not computed |
| `LATENT_HEAT_KWH_PER_KG` | 0.628 kWh/kg | physics: 2260 kJ/kg ÷ 3600 | for v2 (transpiration cooling) |
| `RUNOFF_COEFFICIENTS` (Ψ) | 0.90 … 0.05 | DWA-A 138 (2005); Bayreuth guideline 2024 | **applied** (water sim) |
| `ANNUAL_RAINFALL_WUERZBURG_M` | 0.5735 m/yr | DWD station 05705, normal period 1991–2020 | applied |
| `CO2_KG_PER_TREE_YEAR` | **12.5 kg** | Dr. Daniel Klein, Forest Centre Uni Münster | applied |
| `SEAL_RATE_BY_TYPE` | 0.98 … 0.20 | own assumptions (orientation: Böcker 1984, in UBA Texte 141/2021) | applied (slider cap) |
| `CELL_AREA_M2` | 10,000 m² | geometry 100×100 m | — |
| `MIN_GROUND_PER_TREE_M2` | 100 m² | FLL guideline, 2nd-order trees | slider cap (no model cap) |
| `WATER_USE` | 44.2 m³/person/yr | BDEW 2023 (121 L/day) | result contextualisation |

**On the 50 m² crown area:** Deliberately chosen conservatively. Mature crowns of the four main Würzburg species are 62–124 m² per Moser-Reischl et al. 2021 (Würzburg direct study, n=75–89 per species); Pretzsch et al. 2015 gives 65.6 m² for DBH 25 cm. 50 m² is deliberately below that to avoid over-rating young/mid-age new plantings — **not** a mature-state assumption. Typical range 30–80 m² by species and age. The 50 m² apply to **new plantings** only. The **existing stock** (`bestand_pct`) is computed from the measured crown diameter of each cadastre tree (crown area = `π·(kronenbrei/2)²`). Entries without a crown diameter — 761 of 44,647, of which 634 are recorded as “Gehölzfläche” (woody stands) — are not included; an allometric supplement would be possible for only 39 of them (those with a trunk circumference) and is not implemented. In cells with such woody stands, the existing canopy cover is therefore underestimated.

**On the García de León source:** García de León, A. S. et al. (2025): *The Relation of Land Surface Temperature and Trees across Different Urban Land Use Classes based on Remote Sensing*, JURSE 2025, IEEE. Linear regression LST ~ tree-crown share over 8,584 ATKIS land-use polygons; study city Munich, data summer 2020, > 166,000 individual trees from aerial-image segmentation. R² = 0.41 (recreation) to 0.61 (traffic). Transfer to Würzburg is plausible — comparable climate, the same ATKIS land-use classes, a similar method — but has not been checked against Würzburg data.

**On the CO₂ figure 12.5 kg/yr:** Derivation by Dr. Daniel Klein (Forest Centre Uni Münster): beech, 23 m, ∅ 30 cm → ~600 kg dry mass → 1,000 kg CO₂ over 80 years. Applies to **mature** deciduous trees in a forest stand; new plantings sequester far less in the first years. This is a rough rule-of-thumb value from an information leaflet, not a primary study; the original is only available online as a secondary copy. No locally established rate exists for urban trees.

---

## 9 · Comparison of cooling effects (context)

For context on the tree coefficients:

| Measure | Cooling coefficient | Source |
|---|---|---|
| +1 % tree-canopy cover (Munich, mixed use) | −0.083 °C LST | García de León 2025 |
| +1 % tree-canopy cover (Munich, overall) | −0.069 °C LST | García de León 2025 |

Further benchmarks from the literature: trees vs. urban fabric 8–12 K cooling effect in Central Europe (Schwaab 2021); trees 2–4× more effective than treeless green spaces.

---

## 10 · All assumptions & methodological limitations

**10.1 Spatial transferability of the coefficients**

| Coefficient | Origin | Transfer to Würzburg | Status |
|---|---|---|---|
| −0.083 °C/% canopy | Munich | comparable climate, same ATKIS classes; not locally calibrated | applied, plausible, not validated |
| Ψ runoff coefficients | DWA-A 138 (Germany-wide) | design values, approximated for annual volumes | approximation |
| Sealing degrees | own assumptions | no Würzburg measurement | estimate |

**10.2 LST ≠ air temperature.** Land surface temperature is a remote-sensing proxy. Under full sun it runs several °C above air temperature; on overcast days the two converge. All Δ values refer to LST. For comfort statements (PET, UTCI) a separate model would be needed. — *This is the only hint that should stay prominent in the app (banner `LST ≠ air`).*

**10.3 Statistical models, not physical simulation.** Both simulations rest on regression coefficients from field data. They ignore feedbacks (wind, radiation geometry, moisture balance). A physical microclimate simulation (ENVI-met, WRF) would be more precise but far more compute- and data-intensive.

**10.4 100 m grid resolution.** Each cell is a 100×100 m area; finer differences within a cell are not shown.

**10.5 Crown area 50 m²** is a conservative default for mid-age trees; mature Würzburg crowns are 62–124 m², young new plantings far below. Δ°C and canopy cover apply to mid-age-to-mature trees.

**10.6 Sealing degrees** are coarse own assumptions per area type, not measured per-cell sealing. "Unsealed" ≠ actually available (private gardens, existing vegetation, setback areas); the plantable area is an upper bound, not a planting plan.

**10.7 CO₂ 12.5 kg/yr** applies to mature forest trees; city trees often grow more slowly (soil compaction, heat, root space). CO₂ sequestration is a side effect — the primary climate function of city trees is cooling through transpiration and shading.

**10.8 Census confidentiality (§ 16 BStatG):** see ch. 2.3. Affected cells are handled transparently (`clip(0,1)`, marking, no HVI where the age structure is missing).

**10.9 Uncoloured map areas** lie outside the city boundary or were not captured by the sensor (clouds during the composite period).

### Pending improvements
1. **Würzburg calibration** of own LST×canopy coefficients from local data.
2. **Local soil infiltration** from LfU Bavaria soil data (kf values, WFS) instead of literature Ψ.
3. **Copernicus/GHSL imperviousness** (10 m, `JRC/GHSL/P2023A/GHS_BUILT_S`) instead of literature sealing degrees.
4. **Crown area from the cadastre** (`kronenbrei`) instead of the 50 m² default.
5. **Transpiration cooling power (kWh)** as a v2 output of the tree simulation.
6. **Temperature effect of unsealing**, once sealing is measured per area instead of typed (see item 3).

---

## 11 · Glossary

| Term | Definition |
|---|---|
| **LST** | Land surface temperature — surface/radiative temperature, measured in the thermal infrared. Not the air temperature. |
| **`lst_norm`** | Rank-normalised LST value 0–1 (0 = coldest, 1 = hottest cell in the city area). |
| **HVI** | Heat Vulnerability Index — weighted score 1–10 from LST rank and (adjusted) senior share. |
| **Ψ (runoff coefficient)** | dimensionless 0–1: share of rainfall running off at the surface (1 = fully impervious). |
| **Sealing degree** | share of an area unit that is physically sealed. |
| **Runoff-coefficient method** | annual runoff volume = area × annual rainfall × runoff coefficient Ψ. Not to be confused with the rational method, which computes peak discharge from rainfall intensity. |
| **Bayesian shrinkage** | empirical-Bayes estimator: small grid cells are pulled toward the city mean rate to reduce small-numbers bias. |
| **Crookston & Stage (1999)** | negative-exponential overlap model for projected canopy cover: `cover = 1 − exp(−Σ crown area / area)`. |
| **NDVI** | Normalized Difference Vegetation Index — vegetation strength, 0 (sealed) to ~0.7+ (dense vegetation). |
| **LAEA / EPSG:3035** | Lambert Azimuthal Equal Area — coordinate system of the Destatis grid data. |
| **ATKIS** | Official Topographic-Cartographic Information System — official land-use classification in Germany. |
| **DWA-A 138** | DWA worksheet on infiltration facilities (2005 edition, since 10/2024 DWA-A 138-1); primary source of the runoff coefficients. |
| **FLL guideline** | "Recommendations for tree plantings" — basis for the planting distance (100 m²/tree, 2nd order). |

---

## 12 · List of sources

| Source | Dataset / contribution | Licence |
|---|---|---|
| Google Earth Engine (Landsat 8+9, USGS) | LST raster `ST_B10`, summer median 2023–2025 | CC-PDM-1.0 |
| Destatis | Census 2022, 100 m grid (age, population) | dl-de/by-2-0 |
| City of Würzburg (opendata) | tree cadastre (44,647), districts | CC BY 4.0 |
| LDBV Bavaria | ATKIS Basis-DLM (`sie02_f`, `ver01_f`) | CC BY 4.0 |
| OpenStreetMap | parking lots, squares, flat roofs | ODbL |
| DWD (Climate Data Center) | rainfall station 05705, 1991–2020 | DWD Open Data |
| DWA-A 138 (2005), as reproduced by LfU Bavaria; superseded by DWA-A 138-1 (2024) | runoff coefficients Ψ | technical rule (paid) |
| Bayreuth district office (2024) | surface-unsealing guideline, supplementary Ψ/costs | public |
| García de León et al. (2025), Munich | LST×canopy coefficients | scientific publication |
| Crookston & Stage (1999), USDA RMRS-GTR-24 | canopy-cover overlap model | public |
| Moser-Reischl et al. (2021) | Würzburg crown allometry | scientific publication |
| Pretzsch et al. (2015) | crown sizes of 22 tree species | scientific publication |
| Gray et al. (2021) | Beer-Lambert overlap model (validation) | scientific publication |
| Stratopoulos-Le Chalony (2020), TU Munich | transpiration rates LB3/LB6 | dissertation |
| Tervooren (2015), Potsdam | unsealing coefficient −0.03 °C/% (not applied, see ch. 7b) | scientific publication |
| Dr. Daniel Klein, Forest Centre Uni Münster | CO₂ sequestration 12.5 kg/tree/yr | rule of thumb (information leaflet), not a primary study |
| BDEW (2024) | tap-water use 2023: 121 L/person/day — [press release](https://www.bdew.de/presse/presseinformationen/zahl-der-woche-121-liter-leitungswasser/) | public |
| LfU Bavaria (2025) | groundwater recharge from precipitation by district, 1991–2020 (Würzburg: 96 mm/yr) — [PDF](https://www.lfu.bayern.de/wasser/trinkwassereinzugsgebieteverordnung/beschreibung_einzugsgebiet/doc/gwneubildung_n_bayern.pdf) | public |
| UBA Texte 141/2021 (Pannicke-Prochnow et al.) | sealing levels after Böcker (1984), p. 60 — orientation for the own sealing degrees | public |

---

*This documentation bundles the content of `simulation_params.py`, `vuln_formula.py`, and the backend routers. When changing coefficients, update `simulation_params.py` first, then this documentation.*
