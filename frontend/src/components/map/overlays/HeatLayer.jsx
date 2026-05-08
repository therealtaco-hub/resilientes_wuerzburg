import { useMemo } from 'react'
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const GREEN = [34, 197, 94]
const AMBER = [245, 158, 11]
const RED   = [239, 68,  68]
const BLUE  = [59,  130, 246]
const WHITE = [255, 255, 255]

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

// 3-point asymmetric scale: actualMin → BLUE, 0 → WHITE, actualMax → RED
function deltaColor(delta, actualMin, actualMax) {
  if (delta == null || !isFinite(delta)) return [128, 128, 128, 160]
  let rgb
  if (delta <= 0) {
    const t = actualMin < 0 ? delta / actualMin : 0   // 0 at zero, 1 at actualMin
    rgb = lerp(WHITE, BLUE, Math.max(0, Math.min(1, t)))
  } else {
    const t = actualMax > 0 ? delta / actualMax : 0   // 0 at zero, 1 at actualMax
    rgb = lerp(WHITE, RED, Math.max(0, Math.min(1, t)))
  }
  return [...rgb, 180]
}

// Centroid key of a rectangular bounding-box polygon (shapely box layout).
// Coordinates: [[w,s],[e,s],[e,n],[w,n],[w,s]]
function centroidKey(f) {
  const ring = f.geometry.coordinates[0]
  const lon = ((ring[0][0] + ring[1][0]) / 2).toFixed(5)
  const lat = ((ring[0][1] + ring[2][1]) / 2).toFixed(5)
  return `${lon}_${lat}`
}

export default function HeatLayer({ data, deltaData, mode = 'absolute', hotspots, hoveredRank, onHover }) {
  // Build centroid-key → rank lookup (empty Map when hotspots not yet loaded)
  const hotspotMap = useMemo(() => {
    if (!hotspots) return new Map()
    const m = new Map()
    for (const f of hotspots.features) {
      const key = `${f.properties.lon.toFixed(5)}_${f.properties.lat.toFixed(5)}`
      m.set(key, f.properties.rank)
    }
    return m
  }, [hotspots])

  // Centroid key of the currently hovered hotspot (null = none)
  const hoveredKey = useMemo(() => {
    if (hoveredRank == null || !hotspots) return null
    const f = hotspots.features.find(x => x.properties.rank === hoveredRank)
    if (!f) return null
    return `${f.properties.lon.toFixed(5)}_${f.properties.lat.toFixed(5)}`
  }, [hotspots, hoveredRank])

  // Flat array of hotspot point data for ScatterplotLayer / TextLayer
  const hotspotPoints = useMemo(() => {
    if (!hotspots) return []
    return hotspots.features.map(f => ({
      rank: f.properties.rank,
      lon:  f.properties.lon,
      lat:  f.properties.lat,
    }))
  }, [hotspots])

  // Actual min/max from meta (preferred) or feature scan (fallback)
  const { deltaActualMin, deltaActualMax } = useMemo(() => {
    if (!deltaData) return { deltaActualMin: -1, deltaActualMax: 1 }
    if (deltaData.meta?.delta_min != null && deltaData.meta?.delta_max != null) {
      return { deltaActualMin: deltaData.meta.delta_min, deltaActualMax: deltaData.meta.delta_max }
    }
    const vals = deltaData.features
      .map(f => f.properties.lst_delta)
      .filter(v => v != null && isFinite(v))
    if (!vals.length) return { deltaActualMin: -1, deltaActualMax: 1 }
    return { deltaActualMin: Math.min(...vals), deltaActualMax: Math.max(...vals) }
  }, [deltaData])

  // ── Delta mode ────────────────────────────────────────────────────────────
  if (mode === 'delta') {
    if (!deltaData) return null

    const deltaLayer = new GeoJsonLayer({
      id: 'lst-delta-choropleth',
      data: deltaData,
      stroked: true,
      filled: true,
      pickable: true,
      getFillColor: (f) => deltaColor(f.properties.lst_delta, deltaActualMin, deltaActualMax),
      getLineColor: [255, 255, 255, 18],
      getLineWidth: 1,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 0,
      updateTriggers: {
        getFillColor: [deltaData, deltaActualMin, deltaActualMax],
      },
    })

    return <DeckOverlay layers={[deltaLayer]} onHover={onHover} />
  }

  // ── Absolute mode (original) ──────────────────────────────────────────────
  if (!data) return null

  const geoJsonLayer = new GeoJsonLayer({
    id: 'lst-choropleth',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    getFillColor: (f) => heatColor(f.properties.lst_norm),
    getLineColor: (f) => {
      const k = centroidKey(f)
      if (k === hoveredKey) return [255, 255, 255, 255]
      if (hotspotMap.has(k))  return [200, 230, 255, 200]
      return [255, 255, 255, 18]
    },
    getLineWidth: (f) => {
      const k = centroidKey(f)
      if (k === hoveredKey) return 4
      if (hotspotMap.has(k))  return 2
      return 1
    },
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0,
    updateTriggers: {
      getFillColor: data,
      getLineColor: [hotspotMap, hoveredKey],
      getLineWidth:  [hotspotMap, hoveredKey],
    },
    transitions: { getFillColor: 300 },
  })

  const ringLayer = new ScatterplotLayer({
    id: 'hotspot-ring',
    data: hotspotPoints,
    getPosition: d => [d.lon, d.lat],
    getRadius: 200,
    radiusUnits: 'meters',
    radiusMinPixels: 12,
    getFillColor: [0, 0, 0, 0],
    getLineColor: [255, 255, 255, 220],
    getLineWidth: d => (d.rank === hoveredRank ? 4 : 2),
    lineWidthUnits: 'pixels',
    stroked: true,
    filled: false,
    pickable: false,
    updateTriggers: { getLineWidth: hoveredRank },
  })

  const dotLayer = new ScatterplotLayer({
    id: 'hotspot-dot',
    data: hotspotPoints,
    getPosition: d => [d.lon, d.lat],
    getRadius: 20,
    radiusUnits: 'meters',
    radiusMinPixels: 4,
    getFillColor: d => (d.rank === hoveredRank ? [255, 255, 255, 255] : [239, 68, 68, 230]),
    stroked: false,
    filled: true,
    pickable: false,
    updateTriggers: { getFillColor: hoveredRank },
  })

  const labelLayer = new TextLayer({
    id: 'hotspot-labels',
    data: hotspotPoints,
    getPosition: d => [d.lon, d.lat],
    getText: d => `#${d.rank}`,
    getPixelOffset: [0, -26],
    getSize: 11,
    getColor: d => (d.rank === hoveredRank ? [255, 255, 255, 255] : [255, 255, 255, 180]),
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontWeight: 600,
    pickable: false,
    updateTriggers: { getColor: hoveredRank },
  })

  return (
    <DeckOverlay
      layers={[geoJsonLayer, ringLayer, dotLayer, labelLayer]}
      onHover={onHover}
    />
  )
}
