import { useEffect, useState, useMemo } from 'react'
import MapSurface from '../components/map/MapSurface'
import EntsiegelungLayer from '../components/map/overlays/EntsiegelungLayer'
import EntsiegelungLegend from '../components/map/EntsiegelungLegend'
import useAppStore from '../store/useAppStore'
import { fetchEntsiegelung } from '../api/entsiegelung'
import { fmt } from '../utils/format'

// ── KPI Card ──────────────────────────────────────────────────────────────────

const COLOR_TOKENS = {
  orange: { fg: 'var(--amber)',  bg: 'rgba(255,140,0,0.10)',  border: 'rgba(255,140,0,0.25)' },
  red:    { fg: '#c81e1e',       bg: 'rgba(200,30,30,0.10)',  border: 'rgba(200,30,30,0.25)' },
}

const ICONS = {
  layers: (
    <>
      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
      <path d="M2 17l10 5 10-5"/>
      <path d="M2 12l10 5 10-5"/>
    </>
  ),
  area: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M9 21V9"/>
    </>
  ),
}

function KpiCard({ label, value, unit, sub, color, icon }) {
  const c = COLOR_TOKENS[color] ?? COLOR_TOKENS.orange
  return (
    <div className="bg-bg-1 border border-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3">{label}</p>
          <div className="flex items-baseline gap-1 mt-3">
            <span
              className="font-mono tabular-nums text-[32px] font-semibold leading-none"
              style={{ color: c.fg, letterSpacing: '-0.01em' }}
            >
              {value}
            </span>
            {unit && <span className="font-mono text-[14px] text-fg-2">{unit}</span>}
          </div>
          {sub && <p className="text-[12px] text-fg-1 mt-1.5">{sub}</p>}
        </div>
        {icon && (
          <div
            className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
            style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[icon]}
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Layer Panel ───────────────────────────────────────────────────────────────

const LAYER_ITEMS = [
  {
    key:   'entsiegelung_atkis',
    label: 'ATKIS-Flächen',
    sub:   'ATKIS Basis-DLM · Flächenart',
    color: '#c87050',
  },
  {
    key:   'entsiegelung_osm',
    label: 'OSM-Parkplätze & Plätze',
    sub:   'OpenStreetMap · Amber / Blau',
    color: '#ff8c00',
  },
]

function EntsiegelungLayerPanel({ meta }) {
  const { layers, toggleLayer } = useAppStore()

  const counts = {
    entsiegelung_atkis: meta?.atkis_count ?? null,
    entsiegelung_osm:   meta?.osm_count   ?? null,
  }

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 space-y-1">
      <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-3">Layer</p>
      {LAYER_ITEMS.map(({ key, label, sub, color }) => (
        <button
          key={key}
          onClick={() => toggleLayer(key)}
          className="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-white/5 transition-colors duration-[150ms] cursor-pointer"
          style={{ background: layers[key] ? 'rgba(255,255,255,0.02)' : undefined }}
          role="switch"
          aria-checked={layers[key]}
        >
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <div className="text-left">
              <p className="text-fg-0 text-[13px] font-medium">{label}</p>
              <p className="text-fg-3 text-[11px]">{sub}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {counts[key] != null && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
              >
                {fmt.num(counts[key])}
              </span>
            )}
            <div
              className="relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors duration-[150ms]"
              style={{ background: layers[key] ? color : 'var(--bg-3)' }}
            >
              <div
                className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform duration-[150ms]"
                style={{ transform: layers[key] ? 'translateX(16px)' : 'translateX(2px)' }}
              />
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function Tooltip({ cell }) {
  if (!cell) return null
  const p = cell.object.properties
  const isAtkis = p.source === 'atkis'
  return (
    <div
      className="bg-bg-2 border border-border font-mono text-[11px] rounded-md px-3 py-2 space-y-0.5"
      style={{
        position: 'fixed',
        left: cell.x + 14,
        top: cell.y + 14,
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <p className="text-fg-3 text-[10px] uppercase tracking-widest">
          {p.label ?? p.type_key ?? 'Fläche'}
        </p>
        {p.source != null && (
          <span style={{
            background: isAtkis ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
            color:      isAtkis ? 'var(--amber)' : 'var(--blue)',
            border:     `1px solid ${isAtkis ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
            padding: '1px 6px', borderRadius: '4px', fontSize: '9px',
          }}>
            {p.source.toUpperCase()}
          </span>
        )}
      </div>
      {p.area_m2 != null && (
        <p className="text-fg-1">
          Fläche&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span className="text-fg-0">{fmt.area(p.area_m2)}</span>
        </p>
      )}
    </div>
  )
}

// ── Interpretation Box ────────────────────────────────────────────────────────

function InterpretationBox() {
  return (
    <div className="bg-bg-2 border border-border rounded-xl p-4 flex gap-3">
      <div className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ background: 'var(--amber)' }} />
      <div className="flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--amber)' }}>
          Interpretation
        </p>
        <p className="text-fg-1 text-[13px] italic leading-[1.55]">
          Jede Flächenart ist mit einer eigenen Farbe dargestellt — von
          Straßenverkehr und Industrie bis hin zu Wohn- und Freizeitflächen.
          OSM-Parkplätze (amber) und Plätze (blau) ergänzen die ATKIS-Daten.
        </p>
        <p className="text-fg-3 text-[10px] font-mono mt-2">
          ATKIS Basis-DLM · OpenStreetMap
        </p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Entsiegelung() {
  const { layers } = useAppStore()
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)
  const [hovered, setHovered] = useState(null)

  useEffect(() => {
    fetchEntsiegelung()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const { totalCount, totalFlaeche } = useMemo(() => {
    if (!data) return {}
    const features = data.features ?? []
    const totalFlaeche = features.reduce((sum, f) => sum + (f.properties.area_m2 ?? 0), 0)
    return { totalCount: features.length, totalFlaeche }
  }, [data])

  const handleHover = ({ object, x, y }) =>
    setHovered(object ? { object, x, y } : null)

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Page Header */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">Entsiegelung</h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            Versiegelungsgrad · ATKIS Basis-DLM · OpenStreetMap
          </p>
        </div>
        {loading && (
          <span className="flex items-center gap-2 text-[11px] font-mono" style={{ color: 'var(--green)' }}>
            <span
              className="inline-block w-3 h-3 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }}
            />
            Lade Entsiegelungsdaten …
          </span>
        )}
        {error && (
          <span className="flex items-center gap-2 text-[11px] font-mono text-accent-red">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-red" />
            Backend nicht erreichbar – {error}
          </span>
        )}
      </div>

      {/* Map + Right Rail */}
      <div className="flex flex-1 gap-4 px-8 pb-8 min-h-0">
        <div className="relative flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            <EntsiegelungLayer
              data={data}
              showAtkis={layers.entsiegelung_atkis}
              showOsm={layers.entsiegelung_osm}
              onHover={handleHover}
            />
          </MapSurface>
        </div>

        <div className="w-[360px] flex flex-col gap-4 flex-shrink-0 overflow-y-auto">
          <KpiCard
            label="Erfasste Flächen"
            value={totalCount != null ? fmt.num(totalCount) : '—'}
            sub="ATKIS + OSM gesamt"
            color="orange"
            icon="layers"
          />
          <KpiCard
            label="Gesamtfläche"
            value={totalFlaeche != null ? fmt.area(Math.round(totalFlaeche)) : '—'}
            sub="Versiegelte Fläche gesamt"
            color="red"
            icon="area"
          />

          <EntsiegelungLayerPanel meta={data?.meta} />

          {(layers.entsiegelung_atkis || layers.entsiegelung_osm) && <EntsiegelungLegend />}

          <InterpretationBox />
        </div>
      </div>

      <Tooltip cell={hovered} />
    </div>
  )
}
