import { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fetchSimulateBaeume } from '../../api/simulate'
import { CROWN_AREA_M2_DEFAULT } from '../../utils/simulate'
import { fmt } from '../../utils/format'
import SimResultCard from './SimResultCard'

const DEBOUNCE_MS = 300

function formatCo2(kgYear) {
  if (kgYear < 1000) return { value: fmt.num(kgYear, 0), unit: 'kg/Jahr' }
  return { value: fmt.num(kgYear / 1000, 1), unit: 't/Jahr' }
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

  // Bestehende Kronendeckung (%) aus den selektierten Zellen.
  // Alle Zellen sind 10.000 m² → einfacher Mittelwert ist korrekt flächengewichtet.
  const existingPct = useMemo(() => {
    if (selectedCount === 0 || !lstData) return 0
    const vals = selectedCells.map((idx) => {
      const f = lstData.features[idx]
      return f?.properties?.bestand_pct ?? 0
    })
    return vals.reduce((s, v) => s + v, 0) / vals.length
  }, [selectedCells, selectedCount, lstData])

  // Headroom-aware Slider-Max: nur Bäume bis 100 % Gesamtdeckung sinnvoll
  const headroomPct = Math.max(0, 100 - existingPct)
  const sliderMax = Math.floor((headroomPct / 100) * selectedCellsAreaM2 / CROWN_AREA_M2_DEFAULT)
  const hasSel     = selectedCount > 0
  const sliderDisabled = !hasSel || sliderMax <= 0

  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [methodikOpen, setMethodikOpen] = useState(false)

  const debounceRef = useRef(null)
  const reqIdRef    = useRef(0)

  // Clamp `anzahl` an Headroom-Max bei Selektionsänderung (Bestand kann max drücken).
  useEffect(() => {
    if (hasSel && sliderMax > 0 && anzahl > sliderMax) {
      setAnzahl(sliderMax)
    }
  }, [hasSel, sliderMax, anzahl, setAnzahl])

  useEffect(() => {
    if (!hasSel || anzahl < 1) {
      setResult(null)
      setError(null)
      setLoading(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current
      fetchSimulateBaeume({
        n_trees: anzahl,
        area_m2: selectedCellsAreaM2,
        existing_coverage_pct: existingPct,
      })
        .then((res) => {
          if (reqId !== reqIdRef.current) return
          setResult(res)
          setError(null)
          setLoading(false)
        })
        .catch((e) => {
          if (reqId !== reqIdRef.current) return
          setError(e.message || 'Berechnung fehlgeschlagen')
          setLoading(false)
        })
    }, DEBOUNCE_MS)
    return () => debounceRef.current && clearTimeout(debounceRef.current)
  }, [hasSel, anzahl, selectedCellsAreaM2, existingPct])

  const newPctRaw = useMemo(() => {
    if (!hasSel || anzahl < 1) return 0
    return (anzahl * CROWN_AREA_M2_DEFAULT) / selectedCellsAreaM2 * 100
  }, [hasSel, anzahl, selectedCellsAreaM2])
  const effectiveNewPct = Math.min(newPctRaw, headroomPct)
  const totalPct = Math.min(existingPct + effectiveNewPct, 100)

  const co2 = result ? formatCo2(result.co2_kg_year) : null

  return (
    <div className="flex flex-col gap-5">
      {/* Layer-Toggle: Baumkataster */}
      <button
        onClick={toggleBaumkataster}
        className="flex items-center gap-2.5 px-3 py-2 rounded-[10px] transition-colors text-left"
        style={{
          background: showBaumkataster ? 'rgba(34,197,94,0.08)' : 'var(--bg-2)',
          border: showBaumkataster
            ? '1px solid rgba(34,197,94,0.35)'
            : '1px solid var(--border)',
        }}
      >
        <span
          className="shrink-0 flex items-center justify-center rounded"
          style={{
            width: 16, height: 16,
            background: showBaumkataster ? 'var(--green)' : 'transparent',
            border: showBaumkataster ? 'none' : '1.5px solid var(--text-3)',
          }}
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

      {/* Slider */}
      <div className={hasSel ? '' : 'opacity-50 pointer-events-none'}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Neupflanzungen
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="font-mono tabular-nums text-fg-0" style={{ fontSize: 24, fontWeight: 600 }}>
            {fmt.num(anzahl)}
          </span>
          <span className="text-fg-2 text-[13px]">Bäume</span>
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
        <div className="text-fg-2 text-[11px] mt-1.5 leading-relaxed">
          ↳ Bestand <span className="font-mono text-fg-1">{fmt.pct(existingPct)}</span>
          {' '}+ neu <span className="font-mono text-fg-1">{fmt.pct(effectiveNewPct)}</span>
          {' '}= gesamt <span className="font-mono text-fg-0">{fmt.pct(totalPct)}</span>
          {' '}auf {fmt.area(selectedCellsAreaM2 || 0)}
        </div>
        {newPctRaw > headroomPct + 0.05 && hasSel && (
          <div className="text-accent-amber text-[10px] mt-1">
            ⚠ {fmt.pct(newPctRaw - headroomPct)} der Neupflanzungen überschreiten den verfügbaren Headroom — kein zusätzlicher Δ°C-Effekt.
          </div>
        )}
        <div className="text-fg-3 text-[10px] mt-1 font-mono">
          Max: {fmt.num(sliderMax)} Bäume = 100 % Gesamtdeckung (Formelgrenze, Landsat-basiert)
        </div>
      </div>

      {/* Result Grid */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Ergebnisse
        </div>
        <div className="grid grid-cols-3 gap-2">
          <SimResultCard
            label="Δ LST"
            value={result ? fmt.dT(result.delta_lst_celsius) : '—'}
            color="green"
            caveat={result ? 'München-Koeffizient' : null}
            loading={loading && !result}
            empty={!hasSel}
          />
          <SimResultCard
            label="CO₂"
            value={co2 ? co2.value : '—'}
            unit={co2 ? co2.unit : ''}
            color="green"
            caveat={result ? 'Ausgewachsene Bäume' : null}
            loading={loading && !result}
            empty={!hasSel}
          />
          <SimResultCard
            label="Gesamtdeckung"
            value={result ? fmt.pct(result.total_coverage_pct) : '—'}
            color="green"
            caveat={result ? `+ ${fmt.pct(result.effective_new_pct)} neu` : null}
            loading={loading && !result}
            empty={!hasSel}
          />
        </div>
        {error && (
          <div className="mt-3 text-[12px] text-accent-red">
            Berechnung fehlgeschlagen — bitte erneut versuchen.
          </div>
        )}
      </div>

      {/* Methodik-Toggle */}
      <div className="pt-2" style={{ borderTop: '1px solid var(--border-soft)' }}>
        <button
          onClick={() => setMethodikOpen((v) => !v)}
          className="flex items-center justify-center gap-1.5 w-full rounded-md py-1.5 text-[11px] font-medium transition-colors"
          style={{
            background: methodikOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border)',
            color: methodikOpen ? 'var(--text-1)' : 'var(--text-3)',
          }}
        >
          Methodik & Einschränkungen {methodikOpen ? 'ausblenden' : 'anzeigen'}
        </button>
        {methodikOpen && (
          <div className="mt-3 space-y-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {result?.caveats?.map((c, i) => (
              <p key={i}>• {c}</p>
            ))}
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
