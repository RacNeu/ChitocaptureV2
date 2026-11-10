import type { Asset, PlanSettings, ProjectStatus, ReductionProject } from '../types/actionHub'

/**
 * Abatement economics shared by the Action Hub.
 *
 * Conventions:
 * - Grid factor kg CO₂e/kWh is numerically equal to t CO₂e/MWh.
 * - Fuel factor is kg CO₂e/GJ, so t = GJ × factor ÷ 1,000.
 * - Net abatement always subtracts the measure's own energy penalty.
 *   A carbon-capture project that uses more grid electricity than it saves
 *   CO₂ therefore shows a negative net result instead of a gross "captured" figure.
 */

export type ProjectEconomics = {
  grossTCO2: number
  penaltyTCO2: number
  netTCO2: number
  annualEnergyCostChangeMYR: number
  annualisedCapexMYR: number
  annualNetCostMYR: number
  /** MYR per tonne of net CO₂e abated. Null when the project does not abate CO₂e. */
  costPerTonneMYR: number | null
  /** Simple payback in years. Null when the project has no net annual saving. */
  simplePaybackYears: number | null
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0)

export function capitalRecoveryFactor(discountRatePct: number, years: number): number {
  const n = Math.max(1, Math.round(finite(years)))
  const r = Math.max(0, finite(discountRatePct)) / 100
  if (r === 0) return 1 / n
  const growth = (1 + r) ** n
  return r * growth / (growth - 1)
}

export function assetBaselineTCO2(asset: Asset, settings: PlanSettings): number {
  return finite(asset.electricityMWh) * settings.gridFactorKgPerKWh
    + finite(asset.fuelGJ) * settings.fuelFactorKgPerGJ / 1_000
    + finite(asset.processTCO2)
}

export function projectEconomics(project: ReductionProject, settings: PlanSettings): ProjectEconomics {
  const grossTCO2 = finite(project.electricitySavedMWh) * settings.gridFactorKgPerKWh
    + finite(project.fuelSavedGJ) * settings.fuelFactorKgPerGJ / 1_000
    + finite(project.directTCO2)
  const penaltyTCO2 = finite(project.addedElectricityMWh) * settings.gridFactorKgPerKWh
    + finite(project.addedFuelGJ) * settings.fuelFactorKgPerGJ / 1_000
  const netTCO2 = grossTCO2 - penaltyTCO2
  const annualEnergyCostChangeMYR = -(finite(project.electricitySavedMWh) - finite(project.addedElectricityMWh)) * settings.electricityPriceMYRPerMWh
    - (finite(project.fuelSavedGJ) - finite(project.addedFuelGJ)) * settings.fuelPriceMYRPerGJ
  const annualisedCapexMYR = finite(project.capexMYR) * capitalRecoveryFactor(settings.discountRatePct, project.lifetimeYears)
  const annualOperatingChange = finite(project.annualOpexChangeMYR) + annualEnergyCostChangeMYR
  const annualNetCostMYR = annualisedCapexMYR + annualOperatingChange
  const costPerTonneMYR = netTCO2 > 0 ? annualNetCostMYR / netTCO2 : null
  const simplePaybackYears = annualOperatingChange < 0 ? finite(project.capexMYR) / -annualOperatingChange : null
  return { grossTCO2, penaltyTCO2, netTCO2, annualEnergyCostChangeMYR, annualisedCapexMYR, annualNetCostMYR, costPerTonneMYR, simplePaybackYears }
}

/** The tonnes a project contributes to the plan: the measured value once verified, otherwise the engineering estimate. */
export function projectContributionTCO2(project: ReductionProject, settings: PlanSettings): number {
  if (project.status === 'Verified' && Number.isFinite(project.measuredNetTCO2)) return project.measuredNetTCO2!
  return projectEconomics(project, settings).netTCO2
}

export type MaccBar = { projectId: string; title: string; status: ProjectStatus; netTCO2: number; costPerTonneMYR: number; startTCO2: number }

/** Marginal abatement cost curve: projects with positive net abatement, cheapest first. */
export function buildMacc(projects: ReductionProject[], settings: PlanSettings): MaccBar[] {
  const bars = projects
    .filter((project) => project.status !== 'Rejected')
    .map((project) => ({ project, economics: projectEconomics(project, settings) }))
    .filter(({ economics }) => economics.netTCO2 > 0 && economics.costPerTonneMYR !== null)
    .sort((a, b) => a.economics.costPerTonneMYR! - b.economics.costPerTonneMYR! || b.economics.netTCO2 - a.economics.netTCO2)
  let cursor = 0
  return bars.map(({ project, economics }) => {
    const bar = { projectId: project.projectId, title: project.title, status: project.status, netTCO2: economics.netTCO2, costPerTonneMYR: economics.costPerTonneMYR!, startTCO2: cursor }
    cursor += economics.netTCO2
    return bar
  })
}

const committedStatuses: readonly ProjectStatus[] = ['Approved', 'In progress', 'Verifying']
const pipelineStatuses: readonly ProjectStatus[] = ['Idea', 'Assessed']

export type PortfolioSummary = {
  baselineTCO2: number
  targetTCO2: number
  requiredReductionTCO2: number
  verifiedTCO2: number
  committedTCO2: number
  pipelineTCO2: number
  remainingGapTCO2: number
  netCapturePenaltyWarnings: string[]
}

export function portfolioSummary(assets: Asset[], projects: ReductionProject[], settings: PlanSettings): PortfolioSummary {
  const baselineTCO2 = assets.reduce((sum, asset) => sum + assetBaselineTCO2(asset, settings), 0)
  const targetTCO2 = baselineTCO2 * (1 - Math.min(100, Math.max(0, settings.targetReductionPct)) / 100)
  const requiredReductionTCO2 = baselineTCO2 - targetTCO2
  const sumWhere = (statuses: readonly ProjectStatus[]) => projects
    .filter((project) => statuses.includes(project.status))
    .reduce((sum, project) => sum + projectContributionTCO2(project, settings), 0)
  const verifiedTCO2 = sumWhere(['Verified'])
  const committedTCO2 = sumWhere(committedStatuses)
  const pipelineTCO2 = sumWhere(pipelineStatuses)
  const netCapturePenaltyWarnings = projects
    .filter((project) => project.status !== 'Rejected')
    .filter((project) => {
      const economics = projectEconomics(project, settings)
      return economics.penaltyTCO2 > 0 && economics.netTCO2 <= 0
    })
    .map((project) => `${project.title} uses more energy-related CO₂e than it abates at the current grid and fuel factors.`)
  return {
    baselineTCO2,
    targetTCO2,
    requiredReductionTCO2,
    verifiedTCO2,
    committedTCO2,
    pipelineTCO2,
    remainingGapTCO2: Math.max(0, requiredReductionTCO2 - verifiedTCO2 - committedTCO2),
    netCapturePenaltyWarnings,
  }
}

/** Which statuses each role may move a project into. Engineering delivers; sustainability approves and verifies. */
export function allowedTransitions(status: ProjectStatus, role: 'Sustainability' | 'Engineering' | 'Management'): ProjectStatus[] {
  const engineering: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    Idea: ['Assessed'],
    Approved: ['In progress'],
    'In progress': ['Verifying'],
  }
  const sustainability: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    Idea: ['Assessed', 'Rejected'],
    Assessed: ['Approved', 'Rejected'],
    Verifying: ['Verified', 'In progress'],
    Rejected: ['Idea'],
  }
  const management: Partial<Record<ProjectStatus, ProjectStatus[]>> = {
    Assessed: ['Approved', 'Rejected'],
    Rejected: ['Idea'],
  }
  const table = role === 'Engineering' ? engineering : role === 'Sustainability' ? sustainability : management
  return table[status] ?? []
}
