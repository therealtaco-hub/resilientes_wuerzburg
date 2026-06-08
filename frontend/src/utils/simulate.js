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
  'AX_FlaecheGemischterNutzung':              'sickerpflaster',
  'AX_Wohnbauflaeche':                        'sickerpflaster',
  'AX_FlaecheBesondererFunktionalerPraegung': 'sickerpflaster',
  'AX_SportFreizeitUndErholungsflaeche':      'rasendecke',
  'AX_Friedhof':                              'rasendecke',
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
