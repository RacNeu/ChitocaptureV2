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
  it('sends ~26–29% of the heat’s electricity into the coil water, as DOE measured', () => {
    const sum = (f: (x: (typeof base.points)[number]) => number) => base.points.reduce((a, x) => a + f(x), 0)
    const share = sum((x) => x.coilHeatKW) / sum((x) => x.powerKW)
    expect(share).toBeGreaterThan(0.25)
    expect(share).toBeLessThan(0.3)
    // ~63–71% of the electricity ends up in the liquid steel (Missouri S&T/DOE Sankey diagrams)
    expect(389 * base.tappedT / base.kwh).toBeGreaterThan(0.63)
    expect(389 * base.tappedT / base.kwh).toBeLessThan(0.72)
  })
  it('matches the published size of each loss', () => {
    // Cold lining: DOE measured +105 to +119 kWh/t against hot-lining heats
    const cold = run({ coldLining: true }).kwhPerT - base.kwhPerT
    expect(cold).toBeGreaterThan(100)
    expect(cold).toBeLessThan(125)
    // Lid open on a liquid bath: published 0.3–0.9 kWh/t per minute (Otto Junker; radiation physics)
    const lid = (run({ lidOpenMin: 20 }).kwhPerT - run({ lidOpenMin: 0 }).kwhPerT) / 20
    expect(lid).toBeGreaterThan(0.3)
    expect(lid).toBeLessThan(0.9)
    // Holding: ~0.15–0.5 kWh/t per minute
    const hold = (run({ holdMin: 30 }).kwhPerT - run({ holdMin: 10 }).kwhPerT) / 20
    expect(hold).toBeGreaterThan(0.15)
    expect(hold).toBeLessThan(0.5)
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
