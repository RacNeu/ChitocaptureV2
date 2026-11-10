import { useState } from 'react'
import IsoStack, { type StackItem } from '../components/IsoStack'
import { kindIcon, num, ringgit, tonnes } from '../format'
import { contextFor, machineEmissions, summarise } from '../model/calc'
import { fuelLabels } from '../model/factors'
import { useFactory } from '../model/store'

export default function Analysis() {
  const state = useFactory()
  const [withPlan, setWithPlan] = useState(false)
  const [carbonPrice, setCarbonPrice] = useState(35)
  const ctx = contextFor(state)
  const summary = summarise(state)

  const items: StackItem[] = summary.byMachine.map((row) => {
    const parts = machineEmissions(row.machine, ctx)
    // With the plan, each cause is scaled by the machine's overall reduction (an approximation:
    // the plan is tracked per machine, not per cause).
    const factor = withPlan && row.baselineT > 0 ? row.afterT / row.baselineT : 1
    return {
      machine: row.machine,
      total: withPlan ? row.afterT : row.baselineT,
      before: withPlan ? row.baselineT : undefined,
      segments: [
        { key: 'electricity', label: 'Grid electricity', value: parts.electricityT * factor },
        { key: 'fuel', label: row.machine.fuel === 'none' ? 'Fuel' : fuelLabels[row.machine.fuel], value: parts.fuelT * factor },
        { key: 'process', label: 'Process', value: parts.processT * factor },
      ],
    }
  })
  const ranked = [...items].sort((a, b) => b.total - a.total)
  const total = ranked.reduce((sum, item) => sum + item.total, 0)
  const byCause = {
    electricity: ranked.reduce((sum, item) => sum + item.segments[0].value, 0),
    fuel: ranked.reduce((sum, item) => sum + item.segments[1].value, 0),
    process: ranked.reduce((sum, item) => sum + item.segments[2].value, 0),
  }
  let running = 0
  const paretoCount = ranked.findIndex((item) => { running += item.total; return running >= total * 0.8 }) + 1
  const top = ranked[0]
  const topCause = (Object.entries(byCause) as [keyof typeof byCause, number][]).sort((a, b) => b[1] - a[1])[0]
  const causeLabel = { electricity: 'grid electricity', fuel: 'burning fuel', process: 'process chemistry (e.g. calcination or methane)' }

  return <div className="analysis">
    <header className="plan-head">
      <div><h1>Where does the carbon come from?</h1><p className="muted">Every source ranked by its yearly CO₂e, split by cause. Hover a tower for details.</p></div>
      <div className="toggle" role="radiogroup" aria-label="Scenario">
        <button type="button" role="radio" aria-checked={!withPlan} className={!withPlan ? 'active' : ''} onClick={() => setWithPlan(false)}>Today</button>
        <button type="button" role="radio" aria-checked={withPlan} className={withPlan ? 'active' : ''} disabled={state.plan.length === 0} onClick={() => setWithPlan(true)} title={state.plan.length === 0 ? 'Add actions to your plan first' : ''}>With plan</button>
      </div>
    </header>

    <div className="kpis">
      <div className="kpi warn"><span>Biggest source</span><strong>{top ? top.machine.name : '—'}</strong><small>{top ? `${tonnes(top.total)}/yr · ${num(top.total / Math.max(1, total) * 100, 1)}% of the factory` : ''}</small></div>
      <div className="kpi"><span>The 80% rule</span><strong>{paretoCount} of {ranked.length}</strong><small>sources make up 80% of emissions: focus there first</small></div>
      <div className="kpi"><span>Main cause</span><strong className="cap">{topCause ? causeLabel[topCause[0]].split(' (')[0] : '—'}</strong><small>{topCause ? `${num(topCause[1] / Math.max(1, total) * 100)}% of all CO₂e` : ''}</small></div>
      <div className="kpi accent"><span>Carbon cost at RM {carbonPrice}/t</span><strong>{ringgit(total * carbonPrice)}</strong><small>per year · illustrative price, adjust below</small></div>
    </div>

    <section className="card skyline-card">
      <div className="skyline-legend legend"><span><i className="elec" />Grid electricity</span><span><i className="fuel" />Fuel combustion</span><span><i className="proc" />Process</span>{withPlan && <span><i className="ghost-swatch" />Before plan</span>}</div>
      <IsoStack items={items} />
      <p className="muted small">Tower height uses a square-root scale so small sources stay visible next to a dominant one. Exact tonnes are shown on each tower and in the table.</p>
    </section>

    <div className="analysis-grid">
      <section className="card">
        <h2>Ranking</h2>
        <div className="table-wrap"><table className="grid-table rank-table">
          <thead><tr><th>#</th><th>Source</th><th className="num">t CO₂e/yr</th><th>Share</th><th className="num">Carbon cost/yr</th><th>Data</th></tr></thead>
          <tbody>{ranked.map((item, index) => <tr key={item.machine.id}>
            <td>{index + 1}</td>
            <td>{kindIcon[item.machine.kind]} {item.machine.name}</td>
            <td className="num">{tonnes(item.total)}</td>
            <td><div className="sharebar"><span style={{ width: `${item.total / Math.max(1e-9, total) * 100}%` }} /></div><small>{num(item.total / Math.max(1e-9, total) * 100, 1)}%</small></td>
            <td className="num">{ringgit(item.total * carbonPrice)}</td>
            <td><span className={`quality ${item.machine.quality}`}>{item.machine.quality === 'metered' ? 'Metered' : 'Estimated'}</span></td>
          </tr>)}</tbody>
        </table></div>
      </section>

      <section className="card">
        <h2>By cause</h2>
        <div className="cause-bars">{(Object.entries(byCause) as [keyof typeof byCause, number][]).map(([key, value]) => <div key={key} className="cause">
          <div className="cause-head"><span className="cap">{causeLabel[key].split(' (')[0]}</span><b>{tonnes(value)}</b></div>
          <div className="sharebar big"><span className={key === 'electricity' ? 'elec' : key === 'fuel' ? 'fuel' : 'proc'} style={{ width: `${value / Math.max(1e-9, total) * 100}%` }} /></div>
          <small className="muted">{num(value / Math.max(1e-9, total) * 100, 1)}% · {key === 'electricity' ? 'cut with efficiency and solar' : key === 'fuel' ? 'cut with heat recovery, tuning and fuel switching' : 'cut with process changes, methane capture or carbon capture'}</small>
        </div>)}</div>
        <label className="field price-field">Carbon price for the cost estimate (RM per tonne)
          <input type="range" min="0" max="200" step="5" value={carbonPrice} onChange={(event) => setCarbonPrice(Number(event.target.value))} />
          <output>RM {carbonPrice}/t</output>
        </label>
        <p className="note">Malaysia has announced a carbon tax starting with the iron, steel and energy sectors, but the rate and start date should be checked against the latest official announcement. This slider only shows what different prices would mean for this factory.</p>
      </section>
    </div>
  </div>
}
