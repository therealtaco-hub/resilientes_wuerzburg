import { useEffect, useMemo, useRef, useState } from 'react'
import useAppStore from '../../store/useAppStore'
import { fetchSimulateWasser } from '../../api/simulate'
import {
  SEAL_RATE,
  getSealRate,
  SURFACE_LABELS,
  TYPE_KEY_LABELS,
  getFromSurface,
} from '../../utils/simulate'
import { fmt } from '../../utils/format'
import SimResultCard from './SimResultCard'
import EntsiegelungLegend from '../map/EntsiegelungLegend'

const DEBOUNCE_MS = 300

// m³/Jahr → anschauliche Einheit je nach Größenordnung
function formatWasserKontext(m3year) {
  if (m3year < 2) {
    const count = Math.round(m3year * 100) // à 10 L
    return { count: fmt.num(count), unit: 'Eimer/Jahr', sub: 'à 10 L' }
  } else if (m3year < 150) {
    const count = Math.round(m3year * 1000 / 150) // à 150 L
    return { count: fmt.num(count), unit: 'Badewannen/Jahr', sub: 'à 150 L' }
  } else {
    const count = (m3year / 50).toFixed(1) // à 50 m³
    return { count, unit: 'Schwimmbecken/Jahr', sub: 'à 50 m³' }
  }
}

export default function WasserSimPanel() {
  const polygons    = useAppStore((s) => s.sim.selectedPolygons)
  const polysAreaM2 = useAppStore((s) => s.sim.selectedPolygonsAreaM2)
  const flaecheM2   = useAppStore((s) => s.sim.wasser.flaeche_m2)
  const groupConfig = useAppStore((s) => s.sim.wasser.groupConfig)
  const setFlaeche  = useAppStore((s) => s.setSimWasserFlaeche)
  const setGroupSurface = useAppStore((s) => s.setSimWasserGroupSurface)
  const clearPolys  = useAppStore((s) => s.clearSimPolygons)

  // Gruppen-Aggregate (Σ area, sealable) je type_key
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

  const totalSealable = useMemo(() => groups.reduce((s, g) => s + g.sealable, 0), [groups])
  const hasSel = polygons.length > 0
  const sliderMax = Math.floor(totalSealable)
  const sliderDisabled = !hasSel || totalSealable <= 0

  const [results, setResults] = useState(null) // { infiltration, retention, persons, caveats[] }
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)
  const [methodikOpen, setMethodikOpen] = useState(false)

  const debounceRef = useRef(null)
  const reqIdRef    = useRef(0)

  useEffect(() => {
    if (!hasSel || flaecheM2 <= 0 || totalSealable <= 0) {
      setResults(null)
      setError(null)
      setLoading(false)
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current
      // Pro Gruppe ein Call mit proportional zugeteilter Fläche
      const calls = groups
        .map((g) => {
          const cfg = groupConfig[g.type_key]
          if (!cfg) return null
          const area = flaecheM2 * (g.sealable / totalSealable)
          if (area <= 0) return null
          return fetchSimulateWasser({
            area_m2: area,
            from_surface: cfg.from_surface,
            to_surface:   cfg.to_surface,
          }).then((res) => ({ res, area }))
        })
        .filter(Boolean)

      Promise.all(calls)
        .then((parts) => {
          if (reqId !== reqIdRef.current) return
          const totalInfiltration = parts.reduce((s, p) => s + p.res.infiltration_m3_year, 0)
          const totalPersons      = parts.reduce((s, p) => s + p.res.context_persons, 0)
          const areaSum           = parts.reduce((s, p) => s + p.area, 0)
          const weightedRetention = areaSum > 0
            ? parts.reduce((s, p) => s + p.res.retention_pct * p.area, 0) / areaSum
            : 0
          const allCaveats = parts.flatMap((p) => p.res.caveats || [])
          setResults({
            infiltration: totalInfiltration,
            retention:    weightedRetention,
            persons:      totalPersons,
            caveats:      [...new Set(allCaveats)],
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

  const wasserCtx = results ? formatWasserKontext(results.infiltration) : null
  const surfaceKeys = Object.keys(SURFACE_LABELS)

  return (
    <div className="flex flex-col gap-5">
      {/* Entsiegelung-Legende */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-2">
          Flächenarten
        </p>
        <EntsiegelungLegend />
      </div>

      {/* Area-Info-Banner */}
      <div className="bg-bg-2 border border-border rounded-[10px] p-4 flex items-center gap-3">
        <span style={{ fontSize: 22 }}>💧</span>
        <div className="flex-1 min-w-0">
          {hasSel ? (
            <>
              <div className="text-fg-0 text-[14px] font-medium">
                {fmt.area(polysAreaM2)} · {polygons.length} {polygons.length === 1 ? 'Polygon' : 'Polygone'}
              </div>
              <div className="text-fg-3 text-[11px] mt-0.5">
                ausgewählt
              </div>
            </>
          ) : (
            <div className="text-fg-2 text-[12px] leading-snug">
              Klicke auf Polygone in der Karte, um die Simulation zu starten.
              <br />
              <span className="text-fg-3">Flachdächer sind nicht auswählbar.</span>
            </div>
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

      {/* Belagstypen */}
      {hasSel && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
            Belagstypen
          </div>
          <div className="flex flex-col gap-3">
            {groups.map((g) => {
              const cfg = groupConfig[g.type_key] ?? {
                from_surface: getFromSurface(g.type_key),
                to_surface:   'schotterrasen',
              }
              return (
                <div
                  key={g.type_key}
                  className="bg-bg-2 border border-border rounded-[8px] p-3"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <div className="text-fg-0 text-[12px] font-medium">
                      {TYPE_KEY_LABELS[g.type_key] ?? g.type_key}
                    </div>
                    <div className="text-fg-3 text-[10px] font-mono">
                      {fmt.area(g.area_m2)} · {g.count}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-fg-3 text-[10px] w-6">Von</span>
                    <select
                      value={cfg.from_surface}
                      onChange={(e) => setGroupSurface(g.type_key, 'from_surface', e.target.value)}
                      className="flex-1 bg-bg-1 border border-border rounded px-2 py-1 text-fg-1 text-[11px]"
                    >
                      {surfaceKeys.map((k) => (
                        <option key={k} value={k}>{SURFACE_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-fg-3 text-[10px] w-6">Zu</span>
                    <select
                      value={cfg.to_surface}
                      onChange={(e) => setGroupSurface(g.type_key, 'to_surface', e.target.value)}
                      className="flex-1 bg-bg-1 border border-border rounded px-2 py-1 text-fg-1 text-[11px]"
                    >
                      {surfaceKeys.map((k) => (
                        <option key={k} value={k}>{SURFACE_LABELS[k]}</option>
                      ))}
                    </select>
                  </div>
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
          <span className="font-mono tabular-nums text-fg-0" style={{ fontSize: 24, fontWeight: 600 }}>
            {fmt.num(Math.round(flaecheM2))}
          </span>
          <span className="text-fg-2 text-[13px]">m²</span>
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
        <div className="text-fg-3 text-[10px] mt-1 font-mono">
          Max: {fmt.num(sliderMax)} m² (Σ versiegelte Fläche, Literaturwerte)
        </div>
      </div>

      {/* Result Grid */}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3 mb-3">
          Ergebnisse
        </div>
        <div className="grid grid-cols-3 gap-2">
          <SimResultCard
            label="Versickerung"
            value={results ? fmt.num(results.infiltration, 0) : '—'}
            unit="m³/Jahr"
            color="blue"
            loading={loading && !results}
            empty={!hasSel}
          />
          <SimResultCard
            label="Retention"
            value={results ? fmt.pct(results.retention) : '—'}
            color="green"
            loading={loading && !results}
            empty={!hasSel}
          />
          <SimResultCard
            label="Entspricht"
            value={wasserCtx ? wasserCtx.count : '—'}
            unit={wasserCtx ? wasserCtx.unit : ''}
            color="amber"
            caveat={wasserCtx ? wasserCtx.sub : null}
            loading={loading && !results}
            empty={!hasSel}
          />
        </div>
        {error && (
          <div className="mt-3 text-[12px] text-accent-red">
            Berechnung fehlgeschlagen — bitte erneut versuchen.
          </div>
        )}
      </div>

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
          <div className="mt-3 space-y-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-2)' }}>
            {results?.caveats?.map((c, i) => (
              <p key={i}>• {c}</p>
            ))}
            <p className="font-mono text-[10px] pt-1" style={{ color: 'var(--text-3)' }}>
              Versiegelungsgrade je Flächentyp (Literaturwerte):
            </p>
            <ul className="font-mono text-[10px] space-y-0.5" style={{ color: 'var(--text-3)' }}>
              {Object.entries(SEAL_RATE)
                .filter(([k]) => k !== '_default')
                .map(([k, v]) => (
                  <li key={k}>{TYPE_KEY_LABELS[k] ?? k}: {(v * 100).toFixed(0)} %</li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
