import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const GREEN = [34, 197, 94]
const AMBER = [245, 158, 11]
const RED   = [239, 68,  68]

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function heatColor(norm) {
  const v = norm ?? 0
  const rgb = v <= 0.5 ? lerp(GREEN, AMBER, v * 2) : lerp(AMBER, RED, (v - 0.5) * 2)
  return [...rgb, 180]
}

export default function HeatLayer({ data, onHover }) {
  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'lst-choropleth',
    data,
    stroked: false,
    filled: true,
    pickable: true,
    getFillColor: (f) => heatColor(f.properties.lst_norm),
    updateTriggers: {
      getFillColor: data,
    },
    transitions: {
      getFillColor: 300,
    },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
