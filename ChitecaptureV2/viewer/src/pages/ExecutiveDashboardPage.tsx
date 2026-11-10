import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent, MouseEvent } from 'react'
import Header from '../components/Header'
import { getParameter, readNumberParameter } from '../data/parameters'
import { getActiveScenarioResult, setActiveScenarioResult, subscribeToActiveScenario } from '../simulation/activeScenario'
import { getCurrentScenarioSnapshot, runScenario } from '../simulation/scenarioRunner'
import type { ScenarioPeriod, ScenarioResult, ScenarioSample } from '../simulation/scenarioRunner'
import { calculateDataCompleteness } from '../simulation/executiveMetrics'
import { fromMalaysiaDateTimeInput, formatMalaysiaDateTime, toMalaysiaDateTimeInput, MALAYSIA_TIME_ZONE } from '../utils/malaysiaTime'

type DashboardRange = 'today' | '7-days' | '30-days'
type TimeMode = 'live' | 'custom' | 'monthly-report'

function format(value: number, digits = 0) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
}

function asMonth(timestamp: string) {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function sampleMonth(timestamp: string) {
  return asMonth(new Date(new Date(timestamp).getTime() - 1).toISOString())
}

function monthLabel(month: string) {
  if (!month) return 'Selected month'
  const [year, number] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, number - 1, 1)))
}

function toLocalInput(timestamp?: string) {
  return toMalaysiaDateTimeInput(timestamp)
}

function calculateTotals(samples: ScenarioSample[]) {
  const inputTonnes = samples.reduce((sum, sample) => sum + Math.max(0, sample.baselineEmissionsT), 0)
  const remainingTonnes = samples.reduce((sum, sample) => sum + Math.max(0, sample.treatedEmissionsT), 0)
  const capturedTonnes = Math.min(inputTonnes, Math.max(0, inputTonnes - remainingTonnes))
  const energyMWh = samples.reduce((sum, sample) => sum + Math.max(0, sample.energyMWh), 0)
  return {
    inputTonnes,
    remainingTonnes: Math.max(0, inputTonnes - capturedTonnes),
    capturedTonnes,
    efficiency: inputTonnes > 0 ? capturedTonnes / inputTonnes * 100 : 0,
    energyMWh,
  }
}

function emissions(result: ScenarioResult, mode: TimeMode, range: DashboardRange, customStart: string, customEnd: string, reportMonth: string) {
  if (mode === 'live') return range === 'today' ? result.hourlySamples : result.dailySamples.slice(0, range === '7-days' ? 7 : 30)
  if (mode === 'monthly-report') return result.dailySamples.filter((sample) => sampleMonth(sample.timestamp) === reportMonth)
  const lower = customStart ? fromMalaysiaDateTimeInput(customStart) : Number.NEGATIVE_INFINITY
  const upper = customEnd ? fromMalaysiaDateTimeInput(customEnd) : Number.POSITIVE_INFINITY
  const rangeHours = (upper - lower) / 3_600_000
  const samples = rangeHours >= 0 && rangeHours <= 36 ? result.hourlySamples : result.dailySamples
  const filtered = samples.filter((sample) => {
    const timestamp = new Date(sample.timestamp).getTime()
    return timestamp >= lower && timestamp <= upper
  })
  return filtered.length || rangeHours > 36 ? filtered : result.dailySamples.filter((sample) => {
    const timestamp = new Date(sample.timestamp).getTime()
    return timestamp >= lower && timestamp <= upper
  })
}

function dateLabel(sample: ScenarioSample, hourly: boolean) {
  const date = new Date(hourly ? sample.timestamp : new Date(sample.timestamp).getTime() - 1)
  if (hourly) return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: MALAYSIA_TIME_ZONE }).format(date)
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: MALAYSIA_TIME_ZONE }).format(date)
}

function EmissionsChart({ samples, hourly }: { samples: ScenarioSample[]; hourly: boolean }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const width = 700
  const height = 282
  const pad = { left: 52, right: 12, top: 16, bottom: 37 }
  const plotWidth = width - pad.left - pad.right
  const plotHeight = height - pad.top - pad.bottom
  const values = samples.flatMap((sample) => [sample.baselineEmissionsT, sample.treatedEmissionsT])
  const rawMin = values.length ? Math.min(...values) : 0
  const rawMax = values.length ? Math.max(...values) : 1
  const spread = Math.max(rawMax - rawMin, rawMax * 0.012, 0.01)
  const min = Math.max(0, rawMin - spread * 0.18)
  const max = rawMax + spread * 0.18
  const x = (index: number) => pad.left + (samples.length < 2 ? plotWidth / 2 : index / (samples.length - 1) * plotWidth)
  const y = (value: number) => pad.top + plotHeight - (value - min) / Math.max(0.001, max - min) * plotHeight
  const pathFor = (key: 'baselineEmissionsT' | 'treatedEmissionsT') => samples.map((sample, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(sample[key])}`).join(' ')
  const labels = [...new Set([0, Math.floor((samples.length - 1) / 2), samples.length - 1])].filter((index) => index >= 0)
  const tooltip = hoverIndex === null ? null : samples[hoverIndex]
  const tooltipLeft = hoverIndex === null || samples.length < 2 ? 50 : 7 + hoverIndex / (samples.length - 1) * 78
  const unit = hourly ? 't CO₂/h' : 't CO₂/day'

  function updateHover(event: MouseEvent<SVGSVGElement>) {
    if (!samples.length) return
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - rect.width * pad.left / width) / (rect.width * plotWidth / width)))
    setHoverIndex(samples.length < 2 ? 0 : Math.round(ratio * (samples.length - 1)))
  }

  function keyboardHover(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setHoverIndex((current) => Math.max(0, Math.min(samples.length - 1, (current ?? 0) + (event.key === 'ArrowRight' ? 1 : -1))))
    }
  }

  return <div className="executive-chart-wrap">
    {samples.length ? <>
      <svg className="executive-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Baseline CO₂ and remaining emissions across ${samples.length} time steps`} tabIndex={0} onMouseMove={updateHover} onMouseLeave={() => setHoverIndex(null)} onFocus={() => setHoverIndex((current) => current ?? 0)} onKeyDown={keyboardHover}>
        {[0, 0.5, 1].map((fraction) => {
          const tick = max - (max - min) * fraction
          return <g key={fraction}><line x1={pad.left} x2={width - pad.right} y1={pad.top + plotHeight * fraction} y2={pad.top + plotHeight * fraction} className="executive-chart-grid" /><text x={pad.left - 8} y={pad.top + plotHeight * fraction + 3} textAnchor="end" className="executive-axis-label">{format(tick, 0)}</text></g>
        })}
        <path d={pathFor('baselineEmissionsT')} className="executive-line baseline" />
        <path d={pathFor('treatedEmissionsT')} className="executive-line treated" />
        {hoverIndex !== null && samples[hoverIndex] && <g><line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={pad.top} y2={height - pad.bottom} className="executive-hover-line" /><circle cx={x(hoverIndex)} cy={y(samples[hoverIndex].baselineEmissionsT)} r="3.5" className="executive-point baseline" /><circle cx={x(hoverIndex)} cy={y(samples[hoverIndex].treatedEmissionsT)} r="3.5" className="executive-point treated" /></g>}
        {labels.map((index) => <text key={index} x={x(index)} y={height - 12} textAnchor={index === 0 ? 'start' : index === samples.length - 1 ? 'end' : 'middle'} className="executive-axis-label">{dateLabel(samples[index], hourly)}</text>)}
        <text transform={`translate(14 ${pad.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" className="executive-axis-title">CO₂ emissions ({unit})</text>
      </svg>
      {tooltip && <div className="executive-chart-tooltip" style={{ left: `${tooltipLeft}%` }}><strong>{dateLabel(tooltip, hourly)}</strong><span>Baseline: {format(tooltip.baselineEmissionsT, 1)} {unit}</span><span>With chitosan: {format(tooltip.treatedEmissionsT, 1)} {unit}</span><span>Reduction: {format(tooltip.captureEfficiency, 1)}%</span></div>}
    </> : <div className="executive-chart-empty">No simulated samples are available for this time selection.</div>}
  </div>
}

function ExecutiveDashboardPage() {
  const active = useSyncExternalStore(subscribeToActiveScenario, getActiveScenarioResult, getActiveScenarioResult)
  const [impactPeriod, setImpactPeriod] = useState<ScenarioPeriod>('monthly')
  const [timeMode, setTimeMode] = useState<TimeMode>('live')
  const [chartRange, setChartRange] = useState<DashboardRange>('today')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [reportMonth, setReportMonth] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [running, setRunning] = useState(false)

  useEffect(() => {
    const saved = getActiveScenarioResult()
    if (!saved || saved.period !== impactPeriod) {
      setActiveScenarioResult(runScenario(saved?.snapshot ?? getCurrentScenarioSnapshot(), impactPeriod))
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const first = active.dailySamples[0]?.timestamp
    const last = active.dailySamples.at(-1)?.timestamp
    if (!customStart && first) setCustomStart(toLocalInput(new Date(new Date(first).getTime() - 86_400_000).toISOString()))
    if (!customEnd && last) setCustomEnd(toLocalInput(last))
    if (!reportMonth && first) setReportMonth(sampleMonth(first))
  }, [active, customStart, customEnd, reportMonth])

  const snapshot = active?.snapshot
  const monthOptions = useMemo(() => [...new Set(active?.dailySamples.map((sample) => sampleMonth(sample.timestamp)) ?? [])], [active])
  const viewSamples = useMemo(() => {
    if (!active) return []
    if (timeMode === 'live' && chartRange === 'today') return active.hourlySamples
    if (timeMode === 'live') return active.dailySamples.slice(0, chartRange === '7-days' ? 7 : 30)
    return emissions(active, timeMode, chartRange, customStart, customEnd, reportMonth)
  }, [active, timeMode, chartRange, customStart, customEnd, reportMonth])
  const viewTotals = useMemo(() => calculateTotals(viewSamples), [viewSamples])
  const impact = useMemo(() => active ? calculateTotals(active.samples) : null, [active])
  const required = snapshot ? calculateDataCompleteness(snapshot) : { count: 0, total: 18, percent: 0 }
  const productOutput = getParameter('product-output-rate')?.value
  const customSpanDays = customStart && customEnd ? Math.max(1 / 24, (new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86_400_000) : viewSamples.length
  const daysInView = timeMode === 'live' && chartRange === 'today' ? 1 : timeMode === 'custom' ? customSpanDays : Math.max(1, viewSamples.length)
  const selectedHourly = (timeMode === 'live' && chartRange === 'today') || (timeMode === 'custom' && Boolean(customStart && customEnd) && new Date(customEnd).getTime() - new Date(customStart).getTime() <= 36 * 3_600_000)
  const baselinePerDay = viewTotals.inputTonnes / daysInView
  const currentPerDay = viewTotals.remainingTonnes / daysInView
  const capturedPerDay = viewTotals.capturedTonnes / daysInView
  const intensity = typeof productOutput === 'number' && productOutput > 0 && viewTotals.inputTonnes > 0 ? currentPerDay / productOutput : null
  const energyPerTonne = viewTotals.capturedTonnes > 0 ? viewTotals.energyMWh * 1_000 / viewTotals.capturedTonnes : 0
  const sampleTime = active?.hourlySamples.at(-1)?.timestamp ?? active?.samples.at(-1)?.timestamp
  const displayedTime = sampleTime ? formatMalaysiaDateTime(sampleTime, true) : 'Preparing simulation'
  const capturedTreeEquivalents = impact ? Math.round(impact.capturedTonnes * 1_000 / readNumberParameter('equivalence-tree-co2-kg-year')) : 0
  const capturedCarEquivalents = impact ? Math.round(impact.capturedTonnes / readNumberParameter('equivalence-car-co2-tonnes-year')) : 0
  const impactDates = active?.dailySamples.length ? `${monthLabel(sampleMonth(active.dailySamples[0].timestamp))}${impactPeriod === 'yearly' ? ` – ${monthLabel(sampleMonth(active.dailySamples.at(-1)!.timestamp))}` : ''}` : 'Selected period'

  async function chooseImpactPeriod(period: ScenarioPeriod) {
    setImpactPeriod(period)
    if (!active || active.period === period) return
    setRunning(true)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    setActiveScenarioResult(runScenario(active.snapshot, period))
    setRunning(false)
  }

  function prepareMonthlyReport() {
    const monthSamples = active?.dailySamples.filter((sample) => sampleMonth(sample.timestamp) === reportMonth) ?? []
    const report = {
      reportType: 'monthly',
      month: reportMonth,
      generatedAt: new Date().toISOString(),
      scenario: active?.snapshot ?? null,
      results: calculateTotals(monthSamples),
    }
    try { window.sessionStorage.setItem('chitocapture.pendingMonthlyReport', JSON.stringify(report)) } catch { /* report handoff remains available to this page */ }
    window.dispatchEvent(new CustomEvent('chitocapture:monthly-report-ready', { detail: report }))
    setReportMessage(`${monthLabel(reportMonth)} report data prepared for the Reports handoff.`)
  }

  const configuration = snapshot ?? getCurrentScenarioSnapshot()
  const impactDataDays = Math.max(1, active?.dailySamples.length ?? 0)
  const eqBasisTree = readNumberParameter('equivalence-tree-co2-kg-year')
  const eqBasisCar = readNumberParameter('equivalence-car-co2-tonnes-year')

  return <div className="dashboard-shell executive-page">
    <Header page="executive" title="Executive Dashboard" subtitle="Overview of key metrics and overall impact of the chitosan-based CO₂ capture system" />
    <main className="dashboard-main executive-main">
      <div className="executive-top-grid">
        <section className="executive-source-card panel" aria-labelledby="source-config-title">
          <div className="executive-card-heading"><h2 id="source-config-title">Source Configuration</h2><span>SCENARIO INPUT</span></div>
          <div className="executive-source-fields">
            <label><span><b aria-hidden="true">♙</b>Industry</span><select value={configuration.industry} disabled aria-label="Industry"><option>{configuration.industry}</option></select></label>
            <label><span><b aria-hidden="true">▤</b>Emission source type</span><select value={configuration.emissionSource} disabled aria-label="Emission source type"><option>{configuration.emissionSource}</option></select></label>
            <label><span><b aria-hidden="true">⌖</b>Site</span><select value={configuration.site} disabled aria-label="Site"><option>{configuration.site}</option></select></label>
            <div className="executive-data-mode"><span>Data mode</span><b><i />Live system (Simulated)</b></div>
          </div>
        </section>

        <section className="executive-time-card panel" aria-labelledby="time-selection-title">
          <div className="executive-card-heading"><h2 id="time-selection-title">Time Selection</h2><span>{timeMode === 'live' ? 'SIMULATION TIME' : 'REPORTING RANGE'}</span></div>
          <div className="executive-time-tabs" role="tablist" aria-label="Time selection mode">
            <button className={timeMode === 'live' ? 'active' : ''} onClick={() => { setTimeMode('live'); setChartRange('today') }}>Live view</button>
            <button className={timeMode === 'custom' ? 'active' : ''} onClick={() => setTimeMode('custom')}>Custom date</button>
            <button className={timeMode === 'monthly-report' ? 'active' : ''} onClick={() => setTimeMode('monthly-report')}>Monthly report</button>
          </div>
          {timeMode === 'live' ? <div className="executive-live-time"><span className="executive-live-dot" />{displayedTime} · MYT</div> : timeMode === 'custom' ? <div className="executive-date-range"><label>From (MYT)<input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>To (MYT)<input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div> : <div className="executive-report-select"><select value={reportMonth} onChange={(event) => { setReportMonth(event.target.value); setReportMessage('') }} aria-label="Report month">{monthOptions.map((month) => <option key={month} value={month}>{monthLabel(month)}</option>)}</select><button onClick={prepareMonthlyReport} disabled={!active}>Generate Monthly Report</button></div>}
          {reportMessage && <p className="executive-report-status" role="status">{reportMessage}</p>}
        </section>
      </div>

      <section className="executive-kpi-section" aria-labelledby="executive-kpi-heading">
        <div className="executive-section-heading"><h2 id="executive-kpi-heading">Key Performance Indicators (Live)</h2><span className="executive-simulation-tag"><i />SIMULATION PROTOTYPE</span></div>
        <div className="executive-kpi-grid">
          <Kpi label="Baseline CO₂ emission" value={active ? format(baselinePerDay, 1) : '—'} unit="t/day" help="Before capture, averaged over this time selection." />
          <Kpi label="Current emission" value={active ? format(currentPerDay, 1) : '—'} unit="t/day" trend={active ? `${format(viewTotals.efficiency, 1)}% lower than baseline` : undefined} help="Remaining CO₂ after capture." />
          <Kpi label="CO₂ captured" value={active ? format(capturedPerDay, 1) : '—'} unit="t/day" tone="green" help="Captured CO₂ averaged over this time selection." />
          <Kpi label="Capture efficiency" value={active ? format(viewTotals.efficiency, 2) : '—'} unit="%" tone="green" help="Captured CO₂ divided by baseline CO₂." />
          <Kpi label="Energy per tCO₂" value={active ? format(energyPerTonne, 1) : '—'} unit="kWh/tCO₂" help="Process energy divided by captured CO₂." />
          <Kpi label="CO₂ intensity" value={intensity === null ? '—' : format(intensity, 2)} unit="tCO₂/t product" help={intensity === null ? 'Product output is not configured, so intensity cannot be calculated yet.' : 'Remaining CO₂ divided by product output.'} />
          <article className="executive-kpi completeness"><span className="executive-kpi-label">Data completeness <Info text="Share of required scenario and production inputs that are available and valid." /></span><strong>{required.percent}<small>%</small></strong><div className="completeness-track"><i style={{ width: `${required.percent}%` }} /></div><span className="executive-kpi-unit">{required.count} of {required.total} required inputs</span></article>
        </div>
      </section>

      <div className="executive-lower-grid">
        <section className="executive-chart-card panel" aria-labelledby="emissions-heading">
          <div className="executive-chart-heading"><div><h2 id="emissions-heading">CO₂ Emissions Over Time</h2><div className="executive-chart-legend"><span><i className="baseline" />Baseline (no capture)</span><span><i className="treated" />With chitosan capture</span></div></div><div className="executive-chart-tools"><select aria-label="Chart interval" value={chartRange} onChange={(event) => { setTimeMode('live'); setChartRange(event.target.value as DashboardRange) }}><option value="today">Today</option><option value="7-days">7 days</option><option value="30-days">30 days</option></select><span>{selectedHourly ? 'Hourly totals · model step 15 min' : 'Daily totals'}</span></div></div>
          {active ? <EmissionsChart samples={viewSamples} hourly={selectedHourly} /> : <div className="executive-chart-empty">Preparing simulated emissions…</div>}
          <div className="executive-chart-basis">Series and KPIs use the same process-engine samples. Hourly totals aggregate 15-minute model steps · {viewSamples.length} samples selected.</div>
        </section>

        <section className="executive-impact-card panel" aria-labelledby="impact-heading">
          <div className="executive-impact-heading"><div><h2 id="impact-heading">Cumulative Impact</h2><p>{impactDates}{running ? ' · Updating…' : ''}</p></div><div className="executive-impact-tabs" role="group" aria-label="Cumulative impact period"><button className={impactPeriod === 'monthly' ? 'active' : ''} onClick={() => void chooseImpactPeriod('monthly')}>Monthly</button><button className={impactPeriod === 'yearly' ? 'active' : ''} onClick={() => void chooseImpactPeriod('yearly')}>Yearly</button></div></div>
          <div className="executive-impact-grid">
            <Impact label="CO₂ captured" value={impact ? format(impact.capturedTonnes, 1) : '—'} unit="tCO₂" icon="◉" />
            <Impact label="Emission reduction" value={impact ? format(impact.efficiency, 2) : '—'} unit="%" icon="↘" green />
            <Impact label="Energy consumed" value={impact ? format(impact.energyMWh) : '—'} unit="MWh" icon="ϟ" />
            <article className="executive-equivalence"><div className="equivalence-title">Equivalent impact <Info text="Illustrative comparisons only; these are not measured physical outcomes." /></div><div><b aria-hidden="true">♧</b><span><strong>{format(capturedTreeEquivalents)}</strong> tree-year equivalents<small>At {format(eqBasisTree)} kg CO₂/tree/year · assumption</small></span></div><div><b aria-hidden="true">▰</b><span><strong>{format(capturedCarEquivalents)}</strong> car-year equivalents<small>At {format(eqBasisCar, 1)} t CO₂/car/year · assumption</small></span></div></article>
          </div>
          <p className="executive-equivalence-note">Illustrative equivalency based on the displayed conversion assumptions. Period: {impactDataDays} modeled days.</p>
        </section>
      </div>
      <p className="executive-data-note">All displayed readings are simulated unless explicitly identified as measured data. Carbon intensity is unavailable until product output is specified.</p>
    </main>
    <footer className="app-footer"><span>CHITOCAPTURE <b>·</b> EXECUTIVE DASHBOARD</span><span>SIMULATION PROTOTYPE <i /></span></footer>
  </div>
}

function Info({ text }: { text: string }) {
  return <span className="executive-info" tabIndex={0} aria-label={text} title={text}>i</span>
}

function Kpi({ label, value, unit, trend, tone, help }: { label: string; value: string; unit: string; trend?: string; tone?: 'green'; help: string }) {
  return <article className={`executive-kpi${tone ? ` ${tone}` : ''}`} title={help}><span className="executive-kpi-label">{label}<Info text={help} /></span><strong>{value}<small>{unit}</small></strong>{trend ? <span className="executive-kpi-trend">↓ {trend}</span> : <span className="executive-kpi-unit">{tone === 'green' ? 'Process estimate' : help.length > 45 ? 'Model output' : 'Scenario output'}</span>}</article>
}

function Impact({ label, value, unit, icon, green = false }: { label: string; value: string; unit: string; icon: string; green?: boolean }) {
  return <article className={`executive-impact-metric${green ? ' green' : ''}`}><span className="executive-impact-icon" aria-hidden="true">{icon}</span><div><span>{label}</span><strong>{value} <small>{unit}</small></strong><small>This period</small></div></article>
}

export default ExecutiveDashboardPage
