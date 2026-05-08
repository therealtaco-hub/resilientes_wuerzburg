import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const PURPLE_LO  = [168, 85, 247,   0]
const PURPLE_MID = [168, 85, 247,  90]
const PURPLE_HI  = [168, 85, 247, 180]

function lerp4(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ]
}

// hvi ist auf der 1–10-Skala → auf 0–1 normieren
function vulnColor(hvi) {
  const v = Math.max(0, Math.min(1, ((hvi ?? 1) - 1) / 9))
  return v <= 0.5
    ? lerp4(PURPLE_LO, PURPLE_MID, v * 2)
    : lerp4(PURPLE_MID, PURPLE_HI, (v - 0.5) * 2)
}

export default function VulnLayer({ data, onHover }) {
  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'vuln-layer',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getLineColor: [255, 255, 255, 18],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    lineWidthMaxPixels: 1,
    getFillColor: (f) => vulnColor(f.properties.hvi),
    updateTriggers: {
      getFillColor: data,
    },
    transitions: {
      getFillColor: 300,
    },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
