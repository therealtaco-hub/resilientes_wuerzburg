import { GeoJsonLayer } from '@deck.gl/layers'
import { useMemo } from 'react'
import DeckOverlay from './DeckOverlay'

export default function StadtbezirkeVulnLayer({ data, onHover }) {
  const range = useMemo(() => {
    if (!data) return null
    const vals = data.features
      .map(f => f.properties.hvi_max)
      .filter(v => Number.isFinite(v))
    if (!vals.length) return null
    return { min: Math.min(...vals), max: Math.max(...vals) }
  }, [data])

  if (!data || !range) return null

  const span = range.max - range.min || 1

  const layer = new GeoJsonLayer({
    id: 'stadtbezirke-vuln-choropleth',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getFillColor: (f) => {
      const v = f.properties.hvi_max
      if (!Number.isFinite(v)) return [0, 0, 0, 0]
      const norm = (v - range.min) / span
      return [168, 85, 247, Math.round(30 + norm * 150)]
    },
    getLineColor: [255, 255, 255, 200],
    lineWidthMinPixels: 1.5,
    updateTriggers: {
      getFillColor: [range.min, range.max],
    },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
