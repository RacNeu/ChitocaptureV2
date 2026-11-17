import { describe, expect, it } from 'vitest'
import { summariseClimate } from './climate'
import { sampleHistory } from './history'
import { sampleInterval } from './interval'
import { impactLevel, levelFromP, siteRisks } from './risk'
import { freshState } from './store'

const base = { ...freshState('steel'), onboarded: true }

/** Synthetic daily series: 30 years, hotter and wetter after 2010. */
function daily() {
  const tmax: Record<string, number> = {}, rain: Record<string, number> = {}
  for (let y = 1996; y <= 2025; y += 1) for (let d = 1; d <= 365; d += 1) {
    const date = new Date(Date.UTC(y, 0, d)), key = date.toISOString().slice(0, 10).replace(/-/g, '')
    const late = y > 2010
    tmax[key] = 31 + (d % 15 === 0 ? 3 : 0) + (late && d % 10 === 0 ? 3.5 : 0)
    rain[key] = d % 100 === 0 ? 120 : late && d % 50 === 0 ? 130 : 5
  }
  tmax['19970101'] = -999
  return { tmax, rain }
}

describe('climate summary', () => {
  const { tmax, rain } = daily()
  const c = summariseClimate(tmax, rain, 5.37, 100.4, 'now')
  it('judges heat and rain against the site’s own earlier years', () => {
    expect(c.hot.recentPerYear).toBeGreaterThan(c.hot.earlyPerYear)
    expect(c.rain.recentPerYear).toBeGreaterThan(c.rain.earlyPerYear)
    expect(c.days).toBe(30 * 365 - 1)
    expect(c.monthlyRainMm).toHaveLength(12)
    expect(c.rain.max3DayMm).toBeGreaterThanOrEqual(c.rain.max1DayMm)
  })
})

describe('risk register', () => {
  it('invents nothing: without data every priced risk asks for input', () => {
    const view = siteRisks(base)
    for (const r of view.risks.filter((x) => x.id !== 'disclosure')) {
      expect(r.likelihood).toBeNull()
      expect(r.missing.length).toBeGreaterThan(0)
    }
    expect(view.risks.find((r) => r.id === 'disclosure')!.likelihood).toBe(5)
  })
  it('scores risks from data, checklist and climate', () => {
    const { tmax, rain } = daily()
    const site = {
      ...base,
      monthly: sampleHistory(base),
      interval: sampleInterval(base),
      climate: summariseClimate(tmax, rain, 5.37, 100.4),
      settings: { ...base.settings, riskChecklist: { pastFloods: 1 as const, floodProneArea: 'yes' as const, riverDistance: 'near' as const, groundLevelCritical: true, downtimeDaysPerFlood: 3, costPerDayRM: 400_000, heatLostDaysPerYear: 2, tariffRisePct: 10 } },
    }
    const view = siteRisks(site)
    const byId = Object.fromEntries(view.risks.map((r) => [r.id, r]))
    for (const id of ['peak', 'tariff', 'flood', 'heat', 'target', 'carbon-years', 'carbon-2030']) {
      expect(byId[id].likelihood, id).toBeGreaterThanOrEqual(1)
      expect(byId[id].impact, id).toBeGreaterThanOrEqual(1)
    }
    expect(byId.flood.rm).toBeCloseTo(3 * 400_000 * 1.5)
    // Score: one past flood 2 + flood-prone 2 + near river 2 + wetter trend 1 = 7 → likely.
    expect(byId.flood.likelihood).toBe(4)
    expect(byId.flood.basis).toContain('NASA POWER')
    expect(byId.heat.likelihood).toBeGreaterThanOrEqual(3)
    expect(view.energyBillRM).toBeGreaterThan(0)
    expect(JSON.stringify(view.risks)).not.toMatch(/NaN|Infinity/)
  })
  it('maps probabilities and money to levels', () => {
    expect([0.01, 0.1, 0.3, 0.6, 0.9].map(levelFromP)).toEqual([1, 2, 3, 4, 5])
    expect(impactLevel(10_000, 1_000_000)).toBe(2)
    expect(impactLevel(200_000, 1_000_000)).toBe(5)
    expect(impactLevel(20_000, null)).toBe(1)
  })
})
