import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAppStore from '../../store/useAppStore.js'

const ROUTE_KEYS = {
  '/':                'dashboard',
  '/hitzeatlas':      'hitzeatlas',
  '/vulnerabilitaet': 'vulnerabilitaet',
  '/entsiegelung':    'entsiegelung',
  '/simulation':      'simulation',
  '/dokumentation':   'dokumentation',
}

const CHEVRON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)

function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const current = i18n.resolvedLanguage === 'en' ? 'en' : 'de'
  const set = (lng) => i18n.changeLanguage(lng)

  return (
    <div
      className="flex items-center rounded-md overflow-hidden shrink-0"
      style={{ border: '1px solid var(--border)' }}
      role="group"
      aria-label={t('lang.label')}
    >
      {['de', 'en'].map((lng) => {
        const active = current === lng
        return (
          <button
            key={lng}
            onClick={() => set(lng)}
            aria-pressed={active}
            className="px-2 py-1 text-[11px] font-medium font-mono transition-colors"
            style={{
              background: active ? 'rgba(34,197,94,0.14)' : 'transparent',
              color: active ? 'var(--green)' : 'var(--text-3)',
            }}
          >
            {t('lang.' + lng)}
          </button>
        )
      })}
    </div>
  )
}

export default function Topbar() {
  const { pathname } = useLocation()
  const { t } = useTranslation()
  const routeKey = ROUTE_KEYS[pathname]
  const pageLabel = routeKey ? t('topbar.route.' + routeKey) : pathname
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
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleMobileNav}
          aria-label={t('nav.openMenu')}
          className="lg:hidden -ml-1 p-1.5 rounded-md text-fg-2 hover:bg-white/5 hover:text-fg-0 transition-colors shrink-0"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <nav className="flex items-center gap-1.5 text-[13px] min-w-0">
          <span className="text-fg-2 shrink-0">{t('topbar.city')}</span>
          <span className="text-fg-3 shrink-0">{CHEVRON}</span>
          <span className="text-fg-0 font-medium truncate">{pageLabel}</span>
        </nav>
      </div>

      <LanguageSwitcher />
    </header>
  )
}
