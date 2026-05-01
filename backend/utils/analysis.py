"""
Analyse- und Berechnungsfunktionen.

Geplante Funktionen:
    scale_lst(raw: np.ndarray) -> np.ndarray
        Skaliert rohe Landsat ST_B10-Werte zu Celsius (Formel vom Nutzer vorzugeben).

    compute_vulnerability_index(lst: gpd.GeoDataFrame, census: gpd.GeoDataFrame) -> gpd.GeoDataFrame
        Berechnet gewichteten Vulnerabilitäts-Score aus LST + Senioren-Anteil
        (Gewichtung vom Nutzer vorzugeben).

    compute_sealing_potential(landuse: gpd.GeoDataFrame) -> gpd.GeoDataFrame
        Bewertet Entsiegelungspotenzial je Fläche anhand ATKIS-Nutzungsklassen.

    simulate_tree_cooling(n_trees: int) -> dict
        Schätzt Temperaturreduktion und CO₂-Bindung für n neue Bäume
        (Formel vom Nutzer vorzugeben).

    simulate_infiltration(area_m2: float) -> dict
        Berechnet Versickerungsvolumen nach Rational-Formel
        (Koeffizienten vom Nutzer vorzugeben).
"""
