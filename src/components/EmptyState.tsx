import type { ReactNode } from 'react'

/** Shown instead of charts until the site uploads real data. Nothing is ever invented. */
export default function EmptyState({ icon, title, children, action }: { icon: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return <section className="card empty-state">
    <span className="empty-icon" aria-hidden="true">{icon}</span>
    <h2>{title}</h2>
    {children && <p className="muted">{children}</p>}
    {action && <div className="row-actions center">{action}</div>}
  </section>
}
