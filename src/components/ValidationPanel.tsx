import { useMemo, useState } from 'react'
import { num } from '../format'
import { useFactory } from '../model/store'
import { checkMasteel, MASTEEL_SOURCE } from '../model/validation'

const pct = (value: number) => `${value >= 0 ? '+' : '−'}${num(Math.abs(value), Math.abs(value) < 0.01 ? 2 : 1)}%`
const exact = (ours: number, theirs: number) => Math.abs(ours - theirs) < 0.05

/**
 * "Checked against real data": Masteel's published activity data run live through the same
 * calculation the dashboard and reports use, next to the emissions Masteel reported.
 */
export default function ValidationPanel() {
  const state = useFactory()
  const rows = useMemo(() => checkMasteel(state.settings), [state.settings])
  const [open, setOpen] = useState(false)
  const allExact = rows.every((row) => exact(row.scope2.ours, row.scope2.theirs))
  const latest = rows.at(-1)!
  return <section className="card validation-panel">
    <header className="validation-head">
      <span className="validation-badge" aria-hidden="true">✓</span>
      <div>
        <h2>Calculation checked against real data</h2>
        <p className="muted small">Masteel (Bursa-listed steelmaker) published its electricity, gas and diesel use and its reported emissions. We run those figures through the same calculation as your dashboard, live on this page.</p>
      </div>
      <button type="button" className="btn ghost small" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide details' : 'Show details'}</button>
    </header>
    <div className="validation-stats">
      <div><strong>{allExact ? 'Exact' : 'Mismatch'}</strong><span>Scope 2 vs Masteel, FY{rows[0].year}–FY{latest.year}</span></div>
      <div><strong>{latest.diesel ? pct(latest.diesel.pct) : '—'}</strong><span>Diesel Scope 1, FY{latest.year}</span></div>
      <div><strong>{num(latest.scope2.theirs / (latest.scope2.theirs + (latest.diesel?.theirs ?? 0) + latest.gasT + latest.carbonInputsT) * 100)}%</strong><span>of Masteel’s Scope 1+2 is electricity</span></div>
    </div>
    {open && <>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Year</th><th className="num">Grid factor</th><th className="num">Scope 2 · ours</th><th className="num">Scope 2 · Masteel</th><th className="num">Diesel · ours / Masteel</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.year}>
          <td>FY{row.year}</td><td className="num" title={row.gridSource}>{row.gridKgPerKWh}<small className="muted block">{row.gridSource}</small></td>
          <td className="num">{num(row.scope2.ours, 2)} t</td>
          <td className="num">{num(row.scope2.theirs, 2)} t <span className={`diff ${exact(row.scope2.ours, row.scope2.theirs) ? 'ok' : 'off'}`}>{exact(row.scope2.ours, row.scope2.theirs) ? 'exact' : pct(row.scope2.pct)}</span></td>
          <td className="num">{row.diesel ? <>{num(row.diesel.ours)} / {num(row.diesel.theirs)} t <span className={`diff ${Math.abs(row.diesel.pct) < 2 ? 'ok' : 'note'}`}>{pct(row.diesel.pct)}</span></> : <span className="muted small">older method, not comparable</span>}</td>
        </tr>)}</tbody>
      </table></div>
      <ul className="validation-notes">
        <li><b>Scope 2</b> matches to the cent once the same grid factor is used. Grid factors are editable in Settings and saved when a year is signed off.</li>
        <li><b>Diesel</b> differs because we use the IPCC 2006 CO₂-only factor and Masteel uses US EPA factors, which add CH₄ and N₂O. The FY2023 gap (+8%) isn’t explained by the report; our figure is the higher, conservative one. FY2022 used Masteel’s older method, so its diesel line isn’t compared.</li>
        <li><b>Natural gas</b> ({num(latest.gasT)} t in FY{latest.year}) sits inside Masteel’s “process” line, which also holds about {num(latest.carbonInputsT)} t of carbon inputs (electrodes, additives); in CarbonPath those go in <code>process_t</code>.</li>
        <li><b>Not yet covered:</b> fugitive refrigerant emissions (Masteel reports about 350–490 t a year) and CH₄/N₂O from combustion. Masteel publishes no production tonnage, so per-tonne figures can’t be checked.</li>
      </ul>
      <p className="muted small">Source: <a href={MASTEEL_SOURCE.url} target="_blank" rel="noreferrer">{MASTEEL_SOURCE.label}</a>. The same check runs as an automated test on every change (<code>src/model/validation.test.ts</code>).</p>
    </>}
  </section>
}
