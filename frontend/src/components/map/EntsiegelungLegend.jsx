// Farben und Labels müssen mit TYPE_COLORS in EntsiegelungLayer.jsx übereinstimmen.
const ATKIS_ENTRIES = [
  { typeKey: 'AX_IndustrieUndGewerbeflaeche',            color: 'rgb(220,80,20)',   label: 'Industrie & Gewerbe' },
  { typeKey: 'AX_Strassenverkehr',                        color: 'rgb(55,60,72)',    label: 'Straßenverkehr' },
  { typeKey: 'AX_Platz',                                  color: 'rgb(175,135,5)',   label: 'Platz' },
  { typeKey: 'AX_Wohnbauflaeche',                         color: 'rgb(170,130,75)',  label: 'Wohnbaufläche' },
  { typeKey: 'AX_FlaecheGemischterNutzung',              color: 'rgb(150,105,65)',  label: 'Gemischte Nutzung' },
  { typeKey: 'AX_SportFreizeitUndErholungsflaeche',       color: 'rgb(75,135,75)',   label: 'Sport & Freizeit' },
  { typeKey: 'AX_Friedhof',                               color: 'rgb(95,115,95)',   label: 'Friedhof' },
  { typeKey: 'AX_FlaecheBesondererFunktionalerPraegung', color: 'rgb(85,100,130)',  label: 'Bes. Funkt. Prägung' },
]

const OSM_ENTRIES = [
  { typeKey: 'osm_parking',              color: 'rgb(245,158,11)',   label: 'Parkplatz (OSM)' },
  { typeKey: 'osm_square',               color: 'rgb(59,130,246)',   label: 'Platz (OSM)' },
  { typeKey: 'osm_flat_roof_industrial', color: 'rgb(134,239,172)',  label: 'Flachdach / Gewerbebau' },
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
      <p className="font-mono text-[10px] text-fg-3 mb-2 uppercase tracking-widest">ATKIS</p>
      <div className="space-y-1.5">
        {ATKIS_ENTRIES.map(e => <LegendRow key={e.typeKey} color={e.color} label={e.label} />)}
      </div>

      <hr style={{ borderColor: 'var(--border)', margin: '10px 0' }} />

      <p className="font-mono text-[10px] text-fg-3 mb-2 uppercase tracking-widest">OSM</p>
      <div className="space-y-1.5">
        {OSM_ENTRIES.map(e => <LegendRow key={e.typeKey} color={e.color} label={e.label} />)}
      </div>
    </div>
  )
}
