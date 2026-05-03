import { fmt } from '../../utils/format'

export default function LSTLegend({ min, median, max }) {
  if (min == null || median == null || max == null) return null

  return (
    <div
      style={{
        background: 'rgba(15,17,23,0.80)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
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
