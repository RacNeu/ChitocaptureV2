import { useState } from 'react'
import IsoFloor, { type FloorItem, type FloorZone } from '../components/IsoFloor'
import type { Machine } from '../model/types'
import { companyActions, useCompany } from '../model/store'
import { templateById } from '../model/templates'

type StackSegment = { key: 'electricity' | 'fuel' | 'process'; label: string; value: number }
type StackItem = { machine: Machine; segments: StackSegment[]; total: number; before?: number }
const zoneColours = ['#059669', '#0284c7', '#d97706', '#7c3aed', '#e11d48', '#0f766e']
import { kindIcon, num, ringgit, tonnes } from '../format'
import { areaSummary, contextFor, machineEmissions, performance, summarise } from '../model/calc'
import { openInControlRoom } from '../model/focus'
import { performanceLabel } from '../components/PerformanceBlock'
import { fuelLabels } from '../model/factors'
import { useFactory } from '../model/store'

export default function Analysis() {
  const state = useFactory()
  const [withPlan, setWithPlan] = useState(false)
  const [carbonPrice, setCarbonPrice] = useState(35)
  const [scope, setScope] = useState<'site' | 'company'>('site')
  const company = useCompany()
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
      <div><h1>Where does the carbon come from?</h1><p className="muted">Every piece of equipment ranked by its yearly CO₂e and split by cause (electricity, fuel or process). Switch the map between this site and the whole company to see where each component belongs.</p></div>
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

    {(() => {
      let mapItems: FloorItem[]
      let zones: FloorZone[] = []
      if (scope === 'site') {
        mapItems = summary.byMachine.map((row) => ({ machine: row.machine, baselineT: row.baselineT, afterT: row.afterT, sub: row.machine.area }))
      } else {
        // Lay the company's sites side by side, each in its own labelled zone.
        mapItems = []
        let colOffset = 0, rowOffset = 0, rowHeight = 0
        company.sites.filter((site) => site.state.onboarded).forEach((site, index) => {
          const rows = summarise(site.state).byMachine
          const cols = Math.max(2, ...rows.map((row) => row.machine.col + 1))
          const height = Math.max(2, ...rows.map((row) => row.machine.row + 1))
          // Sites sit side by side along one diagonal, which reads left to right.
          const icon = templateById(site.state.settings.industryId)?.icon ?? ''
          const colour = zoneColours[index % zoneColours.length]
          // Label each site's three biggest emitters; the rest show their details on hover.
          const labelled = new Set([...rows].sort((x, y) => y.baselineT - x.baselineT).slice(0, 3).map((row) => row.machine.id))
          rows.forEach((row) => mapItems.push({ machine: { ...row.machine, col: row.machine.col + colOffset, row: row.machine.row + rowOffset }, baselineT: row.baselineT, afterT: row.afterT, hideLabel: !labelled.has(row.machine.id), zone: site.id }))
          zones.push({ id: site.id, label: `${icon} ${site.state.settings.factoryName}`, col: colOffset, row: rowOffset, cols, rows: height, colour })
          colOffset += cols + 1
          rowHeight = Math.max(rowHeight, height)
        })
      }
      const openSite = (siteId: string) => { companyActions.switchSite(siteId); setScope('site') }
      const open = (id: string) => {
        if (scope === 'company') {
          // In the company view a click drills into that component's site.
          const owner = company.sites.find((site) => site.state.machines.some((machine) => machine.id === id))
          if (owner) openSite(owner.id)
          return
        }
        const machine = state.machines.find((item) => item.id === id)
        if (machine?.unitId) openInControlRoom(machine.unitId)
      }
      return <section className="card map-card">
        <div className="map-head">
          <div className="toggle" role="radiogroup" aria-label="Map scope">
            <button type="button" role="radio" aria-checked={scope === 'site'} className={scope === 'site' ? 'active' : ''} onClick={() => setScope('site')}>This site</button>
            <button type="button" role="radio" aria-checked={scope === 'company'} className={scope === 'company' ? 'active' : ''} onClick={() => setScope('company')}>Whole company</button>
          </div>
          {scope === 'site' && company.sites.length > 1 && <div className="site-chips" role="tablist" aria-label="Site shown">
            {company.sites.filter((site) => site.state.onboarded).map((site) => <button key={site.id} type="button" role="tab" aria-selected={site.id === company.activeId} className={site.id === company.activeId ? 'active' : ''} onClick={() => companyActions.switchSite(site.id)}>
              {templateById(site.state.settings.industryId)?.icon} {site.state.settings.factoryName}
            </button>)}
          </div>}
          <div className="floor-legend"><span><i className="lg-low" />Low</span><span><i className="lg-mid" />Medium</span><span><i className="lg-high" />High share of CO₂</span></div>
        </div>
        <IsoFloor key={`${scope}-${company.activeId}-${withPlan}`} tilt items={mapItems} zones={zones} onSelectZone={scope === 'company' ? openSite : undefined} spacing={scope === 'company' ? 2.4 : 1.9} withPlan={withPlan} selectedId={null} onSelect={open} live={null} />
        <p className="muted small">{scope === 'site' ? `Every component of ${state.settings.factoryName}, labelled with its process area.` : `Every component in ${company.name}, grouped into coloured zones by site. Each site’s three biggest emitters are labelled; hover any block for its name. Click a site to open it in “This site”.`} Height and colour show yearly CO₂e{withPlan ? ' after the plan' : ''}.{scope === 'site' && state.machines.some((machine) => machine.unitId) ? ' Click a block to watch it live in the simulation.' : ''}</p>
      </section>
    })()}

    {(() => {
      const areas = areaSummary(state, withPlan)
      const areaMax = Math.max(1, ...areas.map((area) => area.totalT))
      const perf = state.machines.map((machine) => ({ machine, p: performance(machine, state) })).filter((item): item is { machine: typeof item.machine; p: NonNullable<typeof item.p> } => item.p !== null).sort((a, b) => b.p.excessT - a.p.excessT)
      const unit = state.settings.productUnit
      return <div className="analysis-grid two">
        <section className="card">
          <h2>By process area</h2>
          <p className="muted small">Machines grouped the way the plant is run{state.settings.productionTPerYear ? `, shown per tonne of ${unit}` : ''}.</p>
          <div className="area-list">{areas.map((area) => <div key={area.area} className="area-row">
            <div className="area-head"><b>{area.area}</b><span>{tonnes(area.totalT)}/yr{area.perTonneKg !== null ? ` · ${num(area.perTonneKg)} kg/t ${unit}` : ''}</span></div>
            <div className="sharebar big"><span style={{ width: `${area.totalT / areaMax * 100}%` }} /></div>
            <small className="muted">{area.machines.map((machine) => machine.name).join(' · ')}</small>
          </div>)}</div>
        </section>
        <section className="card">
          <h2>Energy performance vs target</h2>
          {perf.length === 0 ? <p className="muted">{state.settings.productionTPerYear ? 'No machine has an energy target yet. Add targets in Settings → Machines.' : 'Add your annual production in Settings to compare machines with their energy targets.'}</p> : <>
            <p className="muted small">Energy each machine uses per tonne of {unit}, against its target. Machines above target are where efficiency work pays first.</p>
            <ul className="perf-list">{perf.map(({ machine, p }) => <li key={machine.id} className={p.status}>
              <div><b>{machine.name}</b><small>{num(p.actual, p.unit === 'GJ/t' ? 2 : 0)} vs {num(p.target, p.unit === 'GJ/t' ? 2 : 0)} {p.unit}</small></div>
              <span className="perf-chip">{performanceLabel(p)}</span>
              <span className="perf-stake-cell">{p.excessT > 0 ? `${tonnes(p.excessT)}/yr at stake` : '—'}</span>
            </li>)}</ul>
            <p className="note">Targets in this sample are illustrative placeholders. Real ones come from the plant's own best performance or an energy audit. Tracking energy per tonne like this is also the core of energy-efficiency reporting under the EECA 2024.</p>
          </>}
        </section>
      </div>
    })()}

    <div className="analysis-grid">
      <section className="card">
        <h2>Ranking</h2>
        <div className="table-wrap"><table className="grid-table rank-table">
          <thead><tr><th>#</th><th>Source</th><th>Area</th><th className="num">t CO₂e/yr</th><th>Share</th><th>vs target</th><th className="num">Carbon cost/yr</th><th>Data</th></tr></thead>
          <tbody>{ranked.map((item, index) => <tr key={item.machine.id}>
            <td>{index + 1}</td>
            <td title={item.machine.role}>{kindIcon[item.machine.kind]} {item.machine.name}</td>
            <td className="muted">{item.machine.area ?? '—'}</td>
            <td className="num">{tonnes(item.total)}</td>
            <td><div className="sharebar"><span style={{ width: `${item.total / Math.max(1e-9, total) * 100}%` }} /></div><small>{num(item.total / Math.max(1e-9, total) * 100, 1)}%</small></td>
            <td>{(() => { const p = performance(item.machine, state); return p ? <span className={`target-chip ${p.status === 'above' ? 'above' : 'ok'}`}>{performanceLabel(p)}</span> : <span className="muted">—</span> })()}</td>
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
