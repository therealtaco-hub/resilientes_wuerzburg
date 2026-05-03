import { ScatterplotLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

export default function TreeLayer({ data }) {
  if (!data) return null

  const layer = new ScatterplotLayer({
    id: 'trees',
    data: data.features,
    getPosition: (f) => f.geometry.coordinates,
    getRadius: 4,
    radiusUnits: 'pixels',
    getFillColor: [34, 197, 94, 180],
    pickable: true,
  })

  return <DeckOverlay layers={[layer]} />
}
