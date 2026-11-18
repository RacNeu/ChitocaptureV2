import { describe, expect, it } from 'vitest'
import { assetMachine, freeCells, scenarioImpact, type Scenario } from './planner'
import { freshState } from './store'

const mill = { ...freshState('steel'), onboarded: true }
const reheat = mill.machines.find((m) => m.unitId === 'reheat')!
const fans = mill.machines.find((m) => m.unitId === 'fume')!
const scenario = (changes: Scenario['changes']): Scenario => ({ id: 's', name: 'Test', changes, createdAt: '' })

describe('pre-operations planner', () => {
  it('leaves the site unchanged with no scenario', () => {
    const r = scenarioImpact(mill, null)
    expect(r.after.totalT).toBeCloseTo(r.before.totalT)
    expect(r.capexRM).toBe(0)
  })
  it('counts a library upgrade exactly as the Plan does', () => {
    const r = scenarioImpact(mill, scenario([{ id: 'a', type: 'upgrade', machineId: fans.id, measureId: 'vsd' }]))
    expect(r.changes[0].cutT).toBeGreaterThan(0)
    expect(r.changes[0].design).toBe(false)
    expect(r.after.totalT).toBeCloseTo(r.before.totalT - r.changes[0].cutT)
  })
  it('replacing gas reheating with induction removes its Scope 1 and adds electricity', () => {
    const r = scenarioImpact(mill, scenario([{ id: 'b', type: 'replace', machineId: reheat.id, replaceId: 'induction-heating' }]))
    const c = r.changes[0]
    expect(c.scope1CutT).toBeCloseTo(reheat.fuelGJ * 56.1 / 1_000)
    expect(c.cutT).toBeLessThan(c.scope1CutT)
    expect(r.after.scope1T).toBeCloseTo(r.before.scope1T - c.scope1CutT)
    expect(r.after.taxRM).toBeLessThan(r.before.taxRM)
    expect(c.design).toBe(true)
  })
  it('a solar farm cuts Scope 2; a battery cuts peak demand; a new line adds emissions and output', () => {
    const solar = scenarioImpact(mill, scenario([{ id: 'c', type: 'add', assetId: 'solar', col: 4, row: 0, size: 10 }])).changes[0]
    expect(solar.cutT).toBeCloseTo(10 * 1_300 * 0.774, 0)
    expect(solar.scope1CutT).toBe(0)
    const battery = scenarioImpact(mill, scenario([{ id: 'd', type: 'add', assetId: 'battery', col: 4, row: 1, size: 5 }])).changes[0]
    expect(battery.mdCutKW).toBe(5_000)
    expect(battery.costPerT).toBeNull()
    const line = scenarioImpact(mill, scenario([{ id: 'e', type: 'add', assetId: 'rolling-line', col: 4, row: 2, size: 200 }]))
    expect(line.changes[0].growth).toBe(true)
    expect(line.after.totalT).toBeGreaterThan(line.before.totalT)
    expect(line.after.productionT).toBe((line.before.productionT ?? 0) + 200_000)
  })
  it('turns an added asset into a machine on its plot', () => {
    const m = assetMachine({ id: 'f', type: 'add', assetId: 'melt-shop', col: 2, row: 3, size: 100 })
    expect([m.col, m.row, m.kind]).toEqual([2, 3, 'furnace'])
    expect(m.processT).toBeCloseTo(2_200)
  })
  it('offers only empty plots', () => {
    const cells = freeCells([{ col: 0, row: 0 }, { col: 1, row: 0 }])
    expect(cells.some((c) => c.col === 0 && c.row === 0)).toBe(false)
    expect(cells.some((c) => c.col === 2 && c.row === 0)).toBe(true)
  })
})
