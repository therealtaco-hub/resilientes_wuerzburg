"""
Analyse- und Berechnungsfunktionen.

Geplante Funktionen:
    scale_lst: entfällt — GEE exportiert ST_B10 bereits als fertige °C-Werte,
        keine weitere Skalierung nötig. Rohe DN-Formel (× 0.00341802 + 149.0 − 273.15)
        gilt nur für direkte Landsat-Downloads, nicht für GEE-Exporte.

    compute_vulnerability_index → umgesetzt als build_hvi_geodataframe() (siehe unten).

    compute_sealing_potential(landuse: gpd.GeoDataFrame) -> gpd.GeoDataFrame
        Bewertet Entsiegelungspotenzial je Fläche anhand ATKIS-Nutzungsklassen.

    simulate_tree_cooling(n_trees: int) -> dict
        Schätzt Temperaturreduktion und CO₂-Bindung für n neue Bäume
        (Formel vom Nutzer vorzugeben).

    simulate_infiltration(area_m2: float) -> dict
        Berechnet Versickerungsvolumen nach Rational-Formel
        (Koeffizienten vom Nutzer vorzugeben).
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
