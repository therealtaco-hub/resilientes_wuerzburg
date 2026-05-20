"""
HVI-Berechnungslogik: Gewichte, Bayesian Shrinkage, Skalierung auf 1–10.

Einzige autoritative Quelle für die Formel — Änderungen hier wirken
auf /api/vulnerability und /api/stadtbezirke gleichzeitig.
"""

import math

WEIGHTS = {
    "lst_norm":      0.6,
    "anteil_65plus": 0.4,
}
# Output-Skala: 1 (niedrigste Vulnerabilität) bis 10 (höchste Vulnerabilität)

assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "Gewichte müssen sich zu 1.0 summieren"

# Bayesian-Shrinkage-Parameter:
# Formel: adjusted = (n * observed + N_PRIOR * global_mean) / (n + N_PRIOR)
# n=3,   observed=1.0, global=0.22 → adjusted ≈ 0.24  (kleine Zelle: stark zur Stadtmittelrate geschrumpft)
# n=200, observed=0.30, global=0.22 → adjusted ≈ 0.28 (große Zelle: kaum verändert)
# Bei n == N_PRIOR liegt die Glaubwürdigkeit bei exakt 50 %.
N_PRIOR = 50


def shrink_senior_rate(
    observed: float,
    n: float,
    global_mean: float,
    n_prior: float = N_PRIOR,
) -> float:
    """Credibility-Schätzer (Empirical Bayes) für den Seniorenanteil einer Rasterzelle.

    Kleine Zellen werden zur bevölkerungsgewichteten Stadtmittelrate gezogen;
    große Zellen behalten im Wesentlichen ihren beobachteten Wert.
    """
    return (n * observed + n_prior * global_mean) / (n + n_prior)


def compute_hvi(row: dict) -> float | None:
    lst = row.get("lst_norm")
    alt = row.get("anteil_65plus")

    if lst is None or alt is None:
        return None
    if isinstance(lst, float) and math.isnan(lst):
        return None
    if isinstance(alt, float) and math.isnan(alt):
        return None

    raw = WEIGHTS["lst_norm"] * float(lst) + WEIGHTS["anteil_65plus"] * float(alt)
    return raw * 9 + 1