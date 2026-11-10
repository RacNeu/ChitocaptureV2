import { simulationAssumptions } from '../data/assumptions'
import { literatureData } from '../data/literatureData'
import { clamp } from './calculations'
import type { ProcessState } from '../types/process'

export type RegenerationStep = {
  currentLoading: number
  loadingPercentage: number
  elapsedSeconds: number
  desorbedCo2Kg: number
  temperature: number
  complete: boolean
}

export function simulateRegenerationStep(adsorbent: ProcessState['adsorbent'], intervalSeconds: number): RegenerationStep {
  const elapsedSeconds = Math.min(adsorbent.regenerationDuration, adsorbent.regenerationElapsed + intervalSeconds)
  const fractionComplete = adsorbent.regenerationDuration > 0 ? elapsedSeconds / adsorbent.regenerationDuration : 1
  const startLoading = adsorbent.currentLoading
  const currentLoading = Math.max(0, startLoading * (1 - clamp(intervalSeconds / Math.max(1, adsorbent.regenerationDuration - adsorbent.regenerationElapsed), 0, 1)))
  const desorbedCo2Kg = Math.max(0, adsorbent.massKg * (startLoading - currentLoading) * literatureData.co2MolarMassGramsPerMol / 1_000)
  const loadingPercentage = adsorbent.capacity > 0 ? clamp(currentLoading / adsorbent.capacity * 100, 0, 100) : 0
  const warmFraction = clamp(elapsedSeconds / simulationAssumptions.regenerationWarmupSeconds, 0, 1)
  const cooldownFraction = clamp((adsorbent.regenerationDuration - elapsedSeconds) / simulationAssumptions.regenerationCooldownSeconds, 0, 1)
  const thermalFraction = Math.min(warmFraction, cooldownFraction)
  const temperature = simulationAssumptions.adsorptionTemperatureC
    + (simulationAssumptions.regenerationTemperatureC - simulationAssumptions.adsorptionTemperatureC) * thermalFraction

  return {
    currentLoading: fractionComplete >= 1 ? 0 : currentLoading,
    loadingPercentage: fractionComplete >= 1 ? 0 : loadingPercentage,
    elapsedSeconds,
    desorbedCo2Kg,
    temperature,
    complete: fractionComplete >= 1,
  }
}
