import { simulationAssumptions } from '../data/assumptions'
import { literatureData } from '../data/literatureData'
import type { GasReadings, ProcessState } from '../types/process'
import { calculateEnergy, captureEfficiencyPercentage, clamp, co2CapacityKg, co2InputForIntervalKg, createOutletReadings, currentLoadingMmolPerG, finiteNonNegativeState } from './calculations'
import { simulateAdsorptionStep, targetCaptureEfficiency } from './adsorptionModel'
import { simulateRegenerationStep } from './regenerationModel'

function inletAt(timestampMs: number): GasReadings {
  const base = simulationAssumptions.inlet
  const slowWave = Math.sin(timestampMs / simulationAssumptions.inletSlowVariationPeriodMilliseconds)
  const fastWave = Math.sin(timestampMs / simulationAssumptions.inletFastVariationPeriodMilliseconds)
  return {
    co2Concentration: clamp(base.co2Concentration + slowWave * simulationAssumptions.inletCo2Variation, 0, 100),
    flowRate: Math.max(0, base.flowRate * (1 + fastWave * simulationAssumptions.inletFlowVariation)),
    temperature: Math.max(0, base.temperature + slowWave * simulationAssumptions.inletTemperatureVariation),
    pressure: Math.max(0, base.pressure + fastWave * simulationAssumptions.inletPressureVariation),
    humidity: Math.max(0, base.humidity + slowWave * simulationAssumptions.inletHumidityVariation),
    so2: Math.max(0, base.so2 + fastWave * simulationAssumptions.inletSo2Variation),
    nox: Math.max(0, base.nox + slowWave * simulationAssumptions.inletNoxVariation),
    particulates: Math.max(0, base.particulates + fastWave * simulationAssumptions.inletParticulatesVariation),
  }
}

export function createInitialProcessState(): ProcessState {
  const inlet = { ...simulationAssumptions.inlet }
  const capacityKg = co2CapacityKg(simulationAssumptions.adsorbentMassKg, literatureData.referenceAdsorptionCapacityMmolPerG)
  const inputKgPerSecond = co2InputForIntervalKg(inlet, 1)
  const initialCaptureRateKgPerSecond = inputKgPerSecond * simulationAssumptions.targetCaptureEfficiencyPercentage / 100
  const estimatedTimeToRegeneration = initialCaptureRateKgPerSecond > 0 ? capacityKg / initialCaptureRateKgPerSecond : simulationAssumptions.cycleDurationSeconds

  return {
    timestamp: simulationAssumptions.initialTimestamp,
    phase: 'adsorption',
    scenario: {
      industrialSource: simulationAssumptions.industrialSource,
      emissionSource: simulationAssumptions.emissionSource,
    },
    inlet,
    outlet: { ...inlet },
    adsorbent: {
      material: literatureData.adsorbentMaterial,
      adsorptionTemperature: simulationAssumptions.adsorptionTemperatureC,
      regenerationTemperature: simulationAssumptions.regenerationTemperatureC,
      currentRegenerationTemperature: simulationAssumptions.adsorptionTemperatureC,
      loadingPercentage: simulationAssumptions.initialLoadingMmolPerG / literatureData.referenceAdsorptionCapacityMmolPerG * 100,
      currentLoading: simulationAssumptions.initialLoadingMmolPerG,
      operatingLimit: simulationAssumptions.operatingLimitPercentage,
      capacity: literatureData.referenceAdsorptionCapacityMmolPerG,
      massKg: simulationAssumptions.adsorbentMassKg,
      adsorptionElapsed: 0,
      estimatedTimeToRegeneration,
      cycleDuration: simulationAssumptions.cycleDurationSeconds,
      regenerationElapsed: 0,
      regenerationDuration: simulationAssumptions.regenerationDurationSeconds,
      cycleCount: simulationAssumptions.initialCycleCount,
      firstCycleDate: simulationAssumptions.firstCycleDate,
    },
    carbon: {
      co2Input: 0,
      co2Captured: 0,
      co2Remaining: 0,
      captureEfficiency: 0,
      tankInventory: 0,
      co2DesorptionRate: 0,
    },
    energy: {
      regenerationEnergy: 0,
      gasHandlingEnergy: 0,
      coolingEnergy: 0,
      auxiliariesEnergy: 0,
      totalEnergy: 0,
      energyPerTonneCO2: 0,
    },
  }
}

export function advanceProcessState(state: ProcessState, intervalSeconds = simulationAssumptions.simulatedSecondsPerUpdate): ProcessState {
  const safeInterval = Math.max(0, Number.isFinite(intervalSeconds) ? intervalSeconds : 0)
  const timestampMs = Date.parse(state.timestamp) + safeInterval * 1_000
  const timestamp = new Date(timestampMs).toISOString()
  const inlet = inletAt(timestampMs)
  let phase = state.phase
  const configuredCapacity = literatureData.referenceAdsorptionCapacityMmolPerG
  const configuredMass = simulationAssumptions.adsorbentMassKg
  const storedCo2Kg = state.adsorbent.massKg * state.adsorbent.currentLoading * literatureData.co2MolarMassGramsPerMol / 1_000
  const configuredLoading = Math.min(configuredCapacity, currentLoadingMmolPerG(storedCo2Kg, configuredMass))
  let adsorbent = {
    ...state.adsorbent,
    material: literatureData.adsorbentMaterial,
    adsorptionTemperature: simulationAssumptions.adsorptionTemperatureC,
    regenerationTemperature: simulationAssumptions.regenerationTemperatureC,
    currentLoading: configuredLoading,
    loadingPercentage: configuredCapacity > 0 ? clamp(configuredLoading / configuredCapacity * 100, 0, 100) : 0,
    operatingLimit: simulationAssumptions.operatingLimitPercentage,
    capacity: configuredCapacity,
    massKg: configuredMass,
    cycleDuration: simulationAssumptions.cycleDurationSeconds,
    regenerationDuration: simulationAssumptions.regenerationDurationSeconds,
    firstCycleDate: simulationAssumptions.firstCycleDate,
  }
  let capturedThisIntervalKg = 0
  let desorbedThisIntervalKg = 0

  if (phase === 'adsorption') {
    const adsorption = simulateAdsorptionStep(adsorbent, inlet, safeInterval, targetCaptureEfficiency(timestampMs))
    capturedThisIntervalKg = adsorption.co2CapturedKg
    adsorbent = {
      ...adsorbent,
      currentLoading: adsorption.currentLoading,
      loadingPercentage: adsorption.loadingPercentage,
      currentRegenerationTemperature: adsorbent.adsorptionTemperature,
      adsorptionElapsed: adsorption.elapsedSeconds,
      estimatedTimeToRegeneration: adsorption.estimatedTimeToRegeneration,
    }
    if (adsorption.atLimit || adsorption.elapsedSeconds >= adsorbent.cycleDuration) {
      phase = 'regeneration'
      adsorbent.regenerationElapsed = 0
      adsorbent.estimatedTimeToRegeneration = 0
    }
  } else {
    const regeneration = simulateRegenerationStep(adsorbent, safeInterval)
    desorbedThisIntervalKg = regeneration.desorbedCo2Kg
    adsorbent = {
      ...adsorbent,
      currentLoading: regeneration.currentLoading,
      loadingPercentage: regeneration.loadingPercentage,
      regenerationElapsed: regeneration.elapsedSeconds,
      currentRegenerationTemperature: regeneration.temperature,
    }
    if (regeneration.complete) {
      phase = 'adsorption'
      adsorbent = {
        ...adsorbent,
        loadingPercentage: 0,
        currentLoading: 0,
        adsorptionElapsed: 0,
        estimatedTimeToRegeneration: adsorbent.cycleDuration,
        regenerationElapsed: 0,
        currentRegenerationTemperature: adsorbent.adsorptionTemperature,
        cycleCount: adsorbent.cycleCount + 1,
      }
    }
  }

  const co2InputThisIntervalKg = co2InputForIntervalKg(inlet, safeInterval)
  const co2Input = state.carbon.co2Input + co2InputThisIntervalKg
  const co2Captured = state.carbon.co2Captured + capturedThisIntervalKg
  const co2Remaining = Math.max(0, co2Input - co2Captured)
  const carbon = {
    co2Input,
    co2Captured,
    co2Remaining,
    captureEfficiency: captureEfficiencyPercentage(co2Captured, co2Input),
    tankInventory: Math.max(0, state.carbon.tankInventory + desorbedThisIntervalKg),
    co2DesorptionRate: safeInterval > 0 ? desorbedThisIntervalKg * 3_600 / safeInterval : 0,
  }
  const outlet = createOutletReadings(inlet, state.outlet, capturedThisIntervalKg, Math.max(safeInterval, 1e-9), state.phase)
  const energy = calculateEnergy(state.energy, inlet, safeInterval, desorbedThisIntervalKg, state.phase, carbon.co2Captured)

  return finiteNonNegativeState({ ...state, timestamp, phase, inlet, outlet, adsorbent, carbon, energy })
}
