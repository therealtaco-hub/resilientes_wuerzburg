import { useEffect, useState, useMemo, useRef } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import TreeLayer from '../components/map/overlays/TreeLayer'
import StadtbezirkeLayer from '../components/map/overlays/StadtbezirkeLayer'
import LayerPanel from '../components/map/LayerPanel'
import LSTLegend from '../components/map/LSTLegend'
import useAppStore from '../store/useAppStore'
import { fetchLst } from '../api/lst'
import { fetchTrees } from '../api/trees'
import { fetchStadtbezirke } from '../api/stadtbezirke'
import { fetchHotspots } from '../api/hotspots'
import { fmt } from '../utils/format'
import { COLORS } from '../utils/colors'

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

function Top5HitzeCard({ hotspots, hoveredRank, onHoverRank, onFlyTo }) {
  if (!hotspots) {
    return (
      <div className="bg-bg-2 border border-border rounded-xl p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Top 5 Hitzespots
        </div>
        <div className="flex items-center gap-2 text-fg-3 text-[12px]">
          <span
            className="shrink-0"
            style={{
              width: 10, height: 10, borderRadius: '50%',
              border: '2px solid var(--green)', borderTopColor: 'transparent',
              display: 'inline-block', animation: 'spin 0.8s linear infinite',
            }}
          />
          Berechne Hitzespots …
        </div>
      </div>
    )
  }

  return (
    <div className="bg-bg-2 border border-border rounded-xl p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
        Top 5 Hitzespots
      </div>
      <div className="flex flex-col gap-0">
        {hotspots.features.map((f) => {
          const { rank, lst_celsius, lst_celsius_smooth } = f.properties
          const isHovered = hoveredRank === rank
          return (
            <div
              key={rank}
              className="flex items-center gap-2 py-2 rounded-lg px-2 cursor-default transition-colors duration-150"
              style={{
                background: isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
              }}
              onMouseEnter={() => onHoverRank(rank)}
              onMouseLeave={() => onHoverRank(null)}
            >
              {/* Rank */}
              <span
                className="font-mono text-[11px] shrink-0 w-5 text-center"
                style={{ color: isHovered ? 'var(--text-0)' : 'var(--text-3)' }}
              >
                #{rank}
              </span>

              {/* Temperature */}
              <div className="flex-1 min-w-0">
                <span
                  className="font-mono tabular-nums text-[15px] font-medium"
                  style={{ color: COLORS.red.fg }}
                >
                  {fmt.temp(lst_celsius_smooth)}
                </span>
                <span
                  className="font-mono text-[10px] ml-1.5"
                  style={{ color: 'var(--text-3)' }}
                >
                  Ø 150m
                </span>
              </div>

              {/* FlyTo button */}
              <button
                title="Zu diesem Ort springen"
                onClick={() => onFlyTo(f)}
                className="shrink-0 flex items-center justify-center rounded-md transition-colors duration-150"
                style={{
                  width: 26, height: 26,
                  background: isHovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: isHovered ? 'var(--text-0)' : 'var(--text-3)',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>
                </svg>
              </button>
            </div>
          )
        })}
      </div>
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
          Jeder Spot ist das heißeste Zentrum eines Stadtgebiets. Die angezeigte Temperatur
          ist der Durchschnitt aller Rasterzellen im <span style={{ color: 'var(--text-1)' }}>200&thinsp;m Umkreis</span> – das glättet
          einzelne Sensor-Ausreißer (z.&thinsp;B. ein einzelnes Metalldach).
          Zwischen zwei Spots liegen immer mindestens <span style={{ color: 'var(--text-1)' }}>600&thinsp;m</span>,
          damit verschiedene Stadtteile repräsentiert werden.
        </p>
        <p className="text-[10px] font-mono mt-2" style={{ color: 'var(--text-3)' }}>
          Focal Mean 200 m · NMS 600 m
        </p>
      </div>
    </div>
  )
}

export default function Hitzeatlas() {
  const { layers } = useAppStore()
  const mapRef = useRef(null)

  const [lstData, setLstData]         = useState(null)
  const [treeData, setTreeData]       = useState(null)
  const [bezirkeData, setBezirkeData] = useState(null)
  const [hotspotData, setHotspotData] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  const [hoveredCell, setHoveredCell]     = useState(null)
  const [hoveredBezirk, setHoveredBezirk] = useState(null)
  const [hoveredRank, setHoveredRank]     = useState(null)

  useEffect(() => {
    Promise.all([fetchLst(), fetchTrees(), fetchStadtbezirke()])
      .then(([lst, trees, bezirke]) => {
        setLstData(lst)
        setTreeData(trees)
        setBezirkeData(bezirke)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    // Hotspots load independently — algorithm can take a moment
    fetchHotspots()
      .then(setHotspotData)
      .catch(() => {}) // silent fail; card stays in loading state
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

  // Centroid-key → rank for detecting hotspot hover on the map
  const hotspotKeyMap = useMemo(() => {
    if (!hotspotData) return new Map()
    const m = new Map()
    for (const f of hotspotData.features) {
      const key = `${f.properties.lon.toFixed(5)}_${f.properties.lat.toFixed(5)}`
      m.set(key, f.properties.rank)
    }
    return m
  }, [hotspotData])

  const handleHover = ({ object, x, y }) => {
    setHoveredCell(object ? { object, x, y } : null)
    if (object) {
      // Detect if the hovered LST pixel is one of the hotspot pixels
      const ring = object.geometry.coordinates[0]
      const lon = ((ring[0][0] + ring[1][0]) / 2).toFixed(5)
      const lat = ((ring[0][1] + ring[2][1]) / 2).toFixed(5)
      setHoveredRank(hotspotKeyMap.get(`${lon}_${lat}`) ?? null)
    } else {
      setHoveredRank(null)
    }
  }

  const handleBezirkHover = ({ object, x, y }) =>
    setHoveredBezirk(object ? { object, x, y } : null)

  // FlyTo: uses MapLibre's native flyTo via react-map-gl ref
  const handleFlyToSpot = (feature) => {
    const { lon, lat } = feature.properties
    mapRef.current?.getMap()?.flyTo({
      center: [lon, lat],
      zoom: 15,
      duration: 1000,
      essential: true,
    })
  }

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
          <MapSurface ref={mapRef}>
            {layers.heatmap      && (
              <HeatLayer
                data={lstData}
                hotspots={hotspotData}
                hoveredRank={hoveredRank}
                onHover={handleHover}
              />
            )}
            {layers.trees        && <TreeLayer data={treeData} />}
            {layers.stadtbezirke && <StadtbezirkeLayer data={bezirkeData} onHover={handleBezirkHover} />}
          </MapSurface>
        </div>

        {/* Right Rail */}
        <div className="w-[280px] flex flex-col gap-4 flex-shrink-0 overflow-y-auto">
          <LayerPanel />

          {layers.heatmap && (
            <LSTLegend min={lstMin} median={lstMedian} max={lstMax} />
          )}

          <Top5HitzeCard
            hotspots={hotspotData}
            hoveredRank={hoveredRank}
            onHoverRank={setHoveredRank}
            onFlyTo={handleFlyToSpot}
          />

          {/* Hinweisbox */}
          <HinweisBox />

        </div>
      </div>

      {hoveredCell && (
        <div
          className="bg-bg-2 border border-border text-fg-0 font-mono text-[11px] px-3 py-2 rounded-md"
          style={{
            position: 'fixed',
            left: hoveredCell.x + 14,
            top:  hoveredCell.y + 14,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
        >
          {fmt.temp(hoveredCell.object.properties.lst_celsius)}
        </div>
      )}

      {hoveredBezirk && (
        <div
          className="bg-bg-2 border border-border font-mono text-[11px] rounded-md px-3 py-2 space-y-0.5"
          style={{
            position: 'fixed',
            left: hoveredBezirk.x + 14,
            top:  hoveredBezirk.y + 14,
            pointerEvents: 'none',
            minWidth: 180,
            zIndex: 9999,
          }}
        >
          <div className="text-fg-0 text-[13px] font-medium mb-1.5">
            {hoveredBezirk.object.properties.name}
          </div>
          <div className="text-fg-2 text-[11px] font-mono space-y-0.5">
            <div>LST Max · <span className="text-fg-0">{fmt.temp(hoveredBezirk.object.properties.lst_max)}</span></div>
            <div>LST Median · <span className="text-fg-0">{fmt.temp(hoveredBezirk.object.properties.lst_median)}</span></div>
            <div>HVI Max · <span className="text-fg-0">{fmt.index(hoveredBezirk.object.properties.hvi_max ?? 0)}</span></div>
            <div>Einwohner · <span className="text-fg-0">{fmt.num(hoveredBezirk.object.properties.einwohner)}</span></div>
            <div>Bäume · <span className="text-fg-0">{fmt.num(hoveredBezirk.object.properties.tree_count)}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
