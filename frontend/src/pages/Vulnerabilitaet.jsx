import { useTranslation } from 'react-i18next'
import { useEffect, useState, useMemo } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import VulnLayer from '../components/map/overlays/VulnLayer'
import DemografieLayer from '../components/map/overlays/DemografieLayer'
import StadtbezirkeVulnLayer from '../components/map/overlays/StadtbezirkeVulnLayer'
import LSTLegend from '../components/map/LSTLegend'
import DemografieLegend from '../components/map/DemografieLegend'
import StadtbezirkeHviLegend from '../components/map/StadtbezirkeHviLegend'
import useAppStore from '../store/useAppStore'
import { fetchVulnerability } from '../api/vulnerability'
import { fetchLst } from '../api/lst'
import { fetchZensus } from '../api/zensus'
import { fetchStadtbezirke } from '../api/stadtbezirke'
import { fmt } from '../utils/format'
import { LST_SENSOR } from '../utils/sources'
import { tooltipPos, tapToHover } from '../utils/tooltip'
import useIsMobile from '../hooks/useIsMobile'
import LstHinweisBar from '../components/ui/LstHinweisBar'

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
  const { t } = useTranslation()
  const { layers, toggleLayer } = useAppStore()

  const items = [
    {
      key: 'vulnerabilitaet',
      label: t('vuln.layerVuln'),
      sub: t('vuln.layerVulnSub', { sensor: LST_SENSOR }),
      color: 'var(--purple)',
      count: vulnCount,
    },
    {
      key: 'heatmap',
      label: t('vuln.layerHeat'),
      sub: t('vuln.layerHeatSub'),
      color: 'var(--amber)',
      count: lstCount,
    },
    {
      key: 'zensus',
      label: t('vuln.layerZensus'),
      sub: t('vuln.layerZensusSub'),
      color: 'var(--blue)',
      count: zensusCount,
    },
    {
      key: 'stadtbezirke',
      label: t('vuln.layerBezirke'),
      sub: t('vuln.layerBezirkeSub'),
      color: 'var(--purple)',
      count: null,
    },
  ]

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 space-y-1">
      <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-3">{t('vuln.layerTitle')}</p>
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

// Anteil, ab dem eine der beiden HVI-Komponenten als "dominierend" bezeichnet
// wird. Reine DARSTELLUNGSSCHWELLE für den Interpretationstext — sie geht
// nicht in die HVI-Berechnung ein und ist kein wissenschaftlicher Koeffizient
// (die Gewichte selbst kommen aus utils/vuln_formula.py über meta.weights).
const DOMINANCE_SHARE = 0.55

/**
 * Zerlegt den HVI der übergebenen Zelle in seine beiden gewichteten Beiträge
 * und benennt den größeren. Die Zerlegung spiegelt exakt compute_hvi() in
 * backend/utils/vuln_formula.py: gewichtet wird lst_norm mit weights.lst_norm
 * und der SHRINKAGE-KORRIGIERTE Seniorenanteil (anteil_65plus_adj) mit
 * weights.anteil_65plus — nicht der Rohanteil.
 *
 * Gibt null zurück, wenn die Zelle keine HVI-Zelle ist (der Hover-Handler der
 * Seite bedient auch den LST- und den Demografie-Layer) oder Werte fehlen.
 */
function interpretCell(cell, weights, t) {
  if (!cell) return null

  const wLst = weights?.lst_norm ?? 0.6
  const wAlt = weights?.anteil_65plus ?? 0.4
  const lstNorm = cell.lst_norm
  const altAdj  = cell.anteil_65plus_adj

  if (cell.hvi == null || lstNorm == null || altAdj == null) return null

  const contribHeat = wLst * lstNorm
  const contribAge  = wAlt * altAdj
  const total       = contribHeat + contribAge
  if (!(total > 0)) return null

  const shareHeat = contribHeat / total
  const vals = {
    hvi:       fmt.index(cell.hvi),
    lst:       cell.lst_celsius != null ? fmt.temp(cell.lst_celsius) : '—',
    senior:    fmt.pct(altAdj * 100),
    shareHeat: fmt.pct(shareHeat * 100, 0),
    shareAge:  fmt.pct((1 - shareHeat) * 100, 0),
  }

  if (shareHeat >= DOMINANCE_SHARE)       return t('vuln.interpHeat', vals)
  if (1 - shareHeat >= DOMINANCE_SHARE)   return t('vuln.interpAge', vals)
  return t('vuln.interpBalanced', vals)
}

function InterpretationBox({ cell, weights }) {
  const { t } = useTranslation()
  const text = useMemo(() => interpretCell(cell, weights, t), [cell, weights, t])

  return (
    <div className="bg-bg-2 border border-border rounded-xl p-4 flex gap-3">
      <div className="w-1 rounded-full flex-shrink-0 self-stretch" style={{ background: 'var(--purple)' }} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--purple)' }}>
            {t('vuln.interpTitle')}
          </p>
          <span
            className="font-mono text-[11px] px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg-3)', color: 'var(--text-3)' }}
          >
            {text ? t('vuln.interpBadge') : t('vuln.interpBadgeStatic')}
          </span>
        </div>
        <p className="text-fg-1 text-[13px] italic leading-[1.55]">
          {text ?? t('vuln.interpBody')}
        </p>
        {!text && (
          <p className="text-fg-3 text-[11px] mt-1.5">
            {t('vuln.interpHint')}
          </p>
        )}
        <p className="text-fg-3 text-[10px] font-mono mt-2">
          {t('vuln.interpFooter', { sensor: LST_SENSOR })}
        </p>
      </div>
    </div>
  )
}

// ── Formula Card ──────────────────────────────────────────────────────────────

function FormelCard({ weights, meta }) {
  const { t } = useTranslation()
  const lst    = weights?.lst_norm ?? 0.6
  const alt    = weights?.anteil_65plus ?? 0.4
  const nPrior = meta?.n_prior ?? 50
  const g65    = meta?.global_65_rate != null ? fmt.pct(meta.global_65_rate * 100) : '—'
  const [open, setOpen] = useState(false)

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest">{t('vuln.formTitle')}</p>
        <button
          onClick={() => setOpen(v => !v)}
          title={t('vuln.formExplTitle')}
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
          {t('vuln.formLstWeight')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span style={{ color: 'var(--amber)' }}>{lst.toFixed(2)}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          {t('vuln.formAltWeight')}&nbsp;
          <span style={{ color: 'var(--purple)' }}>{alt.toFixed(2)}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          {t('vuln.formNPrior')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
          <span style={{ color: 'var(--purple)' }}>{nPrior}</span>
        </p>
        <p className="font-mono text-[12px] text-fg-1">
          {t('vuln.formCityAvg')}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
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
            {t('vuln.formP1')}
          </p>
          <p>
            <span style={{ color: 'var(--purple)' }}>65+<sub>adj</sub></span> {t('vuln.formP2Pre')}{' '}<span className="text-fg-1">{t('vuln.formP2Bold')}</span>{t('vuln.formP2Post', { g65, nPrior })}
          </p>
          <p>
            <span style={{ color: 'var(--amber)' }}>LST<sub>norm</sub></span> {t('vuln.formP3')}
          </p>
        </div>
      )}

      <p className="text-fg-3 text-[10px] font-mono mt-3">
        {t('vuln.formFooterPre')} <span className="text-fg-2">vuln_formula.py</span>
      </p>
    </div>
  )
}

// ── Hover Tooltip ─────────────────────────────────────────────────────────────

function Tooltip({ cell, mobile }) {
  const { t } = useTranslation()
  if (!cell) return null
  const p = cell.object.properties
  return (
    <div
      className="bg-bg-2 border border-border font-mono text-[11px] rounded-md px-3 py-2 space-y-0.5"
      style={{
        position: 'fixed',
        ...tooltipPos(cell.x, cell.y, mobile, 200, 160),
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    >
      <p className="text-fg-3 text-[10px] mb-1 uppercase tracking-widest">{t('vuln.tipTitle')}</p>
      {p.hvi       != null && <p className="text-fg-0">HVI&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--purple)' }}>{fmt.index(p.hvi)}</span></p>}
      {p.lst_celsius != null && <p className="text-fg-1">LST&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--amber)' }}>{fmt.temp(p.lst_celsius)}</span></p>}
      {p.anteil_65plus != null && <p className="text-fg-1">{t('vuln.tipAnteil')}&nbsp;&nbsp;<span className="text-fg-0">{fmt.pct(p.anteil_65plus * 100)}</span><span className="text-fg-3">&nbsp;{t('vuln.tipRoh')}</span></p>}
      {p.anteil_65plus_adj != null && <p className="text-fg-1">{t('vuln.tipKorr')}&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--purple)' }}>{fmt.pct(p.anteil_65plus_adj * 100)}</span></p>}
      {p.Einwohner != null && <p className="text-fg-2">{t('vuln.tipEinwohner')}&nbsp;&nbsp;&nbsp;<span className="text-fg-1">{fmt.num(p.Einwohner)}</span></p>}
      {p.anteil_65plus_clamped && (
        <p className="text-fg-3 text-[10px] mt-0.5">{t('vuln.tipClamped')}</p>
      )}
      {p.anteil_65plus == null && p.Einwohner != null && (
        <p className="text-fg-3 text-[10px] mt-0.5">{t('vuln.tipNoAge')}</p>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Vulnerabilitaet() {
  const { layers, vulnWeights, setVulnWeights, setLayerLoading } = useAppStore()
  const { t } = useTranslation()
  const isMobile = useIsMobile()

  // Mobil: Tooltips per Tap (onClick) statt Hover.
  const pick = (handler) => (isMobile ? { onClick: tapToHover(handler) } : { onHover: handler })

  const vulnData     = useAppStore(s => s.layerData.vulnerability)
  const lstData      = useAppStore(s => s.layerData.lst)
  const zensusData   = useAppStore(s => s.layerData.zensus)
  const bezirkeData  = useAppStore(s => s.layerData.stadtbezirke)
  const setLayerData = useAppStore(s => s.setLayerData)
  const [error,     setError]     = useState(null)
  const [hovered,   setHovered]   = useState(null)
  const [hoveredBezirk, setHoveredBezirk] = useState(null)
  // Zuletzt berührte HVI-Zelle. Bleibt nach dem Verlassen der Zelle stehen,
  // damit der Interpretationstext lesbar ist statt beim Wegbewegen der Maus
  // sofort zurückzuspringen.
  const [interpCell, setInterpCell] = useState(null)

  // HVI / Vulnerabilitäts-Layer
  useEffect(() => {
    if (!layers.vulnerabilitaet || vulnData) return
    setLayerLoading('vulnerabilitaet', true)
    fetchVulnerability()
      .then((vuln) => {
        setLayerData('vulnerability', vuln)
        if (vuln.meta?.weights) setVulnWeights(vuln.meta.weights)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLayerLoading('vulnerabilitaet', false))
  }, [layers.vulnerabilitaet, vulnData])

  // LST (Hitzeinsel-Overlay)
  useEffect(() => {
    if (!layers.heatmap || lstData) return
    setLayerLoading('heatmap', true)
    fetchLst()
      .then(d => setLayerData('lst', d))
      .catch((e) => setError(e.message))
      .finally(() => setLayerLoading('heatmap', false))
  }, [layers.heatmap, lstData])

  // Demografie 65+
  useEffect(() => {
    if (!layers.zensus || zensusData) return
    setLayerLoading('zensus', true)
    fetchZensus()
      .then(d => setLayerData('zensus', d))
      .catch(() => {})
      .finally(() => setLayerLoading('zensus', false))
  }, [layers.zensus, zensusData])

  // Stadtbezirke (HVI)
  useEffect(() => {
    if (!layers.stadtbezirke || bezirkeData) return
    setLayerLoading('stadtbezirke', true)
    fetchStadtbezirke()
      .then(d => setLayerData('stadtbezirke', d))
      .catch(() => {})
      .finally(() => setLayerLoading('stadtbezirke', false))
  }, [layers.stadtbezirke, bezirkeData])

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

  const bezirkStats = useMemo(() => {
    if (!bezirkeData) return {}
    const vals = bezirkeData.features
      .map(f => f.properties.hvi_max)
      .filter(v => v != null && Number.isFinite(v))
      .sort((a, b) => a - b)
    if (!vals.length) return {}
    return {
      min:    vals[0],
      median: vals[Math.floor(vals.length / 2)],
      max:    vals[vals.length - 1],
    }
  }, [bezirkeData])

  const handleHover = ({ object, x, y }) => {
    setHovered(object ? { object, x, y } : null)
    // Nur HVI-Zellen speisen die Interpretation — derselbe Handler bedient
    // auch den LST- und den Demografie-Layer, deren Features kein hvi tragen.
    const p = object?.properties
    if (p && p.hvi != null && p.lst_norm != null && p.anteil_65plus_adj != null) {
      setInterpCell(p)
    }
  }

  const handleBezirkHover = ({ object, x, y }) =>
    setHoveredBezirk(object ? { object, x, y } : null)

  const vulnCount   = vulnData?.features?.length ?? null
  const lstCount    = lstData?.features?.length ?? null
  const zensusCount = zensusData?.features?.length ?? null

  return (
    <div className="flex flex-col lg:h-[calc(100vh-48px)]">
      {/* Page Header */}
      <div className="flex items-end justify-between px-4 lg:px-8 pt-5 lg:pt-8 pb-3 lg:pb-4 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[22px] lg:text-[28px] font-semibold tracking-tight">
            {t('vulnerabilitaet.title')}
          </h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            {t('vulnerabilitaet.subtitlePrefix')} · {LST_SENSOR}
          </p>
        </div>
        {error && (
          <span className="flex items-center gap-2 text-[11px] font-mono text-accent-red">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent-red" />
            {t('common.backendUnreachable')} – {error}
          </span>
        )}
      </div>

      <LstHinweisBar />

      {/* Map + Right Rail */}
      <div className="flex flex-col lg:flex-row flex-1 gap-4 px-4 lg:px-8 pb-6 lg:pb-8 min-h-0">
        {/* Karte */}
        <div className="relative h-[55vh] min-h-[320px] lg:h-auto lg:flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            {layers.heatmap         && <HeatLayer          data={lstData}     {...pick(handleHover)} />}
            {layers.zensus          && <DemografieLayer     data={zensusData}  {...pick(handleHover)} />}
            {layers.vulnerabilitaet && <VulnLayer           data={vulnData}    {...pick(handleHover)} />}
            {layers.stadtbezirke    && <StadtbezirkeVulnLayer data={bezirkeData} {...pick(handleBezirkHover)} />}
          </MapSurface>

        </div>

        {/* Right Rail – 360 px */}
        <div className="w-full lg:w-[360px] flex flex-col gap-4 flex-shrink-0 lg:overflow-y-auto">
          <KpiCard
            label={t('vuln.kpiBereich')}
            value={maxHvi != null ? fmt.index(maxHvi) : '—'}
            sub={t('vuln.kpiBereichSub')}
            color="purple"
            icon="shield"
          />

          <KpiCard
            label={t('vuln.kpiBetroffen')}
            value={affectedPop != null ? fmt.num(Math.round(affectedPop)) : '—'}
            unit={t('vuln.kpiBetroffenUnit')}
            sub={t('vuln.kpiBetroffenSub')}
            color="amber"
            icon="users"
          />

          <VulnLayerPanel vulnCount={vulnCount} lstCount={lstCount} zensusCount={zensusCount} />

          {layers.vulnerabilitaet && <HviLegend />}
          {layers.heatmap && <LSTLegend {...lstStats} />}
          {layers.zensus && <DemografieLegend />}
          {layers.stadtbezirke && <StadtbezirkeHviLegend {...bezirkStats} />}

          <InterpretationBox cell={interpCell} weights={vulnWeights} />

          <FormelCard weights={vulnWeights} meta={vulnData?.meta} />

        </div>
      </div>

      <Tooltip cell={hovered} mobile={isMobile} />

      {hoveredBezirk && (
        <div
          className="bg-bg-2 border border-border font-mono text-[11px] rounded-md px-3 py-2 space-y-0.5"
          style={{
            position: 'fixed',
            ...tooltipPos(hoveredBezirk.x, hoveredBezirk.y, isMobile, 190, 140),
            pointerEvents: 'none',
            minWidth: 180,
            zIndex: 9999,
          }}
        >
          <div className="text-fg-0 text-[13px] font-medium mb-1.5">
            {hoveredBezirk.object.properties.name}
          </div>
          <div className="text-fg-2 text-[11px] font-mono space-y-0.5">
            <div>{t('vuln.bezHviMax')} · <span style={{ color: 'var(--purple)' }}>{fmt.index(hoveredBezirk.object.properties.hvi_max ?? 0)}</span></div>
            <div className="flex items-baseline gap-1">
              <span>{t('vuln.bezHviAvg')} · <span style={{ color: 'var(--purple)' }}>{fmt.index(hoveredBezirk.object.properties.hvi_mean ?? 0)}</span></span>
              <span className="text-[9px] text-fg-3">{t('vuln.bezEwWeighted')}</span>
            </div>
            <div>{t('vuln.bezLstMax')} · <span className="text-fg-0">{fmt.temp(hoveredBezirk.object.properties.lst_max)}</span></div>
            <div>{t('vuln.bezEinwohner')} · <span className="text-fg-0">{fmt.num(hoveredBezirk.object.properties.einwohner)}</span></div>
          </div>
        </div>
      )}
    </div>
  )
}
