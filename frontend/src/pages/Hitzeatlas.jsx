import { useEffect, useState } from 'react'
import MapSurface from '../components/map/MapSurface'
import HeatLayer from '../components/map/overlays/HeatLayer'
import TreeLayer from '../components/map/overlays/TreeLayer'
import LayerPanel from '../components/map/LayerPanel'
import useAppStore from '../store/useAppStore'
import { fetchLst } from '../api/lst'
import { fetchTrees } from '../api/trees'

export default function Hitzeatlas() {
  const { layers } = useAppStore()
  const [lstData, setLstData]   = useState(null)
  const [treeData, setTreeData] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    Promise.all([fetchLst(), fetchTrees()])
      .then(([lst, trees]) => {
        setLstData(lst)
        setTreeData(trees)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Page Header */}
      <div className="flex items-end justify-between px-8 pt-8 pb-4 flex-shrink-0">
        <div>
          <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">
            Hitzeatlas
          </h1>
          <p className="text-fg-2 text-[13px] mt-0.5">
            Land Surface Temperature · Landsat 9 · Sommer 2024
          </p>
        </div>
        {loading && (
          <span className="text-[11px] text-accent-green font-mono animate-pulse">
            Lade Daten …
          </span>
        )}
        {error && (
          <span className="text-[11px] text-accent-red font-mono">
            ● Backend nicht erreichbar – {error}
          </span>
        )}
      </div>

      {/* Map + Right Rail */}
      <div className="flex flex-1 gap-4 px-8 pb-8 min-h-0">
        {/* Karte */}
        <div className="relative flex-1 rounded-xl overflow-hidden border border-border">
          <MapSurface>
            {layers.heatmap && <HeatLayer data={lstData} />}
            {layers.trees   && <TreeLayer data={treeData} />}
          </MapSurface>
        </div>

        {/* Right Rail */}
        <div className="w-[280px] flex flex-col gap-4 flex-shrink-0">
          <LayerPanel />

          {/* Statische Interpretation */}
          <div className="bg-bg-2 border border-border rounded-xl p-4 flex gap-3">
            <div
              className="w-1 rounded-full flex-shrink-0 self-stretch"
              style={{ background: 'var(--amber)' }}
            />
            <div>
              <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-2">
                Interpretation
              </p>
              <p className="text-fg-1 text-[13px] italic leading-relaxed">
                Die heißesten 10 % der Stadtfläche konzentrieren sich auf
                versiegelte Gewerbegebiete im Norden sowie die dicht bebaute
                Innenstadt. Grünflächen wie der Ringpark und die Mainufer sind
                deutlich kühler.
              </p>
              <p className="text-fg-3 text-[10px] font-mono mt-2">
                Quelle: Landsat 9 · Sommer 2024
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
