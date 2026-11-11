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

/* ---------------- Demo companies, each with several sites ---------------- */

/** fixed = part of the sample company and cannot be deleted; sites the user adds can be. */
export type Site = { id: string; state: FactoryState; fixed?: boolean }
export type Company = { id: string; name: string; sites: Site[]; activeId: string }
export type Workspace = { version: 2; companies: Company[]; activeCompanyId: string }

const WORKSPACE_KEY = 'chitocapture.v3.workspace'

function siteFromTemplate(industryId: string, name: string): Site {
  const fresh = freshState(industryId)
  return { id: newId('site'), fixed: true, state: { ...fresh, onboarded: true, settings: { ...fresh.settings, factoryName: name } } }
}

function makeCompany(name: string, sites: Site[]): Company {
  return { id: newId('co'), name, sites, activeId: sites[0].id }
}

/**
 * Two sample customers. The steel group is the flagship: mill, downstream wire plant and head office.
 * A separate cement producer shows the platform works for other industries.
 */
export function defaultWorkspace(): Workspace {
  const steel = makeCompany('Malaysia Steel Demo Sdn Bhd', [
    siteFromTemplate('steel', 'Steel mini-mill'),
    siteFromTemplate('steel-downstream', 'Wire & galvanising plant'),
    siteFromTemplate('office', 'Head office'),
  ])
  const cement = makeCompany('Malaysia Cement Demo Sdn Bhd', [siteFromTemplate('cement', 'Cement plant')])
  return { version: 2, companies: [steel, cement], activeCompanyId: steel.id }
}

function normalise(parsed: FactoryState): FactoryState {
  const industryId = parsed.settings?.industryId ?? defaultSettings.industryId
  const production = 'productionTPerYear' in (parsed.settings ?? {}) ? {} : productionFor(industryId)
  return { ...parsed, machines: enrich(parsed.machines, industryId), settings: { ...defaultSettings, ...production, ...parsed.settings, fuelPriceRMPerGJ: { ...defaultSettings.fuelPriceRMPerGJ, ...parsed.settings?.fuelPriceRMPerGJ } }, plan: parsed.plan ?? [] }
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace
      if (parsed.version === 2 && Array.isArray(parsed.companies)) {
        const companies = parsed.companies.map((item) => {
          // Older saves have no `fixed` flag: treat the sample sites (by industry) as fixed.
          const sampleIndustries = ['steel', 'steel-downstream', 'office', 'cement']
          const legacy = (item.sites ?? []).every((site) => site.fixed === undefined)
          const sites = (item.sites ?? []).filter((site) => site.state?.version === 3 && Array.isArray(site.state.machines))
            .map((site, index) => ({ ...site, fixed: legacy ? index < 3 && sampleIndustries.includes(site.state.settings?.industryId) : site.fixed, state: normalise(site.state) }))
          return { ...item, sites, activeId: sites.some((site) => site.id === item.activeId) ? item.activeId : sites[0]?.id }
        }).filter((item) => item.sites.length > 0)
        if (companies.length) return { version: 2, companies, activeCompanyId: companies.some((item) => item.id === parsed.activeCompanyId) ? parsed.activeCompanyId : companies[0].id }
      }
    }
  } catch { /* Corrupt or unavailable storage: start with the samples. */ }
  return defaultWorkspace()
}

let workspace: Workspace = typeof localStorage === 'undefined' ? defaultWorkspace() : loadWorkspace()
const activeCompany = () => workspace.companies.find((item) => item.id === workspace.activeCompanyId) ?? workspace.companies[0]
const activeSite = () => { const company = activeCompany(); return company.sites.find((site) => site.id === company.activeId) ?? company.sites[0] }
let company: Company = activeCompany()
let state: FactoryState = activeSite().state
const listeners = new Set<() => void>()

function save() {
  company = activeCompany()
  state = activeSite().state
  try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace)) } catch { /* Private mode: keep in memory only. */ }
  listeners.forEach((listener) => listener())
}

function updateCompany(fn: (current: Company) => Company) {
  workspace = { ...workspace, companies: workspace.companies.map((item) => item.id === workspace.activeCompanyId ? fn(item) : item) }
  save()
}

/** Replace the active site's state. All per-site actions go through here. */
function commit(next: FactoryState) {
  updateCompany((current) => ({ ...current, sites: current.sites.map((site) => site.id === current.activeId ? { ...site, state: next } : site) }))
}

export const getState = () => state
export const getCompany = () => company
export const getWorkspace = () => workspace
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const useFactory = () => useSyncExternalStore(subscribe, getState, getState)
export const useCompany = () => useSyncExternalStore(subscribe, getCompany, getCompany)
export const useWorkspace = () => useSyncExternalStore(subscribe, getWorkspace, getWorkspace)

export const companyActions = {
  switchCompany: (id: string) => {
    if (!workspace.companies.some((item) => item.id === id)) return
    workspace = { ...workspace, activeCompanyId: id }
    save()
  },
  /** Switch to a site in any company. */
  switchSite: (id: string) => {
    const owner = workspace.companies.find((item) => item.sites.some((site) => site.id === id))
    if (!owner) return
    workspace = { ...workspace, activeCompanyId: owner.id, companies: workspace.companies.map((item) => item.id === owner.id ? { ...item, activeId: id } : item) }
    save()
  },
  /** Add a site that still needs setting up to the active company; it becomes the active site. */
  addSite: (industryId: string) => {
    const site: Site = { id: newId('site'), fixed: false, state: freshState(industryId) }
    updateCompany((current) => ({ ...current, sites: [...current.sites, site], activeId: site.id }))
    return site.id
  },
  removeSite: (id: string) => {
    updateCompany((current) => {
      if (current.sites.length <= 1 || current.sites.find((site) => site.id === id)?.fixed) return current
      const sites = current.sites.filter((site) => site.id !== id)
      return { ...current, sites, activeId: current.activeId === id ? sites[0].id : current.activeId }
    })
  },
  rename: (name: string) => updateCompany((current) => ({ ...current, name })),
  resetToSample: () => { workspace = defaultWorkspace(); save() },
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
  /** The sorbent capacity is a property of ChitoCapture's material, so it applies to every site. */
  setMeasuredSorbentCapacity: (value: number | null) => {
    workspace = { ...workspace, companies: workspace.companies.map((item) => ({ ...item, sites: item.sites.map((site) => ({ ...site, state: { ...site.state, measuredSorbentCapacity: value } })) })) }
    save()
  },
}
