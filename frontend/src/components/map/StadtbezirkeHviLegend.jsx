import { fmt } from '../../utils/format'

export default function StadtbezirkeHviLegend({ min, median, max }) {
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
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-fg-3 mb-2">
        Stadtbezirke · HVI max
      </p>
      <div
        style={{
          width: '160px',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, rgba(168,85,247,0.15), rgba(168,85,247,0.55), rgba(168,85,247,1))',
        }}
      />
      <div className="flex justify-between mt-1.5" style={{ width: '160px' }}>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.index(min)}</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.index(median)}</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">{fmt.index(max)}</span>
      </div>
    </div>
  )
}
