import { getParameter } from '../data/parameters'
import type { ScenarioSnapshot } from './scenarioRunner'
import { scenarioValidationRules } from './scenarioValidation'

export type DataCompleteness = { count: number; total: number; percent: number }

const numericInputs: Array<[string, keyof ScenarioSnapshot]> = [
  ['feed-co2-concentration', 'co2Concentration'],
  ['feed-flow-rate', 'flowRate'],
  ['feed-temperature', 'temperature'],
  ['feed-pressure', 'pressure'],
  ['feed-humidity', 'humidity'],
  ['feed-so2', 'so2'],
  ['feed-nox', 'nox'],
  ['feed-particulates', 'particulates'],
  ['adsorption-temperature', 'adsorptionTemperature'],
  ['adsorbent-mass', 'adsorbentMass'],
  ['adsorption-capacity', 'workingCapacity'],
  ['regeneration-temperature', 'regenerationTemperature'],
  ['cycle-duration', 'cycleDurationHours'],
  ['regeneration-time', 'regenerationTimeHours'],
]

function isValidNumber(id: string, value: unknown): value is number {
  const rule = scenarioValidationRules[id]
  const parameter = getParameter(id)
  if (!rule || typeof value !== 'number' || !Number.isFinite(value) || typeof parameter?.value !== 'number' || !Number.isFinite(parameter.value)) return false
  const inRange = (candidate: number) => (rule.min === undefined || candidate > rule.min || (!rule.minExclusive && candidate === rule.min)) && (rule.max === undefined || candidate <= rule.max)
  return inRange(value) && inRange(parameter.value)
}

export function calculateDataCompleteness(snapshot: ScenarioSnapshot): DataCompleteness {
  const sourceValues = [snapshot.industry, snapshot.emissionSource, snapshot.site]
  const sourceValid = sourceValues.map((value) => Boolean(value.trim()) && value !== 'Not specified')
  const numbersValid = numericInputs.map(([id, key]) => isValidNumber(id, snapshot[key]))
  const hasValidCycle = snapshot.regenerationTimeHours < snapshot.cycleDurationHours
  if (!hasValidCycle) numbersValid[numbersValid.length - 1] = false
  const productRate = getParameter('product-output-rate')?.value
  const productValid = typeof productRate === 'number' && Number.isFinite(productRate) && productRate > 0
  const total = sourceValid.length + numbersValid.length + 1
  const count = [...sourceValid, ...numbersValid, productValid].filter(Boolean).length
  return { count, total, percent: Math.round(count / total * 100) }
}
