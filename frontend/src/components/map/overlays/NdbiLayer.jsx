import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

// NDBI typische Bandbreite im urbanen Raum: -0.2 (Vegetation) → 0.4 (dicht bebaut)
// Werte ≤ 0 → transparent (Vegetation/Wasser dominiert — kein Built-up-Signal)
const ORANGE_LO = [254, 215, 170, 110]  // hellorange bei ~0.05
const ORANGE_MID = [234, 88,  12, 170]  // orange bei ~0.2
const BROWN_HI  = [154, 52,  18, 210]  // dunkelbraun bei ≥ 0.4

function lerp4(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ]
}

function ndbiColor(ndbi) {
  if (ndbi == null || ndbi <= 0) return [0, 0, 0, 0]
  const t = Math.min(ndbi / 0.4, 1)
  return t <= 0.5
    ? lerp4(ORANGE_LO, ORANGE_MID, t * 2)
    : lerp4(ORANGE_MID, BROWN_HI, (t - 0.5) * 2)
}

export default function NdbiLayer({ data, onHover }) {
  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'ndbi-layer',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getLineColor: [255, 255, 255, 18],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    lineWidthMaxPixels: 1,
    getFillColor: (f) => ndbiColor(f.properties.ndbi),
    parameters: { depthTest: false, blend: true },
    updateTriggers: { getFillColor: data },
    transitions: { getFillColor: 300 },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
