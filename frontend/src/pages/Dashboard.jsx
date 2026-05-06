import { useEffect, useMemo, useState } from 'react'
import KpiCard from '../components/ui/KpiCard'
import TopList from '../components/dashboard/TopList'
import Spinner from '../components/ui/Spinner'
import { fetchStadtbezirke } from '../api/stadtbezirke'
import { fmt } from '../utils/format'

const ICONS = {
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  shield: (
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
  ),
  tree: (
    <>
      <path d="M5 10a7 7 0 0 1 14 0c0 4-3 6-7 8-4-2-7-4-7-8z" />
      <path d="M9 15l3-3 3 3" />
      <path d="M12 22v-7" />
    </>
  ),
  layers: (
    <>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </>
  ),
}

function splitArea(m2) {
  const formatted = fmt.area(m2)
  const idx = formatted.lastIndexOf(' ')
  if (idx === -1) return { value: formatted, unit: '' }
  return { value: formatted.slice(0, idx), unit: formatted.slice(idx + 1) }
}

function topByProperty(features, key) {
  let best = null
  for (const f of features) {
    const v = f.properties[key]
    if (v == null || !Number.isFinite(v)) continue
    if (best == null || v > best.properties[key]) best = f
  }
  return best
}

export default function Dashboard() {
  const [bezirke, setBezirke] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchStadtbezirke()
      .then(setBezirke)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const kpis = useMemo(() => {
    if (!bezirke) return null
    const feats = bezirke.features

    const hottest        = topByProperty(feats, 'lst_max')
    const mostVulnerable = topByProperty(feats, 'hvi_max')
    const mostTrees      = topByProperty(feats, 'tree_count')
    const mostEntsiegel  = topByProperty(feats, 'entsiegelung_m2')

    const totalTrees = feats.reduce((s, f) => s + (f.properties.tree_count || 0), 0)
    const totalEnts  = feats.reduce((s, f) => s + (f.properties.entsiegelung_m2 || 0), 0)

    const top3 = (key, format, subBuilder) => feats
      .filter(f => Number.isFinite(f.properties[key]))
      .sort((a, b) => b.properties[key] - a.properties[key])
      .slice(0, 3)
      .map(f => ({
        name: f.properties.name,
        value: format(f.properties[key]),
        valueSub: subBuilder ? subBuilder(f.properties) : undefined,
      }))

    const topHot      = top3(
      'lst_max',
      (v) => fmt.temp(v),
      (p) => Number.isFinite(p.lst_mean) ? `⌀ ${fmt.temp(p.lst_mean)}` : null,
    )
    const topVuln     = top3('hvi_max',         (v) => fmt.index(v))
    const topTrees    = top3('tree_count',      (v) => fmt.num(v))
    const topEntsieg  = top3('entsiegelung_m2', (v) => fmt.area(v))

    return { hottest, mostVulnerable, mostTrees, mostEntsiegel, totalTrees, totalEnts,
             topHot, topVuln, topTrees, topEntsieg }
  }, [bezirke])

  return (
    <div className="p-8">
      <h1 className="text-fg-0 text-[28px] font-semibold tracking-tight">
        Dashboard
      </h1>
      <p className="text-fg-2 text-[13px] mt-0.5">
        Übersicht zentraler Stadtkennzahlen nach Stadtbezirk
      </p>

      {loading && (
        <div className="flex items-center gap-3 mt-6">
          <Spinner />
          <span className="text-fg-1 text-[13px]">Lade Stadtdaten …</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col gap-1 mt-6">
          <div className="flex items-center gap-2">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--red)',
                display: 'inline-block',
              }}
            />
            <span className="text-fg-0 text-[13px] font-medium">
              Daten nicht erreichbar
            </span>
          </div>
          <span className="text-fg-3 text-[11px] font-mono pl-4">{error}</span>
        </div>
      )}

      {kpis && !error && (
        <div className="grid grid-cols-4 gap-4 mt-6">
          <KpiCard
            label="Heißeste Zone"
            value={fmt.num(kpis.hottest.properties.lst_max, 1)}
            unit="°C"
            sub={`${kpis.hottest.properties.name} · LST Max`}
            color="amber"
            icon={ICONS.flame}
          />
          <KpiCard
            label="Max. Vulnerabilität"
            value={fmt.index(kpis.mostVulnerable.properties.hvi_max)}
            unit="Index"
            sub={`${kpis.mostVulnerable.properties.name} · HVI Max`}
            color="purple"
            icon={ICONS.shield}
          />
          <KpiCard
            label="Bäume in Würzburg"
            value={fmt.num(kpis.totalTrees)}
            unit="Stück"
            sub={`Top: ${kpis.mostTrees.properties.name} · ${fmt.num(kpis.mostTrees.properties.tree_count)}`}
            color="green"
            icon={ICONS.tree}
          />
          <KpiCard
            label="Entsiegelungspotenzial"
            value={splitArea(kpis.totalEnts).value}
            unit={splitArea(kpis.totalEnts).unit}
            sub={`Top: ${kpis.mostEntsiegel.properties.name} · ${fmt.area(kpis.mostEntsiegel.properties.entsiegelung_m2)}`}
            color="blue"
            icon={ICONS.layers}
          />
        </div>
      )}

      {kpis && !error && (
        <div className="grid grid-cols-4 gap-4 mt-4">
          <TopList
            title="Heißeste Bezirke"
            sub="LST Max · ⌀"
            color="amber"
            items={kpis.topHot}
          />
          <TopList
            title="Vulnerabelste Bezirke"
            sub="HVI Max"
            color="purple"
            items={kpis.topVuln}
          />
          <TopList
            title="Meiste Bäume"
            sub="Bestand"
            color="green"
            items={kpis.topTrees}
          />
          <TopList
            title="Top Entsiegelung"
            sub="ATKIS + OSM"
            color="blue"
            items={kpis.topEntsieg}
          />
        </div>
      )}
    </div>
  )
}
