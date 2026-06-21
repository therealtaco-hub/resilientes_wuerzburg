import { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fetchSimulateWasser } from '../../api/simulate'
import {
  SEAL_RATE,
  getSealRate,
  SURFACE_LABELS,
  TYPE_KEY_LABELS,
  getFromSurface,
  isAlreadyGreenest,
  RUNOFF_COEFFICIENTS,
  TYPICAL_REALIZATION_RATE,
  getTypicalRealizationRate,
  WATER_USE_M3_PER_PERSON_YEAR,
} from '../../utils/simulate'
import { fmt } from '../../utils/format'
import EntsiegelungLegend from '../map/EntsiegelungLegend'

const DEBOUNCE_MS = 300

// Trinkwasserbedarf aus simulate.js (BDEW 2023, gespiegelt aus simulation_params.py)
const WATER_USE_M3_PER_PERSON = WATER_USE_M3_PER_PERSON_YEAR

// Anteil der Versickerung, der das Grundwasser erreicht (LfU Bayern, Richtwert für Bayern)
const GW_RATE_LOW  = 0.15
const GW_RATE_HIGH = 0.30

function formatWasserKontext(m3year) {
  if (m3year < 2) {
    const count = Math.round(m3year * 100)
    return { count: fmt.num(count), unit: 'Eimer/Jahr', sub: 'à 10 L' }
  } else if (m3year < 150) {
    const count = Math.round(m3year * 1000 / 150)
    return { count: fmt.num(count), unit: 'Badewannen/Jahr', sub: 'à 150 L' }
  } else {
    const count = (m3year / 50).toFixed(1)
    return { count, unit: 'Schwimmbecken/Jahr', sub: 'à 50 m³' }
  }
}

// Farbiger Chip: zeigt Ψ-Wert + qualitative Einschätzung
function PsiChip({ psi }) {
  const color = psi >= 0.75
    ? 'rgba(239,68,68,0.85)'
    : psi >= 0.40
      ? 'rgba(251,191,36,0.9)'
      : 'rgba(34,197,94,0.9)'
  const bg = psi >= 0.75
    ? 'rgba(239,68,68,0.08)'
    : psi >= 0.40
      ? 'rgba(251,191,36,0.08)'
      : 'rgba(34,197,94,0.08)'
  const label = psi >= 0.75
    ? 'Kaum Versickerung'
    : psi >= 0.40
      ? 'Mäßige Versickerung'
      : psi >= 0.15
        ? 'Gute Versickerung'
        : 'Sehr gute Versickerung'
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono"
      style={{ background: bg, color }}
    >
      <span>Ψ = {psi.toFixed(2)}</span>
      <span style={{ opacity: 0.5 }}>·</span>
      <span>{label}</span>
    </div>
  )
}

// Zeile mit Label, Wert und Fortschrittsbalken
function AreaRow({ label, value, pct, barColor }) {
  const width = Math.max(0, Math.min(100, (pct ?? 0) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-fg-3 text-[11px]">{label}</span>
        <span className="font-mono text-[11px] text-fg-1">{value}</span>
      </div>
      <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${width}%`, background: barColor }}
        />
      </div>
    </div>
  )
}

// Vor/Nachher-Balken: Abfluss (rot) + Versickerung (blau)
function WasserBalanceBar({ label, runoffPct }) {
  const runW = Math.max(0, Math.min(100, runoffPct * 100))
  const infW = 100 - runW
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-3 text-[10px] font-mono w-[44px] shrink-0">{label}</span>
      <div className="flex-1 flex rounded-full overflow-hidden h-[7px]">
        <div
          className="transition-all duration-700"
          style={{ width: `${runW}%`, background: 'rgba(239,68,68,0.55)' }}
        />
        <div
          className="transition-all duration-700"
          style={{ width: `${infW}%`, background: 'rgba(59,130,246,0.65)' }}
        />
      </div>
      <div className="flex gap-2 shrink-0 text-[10px] font-mono w-[80px]">
        <span style={{ color: 'rgba(239,68,68,0.7)' }}>{Math.round(runW)} %</span>
        <span style={{ color: 'rgba(59,130,246,0.8)' }}>{Math.round(infW)} %</span>
      </div>
    </div>
  )
}

export default function WasserSimPanel() {
  const polygons    = useAppStore((s) => s.sim.selectedPolygons)
  const polysAreaM2 = useAppStore((s) => s.sim.selectedPolygonsAreaM2)
  const flaecheM2   = useAppStore((s) => s.sim.wasser.flaeche_m2)
  const groupConfig = useAppStore((s) => s.sim.wasser.groupConfig)
  const setFlaeche  = useAppStore((s) => s.setSimWasserFlaeche)
  const setGroupSurface = useAppStore((s) => s.setSimWasserGroupSurface)
  const clearPolys  = useAppStore((s) => s.clearSimPolygons)

  // Gruppen-Aggregate je type_key
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of polygons) {
      const g = map.get(p.type_key) ?? { type_key: p.type_key, area_m2: 0, sealable: 0, count: 0 }
      g.area_m2 += p.area_m2
      g.sealable += p.area_m2 * getSealRate(p.type_key)
      g.count += 1
      map.set(p.type_key, g)
    }
    return Array.from(map.values())
  }, [polygons])

  const totalSealable   = useMemo(() => groups.reduce((s, g) => s + g.sealable, 0), [groups])
  const totalTypicalMax = useMemo(() =>
    groups.reduce((s, g) => s + g.sealable * getTypicalRealizationRate(g.type_key), 0),
  [groups])

  const hasSel = polygons.length > 0
  const sliderMax = Math.floor(totalSealable)
  const sliderDisabled = !hasSel || totalSealable <= 0

  // Numerisches Eingabefeld synchron zum Store
  const [inputVal, setInputVal] = useState(String(flaecheM2))
  useEffect(() => { setInputVal(String(flaecheM2)) }, [flaecheM2])

  const handleInputChange  = (e) => setInputVal(e.target.value)
  const handleInputBlur    = () => {
    const n = parseInt(inputVal, 10)
    if (!isNaN(n) && n >= 0 && n <= sliderMax) setFlaeche(n)
    else setInputVal(String(flaecheM2))
  }
  const handleInputKeyDown = (e) => { if (e.key === 'Enter') e.target.blur() }

  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [methodikOpen, setMethodikOpen] = useState(false)

  const debounceRef = useRef(null)
  const reqIdRef    = useRef(0)

  useEffect(() => {
    if (!hasSel || flaecheM2 <= 0 || totalSealable <= 0) {
      setResults(null); setError(null); setLoading(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current
      const calls = groups
        .map((g) => {
          const cfg = groupConfig[g.type_key]
          if (!cfg) return null
          if (isAlreadyGreenest(cfg.from_surface)) return null
          const area = flaecheM2 * (g.sealable / totalSealable)
          if (area <= 0) return null
          return fetchSimulateWasser({
            area_m2: area,
            from_surface: cfg.from_surface,
            to_surface:   cfg.to_surface,
          }).then((res) => ({ res, area, from: cfg.from_surface, to: cfg.to_surface }))
        })
        .filter(Boolean)

      Promise.all(calls)
        .then((parts) => {
          if (reqId !== reqIdRef.current) return
          const totalInfiltration = parts.reduce((s, p) => s + p.res.infiltration_m3_year, 0)
          const areaSum           = parts.reduce((s, p) => s + p.area, 0)
          const avgFromPsi = areaSum > 0
            ? parts.reduce((s, p) => s + (RUNOFF_COEFFICIENTS[p.from] ?? 0.90) * p.area, 0) / areaSum
            : 0
          const avgToPsi = areaSum > 0
            ? parts.reduce((s, p) => s + (RUNOFF_COEFFICIENTS[p.to] ?? 0.05) * p.area, 0) / areaSum
            : 0
          const allCaveats = parts.flatMap((p) => p.res.caveats || [])
          setResults({
            infiltration: totalInfiltration,
            avgFromPsi,
            avgToPsi,
            caveats: [...new Set(allCaveats)],
          })
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
  }, [hasSel, flaecheM2, totalSealable, groupConfig, groups])

  // Gewichteter Ψ-Vorher-Wert (aus groupConfig, ohne API-Call)
  const avgFromPsiStatic = useMemo(() => {
    if (!hasSel || totalSealable <= 0) return null
    return groups.reduce((s, g) => {
      const cfg  = groupConfig[g.type_key]
      const from = cfg?.from_surface ?? getFromSurface(g.type_key)
      return s + (g.sealable / totalSealable) * (RUNOFF_COEFFICIENTS[from] ?? 0.90)
    }, 0)
  }, [groups, groupConfig, hasSel, totalSealable])

  const wasserCtx  = results ? formatWasserKontext(results.infiltration) : null
  const surfaceKeys = Object.keys(SURFACE_LABELS)

  return (
    <div className="flex flex-col gap-5">
      {/* Start-Hinweis — verschwindet bei erster Auswahl */}
      {!hasSel && (
        <div
          className="rounded-[10px] p-4 flex items-start gap-3"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)' }}
        >
          <span style={{ fontSize: 20 }}>👆</span>
          <div className="min-w-0">
            <div className="text-fg-0 text-[13px] font-semibold mb-0.5">So startest du die Simulation</div>
            <div className="text-fg-2 text-[12px] leading-snug">
              Klicke auf ein oder mehrere <span className="font-medium text-fg-0">Polygone</span> (Flächen)
              in der Karte, um sie zu entsiegeln. Anschließend wählst du den neuen Belag und siehst die
              jährliche Versickerung. <span className="text-fg-3">Flachdächer sind nicht auswählbar.</span>
            </div>
          </div>
        </div>
      )}

      {/* Legende */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-2">Flächenarten</p>
        <EntsiegelungLegend />
      </div>

      {/* Flächenaufschlüsselung */}
      <div className="bg-bg-2 border border-border rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 18 }}>💧</span>
            {hasSel ? (
              <span className="text-fg-0 text-[13px] font-medium">
                {polygons.length} {polygons.length === 1 ? 'Polygon' : 'Polygone'} ausgewählt
              </span>
            ) : (
              <span className="text-fg-2 text-[12px]">Keine Auswahl</span>
            )}
          </div>
          {hasSel && (
            <button
              onClick={clearPolys}
              className="text-fg-3 hover:text-fg-0 text-[11px] font-medium px-2 py-1 rounded transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}
            >
              Zurücksetzen
            </button>
          )}
        </div>

        {hasSel ? (
          <div className="flex flex-col gap-3">
            <AreaRow
              label="Gesamt"
              value={fmt.area(polysAreaM2)}
              pct={1}
              barColor="rgba(148,163,184,0.4)"
            />
            <AreaRow
              label="Davon versiegelt"
              value={fmt.area(totalSealable)}
              pct={polysAreaM2 > 0 ? totalSealable / polysAreaM2 : 0}
              barColor="rgba(239,68,68,0.55)"
            />
            <div>
              <AreaRow
                label="Typ. entsiegelbar"
                value={`~${fmt.area(totalTypicalMax)}`}
                pct={polysAreaM2 > 0 ? totalTypicalMax / polysAreaM2 : 0}
                barColor="rgba(59,130,246,0.65)"
              />
              <div
                className="text-[10px] mt-1"
                style={{ color: 'var(--text-3)' }}
                title="In der Praxis entfällt ein Großteil der versiegelten Fläche auf Gebäude (z. B. Fabrikhallen, Wohnhäuser), die nicht entsiegelt werden können. Schätzwert nach Flächentyp — kein harter Cap."
              >
                Schätzwert (kein harter Cap) · Hover für Details
              </div>
            </div>
          </div>
        ) : (
          <div className="text-fg-2 text-[12px] leading-snug">
            Klicke auf Polygone in der Karte, um die Simulation zu starten.
            <br />
            <span className="text-fg-3">Flachdächer sind nicht auswählbar.</span>
          </div>
        )}
      </div>

      {/* Belagstypen-Gruppen */}
      {hasSel && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">Belagstypen</div>
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              const cfg = groupConfig[g.type_key] ?? {
                from_surface: getFromSurface(g.type_key),
                to_surface:   getFromSurface(g.type_key),
              }
              const greenest  = isAlreadyGreenest(cfg.from_surface)
              const sealRate  = getSealRate(g.type_key)
              const fromPsi   = RUNOFF_COEFFICIENTS[cfg.from_surface] ?? 0.90
              const toPsi     = RUNOFF_COEFFICIENTS[cfg.to_surface]   ?? 0.05
              const deltaPsi  = fromPsi - toPsi

              return (
                <div
                  key={g.type_key}
                  className="bg-bg-2 border border-border rounded-[8px] p-3"
                  style={greenest ? { opacity: 0.6 } : undefined}
                >
                  {/* Kopfzeile */}
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-fg-0 text-[12px] font-medium">
                      {TYPE_KEY_LABELS[g.type_key] ?? g.type_key}
                    </div>
                    <div className="text-fg-3 text-[10px] font-mono">
                      {fmt.area(g.area_m2)} · {g.count}
                    </div>
                  </div>

                  {/* Versiegelungsgrad-Balken */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-fg-3 text-[10px]">Versiegelungsgrad</span>
                      <span className="text-fg-2 text-[10px] font-mono">{Math.round(sealRate * 100)} %</span>
                    </div>
                    <div className="h-[4px] rounded-full overflow-hidden" style={{ background: 'var(--bg-3)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${sealRate * 100}%`,
                          background: sealRate >= 0.75
                            ? 'rgba(239,68,68,0.65)'
                            : sealRate >= 0.45
                              ? 'rgba(251,191,36,0.65)'
                              : 'rgba(34,197,94,0.55)',
                        }}
                      />
                    </div>
                  </div>

                  {greenest ? (
                    <div
                      className="text-[11px] leading-snug px-2 py-1.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-3)', border: '1px solid var(--border)' }}
                    >
                      Bereits vollversickernde Fläche – keine Entsiegelung möglich
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {/* Von */}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-fg-3 text-[10px] w-6 shrink-0">Von</span>
                          <select
                            value={cfg.from_surface}
                            onChange={(e) => setGroupSurface(g.type_key, 'from_surface', e.target.value)}
                            className="flex-1 bg-bg-1 border border-border rounded px-2 py-1 text-fg-1 text-[11px]"
                          >
                            {surfaceKeys.map((k) => (
                              <option key={k} value={k}>
                                {SURFACE_LABELS[k]} (Ψ {(RUNOFF_COEFFICIENTS[k] ?? 0).toFixed(2)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pl-8">
                          <PsiChip psi={fromPsi} />
                        </div>
                      </div>

                      {/* Delta-Chip */}
                      <div className="flex items-center justify-center">
                        <div
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[4px] text-[10px] font-mono"
                          style={{
                            background: deltaPsi > 0.1 ? 'rgba(34,197,94,0.08)' : deltaPsi < -0.05 ? 'rgba(239,68,68,0.08)' : 'rgba(148,163,184,0.08)',
                            color: deltaPsi > 0.1 ? 'rgba(34,197,94,0.85)' : deltaPsi < -0.05 ? 'rgba(239,68,68,0.85)' : 'var(--text-3)',
                          }}
                        >
                          <span>{deltaPsi > 0.05 ? '↓' : deltaPsi < -0.05 ? '↑' : '='}</span>
                          <span>Ψ {deltaPsi >= 0 ? '−' : '+'}{Math.abs(deltaPsi).toFixed(2)}</span>
                          <span style={{ opacity: 0.5 }}>·</span>
                          <span>
                            {deltaPsi >= 0.40
                              ? 'Starke Verbesserung'
                              : deltaPsi >= 0.10
                                ? 'Verbesserung'
                                : deltaPsi > 0.01
                                  ? 'Geringe Verbesserung'
                                  : 'Keine Veränderung'}
                          </span>
                        </div>
                      </div>

                      {/* Zu */}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-fg-3 text-[10px] w-6 shrink-0">Zu</span>
                          <select
                            value={cfg.to_surface}
                            onChange={(e) => setGroupSurface(g.type_key, 'to_surface', e.target.value)}
                            className="flex-1 bg-bg-1 border border-border rounded px-2 py-1 text-fg-1 text-[11px]"
                          >
                            {surfaceKeys.map((k) => (
                              <option key={k} value={k}>
                                {SURFACE_LABELS[k]} (Ψ {(RUNOFF_COEFFICIENTS[k] ?? 0).toFixed(2)})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="pl-8">
                          <PsiChip psi={toPsi} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Slider */}
      <div className={hasSel ? '' : 'opacity-50 pointer-events-none'}>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Zu entsiegelnde Fläche
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <input
            type="number"
            value={inputVal}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleInputKeyDown}
            min={0}
            max={Math.max(sliderMax, 1)}
            disabled={sliderDisabled}
            className="no-spinner font-mono tabular-nums text-fg-0 bg-transparent focus:outline-none text-left"
            style={{
              fontSize: 28,
              fontWeight: 600,
              width: `${Math.max(String(sliderMax).length, 3) + 1}ch`,
              borderBottom: '1.5px solid var(--border)',
            }}
          />
          <span className="text-fg-2 text-[13px]">m²</span>
          {sliderMax > 0 && (
            <span className="ml-auto text-fg-3 text-[10px] font-mono">max {fmt.num(sliderMax)}</span>
          )}
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(sliderMax, 1)}
          value={Math.min(flaecheM2, Math.max(sliderMax, 1))}
          onChange={(e) => setFlaeche(parseInt(e.target.value, 10))}
          disabled={sliderDisabled}
          className="w-full accent-[color:var(--blue)]"
        />
        <div className="flex flex-col gap-1 mt-1.5">
          <div className="text-fg-3 text-[10px] font-mono">
            Max: {fmt.num(sliderMax)} m² (Σ versiegelte Fläche, Literaturwerte)
          </div>
          {hasSel && totalTypicalMax > 0 && (
            <div
              className="flex items-center gap-1 text-[10px] cursor-help"
              style={{ color: 'rgba(251,191,36,0.85)' }}
              title="In der Praxis ist ein Großteil der versiegelten Fläche durch Gebäude (z. B. Fabrikhallen, Wohnhäuser) belegt, die nicht entsiegelt werden können. Der Schätzwert basiert auf Literaturwerten je Flächentyp — kein harter Cap."
            >
              <span>⚠</span>
              <span>
                Typisch realistisch: ~{fmt.num(Math.round(totalTypicalMax))} m²
                {polysAreaM2 > 0 && ` (~${Math.round(totalTypicalMax / polysAreaM2 * 100)} % der Gesamtfläche)`}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Ergebnisse */}
      {hasSel && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">Ergebnisse</div>
          <div
            className="rounded-[10px] p-4 flex flex-col gap-4"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--border)' }}
          >
            {loading && !results ? (
              <div className="flex justify-center py-3">
                <span
                  className="inline-block w-4 h-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'var(--blue)', borderTopColor: 'transparent' }}
                />
              </div>
            ) : (
              <>
                {/* Wasserbalance Vorher/Nachher */}
                <div>
                  <div className="flex items-center gap-3 mb-2 text-[10px]" style={{ color: 'var(--text-3)' }}>
                    <span className="uppercase tracking-[0.08em]">Abflussanteil</span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.55)' }} />
                      Abfluss
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(59,130,246,0.65)' }} />
                      Versickerung
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {avgFromPsiStatic != null && (
                      <WasserBalanceBar label="Vorher" runoffPct={avgFromPsiStatic} />
                    )}
                    <WasserBalanceBar
                      label="Nachher"
                      runoffPct={results ? results.avgToPsi : (avgFromPsiStatic ?? 0)}
                    />
                  </div>
                </div>

                {/* Versickerung + Interpretation */}
                <div style={{ borderTop: '1px solid var(--border-soft)', paddingTop: 14 }}>
                  {results ? (
                    <div className="flex flex-col gap-3">

                      {/* Primärer Wert */}
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--text-3)' }}>
                          Zusätzliche Versickerung
                        </p>
                        <div className="flex items-baseline gap-1.5 mb-2">
                          <span
                            className="font-mono tabular-nums"
                            style={{ fontSize: 26, fontWeight: 600, color: 'rgba(59,130,246,0.9)' }}
                          >
                            {fmt.num(results.infiltration, 0)}
                          </span>
                          <span className="text-fg-2 text-[13px] font-mono">m³/Jahr</span>
                        </div>
                        {/* Einordnung */}
                        <div className="flex flex-col gap-1">
                          <div className="text-[11px]" style={{ color: 'var(--text-2)' }}>
                            ≈{' '}
                            <span className="font-mono font-semibold">
                              {results.infiltration < WATER_USE_M3_PER_PERSON
                                ? '< 1'
                                : fmt.num(Math.round(results.infiltration / WATER_USE_M3_PER_PERSON), 0)}
                            </span>
                            {' '}Personen-Jahrestrinkwasserbedarf
                            <span className="text-[10px] ml-1" style={{ color: 'var(--text-3)' }}>
                              (127 L/Tag, BDEW 2023)
                            </span>
                          </div>
                          {wasserCtx && (
                            <div className="text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>
                              ≈ {wasserCtx.count} {wasserCtx.unit}
                              <span className="ml-1">({wasserCtx.sub})</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Grundwasserneubildung */}
                      <div
                        className="rounded-[8px] p-3 flex flex-col gap-2"
                        style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}
                      >
                        <p className="text-[10px] uppercase tracking-[0.08em]" style={{ color: 'rgba(59,130,246,0.6)' }}>
                          Grundwasserneubildung (Schätzwert)
                        </p>
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className="font-mono tabular-nums"
                            style={{ fontSize: 16, fontWeight: 600, color: 'rgba(59,130,246,0.75)' }}
                          >
                            ~{fmt.num(Math.round(results.infiltration * GW_RATE_LOW), 0)}–{fmt.num(Math.round(results.infiltration * GW_RATE_HIGH), 0)}
                          </span>
                          <span className="text-[11px] font-mono" style={{ color: 'var(--text-3)' }}>m³/Jahr</span>
                        </div>
                        <p className="text-[10px]" style={{ color: 'var(--text-3)' }}>
                          Ca. 15–30 % der Versickerung erreichen das Grundwasser (LfU Bayern, Richtwert für Bayern).
                        </p>
                        <div className="flex items-start gap-1.5 text-[10px]" style={{ color: 'rgba(251,191,36,0.75)' }}>
                          <span className="shrink-0 mt-px">⚠</span>
                          <span>
                            Lokale Bodeneigenschaften, Grundwassertiefe und Bebauungsdichte im Einzugsgebiet sind nicht berücksichtigt — Wert dient nur als Orientierung.
                          </span>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      <span className="font-mono" style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-3)' }}>—</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-3)' }}>Fläche auswählen und Slider bedienen</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {error && (
            <div className="mt-2 text-[12px] text-accent-red">
              Berechnung fehlgeschlagen — bitte erneut versuchen.
            </div>
          )}
        </div>
      )}

      {/* Methodik */}
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
          <div className="mt-3 flex flex-col gap-4 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>

            {/* API-Caveats */}
            {results?.caveats?.length > 0 && (
              <div className="flex flex-col gap-1">
                {results.caveats.map((c, i) => <p key={i}>• {c}</p>)}
              </div>
            )}

            {/* Berechnungsformel */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Berechnungsformel
              </p>
              <p className="font-mono text-[10px] px-2 py-1.5 rounded" style={{ background: 'var(--bg-3)', color: 'var(--text-2)' }}>
                Versickerung = A × N × (Ψ<sub>von</sub> − Ψ<sub>zu</sub>)
              </p>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--text-3)' }}>
                A = entsiegelte Fläche (m²) · N = Jahresniederschlag (0,5735 m/Jahr, DWD Station 05705 Würzburg, Klimanormalperiode 1991–2020) · Ψ = Abflussbeiwert
              </p>
            </div>

            {/* Abflussbeiwerte */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Abflussbeiwerte Ψ je Belagstyp
              </p>
              <table className="w-full font-mono text-[10px]" style={{ color: 'var(--text-3)', borderSpacing: 0 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <th className="text-left pb-1 font-medium" style={{ color: 'var(--text-2)' }}>Belagstyp</th>
                    <th className="text-right pb-1 font-medium" style={{ color: 'var(--text-2)' }}>Ψ</th>
                    <th className="text-right pb-1 font-medium pl-3" style={{ color: 'var(--text-2)' }}>Quelle</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(RUNOFF_COEFFICIENTS).map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                      <td className="py-0.5">{SURFACE_LABELS[k] ?? k}</td>
                      <td className="text-right py-0.5">{v.toFixed(2)}</td>
                      <td className="text-right py-0.5 pl-3" style={{ color: 'var(--text-3)', opacity: 0.6 }}>
                        {v === 0.90 || v === 0.75 || v === 0.50 || v === 0.30 && k === 'schotterrasen' || v === 0.15 && k === 'rasengitter' || v === 0.05
                          ? 'DWA-A138'
                          : 'Bayreuth 2024'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Versiegelungsgrade */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Versiegelungsgrade je Flächentyp
              </p>
              <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Anteil der Gesamtfläche, der als versiegelt gilt (Literaturwerte). Bestimmt den Slider-Maximalwert.
              </p>
              <table className="w-full font-mono text-[10px]" style={{ color: 'var(--text-3)', borderSpacing: 0 }}>
                <tbody>
                  {Object.entries(SEAL_RATE)
                    .filter(([k]) => k !== '_default')
                    .map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="py-0.5">{TYPE_KEY_LABELS[k] ?? k}</td>
                        <td className="text-right py-0.5">{(v * 100).toFixed(0)} %</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Realisierbarkeitsfaktoren */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Realisierbarkeitsfaktoren (Schätzwerte)
              </p>
              <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-3)' }}>
                Anteil der versiegelten Fläche, der in der Praxis entsiegelt werden kann. Gebäudeflächen, Fundamente und infrastrukturell notwendige Versiegelungen sind ausgenommen. Kein harter Cap — dient nur als Orientierung.
              </p>
              <table className="w-full font-mono text-[10px]" style={{ color: 'var(--text-3)', borderSpacing: 0 }}>
                <tbody>
                  {Object.entries(TYPICAL_REALIZATION_RATE)
                    .filter(([k]) => k !== '_default')
                    .map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td className="py-0.5">{TYPE_KEY_LABELS[k] ?? k}</td>
                        <td className="text-right py-0.5">{(v * 100).toFixed(0)} %</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
