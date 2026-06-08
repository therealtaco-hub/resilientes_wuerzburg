"""
Simulation coefficients for Resilientes Würzburg.

All values are sourced from the research wiki at:
  C:\\Code\\Obsidian\\Urban Heat Mapping\\wiki\\

Before changing any coefficient, update the relevant wiki source page first,
then reflect the change here with an updated source reference.
Simulation logic (formulas, input/output contracts) is documented at:
  C:\\Code\\Obsidian\\Urban Heat Mapping\\wiki\\simulation-logic.md
"""

# ── TREE COOLING (Bäume → ΔLST) ───────────────────────────────────────────────
# Source: wiki/sources/garcia-de-leon-lst-trees-munich
# García de León et al., München Sommer 2020, >166.000 Bäume, lineare Regression
# R² = 0.41 (Recreational) – 0.61 (Traffic); Würzburg-Forscher → direkt übertragbar

LST_PER_PCT_CANOPY_OVERALL      = -0.069  # °C pro 1 % Baumkronendeckung, gesamtes Stadtgebiet
LST_PER_PCT_CANOPY_MIXED        = -0.083  # °C pro 1 % Kronendeckung, Misch-/Wohngebiet
LST_PER_PCT_CANOPY_RECREATIONAL = -0.038  # °C pro 1 % Kronendeckung, Erholungsflächen

# Angenommene mittlere Kronenfläche pro Stadtbaum (Literaturwert, keine Würzburg-Quelle)
# Typische Bandbreite: 30–80 m² je nach Art und Alter
CROWN_AREA_M2_DEFAULT = 50.0  # m² pro Baum

# ── TRANSPIRATION NACH BAUMKLASSE ─────────────────────────────────────────────
# Source: wiki/sources/klimabaeume-fuer-die-stadt
# Stratopoulos-Le Chalony 2020 (TUM-Dissertation), Baumschul-Messungen LB3/LB6

TRANSPIRATION_LB3_KG_M2_DAY = 0.19  # feuchteadaptiert (Tilia cordata, Acer platanoides, Carpinus betulus)
TRANSPIRATION_LB6_KG_M2_DAY = 0.17  # trockenheitstolerant (Tilia tomentosa, Acer campestre, Ostrya carpinifolia)
# Differenz: –11 % Transpiration bei trockenheitstoleranter Artenauswahl

# Physikalische Konstante: Verdampfungswärme Wasser
LATENT_HEAT_KWH_PER_KG = 0.628  # kWh pro kg Verdunstung (2260 kJ/kg ÷ 3600)

# ── ENTSIEGELUNG → ΔLST ───────────────────────────────────────────────────────
# Source: wiki/sources/tervooren-2015-gruenvolumen-potsdam
# Tervooren 2015, Potsdam (Cfb), Landsat LST, OLR R²=0.75 / GWR R²=0.80
# Einschränkung: Potsdam Cfb → Würzburg Dfb — Übertragung plausibel, nicht validiert

LST_PER_PCT_UNSEALING = -0.03  # °C pro 1 % Reduktion der Versiegelungsfläche

# ── ABFLUSSBEIWERTE NACH BELAGSTYP ────────────────────────────────────────────
# Source: wiki/sources/leitfaden-flaechenentsiegelung-2024 (Landkreis Bayreuth, 2024)
# Abflussbeiwert = Anteil des Niederschlags, der abfließt (nicht versickert)
# 0.0 = alles versickert, 1.0 = nichts versickert

RUNOFF_COEFFICIENTS: dict[str, float] = {
    "asphalt":        0.90,  # Asphalt / fugenloser Beton — DWA-A138 / LfU Bayern (Ψ = 0,9); zuvor 0,95 aus Leitfaden Bayreuth
    "pflaster_dicht": 0.75,  # Pflaster mit dichten Fugen — DWA-A138 / LfU Bayern (Ψ = 0,75)
    "pflaster_offen": 0.50,  # Pflaster mit offenen Fugen — DWA-A138 / LfU Bayern (Ψ = 0,5)
    "lehm_kies":      0.40,  # Lehm-/Kies-/Splittdecke — Leitfaden Bayreuth 2024 (Ψ = 0,4)
    "sickerpflaster": 0.30,  # Porenpflaster / Sickerpflaster (speziell versickerungsfähig) — Leitfaden Bayreuth 2024 (Ψ = 0,0–0,6, Mitte 0,3)
    "schotterrasen":  0.30,  # Lockerer Kiesbelag / Schotterrasen — DWA-A138 / LfU Bayern (Ψ = 0,3)
    "rasengitter":    0.15,  # Rasengittersteine — DWA-A138 / LfU Bayern (Ψ = 0,15)
    "rasenwabe":      0.15,  # Rasenwabe (>90 % Grünanteil) — Leitfaden Bayreuth 2024 (Ψ = 0,15)
    "rasendecke":     0.05,  # Gärten / Wiesen / Kulturland flach — DWA-A138 / LfU Bayern (Ψ = 0,0–0,1, Mitte)
}

# ── HYDROLOGIE ────────────────────────────────────────────────────────────────
# Source: DWD Climate Data Center
#   Station: Würzburg, ID 05705 (49.7704°N, 9.9576°E, 268 m ü. NN)
#   Datei:   monatswerte_KL_05705_18810101_20241231_hist.zip
#   Spalte:  MO_RR (monatliche Niederschlagshöhe in mm)
#   Referenzperiode: 1991–2020 (DWD-Klimanormalperiode), 360/360 gültige Monatswerte
#   Berechnung: Σ(MO_RR pro Jahr) / 30 Jahre = 573,5 mm/Jahr → 0,5735 m/Jahr
#
#   Jahressummen-Bandbreite: 394 mm (1991) – 806 mm (2002), Median 556 mm
#   Monatliche Mittelwerte (mm):
#     Jan 40.0 | Feb 35.8 | Mär 40.2 | Apr 32.7 | Mai 57.3 | Jun 52.9
#     Jul 65.8 | Aug 56.3 | Sep 47.2 | Okt 47.5 | Nov 46.2 | Dez 51.5

ANNUAL_RAINFALL_WUERZBURG_M = 0.5735  # m/Jahr (573,5 mm — DWD Referenzperiode 1991–2020)

# Monatliche Mittelwerte für zukünftige saisonale Simulation (mm)
MONTHLY_RAINFALL_WUERZBURG_MM: dict[int, float] = {
    1: 40.0, 2: 35.8, 3: 40.2, 4: 32.7, 5: 57.3,  6: 52.9,
    7: 65.8, 8: 56.3, 9: 47.2, 10: 47.5, 11: 46.2, 12: 51.5,
}

# ── CO₂-BINDUNG ───────────────────────────────────────────────────────────────
# Quelle: Dr. Daniel Klein, Wald-Zentrum Universität Münster
#   Herleitung: Buche, 23 m, ∅ 30 cm → ~600 kg Trockenmasse → 1.000 kg CO₂ in 80 Jahren
# ⚠ Gilt für ausgewachsene Laubbäume im Forstbestand — Neupflanzungen binden deutlich weniger.
# ⚠ Noch nicht als Wiki-Seite ingested — vor Produktionsrelease nachholen.
CO2_KG_PER_TREE_YEAR = 12.5

# ── VERSIEGELUNGSGRADE JE FLÄCHENTYP ─────────────────────────────────────────
# v1: Literaturwerte (UBA Texte 141/2021, Leitfaden Bayreuth 2024, DIN 18005)
# ⚠ v2: Durch Copernicus Imperviousness Layer ersetzen
#   (GEE: JRC/GHSL/P2023A/GHS_BUILT_S, 10 m, via spatial join auf selektierte Polygone)
# Flachdächer (osm_flat_roof_industrial) explizit ausgeschlossen — kein Bodenbelag.
SEAL_RATE_BY_TYPE: dict[str, float] = {
    "osm_parking":                              0.95,
    "osm_square":                               0.90,
    "AX_Strassenverkehr":                       0.98,
    "AX_Platz":                                 0.88,
    "AX_IndustrieUndGewerbeflaeche":            0.80,
    "AX_FlaecheGemischterNutzung":              0.65,
    "AX_Wohnbauflaeche":                        0.60,
    "AX_FlaecheBesondererFunktionalerPraegung": 0.60,
    "AX_SportFreizeitUndErholungsflaeche":      0.20,
    "AX_Friedhof":                              0.20,
    "_default":                                 0.70,
}
