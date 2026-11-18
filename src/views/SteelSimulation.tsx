import ScenarioToPlan from '../components/ScenarioToPlan'
import { steelScenario } from '../model/scenario'
import { FlagEU } from '../components/Flags'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EU_CARBON_PRICE_EUR, RM_PER_EUR } from '../model/prices'
import { Sparkline } from '../components/Charts'
import type { PickId, SimFrame, UnitTooltip } from '../components/SteelHall3D'
import { SIM_EVENT, type SimCommand } from '../model/simEvents'
import { num, ringgit, tonnes } from '../format'
import { gridFactor } from '../model/factors'
import { useFactory } from '../model/store'
import { takePendingUnit } from '../model/focus'
import { steelFromSite } from '../model/siteLink'
import DataLinkNote from '../components/DataLinkNote'
import FullscreenButton from '../components/FullscreenButton'
import { annual, cbam, steelTargets, intensity, liveState, noUpgrades, steelUnits, tonnesPerHour, upgradeImpacts, upgradeInfo, type SteelParams, type UnitId, type Upgrades } from '../model/steel'

const SteelHall3D = lazy(() => import('../components/SteelHall3D'))
const MeltDeepDive = lazy(() => import('../components/MeltDeepDive'))

const speeds = [{ label: '⏸', value: 0 }, { label: '1 min/s', value: 1 }, { label: '5 min/s', value: 5 }, { label: '30 min/s', value: 30 }]
const electricUnits: Exclude<UnitId, 'scrap' | 'reheat'>[] = ['melt', 'rolling', 'lf', 'fume', 'utilities', 'caster']

export default function SteelSimulation() {
  const state = useFactory()
  const link = useMemo(() => steelFromSite(state), [state])
  const params: SteelParams = useMemo(() => ({
    ...link.params,
    gridKgPerKWh: gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh),
    electricityRMPerMWh: state.settings.electricityPriceRMPerMWh,
    gasRMPerGJ: state.settings.fuelPriceRMPerGJ['natural-gas'],
  }), [state.settings, link])
  const [upgrades, setUpgrades] = useState<Upgrades>(noUpgrades)
  const [speed, setSpeed] = useState(1)
  const [showFlows, setShowFlows] = useState(true)
  const [deepDive, setDeepDive] = useState<null | 'melt'>(null)
  const [heatmap, setHeatmap] = useState(false)
  const [selected, setSelected] = useState<PickId | null>(() => takePendingUnit() as PickId | null)

  // The guided tour opens zoomed-in views and selects units through this event.
  useEffect(() => {
    const onCommand = (event: Event) => {
      const command = (event as CustomEvent<SimCommand>).detail
      if (command.dive !== undefined && command.dive !== 'kettle') setDeepDive(command.dive)
      if (command.heatmap !== undefined) setHeatmap(command.heatmap)
      if (command.select !== undefined) setSelected(command.select as PickId | null)
    }
    window.addEventListener(SIM_EVENT, onCommand)
    return () => window.removeEventListener(SIM_EVENT, onCommand)
  }, [])
  const [carbonPrice, setCarbonPrice] = useState(35)
  const [cbamInputs, setCbamInputs] = useState({ exportTPerYear: 100_000, euPriceEUR: EU_CARBON_PRICE_EUR, rmPerEUR: RM_PER_EUR, year: 2030 })

  // Simulation clock: advanced every animation frame, published to React four times a second.
  const hallCardRef = useRef<HTMLDivElement>(null)
  const frame = useRef<SimFrame>({ minutes: 0, live: liveState(params, upgrades, 0), upgrades, params })
  const totals = useRef({ steelT: 0, co2T: 0, history: [] as { mw: number; co2: number }[] })
  const [, setTick] = useState(0)
  const speedRef = useRef(speed)
  speedRef.current = speed
  useEffect(() => { frame.current = { ...frame.current, upgrades, params, live: liveState(params, upgrades, frame.current.minutes) } }, [upgrades, params])
  useEffect(() => {
    let raf = 0, last = performance.now(), lastPublish = 0, lastSample = 0
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const seconds = Math.min(0.1, (now - last) / 1_000)
      last = now
      const minutesStep = seconds * speedRef.current
      const current = frame.current
      const minutes = current.minutes + minutesStep
      const live = liveState(current.params, current.upgrades, minutes)
      frame.current = { ...current, minutes, live }
      totals.current.steelT += tonnesPerHour(current.params) * minutesStep / 60
      totals.current.co2T += live.co2TPerH * minutesStep / 60
      if (minutes - lastSample >= 0.5) { lastSample = minutes; totals.current.history = [...totals.current.history, { mw: live.totalMW, co2: live.co2TPerH }].slice(-240) }
      if (now - lastPublish > 250) { lastPublish = now; setTick((value) => value + 1) }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  const live = frame.current.live
  const base = intensity(params, noUpgrades)
  const now = intensity(params, upgrades)
  const baseYear = annual(params, noUpgrades)
  const nowYear = annual(params, upgrades)
  const impacts = upgradeImpacts(params, upgrades)
  const capex = impacts.reduce((sum, item) => sum + item.capexRM, 0)
  const cbamBase = cbam(base, { ...cbamInputs, malaysiaPriceRM: carbonPrice })
  const cbamNow = cbam(now, { ...cbamInputs, malaysiaPriceRM: carbonPrice })
  const minutes = frame.current.minutes
  const clock = `Day ${Math.floor(minutes / 1440) + 1} · ${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(Math.floor(minutes) % 60).padStart(2, '0')}`
  const topUnit = electricUnits.reduce((best, id) => live.mw[id] > live.mw[best] ? id : best, 'melt' as Exclude<UnitId, 'scrap' | 'reheat'>)

  /** CO₂ rate of one unit (t/h) for a given live snapshot. */
  const unitCo2At = (snapshot: SimFrame, id: UnitId) => {
    const { live: l, params: p, upgrades: u } = snapshot
    if (id === 'reheat') return l.reheatGJPerH * p.gasKgPerGJ / 1_000
    if (id === 'scrap') return 0
    const electric = l.mw[id] * p.gridKgPerKWh * (1 - u.greenShare)
    return id === 'melt' ? electric + (l.phase === 'Melting' || l.phase === 'Holding' ? p.meltDirectKgPerT * tonnesPerHour(p) / 1_000 / 0.8 : 0) : electric
  }
  const unitCo2 = (id: UnitId) => unitCo2At(frame.current, id)
  const labels = steelUnits.filter((unit) => unit.id !== 'scrap').map((unit) => ({
    id: unit.id,
    text: unit.id === 'reheat' ? `${unit.short} · ${num(live.reheatGJPerH)} GJ/h gas` : `${unit.short} · ${num(live.mw[unit.id as Exclude<UnitId, 'scrap' | 'reheat'>], 1)} MW`,
    ...(() => {
      const id = unit.id as Exclude<UnitId, 'scrap'>
      const actual = id === 'reheat' ? now.reheatGJPerT : now.kwh[id]
      const target = steelTargets[id]
      const above = actual > target * 1.02
      return { sub: `${num(unitCo2(id), 1)} t CO₂/h · ${above ? `▲ ${num((actual / target - 1) * 100)}% over target` : '✓ on target'}`, above }
    })(),
    hot: unit.id === topUnit || unit.id === 'reheat' && unitCo2('reheat') > unitCo2(topUnit),
  }))
  const describe = useCallback((id: PickId): UnitTooltip | null => {
    const unit = steelUnits.find((item) => item.id === id)
    if (!unit) return null
    // Always read the latest frame so the hover card matches the side panel.
    const f = frame.current
    const co2 = unitCo2At(f, id)
    const rows: [string, string][] = id === 'reheat'
      ? [['Gas burnt', `${num(f.live.reheatGJPerH)} GJ/h`], ['CO₂ now', `${num(co2, 1)} t/h`], ['Share of plant CO₂', `${num(co2 / Math.max(1e-9, f.live.co2TPerH) * 100)}%`]]
      : id === 'scrap' ? [['Steel throughput', `${num(tonnesPerHour(f.params))} t/h`], ['Heat', `#${f.live.heatNumber} · ${f.live.phase}`]]
        : [['Power now', `${num(f.live.mw[id], 1)} MW`], ['CO₂ now', `${num(co2, 1)} t/h`], ['Share of plant CO₂', `${num(co2 / Math.max(1e-9, f.live.co2TPerH) * 100)}%`], ['Per tonne', `${num(intensity(f.params, f.upgrades).kwh[id])} kWh/t`]]
    if (id === 'melt') rows.unshift(['Phase', `${f.live.phase} (${num(f.live.phaseProgress * 100)}%)`])
    return { title: unit.name, rows, note: unit.role }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (key: keyof Upgrades) => setUpgrades((current) => ({ ...current, [key]: !current[key] }))

  return <div className="control">


    <header className="control-head">
      <div>
        <h1>{state.settings.factoryName} · live simulation</h1>
        <p className="muted">Induction furnace + ladle furnace route · {num(tonnesPerHour(params))} t/h · illustrative sample plant</p>
        <DataLinkNote linked={link.linked} deviations={link.deviations} />
      </div>
      <div className="control-status">
        <span className={`phase-badge ${live.phase.toLowerCase()}`}><i />Heat #{live.heatNumber} · {live.phase} {num(live.phaseProgress * 100)}%</span>
        <span className="sim-clock">{clock}</span>
        <div className="toggle" role="radiogroup" aria-label="Simulation speed">{speeds.map((item) => <button key={item.value} type="button" role="radio" aria-checked={speed === item.value} className={speed === item.value ? 'active' : ''} onClick={() => setSpeed(item.value)}>{item.label}</button>)}</div>
        {deepDive && <button type="button" className="btn small ghost" onClick={() => setDeepDive(null)}>← Back to the mill</button>}
        <label className="flow-switch"><input type="checkbox" checked={showFlows} onChange={(event) => setShowFlows(event.target.checked)} /> Energy flows</label>
        <label className="flow-switch"><input type="checkbox" checked={heatmap} onChange={(event) => setHeatmap(event.target.checked)} /> CO₂ heat map</label>
      </div>
    </header>

    <div className="tickers">
      <div className="ticker power"><span>Power now</span><strong>{num(live.totalMW, 1)} <small>MW</small></strong><Sparkline values={totals.current.history.map((item) => item.mw)} height={34} /></div>
      <div className="ticker co2"><span>CO₂ now</span><strong>{num(live.co2TPerH, 1)} <small>t/h</small></strong><Sparkline values={totals.current.history.map((item) => item.co2)} height={34} className="spark-co2" /></div>
      <div className="ticker"><span>CO₂ per tonne of steel</span><strong>{num(now.totalKgPerT)} <small>kg/t</small></strong><em className={now.totalKgPerT < base.totalKgPerT ? 'good' : ''}>{now.totalKgPerT < base.totalKgPerT ? `−${num((1 - now.totalKgPerT / base.totalKgPerT) * 100, 1)}% vs today` : 'electricity + on-site, steady state'}</em></div>
      <div className="ticker"><span>Carbon cost at RM {carbonPrice}/t</span><strong>{ringgit(live.co2TPerH * carbonPrice)} <small>/hour</small></strong><em>{ringgit(nowYear.co2T * carbonPrice)} a year</em></div>
      <div className="ticker"><span>This run</span><strong>{num(totals.current.steelT)} <small>t steel</small></strong><em>{num(totals.current.co2T)} t CO₂ released</em></div>
    </div>

    <div className="control-main">
      <div className="hall-card" ref={hallCardRef}>
        <Suspense fallback={<div className="plant3d loading">Loading…</div>}>
          {deepDive === 'melt'
            ? <MeltDeepDive frame={frame} onClose={() => setDeepDive(null)} />
            : <SteelHall3D frame={frame} showFlows={showFlows} selected={selected} onSelect={setSelected} onDive={setDeepDive} heatmap={heatmap} co2Of={unitCo2} labels={labels} describe={describe} />}
        </Suspense>
        {showFlows && !deepDive && <div className="flow-legend"><span><i className="fl-power" />Electricity</span><span><i className="fl-gas" />Natural gas</span><span><i className="fl-smoke" />CO₂ to air</span></div>}
        <FullscreenButton target={hallCardRef} />
      </div>
      <aside className="panel live-panel">
        {!selected && !deepDive && <p className="pick-hint">Click a unit in the mill to see its details. Double-click the induction furnaces to go inside.</p>}
        {selected === 'melt' && <div className="pilot-card eaf-card">
          <div className="pilot-head"><b>Induction furnaces</b><em>{live.phase}</em><button type="button" className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>✕</button></div>
          <p>Drawing <b>{num(live.mw.melt, 1)} MW</b> · heat #{live.heatNumber}, {num(live.phaseProgress * 100)}% through {live.phase.toLowerCase()} · <b>{num(unitCo2('melt'), 1)} t CO₂/h</b>, the mill’s biggest electricity user</p>
          <small>{num(now.kwh.melt)} kWh per tonne of steel · target {num(steelTargets.melt)} kWh/t{now.kwh.melt > steelTargets.melt * 1.02 ? ` (+${num((now.kwh.melt / steelTargets.melt - 1) * 100)}%)` : ' ✓'}</small>
          {deepDive !== 'melt' && <button type="button" className="btn small pilot-dive" onClick={() => setDeepDive('melt')}>Look inside the furnace</button>}
        </div>}
        <h2>Where the CO₂ is coming from right now</h2>
        <ul className="unit-bars">
          {[...steelUnits.filter((unit) => unit.id !== 'scrap')].map((unit) => ({ unit, co2: unitCo2(unit.id) })).sort((a, b) => b.co2 - a.co2).map(({ unit, co2 }) => <li key={unit.id}>
            <button type="button" className={selected === unit.id ? 'active' : ''} onClick={() => setSelected(unit.id)}>
              <span>{unit.short}</span><b>{num(co2, 1)} t/h</b>
              <div className="sharebar"><span className={unit.id === 'reheat' ? 'fuel' : unit.id === 'melt' ? 'proc' : 'elec'} style={{ width: `${Math.min(100, co2 / Math.max(1e-9, live.co2TPerH) * 100)}%` }} /></div>
            </button>
          </li>)}
        </ul>
        {selected && selected !== 'melt' && (() => {
          const unit = steelUnits.find((item) => item.id === selected)
          if (!unit) return null
          const target = selected === 'scrap' ? null : steelTargets[selected]
          const actual = selected === 'reheat' ? now.reheatGJPerT : selected === 'scrap' ? null : now.kwh[selected]
          const unitLabel = selected === 'reheat' ? 'GJ/t' : 'kWh/t'
          const gap = target && actual ? (actual / target - 1) * 100 : null
          return <div className="selected-unit">
            <div className="selected-head"><b>{unit.name}</b><button type="button" className="icon-btn" aria-label="Clear selection" onClick={() => setSelected(null)}>✕</button></div>
            <p>{unit.role}</p>
            {target && actual !== null && <p className={`perf-line ${gap !== null && gap > 2 ? 'above' : 'ok'}`}>{num(actual, selected === 'reheat' ? 2 : 0)} {unitLabel} · target {num(target, selected === 'reheat' ? 2 : 0)} {unitLabel} {gap !== null && gap > 2 ? `(+${num(gap)}%)` : '✓'}</p>}
          </div>
        })()}
        <div className="split">
          <div><span>Grid electricity (indirect)</span><b>{num(live.indirectTPerH, 1)} t/h</b></div>
          <div><span>On-site burning & process (direct)</span><b>{num(live.directTPerH, 1)} t/h</b></div>
        </div>
        <p className="muted small">The induction furnaces draw steady power while melting, a little while holding, and almost none while charging and tapping.</p>
      </aside>
    </div>

    {(() => {
      const g = params.gridKgPerKWh * (1 - upgrades.greenShare)
      const g0 = params.gridKgPerKWh
      type Row = { step: string; activity: string; factor: string; today: number; withUp: number; scope: 1 | 2; target?: string; above?: boolean }
      const elec = (step: string, id: Exclude<UnitId, 'scrap' | 'reheat'>): Row => ({ step, activity: `${num(now.kwh[id])} kWh/t`, factor: `${num(g, 3)} kg CO₂/kWh grid`, today: base.kwh[id] * g0, withUp: now.kwh[id] * g, scope: 2, target: id in steelTargets ? `${steelTargets[id as keyof typeof steelTargets]} kWh/t` : undefined, above: id in steelTargets && now.kwh[id] > steelTargets[id as keyof typeof steelTargets] * 1.02 })
      const rows: Row[] = [
        elec('Induction furnaces · electricity', 'melt'),
        { step: 'Ladle furnace · electrodes, alloy carbon & ladle preheat', activity: 'LF electrodes, carbon in alloys, ladle-preheat gas', factor: 'direct', today: base.meltDirectKgPerT, withUp: now.meltDirectKgPerT, scope: 1 },
        elec('Ladle furnace · electricity', 'lf'),
        elec('Continuous caster · electricity', 'caster'),
        { step: 'Reheating furnace · natural gas', activity: `${num(now.reheatGJPerT, 2)} GJ/t`, factor: `${params.gasKgPerGJ} kg CO₂/GJ`, today: base.reheatKgPerT, withUp: now.reheatGJPerT * params.gasKgPerGJ, scope: 1, target: `${steelTargets.reheat} GJ/t`, above: now.reheatGJPerT > steelTargets.reheat * 1.02 },
        elec('Rolling mill · electricity', 'rolling'),
        elec('Fume extraction fans · electricity', 'fume'),
        elec('Compressed air & water · electricity', 'utilities'),
      ]
      const chain = [
        { name: 'Scrap', value: 0 },
        { name: 'Induction furnaces', value: now.kwh.melt * g }, { name: 'Ladle furnace', value: now.kwh.lf * g + now.meltDirectKgPerT },
        { name: 'Ladle furnace', value: now.kwh.lf * g },
        { name: 'Caster', value: now.kwh.caster * g },
        { name: 'Reheat furnace', value: now.reheatKgPerT },
        { name: 'Rolling mill', value: now.kwh.rolling * g },
        { name: 'Support systems', value: (now.kwh.fume + now.kwh.utilities) * g },
      ]
      const chainMax = Math.max(...chain.map((item) => item.value))
      return <section className="card ledger">
        <header><div><h2>Carbon ledger: where each kg of CO₂ per tonne comes from</h2><p className="muted">The tracking behind the headline number. Every line is activity × emission factor, following the process route. Scope 1 is burnt or released on site; Scope 2 is from purchased grid electricity.</p></div>
          <div className="sandbox-result"><span>Per tonne of steel</span><strong>{num(now.totalKgPerT)} kg CO₂</strong><em>Scope 1: {num(now.directKgPerT)} · Scope 2: {num(now.indirectKgPerT)}</em></div></header>
        <div className="chain">{chain.map((item) => <div key={item.name} className={`chain-step${item.value === chainMax ? ' hot' : ''}`}>
          <span>{item.name}</span><strong>{num(item.value)} <small className="muted">kg/t</small></strong>
          <div className="chain-bar"><i style={{ width: `${item.value / Math.max(1, chainMax) * 100}%`, background: item.value === chainMax ? '#e11d48' : '#0ea5e9' }} /></div>
        </div>)}</div>
        <div className="table-wrap"><table className="grid-table ledger-table">
          <thead><tr><th>Process step & source</th><th>Activity per tonne</th><th>Target</th><th>Factor</th><th className="num">Today kg/t</th><th className="num">With upgrades</th><th>Scope</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.step}>
            <td>{row.step}</td><td>{row.activity}</td><td>{row.target ? <span className={`target-chip ${row.above ? 'above' : 'ok'}`}>{row.target} {row.above ? '▲' : '✓'}</span> : '—'}</td><td>{row.factor}</td>
            <td className="num">{num(row.today, 1)}</td>
            <td className={`num${row.withUp < row.today ? ' delta' : ''}`}>{num(row.withUp, 1)}</td>
            <td><span className={`scope s${row.scope}`}>Scope {row.scope}</span></td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={4}>Total per tonne of steel</td><td className="num">{num(base.totalKgPerT)}</td><td className="num delta">{num(now.totalKgPerT)}</td><td /></tr></tfoot>
        </table></div>
        <p className="muted small">Grid factor from Settings{upgrades.greenShare > 0 ? `, reduced by the ${num(upgrades.greenShare * 100)}% green-electricity share` : ''}. Natural gas uses a common IPCC 2006 default. Process figures and targets are illustrative for a sample mini-mill: ▲ means the unit uses more energy per tonne than its target. Set real targets from the plant's best months or an energy audit.</p>
      </section>
    })()}

    <section className="card sandbox">
      <header><div><h2>What-if sandbox</h2><p className="muted">Switch upgrades on and watch the mill, the tickers and CBAM exposure respond. Every estimate is an indicative planning assumption.</p></div>
        <div className="sandbox-result"><span>CO₂ per year</span><strong>{tonnes(nowYear.co2T)}</strong><em className={nowYear.co2T < baseYear.co2T ? 'good' : ''}>{nowYear.co2T < baseYear.co2T ? `−${tonnes(baseYear.co2T - nowYear.co2T)} (−${num((1 - nowYear.co2T / baseYear.co2T) * 100, 1)}%)` : 'no upgrades yet'}</em><small>capex {ringgit(capex)}</small></div>
      </header>
      <div className="upgrade-grid">
        {upgradeInfo.map((info) => {
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
              <input type="range" min="0" max={0.6} step="0.05" value={upgrades[info.key] as number} onChange={(event) => setUpgrades({ ...upgrades, [info.key]: Number(event.target.value) })} />
              <output>{num((upgrades[info.key] as number) * 100)}%</output></label>}
            {impact ? <div className="upgrade-stats">
              <span><b>−{num(impact.savedKgPerT, 1)}</b> kg/t</span>
              <span><b>−{tonnes(impact.savedTPerYear)}</b>/yr</span>
              <span><b>{impact.capexRM ? ringgit(impact.capexRM) : '—'}</b> capex</span>
              <span><b>{impact.paybackYears ? `${num(impact.paybackYears, 1)} yr` : impact.annualSavingRM < 0 ? 'costs more' : '—'}</b> payback</span>
            </div> : <small className="muted">{info.basis}</small>}
          </article>
        })}
      </div>
      <ScenarioToPlan items={steelScenario(state, upgrades)} label="steel mill sandbox" />
    </section>

    <section className="card cbam">
      <header><div><h2><FlagEU /> CBAM exposure (simplified)</h2><p className="muted">The EU carbon border adjustment charges imported steel for the CO₂ embedded in it. For iron and steel the charge is based on <b>direct</b> emissions. Carbon price already paid in Malaysia can be deducted, and the charge phases in as EU free allocation ends.</p></div></header>
      <div className="cbam-grid">
        <div className="form-grid compact">
          <label className="field">Year<select value={cbamInputs.year} onChange={(event) => setCbamInputs({ ...cbamInputs, year: Number(event.target.value) })}>{[2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034].map((year) => <option key={year}>{year}</option>)}</select></label>
          <label className="field">Steel exported to the EU (t/yr)<input type="number" min="0" step="10000" value={cbamInputs.exportTPerYear} onChange={(event) => setCbamInputs({ ...cbamInputs, exportTPerYear: Number(event.target.value) })} /></label>
          <label className="field">EU carbon price (€/t)<input type="number" min="0" value={cbamInputs.euPriceEUR} onChange={(event) => setCbamInputs({ ...cbamInputs, euPriceEUR: Number(event.target.value) })} /></label>
          <label className="field">Exchange rate (RM per €)<input type="number" min="0" step="0.1" value={cbamInputs.rmPerEUR} onChange={(event) => setCbamInputs({ ...cbamInputs, rmPerEUR: Number(event.target.value) })} /></label>
          <label className="field">Malaysian carbon price paid (RM/t)<input type="range" min="0" max="200" step="5" value={carbonPrice} onChange={(event) => setCarbonPrice(Number(event.target.value))} /><output>RM {carbonPrice}</output></label>
        </div>
        <table className="grid-table cbam-table">
          <thead><tr><th /><th className="num">Today</th><th className="num">With upgrades</th></tr></thead>
          <tbody>
            <tr><td>Direct emissions (charged)</td><td className="num">{num(cbamBase.directTPerT, 3)} t/t</td><td className="num">{num(cbamNow.directTPerT, 3)} t/t</td></tr>
            <tr><td>Indirect emissions (reported)</td><td className="num">{num(cbamBase.indirectTPerT, 3)} t/t</td><td className="num">{num(cbamNow.indirectTPerT, 3)} t/t</td></tr>
            <tr><td>Phase-in in {cbamInputs.year}</td><td className="num" colSpan={2}>{num(cbamBase.phaseIn * 100, 1)}% of the full charge</td></tr>
            <tr className="strong"><td>CBAM cost per tonne exported</td><td className="num">{ringgit(cbamBase.costRMPerT)}</td><td className="num">{ringgit(cbamNow.costRMPerT)}</td></tr>
            <tr className="strong"><td>CBAM cost per year</td><td className="num">{ringgit(cbamBase.costRMPerYear)}</td><td className="num good">{ringgit(cbamNow.costRMPerYear)}</td></tr>
          </tbody>
        </table>
      </div>
      <p className="note">Simplified illustration only. Real CBAM reporting uses verified installation data, product-specific rules, precursor emissions and EU default values. Check the current regulation and the latest Malaysian carbon-price announcements before relying on any figure.</p>
    </section>
  </div>
}
