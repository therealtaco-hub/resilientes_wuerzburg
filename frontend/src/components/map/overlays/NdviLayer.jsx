import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

// NDVI typische Bandbreite im urbanen Raum: 0 (versiegelt) → 0.7 (dichte Vegetation)
// Negative Werte (Wasser, Schatten) → transparent
const GREEN_LO  = [134, 239, 172, 100]  // hellgrün bei ~0.2
const GREEN_MID = [34,  197, 94,  160]  // mittelgrün bei ~0.45
const GREEN_HI  = [22,  101, 52,  210]  // sattgrün bei ≥ 0.7

function lerp4(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    Math.round(a[3] + (b[3] - a[3]) * t),
  ]
}

function ndviColor(ndvi) {
  if (ndvi == null || ndvi <= 0) return [0, 0, 0, 0]
  const t = Math.min(ndvi / 0.7, 1)
  return t <= 0.5
    ? lerp4(GREEN_LO, GREEN_MID, t * 2)
    : lerp4(GREEN_MID, GREEN_HI, (t - 0.5) * 2)
}

export default function NdviLayer({ data, onHover }) {
  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'ndvi-layer',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getLineColor: [255, 255, 255, 18],
    getLineWidth: 1,
    lineWidthUnits: 'pixels',
    lineWidthMaxPixels: 1,
    getFillColor: (f) => ndviColor(f.properties.ndvi),
    parameters: { depthTest: false, blend: true },
    updateTriggers: { getFillColor: data },
    transitions: { getFillColor: 300 },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
