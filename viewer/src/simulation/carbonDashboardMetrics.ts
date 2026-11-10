import type { CalculationRecord, EmissionCategory, ScopeClassification } from '../types/organisationCarbon'

export const dashboardCategories: EmissionCategory[] = ['Electricity', 'Fuel', 'Transport', 'Waste', 'Industrial Activity', 'Other']
export const dashboardScopes: ScopeClassification[] = ['Scope 1', 'Scope 2', 'Scope 3', 'Unclassified']

export function validInventoryRecords(records: CalculationRecord[]) {
  const unique = new Map<string, CalculationRecord>()
  records.filter((record) => record.validationStatus === 'valid' && Number.isFinite(record.calculatedTCO2e) && record.calculatedTCO2e >= 0).forEach((record) => {
    const previous = unique.get(record.activityId)
    if (!previous || record.calculatedAt > previous.calculatedAt) unique.set(record.activityId, record)
  })
  return [...unique.values()]
}

export function filterInventoryRecords(records: CalculationRecord[], organisationId: string, siteId: string, year: string) {
  return records.filter((record) => record.organisationId === organisationId && (siteId === 'All sites' || record.siteId === siteId) && record.reportingPeriod.startsWith(`${year}-`))
}

export function sumInventory(records: CalculationRecord[]) {
  return records.reduce((value, record) => value + record.calculatedTCO2e, 0)
}

export function aggregateInventory(records: CalculationRecord[]) {
  const byScope = Object.fromEntries(dashboardScopes.map((scope) => [scope, sumInventory(records.filter((record) => record.scope === scope))])) as Record<ScopeClassification, number>
  const byCategory = Object.fromEntries(dashboardCategories.map((category) => [category, sumInventory(records.filter((record) => record.category === category))])) as Record<EmissionCategory, number>
  return { total: sumInventory(records), byScope, byCategory }
}

export function percentageChange(current: number, comparison: number): number | null {
  return comparison > 0 ? (current - comparison) / comparison * 100 : null
}

export function calculateTargetProgress(baseline: number, target: number, current: number) {
  const requiredReduction = baseline - target
  const achievedReduction = baseline - current
  if (current <= target && requiredReduction > 0) return { percent: 100, label: 'Target achieved', detail: `${format(Math.abs(target - current))} tCO₂e below target.` }
  if (requiredReduction <= 0) return { percent: 0, label: 'Target needs review', detail: 'Target emissions must be below baseline emissions.' }
  if (current >= baseline) return { percent: 0, label: 'Emissions above baseline', detail: `${format(current - baseline)} tCO₂e above baseline.` }
  const progress = achievedReduction / requiredReduction * 100
  return { percent: Math.min(100, Math.max(0, progress)), label: `${format(progress, 1)}% of required reduction`, detail: `${format(Math.max(0, achievedReduction))} tCO₂e reduction achieved of ${format(requiredReduction)} tCO₂e required.` }
}

export function rankInventorySources(records: CalculationRecord[], activityNames: Map<string, string>, limit = 3) {
  const grouped = new Map<string, { name: string; value: number }>()
  records.forEach((record) => {
    const activityId = record.activityId
    const previous = grouped.get(activityId)
    grouped.set(activityId, { name: activityNames.get(activityId) || 'Activity name unavailable', value: (previous?.value ?? 0) + record.calculatedTCO2e })
  })
  return [...grouped.entries()].map(([activityId, item]) => ({ activityId, ...item })).sort((a, b) => b.value - a.value).slice(0, Math.max(0, limit))
}

function format(value: number, digits = 2) { return new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0) }

export function hasSufficientTrendData(current: (number | null)[], comparison: (number | null)[]) {
  return current.reduce<number>((count, value, index) => count + (value != null || comparison[index] != null ? 1 : 0), 0) >= 2
}
