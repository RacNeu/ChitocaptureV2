import { useMemo, useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import { IDLE_AVOIDABLE, kindLabel, siteFindings } from '../model/findings'
import { measureById } from '../model/measures'
import { roleById } from '../model/roles'
import { actions, useFactory, useRole } from '../model/store'
import type { FindingStatus } from '../model/types'
import Info from '../components/Info'

const statuses: { id: FindingStatus; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'assigned', label: 'Assigned' }, { id: 'in-progress', label: 'In progress' }, { id: 'fixed', label: 'Fixed' }, { id: 'dismissed', label: 'Dismissed' },
]
type Filter = 'open' | 'fixed' | 'all'

export default function Findings({ onOpen }: { onOpen: (view: 'load' | 'dashboard' | 'plan') => void }) {
  const state = useFactory()
  const role = useRole()
  const view = useMemo(() => siteFindings(state), [state])
  const [filter, setFilter] = useState<Filter>('open')
  const open = view.findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed')
  const shown = filter === 'all' ? view.findings : filter === 'fixed' ? view.findings.filter((f) => f.state.status === 'fixed') : open
  const total = (items: typeof view.findings) => items.reduce((s, f) => s + f.rmPerMonth, 0)
  const inProgress = view.findings.filter((f) => f.state.status === 'assigned' || f.state.status === 'in-progress')

  return <div className="dashboard findings">
    <header className="dash-head">
      <div><h1>Findings</h1><p className="muted">{state.settings.factoryName} · where you’re losing money, and what to do</p></div>
    </header>
    {view.loadSample && <div className="sample-banner"><b>Sample data</b> · upload your meter data for real savings</div>}

    <div className="dash-kpis three">
      <div className="dash-kpi"><span className="dash-kpi-label">To win</span><strong>{ringgit(total(open))} <small>/month</small></strong><small className="muted">{open.length} open · {ringgit(total(open) * 12)}/yr</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">In progress</span><strong>{ringgit(total(inProgress))} <small>/month</small></strong><small className="muted">{inProgress.length} item(s)</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">Fixed</span><strong>{ringgit(total(view.findings.filter((f) => f.state.status === 'fixed')))} <small>/month</small></strong><small className="muted">Check on the Dashboard</small></div>
    </div>

    <div className="scope-tabs" role="tablist" aria-label="Show findings">
      {(['open', 'fixed', 'all'] as Filter[]).map((id) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{id === 'open' ? `Open (${open.length})` : id === 'fixed' ? 'Fixed' : 'All'}</button>)}
    </div>

    {shown.length === 0 && <p className="muted">Nothing here.</p>}
    <div className="finding-list">
      {shown.map((f) => <article key={f.key} className={`card finding ${f.kind} ${f.state.status}`}>
        <header>
          <span className={`kind-chip ${f.kind}`}>{kindLabel[f.kind]}</span>
          <h2>{f.title}</h2>
          <div className="finding-value">{f.rmPerMonth > 0 ? <><b>{ringgit(f.rmPerMonth)}</b><small>/month</small></> : <small className="muted">check</small>}</div>
        </header>
        <p className="finding-why">{f.evidence[0]}</p>
        <p className="finding-next"><b>Do:</b> {f.actions[0]}</p>
        {(f.evidence.length > 1 || f.actions.length > 1) && <details className="finding-more"><summary>Details</summary>
          <ul className="evidence">{f.evidence.slice(1).map((line) => <li key={line}>{line}</li>)}</ul>
          {f.actions.length > 1 && <ol>{f.actions.slice(1).map((line) => <li key={line}>{line}</li>)}</ol>}
        </details>}
        <footer>
          <span className="muted small">{f.confidence === 'high' ? '● Measured' : '◐ Estimate'}{f.tPerYear > 0 ? ` · −${tonnes(f.tPerYear)} CO₂e/yr` : ''}{f.state.updatedAt ? ` · updated ${new Date(f.state.updatedAt).toLocaleDateString('en-GB')}` : ''}</span>
          <div className="finding-controls">
            <label className="field inline"><span className="sr-only">Status</span>
              <select value={f.state.status} onChange={(event) => actions.setFinding(f.key, { status: event.target.value as FindingStatus, owner: f.state.owner ?? roleById(role).person }, f.title)}>
                {statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select></label>
            <input className="owner-input" placeholder="Owner" value={f.state.owner ?? ''} onChange={(event) => actions.setFinding(f.key, { owner: event.target.value }, f.title)} aria-label="Owner" />
            <button type="button" className="btn ghost small" onClick={() => onOpen(f.view)}>Evidence</button>
            {f.measureIds?.length ? <button type="button" className="btn ghost small" onClick={() => onOpen('plan')} title={f.measureIds.map((id) => measureById(id)?.name).join(', ')}>Upgrades</button> : null}
          </div>
        </footer>
      </article>)}
    </div>
    <p className="muted small">Estimates from your data and tariff. <Info>Peak savings assume load can be rescheduled. Idle savings assume {num(IDLE_AVOIDABLE * 100)}% of idle energy is avoidable.</Info></p>
  </div>
}
