import { HeatmapLayer } from '@deck.gl/aggregation-layers'
import DeckOverlay from './DeckOverlay'

export default function HeatLayer({ data }) {
  if (!data) return null

  const layer = new HeatmapLayer({
    id: 'lst-heatmap',
    data: data.features,
    getPosition: (f) => {
      const ring = f.geometry.coordinates[0]
      const lons = ring.map(c => c[0])
      const lats = ring.map(c => c[1])
      return [
        (Math.min(...lons) + Math.max(...lons)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2,
      ]
    },
    getWeight: (f) => f.properties.lst_norm ?? 0,
    radiusPixels: 40,
    colorRange: [
      [34, 197, 94],   // #22c55e – kühl
      [120, 210, 60],  // grün-gelb
      [245, 158, 11],  // #f59e0b – warm
      [245, 110, 30],  // orange
      [239, 68,  68],  // #ef4444 – heiß
      [180, 20,  20],  // dunkelrot – extrem
    ],
  })

  return <DeckOverlay layers={[layer]} />
}
