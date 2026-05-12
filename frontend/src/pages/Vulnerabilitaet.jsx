import { useEffect, useState, useMemo } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import VulnLayer from '../components/map/overlays/VulnLayer'
import DemografieLayer from '../components/map/overlays/DemografieLayer'
import LSTLegend from '../components/map/LSTLegend'
import DemografieLegend from '../components/map/DemografieLegend'
import useAppStore from '../store/useAppStore'
import { fetchVulnerability } from '../api/vulnerability'
import { fetchLst } from '../api/lst'
import { fetchZensus } from '../api/zensus'
import { fmt } from '../utils/format'

// ── KPI Card ──────────────────────────────────────────────────────────────────

const COLOR_TOKENS = {
  purple: { fg: 'var(--purple)', bg: 'rgba(168,85,247,0.10)', border: 'rgba(168,85,247,0.25)' },
  amber:  { fg: 'var(--amber)',  bg: 'rgba(245,158,11,0.10)',  border: 'rgba(245,158,11,0.25)' },
}

const ICONS = {
  shield: (
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  ),
  users: (
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
}

function KpiCard({ label, value, unit, sub, color, icon }) {
  const c = COLOR_TOKENS[color] ?? COLOR_TOKENS.purple
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
            {unit && (
              <span className="font-mono text-[14px] text-fg-2">{unit}</span>
            )}
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

// ── Local Layer Panel (with count pills) ──────────────────────────────────────

function VulnLayerPanel({ vulnCount, lstCount, zensusCount }) {
  const { layers, toggleLayer } = useAppStore()

  const items = [
    {
      key: 'vulnerabilitaet',
      label: 'Vulnerabilitäts-Index',
      sub: 'HVI · Zensus 2022 + Landsat 9',
      color: 'var(--purple)',
      count: vulnCount,
    },
    {
      key: 'heatmap',
      label: 'Hitzeinsel (LST)',
      sub: 'Vergleichs-Overlay',
      color: 'var(--amber)',
      count: lstCount,
    },
    {
      key: 'zensus',
      label: 'Demografie 65+',
      sub: 'Zensus 2022 · 100 m-Gitter',
      color: 'var(--blue)',
      count: zensusCount,
    },
  ]

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 space-y-1">
      <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-3">Layer</p>
      {items.map(({ key, label, sub, color, count }) => (
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
            {count != null && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
              >
                {fmt.num(count)}
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

// ── Grid Hint ─────────────────────────────────────────────────────────────────

function GridHint() {
  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 flex gap-3">
      <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="var(--text-3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="text-fg-3 text-[11px] leading-[1.55]">
        Die leichte Versetzung zwischen HVI- und LST-Zellen entsteht durch den
        unterschiedlichen Ursprung der beiden Gittersysteme (Zensus: EPSG:3035,
        Landsat: EPSG:4326).
      </p>
    </div>
  )
}

// ── HVI Legend ────────────────────────────────────────────────────────────────

function HviLegend() {
  return (
    <div
      style={{
        background: 'rgba(15,17,23,0.82)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          width: '160px',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, rgba(168,85,247,0), rgba(168,85,247,0.47), rgba(168,85,247,0.86))',
        }}
      />
      <div className="flex justify-between mt-1.5" style={{ width: '160px' }}>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">HVI 1</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">5,5</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">10</span>
      </div>
    </div>
  )
}

// ── Interpretation Box ────────────────────────────────────────────────────────

function InterpretationBox() {
  return (
    <div className="bg-bg-2 border border-border rounded-xl p-4 flex gap-3">
      <div className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ background: 'var(--purple)' }} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--purple)' }}>
            Interpretation
          </p>
          <span
            className="font-mono text-[11px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
          >
            auto-generiert
          </span>
        </div>
        <p className="text-fg-1 text-[13px] italic leading-[1.55]">
          Zellen mit hohem HVI vereinen überdurchschnittliche Oberflächentemperatur
          und einen erhöhten Anteil älterer Bewohner. Diese Flächen haben Priorität
          für Baumpflanzungen und Entsiegelungsmaßnahmen.
        </p>
        <p className="text-fg-3 text-[10px] font-mono mt-2">
          Zensus 2022 · Landsat 9 · Modell: HVI v1
        </p>
      </div>
    </div>
  )
}

// ── Formula Card ──────────────────────────────────────────────────────────────

function FormelCard({ weights, meta }) {
  const lst    = weights?.lst_norm ?? 0.6
  const alt    = weights?.anteil_65plus ?? 0.4
  const nPrior = meta?.n_prior ?? 50
  const g65    = meta?.global_65_rate != null ? fmt.pct(meta.global_65_rate * 100) : '—'
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest">Formel</p>
        <button
          onClick={() => setOpen(v => !v)}
          title="Erklärung anzeigen"
          className="w-5 h-5 flex items-center justify-center rounded-full transition-colors duration-150"
          style={{
            color: open ? 'var(--purple)' : 'var(--text-3)',
            background: open ? 'rgba(168,85,247,0.12)' : 'transparent',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="8.5" />
            <line x1="12" y1="12" x2="12" y2="16" />
          </svg>
        </button>
      </div>

      {/* Berechnungsformel */}
      <div
        className="font-mono text-[11px] rounded-lg px-3 py-2.5 mb-3 leading-[1.7]"
        style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
      >
        <span className="text-fg-3">HVI</span>
        <span className="text-fg-2"> = (</span>
        <span style={{ color: 'var(--amber)' }}>LST<sub>norm</sub></span>
        <span className="text-fg-2"> × </span>
        <span style={{ color: 'var(--amber)' }}>{lst.toFixed(1)}</span>
        <span className="text-fg-2"> + </span>
        <span style={{ color: 'var(--purple)' }}>65+<sub>adj</sub></span>
        <span className="text-fg-2"> × </span>
        <span style={{ color: 'var(--purple)' }}>{alt.toFixed(1)}</span>
        <span className="text-fg-2">) × 9 + 1</span>
        <br />
        <span style={{ color: 'var(--purple)' }}>65+<sub>adj</sub></span>
        <span className="text-fg-2"> = (n · 65+<sub>roh</sub> + {nPrior} · {g65}) / (n + {nPrior})</span>
      </div>

      {/* Parameter */}
      <div className="space-y-1.5">
        <p className="font-mono text-[12px] text-fg-1">
          LST-Gewicht:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span style={{ color: 'var(--amber)' }}>{lst.toFixed(2)}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          Alter 65+-Gewicht:&nbsp;
          <span style={{ color: 'var(--purple)' }}>{alt.toFixed(2)}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          N-Prior:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span style={{ color: 'var(--purple)' }}>{nPrior}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          Stadt-Ø 65+:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span className="text-fg-2">{g65}</span>
        </p>
      </div>

      {/* Aufklappbarer Erklärtext */}
      {open && (
        <div
          className="mt-3 pt-3 space-y-2 text-[12px] text-fg-2 leading-[1.6]"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <p>
            Der <span className="text-fg-1">HVI</span> kombiniert Oberflächentemperatur
            und Seniorenanteil zu einem Index von 1 (niedrig) bis 10 (hoch).
          </p>
          <p>
            <span style={{ color: 'var(--purple)' }}>65+<sub>adj</sub></span> korrigiert
            das <span className="text-fg-1">Small-Numbers-Problem</span>: Zellen mit wenigen
            Einwohnern erhalten unverhältnismäßig hohe Werte, wenn zufällig alle Bewohner
            über 65 sind. Der Bayesian-Schätzer zieht kleine Zellen zur
            stadtweiten Mittelrate ({g65}) — je dünner besiedelt, desto stärker.
            Ab ~{nPrior} Einwohnern dominiert der beobachtete Wert.
          </p>
          <p>
            <span style={{ color: 'var(--amber)' }}>LST<sub>norm</sub></span> ist
            rang-normiert (0–1), sodass jeder Temperaturwert relativ zur
            Gesamtverteilung im Stadtgebiet eingeordnet wird.
          </p>
        </div>
      )}

      <p className="text-fg-3 text-[10px] font-mono mt-3">
        Konfiguration: <span className="text-fg-2">vuln_formula.py</span>
      </p>
    </div>
  )
}

// ── Hover Tooltip ─────────────────────────────────────────────────────────────

function Tooltip({ cell }) {
  if (!cell) return null
  const p = cell.object.properties
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
      <p className="text-fg-3 text-[10px] mb-1 uppercase tracking-widest">Zensus-Zelle</p>
      {p.hvi       != null && <p className="text-fg-0">HVI&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--purple)' }}>{fmt.index(p.hvi)}</span></p>}
      {p.lst_celsius != null && <p className="text-fg-1">LST&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--amber)' }}>{fmt.temp(p.lst_celsius)}</span></p>}
      {p.anteil_65plus != null && <p className="text-fg-1">Anteil 65+&nbsp;&nbsp;<span className="text-fg-0">{fmt.pct(p.anteil_65plus * 100)}</span><span className="text-fg-3">&nbsp;(roh)</span></p>}
      {p.anteil_65plus_adj != null && <p className="text-fg-1">65+ korr.&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--purple)' }}>{fmt.pct(p.anteil_65plus_adj * 100)}</span></p>}
      {p.Einwohner != null && <p className="text-fg-2">Einwohner&nbsp;&nbsp;&nbsp;<span className="text-fg-1">{fmt.num(p.Einwohner)}</span></p>}
      {p.anteil_65plus_clamped && (
        <p className="text-fg-3 text-[10px] mt-0.5">⚠ Zensus-Rundung (§ 16 BStatG)</p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Vulnerabilitaet() {
  const { layers, vulnWeights, setVulnWeights } = useAppStore()

  const [vulnData,   setVulnData]   = useState(null)
  const [lstData,    setLstData]    = useState(null)
  const [zensusData, setZensusData] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [hovered,    setHovered]    = useState(null)

  useEffect(() => {
    Promise.all([fetchVulnerability(), fetchLst(), fetchZensus()])
      .then(([vuln, lst, zensus]) => {
        setVulnData(vuln)
        setLstData(lst)
        setZensusData(zensus)
        if (vuln.meta?.weights) setVulnWeights(vuln.meta.weights)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const lstStats = useMemo(() => {
    if (!lstData) return {}
    const vals = lstData.features.map(f => f.properties.lst_celsius).filter(v => v != null).sort((a, b) => a - b)
    if (!vals.length) return {}
    return { min: vals[0], median: vals[Math.floor(vals.length / 2)], max: vals[vals.length - 1] }
  }, [lstData])

  const { maxHvi, affectedPop } = useMemo(() => {
    if (!vulnData) return {}
    const features = vulnData.features ?? []
    let maxHvi = 0
    let affectedPop = 0
    for (const f of features) {
      const { hvi, Einwohner } = f.properties
      if (hvi != null && hvi > maxHvi) maxHvi = hvi
      if (hvi != null && hvi > 7 && Einwohner != null) affectedPop += Einwohner
    }
    return { maxHvi, affectedPop }
  }, [vulnData])

  const handleHover = ({ object, x, y }) =>
    setHovered(object ? { object, x, y } : null)

  const vulnCount   = vulnData?.features?.length ?? null
  const lstCount    = lstData?.features?.length ?? null
  const zensusCount = zensusData?.features?.length ?? null

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Page Header */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">
            Vulnerabilität
          </h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            Heat Vulnerability Index · Zensus 2022 · Landsat 9
          </p>
        </div>
        {loading && (
          <span className="flex items-center gap-2 text-[11px] font-mono" style={{ color: 'var(--green)' }}>
            <span
              className="inline-block w-3 h-3 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }}
            />
            Lade HVI-Daten …
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
        {/* Karte */}
        <div className="relative flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            {layers.heatmap         && <HeatLayer     data={lstData}    onHover={handleHover} />}
            {layers.zensus          && <DemografieLayer data={zensusData} onHover={handleHover} />}
            {layers.vulnerabilitaet && <VulnLayer     data={vulnData}   onHover={handleHover} />}
          </MapSurface>

        </div>

        {/* Right Rail – 360 px */}
        <div className="w-[360px] flex flex-col gap-4 flex-shrink-0 overflow-y-auto">
          <KpiCard
            label="Vulnerabelster Bereich"
            value={maxHvi != null ? fmt.index(maxHvi) : '—'}
            sub="Höchster HVI-Score im Datensatz"
            color="purple"
            icon="shield"
          />

          <KpiCard
            label="Betroffene Bevölkerung"
            value={affectedPop != null ? fmt.num(Math.round(affectedPop)) : '—'}
            unit="Pers."
            sub="Zellen mit HVI > 7,0"
            color="amber"
            icon="users"
          />

          <VulnLayerPanel vulnCount={vulnCount} lstCount={lstCount} zensusCount={zensusCount} />

          {layers.vulnerabilitaet && <HviLegend />}
          {layers.heatmap && <LSTLegend {...lstStats} />}
          {layers.zensus && <DemografieLegend />}

          <InterpretationBox />

          <FormelCard weights={vulnWeights} meta={vulnData?.meta} />

          <GridHint />
        </div>
      </div>

      <Tooltip cell={hovered} />
    </div>
  )
}
