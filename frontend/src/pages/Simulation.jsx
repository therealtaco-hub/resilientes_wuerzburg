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
  const setLayerLoading   = useAppStore((s) => s.setLayerLoading)

  useEffect(() => {
    if (tab === 'baeume' && !lstData) {
      setLayerLoading('sim_lst', true)
      fetchLst()
        .then((d) => setLstData(d))
        .catch((e) => setError(e.message))
        .finally(() => setLayerLoading('sim_lst', false))
    }
    if (tab === 'baeume' && !treeData) {
      setLayerLoading('sim_trees', true)
      fetchTrees()
        .then((d) => setTreeData(d))
        .catch((e) => setError(e.message))
        .finally(() => setLayerLoading('sim_trees', false))
    }
    if (tab === 'wasser' && !entsData) {
      setLayerLoading('sim_ents', true)
      fetchEntsiegelung()
        .then((d) => setEntsData(d))
        .catch((e) => setError(e.message))
        .finally(() => setLayerLoading('sim_ents', false))
    }
  }, [tab, lstData, treeData, entsData])

  // Clear selections wenn die zugehörigen Daten gewechselt werden — Indizes sonst ungültig.
  // (kein Refresh-Trigger hier, aber Initialload kann auch invalidieren)
  useEffect(() => {
    if (selectedCells.length > 0 && !lstData) clearSimCells()

  }, [lstData])
  useEffect(() => {
    if (selectedPolygons.length > 0 && !entsData) clearSimPolygons()

  }, [entsData])

  return (
    <div className="flex flex-col lg:h-[calc(100vh-48px)]">
      {/* Header */}
      <div className="flex items-end justify-between px-4 lg:px-8 pt-5 lg:pt-8 pb-3 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[22px] lg:text-[28px] font-semibold tracking-tight">
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
      <div className="flex gap-2 px-4 lg:px-8 pb-4 flex-shrink-0">
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
      <div className="flex flex-col lg:flex-row flex-1 gap-4 px-4 lg:px-8 pb-6 lg:pb-8 min-h-0">
        {/* Map – Desktop: feste Breite (100vw - 220sidebar - 64padding - 16gap - 420panel). Mobil: volle Breite, feste Höhe. */}
        <div className="relative w-full h-[55vh] min-h-[320px] lg:h-auto lg:flex-none lg:w-[calc(100vw-720px)] rounded-xl overflow-hidden border border-border">
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

        {/* Panel – Desktop: flex-1 (nimmt Platz vom Sidebar-Collapse auf). Mobil: volle Breite, stapelt unter der Karte. */}
        <div className="w-full lg:w-auto lg:flex-1 min-w-0 lg:overflow-y-auto">
          {tab === 'baeume' ? <BaumSimPanel lstData={lstData} treeData={treeData} /> : <WasserSimPanel />}
        </div>
      </div>
    </div>
  )
}
