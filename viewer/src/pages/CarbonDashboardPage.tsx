import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Header from '../components/Header'
import { getOrganisationCarbonRevision, getOrganisationCarbonState, saveTarget, subscribeToOrganisationCarbon } from '../data/organisationCarbon'
import type { CarbonTarget, CalculationRecord, EmissionCategory, ScopeClassification } from '../types/organisationCarbon'
import { aggregateInventory, calculateTargetProgress, dashboardCategories as categories, dashboardScopes as scopes, filterInventoryRecords, hasSufficientTrendData, percentageChange, rankInventorySources, sumInventory, validInventoryRecords } from '../simulation/carbonDashboardMetrics'

type Grain = 'Monthly' | 'Quarterly' | 'Annual'
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const categoryColors: Record<EmissionCategory, string> = { Electricity: '#438fc2', Fuel: '#e3a14f', Transport: '#5aa782', Waste: '#8c7bbb', 'Industrial Activity': '#54a8a5', Other: '#d77f87' }
const fmt = (value: number, digits = 1) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
const yearOf = (record: CalculationRecord) => record.reportingPeriod.slice(0, 4)
const pct = (part: number, total: number) => total > 0 ? part / total * 100 : 0
const scopedYears = (records: CalculationRecord[], organisationId: string, siteId: string) => [...new Set(records.filter((record) => record.organisationId === organisationId && (siteId === 'All sites' || record.siteId === siteId)).map(yearOf))].sort().reverse()

function Kpi({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`carbon-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function TrendChart({ labels, current, comparison, grain }: { labels: string[]; current: (number | null)[]; comparison: (number | null)[]; grain: Grain }) {
  const width = 760, height = 260, left = 54, right = 16, top = 17, bottom = 40
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const maximum = Math.max(1, ...current.filter((value): value is number => value != null), ...comparison.filter((value): value is number => value != null))
  if (!hasSufficientTrendData(current, comparison)) return <div className="carbon-chart-empty">Insufficient historical data for trend analysis.</div>
  const slotWidth = plotWidth / labels.length
  const barWidth = Math.max(3, Math.min(15, slotWidth * .28))
  return <div className="carbon-chart-scroll"><svg className="carbon-trend-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${grain} emissions over time in tonnes of CO2 equivalent`}>
    {[0, 1, 2, 3, 4].map((index) => { const y = top + plotHeight * index / 4; const tick = maximum * (4 - index) / 4; return <g key={index}><line x1={left} x2={width - right} y1={y} y2={y} className="chart-grid-line"/><text x={left - 8} y={y + 3} textAnchor="end" className="chart-axis-text">{fmt(tick, tick < 10 ? 1 : 0)}</text></g> })}
    <text x="13" y={top + plotHeight / 2} transform={`rotate(-90 13 ${top + plotHeight / 2})`} className="chart-axis-title">tCO₂e</text>
    {labels.map((label, index) => {
      const center = left + slotWidth * (index + .5)
      const currentValue = current[index], comparisonValue = comparison[index]
      const currentHeight = currentValue == null ? 0 : currentValue / maximum * plotHeight
      const comparisonHeight = comparisonValue == null ? 0 : comparisonValue / maximum * plotHeight
      return <g key={label}><title>{`${label}: Current ${currentValue == null ? 'no saved data' : `${fmt(currentValue, 3)} tCO₂e`}; Comparison ${comparisonValue == null ? 'no saved data' : `${fmt(comparisonValue, 3)} tCO₂e`}`}</title>
        {currentValue != null && <rect x={center - barWidth - 1} y={top + plotHeight - currentHeight} width={barWidth} height={Math.max(1, currentHeight)} rx="2" className="chart-current-bar"/>}
        {comparisonValue != null && <rect x={center + 1} y={top + plotHeight - comparisonHeight} width={barWidth} height={Math.max(1, comparisonHeight)} rx="2" className="chart-comparison-bar"/>}
        <text x={center} y={height - 15} textAnchor="middle" className="chart-axis-text">{label}</text>
      </g>
    })}
  </svg></div>
}

function CarbonDashboardPage() {
  useSyncExternalStore(subscribeToOrganisationCarbon, getOrganisationCarbonRevision, getOrganisationCarbonRevision)
  const state = getOrganisationCarbonState()
  const records = useMemo(() => validInventoryRecords(state.inventory), [state.inventory])
  const initialOrg = state.organisations[0]?.organisationId ?? ''
  const initialYears = scopedYears(records, initialOrg, 'All sites')
  const [organisationId, setOrganisationId] = useState(initialOrg)
  const [siteId, setSiteId] = useState('All sites')
  const [reportYear, setReportYear] = useState(initialYears[0] ?? '')
  const [compareYear, setCompareYear] = useState(initialYears.find((year) => year !== initialYears[0]) ?? '')
  const [grain, setGrain] = useState<Grain>('Monthly')
  const [targetOpen, setTargetOpen] = useState(false)
  const [targetError, setTargetError] = useState('')
  const [baselineYear, setBaselineYear] = useState('')
  const [targetYear, setTargetYear] = useState('')
  const [targetEmissions, setTargetEmissions] = useState('')
  useEffect(() => {
    if (!targetOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [targetOpen])
  const organisation = state.organisations.find((item) => item.organisationId === organisationId)
  const sites = state.sites.filter((site) => site.organisationId === organisationId)
  const yearOptions = scopedYears(records, organisationId, siteId)
  const currentRecords = filterInventoryRecords(records, organisationId, siteId, reportYear)
  const comparisonRecords = compareYear ? filterInventoryRecords(records, organisationId, siteId, compareYear) : []
  const currentTotals = aggregateInventory(currentRecords), comparisonTotals = aggregateInventory(comparisonRecords)
  const total = currentTotals.total, comparisonTotal = comparisonTotals.total
  const currentByScope = currentTotals.byScope
  const currentByCategory = currentTotals.byCategory
  const comparisonByCategory = comparisonTotals.byCategory
  const currentChange = percentageChange(total, comparisonTotal)
  const categoryBreakdown = categories.filter((category) => currentByCategory[category] > 0).map((category) => ({ category, value: currentByCategory[category], color: categoryColors[category] }))
  const categoryGradient = categoryBreakdown.reduce((stops, item) => { const start = stops.at(-1)?.end ?? 0; const end = start + pct(item.value, total); return [...stops, { ...item, start, end }] }, [] as ({ category: EmissionCategory; value: number; color: string; start: number; end: number })[])
  const filteredRecords = records.filter((record) => record.organisationId === organisationId && (siteId === 'All sites' || record.siteId === siteId))
  const monthlyLabels = months
  const quarterLabels = ['Q1', 'Q2', 'Q3', 'Q4']
  const annualLabels = [...new Set([...yearOptions.filter((year) => year <= reportYear), ...(compareYear ? [compareYear] : [])])].sort()
  const labels = grain === 'Monthly' ? monthlyLabels : grain === 'Quarterly' ? quarterLabels : annualLabels
  const valuesFor = (list: CalculationRecord[], year: string) => labels.map((label) => {
    if (!year) return null
    const selected = list.filter((record) => yearOf(record) === year)
    if (grain === 'Annual') return selected.length ? sumInventory(selected) : null
    if (grain === 'Monthly') { const index = months.indexOf(label); const bucket = selected.filter((record) => Number(record.reportingPeriod.slice(5, 7)) === index + 1); return bucket.length ? sumInventory(bucket) : null }
    const quarter = Number(label.slice(1))
    const bucket = selected.filter((record) => Math.ceil(Number(record.reportingPeriod.slice(5, 7)) / 3) === quarter)
    return bucket.length ? sumInventory(bucket) : null
  })
  const currentTrend = grain === 'Annual' ? labels.map((year) => year === compareYear ? null : sumInventory(filteredRecords.filter((record) => yearOf(record) === year))) : valuesFor(filteredRecords, reportYear)
  const comparisonTrend = grain === 'Annual' ? labels.map((year) => year === compareYear ? sumInventory(filteredRecords.filter((record) => yearOf(record) === year)) : null) : valuesFor(filteredRecords, compareYear)
  const comparisonHasData = comparisonRecords.length > 0
  const categoryChange = categories.map((category) => ({ category, current: currentByCategory[category], comparison: comparisonByCategory[category], change: percentageChange(currentByCategory[category], comparisonByCategory[category]) })).filter((item) => item.current > 0 || item.comparison > 0).sort((a, b) => b.current - a.current)
  const activitiesById = new Map(state.activities.map((activity) => [activity.activityId, activity]))
  const factorsById = new Map(state.factors.map((factor) => [factor.factorId, factor]))
  const completeCount = currentRecords.filter((record) => { const activity = activitiesById.get(record.activityId); const factor = factorsById.get(record.factorId); return !!activity?.activityType?.trim() && Number.isFinite(activity.activityValue) && !!activity.unit && !!activity.siteId && !!activity.reportingPeriod && !!factor?.factorUnit && !!factor.sourceId }).length
  const verifiedRecords = currentRecords.filter((record) => factorsById.get(record.factorId)?.verificationStatus === 'verified')
  const companyProvided = currentRecords.filter((record) => record.dataStatus === 'COMPANY PROVIDED' || record.dataStatus === 'MEASURED')
  const estimated = currentRecords.filter((record) => record.dataStatus === 'ESTIMATED' || record.dataStatus === 'ASSUMED')
  const estimatedEmissions = sumInventory(estimated)
  const unclassified = currentByScope.Unclassified
  const rankedSources = rankInventorySources(currentRecords, new Map([...activitiesById].map(([id, activity]) => [id, activity.activityType])))
  const latestSaved = currentRecords.reduce((latest, record) => record.calculatedAt > latest ? record.calculatedAt : latest, '')
  const target = state.targets.find((item) => item.organisationId === organisationId)
  const organisationRecords = records.filter((record) => record.organisationId === organisationId)
  const targetCurrent = target ? sumInventory(organisationRecords.filter((record) => yearOf(record) === reportYear)) : 0
  const targetProgress = target ? calculateTargetProgress(target.baselineEmissionsT, target.targetEmissionsT, targetCurrent) : null
  const organisationYears = scopedYears(records, organisationId, 'All sites')
  const periodChangeLabel = compareYear ? `vs ${compareYear}` : 'No comparison period selected'
  const noData = !reportYear || currentRecords.length === 0

  function changeOrganisation(id: string) {
    const nextYears = scopedYears(records, id, 'All sites')
    setOrganisationId(id); setSiteId('All sites'); setReportYear(nextYears[0] ?? '')
    setCompareYear(nextYears.find((year) => year !== nextYears[0]) ?? '')
  }
  function changeSite(id: string) {
    const nextYears = scopedYears(records, organisationId, id)
    setSiteId(id); setReportYear(nextYears[0] ?? '')
    setCompareYear(nextYears.find((year) => year !== nextYears[0]) ?? '')
  }
  function changeReportYear(year: string) { setReportYear(year); setCompareYear(yearOptions.find((item) => item !== year && item < year) ?? yearOptions.find((item) => item !== year) ?? '') }
  function openTargetForm() {
    const base = organisationYears.find((year) => year < reportYear) ?? organisationYears[0] ?? ''
    const baseValue = sumInventory(organisationRecords.filter((record) => yearOf(record) === base))
    setBaselineYear(base); setTargetYear(target?.targetYear.toString() ?? ''); setTargetEmissions(target?.targetEmissionsT.toString() ?? '')
    setTargetError(baseValue > 0 ? '' : 'Choose a baseline year with saved emissions before setting a target.')
    setTargetOpen(true)
  }
  function submitTarget(event: React.FormEvent) {
    event.preventDefault()
    const baselineValue = sumInventory(organisationRecords.filter((record) => yearOf(record) === baselineYear))
    const targetYearValue = Number(targetYear), targetValue = Number(targetEmissions)
    if (!baselineYear || baselineValue <= 0) { setTargetError('Select a baseline year that has saved emissions.'); return }
    if (!Number.isInteger(targetYearValue) || targetYearValue <= Number(baselineYear)) { setTargetError('Target year must be a whole year after the baseline year.'); return }
    if (!Number.isFinite(targetValue) || targetValue < 0) { setTargetError('Target emissions must be a valid value of zero or greater.'); return }
    const value: CarbonTarget = { organisationId, baselineYear: Number(baselineYear), baselineEmissionsT: baselineValue, targetYear: targetYearValue, targetEmissionsT: targetValue, targetType: 'absolute', createdAt: target?.createdAt || new Date().toISOString() }
    saveTarget(value); setTargetOpen(false); setTargetError('')
  }

  return <div className="dashboard-shell"><Header page="carbon-dashboard" title="Carbon Dashboard" subtitle="Track organisational carbon emissions, trends and progress over time." />
    <main className="dashboard-main carbon-dashboard-page">
      <section className="carbon-filter-bar" aria-label="Carbon dashboard filters">
        <label>Organisation<select value={organisationId} onChange={(event) => changeOrganisation(event.target.value)}>{state.organisations.map((item) => <option key={item.organisationId} value={item.organisationId}>{item.organisationName}</option>)}</select></label>
        <label>Site<select value={siteId} onChange={(event) => changeSite(event.target.value)}><option value="All sites">All sites</option>{sites.map((site) => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}</select></label>
        <label>Reporting year<select value={yearOptions.includes(reportYear) ? reportYear : ''} onChange={(event) => changeReportYear(event.target.value)}><option value="" disabled>{yearOptions.length ? 'Select year' : 'No saved years'}</option>{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <label>Compare with<select value={compareYear} onChange={(event) => setCompareYear(event.target.value)}><option value="">No comparison</option>{yearOptions.filter((year) => year !== reportYear).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <div className="carbon-inventory-status"><span>●</span><div><strong>Inventory status</strong><small>{currentRecords.length ? `${reportYear} inventory · Last updated ${new Date(latestSaved).toLocaleString('en-MY')}` : 'No saved inventory for this period'}</small></div></div>
      </section>
      {noData ? <section className="carbon-empty-state"><span className="carbon-empty-icon">▤</span><h2>NO EMISSIONS INVENTORY AVAILABLE</h2><p>No saved emissions data is available for this organisation and reporting period.</p><a className="primary-button" href={`${import.meta.env.BASE_URL}?page=carbon-calculator`}>Open Carbon Footprint Calculator</a><small>Enter activity data, calculate emissions and save the results to the Emissions Inventory before tracking performance here.</small></section> : <>
        <section className="carbon-kpi-grid">
          <Kpi label="TOTAL EMISSIONS" value={`${fmt(total, 2)} tCO₂e`} detail="Selected reporting period" tone="primary" />
          {(['Scope 1', 'Scope 2', 'Scope 3'] as ScopeClassification[]).map((scope) => <Kpi key={scope} label={scope.toUpperCase()} value={`${fmt(currentByScope[scope], 2)} tCO₂e`} detail={`${fmt(pct(currentByScope[scope], total), 1)}% of total`} />)}
          <Kpi label="CHANGE VS PREVIOUS PERIOD" value={currentChange == null ? '—' : `${currentChange > 0 ? '↑ ' : currentChange < 0 ? '↓ ' : ''}${fmt(Math.abs(currentChange), 1)}%`} detail={comparisonHasData ? periodChangeLabel : 'No comparison data'} tone={currentChange != null && currentChange > 0 ? 'warning' : 'positive'} />
        </section>
        {unclassified > 0 && <div className="carbon-unclassified-note">⚠ {fmt(pct(unclassified, total), 1)}% of emissions are unclassified ({fmt(unclassified, 2)} tCO₂e).</div>}
        <div className="carbon-dashboard-grid carbon-dashboard-main-grid">
          <section className="carbon-card carbon-trend-card"><div className="carbon-card-heading"><div><h2>Emissions Over Time</h2><p>Saved inventory records · tCO₂e</p></div><div className="grain-switch" role="group" aria-label="Trend period">{(['Monthly', 'Quarterly', 'Annual'] as Grain[]).map((option) => <button type="button" key={option} className={grain === option ? 'active' : ''} onClick={() => setGrain(option)}>{option}</button>)}</div></div><div className="carbon-chart-legend"><span><i className="legend-current"/>{grain === 'Annual' ? 'Annual inventory' : `Current ${reportYear}`}</span>{compareYear && <span><i className="legend-comparison"/>Comparison {compareYear}</span>}</div><TrendChart labels={labels} current={currentTrend} comparison={comparisonTrend} grain={grain} /></section>
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Emissions by Category</h2><p>Current period contribution</p></div></div>{categoryBreakdown.length ? <div className="carbon-donut-layout"><div className="carbon-donut" style={{ background: `conic-gradient(${categoryGradient.map((item) => `${item.color} ${item.start}% ${item.end}%`).join(', ')})` }}><span>TOTAL<strong>{fmt(total, 2)}<small>tCO₂e</small></strong></span></div><div className="carbon-category-legend">{categoryBreakdown.map((item) => <div key={item.category} title={`${item.category}: ${fmt(item.value, 2)} tCO₂e, ${fmt(pct(item.value, total), 1)}%`}><i style={{ background: item.color }}/><span>{item.category === 'Industrial Activity' ? 'Industrial' : item.category}</span><b>{fmt(item.value, 2)}</b><small>{fmt(pct(item.value, total), 1)}%</small></div>)}</div></div> : <p className="carbon-chart-empty">No category emissions in this period.</p>}</section>
        </div>
        <div className="carbon-dashboard-grid carbon-dashboard-secondary-grid">
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Emissions by Scope</h2><p>Explicit inventory classifications</p></div></div><div className="carbon-scope-list">{scopes.map((scope) => { const value = currentByScope[scope]; const share = pct(value, total); return <div key={scope} title={`${scope}: ${fmt(value, 2)} tCO₂e · ${fmt(share, 1)}%`}><span>{scope}</span><div className="carbon-scope-track"><i style={{ width: `${share}%` }}/></div><strong>{fmt(value, 2)} t</strong><small>{fmt(share, 1)}%</small></div> })}</div></section>
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Change by Category</h2><p>Compared with {comparisonHasData ? compareYear : 'selected comparison period'}</p></div></div>{comparisonHasData ? <div className="carbon-change-list">{categoryChange.map((item) => <div key={item.category}><span>{item.category === 'Industrial Activity' ? 'Industrial' : item.category}</span><strong className={item.change == null ? 'no-change-data' : item.change > 0 ? 'change-up' : 'change-down'}>{item.change == null ? 'No comparison data' : `${item.change > 0 ? '↑ ' : item.change < 0 ? '↓ ' : ''}${fmt(Math.abs(item.change), 1)}%`}</strong></div>)}</div> : <p className="carbon-chart-empty">No comparison data for the selected comparison period.</p>}</section>
        </div>
        <div className="carbon-dashboard-grid carbon-dashboard-secondary-grid">
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Carbon Reduction Target</h2><p>Organisation-wide absolute emissions target</p></div>{target && <button type="button" className="text-button" onClick={openTargetForm}>Edit target</button>}</div>{target && targetProgress ? <><div className="carbon-target-metrics"><span>Baseline<b>{fmt(target.baselineEmissionsT, 2)} tCO₂e · {target.baselineYear}</b></span><span>Current<b>{fmt(targetCurrent, 2)} tCO₂e · {reportYear}</b></span><span>Target<b>{fmt(target.targetEmissionsT, 2)} tCO₂e · {target.targetYear}</b></span></div><div className="carbon-target-track"><i style={{ width: `${targetProgress.percent}%` }}/></div><div className="carbon-target-result"><strong>{targetProgress.label}</strong><span>{targetProgress.detail}</span></div></> : <><p className="carbon-chart-empty">No carbon reduction target configured.</p><button type="button" className="primary-button" onClick={openTargetForm}>＋ Configure Target</button></>}</section>
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Top Emission Sources</h2><p>Ranked by saved current-period CO₂e</p></div></div>{rankedSources.length ? <ol className="carbon-top-sources">{rankedSources.map((source, index) => <li key={`${source.name}-${index}`}><span className="source-rank">{index + 1}</span><div><strong>{source.name}</strong><small>{fmt(source.value, 2)} tCO₂e · {fmt(pct(source.value, total), 1)}%</small></div></li>)}</ol> : <p className="carbon-chart-empty">No ranked sources are available.</p>}<a className="hotspot-link" href={`${import.meta.env.BASE_URL}?page=emission-hotspots`}>View Full Hotspot Analysis <span>→</span></a></section>
        </div>
        <section className="carbon-card carbon-quality-card"><div className="carbon-card-heading"><div><h2>Data Quality</h2><p>Completeness indicates required information is present, not measurement accuracy.</p></div><span className="carbon-quality-badge">{fmt(pct(completeCount, currentRecords.length), 0)}% complete</span></div><div className="carbon-quality-grid"><div><span>Data completeness</span><strong>{completeCount}/{currentRecords.length} records · {fmt(pct(completeCount, currentRecords.length), 0)}%</strong></div><div><span>Verified emission factors</span><strong>{verifiedRecords.length}/{currentRecords.length} records · {fmt(pct(verifiedRecords.length, currentRecords.length), 0)}%</strong></div><div><span>Company-provided / measured</span><strong>{companyProvided.length}/{currentRecords.length} records</strong></div><div><span>Estimated / assumed data</span><strong>{estimated.length} records ({fmt(pct(estimated.length, currentRecords.length), 1)}%) · {fmt(pct(estimatedEmissions, total), 1)}% of emissions</strong></div><div><span>Unclassified emissions</span><strong>{fmt(unclassified, 2)} tCO₂e · {fmt(pct(unclassified, total), 1)}%</strong></div></div></section>
      </>}
    </main>
    {targetOpen && <div className="carbon-target-backdrop" role="presentation"><form className="carbon-target-modal" role="dialog" aria-modal="true" aria-labelledby="target-modal-title" onSubmit={submitTarget}><div className="carbon-target-modal-head"><div><h2 id="target-modal-title">Configure carbon target</h2><p>Set an absolute target for {organisation?.organisationName ?? 'this organisation'}.</p></div><button type="button" aria-label="Close" onClick={() => setTargetOpen(false)}>×</button></div><label>Baseline year<select value={baselineYear} onChange={(event) => { setBaselineYear(event.target.value); setTargetError('') }}>{organisationYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label><div className="carbon-target-baseline">Baseline emissions from saved inventory<strong>{fmt(sumInventory(organisationRecords.filter((record) => yearOf(record) === baselineYear)), 2)} tCO₂e</strong></div><label>Target year<input required type="number" min={Number(baselineYear) + 1} step="1" value={targetYear} onChange={(event) => setTargetYear(event.target.value)}/></label><label>Target emissions (tCO₂e)<input required type="number" min="0" step="any" value={targetEmissions} onChange={(event) => setTargetEmissions(event.target.value)}/></label>{targetError && <p className="carbon-target-error" role="alert">{targetError}</p>}<div className="carbon-target-modal-actions"><button type="button" className="secondary-button" onClick={() => setTargetOpen(false)}>Cancel</button><button type="submit" className="primary-button">Save target</button></div></form></div>}
  </div>
}

export default CarbonDashboardPage
