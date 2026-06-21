// Globaler App-Zustand via Zustand.
import { create } from 'zustand'

// ── Simulationskonstanten (gespiegelt aus simulation_params.py / utils/simulate.js) ──
const _CROWN_AREA_M2          = 50      // m² pro Baum (CROWN_AREA_M2_DEFAULT)
const _MIN_GROUND_PER_TREE_M2 = 25      // m²/Baum, pflanzpraktischer Slider-Cap
const _CELL_AREA_M2           = 10_000  // m² pro LST-Kachel (100×100 m)

const _SEAL_RATE = {
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
const _getSealRate = (type_key) => _SEAL_RATE[type_key] ?? _SEAL_RATE['_default']

const _FROM_SURFACE = {
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
const _getFromSurface = (type_key) => _FROM_SURFACE[type_key] ?? 'asphalt'

const _SURFACE_ORDER = [
  'asphalt', 'pflaster_dicht', 'pflaster_offen', 'lehm_kies', 'sickerpflaster', 'schotterrasen', 'rasengitter', 'rasenwabe', 'rasendecke',
]
const _getNextBetterSurface = (from) => {
  const idx = _SURFACE_ORDER.indexOf(from)
  if (idx === -1 || idx >= _SURFACE_ORDER.length - 1) return null
  return _SURFACE_ORDER[idx + 1]
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function _computeSealableM2(polygons) {
  return polygons.reduce((sum, p) => sum + p.area_m2 * _getSealRate(p.type_key), 0)
}

// Grober Pre-Cap für anzahl bei Selektionsänderung (volle Fläche, ohne Versiegelung).
// Der seal-aware Finalclamp passiert im BaumSimPanel (kennt seal_pct aus den LST-Daten).
function _baeumeSliderMax(cellsAreaM2) {
  return Math.floor(cellsAreaM2 / _MIN_GROUND_PER_TREE_M2)
}

// ── Store ─────────────────────────────────────────────────────────────────────

const useAppStore = create((set) => ({
  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // ── Mobile-Navigation (Off-Canvas-Schublade < 1024px) ─────────────────────
  mobileNavOpen: false,
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),

  // ── Aktive Karten-Layer — true = sichtbar ──────────────────────────────
  layers: {
    heatmap:            true,
    trees:              false,
    zensus:             false,
    vulnerabilitaet:    true,
    entsiegelung_atkis: true,
    entsiegelung_osm:   true,
    stadtbezirke:       false,
    ndvi:               false,
  },
  toggleLayer: (key) => set((s) => ({
    layers: { ...s.layers, [key]: !s.layers[key] }
  })),

  // ── Layer-Loading-State (globale Overlay-Steuerung) ────────────────────
  layerLoading: {},
  setLayerLoading: (key, isLoading) => set((s) => ({
    layerLoading: { ...s.layerLoading, [key]: isLoading },
  })),

  // ── HVI-Gewichte (nach erstem Fetch befüllt) ───────────────────────────
  vulnWeights: null,
  setVulnWeights: (weights) => set({ vulnWeights: weights }),

  // ── Layer-Daten-Cache (session-persistent, kein Re-Fetch bei Navigation) ──
  layerData: {
    lst:           null,
    trees:         null,
    entsiegelung:  null,
    stadtbezirke:  null,
    vulnerability: null,
    zensus:        null,
    hotspots:      null,
  },
  setLayerData: (key, data) => set((s) => ({
    layerData: { ...s.layerData, [key]: data },
  })),

  // ── Simulation ──────────────────────────────────────────────────────────
  sim: {
    // Sim A — Baumpflanzung
    showBaumkataster: true,     // Baumkataster als Overlay auf der Baum-Simulation
    showSimLst: true,           // LST-Farbcodierung (HeatLayer); aus = nur Raster sichtbar
    showSimAtkis: false,        // ATKIS/Entsiegelungs-Polygone als Versiegelungs-Overlay (Verifikation)
    selectedCells: [],          // number[] — Indizes im LST data-Array; session-only
    selectedCellsAreaM2: 0,     // abgeleitet: selectedCells.length × 10_000

    // Sim B — Entsiegelung
    selectedPolygons: [],       // { idx, type_key, area_m2, label }[]
    selectedPolygonsAreaM2: 0,  // abgeleitet: Σ area_m2

    baeume: {
      anzahl: 100,              // Slider-Wert
    },
    wasser: {
      flaeche_m2: 1000,         // globaler Slider-Wert; max = Σ(area_m2 × seal_rate)
      groupConfig: {},          // { [type_key]: { from_surface: str, to_surface: str } }
    },
  },

  toggleSimBaumkataster: () => set((s) => ({
    sim: { ...s.sim, showBaumkataster: !s.sim.showBaumkataster },
  })),

  toggleSimLst: () => set((s) => ({
    sim: { ...s.sim, showSimLst: !s.sim.showSimLst },
  })),

  toggleSimAtkis: () => set((s) => ({
    sim: { ...s.sim, showSimAtkis: !s.sim.showSimAtkis },
  })),

  // Sim A — Kachel-Selektion
  toggleSimCell: (idx) => set((s) => {
    const cells = s.sim.selectedCells
    const next = cells.includes(idx)
      ? cells.filter((i) => i !== idx)
      : [...cells, idx]
    const newAreaM2    = next.length * _CELL_AREA_M2
    const newMax       = _baeumeSliderMax(newAreaM2)
    const cappedAnzahl = Math.min(s.sim.baeume.anzahl, newMax || 1)
    return {
      sim: {
        ...s.sim,
        selectedCells:     next,
        selectedCellsAreaM2: newAreaM2,
        baeume: { ...s.sim.baeume, anzahl: cappedAnzahl },
      },
    }
  }),

  clearSimCells: () => set((s) => ({
    sim: {
      ...s.sim,
      selectedCells:       [],
      selectedCellsAreaM2: 0,
      baeume: { ...s.sim.baeume, anzahl: 1 },
    },
  })),

  setSimBaeumeAnzahl: (n) => set((s) => ({
    sim: { ...s.sim, baeume: { ...s.sim.baeume, anzahl: n } },
  })),

  // Sim B — Polygon-Selektion
  toggleSimPolygon: ({ idx, type_key, area_m2, label }) => set((s) => {
    const polys   = s.sim.selectedPolygons
    const exists  = polys.some((p) => p.idx === idx)
    const next    = exists
      ? polys.filter((p) => p.idx !== idx)
      : [...polys, { idx, type_key, area_m2, label }]

    // groupConfig: auto-befüllen beim ersten Polygon eines neuen type_key
    const nextConfig = { ...s.sim.wasser.groupConfig }
    if (!exists && !(type_key in nextConfig)) {
      const fromSurf = _getFromSurface(type_key)
      nextConfig[type_key] = {
        from_surface: fromSurf,
        to_surface:   _getNextBetterSurface(fromSurf) ?? fromSurf,
      }
    }
    // groupConfig bereinigen wenn kein Polygon dieses type_key mehr vorhanden
    if (exists) {
      const remaining = next.filter((p) => p.type_key === type_key)
      if (remaining.length === 0) delete nextConfig[type_key]
    }

    const newAreaM2    = next.reduce((sum, p) => sum + p.area_m2, 0)
    const newSealable  = _computeSealableM2(next)
    const cappedFlaeche = Math.min(s.sim.wasser.flaeche_m2, newSealable)

    return {
      sim: {
        ...s.sim,
        selectedPolygons:       next,
        selectedPolygonsAreaM2: newAreaM2,
        wasser: {
          ...s.sim.wasser,
          flaeche_m2:  cappedFlaeche,
          groupConfig: nextConfig,
        },
      },
    }
  }),

  clearSimPolygons: () => set((s) => ({
    sim: {
      ...s.sim,
      selectedPolygons:       [],
      selectedPolygonsAreaM2: 0,
      wasser: { ...s.sim.wasser, flaeche_m2: 0, groupConfig: {} },
    },
  })),

  setSimWasserFlaeche: (m2) => set((s) => ({
    sim: { ...s.sim, wasser: { ...s.sim.wasser, flaeche_m2: m2 } },
  })),

  setSimWasserGroupSurface: (type_key, field, value) => set((s) => ({
    sim: {
      ...s.sim,
      wasser: {
        ...s.sim.wasser,
        groupConfig: {
          ...s.sim.wasser.groupConfig,
          [type_key]: {
            ...s.sim.wasser.groupConfig[type_key],
            [field]: value,
          },
        },
      },
    },
  })),
}))

export default useAppStore
