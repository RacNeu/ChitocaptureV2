import { getAllParameters } from '../data/parameters'
import { getAllSources } from '../data/sources'
import { calculateDataCompleteness } from './executiveMetrics'
import { validateScenarioDrafts } from './scenarioValidation'
import { getCarbonFlowEnergyTotals, getCarbonFlowTotals } from './carbonFlowMetrics'
import type { ScenarioResult, ScenarioSample, ScenarioSnapshot } from './scenarioRunner'

export type ReportType = 'monthly' | 'quarterly' | 'yearly'
export type ReportPeriod = { key: string; label: string; start: string; end: string }

export type ReportSnapshot = {
  reportId: string
  reportType: ReportType
  reportingPeriod: ReportPeriod
  generatedAt: string
  scenarioId: string
  scenario: ScenarioSnapshot
  sourceConfiguration: Pick<ScenarioSnapshot, 'industry' | 'emissionSource' | 'site'>
  parameterSnapshot: ReturnType<typeof getAllParameters>
  sourceSnapshot: ReturnType<typeof getAllSources>
  parameters: ReturnType<typeof getAllParameters>
  sources: ReturnType<typeof getAllSources>
  timeSeriesSummary: { sampleCount: number; start: string; end: string }
  timeSeriesData: ScenarioSample[]
  samples: ScenarioSample[]
  provenanceCounts: { literature: number; assumption: number; simulated: number; measured: number }
  calculatedKPIs: ReturnType<typeof getCarbonFlowTotals> & ReturnType<typeof getCarbonFlowEnergyTotals> & {
    baselineEmissions: number
    treatedEmissions: number
    absoluteReduction: number
    averageCaptureEfficiency: number
    minimumCaptureEfficiency: number
    maximumCaptureEfficiency: number
    averageDailyKWh: number
    emissionReductionPercent: number
    carbonIntensity: number | null
  }
  energyBreakdown: { regenerationMWh: number; gasHandlingMWh: number; coolingMWh: number; auxiliariesMWh: number; totalMWh: number }
  operatingStatistics: { periodDays: number; averageCaptureEfficiency: number; minimumCaptureEfficiency: number; maximumCaptureEfficiency: number; adsorptionCycles: null; regenerationCycles: null; adsorbentLoading: null }
  dataCompleteness: ReturnType<typeof calculateDataCompleteness>
  assumptions: ReturnType<typeof getAllParameters>
  validationResults: { massBalanceOk: boolean; energyBalanceOk: boolean; timeSeriesComplete: boolean; missingParameters: string[]; invalidParameters: string[]; unresolvedSources: string[]; unverifiedSources: string[] }
}

function periodParts(key: string, type: ReportType) {
  if (type === 'monthly') {
    const [year, month] = key.split('-').map(Number)
    return { year, month }
  }
  if (type === 'quarterly') {
    const [yearText, quarterText] = key.split('-Q')
    return { year: Number(yearText), quarter: Number(quarterText) }
  }
  return { year: Number(key) }
}

function matchesPeriod(timestamp: string, key: string, type: ReportType) {
  // Daily samples are stamped at the right edge of a 24-hour model interval.
  const date = new Date(new Date(timestamp).getTime() - 1)
  const parts = periodParts(key, type)
  if (date.getUTCFullYear() !== parts.year) return false
  if (type === 'monthly') return date.getUTCMonth() + 1 === parts.month
  if (type === 'quarterly') return Math.floor(date.getUTCMonth() / 3) + 1 === parts.quarter
  return true
}

function isoDay(timestamp: string) { return new Date(new Date(timestamp).getTime() - 1).toISOString().slice(0, 10) }

export function getAvailableReportPeriods(samples: ScenarioSample[], type: ReportType): ReportPeriod[] {
  const buckets = new Map<string, string[]>()
  for (const sample of samples) {
    // Use the day represented by the sample interval, not its right-edge timestamp.
    const date = new Date(new Date(sample.timestamp).getTime() - 1)
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const key = type === 'monthly' ? `${year}-${month}` : type === 'quarterly' ? `${year}-Q${Math.floor(date.getUTCMonth() / 3) + 1}` : String(year)
    buckets.set(key, [...(buckets.get(key) ?? []), isoDay(sample.timestamp)])
  }
  return [...buckets.entries()].map(([key, dates]) => {
    const [start, end] = [dates.reduce((a, b) => a < b ? a : b), dates.reduce((a, b) => a > b ? a : b)]
    const label = type === 'monthly'
      ? new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
      : type === 'quarterly' ? `Q${key.split('-Q')[1]} ${key.split('-Q')[0]}` : key
    return { key, label, start, end }
  }).sort((a, b) => a.key.localeCompare(b.key))
}

export function createReportSnapshot(type: ReportType, period: ReportPeriod, annualResult: ScenarioResult, generatedAt = new Date().toISOString()): ReportSnapshot {
  const samples = annualResult.dailySamples.filter((sample) => matchesPeriod(sample.timestamp, period.key, type))
  const baselineEmissions = samples.reduce((total, sample) => total + sample.baselineEmissionsT, 0)
  const treatedEmissions = samples.reduce((total, sample) => total + sample.treatedEmissionsT, 0)
  const inputTonnes = baselineEmissions
  const capturedTonnes = Math.max(0, inputTonnes - treatedEmissions)
  const remainingTonnes = treatedEmissions
  const captureEfficiency = inputTonnes > 0 ? capturedTonnes / inputTonnes * 100 : 0
  const energyMWh = samples.reduce((total, sample) => total + sample.energyMWh, 0)
  const regenerationMWh = samples.reduce((total, sample) => total + sample.regenerationEnergyMWh, 0)
  const gasHandlingMWh = samples.reduce((total, sample) => total + sample.gasHandlingEnergyMWh, 0)
  const auxiliariesMWh = samples.reduce((total, sample) => total + sample.coolingEnergyMWh + sample.auxiliariesEnergyMWh, 0)
  const coolingMWh = samples.reduce((total, sample) => total + sample.coolingEnergyMWh, 0)
  const otherAuxiliariesMWh = samples.reduce((total, sample) => total + sample.auxiliariesEnergyMWh, 0)
  const days = samples.length
  const energyTotals = getCarbonFlowEnergyTotals({ ...annualResult, period: type === 'yearly' ? 'yearly' : 'monthly', samples: samples.map((sample) => ({ ...sample })) })
  const flowTotals = getCarbonFlowTotals({ ...annualResult, inputTonnes, capturedTonnes, remainingTonnes, samples })
  const parameters = getAllParameters()
  const sources = getAllSources()
  const sourceIds = new Set(sources.map((source) => source.sourceId))
  const missingParameters = parameters.filter((parameter) => parameter.value === 'Not yet specified' || parameter.value === 'Not yet verified' || parameter.value === 'Not specified' || (typeof parameter.value === 'number' && !Number.isFinite(parameter.value))).map((parameter) => parameter.id)
  const drafts: Record<string, string> = {
    'feed-co2-concentration': String(annualResult.snapshot.co2Concentration), 'feed-flow-rate': String(annualResult.snapshot.flowRate),
    'feed-temperature': String(annualResult.snapshot.temperature), 'feed-pressure': String(annualResult.snapshot.pressure),
    'feed-humidity': String(annualResult.snapshot.humidity), 'feed-so2': String(annualResult.snapshot.so2),
    'feed-nox': String(annualResult.snapshot.nox), 'feed-particulates': String(annualResult.snapshot.particulates),
    'adsorption-temperature': String(annualResult.snapshot.adsorptionTemperature), 'adsorbent-mass': String(annualResult.snapshot.adsorbentMass),
    'adsorption-capacity': String(annualResult.snapshot.workingCapacity), 'regeneration-temperature': String(annualResult.snapshot.regenerationTemperature),
    'cycle-duration': String(annualResult.snapshot.cycleDurationHours), 'regeneration-time': String(annualResult.snapshot.regenerationTimeHours),
  }
  const invalidParameters = Object.keys(validateScenarioDrafts(drafts))
  const unresolvedSources = parameters.filter((parameter) => !sourceIds.has(parameter.sourceId)).map((parameter) => parameter.sourceId)
  const unverifiedSources = parameters.filter((parameter) => parameter.sourceType === 'literature' && sources.find((source) => source.sourceId === parameter.sourceId)?.sourceType !== 'literature').map((parameter) => parameter.sourceId)
  const start = days ? isoDay(samples[0].timestamp) : period.start
  const end = days ? isoDay(samples.at(-1)!.timestamp) : period.end
  const reportingPeriod = { ...period, start, end, label: `${period.label} · ${start} to ${end}` }
  const snapshotString = JSON.stringify(annualResult.snapshot)
  const hash = Array.from(snapshotString).reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261) >>> 0
  const scenarioId = `SCN-${hash.toString(16).toUpperCase().padStart(8, '0')}`
  const reportId = `CCR-${new Date(generatedAt).toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
  const calculatedSamples = samples.map((sample) => ({ ...sample }))
  const literatureCount = parameters.filter((parameter) => parameter.sourceType === 'literature' && sources.find((source) => source.sourceId === parameter.sourceId)?.sourceType === 'literature' && sources.find((source) => source.sourceId === parameter.sourceId)?.title !== 'SOURCE TO BE VERIFIED').length
  const measuredCount = parameters.filter((parameter) => (parameter.sourceType as string) === 'measured').length
  const periodDays = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1)
  const expectedDays = type === 'monthly'
    ? new Date(Date.UTC(Number(period.key.slice(0, 4)), Number(period.key.slice(5, 7)), 0)).getUTCDate()
    : type === 'quarterly'
      ? (() => { const [year, quarter] = period.key.split('-Q').map(Number); const firstMonth = (quarter - 1) * 3; return [0, 1, 2].reduce((sum, offset) => sum + new Date(Date.UTC(year, firstMonth + offset + 1, 0)).getUTCDate(), 0) })()
      : (Number(period.key) % 4 === 0 && (Number(period.key) % 100 !== 0 || Number(period.key) % 400 === 0) ? 366 : 365)
  return {
    reportId, reportType: type, reportingPeriod, generatedAt, scenarioId,
    scenario: { ...annualResult.snapshot },
    sourceConfiguration: { industry: annualResult.snapshot.industry, emissionSource: annualResult.snapshot.emissionSource, site: annualResult.snapshot.site },
    parameterSnapshot: parameters.map((parameter) => ({ ...parameter })), sourceSnapshot: sources.map((source) => ({ ...source })),
    parameters: parameters.map((parameter) => ({ ...parameter })), sources: sources.map((source) => ({ ...source })), samples: calculatedSamples, timeSeriesData: calculatedSamples.map((sample) => ({ ...sample })),
    timeSeriesSummary: { sampleCount: samples.length, start, end },
    provenanceCounts: {
      literature: literatureCount,
      assumption: parameters.filter((parameter) => parameter.sourceType === 'assumption').length,
      simulated: parameters.filter((parameter) => parameter.sourceType === 'simulated').length,
      measured: measuredCount,
    },
    calculatedKPIs: {
      ...flowTotals,
      ...energyTotals,
      inputTonnes, capturedTonnes, remainingTonnes, captureEfficiency,
      baselineEmissions, treatedEmissions, absoluteReduction: inputTonnes - treatedEmissions,
      averageCaptureEfficiency: inputTonnes > 0 ? captureEfficiency : 0,
      minimumCaptureEfficiency: samples.length ? Math.min(...samples.map((sample) => sample.captureEfficiency)) : 0,
      maximumCaptureEfficiency: samples.length ? Math.max(...samples.map((sample) => sample.captureEfficiency)) : 0,
      totalEnergyMWh: energyMWh, energyIntensityKWhPerTonne: capturedTonnes > 0 ? energyMWh * 1_000 / capturedTonnes : 0,
      regenerationMWh, gasHandlingMWh, auxiliariesMWh,
      averageDailyKWh: days > 0 ? energyMWh * 1_000 / days : 0,
      emissionReductionPercent: inputTonnes > 0 ? (inputTonnes - treatedEmissions) / inputTonnes * 100 : 0,
      carbonIntensity: null,
    },
    energyBreakdown: { regenerationMWh, gasHandlingMWh, coolingMWh, auxiliariesMWh: otherAuxiliariesMWh, totalMWh: energyMWh },
    operatingStatistics: {
      periodDays: days,
      averageCaptureEfficiency: captureEfficiency,
      minimumCaptureEfficiency: samples.length ? Math.min(...samples.map((sample) => sample.captureEfficiency)) : 0,
      maximumCaptureEfficiency: samples.length ? Math.max(...samples.map((sample) => sample.captureEfficiency)) : 0,
      adsorptionCycles: null, regenerationCycles: null, adsorbentLoading: null,
    },
    dataCompleteness: calculateDataCompleteness(annualResult.snapshot),
    assumptions: parameters.filter((parameter) => parameter.sourceType === 'assumption'),
    validationResults: {
      massBalanceOk: Math.abs(inputTonnes - capturedTonnes - remainingTonnes) < Math.max(1e-7, inputTonnes * 1e-9),
      energyBalanceOk: Math.abs(energyMWh - regenerationMWh - gasHandlingMWh - auxiliariesMWh) < Math.max(1e-8, energyMWh * 1e-9),
      timeSeriesComplete: samples.length === periodDays && samples.length === expectedDays,
      missingParameters, invalidParameters, unresolvedSources, unverifiedSources,
    },
  }
}
