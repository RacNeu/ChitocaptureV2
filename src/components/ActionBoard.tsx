import { useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import type { PlannedAction } from '../model/calc'
import { measureById } from '../model/measures'
import { can, nextSteps, roleById, statusInfo, waitingFor } from '../model/roles'
import { actions, useRole } from '../model/store'
import type { ActionStatus, PlanAction } from '../model/types'

type Row = { action: PlanAction; machineName: string; planned?: PlannedAction }

const columns: ActionStatus[] = ['proposed', 'approved', 'in-progress', 'done', 'verified']
const when = (iso: string) => new Date(iso).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function ActionCard({ row }: { row: Row }) {
  const role = useRole()
  const { action, planned } = row
  const status = action.status ?? 'proposed'
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [measured, setMeasured] = useState(action.measuredT !== undefined ? String(action.measuredT) : planned ? String(Math.round(planned.economics.netT)) : '')
  const [askMeasured, setAskMeasured] = useState(false)
  const mine = waitingFor(role, status)
  const steps = nextSteps(status, role)

  const move = (to: ActionStatus) => {
    if (to === 'done' && !askMeasured) { setAskMeasured(true); setOpen(true); return }
    if (to === 'done') actions.updateAction(action.id, { measuredT: Number(measured) })
    actions.setActionStatus(action.id, to, note)
    setNote(''); setAskMeasured(false)
  }

  return <article className={`action-card ${statusInfo[status].tone}${mine ? ' mine' : ''}`}>
    <button type="button" className="action-head" onClick={() => setOpen(!open)} aria-expanded={open}>
      <strong>{measureById(action.measureId)?.name ?? 'Action'}</strong>
      <small>{row.machineName}</small>
      <span className="action-meta">
        {planned && <b className={planned.economics.netT > 0 ? 'good' : 'bad'}>−{tonnes(Math.max(0, planned.economics.netT))}/yr</b>}
        {action.measuredT !== undefined && <span className="measured">measured −{tonnes(action.measuredT)}</span>}
        {(action.comments?.length ?? 0) > 0 && <span>💬 {action.comments!.length}</span>}
      </span>
      <span className="action-owner">{action.owner ?? 'Unassigned'}{action.dueDate ? ` · due ${action.dueDate}` : ''}</span>
      {mine && <em className="your-turn">Your move</em>}
    </button>

    {steps.length > 0 && <div className="action-steps">
      {askMeasured && <label className="field small-field">Measured saving (t CO₂e/yr)<input type="number" min="0" value={measured} onChange={(event) => setMeasured(event.target.value)} /></label>}
      {steps.map((step) => <button key={step.to} type="button" className={`btn small${step.to === 'rejected' || step.to === 'in-progress' && status === 'done' ? ' ghost' : ''}`} onClick={() => move(step.to)}>{askMeasured && step.to === 'done' ? 'Confirm done' : step.label}</button>)}
    </div>}

    {open && <div className="action-body">
      {planned && <dl className="action-facts">
        <div><dt>Capex</dt><dd>{ringgit(planned.economics.capexRM)}</dd></div>
        <div><dt>Saving</dt><dd>{ringgit(planned.economics.annualSavingRM)}/yr</dd></div>
        <div><dt>Payback</dt><dd>{planned.economics.paybackYears === null ? '—' : `${num(planned.economics.paybackYears, 1)} y`}</dd></div>
      </dl>}
      {can.editAction(role) && <div className="action-edit">
        <label className="field small-field">Owner<input value={action.owner ?? ''} onChange={(event) => actions.updateAction(action.id, { owner: event.target.value })} /></label>
        <label className="field small-field">Due<input type="month" value={action.dueDate ?? ''} onChange={(event) => actions.updateAction(action.id, { dueDate: event.target.value })} /></label>
      </div>}
      <ul className="comments">{(action.comments ?? []).map((comment, index) => <li key={index} className={comment.role}><b>{comment.who}</b><small>{when(comment.at)}</small><p>{comment.text}</p></li>)}</ul>
      <form className="comment-form" onSubmit={(event) => { event.preventDefault(); actions.addComment(action.id, note); setNote('') }}>
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder={`Comment as ${roleById(role).person}…`} aria-label="Comment" />
        <button type="submit" className="btn small ghost" disabled={!note.trim()}>Send</button>
      </form>
      {can.removeAction(role) && <button type="button" className="link danger-link" onClick={() => { if (confirm('Remove this action from the plan?')) actions.removeFromPlan(action.id) }}>Remove from plan</button>}
    </div>}
  </article>
}

export default function ActionBoard({ rows }: { rows: Row[] }) {
  const role = useRole()
  const rejected = rows.filter((row) => (row.action.status ?? 'proposed') === 'rejected')
  const waiting = rows.filter((row) => waitingFor(role, row.action.status ?? 'proposed'))
  return <section className="card board-card">
    <div className="board-head">
      <h2>Action workflow</h2>
      <span className={`waiting-chip${waiting.length ? ' on' : ''}`}>{waiting.length ? `${waiting.length} waiting for you (${roleById(role).label})` : `Nothing waiting for ${roleById(role).label}`}</span>
    </div>
    <p className="muted small">Proposed → Approved → In progress → Done → Verified. Engineers deliver and report measured savings; sustainability approves and verifies; management can approve investment. Switch “View as” at the top to act as each team.</p>
    <div className="board">
      {columns.map((column) => {
        const items = rows.filter((row) => (row.action.status ?? 'proposed') === column)
        return <div key={column} className={`board-col ${statusInfo[column].tone}`}>
          <h3>{statusInfo[column].label.split(' ·')[0]} <small>{items.length}</small></h3>
          {items.map((row) => <ActionCard key={row.action.id} row={row} />)}
          {items.length === 0 && <p className="board-empty">—</p>}
        </div>
      })}
    </div>
    {rejected.length > 0 && <details className="rejected"><summary>Rejected ({rejected.length})</summary><div className="board-col red">{rejected.map((row) => <ActionCard key={row.action.id} row={row} />)}</div></details>}
  </section>
}
