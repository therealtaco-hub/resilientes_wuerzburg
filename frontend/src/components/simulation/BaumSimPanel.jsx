import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fetchSimulateBaeume } from '../../api/simulate'
import { CROWN_AREA_M2_DEFAULT, MIN_GROUND_PER_TREE_M2, TYPE_KEY_LABELS } from '../../utils/simulate'
import { fmt } from '../../utils/format'
import LSTLegend from '../map/LSTLegend'

const DEBOUNCE_MS = 300

function LayerToggle({ active, onToggle, label, badge }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] transition-colors text-left"
      style={{
        background: active ? 'rgba(34,197,94,0.08)' : 'var(--bg-2)',
        border:     active ? '1px solid rgba(34,197,94,0.35)' : '1px solid var(--border)',
      }}
    >
      <span
        className="shrink-0 flex items-center justify-center rounded"
        style={{ width: 16, height: 16, background: active ? 'var(--green)' : 'transparent', border: active ? 'none' : '1.5px solid var(--text-3)' }}
      >
        {active && (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        )}
      </span>
      <span className="flex-1 text-[12px]" style={{ color: active ? 'var(--text-0)' : 'var(--text-2)' }}>
        {label}
      </span>
      {badge && <span className="text-fg-3 text-[10px] font-mono">{badge}</span>}
    </button>
  )
}

function formatCo2(kgYear, t) {
  if (kgYear < 1000) return { value: fmt.num(kgYear, 0), unit: t('baum.co2UnitKg') }
  return { value: fmt.num(kgYear / 1000, 1), unit: t('baum.co2UnitT') }
}

// Vorher/Nachher-Zeile mit Progress-Bar und Delta-Badge
function BeforeAfterRow({ label, barFill, beforeFill, beforeFmt, afterFmt, deltaFmt, deltaColor, barColor }) {
  const { t } = useTranslation()
  const pct     = Math.max(0, Math.min(100, (barFill ?? 0) * 100))
  const prevPct = beforeFill != null ? Math.max(0, Math.min(100, beforeFill * 100)) : null
  const showGhost = prevPct != null && Math.abs(prevPct - pct) > 0.5

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-fg-1 text-[12px] font-medium">{label}</span>
        <span className="font-mono text-[13px] font-semibold" style={{ color: deltaColor }}>
          {deltaFmt}
        </span>
      </div>
      <div className="relative h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
        {/* Ghost: vorheriger Füllstand (abgedimmt) */}
        {showGhost && (
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${prevPct}%`, background: barColor, opacity: 0.22 }}
          />
        )}
        {/* Aktueller Füllstand */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: barColor }}
        />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-fg-3 text-[10px] font-mono">{beforeFmt} {t('baum.before')}</span>
        <span className="text-fg-3 text-[10px] font-mono">{afterFmt} {t('baum.after')}</span>
      </div>
    </div>
  )
}

export default function BaumSimPanel({ lstData, treeData, cityMeta }) {
  const { t } = useTranslation()
  const selectedCells       = useAppStore((s) => s.sim.selectedCells)
  const selectedCellsAreaM2 = useAppStore((s) => s.sim.selectedCellsAreaM2)
  const selectedCount       = selectedCells.length
  const anzahl              = useAppStore((s) => s.sim.baeume.anzahl)
  const setAnzahl           = useAppStore((s) => s.setSimBaeumeAnzahl)
  const clearCells          = useAppStore((s) => s.clearSimCells)
  const showBaumkataster    = useAppStore((s) => s.sim.showBaumkataster)
  const toggleBaumkataster  = useAppStore((s) => s.toggleSimBaumkataster)
  const showSimLst          = useAppStore((s) => s.sim.showSimLst)
  const toggleSimLst        = useAppStore((s) => s.toggleSimLst)
  const showSimAtkis        = useAppStore((s) => s.sim.showSimAtkis)
  const toggleSimAtkis      = useAppStore((s) => s.toggleSimAtkis)

  const existingPct = useMemo(() => {
    if (selectedCount === 0 || !lstData) return 0
    const vals = selectedCells.map((idx) => lstData.features[idx]?.properties?.bestand_pct ?? 0)
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }, [selectedCells, selectedCount, lstData, t])

  // Ø LST der selektierten Kacheln
  const avgLstCelsius = useMemo(() => {
    if (selectedCount === 0 || !lstData) return null
    const vals = selectedCells
      .map((idx) => lstData.features[idx]?.properties?.lst_celsius)
      .filter((v) => v != null)
    if (!vals.length) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }, [selectedCells, selectedCount, lstData, t])

  // Bestandsbäume in selektierten Zellen via Bbox-Check
  const treeCount = useMemo(() => {
    if (!treeData?.features?.length || selectedCount === 0 || !lstData) return null
    const bboxes = selectedCells.map((idx) => {
      const coords = lstData.features[idx]?.geometry?.coordinates?.[0]
      if (!coords) return null
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      for (const [x, y] of coords) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
      return [minX, minY, maxX, maxY]
    }).filter(Boolean)
    return treeData.features.filter((f) => {
      const [lon, lat] = f.geometry.coordinates
      return bboxes.some(([x0, y0, x1, y1]) => lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1)
    }).length
  }, [treeData, selectedCells, selectedCount, lstData])

  // Versiegelung: nur die unversiegelte Fläche ist pflanzbar (begrenzt die Stammzahl, NICHT
  // den Kühl-Nenner — Kronen überhängen versiegelten Boden, siehe Plan 10.5).
  const { avgSealPct, dominantLabel, hasGap } = useMemo(() => {
    if (selectedCount === 0 || !lstData) return { avgSealPct: 0, dominantLabel: null, hasGap: false }
    const seals = []
    const domCounts = {}
    let gap = false
    for (const idx of selectedCells) {
      const p = lstData.features[idx]?.properties
      seals.push(p?.seal_pct ?? 0)
      const dom = p?.dominant_type_key ?? null
      if (dom == null) gap = true
      else domCounts[dom] = (domCounts[dom] ?? 0) + 1
    }
    const avg = seals.reduce((s, v) => s + v, 0) / seals.length
    const topDom = Object.entries(domCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return {
      avgSealPct: avg,
      dominantLabel: topDom ? t('legend.cat.' + topDom, topDom) : null,
      hasGap: gap,
    }
  }, [selectedCells, selectedCount, lstData, t])

  const plantableAreaM2 = selectedCellsAreaM2 * (1 - avgSealPct)

  // Slider-Max: pflanzpraktischer Cap (Mindeststandfläche) auf der *pflanzbaren* (unversiegelten)
  // Fläche — kein Modell-Cap. Kombiniert Teil-1-Entscheidung 1B mit dem Versiegelungsgrad.
  const sliderMax      = Math.max(0, Math.floor(plantableAreaM2 / MIN_GROUND_PER_TREE_M2))
  const hasSel         = selectedCount > 0
  const sliderDisabled = !hasSel || sliderMax <= 0

  const [result,      setResult]      = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)
  const [methodikOpen, setMethodikOpen] = useState(false)
  const [inputVal,    setInputVal]    = useState(String(anzahl))

  // Text-Input mit Slider synchron halten
  useEffect(() => { setInputVal(String(anzahl)) }, [anzahl])

  const debounceRef = useRef(null)
  const reqIdRef    = useRef(0)

  // Anzahl auf Headroom-Max klemmen wenn Selektion sich ändert
  useEffect(() => {
    if (hasSel && sliderMax > 0 && anzahl > sliderMax) setAnzahl(sliderMax)
  }, [hasSel, sliderMax, anzahl, setAnzahl])

  useEffect(() => {
    if (!hasSel || anzahl < 1) {
      setResult(null); setError(null); setLoading(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current
      fetchSimulateBaeume({ n_trees: anzahl, area_m2: selectedCellsAreaM2, existing_coverage_pct: existingPct })
        .then((res) => { if (reqId !== reqIdRef.current) return; setResult(res); setError(null); setLoading(false) })
        .catch((e) => { if (reqId !== reqIdRef.current) return; setError(e.message || 'Berechnung fehlgeschlagen'); setLoading(false) })
    }, DEBOUNCE_MS)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [hasSel, anzahl, selectedCellsAreaM2, existingPct])

  // Stadtweite Kronenbeschattung – Baseline aus dem Backend (nur In-Stadt-Kacheln,
  // korrekt gegen Stadtbezirke-Polygone gefiltert). Fallback auf Frontend-Berechnung
  // über alle LST-Features wenn cityMeta noch nicht geladen.
  const cityBestandPct = useMemo(() => {
    if (cityMeta?.city_canopy_pct != null) return cityMeta.city_canopy_pct
    if (!lstData?.features?.length) return null
    const N = lstData.features.length
    const sum = lstData.features.reduce((s, f) => s + (f.properties?.bestand_pct ?? 0), 0)
    return sum / N
  }, [cityMeta, lstData])

  // Projizierte Kronendeckung (Crookston & Stage 1999) — spiegelt die Backend-Formel
  // für die unmittelbare Slider-Vorschau. Bestand & Neu werden im Flächen-Verhältnis
  // addiert, nicht als Prozente. Backend bleibt die Wahrheit.
  const { totalPct, effectiveNewPct, naiveNewPct } = useMemo(() => {
    const existingSafe  = Math.min(existingPct, 99.9)
    const existingRatio = -Math.log(1 - existingSafe / 100)
    const newRatio = (!hasSel || anzahl < 1 || selectedCellsAreaM2 <= 0)
      ? 0
      : (anzahl * CROWN_AREA_M2_DEFAULT) / selectedCellsAreaM2
    const total = Math.max(existingPct, (1 - Math.exp(-(existingRatio + newRatio))) * 100)
    return { totalPct: total, effectiveNewPct: total - existingPct, naiveNewPct: newRatio * 100 }
  }, [hasSel, anzahl, selectedCellsAreaM2, existingPct])

  // Stadtweiter Zuwachs: effectiveNewPct wirkt nur auf Selektionsfläche, skaliert auf Stadtgebiet.
  // Nenner = city_cell_count × 10.000 m² (nur In-Stadt-Kacheln); Fallback auf LST-Gesamtzahl.
  const { cityAfterPct, deltaCityPct } = useMemo(() => {
    if (cityBestandPct == null) return { cityAfterPct: null, deltaCityPct: 0 }
    if (!hasSel || effectiveNewPct <= 0 || selectedCellsAreaM2 <= 0) {
      return { cityAfterPct: cityBestandPct, deltaCityPct: 0 }
    }
    const cellCount       = cityMeta?.city_cell_count ?? lstData?.features?.length ?? 0
    if (cellCount === 0)  return { cityAfterPct: cityBestandPct, deltaCityPct: 0 }
    const cityTotalAreaM2 = cellCount * 10000
    const addedShadedM2   = (effectiveNewPct / 100) * selectedCellsAreaM2
    const delta           = (addedShadedM2 / cityTotalAreaM2) * 100
    return { cityAfterPct: cityBestandPct + delta, deltaCityPct: delta }
  }, [cityBestandPct, hasSel, effectiveNewPct, selectedCellsAreaM2, cityMeta, lstData])

  const co2 = result ? formatCo2(result.co2_kg_year, t) : null

  // CO₂-Bindung Vorher/Nachher: Bestand aus treeCount × Koeffizient, gleiche Formel wie Backend
  const co2PerTree    = result?.coefficients_used?.co2_kg_per_tree_year ?? null
  const co2BeforeKg   = co2PerTree != null && treeCount != null ? treeCount * co2PerTree : null
  const co2AfterKg    = result != null ? (co2BeforeKg ?? 0) + result.co2_kg_year : null
  const co2Before     = co2BeforeKg != null ? formatCo2(co2BeforeKg, t) : null
  const co2After      = co2AfterKg  != null ? formatCo2(co2AfterKg, t)  : null
  const co2BeforeFill = co2AfterKg > 0 ? (co2BeforeKg ?? 0) / co2AfterKg : 0

  const { lstMin, lstMedian, lstMax } = useMemo(() => {
    if (!lstData?.features?.length) return {}
    const vals = lstData.features
      .map((f) => f.properties?.lst_celsius).filter((v) => v != null).sort((a, b) => a - b)
    if (!vals.length) return {}
    return { lstMin: vals[0], lstMedian: vals[Math.floor(vals.length / 2)], lstMax: vals[vals.length - 1] }
  }, [lstData])

  // Text-Input Handler
  const handleInputChange  = (e) => setInputVal(e.target.value)
  const handleInputBlur    = () => {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n >= 1 && n <= sliderMax) setAnzahl(n)
    else setInputVal(String(anzahl))
  }
  const handleInputKeyDown = (e) => { if (e.key === 'Enter') e.target.blur() }

  // Kronendeckungs-Balken-Segmente
  const existingBarPct = Math.min(existingPct, 100)
  const newBarPct      = Math.min(effectiveNewPct, 100 - existingBarPct)

  // Vorher/Nachher Baum-Werte
  const treeCapacity  = (treeCount ?? 0) + sliderMax
  const treeBarBefore = treeCapacity > 0 ? (treeCount ?? 0) / treeCapacity : 0
  const treeBarAfter  = treeCapacity > 0 ? Math.min(((treeCount ?? 0) + anzahl) / treeCapacity, 1) : 1

  // Vorher/Nachher LST-Werte
  const lstRange    = (lstMax ?? 0) - (lstMin ?? 0) || 1
  const lstBefore   = avgLstCelsius
  const lstAfter    = result != null && lstBefore != null ? lstBefore + result.delta_lst_celsius : null
  const lstBarBefore = lstBefore != null ? (lstBefore - (lstMin ?? 0)) / lstRange : 0
  const lstBarAfter  = lstAfter  != null ? (lstAfter  - (lstMin ?? 0)) / lstRange : lstBarBefore

  return (
    <div className="flex flex-col gap-5">
      {/* Start-Hinweis — verschwindet bei erster Auswahl */}
      {!hasSel && (
        <div
          className="rounded-[10px] p-4 flex items-start gap-3"
          style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.35)' }}
        >
          <span style={{ fontSize: 20 }}>👆</span>
          <div className="min-w-0">
            <div className="text-fg-0 text-[13px] font-semibold mb-0.5">{t('baum.startTitle')}</div>
            <div className="text-fg-2 text-[12px] leading-snug">
              {t('baum.startBodyPre')}<span className="font-medium text-fg-0">{t('baum.startBodyWord')}</span>{t('baum.startBodyPost')}
            </div>
          </div>
        </div>
      )}

      {/* LST-Legende — nur wenn die Farbcodierung aktiv ist */}
      {showSimLst && lstMin != null && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-2">
            {t('baum.lstLegendTitle')}
          </p>
          <LSTLegend min={lstMin} median={lstMedian} max={lstMax} />
        </div>
      )}

      {/* Area-Info-Banner */}
      <div className="bg-bg-2 border border-border rounded-[10px] p-4 flex items-center gap-3">
        <span style={{ fontSize: 22 }}>🌳</span>
        <div className="flex-1 min-w-0">
          {hasSel ? (
            <>
              <div className="text-fg-0 text-[14px] font-medium">
                {fmt.area(selectedCellsAreaM2)} · {selectedCount} {t('common.cell', { count: selectedCount })}
              </div>
              <div className="text-fg-3 text-[11px] mt-0.5 font-mono">
                {t('baum.bestandPrefix')} {fmt.pct(existingPct)} {t('baum.canopy')}
                {treeCount != null && ` · ${fmt.num(treeCount)} ${t('common.tree', { count: treeCount })}`}
              </div>
              {/* Versiegelungs-Readout — genau die Größe, die in sliderMax eingeht */}
              <div className="text-fg-3 text-[11px] mt-0.5 font-mono">
                {dominantLabel ? t('baum.readoutDominant', { label: dominantLabel }) : ''}
                {t('baum.readoutSealed', { pct: fmt.pct(avgSealPct * 100) })} · {t('baum.readoutPlantable', { area: fmt.area(plantableAreaM2) })} · {t('baum.readoutMaxTrees', { n: fmt.num(sliderMax) })}
              </div>
              {hasGap && (
                <div className="text-accent-amber text-[10px] mt-0.5 leading-snug">
                  {t('baum.gapWarn')}
                </div>
              )}
              {cityBestandPct != null && (
                <div className="text-fg-3 text-[11px] mt-0.5 font-mono">
                  {t('baum.cityCanopy', { pct: fmt.pct(cityBestandPct) })}
                </div>
              )}
            </>
          ) : (
            <div className="text-fg-2 text-[12px] leading-snug">
              {t('baum.emptyBanner')}
            </div>
          )}
        </div>
        {hasSel && (
          <button
            onClick={clearCells}
            className="text-fg-3 hover:text-fg-0 text-[11px] font-medium px-2 py-1 rounded transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            {t('common.reset')}
          </button>
        )}
      </div>

      {/* Layer-Toggles */}
      <LayerToggle active={showSimLst}       onToggle={toggleSimLst}       label={t('baum.toggleLst')} />
      <LayerToggle active={showBaumkataster} onToggle={toggleBaumkataster} label={t('baum.toggleTrees')} badge="44.647" />
      <LayerToggle active={showSimAtkis}     onToggle={toggleSimAtkis}     label={t('baum.toggleAtkis')} />

      {/* Slider + Text-Input */}
      <div className={hasSel ? '' : 'opacity-50 pointer-events-none'}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-1">
          {t('baum.sliderTitle')}
        </div>
        <p className="text-fg-3 text-[10px] leading-snug mb-3">
          {t('baum.sliderHelp')}
        </p>

        {/* Wert-Zeile: Zahl (editierbar) + Einheit + Max-Hinweis */}
        <div className="flex items-baseline gap-2 mb-2">
          <input
            type="number"
            value={inputVal}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            min={1}
            max={Math.max(sliderMax, 1)}
            disabled={sliderDisabled}
            className="no-spinner font-mono tabular-nums text-fg-0 bg-transparent focus:outline-none text-left"
            style={{ fontSize: 28, fontWeight: 600, width: `${Math.max(String(sliderMax).length, 3) + 1}ch`, borderBottom: '1.5px solid var(--border)' }}
          />
          <span className="text-fg-2 text-[13px]">{t('baum.unitTrees')}</span>
          {sliderMax > 0 && (
            <span className="ml-auto text-fg-3 text-[10px] font-mono">{t('baum.max', { n: fmt.num(sliderMax) })}</span>
          )}
        </div>

        <input
          type="range"
          min={1}
          max={Math.max(sliderMax, 1)}
          value={Math.min(anzahl, Math.max(sliderMax, 1))}
          onChange={(e) => setAnzahl(parseInt(e.target.value, 10))}
          disabled={sliderDisabled}
          className="w-full accent-[color:var(--green)]"
        />

        {hasSel && avgSealPct > 0 && (
          <div
            className="flex items-start gap-2 mt-2.5 px-3 py-2 rounded-[8px]"
            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)' }}
          >
            <span className="text-[12px] shrink-0" style={{ color: 'var(--blue)' }}>ℹ</span>
            <p className="text-[11px] leading-snug" style={{ color: 'var(--text-1)' }}>
              {t('baum.baumscheibe', { n: fmt.num(sliderMax) })}
            </p>
          </div>
        )}

        {/* Kronendeckungs-Balken */}
        <div className="mt-3">
          <div className="flex h-[8px] rounded-full overflow-hidden gap-[2px]">
            {existingBarPct > 0 && (
              <div
                style={{ width: `${existingBarPct}%`, background: 'rgba(34,197,94,0.35)', borderRadius: 4 }}
                title={`Bestand ${fmt.pct(existingPct)}`}
              />
            )}
            {newBarPct > 0 && (
              <div
                style={{ width: `${newBarPct}%`, background: 'var(--green)', borderRadius: 4 }}
                title={`Neu ${fmt.pct(effectiveNewPct)}`}
              />
            )}
            <div style={{ flex: 1, background: 'var(--bg-3)', borderRadius: 4 }} title="Verfügbarer Headroom" />
          </div>
          <div className="flex justify-between mt-1 text-[10px] font-mono text-fg-3">
            <span>
              {existingBarPct > 0 && <><span style={{ color: 'rgba(34,197,94,0.6)' }}>■</span> {t('baum.barBestand', { pct: fmt.pct(existingPct) })}</>}
              {newBarPct > 0 && <> · <span style={{ color: 'var(--green)' }}>■</span> {t('baum.barNew', { pct: fmt.pct(effectiveNewPct) })}</>}
            </span>
            <span>
              <span style={{ color: 'var(--text-3)' }}>□ {t('baum.barFree', { pct: fmt.pct(Math.max(0, 100 - totalPct)) })}</span>
              {' · '}
              <span style={{ color: 'var(--text-1)' }}>{t('baum.barTotal', { pct: fmt.pct(totalPct) })}</span>
            </span>
          </div>
        </div>

        {naiveNewPct - effectiveNewPct > 5 && hasSel && (
          <div className="text-accent-amber text-[10px] mt-1.5">
            {t('baum.overlapWarn', { pct: fmt.pct(naiveNewPct - effectiveNewPct) })}
          </div>
        )}
      </div>

      {/* Vorher / Nachher */}
      {hasSel && (
        <div className="rounded-[10px] p-4" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-4">
            {t('baum.beforeAfter')}
          </div>

          {loading && !result ? (
            <div className="flex justify-center py-3">
              <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Baumanzahl */}
              {treeCount != null && (
                <BeforeAfterRow
                  label={t('baum.rowTrees')}
                  barFill={treeBarAfter}
                  beforeFill={treeBarBefore}
                  beforeFmt={`${fmt.num(treeCount)} ${t('common.tree', { count: treeCount })}`}
                  afterFmt={`${fmt.num(treeCount + anzahl)} ${t('common.tree', { count: treeCount + anzahl })}`}
                  deltaFmt={`+${fmt.num(anzahl)}`}
                  deltaColor="var(--green)"
                  barColor="var(--green)"
                />
              )}

              {/* Temperatur */}
              {lstBefore != null && (
                <BeforeAfterRow
                  label={t('baum.rowTemp')}
                  barFill={lstBarAfter}
                  beforeFill={lstBarBefore}
                  beforeFmt={fmt.temp(lstBefore)}
                  afterFmt={lstAfter != null ? fmt.temp(lstAfter) : '—'}
                  deltaFmt={result ? fmt.dT(result.delta_lst_celsius) : '—'}
                  deltaColor="var(--blue)"
                  barColor="var(--blue)"
                />
              )}

              {/* CO₂-Bindung */}
              <BeforeAfterRow
                label={t('baum.rowCo2')}
                barFill={result ? 1 : 0}
                beforeFill={co2BeforeFill}
                beforeFmt={co2Before ? `${co2Before.value} ${co2Before.unit}` : '—'}
                afterFmt={co2After ? `${co2After.value} ${co2After.unit}` : '—'}
                deltaFmt={co2 ? `+${co2.value} ${co2.unit}` : '—'}
                deltaColor="var(--green)"
                barColor="var(--green)"
              />

              {/* Kronendeckung */}
              <BeforeAfterRow
                label={t('baum.rowCanopy')}
                barFill={totalPct / 100}
                beforeFill={existingPct / 100}
                beforeFmt={fmt.pct(existingPct)}
                afterFmt={fmt.pct(totalPct)}
                deltaFmt={result ? `+${fmt.pct(result.effective_new_pct)}` : '—'}
                deltaColor="var(--amber)"
                barColor="var(--amber)"
              />

              {/* Stadtweite Beschattung */}
              {cityBestandPct != null && (
                <BeforeAfterRow
                  label={t('baum.rowCityShade')}
                  barFill={(cityAfterPct ?? cityBestandPct) / 100}
                  beforeFill={cityBestandPct / 100}
                  beforeFmt={fmt.pct(cityBestandPct)}
                  afterFmt={cityAfterPct != null ? fmt.pct(cityAfterPct) : '—'}
                  deltaFmt={deltaCityPct > 0.005 ? `+${fmt.pct(deltaCityPct, 2)}` : '0,00%'}
                  deltaColor={deltaCityPct > 0.005 ? 'var(--green)' : 'var(--text-3)'}
                  barColor="rgba(34,197,94,0.5)"
                />
              )}
            </div>
          )}

          {error && (
            <div className="mt-3 text-[12px] text-accent-red">
              {t('common.calcFailed')}
            </div>
          )}
        </div>
      )}

      {/* Methodik-Toggle */}
      <div className="pt-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <button
          onClick={() => setMethodikOpen((v) => !v)}
          className="flex items-center justify-center gap-1.5 w-full rounded-md py-1.5 text-[11px] font-medium transition-colors"
          style={{
            background: methodikOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
            border:     '1px solid var(--border)',
            color:      methodikOpen ? 'var(--text-1)' : 'var(--text-3)',
          }}
        >
          {methodikOpen ? t('common.methodikHide') : t('common.methodikShow')}
        </button>
        {methodikOpen && (
          <div className="mt-3 space-y-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {result?.caveats?.map((c, i) => <p key={i}>• {c}</p>)}
            <p>• <strong>{t('baum.methPlantableTitle')}</strong> {t('baum.methPlantableBody')}</p>
            {result?.coefficients_used && (
              <p className="font-mono text-[10px] pt-1" style={{ color: 'var(--text-3)' }}>
                {t('baum.coefLst')} {result.coefficients_used.lst_per_pct_canopy} ·
                {t('baum.coefLandUse')} {result.coefficients_used.land_use} ·
                {t('baum.coefCrown')} {result.coefficients_used.crown_area_m2} m² ·
                {t('baum.coefCo2')} {result.coefficients_used.co2_kg_per_tree_year} {t('baum.co2UnitKg')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
