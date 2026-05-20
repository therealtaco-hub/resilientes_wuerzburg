export default function NdviLegend() {
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
      <p className="text-fg-3 text-[10px] font-semibold uppercase tracking-[0.1em] mb-2">
        Vegetationsindex (NDVI)
      </p>
      <div
        style={{
          width: '160px',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, #86efac, #22c55e, #166534)',
        }}
      />
      <div className="flex justify-between mt-1.5" style={{ width: '160px' }}>
        <span className="font-mono text-[10px] text-fg-3">0</span>
        <span className="font-mono text-[10px] text-fg-3">0,4</span>
        <span className="font-mono text-[10px] text-fg-3">0,7+</span>
      </div>
      <p className="text-fg-3 text-[10px] mt-2 leading-snug">
        Transparent = kein Vegetationssignal
      </p>
    </div>
  )
}
