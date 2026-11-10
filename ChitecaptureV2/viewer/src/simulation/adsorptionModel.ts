import { simulationAssumptions } from '../data/assumptions'
import { literatureData } from '../data/literatureData'
import { clamp, co2CapacityKg, co2InputForIntervalKg, currentLoadingMmolPerG } from './calculations'
import type { GasReadings, ProcessState } from '../types/process'

export type AdsorptionStep = {
  co2InputKg: number
  co2CapturedKg: number
  currentLoading: number
  loadingPercentage: number
  elapsedSeconds: number
  estimatedTimeToRegeneration: number
  atLimit: boolean
}

export function simulateAdsorptionStep(adsorbent: ProcessState['adsorbent'], inlet: GasReadings, intervalSeconds: number, targetEfficiency: number): AdsorptionStep {
  const co2InputKg = co2InputForIntervalKg(inlet, intervalSeconds)
  const capacityKg = co2CapacityKg(adsorbent.massKg, adsorbent.capacity)
  const currentlyStoredKg = adsorbent.massKg * adsorbent.currentLoading * literatureData.co2MolarMassGramsPerMol / 1_000
  const availableCapacityKg = Math.max(0, capacityKg - currentlyStoredKg)
  const loadingFraction = adsorbent.capacity > 0 ? clamp(adsorbent.currentLoading / adsorbent.capacity, 0, 1) : 0
  const loadingPenalty = 1 - simulationAssumptions.loadingCaptureReductionFraction * loadingFraction ** 2
  const requestedCaptureKg = co2InputKg * clamp(targetEfficiency / 100, 0, 1) * clamp(loadingPenalty, 0, 1)
  const co2CapturedKg = Math.min(requestedCaptureKg, availableCapacityKg)
  const storedAfterStepKg = Math.min(capacityKg, currentlyStoredKg + co2CapturedKg)
  const currentLoading = Math.min(adsorbent.capacity, currentLoadingMmolPerG(storedAfterStepKg, adsorbent.massKg))
  const loadingPercentage = adsorbent.capacity > 0 ? clamp(currentLoading / adsorbent.capacity * 100, 0, 100) : 0
  const potentialCaptureRateKgPerSecond = intervalSeconds > 0 ? requestedCaptureKg / intervalSeconds : 0
  const capacityTimeSeconds = potentialCaptureRateKgPerSecond > 0 ? availableCapacityKg / potentialCaptureRateKgPerSecond : 0
  const cycleTimeSeconds = Math.max(0, adsorbent.cycleDuration - (adsorbent.adsorptionElapsed + intervalSeconds))

  return {
    co2InputKg,
    co2CapturedKg,
    currentLoading,
    loadingPercentage,
    elapsedSeconds: adsorbent.adsorptionElapsed + intervalSeconds,
    estimatedTimeToRegeneration: Math.max(0, Math.min(cycleTimeSeconds, capacityTimeSeconds)),
    atLimit: loadingPercentage >= adsorbent.operatingLimit,
  }
}

export function targetCaptureEfficiency(timestampMs: number): number {
  const drift = Math.sin(timestampMs / simulationAssumptions.captureEfficiencyDriftPeriodMilliseconds) * simulationAssumptions.captureEfficiencyDriftPercentage
  return clamp(simulationAssumptions.targetCaptureEfficiencyPercentage + drift, 0, 100)
}
