import { create } from 'zustand'

const useAppStore = create((set) => ({
  // Aktive Karten-Layer
  layers: {
    heatmap:         true,
    trees:           false,
    zensus:          false,
    vulnerabilitaet: false,
    entsiegelung_atkis: true,
    entsiegelung_osm:   true,
  },
  toggleLayer: (key) => set((s) => ({
    layers: { ...s.layers, [key]: !s.layers[key] }
  })),

  // Gewichte des HVI (nach erstem Fetch befüllt)
  vulnWeights: null,
  setVulnWeights: (weights) => set({ vulnWeights: weights }),

  // Simulationsparameter
  sim: {
    baeume: { anzahl: 500 },
    wasser: { flaeche: 5000, bodenart: 'lehmig' },
  },
  setSimParam: (sim, key, value) => set((s) => ({
    sim: { ...s.sim, [sim]: { ...s.sim[sim], [key]: value } }
  })),
}))

export default useAppStore
