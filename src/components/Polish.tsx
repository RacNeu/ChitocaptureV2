/**
 * App-wide finishing touches: short toast messages
 * after actions ("Added to plan"). Both respect "reduce motion".
 */
import { useEffect, useState } from 'react'

import { TOAST_EVENT, type Toast } from '../model/toast'


export default function Polish() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail
      setToasts((list) => [...list.slice(-2), t])
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== t.id)), 3_200)
    }
    window.addEventListener(TOAST_EVENT, on)
    return () => window.removeEventListener(TOAST_EVENT, on)
  }, [])
  return <div className="toasts" role="status" aria-live="polite">
    {toasts.map((t) => <div key={t.id} className={`toast ${t.tone ?? 'ok'}`}><i aria-hidden="true">{t.tone === 'warn' ? '⚠' : t.tone === 'info' ? 'ℹ' : '✓'}</i>{t.text}</div>)}
  </div>
}
