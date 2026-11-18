import { describe, expect, it } from 'vitest'
import { defaultMelt, deriveHeats, learnFactors } from './meltshop'
import { demoMeltShop } from './meltshopDemo'
import { baseLevers, currentMix, simulate } from './meltSim'

const demo = demoMeltShop()
const heats = deriveHeats(demo.heats, defaultMelt, 0.774)
const model = learnFactors(heats)
const sim = (patch: Parameters<typeof simulate>[5] extends infer L ? Partial<L> : never) => simulate(heats, model, defaultMelt, 0.774, demo.chem, { ...baseLevers(), ...patch })

describe('simulator', () => {
  it('changes nothing with no levers', () => {
    const r = sim({})
    expect(r.scen.costPerT).toBeCloseTo(r.base.costPerT, 6)
    expect(r.steps).toHaveLength(0)
  })
  it('saves energy and money with less holding, and the step matches the total', () => {
    const r = sim({ holdCap: 10 })
    expect(r.scen.ifKwhPerT).toBeLessThan(r.base.ifKwhPerT)
    expect(r.steps[0].id).toBe('hold')
    expect(r.steps[0].rmPerMonth).toBeCloseTo((r.base.costPerT - r.scen.costPerT) * r.tPerMonth, 0)
  })
  it('melting off-peak cuts cost but not CO₂, and warns about capacity', () => {
    const r = sim({ shiftOffPeak: 1 })
    expect(r.scen.costPerT).toBeLessThan(r.base.costPerT)
    expect(r.scen.co2LocPerT).toBeCloseTo(r.base.co2LocPerT, 6)
    expect(r.warnings.join(' ')).toMatch(/spare off-peak capacity/)
  })
  it('green electricity cuts market-based CO₂ only', () => {
    const r = sim({ greenShare: 0.5 })
    expect(r.scen.co2MktPerT).toBeLessThan(r.base.co2MktPerT * 0.6)
    expect(r.scen.co2LocPerT).toBeCloseTo(r.base.co2LocPerT, 6)
  })
  it('more turnings raises copper and kWh/t', () => {
    const mix = currentMix(heats)
    const r = sim({ mix: { ...mix, turnings: mix.turnings + 20, hms: mix.hms - 20 } })
    expect(r.scen.cuPct!).toBeGreaterThan(r.base.cuPct!)
    expect(r.scen.ifKwhPerT).toBeGreaterThan(r.base.ifKwhPerT)
  })
  it('solar has capex and cuts CO₂', () => {
    const r = sim({ solarMWp: 10 })
    expect(r.capexRM).toBe(30_000_000)
    expect(r.scen.co2LocPerT).toBeLessThan(r.base.co2LocPerT)
  })
})
