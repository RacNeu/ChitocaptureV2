import type { DataSource, ParameterSourceType } from '../types/parameters'

const sources: DataSource[] = [
  {
    sourceId: 'SRC-CS-TEPA-700-2026',
    title: 'High-efficiency CO₂ adsorption: unveiling the mechanism of porous carbons derived from TEPA-modified chitosan',
    sourceType: 'literature',
    publisher: 'Feng Zhang, Lu Yu, Suping Cui, Yali Wang, and Liwei Hao · Surfaces and Interfaces (Elsevier)',
    year: 2026,
    reference: 'Surfaces and Interfaces, article 110368. DOI: 10.1016/j.surfin.2026.110368',
    url: 'https://doi.org/10.1016/j.surfin.2026.110368',
    notes: 'Reports 4.68 mmol/g CO₂ uptake for CS-TEPA-700 at 10 °C and 1 bar; 0.19 cm³/g ultramicropore volume; regeneration performance above 88% after ten cycles. The 1028 m²/g surface area is the maximum across the study series, not verified here as specific to CS-TEPA-700. These laboratory values are references and are not the process model working capacity.',
  },
  {
    sourceId: 'SRC-TO-VERIFY',
    title: 'SOURCE TO BE VERIFIED',
    sourceType: 'assumption',
    publisher: 'Not supplied',
    year: null,
    reference: 'No verified publication or external reference entered.',
    notes: 'Placeholder for engineering assumptions and values that still need a supporting source.',
  },
  {
    sourceId: 'SRC-SIMULATION-CONFIG',
    title: 'ChitoCapture prototype simulation configuration',
    sourceType: 'simulated',
    publisher: 'ChitoCapture prototype',
    year: 2026,
    reference: 'Internal runtime and simulation settings; not an external publication.',
    notes: 'Configuration values used to run the prototype simulation.',
  },
]

const REGISTERED_SOURCES_KEY = 'chitocapture.captureSources.v1'
let registeredSources: DataSource[] = []
if (typeof window !== 'undefined') {
  try { registeredSources = JSON.parse(window.localStorage.getItem(REGISTERED_SOURCES_KEY) ?? '[]') as DataSource[] } catch { registeredSources = [] }
}

const sourceById = new Map(sources.map((source) => [source.sourceId, source]))

export function getSource(sourceId: string): DataSource | undefined {
  const source = [...registeredSources].reverse().find((item) => item.sourceId === sourceId) ?? sourceById.get(sourceId)
  return source ? { ...source } : undefined
}

export function getAllSources(): DataSource[] {
  const combined = new Map(sources.map((source) => [source.sourceId, source]))
  registeredSources.forEach((source) => combined.set(source.sourceId, source))
  return [...combined.values()].map((source) => ({ ...source }))
}

export function registerParameterSource(source: DataSource): void {
  const index = registeredSources.findIndex((item) => item.sourceId === source.sourceId)
  if (index >= 0) registeredSources[index] = { ...source }
  else registeredSources.push({ ...source })
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(REGISTERED_SOURCES_KEY, JSON.stringify(registeredSources)) } catch { /* In-memory source list remains available. */ }
  }
}

export function sourceTypeLabel(sourceType: ParameterSourceType): string {
  return sourceType === 'assumption' ? 'Assumed' : sourceType === 'literature' ? 'Literature' : sourceType === 'company-data' ? 'Company Data' : 'Simulated'
}
