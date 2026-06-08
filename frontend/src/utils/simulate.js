// Spiegelt backend/simulation_params.py für Frontend-Berechnungen (Slider-Max, Proportionierung).
// Bei Änderungen beide Dateien synchron halten.

export const SEAL_RATE = {
  'osm_parking':                              0.95,
  'osm_square':                               0.90,
  'AX_Strassenverkehr':                       0.98,
  'AX_Platz':                                 0.88,
  'AX_IndustrieUndGewerbeflaeche':            0.80,
  'AX_FlaecheGemischterNutzung':              0.65,
  'AX_Wohnbauflaeche':                        0.60,
  'AX_FlaecheBesondererFunktionalerPraegung': 0.60,
  'AX_SportFreizeitUndErholungsflaeche':      0.20,
  'AX_Friedhof':                              0.20,
  '_default':                                 0.70,
}

export const getSealRate = (type_key) => SEAL_RATE[type_key] ?? SEAL_RATE['_default']

export const FROM_SURFACE_BY_TYPE_KEY = {
  'osm_parking':                              'asphalt',
  'osm_square':                               'asphalt',
  'AX_Strassenverkehr':                       'asphalt',
  'AX_Platz':                                 'asphalt',
  'AX_IndustrieUndGewerbeflaeche':            'asphalt',
  'AX_FlaecheGemischterNutzung':              'pflaster_dicht',
  'AX_Wohnbauflaeche':                        'pflaster_dicht',
  'AX_FlaecheBesondererFunktionalerPraegung': 'pflaster_dicht',
  'AX_SportFreizeitUndErholungsflaeche':      'rasendecke',
  'AX_Friedhof':                              'rasendecke',
}

export const getFromSurface = (type_key) => FROM_SURFACE_BY_TYPE_KEY[type_key] ?? 'asphalt'

export const SURFACE_LABELS = {
  'asphalt':        'Asphalt / Beton',
  'pflaster_dicht': 'Pflaster (dichte Fugen)',
  'pflaster_offen': 'Pflaster (offene Fugen)',
  'lehm_kies':      'Lehm-/Kies-/Splittdecke',
  'sickerpflaster': 'Sickerpflaster',
  'schotterrasen':  'Schotterrasen',
  'rasengitter':    'Rasengitter',
  'rasenwabe':      'Rasenwabe',
  'rasendecke':     'Rasendecke / Wiese',
}

// Versiegelungsstufen, absteigend nach Abflussbeiwert (höchste → geringste Versiegelung)
// Quellen: DWA-A138 / LfU Bayern; Leitfaden Flächenentsiegelung Bayreuth 2024
export const SURFACE_ORDER = [
  'asphalt',
  'pflaster_dicht',
  'pflaster_offen',
  'lehm_kies',
  'sickerpflaster',
  'schotterrasen',
  'rasengitter',
  'rasenwabe',
  'rasendecke',
]

export const getNextBetterSurface = (from) => {
  const idx = SURFACE_ORDER.indexOf(from)
  if (idx === -1 || idx >= SURFACE_ORDER.length - 1) return null
  return SURFACE_ORDER[idx + 1]
}

export const isAlreadyGreenest = (from) => getNextBetterSurface(from) === null

export const TYPE_KEY_LABELS = {
  'osm_parking':                              'Parkplatz',
  'osm_square':                               'Platz / Markt',
  'AX_Strassenverkehr':                       'Straßenverkehrsfläche',
  'AX_Platz':                                 'Platz (ATKIS)',
  'AX_IndustrieUndGewerbeflaeche':            'Industrie- u. Gewerbefläche',
  'AX_FlaecheGemischterNutzung':              'Fläche gemischter Nutzung',
  'AX_Wohnbauflaeche':                        'Wohnbaufläche',
  'AX_FlaecheBesondererFunktionalerPraegung': 'Bes. funktionaler Prägung',
  'AX_SportFreizeitUndErholungsflaeche':      'Sport & Freizeit',
  'AX_Friedhof':                              'Friedhof',
}

export const CROWN_AREA_M2_DEFAULT = 50

// Ψ-Abflussbeiwerte je Belagstyp (gespiegelt aus simulation_params.py RUNOFF_COEFFICIENTS)
// Quellen: DWA-A138 / LfU Bayern; Leitfaden Flächenentsiegelung Landkreis Bayreuth 2024
export const RUNOFF_COEFFICIENTS = {
  asphalt:        0.90,
  pflaster_dicht: 0.75,
  pflaster_offen: 0.50,
  lehm_kies:      0.40,
  sickerpflaster: 0.30,
  schotterrasen:  0.30,
  rasengitter:    0.15,
  rasenwabe:      0.15,
  rasendecke:     0.05,
}

// Schätzwert: wie viel % der versiegelten Fläche ist je Flächentyp typischerweise entsiegelbar?
// Kein harter Cap — dient nur als informativer Hinweis in der UI.
// Hintergrund: Ein Großteil der versiegelten Fläche entfällt auf Gebäudeflächen (Fundamente,
// Fabrikhallen, Wohngebäude), die nicht entsiegelt werden können.
export const TYPICAL_REALIZATION_RATE = {
  osm_parking:                              0.70,
  osm_square:                               0.45,
  AX_Strassenverkehr:                       0.10,
  AX_Platz:                                 0.45,
  AX_IndustrieUndGewerbeflaeche:            0.40,
  AX_FlaecheGemischterNutzung:              0.35,
  AX_Wohnbauflaeche:                        0.30,
  AX_FlaecheBesondererFunktionalerPraegung: 0.35,
  _default:                                 0.40,
}
export const getTypicalRealizationRate = (type_key) =>
  TYPICAL_REALIZATION_RATE[type_key] ?? TYPICAL_REALIZATION_RATE['_default']
