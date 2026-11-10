import { describe, expect, it } from 'vitest'
import { runScenario, type ScenarioSnapshot } from './scenarioRunner'
import { getParameter } from '../data/parameters'

const baseline: ScenarioSnapshot = {
  industry: 'Cement',
  emissionSource: 'Cement kiln',
  site: 'Not specified',
  co2Concentration: 22,
  flowRate: 150_000,
  temperature: 180,
  pressure: 1.2,
  humidity: 12,
  so2: 120,
  nox: 90,
  particulates: 15,
  adsorptionTemperature: 40,
  adsorbentMass: 1_000,
  workingCapacity: 4,
  regenerationTemperature: 110,
  cycleDurationHours: 4,
  regenerationTimeHours: 0.75,
}

describe('process-based scenario time series', () => {
  it('exposes hourly and daily samples from the same selected-period engine run', () => {
    const monthly = runScenario(baseline, 'monthly')
    const yearly = runScenario(baseline, 'yearly')
    expect(monthly.samples).toHaveLength(30)
    expect(monthly.dailySamples).toHaveLength(30)
    expect(monthly.hourlySamples).toHaveLength(24)
    expect(yearly.samples).toHaveLength(12)
    expect(yearly.dailySamples).toHaveLength(365)
    expect(yearly.hourlySamples).toHaveLength(24)
    for (const result of [monthly, yearly]) {
      expect(result.inputTonnes).toBeCloseTo(result.capturedTonnes + result.remainingTonnes, 8)
      expect(result.samples.reduce((sum, sample) => sum + sample.energyMWh, 0)).toBeCloseTo(result.energyMWh, 8)
    }
  }, 30_000)

  it('varies feed, capture and energy over time and repeats deterministically', () => {
    const first = runScenario(baseline, 'weekly')
    const repeated = runScenario(baseline, 'weekly')
    expect(repeated).toEqual(first)
    expect(new Set(first.samples.map((sample) => sample.baselineEmissionsT.toFixed(4))).size).toBeGreaterThan(1)
    expect(new Set(first.samples.map((sample) => sample.captureEfficiency.toFixed(4))).size).toBeGreaterThan(1)
    expect(new Set(first.samples.map((sample) => sample.energyMWh.toFixed(4))).size).toBeGreaterThan(1)
    expect(first.samples.some((sample) => sample.regenerationEnergyMWh > 0)).toBe(true)
  })

  it('keeps emissions and capture physically bounded in every time bucket', () => {
    const result = runScenario(baseline, 'weekly')
    expect(result.inputTonnes).toBeCloseTo(result.capturedTonnes + result.remainingTonnes, 8)
    expect(result.emissionReduction).toBeCloseTo(result.capturedTonnes / result.inputTonnes * 100, 8)
    expect(result.capturedTonnes).toBeLessThanOrEqual(result.inputTonnes)
    expect(result.remainingTonnes).toBeGreaterThanOrEqual(0)
    for (const sample of result.samples) {
      expect(sample.baselineEmissionsT).toBeGreaterThanOrEqual(0)
      expect(sample.treatedEmissionsT).toBeGreaterThanOrEqual(0)
      expect(sample.treatedEmissionsT).toBeLessThanOrEqual(sample.baselineEmissionsT)
      expect(sample.captureEfficiency).toBeGreaterThanOrEqual(0)
      expect(sample.captureEfficiency).toBeLessThanOrEqual(100)
      expect(sample.energyMWh).toBeGreaterThanOrEqual(0)
      expect(sample.regenerationEnergyMWh).toBeGreaterThanOrEqual(0)
      expect(sample.regenerationEnergyMWh).toBeLessThanOrEqual(sample.energyMWh)
      expect(sample.baselineEmissionsT).toBeCloseTo(sample.treatedEmissionsT + sample.baselineEmissionsT * sample.captureEfficiency / 100, 7)
    }
  })

  it('changes the time series when each requested process input changes', () => {
    const original = runScenario(baseline, 'weekly')
    const scenarios: [string, ScenarioSnapshot][] = [
      ['CO₂ concentration', { ...baseline, co2Concentration: 18 }],
      ['flow rate', { ...baseline, flowRate: 120_000 }],
      ['temperature', { ...baseline, temperature: 150 }],
      ['adsorbent mass', { ...baseline, adsorbentMass: 1_500 }],
      ['working capacity', { ...baseline, workingCapacity: 3 }],
      ['regeneration time', { ...baseline, regenerationTimeHours: 1 }],
      ['cycle duration', { ...baseline, flowRate: 100, cycleDurationHours: 3 }],
    ]
    for (const [name, scenario] of scenarios) {
      const changed = runScenario(scenario, 'weekly')
      expect(changed.samples, `changing ${name} should change the modeled time series`).not.toEqual(original.samples)
      expect(changed.energyMWh + changed.capturedTonnes).toBeGreaterThan(0)
    }
  })

  it('keeps what-if inputs in the immutable run snapshot without changing registered values', () => {
    const registeredCo2 = getParameter('feed-co2-concentration')!.value
    const result = runScenario({ ...baseline, co2Concentration: 25 }, 'weekly')
    expect(getParameter('feed-co2-concentration')?.value).toBe(registeredCo2)
    expect(result.snapshot.inputs?.find((input) => input.parameterId === 'feed-co2-concentration')).toEqual(expect.objectContaining({ value: 25, provenance: 'scenario-assumption', unit: 'vol %' }))
  })
})
