import { describe, expect, it } from 'vitest'
import { defaultSetPoints as sp, pointAt, simulateHeat } from './furnaceSim'

const run = (patch: Partial<typeof sp> = {}) => simulateHeat({ ...sp, ...patch })

describe('induction heat simulator', () => {
  const base = run()
  it('lands in the published range for a 60 t heat', () => {
    console.info(`base: ${base.kwhPerT.toFixed(0)} kWh/t, power-on ${base.powerOnMin.toFixed(0)} min, total ${base.totalMin.toFixed(0)} min`)
    expect(base.kwhPerT).toBeGreaterThan(480)
    expect(base.kwhPerT).toBeLessThan(640)
    expect(base.powerOnMin).toBeGreaterThan(45)
    expect(base.powerOnMin).toBeLessThan(90)
  })
  it('puts ~26–29% of the power into the coil water while melting', () => {
    const p = base.points.find((x) => x.phase === 'melting' && x.meltPct > 50)!
    expect(p.coilHeatKW / p.powerKW).toBeGreaterThan(0.18)
    expect(p.coilHeatKW / p.powerKW).toBeLessThan(0.32)
  })
  it('responds to the set points the right way', () => {
    expect(run({ holdMin: 40 }).kwhPerT).toBeGreaterThan(base.kwhPerT)
    expect(run({ lidOpenMin: 25 }).kwhPerT).toBeGreaterThan(base.kwhPerT)
    expect(run({ tapAimC: 1_660 }).kwhPerT).toBeGreaterThan(base.kwhPerT)
    expect(run({ coldLining: true }).kwhPerT).toBeGreaterThan(base.kwhPerT + 60)
    expect(run({ powerMW: 16 }).kwhPerT).toBeGreaterThan(base.kwhPerT)   // half power: fixed losses over a longer heat
    expect(run({ powerMW: 16 }).powerOnMin).toBeGreaterThan(base.powerOnMin * 1.6)
  })
  it('raises a coil-water alarm when flow is too low', () => {
    expect(run({ waterFlowM3h: 220 }).alarms.some((a) => a.level === 'alarm')).toBe(true)
    expect(base.alarms.filter((a) => a.level === 'alarm')).toHaveLength(0)
  })
  it('goes through every phase and tilts only to tap', () => {
    const phases = new Set(base.points.map((p) => p.phase))
    expect([...phases]).toEqual(['charging', 'melting', 'superheat', 'holding', 'tapping'])
    expect(pointAt(base, base.totalMin - 1).tiltDeg).toBe(31)
    expect(pointAt(base, 30).tiltDeg).toBe(0)
  })
})
