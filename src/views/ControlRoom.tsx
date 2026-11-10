import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Sparkline } from '../components/Charts'
import type { SimFrame, UnitTooltip } from '../components/SteelHall3D'
import { num, ringgit, tonnes } from '../format'
import { gridFactor } from '../model/factors'
import { actions, freshState, machinesFromTemplate, useFactory } from '../model/store'
import { annual, cbam, defaultSteelParams, intensity, liveState, noUpgrades, steelUnits, tonnesPerHour, upgradeImpacts, upgradeInfo, type SteelParams, type UnitId, type Upgrades } from '../model/steel'

const SteelHall3D = lazy(() => import('../components/SteelHall3D'))

const speeds = [{ label: '⏸', value: 0 }, { label: '1 min/s', value: 1 }, { label: '5 min/s', value: 5 }, { label: '30 min/s', value: 30 }]
const electricUnits: Exclude<UnitId, 'scrap' | 'reheat'>[] = ['eaf', 'rolling', 'lf', 'fume', 'utilities', 'oxygen', 'caster']

export default function ControlRoom() {
  const state = useFactory()
  const params: SteelParams = useMemo(() => ({
    ...defaultSteelParams,
    gridKgPerKWh: gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh),
    electricityRMPerMWh: state.settings.electricityPriceRMPerMWh,
    gasRMPerGJ: state.settings.fuelPriceRMPerGJ['natural-gas'],
  }), [state.settings])
  const [upgrades, setUpgrades] = useState<Upgrades>(noUpgrades)
  const [speed, setSpeed] = useState(1)
  const [showFlows, setShowFlows] = useState(true)
  const [selected, setSelected] = useState<UnitId | null>(null)
  const [carbonPrice, setCarbonPrice] = useState(35)
  const [cbamInputs, setCbamInputs] = useState({ exportTPerYear: 100_000, euPriceEUR: 75, rmPerEUR: 5, year: 2030 })

  // Simulation clock: advanced every animation frame, published to React four times a second.
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
  const topUnit = electricUnits.reduce((best, id) => live.mw[id] > live.mw[best] ? id : best, 'eaf' as Exclude<UnitId, 'scrap' | 'reheat'>)

  /** CO₂ rate of one unit (t/h) for a given live snapshot. */
  const unitCo2At = (snapshot: SimFrame, id: UnitId) => {
    const { live: l, params: p, upgrades: u } = snapshot
    if (id === 'reheat') return l.reheatGJPerH * p.gasKgPerGJ / 1_000 - l.capturedTPerH
    if (id === 'scrap') return 0
    const electric = l.mw[id] * p.gridKgPerKWh * (1 - u.greenShare)
    return id === 'eaf' ? electric + (l.phase === 'Melting' || l.phase === 'Refining' ? p.eafDirectKgPerT * tonnesPerHour(p) / 1_000 / 0.8 : 0) : electric
  }
  const unitCo2 = (id: UnitId) => unitCo2At(frame.current, id)
  const labels = steelUnits.filter((unit) => unit.id !== 'scrap').map((unit) => ({
    id: unit.id,
    text: unit.id === 'reheat' ? `${unit.short} · ${num(live.reheatGJPerH)} GJ/h gas` : `${unit.short} · ${num(live.mw[unit.id as Exclude<UnitId, 'scrap' | 'reheat'>], 1)} MW`,
    hot: unit.id === topUnit || unit.id === 'reheat' && unitCo2('reheat') > unitCo2(topUnit),
  }))
  const describe = useCallback((id: UnitId): UnitTooltip | null => {
    const unit = steelUnits.find((item) => item.id === id)
    if (!unit) return null
    // Always read the latest frame so the hover card matches the side panel.
    const f = frame.current
    const co2 = unitCo2At(f, id)
    const rows: [string, string][] = id === 'reheat'
      ? [['Gas burnt', `${num(f.live.reheatGJPerH)} GJ/h`], ['CO₂ now', `${num(co2, 1)} t/h`], ['Share of plant CO₂', `${num(co2 / Math.max(1e-9, f.live.co2TPerH) * 100)}%`], ['Captured', f.live.capturedTPerH > 0 ? `${num(f.live.capturedTPerH, 1)} t/h` : 'none']]
      : id === 'scrap' ? [['Steel throughput', `${num(tonnesPerHour(f.params))} t/h`], ['Heat', `#${f.live.heatNumber} · ${f.live.phase}`]]
        : [['Power now', `${num(f.live.mw[id], 1)} MW`], ['CO₂ now', `${num(co2, 1)} t/h`], ['Share of plant CO₂', `${num(co2 / Math.max(1e-9, f.live.co2TPerH) * 100)}%`], ['Per tonne', `${num(intensity(f.params, f.upgrades).kwh[id])} kWh/t`]]
    if (id === 'eaf') rows.unshift(['Phase', `${f.live.phase} (${num(f.live.phaseProgress * 100)}%)`])
    return { title: unit.name, rows, note: unit.role }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggle = (key: keyof Upgrades) => setUpgrades((current) => ({ ...current, [key]: !current[key] }))
  const isSteel = state.settings.industryId === 'steel'

  return <div className="control">
    {!isSteel && <div className="note banner">This control room models a sample steel mini-mill. Your current factory is “{state.settings.factoryName}”.
      <button type="button" className="link" onClick={() => { if (confirm('Replace the current factory with the sample steel mini-mill? Your machines and plan will be replaced.')) actions.replace({ ...freshState('steel'), onboarded: true, settings: { ...state.settings, industryId: 'steel', factoryName: 'Sample steel mini-mill' }, machines: machinesFromTemplate('steel'), measuredSorbentCapacity: state.measuredSorbentCapacity }) }}>Load it as my factory</button></div>}

    <header className="control-head">
      <div>
        <h1>Steel mini-mill control room</h1>
        <p className="muted">Electric arc furnace route · {num(tonnesPerHour(params))} t/h · illustrative sample plant</p>
      </div>
      <div className="control-status">
        <span className={`phase-badge ${live.phase.toLowerCase()}`}><i />Heat #{live.heatNumber} · {live.phase} {num(live.phaseProgress * 100)}%</span>
        <span className="sim-clock">🕒 {clock}</span>
        <div className="toggle" role="radiogroup" aria-label="Simulation speed">{speeds.map((item) => <button key={item.value} type="button" role="radio" aria-checked={speed === item.value} className={speed === item.value ? 'active' : ''} onClick={() => setSpeed(item.value)}>{item.label}</button>)}</div>
        <label className="flow-switch"><input type="checkbox" checked={showFlows} onChange={(event) => setShowFlows(event.target.checked)} /> Energy flows</label>
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
      <div className="hall-card">
        <Suspense fallback={<div className="plant3d loading">Loading the mill…</div>}>
          <SteelHall3D frame={frame} showFlows={showFlows} selected={selected} onSelect={setSelected} labels={labels} describe={describe} />
        </Suspense>
        {showFlows && <div className="flow-legend"><span><i className="fl-power" />Electricity</span><span><i className="fl-gas" />Natural gas</span>{upgrades.captureShare > 0 && <span><i className="fl-capture" />Captured CO₂</span>}<span><i className="fl-smoke" />CO₂ to air</span></div>}
      </div>
      <aside className="panel live-panel">
        <h2>Where the CO₂ is coming from right now</h2>
        <ul className="unit-bars">
          {[...steelUnits.filter((unit) => unit.id !== 'scrap')].map((unit) => ({ unit, co2: unitCo2(unit.id) })).sort((a, b) => b.co2 - a.co2).map(({ unit, co2 }) => <li key={unit.id}>
            <button type="button" className={selected === unit.id ? 'active' : ''} onClick={() => setSelected(unit.id)}>
              <span>{unit.short}</span><b>{num(co2, 1)} t/h</b>
              <div className="sharebar"><span className={unit.id === 'reheat' ? 'fuel' : unit.id === 'eaf' ? 'proc' : 'elec'} style={{ width: `${Math.min(100, co2 / Math.max(1e-9, live.co2TPerH) * 100)}%` }} /></div>
            </button>
          </li>)}
        </ul>
        <div className="split">
          <div><span>Grid electricity (indirect)</span><b>{num(live.indirectTPerH, 1)} t/h</b></div>
          <div><span>On-site burning & process (direct)</span><b>{num(live.directTPerH, 1)} t/h</b></div>
        </div>
        <p className="muted small">The arc furnace's power draw swings with each heat. Watch it peak during melting and drop while charging and tapping.</p>
      </aside>
    </div>

    <section className="card sandbox">
      <header><div><h2>🧪 What-if sandbox</h2><p className="muted">Switch upgrades on and watch the mill, the tickers and CBAM exposure respond. Every estimate is an indicative planning assumption.</p></div>
        <div className="sandbox-result"><span>CO₂ per year</span><strong>{tonnes(nowYear.co2T)}</strong><em className={nowYear.co2T < baseYear.co2T ? 'good' : ''}>{nowYear.co2T < baseYear.co2T ? `−${tonnes(baseYear.co2T - nowYear.co2T)} (−${num((1 - nowYear.co2T / baseYear.co2T) * 100, 1)}%)` : 'no upgrades yet'}</em><small>capex {ringgit(capex)}</small></div>
      </header>
      <div className="upgrade-grid">
        {upgradeInfo.map((info) => {
          const impact = impacts.find((item) => item.info.key === info.key)
          const isSlider = info.key === 'greenShare' || info.key === 'captureShare'
          const on = Boolean(upgrades[info.key])
          return <article key={info.key} className={`upgrade${on ? ' on' : ''}${info.key === 'captureShare' ? ' capture' : ''}`}>
            <div className="upgrade-top">
              <strong>{info.name}</strong>
              {!isSlider && <label className="switch"><input type="checkbox" checked={on} onChange={() => toggle(info.key)} /><span /></label>}
            </div>
            <p>{info.what}</p>
            {isSlider && <label className="slider">{info.key === 'greenShare' ? 'Green share of electricity' : 'Share of stack gas treated'}
              <input type="range" min="0" max={info.key === 'greenShare' ? 0.6 : 1} step="0.05" value={upgrades[info.key] as number} onChange={(event) => setUpgrades({ ...upgrades, [info.key]: Number(event.target.value) })} />
              <output>{num((upgrades[info.key] as number) * 100)}%</output></label>}
            {impact ? <div className="upgrade-stats">
              <span><b>−{num(impact.savedKgPerT, 1)}</b> kg/t</span>
              <span><b>−{tonnes(impact.savedTPerYear)}</b>/yr</span>
              <span><b>{impact.capexRM ? ringgit(impact.capexRM) : '—'}</b> capex</span>
              <span><b>{impact.paybackYears ? `${num(impact.paybackYears, 1)} yr` : impact.annualSavingRM < 0 ? 'costs more' : '—'}</b> payback</span>
            </div> : <small className="muted">{info.basis}</small>}
            {info.key === 'captureShare' && <small className="muted">{state.measuredSorbentCapacity ? `Sorbent capacity measured on your rig: ${num(state.measuredSorbentCapacity, 2)} mmol/g.` : 'Measure your sorbent capacity on the Sensors page to firm up this estimate.'} It only treats the reheating furnace exhaust. Most mini-mill CO₂ comes from grid electricity.</small>}
          </article>
        })}
      </div>
    </section>

    <section className="card cbam">
      <header><div><h2>🇪🇺 CBAM exposure (simplified)</h2><p className="muted">The EU carbon border adjustment charges imported steel for the CO₂ embedded in it. For iron and steel the charge is based on <b>direct</b> emissions. Carbon price already paid in Malaysia can be deducted, and the charge phases in as EU free allocation ends.</p></div></header>
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
      <p className="note">Simplified illustration only. Real CBAM reporting uses verified installation data, product-specific rules, precursor emissions and EU default values. Captured CO₂ only reduces the figure if it is stored or used under the EU's rules. Check the current regulation and the latest Malaysian carbon-price announcements before relying on any figure.</p>
    </section>
  </div>
}
