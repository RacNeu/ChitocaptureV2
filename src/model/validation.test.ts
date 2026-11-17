import { describe, expect, it } from 'vitest'
import { defaultSettings } from './store'
import { checkMasteel, masteelPublished } from './validation'

/** Validation against Masteel's published FY2022–FY2024 figures (see validation.ts for sources). */
const rows = checkMasteel(defaultSettings)
const year = (y: number) => rows.find((row) => row.year === y)!

describe('validation against Masteel published figures', () => {
  it('electricity in the energy table (GJ) matches the kWh in the text', () => {
    expect(masteelPublished[2].electricityMWh * 3.6).toBeCloseTo(1_434_422.70, 0)
    expect(masteelPublished[1].electricityMWh * 3.6).toBeCloseTo(1_543_807.42, 0)
  })

  it('reproduces Scope 2 exactly for FY2022, FY2023 and FY2024', () => {
    for (const row of rows) expect(Math.abs(row.scope2.ours - row.scope2.theirs)).toBeLessThan(0.05)
  })

  it('diesel Scope 1 is within 1.5% for FY2024 (IPCC CO₂-only factor vs Masteel’s US EPA factors)', () => {
    expect(Math.abs(year(2024).diesel!.pct)).toBeLessThan(1.5)
  })

  it('records the known FY2023 diesel gap (+8%) so a change in method is noticed', () => {
    expect(year(2023).diesel!.pct).toBeGreaterThan(7)
    expect(year(2023).diesel!.pct).toBeLessThan(9)
  })

  it('natural gas is below Masteel’s “Scope 1 (process)” line, which also holds carbon inputs (ISO 14404)', () => {
    for (const y of [2023, 2024]) {
      expect(year(y).carbonInputsT).toBeGreaterThan(800)
      expect(year(y).carbonInputsT).toBeLessThan(1_000)
    }
  })
})
