import './index.css'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import AppRoutes from './app/routes.jsx'
import useAppStore from './store/useAppStore.js'

export default function App() {
  const collapsed = useAppStore((s) => s.sidebarCollapsed)
  const sidebarWidth = collapsed ? 48 : 220

  return (
    <div className="flex h-screen bg-bg-0 overflow-hidden">
      <Sidebar />
      <div
        className="flex flex-col flex-1 overflow-hidden transition-[margin-left] duration-200"
        style={{ marginLeft: sidebarWidth }}
      >
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <AppRoutes />
        </main>
      </div>
    </div>
  )
}
