import { describe, expect, it } from 'vitest'
import { getCarbonFlowEnergyTotals, getCarbonFlowTotals } from './carbonFlowMetrics'
import { runScenario, type ScenarioSnapshot } from './scenarioRunner'

const base: ScenarioSnapshot = {
  industry: 'Cement', emissionSource: 'Cement kiln', site: 'Malaysia (Sample Plant)',
  co2Concentration: 22, flowRate: 150_000, temperature: 180, pressure: 1.2,
  humidity: 12, so2: 120, nox: 90, particulates: 15,
  adsorptionTemperature: 40, adsorbentMass: 1_000, workingCapacity: 4,
  regenerationTemperature: 110, cycleDurationHours: 4, regenerationTimeHours: .75,
}

describe('carbon flow totals from the shared scenario engine', () => {
  it.each(['weekly', 'monthly', 'yearly'] as const)('keeps mass balance and sample totals for %s', (period) => {
    const result = runScenario(base, period)
    const totals = getCarbonFlowTotals(result)
    expect(totals.isBalanced).toBe(true)
    expect(totals.inputTonnes).toBeCloseTo(totals.capturedTonnes + totals.remainingTonnes, 8)
    expect(totals.captureEfficiency).toBeCloseTo(totals.capturedTonnes / totals.inputTonnes * 100, 8)
    expect(totals.capturedPercent + totals.remainingPercent).toBeCloseTo(100, 8)
    expect(result.samples.reduce((sum, sample) => sum + sample.baselineEmissionsT, 0)).toBeCloseTo(totals.inputTonnes, 7)
    expect(result.samples.reduce((sum, sample) => sum + sample.treatedEmissionsT, 0)).toBeCloseTo(totals.remainingTonnes, 7)
  }, 30_000)

  it('updates flows when feed and adsorbent scenario inputs change', () => {
    const original = getCarbonFlowTotals(runScenario(base, 'weekly'))
    const lowerCo2 = getCarbonFlowTotals(runScenario({ ...base, co2Concentration: 20 }, 'weekly'))
    const lowerFlow = getCarbonFlowTotals(runScenario({ ...base, flowRate: 120_000 }, 'weekly'))
    const moreAdsorbent = getCarbonFlowTotals(runScenario({ ...base, adsorbentMass: 1_500, workingCapacity: 5 }, 'weekly'))
    expect(lowerCo2.inputTonnes).toBeLessThan(original.inputTonnes)
    expect(lowerFlow.inputTonnes).toBeLessThan(original.inputTonnes)
    expect(moreAdsorbent.capturedTonnes).toBeGreaterThan(original.capturedTonnes)
  })

  it.each(['weekly', 'monthly', 'yearly'] as const)('reconciles energy components and daily average for %s', (period) => {
    const result = runScenario(base, period)
    const energy = getCarbonFlowEnergyTotals(result)
    expect(energy.isBalanced).toBe(true)
    expect(energy.regenerationMWh + energy.gasHandlingMWh + energy.auxiliariesMWh).toBeCloseTo(energy.totalEnergyMWh, 8)
    expect(energy.averageDailyKWh).toBeCloseTo(energy.totalEnergyMWh * 1_000 / (period === 'weekly' ? 7 : period === 'monthly' ? 30 : 365), 8)
    expect(energy.energyIntensityKWhPerTonne).toBeCloseTo(energy.totalEnergyMWh * 1_000 / result.capturedTonnes, 8)
  }, 30_000)
})
