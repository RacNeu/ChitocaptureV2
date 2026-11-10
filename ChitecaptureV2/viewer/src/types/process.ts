export type ProcessPhase = 'adsorption' | 'regeneration'

export type GasReadings = {
  co2Concentration: number
  flowRate: number
  temperature: number
  pressure: number
  humidity: number
  so2: number
  nox: number
  particulates: number
}

export type ProcessState = {
  timestamp: string
  phase: ProcessPhase
  scenario: { industrialSource: string; emissionSource: string }
  inlet: GasReadings
  outlet: GasReadings
  adsorbent: {
    material: string
    adsorptionTemperature: number
    regenerationTemperature: number
    currentRegenerationTemperature: number
    loadingPercentage: number
    currentLoading: number
    operatingLimit: number
    capacity: number
    massKg: number
    adsorptionElapsed: number
    estimatedTimeToRegeneration: number
    cycleDuration: number
    regenerationElapsed: number
    regenerationDuration: number
    cycleCount: number
    firstCycleDate: string
  }
  carbon: {
    co2Input: number
    co2Captured: number
    co2Remaining: number
    captureEfficiency: number
    tankInventory: number
    co2DesorptionRate: number
  }
  energy: {
    regenerationEnergy: number
    gasHandlingEnergy: number
    coolingEnergy: number
    auxiliariesEnergy: number
    totalEnergy: number
    energyPerTonneCO2: number
  }
}

export type EnergyState = ProcessState['energy']

export type ProcessMetric = {
  label: string
  value: string
  unit?: string
  icon: 'co2' | 'flow' | 'temperature' | 'pressure' | 'humidity' | 'sulfur' | 'nitrogen' | 'particles'
}

export type ProcessStream = {
  title: string
  subtitle: string
  direction: 'inlet' | 'outlet'
  metrics: ProcessMetric[]
}
