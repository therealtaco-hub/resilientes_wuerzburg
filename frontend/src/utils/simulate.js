// Spiegelt backend/simulation_params.py für Frontend-Berechnungen (Slider-Max, Proportionierung).
// Bei Änderungen beide Dateien synchron halten.

export const SEAL_RATE = {
  'osm_parking':                   0.95,
  'osm_square':                    0.90,
  'AX_Strassenverkehrsflaeche':    0.98,
  'AX_Platz':                      0.88,
  'AX_IndustrieUndGewerbeflaeche': 0.80,
  'AX_FlaecheGemischterNutzung':   0.65,
  'AX_Wohnbauflaeche':             0.60,
  '_default':                      0.70,
}

export const getSealRate = (type_key) => SEAL_RATE[type_key] ?? SEAL_RATE['_default']

export const FROM_SURFACE_BY_TYPE_KEY = {
  'osm_parking':                   'asphalt',
  'osm_square':                    'asphalt',
  'AX_Strassenverkehrsflaeche':    'asphalt',
  'AX_Platz':                      'asphalt',
  'AX_IndustrieUndGewerbeflaeche': 'asphalt',
  'AX_FlaecheGemischterNutzung':   'sickerpflaster',
  'AX_Wohnbauflaeche':             'sickerpflaster',
}

export const getFromSurface = (type_key) => FROM_SURFACE_BY_TYPE_KEY[type_key] ?? 'asphalt'

export const SURFACE_LABELS = {
  'asphalt':        'Asphalt / Beton',
  'sickerpflaster': 'Sickerpflaster',
  'schotterrasen':  'Schotterrasen',
  'rasengitter':    'Rasengitter',
  'rasenwabe':      'Rasenwabe',
  'lehm_kies':      'Lehm-/Kies-/Splittdecke',
  'rasendecke':     'Rasendecke / Wiese',
}

export const TYPE_KEY_LABELS = {
  'osm_parking':                   'Parkplatz',
  'osm_square':                    'Platz / Markt',
  'AX_Strassenverkehrsflaeche':    'Straßenverkehrsfläche',
  'AX_Platz':                      'Platz (ATKIS)',
  'AX_IndustrieUndGewerbeflaeche': 'Industrie- u. Gewerbefläche',
  'AX_FlaecheGemischterNutzung':   'Fläche gemischter Nutzung',
  'AX_Wohnbauflaeche':             'Wohnbaufläche',
}

export const CROWN_AREA_M2_DEFAULT = 50
