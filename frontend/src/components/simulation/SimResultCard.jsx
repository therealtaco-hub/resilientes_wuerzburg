import { COLORS } from '../../utils/colors'
import Spinner from '../ui/Spinner'

// Kompakte KpiCard-Variante (22 px Wert, kein Icon-Tile, optionaler Caveat).
export default function SimResultCard({ label, value, unit, caveat, color = 'green', loading, empty }) {
  const c = COLORS[color]

  return (
    <div className="bg-bg-2 border border-border rounded-[10px] p-3 flex flex-col">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-fg-3">
        {label}
      </div>
      <div className="flex items-baseline gap-1 mt-2 min-h-[28px]">
        {loading ? (
          <Spinner />
        ) : empty ? (
          <span
            className="font-mono tabular-nums text-fg-3"
            style={{ fontSize: 22, fontWeight: 600 }}
          >
            —
          </span>
        ) : (
          <>
            <span
              className="font-mono tabular-nums"
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: c.fg,
              }}
            >
              {value}
            </span>
            {unit && (
              <span className="font-mono text-fg-2" style={{ fontSize: 11 }}>
                {unit}
              </span>
            )}
          </>
        )}
      </div>
      {caveat && !loading && !empty && (
        <div className="text-fg-3 text-[10px] leading-snug mt-1.5">
          {caveat}
        </div>
      )}
    </div>
  )
}
