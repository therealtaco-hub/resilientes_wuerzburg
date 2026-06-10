"""
GET /api/simulate/baeume  — Neupflanzungen → Δ°C + CO₂-Bindung + Kronendeckung
GET /api/simulate/wasser  — Entsiegelungsfläche → m³ Versickerung/Jahr (Rational-Formel)

Formeln und Koeffizienten ausschließlich aus simulation_params.py.
Wissenschaftliche Herleitung: urban-heat-wiki/wiki/simulation-logic.md
"""

import math
from typing import Annotated

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from simulation_params import (
    ANNUAL_RAINFALL_WUERZBURG_M,
    CO2_KG_PER_TREE_YEAR,
    CROWN_AREA_M2_DEFAULT,
    LST_PER_PCT_CANOPY_MIXED,
    RUNOFF_COEFFICIENTS,
)

router = APIRouter()

_VALID_SURFACES = sorted(RUNOFF_COEFFICIENTS.keys())
_LAND_USE_INTERNAL = "mixed"

_BAEUME_CAVEATS = [
    (
        "Kronendeckung: projizierte Bodenabdeckung nach dem negativ-exponentiellen "
        "Überlappungsmodell (Crookston & Stage 1999) — 1 − exp(−Σ Kronenfläche / Fläche). "
        "Überlappungen werden berücksichtigt; angenommen wird zufällige (Poisson-)Platzierung "
        "der Kronen. Bei regelmäßig gepflanzten Alleen leicht unterschätzt, bei Park-Clustern "
        "leicht überschätzt."
    ),
    (
        "Δ°C und Kronendeckung gelten für den ausgewachsenen Zustand (50 m² Kronenfläche "
        "als Endausbau-Annahme, Pretzsch 2015 / Moser-Reischl 2021); in den ersten Jahren "
        "nach Pflanzung ist die Wirkung deutlich geringer."
    ),
    (
        "−0,083 °C/% basiert auf García de León et al. (München Sommer 2020), kalibriert "
        "gegen projizierte Kronendeckung — noch nicht lokal für Würzburg kalibriert."
    ),
    (
        "12,5 kg CO₂/Baum/Jahr ist ein Mittelwert für ausgewachsene Laubbäume im "
        "Forstbestand — Neupflanzungen binden in den ersten Jahren deutlich weniger."
    ),
    "Stadtbäume wachsen oft langsamer als Waldbäume (Bodenverdichtung, Hitze, Wurzelraum).",
    (
        "CO₂-Bindung ist ein Nebeneffekt; die primäre Klimafunktion von Stadtbäumen ist "
        "Kühlung durch Transpiration und Beschattung."
    ),
    (
        "Kontext: 80 Bäume binden ~1 Tonne CO₂/Jahr — entspricht ca. einer Autobahnfahrt "
        "Würzburg–Hamburg und zurück."
    ),
]

_WASSER_CAVEATS = [
    (
        "Abflussbeiwerte nach Leitfaden Landkreis Bayreuth 2024 — Literaturwerte, "
        "nicht vor Ort gemessen."
    ),
    (
        "Niederschlag: DWD Station Würzburg (573,5 mm/Jahr, Referenzperiode 1991–2020). "
        "Klimawandel kann zukünftige Niederschlagsmengen verändern."
    ),
    "Kein Δ°C in v1 — Tervooren-Koeffizient gilt auf Stadtbezirksebene, nicht für Einzelflächen.",
    (
        "Versiegelungsgrade sind Literaturwerte (v1); v2 verwendet Copernicus Imperviousness "
        "Layer (GEE JRC/GHSL/P2023A/GHS_BUILT_S, 10 m)."
    ),
]


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
):
    """
    Berechnet Δ°C LST, CO₂-Bindung und Kronendeckung für N Neupflanzungen
    auf einer gegebenen Fläche unter Berücksichtigung bestehender Kronendeckung.

    Projizierte Kronendeckung nach dem negativ-exponentiellen Überlappungsmodell
    (Crookston & Stage 1999, siehe simulation-logic.md):

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

    # Bestehende projizierte Deckung → äquivalentes Kronenflächen-Verhältnis (inverse Formel).
    # Schutz gegen log(0) bei existing_coverage_pct → 100.
    existing_pct_safe = min(existing_coverage_pct, 99.9)
    existing_ratio = -math.log(1.0 - existing_pct_safe / 100.0)

    # Neue Bäume als zusätzliches Flächen-Verhältnis, im selben Raum addieren.
    new_ratio = crown_area_total / area_m2
    total_ratio = existing_ratio + new_ratio

    # max() gegen Artefakt am Rand: bei existing_coverage_pct ∈ (99.9, 100] liefert die
    # auf 99.9 geklemmte existing_ratio eine Gesamtdeckung knapp < existing → sonst negativ.
    total_coverage_pct = max(existing_coverage_pct, (1.0 - math.exp(-total_ratio)) * 100.0)
    effective_new_pct = total_coverage_pct - existing_coverage_pct  # physikalisch begrenzt, ≥ 0
    delta_lst_celsius = LST_PER_PCT_CANOPY_MIXED * effective_new_pct
    co2_kg_year = n_trees * CO2_KG_PER_TREE_YEAR

    caveats = list(_BAEUME_CAVEATS)

    return {
        "n_trees": n_trees,
        "area_m2": area_m2,
        "existing_coverage_pct": round(existing_coverage_pct, 1),
        "crown_area_ratio": round(new_ratio, 3),
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
):
    """
    Berechnet Versickerungsvolumen, Retention und Personen-Kontext nach der Rational-Formel.

    Schritt-für-Schritt (siehe simulation-logic.md):
      1. C_from              = RUNOFF_COEFFICIENTS[from_surface]
      2. C_to                = RUNOFF_COEFFICIENTS[to_surface]
      3. delta_C             = C_from - C_to
      4. infiltration_m3_yr  = max(0, area_m2 × ANNUAL_RAINFALL_WUERZBURG_M × delta_C)
      5. retention_pct       = (1 - C_to) × 100
      6. context_persons     = infiltration_m3_yr / 54.75   (150 L/Tag × 365)
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
    context_persons = infiltration_m3_year / 54.75

    caveats = list(_WASSER_CAVEATS)
    if delta_c <= 0:
        caveats.insert(
            0,
            f'Zielbelag "{to_surface}" ist gleich oder stärker versiegelt als '
            f'Ausgangsbelag "{from_surface}" → keine zusätzliche Versickerung.',
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
