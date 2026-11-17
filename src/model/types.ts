export type MachineKind =
  | 'kiln' | 'boiler' | 'furnace' | 'mill' | 'fan' | 'pump' | 'compressor' | 'chiller'
  | 'production-line' | 'genset' | 'wastewater' | 'cold-room' | 'office'

export type FuelType = 'none' | 'coal' | 'natural-gas' | 'diesel' | 'fuel-oil' | 'biomass'

export type DataQuality = 'metered' | 'estimated'

/** One machine or area on the factory floor. All figures are per year. */
export type Machine = {
  id: string
  name: string
  kind: MachineKind
  electricityMWh: number
  fuel: FuelType
  fuelGJ: number
  /** Non-energy emissions in t CO₂e, e.g. cement calcination or methane from wastewater ponds. */
  processT: number
  quality: DataQuality
  /** Grid position on the floor map. */
  col: number
  row: number
  /** Sensor channel shown on this machine, if any. */
  sensorChannel?: SensorChannel
  /** Plain-language description of what this equipment does. */
  role?: string
  /** Process area, e.g. "Melt shop", used to group machines. */
  area?: string
  /** Linked unit in the live steel control room, if any. */
  unitId?: string
  /** Energy-intensity target per tonne of product: kWh/t for electric machines, GJ/t for fuel-fired ones. */
  targetPerT?: number
}

export type SensorChannel = 'co2' | 'co2_in' | 'co2_out'

export type GridRegion = { id: string; label: string; kgPerKWh: number; note: string }

export type Settings = {
  factoryName: string
  industryId: string
  gridRegionId: string
  /** Malaysian state or federal territory (sets the grid region). */
  stateId?: string
  /** Industrial park or area, e.g. "Prai Industrial Estate". */
  industrialPark?: string
  /** Used when gridRegionId is 'custom'. */
  customGridKgPerKWh: number
  /**
   * Market-based Scope 2 factor for grid electricity not covered by a green instrument. Malaysia has
   * no published residual mix, so the location-based grid factor is used when this is absent.
   */
  residualKgPerKWh?: number
  electricityPriceRMPerMWh: number
  fuelPriceRMPerGJ: Record<Exclude<FuelType, 'none'>, number>
  discountRatePct: number
  baselineYear: number
  targetYear: number
  targetReductionPct: number
  /** Annual production, used for per-tonne intensities and targets. Null when unknown. */
  productionTPerYear: number | null
  /** What a tonne refers to, e.g. "steel" or "wire". */
  productUnit: string
  /** Tariff for demand and idle-energy costs; TNB medium-voltage defaults apply when absent. */
  tariff?: { mdRMPerKW: number; energyRMPerMWh: number }
  /** Carbon tax calculator inputs; defaults apply when absent. */
  carbonTax?: import('./carbonTax').TaxInputs
}

/** A measure applied to a machine, with its start year. */
export type Role = 'engineer' | 'sustainability' | 'management'

/** Proposed → Approved → In progress → Done → Verified (or Rejected). */
export type ActionStatus = 'proposed' | 'approved' | 'in-progress' | 'done' | 'verified' | 'rejected'

export type Comment = { at: string; who: string; role: Role; text: string }

export type PlanAction = {
  id: string
  machineId: string
  measureId: string
  startYear: number
  status?: ActionStatus
  owner?: string
  dueDate?: string
  /** Saving measured after the work, t CO₂e per year (entered when marking Done). */
  measuredT?: number
  comments?: Comment[]
  /** Size for measures that come in sizes, e.g. 0.3 = 30% green electricity; the measure's default if absent. */
  scale?: number
  /** Where the action came from, e.g. 'sandbox' when it was added from a simulation scenario. */
  source?: string
}

export type HistoryEntry = { at: string; who: string; role: Role; text: string }

export type FactoryState = {
  version: 3
  onboarded: boolean
  settings: Settings
  machines: Machine[]
  plan: PlanAction[]
  /** Who changed what on this site, newest last. */
  history?: HistoryEntry[]
  /** Monthly activity history uploaded from bills and meters, oldest first. */
  monthly?: MonthlyRecord[]
  /** Half-hourly electricity demand (the meter's load profile). */
  interval?: IntervalSeries
  /** What the team has done with each finding, by finding key. */
  findings?: Record<string, FindingState>
  /** Field-level changes to the monthly data, oldest first. */
  monthlyLog?: DataChange[]
  /** Signed-off reporting years. */
  locks?: PeriodLock[]
}

/** Half-hourly average demand in kW from `start` (local time, YYYY-MM-DDTHH:mm); null = missing. */
export type IntervalSeries = { start: string; kW: (number | null)[]; source: string }

export type FindingStatus = 'new' | 'assigned' | 'in-progress' | 'fixed' | 'dismissed'
export type FindingState = { status: FindingStatus; owner?: string; note?: string; updatedAt: string }

/** One month of activity data for a site, e.g. from TNB bills, fuel invoices and production logs. */
export type MonthlyRecord = {
  /** Month as YYYY-MM. */
  month: string
  electricityMWh: number
  /** Fuel burnt on site in GJ, by fuel. */
  fuelGJ: Partial<Record<Exclude<FuelType, 'none'>, number>>
  /** Non-energy (process) CO₂e in tonnes, e.g. EAF electrodes and charge carbon. */
  processT: number
  /** Product made that month, in tonnes. */
  productionT: number
  /**
   * Purchased electricity covered by a contractual green instrument (TNB Green Electricity Tariff,
   * RECs, a green PPA or CRESS), in MWh. Counts as zero emissions in market-based Scope 2.
   */
  greenMWh?: number
  /** Source documents behind this month's figures (bills, invoices, production logs). */
  evidence?: Evidence[]
}

/** A document that backs a month's figures. The file stays with the company; its fingerprint proves which file. */
export type Evidence = {
  name: string
  sizeBytes: number
  /** SHA-256 of the file, hex. */
  sha256: string
  kind: 'electricity' | 'fuel' | 'production' | 'green' | 'other'
  /** Invoice or account number, optional. */
  ref?: string
  at: string
  who: string
}

/** One field of one month changed: the audit trail behind the reported numbers. */
export type DataChange = { at: string; who: string; role: Role; month: string; field: string; from: number | null; to: number | null; source: string }

/** A signed-off reporting year: its months can no longer be changed until management unlocks it. */
export type PeriodLock = {
  year: number
  at: string
  who: string
  role: Role
  /** Factors and results at sign-off, so later changes to Settings are visible. */
  gridKgPerKWh: number
  marketKgPerKWh: number
  scope1T: number
  scope2T: number
  scope2MarketT: number
  evidencePct: number
}

/** Per-year effect of a measure on one machine. Positive numbers are reductions. */
export type MeasureEffect = {
  electricitySavedMWh: number
  fuelSavedGJ: number
  directT: number
  addedElectricityMWh: number
  capexRM: number
  opexChangeRM: number
  lifetimeYears: number
}

export type Measure = {
  id: string
  name: string
  short: string
  category: 'Efficiency' | 'Heat recovery' | 'Renewables' | 'Fuel switch' | 'Process' | 'Methane capture'
  appliesTo: readonly MachineKind[]
  /** Steel-process measures only offered on these control-room units (see steelUnitMeasures). */
  steelOnly?: boolean
  /** Plain-language explanation for non-engineers. */
  explain: string
  /** What an engineer must confirm before relying on the estimate. */
  checks: readonly string[]
  /** How the indicative estimate is built. */
  basis: string
  /** scale: an optional size for measures that come in sizes (green share, capture share). */
  estimate: (machine: Machine, ctx: EstimateContext, scale?: number) => MeasureEffect | null
  /** Wire-plant measures: the galvanising-plant unit this measure belongs to. */
  galvUnit?: string
}

export type EstimateContext = {
  /** Calibrated wire-plant model for wire & galvanising sites, used by the wire-plant measures. */
  galvParams?: import('./galv').GalvParams
  gridKgPerKWh: number
  fuelKgPerGJ: (fuel: FuelType) => number
  electricityPriceRMPerMWh: number
  fuelPriceRMPerGJ: (fuel: FuelType) => number
}
