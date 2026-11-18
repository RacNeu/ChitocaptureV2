import { describe, expect, it } from 'vitest'
import { annual, cbam, defaultSteelParams as p, intensity, noUpgrades, tonnesPerHour, upgradeImpacts } from './steel'

describe('steel mini-mill model (induction route)', () => {
  it('produces about 800 kt a year, like Masteel’s nominal capacity', () => {
    expect(tonnesPerHour(p)).toBeCloseTo(114)
    expect(annual(p, noUpgrades).steelT).toBeCloseTo(798_000)
  })

  it('splits intensity into direct and indirect CO₂', () => {
    const i = intensity(p, noUpgrades)
    expect(i.totalKwhPerT).toBeCloseTo(520 + 40 + 15 + 100 + 20 + 30)
    expect(i.indirectKgPerT).toBeCloseTo(725 * 0.74)
    expect(i.directKgPerT).toBeCloseTo(22 + 1.2 * 56.1)
    expect(i.totalKgPerT).toBeCloseTo(i.directKgPerT + i.indirectKgPerT)
  })

  it('melts above the physics minimum and the best DOE trial', () => {
    expect(p.kwhPerT.melt).toBeGreaterThan(389)
    expect(intensity(p, { ...noUpgrades, meltPractice: true, igbt: true }).kwh.melt).toBeCloseTo(520 * 0.89)
  })

  it('green electricity cuts only the indirect part', () => {
    const green = intensity(p, { ...noUpgrades, greenShare: 0.5 })
    expect(green.indirectKgPerT).toBeCloseTo(intensity(p, noUpgrades).indirectKgPerT / 2)
    expect(green.directKgPerT).toBeCloseTo(intensity(p, noUpgrades).directKgPerT)
  })

  it('reports each upgrade on its own with a payback when it saves energy', () => {
    const impacts = upgradeImpacts(p, { ...noUpgrades, fumeVsd: true, meltPractice: true })
    expect(impacts).toHaveLength(2)
    const fans = impacts.find((item) => item.info.key === 'fumeVsd')!
    expect(fans.savedKgPerT).toBeCloseTo(20 * 0.2 * 0.74)
    expect(fans.paybackYears).toBeGreaterThan(0)
    expect(impacts.find((item) => item.info.key === 'meltPractice')!.paybackYears).toBeLessThan(1)
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
