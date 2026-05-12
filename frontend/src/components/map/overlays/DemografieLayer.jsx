import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const BLUE_LO = [219, 234, 254, 160]
const BLUE_HI = [30,   58, 138, 160]

function lerp4(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ]
}

function demografieColor(anteil) {
  const v = Math.max(0, Math.min(1, anteil ?? 0))
  return lerp4(BLUE_LO, BLUE_HI, v)
}

export default function DemografieLayer({ data, onHover }) {
  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'demografie-layer',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getLineColor: [255, 255, 255, 18],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    lineWidthMaxPixels: 1,
    getFillColor: (f) => demografieColor(f.properties.anteil_65plus),
    parameters: { depthTest: false, blend: true },
    updateTriggers: {
      getFillColor: data,
    },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
