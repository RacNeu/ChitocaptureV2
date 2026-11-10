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
}

export type SensorChannel = 'co2' | 'co2_in' | 'co2_out'

export type GridRegion = { id: string; label: string; kgPerKWh: number; note: string }

export type Settings = {
  factoryName: string
  industryId: string
  gridRegionId: string
  /** Used when gridRegionId is 'custom'. */
  customGridKgPerKWh: number
  electricityPriceRMPerMWh: number
  fuelPriceRMPerGJ: Record<Exclude<FuelType, 'none'>, number>
  discountRatePct: number
  baselineYear: number
  targetYear: number
  targetReductionPct: number
}

/** A measure applied to a machine, with its start year. */
export type PlanAction = { id: string; machineId: string; measureId: string; startYear: number }

export type FactoryState = {
  version: 3
  onboarded: boolean
  settings: Settings
  machines: Machine[]
  plan: PlanAction[]
  /** Sorbent capacity measured on the capture rig, in mmol CO₂ per g; null until measured. */
  measuredSorbentCapacity: number | null
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
  category: 'Efficiency' | 'Heat recovery' | 'Renewables' | 'Fuel switch' | 'Process' | 'Methane capture' | 'Carbon capture'
  appliesTo: readonly MachineKind[]
  /** Plain-language explanation for non-engineers. */
  explain: string
  /** What an engineer must confirm before relying on the estimate. */
  checks: readonly string[]
  /** How the indicative estimate is built. */
  basis: string
  estimate: (machine: Machine, ctx: EstimateContext) => MeasureEffect | null
}

export type EstimateContext = {
  gridKgPerKWh: number
  fuelKgPerGJ: (fuel: FuelType) => number
  electricityPriceRMPerMWh: number
  fuelPriceRMPerGJ: (fuel: FuelType) => number
  measuredSorbentCapacity: number | null
}
