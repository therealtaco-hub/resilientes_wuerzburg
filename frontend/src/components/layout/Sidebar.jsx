import { NavLink } from 'react-router-dom'
import useAppStore from '../../store/useAppStore.js'

const NAV_ANALYSE = [
  {
    to: '/',
    label: 'Dashboard',
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
    label: 'Hitzeatlas',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v6M12 22v-3M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M22 12h-3M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24" />
      </svg>
    ),
  },
  {
    to: '/vulnerabilitaet',
    label: 'Vulnerabilität',
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
    label: 'Entsiegelung',
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
    label: 'Simulation',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 19c0-8 6-14 16-14 0 10-6 16-14 16-1 0-2-1-2-2z" />
        <path d="M5 19c4-4 7-7 11-9" />
      </svg>
    ),
  },
]

// Icon: chevron links / rechts
function ChevronIcon({ left }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {left
        ? <polyline points="15 18 9 12 15 6" />
        : <polyline points="9 18 15 12 9 6" />}
    </svg>
  )
}

function NavItem({ to, label, icon, end, collapsed }) {
  return (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
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
  const collapsed     = useAppStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const width         = collapsed ? 48 : 220

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 flex flex-col border-r border-border bg-bg-1 overflow-y-auto transition-[width] duration-200"
      style={{ width }}
    >
      {/* Logo */}
      <div className={`flex items-center gap-2.5 shrink-0 ${collapsed ? 'justify-center px-0 py-5' : 'px-4 py-5'}`}>
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 19c0-8 6-14 16-14 0 10-6 16-14 16-1 0-2-1-2-2z" />
            <path d="M5 19c4-4 7-7 11-9" />
          </svg>
        </div>
        {!collapsed && (
          <span className="text-[13px] font-semibold text-fg-0 leading-tight whitespace-nowrap overflow-hidden">
            Resilientes Würzburg
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className={`flex-1 pb-4 ${collapsed ? 'px-1' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-3 pt-2 pb-2 text-[11px] uppercase tracking-widest font-semibold text-fg-3">
            Analyse
          </p>
        )}
        {collapsed && <div className="pt-2" />}
        <div className="flex flex-col gap-0.5">
          {NAV_ANALYSE.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.to === '/'} collapsed={collapsed} />
          ))}
        </div>

        {!collapsed && (
          <p className="px-3 pt-5 pb-2 text-[11px] uppercase tracking-widest font-semibold text-fg-3">
            Simulation
          </p>
        )}
        {collapsed && <div className="pt-3" />}
        <div className="flex flex-col gap-0.5">
          {NAV_SIMULATION.map((item) => (
            <NavItem key={item.to} to={item.to} label={item.label} icon={item.icon} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Collapse-Toggle */}
      <div className={`shrink-0 border-t border-border ${collapsed ? 'flex justify-center py-3' : 'px-3 py-3'}`}>
        <button
          onClick={toggleSidebar}
          title={collapsed ? 'Sidebar ausklappen' : 'Sidebar einklappen'}
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-fg-3 hover:bg-white/5 hover:text-fg-1 transition-colors text-[12px] select-none w-full justify-center"
        >
          <ChevronIcon left={!collapsed} />
          {!collapsed && <span>Einklappen</span>}
        </button>
      </div>
    </aside>
  )
}
