import { describe, expect, it } from 'vitest'
import { boundsFor, defaultEaf, derive, importHeatRows, learn, losses, optimise, outcome, predict, type HeatRecord } from './heats'

/** Deterministic pseudo-random numbers so the test is repeatable. */
function rng(seed: number) { let s = seed; return () => { s = (s * 1_103_515_245 + 12_345) % 2_147_483_648; return s / 2_147_483_648 } }

/** Synthetic heats with known physics: kWh/t = 600 − 3.5·O₂/t − 5·NG/t − 2·C/t + 1.5·off-min + 1·(T − 1600). */
function synthetic(n: number): HeatRecord[] {
  const r = rng(7)
  return Array.from({ length: n }, (_, i) => {
    const o2 = 30 + r() * 15, ng = 4 + r() * 4, c = 15 + r() * 10, off = 10 + r() * 15, temp = 1600 + r() * 50
    const kwhPerT = 600 - 3.5 * o2 - 5 * ng - 2 * c + 1.5 * off + 1 * (temp - 1600) + (r() - 0.5) * 4
    const t = 100, power = 40
    return {
      heat: String(1000 + i), at: new Date(Date.UTC(2026, 9, 1) + i * 3_600_000).toISOString(),
      tapToTapMin: power + off, powerOnMin: power, kwh: kwhPerT * t, tappedT: t, chargeT: 110, o2Nm3: o2 * t, ngNm3: ng * t,
      chargeCarbonKg: c * t * 0.5, injCarbonKg: c * t * 0.5, electrodeKg: (1.5 + r()) * t, tapTempC: temp,
    }
  })
}

const grid = 0.774
const derived = (n: number) => synthetic(n).map((h) => derive(h, defaultEaf, grid))

describe('heat import', () => {
  it('reads the template and aliases, and converts MWh', () => {
    const rows = [['Heat No', 'Date', 'TTT', 'Power On Min', 'MWh', 'Tapped T', 'Scrap T', 'Oxygen', 'Foo'], ['A1', '2026-10-01 02:33', '52', '38', '37.8', '95', '104', '3,400', 'x']]
    const r = importHeatRows(rows)
    expect(r.error).toBeUndefined()
    expect(r.heats[0].kwh).toBe(37_800)
    expect(r.heats[0].o2Nm3).toBe(3_400)
    expect(r.warnings.join(' ')).toMatch(/Ignored columns: Foo/)
  })
  it('rejects missing columns and impossible heats', () => {
    expect(importHeatRows([['heat', 'kwh'], ['1', '2']]).error).toMatch(/Missing columns/)
    const r = importHeatRows([['heat', 'kwh', 'tapped_t', 'charge_t', 'power_on_min', 'tap_to_tap_min'], ['1', '1000', '10', '11', '50', '40'], ['2', '1000', '10', '11', '30', '40']])
    expect(r.heats).toHaveLength(1)
    expect(r.warnings.join(' ')).toMatch(/1 heat\(s\) skipped/)
  })
})

describe('derive', () => {
  it('computes per-tonne values and a carbon mass balance', () => {
    const h = derive({ heat: '1', at: '', tapToTapMin: 50, powerOnMin: 40, kwh: 40_000, tappedT: 100, chargeT: 110, o2Nm3: 3_000, ngNm3: 0, chargeCarbonKg: 1_000, injCarbonKg: 0, electrodeKg: 0 }, defaultEaf, grid)
    expect(h.kwhPerT).toBe(400)
    expect(h.powerOffMin).toBe(10)
    expect(h.mw).toBeCloseTo(60)
    // Carbon in 1000·0.85 = 850 kg; out in steel 100 t · 0.2% = 200 kg; CO₂ = 650·44/12 per 100 t.
    expect(h.scope1KgPerT).toBeCloseTo(650 * 44 / 12 / 100)
    expect(h.scope2KgPerT).toBeCloseTo(400 * grid)
  })
})

describe('learn', () => {
  it('recovers the known coefficients with ranges that contain them', () => {
    const m = learn(derived(200))
    expect(m.enough).toBe(true)
    expect(m.r2).toBeGreaterThan(0.95)
    const truth = { o2PerT: -3.5, ngPerT: -5, carbonPerT: -2, powerOffMin: 1.5, tapTempC: 1 }
    // A 90% range misses 1 time in 10, so check within 3 standard errors instead of the range itself.
    for (const f of m.factors) {
      expect(f.used).toBe(true)
      expect(Math.abs(f.coef - truth[f.id])).toBeLessThan(3 * f.se)
      expect(f.high).toBeGreaterThan(f.low)
    }
    expect(m.factors.find((f) => f.id === 'o2PerT')!.status).toBe('learned')
  })
  it('falls back to published values with too few heats', () => {
    const m = learn(derived(10))
    expect(m.enough).toBe(false)
    expect(m.factors.every((f) => f.status === 'published')).toBe(true)
  })
  it('flags a coefficient with the wrong sign', () => {
    const hs = derived(200).map((h) => ({ ...h, kwhPerT: h.kwhPerT + 7 * h.o2PerT }))
    expect(learn(hs).factors.find((f) => f.id === 'o2PerT')!.status).toBe('check')
  })
})

describe('losses and optimiser', () => {
  const hs = derived(200)
  const m = learn(hs)
  it('lists losses with ranges, largest first', () => {
    const l = losses(hs, m, defaultEaf, 400, grid)
    expect(l.length).toBeGreaterThan(2)
    for (let i = 1; i < l.length; i += 1) expect(l[i - 1].rmPerMonth).toBeGreaterThanOrEqual(l[i].rmPerMonth)
    for (const x of l) expect(x.high).toBeGreaterThanOrEqual(x.low)
  })
  it('stays within the observed range and beats the average heat', () => {
    const b = boundsFor(hs, defaultEaf)
    const x = optimise(m, b, hs, defaultEaf, 400, 40, grid, 'cost')
    for (const id of Object.keys(b) as (keyof typeof b)[]) {
      expect(x[id]).toBeGreaterThanOrEqual(b[id][0] - 1e-9)
      expect(x[id]).toBeLessThanOrEqual(b[id][1] + 1e-9)
    }
    const mid = Object.fromEntries(Object.entries(b).map(([k, v]) => [k, (v[0] + v[1]) / 2])) as typeof x
    expect(outcome(m, x, hs, defaultEaf, 400, 40, grid).costPerT).toBeLessThan(outcome(m, mid, hs, defaultEaf, 400, 40, grid).costPerT)
    // Less delay and lower tap temperature always help.
    expect(x.powerOffMin).toBeCloseTo(b.powerOffMin[0])
    expect(x.tapTempC).toBeCloseTo(b.tapTempC[0])
  })
  it('gives a 90% range around the prediction', () => {
    const p = predict(m, { o2PerT: 35 }, hs)
    expect(p.low).toBeLessThan(p.kwhPerT)
    expect(p.high).toBeGreaterThan(p.kwhPerT)
  })
})
