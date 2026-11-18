import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { num } from '../format'
import Info from '../components/Info'
import InductionFurnace3D, { type CameraView, type FurnaceState } from '../components/InductionFurnace3D'
import { Legend, TrendChart } from '../components/MsCharts'
import { minutesOf, stamp, type HeatView } from '../model/meltshop'
import { shopAt, timeline, type FurnaceNow, type Phase, type ShopNow } from '../model/meltshopLive'
import type { Melt } from './MeltShop'

type Screen = 'furnace' | 'shop' | 'cooling' | 'trends' | 'events'
const screens: { id: Screen; key: string; label: string }[] = [
  { id: 'furnace', key: 'F1', label: 'Furnace' },
  { id: 'shop', key: 'F2', label: 'Melt shop' },
  { id: 'cooling', key: 'F3', label: 'Cooling & power' },
  { id: 'trends', key: 'F4', label: 'Trends' },
  { id: 'events', key: 'F5', label: 'Alarms & events' },
]
const phaseText: Record<Phase, string> = { charging: 'Charging', melting: 'Melting', holding: 'Holding', tapping: 'Tapping', idle: 'Idle' }
const hhmm = (m: number) => stamp(m).slice(11)
const dur = (m: number) => `${String(Math.floor(Math.max(0, m) / 60)).padStart(2, '0')}:${String(Math.round(Math.max(0, m) % 60)).padStart(2, '0')}`

/* ---------------- HMI building blocks ---------------- */

function Panel({ title, children, className = '', right }: { title: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return <section className={`hmi2-panel ${className}`}><header><span>{title}</span>{right}</header><div className="hmi2-body">{children}</div></section>
}
function Field({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: 'ok' | 'warn' | 'bad' | 'hot' }) {
  return <div className={`hmi2-field ${tone ?? ''}`}><span>{label}</span><b>{value}{unit && <small> {unit}</small>}</b></div>
}
function VBar({ label, value, max, unit, color = '#0ea5e9', digits = 1 }: { label: string; value: number | null; max: number; unit: string; color?: string; digits?: number }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value / max * 100))
  return <div className="hmi2-vbar">
    <span className="hmi2-vbar-label">{label}</span>
    <div className="hmi2-vbar-track"><i style={{ height: `${pct}%`, background: color }} />{[25, 50, 75].map((g) => <em key={g} style={{ bottom: `${g}%` }} />)}</div>
    <b>{value === null ? '—' : num(value, digits)}</b><small>{unit}</small>
  </div>
}
function Status({ ok, text }: { ok: boolean | null; text: string }) {
  return <span className={`hmi2-status ${ok === null ? 'idle' : ok ? 'ok' : 'bad'}`}>{text}</span>
}

/** Furnace cross-section icon for the shop overview, filled to the melt level. */
function FurnaceIcon({ f }: { f: FurnaceNow }) {
  const fill = f.heat ? (f.phase === 'charging' ? 0.15 : f.phase === 'tapping' ? 0.35 : Math.max(0.2, f.meltPct / 100)) : 0
  const hot = f.phase === 'melting' || f.phase === 'holding'
  const tilt = f.phase === 'tapping' ? -18 : 0
  return <svg viewBox="0 0 160 120" className="hmi2-ficon" aria-hidden="true">
    <rect x="10" y="108" width="140" height="6" rx="2" fill="#94a3b8" />
    <g transform={`rotate(${tilt} 118 30)`}>
      <rect x="38" y="22" width="84" height="84" rx="8" fill="#334155" />
      {Array.from({ length: 8 }, (_, i) => <rect key={i} x="34" y={30 + i * 9} width="92" height="5" rx="2" fill={f.kw > 1_000 ? '#f59e0b' : '#b87333'} opacity={f.kw > 1_000 ? 0.95 : 0.8} />)}
      <rect x="48" y="26" width="64" height="76" rx="6" fill="#e7dfcf" />
      <rect x="52" y={98 - 70 * fill} width="56" height={70 * fill} rx="4" fill={hot ? 'url(#hmiMelt)' : '#9a3412'} />
      <rect x="112" y="24" width="18" height="6" rx="2" fill="#9a8f7c" />
    </g>
    <defs><linearGradient id="hmiMelt" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fde68a" /><stop offset=".4" stopColor="#fb923c" /><stop offset="1" stopColor="#c2410c" /></linearGradient></defs>
  </svg>
}

/* ---------------- Screens ---------------- */

function FurnaceScreen({ melt, now, f, setF }: { melt: Melt; now: ShopNow; f: string; setF: (f: string) => void }) {
  const [view, setView] = useState<CameraView>('standard')
  const x = now.furnaces.find((y) => y.furnace === f)!
  const h = x.heat
  const yieldAvg = melt.heats.reduce((a, y) => a + y.tappedT, 0) / melt.heats.reduce((a, y) => a + y.chargeT, 0)
  const state: FurnaceState = { power: x.kw / x.ratedKw, bathC: x.bathC, phase: x.phase === 'charging' ? 'idle' : x.phase, fill: x.phase === 'charging' ? 0.2 : Math.max(0.25, x.meltPct / 100), alarm: !!x.alarm }
  const tl = h ? timeline(h) : null
  const tilt = x.phase === 'tapping' ? 31 : 0
  const lidOpen = x.phase === 'tapping' || x.phase === 'charging' || x.phase === 'idle'
  const loss = x.water?.lossKW ?? null
  return <div className="hmi2-grid">
    <div className="hmi2-col">
      <Panel title="Electrical data">
        <div className="hmi2-vbars">
          <VBar label="P" value={x.kw / 1_000} max={x.ratedKw / 1_000 * 1.1} unit="MW" color="#f97316" />
          <VBar label="f" value={x.hz} max={300} unit="Hz" color="#7c3aed" digits={0} />
          <VBar label="Load" value={x.kw / x.ratedKw * 100} max={100} unit="%" color="#10b981" digits={0} />
        </div>
        <Field label="Active energy (heat)" value={num(x.energyKwh / 1_000, 2)} unit="MWh" />
        <Field label="Specific energy" value={h ? num(x.energyKwh / h.tappedT) : '—'} unit="kWh/t" />
        <Field label="Rated power" value={num(x.ratedKw / 1_000, 1)} unit="MW" />
        <Field label="Power supply" value={<Status ok={x.kw > 1_000 ? true : null} text={x.kw > 1_000 ? 'POWER ON' : 'STANDBY'} />} />
      </Panel>
      <Panel title="Set points">
        <Field label="Target energy" value={h ? num(h.kwh / 1_000, 1) : '—'} unit="MWh" />
        <Field label="Tap temperature" value={num(melt.s.tapTargetC)} unit="°C" />
        <Field label="Max holding" value="15" unit="min" />
        <Field label="Grade" value={h?.grade ?? melt.s.grade} />
      </Panel>
      <Panel title="Missing energy" className="hmi2-missing">
        <div className={`hmi2-big ${x.missingKwh < 500 && h ? 'ok' : ''}`}>{num(x.missingKwh)} <small>kWh</small></div>
        <div className="hmi2-progress"><i style={{ width: `${x.meltPct}%` }} /></div>
        <small className="muted">{num(x.meltPct)}% of this heat’s energy in · {x.phase === 'holding' ? 'hot furnace' : x.phase === 'charging' ? 'cold charge' : x.phase}</small>
      </Panel>
    </div>

    <div className="hmi2-centre">
      <div className="hmi2-stage">
        <InductionFurnace3D state={state} label={f} view={view} />
        <div className="hmi2-chips">{now.furnaces.map((y) => <button key={y.furnace} type="button" className={y.furnace === f ? 'on' : ''} onClick={() => setF(y.furnace)}>{y.alarm && <i className="ms-alarm-dot" />}{y.furnace}</button>)}</div>
        {x.alarm && <div className="ms-stage-alarm">⚠ Coil cooling alarm</div>}
      </div>
      <div className="hmi2-views">{(['standard', 'top', 'front', 'back', 'side'] as CameraView[]).map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)} view</button>)}</div>
      <div className="hmi2-row3">
        <Panel title="Weights">
          <Field label="Total charge" value={h ? num(h.chargeT, 1) : '—'} unit="t" />
          <Field label="Liquid heel" value={h?.heelT !== undefined ? num(h.heelT, 1) : '—'} unit="t" />
          <Field label="Scheduled to tap" value={h ? num(h.chargeT * yieldAvg, 1) : '—'} unit="t" />
          <Field label="Tapped steel" value={h && x.phase === 'tapping' ? num(h.tappedT, 1) : '0.0'} unit="t" />
        </Panel>
        <Panel title="Ladle furnace (this heat)">
          <Field label="Electrodes" value={h?.lf?.electrodeKg !== undefined ? num(h.lf.electrodeKg) : '—'} unit="kg" />
          <Field label="Lime" value={h?.lf?.limeKg !== undefined ? num(h.lf.limeKg) : '—'} unit="kg" />
          <Field label="Alloys" value={h?.lf?.alloyKg !== undefined ? num(h.lf.alloyKg) : '—'} unit="kg" />
          <Field label="Ladle preheat" value={h?.lf?.preheatGJ !== undefined ? num(h.lf.preheatGJ, 1) : '—'} unit="GJ" />
        </Panel>
        <Panel title="Charge mix">
          {h?.charge ? Object.entries(h.charge).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => <Field key={k} label={{ hms: 'HMS', shredded: 'Shredded', turnings: 'Turnings', pigIron: 'Pig iron', returns: 'Returns', dri: 'DRI' }[k] ?? k} value={num(v!, 1)} unit="t" />) : <p className="muted small">No recipe logged.</p>}
        </Panel>
      </div>
    </div>

    <div className="hmi2-col">
      <Panel title="Coil cooling water" right={<Status ok={x.alarm ? false : x.water ? true : null} text={x.alarm ? 'ALARM' : x.water ? 'Operative' : 'No data'} />}>
        <Field label="Inlet" value={x.water ? num(x.water.inC, 1) : '—'} unit="°C" />
        <Field label="Outlet" value={x.water ? num(x.water.outC, 1) : '—'} unit="°C" tone={x.alarm ? 'bad' : undefined} />
        <Field label="ΔT" value={x.water ? num(x.water.outC - x.water.inC, 1) : '—'} unit="°C" tone={x.alarm ? 'bad' : undefined} />
        <Field label="Flow" value={x.water ? num(x.water.flow) : '—'} unit="m³/h" tone={x.alarm ? 'bad' : undefined} />
        <Field label="Heat to coil water" value={loss !== null ? num(loss / 1_000, 2) : '—'} unit={loss !== null && x.kw > 1_000 ? `MW · ${num(loss / x.kw * 100)}%` : 'MW'} />
      </Panel>
      <Panel title="Mechanical">
        <Field label="Hydraulic station" value={<Status ok={true} text="Running" />} />
        <Field label="Tilt angle" value={tilt} unit="°" tone={tilt ? 'hot' : undefined} />
        <Field label="Lid" value={<Status ok={lidOpen ? null : true} text={lidOpen ? 'OPEN' : 'CLOSED'} />} />
        <Field label="Lining" value={h?.liningHeat ?? '—'} unit="heats" />
      </Panel>
      <Panel title="Bath">
        <div className={`hmi2-big ${x.bathC && x.bathC > melt.s.tapTargetC + 15 ? 'bad' : ''}`}>{x.bathC !== null ? num(x.bathC) : '—'} <small>°C</small></div>
        <small className="muted">{x.measured ? 'Measured' : 'Estimated from the heat log'} · target {melt.s.tapTargetC} °C</small>
        {tl && <div className="hmi2-timeline">
          {[['Charge', h!.startMin, tl.powerOnStart], ['Melt', tl.powerOnStart, tl.powerOnEnd], ['Hold', tl.powerOnEnd, h!.tapMin]].map(([l, a, b]) => <span key={l as string} style={{ flexGrow: Math.max(1, (b as number) - (a as number)) }} className={now.t >= (a as number) && now.t < (b as number) ? 'on' : now.t >= (b as number) ? 'done' : ''}>{l as string}</span>)}
        </div>}
      </Panel>
    </div>
  </div>
}

function ShopScreen({ now }: { now: ShopNow }) {
  const band = (x: FurnaceNow) => x.alarm ? 'bad' : x.phase === 'melting' ? 'on' : x.phase === 'holding' ? 'hold' : x.phase === 'tapping' ? 'tap' : 'off'
  const row = (h: HeatView, plant: string) => { const tl = timeline(h); return <tr key={plant + h.heat}><td><b>{plant}</b></td><td>{h.heat}</td><td>{h.grade ?? '—'}</td><td>{hhmm(h.startMin)}</td><td>{hhmm(h.tapMin)}</td><td className="num">{h.tapTempC ?? '—'}</td><td className="num">{num(h.tappedT, 1)}</td><td className="num">{num(h.kwhPerT)}</td><td>{hhmm(tl.lfStart)}–{hhmm(tl.lfEnd)}</td></tr> }
  return <div className="hmi2-shop">
    <div className="hmi2-units">
      {now.furnaces.map((x) => <div key={x.furnace} className="hmi2-unit">
        <div className="hmi2-unit-head"><b>{x.furnace}</b><span className={`hmi2-band ${band(x)}`}>{x.alarm ? 'ALARM' : x.phase === 'melting' ? `ON ${num(x.energyKwh)} kWh` : phaseText[x.phase].toUpperCase()}</span></div>
        <FurnaceIcon f={x} />
        <div className="hmi2-unit-grid">
          <Field label="Heat" value={x.heat?.heat ?? '—'} /><Field label="Grade" value={x.heat?.grade ?? '—'} />
          <Field label="Phase time" value={dur(x.phaseMin)} /><Field label="Bath" value={x.bathC ?? '—'} unit="°C" />
          <Field label="Power" value={num(x.kw / 1_000, 1)} unit="MW" /><Field label="Melt" value={num(x.meltPct)} unit="%" />
        </div>
      </div>)}
      <div className="hmi2-unit">
        <div className="hmi2-unit-head"><b>LF</b><span className={`hmi2-band ${now.lf ? 'on' : 'off'}`}>{now.lf ? 'TREATING' : 'WAITING'}</span></div>
        <svg viewBox="0 0 160 120" className="hmi2-ficon" aria-hidden="true"><rect x="10" y="108" width="140" height="6" rx="2" fill="#94a3b8" /><rect x="60" y="8" width="8" height="40" fill="#64748b" /><rect x="76" y="4" width="8" height="44" fill="#64748b" /><rect x="92" y="8" width="8" height="40" fill="#64748b" /><path d="M42 44 L118 44 L112 104 L48 104 Z" fill="#334155" /><rect x="50" y={now.lf ? 56 : 92} width="60" height={now.lf ? 44 : 8} fill={now.lf ? 'url(#hmiMelt)' : '#64748b'} /><rect x="36" y="100" width="88" height="8" rx="2" fill="#0f766e" /></svg>
        <div className="hmi2-unit-grid">
          <Field label="Heat" value={now.lf?.heat.heat ?? '—'} /><Field label="Progress" value={now.lf ? num(now.lf.pct) : '—'} unit="%" />
          <Field label="Temp in" value={now.lf?.heat.lf?.tempInC ?? '—'} unit="°C" /><Field label="Aim" value={now.lf?.heat.lf?.tempOutC ?? '—'} unit="°C" />
        </div>
      </div>
      <div className="hmi2-unit">
        <div className="hmi2-unit-head"><b>CCM</b><span className={`hmi2-band ${now.caster ? 'on' : 'off'}`}>{now.caster ? 'CASTING' : 'WAITING'}</span></div>
        <svg viewBox="0 0 160 120" className="hmi2-ficon" aria-hidden="true"><rect x="10" y="108" width="140" height="6" rx="2" fill="#94a3b8" /><path d="M30 14 L78 14 L72 46 L36 46 Z" fill="#334155" /><rect x="38" y="22" width="32" height={now.caster ? 20 : 4} fill={now.caster ? 'url(#hmiMelt)' : '#64748b'} /><rect x="44" y="50" width="54" height="12" rx="2" fill="#475569" /><path d="M70 62 L70 90 Q 72 104 92 104 L150 104" stroke={now.caster ? '#f97316' : '#94a3b8'} strokeWidth="7" fill="none" /></svg>
        <div className="hmi2-unit-grid">
          <Field label="Heat" value={now.caster?.heat.heat ?? '—'} /><Field label="Progress" value={now.caster ? num(now.caster.pct) : '—'} unit="%" />
          <Field label="Steel" value={now.caster ? num(now.caster.heat.tappedT, 1) : '—'} unit="t" /><Field label="Ends" value={now.caster ? hhmm(now.caster.end) : '—'} />
        </div>
      </div>
    </div>
    <Panel title="Heats in production" right={<small>LF and caster times estimated from tap times <Info>The heat log gives tap times; the ladle furnace is assumed to start 10 min after tap and casting 10 min after the LF, at the shop’s average output.</Info></small>}>
      <table className="hmi2-table"><thead><tr><th>Plant</th><th>Heat</th><th>Grade</th><th>Start</th><th>Tap</th><th className="num">Tap °C</th><th className="num">Steel t</th><th className="num">kWh/t</th><th>LF</th></tr></thead>
        <tbody>{now.furnaces.filter((x) => x.heat).map((x) => row(x.heat!, x.furnace))}{now.lf && row(now.lf.heat, 'LF')}{now.caster && row(now.caster.heat, 'CCM')}</tbody></table>
    </Panel>
    <Panel title="Heats in transport">
      {now.transport.length ? <table className="hmi2-table"><thead><tr><th>Route</th><th>Heat</th><th>Grade</th><th>Since</th><th className="num">Steel t</th><th className="num">Tap °C</th></tr></thead>
        <tbody>{now.transport.map((x) => <tr key={x.heat.heat + x.route}><td><b>{x.route}</b></td><td>{x.heat.heat}</td><td>{x.heat.grade ?? '—'}</td><td>{hhmm(x.since)}</td><td className="num">{num(x.heat.tappedT, 1)}</td><td className="num">{x.heat.tapTempC ?? '—'}</td></tr>)}</tbody></table> : <p className="muted small">No ladles in transport.</p>}
    </Panel>
    <div className="hmi2-totals"><Field label="Σ Tapped today" value={num(now.tappedToday)} unit="t" /><Field label="Σ Liquid on floor" value={num(now.liquidOnFloorT)} unit="t" /><Field label="Furnaces on power" value={now.furnaces.filter((x) => x.kw > 1_000).length} unit={`of ${now.furnaces.length}`} /></div>
  </div>
}

function CoolingScreen({ now }: { now: ShopNow }) {
  return <Panel title="Power and coil cooling, all furnaces">
    <table className="hmi2-table"><thead><tr><th>Furnace</th><th>Phase</th><th className="num">Power MW</th><th className="num">Hz</th><th className="num">Water in °C</th><th className="num">Out °C</th><th className="num">ΔT °C</th><th className="num">Flow m³/h</th><th className="num">Coil heat MW</th><th className="num">% of power</th><th>Status</th></tr></thead>
      <tbody>{now.furnaces.map((x) => <tr key={x.furnace} className={x.alarm ? 'bad' : ''}><td><b>{x.furnace}</b></td><td>{phaseText[x.phase]}</td><td className="num">{num(x.kw / 1_000, 1)}</td><td className="num">{x.hz ?? '—'}</td>
        <td className="num">{x.water ? num(x.water.inC, 1) : '—'}</td><td className="num">{x.water ? num(x.water.outC, 1) : '—'}</td><td className="num">{x.water ? num(x.water.outC - x.water.inC, 1) : '—'}</td><td className="num">{x.water ? num(x.water.flow) : '—'}</td>
        <td className="num">{x.water?.lossKW ? num(x.water.lossKW / 1_000, 2) : '—'}</td><td className="num">{x.water?.lossKW && x.kw > 1_000 ? num(x.water.lossKW / x.kw * 100) : '—'}</td><td><Status ok={x.alarm ? false : x.water ? true : null} text={x.alarm ? 'ALARM' : x.water ? 'Operative' : 'No data'} /></td></tr>)}</tbody></table>
    <p className="ms-note">Coil heat = flow × 4.18 kJ/kg·K × ΔT. Measured studies put it at 26–29% of the electricity while melting (Missouri S&T / US DOE).</p>
  </Panel>
}

function TrendsScreen({ melt, f, t }: { melt: Melt; f: string; t: number }) {
  const rs = melt.data.readings.filter((r) => r.furnace === f && minutesOf(r.at) <= t && minutesOf(r.at) > t - 12 * 60).filter((_, i) => i % 5 === 0)
  if (rs.length < 3) return <Panel title="Trends"><p className="muted small">No readings around this time for {f}.</p></Panel>
  const x = rs.map((r) => r.at.slice(11, 16))
  return <div className="hmi2-trends">
    <Panel title={`${f} · power (last 12 h)`}><TrendChart x={x} series={[{ label: 'MW', values: rs.map((r) => r.kw / 1_000), color: '#f97316', area: true }]} height={180} /></Panel>
    <Panel title={`${f} · bath temperature`}><TrendChart x={x} series={[{ label: '°C', values: rs.map((r) => r.bathC ?? null), color: '#e11d48' }]} target={melt.s.tapTargetC} targetLabel="Tap target" unit="°C" height={180} /></Panel>
    <Panel title={`${f} · coil water`} right={<Legend items={[{ label: 'ΔT °C', color: '#f59e0b' }, { label: 'Flow ÷ 10', color: '#0ea5e9' }]} />}><TrendChart x={x} series={[{ label: 'ΔT', values: rs.map((r) => r.waterOutC !== undefined && r.waterInC !== undefined ? r.waterOutC - r.waterInC : null), color: '#f59e0b' }, { label: 'Flow/10', values: rs.map((r) => r.flowM3h !== undefined ? r.flowM3h / 10 : null), color: '#0ea5e9' }]} height={180} /></Panel>
    <Panel title={`${f} · frequency`}><TrendChart x={x} series={[{ label: 'Hz', values: rs.map((r) => r.hz ?? null), color: '#7c3aed' }]} height={180} /></Panel>
  </div>
}

function EventsScreen({ now }: { now: ShopNow }) {
  return <Panel title="Alarms and events (last 6 hours)">
    <table className="hmi2-table hmi2-events"><thead><tr><th>Time</th><th>Unit</th><th>Type</th><th>Message</th></tr></thead>
      <tbody>{now.events.slice(0, 40).map((e, i) => <tr key={i} className={e.kind === 'alarm' ? 'bad' : ''}><td>{stamp(e.at)}</td><td>{e.furnace ?? (e.kind === 'lf' ? 'LF' : e.kind === 'cast' ? 'CCM' : '—')}</td><td>{{ tap: 'Tap', 'power-on': 'Power on', lf: 'Ladle furnace', cast: 'Casting', alarm: 'ALARM' }[e.kind]}</td><td>{e.text}</td></tr>)}</tbody></table>
  </Panel>
}

/* ---------------- Control room ---------------- */

export default function MeltControl({ melt }: { melt: Melt }) {
  const rsTimes = melt.data.readings.length ? melt.data.readings.map((r) => minutesOf(r.at)) : null
  const lastTap = melt.heats[melt.heats.length - 1].tapMin
  const tMin = rsTimes ? Math.min(...rsTimes) : lastTap - 48 * 60, tMax = rsTimes ? Math.max(...rsTimes) : lastTap
  const [t, setT] = useState(tMax - 20)
  const [play, setPlay] = useState(false)
  const [screen, setScreen] = useState<Screen>('furnace')
  const [f, setF] = useState(melt.anomalies[0]?.furnace ?? melt.furnaces[0])
  const [acked, setAcked] = useState<Set<string>>(new Set())
  useEffect(() => { if (!play) return; const id = setInterval(() => setT((x) => x + 1 > tMax ? tMin : x + 1), 150); return () => clearInterval(id) }, [play, tMin, tMax])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const i = ['F1', 'F2', 'F3', 'F4', 'F5'].indexOf(e.key); if (i >= 0) { e.preventDefault(); setScreen(screens[i].id) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])
  const now = useMemo(() => shopAt(melt.heats, melt.data.readings, melt.anomalies, t), [melt.heats, melt.data.readings, melt.anomalies, t])
  const x = now.furnaces.find((y) => y.furnace === f)!
  const h = x.heat
  const tapsToday = melt.heats.filter((y) => y.furnace === f && y.tapMin <= t && y.tapMin >= Math.floor(t / 1_440) * 1_440).length
  const alarms = now.events.filter((e) => e.kind === 'alarm' && !acked.has(`${e.at}${e.text}`))

  return <div className="hmi2">
    <div className="hmi2-header">
      <Field label="Heat Nr." value={h?.heat ?? '—'} />
      <Field label="Steel" value={h?.grade ?? '—'} />
      <Field label="Heat time" value={dur(x.heatMin)} />
      <Field label="Power-on time" value={x.phase === 'melting' ? dur(x.phaseMin) : h && t > timeline(h).powerOnEnd ? dur(h.powerOnMin) : '00:00'} />
      <Field label="Heat phase" value={phaseText[x.phase]} tone={x.phase === 'melting' ? 'hot' : x.phase === 'tapping' ? 'warn' : undefined} />
      <Field label="Phase time" value={dur(x.phaseMin)} />
      <div className="hmi2-hero"><span>TAP</span><b>{tapsToday}</b></div>
      <div className="hmi2-hero"><span>Melting %</span><b>{num(x.meltPct)}</b></div>
      <div className="hmi2-hero"><span>Temp °C</span><b>{x.bathC ?? 0}</b></div>
      <div className="hmi2-hero"><span>Power %</span><b>{num(x.kw / x.ratedKw * 100)}</b></div>
      <div className={`hmi2-pcs ${x.alarm ? 'bad' : 'ok'}`}>{f} · {x.alarm ? 'ALARM' : 'PCS OK'}</div>
    </div>

    <div className="hmi2-screen">
      {screen === 'furnace' && <FurnaceScreen melt={melt} now={now} f={f} setF={setF} />}
      {screen === 'shop' && <ShopScreen now={now} />}
      {screen === 'cooling' && <CoolingScreen now={now} />}
      {screen === 'trends' && <TrendsScreen melt={melt} f={f} t={t} />}
      {screen === 'events' && <EventsScreen now={now} />}
    </div>

    <div className="hmi2-replay">
      <button type="button" className="btn small" onClick={() => setPlay(!play)}>{play ? '❚❚ Pause' : '▶ Replay'}</button>
      <input type="range" min={tMin} max={tMax} value={t} onChange={(e) => { setPlay(false); setT(Number(e.target.value)) }} aria-label="Replay time" />
      <span className="ms-time">{stamp(t)}</span>
      {!rsTimes && <small className="muted">No live readings: phases estimated from the heat log</small>}
    </div>

    <div className={`hmi2-alarmbar ${alarms.length ? 'on' : ''}`} role="status">
      <b>{alarms.length ? `${alarms.length} ALARM${alarms.length > 1 ? 'S' : ''}` : 'NO ACTIVE ALARMS'}</b>
      <span>{alarms[0] ? `${stamp(alarms[0].at)} · ${alarms[0].furnace} · ${alarms[0].text}` : `${now.furnaces.filter((y) => y.kw > 1_000).length} furnaces on power · ${num(now.tappedToday)} t tapped today`}</span>
      {alarms.length > 0 && <button type="button" onClick={() => setAcked(new Set([...acked, ...alarms.map((e) => `${e.at}${e.text}`)]))}>⚠ Ack</button>}
    </div>

    <nav className="hmi2-fkeys" aria-label="Screens">
      {screens.map((s) => <button key={s.id} type="button" className={screen === s.id ? 'on' : ''} onClick={() => setScreen(s.id)}><kbd>{s.key}</kbd>{s.label}</button>)}
    </nav>
  </div>
}

