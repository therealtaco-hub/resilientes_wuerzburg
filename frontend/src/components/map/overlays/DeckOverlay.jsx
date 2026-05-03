import { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'

export default function DeckOverlay({ layers }) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }))
  overlay.setProps({ layers })
  return null
}
