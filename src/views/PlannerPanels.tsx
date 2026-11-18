import LineIcon from '../components/LineIcon'
import { useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import Info from '../components/Info'
import { measureById } from '../model/measures'
import { assets, replacements, type AssetId, type Change, type ChangeImpact, type NewChange, type ReplaceId, type Scenario, type ScenarioImpact } from '../model/planner'
import type { BuildingRow } from '../model/siteModel'

/* ---------------- Left: scenarios, palette, changes ---------------- */

export function PlannerSide({ scenarios, active, impact, armed, onArm, onSelectScenario, onNew, onRename, onDelete, onRemove, onSize }: {
  scenarios: Scenario[]; active: Scenario | null; impact: ScenarioImpact; armed: AssetId | null
  onArm: (id: AssetId | null) => void; onSelectScenario: (id: string) => void; onNew: () => void; onRename: (name: string) => void; onDelete: () => void
  onRemove: (changeId: string) => void; onSize: (changeId: string, size: number) => void
}) {
  return <div className="pl-side">
    <div className="pl-scen">
      <label className="field inline"><span className="sr-only">Scenario</span>
        <select value={active?.id ?? ''} onChange={(e) => onSelectScenario(e.target.value)}>
          {!active && <option value="">No scenario yet</option>}
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
      <button type="button" className="btn small" onClick={onNew}>+ New</button>
      {active && <button type="button" className="icon-btn" title="Rename" aria-label="Rename scenario" onClick={() => { const name = prompt('Scenario name', active.name); if (name?.trim()) onRename(name.trim()) }}><LineIcon name="pencil" /></button>}
      {active && <button type="button" className="icon-btn" title="Delete" aria-label="Delete scenario" onClick={() => { if (confirm(`Delete “${active.name}”?`)) onDelete() }}><LineIcon name="trash" /></button>}
    </div>

    <h3>Add to the site <Info>Drag onto a green plot, or click one here and then click a plot. Figures are design estimates (typical engineering values), shown on each item.</Info></h3>
    <div className="pl-palette">
      {(Object.keys(assets) as AssetId[]).map((id) => <button key={id} type="button" draggable
        className={`pl-asset${armed === id ? ' armed' : ''}`} title={assets[id].note}
        onDragStart={(e) => { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'copy'; onArm(id) }}
        onClick={() => onArm(armed === id ? null : id)}>
        <span aria-hidden="true">{assets[id].icon}</span><b>{assets[id].name}</b><small>{assets[id].size} {assets[id].unit}</small>
      </button>)}
    </div>
    {armed && <p className="pl-armed">Click a green plot to place the <b>{assets[armed].name.toLowerCase()}</b>. <button type="button" className="link" onClick={() => onArm(null)}>Cancel</button></p>}

    <h3>Changes {active ? `· ${active.changes.length}` : ''}</h3>
    {!active || active.changes.length === 0 ? <p className="muted small">Pick a building to upgrade or replace it, or add something from above.</p>
      : <ul className="pl-changes">{impact.changes.map((c) => <ChangeRow key={c.change.id} c={c} onRemove={onRemove} onSize={onSize} />)}</ul>}
  </div>
}

function ChangeRow({ c, onRemove, onSize }: { c: ChangeImpact; onRemove: (id: string) => void; onSize: (id: string, size: number) => void }) {
  const ch = c.change
  const spec = ch.type === 'add' ? assets[ch.assetId] : null
  return <li className={c.growth ? 'growth' : ''}>
    <div className="pl-c-head"><b>{c.label}</b><button type="button" className="icon-btn" aria-label={`Remove ${c.label}`} onClick={() => onRemove(ch.id)}>✕</button></div>
    <small className="muted">{c.target}{c.design ? ' · ' : ''}{c.design && <span className="tag-design">design estimate</span>}</small>
    {spec && ch.type === 'add' && <label className="pl-size">Size<input type="range" min={spec.min} max={spec.max} step={spec.step} value={ch.size} onChange={(e) => onSize(ch.id, Number(e.target.value))} /><output>{ch.size} {spec.unit}</output></label>}
    <div className="pl-c-nums">
      <span className={c.cutT >= 0 ? 'good-text' : 'bad-text'}>{c.cutT >= 0 ? '−' : '+'}{tonnes(Math.abs(c.cutT))}/yr</span>
      <span className={c.savingRM >= 0 ? 'good-text' : 'bad-text'}>{c.savingRM >= 0 ? 'saves ' : 'costs '}{ringgit(Math.abs(c.savingRM))}/yr</span>
      <span>capex {ringgit(c.capexRM)}</span>
    </div>
  </li>
}

/* ---------------- Right: building actions in plan mode ---------------- */

export function PlannerBuilding({ row, active, onAdd, onRemove }: { row: BuildingRow; active: Scenario | null; onAdd: (change: NewChange) => void; onRemove: (changeId: string) => void }) {
  const m = row.machine
  const planned = m.id.startsWith('new-')
  const inScenario = (pred: (c: Change) => boolean) => active?.changes.find(pred)
  const replaceIds = (Object.keys(replacements) as ReplaceId[]).filter((id) => replacements[id].appliesTo.includes(m.kind) && m.fuel !== 'none' && m.fuelGJ > 0)
  if (planned) {
    const ch = inScenario((c) => `new-${c.id}` === m.id)
    return <div className="pl-building">
      <p className="s3-role">{m.role}</p>
      {ch && <button type="button" className="btn ghost small" onClick={() => onRemove(ch.id)}>Remove from scenario</button>}
    </div>
  }
  return <div className="pl-building">
    <h3>Upgrade</h3>
    {row.options.length === 0 && !inScenario((c) => c.type === 'upgrade' && c.machineId === m.id) ? <p className="muted small">No library upgrades for this equipment.</p>
      : <ul className="s3-options">
        {[...row.options.map((o) => o.measureId), ...(active?.changes.filter((c) => c.type === 'upgrade' && c.machineId === m.id).map((c) => (c as Extract<Change, { type: 'upgrade' }>).measureId) ?? [])]
          .filter((id, k, all) => all.indexOf(id) === k).map((measureId) => {
            const opt = row.options.find((o) => o.measureId === measureId)
            const existing = inScenario((c) => c.type === 'upgrade' && c.machineId === m.id && c.measureId === measureId)
            return <li key={measureId}>
              <div><b>{measureById(measureId)?.name}</b>{opt && <small>−{tonnes(opt.economics.netT)}/yr · {opt.economics.annualSavingRM >= 0 ? `saves ${ringgit(opt.economics.annualSavingRM)}` : `costs ${ringgit(-opt.economics.annualSavingRM)}`}/yr</small>}</div>
              {existing ? <button type="button" className="btn ghost small" onClick={() => onRemove(existing.id)}>✓ Added</button>
                : <button type="button" className="btn small" onClick={() => onAdd({ type: 'upgrade', machineId: m.id, measureId })}>+ Add</button>}
            </li>
          })}
      </ul>}
    {replaceIds.length > 0 && <>
      <h3>Replace <span className="tag-design">design estimate</span></h3>
      <ul className="s3-options">{replaceIds.map((id) => {
        const r = replacements[id]
        const existing = inScenario((c) => c.type === 'replace' && c.machineId === m.id && c.replaceId === id)
        return <li key={id}>
          <div><b>{r.name}</b><small>instead of {r.from} · {r.note}</small></div>
          {existing ? <button type="button" className="btn ghost small" onClick={() => onRemove(existing.id)}>✓ Added</button>
            : <button type="button" className="btn small" onClick={() => onAdd({ type: 'replace', machineId: m.id, replaceId: id })}>Replace</button>}
        </li>
      })}</ul>
    </>}
  </div>
}

/* ---------------- Right: scenario impact ---------------- */

function Delta({ before, after, unit, money = false, lowerIsBetter = true }: { before: number | null; after: number | null; unit?: string; money?: boolean; lowerIsBetter?: boolean }) {
  if (before === null || after === null) return <td colSpan={2} className="muted">—</td>
  const fmt = (v: number) => money ? ringgit(v) : unit === 'MW' ? `${num(v / 1_000, 1)} MW` : tonnes(v)
  const better = lowerIsBetter ? after < before - 1e-6 : after > before + 1e-6
  const worse = lowerIsBetter ? after > before + 1e-6 : after < before - 1e-6
  return <><td className="num">{fmt(before)}</td><td className={`num ${better ? 'good-text' : worse ? 'bad-text' : ''}`}><b>{fmt(after)}</b></td></>
}

export function PlannerImpact({ impact, rate, active, scenarios, compare, onSend }: { impact: ScenarioImpact; rate: number; active: Scenario | null; scenarios: { s: Scenario; impact: ScenarioImpact }[]; compare: boolean; onSend: () => void }) {
  const { before: b, after: a } = impact
  const upgrades = active?.changes.filter((c) => c.type === 'upgrade').length ?? 0
  return <div className="pl-impact">
    <h2>{active?.name ?? 'No scenario'}</h2>
    <table className="grid-table pl-table">
      <thead><tr><th /><th className="num">Today</th><th className="num">Scenario</th></tr></thead>
      <tbody>
        <tr><td>Emissions /yr</td><Delta before={b.totalT} after={a.totalT} /></tr>
        <tr><td>· Scope 1</td><Delta before={b.scope1T} after={a.scope1T} /></tr>
        <tr><td>· Scope 2</td><Delta before={b.scope2T} after={a.scope2T} /></tr>
        <tr><td>Energy cost /yr</td><Delta before={b.costRM} after={a.costRM} money /></tr>
        <tr><td>Carbon tax {impact.taxYear}</td><Delta before={b.taxRM} after={a.taxRM} money /></tr>
        <tr><td>Peak demand</td><Delta before={b.mdKW} after={a.mdKW} unit="MW" /></tr>
        {b.productionT !== null && a.productionT !== b.productionT && <tr><td>Output /yr</td><Delta before={b.productionT} after={a.productionT} lowerIsBetter={false} /></tr>}
      </tbody>
    </table>
    <div className="pl-money">
      <div><span>Investment</span><b>{ringgit(impact.capexRM)}</b></div>
      <div><span>Net saving</span><b className={impact.savingRM >= 0 ? 'good-text' : 'bad-text'}>{ringgit(impact.savingRM)}/yr</b></div>
      <div><span>Payback</span><b>{impact.paybackYears ? `${num(impact.paybackYears, 1)} yr` : '—'}</b></div>
    </div>
    <Macc changes={impact.changes} rate={rate} taxYear={impact.taxYear} />
    {upgrades > 0 && <button type="button" className="btn" onClick={onSend}>Send {upgrades} upgrade{upgrades === 1 ? '' : 's'} to the Plan</button>}
    {impact.changes.some((c) => c.design) && <p className="muted small">Replacements and new assets are design estimates; they stay in the scenario until there is a quote or design.</p>}
    {compare && scenarios.length > 1 && <>
      <h3>Compare scenarios</h3>
      <table className="grid-table pl-table">
        <thead><tr><th>Scenario</th><th className="num">CO₂</th><th className="num">Capex</th><th className="num">Saving</th></tr></thead>
        <tbody>{scenarios.map(({ s, impact: i }) => <tr key={s.id} className={s.id === active?.id ? 'pl-active' : ''}>
          <td>{s.name}</td>
          <td className="num">{i.before.totalT > 0 ? `${i.after.totalT <= i.before.totalT ? '−' : '+'}${num(Math.abs(1 - i.after.totalT / i.before.totalT) * 100, 1)}%` : '—'}</td>
          <td className="num">{ringgit(i.capexRM)}</td>
          <td className="num">{ringgit(i.savingRM)}/yr</td>
        </tr>)}</tbody>
      </table>
    </>}
  </div>
}

/** Marginal abatement cost curve: each change as a bar, width = tonnes cut, height = RM per tonne. */
function Macc({ changes, rate, taxYear }: { changes: ChangeImpact[]; rate: number; taxYear: number }) {
  const [hover, setHover] = useState<number | null>(null)
  const items = changes.filter((c) => c.costPerT !== null && c.cutT > 0).sort((a, b) => a.costPerT! - b.costPerT!)
  if (!items.length) return <p className="muted small">Add upgrades or replacements to see the cost-per-tonne chart.</p>
  const W = 300, H = 170, L = 44, R = 6, T = 10, B = 22
  const total = items.reduce((s, c) => s + c.cutT, 0)
  const lo = Math.min(0, ...items.map((c) => c.costPerT!)) * 1.15, hi = Math.max(rate, ...items.map((c) => c.costPerT!)) * 1.15
  const x = (t: number) => L + t / total * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  let acc = 0
  return <div className="mchart pl-macc">
    <h3>Cost per tonne <Info>Each bar is one change: its width is the CO₂ it cuts a year, its height what each tonne costs (below zero = it saves money). Bars under the dashed line cost less than paying the carbon tax.</Info></h3>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cost per tonne of each change">
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero-line" />
      {[lo, 0, hi].map((v) => <text key={v} x={L - 4} y={y(v) + 4} textAnchor="end" className="chart-tick">{Math.round(v)}</text>)}
      {items.map((c, k) => {
        const x0 = x(acc); acc += c.cutT
        const top = Math.min(y(0), y(c.costPerT!)), h = Math.abs(y(c.costPerT!) - y(0))
        return <rect key={c.change.id} x={x0 + 1} y={top} width={Math.max(2, x(acc) - x0 - 2)} height={Math.max(1.5, h)} rx={2}
          className={c.costPerT! < 0 ? 'macc-save' : c.costPerT! < rate ? 'macc-ok' : 'macc-dear'} onPointerEnter={() => setHover(k)} onPointerLeave={() => setHover(null)} />
      })}
      <line x1={L} x2={W - R} y1={y(rate)} y2={y(rate)} className="macc-tax" />
      <text x={W - R} y={y(rate) - 4} textAnchor="end" className="chart-note">Tax {taxYear}: RM {Math.round(rate)}/t</text>
      <text x={L} y={H - 6} className="chart-tick">0</text><text x={W - R} y={H - 6} textAnchor="end" className="chart-tick">{tonnes(total)}/yr cut</text>
    </svg>
    {hover !== null && <div className="chart-tip" style={{ left: '30%' }}><b>{items[hover].label}</b><span>{items[hover].target}</span><span>RM {Math.round(items[hover].costPerT!)}/t · −{tonnes(items[hover].cutT)}/yr</span></div>}
    <div className="legend"><span><i className="lg-save" />Saves money</span><span><i className="lg-ok2" />Cheaper than tax</span><span><i className="lg-dear" />Dearer than tax</span></div>
  </div>
}
