import { ScatterplotLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

// Laubbaum: grün · Nadelbaum: türkis · unbekannt: grün
const COLOR_LAUB   = [34, 197, 94, 190]
const COLOR_NADEL  = [20, 184, 166, 190]

export default function TreeLayer({ data, onTreeClick }) {
  if (!data) return null

  const layer = new ScatterplotLayer({
    id: 'trees',
    data: data.features,
    getPosition: (f) => f.geometry.coordinates,
    // Radius = halber Kronendurchmesser in echten Metern, min 3 m
    getRadius: (f) => Math.max(3, (f.properties.kronenbrei || 0) / 2),
    radiusUnits: 'meters',
    getFillColor: (f) =>
      f.properties.baumtyp === 'Nadelbaum' ? COLOR_NADEL : COLOR_LAUB,
    pickable: true,
    onClick: onTreeClick ? (info) => onTreeClick(info) : undefined,
    updateTriggers: { getRadius: [], getFillColor: [] },
  })

  return <DeckOverlay layers={[layer]} />
}
