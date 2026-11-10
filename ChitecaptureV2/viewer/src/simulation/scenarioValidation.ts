export type ScenarioValidationRule = {
  min?: number
  max?: number
  minExclusive?: boolean
  message: string
}

export const scenarioValidationRules: Record<string, ScenarioValidationRule> = {
  'feed-co2-concentration': { min: 0, minExclusive: true, max: 50, message: 'Enter a CO₂ concentration greater than 0 and no more than 50%.' },
  'feed-flow-rate': { min: 0, minExclusive: true, message: 'Flow rate must be greater than 0.' },
  'feed-temperature': { min: -20, max: 500, message: 'Temperature must be between −20 and 500 °C.' },
  'feed-pressure': { min: 0, minExclusive: true, max: 100, message: 'Pressure must be greater than 0 and no more than 100 bar.' },
  'feed-humidity': { min: 0, max: 100, message: 'Humidity must be between 0 and 100%.' },
  'feed-so2': { min: 0, message: 'SO₂ must be 0 or greater.' },
  'feed-nox': { min: 0, message: 'NOₓ must be 0 or greater.' },
  'feed-particulates': { min: 0, message: 'Particulates must be 0 or greater.' },
  'adsorption-temperature': { min: -20, max: 200, message: 'Adsorption temperature must be between −20 and 200 °C.' },
  'adsorbent-mass': { min: 0, minExclusive: true, message: 'Adsorbent mass must be greater than 0.' },
  'adsorption-capacity': { min: 0, minExclusive: true, max: 100, message: 'Working capacity must be greater than 0 and no more than 100 mmol/g.' },
  'regeneration-temperature': { min: -20, max: 500, message: 'Regeneration temperature must be between −20 and 500 °C.' },
  'cycle-duration': { min: 0, minExclusive: true, message: 'Cycle duration must be greater than 0 hours.' },
  'regeneration-time': { min: 0, minExclusive: true, message: 'Regeneration time must be greater than 0 hours and less than cycle duration.' },
}

export function validateScenarioDrafts(drafts: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const [id, rule] of Object.entries(scenarioValidationRules)) {
    const text = drafts[id] ?? ''
    const value = Number(text)
    if (text === '' || !Number.isFinite(value)) {
      errors[id] = 'Enter a valid number.'
    } else if (rule.min !== undefined && (value < rule.min || (rule.minExclusive && value === rule.min))) {
      errors[id] = rule.message
    } else if (rule.max !== undefined && value > rule.max) {
      errors[id] = rule.message
    }
  }
  const cycleHours = Number(drafts['cycle-duration'])
  const regenerationHours = Number(drafts['regeneration-time'])
  if (Number.isFinite(cycleHours) && Number.isFinite(regenerationHours) && regenerationHours >= cycleHours) {
    errors['regeneration-time'] = 'Regeneration time must be less than cycle duration.'
  }
  return errors
}
