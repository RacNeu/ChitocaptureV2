import type { ActivityData, CalculationRecord, CarbonTarget, EmissionCategory, EmissionFactor, Organisation, ScopeClassification, Site, SourceRecord } from '../types/organisationCarbon'
import type { DataSource, ModelParameter } from '../types/parameters'
import type { ScenarioResult } from './scenarioRunner'
import { getAllParameters } from '../data/parameters'
import { getAllSources } from '../data/sources'
import { aggregateInventory, calculateTargetProgress, rankInventorySources, sumInventory } from './carbonDashboardMetrics'
import { getCarbonFlowEnergyTotals, getCarbonFlowTotals } from './carbonFlowMetrics'

export type BusinessReportKind = 'monthly-performance' | 'annual-inventory' | 'hotspots' | 'capture' | 'targets' | 'data-quality'
export type BusinessReportGrain = 'monthly' | 'quarterly' | 'yearly'
export type BusinessReportPeriod = { grain: BusinessReportGrain; key: string; label: string; start: string; end: string }
export type BusinessReportSnapshot = {
  reportId: string
  reportType: BusinessReportKind
  generatedAt: string
  organisation: Organisation
  site: Site | null
  siteSnapshot: Site[]
  period: BusinessReportPeriod
  comparisonPeriod: BusinessReportPeriod | null
  inventoryRecords: CalculationRecord[]
  comparisonRecords: CalculationRecord[]
  historyRecords: CalculationRecord[]
  activitySnapshot: ActivityData[]
  factorSnapshot: EmissionFactor[]
  sourceSnapshot: SourceRecord[]
  captureScenario?: ScenarioResult
  captureParameters: ModelParameter[]
  captureSources: DataSource[]
  target?: CarbonTarget
}

export type ReportChartData = {
  scopes: Array<{ label: ScopeClassification; value: number }>
  categories: Array<{ label: EmissionCategory; value: number }>
  hotspots: Array<{ label: string; category: EmissionCategory; value: number; share: number }>
  trend: Array<{ label: string; key: string; value: number }>
  sites: Array<{ label: string; value: number }>
  captureTrend: Array<{ label: string; input: number; captured: number; remaining: number; efficiency: number }>
  energy: Array<{ label: string; value: number }>
}

export type BusinessReportMetrics = {
  total: number
  previousTotal: number | null
  changePercent: number | null
  scopes: Record<ScopeClassification, number>
  categories: Record<EmissionCategory, number>
  estimatedShare: number
  dataCompleteness: number
  verifiedFactorCount: number
  unverifiedFactorCount: number
  missingFactorCount: number
  provenanceCounts: Record<string, number>
  captureInput: number | null
  captureCaptured: number | null
  captureRemaining: number | null
  captureEfficiency: number | null
  captureEnergy: number | null
  captureEnergyIntensity: number | null
  targetCurrent: number | null
  targetProgress: number | null
}

export const reportCategoryOrder: EmissionCategory[] = ['Electricity', 'Fuel', 'Transport', 'Waste', 'Industrial Activity', 'Other']
export const reportScopeOrder: ScopeClassification[] = ['Scope 1', 'Scope 2', 'Scope 3', 'Unclassified']

function clone<T>(value: T): T { return structuredClone(value) }
function periodContains(record: CalculationRecord, period: BusinessReportPeriod) {
  if (period.grain === 'monthly') return record.reportingPeriod === period.key
  if (period.grain === 'quarterly') {
    const [year, quarter] = period.key.split('-Q')
    return record.reportingPeriod.slice(0, 4) === year && Math.ceil(Number(record.reportingPeriod.slice(5, 7)) / 3) === Number(quarter)
  }
  return record.reportingPeriod.slice(0, 4) === period.key
}
function periodKey(record: CalculationRecord, grain: BusinessReportGrain) {
  const year = record.reportingPeriod.slice(0, 4)
  const month = Number(record.reportingPeriod.slice(5, 7))
  return grain === 'monthly' ? record.reportingPeriod : grain === 'quarterly' ? `${year}-Q${Math.ceil(month / 3)}` : year
}
function periodLabel(key: string, grain: BusinessReportGrain) {
  if (grain === 'monthly') return new Intl.DateTimeFormat('en-MY', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
  if (grain === 'quarterly') return `Q${key.split('-Q')[1]} ${key.slice(0, 4)}`
  return key
}
function periodBounds(key: string, grain: BusinessReportGrain) {
  if (grain === 'monthly') {
    const [year, month] = key.split('-').map(Number)
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
    return { start: `${key}-01`, end }
  }
  if (grain === 'quarterly') {
    const [yearText, quarterText] = key.split('-Q')
    const year = Number(yearText), quarter = Number(quarterText), month = (quarter - 1) * 3
    return { start: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10), end: new Date(Date.UTC(year, month + 3, 0)).toISOString().slice(0, 10) }
  }
  return { start: `${key}-01-01`, end: `${key}-12-31` }
}

export function getBusinessReportPeriods(records: CalculationRecord[], grain: BusinessReportGrain): BusinessReportPeriod[] {
  const keys = [...new Set(records.map((record) => periodKey(record, grain)))].sort()
  return keys.map((key) => ({ grain, key, label: periodLabel(key, grain), ...periodBounds(key, grain) }))
}

export function getPreviousReportPeriod(period: BusinessReportPeriod): BusinessReportPeriod | null {
  let key: string
  if (period.grain === 'monthly') {
    const [year, month] = period.key.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 2, 1))
    key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  } else if (period.grain === 'quarterly') {
    const [yearText, quarterText] = period.key.split('-Q')
    const quarter = Number(quarterText) - 1
    key = quarter > 0 ? `${yearText}-Q${quarter}` : `${Number(yearText) - 1}-Q4`
  } else key = String(Number(period.key) - 1)
  return { grain: period.grain, key, label: periodLabel(key, period.grain), ...periodBounds(key, period.grain) }
}

export function createBusinessReportSnapshot(input: {
  reportType: BusinessReportKind
  generatedAt?: string
  organisation: Organisation
  site: Site | null
  sites: Site[]
  period: BusinessReportPeriod
  comparisonPeriod?: BusinessReportPeriod | null
  allBoundaryRecords: CalculationRecord[]
  activities: ActivityData[]
  factors: EmissionFactor[]
  sources: SourceRecord[]
  targets: CarbonTarget[]
  captureScenario?: ScenarioResult | null
}): BusinessReportSnapshot {
  const boundary = input.allBoundaryRecords
  const comparisonPeriod = input.comparisonPeriod ?? null
  const inventoryRecords = boundary.filter((record) => periodContains(record, input.period))
  const comparisonRecords = comparisonPeriod ? boundary.filter((record) => periodContains(record, comparisonPeriod)) : []
  const cutoff = input.period.end
  const historyRecords = boundary.filter((record) => record.reportingPeriod <= cutoff)
  const included = new Set([...inventoryRecords, ...comparisonRecords, ...historyRecords].map((record) => record.activityId))
  const records = [...inventoryRecords, ...comparisonRecords, ...historyRecords]
  const usedFactorIds = new Set(records.map((record) => record.factorId))
  const usedSourceIds = new Set(records.map((record) => record.sourceId))
  const captureScenario = input.captureScenario ? clone(input.captureScenario) : undefined
  const captureParameterIds = new Set(captureScenario?.snapshot.inputs?.map((item) => item.parameterId) ?? [])
  const captureSourceIds = new Set(captureScenario?.snapshot.inputs?.map((item) => item.sourceId).filter(Boolean) ?? [])
  const captureParameters = getAllParameters().filter((parameter) => captureParameterIds.has(parameter.id)).map(clone)
  const captureSources = getAllSources().filter((source) => captureSourceIds.has(source.sourceId)).map(clone)
  const activityIds = included
  return {
    reportId: `CCR-${new Date(input.generatedAt ?? Date.now()).toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    reportType: input.reportType, generatedAt: input.generatedAt ?? new Date().toISOString(),
    organisation: clone(input.organisation), site: input.site ? clone(input.site) : null, siteSnapshot: clone(input.sites),
    period: clone(input.period), comparisonPeriod: comparisonPeriod ? clone(comparisonPeriod) : null,
    inventoryRecords: clone(inventoryRecords), comparisonRecords: clone(comparisonRecords), historyRecords: clone(historyRecords),
    activitySnapshot: clone(input.activities.filter((activity) => activityIds.has(activity.activityId))),
    factorSnapshot: clone(input.factors.filter((factor) => usedFactorIds.has(factor.factorId))),
    sourceSnapshot: clone(input.sources.filter((source) => usedSourceIds.has(source.sourceId))),
    captureScenario, captureParameters, captureSources,
    target: clone(input.targets.find((target) => target.organisationId === input.organisation.organisationId)),
  }
}

export function getBusinessReportMetrics(snapshot: BusinessReportSnapshot): BusinessReportMetrics {
  const records = snapshot.inventoryRecords
  const aggregate = aggregateInventory(records)
  const total = aggregate.total
  const previousTotal = snapshot.comparisonPeriod && snapshot.comparisonRecords.length ? sumInventory(snapshot.comparisonRecords) : null
  const missingFactorCount = records.filter((record) => !snapshot.factorSnapshot.some((factor) => factor.factorId === record.factorId)).length
  const usedFactorIds = new Set(records.map((record) => record.factorId))
  const usedFactors = snapshot.factorSnapshot.filter((factor) => usedFactorIds.has(factor.factorId))
  const unresolvedSourceCount = records.filter((record) => !snapshot.sourceSnapshot.some((source) => source.sourceId === record.sourceId)).length
  const verifiedFactorCount = usedFactors.filter((factor) => factor.verificationStatus === 'verified').length
  const unverifiedFactorCount = usedFactors.filter((factor) => factor.verificationStatus !== 'verified').length
  const capture = snapshot.captureScenario
  const flowTotals = capture ? getCarbonFlowTotals(capture) : null
  const energyTotals = capture ? getCarbonFlowEnergyTotals(capture) : null
  const captureInput = flowTotals?.inputTonnes ?? null
  const captureCaptured = flowTotals?.capturedTonnes ?? null
  const captureRemaining = flowTotals?.remainingTonnes ?? null
  const captureEfficiency = flowTotals?.captureEfficiency ?? null
  const provenanceCounts: Record<string, number> = { 'COMPANY DATA': 0, LITERATURE: 0, ASSUMED: 0, SIMULATED: 0 }
  for (const input of capture?.snapshot.inputs ?? []) {
    const provenance = input.provenance === 'company-data' ? 'COMPANY DATA' : input.provenance === 'literature' ? 'LITERATURE' : input.provenance === 'simulated' ? 'SIMULATED' : 'ASSUMED'
    provenanceCounts[provenance] = (provenanceCounts[provenance] ?? 0) + 1
  }
  const activityById = new Map(snapshot.activitySnapshot.map((activity) => [activity.activityId, activity]))
  const completeCount = records.filter((record) => {
    const activity = activityById.get(record.activityId)
    const factor = snapshot.factorSnapshot.find((candidate) => candidate.factorId === record.factorId)
    return !!activity?.activityType.trim() && Number.isFinite(activity.activityValue) && !!activity.unit && !!activity.siteId && !!activity.reportingPeriod && !!factor?.factorUnit && !!factor.sourceId
  }).length
  const dataCompleteness = records.length ? completeCount / records.length * 100 : 0
  const estimatedCount = records.filter((record) => record.dataStatus === 'ESTIMATED' || record.dataStatus === 'ASSUMED').length
  const captureEnergy = energyTotals?.totalEnergyMWh ?? null
  const captureEnergyIntensity = energyTotals?.energyIntensityKWhPerTonne ?? null
  const targetCurrent = snapshot.target ? sumInventory(snapshot.historyRecords.filter((record) => record.reportingPeriod.startsWith(`${snapshot.period.key.slice(0, 4)}-`))) : null
  const target = snapshot.target
  const targetProgress = target && targetCurrent != null ? calculateTargetProgress(target.baselineEmissionsT, target.targetEmissionsT, targetCurrent).percent : null
  return {
    total, previousTotal, changePercent: previousTotal && previousTotal > 0 ? (total - previousTotal) / previousTotal * 100 : null,
    scopes: aggregate.byScope,
    categories: aggregate.byCategory,
    estimatedShare: records.length ? estimatedCount / records.length * 100 : 0, dataCompleteness,
    verifiedFactorCount, unverifiedFactorCount, missingFactorCount: missingFactorCount + unresolvedSourceCount,
    provenanceCounts, captureInput, captureCaptured, captureRemaining, captureEfficiency, captureEnergy, captureEnergyIntensity,
    targetCurrent, targetProgress,
  }
}

export function getBusinessReportCharts(snapshot: BusinessReportSnapshot): ReportChartData {
  const metrics = getBusinessReportMetrics(snapshot)
  const activityNames = new Map(snapshot.activitySnapshot.map((activity) => [activity.activityId, activity.activityType]))
  const hotspots = rankInventorySources(snapshot.inventoryRecords, activityNames, 5).map((item) => ({
    label: item.name, category: snapshot.inventoryRecords.find((record) => record.activityId === item.activityId)?.category ?? 'Other' as EmissionCategory,
    value: item.value, share: metrics.total > 0 ? item.value / metrics.total * 100 : 0,
  }))
  const periodTotals = new Map<string, number>()
  const trendGrain: BusinessReportGrain = snapshot.period.grain === 'yearly' ? 'monthly' : snapshot.period.grain
  for (const record of snapshot.historyRecords) {
    const key = periodKey(record, trendGrain)
    const withinSelectedYear = trendGrain === 'monthly' && snapshot.period.grain === 'yearly' ? key.startsWith(`${snapshot.period.key}-`) : true
    if (!withinSelectedYear) continue
    periodTotals.set(key, (periodTotals.get(key) ?? 0) + record.calculatedTCO2e)
  }
  const trend = [...periodTotals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({ key, label: periodLabel(key, trendGrain), value }))
  const sites = new Map<string, number>()
  // Site comparison only has records for the selected site in a site-filtered snapshot.
  // A caller may provide all-site records, in which case site IDs are recoverable from records.
  const siteNameById = new Map(snapshot.siteSnapshot.map((site) => [site.siteId, site.siteName]))
  for (const record of snapshot.inventoryRecords) sites.set(record.siteId, (sites.get(record.siteId) ?? 0) + record.calculatedTCO2e)
  const siteRows = [...sites.entries()].map(([id, value]) => ({ label: siteNameById.get(id) ?? id, value })).sort((a, b) => b.value - a.value)
  const captureTrend = (snapshot.captureScenario?.samples ?? []).map((sample) => ({ label: sample.label, input: sample.baselineEmissionsT, captured: Math.max(0, sample.baselineEmissionsT - sample.treatedEmissionsT), remaining: sample.treatedEmissionsT, efficiency: sample.captureEfficiency }))
  const scenario = snapshot.captureScenario
  const energy = scenario ? [
    { label: 'Regeneration', value: scenario.samples.reduce((sumValue, sample) => sumValue + sample.regenerationEnergyMWh, 0) },
    { label: 'Gas handling', value: scenario.samples.reduce((sumValue, sample) => sumValue + sample.gasHandlingEnergyMWh, 0) },
    { label: 'Cooling', value: scenario.samples.reduce((sumValue, sample) => sumValue + sample.coolingEnergyMWh, 0) },
    { label: 'Auxiliaries', value: scenario.samples.reduce((sumValue, sample) => sumValue + sample.auxiliariesEnergyMWh, 0) },
  ].filter((item) => item.value > 0) : []
  return { scopes: reportScopeOrder.map((label) => ({ label, value: metrics.scopes[label] })), categories: reportCategoryOrder.map((label) => ({ label, value: metrics.categories[label] })).filter((item) => item.value > 0).sort((a, b) => b.value - a.value), hotspots, trend, sites: siteRows, captureTrend, energy }
}
