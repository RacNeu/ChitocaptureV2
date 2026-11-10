import { literatureData } from '../data/literatureData'
import { simulationAssumptions } from '../data/assumptions'
import type { EnergyState, GasReadings, ProcessPhase } from '../types/process'

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function co2CapacityKg(adsorbentMassKg: number, capacityMmolPerG: number): number {
  return Math.max(0, adsorbentMassKg * capacityMmolPerG * literatureData.co2MolarMassGramsPerMol / 1_000)
}

export function co2InputForIntervalKg(inlet: GasReadings, intervalSeconds: number): number {
  return Math.max(0, inlet.flowRate * inlet.co2Concentration / 100 * literatureData.co2DensityKgPerNm3 * intervalSeconds / 3_600)
}

export function currentLoadingMmolPerG(storedCo2Kg: number, adsorbentMassKg: number): number {
  if (adsorbentMassKg <= 0) return 0
  return Math.max(0, storedCo2Kg * 1_000 / (adsorbentMassKg * literatureData.co2MolarMassGramsPerMol))
}

export function captureEfficiencyPercentage(capturedKg: number, inputKg: number): number {
  if (inputKg <= 0) return 0
  return clamp(capturedKg / inputKg * 100, 0, 100)
}

export function createOutletReadings(
  inlet: GasReadings,
  previous: GasReadings,
  capturedThisIntervalKg: number,
  intervalSeconds: number,
  phase: ProcessPhase,
): GasReadings {
  const inletCo2VolumeRate = inlet.flowRate * inlet.co2Concentration / 100
  const capturedCo2VolumeRate = Math.min(inletCo2VolumeRate, capturedThisIntervalKg / literatureData.co2DensityKgPerNm3 * 3_600 / intervalSeconds)
  const outletFlowTarget = Math.max(0, inlet.flowRate - capturedCo2VolumeRate)
  const co2RemainingVolumeRate = Math.max(0, inletCo2VolumeRate - capturedCo2VolumeRate)
  const outletCo2Target = outletFlowTarget > 0 ? clamp(co2RemainingVolumeRate / outletFlowTarget * 100, 0, 100) : 0
  const targetTemperature = phase === 'adsorption'
    ? simulationAssumptions.adsorptionTemperatureC + simulationAssumptions.outletTemperatureAdsorptionOffsetC
    : simulationAssumptions.adsorptionTemperatureC + simulationAssumptions.outletTemperatureRegenerationOffsetC

  return {
    co2Concentration: outletCo2Target,
    flowRate: outletFlowTarget,
    temperature: Math.max(0, previous.temperature + (targetTemperature - previous.temperature) * clamp(intervalSeconds / simulationAssumptions.outletTemperatureTimeConstantSeconds, 0, 1)),
    pressure: Math.max(0, previous.pressure + ((inlet.pressure - simulationAssumptions.outletPressureDropBar) - previous.pressure) * clamp(intervalSeconds / simulationAssumptions.outletPressureTimeConstantSeconds, 0, 1)),
    humidity: Math.max(0, previous.humidity + (inlet.humidity * simulationAssumptions.outletHumidityFraction - previous.humidity) * clamp(intervalSeconds / simulationAssumptions.outletHumidityTimeConstantSeconds, 0, 1)),
    so2: Math.max(0, inlet.so2 * (1 - simulationAssumptions.sulfurRemovalFraction)),
    nox: Math.max(0, inlet.nox * (1 - simulationAssumptions.noxRemovalFraction)),
    particulates: Math.max(0, inlet.particulates * (1 - simulationAssumptions.particulateRemovalFraction)),
  }
}

export function calculateEnergy(previous: EnergyState, inlet: GasReadings, intervalSeconds: number, desorbedCo2Kg: number, phase: ProcessPhase, capturedTotalKg: number): EnergyState {
  const hours = intervalSeconds / 3_600
  const regenerationIncrement = phase === 'regeneration' ? desorbedCo2Kg * simulationAssumptions.regenerationEnergyKWhPerKgCo2 : 0
  const gasHandlingIncrement = inlet.flowRate * simulationAssumptions.gasHandlingKWhPerNm3 * hours
  const coolingDelta = Math.max(0, inlet.temperature - simulationAssumptions.adsorptionTemperatureC)
  const coolingIncrement = inlet.flowRate * coolingDelta * simulationAssumptions.coolingKWhPerNm3C * hours
  const auxiliariesIncrement = inlet.flowRate * simulationAssumptions.auxiliaryKWhPerNm3 * hours
  const regenerationEnergy = Math.max(0, previous.regenerationEnergy + regenerationIncrement)
  const gasHandlingEnergy = Math.max(0, previous.gasHandlingEnergy + gasHandlingIncrement)
  const coolingEnergy = Math.max(0, previous.coolingEnergy + coolingIncrement)
  const auxiliariesEnergy = Math.max(0, previous.auxiliariesEnergy + auxiliariesIncrement)
  const totalEnergy = regenerationEnergy + gasHandlingEnergy + coolingEnergy + auxiliariesEnergy
  const energyPerTonneCO2 = capturedTotalKg > 0 ? totalEnergy / (capturedTotalKg / 1_000) : 0

  return { regenerationEnergy, gasHandlingEnergy, coolingEnergy, auxiliariesEnergy, totalEnergy, energyPerTonneCO2 }
}

export function finiteNonNegativeState<T extends Record<string, unknown>>(state: T): T {
  const visit = (value: unknown): unknown => {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, value) : 0
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, visit(nested)]))
    }
    return value
  }
  return visit(state) as T
}
