import type { ScenarioResult } from './scenarioRunner'

const STORAGE_KEY = 'chitocapture.activeScenario.v3'
const listeners = new Set<() => void>()

function readSavedResult(): ScenarioResult | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = window.sessionStorage.getItem(STORAGE_KEY)
    if (!saved) return null
    const result = JSON.parse(saved) as ScenarioResult
    if (result.snapshot?.site === 'Not specified' || /taipei|taiwan/i.test(result.snapshot?.site ?? '')) {
      result.snapshot.site = 'Malaysia (Sample Plant)'
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result))
    }
    return result
  } catch {
    return null
  }
}

let activeResult = readSavedResult()

export function getActiveScenarioResult(): ScenarioResult | null {
  return activeResult
}

export function setActiveScenarioResult(result: ScenarioResult): void {
  activeResult = result
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result))
  } catch {
    // Keep the current result available for this page even when storage is unavailable.
  }
  listeners.forEach((listener) => listener())
}

export function subscribeToActiveScenario(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
