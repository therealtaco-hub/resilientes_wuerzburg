import { COLORS } from '../../utils/colors'

export default function KpiCard({ label, value, unit, sub, color, icon }) {
  const c = COLORS[color]

  return (
    <div className="bg-bg-2 border border-border rounded-[10px] p-5 flex items-start justify-between">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-fg-3">
          {label}
        </div>
        <div className="flex items-baseline gap-1 mt-3">
          <span
            className="font-mono tabular-nums"
            style={{
              fontSize: 32,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: c.fg,
            }}
          >
            {value}
          </span>
          {unit && (
            <span className="font-mono text-fg-2" style={{ fontSize: 14 }}>
              {unit}
            </span>
          )}
        </div>
        {sub && (
          <div className="text-fg-1 text-[12px] mt-1.5">{sub}</div>
        )}
      </div>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: c.bg,
          border: `1px solid ${c.border}`,
          color: c.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {icon}
        </svg>
      </div>
    </div>
  )
}
