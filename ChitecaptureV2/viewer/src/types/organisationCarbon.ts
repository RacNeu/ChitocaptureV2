export type EmissionCategory = 'Electricity' | 'Fuel' | 'Transport' | 'Waste' | 'Industrial Activity' | 'Other'
export type ScopeClassification = 'Scope 1' | 'Scope 2' | 'Scope 3' | 'Unclassified'
export type ActivityDataStatus = 'COMPANY PROVIDED' | 'MEASURED' | 'ESTIMATED' | 'ASSUMED'
export type FactorGas = 'CO2e' | 'CO2' | 'CH4' | 'N2O'

export type Organisation = { organisationId: string; organisationName: string }
export type Site = { siteId: string; organisationId: string; siteName: string; location?: string }
export type ActivityData = {
  activityId: string
  organisationId: string
  siteId: string
  reportingPeriod: string
  category: EmissionCategory
  activityType: string
  activityValue: number
  unit: string
  factorId: string
  scopeClassification: ScopeClassification
  dataStatus: ActivityDataStatus
  industry?: string
  processType?: string
  isPointSource: boolean
  captureCompatible: boolean
  captureSource?: { industry?: string; emissionSource?: string; co2Concentration?: number; flowRate?: number; temperature?: number; pressure?: number }
}
export type EmissionFactor = {
  factorId: string
  activityType: string
  category: EmissionCategory
  factorValue: number
  factorUnit: string
  gasType: FactorGas
  isCO2eFactor: boolean
  geography: string
  year: number | null
  scopeClassification: ScopeClassification
  sourceId: string
  sourceTitle: string
  publisher: string
  sourceURL: string
  validFrom: string
  validTo?: string
  verificationStatus: 'verified' | 'unverified'
  notes: string
}
export type GwpSet = {
  gwpSetId: string
  version: string
  timeHorizon: string
  ch4KgCo2ePerKg: number | null
  n2oKgCo2ePerKg: number | null
  sourceId: string
  sourceTitle: string
  publisher: string
  year: number | null
  sourceURL: string
}
export type SourceRecord = { sourceId: string; title: string; publisher: string; year: number | null; reference: string; sourceURL: string; notes: string }
export type CalculationRecord = {
  recordId: string
  activityId: string
  organisationId: string
  siteId: string
  reportingPeriod: string
  category: EmissionCategory
  activityValue: number
  activityUnit: string
  factorId: string
  factorValue: number
  factorUnit: string
  normalisedActivityValue: number
  normalisedUnit: string
  gasType: FactorGas
  gwpSetId?: string
  calculatedKgCO2e: number
  calculatedTCO2e: number
  scope: ScopeClassification
  dataStatus: ActivityDataStatus
  calculationMethod: string
  calculatedAt: string
  validationStatus: 'valid'
  sourceId: string
}
export type CarbonTarget = { organisationId: string; baselineYear: number; baselineEmissionsT: number; targetYear: number; targetEmissionsT: number; targetType: 'absolute'; createdAt: string }
export type OrganisationCarbonState = {
  organisations: Organisation[]
  sites: Site[]
  activities: ActivityData[]
  factors: EmissionFactor[]
  gwpSets: GwpSet[]
  sources: SourceRecord[]
  inventory: CalculationRecord[]
  targets: CarbonTarget[]
}
export type ActivityCalculation = {
  activity: ActivityData
  factor?: EmissionFactor
  source?: SourceRecord
  normalisedActivityValue?: number
  normalisedUnit?: string
  kgCO2e?: number
  tCO2e?: number
  gwpSetId?: string
  issues: string[]
  warnings: string[]
}
