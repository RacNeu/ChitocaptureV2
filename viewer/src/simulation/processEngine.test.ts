import { describe, expect, it } from 'vitest'
import { createInitialProcessState, advanceProcessState } from './processEngine'
import { captureEfficiencyPercentage, co2CapacityKg } from './calculations'
import { literatureData } from '../data/literatureData'
import { simulationAssumptions } from '../data/assumptions'
import type { ProcessState } from '../types/process'

function expectFiniteNonNegative(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
  } else if (Array.isArray(value)) {
    value.forEach(expectFiniteNonNegative)
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(expectFiniteNonNegative)
  }
}

describe('carbon capture process engine', () => {
  it('keeps the cumulative carbon mass balance closed', () => {
    let state = createInitialProcessState()
    for (let index = 0; index < 20; index += 1) {
      state = advanceProcessState(state)
      expect(state.carbon.co2Input).toBeCloseTo(state.carbon.co2Captured + state.carbon.co2Remaining, 7)
    }
  })

  it('calculates capture efficiency from captured and input CO₂', () => {
    expect(captureEfficiencyPercentage(78.4, 100)).toBeCloseTo(78.4)
    expect(captureEfficiencyPercentage(120, 100)).toBe(100)
    expect(captureEfficiencyPercentage(0, 0)).toBe(0)
  })

  it('respects adsorbent capacity and transitions to regeneration at the limit', () => {
    let state = createInitialProcessState()
    state = advanceProcessState(state, 10)
    expect(state.phase).toBe('adsorption')
    state = advanceProcessState(state, 10)
    expect(state.phase).toBe('regeneration')
    expect(state.adsorbent.loadingPercentage).toBe(100)
    expect(state.adsorbent.currentLoading).toBeCloseTo(state.adsorbent.capacity)
    expect(state.carbon.co2Captured).toBeLessThanOrEqual(co2CapacityKg(state.adsorbent.massKg, state.adsorbent.capacity))
  })

  it('completes regeneration, returns to adsorption, and increments the cycle count', () => {
    const base = createInitialProcessState()
    const regenerating: ProcessState = {
      ...base,
      phase: 'regeneration',
      adsorbent: {
        ...base.adsorbent,
        currentLoading: 2,
        loadingPercentage: 50,
        regenerationElapsed: base.adsorbent.regenerationDuration - 10,
      },
      carbon: { co2Input: 100, co2Captured: 70, co2Remaining: 30, captureEfficiency: 70, tankInventory: 0, co2DesorptionRate: 0 },
    }
    const next = advanceProcessState(regenerating, 10)
    expect(next.phase).toBe('adsorption')
    expect(next.adsorbent.cycleCount).toBe(base.adsorbent.cycleCount + 1)
    expect(next.adsorbent.loadingPercentage).toBe(0)
    expect(next.carbon.tankInventory).toBeGreaterThan(0)
    expect(next.energy.regenerationEnergy).toBeGreaterThan(0)
    expect(next.carbon.co2DesorptionRate).toBeGreaterThan(0)
    expect(next.energy.totalEnergy).toBeCloseTo(
      next.energy.regenerationEnergy + next.energy.gasHandlingEnergy + next.energy.coolingEnergy + next.energy.auxiliariesEnergy,
    )
    expect(next.energy.energyPerTonneCO2).toBeCloseTo(next.energy.totalEnergy / (next.carbon.co2Captured / 1_000))
  })

  it('keeps outlet CO₂ below inlet CO₂ during adsorption', () => {
    const next = advanceProcessState(createInitialProcessState(), 10)
    expect(next.phase).toBe('adsorption')
    expect(next.outlet.co2Concentration).toBeLessThan(next.inlet.co2Concentration)
    expect(next.outlet.flowRate).toBeLessThan(next.inlet.flowRate)
  })

  it('keeps every reading finite and nonnegative over extended simulated operation', () => {
    let state = createInitialProcessState()
    for (let index = 0; index < 2_000; index += 1) state = advanceProcessState(state)
    expectFiniteNonNegative(state)
    expect(state.carbon.captureEfficiency).toBeLessThanOrEqual(100)
    expect(state.carbon.co2Input).toBeCloseTo(state.carbon.co2Captured + state.carbon.co2Remaining, 7)
  })

  it('uses the configured cement kiln and adsorbent example conditions', () => {
    const state = createInitialProcessState()
    expect(state.inlet.flowRate).toBe(simulationAssumptions.inlet.flowRate)
    expect(state.inlet.co2Concentration).toBe(simulationAssumptions.inlet.co2Concentration)
    expect(state.adsorbent.material).toBe(literatureData.adsorbentMaterial)
    expect(state.adsorbent.capacity).toBe(literatureData.referenceAdsorptionCapacityMmolPerG)
    expect(state.adsorbent.firstCycleDate).toBe(simulationAssumptions.firstCycleDate)
  })
})
