import { describe, expect, it } from 'vitest'
import { flowParticleSpeed, filteredParticulateFraction, retainedParticleCount, unretainedCo2Fraction } from './processVisualState'

describe('process animation mappings', () => {
  it('maps adsorbent loading directly to a deterministic retained-particle count', () => {
    expect(retainedParticleCount(20)).toBe(7)
    expect(retainedParticleCount(50)).toBe(18)
    expect(retainedParticleCount(80)).toBe(29)
    expect(retainedParticleCount(100)).toBe(36)
    expect(retainedParticleCount(140)).toBe(36)
    expect(retainedParticleCount(-10)).toBe(0)
  })

  it('uses capture efficiency for outlet CO₂ during adsorption and releases the full stream during regeneration', () => {
    expect(unretainedCo2Fraction('adsorption', 0)).toBe(1)
    expect(unretainedCo2Fraction('adsorption', 78.4)).toBeCloseTo(0.216)
    expect(unretainedCo2Fraction('adsorption', 100)).toBe(0)
    expect(unretainedCo2Fraction('regeneration', 78.4)).toBe(1)
  })

  it('smoothly increases flow speed with inlet flow and clamps invalid rates', () => {
    expect(flowParticleSpeed(75_000)).toBeLessThan(flowParticleSpeed(150_000))
    expect(flowParticleSpeed(0)).toBe(0)
    expect(flowParticleSpeed(Number.NaN)).toBe(0)
  })

  it('retains only the particulate fraction measured after pre-treatment', () => {
    expect(filteredParticulateFraction(15, 1.5)).toBeCloseTo(0.1)
    expect(filteredParticulateFraction(15, 15)).toBe(1)
    expect(filteredParticulateFraction(0, 0)).toBe(1)
  })
})
