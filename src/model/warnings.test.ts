import { describe, expect, it } from 'vitest'
import { defaultMelt, deriveHeats, findAnomalies, learnFactors } from './meltshop'
import { demoMeltShop } from './meltshopDemo'
import { earlyWarnings, senSlope } from './warnings'

const shop = demoMeltShop()
const heats = deriveHeats(shop.heats, defaultMelt, 0.774)
const model = learnFactors(heats)
const input = { heats, chem: shop.chem, readings: shop.readings, anomalies: findAnomalies(shop.readings), model, s: defaultMelt, isDemo: true }
const list = earlyWarnings(input)
const byId = Object.fromEntries(list.map((w) => [w.id, w]))

describe('robust trend', () => {
  it('finds a slope through noise and one bad point, with a range around it', () => {
    const x = Array.from({ length: 40 }, (_, k) => k)
    const y = x.map((k) => 10 + 0.5 * k + Math.sin(k * 12.9898) * 0.4)
    y[20] = 90 // one wild reading
    const t = senSlope(x, y)!
    expect(t.slope).toBeCloseTo(0.5, 1)
    expect(t.low).toBeLessThan(t.slope)
    expect(t.high).toBeGreaterThan(t.slope)
  })
})

describe('plant early warnings on the demo melt shop', () => {
  it('forecasts the IF1 coil-water trend days before it reaches the limit', () => {
    const w = byId['coil-IF1']
    expect(w.status).toBe('act')
    expect(w.days!.mid).toBeGreaterThan(1)
    expect(w.days!.mid).toBeLessThan(7)
    expect(w.days!.low).toBeLessThanOrEqual(w.days!.mid)
    expect(w.days!.high).toBeGreaterThanOrEqual(w.days!.mid)
  })
  it('keeps healthy coils quiet and flags the IF3 drop as an event, not a trend', () => {
    expect(byId['coil-IF2'].status).toBe('ok')
    expect(byId['coil-IF4'].status).toBe('ok')
    expect(byId['coil-IF3'].status).toBe('watch')
    expect(byId['coil-IF3'].days).toBeNull()
    expect(byId['coil-IF3'].evidence.join(' ')).toMatch(/normal band/)
  })
  it('orders relines by heats left on each lining', () => {
    const d = (f: string) => byId[`lining-${f}`].days!.mid
    expect(d('IF4')).toBeLessThan(d('IF3'))
    expect(d('IF3')).toBeLessThan(d('IF1'))
    expect(d('IF1')).toBeLessThan(d('IF2'))
    expect(byId['lining-IF4'].status).toBe('act')
    expect(byId['lining-IF2'].basis).toContain('demo setting')
  })
  it('asks for the lining life instead of guessing when there is no demo or setting', () => {
    const real = earlyWarnings({ ...input, isDemo: false })
    const w = real.find((x) => x.id === 'lining-IF1')!
    expect(w.status).toBe('needs')
    expect(w.missing).toContain('Usual lining life (heats)')
  })
  it('finds IF4 using more energy than its sisters for the same practice', () => {
    const w = byId['energy-IF4']
    expect(['watch', 'act']).toContain(w.status)
    expect(w.rmPerMonth!).toBeGreaterThan(0)
    for (const f of ['IF1', 'IF2', 'IF3']) expect(byId[`energy-${f}`].status, f).toBe('ok')
  })
  it('reports the off-spec heats with the failing element', () => {
    const w = byId.chem
    expect(w.evidence[0]).toMatch(/^5 of \d+ heats over a limit/)
    expect(w.basis).toContain('BS 4449 limit')
  })
  it('puts the most urgent first and produces no NaN', () => {
    expect(list[0].status).toBe('act')
    const rank = { act: 0, watch: 1, needs: 2, ok: 3 }
    for (let k = 1; k < list.length; k += 1) expect(rank[list[k].status]).toBeGreaterThanOrEqual(rank[list[k - 1].status])
    expect(JSON.stringify(list)).not.toMatch(/NaN/)
  })
  it('says what it needs when there is no data', () => {
    const empty = earlyWarnings({ ...input, readings: [], chem: [], anomalies: [] })
    expect(empty.find((w) => w.id === 'coil')!.status).toBe('needs')
    expect(empty.find((w) => w.id === 'chem')!.status).toBe('needs')
  })
})
