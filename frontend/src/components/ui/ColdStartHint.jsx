import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Das Backend läuft im Render-Free-Tier und schläft bei Inaktivität; der erste
// Aufruf dauert dann 1–2 Minuten. Der Hinweis erscheint erst nach DELAY_MS,
// damit normale Ladezeiten ohne Hinweis bleiben.
const DELAY_MS = 8000

export default function ColdStartHint({ className, style }) {
  const { t } = useTranslation()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => setShow(true), DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  if (!show) return null
  return <p className={className} style={style}>{t('common.coldStartHint')}</p>
}
