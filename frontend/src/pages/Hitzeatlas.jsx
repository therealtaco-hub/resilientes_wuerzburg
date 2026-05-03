import { useEffect, useState, useMemo } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import TreeLayer from '../components/map/overlays/TreeLayer'
import LayerPanel from '../components/map/LayerPanel'
import LSTLegend from '../components/map/LSTLegend'
import useAppStore from '../store/useAppStore'
import { fetchLst } from '../api/lst'
import { fetchTrees } from '../api/trees'
import { fmt } from '../utils/format'

const HINTS = [
  {
    icon: <><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></>,
    title: '100 m Rasterauflösung',
    text: 'Jede Zelle entspricht einer 100 × 100 m Fläche. Feinere Unterschiede innerhalb einer Zelle sind nicht dargestellt.',
  },
  {
    icon: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></>,
    title: 'Land Surface Temperature (LST)',
    text: 'Gemessene Oberflächentemperatur — nicht die Lufttemperatur. Versiegelte Flächen wie Asphalt und Dächer erreichen deutlich höhere LST-Werte als die gefühlte Temperatur.',
  },
  {
    icon: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    title: 'Fehlende Färbung',
    text: 'Ungefärbte Flächen liegen außerhalb der Würzburger Stadtgrenze oder wurden vom Landsat-Sensor nicht erfasst (z. B. durch Wolkenbedeckung im Komposit-Zeitraum).',
  },
  {
    icon: <><path d="M12 22v-7"/><path d="M9 15l3-3 3 3"/><path d="M5 10a7 7 0 0 1 14 0c0 4-3 6-7 8-4-2-7-4-7-8z"/></>,
    title: 'Baumkataster: Stadtbäume',
    text: 'Dargestellt sind ausschließlich Bäume im Bestand der Stadt Würzburg. Privatbäume auf Wohngrundstücken oder Firmengeländen sind nicht erfasst.',
  },
]

function HinweisBox() {
  const [open, setOpen] = useState(null)
  const toggle = (i) => setOpen(prev => prev === i ? null : i)

  return (
    <div className="bg-bg-2 border border-border rounded-xl p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-4">
        Hinweise zur Karte
      </p>
      {HINTS.map((h, i) => (
        <div key={i}>
          {i > 0 && <div className="my-3" style={{ height: '1px', background: 'var(--border-soft)' }} />}
          <button
            onClick={() => toggle(i)}
            className="w-full flex items-center gap-3 text-left"
          >
            <svg className="shrink-0 text-fg-3" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {h.icon}
            </svg>
            <span className="flex-1 text-fg-0 text-[13px] leading-snug">{h.title}</span>
            <svg
              className="shrink-0 text-fg-3 transition-transform duration-200"
              style={{ transform: open === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
              width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {open === i && (
            <p className="text-fg-2 text-[12px] leading-relaxed mt-2 pl-[28px]">{h.text}</p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function Hitzeatlas() {
  const { layers } = useAppStore()
  const [lstData, setLstData]       = useState(null)
  const [treeData, setTreeData]     = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [hoveredCell, setHoveredCell] = useState(null)

  useEffect(() => {
    Promise.all([fetchLst(), fetchTrees()])
      .then(([lst, trees]) => {
        setLstData(lst)
        setTreeData(trees)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const { lstMin, lstMedian, lstMax } = useMemo(() => {
    if (!lstData) return {}
    const vals = lstData.features
      .map(f => f.properties.lst_celsius)
      .filter(v => v != null && !isNaN(v))
      .sort((a, b) => a - b)
    return {
      lstMin:    vals[0],
      lstMedian: vals[Math.floor(vals.length / 2)],
      lstMax:    vals[vals.length - 1],
    }
  }, [lstData])

  const handleHover = ({ object, x, y }) =>
    setHoveredCell(object ? { object, x, y } : null)

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Page Header */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">
            Hitzeatlas
          </h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            Land Surface Temperature · Landsat 9 · Sommer 2024
          </p>
        </div>
        {loading && (
          <span className="text-[11px] text-accent-green font-mono animate-pulse">
            Lade Daten …
          </span>
        )}
        {error && (
          <span className="text-[11px] text-accent-red font-mono">
            ● Backend nicht erreichbar – {error}
          </span>
        )}
      </div>

      {/* Map + Right Rail */}
      <div className="flex flex-1 gap-4 px-8 pb-8 min-h-0">
        {/* Karte */}
        <div className="relative flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            {layers.heatmap && <HeatLayer data={lstData} onHover={handleHover} />}
            {layers.trees   && <TreeLayer data={treeData} />}
          </MapSurface>
        </div>

        {/* Right Rail */}
        <div className="w-[280px] flex flex-col gap-4 flex-shrink-0">
          <LayerPanel />

          {layers.heatmap && (
            <LSTLegend min={lstMin} median={lstMedian} max={lstMax} />
          )}

          {/* Hinweisbox */}
          <HinweisBox />

          {/* Interpretation */}
          <div className="bg-bg-2 border border-border rounded-xl p-4 flex gap-3">
            <div
              className="w-1 rounded-full flex-shrink-0 self-stretch"
              style={{ background: 'var(--amber)' }}
            />
            <div>
              <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-2">
                Interpretation
              </p>
              <p className="text-fg-1 text-[13px] italic leading-relaxed">
                Die heißesten 10 % der Stadtfläche konzentrieren sich auf
                versiegelte Gewerbegebiete im Norden sowie die dicht bebaute
                Innenstadt. Grünflächen wie der Ringpark und die Mainufer sind
                deutlich kühler.
              </p>
              <p className="text-fg-3 text-[10px] font-mono mt-2">
                Quelle: Landsat 9 · Sommer 2024
              </p>
            </div>
          </div>

        </div>
      </div>

      {hoveredCell && (
        <div
          className="bg-bg-2 border border-border text-fg-0 font-mono text-xs px-2 py-1 rounded-md"
          style={{
            position: 'fixed',
            left: hoveredCell.x + 12,
            top:  hoveredCell.y + 12,
            pointerEvents: 'none',
          }}
        >
          {fmt.temp(hoveredCell.object.properties.lst_celsius)}
        </div>
      )}
    </div>
  )
}
