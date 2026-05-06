import { GeoJsonLayer } from '@deck.gl/layers'
import { useMemo } from 'react'
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
  return rgb
}

export default function StadtbezirkeLayer({ data, onHover }) {
  const range = useMemo(() => {
    if (!data) return null
    const vals = data.features
      .map(f => f.properties.lst_max)
      .filter(v => Number.isFinite(v))
    if (!vals.length) return null
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [data])

  if (!data || !range) return null

  const span = range.max - range.min || 1

  const layer = new GeoJsonLayer({
    id: 'stadtbezirke-choropleth',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getFillColor: (f) => {
      const v = f.properties.lst_max
      if (!Number.isFinite(v)) return [0, 0, 0, 0]
      const norm = (v - range.min) / span
      return [...heatColor(norm), 140]
    },
    getLineColor: [255, 255, 255, 200],
    lineWidthMinPixels: 1.5,
    updateTriggers: {
      getFillColor: [data, range.min, range.max],
    },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
