import { useSyncExternalStore } from 'react'
import { templateById } from './templates'
import type { FactoryState, Machine, PlanAction, Settings } from './types'

const KEY = 'chitocapture.v3.factory'

export const defaultSettings: Settings = {
  factoryName: 'My factory',
  industryId: 'cement',
  gridRegionId: 'my-peninsular',
  customGridKgPerKWh: 0.5,
  electricityPriceRMPerMWh: 450,
  fuelPriceRMPerGJ: { coal: 15, 'natural-gas': 40, diesel: 90, 'fuel-oil': 70, biomass: 10 },
  discountRatePct: 8,
  baselineYear: 2026,
  targetYear: 2030,
  targetReductionPct: 25,
}

let counter = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function machinesFromTemplate(industryId: string): Machine[] {
  return (templateById(industryId)?.machines ?? []).map((machine) => ({ ...machine, id: newId('m') }))
}

export function freshState(industryId = 'cement'): FactoryState {
  return { version: 3, onboarded: false, settings: { ...defaultSettings, industryId }, machines: machinesFromTemplate(industryId), plan: [], measuredSorbentCapacity: null }
}

function load(): FactoryState {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as FactoryState
      if (parsed.version === 3 && Array.isArray(parsed.machines)) {
        return { ...parsed, settings: { ...defaultSettings, ...parsed.settings, fuelPriceRMPerGJ: { ...defaultSettings.fuelPriceRMPerGJ, ...parsed.settings?.fuelPriceRMPerGJ } }, plan: parsed.plan ?? [] }
      }
    }
  } catch { /* Corrupt or unavailable storage: start fresh. */ }
  return freshState()
}

let state: FactoryState = typeof localStorage === 'undefined' ? freshState() : load()
const listeners = new Set<() => void>()

function commit(next: FactoryState) {
  state = next
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* Private mode: keep in memory only. */ }
  listeners.forEach((listener) => listener())
}

export const getState = () => state
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useFactory = () => useSyncExternalStore(subscribe, getState, getState)

export const actions = {
  replace: (next: FactoryState) => commit(next),
  finishOnboarding: (settings: Settings, machines: Machine[]) => commit({ ...state, onboarded: true, settings, machines, plan: [] }),
  restart: () => commit({ ...freshState(state.settings.industryId), measuredSorbentCapacity: state.measuredSorbentCapacity }),
  updateSettings: (patch: Partial<Settings>) => commit({ ...state, settings: { ...state.settings, ...patch } }),
  updateMachine: (machine: Machine) => commit({ ...state, machines: state.machines.map((item) => item.id === machine.id ? machine : item) }),
  addToPlan: (machineId: string, measureId: string, startYear: number) => {
    if (state.plan.some((item) => item.machineId === machineId && item.measureId === measureId)) return
    const action: PlanAction = { id: newId('a'), machineId, measureId, startYear }
    commit({ ...state, plan: [...state.plan, action] })
  },
  removeFromPlan: (actionId: string) => commit({ ...state, plan: state.plan.filter((item) => item.id !== actionId) }),
  setActionYear: (actionId: string, startYear: number) => commit({ ...state, plan: state.plan.map((item) => item.id === actionId ? { ...item, startYear } : item) }),
  setPlan: (plan: PlanAction[]) => commit({ ...state, plan }),
  bindSensor: (machineId: string, channel: Machine['sensorChannel']) => commit({
    ...state,
    machines: state.machines.map((item) => item.id === machineId ? { ...item, sensorChannel: channel } : item.sensorChannel === channel ? { ...item, sensorChannel: undefined } : item),
  }),
  setMeasuredSorbentCapacity: (value: number | null) => commit({ ...state, measuredSorbentCapacity: value }),
}
