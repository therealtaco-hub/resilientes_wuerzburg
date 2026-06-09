import { useEffect, useState } from 'react'

// Mobil = unterhalb des Tailwind-`lg`-Breakpoints (1024px). Dieselbe Schwelle,
// die in den responsiven `lg:`-Klassen der Seiten verwendet wird — so bleiben
// JS-gesteuertes Layout (z. B. Sidebar-Schublade) und CSS exakt synchron.
const QUERY = '(max-width: 1023px)'

export default function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false,
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    // Sync falls sich die Breite zwischen Initial-Render und Effekt geändert hat
    setIsMobile(mq.matches)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
