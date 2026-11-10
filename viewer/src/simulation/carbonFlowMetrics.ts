import type { ScenarioResult } from './scenarioRunner'

export type CarbonFlowTotals = {
  inputTonnes: number
  capturedTonnes: number
  remainingTonnes: number
  captureEfficiency: number
  capturedPercent: number
  remainingPercent: number
  balanceErrorTonnes: number
  isBalanced: boolean
}

export type CarbonFlowEnergyTotals = {
  totalEnergyMWh: number
  regenerationMWh: number
  gasHandlingMWh: number
  auxiliariesMWh: number
  energyIntensityKWhPerTonne: number
  averageDailyKWh: number
  balanceErrorMWh: number
  isBalanced: boolean
}

export function getCarbonFlowTotals(result: ScenarioResult, relativeTolerance = 1e-9): CarbonFlowTotals {
  const inputTonnes = result.inputTonnes
  const capturedTonnes = result.capturedTonnes
  const remainingTonnes = result.remainingTonnes
  const captureEfficiency = inputTonnes > 0 ? capturedTonnes / inputTonnes * 100 : 0
  const capturedPercent = inputTonnes > 0 ? capturedTonnes / inputTonnes * 100 : 0
  const remainingPercent = inputTonnes > 0 ? remainingTonnes / inputTonnes * 100 : 0
  const balanceErrorTonnes = Math.abs(inputTonnes - capturedTonnes - remainingTonnes)
  const tolerance = Math.max(1e-7, inputTonnes * relativeTolerance)
  const isBalanced = Number.isFinite(inputTonnes) && Number.isFinite(capturedTonnes) && Number.isFinite(remainingTonnes)
    && inputTonnes >= 0 && capturedTonnes >= 0 && remainingTonnes >= 0
    && capturedTonnes <= inputTonnes + tolerance
    && remainingTonnes >= 0
    && balanceErrorTonnes <= tolerance
    && (inputTonnes === 0 || Math.abs(capturedPercent + remainingPercent - 100) <= 1e-7)

  return { inputTonnes, capturedTonnes, remainingTonnes, captureEfficiency, capturedPercent, remainingPercent, balanceErrorTonnes, isBalanced }
}

export function getCarbonFlowEnergyTotals(result: ScenarioResult, relativeTolerance = 1e-9): CarbonFlowEnergyTotals {
  const totalEnergyMWh = result.samples.reduce((total, sample) => total + sample.energyMWh, 0)
  const regenerationMWh = result.samples.reduce((total, sample) => total + (sample.regenerationEnergyMWh ?? 0), 0)
  const hasGasHandlingBreakdown = result.samples.some((sample) => Number.isFinite(sample.gasHandlingEnergyMWh))
  const gasHandlingMWh = result.samples.reduce((total, sample) => total + (
    Number.isFinite(sample.gasHandlingEnergyMWh)
      ? sample.gasHandlingEnergyMWh
      : hasGasHandlingBreakdown ? 0 : Math.max(0, sample.energyMWh - (sample.regenerationEnergyMWh ?? 0))
  ), 0)
  const auxiliariesMWh = result.samples.reduce((total, sample) => total + (sample.coolingEnergyMWh ?? 0) + (sample.auxiliariesEnergyMWh ?? 0), 0)
  const balanceErrorMWh = Math.abs(totalEnergyMWh - regenerationMWh - gasHandlingMWh - auxiliariesMWh)
  const tolerance = Math.max(1e-8, totalEnergyMWh * relativeTolerance)
  return {
    totalEnergyMWh,
    regenerationMWh,
    gasHandlingMWh,
    auxiliariesMWh,
    energyIntensityKWhPerTonne: result.capturedTonnes > 0 ? totalEnergyMWh * 1_000 / result.capturedTonnes : 0,
    averageDailyKWh: totalEnergyMWh * 1_000 / (result.period === 'weekly' ? 7 : result.period === 'monthly' ? 30 : 365),
    balanceErrorMWh,
    isBalanced: [totalEnergyMWh, regenerationMWh, gasHandlingMWh, auxiliariesMWh].every(Number.isFinite)
      && [totalEnergyMWh, regenerationMWh, gasHandlingMWh, auxiliariesMWh].every((value) => value >= 0)
      && balanceErrorMWh <= tolerance,
  }
}
