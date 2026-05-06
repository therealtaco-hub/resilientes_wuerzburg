import { COLORS } from '../../utils/colors'

export default function TopList({ title, sub, color, items }) {
  const c = COLORS[color]

  return (
    <div className="bg-bg-2 border border-border rounded-[10px] p-5">
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-[0.1em]">
          {title}
        </p>
        {sub && (
          <p className="text-fg-3 text-[11px] font-mono">{sub}</p>
        )}
      </div>

      <ol className="space-y-2.5">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center gap-3">
            <span
              className="font-mono text-[12px] tabular-nums w-4 flex-shrink-0"
              style={{ color: i === 0 ? c.fg : 'var(--text-3)' }}
            >
              {i + 1}
            </span>
            <span className="flex-1 text-fg-1 text-[13px] truncate">
              {it.name}
            </span>
            <span className="flex flex-col items-end flex-shrink-0 leading-tight">
              <span
                className="font-mono tabular-nums text-[13px]"
                style={{ color: i === 0 ? c.fg : 'var(--text-1)' }}
              >
                {it.value}
              </span>
              {it.valueSub && (
                <span className="font-mono tabular-nums text-[10px] text-fg-3 mt-0.5">
                  {it.valueSub}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}
