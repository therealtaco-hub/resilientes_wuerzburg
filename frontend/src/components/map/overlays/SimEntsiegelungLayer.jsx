import { useMemo } from 'react'
import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

// Farben spiegeln EntsiegelungLayer (Konsistenz mit /entsiegelung).
const TYPE_COLORS = {
  AX_IndustrieUndGewerbeflaeche:            [220,  80,  20, 150],
  AX_Strassenverkehrsflaeche:                [ 55,  60,  72, 150],
  AX_Platz:                                  [175, 135,   5, 150],
  AX_Wohnbauflaeche:                         [170, 130,  75, 150],
  AX_FlaecheGemischterNutzung:               [150, 105,  65, 150],
  osm_parking:                               [245, 158,  11, 150],
  osm_square:                                [ 59, 130, 246, 150],
}
const DEFAULT_COLOR = [100, 100, 110, 150]
const DIM_ALPHA = 50

const AMBER_LINE = [245, 158, 11, 255]
const IDLE_LINE  = [255, 255, 255, 30]

function dim(rgba) {
  return [rgba[0], rgba[1], rgba[2], DIM_ALPHA]
}

export default function SimEntsiegelungLayer({ data, selectedPolygons, onPolygonClick }) {
  // Flachdächer (osm_flat_roof_industrial) ausschließen — kein Bodenbelag, Rational-Formel n/a.
  // Wir merken uns den Original-Feature-Index, damit Selektion stabil über Index identifizierbar bleibt.
  const features = useMemo(() => {
    if (!data) return []
    return data.features
      .map((f, i) => ({ ...f, properties: { ...f.properties, _idx: i } }))
      .filter((f) => f.properties.type_key !== 'osm_flat_roof_industrial')
  }, [data])

  const selectedSet = useMemo(
    () => new Set((selectedPolygons ?? []).map((p) => p.idx)),
    [selectedPolygons],
  )
  const hasSelection = selectedSet.size > 0

  if (!data || features.length === 0) return null

  const layer = new GeoJsonLayer({
    id: 'sim-entsiegelung',
    data: features,
    stroked: true,
    filled: true,
    pickable: true,
    onClick: (info) => {
      if (!info || !info.object || !onPolygonClick) return
      const p = info.object.properties
      onPolygonClick({
        idx:      p._idx,
        type_key: p.type_key,
        area_m2:  p.area_m2,
        label:    p.label,
      })
    },
    getFillColor: (f) => {
      const base = TYPE_COLORS[f.properties.type_key] ?? DEFAULT_COLOR
      const idx = f.properties._idx
      if (selectedSet.has(idx)) return base
      return hasSelection ? dim(base) : base
    },
    getLineColor: (f) => (selectedSet.has(f.properties._idx) ? AMBER_LINE : IDLE_LINE),
    getLineWidth: (f) => (selectedSet.has(f.properties._idx) ? 2 : 0.5),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0,
    parameters: { depthTest: false, blend: true },
    updateTriggers: {
      getFillColor: [selectedSet, hasSelection],
      getLineColor: [selectedSet],
      getLineWidth: [selectedSet],
    },
  })

  return <DeckOverlay layers={[layer]} />
}
