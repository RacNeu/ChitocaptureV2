import type { ActionHubState, Asset, PlanSettings, ProjectComment, ProjectStatus, ReductionProject } from '../types/actionHub'
import { getMeasure } from './measureLibrary'

const STORAGE_KEY = 'chitocapture.action-hub.v1'

const DEMO_KILN_SITE = 'c7e8d4f6-8892-4626-a3d4-3dacd3d1b898'
const DEMO_OFFICE_SITE = '2a79b5f4-ea49-409a-8dbe-ad92ba5f0d98'

/**
 * Illustrative demo values only. Factors and prices must be replaced with
 * verified, site-specific values before any decision is made.
 */
export const demoSettings: PlanSettings = {
  gridFactorKgPerKWh: 0.74,
  fuelFactorKgPerGJ: 94.6,
  electricityPriceMYRPerMWh: 450,
  fuelPriceMYRPerGJ: 20,
  discountRatePct: 8,
  carbonPriceMYRPerT: 150,
  baselineYear: 2026,
  targetYear: 2030,
  targetReductionPct: 25,
}

const demoAssets: Asset[] = [
  { assetId: 'asset-kiln-1', siteId: DEMO_KILN_SITE, name: 'Kiln line 1', type: 'Kiln / furnace', electricityMWh: 0, fuelGJ: 3_000_000, processTCO2: 520_000, ownerEngineer: 'Process engineering', meterStatus: 'Sub-metered' },
  { assetId: 'asset-raw-mill', siteId: DEMO_KILN_SITE, name: 'Raw mill', type: 'Mill / grinder', electricityMWh: 25_000, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Mechanical engineering', meterStatus: 'Sub-metered' },
  { assetId: 'asset-cement-mill', siteId: DEMO_KILN_SITE, name: 'Cement mill', type: 'Mill / grinder', electricityMWh: 40_000, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Mechanical engineering', meterStatus: 'Sub-metered' },
  { assetId: 'asset-id-fan', siteId: DEMO_KILN_SITE, name: 'Kiln ID fan', type: 'Fan / blower', electricityMWh: 12_000, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Electrical engineering', meterStatus: 'Metered' },
  { assetId: 'asset-cooler-fans', siteId: DEMO_KILN_SITE, name: 'Clinker cooler fans', type: 'Fan / blower', electricityMWh: 6_000, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Electrical engineering', meterStatus: 'Estimated' },
  { assetId: 'asset-compressors', siteId: DEMO_KILN_SITE, name: 'Compressed-air station', type: 'Air compressor', electricityMWh: 4_000, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Utilities', meterStatus: 'Metered' },
  { assetId: 'asset-office', siteId: DEMO_OFFICE_SITE, name: 'Head office building', type: 'Building', electricityMWh: 800, fuelGJ: 0, processTCO2: 0, ownerEngineer: 'Facilities', meterStatus: 'Metered' },
]

function projectFromMeasure(projectId: string, asset: Asset, measureId: string, settings: PlanSettings, extra: Partial<ReductionProject>): ReductionProject {
  const measure = getMeasure(measureId)
  const estimate = measure?.estimate(asset, settings)
  return {
    projectId,
    assetId: asset.assetId,
    measureId,
    title: `${measure?.name ?? 'Custom measure'} – ${asset.name}`,
    status: 'Idea',
    ownerEngineer: asset.ownerEngineer,
    sustainabilitySponsor: 'Sustainability team',
    electricitySavedMWh: estimate?.electricitySavedMWh ?? 0,
    fuelSavedGJ: estimate?.fuelSavedGJ ?? 0,
    directTCO2: estimate?.directTCO2 ?? 0,
    addedElectricityMWh: estimate?.addedElectricityMWh ?? 0,
    addedFuelGJ: estimate?.addedFuelGJ ?? 0,
    capexMYR: estimate?.capexMYR ?? 0,
    annualOpexChangeMYR: estimate?.annualOpexChangeMYR ?? 0,
    lifetimeYears: estimate?.lifetimeYears ?? 10,
    targetDate: '2027-12',
    comments: [],
    ...extra,
  }
}

function buildDemoState(): ActionHubState {
  const asset = (id: string) => demoAssets.find((item) => item.assetId === id)!
  const at = '2026-10-01T09:00:00.000Z'
  const projects: ReductionProject[] = [
    projectFromMeasure('proj-vsd-id-fan', asset('asset-id-fan'), 'vsd', demoSettings, {
      status: 'Verified', targetDate: '2026-06', measuredNetTCO2: 1_650,
      verificationNote: 'Demo: 12 weeks of post-installation sub-meter data compared with a production-normalised baseline.',
      comments: [
        { at, author: 'Electrical engineering', role: 'Engineering', text: 'Drive commissioned. Damper locked fully open.' },
        { at, author: 'Sustainability team', role: 'Sustainability', text: 'Verified against the metered baseline. Slightly below the estimate because of higher summer load.' },
      ],
    }),
    projectFromMeasure('proj-air-leaks', asset('asset-compressors'), 'compressed-air', demoSettings, {
      status: 'In progress', targetDate: '2026-12',
      comments: [{ at, author: 'Utilities', role: 'Engineering', text: 'Leak survey tagged 63 leaks. Repairs are 40% complete.' }],
    }),
    projectFromMeasure('proj-kiln-tuning', asset('asset-kiln-1'), 'combustion-tuning', demoSettings, { status: 'Approved', targetDate: '2027-03' }),
    projectFromMeasure('proj-clinker', asset('asset-kiln-1'), 'clinker-substitution', demoSettings, {
      status: 'Assessed', targetDate: '2027-09',
      comments: [{ at, author: 'Sustainability team', role: 'Sustainability', text: 'Largest single lever. Needs a product-quality trial plan before approval.' }],
    }),
    projectFromMeasure('proj-whr', asset('asset-kiln-1'), 'whr-power', demoSettings, { status: 'Idea', targetDate: '2028-06' }),
    projectFromMeasure('proj-capture-pilot', asset('asset-kiln-1'), 'sorbent-capture-pilot', demoSettings, {
      status: 'Idea', targetDate: '2028-12',
      comments: [{ at, author: 'Process engineering', role: 'Engineering', text: 'Bench rig planned to measure the real sorbent capacity before sizing.' }],
    }),
  ]
  return { settings: { ...demoSettings }, assets: demoAssets.map((item) => ({ ...item })), projects }
}

function readState(): ActionHubState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<ActionHubState>
      if (Array.isArray(parsed.assets) && Array.isArray(parsed.projects)) {
        return {
          settings: { ...demoSettings, ...parsed.settings },
          assets: parsed.assets,
          projects: parsed.projects.map((project) => ({ ...project, comments: Array.isArray(project.comments) ? project.comments : [] })),
        }
      }
    }
  } catch { /* Fall back to the demo plan when storage is unavailable or corrupt. */ }
  return buildDemoState()
}

let state = readState()
let revision = 0
const listeners = new Set<() => void>()

function commit(next: ActionHubState) {
  state = next
  revision += 1
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* Storage may be unavailable in private browsing. */ }
  listeners.forEach((listener) => listener())
}

const newId = (prefix: string) => `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`

export function getActionHubState() { return state }
export function getActionHubRevision() { return revision }
export function subscribeToActionHub(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }

export function updateSettings(settings: Partial<PlanSettings>) { commit({ ...state, settings: { ...state.settings, ...settings } }) }

export function addAsset(asset: Omit<Asset, 'assetId'>) {
  const created = { ...asset, assetId: newId('asset') }
  commit({ ...state, assets: [...state.assets, created] })
  return created
}
export function updateAsset(asset: Asset) { commit({ ...state, assets: state.assets.map((item) => item.assetId === asset.assetId ? { ...asset } : item) }) }
export function removeAsset(assetId: string) {
  commit({ ...state, assets: state.assets.filter((item) => item.assetId !== assetId), projects: state.projects.filter((project) => project.assetId !== assetId) })
}

export function createProjectFromMeasure(assetId: string, measureId: string, sponsor = 'Sustainability team') {
  const asset = state.assets.find((item) => item.assetId === assetId)
  if (!asset) return undefined
  const project = projectFromMeasure(newId('proj'), asset, measureId, state.settings, { sustainabilitySponsor: sponsor })
  commit({ ...state, projects: [...state.projects, project] })
  return project
}
export function updateProject(project: ReductionProject) { commit({ ...state, projects: state.projects.map((item) => item.projectId === project.projectId ? { ...project } : item) }) }
export function removeProject(projectId: string) { commit({ ...state, projects: state.projects.filter((item) => item.projectId !== projectId) }) }

export function moveProject(projectId: string, status: ProjectStatus, comment: Omit<ProjectComment, 'at'>) {
  commit({
    ...state,
    projects: state.projects.map((item) => item.projectId === projectId
      ? { ...item, status, comments: [...item.comments, { ...comment, at: new Date().toISOString() }] }
      : item),
  })
}

export function addProjectComment(projectId: string, comment: Omit<ProjectComment, 'at'>) {
  commit({ ...state, projects: state.projects.map((item) => item.projectId === projectId ? { ...item, comments: [...item.comments, { ...comment, at: new Date().toISOString() }] } : item) })
}

export function resetActionHubDemo() { commit(buildDemoState()) }
