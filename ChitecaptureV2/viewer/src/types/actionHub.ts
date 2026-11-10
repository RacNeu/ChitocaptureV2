export type AssetType = 'Kiln / furnace' | 'Boiler' | 'Fan / blower' | 'Pump' | 'Air compressor' | 'Chiller / HVAC' | 'Mill / grinder' | 'Motor drive' | 'Lighting' | 'Building' | 'Other'

export type MeterStatus = 'Metered' | 'Sub-metered' | 'Estimated'

/** A physical piece of equipment the engineering team owns and can change. */
export type Asset = {
  assetId: string
  siteId: string
  name: string
  type: AssetType
  /** Annual grid electricity use (MWh/yr). */
  electricityMWh: number
  /** Annual on-site fuel use (GJ/yr). */
  fuelGJ: number
  /** Annual direct process CO₂ not from fuel combustion, e.g. calcination (t/yr). */
  processTCO2: number
  ownerEngineer: string
  meterStatus: MeterStatus
}

export type ProjectStatus = 'Idea' | 'Assessed' | 'Approved' | 'In progress' | 'Verifying' | 'Verified' | 'Rejected'

export const projectStatuses: readonly ProjectStatus[] = ['Idea', 'Assessed', 'Approved', 'In progress', 'Verifying', 'Verified', 'Rejected']

export type ProjectComment = { at: string; author: string; role: Role; text: string }

/** A reduction project: the shared object engineers and sustainability leads both work on. */
export type ReductionProject = {
  projectId: string
  assetId: string
  measureId: string
  title: string
  status: ProjectStatus
  ownerEngineer: string
  sustainabilitySponsor: string
  /** Planned annual savings and penalties, entered by engineering. */
  electricitySavedMWh: number
  fuelSavedGJ: number
  /** Direct CO₂ removed or avoided, e.g. capture or clinker substitution (t/yr). */
  directTCO2: number
  /** Extra electricity the measure itself consumes, e.g. capture regeneration or fans (MWh/yr). */
  addedElectricityMWh: number
  /** Extra fuel the measure itself consumes (GJ/yr). */
  addedFuelGJ: number
  capexMYR: number
  /** Annual operating cost change; negative means a saving (MYR/yr). Energy cost savings are calculated separately. */
  annualOpexChangeMYR: number
  lifetimeYears: number
  targetDate: string
  /** Measured net result once implemented (t CO₂e/yr), entered at verification. */
  measuredNetTCO2?: number
  verificationNote?: string
  comments: ProjectComment[]
}

export type Role = 'Sustainability' | 'Engineering' | 'Management'

export type PlanSettings = {
  gridFactorKgPerKWh: number
  fuelFactorKgPerGJ: number
  electricityPriceMYRPerMWh: number
  fuelPriceMYRPerGJ: number
  discountRatePct: number
  /** Indicative internal carbon price used to rank projects (MYR/t CO₂e). */
  carbonPriceMYRPerT: number
  baselineYear: number
  targetYear: number
  targetReductionPct: number
}

export type ActionHubState = {
  settings: PlanSettings
  assets: Asset[]
  projects: ReductionProject[]
}
