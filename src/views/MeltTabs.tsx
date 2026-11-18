import { useEffect, useMemo, useState } from 'react'
import { num, ringgit } from '../format'
import Info from '../components/Info'
import InductionFurnace3D, { type FurnaceState } from '../components/InductionFurnace3D'
import { Donut, HBars, Kpi, Legend, Ring, StackBars, TrendChart } from '../components/MsCharts'
import {
  LIQUID_STEEL_KWH_T, checkChem, coilLossKW, gradeLimits, learnCopper, minutesOf, period, priors, scrapTypes,
  type ChemKey, type HeatView, type Reading,
} from '../model/meltshop'
import { mean, quantile } from '../model/regress'
import type { Melt } from './MeltShop'
import MeltSimulatorTab from './MeltSimulator'

export const MeltSimulator = MeltSimulatorTab

/* ---------------- shared bits ---------------- */

const COL = { s1: 'var(--series-s1)', s2: 'var(--series-s2)', sky: '#38bdf8', green: '#10b981', amber: '#f59e0b', red: '#f43f5e', violet: '#a78bfa' }
const day = (h: HeatView) => h.at.slice(0, 10)
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
function daily<T>(heats: HeatView[], f: (hs: HeatView[]) => T) {
  const m = new Map<string, HeatView[]>()
  for (const h of heats) m.set(day(h), [...(m.get(day(h)) ?? []), h])
  const days = [...m.keys()].sort()
  return { days, labels: days.map(dayLabel), values: days.map((d) => f(m.get(d)!)) }
}
const wavg = (hs: HeatView[], f: (h: HeatView) => number) => { const t = hs.reduce((a, h) => a + h.tappedT, 0); return t ? hs.reduce((a, h) => a + f(h) * h.tappedT, 0) / t : 0 }
const pct = (a: number, b: number) => `${a - b >= 0 ? '▲' : '▼'} ${num(Math.abs((a - b) / (b || 1) * 100), 1)}%`
const Badge = ({ kind }: { kind: string }) => <span className={`ms-badge b-${kind}`}>{{ learned: 'Learned', published: 'Published', measured: 'Measured', check: 'Check data', verified: 'Verified', rough: 'Rough', none: 'No source' }[kind] ?? kind}</span>

function FurnacePick({ melt, value, onChange, all = true }: { melt: Melt; value: string; onChange: (f: string) => void; all?: boolean }) {
  return <div className="ms-chips" role="radiogroup" aria-label="Furnace">
    {all && <button type="button" className={value === 'all' ? 'on' : ''} onClick={() => onChange('all')}>All furnaces</button>}
    {melt.furnaces.map((f) => { const alarm = melt.anomalies.some((a) => a.furnace === f); return <button key={f} type="button" className={value === f ? 'on' : ''} onClick={() => onChange(f)}>{alarm && <i className="ms-alarm-dot" aria-label="alarm" />}{f}</button> })}
  </div>
}
const pick = (melt: Melt, f: string) => f === 'all' ? melt.heats : melt.heats.filter((h) => h.furnace === f)

/* ---------------- 1 · Furnace twin ---------------- */

type Phase = FurnaceState['phase']
function phaseAt(r: Reading, maxKw: number, heats: HeatView[]): Phase {
  const t = minutesOf(r.at)
  if (r.kw > 0.45 * maxKw) return 'melting'
  const h = heats.find((x) => x.furnace === r.furnace && t >= x.tapMin - 3 && t <= x.tapMin + 6)
  if (h) return 'tapping'
  return r.bathC !== undefined ? 'holding' : 'idle'
}
const phaseText: Record<Phase, string> = { melting: 'Melting', holding: 'Holding', tapping: 'Tapping', idle: 'Idle / charging' }
const signalText = { waterDT: 'Coil water ΔT', flowM3h: 'Coil water flow' }

export function MeltTwin({ melt }: { melt: Melt }) {
  const withReadings = melt.furnaces.filter((f) => melt.data.readings.some((r) => r.furnace === f))
  const [f, setF] = useState(melt.anomalies[0]?.furnace ?? withReadings[0] ?? melt.furnaces[0])
  const rs = useMemo(() => melt.data.readings.filter((r) => r.furnace === f), [melt.data.readings, f])
  const [idx, setIdx] = useState(Math.max(0, rs.length - 1))
  const [play, setPlay] = useState(false)
  useEffect(() => { setIdx(Math.max(0, rs.length - 1)); setPlay(false) }, [rs])
  useEffect(() => {
    if (!play) return
    const id = setInterval(() => setIdx((i) => (i + 2 >= rs.length ? 0 : i + 2)), 120)
    return () => clearInterval(id)
  }, [play, rs.length])
  const maxKw = Math.max(1, ...rs.map((r) => r.kw))
  const r = rs[idx]
  const heats = melt.heats.filter((h) => h.furnace === f)
  const lastHeat = heats[heats.length - 1]
  const t = r ? minutesOf(r.at) : lastHeat?.tapMin ?? 0
  const heat = heats.find((h) => t >= h.startMin && t <= h.tapMin + 6) ?? lastHeat
  const phase: Phase = r ? phaseAt(r, maxKw, melt.heats) : 'holding'
  const onStart = heat ? heat.tapMin - (heat.holdMin ?? 0) - 8 - heat.powerOnMin : t
  const fill = phase === 'melting' && heat ? Math.min(1, Math.max(0.15, (t - onStart) / heat.powerOnMin)) : 1
  const alarms = melt.anomalies.filter((a) => a.furnace === f)
  const activeAlarm = r ? alarms.some((a) => Math.abs(minutesOf(a.at) - t) <= 45) : alarms.length > 0
  const loss = r ? coilLossKW(r) : null
  const state: FurnaceState = { power: r ? Math.min(1, r.kw / maxKw) : 0, bathC: r?.bathC ?? heat?.tapTempC ?? null, phase, fill, alarm: activeAlarm }
  // 10-minute series for the strip charts.
  const ten = rs.filter((_, i) => i % 10 === 0)
  const xs = ten.map((x) => x.at.slice(11, 16))
  const cursor = Math.round(idx / 10)
  const alarmBands = alarms.map((a) => { const k = ten.findIndex((x) => x.at >= a.at); return { from: Math.max(0, k - 1), to: Math.max(0, k) } }).filter((b) => b.to > 0)
  const energySoFar = phase === 'melting' && heat ? Math.round(rs.slice(Math.max(0, idx - (t - onStart)), idx + 1).reduce((a, x) => a + x.kw / 60, 0)) : heat?.kwh

  return <div className="ms-grid twin">
    <section className="ms-card ms-stage">
      <div className="ms-card-head"><h3>{f} · induction furnace</h3><FurnacePick melt={melt} value={f} onChange={setF} all={false} /></div>
      <div className="ms-stage-wrap">
        <InductionFurnace3D state={state} label={f} />
        <div className={`ms-phase p-${phase}`}><i />{phaseText[phase]}{heat && <small>Heat {heat.heat}</small>}</div>
        {activeAlarm && <div className="ms-stage-alarm">⚠ Coil cooling alarm</div>}
        <div className="ms-stage-hint">Drag to rotate · scroll to zoom</div>
      </div>
      {rs.length > 0 ? <div className="ms-replay">
        <button type="button" className="btn small" onClick={() => setPlay(!play)}>{play ? '❚❚ Pause' : '▶ Replay'}</button>
        <input type="range" min={0} max={rs.length - 1} value={idx} onChange={(e) => { setPlay(false); setIdx(Number(e.target.value)) }} aria-label="Replay time" />
        <span className="ms-time">{r?.at}</span>
      </div> : <p className="ms-note">No live readings for {f}: showing the last heat. Upload a readings file (kW, bath and coil water every 1–5 min) to replay the furnace.</p>}
    </section>

    <aside className="ms-side">
      <section className="ms-card">
        <h3>Live readings {melt.isDemo && <span className="ms-badge b-none">demo</span>}</h3>
        <div className="ms-readouts">
          <div><span>Power</span><b>{r ? num(r.kw / 1_000, 1) : '—'}<small> MW</small></b></div>
          <div><span>Frequency</span><b>{r?.hz ?? '—'}<small> Hz</small></b></div>
          <div><span>Bath</span><b>{state.bathC !== null ? num(state.bathC) : '—'}<small> °C</small></b></div>
          <div className={activeAlarm ? 'bad' : ''}><span>Coil water ΔT</span><b>{r?.waterOutC !== undefined && r.waterInC !== undefined ? num(r.waterOutC - r.waterInC, 1) : '—'}<small> °C</small></b></div>
          <div className={activeAlarm ? 'bad' : ''}><span>Water flow</span><b>{r?.flowM3h ?? '—'}<small> m³/h</small></b></div>
          <div><span>Heat to coil water <Info>Flow × 4.18 kJ/kg·K × ΔT. Measured studies put the cooling-water loss at 26–29% of the electricity (Missouri S&T / US DOE).</Info></span><b>{loss !== null ? num(loss / 1_000, 2) : '—'}<small> MW{loss !== null && r && r.kw > 1_000 ? ` · ${num(loss / r.kw * 100)}%` : ''}</small></b></div>
        </div>
      </section>
      {heat && <section className="ms-card">
        <h3>Heat {heat.heat}</h3>
        <dl className="ms-dl">
          <dt>Grade</dt><dd>{heat.grade ?? '—'}</dd>
          <dt>Charge</dt><dd>{num(heat.chargeT, 1)} t{heat.coldLining ? ' · cold lining' : ''}</dd>
          <dt>Energy</dt><dd>{energySoFar !== undefined ? `${num(energySoFar / 1_000, 1)} MWh` : '—'}</dd>
          <dt>kWh/t</dt><dd>{num(heat.kwhPerT)} <small className="muted">(physics min {LIQUID_STEEL_KWH_T})</small></dd>
          <dt>Tap</dt><dd>{heat.at.slice(11)} · {heat.tapTempC ?? '—'} °C</dd>
          <dt>Lining</dt><dd>heat {heat.liningHeat ?? '—'} of campaign</dd>
        </dl>
      </section>}
      <section className="ms-card">
        <h3>Alarms <Info>Each signal is compared with its own normal band (melting and idle separately) over the previous hour. An alarm needs 3 readings in a row outside the band by a minimum margin, so one noisy reading never alarms.</Info></h3>
        {alarms.length ? <ul className="ms-alarms">{alarms.slice(0, 5).map((a) => <li key={a.at + a.signal}>
          <b>{signalText[a.signal]} {a.kind === 'drop' ? 'dropped' : 'rose'} to {num(a.value, 1)}</b>
          <small>{a.at} · normal {num(a.normalLow, 1)}–{num(a.normalHigh, 1)}</small>
          <em>Check coil cooling pumps, filters and hoses. Low coil cooling risks coil damage and a water–steel contact.</em>
        </li>)}</ul> : <p className="ms-note">No alarms for {f}.</p>}
      </section>
    </aside>

    {ten.length > 2 && <section className="ms-card ms-span">
      <div className="ms-card-head"><h3>Last {Math.round(rs.length / 60)} hours · {f}</h3><Legend items={[{ label: 'Power (MW)', color: COL.sky }, { label: 'Coil water ΔT (°C)', color: COL.amber }, { label: 'Alarm', color: COL.red }]} /></div>
      <div className="ms-two">
        <TrendChart x={xs} series={[{ label: 'Power MW', values: ten.map((x) => x.kw / 1_000), color: COL.sky, area: true }]} bands={[...alarmBands, { from: Math.max(0, cursor - 0.5), to: cursor + 0.5 }]} height={170} onPick={(i) => { setPlay(false); setIdx(i * 10) }} />
        <TrendChart x={xs} series={[{ label: 'Coil water ΔT', values: ten.map((x) => x.waterOutC !== undefined && x.waterInC !== undefined ? x.waterOutC - x.waterInC : null), color: COL.amber }]} bands={alarmBands} height={170} onPick={(i) => { setPlay(false); setIdx(i * 10) }} />
      </div>
    </section>}
  </div>
}

/* ---------------- 2 · Energy & thermal ---------------- */

export function MeltEnergy({ melt }: { melt: Melt }) {
  const [f, setF] = useState('all')
  const hs = pick(melt, f)
  const avg = wavg(hs, (h) => h.kwhPerT)
  const best = quantile(hs.map((h) => h.kwhPerT), 0.25)
  const d = daily(hs, (x) => wavg(x, (h) => h.kwhPerT))
  const p = period(hs)
  const peakShare = hs.reduce((a, h) => a + h.kwh * h.peakShare, 0) / hs.reduce((a, h) => a + h.kwh, 0)
  // Energy balance per tonne: physics, measured or published cooling share, learned losses, remainder.
  const coolShare = (() => {
    const rs = melt.data.readings.filter((r) => (f === 'all' || r.furnace === f) && r.kw > 5_000)
    const l = rs.map((r) => { const c = coilLossKW(r); return c !== null ? c / r.kw : null }).filter((v): v is number => v !== null)
    return l.length > 30 ? { v: mean(l), basis: 'measured' } : { v: 0.27, basis: 'published' }
  })()
  const factor = (id: keyof typeof priors) => melt.model.factors.find((x) => x.id === id)!.coef
  const holdLoss = mean(hs.map((h) => h.holdMin ?? 0)) * factor('holdMin')
  const lidLoss = mean(hs.map((h) => h.lidOpenMin ?? 0)) * factor('lidOpenMin')
  const coldLoss = hs.filter((h) => h.coldLining).length / hs.length * factor('coldLining')
  const superheat = mean(hs.map((h) => Math.max(0, (h.tapTempC ?? melt.s.tapTargetC) - melt.s.tapTargetC))) * factor('tapTempC')
  const cooling = avg * coolShare.v
  const other = Math.max(0, avg - LIQUID_STEEL_KWH_T - cooling - holdLoss - lidLoss - coldLoss - superheat)
  const balance = [
    { label: 'Into the steel', v: LIQUID_STEEL_KWH_T, c: COL.green, basis: 'physics' },
    { label: 'Coil cooling water', v: cooling, c: COL.sky, basis: coolShare.basis },
    { label: 'Holding', v: holdLoss, c: COL.amber, basis: 'learned' },
    { label: 'Lid open', v: lidLoss, c: '#fb923c', basis: 'learned' },
    { label: 'Cold linings', v: coldLoss, c: COL.violet, basis: 'learned' },
    { label: 'Superheat', v: superheat, c: COL.red, basis: 'learned' },
    { label: 'Other (radiation, converter, lining)', v: other, c: '#475d7d', basis: 'remainder' },
  ]
  // Demand by hour of day (MW averaged over the period), with the TNB peak window.
  const byHour = Array.from({ length: 24 }, () => 0)
  for (const h of hs) for (let m = h.startMin; m < h.startMin + h.powerOnMin; m += 5) byHour[new Date(m * 60_000).getUTCHours()] += h.mw * 5 / 60
  const hourMW = byHour.map((v) => v / p.days)
  return <div className="ms-stack">
    <FurnacePick melt={melt} value={f} onChange={setF} />
    <div className="ms-kpis">
      <Kpi icon="⚡" label="Specific energy" value={num(avg)} unit="kWh/t" delta={`${pct(avg, best)} vs your best quarter`} good={avg <= best * 1.02} spark={d.values} color={COL.sky} />
      <Kpi icon="⏱" label="Power-on per heat" value={num(mean(hs.map((h) => h.powerOnMin)))} unit="min" spark={daily(hs, (x) => mean(x.map((h) => h.powerOnMin))).values} color={COL.violet} />
      <Kpi icon="⏸" label="Holding per heat" value={num(mean(hs.map((h) => h.holdMin ?? 0)))} unit="min" delta={`best quarter ${num(quantile(hs.map((h) => h.holdMin ?? 0), 0.25))} min`} spark={daily(hs, (x) => mean(x.map((h) => h.holdMin ?? 0))).values} color={COL.amber} />
      <Kpi icon="◷" label="Melting in TNB peak" value={num(peakShare * 100)} unit="%" delta="Mon–Fri 14:00–22:00" good={peakShare < 0.2} color={COL.red} />
      <Kpi icon="🏭" label="Output" value={num(p.tonnes / p.days)} unit="t/day" spark={daily(hs, (x) => x.reduce((a, h) => a + h.tappedT, 0)).values} color={COL.green} />
    </div>
    <div className="ms-grid e">
      <section className="ms-card">
        <div className="ms-card-head"><h3>Energy performance trend</h3><Legend items={[{ label: 'Specific energy (kWh/t)', color: COL.sky }, { label: 'Your best quarter', color: COL.green, dashed: true }]} /></div>
        <TrendChart x={d.labels} series={[{ label: 'kWh/t', values: d.values, color: COL.sky, area: true }]} target={best} targetLabel="Best quarter" unit="kWh/t" />
      </section>
      <section className="ms-card">
        <h3>Where each tonne’s electricity goes <Info>Liquid steel needs ~389 kWh/t (thermodynamics; Missouri S&T/DOE measured 386–397). Coil water from your readings, or 27% (DOE measured 26–29%). Holding, lid, cold-lining and superheat use your learned factors. The rest is radiation, converter and lining losses.</Info></h3>
        <div className="ms-balance">{balance.map((b) => <i key={b.label} style={{ flexGrow: Math.max(0.001, b.v), background: b.c }} title={`${b.label}: ${num(b.v)} kWh/t`} />)}</div>
        <ul className="ms-balance-list">{balance.map((b) => <li key={b.label}><i style={{ background: b.c }} /><span>{b.label}</span><b>{num(b.v)} kWh/t</b><small>{num(b.v / avg * 100)}% · {b.basis}</small></li>)}</ul>
      </section>
    </div>
    <div className="ms-grid e">
      <section className="ms-card">
        <div className="ms-card-head"><h3>Melting power by hour of day</h3><Legend items={[{ label: 'Average MW', color: COL.violet }, { label: 'TNB peak (weekdays)', color: COL.red }]} /></div>
        <TrendChart x={hourMW.map((_, i) => `${String(i).padStart(2, '0')}:00`)} series={[{ label: 'MW', values: hourMW, color: COL.violet, area: true }]} bands={[{ from: 14, to: 22, label: 'Peak' }]} height={190} />
        <p className="ms-note">Moving melting out of 14:00–22:00 on weekdays cuts the energy price {num((melt.s.peakSenPerKWh - melt.s.offPeakSenPerKWh), 2)} sen/kWh and the peak demand charge.</p>
      </section>
      <section className="ms-card">
        <h3>Money lost vs your own best heats <Info>Your average heat against your best quarter of heats. Ranges come from the 90% range of each learned factor. Lines can overlap: don’t add the ranges blindly.</Info></h3>
        <table className="ms-table">
          <tbody>{melt.losses.map((l) => <tr key={l.id}><td><b>{l.label}</b><small>{l.detail}</small></td><td className="num"><b>{ringgit(l.rmPerMonth)}</b><small>/month · {ringgit(l.low)}–{ringgit(l.high)}</small></td><td><Badge kind={l.basis} /></td></tr>)}</tbody>
        </table>
      </section>
    </div>
    <section className="ms-card">
      <h3>What drives your kWh/t <Info>Multiple regression on {melt.model.n} heats{melt.model.enough ? `, fit R² ${num(melt.model.r2, 2)}` : ''}. “Check data” means the result contradicts physics: look at that measurement before relying on it. Sources: docs/induction-furnace-model.md.</Info></h3>
      <table className="ms-table">
        <thead><tr><th>Driver</th><th className="num">Your furnace</th><th className="num">Published</th><th>Status</th><th>Source</th></tr></thead>
        <tbody>{melt.model.factors.map((x) => { const pr = priors[x.id]; return <tr key={x.id}>
          <td><b>{pr.label}</b><small>kWh/t per {pr.unit}</small></td>
          <td className="num"><b>{x.coef > 0 ? '+' : ''}{num(x.coef, 2)}</b><small>{x.used ? `${num(x.low, 2)} to ${num(x.high, 2)}` : '—'}</small></td>
          <td className="num">{num(pr.low, 2)} to {num(pr.high, 2)}</td>
          <td><Badge kind={x.status} /><small>{x.message}</small></td>
          <td><Badge kind={pr.confidence} /><small>{pr.note}</small></td>
        </tr> })}</tbody>
      </table>
    </section>
  </div>
}

/* ---------------- 3 · Charge chemistry & yield ---------------- */

const SCRAP_COL: Record<string, string> = { hms: '#38bdf8', shredded: '#10b981', turnings: '#f59e0b', pigIron: '#a78bfa', returns: '#94a3b8', dri: '#f472b6' }

export function MeltChemistry({ melt }: { melt: Melt }) {
  const [f, setF] = useState('all')
  const hs = pick(melt, f)
  const ids = new Set(hs.map((h) => h.heat))
  const chem = melt.data.chem.filter((c) => ids.has(c.heat))
  const checks = checkChem(chem, hs, melt.s.grade)
  const off = checks.filter((c) => c.fails.length)
  const yieldPct = wavg(hs, (h) => h.yieldPct)
  const shares = scrapTypes.map((x) => ({ ...x, v: mean(hs.filter((h) => h.charge).map((h) => h.shares[x.id])) * 100 })).filter((x) => x.v > 0.05)
  const cu = learnCopper(hs, chem)
  const lim = gradeLimits[melt.s.grade] ?? gradeLimits.B500B
  const elems = (Object.keys(lim) as (ChemKey | 'CEV')[])
  const val = (c: typeof chem[number], k: ChemKey | 'CEV') => k === 'CEV' ? checks.find((x) => x.heat === c.heat)?.cev : c[k]
  const yd = daily(hs, (x) => wavg(x, (h) => h.yieldPct))
  const loss = (100 - yieldPct) / 100 * p(hs)
  function p(x: HeatView[]) { return period(x).tPerMonth }
  return <div className="ms-stack">
    <FurnacePick melt={melt} value={f} onChange={setF} />
    <div className="ms-grid c3">
      <section className="ms-card ms-center">
        <h3>Metallic yield</h3>
        <Ring pct={yieldPct} label="tapped ÷ charged" />
        <p className="ms-note">{num(loss)} t of metal a month don’t reach the ladle (slag, oxidation, dirt).</p>
      </section>
      <section className="ms-card">
        <h3>Charge composition <Info>Average share of each scrap type in the furnace charge. Induction furnaces don’t refine: the scrap you charge sets the copper, tin, sulphur and phosphorus you tap.</Info></h3>
        <HBars rows={shares.map((x) => ({ label: x.label, value: x.v, color: SCRAP_COL[x.id], note: `RM ${num(melt.s.scrapRMPerT[x.id])}/t` }))} unit="%" digits={1} />
      </section>
      <section className="ms-card">
        <h3>Off-grade heats</h3>
        <div className="ms-big"><b className={off.length ? 'bad' : 'good'}>{off.length}</b><span>of {chem.length} analysed ({num(off.length / Math.max(1, chem.length) * 100, 1)}%)</span></div>
        <dl className="ms-dl">
          <dt>Average Cu</dt><dd>{num(mean(chem.map((c) => c.Cu ?? 0)), 3)}% <small className="muted">limit {lim.Cu}</small></dd>
          <dt>Average CEV</dt><dd>{num(mean(checks.map((c) => c.cev)), 3)} <small className="muted">limit {lim.CEV}</small></dd>
          <dt>Grade basis</dt><dd>{melt.s.grade} · BS 4449 cast <Info>BS 4449:2005 cast analysis maxima, the basis of MS 146. Taken from an unofficial copy: confirm against your purchased standard.</Info></dd>
        </dl>
      </section>
    </div>
    <div className="ms-grid e">
      <section className="ms-card">
        <h3>Chemistry against {melt.s.grade} limits <Info>Bar = your 95th-percentile heat; marker = the limit. Counts are heats over the limit.</Info></h3>
        <HBars rows={elems.map((k) => { const v = chem.map((c) => val(c, k)).filter((x): x is number => x !== undefined); const n = off.filter((c) => c.fails.some((x) => x.key === k)).length; return { label: k, value: quantile(v, 0.95), limit: lim[k], color: quantile(v, 0.95) > (lim[k] ?? 9) ? COL.red : quantile(v, 0.95) > (lim[k] ?? 9) * 0.9 ? COL.amber : COL.green, note: n ? `${n} over` : 'all within' } })} digits={3} />
      </section>
      <section className="ms-card">
        <h3>Copper each scrap type brings <Info>Learned from heats with both a charge recipe and a spectrometer result (least squares, each coefficient = that scrap’s own Cu). Copper can’t be removed in an induction furnace, only diluted with cleaner scrap or pig iron.</Info></h3>
        {cu ? <HBars rows={scrapTypes.filter((x) => cu[x.id] !== undefined).map((x) => ({ label: x.label, value: cu[x.id]!, color: SCRAP_COL[x.id] }))} unit="% Cu" digits={3} /> : <p className="ms-note">Needs 30+ heats with both a charge recipe and a spectrometer result.</p>}
      </section>
    </div>
    <div className="ms-grid e">
      <section className="ms-card">
        <h3>Yield trend</h3>
        <TrendChart x={yd.labels} series={[{ label: 'Yield %', values: yd.values, color: COL.green, area: true }]} target={quantile(hs.map((h) => h.yieldPct), 0.75)} targetLabel="Best quarter" unit="%" height={190} />
      </section>
      <section className="ms-card">
        <h3>Latest off-grade heats</h3>
        {off.length ? <table className="ms-table"><thead><tr><th>Heat</th><th>Grade</th><th>Over the limit</th></tr></thead><tbody>
          {off.slice(-8).reverse().map((c) => <tr key={c.heat}><td><b>{c.heat}</b><small>{hs.find((h) => h.heat === c.heat)?.furnace}</small></td><td>{c.grade}</td><td>{c.fails.map((x) => `${x.key} ${num(x.value, 3)} > ${x.limit}`).join(' · ')}</td></tr>)}
        </tbody></table> : <p className="ms-note">No heats over the limits.</p>}
      </section>
    </div>
  </div>
}

/* ---------------- 4 · Carbon & process emissions ---------------- */

export function MeltCarbon({ melt }: { melt: Melt }) {
  const [f, setF] = useState('all')
  const hs = pick(melt, f)
  const t = hs.reduce((a, h) => a + h.tappedT, 0)
  const per = (g: (h: HeatView) => number) => hs.reduce((a, h) => a + g(h), 0) / t
  const g = melt.grid
  const parts = [
    { label: 'Induction furnace electricity', value: per((h) => h.kwh * g), color: COL.s2, scope: 2 },
    { label: 'Ladle furnace electricity', value: per((h) => (h.lf?.kwh ?? 0) * g), color: '#7cb6f5', scope: 2 },
    { label: 'LF electrodes', value: per((h) => (h.lf?.electrodeKg ?? 0) * melt.s.electrodeCarbon * 44 / 12), color: COL.s1, scope: 1 },
    { label: 'Carbon in alloys', value: per((h) => (h.lf?.alloyCarbonKg ?? 0) * 44 / 12), color: '#f59e0b', scope: 1 },
    { label: 'Ladle preheating gas', value: per((h) => (h.lf?.preheatGJ ?? 0) * 56.1), color: '#fb923c', scope: 1 },
  ]
  const s1 = parts.filter((x) => x.scope === 1).reduce((a, x) => a + x.value, 0), s2 = parts.filter((x) => x.scope === 2).reduce((a, x) => a + x.value, 0)
  const total = s1 + s2
  const pd = period(hs)
  const d = daily(hs, (x) => ({ s1: x.reduce((a, h) => a + h.scope1KgPerT * h.tappedT, 0) / 1_000, s2: x.reduce((a, h) => a + h.scope2KgPerT * h.tappedT, 0) / 1_000 }))
  const intensity = daily(hs, (x) => wavg(x, (h) => (h.scope1KgPerT + h.scope2KgPerT) / 1_000))
  return <div className="ms-stack">
    <FurnacePick melt={melt} value={f} onChange={setF} />
    <div className="ms-kpis">
      <Kpi icon="🍃" label="Carbon intensity (S1+S2)" value={num(total / 1_000, 3)} unit="tCO₂e/t" spark={intensity.values} color={COL.green} info={<Info>Masteel publishes 0.456–0.489 tCO₂e/t for its whole steelmaking plant (FY2024–25), which includes auxiliaries; this melt-shop figure covers the induction and ladle furnaces only.</Info>} />
      <Kpi icon="☁" label="Total emissions" value={num(total * t / 1_000_000 / pd.days * 30.4, 1)} unit="ktCO₂e/month" spark={d.values.map((v) => v.s1 + v.s2)} color={COL.violet} />
      <Kpi icon="⚡" label="Scope 2 (electricity)" value={num(s2 / total * 100)} unit="%" delta={`${num(s2)} kg/t · grid ${g} kg/kWh`} color={COL.sky} />
      <Kpi icon="🔥" label="Scope 1 (direct)" value={num(s1 / total * 100)} unit="%" delta={`${num(s1)} kg/t`} color={COL.amber} />
    </div>
    <div className="ms-grid c-carbon">
      <section className="ms-card ms-center">
        <h3>Carbon footprint breakdown</h3>
        <Donut parts={[{ label: 'Scope 2', value: s2, color: COL.s2 }, { label: 'Scope 1', value: s1, color: COL.s1 }]} center={num(total)} sub="kg CO₂e per tonne" />
        <ul className="ms-balance-list">{parts.map((x) => <li key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b>{num(x.value, 1)} kg/t</b><small>Scope {x.scope}</small></li>)}</ul>
      </section>
      <section className="ms-card">
        <div className="ms-card-head"><h3>Emissions by day</h3><Legend items={[{ label: 'Scope 1', color: COL.s1 }, { label: 'Scope 2', color: COL.s2 }]} /></div>
        <StackBars x={d.labels} stacks={[{ label: 'Scope 2', values: d.values.map((v) => v.s2), color: COL.s2 }, { label: 'Scope 1', values: d.values.map((v) => v.s1), color: COL.s1 }]} unit="tCO₂e" height={240} />
        <p className="ms-note">Scope 2 = electricity × Malaysian grid factor (Energy Commission). Scope 1 by carbon mass balance (C × 44/12; CBAM Implementing Regulation (EU) 2023/1773) plus ladle-preheat gas at 56.1 kg/GJ (IPCC).</p>
      </section>
    </div>
    <div className="ms-grid e">
      <section className="ms-card">
        <h3>Intensity by furnace</h3>
        <HBars rows={melt.furnaces.map((x) => { const fh = melt.heats.filter((h) => h.furnace === x); return { label: x, value: wavg(fh, (h) => h.scope1KgPerT + h.scope2KgPerT), color: COL.green } })} unit="kg/t" />
      </section>
      <section className="ms-card">
        <h3>What moves the number</h3>
        <ul className="ms-levers">
          <li><b>Electricity is {num(s2 / total * 100)}% of it.</b> Every 10 kWh/t saved in the furnace cuts {num(10 * g, 1)} kg CO₂/t.</li>
          <li><b>Green electricity</b> (TNB Green Electricity Tariff or a solar PPA) cuts market-based Scope 2 directly.</li>
          <li><b>Electrodes and alloy carbon</b> are most of Scope 1: track LF electrode kg/t and buy low-carbon ferroalloys where grade allows.</li>
          <li>Try these in the <b>Decarbonisation simulator</b> tab.</li>
        </ul>
      </section>
    </div>
  </div>
}

