import type { BusinessReportKind, BusinessReportSnapshot } from './businessReportSnapshot'
import { getBusinessReportCharts, getBusinessReportMetrics } from './businessReportSnapshot'
import { reportMethodologyNotes, reportModelLimitations } from '../data/reportMetadata'
import { matchReductionProfile, recommendationLibrary } from '../data/reductionRecommendationLibrary'
import { rankInventorySources } from './carbonDashboardMetrics'

export type ReportTable = { title: string; headers: string[]; rows: string[][] }
export type ReportChart = { kind: 'bars' | 'line' | 'flow' | 'progress'; title: string; unit: string; rows: Array<{ label: string; value: number; secondary?: number; share?: number }> }
export type PreviewPage = { id: string; title: string; subtitle?: string; kpis?: Array<{ label: string; value: string; detail?: string }>; charts?: ReportChart[]; tables?: ReportTable[]; notes?: string[]; empty?: string }

const fmt = (value: number, digits = 2) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
const t = (value: number) => `${fmt(value)} tCO₂e`
const pct = (value: number) => `${fmt(value, 1)}%`
const kindSupportsOrganisation = (kind: BusinessReportKind) => kind !== 'capture'
const kindSupportsCapture = (kind: BusinessReportKind) => kind !== 'targets' && kind !== 'data-quality'

function captureKpis(snapshot: BusinessReportSnapshot) {
  const result = snapshot.captureScenario
  if (!result) return []
  return [
    { label: 'CO₂ input', value: t(result.inputTonnes), detail: 'Simulated' },
    { label: 'CO₂ captured', value: t(result.capturedTonnes), detail: 'Simulated' },
    { label: 'CO₂ remaining', value: t(result.remainingTonnes), detail: 'Simulated' },
    { label: 'Capture efficiency', value: pct(result.inputTonnes > 0 ? result.capturedTonnes / result.inputTonnes * 100 : 0), detail: 'Simulated' },
    { label: 'Capture energy', value: `${fmt(result.energyMWh)} MWh`, detail: 'Simulated' },
    { label: 'Energy intensity', value: `${fmt(result.energyPerTonne)} kWh/tCO₂`, detail: 'Simulated' },
  ]
}

export function buildBusinessReportPages(snapshot: BusinessReportSnapshot): PreviewPage[] {
  const metrics = getBusinessReportMetrics(snapshot)
  const charts = getBusinessReportCharts(snapshot)
  const pages: PreviewPage[] = []
  const hasOrg = kindSupportsOrganisation(snapshot.reportType) && snapshot.inventoryRecords.length > 0
  const hasCapture = kindSupportsCapture(snapshot.reportType) && !!snapshot.captureScenario
  const labels = new Map(snapshot.activitySnapshot.map((item) => [item.activityId, item.activityType || item.activityId]))
  const factorMap = new Map(snapshot.factorSnapshot.map((item) => [item.factorId, item]))
  const sourceMap = new Map(snapshot.sourceSnapshot.map((item) => [item.sourceId, item]))

  pages.push({
    id: 'executive-summary', title: 'Executive Summary',
    subtitle: 'Organisational emissions and capture performance are reported separately.',
    kpis: [
      ...(hasOrg ? [
        { label: 'Organisational emissions', value: t(metrics.total), detail: snapshot.period.label },
        { label: 'Scope 1', value: t(metrics.scopes['Scope 1']) },
        { label: 'Scope 2', value: t(metrics.scopes['Scope 2']) },
        { label: 'Scope 3', value: t(metrics.scopes['Scope 3']) },
      ] : []),
      ...(hasCapture ? captureKpis(snapshot) : []),
    ],
    notes: [
      hasOrg ? `${snapshot.inventoryRecords.length} saved inventory record(s) are included for ${snapshot.organisation.organisationName} · ${snapshot.site?.siteName ?? 'All sites'}.` : 'No organisational emissions records are available for this period.',
      hasCapture ? 'Capture results are simulated and are not subtracted from organisational emissions.' : snapshot.reportType === 'capture' ? 'No capture simulation is available for this reporting period.' : 'No capture simulation is included in this report snapshot.',
    ],
  })

  if (hasOrg && snapshot.reportType !== 'data-quality') {
    pages.push({
      id: 'emissions-overview', title: 'Organisational Emissions',
      subtitle: `${snapshot.organisation.organisationName} · ${snapshot.site?.siteName ?? 'All sites'} · ${snapshot.period.label}`,
      kpis: [
        { label: 'Total emissions', value: t(metrics.total) },
        { label: 'Change vs previous period', value: metrics.changePercent == null ? 'Unavailable' : `${metrics.changePercent > 0 ? '+' : ''}${pct(metrics.changePercent)}`, detail: snapshot.comparisonRecords.length ? snapshot.comparisonPeriod?.label : 'Previous-period comparison unavailable' },
        { label: 'Estimated / assumed records', value: pct(metrics.estimatedShare) },
        { label: 'Data completeness', value: pct(metrics.dataCompleteness) },
      ],
      charts: [
        { kind: 'bars', title: 'Emissions by scope', unit: 'tCO₂e', rows: charts.scopes.map((row) => ({ label: row.label, value: row.value })) },
        { kind: 'bars', title: 'Emissions by category', unit: 'tCO₂e', rows: charts.categories.map((row) => ({ label: row.label, value: row.value })) },
      ],
      empty: 'No organisational emissions records are available for this period.',
    })
  }

  if (hasOrg && ['monthly-performance', 'hotspots', 'annual-inventory'].includes(snapshot.reportType)) {
    const hotspotRows = charts.hotspots.map((row, index) => [String(index + 1), row.label, row.category, t(row.value), pct(row.share)])
    const trendHasEnough = charts.trend.length >= 2
    const siteRows = charts.sites.map((row) => ({ label: row.label, value: row.value }))
    pages.push({
      id: 'hotspots-trends', title: snapshot.reportType === 'hotspots' ? 'Emission Hotspots & Actions' : 'Emission Hotspots & Trends',
      subtitle: 'Ranked from saved Emissions Inventory records; historical values are included only when available.',
      charts: [
        ...(charts.hotspots.length ? [{ kind: 'bars' as const, title: 'Top emission sources', unit: 'tCO₂e', rows: charts.hotspots.map((row) => ({ label: row.label, value: row.value, share: row.share })) }] : []),
        ...(trendHasEnough ? [{ kind: 'line' as const, title: 'Emissions trend', unit: 'tCO₂e', rows: charts.trend.map((row) => ({ label: row.label, value: row.value })) }] : []),
        ...(snapshot.reportType === 'annual-inventory' && siteRows.length > 1 ? [{ kind: 'bars' as const, title: 'Emissions by site', unit: 'tCO₂e', rows: siteRows }] : []),
      ],
      tables: [{ title: 'Ranked sources', headers: ['Rank', 'Activity / source', 'Category', 'Emissions', 'Share'], rows: hotspotRows.length ? hotspotRows : [['—', 'No saved hotspot records', '—', '—', '—']] }],
      notes: [trendHasEnough ? `${charts.trend.length} actual reporting period(s) appear in the trend.` : 'Insufficient historical data for trend analysis.', ...(snapshot.reportType === 'hotspots' ? ['Investigate the largest sources with site owners; action owner and status are not recorded in the current inventory.'] : [])],
    })
    if (snapshot.reportType === 'hotspots') {
      const activityNames = new Map(snapshot.activitySnapshot.map((activity) => [activity.activityId, activity.activityType]))
      const siteNames = new Map(snapshot.siteSnapshot.map((site) => [site.siteId, site.siteName]))
      const opportunityRows = rankInventorySources(snapshot.inventoryRecords, activityNames, 5).map((hotspot, index) => {
        const records = snapshot.inventoryRecords.filter((record) => record.activityId === hotspot.activityId)
        const activity = snapshot.activitySnapshot.find((item) => item.activityId === hotspot.activityId)
        const record = records[0]
        const category = record?.category ?? 'Other'
        const profile = recommendationLibrary[matchReductionProfile(category, hotspot.name)]
        const captureEligible = Boolean(activity?.category === 'Industrial Activity' && activity.isPointSource && activity.captureCompatible)
        const areas = [...profile.opportunities, ...(captureEligible ? ['Point-source CO₂ capture feasibility'] : [])]
        const site = record ? siteNames.get(record.siteId) ?? record.siteId : 'Site unavailable'
        const hotspotLabel = `${hotspot.name} · ${category} · ${record?.scope ?? 'Unclassified'} · ${site}`
        return [String(index + 1), hotspotLabel, `${t(hotspot.value)} · ${pct(metrics.total > 0 ? hotspot.value / metrics.total * 100 : 0)}`, areas.join(' · ')]
      })
      pages.push({
        id: 'reduction-opportunities', title: 'Reduction Opportunities',
        subtitle: 'Screening suggestions based on the highest-emitting saved inventory sources; investigate technical, environmental and economic feasibility before implementation.',
        tables: [{ title: 'Potential areas to investigate', headers: ['Rank', 'Hotspot · category · scope · site', 'Emissions · contribution', 'Potential areas to investigate'], rows: opportunityRows.length ? opportunityRows : [['—', 'No saved hotspot records', '—', 'No opportunities generated']] }],
        notes: [
          'Reduction potential is not yet quantified. Economic assessment has not been evaluated; no savings, ROI or implementation feasibility are inferred.',
          'Any capture-feasibility item is shown only for an activity configured as a stationary industrial point source compatible with capture. Inventory emissions are not used as capture-model inlet CO₂.',
          'The current inventory does not store an Action Plan, so action owners, statuses and target dates are not included.',
        ],
      })
    }
  }

  if (hasOrg && snapshot.reportType === 'annual-inventory') {
    const detailRows = snapshot.inventoryRecords.map((record) => {
      const source = sourceMap.get(record.sourceId)
      const factor = factorMap.get(record.factorId)
      return [labels.get(record.activityId) ?? record.activityId, record.reportingPeriod, record.category, `${fmt(record.activityValue, 3)} ${record.activityUnit}`, record.scope, t(record.calculatedTCO2e), record.dataStatus, `${fmt(record.factorValue, 5)} ${record.factorUnit}`, record.sourceId || 'Source unavailable', `${factor?.activityType ?? 'Factor'} · ${source?.publisher ?? 'Publisher unavailable'}`]
    })
    pages.push({
      id: 'inventory-detail', title: 'Detailed GHG Inventory',
      subtitle: 'Activity records and factor provenance captured in the generated snapshot.',
      tables: [
        { title: 'Saved activity records', headers: ['Activity / source', 'Period', 'Category', 'Activity data', 'Scope', 'Emissions', 'Status'], rows: detailRows.length ? detailRows.map((row) => row.slice(0, 7)) : [['No saved inventory records', '', '', '', '', '', '']] },
        ...(detailRows.length ? [{ title: 'Emission factors and source trace', headers: ['Activity / source', 'Factor value / unit', 'Source ID', 'Factor / publisher'], rows: detailRows.map((row) => [row[0], row[7], row[8], row[9]]) }] : []),
      ],
      notes: [`Organisation boundary: ${snapshot.organisation.organisationName}.`, `Site boundary: ${snapshot.site?.siteName ?? 'All sites'}.`, 'Excluded activities are not inferred; only valid records saved to the selected inventory period are reported.'],
    })
  }

  if (snapshot.reportType === 'targets') {
    const target = snapshot.target
    pages.push({
      id: 'targets-progress', title: 'Targets & Progress',
      subtitle: 'Organisation-wide absolute target compared with selected-period saved inventory.',
      kpis: target ? [
        { label: 'Baseline emissions', value: t(target.baselineEmissionsT), detail: String(target.baselineYear) },
        { label: 'Current emissions', value: t(metrics.targetCurrent ?? 0), detail: snapshot.period.key },
        { label: 'Target emissions', value: t(target.targetEmissionsT), detail: String(target.targetYear) },
        { label: 'Reduction progress', value: metrics.targetProgress == null ? 'Unavailable' : pct(metrics.targetProgress) },
      ] : [],
      charts: target ? [{ kind: 'progress', title: 'Baseline vs current vs target', unit: 'tCO₂e', rows: [
        { label: `Baseline ${target.baselineYear}`, value: target.baselineEmissionsT },
        { label: `Current ${snapshot.period.key.slice(0, 4)}`, value: metrics.targetCurrent ?? 0 },
        { label: `Target ${target.targetYear}`, value: target.targetEmissionsT },
      ] }] : [],
      empty: target ? undefined : 'No organisational reduction target has been configured.',
    })
  }

  if (hasCapture) {
    const scenario = snapshot.captureScenario!
    const scenarioInputs = scenario.snapshot.inputs ?? []
    const parameterById = new Map(snapshot.captureParameters.map((parameter) => [parameter.id, parameter]))
    const sourceById = new Map(snapshot.captureSources.map((source) => [source.sourceId, source]))
    const scenarioRows = scenarioInputs.map((input) => [parameterById.get(input.parameterId)?.name ?? input.parameterId, `${input.value}${input.unit ? ` ${input.unit}` : ''}`, input.provenance.toUpperCase(), input.sourceId || 'No source ID', sourceById.get(input.sourceId)?.title ?? input.sourceTitle ?? 'Source details unavailable'])
    const energyRows = charts.energy.map((row) => ({ label: row.label, value: row.value }))
    pages.push({
      id: 'capture-performance', title: 'Capture Scenario & Performance',
      subtitle: 'SIMULATED CAPTURE PERFORMANCE · not measured plant data.',
      kpis: captureKpis(snapshot),
      charts: [
        { kind: 'bars', title: 'CO₂ before and after capture', unit: 'tCO₂', rows: [{ label: 'Before capture', value: scenario.inputTonnes }, { label: 'Captured', value: scenario.capturedTonnes }, { label: 'Remaining', value: scenario.remainingTonnes }] },
        { kind: 'flow', title: 'Carbon mass balance', unit: 'tCO₂', rows: [{ label: 'Input', value: scenario.inputTonnes }, { label: 'Captured', value: scenario.capturedTonnes }, { label: 'Remaining', value: scenario.remainingTonnes }] },
        ...(charts.captureTrend.length >= 2 ? [{ kind: 'line' as const, title: 'Capture efficiency over simulated intervals', unit: '%', rows: charts.captureTrend.map((row) => ({ label: row.label, value: row.efficiency })) }] : []),
      ],
      tables: [{ title: 'Scenario and capture inputs', headers: ['Input', 'Value / unit', 'Provenance', 'Source ID', 'Source'], rows: scenarioRows }],
      notes: [`Scenario ID: ${scenario.snapshot.scenarioId ?? 'Active scenario'}.`, `Simulation period: ${scenario.period}.`, 'Captured CO₂ is not subtracted from organisational inventory emissions without an explicit mapped inventory source.'],
    })
    if (scenario.energyMWh >= 0) pages.push({
      id: 'energy-analysis', title: 'Energy Analysis',
      subtitle: 'Energy values are generated by the active capture scenario model.',
      kpis: [
        { label: 'Total capture energy', value: `${fmt(scenario.energyMWh)} MWh` },
        { label: 'Energy intensity', value: `${fmt(scenario.energyPerTonne)} kWh/tCO₂` },
        { label: 'CO₂ captured', value: t(scenario.capturedTonnes) },
      ],
      charts: energyRows.length ? [{ kind: 'bars', title: 'Calculated energy components', unit: 'MWh', rows: energyRows }] : [],
      empty: energyRows.length ? undefined : 'Energy component values are unavailable for the selected capture result.',
    })
  } else if (snapshot.reportType === 'capture') {
    pages.push({ id: 'capture-unavailable', title: 'Capture Performance', empty: 'No capture simulation is available for this reporting period.' })
  }

  if (snapshot.reportType === 'data-quality' || hasOrg || snapshot.reportType === 'capture') {
    const records = snapshot.inventoryRecords
    const factorCounts = [
      ['Verified factors', String(metrics.verifiedFactorCount)],
      ['Unverified factors', String(metrics.unverifiedFactorCount)],
      ['Missing factor/source references', String(metrics.missingFactorCount)],
      ['Data completeness', pct(metrics.dataCompleteness)],
      ['Measured records', String(records.filter((record) => record.dataStatus === 'MEASURED').length)],
      ['Company-provided records', String(records.filter((record) => record.dataStatus === 'COMPANY PROVIDED').length)],
      ['Estimated records', String(records.filter((record) => record.dataStatus === 'ESTIMATED').length)],
      ['Assumed records', String(records.filter((record) => record.dataStatus === 'ASSUMED').length)],
    ]
    const factorRows = snapshot.factorSnapshot.map((factor) => [factor.activityType, `${fmt(factor.factorValue, 5)} ${factor.factorUnit}`, factor.sourceId, String(factor.year ?? 'Not supplied'), factor.verificationStatus.toUpperCase()])
    const sourceRows = snapshot.sourceSnapshot.map((source) => [source.sourceId, source.title, source.publisher, String(source.year ?? 'Not supplied'), source.reference, source.sourceURL || 'Not supplied'])
    const captureSourceRows = snapshot.captureScenario?.snapshot.inputs?.map((input) => {
      const parameter = snapshot.captureParameters.find((candidate) => candidate.id === input.parameterId)
      const source = snapshot.captureSources.find((candidate) => candidate.sourceId === input.sourceId)
      return [parameter?.name ?? input.parameterId, `${input.value}${input.unit ? ` ${input.unit}` : ''}`, input.provenance.toUpperCase(), input.sourceId || 'Not supplied', source?.title ?? input.sourceTitle ?? 'Source details unavailable']
    }) ?? []
    pages.push({
      id: 'data-quality-sources', title: 'Data Quality & Sources',
      subtitle: 'Provenance labels describe how values were registered; they do not establish independent verification.',
      charts: records.length ? [{ kind: 'bars', title: 'Activity data status', unit: 'records', rows: [
        { label: 'Measured', value: records.filter((record) => record.dataStatus === 'MEASURED').length },
        { label: 'Company provided', value: records.filter((record) => record.dataStatus === 'COMPANY PROVIDED').length },
        { label: 'Estimated', value: records.filter((record) => record.dataStatus === 'ESTIMATED').length },
        { label: 'Assumed', value: records.filter((record) => record.dataStatus === 'ASSUMED').length },
      ] }] : [],
      tables: [
        { title: 'Data quality summary', headers: ['Check', 'Result'], rows: factorCounts },
        ...(factorRows.length ? [{ title: 'Emission factors used', headers: ['Factor', 'Value / unit', 'Source ID', 'Year', 'Verification'], rows: factorRows }] : []),
        ...(sourceRows.length ? [{ title: 'Sources used', headers: ['Source ID', 'Title', 'Publisher', 'Year', 'Reference', 'URL'], rows: sourceRows }] : []),
        ...(captureSourceRows.length ? [{ title: 'Capture parameters and provenance', headers: ['Parameter', 'Value / unit', 'Provenance', 'Source ID', 'Source'], rows: captureSourceRows }] : []),
      ],
      empty: records.length || snapshot.captureScenario ? undefined : 'No inventory records or capture scenario data are available for this period.',
    })
  }

  const assumptions = (snapshot.captureScenario?.snapshot.inputs ?? []).filter((input) => input.provenance === 'assumption' || input.provenance === 'scenario-assumption')
  const parameterById = new Map(snapshot.captureParameters.map((parameter) => [parameter.id, parameter]))
  pages.push({
    id: 'methodology-limitations', title: 'Methodology, Assumptions & Limitations',
    tables: assumptions.length ? [{ title: 'Active capture assumptions', headers: ['Parameter', 'Value / unit', 'Provenance', 'Source ID'], rows: assumptions.map((input) => [parameterById.get(input.parameterId)?.name ?? input.parameterId, `${input.value}${input.unit ? ` ${input.unit}` : ''}`, input.provenance.toUpperCase(), input.sourceId || 'Not supplied']) }] : [],
    notes: [
      ...reportMethodologyNotes,
      ...(snapshot.reportType === 'annual-inventory' ? ['No additional excluded emissions are inferred from missing activity data.'] : []),
      ...reportModelLimitations,
    ],
  })
  return pages
}
