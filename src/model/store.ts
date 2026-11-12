import { useSyncExternalStore } from 'react'
import { templateById } from './templates'
import type { ActionStatus, FactoryState, HistoryEntry, Machine, PlanAction, Role, Settings } from './types'
import { roleById, statusInfo } from './roles'
import { measureById } from './measures'

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
/** fixed = a sample company that cannot be deleted. */
export type Company = { id: string; name: string; sites: Site[]; activeId: string; fixed?: boolean }
export type Workspace = { version: 2; companies: Company[]; activeCompanyId: string; role?: Role }

const WORKSPACE_KEY = 'chitocapture.v3.workspace'
/** How many companies a user can add on top of the samples. */
export const MAX_ADDED_COMPANIES = 3

function siteFromTemplate(industryId: string, name: string): Site {
  const fresh = freshState(industryId)
  return { id: newId('site'), fixed: true, state: { ...fresh, onboarded: true, settings: { ...fresh.settings, factoryName: name } } }
}

function makeCompany(name: string, sites: Site[], fixed = true): Company {
  return { id: newId('co'), name, sites, activeId: sites[0].id, fixed }
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
  return { version: 2, role: 'engineer', companies: [steel, cement], activeCompanyId: steel.id }
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
          const fixed = item.fixed ?? ['Malaysia Steel Demo Sdn Bhd', 'Malaysia Cement Demo Sdn Bhd'].includes(item.name)
          return { ...item, fixed, sites, activeId: sites.some((site) => site.id === item.activeId) ? item.activeId : sites[0]?.id }
        }).filter((item) => item.sites.length > 0)
        if (companies.length) return { version: 2, role: parsed.role ?? 'engineer', companies, activeCompanyId: companies.some((item) => item.id === parsed.activeCompanyId) ? parsed.activeCompanyId : companies[0].id }
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
export const getRole = (): Role => workspace.role ?? 'engineer'
export const useRole = () => useSyncExternalStore(subscribe, getRole, getRole)

/** Append a history line; repeated edits of the same thing within two minutes collapse into one. */
function logged(next: FactoryState, text: string, key?: string): FactoryState {
  const role = getRole()
  const entry: HistoryEntry & { key?: string } = { at: new Date().toISOString(), who: roleById(role).person, role, text, key }
  const history = (next.history ?? []) as (HistoryEntry & { key?: string })[]
  const last = history.at(-1)
  const recent = last && key && last.key === key && last.role === role && Date.now() - Date.parse(last.at) < 120_000
  return { ...next, history: [...(recent ? history.slice(0, -1) : history), entry].slice(-200) }
}
const actionName = (s: FactoryState, action: PlanAction) => `${measureById(action.measureId)?.name ?? 'Action'} on ${s.machines.find((item) => item.id === action.machineId)?.name ?? 'a machine'}`
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
  /**
   * Create a company from chosen site templates and make it active. Sites start un-set-up, so
   * opening each one walks the user through its machines.
   */
  addCompany: (name: string, sites: { industryId: string; name: string }[]) => {
    if (workspace.companies.filter((item) => !item.fixed).length >= MAX_ADDED_COMPANIES || sites.length === 0) return null
    const created = sites.map((item) => {
      const fresh = freshState(item.industryId)
      return { id: newId('site'), fixed: false, state: { ...fresh, settings: { ...fresh.settings, factoryName: item.name } } }
    })
    const company = makeCompany(name.trim() || 'New company', created, false)
    workspace = { ...workspace, companies: [...workspace.companies, company], activeCompanyId: company.id }
    save()
    return company.id
  },
  removeCompany: (id: string) => {
    const target = workspace.companies.find((item) => item.id === id)
    if (!target || target.fixed || workspace.companies.length <= 1) return
    const companies = workspace.companies.filter((item) => item.id !== id)
    workspace = { ...workspace, companies, activeCompanyId: workspace.activeCompanyId === id ? companies[0].id : workspace.activeCompanyId }
    save()
  },
}

export const actions = {
  replace: (next: FactoryState) => commit(next),
  finishOnboarding: (settings: Settings, machines: Machine[]) => commit({ ...state, onboarded: true, settings, machines, plan: [] }),
  restart: () => commit({ ...freshState(state.settings.industryId), measuredSorbentCapacity: state.measuredSorbentCapacity }),
  updateSettings: (patch: Partial<Settings>) => {
    const fields = Object.keys(patch).filter((key) => JSON.stringify(patch[key as keyof Settings]) !== JSON.stringify(state.settings[key as keyof Settings]))
    const next = { ...state, settings: { ...state.settings, ...patch } }
    commit(fields.length ? logged(next, `Changed settings: ${fields.join(', ')}`, `settings:${fields.join(',')}`) : next)
  },
  updateMachine: (machine: Machine) => {
    const before = state.machines.find((item) => item.id === machine.id)
    const fields = before ? (Object.keys(machine) as (keyof Machine)[]).filter((key) => before[key] !== machine[key] && key !== 'sensorChannel') : []
    const next = { ...state, machines: state.machines.map((item) => item.id === machine.id ? machine : item) }
    commit(fields.length ? logged(next, `Edited ${machine.name}: ${fields.join(', ')}`, `machine:${machine.id}:${fields.join(',')}`) : next)
  },
  addToPlan: (machineId: string, measureId: string, startYear: number) => {
    if (state.plan.some((item) => item.machineId === machineId && item.measureId === measureId)) return
    const action: PlanAction = { id: newId('a'), machineId, measureId, startYear, status: 'proposed', owner: roleById(getRole()).person, comments: [] }
    commit(logged({ ...state, plan: [...state.plan, action] }, `Proposed ${actionName(state, action)}`))
  },
  removeFromPlan: (actionId: string) => {
    const action = state.plan.find((item) => item.id === actionId)
    commit(logged({ ...state, plan: state.plan.filter((item) => item.id !== actionId) }, `Removed ${action ? actionName(state, action) : 'an action'}`))
  },
  /** Remove every action from this site's plan, e.g. to start a demo again. */
  clearPlan: () => commit(logged({ ...state, plan: [] }, `Cleared the plan (${state.plan.length} actions)`)),
  setActionYear: (actionId: string, startYear: number) => commit({ ...state, plan: state.plan.map((item) => item.id === actionId ? { ...item, startYear } : item) }),
  setPlan: (plan: PlanAction[]) => {
    const owner = roleById(getRole()).person
    commit(logged({ ...state, plan: plan.map((item) => ({ status: 'proposed' as ActionStatus, owner, comments: [], ...item })) }, `Copilot proposed a plan of ${plan.length} actions`))
  },
  updateAction: (actionId: string, patch: Partial<PlanAction>) => {
    const action = state.plan.find((item) => item.id === actionId)
    if (!action) return
    const fields = Object.keys(patch).join(', ')
    commit(logged({ ...state, plan: state.plan.map((item) => item.id === actionId ? { ...item, ...patch } : item) }, `Updated ${actionName(state, action)}: ${fields}`, `action:${actionId}:${fields}`))
  },
  setActionStatus: (actionId: string, status: ActionStatus, note?: string) => {
    const action = state.plan.find((item) => item.id === actionId)
    if (!action) return
    const role = getRole()
    const comments = note?.trim() ? [...(action.comments ?? []), { at: new Date().toISOString(), who: roleById(role).person, role, text: note.trim() }] : action.comments
    commit(logged({ ...state, plan: state.plan.map((item) => item.id === actionId ? { ...item, status, comments } : item) }, `${statusInfo[status].label}: ${actionName(state, action)}${note?.trim() ? ` — “${note.trim()}”` : ''}`))
  },
  addComment: (actionId: string, text: string) => {
    const action = state.plan.find((item) => item.id === actionId)
    if (!action || !text.trim()) return
    const role = getRole()
    const comment = { at: new Date().toISOString(), who: roleById(role).person, role, text: text.trim() }
    commit(logged({ ...state, plan: state.plan.map((item) => item.id === actionId ? { ...item, comments: [...(item.comments ?? []), comment] } : item) }, `Commented on ${actionName(state, action)}: “${text.trim()}”`))
  },
  setRole: (role: Role) => { workspace = { ...workspace, role }; save() },
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
