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
    "asphalt":        0.95,  # Referenz: vollversiegelt
    "sickerpflaster": 0.30,  # Porenpflaster (Bandbreite 0.0–0.6, Mitte)
    "schotterrasen":  0.30,  # Kies-/Schotterrasen
    "rasengitter":    0.15,  # Rasengitterelemente (~40 % Grünanteil)
    "rasenwabe":      0.15,  # Rasenwabe (>90 % Grünanteil)
    "lehm_kies":      0.40,  # Lehm-/Kies-/Splittdecke
    "rasendecke":     0.05,  # Vollbegrünung / Wiese (Bandbreite 0.0–0.1, Mitte)
}

# ── HYDROLOGIE ────────────────────────────────────────────────────────────────
# Source: CLAUDE.md (DWD Station Würzburg) — bereits in Projektdokumentation
ANNUAL_RAINFALL_WUERZBURG_M = 0.60  # Meter/Jahr (~600 mm/Jahr)
