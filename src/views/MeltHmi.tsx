import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { num } from '../format'
import InductionFurnace3D, { type CameraView, type FurnaceState } from '../components/InductionFurnace3D'
import { TrendChart } from '../components/MsCharts'
import { defaultSetPoints, pointAt, simulateHeat, yieldFor, type SetPoints, type SimPhase } from '../model/furnaceSim'
import { learnCopper, minutesOf, scrapTypes, stamp, type ScrapType } from '../model/meltshop'
import { shopAt, timeline } from '../model/meltshopLive'
import { mean, quantile } from '../model/regress'
import { EventsScreen, ShopScreen, TrendsScreen } from './MeltControl'
import { MeltEnergy } from './MeltTabs'
import type { Melt } from './MeltShop'
import { faults, FURNACES } from '../live/feed'
import { clockOf, live, useLive } from '../live/store'

type Mode = 'sim' | 'replay' | 'live'
type Screen = 'furnace' | 'shop' | 'trends' | 'energy' | 'events'
const fkeys: { id: Screen | null; key: string; label: string }[] = [
  { id: 'furnace', key: 'F1', label: 'Furnace' }, { id: 'shop', key: 'F2', label: 'Melt shop' }, { id: 'trends', key: 'F3', label: 'Trends' },
  { id: 'energy', key: 'F4', label: 'Energy analysis' }, { id: 'events', key: 'F5', label: 'Alarms & events' },
  { id: null, key: 'F6', label: '-' }, { id: null, key: 'F7', label: '-' }, { id: null, key: 'F8', label: '-' },
]
const phaseLabel: Record<SimPhase | 'idle', string> = { charging: 'Charging', melting: 'Melting', superheat: 'Superheating', holding: 'Holding', tapping: 'Tapping', idle: 'Idle' }
const dur = (m: number) => `${String(Math.floor(Math.max(0, m) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, m) % 60)).padStart(2, '0')}`

/** One view model for both modes, so every panel reads the same fields. */
type Vm = {
  phase: SimPhase | 'idle'; heatMin: number; phaseMin: number; powerOnMin: number
  powerKW: number; ratedKW: number; energyKwh: number; meltPct: number; missingKwh: number; bathC: number | null; hz: number | null
  water: { inC: number; outC: number; flow: number; heatKW: number } | null; liningC: number | null; lidOpen: boolean; tiltDeg: number
  heatNr: string; grade: string; chargeT: number; heelT: number; tappedT: number; scheduledT: number
  alarms: { level: 'warn' | 'alarm'; text: string }[]
}
const primary = (kw: number) => { const p = kw / 0.97, cos = kw > 100 ? 0.98 : 0.9; return { p: p / 1_000, q: p / 1_000 * Math.tan(Math.acos(cos)), cos, amps: p > 0 ? p * 1_000 / (Math.sqrt(3) * 33_000 * cos) : 0 } }
const secondary = (kw: number, rated: number) => { const v = kw > 0 ? 3_000 * Math.sqrt(kw / rated) : 0; return { v, coilKA: v > 0 ? kw * 1_000 / (v * 0.12) / 1_000 : 0, dcKA: kw / 1_800 } }

/* ---------------- HMI building blocks (dark, classic) ---------------- */

function Box({ title, children, className = '', right }: { title: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return <section className={`h3-box ${className}`}><header>{title}{right}</header><div className="h3-in">{children}</div></section>
}
function Cell({ label, value, unit, tone }: { label?: string; value: ReactNode; unit?: string; tone?: 'red' | 'yellow' | 'green' }) {
  return <div className="h3-cell">{label && <span>{label}</span>}<b className={tone ?? ''}>{value}</b>{unit && <em>{unit}</em>}</div>
}
function Num({ label, value, min, max, step, unit, on, onChange, digits = 0 }: { label: string; value: number; min: number; max: number; step: number; unit: string; on: boolean; onChange: (v: number) => void; digits?: number }) {
  return <label className={`h3-set ${on ? '' : 'off'}`}>
    <span>{label}</span>
    <input type="number" value={Number(value.toFixed(digits))} min={min} max={max} step={step} disabled={!on} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v))) }} />
    <em>{unit}</em>
    <input type="range" value={value} min={min} max={max} step={step} disabled={!on} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
  </label>
}
function Bar({ label, value, max, color, text }: { label: string; value: number; max: number; color: string; text: string }) {
  return <div className="h3-bar"><span className="h3-bar-tag">{label}</span><div className="h3-bar-track">{[0, 25, 50, 75, 100].map((g) => <i key={g} style={{ bottom: `${g}%` }} />)}<b style={{ height: `${Math.max(0, Math.min(100, value / max * 100))}%`, background: color }} /></div><span className="h3-bar-val">{text}</span></div>
}
const Station = ({ name, ok, text }: { name: string; ok: boolean | null; text: string }) => <div className="h3-station"><span>{name}</span><b className={ok === null ? 'idle' : ok ? 'ok' : 'bad'}>{text}</b></div>

/* ---------------- The HMI ---------------- */

export default function MeltHmi({ melt }: { melt: Melt }) {
  const hs = melt.heats
  // Start the simulator from this plant's own averages.
  const init = useMemo((): SetPoints => {
    const mix = Object.fromEntries(scrapTypes.map((x) => [x.id, Math.round(mean(hs.filter((h) => h.charge).map((h) => h.shares[x.id])) * 1_000) / 10])) as SetPoints['mix']
    const rs = melt.data.readings
    return {
      ...defaultSetPoints,
      powerMW: Math.round(quantile(hs.map((h) => h.mw), 0.5) * 10) / 10 || defaultSetPoints.powerMW,
      ratedMW: Math.ceil(Math.max(...hs.map((h) => h.mw)) * 1.05) || defaultSetPoints.ratedMW,
      chargeT: Math.round(quantile(hs.map((h) => h.chargeT), 0.5) * 10) / 10,
      heelT: Math.round(mean(hs.map((h) => h.heelT ?? 0)) * 10) / 10,
      mix: hs.some((h) => h.charge) ? mix : defaultSetPoints.mix,
      tapAimC: melt.s.tapTargetC,
      holdMin: Math.round(mean(hs.map((h) => h.holdMin ?? defaultSetPoints.holdMin))),
      lidOpenMin: Math.round(mean(hs.map((h) => h.lidOpenMin ?? defaultSetPoints.lidOpenMin))),
      waterFlowM3h: rs.length ? Math.round(quantile(rs.map((r) => r.flowM3h ?? 410), 0.5)) : defaultSetPoints.waterFlowM3h,
      waterInC: rs.length ? Math.round(quantile(rs.map((r) => r.waterInC ?? 32), 0.5)) : defaultSetPoints.waterInC,
      electricityRMPerMWh: (melt.s.peakSenPerKWh + melt.s.offPeakSenPerKWh) / 2 * 10,
      gridKgPerKWh: melt.grid,
    }
  }, [hs, melt.data.readings, melt.s, melt.grid])
  const [sp, setSp] = useState<SetPoints>(init)
  const set = (patch: Partial<SetPoints>) => setSp((x) => ({ ...x, ...patch }))
  const [mode, setMode] = useState<Mode>('sim')
  const [screen, setScreen] = useState<Screen>('furnace')
  const [view, setView] = useState<CameraView>('standard')
  const [f, setF] = useState(melt.anomalies[0]?.furnace ?? melt.furnaces[0])
  const [play, setPlay] = useState(true)
  const [speed, setSpeed] = useState(60)
  const [heatNo, setHeatNo] = useState(1)
  const [acked, setAcked] = useState<Set<string>>(new Set())
  const heat = useMemo(() => simulateHeat(sp), [sp])
  const [simT, setSimT] = useState(0)
  // Replay clock over the uploaded readings.
  const rsTimes = melt.data.readings.length ? melt.data.readings.map((r) => minutesOf(r.at)) : [hs[hs.length - 1].tapMin - 2_880, hs[hs.length - 1].tapMin]
  const tMin = Math.min(...rsTimes), tMax = Math.max(...rsTimes)
  const [repT, setRepT] = useState(tMax - 20)
  useEffect(() => {
    if (!play) return
    const id = setInterval(() => {
      if (mode === 'sim') setSimT((x) => { const n = x + speed / 600; if (n >= heat.totalMin) { setHeatNo((k) => k + 1); return 0 } return n })
      else setRepT((x) => (x + speed / 600 > tMax ? tMin : x + speed / 600))
    }, 100)
    return () => clearInterval(id)
  }, [play, speed, mode, heat.totalMin, tMin, tMax])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const k = fkeys.find((x) => x.key === e.key); if (k?.id) { e.preventDefault(); setScreen(k.id) } }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [])

  const liveState = useLive()
  useEffect(() => { if (mode === 'live') live.start() }, [mode])
  const lf = FURNACES.includes(f) ? f : 'IF1'
  const now = useMemo(() => shopAt(hs, melt.data.readings, melt.anomalies, Math.floor(repT)), [hs, melt.data.readings, melt.anomalies, repT])
  const cu = useMemo(() => learnCopper(hs, melt.data.chem), [hs, melt.data.chem])
  const predCu = cu ? scrapTypes.reduce((a, x) => a + (cu[x.id] ?? 0) * sp.mix[x.id] / 100, 0) : null

  // Build the view model for the current mode.
  const vm: Vm = (() => {
    if (mode === 'sim') {
      const p = pointAt(heat, simT)
      const phaseStart = (() => { let k = Math.round(simT / 0.25); while (k > 0 && heat.points[k - 1]?.phase === p.phase) k -= 1; return k * 0.25 })()
      const powerOn = heat.points.filter((x) => x.min <= simT && x.powerKW > 0).length * 0.25
      return {
        phase: p.phase, heatMin: simT, phaseMin: simT - phaseStart, powerOnMin: powerOn,
        powerKW: p.powerKW, ratedKW: sp.ratedMW * 1_000, energyKwh: p.energyKwh, meltPct: p.meltPct, missingKwh: p.missingKwh, bathC: p.phase === 'charging' && sp.heelT === 0 ? null : p.bathC, hz: p.hz || null,
        water: { inC: sp.waterInC, outC: p.waterOutC, flow: sp.waterFlowM3h, heatKW: p.coilHeatKW }, liningC: p.liningC, lidOpen: p.lidOpen, tiltDeg: p.tiltDeg,
        heatNr: `SIM-${String(heatNo).padStart(3, '0')}`, grade: melt.s.grade, chargeT: sp.chargeT, heelT: sp.heelT, tappedT: p.phase === 'tapping' ? heat.tappedT : 0, scheduledT: heat.tappedT,
        alarms: heat.alarms.filter((a) => a.min <= simT),
      }
    }
    if (mode === 'live') {
      const r = liveState.latest[lf]
      const hist = liveState.history[lf] ?? []
      if (!r) return { phase: 'idle', heatMin: 0, phaseMin: 0, powerOnMin: 0, powerKW: 0, ratedKW: sp.ratedMW * 1_000, energyKwh: 0, meltPct: 0, missingKwh: 0, bathC: null, hz: null, water: null, liningC: null, lidOpen: true, tiltDeg: 0, heatNr: '—', grade: melt.s.grade, chargeT: 0, heelT: 0, tappedT: 0, scheduledT: 0, alarms: [] }
      // This heat's history: back to its charging phase.
      let k = hist.length - 1
      while (k > 0 && hist[k - 1].heatNo === r.heatNo) k -= 1
      const thisHeat = hist.slice(k)
      let ps = thisHeat.length - 1
      while (ps > 0 && thisHeat[ps - 1].phase === r.phase) ps -= 1
      const energy = thisHeat.reduce((a, x) => a + x.kw / 60, 0)
      const expected = 31_800
      return {
        phase: r.phase, heatMin: thisHeat.length, phaseMin: thisHeat.length - ps, powerOnMin: thisHeat.filter((x) => x.kw > 1_000).length,
        powerKW: r.kw, ratedKW: sp.ratedMW * 1_000, energyKwh: energy, meltPct: r.phase === 'charging' ? 0 : r.phase === 'melting' ? Math.min(99, energy / (expected * 0.9) * 100) : 100,
        missingKwh: Math.max(0, expected - energy), bathC: r.bathC, hz: r.hz || null,
        water: { inC: r.waterInC, outC: r.waterOutC, flow: r.flowM3h, heatKW: r.flowM3h * 1_000 / 3_600 * 4.18 * (r.waterOutC - r.waterInC) }, liningC: null,
        lidOpen: r.phase === 'charging' || r.phase === 'tapping', tiltDeg: r.phase === 'tapping' ? 31 : 0,
        heatNr: `${lf}-${String(r.heatNo).padStart(4, '0')}`, grade: melt.s.grade, chargeT: 58 + FURNACES.indexOf(lf), heelT: 0, tappedT: r.phase === 'tapping' ? 55.4 : 0, scheduledT: 55.4,
        alarms: liveState.alerts.filter((a) => a.active && a.furnace === lf).map((a) => ({ level: a.level, text: `${a.title}: ${a.detail}` })),
      }
    }
    const x = now.furnaces.find((y) => y.furnace === f)!
    const h = x.heat
    const ph: Vm['phase'] = x.phase === 'charging' ? 'charging' : x.phase === 'idle' ? 'idle' : x.phase
    return {
      phase: ph, heatMin: x.heatMin, phaseMin: x.phaseMin, powerOnMin: h && x.phase !== 'melting' && now.t > timeline(h).powerOnEnd ? h.powerOnMin : x.phase === 'melting' ? x.phaseMin : 0,
      powerKW: x.kw, ratedKW: x.ratedKw, energyKwh: x.energyKwh, meltPct: x.meltPct, missingKwh: x.missingKwh, bathC: x.bathC, hz: x.hz,
      water: x.water ? { inC: x.water.inC, outC: x.water.outC, flow: x.water.flow, heatKW: x.water.lossKW ?? 0 } : null, liningC: null,
      lidOpen: x.phase === 'tapping' || x.phase === 'charging' || x.phase === 'idle', tiltDeg: x.phase === 'tapping' ? 31 : 0,
      heatNr: h?.heat ?? '—', grade: h?.grade ?? '—', chargeT: h?.chargeT ?? 0, heelT: h?.heelT ?? 0, tappedT: h && x.phase === 'tapping' ? h.tappedT : 0, scheduledT: h ? h.chargeT * h.yieldPct / 100 : 0,
      alarms: x.alarm ? [{ level: 'alarm', text: `${x.alarm.signal === 'flowM3h' ? 'Coil water flow' : 'Coil water ΔT'} ${x.alarm.kind === 'drop' ? 'dropped' : 'rose'} to ${x.alarm.value.toFixed(1)}` }] : [],
    }
  })()
  const editable = mode === 'sim'
  const pr = primary(vm.powerKW), sc = secondary(vm.powerKW, vm.ratedKW)
  const state: FurnaceState = { power: vm.powerKW / Math.max(1, vm.ratedKW), bathC: vm.bathC, phase: vm.phase === 'tapping' ? 'tapping' : vm.phase === 'holding' ? 'holding' : vm.phase === 'melting' || vm.phase === 'superheat' ? 'melting' : 'idle', fill: vm.phase === 'charging' ? 0.25 : vm.phase === 'melting' ? 0.25 + 0.75 * vm.meltPct / 100 : 1, alarm: vm.alarms.some((a) => a.level === 'alarm') }
  const activeAlarms = vm.alarms.filter((a) => !acked.has(a.text))
  const clock = mode === 'sim' ? `Heat time ${dur(vm.heatMin)}` : mode === 'live' ? `LIVE ${clockOf(liveState.t)}` : stamp(Math.floor(repT))
  const trendPts = mode === 'sim' ? heat.points.filter((_, i) => i % 8 === 0) : []
  const cursor = Math.round(simT / 2)
  const mixSum = scrapTypes.reduce((a, x) => a + sp.mix[x.id], 0)
  const setMix = (id: ScrapType, v: number) => { const next = { ...sp.mix, [id]: v }; const others = scrapTypes.filter((x) => x.id !== 'hms').reduce((a, x) => a + next[x.id], 0); next.hms = Math.max(0, Math.round((100 - others) * 10) / 10); set({ mix: next }) }
  const kwhPerT = heat.kwhPerT

  return <div className="h3">
    <div className="h3-title"><span className="h3-brand">ChitoCapture</span><b>Melt shop HMI · {mode === 'sim' ? 'Simulator' : f} · Induction furnace monitoring</b><span className="h3-clock">{clock}</span></div>
    <div className="h3-status">
      <span className={activeAlarms.some((a) => a.level === 'alarm') ? 'red' : ''}>CRITICAL ALARMS</span>
      <span>Electrical data</span>
      <span className={vm.water && vm.water.outC - vm.water.inC > 20 ? 'yellow' : ''}>COOLING ALARMS</span>
      <span className="green">COIL PROTECTION ENABLED</span>
      <span className="green">{mode === 'sim' ? 'SIMULATOR' : 'PCS OK'}</span>
      <div className="h3-mode" role="radiogroup" aria-label="Mode">
        <button type="button" className={mode === 'sim' ? 'on' : ''} onClick={() => setMode('sim')}>Simulator</button>
        <button type="button" className={mode === 'replay' ? 'on' : ''} onClick={() => setMode('replay')}>Replay data</button>
        <button type="button" className={mode === 'live' ? 'on live' : 'live'} onClick={() => setMode('live')}><i />Live feed</button>
      </div>
    </div>

    <div className="h3-head">
      <Cell label="HEAT Nr." value={vm.heatNr} /><Cell label="Heat time" value={dur(vm.heatMin)} /><Cell label="Heat phase" value={phaseLabel[vm.phase]} />
      <Cell label="STEEL" value={vm.grade} /><Cell label="Power ON time" value={dur(vm.powerOnMin)} /><Cell label="Phase time" value={dur(vm.phaseMin)} />
      <div className="h3-big red"><span>TAP</span><b>{mode === 'live' ? (liveState.latest[lf]?.heatNo ?? 1) - 1 : mode === 'sim' ? heatNo - 1 : now.furnaces.find((y) => y.furnace === f)?.heat ? 1 : 0}</b><i className={vm.powerKW > 1_000 ? 'on' : ''}>{vm.powerKW > 1_000 ? 'POWER ON' : 'POWER OFF'}</i></div>
      <div className="h3-big"><span>Melting %</span><b>{num(vm.meltPct)}</b></div>
      <div className="h3-big"><span>Temp.°C</span><b>{vm.bathC !== null ? num(vm.bathC) : 0}</b></div>
      <div className="h3-big"><span>Power %</span><b>{num(vm.powerKW / Math.max(1, vm.ratedKW) * 100)}</b></div>
      <div className="h3-runbox">
        <button type="button" className="yellow" onClick={() => mode === 'live' ? (liveState.running ? live.stop() : live.start()) : setPlay(!play)}>{(mode === 'live' ? liveState.running : play) ? '❚❚ Pause' : '▶ Run'}</button>
        {mode === 'live' ? <select value={liveState.speed} onChange={(e) => live.setSpeed(Number(e.target.value))} aria-label="Live speed">{[1, 4, 12].map((v) => <option key={v} value={v}>{v === 1 ? 'Real time ×60' : `×${v * 60}`}</option>)}</select> : <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed">{[10, 60, 300].map((v) => <option key={v} value={v}>× {v}</option>)}</select>}
        {mode === 'sim' ? <button type="button" onClick={() => { setSimT(0); setHeatNo((k) => k + 1) }}>New heat</button> : <select value={mode === 'live' ? lf : f} onChange={(e) => setF(e.target.value)} aria-label="Furnace">{(mode === 'live' ? FURNACES : melt.furnaces).map((x) => <option key={x}>{x}</option>)}</select>}
      </div>
    </div>

    {screen === 'furnace' && <div className="h3-main">
      <div className="h3-left">
        <Box title="Electrical Data">
          <div className="h3-sides">
            <div><div className="h3-sub">Primary side</div>
              <div className="h3-bars"><Bar label="P" value={pr.p} max={vm.ratedKW / 1_000 * 1.1} color="#e53935" text={num(pr.p, 1)} /><Bar label="Q" value={pr.q} max={vm.ratedKW / 1_000 * 0.3} color="#1e40ff" text={num(pr.q, 1)} /><Bar label="cosφ" value={pr.cos} max={1} color="#d946ef" text={num(pr.cos, 2)} /></div>
              <div className="h3-row3"><Cell value="33.0" /><Cell value="33.0" /><Cell value="33.0" unit="kV" /></div>
              <div className="h3-row3"><Cell value={num(pr.amps)} /><Cell value={num(pr.amps)} /><Cell value={num(pr.amps)} unit="A" /></div>
            </div>
            <div><div className="h3-sub">Secondary side</div>
              <div className="h3-bars"><Bar label="I coil" value={sc.coilKA} max={110} color="#22c55e" text={num(sc.coilKA, 1)} /><Bar label="I dc" value={sc.dcKA} max={20} color="#22c55e" text={num(sc.dcKA, 1)} /><Bar label="Hz" value={vm.hz ?? 0} max={300} color="#22c55e" text={vm.hz ? num(vm.hz) : '0'} /></div>
              <div className="h3-row1"><Cell label="Coil voltage" value={num(sc.v)} unit="V" /></div>
              <button type="button" className={`h3-poweron ${vm.powerKW > 1_000 ? 'on' : ''}`} onClick={() => editable && setPlay(!play)}>{vm.powerKW > 1_000 ? 'POWER ON' : 'POWER OFF'}</button>
            </div>
          </div>
          <p className="h3-note">Primary and secondary values are indicative for an IGBT supply on a 33 kV feed.</p>
        </Box>
        <Box title="Electric Set Points">
          <Num label="Power set point" value={sp.powerMW} min={5} max={sp.ratedMW} step={0.5} unit="MW" on={editable} onChange={(v) => set({ powerMW: v })} digits={1} />
          <Num label="Converter rating" value={sp.ratedMW} min={10} max={60} step={1} unit="MW" on={editable} onChange={(v) => set({ ratedMW: v, powerMW: Math.min(sp.powerMW, v) })} />
          <div className="h3-energy">
            <Cell label="Active Energy" value={`${num(vm.energyKwh)} kWh`} /><Cell label="Reactive Energy" value={`${num(vm.energyKwh * Math.tan(Math.acos(pr.cos)))} kVArh`} /><Cell label="Specific Energy" value={`${num(vm.energyKwh / Math.max(1, vm.scheduledT))} kWh/t`} />
          </div>
        </Box>
        <Box title="Charge & Chemistry Monitoring">
          <div className="h3-mix">{scrapTypes.filter((x) => x.id !== 'dri' || sp.mix.dri > 0).map((x) => <div key={x.id} className="h3-mixcol">
            <div className="h3-bar-track small">{[0, 25, 50, 75, 100].map((g) => <i key={g} style={{ bottom: `${g}%` }} />)}<b style={{ height: `${Math.min(100, sp.mix[x.id] / 60 * 100)}%`, background: '#1e40ff' }} /></div>
            <input type="range" min={0} max={60} step={0.5} value={sp.mix[x.id]} disabled={!editable || x.id === 'hms'} onChange={(e) => setMix(x.id, Number(e.target.value))} aria-label={x.label} className="h3-vslider" />
            <b>{num(sp.mix[x.id], 1)}%</b><span className="h3-green">{x.short}</span>
          </div>)}</div>
          <Cell label="Predicted Cu" value={predCu !== null ? `${num(predCu, 3)} %` : '—'} tone={predCu !== null && predCu > 0.68 ? 'red' : undefined} unit="limit 0.80" />
          <Cell label="Metal yield" value={`${num(yieldFor(sp.mix) * 100, 1)} %`} />
          {Math.abs(mixSum - 100) > 0.5 && <p className="h3-note">Mix adds to {num(mixSum, 1)}%.</p>}
        </Box>
      </div>

      <div className="h3-centre">
        <div className="h3-stage">
          <InductionFurnace3D state={state} label="Induction furnace" view={view} />
          {mode === 'replay' && <div className="h3-fchips">{melt.furnaces.map((x) => <button key={x} type="button" className={x === f ? 'on' : ''} onClick={() => setF(x)}>{x}</button>)}</div>}
        </div>
        <div className="h3-views">{(['standard', 'top', 'front', 'back', 'side'] as CameraView[]).map((v) => <button key={v} type="button" className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)} View</button>)}</div>
        <div className="h3-lower">
          <div className="h3-missing">
            <div className={`h3-flag ${vm.phase === 'holding' || vm.phase === 'superheat' ? 'green' : ''}`}>Hot Furnace</div>
            <Cell label="Missing Energy" value={`${num(vm.missingKwh)} kWh`} />
            <div className={`h3-flag ${sp.coldLining && mode === 'sim' ? 'red' : 'green'}`}>{sp.coldLining && mode === 'sim' ? 'Cold Lining' : 'Hot Lining'}</div>
            <Cell label="Lining temp" value={vm.liningC !== null ? `${num(vm.liningC)} °C` : '—'} />
          </div>
          <Box title="Weights" className="h3-weights">
            <Num label="Total charge" value={vm.chargeT} min={10} max={80} step={0.5} unit="t" on={editable} onChange={(v) => set({ chargeT: v })} digits={1} />
            <Num label="Liquid heel" value={vm.heelT} min={0} max={30} step={0.5} unit="t" on={editable} onChange={(v) => set({ heelT: v })} digits={1} />
            <Cell label="Scheduled to tap" value={num(vm.scheduledT, 1)} unit="t" />
            <Cell label="Tapped steel" value={num(vm.tappedT, 1)} unit="t" />
          </Box>
          <Box title="Consumptions" className="h3-cons">
            <Cell label="Electricity" value={num(vm.energyKwh / 1_000, 2)} unit="MWh" />
            <Cell label="Cost (heat)" value={mode === 'sim' ? num(heat.costRM) : '—'} unit="RM" />
            <Cell label="CO₂ (heat)" value={mode === 'sim' ? num(heat.co2Kg / 1_000, 1) : '—'} unit="t" />
            <Cell label="kWh/t (heat)" value={mode === 'sim' ? num(kwhPerT) : '—'} tone={mode === 'sim' && kwhPerT > 580 ? 'red' : undefined} />
          </Box>
        </div>
        {mode === 'live' && <Box title={`Live Monitoring · ${lf} · last hour`}>
          {(() => { const hh = (liveState.history[lf] ?? []).slice(-60); return <TrendChart x={hh.map((r) => clockOf(r.t))} series={[{ label: 'MW', values: hh.map((r) => r.kw / 1_000), color: '#facc15' }, { label: 'Flow ÷ 20', values: hh.map((r) => r.flowM3h / 20), color: '#38bdf8' }, { label: 'Leak mA', values: hh.map((r) => r.leakMA), color: '#f87171' }]} height={170} width={640} /> })()}
          <div className="h3-legend"><span className="y">Power MW</span><span className="b">Coil water flow ÷ 20</span><span className="r">Earth leakage mA</span></div>
        </Box>}
        {mode === 'sim' && <Box title="Heat Monitoring">
          <TrendChart x={trendPts.map((p) => dur(p.min))} series={[{ label: 'MW', values: trendPts.map((p) => p.powerKW / 1_000), color: '#facc15' }, { label: '°C ÷ 50', values: trendPts.map((p) => p.phase === 'charging' && sp.heelT === 0 ? null : p.bathC / 50), color: '#f87171' }]} bands={[{ from: Math.max(0, cursor - 0.5), to: cursor + 0.5 }]} height={170} width={640} />
          <div className="h3-legend"><span className="y">Power MW</span><span className="r">Bath °C ÷ 50</span></div>
        </Box>}
      </div>

      <div className="h3-right">
        <div className="h3-stations">
          <Box title="Main Breaker"><div className="h3-breaker"><b>{vm.powerKW > 0 || vm.phase === 'holding' ? 'Closed' : 'Closed'}</b><div><button type="button">OK</button><button type="button">OPEN</button><button type="button" className="green">CLOSE</button></div></div></Box>
          <Box title="Hydraulic Station"><Station name="" ok={true} text={vm.tiltDeg ? `Tilting ${vm.tiltDeg}°` : 'Running'} /></Box>
          <Box title="Coil Water Station"><Station name="" ok={!activeAlarms.some((a) => a.level === 'alarm')} text={activeAlarms.some((a) => a.level === 'alarm') ? 'ALARM' : 'Running'} /></Box>
          <Box title="Lid Drive"><Station name="" ok={vm.lidOpen ? null : true} text={vm.lidOpen ? 'OPEN' : 'CLOSED'} /></Box>
        </div>
        <Box title="Cooling Systems">
          <div className="h3-cool">
            {[{ n: 'Coil cooling', mul: [1, 1.06, 0.95] }, { n: 'Yoke cooling', mul: [0.55, 0.6, 0.5] }].map((c) => <div key={c.n} className="h3-coolbox">
              <div className="h3-sub">{c.n}</div>
              <Cell label="Average:" value={vm.water ? `${num(vm.water.inC + (vm.water.outC - vm.water.inC) * c.mul[0], 1)} °C` : '—'} />
              <Cell label="Max: circuit 2" value={vm.water ? `${num(vm.water.inC + (vm.water.outC - vm.water.inC) * c.mul[1], 1)} °C` : '—'} tone={c.n === 'Coil cooling' && vm.water && vm.water.outC > 55 ? 'red' : undefined} />
              <Cell label="Min: circuit 3" value={vm.water ? `${num(vm.water.inC + (vm.water.outC - vm.water.inC) * c.mul[2], 1)} °C` : '—'} />
              <div className={`h3-operative ${c.n === 'Coil cooling' && activeAlarms.some((a) => a.level === 'alarm') ? 'bad' : ''}`}>{c.n === 'Coil cooling' && activeAlarms.some((a) => a.level === 'alarm') ? 'ALARM' : 'Operative'}</div>
            </div>)}
          </div>
          <Num label="Coil water flow" value={sp.waterFlowM3h} min={150} max={600} step={10} unit="m³/h" on={editable} onChange={(v) => set({ waterFlowM3h: v })} />
          <Num label="Water inlet" value={sp.waterInC} min={20} max={45} step={0.5} unit="°C" on={editable} onChange={(v) => set({ waterInC: v })} digits={1} />
          <Cell label="Heat to coil water" value={vm.water ? `${num(vm.water.heatKW / 1_000, 2)} MW` : '—'} unit={vm.water && vm.powerKW > 1_000 ? `${num(vm.water.heatKW / vm.powerKW * 100)}% of power` : undefined} />
        </Box>
        <Box title="Process Set Points">
          <Num label="Tap aim" value={sp.tapAimC} min={1_560} max={1_700} step={5} unit="°C" on={editable} onChange={(v) => set({ tapAimC: v })} />
          <Num label="Holding" value={sp.holdMin} min={0} max={60} step={1} unit="min" on={editable} onChange={(v) => set({ holdMin: v })} />
          <Num label="Lid open (extra)" value={sp.lidOpenMin} min={0} max={30} step={1} unit="min" on={editable} onChange={(v) => set({ lidOpenMin: v })} />
          <label className={`h3-check ${editable ? '' : 'off'}`}><input type="checkbox" checked={sp.coldLining} disabled={!editable} onChange={(e) => set({ coldLining: e.target.checked })} />Cold lining (first heat)</label>
        </Box>
      </div>
    </div>}

    {screen !== 'furnace' && <div className="h3-alt">
      {screen === 'shop' && <ShopScreen now={now} />}
      {screen === 'trends' && <TrendsScreen melt={melt} f={f} t={Math.floor(repT)} />}
      {screen === 'energy' && <MeltEnergy melt={melt} />}
      {screen === 'events' && <EventsScreen now={now} />}
      {screen !== 'energy' && <p className="h3-note">This screen shows your uploaded data at the replay time ({stamp(Math.floor(repT))}). Switch to “Replay data” to move through it.</p>}
    </div>}

    {mode === 'live' && <div className="h3-faults"><b>Demo faults on {lf}</b>{faults.map((x) => <button key={x.id} type="button" title={x.what} onClick={() => live.inject(x.id, lf)} className={liveState.faults[x.id]?.furnace === lf ? 'on' : ''}>{x.label}</button>)}<button type="button" className="clear" onClick={() => live.clearFaults()}>Clear faults</button><span>Simulated live feed · in a plant this comes from sensors and the PLC through Supabase</span></div>}
    {mode === 'replay' && <div className="h3-replay"><input type="range" min={tMin} max={tMax} value={repT} onChange={(e) => { setPlay(false); setRepT(Number(e.target.value)) }} aria-label="Replay time" /><span>{stamp(Math.floor(repT))}</span></div>}

    <div className={`h3-alarmbar ${activeAlarms.length ? 'on' : ''}`} role="status">
      <b>{activeAlarms.length}</b><span>{new Date().toLocaleDateString('en-GB')}</span><span>{clock}</span><span>Alarms</span>
      <span className="h3-alarmtext">{activeAlarms[0]?.text ?? 'No active alarms'}</span>
      {activeAlarms[1] && <span className="h3-alarmtext">{activeAlarms[1].text}</span>}
    </div>
    <nav className="h3-fkeys" aria-label="Screens">
      <div className="h3-fk-home">Monitoring</div>
      {fkeys.map((k) => <button key={k.key} type="button" className={k.id && screen === k.id ? 'on' : ''} disabled={!k.id} onClick={() => k.id && setScreen(k.id)}><small>{k.key}</small>{k.label}</button>)}
      <button type="button" className="h3-ack" onClick={() => setAcked(new Set([...acked, ...vm.alarms.map((a) => a.text)]))}>⚠<small>Ack</small></button>
    </nav>
  </div>
}
