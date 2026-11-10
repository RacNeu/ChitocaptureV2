import { getAllParameters, getParameter, readNumberParameter, readStringParameter, withParameterOverrides } from '../data/parameters'
import type { ParameterSourceType, ParameterValue } from '../types/parameters'
import { advanceProcessState, createInitialProcessState } from './processEngine'

export type ScenarioPeriod = 'weekly' | 'monthly' | 'yearly'

export type ScenarioSnapshot = {
  scenarioId?: string
  runTimestamp?: string
  inputs?: ScenarioInputSnapshot[]
  industry: string
  emissionSource: string
  site: string
  co2Concentration: number
  flowRate: number
  temperature: number
  pressure: number
  humidity: number
  so2: number
  nox: number
  particulates: number
  adsorptionTemperature: number
  adsorbentMass: number
  workingCapacity: number
  regenerationTemperature: number
  cycleDurationHours: number
  regenerationTimeHours: number
  /** Optional one-month direct-CO2 inventory link used to reconcile scenario feed mass. */
  inventoryBaselineCo2Tonnes?: number
  inventoryPeriodDays?: number
}

export type ScenarioInputSnapshot = {
  parameterId: string
  value: ParameterValue
  unit: string
  provenance: ParameterSourceType | 'scenario-assumption'
  sourceId: string
  sourceTitle?: string
  sourceDetails?: string
  measurementPeriod?: string
  notes?: string
}

export type ScenarioSample = {
  label: string
  timestamp: string
  baselineEmissionsT: number
  treatedEmissionsT: number
  captureEfficiency: number
  energyMWh: number
  regenerationEnergyMWh: number
  gasHandlingEnergyMWh: number
  coolingEnergyMWh: number
  auxiliariesEnergyMWh: number
}

export type ScenarioResult = {
  period: ScenarioPeriod
  snapshot: ScenarioSnapshot
  inputTonnes: number
  capturedTonnes: number
  remainingTonnes: number
  emissionReduction: number
  energyMWh: number
  energyPerTonne: number
  samples: ScenarioSample[]
  dailySamples: ScenarioSample[]
  hourlySamples: ScenarioSample[]
}

const snapshotParameterIds = getAllParameters().filter((parameter) => parameter.editable).map((parameter) => parameter.id)

function attachInputProvenance(snapshot: ScenarioSnapshot, scenarioInputs?: ScenarioInputSnapshot[]): ScenarioSnapshot {
  const entries = scenarioInputs ? new Map(scenarioInputs.map((input) => [input.parameterId, input])) : new Map<string, ScenarioInputSnapshot>()
  const values: Record<string, ParameterValue> = {
    industry: snapshot.industry, 'emission-source': snapshot.emissionSource, site: snapshot.site,
    'feed-co2-concentration': snapshot.co2Concentration, 'feed-flow-rate': snapshot.flowRate,
    'feed-temperature': snapshot.temperature, 'feed-pressure': snapshot.pressure, 'feed-humidity': snapshot.humidity,
    'feed-so2': snapshot.so2, 'feed-nox': snapshot.nox, 'feed-particulates': snapshot.particulates,
    'adsorption-temperature': snapshot.adsorptionTemperature, 'adsorbent-mass': snapshot.adsorbentMass,
    'adsorption-capacity': snapshot.workingCapacity, 'regeneration-temperature': snapshot.regenerationTemperature,
    'cycle-duration': snapshot.cycleDurationHours * 60, 'regeneration-time': snapshot.regenerationTimeHours * 60,
  }
  return { ...snapshot, inputs: snapshotParameterIds.flatMap((parameterId) => {
    const parameter = getParameter(parameterId)
    if (!parameter) return []
    const base = entries.get(parameterId)
    const value = values[parameterId] ?? base?.value ?? parameter.value
    const changedFromRegistry = parameter.value !== value
    return [{ parameterId, value, unit: parameter.unit, provenance: base?.provenance ?? (changedFromRegistry ? 'scenario-assumption' : parameter.sourceType), sourceId: base?.sourceId ?? parameter.sourceId, sourceTitle: base?.sourceTitle ?? parameter.sourceTitle, sourceDetails: base?.sourceDetails ?? parameter.sourceDetails, measurementPeriod: base?.measurementPeriod ?? parameter.measurementPeriod, notes: base?.notes ?? parameter.notes }]
  }) }
}

export function getCurrentScenarioSnapshot(): ScenarioSnapshot {
  return attachInputProvenance({
    industry: readStringParameter('industry'),
    emissionSource: readStringParameter('emission-source'),
    site: readStringParameter('site'),
    co2Concentration: readNumberParameter('feed-co2-concentration'),
    flowRate: readNumberParameter('feed-flow-rate'),
    temperature: readNumberParameter('feed-temperature'),
    pressure: readNumberParameter('feed-pressure'),
    humidity: readNumberParameter('feed-humidity'),
    so2: readNumberParameter('feed-so2'),
    nox: readNumberParameter('feed-nox'),
    particulates: readNumberParameter('feed-particulates'),
    adsorptionTemperature: readNumberParameter('adsorption-temperature'),
    adsorbentMass: readNumberParameter('adsorbent-mass'),
    workingCapacity: readNumberParameter('adsorption-capacity'),
    regenerationTemperature: readNumberParameter('regeneration-temperature'),
    cycleDurationHours: readNumberParameter('cycle-duration') / 60,
    regenerationTimeHours: readNumberParameter('regeneration-time') / 60,
  })
}

const periodSettings: Record<ScenarioPeriod, { days: number; samples: number; label: string }> = {
  weekly: { days: 7, samples: 7, label: 'Day' },
  monthly: { days: 30, samples: 30, label: 'Day' },
  yearly: { days: 365, samples: 12, label: 'Month' },
}

export function runScenario(snapshot: ScenarioSnapshot, period: ScenarioPeriod): ScenarioResult {
  const immutableSnapshot = attachInputProvenance(snapshot, snapshot.inputs)
  const simulate = (scenario: ScenarioSnapshot) => {
    const overrides: Record<string, ParameterValue> = Object.fromEntries(scenario.inputs!.map((input) => [input.parameterId, input.value]))
    return withParameterOverrides(overrides, () => calculateScenario(scenario, period))
  }
  const firstResult = simulate(immutableSnapshot)
  const targetTonnes = immutableSnapshot.inventoryBaselineCo2Tonnes
  if (period !== 'monthly' || !Number.isFinite(targetTonnes) || targetTonnes! <= 0 || firstResult.inputTonnes <= 0) return firstResult

  // The simple flow estimate is refined against the engine's actual time-varying feed
  // so the simulated monthly CO2 input reconciles to the selected inventory total.
  const calibratedFlowRate = immutableSnapshot.flowRate * targetTonnes! / firstResult.inputTonnes
  const calibratedInputs = immutableSnapshot.inputs!.map((input) => input.parameterId === 'feed-flow-rate'
    ? { ...input, value: calibratedFlowRate, provenance: 'scenario-assumption' as const, sourceTitle: 'Flow derived from selected inventory CO₂ and feed concentration', sourceDetails: 'The scenario feed rate is calibrated so simulated monthly CO₂ input matches the selected direct-CO₂ inventory total.', notes: 'Derived scenario assumption; replace with a measured flue-gas flow rate when available.' }
    : input)
  return simulate({ ...immutableSnapshot, flowRate: calibratedFlowRate, inputs: calibratedInputs })
}

function calculateScenario(snapshot: ScenarioSnapshot, period: ScenarioPeriod): ScenarioResult {
  const defaultSetting = periodSettings[period]
  const setting = period === 'monthly' && Number.isFinite(snapshot.inventoryPeriodDays) && snapshot.inventoryPeriodDays! >= 28 && snapshot.inventoryPeriodDays! <= 31
    ? { ...defaultSetting, days: snapshot.inventoryPeriodDays! }
    : defaultSetting
  const stepSeconds = 15 * 60
  const totalSteps = Math.ceil(setting.days * 24 * 3_600 / stepSeconds)
  const stepsPerSample = totalSteps / setting.samples
  let state = createInitialProcessState()
  let previousSample = { input: 0, captured: 0, energy: 0, regenerationEnergy: 0, gasHandlingEnergy: 0, coolingEnergy: 0, auxiliariesEnergy: 0 }
  let previousDaily = { ...previousSample }
  let previousHourly = { ...previousSample }
  const samples: ScenarioSample[] = []
  const dailySamples: ScenarioSample[] = []
  const hourlySamples: ScenarioSample[] = []
  const stepsPerHour = 3_600 / stepSeconds
  const stepsPerDay = 24 * stepsPerHour

  function makeSample(current: typeof previousSample, previous: typeof previousSample, label: string, timestamp: string): ScenarioSample {
    const input = Math.max(0, current.input - previous.input)
    const captured = Math.min(input, Math.max(0, current.captured - previous.captured))
    const energy = Math.max(0, current.energy - previous.energy)
    return {
      label,
      timestamp,
      baselineEmissionsT: input / 1_000,
      treatedEmissionsT: Math.max(0, input - captured) / 1_000,
      captureEfficiency: input > 0 ? captured / input * 100 : 0,
      energyMWh: energy / 1_000,
      regenerationEnergyMWh: Math.min(energy, Math.max(0, current.regenerationEnergy - previous.regenerationEnergy)) / 1_000,
      gasHandlingEnergyMWh: Math.max(0, current.gasHandlingEnergy - previous.gasHandlingEnergy) / 1_000,
      coolingEnergyMWh: Math.max(0, current.coolingEnergy - previous.coolingEnergy) / 1_000,
      auxiliariesEnergyMWh: Math.max(0, current.auxiliariesEnergy - previous.auxiliariesEnergy) / 1_000,
    }
  }

  for (let index = 0; index < totalSteps; index += 1) {
    state = advanceProcessState(state, stepSeconds)
    const current = { input: state.carbon.co2Input, captured: state.carbon.co2Captured, energy: state.energy.totalEnergy, regenerationEnergy: state.energy.regenerationEnergy, gasHandlingEnergy: state.energy.gasHandlingEnergy, coolingEnergy: state.energy.coolingEnergy, auxiliariesEnergy: state.energy.auxiliariesEnergy }
    if ((index + 1) % stepsPerHour === 0 && hourlySamples.length < 24) {
      hourlySamples.push(makeSample(current, previousHourly, `${hourlySamples.length + 1}:00`, state.timestamp))
      previousHourly = current
    }
    if ((index + 1) % stepsPerDay === 0) {
      dailySamples.push(makeSample(current, previousDaily, `Day ${dailySamples.length + 1}`, state.timestamp))
      previousDaily = current
    }
    const sampleBoundary = Math.ceil((samples.length + 1) * stepsPerSample)
    if (index + 1 >= sampleBoundary) {
      samples.push(makeSample(current, previousSample, `${setting.label} ${samples.length + 1}`, state.timestamp))
      previousSample = current
    }
  }

  const capturedTonnes = samples.reduce((total, sample) => total + sample.baselineEmissionsT - sample.treatedEmissionsT, 0)
  const inputTonnes = samples.reduce((total, sample) => total + sample.baselineEmissionsT, 0)
  const remainingTonnes = Math.max(0, inputTonnes - capturedTonnes)
  const energyMWh = samples.reduce((total, sample) => total + sample.energyMWh, 0)
  return {
    period,
    snapshot: { ...snapshot },
    inputTonnes,
    capturedTonnes,
    remainingTonnes,
    emissionReduction: inputTonnes > 0 ? capturedTonnes / inputTonnes * 100 : 0,
    energyMWh,
    energyPerTonne: capturedTonnes > 0 ? energyMWh * 1_000 / capturedTonnes : 0,
    samples,
    dailySamples,
    hourlySamples,
  }
}
