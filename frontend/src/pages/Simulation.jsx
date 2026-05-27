import { useEffect, useState } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import TreeLayer from '../components/map/overlays/TreeLayer'
import SimCellLayer from '../components/map/overlays/SimCellLayer'
import SimEntsiegelungLayer from '../components/map/overlays/SimEntsiegelungLayer'
import BaumSimPanel from '../components/simulation/BaumSimPanel'
import WasserSimPanel from '../components/simulation/WasserSimPanel'
import useAppStore from '../store/useAppStore'
import { fetchLst } from '../api/lst'
import { fetchTrees } from '../api/trees'
import { fetchEntsiegelung } from '../api/entsiegelung'

const MIN_WIDTH_PX = 1024

function TabButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-full transition-colors text-[13px] font-medium"
      style={{
        background: active ? 'rgba(34,197,94,0.10)' : 'transparent',
        border: active ? '1px solid rgba(34,197,94,0.40)' : '1px solid var(--border)',
        color: active ? 'var(--green)' : 'var(--text-2)',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )
}

export default function Simulation() {
  const [tab, setTab] = useState('baeume')   // 'baeume' | 'wasser'
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )
  const [lstData, setLstData]     = useState(null)
  const [treeData, setTreeData]   = useState(null)
  const [entsData, setEntsData]   = useState(null)
  const [error, setError]         = useState(null)

  const selectedCells     = useAppStore((s) => s.sim.selectedCells)
  const selectedPolygons  = useAppStore((s) => s.sim.selectedPolygons)
  const showBaumkataster  = useAppStore((s) => s.sim.showBaumkataster)
  const toggleSimCell     = useAppStore((s) => s.toggleSimCell)
  const toggleSimPolygon  = useAppStore((s) => s.toggleSimPolygon)
  const clearSimCells     = useAppStore((s) => s.clearSimCells)
  const clearSimPolygons  = useAppStore((s) => s.clearSimPolygons)

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isDesktop = viewportWidth >= MIN_WIDTH_PX

  useEffect(() => {
    if (!isDesktop) return
    if (tab === 'baeume' && !lstData) {
      fetchLst().catch((e) => setError(e.message)).then((d) => d && setLstData(d))
    }
    if (tab === 'baeume' && !treeData) {
      fetchTrees().catch((e) => setError(e.message)).then((d) => d && setTreeData(d))
    }
    if (tab === 'wasser' && !entsData) {
      fetchEntsiegelung().catch((e) => setError(e.message)).then((d) => d && setEntsData(d))
    }
  }, [tab, isDesktop, lstData, treeData, entsData])

  // Clear selections wenn die zugehörigen Daten gewechselt werden — Indizes sonst ungültig.
  // (kein Refresh-Trigger hier, aber Initialload kann auch invalidieren)
  useEffect(() => {
    if (selectedCells.length > 0 && !lstData) clearSimCells()

  }, [lstData])
  useEffect(() => {
    if (selectedPolygons.length > 0 && !entsData) clearSimPolygons()

  }, [entsData])

  if (!isDesktop) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-48px)] p-8">
        <div className="bg-bg-2 border border-border rounded-xl p-8 max-w-md text-center">
          <div style={{ fontSize: 36 }}>🖥️</div>
          <h2 className="text-fg-0 text-[18px] font-semibold mt-3">
            Diese Seite ist für Desktop optimiert.
          </h2>
          <p className="text-fg-2 text-[13px] mt-2 leading-relaxed">
            Die Simulationsseite kombiniert eine interaktive Karte mit detaillierten Auswertungs-Panels.
            Bitte öffne sie auf einem Bildschirm mit mindestens 1024 px Breite.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-end justify-between px-8 pt-8 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">
            Simulation
          </h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            Was-wäre-wenn: Baumpflanzung &amp; Flächenentsiegelung
          </p>
        </div>
        {error && (
          <span className="text-[11px] text-accent-red font-mono">
            ● Daten nicht geladen – {error}
          </span>
        )}
      </div>

      {/* Tab-Bar */}
      <div className="flex gap-2 px-8 pb-4 flex-shrink-0">
        <TabButton
          active={tab === 'baeume'}
          onClick={() => setTab('baeume')}
          icon="🌳"
          label="Baumpflanzung"
        />
        <TabButton
          active={tab === 'wasser'}
          onClick={() => setTab('wasser')}
          icon="💧"
          label="Entsiegelung"
        />
      </div>

      {/* Map + Panel */}
      <div className="flex flex-1 gap-4 px-8 pb-8 min-h-0">
        {/* Map */}
        <div className="relative flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            {tab === 'baeume' && (
              <>
                <HeatLayer data={lstData} />
                <SimCellLayer
                  data={lstData}
                  selectedCells={selectedCells}
                  onCellClick={toggleSimCell}
                />
                {showBaumkataster && <TreeLayer data={treeData} />}
              </>
            )}
            {tab === 'wasser' && (
              <SimEntsiegelungLayer
                data={entsData}
                selectedPolygons={selectedPolygons}
                onPolygonClick={toggleSimPolygon}
              />
            )}
          </MapSurface>
        </div>

        {/* Panel */}
        <div className="w-[420px] flex-shrink-0 overflow-y-auto">
          {tab === 'baeume' ? <BaumSimPanel lstData={lstData} /> : <WasserSimPanel />}
        </div>
      </div>
    </div>
  )
}
