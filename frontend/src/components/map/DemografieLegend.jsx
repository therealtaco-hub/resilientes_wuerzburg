export default function DemografieLegend() {
  return (
    <div
      style={{
        background: 'rgba(15,17,23,0.80)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '10px 12px',
      }}
    >
      <p
        className="font-semibold uppercase tracking-widest mb-2"
        style={{ fontSize: '10px', color: 'var(--text-3)' }}
      >
        Seniorenanteil 65+
      </p>
      <div
        style={{
          width: '160px',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, rgb(219,234,254), rgb(30,58,138))',
        }}
      />
      <div className="flex justify-between mt-1.5" style={{ width: '160px' }}>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">0 %</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">50 %</span>
        <span className="font-mono text-[10px] text-fg-3 tabular-nums">100 %</span>
      </div>
    </div>
  )
}
