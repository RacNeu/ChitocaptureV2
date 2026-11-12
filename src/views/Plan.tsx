import { LineChart, Waterfall, type WaterfallStep } from '../components/Charts'
import { num, ringgit, tonnes } from '../format'
import { plannedActions, summarise, trajectory } from '../model/calc'
import { autoPlan } from '../model/copilot'
import { measureById } from '../model/measures'
import { actions, useFactory, useRole } from '../model/store'
import ActionBoard from '../components/ActionBoard'
import { can, roleById } from '../model/roles'

export default function Plan({ onShowTwin }: { onShowTwin: () => void }) {
  const state = useFactory()
  const role = useRole()
  const summary = summarise(state)
  const planned = plannedActions(state).sort((a, b) => a.action.startYear - b.action.startYear || b.economics.netT - a.economics.netT)
  const path = trajectory(state)
  const years = Array.from({ length: state.settings.targetYear - state.settings.baselineYear + 1 }, (_, index) => state.settings.baselineYear + index)
  const payback = summary.annualSavingRM > 0 ? summary.capexRM / summary.annualSavingRM : null
  const reductionPct = summary.baselineT > 0 ? summary.plannedReductionT / summary.baselineT * 100 : 0

  const rows = state.plan.map((action) => ({ action, machineName: state.machines.find((item) => item.id === action.machineId)?.name ?? 'Machine', planned: planned.find((item) => item.action.id === action.id) }))
  if (state.plan.length === 0) {
    return <div className="empty">
      <span className="empty-icon">🗺️</span>
      <h1>Your plan is empty</h1>
      <p>Click machines on the twin and choose <b>Add to plan</b>, or let the copilot build a plan that hits your target at the lowest cost per tonne.</p>
      <div className="row-actions center">
        {can.propose(role) ? <button type="button" className="btn big" onClick={() => actions.setPlan(autoPlan(state))}>✦ Build a plan for me</button> : <p className="muted">Viewing as {roleById(role).label}: switch “View as” to an engineer or sustainability to propose actions.</p>}
        <button type="button" className="btn ghost" onClick={onShowTwin}>Open the twin</button>
      </div>
    </div>
  }

  const top = [...planned].sort((a, b) => b.economics.netT - a.economics.netT)
  const shown = top.slice(0, 7)
  const restT = top.slice(7).reduce((sum, item) => sum + Math.max(0, item.economics.netT), 0)
  const steps: WaterfallStep[] = [
    { label: 'Today', value: summary.baselineT, kind: 'start' },
    ...shown.map((item) => ({ label: measureById(item.action.measureId)?.short ?? 'Action', value: Math.max(0, item.economics.netT), kind: 'cut' as const })),
    ...(restT > 0 ? [{ label: `${top.length - 7} more`, value: restT, kind: 'cut' as const }] : []),
    { label: 'With plan', value: summary.afterPlanT, kind: 'end' },
  ]

  return <div className="plan">
    <header className="plan-head">
      <div><h1>Reduction plan · {state.settings.factoryName}</h1><p className="muted">{state.settings.baselineYear} → {state.settings.targetYear} · target −{state.settings.targetReductionPct}% · {planned.length} actions</p></div>
      <div className="row-actions no-print">
        {can.propose(role) && state.plan.every((item) => (item.status ?? 'proposed') === 'proposed') && <button type="button" className="btn ghost" onClick={() => actions.setPlan(autoPlan(state))}>✦ Re-plan with copilot</button>}
        <button type="button" className="btn" onClick={() => window.print()}>Save as PDF</button>
        <button type="button" className="btn ghost danger" title="Remove every action and start again" onClick={() => { if (confirm(`Clear all ${state.plan.length} actions from the plan for ${state.settings.factoryName}? This cannot be undone.`)) actions.clearPlan() }}>🗑 Clear plan</button>
      </div>
    </header>

    <div className="kpis">
      <div className="kpi accent"><span>Cut per year</span><strong>{tonnes(summary.plannedReductionT)}</strong><small>−{num(reductionPct, 1)}% of {tonnes(summary.baselineT)}</small></div>
      <div className={`kpi ${summary.gapT > 0 ? 'warn' : 'good'}`}><span>{summary.gapT > 0 ? 'Still to find' : 'Target'}</span><strong>{summary.gapT > 0 ? tonnes(summary.gapT) : 'Met ✓'}</strong><small>target {tonnes(summary.targetT)}/yr</small></div>
      <div className="kpi"><span>Investment</span><strong>{ringgit(summary.capexRM)}</strong><small>indicative capex</small></div>
      <div className="kpi"><span>Annual saving</span><strong>{ringgit(summary.annualSavingRM)}</strong><small>{payback === null ? 'no overall payback' : `pays back in ${num(payback, 1)} years`}</small></div>
    </div>

    <div className="plan-charts">
      <section className="card"><h2>From today to target</h2><Waterfall steps={steps} target={summary.targetT} /></section>
      <section className="card"><h2>Year by year</h2><LineChart labels={path.map((point) => point.year)} yLabel="Emissions trajectory compared with the target path"
        series={[{ label: 'Planned', values: path.map((point) => point.emissionsT), className: 's-plan' }, { label: 'Target path', values: path.map((point) => point.targetPathT), className: 's-target', dashed: true }]} />
        <div className="legend"><span><i className="s-plan" />Planned emissions</span><span><i className="s-target" />Straight-line path to target</span></div></section>
    </div>

    <ActionBoard rows={rows} />

    <section className="card">
      <h2>Numbers per action <small className="muted">rejected actions are excluded</small></h2>
      <div className="table-wrap"><table className="grid-table actions-table">
        <thead><tr><th>Start</th><th>Machine</th><th>Action</th><th className="num">Net CO₂e/yr</th><th className="num">RM per t</th><th className="num">Capex</th><th className="num">Saving/yr</th><th className="num">Payback</th><th className="no-print" /></tr></thead>
        <tbody>{planned.map(({ action, machine, economics }) => <tr key={action.id}>
          <td><select aria-label="Start year" disabled={!can.editAction(role)} value={action.startYear} onChange={(event) => actions.setActionYear(action.id, Number(event.target.value))}>{years.map((year) => <option key={year}>{year}</option>)}</select></td>
          <td>{machine.name}</td>
          <td>{measureById(action.measureId)?.name}</td>
          <td className={`num ${economics.netT <= 0 ? 'bad' : ''}`}>{economics.netT <= 0 ? '+' : '−'}{tonnes(Math.abs(economics.netT))}</td>
          <td className="num">{economics.costPerTonneRM === null ? '—' : num(economics.costPerTonneRM)}</td>
          <td className="num">{ringgit(economics.capexRM)}</td>
          <td className="num">{ringgit(economics.annualSavingRM)}</td>
          <td className="num">{economics.paybackYears === null ? '—' : `${num(economics.paybackYears, 1)} y`}</td>
          <td className="no-print"><span className={`status-pill ${action.status ?? 'proposed'}`}>{(action.status ?? 'proposed').replace('-', ' ')}</span></td>
        </tr>)}</tbody>
      </table></div>
      <p className="muted small">All savings and costs are indicative planning estimates from the measure library and your factors. Confirm each one with an audit, a quote or a trial before committing. Net CO₂e already subtracts each action’s own energy use.</p>
    </section>

    <section className="card activity">
      <h2>Activity <small className="muted">who changed what on this site</small></h2>
      {(state.history ?? []).length === 0 ? <p className="muted">No changes yet.</p> : <ol>{[...(state.history ?? [])].reverse().slice(0, 30).map((entry, index) => <li key={index} className={entry.role}>
        <span className="who">{roleById(entry.role).icon} {entry.who}</span><span className="what">{entry.text}</span><time>{new Date(entry.at).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
      </li>)}</ol>}
    </section>
  </div>
}
