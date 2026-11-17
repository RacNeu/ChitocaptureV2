import { describe, expect, it } from 'vitest'
import { billTotals, calibrate, machineTotals, matchStatus } from './calibration'
import { summarise } from './calc'
import { outlook } from './outlook'
import { freshState } from './store'
import type { MonthlyRecord } from './types'

const mill = { ...freshState('steel'), onboarded: true }
let n = 0
const id = (p: string) => `${p}-${n++}`

const bills = (months: number, perMonth: Partial<MonthlyRecord> = {}): MonthlyRecord[] => Array.from({ length: months }, (_, k) => ({
  month: `2025-${String(k + 1).padStart(2, '0')}`, electricityMWh: 30_000, fuelGJ: { 'natural-gas': 8_000, diesel: 700 }, processT: 0, productionT: 50_000, ...perMonth,
}))

describe('one source of truth', () => {
  it('scales the machine list so its totals equal a year of bills', () => {
    const result = calibrate(mill.machines, bills(12), mill.settings, id)!
    const totals = machineTotals(result.machines)
    expect(totals.electricity).toBeCloseTo(360_000, -1)
    expect(totals['natural-gas']).toBeCloseTo(96_000, -1)
    expect(result.productionTPerYear).toBe(600_000)
    expect(result.calibration.from).toBe('2025-01')
  })
  it('keeps energy the machines have no place for on an “Other … (from bills)” line', () => {
    const result = calibrate(mill.machines, bills(12), mill.settings, id)!
    const other = result.machines.find((m) => m.name === 'Other diesel (from bills)')!
    expect(other.fuel).toBe('diesel')
    expect(other.fuelGJ).toBeCloseTo(8_400)
    expect(result.calibration.streams.find((s) => s.stream === 'diesel')!.added).toBe(true)
  })
  it('zeroes process CO₂ the bills don’t show (e.g. an induction furnace)', () => {
    const result = calibrate(mill.machines, bills(12), mill.settings, id)!
    expect(machineTotals(result.machines).process).toBe(0)
  })
  it('turns fewer than 12 months into a yearly figure', () => {
    const result = calibrate(mill.machines, bills(6), mill.settings, id)!
    expect(machineTotals(result.machines).electricity).toBeCloseTo(360_000, -1)
    expect(result.calibration.months).toBe(6)
  })
  it('leaves metered machines alone and scales only the estimated ones', () => {
    const machines = mill.machines.map((m, k) => k === 0 ? { ...m, quality: 'metered' as const } : m)
    const result = calibrate(machines, bills(12), mill.settings, id)!
    expect(result.machines[0].electricityMWh).toBe(machines[0].electricityMWh)
    expect(machineTotals(result.machines).electricity).toBeCloseTo(360_000, -1)
  })
  it('makes the machine-based pages agree with the bill-based ones', () => {
    const monthly = bills(12)
    const result = calibrate(mill.machines, monthly, mill.settings, id)!
    const site = { ...mill, monthly, machines: result.machines, settings: { ...mill.settings, productionTPerYear: result.productionTPerYear } }
    const fromMachines = summarise(site).baselineT
    const fromBills = outlook(site).last12.totalT
    expect(fromMachines / fromBills).toBeCloseTo(1, 3)
  })
  it('reports whether the machines still match the bills', () => {
    const monthly = bills(12)
    expect(matchStatus(mill.machines, []).state).toBe('template')
    expect(matchStatus(mill.machines, monthly).state).toBe('drifted')
    const result = calibrate(mill.machines, monthly, mill.settings, id)!
    expect(matchStatus(result.machines, monthly).state).toBe('matched')
    expect(billTotals(monthly).production).toBe(600_000)
  })
})
