import { fmt } from '../../utils/format'

const BASE_STYLE = {
  background: 'rgba(15,17,23,0.80)',
  backdropFilter: 'blur(6px)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  padding: '12px',
}

export default function LSTLegend({ min, median, max, mode = 'absolute', deltaMin, deltaMax }) {
  if (mode === 'delta') {
    const loaded = deltaMin != null && deltaMax != null &&
                   isFinite(deltaMin) && isFinite(deltaMax)

    // Position of 0 within [deltaMin, deltaMax] as a fraction 0..1
    const zeroFrac = loaded
      ? (deltaMin >= 0 ? 0 : deltaMax <= 0 ? 1
          : Math.abs(deltaMin) / (Math.abs(deltaMin) + deltaMax))
      : 0.5
    const zeroPct = (zeroFrac * 100).toFixed(1)

    return (
      <div style={BASE_STYLE}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-fg-3 mb-2">
          Δ Temperatur
        </p>
        <div
          style={{
            width: '160px',
            height: '8px',
            borderRadius: '4px',
            background: loaded
              ? `linear-gradient(to right, #3b82f6 0%, #ffffff ${zeroPct}%, #ef4444 100%)`
              : 'linear-gradient(to right, #3b82f6, #ffffff, #ef4444)',
          }}
        />
        {/* Labels: min (left), 0 (at zero position), max (right) */}
        <div style={{ position: 'relative', width: '160px', height: '14px', marginTop: '6px' }}>
          <span
            className="font-mono text-[10px] text-fg-3 tabular-nums"
            style={{ position: 'absolute', left: 0 }}
          >
            {loaded ? fmt.dT(deltaMin) : '…'}
          </span>
          <span
            className="font-mono text-[10px] text-fg-3 tabular-nums"
            style={{ position: 'absolute', left: `${zeroPct}%`, transform: 'translateX(-50%)' }}
          >
            0
          </span>
          <span
            className="font-mono text-[10px] text-fg-3 tabular-nums"
            style={{ position: 'absolute', right: 0 }}
          >
            {loaded ? fmt.dT(deltaMax) : '…'}
          </span>
        </div>
      </div>
    )
  }

  if (min == null || median == null || max == null) return null

  return (
    <div style={BASE_STYLE}>
      <div
        style={{
          width: '160px',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, #22c55e, #f59e0b, #ef4444)',
        }}
      />
      <div className="flex justify-between mt-1.5" style={{ width: '160px' }}>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.temp(min)}</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.temp(median)}</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.temp(max)}</span>
      </div>
    </div>
  )
}
