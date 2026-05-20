// MapboxOverlay + useControl ist die einzig korrekte Integration von deck.gl mit
// react-map-gl/MapLibre: Kamera und Viewport bleiben synchron.
// DeckGL direkt zu mounten würde Layer und Karte entkoppeln (Versatz beim Zoomen/Schwenken).
import { useControl } from 'react-map-gl/maplibre'
import { MapboxOverlay } from '@deck.gl/mapbox'

export default function DeckOverlay({ layers, ...rest }) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }))
  overlay.setProps({ layers, ...rest })
  return null
}
