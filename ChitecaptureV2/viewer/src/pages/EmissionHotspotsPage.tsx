import { useMemo, useState, useSyncExternalStore } from 'react'
import Header from '../components/Header'
import { getOrganisationCarbonState, getOrganisationCarbonRevision, subscribeToOrganisationCarbon } from '../data/organisationCarbon'
import { buildHotspotScenarioSearchParams, getHotspotQualityWarnings, matchReductionProfile, recommendationLibrary, selectTopRankedHotspots } from '../data/reductionRecommendationLibrary'
import { getHotspotDisplayName } from '../simulation/hotspotDisplay'
import type { ActivityData, CalculationRecord, EmissionCategory, ScopeClassification } from '../types/organisationCarbon'

const categories: EmissionCategory[] = ['Electricity', 'Fuel', 'Transport', 'Waste', 'Industrial Activity', 'Other']
const scopes: ScopeClassification[] = ['Scope 1', 'Scope 2', 'Scope 3', 'Unclassified']
const fmt = (value: number, digits = 2) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits }).format(value)
const pct = (value: number, total: number) => total > 0 ? value / total * 100 : 0
const valid = (record: CalculationRecord) => record.validationStatus === 'valid' && Number.isFinite(record.calculatedTCO2e) && record.calculatedTCO2e >= 0

type HotspotRow = { record: CalculationRecord; records: CalculationRecord[]; activity?: ActivityData; name: string; total: number; share: number }

function EmissionHotspotsPage() {
  useSyncExternalStore(subscribeToOrganisationCarbon, getOrganisationCarbonRevision, getOrganisationCarbonRevision)
  const state = getOrganisationCarbonState()
  const [organisationId, setOrganisationId] = useState(state.organisations[0]?.organisationId ?? '')
  const [siteId, setSiteId] = useState('All sites')
  const [year, setYear] = useState('All years')
  const [period, setPeriod] = useState('All periods')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [scopeFilter, setScopeFilter] = useState('All scopes')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'emissions' | 'contribution'>('emissions')
  const [rankCount, setRankCount] = useState<3 | 5>(3)
  const [selected, setSelected] = useState<HotspotRow | null>(null)

  const orgRecords = useMemo(() => state.inventory.filter((record) => valid(record) && record.organisationId === organisationId && (siteId === 'All sites' || record.siteId === siteId)), [state.inventory, organisationId, siteId])
  const years = [...new Set(orgRecords.map((record) => record.reportingPeriod.slice(0, 4)).filter(Boolean))].sort().reverse()
  const effectiveYear = year !== 'All years' && years.includes(year) ? year : 'All years'
  const yearRecords = orgRecords.filter((record) => effectiveYear === 'All years' || record.reportingPeriod.startsWith(`${effectiveYear}-`))
  const periods = [...new Set(yearRecords.map((record) => record.reportingPeriod))].sort()
  const effectivePeriod = period !== 'All periods' && periods.includes(period) ? period : 'All periods'
  const records = yearRecords.filter((record) => effectivePeriod === 'All periods' || record.reportingPeriod === effectivePeriod)
  const trendPeriods = [...new Set(records.map((record) => record.reportingPeriod))].sort()
  const total = records.reduce((sum, record) => sum + record.calculatedTCO2e, 0)
  const activities = new Map(state.activities.map((activity) => [activity.activityId, activity]))
  const factors = new Map(state.factors.map((factor) => [factor.factorId, factor]))
  const sources = new Map(state.sources.map((source) => [source.sourceId, source]))

  const grouped = new Map<string, { record: CalculationRecord; records: CalculationRecord[]; activity?: ActivityData; name: string; total: number }>()
  records.forEach((record) => {
    const activity = activities.get(record.activityId)
    const item = grouped.get(record.activityId)
    grouped.set(record.activityId, { record: item?.record ?? record, records: [...(item?.records ?? []), record], activity, name: getHotspotDisplayName(activity?.activityType, record.category), total: (item?.total ?? 0) + record.calculatedTCO2e })
  })
  const rows: HotspotRow[] = [...grouped.values()].map((item) => ({ ...item, share: pct(item.total, total) })).sort((a, b) => sort === 'emissions' ? b.total - a.total : b.share - a.share)
  const opportunityRows = selectTopRankedHotspots(rows, rankCount)
  const visibleRows = rows.filter((row) => {
    const text = `${row.name} ${row.record.activityId} ${row.record.siteId} ${row.record.sourceId}`.toLowerCase()
    return (categoryFilter === 'All categories' || row.record.category === categoryFilter) && (scopeFilter === 'All scopes' || row.record.scope === scopeFilter) && text.includes(query.trim().toLowerCase())
  })
  const categoryTotals = categories.map((category) => ({ category, total: records.filter((record) => record.category === category).reduce((sum, record) => sum + record.calculatedTCO2e, 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total)
  const scopeTotals = scopes.map((scope) => ({ scope, total: records.filter((record) => record.scope === scope).reduce((sum, record) => sum + record.calculatedTCO2e, 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total)
  const siteTotals = [...new Set(records.map((record) => record.siteId))].map((id) => ({ id, name: state.sites.find((site) => site.siteId === id)?.siteName || id, total: records.filter((record) => record.siteId === id).reduce((sum, record) => sum + record.calculatedTCO2e, 0) })).sort((a, b) => b.total - a.total)
  const estimatedCount = records.filter((record) => record.dataStatus === 'ESTIMATED').length
  const assumedCount = records.filter((record) => record.dataStatus === 'ASSUMED').length
  const unclassifiedRecords = records.filter((record) => record.scope === 'Unclassified')
  const unverifiedRecords = records.filter((record) => factors.get(record.factorId)?.verificationStatus !== 'verified')
  const completeRecords = records.filter((record) => record.activityId && record.siteId && record.reportingPeriod && record.factorId && record.sourceId && record.scope !== 'Unclassified')
  const completeness = records.length ? completeRecords.length / records.length * 100 : 0

  const selectedSource = selected ? sources.get(selected.record.sourceId) : undefined
  const canEvaluate = Boolean(selected?.activity && selected.activity.category === 'Industrial Activity' && selected.activity.isPointSource && selected.activity.captureCompatible)
  const scenarioHrefFor = (row: HotspotRow) => {
    const activity = row.activity
    const activityPeriods = [...new Set(row.records.map((record) => record.reportingPeriod))]
    const selectedMonth = activityPeriods.length === 1 && /^\d{4}-\d{2}$/.test(activityPeriods[0]) ? activityPeriods[0] : undefined
    const directCO2Only = row.records.length > 0 && row.records.every((record) => record.gasType === 'CO2')
    const params = buildHotspotScenarioSearchParams({
      organisation: state.organisations.find((org) => org.organisationId === row.record.organisationId)?.organisationName || row.record.organisationId,
      site: state.sites.find((site) => site.siteId === row.record.siteId)?.siteName || row.record.siteId,
      industry: activity?.industry,
      category: row.record.category,
      source: activity?.processType || activity?.activityType || row.name,
      inventoryEmissionsTCO2e: row.total,
      inventoryPeriod: selectedMonth ?? (effectivePeriod !== 'All periods' ? effectivePeriod : effectiveYear !== 'All years' ? `${effectiveYear} · selected periods` : 'All filtered periods'),
      inventoryRecordCount: row.records.length,
      inventoryCanDriveBaseline: Boolean(selectedMonth && directCO2Only),
      inventoryCO2Concentration: activity?.captureSource?.co2Concentration,
    })
    return `${import.meta.env.BASE_URL}?${params.toString()}`
  }
  const scenarioHref = selected ? scenarioHrefFor(selected) : '#'

  return <div className="dashboard-shell hotspots-page">
    <Header page="hotspots" title="Emission Hotspots" subtitle="Rank and investigate saved emissions from the organisational inventory." />
    <main className="dashboard-main hotspots-main">
      <section className="carbon-filter-bar hotspots-filters">
        <label>Organisation<select value={organisationId} onChange={(event) => { setOrganisationId(event.target.value); setSiteId('All sites'); setYear('All years'); setPeriod('All periods') }}>{state.organisations.map((org) => <option key={org.organisationId} value={org.organisationId}>{org.organisationName}</option>)}</select></label>
        <label>Site<select value={siteId} onChange={(event) => { setSiteId(event.target.value); setPeriod('All periods') }}><option>All sites</option>{state.sites.filter((site) => site.organisationId === organisationId).map((site) => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}</select></label>
        <label>Reporting year<select value={effectiveYear} onChange={(event) => { setYear(event.target.value); setPeriod('All periods') }}><option>All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Reporting period<select value={effectivePeriod} onChange={(event) => setPeriod(event.target.value)}><option>All periods</option>{periods.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>

      {records.length === 0 ? <section className="carbon-empty-state"><span className="carbon-empty-icon">⌁</span><h2>No reduction opportunities can be generated yet.</h2><p>Add and validate emissions activity data to identify reduction opportunities.</p><a className="primary-button" href={`${import.meta.env.BASE_URL}?page=carbon-calculator`}>Open Carbon Footprint Calculator →</a></section> : <>
        <section className="carbon-kpi-grid hotspots-kpis">
          <article className="carbon-kpi"><span>Largest emission source</span><strong>{rows[0]?.name ?? '—'}</strong><small>{fmt(rows[0]?.total ?? 0)} tCO₂e · {fmt(rows[0]?.share ?? 0, 1)}% of filtered total</small></article>
          <article className="carbon-kpi"><span>Largest emission category</span><strong>{categoryTotals[0]?.category ?? '—'}</strong><small>{fmt(categoryTotals[0]?.total ?? 0)} tCO₂e · {fmt(pct(categoryTotals[0]?.total ?? 0, total), 1)}%</small></article>
          <article className="carbon-kpi"><span>Inventory coverage</span><strong>{fmt(completeness, 0)}%</strong><small>{completeRecords.length} of {records.length} records have source, scope, site and period details</small></article>
          <article className="carbon-kpi"><span>Highest emitting scope</span><strong>{scopeTotals[0]?.scope ?? '—'}</strong><small>{fmt(scopeTotals[0]?.total ?? 0)} tCO₂e · {fmt(pct(scopeTotals[0]?.total ?? 0, total), 1)}%</small></article>
        </section>

        <div className="hotspots-grid">
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Emissions by Category</h2><p>Ranked from saved inventory · tCO₂e</p></div></div><div className="hotspot-bars">{categoryTotals.map((item, index) => <div className="hotspot-bar-row" key={item.category}><span>{item.category}</span><div className="hotspot-bar-track"><i style={{ width: `${total ? item.total / Math.max(...categoryTotals.map((entry) => entry.total)) * 100 : 0}%` }} /></div><strong>{fmt(item.total)}</strong><small>{fmt(pct(item.total, total), 1)}%</small><span className="hotspot-bar-rank">{index + 1}</span></div>)}</div></section>
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Emissions by Scope</h2><p>Explicit classification on saved records</p></div></div><div className="hotspot-bars">{scopeTotals.map((item, index) => <div className="hotspot-bar-row" key={item.scope}><span>{item.scope}</span><div className="hotspot-bar-track"><i style={{ width: `${total ? item.total / Math.max(...scopeTotals.map((entry) => entry.total)) * 100 : 0}%` }} /></div><strong>{fmt(item.total)}</strong><small>{fmt(pct(item.total, total), 1)}%</small><span className="hotspot-bar-rank">{index + 1}</span></div>)}</div></section>
          <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Emissions by Site</h2><p>Ranked within the selected organisation and filters</p></div></div><div className="hotspot-bars">{siteTotals.map((item, index) => <div className="hotspot-bar-row" key={item.id}><span title={item.name}>{item.name}</span><div className="hotspot-bar-track"><i style={{ width: `${total ? item.total / Math.max(...siteTotals.map((entry) => entry.total)) * 100 : 0}%` }} /></div><strong>{fmt(item.total)}</strong><small>{fmt(pct(item.total, total), 1)}%</small><span className="hotspot-bar-rank">{index + 1}</span></div>)}</div></section>
        </div>

        <section className="carbon-card hotspot-table-card" id="hotspot-table"><div className="carbon-card-heading"><div><h2>Ranked Emission Hotspots</h2><p>One row per source activity, ranked using its saved inventory emissions.</p></div><span className="carbon-quality-badge">{rows.length} sources · {fmt(total)} tCO₂e</span></div>
          <div className="hotspot-table-controls"><label>Search<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search activity, site, source ID…" /></label><label>Category<select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Scope<select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value)}><option>All scopes</option>{scopes.map((scope) => <option key={scope}>{scope}</option>)}</select></label><label>Sort by<select value={sort} onChange={(event) => setSort(event.target.value as 'emissions' | 'contribution')}><option value="emissions">Emissions · highest first</option><option value="contribution">Contribution · highest first</option></select></label></div>
          <div className="hotspot-table-wrap"><table className="hotspot-table"><thead><tr><th>Rank</th><th>Activity / source</th><th>Category</th><th>Site</th><th>Scope</th><th>Emissions</th><th>Contribution</th><th>Data status</th><th>Details</th></tr></thead><tbody>{visibleRows.map((row, index) => <tr key={row.record.activityId}><td><span className="hotspot-rank">{index + 1}</span></td><td><strong>{row.name}</strong><small>{row.record.activityId}</small></td><td>{row.record.category}</td><td>{state.sites.find((site) => site.siteId === row.record.siteId)?.siteName || row.record.siteId}</td><td><span className={`hotspot-scope${row.record.scope === 'Unclassified' ? ' warning' : ''}`}>{row.record.scope}</span></td><td>{fmt(row.total)} tCO₂e</td><td>{fmt(row.share, 1)}%</td><td><span className={`hotspot-data-status ${row.record.dataStatus.toLowerCase().replaceAll(' ', '-')}`}>{row.record.dataStatus}</span></td><td><button className="text-button" type="button" onClick={() => setSelected(row)}>View details</button></td></tr>)}</tbody></table>{visibleRows.length === 0 && <p className="hotspot-no-results">No saved inventory records match these filters.</p>}</div>
        </section>

        <section className="carbon-card hotspot-trend-card"><div className="carbon-card-heading"><div><h2>Hotspot Trend &amp; Reduction Opportunities</h2><p>Explore actual saved reporting periods and screening suggestions for the selected top {rankCount} emission sources.</p></div><div className="hotspot-shared-ranking"><span>Show ranked sources</span><div className="grain-switch" role="group" aria-label="Number of hotspots shown"><button className={rankCount === 3 ? 'active' : ''} onClick={() => setRankCount(3)} type="button">Top 3</button><button className={rankCount === 5 ? 'active' : ''} onClick={() => setRankCount(5)} type="button">Top 5</button></div></div></div>
          <p className="hotspot-screening-note">Suggestions are screening areas only. Assess technical, environmental and economic feasibility before implementation. Missing reporting periods are not filled with zeroes.</p>
          {trendPeriods.length < 2 && <p className="hotspot-single-period">{trendPeriods.length === 1 ? '1 reporting period available' : 'No reporting periods available'} · a trend needs at least two saved periods.</p>}
          <div className="hotspot-trend-grid hotspot-combined-grid">{opportunityRows.map((row, sourceIndex) => {
            const rank = row.rank
            const profile = recommendationLibrary[matchReductionProfile(row.record.category, row.name)]
            const siteName = state.sites.find((site) => site.siteId === row.record.siteId)?.siteName || row.record.siteId
            const qualityWarnings = getHotspotQualityWarnings(row.records, factors, new Set(sources.keys()))
            const captureEligible = Boolean(row.activity?.category === 'Industrial Activity' && row.activity.isPointSource && row.activity.captureCompatible)
            const why = rank === 1 ? 'Largest emission contributor in the selected reporting period.' : `${ordinal(rank)}-largest emission contributor in the selected reporting period.`
            const areas = [...profile.opportunities, ...(captureEligible ? ['Point-source CO₂ capture feasibility'] : [])]
            const trend = trendPeriods.map((item) => ({ period: item, value: records.filter((record) => record.activityId === row.record.activityId && record.reportingPeriod === item).reduce((sum, record) => sum + record.calculatedTCO2e, 0) })).filter((item) => records.some((record) => record.activityId === row.record.activityId && record.reportingPeriod === item.period))
            const maximum = Math.max(0.0001, ...trend.map((item) => item.value))
            return <article className="hotspot-trend-source hotspot-combined-source" key={row.record.activityId}>
              <header className="hotspot-combined-header"><span className="hotspot-rank">#{rank}</span><div className="hotspot-combined-identity"><strong>{row.name}</strong><small>{row.record.category} · {row.record.scope} · {siteName}</small></div><div className="hotspot-combined-metrics"><strong>{fmt(row.total)} tCO₂e</strong><b>{fmt(row.share, 1)}% <small>of selected inventory</small></b></div></header>
              {trendPeriods.length > 1 && <div className="hotspot-trend-points hotspot-combined-points">{trend.map((item) => <div key={item.period}><span>{item.period}</span><i><b style={{ width: `${item.value / maximum * 100}%`, opacity: 1 - sourceIndex * 0.12 }} /></i><strong>{fmt(item.value)}</strong></div>)}</div>}
              <div className="hotspot-combined-opportunities"><div className="hotspot-combined-why"><strong>Why highlighted</strong><span>{why}</span></div><div><strong>Areas to investigate</strong><ul>{areas.map((area) => <li key={area}>{area}</li>)}</ul></div></div>
              <div className="hotspot-combined-footer"><div className="hotspot-combined-status"><span>Reduction potential: <b>Not yet quantified</b></span><span>Economic assessment: <b>Not evaluated</b></span>{qualityWarnings.length > 0 && <span className="hotspot-combined-warning" title={qualityWarnings.join(' ')}>Data quality: review</span>}</div><div className="hotspot-combined-actions"><button type="button" className="text-button" onClick={() => setSelected(row)}>View emissions →</button>{captureEligible && <a href={scenarioHrefFor(row)}>Evaluate capture scenario →</a>}</div></div>
            </article>
          })}</div>
        </section>

        <aside className="hotspot-quality-strip" aria-label="Data quality summary">
          <strong>Data Quality</strong>
          <span>{unclassifiedRecords.length} unclassified record{unclassifiedRecords.length === 1 ? '' : 's'} · {unverifiedRecords.length} unverified or unavailable factor{unverifiedRecords.length === 1 ? '' : 's'} · {estimatedCount} estimated · {assumedCount} assumed{estimatedCount + assumedCount + unclassifiedRecords.length + unverifiedRecords.length === 0 ? ' · No current data quality flags' : ''}</span>
          <a href="#hotspot-table">Review →</a>
        </aside>
      </>}
    </main>
    {selected && <div className="hotspot-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section className="hotspot-modal" role="dialog" aria-modal="true" aria-labelledby="hotspot-detail-title"><header><div><span className="hotspot-modal-eyebrow">SAVED INVENTORY SOURCE</span><h2 id="hotspot-detail-title">{selected.name}</h2></div><button type="button" aria-label="Close details" onClick={() => setSelected(null)}>×</button></header><dl className="hotspot-detail-grid"><div><dt>Emissions contribution</dt><dd>{fmt(selected.total)} tCO₂e ({fmt(selected.share, 1)}% of filtered total)</dd></div><div><dt>Inventory records</dt><dd>{selected.records.length} saved reporting period{selected.records.length === 1 ? '' : 's'}</dd></div><div><dt>Category</dt><dd>{selected.record.category}</dd></div></dl><h3 className="hotspot-records-heading">Saved calculation details</h3><div className="hotspot-record-list">{[...selected.records].sort((a, b) => a.reportingPeriod.localeCompare(b.reportingPeriod)).map((record) => { const factor = factors.get(record.factorId); const source = sources.get(record.sourceId); return <article key={record.recordId}><div className="hotspot-record-period"><strong>{record.reportingPeriod}</strong><b>{fmt(record.calculatedTCO2e)} tCO₂e</b></div><dl><div><dt>Activity</dt><dd>{fmt(record.activityValue, 3)} {record.activityUnit}</dd></div><div><dt>Site / scope / data status</dt><dd>{state.sites.find((site) => site.siteId === record.siteId)?.siteName || record.siteId} · {record.scope} · {record.dataStatus}</dd></div><div><dt>Emission factor</dt><dd>{fmt(record.factorValue, 5)} {record.factorUnit} · {record.gasType} · {factor?.verificationStatus ?? 'factor entry unavailable'}</dd></div><div><dt>Source</dt><dd>{source?.title || record.sourceId || 'Source unavailable'}{source?.publisher ? ` · ${source.publisher}` : ''}{source?.year ? ` · ${source.year}` : ''}</dd></div><div><dt>Calculation method</dt><dd>{record.calculationMethod}</dd></div><div><dt>Record / calculated at</dt><dd>{record.recordId} · {record.calculatedAt}</dd></div></dl></article> })}</div><footer><a className="secondary-button" href={`${import.meta.env.BASE_URL}?page=data-sources#emission-factors`}>View emission factors &amp; sources</a>{selectedSource?.sourceURL && <a className="secondary-button" href={selectedSource.sourceURL} target="_blank" rel="noreferrer">Open source ↗</a>}{canEvaluate && <a className="primary-button" href={scenarioHref}>Evaluate capture scenario →</a>}</footer>{canEvaluate && <p className="hotspot-context-note">This action passes only organisation, site, industry and source context. Inventory CO₂e is not used as a process-model input.</p>}</section></div>}
  </div>
}

function ordinal(value: number) {
  const remainder100 = value % 100
  if (remainder100 >= 11 && remainder100 <= 13) return `${value}th`
  return `${value}${value % 10 === 1 ? 'st' : value % 10 === 2 ? 'nd' : value % 10 === 3 ? 'rd' : 'th'}`
}

export default EmissionHotspotsPage
