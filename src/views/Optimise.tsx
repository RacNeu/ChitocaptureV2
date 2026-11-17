import { useEffect, useMemo, useState } from 'react'
import { num, ringgit } from '../format'
import { gridFactor } from '../model/factors'
import {
  HEAT_TEMPLATE, MIN_HEATS, boundsFor, defaultEaf, derive, importHeatRows, learn, losses, mean, optimise, outcome, published, quantile,
  type EafSettings, type FactorId, type HeatDerived, type HeatImport, type Setpoints,
} from '../model/heats'
import { actions, useFactory } from '../model/store'
import Info from '../components/Info'

type Tab = 'heat' | 'losses' | 'factors' | 'optimise' | 'data'
const tabs: { id: Tab; key: string; label: string }[] = [
  { id: 'heat', key: 'F1', label: 'Heat view' },
  { id: 'losses', key: 'F2', label: 'Losses' },
  { id: 'factors', key: 'F3', label: 'Learned factors' },
  { id: 'optimise', key: 'F4', label: 'Optimiser' },
  { id: 'data', key: 'F5', label: 'Data & settings' },
]
const DRIVERS: FactorId[] = ['o2PerT', 'ngPerT', 'carbonPerT', 'powerOffMin', 'tapTempC']

async function readFile(file: File): Promise<HeatImport> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    const rows = await readXlsxFile(file)
    return importHeatRows(rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 16).replace('T', ' ') : cell === null ? '' : String(cell))))
  }
  const text = (await file.text()).replace(/^﻿/, '')
  const first = text.split(/\r?\n/)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
  return importHeatRows(text.split(/\r?\n/).map((line) => line.split(sep)))
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

const fmtTime = (iso: string) => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/* ---------------- Small HMI pieces ---------------- */

/** A tile in the header strip; red when worse than the plant's own best quarter by a margin. */
function Tile({ label, value, unit, state }: { label: string; value: string; unit?: string; state?: 'good' | 'warn' | 'bad' }) {
  return <div className={`hmi-tile ${state ?? ''}`}><span>{label}</span><b>{value}{unit && <small> {unit}</small>}</b></div>
}

/**
 * One reading against this furnace's own spread: grey bar = 5th–95th percentile of all heats,
 * green tick = best quarter, the marker = this heat.
 */
function Gauge({ label, value, unit, all, better, digits = 0 }: { label: string; value: number | null | undefined; unit: string; all: number[]; better: 'low' | 'high'; digits?: number }) {
  if (value === null || value === undefined || !all.length) return <div className="hmi-gauge off"><span className="g-label">{label}</span><span className="g-val">—</span></div>
  const lo = quantile(all, 0.02), hi = quantile(all, 0.98), span = hi - lo || 1
  const p5 = quantile(all, 0.05), p95 = quantile(all, 0.95), best = quantile(all, better === 'low' ? 0.25 : 0.75)
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v - lo) / span * 100))}%`
  const worse = better === 'low' ? value > quantile(all, 0.75) : value < quantile(all, 0.25)
  const good = better === 'low' ? value <= best : value >= best
  return <div className={`hmi-gauge ${worse ? 'bad' : good ? 'good' : ''}`}>
    <span className="g-label">{label}</span>
    <span className="g-val">{num(value, digits)} <small>{unit}</small></span>
    <span className="g-bar" title={`Your heats: ${num(p5, digits)}–${num(p95, digits)} ${unit} · best quarter ${better === 'low' ? '≤' : '≥'} ${num(best, digits)}`}>
      <i className="g-range" style={{ left: pos(p5), width: `calc(${pos(p95)} - ${pos(p5)})` }} />
      <i className="g-best" style={{ left: pos(best) }} />
      <i className="g-mark" style={{ left: pos(value) }} />
    </span>
  </div>
}

function Badge({ kind }: { kind: 'learned' | 'published' | 'measured' | 'assumption' | 'check' | 'verified' | 'rough' | 'none' }) {
  const text = { learned: 'Learned', published: 'Published', measured: 'Measured', assumption: 'Assumption', check: 'Check data', verified: 'Verified', rough: 'Rough', none: 'No source' }[kind]
  return <span className={`hmi-badge b-${kind}`}>{text}</span>
}

/** Furnace cutaway drawn from this heat's numbers: arc glow ∝ MW, lance ∝ O₂/t, burner flames ∝ NG/t. */
function Furnace({ h, maxMw }: { h: HeatDerived; maxMw: number }) {
  const arc = Math.min(1, h.mw / (maxMw || 1))
  const lance = Math.min(1, h.o2PerT / 45)
  const flame = Math.min(1, h.ngPerT / 10)
  const fill = Math.min(1, (h.tappedT + (h.heelT ?? 0)) / Math.max(h.chargeT * 1.1, 1))
  const bathY = 232 - fill * 55
  return <svg className="hmi-furnace" viewBox="0 0 420 300" role="img" aria-label={`Furnace: ${num(h.mw, 1)} MW, ${num(h.o2PerT, 1)} Nm³/t oxygen`}>
    <defs>
      <radialGradient id="arcGlow"><stop offset="0" stopColor="#fff7c2" /><stop offset=".35" stopColor="#fbbf24" /><stop offset="1" stopColor="#f97316" stopOpacity="0" /></radialGradient>
      <linearGradient id="bath" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#fb923c" /><stop offset="1" stopColor="#b91c1c" /></linearGradient>
      <linearGradient id="shell" x1="0" x2="1"><stop offset="0" stopColor="#334155" /><stop offset=".5" stopColor="#475569" /><stop offset="1" stopColor="#1e293b" /></linearGradient>
    </defs>
    {/* off-gas duct */}
    <path d="M300 70 L300 30 L400 30" fill="none" stroke="#475569" strokeWidth="16" />
    <text x="356" y="20" className="hmi-svg-label">Off-gas</text>
    {/* roof + electrodes */}
    <path d="M90 92 Q210 50 330 92 Z" fill="url(#shell)" stroke="#64748b" />
    {/* shell with cooling panels */}
    <path d="M90 92 L100 240 Q210 275 320 240 L330 92" fill="#0f172a" stroke="#64748b" strokeWidth="3" />
    {Array.from({ length: 6 }, (_, i) => <line key={i} x1={96 + i * 1.2} y1={104 + i * 22} x2={324 - i * 1.2} y2={104 + i * 22} stroke="#1d4ed8" strokeOpacity=".35" strokeDasharray="6 5" />)}
    {/* slag + bath */}
    <path d={`M${101 + (232 - bathY) * 0.06} ${bathY - 10} L${319 - (232 - bathY) * 0.06} ${bathY - 10} L320 ${bathY} L100 ${bathY} Z`} fill="#a16207" opacity=".7" />
    <path d={`M100 ${bathY} L320 ${bathY} L318 240 Q210 272 102 240 Z`} fill="url(#bath)" />
    {/* electrodes and arcs, over the bath */}
    {[170, 210, 250].map((x, i) => <g key={x}>
      <rect x={x - 7} y={14} width={14} height={bathY - 30 + (i === 1 ? 4 : 0)} rx={2} fill="#94a3b8" stroke="#cbd5e1" />
      <circle cx={x} cy={bathY - 12} r={10 + arc * 22} fill="url(#arcGlow)" opacity={0.35 + arc * 0.65}><animate attributeName="opacity" values={`${0.3 + arc * 0.6};${0.5 + arc * 0.5};${0.3 + arc * 0.6}`} dur={`${0.25 + i * 0.07}s`} repeatCount="indefinite" /></circle>
    </g>)}
    {/* oxygen lance */}
    <line x1="20" y1="120" x2={60 + lance * 70} y2={150 + lance * 40} stroke="#38bdf8" strokeWidth={3 + lance * 7} strokeLinecap="round" opacity=".9" />
    <text x="8" y="108" className="hmi-svg-label">O₂ {num(h.o2PerT, 1)} Nm³/t</text>
    {/* burners */}
    {[[98, 128], [322, 128]].map(([x, y], i) => <g key={i}>
      <ellipse cx={x + (i ? -1 : 1) * (14 + flame * 14)} cy={y + 8} rx={8 + flame * 16} ry={4 + flame * 5} fill="#f59e0b" opacity={0.25 + flame * 0.6} />
    </g>)}
    <text x="332" y="122" className="hmi-svg-label">NG {num(h.ngPerT, 1)} Nm³/t</text>
    {/* carbon injection */}
    {Array.from({ length: Math.round(Math.min(10, h.carbonPerT / 3)) }, (_, i) => <circle key={i} cx={360 - i * 9} cy={210 - i * 2} r="2.5" fill="#e2e8f0" />)}
    <text x="330" y="232" className="hmi-svg-label">C {num(h.carbonPerT, 1)} kg/t</text>
    <text x="150" y="292" className="hmi-svg-label">{num(h.mw, 1)} MW · {h.tapTempC ? `${num(h.tapTempC)} °C` : 'no tap temp'}</text>
  </svg>
}

/** Trend across heats; click a dot to open that heat. */
function Trend({ heats, metric, sel, onPick, better }: { heats: HeatDerived[]; metric: (h: HeatDerived) => number | null | undefined; sel: number; onPick: (i: number) => void; better: 'low' | 'high' }) {
  const W = 640, H = 170, P = 30
  const pts = heats.map((h, i) => ({ i, v: metric(h) })).filter((p): p is { i: number; v: number } => p.v !== null && p.v !== undefined && Number.isFinite(p.v))
  if (pts.length < 2) return <p className="hmi-note">Not logged for these heats.</p>
  const vals = pts.map((p) => p.v)
  const lo = quantile(vals, 0.01), hi = quantile(vals, 0.99), span = hi - lo || 1
  const x = (i: number) => P + i / Math.max(1, heats.length - 1) * (W - P - 8)
  const y = (v: number) => H - 18 - Math.min(1, Math.max(0, (v - lo) / span)) * (H - 34)
  const best = quantile(vals, better === 'low' ? 0.25 : 0.75), med = quantile(vals, 0.5)
  // Rolling mean of 10 heats so the drift is visible.
  const roll = pts.map((p, k) => { const w = pts.slice(Math.max(0, k - 9), k + 1); return `${x(p.i)},${y(mean(w.map((q) => q.v)))}` }).join(' ')
  return <svg className="hmi-trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend across heats">
    <line x1={P} x2={W - 8} y1={y(best)} y2={y(best)} className="t-best" />
    <text x={W - 10} y={y(best) - 4} textAnchor="end" className="hmi-svg-label green">best quarter {num(best, 1)}</text>
    <line x1={P} x2={W - 8} y1={y(med)} y2={y(med)} className="t-med" />
    <text x={P + 2} y={12} className="hmi-svg-label">{num(hi, 0)}</text>
    <text x={P + 2} y={H - 4} className="hmi-svg-label">{num(lo, 0)}</text>
    {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === sel ? 5 : 2.2} className={p.i === sel ? 't-sel' : (better === 'low' ? p.v <= best : p.v >= best) ? 't-good' : 't-dot'} onClick={() => onPick(p.i)}><title>{heats[p.i].heat}: {num(p.v, 1)}</title></circle>)}
    <polyline points={roll} className="t-roll" />
  </svg>
}

/* ---------------- Page ---------------- */

export default function Optimise() {
  const state = useFactory()
  const s: EafSettings = { ...defaultEaf, ...state.settings.eaf }
  const assumed = (k: keyof EafSettings) => state.settings.eaf?.[k] === undefined
  const grid = gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh)
  const elec = state.settings.tariff?.energyRMPerMWh ?? state.settings.electricityPriceRMPerMWh
  const ngPrice = state.settings.fuelPriceRMPerGJ['natural-gas']
  const [tab, setTab] = useState<Tab>('heat')
  const [msg, setMsg] = useState<HeatImport | null>(null)
  const [busy, setBusy] = useState(false)

  const heats = useMemo(() => (state.heats ?? []).map((h) => derive(h, s, grid)), [state.heats, JSON.stringify(s), grid]) // eslint-disable-line react-hooks/exhaustive-deps
  const model = useMemo(() => learn(heats), [heats])
  const lossList = useMemo(() => losses(heats, model, s, elec, grid), [heats, model, elec, grid]) // eslint-disable-line react-hooks/exhaustive-deps
  const bounds = useMemo(() => boundsFor(heats, s), [heats, s.tapTargetC]) // eslint-disable-line react-hooks/exhaustive-deps
  const [sel, setSel] = useState(Math.max(0, heats.length - 1))
  useEffect(() => { setSel(Math.max(0, heats.length - 1)) }, [heats.length])

  // HMI function keys F1–F5 switch tabs while this page is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const i = ['F1', 'F2', 'F3', 'F4', 'F5'].indexOf(e.key); if (i >= 0 && heats.length) { e.preventDefault(); setTab(tabs[i].id) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [heats.length])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const r = await readFile(file)
      setMsg(r)
      if (!r.error) { actions.setHeats(r.heats, file.name); setTab('heat') }
    } catch (err) { setMsg({ heats: [], warnings: [], error: `Could not read the file: ${(err as Error).message}` }) }
    setBusy(false)
  }
  const uploader = <label className="btn primary hmi-upload">{busy ? 'Reading…' : '⬆ Upload heat log'}<input type="file" accept=".csv,.txt,.xlsx,.xlsm" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} /></label>
  const templateBtn = <button type="button" className="btn" onClick={() => download('eaf-heats-template.csv', HEAT_TEMPLATE)}>Template</button>

  if (!heats.length) return <div className="hmi">
    <div className="hmi-head"><h1>🔥 EAF Optimise</h1><span className="hmi-sub">Per-heat energy, carbon and yield</span></div>
    <section className="hmi-empty">
      <h2>Upload your heat log</h2>
      <p>One row per heat, exported from the furnace HMI or level-2 system. Needs at least: heat, kWh, tapped t, charge t, power-on and tap-to-tap minutes. Add O₂, gas, carbon, electrodes and tap temperature for the full model.</p>
      <p className="hmi-note">Nothing is shown until real heats are uploaded. With {MIN_HEATS}+ heats the app learns your furnace’s own factors.</p>
      <div className="row-actions center">{uploader}{templateBtn}</div>
      {msg && <ImportMsg msg={msg} />}
    </section>
  </div>

  const h = heats[Math.min(sel, heats.length - 1)]
  const col = (f: (x: HeatDerived) => number | null | undefined) => heats.map(f).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v))
  const all = {
    kwhPerT: col((x) => x.kwhPerT), powerOn: col((x) => x.powerOnMin), off: col((x) => x.powerOffMin), ttt: col((x) => x.tapToTapMin), mw: col((x) => x.mw),
    o2: col((x) => x.o2PerT), ng: col((x) => x.ngPerT), c: col((x) => x.carbonPerT), el: col((x) => x.electrodePerT), lime: col((x) => x.limeKg !== undefined ? x.limeKg / x.tappedT : null),
    yield: col((x) => x.yieldPct), temp: col((x) => x.tapTempC), co2: col((x) => x.scope1KgPerT + x.scope2KgPerT), cos: col((x) => x.avgCosPhi), tph: col((x) => x.tph),
  }
  const state3 = (v: number | null | undefined, vals: number[], better: 'low' | 'high'): 'good' | 'warn' | 'bad' | undefined => {
    if (v === null || v === undefined || !vals.length) return undefined
    const q1 = quantile(vals, 0.25), q3 = quantile(vals, 0.75)
    if (better === 'low') return v <= q1 ? 'good' : v > q3 ? 'bad' : 'warn'
    return v >= q3 ? 'good' : v < q1 ? 'bad' : 'warn'
  }
  // Alarms for this heat: anything in your worst quarter, worded as a fact.
  const alarms: string[] = []
  if (state3(h.powerOffMin, all.off, 'low') === 'bad') alarms.push(`Power-off ${num(h.powerOffMin)} min (best quarter ≤ ${num(quantile(all.off, 0.25))})`)
  if (h.tapTempC !== undefined && h.tapTempC > s.tapTargetC + 15) alarms.push(`Tapped ${num(h.tapTempC - s.tapTargetC)} °C over target`)
  if (state3(h.kwhPerT, all.kwhPerT, 'low') === 'bad') alarms.push(`${num(h.kwhPerT)} kWh/t (best quarter ≤ ${num(quantile(all.kwhPerT, 0.25))})`)
  if (state3(h.yieldPct, all.yield, 'high') === 'bad') alarms.push(`Yield ${num(h.yieldPct, 1)}% (best quarter ≥ ${num(quantile(all.yield, 0.75), 1)}%)`)
  if (h.electrodePerT !== null && state3(h.electrodePerT, all.el, 'low') === 'bad') alarms.push(`Electrodes ${num(h.electrodePerT, 2)} kg/t`)
  if (h.avgCosPhi !== undefined && h.avgCosPhi < 0.8) alarms.push(`Power factor ${num(h.avgCosPhi, 2)}`)

  return <div className="hmi">
    <div className="hmi-head">
      <h1>🔥 EAF Optimise</h1>
      <div className="hmi-heatnav">
        <button type="button" onClick={() => setSel(Math.max(0, sel - 1))} disabled={sel <= 0} aria-label="Previous heat">◀</button>
        <select value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Heat">
          {heats.map((x, i) => <option key={x.heat + i} value={i}>Heat {x.heat}{x.grade ? ` · ${x.grade}` : ''}</option>).reverse()}
        </select>
        <button type="button" onClick={() => setSel(Math.min(heats.length - 1, sel + 1))} disabled={sel >= heats.length - 1} aria-label="Next heat">▶</button>
      </div>
      <span className="hmi-sub">{heats.length} heats · {model.enough ? <>model fit R² {num(model.r2, 2)}</> : <>published factors (need {MIN_HEATS}+ heats)</>}</span>
    </div>

    <div className="hmi-strip">
      <Tile label="Heat nr" value={h.heat} />
      <Tile label="Grade" value={h.grade ?? '—'} />
      <Tile label="Tapped" value={fmtTime(h.at)} />
      <Tile label="Tap-to-tap" value={num(h.tapToTapMin)} unit="min" state={state3(h.tapToTapMin, all.ttt, 'low')} />
      <Tile label="Power-on" value={num(h.powerOnMin)} unit="min" state={state3(h.powerOnMin, all.powerOn, 'low')} />
      <Tile label="Energy" value={num(h.kwhPerT)} unit="kWh/t" state={state3(h.kwhPerT, all.kwhPerT, 'low')} />
      <Tile label="Tapped steel" value={num(h.tappedT, 1)} unit="t" />
      <Tile label="Yield" value={num(h.yieldPct, 1)} unit="%" state={state3(h.yieldPct, all.yield, 'high')} />
      <Tile label="Tap temp" value={h.tapTempC !== undefined ? num(h.tapTempC) : '—'} unit={h.tapTempC !== undefined ? '°C' : undefined} state={h.tapTempC === undefined ? undefined : h.tapTempC > s.tapTargetC + 15 ? 'bad' : h.tapTempC > s.tapTargetC + 5 ? 'warn' : 'good'} />
      <Tile label="CO₂" value={num(h.scope1KgPerT + h.scope2KgPerT)} unit="kg/t" state={state3(h.scope1KgPerT + h.scope2KgPerT, all.co2, 'low')} />
    </div>

    <div className={`hmi-alarm ${alarms.length ? 'on' : ''}`} role="status">
      <b>{alarms.length ? '⚠ ALARMS' : '✓ NORMAL'}</b>
      <span>{alarms.length ? alarms.join('   ·   ') : 'This heat is within your usual range.'}</span>
    </div>

    <div className="hmi-body">
      {tab === 'heat' && <div className="hmi-grid">
        <section className="hmi-panel">
          <h3>Electrical data</h3>
          <Gauge label="Specific energy" value={h.kwhPerT} unit="kWh/t" all={all.kwhPerT} better="low" />
          <Gauge label="Active energy" value={h.kwh / 1_000} unit="MWh" all={col((x) => x.kwh / 1_000)} better="low" digits={1} />
          <Gauge label="Avg power" value={h.mw} unit="MW" all={all.mw} better="high" digits={1} />
          <Gauge label="Power-on" value={h.powerOnMin} unit="min" all={all.powerOn} better="low" />
          <Gauge label="Power-off" value={h.powerOffMin} unit="min" all={all.off} better="low" />
          <Gauge label="Productivity" value={h.tph} unit="t/h" all={all.tph} better="high" digits={1} />
          <Gauge label="Power factor" value={h.avgCosPhi} unit="cos φ" all={all.cos} better="high" digits={2} />
          <h3>Scope 2 <Info>Electricity × Malaysian grid factor {grid} kg CO₂/kWh (location-based).</Info></h3>
          <div className="hmi-kv"><span>Grid CO₂</span><b>{num(h.scope2KgPerT)} kg/t</b></div>
          <div className="hmi-kv"><span>Electricity cost</span><b>{ringgit(h.kwh / 1_000 * elec)}</b></div>
        </section>

        <section className="hmi-panel hmi-centre">
          <h3>Furnace</h3>
          <Furnace h={h} maxMw={quantile(all.mw, 0.98)} />
          <TrendBox heats={heats} sel={sel} onPick={setSel} />
        </section>

        <section className="hmi-panel">
          <h3>Chemical system</h3>
          <Gauge label="Oxygen" value={h.o2PerT} unit="Nm³/t" all={all.o2} better="high" digits={1} />
          <Gauge label="Natural gas" value={h.ngPerT} unit="Nm³/t" all={all.ng} better="low" digits={1} />
          <Gauge label="Carbon" value={h.carbonPerT} unit="kg/t" all={all.c} better="low" digits={1} />
          <Gauge label="Electrodes" value={h.electrodePerT} unit="kg/t" all={all.el} better="low" digits={2} />
          <Gauge label="Lime" value={h.limeKg !== undefined ? h.limeKg / h.tappedT : null} unit="kg/t" all={all.lime} better="low" digits={1} />
          <h3>Weights</h3>
          <div className="hmi-kv"><span>Metallic charge</span><b>{num(h.chargeT, 1)} t</b></div>
          <div className="hmi-kv"><span>Liquid heel</span><b>{h.heelT !== undefined ? `${num(h.heelT, 1)} t` : '—'}</b></div>
          <div className="hmi-kv"><span>Additions</span><b>{h.additionsT !== undefined ? `${num(h.additionsT, 1)} t` : '—'}</b></div>
          <div className="hmi-kv"><span>Tapped steel</span><b>{num(h.tappedT, 1)} t</b></div>
          <div className="hmi-kv"><span>Metal lost</span><b>{num(h.chargeT + (h.additionsT ?? 0) - h.tappedT, 1)} t</b></div>
          <h3>Scope 1 <Info>Carbon mass balance: carbon in (charge + injected × {s.carbonContent}, electrodes × {s.electrodeCarbon}) minus carbon left in steel ({s.steelCarbonPct}%), × 44/12. Plus natural gas at 56.1 kg CO₂/GJ. CBAM permits the mass-balance method (Reg. (EU) 2023/1773).</Info></h3>
          <div className="hmi-kv"><span>Process + gas CO₂</span><b>{num(h.scope1KgPerT)} kg/t</b></div>
          <div className="hmi-kv"><span>Total CO₂ (S1 + S2)</span><b>{num(h.scope1KgPerT + h.scope2KgPerT)} kg/t</b></div>
        </section>
      </div>}

      {tab === 'losses' && <LossesTab list={lossList} heats={heats} />}
      {tab === 'factors' && <FactorsTab heats={heats} model={model} />}
      {tab === 'optimise' && <OptimiserTab heats={heats} model={model} bounds={bounds} s={s} elec={elec} ngPrice={ngPrice} grid={grid} />}
      {tab === 'data' && <DataTab heats={heats} s={s} assumed={assumed} uploader={uploader} templateBtn={templateBtn} msg={msg} elec={elec} ngPrice={ngPrice} grid={grid} />}
    </div>

    <nav className="hmi-fkeys" aria-label="Function keys">
      {tabs.map((t) => <button key={t.id} type="button" className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}><kbd>{t.key}</kbd>{t.label}</button>)}
    </nav>
  </div>
}

function ImportMsg({ msg }: { msg: HeatImport }) {
  return <div className={`hmi-msg ${msg.error ? 'err' : ''}`}>
    {msg.error ? <b>{msg.error}</b> : <b>Loaded {msg.heats.length} heats.</b>}
    {msg.warnings.map((w) => <p key={w}>{w}</p>)}
  </div>
}

const metrics: { id: string; label: string; better: 'low' | 'high'; f: (h: HeatDerived) => number | null | undefined }[] = [
  { id: 'kwh', label: 'kWh/t', better: 'low', f: (h) => h.kwhPerT },
  { id: 'off', label: 'Power-off min', better: 'low', f: (h) => h.powerOffMin },
  { id: 'temp', label: 'Tap °C', better: 'low', f: (h) => h.tapTempC },
  { id: 'yield', label: 'Yield %', better: 'high', f: (h) => h.yieldPct },
  { id: 'el', label: 'Electrode kg/t', better: 'low', f: (h) => h.electrodePerT },
  { id: 'co2', label: 'CO₂ kg/t', better: 'low', f: (h) => h.scope1KgPerT + h.scope2KgPerT },
]
function TrendBox({ heats, sel, onPick }: { heats: HeatDerived[]; sel: number; onPick: (i: number) => void }) {
  const [m, setM] = useState('kwh')
  const metric = metrics.find((x) => x.id === m)!
  return <div className="hmi-trendbox">
    <div className="hmi-seg">{metrics.map((x) => <button key={x.id} type="button" className={x.id === m ? 'on' : ''} onClick={() => setM(x.id)}>{x.label}</button>)}</div>
    <Trend heats={heats} metric={metric.f} sel={sel} onPick={onPick} better={metric.better} />
    <p className="hmi-note">Dots = heats (green = best quarter), line = 10-heat average. Click a dot to open it.</p>
  </div>
}

function LossesTab({ list, heats }: { list: ReturnType<typeof losses>; heats: HeatDerived[] }) {
  const total = list.reduce((a, l) => a + l.rmPerMonth, 0), co2 = list.reduce((a, l) => a + l.co2TPerMonth, 0)
  const max = Math.max(1, ...list.map((l) => l.high))
  return <section className="hmi-panel wide">
    <h3>Money lost vs your own best heats <Info>Each line compares your average heat with your best quarter of heats ({heats.length} heats). The range uses the 90% range of the learned factor, or the published range when the model has too few heats. Overlaps are possible: do not add the ranges blindly.</Info></h3>
    <div className="hmi-total"><div><span>Up to</span><b>{ringgit(total)}</b><small>/month</small></div><div><span>CO₂</span><b>{num(co2)}</b><small>t/month</small></div></div>
    {!list.length ? <p className="hmi-note">No losses found against your best quarter.</p> : <table className="hmi-table">
      <thead><tr><th>Where</th><th>RM / month</th><th>Range</th><th>CO₂ t/mo</th><th>Basis</th></tr></thead>
      <tbody>{list.map((l) => <tr key={l.id}>
        <td><b>{l.label}</b><small>{l.detail}</small></td>
        <td className="num">{ringgit(l.rmPerMonth)}</td>
        <td><span className="hmi-range"><i style={{ left: `${l.low / max * 100}%`, width: `${Math.max(1, (l.high - l.low) / max * 100)}%` }} /><em style={{ left: `${l.rmPerMonth / max * 100}%` }} /></span><small>{ringgit(l.low)} – {ringgit(l.high)}</small></td>
        <td className="num">{num(l.co2TPerMonth, 1)}</td>
        <td><Badge kind={l.basis} /></td>
      </tr>)}</tbody>
    </table>}
  </section>
}

function FactorsTab({ heats, model }: { heats: HeatDerived[]; model: ReturnType<typeof learn> }) {
  // Common axis per factor: published band vs learned 90% range.
  return <section className="hmi-panel wide">
    <h3>What each driver does to your kWh/t <Info>Multiple regression of kWh/t on the drivers you log, over {model.n} heats. A factor is “Learned” when it agrees in sign and roughly in size with published physics; “Check data” means the meter or log for that driver needs a look before relying on it. Sources and verification: docs/eaf-optimisation-model.md.</Info></h3>
    <div className="hmi-total">
      <div><span>Heats used</span><b>{model.n}</b></div>
      <div><span>Fit (R²)</span><b>{model.enough ? num(model.r2, 2) : '—'}</b></div>
      <div><span>Scatter</span><b>{model.enough ? `±${num(model.residualSd)}` : '—'}</b><small>kWh/t</small></div>
    </div>
    {!model.enough && <p className="hmi-msg">Only {heats.length} heats: showing published values. Upload {MIN_HEATS}+ heats with varying practice to learn your furnace.</p>}
    <table className="hmi-table">
      <thead><tr><th>Driver</th><th>Effect (kWh/t per unit)</th><th>Yours vs published</th><th>Status</th><th>Published source</th></tr></thead>
      <tbody>{model.factors.map((f) => {
        const p = published[f.id]
        const lo = Math.min(p.low, f.low, 0) - 0.5, hi = Math.max(p.high, f.high, 0) + 0.5, span = hi - lo
        const pos = (v: number) => `${(v - lo) / span * 100}%`
        return <tr key={f.id}>
          <td><b>{p.label}</b><small>per {p.unit}</small></td>
          <td className="num">{f.coef > 0 ? '+' : ''}{num(f.coef, 2)}<small>{f.used ? `${num(f.low, 2)} to ${num(f.high, 2)}` : 'published mid'}</small></td>
          <td><span className="hmi-band" title={`Published ${p.low} to ${p.high}`}>
            <i className="pub" style={{ left: pos(p.low), width: `calc(${pos(p.high)} - ${pos(p.low)})` }} />
            {f.used && <i className="mine" style={{ left: pos(f.low), width: `calc(${pos(f.high)} - ${pos(f.low)})` }} />}
            <em className="zero" style={{ left: pos(0) }} />
          </span><small>grey = published · blue = yours (90%)</small></td>
          <td><Badge kind={f.status} /><small>{f.message}</small></td>
          <td><Badge kind={p.confidence} /><small>{p.note}</small></td>
        </tr>
      })}</tbody>
    </table>
  </section>
}

function OptimiserTab({ heats, model, bounds, s, elec, ngPrice, grid }: { heats: HeatDerived[]; model: ReturnType<typeof learn>; bounds: ReturnType<typeof boundsFor>; s: EafSettings; elec: number; ngPrice: number; grid: number }) {
  const avg = useMemo(() => Object.fromEntries(DRIVERS.map((id) => {
    const v = heats.map((h) => h[id] as number | undefined).filter((x): x is number => x !== undefined)
    return [id, v.length ? mean(v) : (bounds[id][0] + bounds[id][1]) / 2]
  })) as Setpoints, [heats, bounds])
  const [x, setX] = useState<Setpoints>(avg)
  const [locked, setLocked] = useState<Partial<Record<FactorId, boolean>>>({})
  useEffect(() => setX(avg), [avg])
  const base = outcome(model, avg, heats, s, elec, ngPrice, grid)
  const now = outcome(model, x, heats, s, elec, ngPrice, grid)
  const days = Math.max(1, (Date.parse(heats[heats.length - 1].at) - Date.parse(heats[0].at)) / 86_400_000) || 30
  const tPerMonth = heats.reduce((a, h) => a + h.tappedT, 0) / days * 30.4
  const run = (goal: 'cost' | 'co2') => {
    const fixed = Object.fromEntries(DRIVERS.filter((id) => locked[id]).map((id) => [id, x[id]])) as Partial<Setpoints>
    setX(optimise(model, bounds, heats, s, elec, ngPrice, grid, goal, fixed))
  }
  const step: Record<FactorId, number> = { o2PerT: 0.5, ngPerT: 0.1, carbonPerT: 0.5, powerOffMin: 0.5, tapTempC: 1 }
  const unit = (id: FactorId) => published[id].unit
  const diff = (a: number, b: number, d = 0) => `${a - b > 0 ? '+' : ''}${num(a - b, d)}`
  return <div className="hmi-grid opt">
    <section className="hmi-panel">
      <h3>Set points <Info>Each slider is limited to what this furnace has already done (5th–95th percentile of your heats), so the model never extrapolates. Lock a driver to keep it fixed while optimising the others.</Info></h3>
      {DRIVERS.map((id) => {
        const [lo, hi] = bounds[id]
        const off = hi - lo < 1e-6
        return <div key={id} className={`hmi-slider ${off ? 'off' : ''}`}>
          <div className="hs-head"><b>{published[id].label}</b><span>{num(x[id], id === 'tapTempC' ? 0 : 1)} {unit(id)}</span>
            <label className="hs-lock" title="Keep fixed"><input type="checkbox" checked={!!locked[id]} onChange={(e) => setLocked({ ...locked, [id]: e.target.checked })} />🔒</label></div>
          <input type="range" min={lo} max={hi} step={step[id]} value={x[id]} disabled={off} onChange={(e) => setX({ ...x, [id]: Number(e.target.value) })} />
          <div className="hs-foot"><span>{num(lo, 1)}</span><span>avg {num(avg[id], 1)}</span><span>{num(hi, 1)}</span></div>
        </div>
      })}
      <div className="row-actions">
        <button type="button" className="btn primary" onClick={() => run('cost')}>Best for cost</button>
        <button type="button" className="btn" onClick={() => run('co2')}>Best for CO₂</button>
        <button type="button" className="btn ghost" onClick={() => setX(avg)}>Reset</button>
      </div>
    </section>
    <section className="hmi-panel hmi-centre">
      <h3>Predicted heat</h3>
      {!model.enough && <p className="hmi-msg">Using published factors: indicative only until {MIN_HEATS}+ heats.</p>}
      <div className="hmi-big">
        <div><span>Specific energy</span><b>{num(now.kwhPerT)}</b><small>kWh/t</small><em>{model.enough ? `90%: ${num(now.kwhLow)}–${num(now.kwhHigh)}` : 'no range'} · {diff(now.kwhPerT, base.kwhPerT)} vs avg</em></div>
        <div><span>Cost</span><b>{ringgit(now.costPerT)}</b><small>/t</small><em>{diff(now.costPerT, base.costPerT, 1)} RM/t vs avg</em></div>
        <div><span>CO₂ (S1 + S2)</span><b>{num(now.co2PerT)}</b><small>kg/t</small><em>{diff(now.co2PerT, base.co2PerT)} kg/t vs avg</em></div>
      </div>
      <div className="hmi-total">
        <div><span>Saving</span><b>{ringgit(Math.max(0, (base.costPerT - now.costPerT) * tPerMonth))}</b><small>/month</small></div>
        <div><span>CO₂ cut</span><b>{num(Math.max(0, (base.co2PerT - now.co2PerT) * tPerMonth / 1_000), 1)}</b><small>t/month</small></div>
        <div><span>Output</span><b>{num(tPerMonth)}</b><small>t/month</small></div>
      </div>
      <table className="hmi-table compact">
        <thead><tr><th>Driver</th><th>Average heat</th><th>Set point</th><th>Change</th></tr></thead>
        <tbody>{DRIVERS.map((id) => <tr key={id}><td>{published[id].label}</td><td className="num">{num(avg[id], 1)}</td><td className="num">{num(x[id], 1)}</td><td className="num">{diff(x[id], avg[id], 1)} {unit(id)}</td></tr>)}</tbody>
      </table>
      <p className="hmi-note">Cost includes electricity {ringgit(elec)}/MWh{s.o2RMPerNm3 > 0 ? `, oxygen RM ${s.o2RMPerNm3}/Nm³` : ', on-site oxygen at 0.5 kWh/Nm³ (LBNL)'}, gas RM {num(ngPrice, 1)}/GJ, carbon and electrodes at your prices (F5).</p>
    </section>
  </div>
}

function DataTab({ heats, s, assumed, uploader, templateBtn, msg, elec, ngPrice, grid }: { heats: HeatDerived[]; s: EafSettings; assumed: (k: keyof EafSettings) => boolean; uploader: React.ReactNode; templateBtn: React.ReactNode; msg: HeatImport | null; elec: number; ngPrice: number; grid: number }) {
  const state = useFactory()
  const set = (k: keyof EafSettings, v: number) => { if (Number.isFinite(v)) actions.updateSettings({ eaf: { ...state.settings.eaf, [k]: v } }) }
  const fields: { k: keyof EafSettings; label: string; unit: string; step: number }[] = [
    { k: 'electrodeRMPerKg', label: 'Electrode price', unit: 'RM/kg', step: 0.5 },
    { k: 'scrapRMPerT', label: 'Scrap price', unit: 'RM/t', step: 10 },
    { k: 'carbonRMPerKg', label: 'Carbon price', unit: 'RM/kg', step: 0.1 },
    { k: 'o2RMPerNm3', label: 'Bought oxygen (0 = own plant)', unit: 'RM/Nm³', step: 0.05 },
    { k: 'ngGJPerNm3', label: 'Gas energy', unit: 'GJ/Nm³', step: 0.001 },
    { k: 'tapTargetC', label: 'Tap target', unit: '°C', step: 5 },
    { k: 'carbonContent', label: 'Carbon in charge/injection carbon', unit: 'fraction', step: 0.01 },
    { k: 'electrodeCarbon', label: 'Carbon in electrodes', unit: 'fraction', step: 0.01 },
    { k: 'steelCarbonPct', label: 'Carbon left in steel', unit: '%', step: 0.01 },
  ]
  return <div className="hmi-grid opt">
    <section className="hmi-panel">
      <h3>Heat log</h3>
      <p className="hmi-note">{heats.length} heats · {fmtTime(heats[0].at)} to {fmtTime(heats[heats.length - 1].at)}. A new upload replaces these.</p>
      <div className="row-actions">{uploader}{templateBtn}<button type="button" className="btn ghost" onClick={() => { if (confirm('Remove all heat data for this site?')) actions.setHeats([], '') }}>Remove</button></div>
      {msg && <ImportMsg msg={msg} />}
      <h3>Prices & carbon contents <Info>Tagged “Assumption” until you enter your own. Electricity {ringgit(elec)}/MWh, gas RM {num(ngPrice, 1)}/GJ and grid {grid} kg/kWh come from Settings.</Info></h3>
      {fields.map((f) => <label key={f.k} className="hmi-field">
        <span>{f.label} {assumed(f.k) && <Badge kind="assumption" />}</span>
        <span className="hf-in"><input type="number" step={f.step} value={s[f.k]} onChange={(e) => set(f.k, Number(e.target.value))} /><small>{f.unit}</small></span>
      </label>)}
    </section>
    <section className="hmi-panel hmi-centre">
      <h3>Heats (latest 60)</h3>
      <div className="hmi-scroll"><table className="hmi-table compact">
        <thead><tr><th>Heat</th><th>Tapped</th><th>t</th><th>kWh/t</th><th>On / off min</th><th>O₂/t</th><th>Yield %</th><th>°C</th><th>CO₂ kg/t</th></tr></thead>
        <tbody>{heats.slice(-60).reverse().map((h, i) => <tr key={h.heat + i}><td>{h.heat}</td><td>{fmtTime(h.at)}</td><td className="num">{num(h.tappedT, 1)}</td><td className="num">{num(h.kwhPerT)}</td><td className="num">{num(h.powerOnMin)} / {num(h.powerOffMin)}</td><td className="num">{num(h.o2PerT, 1)}</td><td className="num">{num(h.yieldPct, 1)}</td><td className="num">{h.tapTempC ?? '—'}</td><td className="num">{num(h.scope1KgPerT + h.scope2KgPerT)}</td></tr>)}</tbody>
      </table></div>
    </section>
  </div>
}
