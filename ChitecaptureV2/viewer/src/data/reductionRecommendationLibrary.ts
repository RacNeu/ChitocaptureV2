import type { CalculationRecord, EmissionCategory, EmissionFactor } from '../types/organisationCarbon'

export type ReductionProfileKey = 'electricity' | 'stationaryFuel' | 'roadFreight' | 'waste' | 'industrial' | 'other'
export type ReductionProfile = { title: string; opportunities: readonly string[] }

export const recommendationLibrary: Record<ReductionProfileKey, ReductionProfile> = {
  electricity: {
    title: 'Electricity reduction opportunities',
    opportunities: ['Energy-efficiency assessment', 'Equipment and operating-schedule optimisation', 'On-site renewable generation assessment', 'Renewable electricity procurement'],
  },
  stationaryFuel: {
    title: 'Stationary fuel reduction opportunities',
    opportunities: ['Combustion and equipment-efficiency assessment', 'Waste-heat recovery assessment', 'Electrification feasibility', 'Lower-carbon fuel alternatives'],
  },
  roadFreight: {
    title: 'Transport reduction opportunities',
    opportunities: ['Route optimisation', 'Vehicle utilisation and load optimisation', 'Fleet-efficiency improvements', 'Lower-emission transport alternatives'],
  },
  waste: {
    title: 'Waste reduction opportunities',
    opportunities: ['Waste prevention', 'Material reuse', 'Recycling and material recovery', 'Alternative waste-treatment options'],
  },
  industrial: {
    title: 'Industrial-process reduction opportunities',
    opportunities: ['Process-efficiency assessment', 'Heat and energy optimisation', 'Material-efficiency opportunities', 'Fuel-switching feasibility'],
  },
  other: {
    title: 'Activity reduction opportunities',
    opportunities: ['Activity-specific efficiency assessment', 'Operating-practice review', 'Alternative input or process assessment'],
  },
}

const transportTerms = /road freight|freight|truck|vehicle|fleet|transport|logistics|haulage|air travel|business travel/i

export function matchReductionProfile(category: EmissionCategory | string, activityName: string): ReductionProfileKey {
  if (category === 'Transport' || transportTerms.test(activityName)) return 'roadFreight'
  if (category === 'Electricity') return 'electricity'
  if (category === 'Fuel') return 'stationaryFuel'
  if (category === 'Waste') return 'waste'
  if (category === 'Industrial Activity') return 'industrial'
  return 'other'
}

export function selectTopRankedHotspots<T extends { total: number; share: number }>(rows: T[], limit: 3 | 5) {
  return rows.slice(0, limit).map((row, index) => ({ ...row, rank: index + 1 }))
}

export function buildHotspotScenarioSearchParams(context: {
  organisation: string
  site: string
  industry?: string
  category: string
  source: string
  inventoryEmissionsTCO2e?: number
  inventoryPeriod?: string
  inventoryRecordCount?: number
  inventoryCanDriveBaseline?: boolean
  inventoryCO2Concentration?: number
}) {
  const params = new URLSearchParams({
    page: 'scenario-analysis',
    fromHotspot: '1',
    organisation: context.organisation,
    site: context.site,
    industry: context.industry || '',
    category: context.category,
    source: context.source,
  })
  if (Number.isFinite(context.inventoryEmissionsTCO2e) && context.inventoryEmissionsTCO2e! >= 0) params.set('inventoryEmissionsTCO2e', String(context.inventoryEmissionsTCO2e))
  if (context.inventoryPeriod) params.set('inventoryPeriod', context.inventoryPeriod)
  if (Number.isFinite(context.inventoryRecordCount) && context.inventoryRecordCount! >= 0) params.set('inventoryRecordCount', String(context.inventoryRecordCount))
  if (context.inventoryCanDriveBaseline) params.set('inventoryCanDriveBaseline', '1')
  if (Number.isFinite(context.inventoryCO2Concentration) && context.inventoryCO2Concentration! > 0 && context.inventoryCO2Concentration! <= 100) params.set('inventoryCO2Concentration', String(context.inventoryCO2Concentration))
  return params
}

export function readHotspotScenarioContext(search: string) {
  const params = new URLSearchParams(search)
  if (params.get('fromHotspot') !== '1') return null
  const inventoryEmissionsTCO2e = Number(params.get('inventoryEmissionsTCO2e'))
  const inventoryRecordCount = Number(params.get('inventoryRecordCount'))
  const inventoryCO2Concentration = Number(params.get('inventoryCO2Concentration'))
  return {
    organisation: params.get('organisation') || 'Organisation unavailable',
    site: params.get('site') || 'Site unavailable',
    industry: params.get('industry') || 'Industry not provided',
    category: params.get('category') || 'Category not provided',
    source: params.get('source') || 'Source not provided',
    inventoryEmissionsTCO2e: params.has('inventoryEmissionsTCO2e') && Number.isFinite(inventoryEmissionsTCO2e) && inventoryEmissionsTCO2e >= 0 ? inventoryEmissionsTCO2e : undefined,
    inventoryPeriod: params.get('inventoryPeriod') || undefined,
    inventoryRecordCount: params.has('inventoryRecordCount') && Number.isFinite(inventoryRecordCount) && inventoryRecordCount >= 0 ? inventoryRecordCount : undefined,
    inventoryCanDriveBaseline: params.get('inventoryCanDriveBaseline') === '1' && params.has('inventoryEmissionsTCO2e') && Boolean(params.get('inventoryPeriod')?.match(/^\d{4}-\d{2}$/)),
    inventoryCO2Concentration: params.has('inventoryCO2Concentration') && Number.isFinite(inventoryCO2Concentration) && inventoryCO2Concentration > 0 && inventoryCO2Concentration <= 100 ? inventoryCO2Concentration : undefined,
  }
}

export function getHotspotQualityWarnings(records: CalculationRecord[], factors: Map<string, EmissionFactor>, sourceIds?: Set<string>): string[] {
  const warnings = new Set<string>()
  if (records.some((record) => record.dataStatus === 'ESTIMATED')) warnings.add('Estimated activity data is included.')
  if (records.some((record) => record.dataStatus === 'ASSUMED')) warnings.add('Assumed activity data is included.')
  if (records.some((record) => factors.get(record.factorId)?.verificationStatus !== 'verified')) warnings.add('Emission factor requires verification or is unavailable.')
  if (records.some((record) => !record.sourceId || sourceIds && !sourceIds.has(record.sourceId) || !record.activityId || !record.siteId || !record.reportingPeriod || record.scope === 'Unclassified')) warnings.add('Supporting source, site, period or scope details are incomplete.')
  return [...warnings]
}
