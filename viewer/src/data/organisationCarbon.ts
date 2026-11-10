import type { ActivityCalculation, ActivityData, CarbonTarget, EmissionCategory, EmissionFactor, FactorGas, GwpSet, OrganisationCarbonState, ScopeClassification, Site, SourceRecord, CalculationRecord } from '../types/organisationCarbon'
import demoOrganisationCarbonData from './demoOrganisationCarbon.json'

const STORAGE_KEY = 'chitocapture.organisation-carbon.v1'
const initial = demoOrganisationCarbonData as OrganisationCarbonState
let state = readState()
let revision = 0
const listeners = new Set<() => void>()
function readState(): OrganisationCarbonState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<OrganisationCarbonState>
      // Visitors who already have an empty prototype registry should also see
      // the shared preview data; any populated browser-local registry remains authoritative.
      const hasSavedRecords = (parsed.activities?.length ?? 0) > 0
        || (parsed.inventory?.length ?? 0) > 0
        || (parsed.factors?.length ?? 0) > 0
        || (parsed.gwpSets?.length ?? 0) > 0
      if (!hasSavedRecords) return structuredClone(initial)
      const factors = Array.isArray(parsed.factors) ? parsed.factors.map((raw) => {
        // Earlier calculator versions stored the gas as `gas` or omitted it.
        // Normalize those records on load so old browser data remains usable.
        const legacy = raw as EmissionFactor & { gas?: string }
        const factorUnit = typeof legacy.factorUnit === 'string' ? legacy.factorUnit : ''
        const numerator = factorUnit.split('/')[0]?.toLowerCase() ?? ''
        const gasType: FactorGas = ['CO2e', 'CO2', 'CH4', 'N2O'].includes(legacy.gasType) ? legacy.gasType
          : ['CO2e', 'CO2', 'CH4', 'N2O'].includes(legacy.gas ?? '') ? legacy.gas as FactorGas
            : numerator.includes('ch4') ? 'CH4' : numerator.includes('n2o') ? 'N2O' : numerator.includes('co2') ? 'CO2' : 'CO2e'
        const isCO2eFactor = typeof legacy.isCO2eFactor === 'boolean' ? legacy.isCO2eFactor : gasType === 'CO2e'
        return {
          ...legacy,
          factorId: typeof legacy.factorId === 'string' ? legacy.factorId : crypto.randomUUID(),
          activityType: typeof legacy.activityType === 'string' ? legacy.activityType : '',
          category: legacy.category ?? 'Other',
          factorValue: Number.isFinite(legacy.factorValue) ? legacy.factorValue : 0,
          factorUnit,
          gasType,
          isCO2eFactor,
          geography: typeof legacy.geography === 'string' ? legacy.geography : '',
          year: Number.isFinite(legacy.year) ? legacy.year : null,
          scopeClassification: legacy.scopeClassification ?? 'Unclassified',
          sourceId: typeof legacy.sourceId === 'string' ? legacy.sourceId : '',
          sourceTitle: typeof legacy.sourceTitle === 'string' ? legacy.sourceTitle : '',
          publisher: typeof legacy.publisher === 'string' ? legacy.publisher : '',
          sourceURL: typeof legacy.sourceURL === 'string' ? legacy.sourceURL : '',
          validFrom: typeof legacy.validFrom === 'string' ? legacy.validFrom : '',
          verificationStatus: legacy.verificationStatus === 'verified' ? 'verified' as const : 'unverified' as const,
          notes: typeof legacy.notes === 'string' ? legacy.notes : '',
        }
      }) : []
      const sources = Array.isArray(parsed.sources) ? parsed.sources.map((source) => ({
        ...source,
        sourceId: typeof source?.sourceId === 'string' ? source.sourceId : '',
        title: typeof source?.title === 'string' ? source.title : 'SOURCE TO BE VERIFIED',
        publisher: typeof source?.publisher === 'string' ? source.publisher : 'Not supplied',
        year: Number.isFinite(source?.year) ? source.year : null,
        reference: typeof source?.reference === 'string' ? source.reference : '',
        sourceURL: typeof source?.sourceURL === 'string' ? source.sourceURL : '',
        notes: typeof source?.notes === 'string' ? source.notes : '',
      })) : []
      return {
        ...initial,
        ...parsed,
        organisations: Array.isArray(parsed.organisations) ? parsed.organisations : initial.organisations,
        sites: Array.isArray(parsed.sites) ? parsed.sites : initial.sites,
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        factors,
        gwpSets: Array.isArray(parsed.gwpSets) ? parsed.gwpSets : [],
        sources,
        inventory: Array.isArray(parsed.inventory) ? parsed.inventory : [],
        targets: Array.isArray(parsed.targets) ? parsed.targets.map((target) => ({
          ...target,
          organisationId: target.organisationId || parsed.organisations?.[0]?.organisationId || initial.organisations[0].organisationId,
          targetType: 'absolute' as const,
          createdAt: typeof target.createdAt === 'string' ? target.createdAt : '',
        })) : [],
      }
    }
  } catch { /* Fall back to the bundled shared demo registry when storage is unavailable. */ }
  return structuredClone(initial)
}
function commit(next: OrganisationCarbonState) {
  state = next
  revision += 1
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch { /* The current tab still uses the in-memory state. */ }
  listeners.forEach((listener) => listener())
}
export function getOrganisationCarbonRevision() { return revision }
export function getOrganisationCarbonState() { return state }
export function getSource(sourceId: string) { return state.sources.find((item) => item.sourceId === sourceId) }
export function getEmissionFactor(factorId: string) { return state.factors.find((item) => item.factorId === factorId) }
export function subscribeToOrganisationCarbon(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) }
export function createActivityDraft(category: EmissionCategory, organisationId = state.organisations[0]?.organisationId ?? '', siteId = state.sites[0]?.siteId ?? '', reportingPeriod = new Date().toISOString().slice(0, 7)): ActivityData {
  return { activityId: crypto.randomUUID(), organisationId, siteId, reportingPeriod, category, activityType: '', activityValue: 0, unit: 'kWh', factorId: '', scopeClassification: 'Unclassified', dataStatus: 'COMPANY PROVIDED', isPointSource: false, captureCompatible: false }
}
export function addActivity(activity: ActivityData) { commit({ ...state, activities: [...state.activities, { ...activity }] }) }
export function updateActivity(activity: ActivityData) { commit({ ...state, activities: state.activities.map((item) => item.activityId === activity.activityId ? { ...activity } : item), inventory: state.inventory.filter((item) => item.activityId !== activity.activityId) }) }
export function removeActivity(activityId: string) { commit({ ...state, activities: state.activities.filter((item) => item.activityId !== activityId), inventory: state.inventory.filter((item) => item.activityId !== activityId) }) }
function sourceForFactor(factor: EmissionFactor): SourceRecord | undefined {
  const id = factor.sourceId.trim()
  if (!id) return undefined
  return { sourceId: id, title: factor.sourceTitle || 'SOURCE TO BE VERIFIED', publisher: factor.publisher || 'Not supplied', year: factor.year, reference: factor.notes, sourceURL: factor.sourceURL, notes: factor.verificationStatus === 'verified' ? 'Factor source entered by the organisation; verification status is user supplied.' : 'Placeholder source. Verify before use in a valid inventory.' }
}
export function addEmissionFactor(factor: Omit<EmissionFactor, 'factorId'>) {
  const normalized = { ...factor, factorId: crypto.randomUUID() }
  const source = sourceForFactor(normalized)
  commit({ ...state, factors: [...state.factors, normalized], sources: source ? [...state.sources.filter((item) => item.sourceId !== source.sourceId), source] : state.sources })
}
export function updateEmissionFactor(factor: EmissionFactor) {
  const source = sourceForFactor(factor)
  commit({ ...state, factors: state.factors.map((item) => item.factorId === factor.factorId ? { ...factor } : item), sources: source ? [...state.sources.filter((item) => item.sourceId !== source.sourceId), source] : state.sources, inventory: state.inventory.filter((item) => item.factorId !== factor.factorId) })
}
export function addGwpSet(gwp: Omit<GwpSet, 'gwpSetId'>) {
  const source: SourceRecord = { sourceId: gwp.sourceId, title: gwp.sourceTitle, publisher: gwp.publisher, year: gwp.year, reference: gwp.version, sourceURL: gwp.sourceURL, notes: `GWP assessment/version ${gwp.version}; time horizon ${gwp.timeHorizon}.` }
  commit({ ...state, gwpSets: [...state.gwpSets, { ...gwp, gwpSetId: crypto.randomUUID() }], sources: [...state.sources.filter((item) => item.sourceId !== source.sourceId), source] })
}
export function updateGwpSet(gwp: GwpSet) {
  const source: SourceRecord = { sourceId: gwp.sourceId, title: gwp.sourceTitle, publisher: gwp.publisher, year: gwp.year, reference: gwp.version, sourceURL: gwp.sourceURL, notes: `GWP assessment/version ${gwp.version}; time horizon ${gwp.timeHorizon}.` }
  commit({ ...state, gwpSets: state.gwpSets.map((item) => item.gwpSetId === gwp.gwpSetId ? { ...gwp } : item), sources: [...state.sources.filter((item) => item.sourceId !== source.sourceId), source] })
}
export function addOrganisation(name: string) {
  const organisation = { organisationId: crypto.randomUUID(), organisationName: name.trim() }
  if (!organisation.organisationName) return undefined
  commit({ ...state, organisations: [...state.organisations, organisation] })
  return organisation
}
export function addSite(site: Omit<Site, 'siteId'>) {
  if (!site.siteName.trim() || !site.organisationId) return undefined
  const created = { ...site, siteId: crypto.randomUUID() }
  commit({ ...state, sites: [...state.sites, created] })
  return created
}
export function getUnitConversion(value: number, activityUnit: string, factorUnit: string): { value?: number; unit?: string; error?: string } {
  const [, denominatorRaw] = factorUnit.split('/')
  const denominator = denominatorRaw?.trim()
  if (!denominator) return { error: `Factor unit “${factorUnit}” has no activity denominator.` }
  const aliases: Record<string, { dimension: string; toBase: number; base: string }> = {
    kwh: { dimension: 'energy', toBase: 1, base: 'kWh' }, mwh: { dimension: 'energy', toBase: 1000, base: 'kWh' }, wh: { dimension: 'energy', toBase: .001, base: 'kWh' },
    kg: { dimension: 'mass', toBase: 1, base: 'kg' }, tonne: { dimension: 'mass', toBase: 1000, base: 'kg' }, tonnes: { dimension: 'mass', toBase: 1000, base: 'kg' }, t: { dimension: 'mass', toBase: 1000, base: 'kg' }, g: { dimension: 'mass', toBase: .001, base: 'kg' },
    l: { dimension: 'volume', toBase: 1, base: 'L' }, litre: { dimension: 'volume', toBase: 1, base: 'L' }, litres: { dimension: 'volume', toBase: 1, base: 'L' }, m3: { dimension: 'volume', toBase: 1, base: 'm³' }, 'm³': { dimension: 'volume', toBase: 1, base: 'm³' }, nm3: { dimension: 'normal-volume', toBase: 1, base: 'Nm³' }, 'nm³': { dimension: 'normal-volume', toBase: 1, base: 'Nm³' },
    km: { dimension: 'distance', toBase: 1, base: 'km' }, 'vehicle-km': { dimension: 'vehicle-distance', toBase: 1, base: 'vehicle-km' }, 'passenger-km': { dimension: 'passenger-distance', toBase: 1, base: 'passenger-km' }, 'tonne-km': { dimension: 'freight-distance', toBase: 1, base: 'tonne-km' }, 'kg-km': { dimension: 'mass-distance', toBase: 1, base: 'kg-km' }, gj: { dimension: 'energy', toBase: 277.7777777778, base: 'kWh' },
  }
  const key = (unit: string) => unit.trim().toLowerCase().replaceAll('³', '3').replaceAll(' ', '')
  const activity = aliases[key(activityUnit)], factor = aliases[key(denominator)]
  if (!activity || !factor || activity.dimension !== factor.dimension) return { error: `Unit mismatch: activity is “${activityUnit}” but factor denominator is “${denominator}”.` }
  return { value: value * activity.toBase / factor.toBase, unit: denominator }
}
function gasFromFactor(factor: EmissionFactor): FactorGas { return factor.isCO2eFactor || !factor.gasType ? 'CO2e' : factor.gasType }
export function calculateActivity(activity: ActivityData): ActivityCalculation {
  const issues: string[] = [], warnings: string[] = []
  const factor = state.factors.find((item) => item.factorId === activity.factorId)
  if (!activity.activityType.trim()) issues.push('Activity name is required.')
  if (!Number.isFinite(activity.activityValue) || activity.activityValue < 0) issues.push('Activity amount must be zero or greater.')
  if (!activity.organisationId || !state.organisations.some((item) => item.organisationId === activity.organisationId)) issues.push('Select a valid organisation.')
  if (!activity.siteId || !state.sites.some((item) => item.siteId === activity.siteId && item.organisationId === activity.organisationId)) issues.push('Select a site belonging to this organisation.')
  const periodMatch = /^(\d{4})-(\d{2})$/.exec(activity.reportingPeriod)
  if (!periodMatch || Number(periodMatch[2]) < 1 || Number(periodMatch[2]) > 12) issues.push('Reporting period must contain a valid year and month.')
  if (!factor) issues.push('Emission factor is missing.')
  if (activity.scopeClassification === 'Unclassified') warnings.push('Scope is unclassified.')
  if (activity.dataStatus === 'ESTIMATED' || activity.dataStatus === 'ASSUMED') warnings.push(`Activity data is ${activity.dataStatus.toLowerCase()}.`)
  if (!factor) return { activity, issues, warnings }
  if (factor.category !== activity.category && factor.category !== 'Other') issues.push('Emission factor category does not match the activity category.')
  if (periodMatch && factor.validFrom && activity.reportingPeriod < factor.validFrom.slice(0, 7)) issues.push('Emission factor is not yet valid for this reporting period.')
  if (periodMatch && factor.validTo && activity.reportingPeriod > factor.validTo.slice(0, 7)) issues.push('Emission factor validity has expired for this reporting period.')
  const source = state.sources.find((item) => item.sourceId === factor.sourceId)
  if (factor.verificationStatus !== 'verified') issues.push('Emission factor is not verified.')
  if (!factor.sourceId || factor.sourceId === 'SOURCE-TO-VERIFY' || !source || source.title === 'SOURCE TO BE VERIFIED') issues.push('Source reference is missing or still a placeholder.')
  if (factor.verificationStatus === 'verified' && (!factor.sourceTitle.trim() || !factor.publisher.trim())) issues.push('Verified factor source details are incomplete.')
  const gas = gasFromFactor(factor)
  const isCO2eFactor = factor.isCO2eFactor ?? gas === 'CO2e'
  const expectedNumerator = isCO2eFactor ? 'co2e' : gas.toLowerCase()
  const numerator = typeof factor.factorUnit === 'string' ? factor.factorUnit.split('/')[0] : ''
  if (!numerator.toLowerCase().includes(expectedNumerator)) issues.push(`Factor numerator must describe ${isCO2eFactor ? 'CO₂e' : gas}.`)
  const conversion = getUnitConversion(activity.activityValue, activity.unit, factor.factorUnit)
  if (conversion.error) issues.push(conversion.error)
  if (conversion.value == null || !conversion.unit) return { activity, factor, source, issues, warnings }
  let kgCO2e = conversion.value * factor.factorValue
  let gwpSetId: string | undefined
  if (!isCO2eFactor && gas !== 'CO2') {
    const gwp = [...state.gwpSets].reverse().find((item) => gas === 'CH4' ? item.ch4KgCo2ePerKg != null : item.n2oKgCo2ePerKg != null)
    if (!gwp) issues.push(`A sourced GWP set for ${gas} is required.`)
    else { kgCO2e *= gas === 'CH4' ? gwp.ch4KgCo2ePerKg! : gwp.n2oKgCo2ePerKg!; gwpSetId = gwp.gwpSetId }
  }
  return { activity, factor, source, normalisedActivityValue: conversion.value, normalisedUnit: conversion.unit, kgCO2e: issues.some((item) => item.includes('GWP set')) ? undefined : kgCO2e, tCO2e: issues.some((item) => item.includes('GWP set')) ? undefined : kgCO2e / 1000, gwpSetId, issues, warnings }
}
export function calculateActivities(activities = state.activities) { return activities.map(calculateActivity) }
export function saveActivitiesAndInventory(activities = state.activities): string[] {
  const results = activities.map(calculateActivity)
  const errors = results.flatMap((result) => result.issues.map((issue) => `${result.activity.activityType || 'Unnamed activity'}: ${issue}`))
  if (errors.length) return errors
  const now = new Date().toISOString()
  const records: CalculationRecord[] = results.map((result) => ({
    recordId: crypto.randomUUID(), activityId: result.activity.activityId, organisationId: result.activity.organisationId, siteId: result.activity.siteId, reportingPeriod: result.activity.reportingPeriod, category: result.activity.category,
    activityValue: result.activity.activityValue, activityUnit: result.activity.unit, factorId: result.factor!.factorId, factorValue: result.factor!.factorValue, factorUnit: result.factor!.factorUnit,
    normalisedActivityValue: result.normalisedActivityValue!, normalisedUnit: result.normalisedUnit!, gasType: gasFromFactor(result.factor!), ...(result.gwpSetId ? { gwpSetId: result.gwpSetId } : {}),
    calculatedKgCO2e: result.kgCO2e!, calculatedTCO2e: result.tCO2e!, scope: result.activity.scopeClassification, dataStatus: result.activity.dataStatus,
    calculationMethod: `${result.normalisedActivityValue} ${result.normalisedUnit} × ${result.factor!.factorValue} ${result.factor!.factorUnit}${result.gwpSetId ? ' × sourced GWP' : ''}; kgCO₂e ÷ 1000 = tCO₂e`, calculatedAt: now, validationStatus: 'valid', sourceId: result.factor!.sourceId,
  }))
  const liveActivityIds = new Set(activities.map((item) => item.activityId))
  commit({ ...state, inventory: [...state.inventory.filter((item) => !liveActivityIds.has(item.activityId)), ...records] })
  return []
}
export function saveTarget(target: CarbonTarget) { commit({ ...state, targets: [...state.targets.filter((item) => item.organisationId !== target.organisationId), target] }) }
export function deleteTarget(organisationId: string) { commit({ ...state, targets: state.targets.filter((item) => item.organisationId !== organisationId) }) }
export function getInventoryTotals(records = state.inventory) { return records.reduce((out, item) => { out.total += item.calculatedTCO2e; out.byCategory[item.category] += item.calculatedTCO2e; out.byScope[item.scope] += item.calculatedTCO2e; return out }, { total: 0, byCategory: Object.fromEntries((['Electricity','Fuel','Transport','Waste','Industrial Activity','Other'] as EmissionCategory[]).map((item) => [item, 0])) as Record<EmissionCategory, number>, byScope: { 'Scope 1': 0, 'Scope 2': 0, 'Scope 3': 0, 'Unclassified': 0 } as Record<ScopeClassification, number> }) }
export function addSource(source: SourceRecord) { commit({ ...state, sources: [...state.sources.filter((item) => item.sourceId !== source.sourceId), source] }) }

/** Replace the whole registry, e.g. to start tests or an import from a known state. */
export function replaceOrganisationCarbonState(next: OrganisationCarbonState) { commit(structuredClone(next)) }
