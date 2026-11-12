import { useEffect, useState, type RefObject } from 'react'

/**
 * Shows a panel (the 3D plant or a zoom-in) full screen. Uses the browser's Fullscreen API; where that
 * is missing (iPhone Safari) the panel fills the window instead. Esc or the button returns.
 */
export default function FullscreenButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [full, setFull] = useState(false)

  useEffect(() => {
    const onChange = () => setFull(Boolean(document.fullscreenElement) || Boolean(target.current?.classList.contains('pseudo-full')))
    document.addEventListener('fullscreenchange', onChange)
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && target.current?.classList.contains('pseudo-full')) { target.current.classList.remove('pseudo-full'); document.body.classList.remove('no-scroll'); setFull(false) } }
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('fullscreenchange', onChange); window.removeEventListener('keydown', onKey) }
  }, [target])

  const toggle = async () => {
    const element = target.current
    if (!element) return
    if (full) {
      if (document.fullscreenElement) await document.exitFullscreen()
      element.classList.remove('pseudo-full'); document.body.classList.remove('no-scroll')
      setFull(false)
      return
    }
    try {
      if (!element.requestFullscreen) throw new Error('unsupported')
      await element.requestFullscreen()
    } catch {
      element.classList.add('pseudo-full'); document.body.classList.add('no-scroll')
      setFull(true)
    }
  }

  return <button type="button" className="fullscreen-btn" onClick={() => void toggle()} title={full ? 'Exit full screen (Esc)' : 'View in full screen'}>
    <span aria-hidden="true">{full ? '⤡' : '⤢'}</span>{full ? 'Exit full screen' : 'View in full screen'}
  </button>
}
