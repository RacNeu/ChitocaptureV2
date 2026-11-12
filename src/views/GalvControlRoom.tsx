import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkline } from '../components/Charts'
import type { GalvFrame } from '../components/GalvHall3D'
import type { UnitTooltip } from '../components/SteelHall3D'
import { num, ringgit, tonnes } from '../format'
import { gridFactor } from '../model/factors'
import { useFactory } from '../model/store'
import { cbamPhaseIn } from '../model/steel'
import { galvFromSite } from '../model/siteLink'
import DataLinkNote from '../components/DataLinkNote'
import { SIM_EVENT, type SimCommand } from '../model/simEvents'
import {
  dieSchedule, drawMachineTph, galvAnnual, galvCbamDirectKgPerT, galvIntensity, galvLive, galvTonnesPerHour, galvUnitCo2,
  galvUnits, galvUpgradeImpacts, galvUpgradeInfo, noGalvUpgrades, trueStrain, type GalvParams, type GalvUnitId, type GalvUpgrades,
} from '../model/galv'

const GalvHall3D = lazy(() => import('../components/GalvHall3D'))
const KettleDeepDive = lazy(() => import('../components/KettleDeepDive'))

const speeds = [{ label: '⏸', value: 0 }, { label: '1 min/s', value: 1 }, { label: '5 min/s', value: 5 }, { label: '30 min/s', value: 30 }]

export default function GalvControlRoom({ onChooseSite }: { onChooseSite: () => void }) {
  const state = useFactory()
  const link = useMemo(() => galvFromSite(state), [state])
  const params: GalvParams = useMemo(() => ({
    ...link.params,
    gridKgPerKWh: gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh),
    electricityRMPerMWh: state.settings.electricityPriceRMPerMWh,
    gasRMPerGJ: state.settings.fuelPriceRMPerGJ['natural-gas'],
  }), [state.settings, link])
  const [upgrades, setUpgrades] = useState<GalvUpgrades>(noGalvUpgrades)
  const [speed, setSpeed] = useState(1)
  const [showFlows, setShowFlows] = useState(true)
  const [selected, setSelected] = useState<GalvUnitId | null>(null)
  const [inside, setInside] = useState(false)
  const [heatmap, setHeatmap] = useState(false)
  // The guided tour opens the kettle view, selects units and shows the heat map through this event.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<SimCommand>).detail
      if (command.dive !== undefined) setInside(command.dive === 'kettle')
      if (command.select !== undefined) setSelected(command.select as GalvUnitId | null)
      if (command.heatmap !== undefined) setHeatmap(command.heatmap)
    }
    window.addEventListener(SIM_EVENT, onCommand)
    return () => window.removeEventListener(SIM_EVENT, onCommand)
  }, [])
  const [carbonPrice, setCarbonPrice] = useState(35)
  const [cbamInputs, setCbamInputs] = useState({ exportTPerYear: 30_000, euPriceEUR: 75, rmPerEUR: 5, year: 2030 })

  const frame = useRef<GalvFrame>({ minutes: 0, live: galvLive(params, upgrades, 0), upgrades, params })
  const totals = useRef({ wireT: 0, co2T: 0, zincKg: 0, history: [] as { mw: number; co2: number }[] })
  const [, setTick] = useState(0)
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => { frame.current = { ...frame.current, upgrades, params, live: galvLive(params, upgrades, frame.current.minutes) } }, [upgrades, params])
  useEffect(() => {
    let raf = 0, last = performance.now(), lastPublish = 0, lastSample = 0
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const seconds = Math.min(0.1, (now - last) / 1_000)
      last = now
      const minutesStep = seconds * speedRef.current
      const current = frame.current
      const minutes = current.minutes + minutesStep
      const live = galvLive(current.params, current.upgrades, minutes)
      frame.current = { ...current, minutes, live }
      totals.current.wireT += live.wireTPerH * minutesStep / 60
      totals.current.co2T += live.co2TPerH * minutesStep / 60
      totals.current.zincKg += live.zincKgPerH * minutesStep / 60
      if (minutes - lastSample >= 0.5) { lastSample = minutes; totals.current.history = [...totals.current.history, { mw: live.totalMW, co2: live.co2TPerH }].slice(-240) }
      if (now - lastPublish > 250) { lastPublish = now; setTick((value) => value + 1) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const live = frame.current.live
  const base = galvIntensity(params, noGalvUpgrades)
  const now = galvIntensity(params, upgrades)
  const baseYear = galvAnnual(params, noGalvUpgrades)
  const nowYear = galvAnnual(params, upgrades)
  const impacts = galvUpgradeImpacts(params, upgrades)
  const capex = impacts.reduce((sum, item) => sum + item.capexRM, 0)
  const minutes = frame.current.minutes
  const clock = `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes) % 60).padStart(2, '0')}`
  const unitCo2 = (id: GalvUnitId) => galvUnitCo2(params, upgrades, live, id)
  const ranked = galvUnits.map((unit) => ({ unit, co2: unitCo2(unit.id) })).sort((a, b) => b.co2 - a.co2)
  const running = live.machinesRunning.filter(Boolean).length
  const machineTarget = (id: GalvUnitId) => state.machines.find((machine) => machine.name === galvUnits.find((unit) => unit.id === id)?.machineName)?.targetPerT

  const labels = galvUnits.map((unit) => ({
    id: unit.id,
    text: unit.id === 'drawing' ? `Drawing · ${num(live.mw.drawing, 2)} MW` : unit.id === 'anneal' ? (upgrades.induction ? `Induction anneal · ${num(live.mw.anneal, 2)} MW` : `Annealing · ${num(live.annealGJPerH)} GJ/h gas`) : unit.id === 'kettle' ? `Zinc kettles · ${num(live.kettleGJPerH)} GJ/h gas` : `${unit.short} · ${num(live.mw[unit.id] * 1_000)} kW`,
    hot: unit.id === ranked[0].unit.id,
    ...(() => {
      const target = machineTarget(unit.id)
      const actual = unit.id === 'anneal' ? now.annealGJPerT : unit.id === 'kettle' ? now.kettleGJPerT : unit.id === 'drawing' ? now.kwh.drawing : unit.id === 'pickling' ? now.kwh.pickling : unit.id === 'utilities' ? now.kwh.utilities : now.kwh.wastewater
      const above = target !== undefined && actual > target * 1.02
      return { sub: `${num(unitCo2(unit.id), 2)} t CO₂/h${target !== undefined ? ` · ${above ? `▲ ${num((actual / target - 1) * 100)}% over target` : '✓ on target'}` : ''}`, above }
    })(),
  }))

  const describe = useCallback((id: GalvUnitId): UnitTooltip | null => {
    const unit = galvUnits.find((item) => item.id === id)
    if (!unit) return null
    const f = frame.current
    const co2 = galvUnitCo2(f.params, f.upgrades, f.live, id)
    const share = `${num(co2 / Math.max(1e-9, f.live.co2TPerH) * 100)}%`
    const rows: [string, string][] =
      id === 'drawing' ? [['Machines drawing', `${f.live.machinesRunning.filter(Boolean).length} of ${f.params.drawMachines}`], ['Power now', `${num(f.live.mw.drawing, 2)} MW`], ['CO₂ now', `${num(co2, 2)} t/h`], ['Share of plant CO₂', share]]
        : id === 'anneal' ? [[f.upgrades.induction ? 'Induction power' : 'Gas burnt', f.upgrades.induction ? `${num(f.live.mw.anneal, 2)} MW` : `${num(f.live.annealGJPerH, 1)} GJ/h`], ['Wire temperature', `${f.params.annealTempC} °C`], ['CO₂ now', `${num(co2, 2)} t/h`], ['Share of plant CO₂', share]]
          : id === 'kettle' ? [['Gas burnt', `${num(f.live.kettleGJPerH, 1)} GJ/h`], ['Zinc baths', f.live.kettleTempC.map((t) => `${num(t)} °C`).join(' · ')], ['Zinc used', `${num(f.live.zincKgPerH)} kg/h`], ['CO₂ now', `${num(co2, 2)} t/h`]]
            : [['Power now', `${num(f.live.mw[id] * 1_000)} kW`], ['CO₂ now', `${num(co2, 2)} t/h`], ['Share of plant CO₂', share]]
    return { title: unit.name, rows, note: unit.role }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (key: keyof GalvUpgrades) => setUpgrades((current) => {
    const next = { ...current, [key]: !current[key] }
    // Induction replaces the gas furnace, so a recuperator on it no longer applies, and vice versa.
    if (key === 'induction' && next.induction) next.recuperator = false
    if (key === 'recuperator' && next.recuperator) next.induction = false
    return next
  })

  const selectedCard = (() => {
    if (!selected) return null
    const unit = galvUnits.find((item) => item.id === selected)!
    const target = machineTarget(selected)
    const actual = selected === 'anneal' ? now.annealGJPerT : selected === 'kettle' ? now.kettleGJPerT : selected === 'drawing' ? now.kwh.drawing : selected === 'pickling' ? now.kwh.pickling : selected === 'utilities' ? now.kwh.utilities : now.kwh.wastewater
    const unitLabel = selected === 'anneal' || selected === 'kettle' ? 'GJ/t' : 'kWh/t'
    const above = target && actual > target * 1.02
    return <div className={`pilot-card${selected === 'anneal' || selected === 'kettle' ? ' eaf-card' : ''}`}>
      <div className="pilot-head"><span className="eaf-icon" aria-hidden="true">{selected === 'drawing' ? '⚙️' : selected === 'anneal' ? '🔥' : selected === 'kettle' ? '🫕' : selected === 'pickling' ? '🧪' : '💧'}</span><b>{unit.name}</b><button type="button" className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>✕</button></div>
      <p>{unit.role}</p>
      {selected === 'drawing' && <>
        <p><b>{running} of {params.drawMachines}</b> machines drawing; the rest are changing rod coils. Each draws {num(drawMachineTph(params), 2)} t/h at {params.drawSpeedMPerS} m/s.</p>
        <table className="grid-table die-table"><thead><tr><th>Die</th><th className="num">Out Ø mm</th><th className="num">Reduction</th><th className="num">Speed m/s</th></tr></thead>
          <tbody>{dieSchedule(params).map((die) => <tr key={die.die}><td>{die.die}</td><td className="num">{num(die.dOutMm, 2)}</td><td className="num">{num(die.reductionPct, 1)}%</td><td className="num">{num(die.speedMPerS, 1)}</td></tr>)}</tbody></table>
        <small>{params.rodDiaMm} mm rod → {params.wireDiaMm} mm wire: true strain {num(trueStrain(params), 2)}, {params.dies} dies at about {num(dieSchedule(params)[0].reductionPct)}% area reduction each.</small>
      </>}
      {selected === 'kettle' && <div className="kettle-lines">{live.kettleTempC.map((temp, line) => <div key={line}>
        <span>Line {line + 1}</span><div className="sharebar"><span className="fuel" style={{ width: `${live.burnerFiring[line] * 100}%` }} /></div><b>{num(temp, 1)} °C</b>
      </div>)}{!inside && <button type="button" className="btn small pilot-dive" onClick={() => setInside(true)}>🔍 Look inside the zinc kettle</button>}<small>Bar = burner firing rate. Each line carries {params.strandsPerLine} wires at {num(live.lineSpeedMPerMin, 1)} m/min; coating {num(upgrades.coatingControl ? params.coatingSpecGPerM2 + 8 : params.coatingGPerM2)} g/m² against a {params.coatingSpecGPerM2} g/m² specification.</small></div>}
      {target !== undefined && <small className={`perf-line ${above ? 'above' : 'ok'}`}>{num(actual, unitLabel === 'GJ/t' ? 2 : 0)} {unitLabel} · target {num(target, unitLabel === 'GJ/t' ? 2 : 0)} {unitLabel} {above ? `(+${num((actual / target - 1) * 100)}%)` : '✓'}</small>}
    </div>
  })()

  const g = params.gridKgPerKWh * (1 - upgrades.greenShare)
  const g0 = params.gridKgPerKWh
  type Row = { step: string; activity: string; factor: string; today: number; withUp: number; scope: 1 | 2 | 3 }
  const rows: Row[] = [
    { step: 'Pickling & pre-treatment · electricity', activity: `${num(now.kwh.pickling)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: base.kwh.pickling * g0, withUp: now.kwh.pickling * g, scope: 2 },
    { step: 'Wire drawing · electricity', activity: `${num(now.kwh.drawing)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: base.kwh.drawing * g0, withUp: now.kwh.drawing * g, scope: 2 },
    { step: 'Annealing furnaces · natural gas', activity: `${num(now.annealGJPerT, 2)} GJ/t`, factor: `${params.gasKgPerGJ} kg/GJ`, today: base.annealGJPerT * params.gasKgPerGJ, withUp: now.annealGJPerT * params.gasKgPerGJ, scope: 1 },
    ...(upgrades.induction ? [{ step: 'Induction annealing · electricity', activity: `${num(now.kwh.induction)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: 0, withUp: now.kwh.induction * g, scope: 2 as const }] : []),
    { step: 'Zinc kettles · natural gas', activity: `${num(now.kettleGJPerT, 2)} GJ/t`, factor: `${params.gasKgPerGJ} kg/GJ`, today: base.kettleGJPerT * params.gasKgPerGJ, withUp: now.kettleGJPerT * params.gasKgPerGJ, scope: 1 },
    { step: 'Line drives, wiping & take-up · electricity', activity: `${num(now.kwh.lineDrives)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: base.kwh.lineDrives * g0, withUp: now.kwh.lineDrives * g, scope: 2 },
    { step: 'Compressed air & cooling · electricity', activity: `${num(now.kwh.utilities)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: base.kwh.utilities * g0, withUp: now.kwh.utilities * g, scope: 2 },
    { step: 'Wastewater treatment · electricity', activity: `${num(now.kwh.wastewater)} kWh/t`, factor: `${num(g, 3)} kg/kWh`, today: base.kwh.wastewater * g0, withUp: now.kwh.wastewater * g, scope: 2 },
  ]
  const directCbam = (u: GalvUpgrades) => galvCbamDirectKgPerT(params, u) / 1_000
  const phaseIn = cbamPhaseIn[cbamInputs.year] ?? (cbamInputs.year > 2034 ? 1 : 0)
  const netPrice = Math.max(0, cbamInputs.euPriceEUR * cbamInputs.rmPerEUR - carbonPrice)
  const cbamCost = (u: GalvUpgrades) => directCbam(u) * netPrice * phaseIn

  return <div className="control">
    <header className="control-head">
      <div>
        <button type="button" className="link back-link" onClick={onChooseSite}>← Choose another site to simulate</button>
        <h1>{state.settings.factoryName} · live simulation</h1>
        <p className="muted">Wire drawing & continuous hot-dip galvanising · {params.galvLines} lines × {params.strandsPerLine} wires · {num(galvTonnesPerHour(params), 1)} t/h · illustrative sample plant</p>
        <DataLinkNote linked={link.linked} deviations={link.deviations} />
      </div>
      <div className="control-status">
        <span className="phase-badge melting"><i />{running}/{params.drawMachines} drawing · lines at {num(live.lineSpeedMPerMin, 1)} m/min</span>
        <span className="sim-clock">🕒 {clock}</span>
        <div className="toggle" role="radiogroup" aria-label="Simulation speed">{speeds.map((item) => <button key={item.value} type="button" role="radio" aria-checked={speed === item.value} className={speed === item.value ? 'active' : ''} onClick={() => setSpeed(item.value)}>{item.label}</button>)}</div>
        {inside && <button type="button" className="btn small ghost" onClick={() => setInside(false)}>← Back to the plant</button>}
        <label className="flow-switch"><input type="checkbox" checked={showFlows} onChange={(event) => setShowFlows(event.target.checked)} /> Energy flows</label>
        <label className="flow-switch"><input type="checkbox" checked={heatmap} onChange={(event) => setHeatmap(event.target.checked)} /> CO₂ heat map</label>
      </div>
    </header>

    <div className="tickers">
      <div className="ticker power"><span>Power now</span><strong>{num(live.totalMW, 2)} <small>MW</small></strong><Sparkline values={totals.current.history.map((item) => item.mw)} height={34} /></div>
      <div className="ticker co2"><span>CO₂ now</span><strong>{num(live.co2TPerH, 2)} <small>t/h</small></strong><Sparkline values={totals.current.history.map((item) => item.co2)} height={34} className="spark-co2" /></div>
      <div className="ticker"><span>CO₂ per tonne of wire</span><strong>{num(now.totalKgPerT)} <small>kg/t</small></strong><em className={now.totalKgPerT < base.totalKgPerT ? 'good' : ''}>{now.totalKgPerT < base.totalKgPerT ? `−${num((1 - now.totalKgPerT / base.totalKgPerT) * 100, 1)}% vs today` : now.totalKgPerT > base.totalKgPerT ? `+${num((now.totalKgPerT / base.totalKgPerT - 1) * 100, 1)}% vs today` : 'site, Scope 1 + 2'}</em></div>
      <div className="ticker"><span>Zinc used</span><strong>{num(live.zincKgPerH)} <small>kg/h</small></strong><em>{num(now.zincKgPerT, 1)} kg/t · {num(now.zincKgCO2PerT)} kg CO₂e/t upstream</em></div>
      <div className="ticker"><span>This run</span><strong>{num(totals.current.wireT)} <small>t wire</small></strong><em>{num(totals.current.co2T, 1)} t CO₂ · {num(totals.current.zincKg / 1_000, 1)} t zinc</em></div>
    </div>

    <div className="control-main">
      <div className="hall-card">
        <Suspense fallback={<div className="plant3d loading">Loading…</div>}>
          {inside
            ? <KettleDeepDive frame={frame} onClose={() => setInside(false)} />
            : <GalvHall3D frame={frame} showFlows={showFlows} selected={selected} onSelect={setSelected} onDive={() => { setSelected('kettle'); setInside(true) }} heatmap={heatmap} co2Of={unitCo2} labels={labels} describe={describe} />}
        </Suspense>
        {showFlows && !inside && <div className="flow-legend"><span><i className="fl-power" />Electricity</span><span><i className="fl-gas" />Natural gas</span><span><i className="fl-smoke" />CO₂ to air</span></div>}
      </div>
      <aside className="panel live-panel">
        {!selected && <p className="pick-hint">Click a unit in the plant to see its details: the drawing machines show their die schedule, the zinc kettles their bath temperatures. Double-click the zinc kettles to go inside.</p>}
        {selectedCard}
        <h2>Where the CO₂ is coming from right now</h2>
        <ul className="unit-bars">
          {ranked.map(({ unit, co2 }) => <li key={unit.id}>
            <button type="button" className={selected === unit.id ? 'active' : ''} onClick={() => setSelected(unit.id)}>
              <span>{unit.short}</span><b>{num(co2, 2)} t/h</b>
              <div className="sharebar"><span className={unit.id === 'anneal' || unit.id === 'kettle' ? 'fuel' : 'elec'} style={{ width: `${Math.min(100, co2 / Math.max(1e-9, live.co2TPerH) * 100)}%` }} /></div>
            </button>
          </li>)}
        </ul>
        <div className="split">
          <div><span>Grid electricity (indirect)</span><b>{num(live.indirectTPerH, 2)} t/h</b></div>
          <div><span>Gas burnt on site (direct)</span><b>{num(live.directTPerH, 2)} t/h</b></div>
          <div><span>Zinc bought in (upstream, Scope 3)</span><b>{num(live.zincKgPerH * params.zincKgCO2PerKg / 1_000, 2)} t/h</b></div>
        </div>
        <p className="muted small">Drawing power dips as machines stop for rod-coil changes; the zinc kettles’ gas swings as their burners hold the bath at {params.kettleTempC} °C.</p>
      </aside>
    </div>

    <section className="card ledger">
      <header><div><h2>📒 Carbon ledger: where each kg of CO₂ per tonne of wire comes from</h2><p className="muted">Every line is activity × emission factor. Scope 1 is gas burnt on site; Scope 2 is grid electricity; the zinc is a bought-in material (Scope 3), shown below the site total because it is about as large as the site’s own emissions.</p></div>
        <div className="sandbox-result"><span>Per tonne of wire</span><strong>{num(now.totalKgPerT)} kg CO₂</strong><em>Scope 1: {num(now.directKgPerT)} · Scope 2: {num(now.indirectKgPerT)}</em></div></header>
      <div className="table-wrap"><table className="grid-table ledger-table">
        <thead><tr><th>Process step & source</th><th>Activity per tonne</th><th>Factor</th><th className="num">Today kg/t</th><th className="num">With upgrades</th><th>Scope</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.step}>
          <td>{row.step}</td><td>{row.activity}</td><td>{row.factor}</td>
          <td className="num">{num(row.today, 1)}</td>
          <td className={`num${row.withUp < row.today ? ' delta' : ''}`}>{num(row.withUp, 1)}</td>
          <td><span className={`scope s${row.scope}`}>Scope {row.scope}</span></td>
        </tr>)}</tbody>
        <tfoot>
          <tr><td colSpan={3}>Site total per tonne of wire</td><td className="num">{num(base.totalKgPerT)}</td><td className="num delta">{num(now.totalKgPerT)}</td><td /></tr>
          <tr><td>Zinc for the coating (not in the site total)</td><td>{num(now.zincKgPerT, 1)} kg/t</td><td>{params.zincKgCO2PerKg} kg CO₂e/kg zinc</td><td className="num">{num(base.zincKgCO2PerT)}</td><td className={`num${now.zincKgCO2PerT < base.zincKgCO2PerT ? ' delta' : ''}`}>{num(now.zincKgCO2PerT)}</td><td><span className="scope s3">Scope 3</span></td></tr>
        </tfoot>
      </table></div>
      <p className="muted small">Grid factor from Settings{upgrades.greenShare > 0 ? `, reduced by the ${num(upgrades.greenShare * 100)}% green-electricity share` : ''}. Natural gas: IPCC 2006 default. Zinc: International Zinc Association global average for primary zinc (3.5 kg CO₂e/kg). Drawing energy from flow stress × strain ÷ efficiency, checked against Suliga et al. (2023). Plant figures are an illustrative sample.</p>
    </section>

    <section className="card sandbox">
      <header><div><h2>🧪 What-if sandbox</h2><p className="muted">Switch upgrades on and watch the plant, the tickers and CBAM exposure respond. Savings include zinc, the biggest running cost of a galvanising line.</p></div>
        <div className="sandbox-result"><span>CO₂ per year (site)</span><strong>{tonnes(nowYear.co2T)}</strong><em className={nowYear.co2T < baseYear.co2T ? 'good' : ''}>{nowYear.co2T < baseYear.co2T ? `−${tonnes(baseYear.co2T - nowYear.co2T)} (−${num((1 - nowYear.co2T / baseYear.co2T) * 100, 1)}%)` : nowYear.co2T > baseYear.co2T ? `+${tonnes(nowYear.co2T - baseYear.co2T)} more than today` : 'no upgrades yet'}</em><small>zinc {num(nowYear.zincT)} t/yr · capex {ringgit(capex)}</small></div>
      </header>
      <div className="upgrade-grid">
        {galvUpgradeInfo.map((info) => {
          const impact = impacts.find((item) => item.info.key === info.key)
          const isSlider = info.key === 'greenShare'
          const on = Boolean(upgrades[info.key])
          return <article key={info.key} className={`upgrade${on ? ' on' : ''}`}>
            <div className="upgrade-top">
              <strong>{info.name}</strong>
              {!isSlider && <label className="switch"><input type="checkbox" checked={on} onChange={() => toggle(info.key)} /><span /></label>}
            </div>
            <p>{info.what}</p>
            {isSlider && <label className="slider">Green share of electricity
              <input type="range" min="0" max="1" step="0.05" value={upgrades.greenShare} onChange={(event) => setUpgrades({ ...upgrades, greenShare: Number(event.target.value) })} />
              <output>{num(upgrades.greenShare * 100)}%</output></label>}
            {impact ? <div className="upgrade-stats">
              <span><b>{impact.savedKgPerT >= 0 ? '−' : '+'}{num(Math.abs(impact.savedKgPerT), 1)}</b> kg/t</span>
              <span><b>{impact.savedTPerYear >= 0 ? '−' : '+'}{tonnes(Math.abs(impact.savedTPerYear))}</b>/yr</span>
              {impact.zincSavedT > 0 && <span><b>−{num(impact.zincSavedT)} t</b> zinc</span>}
              <span><b>{impact.capexRM ? ringgit(impact.capexRM) : '—'}</b> capex</span>
              <span><b>{impact.paybackYears ? `${num(impact.paybackYears, 1)} yr` : impact.annualSavingRM < 0 ? 'costs more' : '—'}</b> payback</span>
            </div> : <small className="muted">{info.basis}</small>}
          </article>
        })}
      </div>
    </section>

    <section className="card cbam">
      <header><div><h2>🇪🇺 CBAM exposure (simplified)</h2><p className="muted">Steel wire is in CBAM’s scope. Its embedded direct emissions include the plant’s own gas <b>and the wire rod it was made from</b>, so verified data from the rod supplier matter as much as the plant’s own figures.</p></div></header>
      <div className="cbam-grid">
        <div className="form-grid compact">
          <label className="field">Year<select value={cbamInputs.year} onChange={(event) => setCbamInputs({ ...cbamInputs, year: Number(event.target.value) })}>{[2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map((year) => <option key={year}>{year}</option>)}</select></label>
          <label className="field">Wire exported to the EU (t/yr)<input type="number" min="0" step="5000" value={cbamInputs.exportTPerYear} onChange={(event) => setCbamInputs({ ...cbamInputs, exportTPerYear: Number(event.target.value) })} /></label>
          <label className="field">EU carbon price (€/t)<input type="number" min="0" value={cbamInputs.euPriceEUR} onChange={(event) => setCbamInputs({ ...cbamInputs, euPriceEUR: Number(event.target.value) })} /></label>
          <label className="field">Exchange rate (RM per €)<input type="number" min="0" step="0.1" value={cbamInputs.rmPerEUR} onChange={(event) => setCbamInputs({ ...cbamInputs, rmPerEUR: Number(event.target.value) })} /></label>
          <label className="field">Malaysian carbon price paid (RM/t)<input type="range" min="0" max="200" step="5" value={carbonPrice} onChange={(event) => setCarbonPrice(Number(event.target.value))} /><output>RM {carbonPrice}</output></label>
        </div>
        <table className="grid-table cbam-table">
          <thead><tr><th /><th className="num">Today</th><th className="num">With upgrades</th></tr></thead>
          <tbody>
            <tr><td>Wire rod precursor (direct, from the steel mill)</td><td className="num" colSpan={2}>{num(params.rodDirectKgPerT * 1.02 / 1_000, 3)} t/t</td></tr>
            <tr><td>This plant’s gas (direct)</td><td className="num">{num(base.directKgPerT / 1_000, 3)} t/t</td><td className="num">{num(now.directKgPerT / 1_000, 3)} t/t</td></tr>
            <tr><td>Embedded direct emissions (charged)</td><td className="num">{num(directCbam(noGalvUpgrades), 3)} t/t</td><td className="num">{num(directCbam(upgrades), 3)} t/t</td></tr>
            <tr><td>Phase-in in {cbamInputs.year}</td><td className="num" colSpan={2}>{num(phaseIn * 100, 1)}% of the full charge</td></tr>
            <tr className="strong"><td>CBAM cost per tonne exported</td><td className="num">{ringgit(cbamCost(noGalvUpgrades))}</td><td className="num">{ringgit(cbamCost(upgrades))}</td></tr>
            <tr className="strong"><td>CBAM cost per year</td><td className="num">{ringgit(cbamCost(noGalvUpgrades) * cbamInputs.exportTPerYear)}</td><td className="num good">{ringgit(cbamCost(upgrades) * cbamInputs.exportTPerYear)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">Simplified illustration only. The rod figure assumes rod from the group’s own scrap-based mini-mill with verified data; rod from a blast-furnace route would carry several times more. Real CBAM reporting uses verified installation data, product-specific rules and EU default values. Check the current regulation before relying on any figure.</p>
    </section>
  </div>
}
