import { useMemo } from 'react'
import { GeoJsonLayer } from '@deck.gl/layers'
import DeckOverlay from './DeckOverlay'

const AMBER_FILL = [245, 158, 11, 160]
const AMBER_LINE = [245, 158, 11, 255]
const DIM_FILL   = [120, 120, 130, 40]
const IDLE_FILL  = [120, 120, 130, 80]
const IDLE_LINE  = [255, 255, 255, 25]

export default function SimCellLayer({ data, selectedCells, onCellClick }) {
  const selectedSet = useMemo(() => new Set(selectedCells ?? []), [selectedCells])
  const hasSelection = selectedSet.size > 0

  if (!data) return null

  const layer = new GeoJsonLayer({
    id: 'sim-cells',
    data,
    stroked: true,
    filled: true,
    pickable: true,
    onClick: (info) => {
      if (info && info.index != null && onCellClick) onCellClick(info.index)
    },
    getFillColor: (_f, { index }) => {
      if (selectedSet.has(index)) return AMBER_FILL
      return hasSelection ? DIM_FILL : IDLE_FILL
    },
    getLineColor: (_f, { index }) => (selectedSet.has(index) ? AMBER_LINE : IDLE_LINE),
    getLineWidth: (_f, { index }) => (selectedSet.has(index) ? 2 : 1),
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 0,
    parameters: { depthTest: false, blend: true },
    updateTriggers: {
      getFillColor: [selectedSet, hasSelection],
      getLineColor: [selectedSet],
      getLineWidth: [selectedSet],
    },
  })

  return <DeckOverlay layers={[layer]} />
}
