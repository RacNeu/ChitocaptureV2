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
