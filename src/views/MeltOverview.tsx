import { num } from '../format'
import Info from '../components/Info'
import InductionFurnace3D, { type FurnaceState } from '../components/InductionFurnace3D'
import { Donut, HBars, Kpi, Legend, Ring, StackBars, TrendChart } from '../components/MsCharts'
import PlantArt from '../components/PlantArt'
import { coilLossKW, period, scrapTypes, type HeatView } from '../model/meltshop'
import { mean, quantile } from '../model/regress'
import type { Melt, Tab } from './MeltShop'

const COL = { s1: 'var(--series-s1)', s2: 'var(--series-s2)', green: '#10b981', sky: '#0ea5e9', violet: '#7c3aed', amber: '#f59e0b' }
const SCRAP_COL: Record<string, string> = { hms: '#0ea5e9', shredded: '#10b981', turnings: '#f59e0b', pigIron: '#7c3aed', returns: '#94a3b8', dri: '#ec4899' }
const tonnes = (hs: HeatView[]) => hs.reduce((a, h) => a + h.tappedT, 0)
const intensity = (hs: HeatView[]) => hs.reduce((a, h) => a + (h.scope1KgPerT + h.scope2KgPerT) * h.tappedT, 0) / Math.max(1e-9, tonnes(hs)) / 1_000
const kwhT = (hs: HeatView[]) => hs.reduce((a, h) => a + h.kwh, 0) / Math.max(1e-9, tonnes(hs))
const co2 = (hs: HeatView[]) => intensity(hs) * tonnes(hs)
const change = (now: number, before: number) => before ? (now - before) / before * 100 : 0
const arrow = (pct: number) => `${pct >= 0 ? '▲' : '▼'} ${num(Math.abs(pct), 1)}% vs previous half`

function byDay(hs: HeatView[]) {
  const m = new Map<string, HeatView[]>()
  for (const h of hs) { const d = h.at.slice(0, 10); m.set(d, [...(m.get(d) ?? []), h]) }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b))
}
const label = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export default function MeltOverview({ melt, go }: { melt: Melt; go: (t: Tab) => void }) {
  const hs = melt.heats
  const p = period(hs)
  // Compare the second half of the uploaded period with the first half.
  const mid = hs[0].startMin + (hs[hs.length - 1].tapMin - hs[0].startMin) / 2
  const first = hs.filter((h) => h.tapMin < mid), second = hs.filter((h) => h.tapMin >= mid)
  const days = byDay(hs)
  const daily = (f: (x: HeatView[]) => number) => days.map(([, x]) => f(x))
  const target = quantile(hs.map((h) => h.kwhPerT), 0.25)
  const s1 = hs.reduce((a, h) => a + h.scope1KgPerT * h.tappedT, 0) / 1_000, s2 = hs.reduce((a, h) => a + h.scope2KgPerT * h.tappedT, 0) / 1_000
  const iChange = change(intensity(second), intensity(first))
  const mix = scrapTypes.map((x) => ({ ...x, v: mean(hs.filter((h) => h.charge).map((h) => h.shares[x.id])) * 100 })).filter((x) => x.v > 0.5)
  // Weekly emissions bars.
  const weeks = new Map<number, HeatView[]>()
  for (const h of hs) { const w = Math.floor((h.tapMin - hs[0].startMin) / (7 * 1_440)); weeks.set(w, [...(weeks.get(w) ?? []), h]) }
  const wk = [...weeks.entries()].sort(([a], [b]) => a - b)

  // Live furnace: the furnace with an alarm, else IF1; its latest melting reading.
  const f = melt.anomalies[0]?.furnace ?? melt.furnaces[0]
  const rs = melt.data.readings.filter((r) => r.furnace === f)
  const maxKw = Math.max(1, ...rs.map((r) => r.kw))
  const r = [...rs].reverse().find((x) => x.kw > 0.6 * maxKw) ?? rs[rs.length - 1]
  const lastHeat = [...hs].reverse().find((h) => h.furnace === f)!
  const alarm = melt.anomalies.some((a) => a.furnace === f)
  const state: FurnaceState = { power: r ? r.kw / maxKw : 0, bathC: r?.bathC ?? lastHeat.tapTempC ?? null, phase: r && r.kw > 0.45 * maxKw ? 'melting' : 'holding', fill: 0.7, alarm }
  const loss = r ? coilLossKW(r) : null

  return <div className="ov">
    <div className="ms-kpis ov-kpis">
      <Kpi icon="🏭" label="Production output" value={num(p.tonnes / p.days)} unit="t/day" delta={arrow(change(tonnes(second) / Math.max(1, second.length), tonnes(first) / Math.max(1, first.length)))} spark={daily(tonnes)} color={COL.green} />
      <Kpi icon="🍃" label="Carbon intensity" value={num(intensity(hs), 3)} unit="tCO₂e/t" delta={arrow(iChange)} good={iChange <= 0} spark={daily(intensity)} color={COL.green} />
      <Kpi icon="⚡" label="Specific energy" value={num(kwhT(hs))} unit="kWh/t" delta={arrow(change(kwhT(second), kwhT(first)))} good={kwhT(second) <= kwhT(first)} spark={daily(kwhT)} color={COL.sky} />
      <Kpi icon="☁" label="Total emissions (S1+S2)" value={num(co2(hs))} unit="tCO₂e" delta={`${p.from.slice(0, 10)} to ${p.to.slice(0, 10)}`} spark={daily(co2)} color={COL.violet} />
    </div>

    <section className="ms-card ov-live">
      <div className="ms-stage-wrap">
        <InductionFurnace3D state={state} label={f} />
        <div className="ms-phase p-melting"><i />Live process · {f}</div>
      </div>
      <div className="ov-live-side">
        <h3>Induction furnace {f}</h3>
        <span className={`ov-status ${alarm ? 'alarm' : ''}`}><i />{alarm ? 'Coil cooling alarm' : 'Operating'}</span>
        <div className="ov-read"><span aria-hidden="true">🌡</span><small>Bath temperature</small><b>{state.bathC !== null ? `${num(state.bathC)} °C` : '—'}</b></div>
        <div className="ov-read"><span aria-hidden="true">⏱</span><small>Melting time (last heat)</small><b>{num(lastHeat.powerOnMin)} min</b></div>
        <div className="ov-read"><span aria-hidden="true">⚡</span><small>Power draw</small><b>{r ? `${num(r.kw / 1_000, 1)} MW` : '—'}</b></div>
        <div className="ov-read"><span aria-hidden="true">💧</span><small>Heat to coil water</small><b>{loss !== null ? `${num(loss / 1_000, 1)} MW` : '—'}</b></div>
        <div className="ov-read"><span aria-hidden="true">⚖</span><small>Charge → tapped</small><b>{num(lastHeat.chargeT, 1)} → {num(lastHeat.tappedT, 1)} t</b></div>
        <button type="button" className="link" onClick={() => go('twin')}>Open furnace twin →</button>
      </div>
    </section>

    <section className="ms-card ov-trend">
      <div className="ms-card-head"><h3>⚡ Energy performance trend</h3><Legend items={[{ label: 'kWh/t', color: COL.sky }, { label: `Target (≤ ${num(target)})`, color: COL.green, dashed: true }]} /></div>
      <TrendChart x={days.map(([d]) => label(d))} series={[{ label: 'kWh/t', values: daily(kwhT), color: COL.sky, area: true }]} target={target} targetLabel="Target" unit="kWh/t" width={400} height={250} />
    </section>

    <section className="ms-card ov-donut ms-center">
      <h3>🍃 Carbon footprint breakdown</h3>
      <Donut parts={[{ label: 'Scope 2', value: s2, color: COL.s2 }, { label: 'Scope 1', value: s1, color: COL.s1 }]} center={num(s1 + s2)} sub="tCO₂e" size={150} />
      <ul className="ms-balance-list">
        <li><i style={{ background: COL.s1 }} /><span>Scope 1</span><b>{num(s1 / (s1 + s2) * 100)}%</b><small>direct</small></li>
        <li><i style={{ background: COL.s2 }} /><span>Scope 2</span><b>{num(s2 / (s1 + s2) * 100)}%</b><small>electricity</small></li>
      </ul>
      <div className={`ov-delta ${iChange > 0 ? 'up' : ''}`}><b>{iChange <= 0 ? '▼' : '▲'} {num(Math.abs(iChange), 1)}%</b><small>intensity vs previous half</small></div>
    </section>

    <section className="ms-card ov-yield">
      <h3>⚗ Material yield & composition</h3>
      <Ring pct={tonnes(hs) / hs.reduce((a, h) => a + h.chargeT, 0) * 100} label="Metallic yield" size={140} />
      <div>
        <p className="ms-note" style={{ margin: '0 0 10px' }}>Charge composition</p>
        <HBars rows={mix.map((x) => ({ label: x.label, value: x.v, color: SCRAP_COL[x.id] }))} unit="%" digits={1} />
      </div>
    </section>

    <section className="ms-card ov-emis">
      <div className="ms-card-head"><h3>☁ Emissions trend</h3><Legend items={[{ label: 'Scope 1', color: COL.s1 }, { label: 'Scope 2', color: COL.s2 }]} /></div>
      <StackBars x={wk.map(([w, x]) => { const d = Math.ceil((Math.max(...x.map((h) => h.tapMin)) - (hs[0].startMin + w * 7 * 1_440)) / 1_440); return d < 7 ? `Wk ${w + 1} (${d} d)` : `Week ${w + 1}` })} stacks={[{ label: 'Scope 2', values: wk.map(([, x]) => x.reduce((a, h) => a + h.scope2KgPerT * h.tappedT, 0) / 1_000), color: COL.s2 }, { label: 'Scope 1', values: wk.map(([, x]) => x.reduce((a, h) => a + h.scope1KgPerT * h.tappedT, 0) / 1_000), color: COL.s1 }]} unit="tCO₂e" width={420} height={210} />
    </section>

    <section className="ms-card ov-sim">
      <PlantArt variant="plant" />
      <div className="ov-sim-body"><h3>✦ Decarbonisation simulator</h3><p>Explore practice, scrap mix, off-peak melting and clean power, and their effect on cost and CO₂.</p></div>
      <button type="button" className="btn" onClick={() => go('simulator')}>Run simulation →</button>
    </section>

    <section className={`ov-banner ${iChange > 0 ? 'warn' : ''}`}>
      <PlantArt variant="skyline" />
      <span className="ov-leaf" aria-hidden="true">🍃</span>
      <div>
        <b>{iChange <= 0 ? 'On track: carbon intensity is falling' : 'Carbon intensity is rising'}</b>
        <span>Your carbon intensity is {num(Math.abs(iChange), 1)}% {iChange <= 0 ? 'lower' : 'higher'} than in the first half of this period. <Info>Second half of the uploaded period ({num(second.length)} heats) against the first half ({num(first.length)} heats). Scope 1 + Scope 2, location-based.</Info></span>
      </div>
    </section>
  </div>
}

