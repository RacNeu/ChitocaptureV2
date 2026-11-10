import { readNumberParameter, readStringParameter } from './parameters'

/** Compatibility view for the process models; the parameter registry owns all values. */
export const simulationAssumptions = {
  get industrialSource() { return readStringParameter('industry') },
  get emissionSource() { return readStringParameter('emission-source') },
  get initialTimestamp() { return readStringParameter('initial-timestamp') },
  get simulatedSecondsPerUpdate() { return readNumberParameter('simulated-seconds-per-update') },
  get updateIntervalMilliseconds() { return readNumberParameter('update-interval') },
  get inlet() {
    return {
      co2Concentration: readNumberParameter('feed-co2-concentration'),
      flowRate: readNumberParameter('feed-flow-rate'),
      temperature: readNumberParameter('feed-temperature'),
      pressure: readNumberParameter('feed-pressure'),
      humidity: readNumberParameter('feed-humidity'),
      so2: readNumberParameter('feed-so2'),
      nox: readNumberParameter('feed-nox'),
      particulates: readNumberParameter('feed-particulates'),
    }
  },
  get adsorbentMassKg() { return readNumberParameter('adsorbent-mass') },
  get adsorptionTemperatureC() { return readNumberParameter('adsorption-temperature') },
  get regenerationTemperatureC() { return readNumberParameter('regeneration-temperature') },
  get cycleDurationSeconds() { return readNumberParameter('cycle-duration') * 60 },
  get regenerationDurationSeconds() { return readNumberParameter('regeneration-time') * 60 },
  get operatingLimitPercentage() { return readNumberParameter('operating-limit') },
  get initialLoadingMmolPerG() { return readNumberParameter('initial-loading') },
  get initialCycleCount() { return readNumberParameter('initial-cycle-count') },
  get firstCycleDate() { return readStringParameter('first-cycle-date') },
  get targetCaptureEfficiencyPercentage() { return readNumberParameter('target-capture-efficiency') },
  get loadingCaptureReductionFraction() { return readNumberParameter('loading-performance-loss') },
  get captureEfficiencyDriftPercentage() { return readNumberParameter('capture-efficiency-drift') },
  get captureEfficiencyDriftPeriodMilliseconds() { return readNumberParameter('capture-efficiency-drift-period') },
  get inletSlowVariationPeriodMilliseconds() { return readNumberParameter('inlet-slow-variation-period') },
  get inletFastVariationPeriodMilliseconds() { return readNumberParameter('inlet-fast-variation-period') },
  get inletCo2Variation() { return readNumberParameter('inlet-co2-variation') },
  get inletFlowVariation() { return readNumberParameter('inlet-flow-variation') },
  get inletTemperatureVariation() { return readNumberParameter('inlet-temperature-variation') },
  get inletPressureVariation() { return readNumberParameter('inlet-pressure-variation') },
  get inletHumidityVariation() { return readNumberParameter('inlet-humidity-variation') },
  get inletSo2Variation() { return readNumberParameter('inlet-so2-variation') },
  get inletNoxVariation() { return readNumberParameter('inlet-nox-variation') },
  get inletParticulatesVariation() { return readNumberParameter('inlet-particulates-variation') },
  get regenerationEnergyKWhPerKgCo2() { return readNumberParameter('regeneration-energy-rate') },
  get gasHandlingKWhPerNm3() { return readNumberParameter('gas-handling-energy-rate') },
  get coolingKWhPerNm3C() { return readNumberParameter('cooling-energy-rate') },
  get auxiliaryKWhPerNm3() { return readNumberParameter('auxiliary-energy-rate') },
  get outletPressureDropBar() { return readNumberParameter('outlet-pressure-drop') },
  get outletHumidityFraction() { return readNumberParameter('outlet-humidity-fraction') },
  get sulfurRemovalFraction() { return readNumberParameter('sulfur-removal-fraction') },
  get noxRemovalFraction() { return readNumberParameter('nox-removal-fraction') },
  get particulateRemovalFraction() { return readNumberParameter('particulate-removal-fraction') },
  get outletTemperatureTimeConstantSeconds() { return readNumberParameter('outlet-temperature-time-constant') },
  get outletTemperatureAdsorptionOffsetC() { return readNumberParameter('outlet-temperature-adsorption-offset') },
  get outletTemperatureRegenerationOffsetC() { return readNumberParameter('outlet-temperature-regeneration-offset') },
  get outletPressureTimeConstantSeconds() { return readNumberParameter('outlet-pressure-time-constant') },
  get outletHumidityTimeConstantSeconds() { return readNumberParameter('outlet-humidity-time-constant') },
  get regenerationWarmupSeconds() { return readNumberParameter('regeneration-warmup-time') },
  get regenerationCooldownSeconds() { return readNumberParameter('regeneration-cooldown-time') },
  get massBalanceToleranceKg() { return readNumberParameter('mass-balance-tolerance') },
} as const

export function getModelLimitNote(): string {
  const capacityKg = simulationAssumptions.adsorbentMassKg
    * readNumberParameter('adsorption-capacity')
    * readNumberParameter('co2-molar-mass') / 1_000
  const co2FeedKgPerSecond = simulationAssumptions.inlet.flowRate
    * simulationAssumptions.inlet.co2Concentration / 100
    * readNumberParameter('co2-density') / 3_600
  const captureRateKgPerSecond = co2FeedKgPerSecond * simulationAssumptions.targetCaptureEfficiencyPercentage / 100
  const capacityTimeSeconds = captureRateKgPerSecond > 0 ? capacityKg / captureRateKgPerSecond : 0
  const timeText = capacityTimeSeconds > 0 ? `about ${Math.round(capacityTimeSeconds)} simulated seconds` : 'no finite time at the current capture rate'
  return `The current adsorbent mass and capacity provide about ${capacityKg.toFixed(0)} kg of CO₂ capacity. At the configured feed and target capture rate, that capacity is reached in ${timeText}. The prototype enforces the configured material capacity.`
}
