import type { ReactNode } from 'react'

/** A small ⓘ that reveals an explanation on hover, focus or tap, so pages stay short. */
export default function Info({ children, label = 'How this works' }: { children: ReactNode; label?: string }) {
  return <span className="info">
    <button type="button" className="info-btn" aria-label={label}>i</button>
    <span className="info-pop" role="tooltip">{children}</span>
  </span>
}
