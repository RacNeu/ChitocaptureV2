import { describe, expect, it } from 'vitest'
import { annual, cbam, defaultSteelParams as p, intensity, liveState, noUpgrades, tonnesPerHour, upgradeImpacts } from './steel'

describe('steel mini-mill model', () => {
  it('produces about 120 t/h with a 100 t heat every 50 minutes', () => {
    expect(tonnesPerHour(p)).toBeCloseTo(120)
    expect(annual(p, noUpgrades).steelT).toBeCloseTo(840_000)
  })

  it('splits intensity into direct and indirect CO₂', () => {
    const i = intensity(p, noUpgrades)
    expect(i.totalKwhPerT).toBeCloseTo(647)
    expect(i.indirectKgPerT).toBeCloseTo(647 * 0.74)
    expect(i.directKgPerT).toBeCloseTo(70 + 1.2 * 56.1)
    expect(i.totalKgPerT).toBeCloseTo(i.directKgPerT + i.indirectKgPerT)
  })

  it('averages the live EAF load over a full heat to the annual figure', () => {
    let sum = 0
    const steps = 5_000
    for (let k = 0; k < steps; k += 1) sum += liveState(p, noUpgrades, k / steps * p.cycleMin).mw.eaf
    // Flicker averages out; the mean should match kWh/t × t/h within a few percent.
    expect(sum / steps).toBeCloseTo(412 * tonnesPerHour(p) / 1_000, 0)
  })

  it('reports melting as the high-power phase', () => {
    const melting = liveState(p, noUpgrades, 20)
    const charging = liveState(p, noUpgrades, 1)
    expect(melting.phase).toBe('Melting')
    expect(charging.phase).toBe('Charging')
    expect(melting.mw.eaf).toBeGreaterThan(charging.mw.eaf * 5)
  })

  it('makes capture net-positive only after its own electricity use', () => {
    const captured = intensity(p, { ...noUpgrades, captureShare: 1 })
    expect(captured.capturedKgPerT).toBeCloseTo(1.2 * 56.1 * 0.9)
    const saved = intensity(p, noUpgrades).totalKgPerT - captured.totalKgPerT
    expect(saved).toBeCloseTo(captured.capturedKgPerT * (1 - 0.25 * 0.74))
  })

  it('green electricity cuts only the indirect part', () => {
    const green = intensity(p, { ...noUpgrades, greenShare: 0.5 })
    expect(green.indirectKgPerT).toBeCloseTo(intensity(p, noUpgrades).indirectKgPerT / 2)
    expect(green.directKgPerT).toBeCloseTo(intensity(p, noUpgrades).directKgPerT)
  })

  it('reports each upgrade on its own with a payback when it saves energy', () => {
    const impacts = upgradeImpacts(p, { ...noUpgrades, fumeVsd: true, hotCharging: true })
    expect(impacts).toHaveLength(2)
    const fans = impacts.find((item) => item.info.key === 'fumeVsd')!
    expect(fans.savedKgPerT).toBeCloseTo(35 * 0.3 * 0.74)
    expect(fans.paybackYears).toBeGreaterThan(0)
  })

  it('charges CBAM on direct emissions, phased in, minus carbon price paid in Malaysia', () => {
    const i = intensity(p, noUpgrades)
    const result = cbam(i, { exportTPerYear: 1_000, euPriceEUR: 80, rmPerEUR: 5, malaysiaPriceRM: 100, year: 2030 })
    expect(result.directTPerT).toBeCloseTo(i.directKgPerT / 1_000)
    expect(result.costRMPerT).toBeCloseTo(result.directTPerT * (400 - 100) * 0.485)
    expect(result.costRMPerYear).toBeCloseTo(result.costRMPerT * 1_000)
    expect(cbam(i, { exportTPerYear: 1, euPriceEUR: 10, rmPerEUR: 1, malaysiaPriceRM: 50, year: 2034 }).costRMPerT).toBe(0)
  })
})

import { eafInternals } from './steel'

describe('inside the arc furnace', () => {
  it('melts the scrap through the heat and is hottest before tapping', () => {
    const charging = eafInternals(p, noUpgrades, 2)
    const melting = eafInternals(p, noUpgrades, 25)
    const refining = eafInternals(p, noUpgrades, 42)
    expect(charging.meltFraction).toBeLessThan(melting.meltFraction)
    expect(melting.meltFraction).toBeLessThan(refining.meltFraction)
    expect(refining.bathTempC).toBeGreaterThan(melting.bathTempC)
    expect(charging.electrodeLift).toBe(1)
  })

  it('accumulates the heat energy to the per-tonne figure by the end of the heat', () => {
    const end = eafInternals(p, noUpgrades, p.cycleMin - 0.001)
    expect(end.heatEnergyMWh).toBeCloseTo(412 * 100 / 1_000, 0)
    expect(end.heatCO2T).toBeGreaterThan(end.heatEnergyMWh * 0.74 / 1_000 * 0.99)
  })
})
