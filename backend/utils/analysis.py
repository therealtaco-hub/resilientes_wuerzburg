"""
Analyse- und Berechnungsfunktionen.

Implementiert:
    build_hvi_geodataframe() — HVI-Berechnung auf Zellebene; einzige Stelle
    im Projekt, an der HVI berechnet wird. Routers (vulnerability, stadtbezirke)
    rufen diese Funktion auf — nie direkt compute_hvi().

Noch nicht implementiert (für Simulationsseiten):
    compute_sealing_potential()  — Entsiegelungspotenzial je ATKIS-Fläche
    simulate_tree_cooling()      — Δ°C + CO₂ für n Neupflanzungen
    simulate_infiltration()      — m³ Versickerung nach Rational-Formel
"""

import math

import geopandas as gpd

from utils.vuln_formula import compute_hvi, shrink_senior_rate


def _safe(val):
    if val is None:
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (TypeError, ValueError):
        return None


def build_hvi_geodataframe(
    zensus: gpd.GeoDataFrame,
    lst: gpd.GeoDataFrame,
) -> tuple[gpd.GeoDataFrame, float]:
    """Berechnet HVI für jede Zensus-Zelle mit Bayesian Shrinkage.

    LST und Zensus teilen dasselbe Destatis-100m-Gitter (EPSG:3035) — der
    Merge erfolgt direkt über die Integer-Mittelpunktkoordinaten x_mp_100m /
    y_mp_100m, kein Spatial Join nötig.

    Returns:
        gdf: GeoDataFrame mit Spalten hvi, anteil_65plus, anteil_65plus_adj,
             lst_celsius, lst_norm, Einwohner, geometry (NaN-Zeilen bleiben erhalten)
        global_65_rate: bevölkerungsgewichtete Stadtmittelrate der 65+-Jährigen
    """
    joined = zensus[["anteil_65plus", "Einwohner", "x_mp_100m", "y_mp_100m", "geometry"]].merge(
        lst[["x_mp_100m", "y_mp_100m", "lst_norm", "lst_celsius"]],
        on=["x_mp_100m", "y_mp_100m"],
        how="left",
    )
    joined = gpd.GeoDataFrame(joined, geometry="geometry", crs=zensus.crs)

    # Bevölkerungsgewichtete Stadtmittelrate (Prior-Mean für Bayesian Shrinkage).
    # Kleine Zellen werden zu dieser Rate gezogen statt unrealistische Extremwerte
    # (z. B. anteil_65plus = 1.0 bei 3 Einwohnern) in den HVI einfließen zu lassen.
    valid = (
        joined["anteil_65plus"].notna()
        & joined["Einwohner"].notna()
        & (joined["Einwohner"] > 0)
    )
    if valid.sum() > 0:
        total_seniors  = (joined.loc[valid, "anteil_65plus"] * joined.loc[valid, "Einwohner"]).sum()
        total_pop      = joined.loc[valid, "Einwohner"].sum()
        global_65_rate = float(total_seniors / total_pop)
    else:
        global_65_rate = 0.20  # Fallback: ~20 % entspricht deutschem Städtedurchschnitt

    def _adj_rate(row):
        raw = _safe(row["anteil_65plus"])
        n   = _safe(row["Einwohner"])
        if raw is not None and n is not None and n > 0:
            return shrink_senior_rate(raw, n, global_65_rate)
        return raw

    joined["anteil_65plus_adj"] = joined.apply(_adj_rate, axis=1)
    joined["hvi"] = joined.apply(
        lambda r: compute_hvi({
            "lst_norm":      _safe(r["lst_norm"]),
            "anteil_65plus": r["anteil_65plus_adj"],
        }),
        axis=1,
    )

    return joined, global_65_rate
