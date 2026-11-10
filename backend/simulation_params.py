"""
Simulation coefficients for Resilientes Würzburg.

Single source of truth for all simulation coefficients; each value carries its
literature reference. Formulas, assumptions and the full list of sources are
documented in docs/Dokumentation.md (in-app page /dokumentation).
"wiki/sources/..." comments point to literature summaries in the urban-heat-wiki
submodule.

When changing a coefficient, update this file first, then docs/Dokumentation.md.
"""

import math

# ── TREE COOLING (Bäume → ΔLST) ───────────────────────────────────────────────
# Source: wiki/sources/garcia-de-leon-lst-trees-munich
# García de León et al. (2025, JURSE), Studie München; Daten Sommer 2020, >166.000 Bäume, lineare Regression
# R² = 0.41 (Recreational) – 0.61 (Traffic). Übertragung auf Würzburg plausibel
# (vergleichbares Klima, gleiche ATKIS-Klassen), aber nicht lokal kalibriert.

LST_PER_PCT_CANOPY_OVERALL      = -0.069  # °C pro 1 % Baumkronendeckung, gesamtes Stadtgebiet
LST_PER_PCT_CANOPY_MIXED        = -0.083  # °C pro 1 % Kronendeckung, Misch-/Wohngebiet
LST_PER_PCT_CANOPY_RECREATIONAL = -0.038  # °C pro 1 % Kronendeckung, Erholungsflächen

# Angenommene mittlere Kronenfläche pro Stadtbaum — konservativer Default.
# Reife Kronen der vier Würzburger Hauptarten liegen laut Moser-Reischl 2021
#   (Würzburg, n=75–89 je Art) bei 62–124 m²; Pretzsch 2015 (Typ 1, DBH=25 cm): 65,6 m².
# 50 m² ist bewusst darunter gewählt, um junge/mittelalte Neupflanzungen nicht zu
#   überschätzen — keine Endausbau-Annahme.
# Quellen: Pretzsch et al. 2015 (Urban For. & Urban Greening 14(3): Kronengrößen 22 Arten,
#   Innenstadt < Park); Moser-Reischl et al. 2021 (Arboric. & Urban For. 47(4): süddt.
#   Stadtbäume, Würzburg-Direktstudie). Typische Bandbreite: 30–80 m² je nach Art und Alter.
CROWN_AREA_M2_DEFAULT = 50.0  # m² pro Baum

# ── TRANSPIRATION NACH BAUMKLASSE ─────────────────────────────────────────────
# Source: wiki/sources/klimabaeume-fuer-die-stadt
# Stratopoulos-Le Chalony 2020 (TUM-Dissertation), Baumschul-Messungen LB3/LB6

TRANSPIRATION_LB3_KG_M2_DAY = 0.19  # feuchteadaptiert (Tilia cordata, Acer platanoides, Carpinus betulus)
TRANSPIRATION_LB6_KG_M2_DAY = 0.17  # trockenheitstolerant (Tilia tomentosa, Acer campestre, Ostrya carpinifolia)
# Differenz: –11 % Transpiration bei trockenheitstoleranter Artenauswahl

# Physikalische Konstante: Verdampfungswärme Wasser
LATENT_HEAT_KWH_PER_KG = 0.628  # kWh pro kg Verdunstung (2260 kJ/kg ÷ 3600)

# ── ABFLUSSBEIWERTE NACH BELAGSTYP ────────────────────────────────────────────
# Sources: DWA-A 138 (Ausgabe 2005), Tabelle der mittleren Abflussbeiwerte, wiedergegeben in einer
#   Fachpräsentation des LfU Bayern (wiki/sources/dwa-a138-lfu-regenwasser-bayern). Abgelöst durch
#   DWA-A 138-1 (10/2024) — Werte dagegen nicht geprüft.
#   Ergänzend: Leitfaden Flächenentsiegelung Landkreis Bayreuth 2024
#   (wiki/sources/leitfaden-flaechenentsiegelung-2024).
# Ψ = Anteil des Niederschlags, der oberflächlich abfließt (0.0 = nichts, 1.0 = alles).
# Bemessungswerte — für Jahresmengen eine Näherung.

RUNOFF_COEFFICIENTS: dict[str, float] = {
    "asphalt":        0.90,  # Asphalt / fugenloser Beton — DWA-A 138 (2005), Ψ = 0,9; zuvor 0,95 aus Leitfaden Bayreuth
    "pflaster_dicht": 0.75,  # Pflaster mit dichten Fugen — DWA-A 138 (2005), Ψ = 0,75
    "pflaster_offen": 0.50,  # Pflaster mit offenen Fugen — DWA-A 138 (2005), Ψ = 0,5
    "lehm_kies":      0.40,  # Lehm-/Kies-/Splittdecke — Leitfaden Bayreuth 2024 (Ψ = 0,4)
    "sickerpflaster": 0.30,  # Porenpflaster / Sickerpflaster (speziell versickerungsfähig) — Leitfaden Bayreuth 2024 (Ψ = 0,0–0,6, Mitte 0,3)
    "schotterrasen":  0.30,  # Lockerer Kiesbelag / Schotterrasen — DWA-A 138 (2005), Ψ = 0,3
    "rasengitter":    0.15,  # Rasengittersteine — DWA-A 138 (2005), Ψ = 0,15
    "rasenwabe":      0.15,  # Rasenwabe (>90 % Grünanteil) — Leitfaden Bayreuth 2024 (Ψ = 0,15)
    "rasendecke":     0.05,  # Gärten / Wiesen / Kulturland flach — DWA-A 138 (2005), Ψ = 0,0–0,1, Mitte
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
# ⚠ Grober Faustwert aus einer Informationsschrift (Waldbuche), keine Primärstudie;
#   Original online nur als Sekundärkopie auffindbar. Keine lokal belegte Rate für Stadtbäume.
CO2_KG_PER_TREE_YEAR = 12.5

# ── VERSIEGELUNGSGRADE JE FLÄCHENTYP ─────────────────────────────────────────
# v1: eigene Annahmen je Nutzungsart — keine direkt übernommenen Literaturwerte.
#   Grobe Orientierung: Versiegelungsstufen nach Böcker (1984), wiedergegeben in
#   UBA Texte 141/2021, S. 60 (mäßig ~30 %, mittel ~60 %, stark ~80 %, sehr stark ~90 %).
# v2 (TODO): gemessene Per-Zellen-Versiegelung statt Typ-Schätzung
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

# ── GITTER-KONSTANTE ──────────────────────────────────────────────────────────
CELL_AREA_M2 = 10_000  # Fläche einer 100×100-m Zensus/LST-Gitterkachel

# ── ÜBERLAPPUNGSMODELL-HELPER (Crookston & Stage 1999) ─────────────────────────
# Einzige Definition der Vorwärts- und Inversformel für den gesamten Backend-Stack.
# data_loader._compute_bestand_pct, routers.simulate und tests nutzen diese Helper.
# Das Frontend (BaumSimPanel.jsx) spiegelt die Formel eigenständig — bei Änderung
# hier auch dort aktualisieren.

def projected_cover_pct(ratio: float) -> float:
    """Projizierte Kronendeckung (%) aus Flächen-Verhältnis (Crookston & Stage 1999).

    ratio = Σ Kronenfläche / Bezugsfläche. Rückgabe in [0, 100) — asymptotisch,
    kein clip nötig.
    """
    return (1.0 - math.exp(-ratio)) * 100.0


def inverse_ratio(pct: float) -> float:
    """Invertierte Formel: Kronendeckung (%) → äquivalentes Flächen-Verhältnis.

    Klemmt auf [0, 99.9] zum Schutz vor log(0) bei pct → 100.
    """
    pct_safe = min(max(pct, 0.0), 99.9)
    return -math.log(1.0 - pct_safe / 100.0)


# ── WASSERKONTEXT-KONSTANTE ───────────────────────────────────────────────────
# Source: BDEW, „Zahl der Woche: 121 Liter Leitungswasser" (Pressemitteilung 06.08.2024),
#   durchschnittlicher Trinkwassergebrauch pro Person und Tag im Jahr 2023, Deutschland.
#   https://www.bdew.de/presse/presseinformationen/zahl-der-woche-121-liter-leitungswasser/
# Frontend spiegelt: simulate.js WATER_USE_M3_PER_PERSON_YEAR ≈ 44.2 m³/Jahr
DAILY_WATER_USE_L_PER_PERSON = 121  # L/Person/Tag
CONTEXT_PERSONS_M3_PER_YEAR = DAILY_WATER_USE_L_PER_PERSON * 365 / 1000.0  # ≈ 44.2 m³
