import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'

const Dashboard      = lazy(() => import('../pages/Dashboard.jsx'))
const Hitzeatlas     = lazy(() => import('../pages/Hitzeatlas.jsx'))
const Vulnerabilitaet = lazy(() => import('../pages/Vulnerabilitaet.jsx'))
const Entsiegelung   = lazy(() => import('../pages/Entsiegelung.jsx'))
const SimBaeume      = lazy(() => import('../pages/SimBaeume.jsx'))
const SimEntsiegeln  = lazy(() => import('../pages/SimEntsiegeln.jsx'))

export default function AppRoutes() {
  return (
    <Suspense fallback={<div className="p-8 text-fg-2 text-sm">Laden…</div>}>
      <Routes>
        <Route path="/"                   element={<Dashboard />} />
        <Route path="/hitzeatlas"         element={<Hitzeatlas />} />
        <Route path="/vulnerabilitaet"    element={<Vulnerabilitaet />} />
        <Route path="/entsiegelung"       element={<Entsiegelung />} />
        <Route path="/simulation/baeume"  element={<SimBaeume />} />
        <Route path="/simulation/wasser"  element={<SimEntsiegeln />} />
      </Routes>
    </Suspense>
  )
}
