import { useTranslation } from 'react-i18next'

export default function LstHinweisBar() {
  const { t } = useTranslation()
  return (
    <div className="px-4 lg:px-8 pb-3 flex-shrink-0">
      <div
        className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
        style={{
          background: 'rgba(245,158,11,0.05)',
          border: '1px solid rgba(245,158,11,0.15)',
        }}
      >
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.06em] rounded px-2 py-[3px] mt-px"
          style={{
            background: 'rgba(245,158,11,0.15)',
            border: '1px solid rgba(245,158,11,0.30)',
            color: 'var(--amber)',
          }}
        >
          {t('lst.badge')}
        </span>
        <p className="text-fg-2 text-[12.5px] leading-snug mt-px">
          {t('lst.banner')}
        </p>
      </div>
    </div>
  )
}
