import { describe, expect, it } from 'vitest'
import { defaultGalvParams as p, dieSchedule, galvAnnual, galvIntensity, galvLive, galvTonnesPerHour, galvUpgradeImpacts, kgPerMetre, noGalvUpgrades as none } from './galv'
import { templateById } from './templates'

describe('wire drawing & galvanising model', () => {
  it('has realistic line throughput', () => {
    expect(kgPerMetre(p)).toBeCloseTo(0.0385, 3) // 2.5 mm steel wire
    expect(p.wireDiaMm * p.lineSpeedMPerMin).toBeGreaterThan(100) // DV typical of wire lines
    expect(galvTonnesPerHour(p)).toBeGreaterThan(18)
    expect(galvAnnual(p, none).wireT).toBeCloseTo(150_000, -3)
  })
  it('puts drawing energy in the published range', () => {
    const drawing = galvIntensity(p, none).kwh.drawing
    // Low-carbon 5.5 → 2.5 mm needs less than 0.42 %C wire drawn 5.5 → 2.2 mm (118–155 kWh/t, Suliga et al. 2023).
    expect(drawing).toBeGreaterThan(60)
    expect(drawing).toBeLessThan(118)
    const dies = dieSchedule(p)
    expect(dies).toHaveLength(8)
    expect(dies.at(-1)!.dOutMm).toBeCloseTo(2.5, 5)
    expect(dies.at(-1)!.speedMPerS).toBeCloseTo(p.drawSpeedMPerS, 5)
  })
  it('uses a realistic amount of zinc and gas', () => {
    const i = galvIntensity(p, none)
    expect(i.zincKgPerT).toBeGreaterThan(45)
    expect(i.zincKgPerT).toBeLessThan(75)
    expect(i.annealGJPerT).toBeGreaterThan(0.6)
    expect(i.kettleGJPerT).toBeGreaterThan(0.8)
    // Zinc's upstream footprint is of the same order as the site's own emissions.
    expect(i.zincKgCO2PerT / i.totalKgPerT).toBeGreaterThan(0.7)
  })
  it('shows induction annealing raising CO₂ on a coal-heavy grid, and coating control saving zinc', () => {
    const impacts = galvUpgradeImpacts(p, { ...none, induction: true, coatingControl: true })
    expect(impacts.find((item) => item.info.key === 'induction')!.savedTPerYear).toBeLessThan(0)
    const coating = impacts.find((item) => item.info.key === 'coatingControl')!
    expect(coating.zincSavedT).toBeGreaterThan(300)
    expect(coating.paybackYears!).toBeLessThan(1)
    const clean = galvUpgradeImpacts({ ...p, gridKgPerKWh: 0.199 }, { ...none, induction: true })
    expect(clean[0].savedTPerYear).toBeGreaterThan(0) // on Sarawak's hydro grid it cuts CO₂
  })
  it('averages to the per-tonne model over a day of live running', () => {
    const i = galvIntensity(p, none)
    let co2 = 0, wire = 0
    for (let minute = 0; minute < 1_440; minute += 1) { const live = galvLive(p, none, minute); co2 += live.co2TPerH; wire += live.wireTPerH }
    expect(co2 / wire * 1_000).toBeGreaterThan(i.totalKgPerT * 0.95)
    expect(co2 / wire * 1_000).toBeLessThan(i.totalKgPerT * 1.05)
  })
  it('matches the sample site data on the Company page', () => {
    const template = templateById('steel-downstream')!
    const i = galvIntensity(p, none)
    const t = template.production!.tonnes
    const byName = (name: string) => template.machines.find((machine) => machine.name === name)!
    expect(t).toBeCloseTo(galvAnnual(p, none).wireT, -4)
    expect(byName('Wire drawing machines').electricityMWh / t * 1_000).toBeCloseTo(i.kwh.drawing, -1)
    expect(byName('Annealing furnace').fuelGJ / t).toBeCloseTo(i.annealGJPerT, 1)
    expect(byName('Galvanising zinc bath').fuelGJ / t).toBeCloseTo(i.kettleGJPerT, 1)
  })
})

describe('simulation linked to site machine data', () => {
  it('reproduces the sample exactly and follows an edited machine', async () => {
    const { galvFromSite, steelFromSite } = await import('./siteLink')
    const { defaultWorkspace } = await import('./store')
    const company = defaultWorkspace().companies[0]
    const wire = company.sites[1].state
    const linked = galvFromSite(wire)
    expect(linked.linked).toBe(true)
    expect(galvIntensity(linked.params, none).totalKgPerT).toBeCloseTo(galvIntensity(p, none).totalKgPerT, -1)
    // Drawing machines use 20 % more electricity on this site.
    const edited = { ...wire, machines: wire.machines.map((m) => m.name === 'Wire drawing machines' ? { ...m, electricityMWh: m.electricityMWh * 1.2 } : m) }
    const after = galvFromSite(edited)
    expect(galvIntensity(after.params, none).kwh.drawing / galvIntensity(p, none).kwh.drawing).toBeCloseTo(1.2, 1)
    expect(after.deviations.some((d) => d.name === 'Wire drawing machines' && d.pct > 15)).toBe(true)
    // The steel mill follows its machines the same way.
    const mill = company.sites[0].state
    const hotter = { ...mill, machines: mill.machines.map((m) => m.unitId === 'reheat' ? { ...m, fuelGJ: m.fuelGJ * 0.8 } : m) }
    expect(steelFromSite(hotter).params.reheatGJPerT).toBeCloseTo(steelFromSite(mill).params.reheatGJPerT * 0.8, 3)
  })
})
