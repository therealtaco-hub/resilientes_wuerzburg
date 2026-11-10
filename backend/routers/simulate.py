"""
GET /api/simulate/baeume  — Neupflanzungen → Δ°C + CO₂-Bindung + Kronendeckung
GET /api/simulate/wasser  — Entsiegelungsfläche → m³ zurückgehaltenes Wasser/Jahr (Abflussbeiwert-Ansatz, Jahresvolumen)

Formeln und Koeffizienten ausschließlich aus simulation_params.py.
Wissenschaftliche Herleitung: docs/Dokumentation.md (Kap. 7)
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from simulation_params import (
    ANNUAL_RAINFALL_WUERZBURG_M,
    CO2_KG_PER_TREE_YEAR,
    CONTEXT_PERSONS_M3_PER_YEAR,
    CROWN_AREA_M2_DEFAULT,
    LST_PER_PCT_CANOPY_MIXED,
    RUNOFF_COEFFICIENTS,
    inverse_ratio,
    projected_cover_pct,
)

router = APIRouter()

_VALID_SURFACES = sorted(RUNOFF_COEFFICIENTS.keys())
_LAND_USE_INTERNAL = "mixed"

_LANG_DESCRIPTION = "Sprache der Hinweise (caveats): de | en"

_BAEUME_CAVEATS_DE = [
    (
        "Kronendeckung: projizierte Bodenabdeckung nach dem negativ-exponentiellen "
        "Überlappungsmodell (Crookston & Stage 1999) — 1 − exp(−Σ Kronenfläche / Fläche). "
        "Überlappungen werden berücksichtigt; angenommen wird zufällige (Poisson-)Platzierung "
        "der Kronen. Bei regelmäßig gepflanzten Alleen leicht unterschätzt, bei Park-Clustern "
        "leicht überschätzt."
    ),
    (
        "50 m² Kronenfläche ist ein konservativer Default für mittelalte Bäume "
        "(Pretzsch 2015 / Moser-Reischl 2021); reife Würzburger Kronen liegen bei 62–124 m², "
        "junge Neupflanzungen deutlich darunter. In den ersten Jahren nach Pflanzung ist die "
        "Kühlwirkung entsprechend geringer."
    ),
    (
        "−0,083 °C/% basiert auf García de León et al. (2025; Studie München, Daten Sommer 2020), kalibriert "
        "gegen projizierte Kronendeckung — noch nicht lokal für Würzburg kalibriert."
    ),
    (
        "12,5 kg CO₂/Baum/Jahr ist ein grober Faustwert für eine ausgewachsene Waldbuche "
        "(Wald-Zentrum Uni Münster), keine Primärstudie — Neupflanzungen binden in den "
        "ersten Jahren deutlich weniger."
    ),
    "Stadtbäume wachsen oft langsamer als Waldbäume (Bodenverdichtung, Hitze, Wurzelraum).",
    (
        "CO₂-Bindung ist ein Nebeneffekt; die primäre Klimafunktion von Stadtbäumen ist "
        "Kühlung durch Transpiration und Beschattung."
    ),
    "Kontext: 80 Bäume binden rechnerisch ~1 Tonne CO₂/Jahr.",
]

_BAEUME_CAVEATS_EN = [
    (
        "Canopy cover: projected ground cover from the negative-exponential overlap model "
        "(Crookston & Stage 1999) — 1 − exp(−Σ crown area / area). Overlaps are accounted "
        "for, assuming random (Poisson) crown placement. Slightly underestimated for "
        "regularly planted avenues, slightly overestimated for park clusters."
    ),
    (
        "50 m² crown area is a conservative default for middle-aged trees "
        "(Pretzsch 2015 / Moser-Reischl 2021); mature Würzburg crowns measure 62–124 m², "
        "young new plantings considerably less. In the first years after planting the "
        "cooling effect is correspondingly smaller."
    ),
    (
        "−0.083 °C/% is based on García de León et al. (2025; Munich study, summer 2020 data), "
        "calibrated against projected canopy cover — not yet calibrated locally for Würzburg."
    ),
    (
        "12.5 kg CO₂/tree/year is a rough rule of thumb for a mature forest beech "
        "(Wald-Zentrum, University of Münster), not a primary study — new plantings "
        "sequester considerably less in their first years."
    ),
    "Urban trees often grow more slowly than forest trees (soil compaction, heat, root space).",
    (
        "CO₂ sequestration is a side effect; the primary climate function of urban trees is "
        "cooling through transpiration and shading."
    ),
    "Context: 80 trees sequester roughly 1 tonne of CO₂ per year.",
]

_BAEUME_CAVEATS = {"de": _BAEUME_CAVEATS_DE, "en": _BAEUME_CAVEATS_EN}

_WASSER_CAVEATS = {
    "de": [
        (
            "Ergebnis ist der vermiedene Oberflächenabfluss – Wasser, das vor Ort bleibt. "
            "Wie viel davon versickert oder verdunstet, wird nicht modelliert."
        ),
        (
            "Abflussbeiwerte Ψ nach DWA-A 138 (2005) bzw. Leitfaden Flächenentsiegelung "
            "Landkreis Bayreuth (2024) — Bemessungswerte, für Jahresmengen eine Näherung, "
            "nicht vor Ort gemessen."
        ),
        (
            "Niederschlag: DWD Station Würzburg (573,5 mm/Jahr, Referenzperiode 1991–2020). "
            "Klimawandel kann zukünftige Niederschlagsmengen verändern."
        ),
    ],
    "en": [
        (
            "The result is the avoided surface runoff — water that stays on site. "
            "How much of it infiltrates or evaporates is not modelled."
        ),
        (
            "Runoff coefficients Ψ according to DWA-A 138 (2005) and the unsealing guide of the "
            "district of Bayreuth (2024) — design values, an approximation for annual volumes, "
            "not measured on site."
        ),
        (
            "Precipitation: DWD station Würzburg (573.5 mm/year, reference period 1991–2020). "
            "Climate change may alter future precipitation."
        ),
    ],
}


_SURFACE_QUERY_DESCRIPTION = (
    "Belagstyp. Erlaubte Werte: " + ", ".join(f'"{k}"' for k in _VALID_SURFACES)
)


@router.get("/baeume")
def simulate_baeume(
    n_trees: Annotated[int, Query(..., ge=1, description="Anzahl Neupflanzungen (≥ 1)")],
    area_m2: Annotated[float, Query(..., gt=0, description="Bezugsfläche in m² (> 0)")],
    existing_coverage_pct: Annotated[
        float,
        Query(
            ge=0.0,
            le=100.0,
            description=(
                "Bestehende Kronendeckung der Bezugsfläche in % (0–100). "
                "Default 0 — Aufruf ohne Berücksichtigung des Baumbestands."
            ),
        ),
    ] = 0.0,
    lang: Annotated[Literal["de", "en"], Query(description=_LANG_DESCRIPTION)] = "de",
):
    """
    Berechnet Δ°C LST, CO₂-Bindung und Kronendeckung für N Neupflanzungen
    auf einer gegebenen Fläche unter Berücksichtigung bestehender Kronendeckung.

    Projizierte Kronendeckung nach dem negativ-exponentiellen Überlappungsmodell
    (Crookston & Stage 1999, siehe docs/Dokumentation.md, Kap. 7a):

      1. crown_area_total    = n_trees × CROWN_AREA_M2_DEFAULT
      2. existing_ratio      = −ln(1 − existing_coverage_pct/100)   (inverse Formel; log-sicher)
      3. new_ratio           = crown_area_total / area_m2
      4. total_coverage_pct  = (1 − exp(−(existing_ratio + new_ratio))) × 100
      5. effective_new_pct   = total_coverage_pct − existing_coverage_pct   (≥ 0, ≤ Restspielraum)
      6. delta_lst_celsius   = LST_PER_PCT_CANOPY_MIXED × effective_new_pct
      7. co2_kg_year         = n_trees × CO2_KG_PER_TREE_YEAR

    Bestehende und neue Kronen werden im selben Projektionsraum (Flächen-Verhältnis)
    addiert, damit keine projizierten und naiven Prozente vermischt werden. Δ°C wirkt
    nur auf den *realen* projizierten Deckungszuwachs (= Kalibrierungsgröße García de León);
    der abnehmende Grenznutzen dichter Bestände ist dadurch automatisch abgebildet — ein
    expliziter Headroom-Cap entfällt.
    """
    crown_area_total = n_trees * CROWN_AREA_M2_DEFAULT

    # Bestehende Deckung → äquivalentes Ratio (inverse Formel, log-sicher bei → 100).
    existing_r = inverse_ratio(existing_coverage_pct)

    # Neue Bäume als zusätzliches Flächen-Verhältnis, im selben Projektionsraum addieren.
    new_ratio = crown_area_total / area_m2
    total_ratio = existing_r + new_ratio

    # max() gegen Artefakt bei existing_coverage_pct ∈ (99.9, 100] (Klemm-Residual).
    total_coverage_pct = max(existing_coverage_pct, projected_cover_pct(total_ratio))
    effective_new_pct = total_coverage_pct - existing_coverage_pct  # ≥ 0
    delta_lst_celsius = LST_PER_PCT_CANOPY_MIXED * effective_new_pct
    co2_kg_year = n_trees * CO2_KG_PER_TREE_YEAR

    caveats = list(_BAEUME_CAVEATS[lang])

    return {
        "n_trees": n_trees,
        "area_m2": area_m2,
        "existing_coverage_pct": round(existing_coverage_pct, 1),
        "new_crown_area_ratio": round(new_ratio, 3),
        "effective_new_pct": round(effective_new_pct, 1),
        "total_coverage_pct": round(total_coverage_pct, 1),
        "delta_lst_celsius": round(delta_lst_celsius, 2),
        "co2_kg_year": round(co2_kg_year, 1),
        "coefficients_used": {
            "lst_per_pct_canopy": LST_PER_PCT_CANOPY_MIXED,
            "land_use": _LAND_USE_INTERNAL,
            "crown_area_m2": CROWN_AREA_M2_DEFAULT,
            "co2_kg_per_tree_year": CO2_KG_PER_TREE_YEAR,
        },
        "caveats": caveats,
    }


@router.get("/wasser")
def simulate_wasser(
    area_m2: Annotated[float, Query(..., gt=0, description="Zu entsiegelnde Fläche in m² (> 0)")],
    from_surface: Annotated[str, Query(description=_SURFACE_QUERY_DESCRIPTION)] = "asphalt",
    to_surface: Annotated[str, Query(description=_SURFACE_QUERY_DESCRIPTION)] = "schotterrasen",
    lang: Annotated[Literal["de", "en"], Query(description=_LANG_DESCRIPTION)] = "de",
):
    """
    Berechnet das zusätzlich vor Ort gehaltene Wasser (vermiedener Oberflächenabfluss;
    Feldname infiltration_m3_year aus Kompatibilitätsgründen), Retention und
    Personen-Kontext nach dem Abflussbeiwert-Ansatz (Jahresvolumen).

    Schritt-für-Schritt (siehe docs/Dokumentation.md, Kap. 7b):
      1. C_from              = RUNOFF_COEFFICIENTS[from_surface]
      2. C_to                = RUNOFF_COEFFICIENTS[to_surface]
      3. delta_C             = C_from - C_to
      4. infiltration_m3_yr  = max(0, area_m2 × ANNUAL_RAINFALL_WUERZBURG_M × delta_C)
      5. retention_pct       = (1 - C_to) × 100
      6. context_persons     = infiltration_m3_yr / CONTEXT_PERSONS_M3_PER_YEAR   (BDEW 2023, 121 L/Tag × 365)
    """
    # Unbekannte Belagstypen → 422
    errors = []
    if from_surface not in RUNOFF_COEFFICIENTS:
        errors.append(
            f'from_surface="{from_surface}" unbekannt. Erlaubte Werte: {", ".join(_VALID_SURFACES)}'
        )
    if to_surface not in RUNOFF_COEFFICIENTS:
        errors.append(
            f'to_surface="{to_surface}" unbekannt. Erlaubte Werte: {", ".join(_VALID_SURFACES)}'
        )
    if errors:
        return JSONResponse(status_code=422, content={"detail": errors})

    c_from = RUNOFF_COEFFICIENTS[from_surface]
    c_to = RUNOFF_COEFFICIENTS[to_surface]
    delta_c = c_from - c_to

    infiltration_m3_year = max(0.0, area_m2 * ANNUAL_RAINFALL_WUERZBURG_M * delta_c)
    retention_pct = (1.0 - c_to) * 100.0
    context_persons = infiltration_m3_year / CONTEXT_PERSONS_M3_PER_YEAR

    caveats = list(_WASSER_CAVEATS[lang])
    if delta_c <= 0:
        caveats.insert(
            0,
            f'Zielbelag "{to_surface}" ist gleich oder stärker versiegelt als '
            f'Ausgangsbelag "{from_surface}" → kein zusätzlich zurückgehaltenes Wasser.'
            if lang == "de" else
            f'Target surface "{to_surface}" is as sealed as or more sealed than '
            f'the original surface "{from_surface}" → no additional water retained.',
        )

    return {
        "area_m2": area_m2,
        "from_surface": from_surface,
        "to_surface": to_surface,
        "infiltration_m3_year": round(infiltration_m3_year, 1),
        "retention_pct": round(retention_pct, 1),
        "context_persons": round(context_persons, 1),
        "runoff_coefficients": {
            "from": round(c_from, 3),
            "to": round(c_to, 3),
            "delta": round(delta_c, 3),
        },
        "rainfall_m_year": ANNUAL_RAINFALL_WUERZBURG_M,
        "caveats": caveats,
    }
