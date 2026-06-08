import useAppStore from '../../store/useAppStore'

const CSS = `
  @keyframes gl-ring {
    0%   { transform: scale(0.12); opacity: 1; }
    80%  { opacity: 0.08; }
    100% { transform: scale(3.5);  opacity: 0; }
  }
  @keyframes gl-dot {
    0%, 100% { transform: translate(-50%,-50%) scale(1);   box-shadow: 0 0 10px 2px rgba(34,197,94,0.6); }
    50%       { transform: translate(-50%,-50%) scale(1.5); box-shadow: 0 0 22px 6px rgba(34,197,94,0.9); }
  }
  @keyframes gl-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`

export default function GlobalLoader() {
  const layerLoading = useAppStore((s) => s.layerLoading)
  const isLoading = Object.values(layerLoading).some(Boolean)

  if (!isLoading) return null

  return (
    <>
      <style>{CSS}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9990,
          background: 'rgba(15,17,23,0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          animation: 'gl-fade-in 0.2s ease',
        }}
      >
        {/* Ring container */}
        <div style={{ position: 'relative', width: 72, height: 72 }}>

          {/* Three expanding rings with staggered delay */}
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '1.5px solid #22c55e',
                animation: 'gl-ring 2.1s ease-out infinite',
                animationDelay: `${i * 0.6}s`,
              }}
            />
          ))}

          {/* Pulsing center dot */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: '#22c55e',
              animation: 'gl-dot 1.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Label */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(34,197,94,0.55)',
          }}
        >
          Lade Layer …
        </span>
      </div>
    </>
  )
}
