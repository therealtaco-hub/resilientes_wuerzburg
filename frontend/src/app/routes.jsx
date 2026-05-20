// Lazy imports: jede Page wird erst beim ersten Besuch der Route geladen.
// Das hält den initialen JS-Bundle klein und beschleunigt den App-Start.
import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Dashboard      = lazy(() => import('../pages/Dashboard.jsx'))
const Hitzeatlas     = lazy(() => import('../pages/Hitzeatlas.jsx'))
const Vulnerabilitaet = lazy(() => import('../pages/Vulnerabilitaet.jsx'))
const Entsiegelung   = lazy(() => import('../pages/Entsiegelung.jsx'))
const Simulation     = lazy(() => import('../pages/Simulation.jsx'))

export default function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-fg-2 text-sm">Laden…</div>}>
      <Routes>
        <Route path="/"                   element={<Dashboard />} />
        <Route path="/hitzeatlas"         element={<Hitzeatlas />} />
        <Route path="/vulnerabilitaet"    element={<Vulnerabilitaet />} />
        <Route path="/entsiegelung"       element={<Entsiegelung />} />
        <Route path="/simulation"          element={<Simulation />} />
      </Routes>
    </Suspense>
  )
}
