import { describe, expect, it } from 'vitest'
import type { CalculationRecord } from '../types/organisationCarbon'
import { aggregateInventory, calculateTargetProgress, filterInventoryRecords, hasSufficientTrendData, percentageChange, rankInventorySources, validInventoryRecords } from './carbonDashboardMetrics'

function record(id: string, partial: Partial<CalculationRecord> = {}): CalculationRecord {
  return { recordId: `r-${id}`, activityId: id, organisationId: 'org-1', siteId: 'site-1', reportingPeriod: '2025-01', category: 'Electricity', activityValue: 100, activityUnit: 'kWh', factorId: 'factor-1', factorValue: .4, factorUnit: 'kg CO2e/kWh', normalisedActivityValue: 100, normalisedUnit: 'kWh', gasType: 'CO2e', calculatedKgCO2e: 40, calculatedTCO2e: .04, scope: 'Scope 2', dataStatus: 'COMPANY PROVIDED', calculationMethod: 'test', calculatedAt: '2025-01-01T00:00:00.000Z', validationStatus: 'valid', sourceId: 'SRC', ...partial }
}

describe('Carbon Dashboard inventory metrics', () => {
  it('filters saved records by organisation, site, and year', () => {
    const rows = [record('a'), record('b', { siteId: 'site-2' }), record('c', { organisationId: 'org-2' }), record('d', { reportingPeriod: '2024-02' })]
    expect(filterInventoryRecords(rows, 'org-1', 'site-1', '2025').map((row) => row.activityId)).toEqual(['a'])
    expect(filterInventoryRecords(rows, 'org-1', 'site-1', '')).toEqual([])
  })

  it('aggregates category and explicit scope totals to the same total', () => {
    const rows = [record('a', { calculatedTCO2e: 2 }), record('b', { category: 'Fuel', scope: 'Scope 1', calculatedTCO2e: 3 }), record('c', { scope: 'Unclassified', calculatedTCO2e: 1 })]
    const totals = aggregateInventory(rows)
    expect(totals.total).toBe(6)
    expect(Object.values(totals.byCategory).reduce((a, b) => a + b, 0)).toBe(totals.total)
    expect(Object.values(totals.byScope).reduce((a, b) => a + b, 0)).toBe(totals.total)
  })

  it('ignores invalid rows and selects the latest saved copy of an activity', () => {
    const rows = [record('a', { calculatedTCO2e: 1 }), record('a', { recordId: 'newer', calculatedTCO2e: 2, calculatedAt: '2025-02-01T00:00:00.000Z' }), record('b', { validationStatus: 'invalid' as 'valid' })]
    expect(validInventoryRecords(rows).map((row) => row.calculatedTCO2e)).toEqual([2])
  })

  it('calculates comparison percentages and safely handles zero comparison emissions', () => {
    expect(percentageChange(90, 100)).toBe(-10)
    expect(percentageChange(110, 100)).toBe(10)
    expect(percentageChange(5, 0)).toBeNull()
  })

  it('shows a trend only when at least two time buckets contain saved data', () => {
    expect(hasSufficientTrendData([3, null, null], [null, null, null])).toBe(false)
    expect(hasSufficientTrendData([3, null, null], [null, 4, null])).toBe(true)
  })

  it('ranks top sources from actual saved records', () => {
    const rows = [record('a', { calculatedTCO2e: 4 }), record('b', { calculatedTCO2e: 8 }), record('c', { calculatedTCO2e: 2 }), record('d', { calculatedTCO2e: 1 })]
    expect(rankInventorySources(rows, new Map([['a', 'Electricity'], ['b', 'Fuel'], ['c', 'Waste'], ['d', 'Travel']])).map((item) => item.name)).toEqual(['Fuel', 'Electricity', 'Waste'])
  })

  it('handles target progress, above-baseline, and invalid required reduction', () => {
    expect(calculateTargetProgress(100, 60, 80).percent).toBe(50)
    expect(calculateTargetProgress(100, 60, 120).percent).toBe(0)
    expect(calculateTargetProgress(100, 60, 50).label).toBe('Target achieved')
    expect(calculateTargetProgress(100, 110, 90).label).toBe('Target needs review')
  })
})
