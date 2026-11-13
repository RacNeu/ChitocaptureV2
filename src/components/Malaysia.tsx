import { num } from '../format'
import { gridRegions } from '../model/factors'
import { parksIn, programmesFor, stateById, steelCrossCheck, masteelBenchmark, myStates, type Applicability } from '../model/malaysia'
import type { FactoryState, Settings } from '../model/types'

/** State and industrial area pickers. Picking a state sets the matching grid region. */
export function LocationFields({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const parks = parksIn(settings.stateId)
  return <>
    <label className="field">State<select value={settings.stateId ?? ''} onChange={(event) => {
      const where = stateById(event.target.value)
      onChange({ stateId: where?.id, industrialPark: '', ...(where ? { gridRegionId: where.gridRegionId } : {}) })
    }}>
      <option value="">Choose a state…</option>
      {myStates.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select></label>
    <label className="field">Industrial area<input list="my-parks" value={settings.industrialPark ?? ''} placeholder={parks[0]?.name ?? 'e.g. Pasir Gudang'} onChange={(event) => onChange({ industrialPark: event.target.value })} />
      <datalist id="my-parks">{parks.map((park) => <option key={park.name} value={park.name} />)}</datalist></label>
  </>
}

/** One line under the grid picker saying which grid and utility the chosen state uses. */
export function gridHint(settings: Settings) {
  const where = stateById(settings.stateId)
  if (!where) return ''
  const region = gridRegions.find((item) => item.id === where.gridRegionId)
  const mismatch = settings.gridRegionId !== where.gridRegionId && settings.gridRegionId !== 'custom'
  return `${where.label} is supplied by ${where.utility} on the ${region?.label} grid (${region?.kgPerKWh} kg CO₂/kWh).${mismatch ? ' The grid chosen below does not match this state.' : ''}`
}

const statusLabel: Record<Applicability, string> = { applies: 'Applies', likely: 'Likely', check: 'Check', 'not-applicable': 'Not applicable' }

/** Malaysian rules, incentives and markets for the active site. */
export function MalaysiaRules({ state }: { state: FactoryState }) {
  const where = stateById(state.settings.stateId)
  const items = programmesFor(state)
  return <section className="card my-rules">
    <header><h2>🇲🇾 Malaysian rules and programmes for this site</h2>
      <p className="muted">{where ? `${state.settings.industrialPark ? `${state.settings.industrialPark}, ` : ''}${where.label} · ${where.utility} supply` : 'Set the site’s state in Settings to check which rules apply.'} · checked 13 November 2026</p></header>
    <div className="table-wrap"><table className="grid-table">
      <thead><tr><th>Rule or programme</th><th>Status</th><th>Why</th><th>What to do</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <td><b>{item.name}</b><small className="block muted"><a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a></small></td>
        <td><span className={`my-status ${item.status}`}>{statusLabel[item.status]}</span></td>
        <td>{item.why}</td><td className="muted">{item.action}</td>
      </tr>)}</tbody>
    </table></div>
  </section>
}

/** Our sample steel mill against a Malaysian steelmaker's published figures. */
export function SteelCrossCheck() {
  const rows = steelCrossCheck()
  return <section className="card cross-check">
    <header><h2>Cross-check against published Malaysian data</h2>
      <p className="muted">The sample steel mill is not a real plant, so we compare it with what a Malaysian scrap-EAF steelmaker publishes. Masteel (Malaysia Steel Works (KL) Bhd) reports Scope 1 and 2 emissions per tonne for its steelmaking plant and its rolling mill separately, on the same Peninsular grid.</p></header>
    <div className="table-wrap"><table className="grid-table">
      <thead><tr><th>Part of the mill</th><th className="num">Our model (t CO₂e/t)</th><th className="num">Published (t CO₂e/t)</th><th className="num">Difference</th><th>Notes</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.label}>
        <td><b>{row.label}</b></td><td className="num">{num(row.ours, 3)}</td><td className="num">{row.theirsLabel}</td>
        <td className={`num ${Math.abs(row.diffPct) <= 5 ? 'good' : Math.abs(row.diffPct) <= 15 ? 'fair' : 'weak'}`}>{row.diffPct > 0 ? '+' : ''}{num(row.diffPct, 1)}%</td>
        <td className="muted">{row.note}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="note">Published figures: {masteelBenchmark.map((item, index) => <span key={item.year}>{index > 0 ? '; ' : ''}<a href={item.url} target="_blank" rel="noreferrer">{item.source} ↗</a></span>)}; world scrap-EAF average 0.7 t (worldsteel 2023 data, via <a href="https://www.irena.org/Decarbonising-hard-to-abate-sectors-with-renewables-Enablers-and-recommendations/Industry-sector/Iron-and-steel" target="_blank" rel="noreferrer">IRENA ↗</a>). Masteel’s figures are self-reported. Difference = our value against the midpoint of the published range.</p>
  </section>
}
