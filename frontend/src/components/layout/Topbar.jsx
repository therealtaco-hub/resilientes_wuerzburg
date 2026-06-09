import { useLocation } from 'react-router-dom'
import useAppStore from '../../store/useAppStore.js'

const ROUTE_LABELS = {
  '/':                   'Dashboard',
  '/hitzeatlas':         'Hitzeatlas',
  '/vulnerabilitaet':    'Vulnerabilität',
  '/entsiegelung':       'Entsiegelung',
  '/simulation':         'Baumpflanzung & Entsiegelung',
}

const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

export default function Topbar() {
  const { pathname } = useLocation()
  const pageLabel = ROUTE_LABELS[pathname] ?? pathname
  const toggleMobileNav = useAppStore((s) => s.toggleMobileNav)

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b border-border-soft px-4 lg:px-8"
      style={{
        height: 48,
        background: 'rgba(15,17,23,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Hamburger (nur Mobil) + Breadcrumb */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleMobileNav}
          aria-label="Menü öffnen"
          className="lg:hidden -ml-1 p-1.5 rounded-md text-fg-2 hover:bg-white/5 hover:text-fg-0 transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
          <span className="text-fg-2 shrink-0">Würzburg</span>
          <span className="text-fg-3 shrink-0">{CHEVRON}</span>
          <span className="text-fg-0 font-medium truncate">{pageLabel}</span>
        </nav>
      </div>

      {/* Aktionen (folgen in späteren Tasks) */}
      <div />
    </header>
  )
}
