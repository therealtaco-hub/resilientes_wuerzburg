import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import useAppStore from '../../store/useAppStore.js'
import useIsMobile from '../../hooks/useIsMobile.js'

const NAV_ANALYSE = [
  {
    to: '/',
    labelKey: 'nav.dashboard',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/hitzeatlas',
    labelKey: 'nav.hitzeatlas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6M12 22v-3M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-3M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" />
      </svg>
    ),
  },
  {
    to: '/vulnerabilitaet',
    labelKey: 'nav.vulnerabilitaet',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    to: '/entsiegelung',
    labelKey: 'nav.entsiegelung',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
]

const NAV_SIMULATION = [
  {
    to: '/simulation',
    labelKey: 'nav.simulation',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19c0-8 6-14 16-14 0 10-6 16-14 16-1 0-2-1-2-2z" />
        <path d="M5 19c4-4 7-7 11-9" />
      </svg>
    ),
  },
]

const NAV_REFERENZ = [
  {
    to: '/dokumentation',
    labelKey: 'nav.dokumentation',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
]

function ChevronIcon({ left }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {left
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function NavItem({ to, label, icon, end, collapsed, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        [
          'relative flex items-center gap-3 rounded-md text-[13px] transition-colors select-none',
          collapsed ? 'justify-center px-0 py-2' : 'px-3 py-2',
          isActive
            ? 'text-accent-green bg-accent-green/10'
            : 'text-fg-2 hover:bg-white/5 hover:text-fg-1',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && !collapsed && (
            <span
              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent-green"
              aria-hidden="true"
            />
          )}
          <span className={`shrink-0 ${isActive ? 'text-accent-green' : 'text-fg-2'}`}>
            {icon}
          </span>
          {!collapsed && label}
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { t } = useTranslation()
  const collapsed        = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar    = useAppStore((s) => s.toggleSidebar)
  const isMobile         = useIsMobile()
  const mobileNavOpen    = useAppStore((s) => s.mobileNavOpen)
  const setMobileNavOpen = useAppStore((s) => s.setMobileNavOpen)

  const effectiveCollapsed = isMobile ? false : collapsed
  const width = effectiveCollapsed ? 48 : 220

  const closeMobile = () => setMobileNavOpen(false)
  const handleNavigate = () => { if (isMobile) closeMobile() }

  const asideStyle = isMobile
    ? { width: 256, transform: mobileNavOpen ? 'translateX(0)' : 'translateX(-100%)' }
    : { width }

  return (
    <>
      {isMobile && mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r border-border bg-bg-1 overflow-y-auto transition-[width,transform] duration-200"
        style={asideStyle}
      >
        <div className={`flex items-center gap-2.5 shrink-0 ${isMobile ? 'justify-between' : ''} ${effectiveCollapsed ? 'justify-center px-0 py-5' : 'px-4 py-5'}`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
              style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 19c0-8 6-14 16-14 0 10-6 16-14 16-1 0-2-1-2-2z" />
                <path d="M5 19c4-4 7-7 11-9" />
              </svg>
            </div>
            {!effectiveCollapsed && (
              <span className="text-[13px] font-semibold text-fg-0 leading-tight whitespace-nowrap overflow-hidden">
                {t('nav.appName')}
              </span>
            )}
          </div>
          {isMobile && (
            <button
              onClick={closeMobile}
              aria-label={t('nav.closeMenu')}
              className="shrink-0 p-1.5 rounded-md text-fg-3 hover:bg-white/5 hover:text-fg-0 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <nav className={`flex-1 pb-4 ${effectiveCollapsed ? 'px-1' : 'px-3'}`}>
          {!effectiveCollapsed && (
            <p className="px-3 pt-2 pb-2 text-[11px] uppercase tracking-widest font-semibold text-fg-3">
              {t('nav.groupAnalyse')}
            </p>
          )}
          {effectiveCollapsed && <div className="pt-2" />}
          <div className="flex flex-col gap-0.5">
            {NAV_ANALYSE.map((item) => (
              <NavItem key={item.to} to={item.to} label={t(item.labelKey)} icon={item.icon} end={item.to === '/'} collapsed={effectiveCollapsed} onNavigate={handleNavigate} />
            ))}
          </div>

          {!effectiveCollapsed && (
            <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-widest font-semibold text-fg-3">
              {t('nav.groupSimulation')}
            </p>
          )}
          {effectiveCollapsed && <div className="pt-3" />}
          <div className="flex flex-col gap-0.5">
            {NAV_SIMULATION.map((item) => (
              <NavItem
                key={item.to}
                to={item.to}
                label={t(item.labelKey)}
                icon={item.icon}
                collapsed={effectiveCollapsed}
                onNavigate={() => {
                  if (isMobile) closeMobile()
                  else if (!collapsed) toggleSidebar()
                }}
              />
            ))}
          </div>

          {!effectiveCollapsed && (
            <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-widest font-semibold text-fg-3">
              {t('nav.groupReferenz')}
            </p>
          )}
          {effectiveCollapsed && <div className="pt-3" />}
          <div className="flex flex-col gap-0.5">
            {NAV_REFERENZ.map((item) => (
              <NavItem key={item.to} to={item.to} label={t(item.labelKey)} icon={item.icon} collapsed={effectiveCollapsed} onNavigate={handleNavigate} />
            ))}
          </div>
        </nav>

        {!isMobile && (
          <div className={`shrink-0 border-t border-border ${collapsed ? 'flex justify-center py-3' : 'px-3 py-3'}`}>
            <button
              onClick={toggleSidebar}
              title={collapsed ? t('nav.expandTitle') : t('nav.collapseTitle')}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-fg-3 hover:bg-white/5 hover:text-fg-1 transition-colors text-[12px] select-none w-full justify-center"
            >
              <ChevronIcon left={!collapsed} />
              {!collapsed && <span>{t('nav.collapse')}</span>}
            </button>
          </div>
        )}
      </aside>
    </>
  )
}
