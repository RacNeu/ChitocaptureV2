import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextSteps } from './roles'

let store: typeof import('./store')
beforeEach(async () => { vi.resetModules(); store = await import('./store') })

describe('roles', () => {
  it('gives each role its own moves', () => {
    expect(nextSteps('proposed', 'engineer')).toEqual([])
    expect(nextSteps('proposed', 'sustainability').map((step) => step.to)).toEqual(['approved', 'rejected'])
    expect(nextSteps('approved', 'engineer').map((step) => step.to)).toEqual(['in-progress'])
    expect(nextSteps('done', 'sustainability').map((step) => step.to)).toContain('verified')
    expect(nextSteps('done', 'management')).toEqual([])
  })
})

describe('plan workflow and history', () => {
  it('moves an action through the workflow and records who did what', () => {
    const machine = store.getState().machines[0]
    store.actions.addToPlan(machine.id, 'combustion', 2027)
    const id = store.getState().plan.at(-1)!.id
    expect(store.getState().plan.at(-1)!.status).toBe('proposed')
    store.actions.setRole('sustainability')
    store.actions.setActionStatus(id, 'approved', 'Go ahead')
    store.actions.setRole('engineer')
    store.actions.setActionStatus(id, 'in-progress')
    store.actions.updateAction(id, { measuredT: 120 })
    store.actions.setActionStatus(id, 'done')
    store.actions.setRole('sustainability')
    store.actions.setActionStatus(id, 'verified')
    const action = store.getState().plan.find((item) => item.id === id)!
    expect(action.status).toBe('verified')
    expect(action.measuredT).toBe(120)
    expect(action.comments?.[0].text).toBe('Go ahead')
    const history = store.getState().history!
    expect(history.some((entry) => entry.role === 'sustainability' && entry.text.startsWith('Verified'))).toBe(true)
    expect(history.some((entry) => entry.role === 'engineer' && entry.text.startsWith('Proposed'))).toBe(true)
  })

  it('collapses repeated edits of the same field into one history line', () => {
    const machine = store.getState().machines[0]
    store.actions.updateMachine({ ...machine, electricityMWh: 1 })
    store.actions.updateMachine({ ...machine, electricityMWh: 12 })
    store.actions.updateMachine({ ...machine, electricityMWh: 123 })
    expect(store.getState().history!.filter((entry) => entry.text.includes('electricityMWh'))).toHaveLength(1)
  })
})

describe('clearing the plan', () => {
  it('removes every action and logs it', async () => {
    vi.resetModules()
    const store = await import('./store')
    const { autoPlan } = await import('./copilot')
    store.actions.setPlan(autoPlan(store.getState()))
    expect(store.getState().plan.length).toBeGreaterThan(0)
    store.actions.clearPlan()
    expect(store.getState().plan).toHaveLength(0)
    expect(store.getState().history?.at(-1)?.text).toMatch(/Cleared the plan/)
  })
})

describe('monthly data audit trail', () => {
  const month = (m: string, mwh: number) => ({ month: m, electricityMWh: mwh, fuelGJ: {}, processT: 0, productionT: 10 })
  it('logs changes, freezes signed-off years and only lets management reopen them', () => {
    store.actions.setRole('engineer')
    store.actions.setMonthly([month('2025-01', 100), month('2026-01', 200)], 'first.csv')
    store.actions.attachEvidence('2025-01', { name: 'tnb-jan.pdf', sizeBytes: 10, sha256: 'abc', kind: 'electricity', at: '', who: '' })
    store.actions.lockYear(2025)
    expect(store.getState().locks ?? []).toEqual([])
    store.actions.setRole('sustainability')
    store.actions.lockYear(2025)
    expect(store.getState().locks?.[0]).toMatchObject({ year: 2025, evidencePct: 100 })
    expect(store.getState().locks?.[0].scope2T).toBeCloseTo(77.4)

    const kept = store.actions.setMonthly([month('2025-01', 999), month('2026-01', 250)], 'second.csv')
    expect(kept).toEqual(['2025-01'])
    const monthly = store.getState().monthly!
    expect(monthly.find((r) => r.month === '2025-01')).toMatchObject({ electricityMWh: 100 })
    expect(monthly.find((r) => r.month === '2025-01')?.evidence?.[0].name).toBe('tnb-jan.pdf')
    expect(monthly.find((r) => r.month === '2026-01')?.electricityMWh).toBe(250)
    expect(store.actions.attachEvidence('2025-01', { name: 'x.pdf', sizeBytes: 1, sha256: 'def', kind: 'other', at: '', who: '' })).toBe(false)
    const log = store.getState().monthlyLog!
    expect(log.at(-1)).toMatchObject({ month: '2026-01', field: 'Electricity MWh', from: 200, to: 250, source: 'second.csv', role: 'sustainability' })

    store.actions.unlockYear(2025, 'Restated')
    expect(store.getState().locks).toHaveLength(1)
    store.actions.setRole('management')
    store.actions.unlockYear(2025, '')
    expect(store.getState().locks).toHaveLength(1)
    store.actions.unlockYear(2025, 'TNB re-issued the January bill')
    expect(store.getState().locks).toHaveLength(0)
    expect(store.getState().history!.some((h) => h.text.includes('TNB re-issued'))).toBe(true)
  })
})
