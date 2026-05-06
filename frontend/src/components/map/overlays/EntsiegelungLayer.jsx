import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const TYPE_COLORS = {
  AX_IndustrieUndGewerbeflaeche:            [220,  80,  20, 170],
  AX_Strassenverkehr:                        [ 55,  60,  72, 170],
  AX_Platz:                                  [175, 135,   5, 170],
  AX_Wohnbauflaeche:                         [170, 130,  75, 170],
  AX_FlaecheGemischterNutzung:              [150, 105,  65, 170],
  AX_SportFreizeitUndErholungsflaeche:       [ 75, 135,  75, 170],
  AX_Friedhof:                               [ 95, 115,  95, 170],
  AX_FlaecheBesondererFunktionalerPraegung: [ 85, 100, 130, 170],
  osm_parking:                               [245, 158,  11, 170],
  osm_square:                                [ 59, 130, 246, 170],
  osm_flat_roof_industrial:                  [134, 239, 172, 170],
}
const DEFAULT_COLOR = [100, 100, 110, 170]

export default function EntsiegelungLayer({ data, showAtkis, showOsm, onHover }) {
  if (!data) return null

  const visible = data.features.filter(f => {
    if (f.properties.source === 'atkis') return showAtkis
    if (f.properties.source === 'osm')   return showOsm
    return true
  })

  if (visible.length === 0) return null

  const layer = new GeoJsonLayer({
    id: 'entsiegelung',
    data: { ...data, features: visible },
    stroked: false,
    filled: true,
    pickable: true,
    lineWidthMinPixels: 0,
    getFillColor: f => TYPE_COLORS[f.properties.type_key] ?? DEFAULT_COLOR,
    updateTriggers: { getFillColor: [data, showAtkis, showOsm] },
  })

  return <DeckOverlay layers={[layer]} onHover={onHover} />
}
