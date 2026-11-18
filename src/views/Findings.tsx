import { useMemo, useState } from 'react'
import { ringgit, tonnes } from '../format'
import { assumptionsFor, kindLabel, PEAK_HOUR_CHOICES, siteFindings } from '../model/findings'
import { measureById } from '../model/measures'
import { roleById } from '../model/roles'
import { actions, useFactory, useRole } from '../model/store'
import type { FindingStatus } from '../model/types'
import Info from '../components/Info'
import EmptyState from '../components/EmptyState'

const statuses: { id: FindingStatus; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'assigned', label: 'Assigned' }, { id: 'in-progress', label: 'In progress' }, { id: 'fixed', label: 'Fixed' }, { id: 'dismissed', label: 'Dismissed' },
]
type Filter = 'open' | 'fixed' | 'all'

export default function Findings({ onOpen }: { onOpen: (view: 'load' | 'dashboard' | 'plan' | 'data') => void }) {
  const state = useFactory()
  const role = useRole()
  const view = useMemo(() => siteFindings(state), [state])
  const assume = assumptionsFor(state)
  const setAssume = (patch: NonNullable<typeof state.settings.assumptions>) => actions.updateSettings({ assumptions: { ...state.settings.assumptions, ...patch } })
  const [filter, setFilter] = useState<Filter>('open')
  const open = view.findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed')
  const shown = filter === 'all' ? view.findings : filter === 'fixed' ? view.findings.filter((f) => f.state.status === 'fixed') : open
  const total = (items: typeof view.findings) => items.reduce((s, f) => s + f.rmPerMonth, 0)
  const inProgress = view.findings.filter((f) => f.state.status === 'assigned' || f.state.status === 'in-progress')

  return <div className="dashboard findings">
    <header className="dash-head">
      <div><h1>Ways to save</h1><p className="muted">{state.settings.factoryName} · where you’re losing money, and what to do</p></div>
    </header>
    {!view.load && !view.hasMonthly && <EmptyState icon="plan" title="Nothing to analyse yet" action={<><button type="button" className="btn" onClick={() => onOpen('load')}>⚡ Upload half-hourly data</button><button type="button" className="btn ghost" onClick={() => onOpen('data')}>⇪ Upload monthly bills</button></>}>Findings come from your own meter readings and bills.</EmptyState>}
    {(view.load || view.hasMonthly) && !(view.load && view.hasMonthly) && <div className="sample-banner">{view.load ? 'Add monthly bills for more findings' : 'Add half-hourly data to find peak and idle savings'} · <button type="button" className="link" onClick={() => onOpen(view.load ? 'data' : 'load')}>Upload</button></div>}

    <div className="dash-kpis three">
      <div className="dash-kpi"><span className="dash-kpi-label">To win</span><strong>{ringgit(total(open))} <small>/month</small></strong><small className="muted">{open.length} open · {ringgit(total(open) * 12)}/yr</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">In progress</span><strong>{ringgit(total(inProgress))} <small>/month</small></strong><small className="muted">{inProgress.length} {inProgress.length === 1 ? 'action' : 'actions'}</small></div>
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
    <section className="card assumptions">
      <header className="card-head"><div><h2>Assumptions <Info>Your own estimates behind the savings. Change them to match your site; every finding updates.</Info></h2></div></header>
      <div className="form-grid compact">
        <label className="field"><span><span className="tag-assume">assumption</span> Idle energy avoidable (%)</span><input type="number" min="0" max="100" value={Math.round(assume.idleAvoidable * 100)} onChange={(event) => setAssume({ idleAvoidablePct: Number(event.target.value) })} /></label>
        <label className="field"><span><span className="tag-assume">assumption</span> Peak hours you can move / month</span><select value={assume.peakHours} onChange={(event) => setAssume({ peakHoursMovable: Number(event.target.value) })}>{PEAK_HOUR_CHOICES.map((h) => <option key={h} value={h}>{h} h</option>)}</select></label>
        <label className="field"><span><span className="tag-assume">assumption</span> Always-on load you can cut (%)</span><input type="number" min="0" max="100" value={Math.round(assume.baseCut * 100)} onChange={(event) => setAssume({ baseCutPct: Number(event.target.value) })} /></label>
      </div>
    </section>
  </div>
}
