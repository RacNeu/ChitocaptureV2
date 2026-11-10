import { describe, expect, it } from 'vitest'
import { allowedTransitions, buildMacc, capitalRecoveryFactor, portfolioSummary, projectContributionTCO2, projectEconomics } from './abatement'
import { measureLibrary, suggestOpportunities } from '../data/measureLibrary'
import type { Asset, PlanSettings, ReductionProject } from '../types/actionHub'

const settings: PlanSettings = { gridFactorKgPerKWh: 0.5, fuelFactorKgPerGJ: 100, electricityPriceMYRPerMWh: 400, fuelPriceMYRPerGJ: 20, discountRatePct: 0, carbonPriceMYRPerT: 0, baselineYear: 2026, targetYear: 2030, targetReductionPct: 20 }

function project(overrides: Partial<ReductionProject>): ReductionProject {
  return { projectId: 'p', assetId: 'a', measureId: 'm', title: 'Test', status: 'Idea', ownerEngineer: 'Eng', sustainabilitySponsor: 'Sus', electricitySavedMWh: 0, fuelSavedGJ: 0, directTCO2: 0, addedElectricityMWh: 0, addedFuelGJ: 0, capexMYR: 0, annualOpexChangeMYR: 0, lifetimeYears: 10, targetDate: '2027-01', comments: [], ...overrides }
}

const asset: Asset = { assetId: 'a', siteId: 's', name: 'Kiln', type: 'Kiln / furnace', electricityMWh: 1_000, fuelGJ: 10_000, processTCO2: 500, ownerEngineer: 'Eng', meterStatus: 'Metered' }

describe('abatement economics', () => {
  it('uses straight-line capital recovery at a zero discount rate and the annuity formula otherwise', () => {
    expect(capitalRecoveryFactor(0, 10)).toBeCloseTo(0.1)
    expect(capitalRecoveryFactor(8, 10)).toBeCloseTo(0.149029, 5)
  })

  it('converts saved electricity and fuel to tonnes and costs the energy saving', () => {
    const result = projectEconomics(project({ electricitySavedMWh: 100, fuelSavedGJ: 1_000, capexMYR: 100_000 }), settings)
    expect(result.grossTCO2).toBeCloseTo(50 + 100)
    expect(result.netTCO2).toBeCloseTo(150)
    expect(result.annualEnergyCostChangeMYR).toBeCloseTo(-(100 * 400) - 1_000 * 20)
    // 10,000/yr annualised capex − 60,000/yr energy saving = −50,000/yr → negative cost per tonne (it pays for itself)
    expect(result.costPerTonneMYR).toBeCloseTo(-50_000 / 150)
    expect(result.simplePaybackYears).toBeCloseTo(100_000 / 60_000)
  })

  it('subtracts the energy penalty so carbon capture is reported net, not gross', () => {
    const capture = projectEconomics(project({ directTCO2: 100, addedElectricityMWh: 300 }), settings)
    expect(capture.grossTCO2).toBe(100)
    expect(capture.penaltyTCO2).toBeCloseTo(150)
    expect(capture.netTCO2).toBeCloseTo(-50)
    expect(capture.costPerTonneMYR).toBeNull()
  })

  it('counts measured results for verified projects instead of the estimate', () => {
    const verified = project({ status: 'Verified', electricitySavedMWh: 100, measuredNetTCO2: 42 })
    expect(projectContributionTCO2(verified, settings)).toBe(42)
    expect(projectContributionTCO2({ ...verified, status: 'Verifying' }, settings)).toBeCloseTo(50)
  })

  it('orders the MACC by cost per tonne and stacks widths cumulatively', () => {
    const cheap = project({ projectId: 'cheap', title: 'cheap', electricitySavedMWh: 100 })
    const dear = project({ projectId: 'dear', title: 'dear', directTCO2: 10, capexMYR: 50_000 })
    const negative = project({ projectId: 'neg', title: 'neg', directTCO2: 1, addedElectricityMWh: 100 })
    const macc = buildMacc([dear, negative, cheap], settings)
    expect(macc.map((bar) => bar.projectId)).toEqual(['cheap', 'dear'])
    expect(macc[1].startTCO2).toBeCloseTo(50)
  })

  it('summarises the portfolio against the target and flags net-negative projects', () => {
    const summary = portfolioSummary([asset], [
      project({ projectId: 'v', status: 'Verified', measuredNetTCO2: 30 }),
      project({ projectId: 'c', status: 'Approved', electricitySavedMWh: 100 }),
      project({ projectId: 'i', status: 'Idea', fuelSavedGJ: 100 }),
      project({ projectId: 'r', status: 'Rejected', fuelSavedGJ: 1_000_000 }),
      project({ projectId: 'bad', title: 'Bad capture', status: 'Idea', directTCO2: 1, addedElectricityMWh: 100 }),
    ], settings)
    expect(summary.baselineTCO2).toBeCloseTo(500 + 1_000 + 500)
    expect(summary.requiredReductionTCO2).toBeCloseTo(400)
    expect(summary.verifiedTCO2).toBe(30)
    expect(summary.committedTCO2).toBeCloseTo(50)
    expect(summary.pipelineTCO2).toBeCloseTo(10 + (1 - 50))
    expect(summary.remainingGapTCO2).toBeCloseTo(320)
    expect(summary.netCapturePenaltyWarnings).toHaveLength(1)
  })
})

describe('role workflow', () => {
  it('lets engineering deliver but only sustainability verify', () => {
    expect(allowedTransitions('In progress', 'Engineering')).toEqual(['Verifying'])
    expect(allowedTransitions('Verifying', 'Engineering')).toEqual([])
    expect(allowedTransitions('Verifying', 'Sustainability')).toContain('Verified')
    expect(allowedTransitions('Assessed', 'Management')).toEqual(['Approved', 'Rejected'])
  })
})

describe('measure library', () => {
  it('only suggests measures that apply to the asset and are not already projects', () => {
    const suggestions = suggestOpportunities([asset], settings, [{ assetId: 'a', measureId: 'combustion-tuning' }])
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every((item) => item.measure.appliesTo.includes('Kiln / furnace'))).toBe(true)
    expect(suggestions.some((item) => item.measure.measureId === 'combustion-tuning')).toBe(false)
  })

  it('gives every measure an engineering checklist and estimate basis', () => {
    for (const measure of measureLibrary) {
      expect(measure.engineeringChecks.length).toBeGreaterThan(0)
      expect(measure.estimateBasis.length).toBeGreaterThan(0)
    }
  })
})
