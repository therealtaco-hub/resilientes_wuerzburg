import './index.css'
import Sidebar from './components/layout/Sidebar.jsx'
import Topbar from './components/layout/Topbar.jsx'
import AppRoutes from './app/routes.jsx'

export default function App() {
  return (
    <div className="flex h-screen bg-bg-0 overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden" style={{ marginLeft: 220 }}>
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <AppRoutes />
        </main>
      </div>
    </div>
  )
}
