import { useTranslation } from 'react-i18next'
import useAppStore from '../../store/useAppStore'
import { LST_SENSOR } from '../../utils/sources'

const LAYER_CONFIG = [
  { key: 'heatmap',      labelKey: 'layerPanel.heatmap',      sub: LST_SENSOR,                subKey: null,                     color: 'var(--amber)' },
  { key: 'trees',        labelKey: 'layerPanel.trees',        sub: null,                      subKey: 'layerPanel.treesSub',    color: 'var(--green)' },
  { key: 'stadtbezirke', labelKey: 'layerPanel.stadtbezirke', sub: null,                      subKey: 'layerPanel.stadtbezirkeSub', color: 'var(--blue)' },
  { key: 'ndvi',         labelKey: 'layerPanel.ndvi',         sub: null,                      subKey: 'layerPanel.ndviSub',     color: 'var(--green)' },
]

export default function LayerPanel() {
  const { t } = useTranslation()
  const { layers, toggleLayer } = useAppStore()

  return (
    <div className="bg-bg-1 border border-border rounded-xl p-4 space-y-1">
      <p className="text-fg-3 text-[11px] font-semibold uppercase tracking-widest mb-3">
        {t('layerPanel.title')}
      </p>
      {LAYER_CONFIG.map(({ key, labelKey, sub, subKey, color }) => (
        <button
          key={key}
          onClick={() => toggleLayer(key)}
          className="w-full flex items-center justify-between px-2 py-2.5 rounded-lg hover:bg-white/5 transition-colors duration-[150ms] cursor-pointer"
          style={{ background: layers[key] ? 'rgba(255,255,255,0.02)' : undefined }}
          role="switch"
          aria-checked={layers[key]}
        >
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
            <div className="text-left">
              <p className="text-fg-0 text-[13px] font-medium">{t(labelKey)}</p>
              <p className="text-fg-3 text-[11px]">{subKey ? t(subKey) : sub}</p>
            </div>
          </div>
          <div
            className="relative w-8 h-[18px] rounded-full flex-shrink-0 transition-colors duration-[150ms]"
            style={{ background: layers[key] ? color : 'var(--bg-3)' }}
          >
            <div
              className="absolute top-[2px] w-[14px] h-[14px] bg-white rounded-full shadow transition-transform duration-[150ms]"
              style={{ transform: layers[key] ? 'translateX(16px)' : 'translateX(2px)' }}
            />
          </div>
        </button>
      ))}
    </div>
  )
}
