import { describe, expect, it } from 'vitest'
import { validateScenarioDrafts } from './scenarioValidation'

const validDrafts: Record<string, string> = {
  'feed-co2-concentration': '22',
  'feed-flow-rate': '150000',
  'feed-temperature': '180',
  'feed-pressure': '1.2',
  'feed-humidity': '12',
  'feed-so2': '120',
  'feed-nox': '90',
  'feed-particulates': '15',
  'adsorption-temperature': '40',
  'adsorbent-mass': '1000',
  'adsorption-capacity': '4',
  'regeneration-temperature': '110',
  'cycle-duration': '4',
  'regeneration-time': '0.75',
}

describe('scenario input validation', () => {
  it('accepts the configured default scenario', () => {
    expect(validateScenarioDrafts(validDrafts)).toEqual({})
  })

  it('rejects zero CO₂ concentration and reports the field error', () => {
    expect(validateScenarioDrafts({ ...validDrafts, 'feed-co2-concentration': '0' })['feed-co2-concentration']).toContain('greater than 0')
  })

  it('allows zero humidity and rejects a regeneration time longer than the cycle', () => {
    expect(validateScenarioDrafts({ ...validDrafts, 'feed-humidity': '0' })['feed-humidity']).toBeUndefined()
    expect(validateScenarioDrafts({ ...validDrafts, 'regeneration-time': '4' })['regeneration-time']).toContain('less than cycle duration')
  })
})
