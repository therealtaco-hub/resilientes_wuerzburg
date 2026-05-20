import { useLocation } from 'react-router-dom'

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

  return (
    <header
      className="sticky top-0 z-20 flex items-center justify-between border-b border-border-soft px-8"
      style={{
        height: 48,
        background: 'rgba(15,17,23,0.85)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        <span className="text-fg-2">Würzburg</span>
        <span className="text-fg-3">{CHEVRON}</span>
        <span className="text-fg-0 font-medium">{pageLabel}</span>
      </nav>

      {/* Aktionen (folgen in späteren Tasks) */}
      <div />
    </header>
  )
}
