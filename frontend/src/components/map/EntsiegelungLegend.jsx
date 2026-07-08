import { useTranslation } from 'react-i18next'

const ATKIS_ENTRIES = [
  { typeKey: 'AX_IndustrieUndGewerbeflaeche',            color: 'rgb(220,80,20)'  },
  { typeKey: 'AX_Strassenverkehr',                        color: 'rgb(55,60,72)'   },
  { typeKey: 'AX_Platz',                                  color: 'rgb(175,135,5)'  },
  { typeKey: 'AX_Wohnbauflaeche',                         color: 'rgb(170,130,75)' },
  { typeKey: 'AX_FlaecheGemischterNutzung',              color: 'rgb(150,105,65)' },
  { typeKey: 'AX_SportFreizeitUndErholungsflaeche',       color: 'rgb(75,135,75)'  },
  { typeKey: 'AX_Friedhof',                               color: 'rgb(95,115,95)'  },
  { typeKey: 'AX_FlaecheBesondererFunktionalerPraegung', color: 'rgb(85,100,130)' },
]

const OSM_ENTRIES = [
  { typeKey: 'osm_parking',              color: 'rgb(245,158,11)'  },
  { typeKey: 'osm_square',               color: 'rgb(59,130,246)'  },
  { typeKey: 'osm_flat_roof_industrial', color: 'rgb(134,239,172)' },
]

function LegendRow({ color, label }) {
  return (
    <div className="flex items-center gap-2">
      <div style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span className="font-mono text-[10px] text-fg-3">{label}</span>
    </div>
  )
}

export default function EntsiegelungLegend() {
  const { t } = useTranslation()
  return (
    <div
      style={{
        background: 'rgba(15,17,23,0.80)',
        backdropFilter: 'blur(6px)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '12px',
      }}
    >
      <p className="font-mono text-[10px] text-fg-3 mb-2 uppercase tracking-widest">{t('legend.atkis')}</p>
      <div className="space-y-1.5">
        {ATKIS_ENTRIES.map(e => <LegendRow key={e.typeKey} color={e.color} label={t('legend.cat.' + e.typeKey)} />)}
      </div>

      <hr style={{ borderColor: 'var(--border)', margin: '10px 0' }} />

      <p className="font-mono text-[10px] text-fg-3 mb-2 uppercase tracking-widest">{t('legend.osm')}</p>
      <div className="space-y-1.5">
        {OSM_ENTRIES.map(e => <LegendRow key={e.typeKey} color={e.color} label={t('legend.cat.' + e.typeKey)} />)}
      </div>
    </div>
  )
}
