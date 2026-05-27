import { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fetchSimulateBaeume } from '../../api/simulate'
import { CROWN_AREA_M2_DEFAULT } from '../../utils/simulate'
import { fmt } from '../../utils/format'
import LSTLegend from '../map/LSTLegend'

const DEBOUNCE_MS = 300

function formatCo2(kgYear) {
  if (kgYear < 1000) return { value: fmt.num(kgYear, 0), unit: 'kg/Jahr' }
  return { value: fmt.num(kgYear / 1000, 1), unit: 't/Jahr' }
}

// Vorher/Nachher-Zeile mit Progress-Bar und Delta-Badge
function BeforeAfterRow({ label, barFill, beforeFill, beforeFmt, afterFmt, deltaFmt, deltaColor, barColor }) {
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
        <span className="text-fg-3 text-[10px] font-mono">{beforeFmt} vorher</span>
        <span className="text-fg-3 text-[10px] font-mono">{afterFmt} nachher</span>
      </div>
    </div>
  )
}

export default function BaumSimPanel({ lstData }) {
  const selectedCells       = useAppStore((s) => s.sim.selectedCells)
  const selectedCellsAreaM2 = useAppStore((s) => s.sim.selectedCellsAreaM2)
  const selectedCount       = selectedCells.length
  const anzahl              = useAppStore((s) => s.sim.baeume.anzahl)
  const setAnzahl           = useAppStore((s) => s.setSimBaeumeAnzahl)
  const clearCells          = useAppStore((s) => s.clearSimCells)
  const showBaumkataster    = useAppStore((s) => s.sim.showBaumkataster)
  const toggleBaumkataster  = useAppStore((s) => s.toggleSimBaumkataster)

  const existingPct = useMemo(() => {
    if (selectedCount === 0 || !lstData) return 0
    const vals = selectedCells.map((idx) => lstData.features[idx]?.properties?.bestand_pct ?? 0)
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }, [selectedCells, selectedCount, lstData])

  // Ø LST der selektierten Kacheln
  const avgLstCelsius = useMemo(() => {
    if (selectedCount === 0 || !lstData) return null
    const vals = selectedCells
      .map((idx) => lstData.features[idx]?.properties?.lst_celsius)
      .filter((v) => v != null)
    if (!vals.length) return null
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }, [selectedCells, selectedCount, lstData])

  const headroomPct    = Math.max(0, 100 - existingPct)
  const sliderMax      = Math.floor((headroomPct / 100) * selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)
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

  const newPctRaw      = useMemo(() => {
    if (!hasSel || anzahl < 1) return 0
    return (anzahl * CROWN_AREA_M2_DEFAULT) / selectedCellsAreaM2 * 100
  }, [hasSel, anzahl, selectedCellsAreaM2])
  const effectiveNewPct = Math.min(newPctRaw, headroomPct)
  const totalPct        = Math.min(existingPct + effectiveNewPct, 100)

  const co2 = result ? formatCo2(result.co2_kg_year) : null

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

  // Vorher/Nachher LST-Werte
  const lstRange    = (lstMax ?? 0) - (lstMin ?? 0) || 1
  const lstBefore   = avgLstCelsius
  const lstAfter    = result != null && lstBefore != null ? lstBefore + result.delta_lst_celsius : null
  const lstBarBefore = lstBefore != null ? (lstBefore - (lstMin ?? 0)) / lstRange : 0
  const lstBarAfter  = lstAfter  != null ? (lstAfter  - (lstMin ?? 0)) / lstRange : lstBarBefore

  return (
    <div className="flex flex-col gap-5">
      {/* LST-Legende */}
      {lstMin != null && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-2">
            Oberflächentemperatur (LST)
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
                {fmt.area(selectedCellsAreaM2)} · {selectedCount} {selectedCount === 1 ? 'Kachel' : 'Kacheln'}
              </div>
              <div className="text-fg-3 text-[11px] mt-0.5 font-mono">
                Bestand: {fmt.pct(existingPct)} Kronendeckung
              </div>
            </>
          ) : (
            <div className="text-fg-2 text-[12px] leading-snug">
              Klicke auf Kacheln in der Karte, um die Simulation zu starten.
            </div>
          )}
        </div>
        {hasSel && (
          <button
            onClick={clearCells}
            className="text-fg-3 hover:text-fg-0 text-[11px] font-medium px-2 py-1 rounded transition-colors"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
          >
            Zurücksetzen
          </button>
        )}
      </div>

      {/* Layer-Toggle: Baumkataster */}
      <button
        onClick={toggleBaumkataster}
        className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] transition-colors text-left"
        style={{
          background: showBaumkataster ? 'rgba(34,197,94,0.08)' : 'var(--bg-2)',
          border:     showBaumkataster ? '1px solid rgba(34,197,94,0.35)' : '1px solid var(--border)',
        }}
      >
        <span
          className="shrink-0 flex items-center justify-center rounded"
          style={{ width: 16, height: 16, background: showBaumkataster ? 'var(--green)' : 'transparent', border: showBaumkataster ? 'none' : '1.5px solid var(--text-3)' }}
        >
          {showBaumkataster && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5"/>
            </svg>
          )}
        </span>
        <span className="flex-1 text-[12px]" style={{ color: showBaumkataster ? 'var(--text-0)' : 'var(--text-2)' }}>
          Baumkataster anzeigen
        </span>
        <span className="text-fg-3 text-[10px] font-mono">44.647</span>
      </button>

      {/* Slider + Text-Input */}
      <div className={hasSel ? '' : 'opacity-50 pointer-events-none'}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Neupflanzungen
        </div>

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
          <span className="text-fg-2 text-[13px]">Bäume</span>
          {sliderMax > 0 && (
            <span className="ml-auto text-fg-3 text-[10px] font-mono">max {fmt.num(sliderMax)}</span>
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
              {existingBarPct > 0 && <><span style={{ color: 'rgba(34,197,94,0.6)' }}>■</span> {fmt.pct(existingPct)}</>}
              {newBarPct > 0 && <> · <span style={{ color: 'var(--green)' }}>■</span> +{fmt.pct(effectiveNewPct)}</>}
            </span>
            <span style={{ color: 'var(--text-1)' }}>= {fmt.pct(totalPct)} gesamt</span>
          </div>
        </div>

        {newPctRaw > headroomPct + 0.05 && hasSel && (
          <div className="text-accent-amber text-[10px] mt-1.5">
            ⚠ {fmt.pct(newPctRaw - headroomPct)} überschreiten den Headroom — kein zusätzlicher Δ°C-Effekt.
          </div>
        )}
      </div>

      {/* Vorher / Nachher */}
      {hasSel && (
        <div className="rounded-[10px] p-4" style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-4">
            Vorher / Nachher
          </div>

          {loading && !result ? (
            <div className="flex justify-center py-3">
              <span className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
                style={{ borderColor: 'var(--green)', borderTopColor: 'transparent' }} />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Temperatur */}
              {lstBefore != null && (
                <BeforeAfterRow
                  label="Temperatur (LST)"
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
                label="CO₂-Bindung"
                barFill={result ? 1 : 0}
                beforeFill={0}
                beforeFmt="0 kg/Jahr"
                afterFmt={co2 ? `${co2.value} ${co2.unit}` : '—'}
                deltaFmt={co2 ? `+${co2.value} ${co2.unit}` : '—'}
                deltaColor="var(--green)"
                barColor="var(--green)"
              />

              {/* Kronendeckung */}
              <BeforeAfterRow
                label="Kronendeckung"
                barFill={totalPct / 100}
                beforeFill={existingPct / 100}
                beforeFmt={fmt.pct(existingPct)}
                afterFmt={fmt.pct(totalPct)}
                deltaFmt={result ? `+${fmt.pct(result.effective_new_pct)}` : '—'}
                deltaColor="var(--amber)"
                barColor="var(--amber)"
              />
            </div>
          )}

          {error && (
            <div className="mt-3 text-[12px] text-accent-red">
              Berechnung fehlgeschlagen — bitte erneut versuchen.
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
          Methodik & Einschränkungen {methodikOpen ? 'ausblenden' : 'anzeigen'}
        </button>
        {methodikOpen && (
          <div className="mt-3 space-y-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {result?.caveats?.map((c, i) => <p key={i}>• {c}</p>)}
            {result?.coefficients_used && (
              <p className="font-mono text-[10px] pt-1" style={{ color: 'var(--text-3)' }}>
                LST/% Krone: {result.coefficients_used.lst_per_pct_canopy} ·
                land_use: {result.coefficients_used.land_use} ·
                Krone: {result.coefficients_used.crown_area_m2} m² ·
                CO₂: {result.coefficients_used.co2_kg_per_tree_year} kg/Jahr
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
