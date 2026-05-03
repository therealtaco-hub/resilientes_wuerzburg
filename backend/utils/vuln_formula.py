import math

WEIGHTS = {
    "lst_norm":      0.6,
    "anteil_65plus": 0.4,
}
# Output-Skala: 1 (niedrigste Vulnerabilität) bis 10 (höchste Vulnerabilität)

assert abs(sum(WEIGHTS.values()) - 1.0) < 1e-9, "Gewichte müssen sich zu 1.0 summieren"


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