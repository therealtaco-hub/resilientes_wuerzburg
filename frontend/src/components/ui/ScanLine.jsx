// Satelliten-Scan-Overlay für die Karte während Datenladen.
// Position: absolute über dem Karten-Container (muss position:relative haben).

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

export default function ScanLine({ label = 'Lade Daten' }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 10,
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      {/* Scan-Beam */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: 2,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(245,158,11,0.55) 20%, rgba(239,68,68,0.85) 50%, rgba(245,158,11,0.55) 80%, transparent 100%)',
          boxShadow:
            '0 0 14px 7px rgba(245,158,11,0.12), 0 0 32px 16px rgba(239,68,68,0.07)',
          animation: 'scan-sweep 1800ms linear infinite',
        }}
      />

      {/* Horizontale Raster-Linien (Satellitenbild-Ästhetik) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'repeating-linear-gradient(transparent, transparent 39px, rgba(245,158,11,0.025) 39px, rgba(245,158,11,0.025) 40px)',
        }}
      />

      {/* Status-Label oben rechts */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'rgba(245,158,11,0.6)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <DotEllipsis label={label} />
      </div>
    </div>
  )
}
