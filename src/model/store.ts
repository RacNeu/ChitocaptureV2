import { useSyncExternalStore } from 'react'
import { templateById } from './templates'
import type { ActionStatus, DataChange, Evidence, FactoryState, FindingState, HistoryEntry, IntervalSeries, Machine, MonthlyRecord, PlanAction, Role, Settings } from './types'
import { diffRecords, evidenceShare, marketFactor, scopesFor } from './history'
import { gridFactor } from './factors'
import { roleById, statusInfo } from './roles'
import { calibrate } from './calibration'
import { measureById } from './measures'
import { sampleLocations } from './malaysia'

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
  return { version: 3, onboarded: false, settings: { ...defaultSettings, industryId, ...productionFor(industryId) }, machines: machinesFromTemplate(industryId), plan: [] }
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
  const where = sampleLocations[industryId]
  return { id: newId('site'), fixed: true, state: { ...fresh, onboarded: true, settings: { ...fresh.settings, factoryName: name, ...(where ? { stateId: where.stateId, industrialPark: where.park } : {}) } } }
}

function makeCompany(name: string, sites: Site[], fixed = true): Company {
  return { id: newId('co'), name, sites, activeId: sites[0].id, fixed }
}

/** The sample customer: a steel group with a mill, a downstream wire plant and a head office. */
export function defaultWorkspace(): Workspace {
  const steel = makeCompany('Malaysia Steel Demo Sdn Bhd', [
    siteFromTemplate('steel', 'Steel mini-mill'),
    siteFromTemplate('steel-downstream', 'Wire & galvanising plant'),
    siteFromTemplate('office', 'Head office'),
  ])
  return { version: 2, role: 'engineer', companies: [steel], activeCompanyId: steel.id }
}

/** Match the machine list to the bills, when there are bills. */
function matched(next: FactoryState): FactoryState {
  const result = calibrate(next.machines, next.monthly ?? [], next.settings, newId)
  return result ? { ...next, machines: result.machines, calibration: result.calibration, settings: { ...next.settings, productionTPerYear: result.productionTPerYear } } : next
}

function normalise(parsed: FactoryState): FactoryState {
  const industryId = parsed.settings?.industryId ?? defaultSettings.industryId
  const production = 'productionTPerYear' in (parsed.settings ?? {}) ? {} : productionFor(industryId)
  const out: FactoryState = { ...parsed, machines: enrich(parsed.machines, industryId), settings: { ...defaultSettings, ...production, ...parsed.settings, fuelPriceRMPerGJ: { ...defaultSettings.fuelPriceRMPerGJ, ...parsed.settings?.fuelPriceRMPerGJ } }, plan: parsed.plan ?? [] }
  // Saves from before calibration existed: match them once on load.
  return out.monthly?.length && !out.calibration ? matched(out) : out
}

/**
 * Saves from the arc-furnace era (before Nov 2026): the sample mill moved to the induction route.
 * An untouched sample mill (no bills) is rebuilt from the induction template, with plan items carried
 * over by unit; any other site keeps its own numbers with the unit renamed.
 */
const oldMeasures: Record<string, string> = { 'eaf-optimisation': 'if-practice', 'scrap-preheat': 'igbt-supply' }
function toInduction(state: FactoryState, sample: boolean): FactoryState {
  const unitOf = (m: Machine) => m.unitId as string | undefined
  const old = state.machines.some((m) => unitOf(m) === 'eaf' || unitOf(m) === 'oxygen')
  if (!old && !state.plan.some((item) => oldMeasures[item.measureId])) return state
  const remap = <T extends { measureId: string }>(item: T): T => ({ ...item, measureId: oldMeasures[item.measureId] ?? item.measureId })
  if (old && sample && state.settings.industryId === 'steel' && !state.monthly?.length) {
    const fresh = machinesFromTemplate('steel')
    const byUnit = new Map(fresh.filter((m) => m.unitId).map((m) => [m.unitId as string, m.id]))
    const unitBefore = new Map(state.machines.map((m) => [m.id, unitOf(m) === 'eaf' ? 'melt' : unitOf(m)]))
    const plan = state.plan.flatMap((item) => { const unit = unitBefore.get(item.machineId); const id = unit ? byUnit.get(unit) : undefined; return id ? [remap({ ...item, machineId: id })] : [] })
    return { ...state, machines: fresh, plan, settings: { ...state.settings, ...productionFor('steel') } }
  }
  const machines = state.machines.map((m) => unitOf(m) === 'eaf' ? { ...m, unitId: 'melt' as Machine['unitId'] } : unitOf(m) === 'oxygen' ? { ...m, unitId: undefined } : m)
  return { ...state, machines, plan: state.plan.map(remap) }
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Workspace
      if (parsed.version === 2 && Array.isArray(parsed.companies)) {
        const companies = parsed.companies.map((item) => {
          // Older saves have no `fixed` flag: treat the sample sites (by industry) as fixed.
          const sampleIndustries = ['steel', 'steel-downstream', 'office']
          const legacy = (item.sites ?? []).every((site) => site.fixed === undefined)
          // Sites of industries the app no longer offers (e.g. cement) are dropped.
          const sites = (item.sites ?? []).filter((site) => site.state?.version === 3 && Array.isArray(site.state.machines) && templateById(site.state.settings?.industryId ?? 'steel'))
            .map((site, index) => ({ ...site, fixed: legacy ? index < 3 && sampleIndustries.includes(site.state.settings?.industryId) : site.fixed, state: normalise(site.state) }))
            .map((site) => ({ ...site, state: toInduction(site.state, !!site.fixed) }))
            .map((site) => {
              // Sample sites saved before locations existed get their sample location.
              const where = site.fixed ? sampleLocations[site.state.settings.industryId] : undefined
              return where && !site.state.settings.stateId ? { ...site, state: { ...site.state, settings: { ...site.state.settings, stateId: where.stateId, industrialPark: where.park } } } : site
            })
          const fixed = item.fixed ?? item.name === 'Malaysia Steel Demo Sdn Bhd'
          return { ...item, fixed, sites, activeId: sites.some((site) => site.id === item.activeId) ? item.activeId : sites[0]?.id }
        }).filter((item) => item.sites.length > 0 && item.name !== 'Malaysia Cement Demo Sdn Bhd')
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
  restart: () => commit({ ...freshState(state.settings.industryId), monthly: state.monthly, monthlyLog: state.monthlyLog, locks: state.locks }),
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
  /**
   * Add a simulation scenario to the plan as proposed actions. An action already in the plan for the
   * same machine and measure keeps its status; only its size (scale) is updated.
   */
  addScenario: (items: { machineId: string; measureId: string; scale?: number }[], label: string) => {
    let added = 0, updated = 0
    let plan = state.plan
    for (const item of items) {
      const existing = plan.find((action) => action.machineId === item.machineId && action.measureId === item.measureId)
      if (existing) {
        if (existing.scale !== item.scale) { plan = plan.map((action) => action === existing ? { ...action, scale: item.scale } : action); updated += 1 }
        continue
      }
      plan = [...plan, { id: newId('a'), machineId: item.machineId, measureId: item.measureId, startYear: state.settings.baselineYear + 1, status: 'proposed', owner: roleById(getRole()).person, comments: [], source: 'sandbox', ...(item.scale !== undefined ? { scale: item.scale } : {}) }]
      added += 1
    }
    if (added || updated) commit(logged({ ...state, plan }, `Added the ${label} scenario to the plan (${added} new, ${updated} updated)`))
    return { added, updated }
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
  /**
   * Replace this site's uploaded monthly history (bills, fuel and production). Months in a signed-off
   * year are kept as they were; evidence already attached to a month stays with it. Every changed
   * field is written to the monthly change log. Returns the months that were kept because they are locked.
   */
  setMonthly: (monthly: MonthlyRecord[], source = 'File upload'): string[] => {
    const before = state.monthly ?? []
    const locked = new Set((state.locks ?? []).map((lock) => lock.year))
    const isLocked = (month: string) => locked.has(Number(month.slice(0, 4)))
    const kept = before.filter((r) => isLocked(r.month))
    const skipped = monthly.filter((r) => isLocked(r.month)).map((r) => r.month)
    const evidence = new Map(before.map((r) => [r.month, r.evidence]))
    const incoming = monthly.filter((r) => !isLocked(r.month)).map((r) => ({ ...r, evidence: r.evidence ?? evidence.get(r.month) }))
    const next = [...kept, ...incoming].sort((a, b) => a.month.localeCompare(b.month))
    const role = getRole(), who = roleById(role).person, at = new Date().toISOString()
    const changes: DataChange[] = diffRecords(before, next).map((change) => ({ ...change, at, who, role, source }))
    const calibrated = matched({ ...state, monthly: next })
    commit(logged({ ...calibrated, monthlyLog: [...(state.monthlyLog ?? []), ...changes].slice(-5_000) },
      next.length ? `${source}: ${incoming.length} months of activity data (${changes.length} field changes${skipped.length ? `, ${skipped.length} locked months kept` : ''})` : 'Cleared the monthly data'))
    return skipped
  },
  /** Save the planner's scenarios and which one is open. */
  setScenarios: (scenarios: NonNullable<FactoryState['scenarios']>, activeScenarioId?: string) => commit({ ...state, scenarios, activeScenarioId }),
  /** Re-match the machine list to the bills (after machines were edited). */
  rematch: () => commit(logged(matched(state), 'Matched the machine list to the bills')),
  /** Attach a source document to a month. Not allowed in a signed-off year. */
  attachEvidence: (month: string, evidence: Evidence) => {
    if ((state.locks ?? []).some((lock) => lock.year === Number(month.slice(0, 4)))) return false
    const monthly = (state.monthly ?? []).map((r) => r.month === month ? { ...r, evidence: [...(r.evidence ?? []).filter((e) => e.sha256 !== evidence.sha256), evidence] } : r)
    commit(logged({ ...state, monthly }, `Attached ${evidence.name} to ${month}`))
    return true
  },
  removeEvidence: (month: string, sha256: string) => {
    if ((state.locks ?? []).some((lock) => lock.year === Number(month.slice(0, 4)))) return
    const name = state.monthly?.find((r) => r.month === month)?.evidence?.find((e) => e.sha256 === sha256)?.name ?? 'a document'
    commit(logged({ ...state, monthly: (state.monthly ?? []).map((r) => r.month === month ? { ...r, evidence: r.evidence?.filter((e) => e.sha256 !== sha256) } : r) }, `Removed ${name} from ${month}`))
  },
  /** Sign off a reporting year (sustainability role). Its months are then frozen. */
  lockYear: (year: number) => {
    const role = getRole()
    if (role !== 'sustainability' || (state.locks ?? []).some((lock) => lock.year === year)) return
    const records = (state.monthly ?? []).filter((r) => r.month.startsWith(`${year}-`))
    if (!records.length) return
    const months = records.map((r) => scopesFor(r, state.settings))
    const sum = (key: 'scope1T' | 'scope2T' | 'scope2MarketT') => months.reduce((acc, m) => acc + m[key], 0)
    const lock = { year, at: new Date().toISOString(), who: roleById(role).person, role, gridKgPerKWh: gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh), marketKgPerKWh: marketFactor(state.settings), scope1T: sum('scope1T'), scope2T: sum('scope2T'), scope2MarketT: sum('scope2MarketT'), evidencePct: evidenceShare(records) * 100 }
    commit(logged({ ...state, locks: [...(state.locks ?? []), lock].sort((a, b) => a.year - b.year) }, `Signed off ${year}: Scope 1 ${Math.round(lock.scope1T)} t, Scope 2 ${Math.round(lock.scope2T)} t`))
  },
  /** Reopen a signed-off year (management role), with a reason for the record. */
  unlockYear: (year: number, reason: string) => {
    if (getRole() !== 'management' || !reason.trim()) return
    commit(logged({ ...state, locks: (state.locks ?? []).filter((lock) => lock.year !== year) }, `Reopened ${year} — “${reason.trim()}”`))
  },
  /** Replace this site's half-hourly load profile; null removes it. */
  setInterval: (interval: IntervalSeries | null) => commit(logged({ ...state, interval: interval ?? undefined }, interval ? `Uploaded ${Math.round(interval.kW.length / 48)} days of half-hourly data (${interval.source})` : 'Removed the half-hourly data')),
  /** Merge one melt-shop upload (heats, spectrometer or readings) into this site; null clears all uploads. */
  setMeltShop: (patch: Partial<Omit<import('./meltshop').MeltShop, 'demo'>> | null, text: string) => {
    const cur = state.meltshop ?? { heats: [], chem: [], readings: [], source: '' }
    commit(logged({ ...state, meltshop: patch ? { ...cur, ...patch } : undefined, meltshopDemo: patch ? false : state.meltshopDemo }, text))
  },
  /** Show or hide the illustrative demo melt shop. */
  setMeltShopDemo: (on: boolean) => commit(logged({ ...state, meltshopDemo: on }, on ? 'Opened the demo melt shop' : 'Closed the demo melt shop')),
  setClimate: (climate: FactoryState['climate']) => commit(logged({ ...state, climate }, climate ? `Fetched NASA POWER climate data for ${climate.lat.toFixed(3)}, ${climate.lon.toFixed(3)}` : 'Removed climate data')),
  /** Record what the team did with a finding. */
  setFinding: (key: string, patch: Partial<FindingState>, title: string) => {
    const before = state.findings?.[key]
    const next: FindingState = { status: 'new', ...before, ...patch, updatedAt: new Date().toISOString() }
    commit(logged({ ...state, findings: { ...state.findings, [key]: next } }, `Finding “${title}”: ${next.status}${next.owner ? ` (${next.owner})` : ''}`, `finding:${key}`))
  },
}
