import { describe, expect, it } from 'vitest'
import { freshState } from './store'
import { programmesFor, stateById, steelCrossCheck } from './malaysia'
import { annual, defaultSteelParams, noUpgrades } from './steel'

describe('Malaysia context', () => {
  it('maps states to the right grid', () => {
    expect(stateById('penang')?.gridRegionId).toBe('my-peninsular')
    expect(stateById('labuan')?.gridRegionId).toBe('my-sabah')
    expect(stateById('sarawak')?.gridRegionId).toBe('my-sarawak')
  })

  it('applies EECA only in Peninsular Malaysia and Labuan, above 21,600 GJ', () => {
    const mill = freshState('steel')
    const eeca = (stateId: string) => programmesFor({ ...mill, settings: { ...mill.settings, stateId } }).find((p) => p.id === 'eeca')?.status
    expect(eeca('selangor')).toBe('applies')
    expect(eeca('labuan')).toBe('applies')
    expect(eeca('sarawak')).toBe('not-applicable')
  })

  it('steelmaking intensity is within 5% of Masteel’s published figures', () => {
    const [melt, , wholeNoGas] = steelCrossCheck()
    expect(Math.abs(melt.diffPct)).toBeLessThan(5)
    expect(Math.abs(wholeNoGas.diffPct)).toBeLessThan(5)
  })

  it('green electricity adds the TNB GET premium to the energy bill', () => {
    const base = annual(defaultSteelParams, noUpgrades)
    const green = annual(defaultSteelParams, { ...noUpgrades, greenShare: 1 })
    expect(green.energyCostRM - base.energyCostRM).toBeCloseTo(base.electricityMWh * 30, 0)
  })
})

describe('measured capture efficiency', () => {
  it('replaces the assumed 90% in the capture estimate', async () => {
    const { measureById } = await import('./measures')
    const { contextFor } = await import('./calc')
    const mill = freshState('steel')
    const furnace = mill.machines.find((m) => m.fuelGJ > 0)!
    const capture = measureById('chitosan-capture')!
    const assumed = capture.estimate(furnace, contextFor(mill))!.directT
    const measured = capture.estimate(furnace, contextFor({ ...mill, measuredCaptureEfficiency: 0.8 }))!.directT
    expect(measured / assumed).toBeCloseTo(0.8 / 0.9, 5)
  })
})
