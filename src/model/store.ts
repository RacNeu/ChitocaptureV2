import { useSyncExternalStore } from 'react'
import { templateById } from './templates'
import type { FactoryState, Machine, PlanAction, Settings } from './types'

export const defaultSettings: Settings = {
  factoryName: 'My factory',
  industryId: 'steel',
  gridRegionId: 'my-peninsular',
  customGridKgPerKWh: 0.5,
  electricityPriceRMPerMWh: 450,
  fuelPriceRMPerGJ: { coal: 15, 'natural-gas': 40, diesel: 90, 'fuel-oil': 70, biomass: 10 },
  discountRatePct: 8,
  baselineYear: 2026,
  targetYear: 2030,
  targetReductionPct: 25,
  productionTPerYear: templateById('steel')?.production?.tonnes ?? null,
  productUnit: templateById('steel')?.production?.unit ?? 'product',
}

/** Production defaults for an industry template. */
export function productionFor(industryId: string) {
  const production = templateById(industryId)?.production
  return { productionTPerYear: production?.tonnes ?? null, productUnit: production?.unit ?? 'product' }
}

/** Fill in role, area, link and target for machines saved before those fields existed. */
function enrich(machines: Machine[], industryId: string): Machine[] {
  const template = templateById(industryId)?.machines ?? []
  return machines.map((machine) => {
    const match = template.find((item) => item.name === machine.name)
    return match ? { role: match.role, area: match.area, unitId: match.unitId, targetPerT: match.targetPerT, ...machine } : machine
  })
}

let counter = 0
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`

export function machinesFromTemplate(industryId: string): Machine[] {
  return (templateById(industryId)?.machines ?? []).map((machine) => ({ ...machine, id: newId('m') }))
}

export function freshState(industryId = 'steel'): FactoryState {
  return { version: 3, onboarded: false, settings: { ...defaultSettings, industryId, ...productionFor(industryId) }, machines: machinesFromTemplate(industryId), plan: [], measuredSorbentCapacity: null }
}

/* ---------------- Company with several sites ---------------- */

export type Site = { id: string; state: FactoryState }
export type Company = { version: 1; name: string; sites: Site[]; activeId: string }

const COMPANY_KEY = 'chitocapture.v3.company'

function siteFromTemplate(industryId: string, name: string): Site {
  return { id: newId('site'), state: { ...freshState(industryId), onboarded: true, settings: { ...freshState(industryId).settings, factoryName: name } } }
}

/** The sample company: a steel mill (flagship), its head office & R&D lab, and a separate cement plant. */
export function defaultCompany(): Company {
  const sites = [
    siteFromTemplate('steel', 'Steel mini-mill'),
    siteFromTemplate('office', 'Head office & R&D lab'),
    siteFromTemplate('cement', 'Cement plant'),
  ]
  return { version: 1, name: 'Malaysia Steel Demo Sdn Bhd', sites, activeId: sites[0].id }
}

function normalise(parsed: FactoryState): FactoryState {
  const industryId = parsed.settings?.industryId ?? defaultSettings.industryId
  const production = 'productionTPerYear' in (parsed.settings ?? {}) ? {} : productionFor(industryId)
  return { ...parsed, machines: enrich(parsed.machines, industryId), settings: { ...defaultSettings, ...production, ...parsed.settings, fuelPriceRMPerGJ: { ...defaultSettings.fuelPriceRMPerGJ, ...parsed.settings?.fuelPriceRMPerGJ } }, plan: parsed.plan ?? [] }
}

function loadCompany(): Company {
  try {
    const raw = localStorage.getItem(COMPANY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Company
      if (parsed.version === 1 && Array.isArray(parsed.sites) && parsed.sites.length) {
        const sites = parsed.sites.filter((site) => site.state?.version === 3 && Array.isArray(site.state.machines)).map((site) => ({ ...site, state: normalise(site.state) }))
        if (sites.length) return { ...parsed, sites, activeId: sites.some((site) => site.id === parsed.activeId) ? parsed.activeId : sites[0].id }
      }
    }
  } catch { /* Corrupt or unavailable storage: start with the sample company. */ }
  // Carry over a sorbent capacity measured in the earlier single-factory version.
  const company = defaultCompany()
  try {
    const old = localStorage.getItem('chitocapture.v3.factory')
    const capacity = old ? (JSON.parse(old) as FactoryState).measuredSorbentCapacity : null
    if (capacity) company.sites.forEach((site) => { site.state.measuredSorbentCapacity = capacity })
  } catch { /* ignore */ }
  return company
}

let company: Company = typeof localStorage === 'undefined' ? defaultCompany() : loadCompany()
const activeSite = () => company.sites.find((site) => site.id === company.activeId) ?? company.sites[0]
let state: FactoryState = activeSite().state
const listeners = new Set<() => void>()

function save() {
  try { localStorage.setItem(COMPANY_KEY, JSON.stringify(company)) } catch { /* Private mode: keep in memory only. */ }
  listeners.forEach((listener) => listener())
}

/** Replace the active site's state. All per-site actions go through here. */
function commit(next: FactoryState) {
  state = next
  company = { ...company, sites: company.sites.map((site) => site.id === company.activeId ? { ...site, state: next } : site) }
  save()
}

export const getState = () => state
export const getCompany = () => company
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useFactory = () => useSyncExternalStore(subscribe, getState, getState)
export const useCompany = () => useSyncExternalStore(subscribe, getCompany, getCompany)

export const companyActions = {
  switchSite: (id: string) => {
    if (!company.sites.some((site) => site.id === id)) return
    company = { ...company, activeId: id }
    state = activeSite().state
    save()
  },
  /** Add a site that still needs setting up; it becomes the active site. */
  addSite: (industryId: string) => {
    const site: Site = { id: newId('site'), state: freshState(industryId) }
    company = { ...company, sites: [...company.sites, site], activeId: site.id }
    state = site.state
    save()
    return site.id
  },
  removeSite: (id: string) => {
    if (company.sites.length <= 1) return
    const sites = company.sites.filter((site) => site.id !== id)
    company = { ...company, sites, activeId: company.activeId === id ? sites[0].id : company.activeId }
    state = activeSite().state
    save()
  },
  rename: (name: string) => { company = { ...company, name }; save() },
  resetToSample: () => { company = defaultCompany(); state = activeSite().state; save() },
}

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
  /** The sorbent capacity is a property of the material, so it applies to every site. */
  setMeasuredSorbentCapacity: (value: number | null) => {
    state = { ...state, measuredSorbentCapacity: value }
    company = { ...company, sites: company.sites.map((site) => ({ ...site, state: { ...site.state, measuredSorbentCapacity: value } })) }
    save()
  },
}
