import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import IsoFloor from '../components/IsoFloor'
import type { HoverInfo, Look } from '../components/Plant3D'

const Plant3D = lazy(() => import('../components/Plant3D'))
import { Sparkline } from '../components/Charts'
import { kindIcon, num, ringgit, tonnes } from '../format'
import { contextFor, machineEmissions, optionsFor, performance, summarise } from '../model/calc'
import { openInControlRoom } from '../model/focus'
import { PerformanceBlock, performanceLabel } from '../components/PerformanceBlock'
import { answer, copilotQuestions, type CopilotAnswer, type CopilotQuestion } from '../model/copilot'
import { fuelLabels } from '../model/factors'
import { measureById } from '../model/measures'
import { actions, useFactory } from '../model/store'
import { useSensor } from '../sensor/hub'

function Copilot({ onShowPlan }: { onShowPlan: () => void }) {
  const state = useFactory()
  const [question, setQuestion] = useState<CopilotQuestion>('start')
  const result: CopilotAnswer = useMemo(() => answer(question, state), [question, state])
  return <section className="panel copilot" aria-live="polite">
    <header className="panel-head"><span className="copilot-avatar">✦</span><div><h2>Carbon copilot</h2><small>Answers built from your factory data</small></div></header>
    <div className="chips">{copilotQuestions.map((item) => <button key={item.id} type="button" className={`chip${question === item.id ? ' active' : ''}`} onClick={() => setQuestion(item.id)}>{item.label}</button>)}</div>
    <article className="answer">
      <h3>{result.title}</h3>
      {result.lines.map((line, index) => <p key={index} className={line.startsWith('•') ? 'bullet' : ''}>{line}</p>)}
      {result.suggestedPlan && result.suggestedPlan.length > 0 && <button type="button" className="btn" onClick={() => { actions.setPlan(result.suggestedPlan!); onShowPlan() }}>Use this plan →</button>}
    </article>
    <p className="hint">Tip: click any machine on the map.</p>
  </section>
}

function MachinePanel({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const state = useFactory()
  const sensor = useSensor()
  const machine = state.machines.find((item) => item.id === machineId)
  if (!machine) return null
  const ctx = contextFor(state)
  const emissions = machineEmissions(machine, ctx)
  const options = optionsFor(machine, state)
  const planned = new Map(state.plan.filter((item) => item.machineId === machine.id).map((item) => [item.measureId, item]))
  const channelValues = machine.sensorChannel ? sensor.history.map((point) => point[machine.sensorChannel!]).filter((value): value is number => typeof value === 'number') : []
  const parts = [
    { label: 'Electricity', value: emissions.electricityT, className: 'elec' },
    { label: fuelLabels[machine.fuel], value: emissions.fuelT, className: 'fuel' },
    { label: 'Process', value: emissions.processT, className: 'proc' },
  ].filter((part) => part.value > 0)

  return <section className="panel machine">
    <header className="panel-head">
      <span className="machine-icon">{kindIcon[machine.kind]}</span>
      <div><h2>{machine.name}</h2><small>{machine.area ? `${machine.area} · ` : ''}{machine.quality === 'metered' ? 'metered data' : 'estimated data'}</small></div>
      <button type="button" className="icon-btn" onClick={onClose} aria-label="Close machine panel">✕</button>
    </header>
    {machine.role && <p className="machine-role"><b>What it does:</b> {machine.role}</p>}
    {machine.unitId && <button type="button" className="btn small live-link" onClick={() => openInControlRoom(machine.unitId!)}>▶ Watch it live in the control room</button>}
    <div className="big-number">{tonnes(emissions.totalT)}<small> CO₂e per year</small></div>
    {parts.length > 0 && <div className="stackbar" role="img" aria-label="Emissions by source">{parts.map((part) => <span key={part.label} className={part.className} style={{ flexGrow: part.value }} title={`${part.label}: ${tonnes(part.value)}`} />)}</div>}
    <div className="legend">{parts.map((part) => <span key={part.label}><i className={part.className} />{part.label} {tonnes(part.value)}</span>)}</div>
    {(() => { const p = performance(machine, state); return p ? <PerformanceBlock performance={p} /> : null })()}

    <div className="sensor-row">
      <label>Live sensor<select value={machine.sensorChannel ?? ''} onChange={(event) => actions.bindSensor(machine.id, (event.target.value || undefined) as typeof machine.sensorChannel)}>
        <option value="">None</option><option value="co2">CO₂ (single sensor)</option><option value="co2_in">CO₂ inlet</option><option value="co2_out">CO₂ outlet</option>
      </select></label>
      {machine.sensorChannel && <div className="sensor-mini">{sensor.latest?.[machine.sensorChannel] !== undefined ? <><b>{num(sensor.latest[machine.sensorChannel]!)} ppm</b><Sparkline values={channelValues.slice(-90)} width={140} height={32} /></> : <span className="muted">Waiting for data: start a sensor on the Sensors page.</span>}</div>}
    </div>

    <h3>Ways to cut it <small>(best value first)</small></h3>
    {options.length === 0 && <p className="muted">No measures in the library apply to this machine yet.</p>}
    <ul className="options">
      {options.map(({ measureId, economics }) => {
        const measure = measureById(measureId)!
        const action = planned.get(measureId)
        const bad = economics.netT <= 0
        return <li key={measureId} className={`option${action ? ' in-plan' : ''}${bad ? ' bad' : ''}`}>
          <div className="option-top"><strong>{measure.name}</strong><span className="tag">{measure.category}</span></div>
          <p>{measure.explain}</p>
          <div className="option-stats">
            <span><b>{bad ? '+' : '−'}{tonnes(Math.abs(economics.netT))}</b>/yr net</span>
            <span><b>{economics.costPerTonneRM === null ? '—' : ringgit(economics.costPerTonneRM)}</b>/t</span>
            <span><b>{economics.paybackYears === null ? 'none' : `${num(economics.paybackYears, 1)} yr`}</b> payback</span>
            <span><b>{ringgit(economics.capexRM)}</b> capex</span>
          </div>
          {economics.penaltyT > 0 && <p className="note">Its own energy use emits {tonnes(economics.penaltyT)} a year, already subtracted.</p>}
          <details><summary>Engineering checks & basis</summary><ul>{measure.checks.map((check) => <li key={check}>{check}</li>)}</ul><p className="muted">Indicative estimate: {measure.basis}. Replace it with an audit, a quote or trial data.</p></details>
          {action
            ? <button type="button" className="btn ghost small" onClick={() => actions.removeFromPlan(action.id)}>✓ In plan ({action.startYear}) · remove</button>
            : <button type="button" className="btn small" disabled={bad} onClick={() => actions.addToPlan(machine.id, measureId, state.settings.baselineYear + 1)}>+ Add to plan</button>}
        </li>
      })}
    </ul>
  </section>
}

export default function Twin({ onShowPlan }: { onShowPlan: () => void }) {
  const state = useFactory()
  const sensor = useSensor()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [withPlan, setWithPlan] = useState(false)
  const [mode, setMode] = useState<Look | 'map'>('real')
  const [introHidden, setIntroHidden] = useState(() => { try { return localStorage.getItem('chitocapture.v3.introHidden') === '1' } catch { return false } })
  const summary = summarise(state)
  const items = summary.byMachine.map((row) => ({ machine: row.machine, baselineT: row.baselineT, afterT: row.afterT }))
  const reductionPct = summary.baselineT > 0 ? summary.plannedReductionT / summary.baselineT * 100 : 0
  const describe = useCallback((machineId: string): HoverInfo | null => {
    const row = summary.byMachine.find((item) => item.machine.id === machineId)
    if (!row) return null
    const best = optionsFor(row.machine, state).find((option) => option.economics.netT > 0)
    const reading = row.machine.sensorChannel ? sensor.latest?.[row.machine.sensorChannel] : undefined
    const rows: [string, string][] = [
      ['CO₂e today', `${tonnes(row.baselineT)}/yr`],
      ['Share of factory', `${num(row.baselineT / Math.max(1, summary.baselineT) * 100, 1)}%`],
      ['With plan', row.reductionT > 0 ? `${tonnes(row.afterT)}/yr (−${num(row.reductionT / Math.max(1e-9, row.baselineT) * 100)}%)` : 'no actions yet'],
      ['Data', row.machine.quality === 'metered' ? 'Metered' : 'Estimated'],
    ]
    const perf = performance(row.machine, state)
    if (perf) rows.splice(2, 0, ['Energy per tonne', `${num(perf.actual, perf.unit === 'GJ/t' ? 2 : 0)} ${perf.unit} (${performanceLabel(perf)})`])
    if (typeof reading === 'number') rows.push(['Live sensor', `${num(reading)} ppm`])
    return {
      title: `${kindIcon[row.machine.kind] ?? ''} ${row.machine.name}`,
      subtitle: row.machine.role ?? row.machine.kind.replace('-', ' '),
      rows,
      footer: best ? `Best next step: ${measureById(best.measureId)?.name} (−${tonnes(best.economics.netT)}/yr). Click for details${row.machine.unitId ? ' and the live view' : ''}.` : 'Click to open details.',
    }
  }, [summary, state, sensor.latest])

  return <div className="twin">
    <div className="twin-main">
      <div className="kpis">
        <div className="kpi"><span>Factory emissions</span><strong>{tonnes(summary.baselineT)}</strong><small>CO₂e per year today</small></div>
        <div className="kpi accent"><span>With your plan</span><strong>{tonnes(summary.afterPlanT)}</strong><small>−{num(reductionPct, 1)}% · {state.plan.length} action{state.plan.length === 1 ? '' : 's'}</small></div>
        <div className="kpi"><span>Target {state.settings.targetYear}</span><strong>{tonnes(summary.targetT)}</strong><small>−{state.settings.targetReductionPct}% from {state.settings.baselineYear}</small></div>
        <div className={`kpi ${summary.gapT > 0 ? 'warn' : 'good'}`}><span>{summary.gapT > 0 ? 'Gap to target' : 'Target met'}</span><strong>{summary.gapT > 0 ? tonnes(summary.gapT) : '✓'}</strong><small>{summary.gapT > 0 ? 'Ask the copilot how to close it' : 'on paper: now verify it'}</small></div>
      </div>
      {!introHidden && <div className="intro-card">
        <div><b>What am I looking at?</b> Each building is one piece of equipment in {state.settings.factoryName}{state.machines.some((item) => item.area) ? `, grouped by process area (${[...new Set(state.machines.map((item) => item.area).filter(Boolean))].join(' → ')})` : ''}. Its colour and smoke show how much CO₂ it releases each year. Hover to see what it does; click for its energy use against target and ways to cut it{state.machines.some((item) => item.unitId) ? ', or to watch it live in the control room' : ''}.</div>
        <button type="button" className="icon-btn" aria-label="Hide this explanation" onClick={() => { setIntroHidden(true); try { localStorage.setItem('chitocapture.v3.introHidden', '1') } catch { /* ignore */ } }}>✕</button>
      </div>}
      <div className="floor-card">
        <div className="floor-toolbar">
          <div className="toggle" role="radiogroup" aria-label="Map view">
            <button type="button" role="radio" aria-checked={!withPlan} className={!withPlan ? 'active' : ''} onClick={() => setWithPlan(false)}>Today</button>
            <button type="button" role="radio" aria-checked={withPlan} className={withPlan ? 'active' : ''} onClick={() => setWithPlan(true)} disabled={state.plan.length === 0} title={state.plan.length === 0 ? 'Add actions to your plan first' : ''}>With plan</button>
          </div>
          <div className="toggle look-toggle" role="radiogroup" aria-label="Model style">
            {([['real', '🏭 Real'], ['twin', '◈ Model'], ['map', '▦ 2D map']] as const).map(([id, label]) => <button key={id} type="button" role="radio" aria-checked={mode === id} className={mode === id ? 'active' : ''} onClick={() => setMode(id)}>{label}</button>)}
          </div>
          <div className="floor-legend">{mode === 'twin' ? <><span><i className="lg-blue" />Lower CO₂</span><span><i className="lg-high" />Highest CO₂</span></> : <><span><i className="lg-low" />Low</span><span><i className="lg-mid" />Medium</span><span><i className="lg-high" />High share of CO₂</span></>}{sensor.status !== 'off' && <span className={`live-pill ${sensor.status}`}><i />{sensor.status === 'live' ? 'Live sensor' : sensor.status === 'simulated' ? 'Simulated sensor' : sensor.status}</span>}</div>
        </div>
        {mode === 'map'
          ? <IsoFloor items={items} withPlan={withPlan} selectedId={selectedId} onSelect={setSelectedId} live={sensor.latest} />
          : <Suspense fallback={<div className="plant3d loading">Loading 3D plant…</div>}>
              <Plant3D items={items} withPlan={withPlan} look={mode} selectedId={selectedId} onSelect={setSelectedId} live={sensor.latest} describe={describe} />
            </Suspense>}
        <p className="floor-note">Height and colour show each machine’s yearly CO₂e. Figures are {state.machines.some((machine) => machine.quality === 'estimated') ? 'partly estimated' : 'from meters'}; factors are editable in Settings.</p>
      </div>
    </div>
    <aside className="twin-side">
      {selectedId ? <MachinePanel machineId={selectedId} onClose={() => setSelectedId(null)} /> : <Copilot onShowPlan={onShowPlan} />}
    </aside>
  </div>
}
