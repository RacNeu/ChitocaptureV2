import { describe, expect, it } from 'vitest'
import { getAllParameters, getParameter, getParametersByCategory, registerParameter, updateParameter } from './parameters'
import { advanceProcessState, createInitialProcessState } from '../simulation/processEngine'
import { retainedParticleCount } from '../simulation/processVisualState'

describe('central parameter registry', () => {
  it('provides complete metadata for model parameters', () => {
    const parameters = getAllParameters()
    expect(parameters.length).toBeGreaterThan(0)
    for (const parameter of parameters) {
      expect(parameter).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        unit: expect.any(String),
        category: expect.any(String),
        sourceType: expect.stringMatching(/^(literature|company-data|assumption|simulated)$/),
        sourceId: expect.any(String),
        editable: expect.any(Boolean),
        status: expect.any(String),
      }))
      expect(typeof parameter.value).toMatch(/^(string|number)$/)
    }
    expect(getParametersByCategory('FEED GAS CONDITIONS')).toHaveLength(8)
  })

  it('applies an edited feed parameter to the next simulation step', () => {
    const initialFlow = getParameter('feed-flow-rate')!.value as number
    const originalState = createInitialProcessState()
    const baseline = advanceProcessState(originalState, 10)

    try {
      updateParameter('feed-flow-rate', initialFlow * 1.5)
      const updated = advanceProcessState(originalState, 10)
      expect(updated.inlet.flowRate).toBeGreaterThan(baseline.inlet.flowRate)
      expect(updated.carbon.co2Input).toBeGreaterThan(baseline.carbon.co2Input)
    } finally {
      updateParameter('feed-flow-rate', initialFlow)
    }
  })

  it('updates CO₂ input, capture, and bed visualization when concentration drops from 22% to 20%', () => {
    const configuredConcentration = getParameter('feed-co2-concentration')!.value as number
    expect(configuredConcentration).toBe(22)
    const initialState = createInitialProcessState()
    const baseline = advanceProcessState(initialState, 10)

    try {
      updateParameter('feed-co2-concentration', 20)
      const reducedConcentration = advanceProcessState(initialState, 10)
      expect(reducedConcentration.inlet.co2Concentration).toBeLessThan(baseline.inlet.co2Concentration)
      expect(reducedConcentration.carbon.co2Input).toBeLessThan(baseline.carbon.co2Input)
      expect(reducedConcentration.carbon.co2Captured).toBeLessThan(baseline.carbon.co2Captured)
      expect(reducedConcentration.adsorbent.loadingPercentage).toBeLessThan(baseline.adsorbent.loadingPercentage)
      expect(retainedParticleCount(reducedConcentration.adsorbent.loadingPercentage)).toBeLessThan(retainedParticleCount(baseline.adsorbent.loadingPercentage))
    } finally {
      updateParameter('feed-co2-concentration', configuredConcentration)
    }
    expect(getParameter('feed-co2-concentration')?.value).toBe(22)
  })

  it('does not expose calculated outputs as editable parameters', () => {
    for (const outputId of ['co2-captured', 'capture-efficiency', 'co2-remaining', 'energy-consumption', 'energy-per-tonne-co2', 'emission-reduction']) {
      expect(getParameter(outputId)).toBeUndefined()
    }
  })

  it('registers company capture data in the shared parameter record', () => {
    const original = getParameter('feed-co2-concentration')!
    try {
      registerParameter('feed-co2-concentration', 19.4, { sourceType: 'company-data', sourceId: 'TEST-KILN-LAB', sourceTitle: 'Kiln laboratory report', measurementPeriod: '2026-09' })
      expect(getParameter('feed-co2-concentration')).toEqual(expect.objectContaining({ value: 19.4, sourceType: 'company-data', sourceId: 'TEST-KILN-LAB', sourceTitle: 'Kiln laboratory report', measurementPeriod: '2026-09' }))
    } finally {
      registerParameter('feed-co2-concentration', original.value, { sourceType: original.sourceType, sourceId: original.sourceId, sourceTitle: original.sourceTitle, sourceDetails: original.sourceDetails, measurementPeriod: original.measurementPeriod, notes: original.notes })
    }
  })
})
