import { describe, expect, it } from 'vitest'
import { TEMPLATES, checkChem, defaultMelt, deriveHeats, findAnomalies, importMeltRows, isPeak, learnCopper, learnFactors, meltLosses, minutesOf, peakShare, period, predictKwh } from './meltshop'
import { DEMO_TRUTH, demoMeltShop } from './meltshopDemo'

const grid = 0.774
const demo = demoMeltShop()
const heats = deriveHeats(demo.heats, defaultMelt, grid)
const csv = (text: string) => text.split('\n').map((l) => l.split(','))

describe('demo melt shop', () => {
  it('is sized like Masteel and is repeatable', () => {
    const p = period(heats)
    const tPerDay = p.tonnes / p.days
    console.info(`demo: ${heats.length} heats, ${Math.round(tPerDay)} t/day, ${Math.round(tPerDay * 365 / 1000)} kt/yr, avg ${Math.round(heats.reduce((a, h) => a + h.kwhPerT, 0) / heats.length)} kWh/t`)
    expect(tPerDay * 365).toBeGreaterThan(550_000)
    expect(tPerDay * 365).toBeLessThan(900_000)
    expect(demoMeltShop().heats[10]).toEqual(demo.heats[10])
    for (const h of heats) expect(h.kwhPerT).toBeGreaterThan(389)
  })
})

describe('learned factors', () => {
  it('recovers the physics built into the demo', () => {
    const m = learnFactors(heats)
    expect(m.enough).toBe(true)
    for (const f of m.factors) {
      expect(f.used).toBe(true)
      const truth = DEMO_TRUTH[f.id]
      expect(Math.abs(f.coef - truth)).toBeLessThan(Math.max(3 * (f.high - f.low) / (2 * 1.645), Math.abs(truth) * 0.15))
    }
  })
  it('falls back to published values with few heats', () => {
    const m = learnFactors(heats.slice(0, 12))
    expect(m.enough).toBe(false)
    expect(m.factors.every((f) => f.status === 'published')).toBe(true)
  })
  it('predicts lower kWh/t with less holding', () => {
    const m = learnFactors(heats)
    expect(predictKwh(m, { holdMin: 5 }, heats).kwhPerT).toBeLessThan(predictKwh(m, { holdMin: 30 }, heats).kwhPerT)
  })
})

describe('losses', () => {
  it('ranks losses with ranges and includes peak-hour melting', () => {
    const l = meltLosses(heats, learnFactors(heats), defaultMelt, grid)
    expect(l.map((x) => x.id)).toEqual(expect.arrayContaining(['holding', 'peak', 'yield', 'superheat']))
    for (let i = 1; i < l.length; i += 1) expect(l[i - 1].rmPerMonth).toBeGreaterThanOrEqual(l[i].rmPerMonth)
  })
})

describe('time of use', () => {
  it('knows TNB peak hours', () => {
    expect(isPeak(minutesOf('2026-10-14 15:00'))).toBe(true)   // Wednesday
    expect(isPeak(minutesOf('2026-10-14 22:30'))).toBe(false)
    expect(isPeak(minutesOf('2026-10-17 15:00'))).toBe(false)  // Saturday
    expect(peakShare(minutesOf('2026-10-14 13:00'), minutesOf('2026-10-14 15:00'))).toBeCloseTo(0.5)
  })
})

describe('chemistry', () => {
  it('flags heats over the grade limits', () => {
    const c = checkChem(demo.chem, demo.heats, 'B500B')
    expect(c.some((x) => x.fails.some((f) => f.key === 'CEV'))).toBe(true)
  })
  it('learns the copper each scrap type brings', () => {
    const cu = learnCopper(heats, demo.chem)!
    expect(cu.turnings!).toBeGreaterThan(cu.shredded!)
    expect(cu.hms!).toBeGreaterThan(0.15)
  })
})

describe('live readings', () => {
  it('catches the IF3 coil cooling-water fault', () => {
    const a = findAnomalies(demo.readings)
    expect(a.some((x) => x.furnace === 'IF3' && (x.signal === 'flowM3h' || x.signal === 'waterDT'))).toBe(true)
    expect(a.filter((x) => x.furnace !== 'IF3')).toHaveLength(0)
  })
})

describe('import', () => {
  it('reads all three templates', () => {
    expect(importMeltRows(csv(TEMPLATES.heats)).heats[0].lf?.electrodeKg).toBe(25)
    expect(importMeltRows(csv(TEMPLATES.heats)).heats[0].charge?.shredded).toBe(18)
    expect(importMeltRows(csv(TEMPLATES.chem)).chem[0].Cu).toBe(0.31)
    expect(importMeltRows(csv(TEMPLATES.readings)).readings[0].flowM3h).toBe(410)
  })
  it('rejects impossible heats', () => {
    const r = importMeltRows([['heat', 'date', 'kwh', 'charge_t', 'tapped_t', 'power_on_min', 'tap_to_tap_min'], ['1', '2026-10-01 01:00', '30000', '60', '56', '70', '60']])
    expect(r.error).toBeTruthy()
  })
})
