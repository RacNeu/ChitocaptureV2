import { beforeEach, describe, expect, it, vi } from 'vitest'
import { aggregateInventory, validInventoryRecords } from '../simulation/carbonDashboardMetrics'

let carbon: typeof import('./organisationCarbon')
beforeEach(async () => {
  vi.resetModules()
  carbon = await import('./organisationCarbon')
  // Start every test from an empty registry that keeps only the demo organisation and sites.
  const seeded = carbon.getOrganisationCarbonState()
  carbon.replaceOrganisationCarbonState({ ...seeded, activities: [], factors: [], gwpSets: [], sources: [], inventory: [], targets: [] })
})

function setupFactor(gasType: 'CO2e' | 'CO2' | 'CH4' | 'N2O', value: number, factorUnit: string, verified = true) {
  carbon.addEmissionFactor({ activityType: 'Test activity', category: 'Electricity', factorValue: value, factorUnit, gasType, isCO2eFactor: gasType === 'CO2e', geography: 'Malaysia', year: 2026, scopeClassification: 'Scope 2', sourceId: verified ? 'SRC-TEST' : '', sourceTitle: verified ? 'Test source' : '', publisher: verified ? 'Test publisher' : '', sourceURL: '', validFrom: '', verificationStatus: verified ? 'verified' : 'unverified', notes: 'Test fixture only' })
  return carbon.getOrganisationCarbonState().factors.at(-1)!
}
function activity(factorId: string, amount: number, unit: string) {
  const state = carbon.getOrganisationCarbonState()
  return { ...carbon.createActivityDraft('Electricity', state.organisations[0].organisationId, state.sites[0].siteId, '2026-01'), activityType: 'Test activity', activityValue: amount, unit, factorId, scopeClassification: 'Scope 2' as const }
}

describe('organisation carbon calculations', () => {
  it('normalises MWh to kWh and calculates tonnes of CO2e', () => {
    const factor = setupFactor('CO2e', .4, 'kg CO2e/kWh')
    const row = activity(factor.factorId, 2.5, 'MWh')
    carbon.addActivity(row)
    const result = carbon.calculateActivity(row)
    expect(result.normalisedActivityValue).toBe(2500)
    expect(result.normalisedUnit).toBe('kWh')
    expect(result.kgCO2e).toBe(1000)
    expect(result.tCO2e).toBe(1)
  })

  it('accepts a zero activity amount and converts tonnes to kilograms', () => {
    const factor = setupFactor('CO2e', .25, 'kg CO2e/kg')
    const row = activity(factor.factorId, 0, 'tonne')
    expect(carbon.calculateActivity(row).tCO2e).toBe(0)
    const converted = carbon.calculateActivity({ ...row, activityValue: 1 })
    expect(converted.normalisedActivityValue).toBe(1000)
    expect(converted.tCO2e).toBe(.25)
  })

  it('normalises activity into the factor denominator units', () => {
    const factor = setupFactor('CO2e', 2, 'kg CO2e/MWh')
    const row = activity(factor.factorId, 1000, 'kWh')
    const result = carbon.calculateActivity(row)
    expect(result.normalisedActivityValue).toBe(1)
    expect(result.normalisedUnit).toBe('MWh')
    expect(result.kgCO2e).toBe(2)
  })

  it('does not apply GWP a second time to a CO2e factor', () => {
    const factor = setupFactor('CO2e', .5, 'kg CO2e/kWh')
    carbon.addGwpSet({ version: 'test', timeHorizon: '100-year', ch4KgCo2ePerKg: 28, n2oKgCo2ePerKg: 265, sourceId: 'SRC-GWP', sourceTitle: 'Test GWP source', publisher: 'Test publisher', year: 2026, sourceURL: '' })
    const result = carbon.calculateActivity(activity(factor.factorId, 2, 'kWh'))
    expect(result.kgCO2e).toBe(1)
    expect(result.gwpSetId).toBeUndefined()
  })

  it('calculates safely when an older saved factor has no gasType', () => {
    const legacyFactor = {
      factorId: 'legacy-factor', activityType: 'Test activity', category: 'Electricity', factorValue: .4,
      factorUnit: 'kg CO2e/kWh', geography: 'Malaysia', year: 2026, scopeClassification: 'Scope 2',
      sourceId: '', verificationStatus: 'unverified',
    } as unknown as import('../types/organisationCarbon').EmissionFactor
    carbon.getOrganisationCarbonState().factors.push(legacyFactor)
    const result = carbon.calculateActivity(activity(legacyFactor.factorId, 100, 'kWh'))
    expect(result.tCO2e).toBe(.04)
    expect(result.issues).toContain('Emission factor is not verified.')
  })

  it('applies a versioned sourced GWP to an individual gas factor', () => {
    const factor = setupFactor('CH4', 2, 'kg CH4/kg')
    carbon.addGwpSet({ version: 'test', timeHorizon: '100-year', ch4KgCo2ePerKg: 28, n2oKgCo2ePerKg: null, sourceId: 'SRC-GWP', sourceTitle: 'Test GWP source', publisher: 'Test publisher', year: 2026, sourceURL: '' })
    const result = carbon.calculateActivity(activity(factor.factorId, 1, 'kg'))
    expect(result.kgCO2e).toBe(56)
    expect(result.gwpSetId).toBeTruthy()
  })

  it('flags incompatible units and missing factors', () => {
    const factor = setupFactor('CO2e', 1, 'kg CO2e/kWh')
    const mismatch = carbon.calculateActivity(activity(factor.factorId, 4, 'L'))
    expect(mismatch.tCO2e).toBeUndefined()
    expect(mismatch.issues.some((issue) => issue.includes('Unit mismatch'))).toBe(true)
    const missing = carbon.calculateActivity(activity('', 4, 'kWh'))
    expect(missing.issues).toContain('Emission factor is missing.')
  })

  it('will not save an unverified factor as valid inventory', () => {
    const factor = setupFactor('CO2e', .4, 'kg CO2e/kWh', false)
    const row = activity(factor.factorId, 100, 'kWh')
    carbon.addActivity(row)
    expect(carbon.saveActivitiesAndInventory()).toContain('Test activity: Emission factor is not verified.')
    expect(carbon.getOrganisationCarbonState().inventory).toHaveLength(0)
  })

  it('saves reproducible records and reconciles category and scope totals', () => {
    const factor = setupFactor('CO2e', .4, 'kg CO2e/kWh')
    const row = activity(factor.factorId, 2500, 'kWh')
    carbon.addActivity(row)
    expect(carbon.saveActivitiesAndInventory()).toEqual([])
    const state = carbon.getOrganisationCarbonState()
    const record = state.inventory[0]
    expect(record.factorId).toBe(factor.factorId)
    expect(record.sourceId).toBe('SRC-TEST')
    expect(record.normalisedActivityValue).toBe(2500)
    const totals = carbon.getInventoryTotals()
    expect(totals.total).toBe(totals.byCategory.Electricity)
    expect(totals.total).toBe(totals.byScope['Scope 2'])
  })

  it('feeds saved calculator inventory directly into Carbon Dashboard aggregates', () => {
    const factor = setupFactor('CO2e', .4, 'kg CO2e/kWh')
    const row = activity(factor.factorId, 2500, 'kWh')
    carbon.addActivity(row)
    expect(carbon.saveActivitiesAndInventory()).toEqual([])
    const dashboard = aggregateInventory(validInventoryRecords(carbon.getOrganisationCarbonState().inventory))
    expect(dashboard.total).toBe(1)
    expect(dashboard.byCategory.Electricity).toBe(1)
    expect(dashboard.byScope['Scope 2']).toBe(1)
  })

  it('stores one organisation-specific absolute target outside the emissions inventory', () => {
    const state = carbon.getOrganisationCarbonState()
    const organisationId = state.organisations[0].organisationId
    carbon.saveTarget({ organisationId, baselineYear: 2025, baselineEmissionsT: 100, targetYear: 2030, targetEmissionsT: 60, targetType: 'absolute', createdAt: '2026-01-01T00:00:00.000Z' })
    const saved = carbon.getOrganisationCarbonState()
    expect(saved.targets).toHaveLength(1)
    expect(saved.targets[0]).toMatchObject({ organisationId, targetType: 'absolute', baselineEmissionsT: 100, targetEmissionsT: 60 })
    expect(saved.inventory).toHaveLength(0)
  })
})
