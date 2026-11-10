import type { ProcessPhase } from '../types/process'
import { readNumberParameter } from '../data/parameters'

export function retainedParticleCount(loadingPercentage: number, particleCount = 36): number {
  const loading = Math.max(0, Math.min(100, Number.isFinite(loadingPercentage) ? loadingPercentage : 0))
  return Math.round(particleCount * loading / 100)
}

export function unretainedCo2Fraction(phase: ProcessPhase, captureEfficiency: number): number {
  if (phase === 'regeneration') return 1
  const efficiency = Math.max(0, Math.min(100, Number.isFinite(captureEfficiency) ? captureEfficiency : 0))
  return 1 - efficiency / 100
}

export function flowParticleSpeed(flowRate: number): number {
  return 0.2 * Math.sqrt(Math.max(0, Math.min(3, Number.isFinite(flowRate) ? flowRate / readNumberParameter('particle-reference-flow') : 0)))
}

export function filteredParticulateFraction(inlet: number, outlet: number): number {
  if (!(inlet > 0)) return 1
  const removal = Math.max(0, Math.min(1, 1 - outlet / inlet))
  return Math.max(0.05, 1 - removal)
}
