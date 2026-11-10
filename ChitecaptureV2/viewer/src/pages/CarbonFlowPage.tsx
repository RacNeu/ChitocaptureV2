import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Header from '../components/Header'
import { getAllParameters } from '../data/parameters'
import { getActiveScenarioResult, setActiveScenarioResult, subscribeToActiveScenario } from '../simulation/activeScenario'
import { getCurrentScenarioSnapshot, runScenario } from '../simulation/scenarioRunner'
import type { ScenarioPeriod, ScenarioResult, ScenarioSample } from '../simulation/scenarioRunner'
import { getCarbonFlowEnergyTotals, getCarbonFlowTotals } from '../simulation/carbonFlowMetrics'

type ComparisonTab = 'emissions' | 'energy'

function number(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

function dateText(timestamp?: string) {
  if (!timestamp) return 'Selected simulation period'
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(timestamp))
}

function getPeriodLabel(result: ScenarioResult) {
  const first = result.samples[0]?.timestamp
  const last = result.samples.at(-1)?.timestamp
  if (!first || !last) return 'Selected simulation period'
  const configuredStart = getAllParameters().find((parameter) => parameter.id === 'initial-timestamp')?.value
  const start = typeof configuredStart === 'string'
    ? new Date(configuredStart)
    : new Date(new Date(first).getTime() - (result.period === 'yearly' ? 31 * 86_400_000 : 86_400_000))
  const end = new Date(new Date(last).getTime() - 1)
  if (result.period === 'weekly') return `${dateText(start.toISOString())} – ${dateText(end.toISOString())}`
  if (result.period === 'monthly') return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start)
  return `${dateText(start.toISOString())} – ${dateText(end.toISOString())}`
}

function periodDisplay(period: ScenarioPeriod) {
  return period === 'yearly' ? 'Annual' : period[0].toUpperCase() + period.slice(1)
}

function energyAmount(valueMWh: number) {
  return valueMWh >= 1 ? `${number(valueMWh)} MWh` : `${number(valueMWh * 1_000)} kWh`
}

function CarbonSankey({ result, totals }: { result: ScenarioResult; totals: ReturnType<typeof getCarbonFlowTotals> }) {
  const inputWidth = 34
  const captureWidth = totals.inputTonnes > 0 ? inputWidth * totals.capturedTonnes / totals.inputTonnes : 0
  const remainingWidth = totals.inputTonnes > 0 ? inputWidth * totals.remainingTonnes / totals.inputTonnes : 0
  const splitX = 286
  const inputCenterY = 153
  const captureCenterY = 111
  const remainingCenterY = 195
  const captureNodeX = 420
  const sourceTop = inputCenterY - inputWidth / 2
  const sourceBottom = inputCenterY + inputWidth / 2
  const remainingSourceTop = sourceTop + captureWidth
  const captureTop = captureCenterY - captureWidth / 2
  const captureBottom = captureCenterY + captureWidth / 2
  const remainingTop = remainingCenterY - remainingWidth / 2
  const remainingBottom = remainingCenterY + remainingWidth / 2
  return <svg className="carbon-sankey" viewBox="0 0 780 310" role="img" aria-label={`CO₂ flow: ${number(totals.inputTonnes)} tonnes input, ${number(totals.capturedTonnes)} captured, ${number(totals.remainingTonnes)} remaining`}>
    <defs>
      <linearGradient id="carbon-captured-flow" x1="0" x2="1"><stop offset="0" stopColor="#45a779" stopOpacity=".48" /><stop offset="1" stopColor="#45a779" stopOpacity=".16" /></linearGradient>
      <linearGradient id="carbon-remaining-flow" x1="0" x2="1"><stop offset="0" stopColor="#8398a6" stopOpacity=".44" /><stop offset="1" stopColor="#8398a6" stopOpacity=".15" /></linearGradient>
    </defs>
    <path d={`M 166 ${inputCenterY} L ${splitX} ${inputCenterY}`} fill="none" stroke="#8fa1aa" strokeWidth={inputWidth} />
    <path d={`M ${splitX} ${sourceTop} C 334 ${sourceTop} 352 ${captureCenterY} ${captureNodeX} ${captureTop} L ${captureNodeX} ${captureBottom} C 352 ${captureCenterY} 334 ${sourceTop + captureWidth} ${splitX} ${sourceTop + captureWidth} Z`} fill="url(#carbon-captured-flow)" />
    <path d={`M ${splitX} ${remainingSourceTop} C 334 ${remainingSourceTop} 352 ${remainingTop} ${captureNodeX} ${remainingTop} L ${captureNodeX} ${remainingBottom} C 352 ${remainingBottom} 334 ${sourceBottom} ${splitX} ${sourceBottom} Z`} fill="url(#carbon-remaining-flow)" />
    <rect x="558" y={captureTop} width="34" height={captureWidth} fill="#45a779" fillOpacity=".65" />
    <rect x="558" y={remainingTop} width="34" height={remainingWidth} fill="#8398a6" fillOpacity=".54" />
    <path d={`M 574 ${captureCenterY - 4} l 7 4 -7 4`} className="carbon-flow-arrow captured" />
    <path d={`M 574 ${remainingCenterY - 4} l 7 4 -7 4`} className="carbon-flow-arrow remaining" />
    <path d={`M ${splitX - 8} ${inputCenterY - 4} l 7 4 -7 4`} className="carbon-flow-arrow input" />
    <circle cx={splitX} cy={inputCenterY} r="4" fill="#748b96" />
    <g className="carbon-sankey-node" transform="translate(18 116)"><rect width="150" height="74" rx="8" /><text x="13" y="21" className="node-kicker">FLUE GAS CO₂ INPUT</text><text x="13" y="44" className="node-value">{number(totals.inputTonnes)} tCO₂</text><text x="13" y="62" className="node-sub">100% · {result.period} total</text></g>
    <g className="carbon-sankey-node captured" transform="translate(420 78)"><rect width="138" height="66" rx="8" /><text x="12" y="19" className="node-kicker">CO₂ CAPTURED</text><text x="12" y="40" className="node-value">{number(totals.capturedTonnes)} tCO₂</text><text x="12" y="55" className="node-sub">{number(totals.capturedPercent, 2)}% of input</text></g>
    <g className="carbon-sankey-destination captured" transform="translate(592 78)"><rect width="170" height="66" rx="8" /><text x="10" y="19" className="node-kicker">MODELED DESTINATION</text><text x="10" y="38" className="node-destination">Storage / further use</text><text x="10" y="53" className="node-sub">Utilisation or storage</text><g className="carbon-destination-placeholder" transform="translate(132 6)" aria-hidden="true"><rect width="32" height="54" rx="5" /><path d="M9 19h18v24H9zM7 19l11-8 11 8M13 25v14M18 25v14M23 25v14" /><path d="M13 47h18" /></g></g>
    <g className="carbon-sankey-node remaining" transform="translate(420 162)"><rect width="138" height="66" rx="8" /><text x="12" y="19" className="node-kicker">REMAINING CO₂</text><text x="12" y="40" className="node-value">{number(totals.remainingTonnes)} tCO₂</text><text x="12" y="55" className="node-sub">{number(totals.remainingPercent, 2)}% of input</text></g>
    <g className="carbon-sankey-destination remaining" transform="translate(592 162)"><rect width="170" height="66" rx="8" /><text x="10" y="19" className="node-kicker">TREATED FLUE GAS</text><text x="10" y="38" className="node-destination">To stack</text><text x="10" y="53" className="node-sub">Remaining CO₂ emissions</text><g className="carbon-destination-placeholder" transform="translate(132 6)" aria-hidden="true"><rect width="32" height="54" rx="5" /><path d="M12 43V15l14-4v32M9 43h21M16 21h3M16 28h3M16 35h3" /><path d="M24 7c0-3 3-3 3-6M30 9c0-3 3-3 3-6" /></g></g>
    <text x="286" y="258" textAnchor="middle" className="sankey-balance-note">Captured + remaining = total input</text>
  </svg>
}

function EmissionsBarChart({ samples }: { samples: ScenarioSample[] }) {
  const width = 680
  const height = 240
  const pad = { left: 48, right: 12, top: 12, bottom: 34 }
  const plotWidth = width - pad.left - pad.right
  const plotHeight = height - pad.top - pad.bottom
  const max = Math.max(1e-9, ...samples.map((sample) => sample.baselineEmissionsT))
  const group = plotWidth / Math.max(1, samples.length)
  const barWidth = Math.max(1, Math.min(11, group * .34))
  const x = (index: number) => pad.left + (index + .5) * group
  const y = (value: number) => pad.top + plotHeight - value / max * plotHeight
  const labels = [...new Set([0, Math.floor((samples.length - 1) / 2), samples.length - 1])].filter((index) => index >= 0 && samples[index])
  return samples.length ? <svg className="carbon-trend-chart carbon-emissions-bars" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Grouped baseline and chitosan CO₂ emissions bars across ${samples.length} simulation time steps`}>
    {[0, .5, 1].map((fraction) => <g key={fraction}><line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight * fraction} y2={pad.top + plotHeight * fraction} className="carbon-chart-grid" /><text x={pad.left - 7} y={pad.top + plotHeight * fraction + 3} textAnchor="end" className="carbon-chart-axis">{number(max * (1 - fraction), 0)}</text></g>)}
    {samples.map((sample, index) => <g key={`${sample.timestamp}-${index}`}><rect x={x(index) - barWidth - 1} y={y(sample.baselineEmissionsT)} width={barWidth} height={pad.top + plotHeight - y(sample.baselineEmissionsT)} rx="1" className="carbon-grouped-bar baseline" /><rect x={x(index) + 1} y={y(sample.treatedEmissionsT)} width={barWidth} height={pad.top + plotHeight - y(sample.treatedEmissionsT)} rx="1" className="carbon-grouped-bar treated" /></g>)}
    {labels.map((index) => <text key={index} x={x(index)} y={height - 9} textAnchor={index === 0 ? 'start' : index === samples.length - 1 ? 'end' : 'middle'} className="carbon-chart-axis">{samples[index].label}</text>)}
    <text x="8" y={height / 2} transform={`rotate(-90 8 ${height / 2})`} className="carbon-chart-axis">CO₂ emissions · tCO₂</text>
  </svg> : <div className="carbon-empty">No time-series samples available.</div>
}

function TrendChart({ samples }: { samples: ScenarioSample[] }) {
  const width = 680
  const height = 210
  const pad = { left: 43, right: 12, top: 12, bottom: 30 }
  const plotWidth = width - pad.left - pad.right
  const plotHeight = height - pad.top - pad.bottom
  const baseline = samples.map((sample) => sample.energyMWh)
  const treated = samples.map((sample) => sample.regenerationEnergyMWh ?? 0)
  const max = Math.max(1e-9, ...baseline)
  const x = (index: number) => pad.left + (samples.length < 2 ? plotWidth / 2 : index / (samples.length - 1) * plotWidth)
  const y = (value: number) => pad.top + plotHeight - value / max * plotHeight
  const path = (values: number[]) => values.map((value, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`).join(' ')
  const labels = [...new Set([0, Math.floor((samples.length - 1) / 2), samples.length - 1])].filter((index) => index >= 0 && samples[index])
  return samples.length ? <svg className="carbon-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Total capture energy and regeneration energy over the selected period">
    {[0, .5, 1].map((fraction) => <g key={fraction}><line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight * fraction} y2={pad.top + plotHeight * fraction} className="carbon-chart-grid" /><text x={pad.left - 7} y={pad.top + plotHeight * fraction + 3} textAnchor="end" className="carbon-chart-axis">{number(max * (1 - fraction), 0)}</text></g>)}
    <path d={path(baseline)} className="carbon-chart-line baseline" /><path d={path(treated)} className="carbon-chart-line treated" />
    {labels.map((index) => <text key={index} x={x(index)} y={height - 8} textAnchor={index === 0 ? 'start' : index === samples.length - 1 ? 'end' : 'middle'} className="carbon-chart-axis">{samples[index].label}</text>)}
    <text x="7" y={height / 2} transform={`rotate(-90 7 ${height / 2})`} className="carbon-chart-axis">Energy · MWh</text>
  </svg> : <div className="carbon-empty">No time-series samples available.</div>
}

function CarbonFlowPage() {
  const active = useSyncExternalStore(subscribeToActiveScenario, getActiveScenarioResult, getActiveScenarioResult)
  const [tab, setTab] = useState<ComparisonTab>('emissions')
  const [period, setPeriod] = useState<ScenarioPeriod>(() => getActiveScenarioResult()?.period ?? 'monthly')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!active) setActiveScenarioResult(runScenario(getCurrentScenarioSnapshot(), period))
    else if (active.period !== period) setPeriod(active.period)
    else if (active.samples.some((sample) => !Number.isFinite(sample.gasHandlingEnergyMWh) || !Number.isFinite(sample.coolingEnergyMWh) || !Number.isFinite(sample.auxiliariesEnergyMWh))) {
      setActiveScenarioResult(runScenario(active.snapshot, active.period))
    }
  }, [])

  useEffect(() => {
    if (active && active.period !== period) setPeriod(active.period)
  }, [active?.period])

  const totals = useMemo(() => active ? getCarbonFlowTotals(active) : null, [active])
  const energyTotals = useMemo(() => active ? getCarbonFlowEnergyTotals(active) : null, [active])
  const emissions = active?.samples.reduce((sum, sample) => sum + sample.treatedEmissionsT, 0) ?? 0
  const energy = energyTotals?.totalEnergyMWh ?? 0
  const captured = totals?.capturedTonnes ?? 0
  const energyPerTonne = energyTotals?.energyIntensityKWhPerTonne ?? 0
  const regenPercent = energy > 0 ? Math.round((energyTotals?.regenerationMWh ?? 0) / energy * 1_000) / 10 : 0
  const gasHandlingPercent = energy > 0 ? Math.round((energyTotals?.gasHandlingMWh ?? 0) / energy * 1_000) / 10 : 0
  const auxiliariesPercent = energy > 0 ? Math.max(0, Math.round((100 - regenPercent - gasHandlingPercent) * 10) / 10) : 0
  const dailyAverageKWh = energyTotals?.averageDailyKWh ?? 0
  const periodLabel = active ? getPeriodLabel(active) : 'Preparing simulation'
  const periodWords = periodDisplay(active?.period ?? period)
  const balanceWarning = Boolean(totals && !totals.isBalanced)
  const energyBalanceWarning = Boolean(energyTotals && !energyTotals.isBalanced)

  async function changePeriod(nextPeriod: ScenarioPeriod) {
    setPeriod(nextPeriod)
    if (!active || active.period === nextPeriod) return
    setRunning(true)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    setActiveScenarioResult(runScenario(active.snapshot, nextPeriod))
    setRunning(false)
  }

  return <div className="dashboard-shell carbon-flow-page executive-page">
    <Header page="carbon-flow" title="Carbon Flow" subtitle="Visualise movement of CO₂ through the capture system" />
    <main className="dashboard-main carbon-flow-main">
      <section className="carbon-filterbar panel" aria-label="Carbon flow filters">
        <label><span>Industry</span><b>{active?.snapshot.industry ?? getCurrentScenarioSnapshot().industry}</b></label>
        <label><span>Site</span><b>{active?.snapshot.site ?? getCurrentScenarioSnapshot().site}</b></label>
        <label><span>Time period</span><select aria-label="Time period" value={period} onChange={(event) => void changePeriod(event.target.value as ScenarioPeriod)} disabled={running}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Annual</option></select></label>
        <div className="carbon-date-filter"><span>Selected period</span><b>{periodLabel}</b></div>
        {running && <span className="carbon-calculating" role="status">Updating simulation…</span>}
      </section>

      <section className="carbon-flow-overview" aria-label={`Carbon flow for ${periodWords}`}>
        <article className="carbon-sankey-card panel">
          <div className="carbon-card-heading"><div><h2>Sankey Diagram ({periodWords})</h2><p>Calculated CO₂ mass per selected period</p></div><span className="carbon-simulation-pill"><i />SIMULATED</span></div>
          {totals && <CarbonSankey result={active!} totals={totals} />}
          {balanceWarning && <p className="carbon-balance-warning" role="alert">Mass balance check failed. Values are shown with a warning: input does not equal captured plus remaining CO₂.</p>}
          <div className="carbon-flow-legend"><span><i className="captured" />Captured CO₂ pathway</span><span><i className="remaining" />Remaining CO₂ pathway</span></div>
        </article>

        <section className="carbon-kpi-panel panel" aria-labelledby="carbon-kpi-title">
          <div className="carbon-card-heading"><div><h2 id="carbon-kpi-title">Carbon Flow KPI</h2><p>{periodWords} totals</p></div></div>
          <div className="carbon-kpi-grid">
            <article><span>TOTAL INPUT</span><strong>{totals ? number(totals.inputTonnes) : '—'}</strong><small>tCO₂ / {periodWords}</small></article>
            <article className="captured"><span>CAPTURED</span><strong>{totals ? number(totals.capturedTonnes) : '—'}</strong><small>tCO₂ / {periodWords}</small></article>
            <article><span>REMAINING</span><strong>{totals ? number(totals.remainingTonnes) : '—'}</strong><small>tCO₂ / {periodWords}</small></article>
            <article className="efficiency"><span>CAPTURE EFFICIENCY</span><strong>{totals ? number(totals.captureEfficiency, 2) : '—'}<small>%</small></strong><small>Captured ÷ total input</small></article>
          </div>
          <div className="carbon-kpi-balance"><span>Input</span><b>{totals ? number(totals.inputTonnes) : '—'}</b><span>=</span><b className="green-value">{totals ? number(totals.capturedTonnes) : '—'}</b><span>captured +</span><b>{totals ? number(totals.remainingTonnes) : '—'}</b><span>remaining</span></div>
        </section>
      </section>

      <section className="carbon-comparison panel" aria-labelledby="comparison-title">
        <div className="carbon-comparison-heading"><div><h2 id="comparison-title">Before vs After Comparison</h2><p>Active scenario · {periodLabel}</p></div></div>
        <div className="carbon-tabs" role="tablist" aria-label="Before and after comparison category">
          {([['emissions', 'Emissions'], ['energy', 'Energy']] as [ComparisonTab, string][]).map(([value, label]) => <button key={value} role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}
        </div>
        {tab === 'emissions' && <div className="carbon-comparison-grid">
          <article className="carbon-chart-card"><div className="carbon-subheading"><h3>Total CO₂ Emissions</h3><span>tCO₂ / time step</span></div><div className="carbon-chart-legend"><span><i className="baseline" />Baseline (no capture)</span><span><i className="treated" />With chitosan capture</span></div><EmissionsBarChart samples={active?.samples ?? []} /></article>
          <article className="carbon-table-card"><div className="carbon-subheading"><h3>KPI Table</h3><span>{periodWords} total</span></div><div className="carbon-table-scroll"><table><thead><tr><th>KPI</th><th>Baseline</th><th>Chitosan</th><th>Change</th></tr></thead><tbody>
            <tr><th>Total CO₂ emissions</th><td>{totals ? `${number(totals.inputTonnes)} t` : '—'}</td><td>{totals ? `${number(emissions)} t` : '—'}</td><td className="good-change">{totals ? `↓ ${number(totals.captureEfficiency, 2)}%` : '—'}</td></tr>
            <tr><th>CO₂ intensity</th><td>Not specified</td><td>Not specified</td><td>—</td></tr>
            <tr><th>CO₂ captured</th><td>—</td><td>{totals ? `${number(totals.capturedTonnes)} t` : '—'}</td><td>—</td></tr>
            <tr><th>Capture efficiency</th><td>—</td><td>{totals ? `${number(totals.captureEfficiency, 2)}%` : '—'}</td><td>—</td></tr>
            <tr><th>Energy use</th><td>—</td><td>{totals ? `${number(energy)} MWh` : '—'}</td><td className="neutral-change">Modeled capture energy</td></tr>
          </tbody></table></div><p className="carbon-table-note">Carbon intensity needs product output; it is not yet specified in the parameter registry.</p></article>
        </div>}
        {tab === 'energy' && <div className="carbon-energy-view">
          <div className="carbon-energy-kpis">
            <article title="Includes the energy components calculated by this model: regeneration/desorption, gas handling, cooling, and auxiliary equipment."><span>Total capture energy <b aria-label="Energy components information">ⓘ</b></span><strong>{number(energy)} <small>MWh</small></strong></article>
            <article><span>CO₂ captured</span><strong>{number(captured)} <small>tCO₂</small></strong></article>
            <article><span>Capture energy intensity</span><strong>{number(energyPerTonne)} <small>kWh/tCO₂</small></strong></article>
          </div>
          <article className="carbon-chart-card carbon-energy-chart"><div className="carbon-subheading"><h3>Energy Trend Over Time</h3><span>{active?.period === 'yearly' ? 'MWh / month' : 'MWh / day'}</span></div><div className="carbon-chart-legend"><span><i className="baseline" />Total energy</span><span><i className="treated" />Regeneration / desorption</span></div><TrendChart samples={active?.samples ?? []} /></article>
          <article className="carbon-breakdown-card"><div className="carbon-subheading"><h3>Energy Breakdown</h3><span>{periodWords} total</span></div>
            {energyBalanceWarning && <p className="carbon-balance-warning" role="alert">Energy breakdown does not reconcile with total model energy.</p>}
            <div className="carbon-breakdown-content">
              <div className="carbon-donut" role="img" aria-label={`Energy breakdown: regeneration ${number(regenPercent)} percent, gas handling ${number(gasHandlingPercent)} percent, auxiliary systems ${number(auxiliariesPercent)} percent`} style={{ background: energy > 0 ? `conic-gradient(#38a36f 0 ${regenPercent}%, #6f8fa0 ${regenPercent}% ${regenPercent + gasHandlingPercent}%, #b7c6cd ${regenPercent + gasHandlingPercent}% 100%)` : '#edf2f3' }}><div><strong>{number(dailyAverageKWh, 0)}</strong><small>kWh/day</small></div></div>
              <div className="carbon-breakdown-legend">
                <div><i className="regen" /><span>Regeneration / desorption</span><b>{number(regenPercent, 1)}%</b><small>{energyAmount(energyTotals?.regenerationMWh ?? 0)}</small></div>
                <div><i className="gas" /><span>Gas handling / blowers</span><b>{number(gasHandlingPercent, 1)}%</b><small>{energyAmount(energyTotals?.gasHandlingMWh ?? 0)}</small></div>
                <div><i className="aux" /><span>Auxiliaries (cooling + equipment)</span><b>{number(auxiliariesPercent, 1)}%</b><small>{energyAmount(energyTotals?.auxiliariesMWh ?? 0)}</small></div>
              </div>
            </div>
            <p className="carbon-average-label">Average daily energy use · {number(dailyAverageKWh, 0)} kWh/day</p>
          </article>
        </div>}
      </section>

      <p className="carbon-flow-note">Carbon flow values are simulated estimates based on the active scenario and displayed model assumptions. They are not measured plant data.</p>
      <footer className="app-footer"><span><i /> SIMULATION PROTOTYPE</span><span>{active ? `${active.snapshot.industry} · ${active.snapshot.emissionSource} · ${active.snapshot.site}` : 'Loading active scenario'}</span><span>{getAllParameters().filter((parameter) => parameter.sourceType === 'assumption').length} model assumptions</span></footer>
    </main>
  </div>
}

export default CarbonFlowPage
