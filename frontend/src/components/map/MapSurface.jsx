import Map from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAP_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const WUERZBURG_VIEW = {
  longitude: 9.932,
  latitude: 49.794,
  zoom: 12,
}

export default function MapSurface({ children, style, ...props }) {
  return (
    <Map
      initialViewState={WUERZBURG_VIEW}
      style={{ width: '100%', height: '100%', ...style }}
      mapStyle={MAP_STYLE}
      {...props}
    >
      {children}
    </Map>
  )
}
