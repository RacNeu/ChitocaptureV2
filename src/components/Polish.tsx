/**
 * App-wide finishing touches: a soft ripple where a button is pressed, and short toast messages
 * after actions ("Added to plan"). Both respect "reduce motion".
 */
import { useEffect, useState } from 'react'

import { TOAST_EVENT, type Toast } from '../model/toast'

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Ripple on press for buttons and tabs (one listener for the whole app). */
function useRipple() {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (reduced()) return
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.btn, .ms-tabs button, .section-tabs button, .side-item button, .h3-fkeys button, .sim-presets button, .ms-chips button')
      if (!el || (el as HTMLButtonElement).disabled) return
      const r = el.getBoundingClientRect(), size = Math.max(r.width, r.height) * 2
      const dot = document.createElement('span')
      dot.className = 'ripple'
      dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`
      el.classList.add('has-ripple')
      el.appendChild(dot)
      setTimeout(() => dot.remove(), 600)
    }
    window.addEventListener('pointerdown', onDown, { passive: true })
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])
}

export default function Polish() {
  useRipple()
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
