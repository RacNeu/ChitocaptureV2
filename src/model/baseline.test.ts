import { describe, expect, it } from 'vitest'
import { energyBaseline, fitLine, fitQuality } from './baseline'
import { monthFromIndex, monthIndex, sampleHistory } from './history'
import { freshState } from './store'
import type { MonthlyRecord } from './types'

const mill = { ...freshState('steel'), onboarded: true }
const start = monthIndex('2024-01')

/** 24 months: 1,000 MWh fixed + 0.5 MWh/t; from month 13 the plant uses `drift` × that. */
function plant(drift: number, months = 24): MonthlyRecord[] {
  return Array.from({ length: months }, (_, k) => {
    const productionT = 10_000 + 2_000 * Math.sin(k)
    const mwh = (1_000 + 0.5 * productionT) * (k >= 12 ? drift : 1)
    return { month: monthFromIndex(start + k), electricityMWh: mwh, fuelGJ: {}, processT: 0, productionT }
  })
}

describe('energy baseline', () => {
  it('recovers fixed load and energy per tonne', () => {
    const fit = fitLine(plant(1).slice(0, 12).map((r) => ({ x: r.productionT, y: r.electricityMWh })))
    expect(fit.fixed).toBeCloseTo(1_000, 3)
    expect(fit.perTonne).toBeCloseTo(0.5, 6)
    expect(fit.r2).toBeCloseTo(1, 6)
    expect(fitQuality(fit).label).toBe('good')
  })
  it('falls back to the average when production does not explain use', () => {
    const fit = fitLine([{ x: 1, y: 5 }, { x: 2, y: 4 }, { x: 3, y: 3 }, { x: 4, y: 2 }, { x: 5, y: 1 }, { x: 6, y: 0 }])
    expect(fit.flat).toBe(true)
    expect(fit.fixed).toBeCloseTo(2.5)
  })
  it('prices the gap and builds a running total', () => {
    const settings = { ...mill.settings, electricityPriceRMPerMWh: 400 }
    const b = energyBaseline(plant(0.9), settings)
    expect(b.available).toBe(true)
    expect(b.months).toHaveLength(12)
    const expectedSaving = plant(0.9).slice(12).reduce((s, r) => s + (1_000 + 0.5 * r.productionT) * 0.1, 0) * 400
    expect(b.months.at(-1)!.cusumRM).toBeCloseTo(-expectedSaving, 0)
    expect(b.recent.gapRM).toBeCloseTo(-expectedSaving, 0)
    expect(b.fixedRMPerMonth).toBeCloseTo(1_000 * 400, 0)
    expect(energyBaseline(plant(1.05), settings).recent.gapRM).toBeGreaterThan(0)
  })
  it('explains why it cannot run', () => {
    expect(energyBaseline(plant(1, 10), mill.settings).available).toBe(false)
    expect(energyBaseline(plant(1).map((r) => ({ ...r, productionT: 0 })), mill.settings).reason).toMatch(/production/)
  })
  it('shows the sample mill’s efficiency programme as savings, with the fault month as a loss', () => {
    const records = sampleHistory(mill, '2026-10')
    const b = energyBaseline(records, mill.settings)
    expect(b.recent.gapRM).toBeLessThan(0)
    const fault = b.months.find((m) => m.month === records[records.length - 8].month)!
    expect(fault.gapRM).toBeGreaterThan(0)
    expect(b.fixedRMPerMonth).toBeGreaterThan(0)
  })
})
