import { describe, expect, it } from 'vitest'
import type { CalculationRecord, EmissionFactor } from '../types/organisationCarbon'
import { buildHotspotScenarioSearchParams, getHotspotQualityWarnings, matchReductionProfile, readHotspotScenarioContext, recommendationLibrary, selectTopRankedHotspots } from './reductionRecommendationLibrary'

const factor: EmissionFactor = {
  factorId: 'factor-1', activityType: 'Grid electricity', category: 'Electricity', factorValue: 0.4, factorUnit: 'kg CO2e/kWh', gasType: 'CO2e', isCO2eFactor: true,
  geography: 'Malaysia', year: 2026, scopeClassification: 'Scope 2', sourceId: 'source-1', sourceTitle: 'Verified source', publisher: 'Publisher', sourceURL: '', validFrom: '2026-01-01', verificationStatus: 'verified', notes: '',
}

function record(partial: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    recordId: 'record-1', activityId: 'activity-1', organisationId: 'org-1', siteId: 'site-1', reportingPeriod: '2026-01', category: 'Electricity',
    activityValue: 100, activityUnit: 'kWh', factorId: 'factor-1', factorValue: 0.4, factorUnit: 'kg CO2e/kWh', normalisedActivityValue: 100, normalisedUnit: 'kWh', gasType: 'CO2e',
    calculatedKgCO2e: 40, calculatedTCO2e: 0.04, scope: 'Scope 2', dataStatus: 'COMPANY PROVIDED', calculationMethod: 'test', calculatedAt: '2026-01-31T00:00:00Z', validationStatus: 'valid', sourceId: 'source-1', ...partial,
  }
}

describe('reduction opportunity matching and context transfer', () => {
  it('matches activity categories deterministically to the central screening library', () => {
    expect(matchReductionProfile('Electricity', 'Purchased grid power')).toBe('electricity')
    expect(matchReductionProfile('Fuel', 'Natural gas boiler')).toBe('stationaryFuel')
    expect(matchReductionProfile('Fuel', 'Diesel road freight')).toBe('roadFreight')
    expect(matchReductionProfile('Transport', 'Company vehicle')).toBe('roadFreight')
    expect(matchReductionProfile('Waste', 'General waste')).toBe('waste')
    expect(matchReductionProfile('Industrial Activity', 'Cement kiln')).toBe('industrial')
    expect(Object.keys(recommendationLibrary)).toHaveLength(6)
  })

  it('uses the existing ordered hotspot values for Top 3 and Top 5 without recalculating emissions', () => {
    const ranked = [80, 50, 30, 20, 10].map((total, index) => ({ activityId: `activity-${index + 1}`, total, share: total / 190 * 100 }))
    expect(selectTopRankedHotspots(ranked, 3).map(({ rank, activityId }) => [rank, activityId])).toEqual([[1, 'activity-1'], [2, 'activity-2'], [3, 'activity-3']])
    expect(selectTopRankedHotspots(ranked, 5).map(({ rank, activityId }) => [rank, activityId])).toEqual([[1, 'activity-1'], [2, 'activity-2'], [3, 'activity-3'], [4, 'activity-4'], [5, 'activity-5']])
    expect(selectTopRankedHotspots(ranked, 3)[0].share).toBeCloseTo(80 / 190 * 100)
  })

  it('transfers only source context and never organisational emissions or capture inputs', () => {
    const search = buildHotspotScenarioSearchParams({ organisation: 'ABC Cement', site: 'Malaysia Plant', industry: 'Cement', category: 'Industrial Activity', source: 'Cement kiln' }).toString()
    const params = new URLSearchParams(search)
    expect(params.get('organisation')).toBe('ABC Cement')
    expect(params.get('site')).toBe('Malaysia Plant')
    expect(params.get('industry')).toBe('Cement')
    expect(params.get('category')).toBe('Industrial Activity')
    expect(params.get('source')).toBe('Cement kiln')
    expect([...params.keys()].sort()).toEqual(['category', 'fromHotspot', 'industry', 'organisation', 'page', 'site', 'source'].sort())
    expect(readHotspotScenarioContext(`?${search}`)).toEqual({ organisation: 'ABC Cement', site: 'Malaysia Plant', industry: 'Cement', category: 'Industrial Activity', source: 'Cement kiln', inventoryCanDriveBaseline: false })
    expect(readHotspotScenarioContext('?page=scenario-analysis')).toBeNull()
  })

  it('surfaces data-quality cautions using saved records and factor verification', () => {
    const warnings = getHotspotQualityWarnings([
      record({ dataStatus: 'ESTIMATED', scope: 'Unclassified' }),
      record({ recordId: 'record-2', dataStatus: 'ASSUMED', sourceId: '' }),
    ], new Map([['factor-1', { ...factor, verificationStatus: 'unverified' }]]))
    expect(warnings).toContain('Estimated activity data is included.')
    expect(warnings).toContain('Assumed activity data is included.')
    expect(warnings).toContain('Emission factor requires verification or is unavailable.')
    expect(warnings).toContain('Supporting source, site, period or scope details are incomplete.')
    expect(getHotspotQualityWarnings([record()], new Map([['factor-1', factor]]))).toEqual([])
  })
})
