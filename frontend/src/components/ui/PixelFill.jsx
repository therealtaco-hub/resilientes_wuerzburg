// 5×5 Raster-Grid — pulsiert wie ein Mini-LST-Choropleth beim Laden einer Seite.
// Farben: Mitte = rot (heiß), Kanten = grün (kühl), diagonal gestaffelt.

const GRID = 5

function heatColor(t) {
  if (t < 0.5) {
    const f = t * 2
    return `rgb(${Math.round(34 + (245 - 34) * f)},${Math.round(197 + (158 - 197) * f)},${Math.round(94 + (11 - 94) * f)})`
  }
  const f = (t - 0.5) * 2
  return `rgb(${Math.round(245 + (239 - 245) * f)},${Math.round(158 + (68 - 158) * f)},${Math.round(11 + (68 - 11) * f)})`
}

function DotEllipsis({ label }) {
  return (
    <>
      {label}
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{ animation: `dot-blink 900ms ${i * 300}ms ease-in-out infinite`, opacity: 0 }}
        >.</span>
      ))}
    </>
  )
}

export default function PixelFill({ label = 'Lade Kartendaten' }) {
  const cx = (GRID - 1) / 2
  const cy = (GRID - 1) / 2
  const maxD = Math.sqrt(cx * cx + cy * cy)

  const cells = Array.from({ length: GRID * GRID }, (_, i) => {
    const row = Math.floor(i / GRID)
    const col = i % GRID
    const dist = Math.sqrt((col - cx) ** 2 + (row - cy) ** 2)
    const t = 1 - dist / maxD
    return {
      color: heatColor(t),
      delay: (row + col) * 80, // diagonale Welle: oben-links zuerst
    }
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${GRID}, 10px)`,
          gap: 3,
        }}
      >
        {cells.map((cell, i) => (
          <div
            key={i}
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: cell.color,
              animation: `pixel-pop 1600ms ${cell.delay}ms ease-in-out infinite`,
            }}
          />
        ))}
      </div>
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          color: 'var(--text-3)',
          letterSpacing: '0.06em',
        }}
      >
        <DotEllipsis label={label} />
      </span>
    </div>
  )
}
