import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { kindIcon, num, ringgit, tonnes } from '../format'
import FullscreenButton from '../components/FullscreenButton'
import Info from '../components/Info'
import type { ColorBy } from '../components/IsoSite3D'
import { measureById } from '../model/measures'
import { openInControlRoom } from '../model/focus'
import { siteModel, type BuildingRow } from '../model/siteModel'
import { actions, useFactory } from '../model/store'
import { statusInfo } from '../model/roles'
import type { View } from '../App'
import { defaultTaxInputs, rmPerTonne } from '../model/carbonTax'
import { assetMachine, assets, freeCells, scenarioImpact, type AssetId, type Change, type NewChange, type Scenario } from '../model/planner'
import { newId } from '../model/store'
import { PlannerBuilding, PlannerImpact, PlannerSide } from './PlannerPanels'

const IsoSite3D = lazy(() => import('../components/IsoSite3D'))

type Sort = 'co2' | 'cost' | 'risk'
const riskScore = (r: BuildingRow) => r.flags.reduce((s, f) => s + (f.level === 'bad' ? 10 : 3), 0)
const flagIcon: Record<string, string> = { target: '▲', peak: '⚡', flood: '💧', fuel: '🔥' }

export default function Site3D({ go }: { go: (view: View) => void }) {
  const state = useFactory()
  const model = useMemo(() => siteModel(state), [state])
  const [colorBy, setColorBy] = useState<ColorBy>('co2')
  const [withPlan, setWithPlan] = useState(false)
  const [showFlows, setShowFlows] = useState(true)
  const [sort, setSort] = useState<Sort>('co2')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'view' | 'plan'>('view')
  const [armed, setArmed] = useState<AssetId | null>(null)
  const planMode = mode === 'plan'

  // Scenarios (pre-operations planner).
  const scenarios = state.scenarios ?? []
  const active = scenarios.find((x) => x.id === state.activeScenarioId) ?? scenarios[0] ?? null
  const impact = useMemo(() => scenarioImpact(state, planMode ? active : null), [state, active, planMode])
  const allImpacts = useMemo(() => planMode ? scenarios.map((x) => ({ s: x, impact: scenarioImpact(state, x) })) : [], [state, scenarios, planMode])
  const save = (next: Scenario[], activeId?: string) => actions.setScenarios(next, activeId ?? active?.id)
  const ensure = (): Scenario => {
    if (active) return active
    const created: Scenario = { id: newId('scn'), name: 'Scenario 1', changes: [], createdAt: new Date().toISOString() }
    return created
  }
  const addChange = (change: NewChange) => {
    const target = ensure()
    const next = { ...target, changes: [...target.changes, { ...change, id: newId('chg') } as Change] }
    save(active ? scenarios.map((x) => x.id === next.id ? next : x) : [...scenarios, next], next.id)
  }
  const updateActive = (fn: (x: Scenario) => Scenario) => { if (active) save(scenarios.map((x) => x.id === active.id ? fn(x) : x)) }
  const planned = planMode ? (active?.changes.filter((c): c is Extract<Change, { type: 'add' }> => c.type === 'add').map(assetMachine) ?? []) : []
  const planModel = useMemo(() => planned.length ? siteModel({ ...state, machines: [...state.machines, ...planned] }) : model, [state, model, planned.length, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const cells = planMode ? freeCells([...state.machines, ...planned].map((m) => ({ col: m.col, row: m.row }))) : []
  const place = (col: number, row: number) => { if (!armed) return; addChange({ type: 'add', assetId: armed, col, row, size: assets[armed].size }); setArmed(null) }
  const rate = rmPerTonne(new Date().getFullYear() + 1, { ...defaultTaxInputs, ...state.settings.carbonTax })
  const sendToPlan = () => { for (const c of active?.changes ?? []) if (c.type === 'upgrade') actions.addToPlan(c.machineId, c.measureId, year) }

  const year = state.settings.baselineYear + 1
  const rows = [...model.rows].sort((a, b) => sort === 'cost' ? b.costRM - a.costRM : sort === 'risk' ? riskScore(b) - riskScore(a) || b.totalT - a.totalT : b.totalT - a.totalT)
  const sel = planModel.rows.find((r) => r.machine.id === selectedId) ?? null
  const value = (r: BuildingRow) => colorBy === 'cost' ? `${ringgit(r.costRM)}/yr` : tonnes(withPlan ? r.afterT : r.totalT)
  const maxValue = Math.max(...model.rows.map((r) => colorBy === 'cost' ? r.costRM : r.totalT), 1)

  return <div className="site3d" ref={stageRef}>
    <header className="s3-top">
      <div className="s3-title"><h1>{state.settings.factoryName}</h1><span className="muted">Site 3D</span></div>
      <div className="s3-stats">
        <span><small>Emissions</small><b>{tonnes(withPlan ? model.afterT : model.totalT)}/yr</b></span>
        <span><small>Energy cost</small><b>{ringgit(model.costRM)}/yr</b></span>
        <span><small>In plan</small><b>{model.plannedCount}</b></span>
        <span><small>Upgrades found</small><b>{model.optionCount}</b></span>
      </div>
      <div className="s3-controls">
        <div className="seg mode" role="radiogroup" aria-label="Mode">
          <button type="button" role="radio" aria-checked={!planMode} className={!planMode ? 'on' : ''} onClick={() => { setMode('view'); setArmed(null) }}>👁 View</button>
          <button type="button" role="radio" aria-checked={planMode} className={planMode ? 'on' : ''} onClick={() => setMode('plan')}>✎ Plan</button>
        </div>
        {!planMode && <div className="seg" role="radiogroup" aria-label="Show">
          <button type="button" role="radio" aria-checked={!withPlan} className={!withPlan ? 'on' : ''} onClick={() => setWithPlan(false)}>Today</button>
          <button type="button" role="radio" aria-checked={withPlan} className={withPlan ? 'on' : ''} onClick={() => setWithPlan(true)}>With plan</button>
        </div>}
        <div className="seg" role="radiogroup" aria-label="Colour by">
          {(['co2', 'cost', 'risk'] as ColorBy[]).map((c) => <button key={c} type="button" role="radio" aria-checked={colorBy === c} className={colorBy === c ? 'on' : ''} onClick={() => { setColorBy(c); setSort(c) }}>{c === 'co2' ? 'CO₂' : c === 'cost' ? 'Cost' : 'Risk'}</button>)}
        </div>
        <label className="s3-check"><input type="checkbox" checked={showFlows} onChange={(e) => setShowFlows(e.target.checked)} /> Flows</label>
        <FullscreenButton target={stageRef} />
      </div>
    </header>

    <div className="s3-body">
      <aside className="s3-list" aria-label={planMode ? 'Planner' : 'Buildings'}>
        {planMode ? <PlannerSide scenarios={scenarios} active={active} impact={impact} armed={armed} onArm={setArmed}
          onSelectScenario={(id) => save(scenarios, id)}
          onNew={() => { const x: Scenario = { id: newId('scn'), name: `Scenario ${scenarios.length + 1}`, changes: [], createdAt: new Date().toISOString() }; save([...scenarios, x], x.id) }}
          onRename={(name) => updateActive((x) => ({ ...x, name }))}
          onDelete={() => { const rest = scenarios.filter((x) => x.id !== active?.id); save(rest, rest[0]?.id) }}
          onRemove={(id) => updateActive((x) => ({ ...x, changes: x.changes.filter((c) => c.id !== id) }))}
          onSize={(id, size) => updateActive((x) => ({ ...x, changes: x.changes.map((c) => c.id === id && c.type === 'add' ? { ...c, size } : c) }))} /> : <>
        <div className="s3-list-head"><b>{model.rows.length} buildings</b><span className="muted small">sorted by {sort === 'co2' ? 'CO₂' : sort}</span></div>
        <ul>{rows.map((r) => {
          const active = r.machine.id === selectedId
          const v = colorBy === 'cost' ? r.costRM : r.totalT
          return <li key={r.machine.id}>
            <button type="button" className={`s3-row${active ? ' active' : ''}${r.machine.id === hoverId ? ' hover' : ''}`}
              onMouseEnter={() => setHoverId(r.machine.id)} onMouseLeave={() => setHoverId(null)} onClick={() => setSelectedId(active ? null : r.machine.id)}>
              <span className="s3-icon" aria-hidden="true">{kindIcon[r.machine.kind] ?? '🏭'}</span>
              <span className="s3-name"><b>{r.machine.name}</b><small>{r.machine.area ?? ''}</small>
                <span className="s3-bar"><i style={{ width: `${v / maxValue * 100}%` }} /></span></span>
              <span className="s3-val"><b>{value(r)}</b>
                <small>{r.flags.map((f) => <span key={f.id} className={`s3-flag ${f.level}`} title={f.label}>{flagIcon[f.id]}</span>)}{r.planned.length > 0 && <span className="s3-flag plan" title={`${r.planned.length} in plan`}>✓{r.planned.length}</span>}</small></span>
            </button>
          </li>
        })}</ul></>}
      </aside>

      <section className="s3-stage">
        <Suspense fallback={<div className="iso-stage loading">Loading 3D…</div>}>
          <IsoSite3D rows={planModel.rows} colorBy={colorBy} withPlan={withPlan && !planMode} showFlows={showFlows} planMode={planMode} cells={cells} armed={Boolean(armed)} onPlace={place} selectedId={selectedId} hoverId={hoverId} onSelect={setSelectedId} onHover={setHoverId} />
        </Suspense>
        <div className="s3-legend">
          {colorBy === 'risk'
            ? <><span><i className="lg-ok" />No flags</span><span><i className="lg-warn" />Watch</span><span><i className="lg-bad" />Act</span></>
            : <><span>{colorBy === 'cost' ? 'Energy cost' : 'CO₂'}: low</span><i className="lg-ramp" /><span>high</span></>}
          {showFlows && <><span><i className="lg-power" />Power</span>{model.rows.some((r) => r.machine.unitId === 'eaf') && <span><i className="lg-steel" />Hot steel</span>}</>}
          <span className="muted">· drag to turn · scroll to zoom · click a building</span>
        </div>
      </section>

      <aside className="s3-panel" aria-live="polite">
        {planMode ? (sel ? <>
          <header className="s3-panel-head">
            <span className="s3-icon big" aria-hidden="true">{kindIcon[sel.machine.kind] ?? '🏭'}</span>
            <div><h2>{sel.machine.name}</h2><small className="muted">{tonnes(sel.totalT)}/yr · {ringgit(sel.costRM)}/yr</small></div>
            <button type="button" className="icon-btn" aria-label="Back to scenario" onClick={() => setSelectedId(null)}>✕</button>
          </header>
          <PlannerBuilding row={sel} active={active} onAdd={addChange} onRemove={(id) => updateActive((x) => ({ ...x, changes: x.changes.filter((c) => c.id !== id) }))} />
          <button type="button" className="link" onClick={() => setSelectedId(null)}>← Scenario totals</button>
        </> : <PlannerImpact impact={impact} rate={rate} active={active} scenarios={allImpacts} compare onSend={sendToPlan} />) : !sel ? <div className="s3-empty">
          <h2>Pick a building</h2>
          <p className="muted">Click one in 3D or in the list to see its carbon, risks and what to do.</p>
          <div className="s3-summary">
            {model.rows.filter((r) => r.flags.length).length > 0 && <p><b>{model.rows.filter((r) => r.flags.length).length}</b> buildings need attention (pins in 3D).</p>}
            <p><b>{model.optionCount}</b> upgrades found · <b>{model.plannedCount}</b> in the plan.</p>
          </div>
        </div> : <>
          <header className="s3-panel-head">
            <span className="s3-icon big" aria-hidden="true">{kindIcon[sel.machine.kind] ?? '🏭'}</span>
            <div><h2>{sel.machine.name}</h2><small className="muted">{sel.machine.area ?? 'Site'} · {sel.machine.quality === 'metered' ? 'metered' : state.monthly?.length ? 'matched to bills' : 'template figures'}</small></div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={() => setSelectedId(null)}>✕</button>
          </header>
          {sel.machine.role && <p className="s3-role">{sel.machine.role}</p>}

          <h3>Carbon</h3>
          <div className="s3-kv">
            <div><span>Total</span><b>{tonnes(sel.totalT)}/yr</b><small>{num(sel.share * 100, 1)}% of site</small></div>
            <div><span>Scope 1</span><b>{tonnes(sel.scope1T)}</b><small>fuel & process</small></div>
            <div><span>Scope 2</span><b>{tonnes(sel.scope2T)}</b><small>electricity</small></div>
            <div><span>Energy cost</span><b>{ringgit(sel.costRM)}</b><small>per year</small></div>
          </div>

          <h3>Risks</h3>
          {sel.flags.length === 0 ? <p className="muted small">No flags for this building.</p>
            : <ul className="s3-flags">{sel.flags.map((f) => <li key={f.id} className={f.level}><b>{flagIcon[f.id]} {f.label}</b><small>{f.detail}</small></li>)}</ul>}

          <h3>Actions <Info>Upgrades are estimates from the measure library, priced at your tariff. Adding one puts it in the Plan as “proposed”.</Info></h3>
          {sel.planned.length > 0 && <ul className="s3-actions">{sel.planned.map((p) => <li key={p.action.id}><span className="s3-status">{statusInfo[p.action.status ?? 'proposed'].label}</span><b>{p.name}</b><small>−{tonnes(p.netT)}/yr · from {p.action.startYear}</small></li>)}</ul>}
          {sel.options.length > 0 ? <ul className="s3-options">{sel.options.map((o) => <li key={o.measureId}>
            <div><b>{measureById(o.measureId)?.name}</b><small>−{tonnes(o.economics.netT)}/yr{o.economics.annualSavingRM > 0 ? ` · saves ${ringgit(o.economics.annualSavingRM)}/yr` : ''}{o.economics.paybackYears ? ` · ${num(o.economics.paybackYears, 1)} yr payback` : ''}</small></div>
            <button type="button" className="btn small" onClick={() => actions.addToPlan(sel.machine.id, o.measureId, year)}>+ Plan</button>
          </li>)}</ul> : sel.planned.length === 0 && <p className="muted small">No upgrades in the library for this equipment.</p>}
          <div className="row-actions">
            <button type="button" className="btn ghost small" onClick={() => go('plan')}>Open plan →</button>
            {sel.machine.unitId && <button type="button" className="btn ghost small" onClick={() => openInControlRoom(sel.machine.unitId!)}>🔥 Simulate</button>}
          </div>
        </>}
      </aside>
    </div>
  </div>
}
