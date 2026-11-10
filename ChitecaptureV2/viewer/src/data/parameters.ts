import type { ModelParameter, ParameterCategory, ParameterValue } from '../types/parameters'
import { registerParameterSource } from './sources'

const ASSUMPTION_SOURCE = 'SRC-TO-VERIFY'
const SIMULATION_SOURCE = 'SRC-SIMULATION-CONFIG'

const parameterList: ModelParameter[] = [
  { id: 'industry', name: 'Industry', value: 'Cement', unit: '', category: 'SOURCE CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'emission-source', name: 'Emission source', value: 'Cement kiln', unit: '', category: 'SOURCE CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'site', name: 'Site', value: 'Malaysia (Sample Plant)', unit: '', category: 'SOURCE CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'product-output-rate', name: 'Product output rate', value: 'Not yet specified', unit: 't product/day', category: 'SOURCE CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },

    { id: 'feed-co2-concentration', name: 'CO₂ concentration', value: 22, unit: 'vol %', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-flow-rate', name: 'Flue gas flow rate', value: 150_000, unit: 'Nm³/h', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-temperature', name: 'Temperature', value: 180, unit: '°C', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-pressure', name: 'Pressure', value: 1.2, unit: 'bar', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-humidity', name: 'Humidity', value: 12, unit: '% RH', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-so2', name: 'SO₂', value: 120, unit: 'ppm', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-nox', name: 'NOₓ', value: 90, unit: 'ppm', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'feed-particulates', name: 'Particulates', value: 15, unit: 'mg/Nm³', category: 'FEED GAS CONDITIONS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },

  { id: 'adsorbent-material', name: 'Adsorbent material', value: 'XS-TEPA-700', unit: '', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'adsorption-temperature', name: 'Adsorption temperature', value: 40, unit: '°C', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'adsorption-capacity', name: 'Adsorption capacity', value: 4, unit: 'mmol/g', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'adsorbent-mass', name: 'Adsorbent mass', value: 1_000, unit: 'kg', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'regeneration-temperature', name: 'Regeneration temperature', value: 110, unit: '°C', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'regeneration-time', name: 'Regeneration time', value: 45, unit: 'min', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'cycle-duration', name: 'Cycle duration', value: 240, unit: 'min', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'operating-limit', name: 'Operating limit', value: 100, unit: '%', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },

  // Published experimental reference values. These are provenance records only;
  // the process engine continues to use the separate scenario assumption above.
  { id: 'literature-reference-capacity', name: 'Literature reference capacity (10 °C, 1 bar)', value: 4.68, unit: 'mmol/g', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'literature-adsorption-temperature', name: 'Literature adsorption temperature', value: 10, unit: '°C', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'literature-adsorption-pressure', name: 'Literature adsorption pressure', value: 1, unit: 'bar', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'literature-surface-area-series-maximum', name: 'Study series maximum surface area (not CS-TEPA-700-specific)', value: 1028, unit: 'm²/g', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'literature-ultramicropore-volume', name: 'CS-TEPA-700 ultramicropore volume', value: 0.19, unit: 'cm³/g', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'literature-regeneration-performance', name: 'Regeneration performance after 10 cycles', value: '>88%', unit: 'after 10 cycles', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'literature', sourceId: 'SRC-CS-TEPA-700-2026', editable: false, status: 'active' },
  { id: 'material-density', name: 'Material density', value: 'Not yet specified', unit: '', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },
  { id: 'literature-regeneration-temperature', name: 'Literature regeneration temperature', value: 'Not yet verified', unit: '', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },
  { id: 'literature-regeneration-energy', name: 'Literature regeneration energy', value: 'Not yet verified', unit: '', category: 'CHITOSAN CAPTURE UNIT', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },

  { id: 'simulated-seconds-per-update', name: 'Simulated seconds per update', value: 10, unit: 's/update', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'update-interval', name: 'Update interval', value: 1_000, unit: 'ms', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'initial-timestamp', name: 'Initial timestamp', value: '2026-04-01T00:00:00.000Z', unit: 'ISO 8601', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'initial-loading', name: 'Initial adsorbent loading', value: 0, unit: 'mmol/g', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'initial-cycle-count', name: 'Initial cycle count', value: 1, unit: 'cycles', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'first-cycle-date', name: 'First cycle date', value: '2026-04-01T00:00:00.000Z', unit: 'ISO 8601', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'target-capture-efficiency', name: 'Target capture efficiency', value: 78.4, unit: '%', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'capture-efficiency-drift', name: 'Capture efficiency drift', value: 0.2, unit: 'percentage points', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'capture-efficiency-drift-period', name: 'Capture efficiency drift period', value: 180_000, unit: 'ms', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-slow-variation-period', name: 'Feed slow variation period', value: 90_000_000, unit: 'ms', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-fast-variation-period', name: 'Feed fast variation period', value: 23_400_000, unit: 'ms', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-co2-variation', name: 'Feed CO₂ variation amplitude', value: 0.15, unit: 'percentage points', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-flow-variation', name: 'Feed flow variation amplitude', value: 0.02, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-temperature-variation', name: 'Feed temperature variation amplitude', value: 1.5, unit: '°C', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-pressure-variation', name: 'Feed pressure variation amplitude', value: 0.005, unit: 'bar', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-humidity-variation', name: 'Feed humidity variation amplitude', value: 1.2, unit: '% RH', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-so2-variation', name: 'Feed SO₂ variation amplitude', value: 0.5, unit: 'ppm', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-nox-variation', name: 'Feed NOₓ variation amplitude', value: 0.4, unit: 'ppm', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'inlet-particulates-variation', name: 'Feed particulate variation amplitude', value: 0.05, unit: 'mg/Nm³', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'regeneration-energy-rate', name: 'Regeneration energy rate', value: 0.95, unit: 'kWh/kg CO₂', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'loading-performance-loss', name: 'Capture-rate loss at full adsorbent loading', value: 0.65, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'equivalence-tree-co2-kg-year', name: 'Illustrative tree CO₂ absorption', value: 21, unit: 'kg CO₂/tree/year', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },
  { id: 'equivalence-car-co2-tonnes-year', name: 'Illustrative passenger car CO₂ emissions', value: 4.6, unit: 't CO₂/car/year', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: false, status: 'needs-verification' },
  { id: 'gas-handling-energy-rate', name: 'Gas handling energy rate', value: 0.00015, unit: 'kWh/Nm³', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'cooling-energy-rate', name: 'Cooling energy rate', value: 0.00001, unit: 'kWh/Nm³/°C', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'auxiliary-energy-rate', name: 'Auxiliary energy rate', value: 0.00003, unit: 'kWh/Nm³', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-pressure-drop', name: 'Outlet pressure drop', value: 0.04, unit: 'bar', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-humidity-fraction', name: 'Outlet humidity fraction', value: 0.85, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'sulfur-removal-fraction', name: 'Sulfur removal fraction', value: 0.85, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'nox-removal-fraction', name: 'NOₓ removal fraction', value: 0.03, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'particulate-removal-fraction', name: 'Particulate removal fraction', value: 0.9, unit: 'fraction', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-temperature-time-constant', name: 'Outlet temperature response time', value: 180, unit: 's', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-temperature-adsorption-offset', name: 'Outlet temperature offset during adsorption', value: 2, unit: '°C', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-temperature-regeneration-offset', name: 'Outlet temperature offset during regeneration', value: 10, unit: '°C', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-pressure-time-constant', name: 'Outlet pressure response time', value: 240, unit: 's', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'outlet-humidity-time-constant', name: 'Outlet humidity response time', value: 240, unit: 's', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'regeneration-warmup-time', name: 'Regeneration warmup time', value: 480, unit: 's', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'regeneration-cooldown-time', name: 'Regeneration cooldown time', value: 300, unit: 's', category: 'SIMULATION CONFIGURATION', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'mass-balance-tolerance', name: 'Mass balance tolerance', value: 1e-7, unit: 'kg', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },
  { id: 'particle-reference-flow', name: 'Particle animation reference flow', value: 150_000, unit: 'Nm³/h', category: 'SIMULATION CONFIGURATION', sourceType: 'simulated', sourceId: SIMULATION_SOURCE, editable: true, status: 'prototype' },

  { id: 'co2-molar-mass', name: 'CO₂ molar mass', value: 44.01, unit: 'g/mol', category: 'PHYSICAL CONSTANTS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
  { id: 'co2-density', name: 'CO₂ density at normal conditions', value: 1.964, unit: 'kg/Nm³', category: 'PHYSICAL CONSTANTS', sourceType: 'assumption', sourceId: ASSUMPTION_SOURCE, editable: true, status: 'needs-verification' },
]

const STORAGE_KEY = 'chitocapture.captureParameters.v1'
if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const registered = JSON.parse(saved) as ModelParameter[]
      for (const item of registered) {
        const parameter = parameterList.find((entry) => entry.id === item.id)
        if (parameter?.editable && typeof parameter.value === typeof item.value) Object.assign(parameter, item)
      }
    }
  } catch { /* Keep the bundled prototype defaults if saved data is unavailable. */ }
}

const parametersById = new Map(parameterList.map((parameter) => [parameter.id, parameter]))
const listeners = new Set<() => void>()
let parameterRevision = 0
let scopedOverrides: Record<string, ParameterValue> | null = null

function persistRegisteredParameters() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(parameterList.filter((parameter) => parameter.category !== 'SIMULATION CONFIGURATION' && parameter.category !== 'PHYSICAL CONSTANTS')))
  } catch { /* The in-memory registry remains available if browser storage is unavailable. */ }
}

export function getParameter(id: string): ModelParameter | undefined {
  const parameter = parametersById.get(id)
  return parameter ? { ...parameter } : undefined
}

export function getParametersByCategory(category: ParameterCategory): ModelParameter[] {
  return parameterList.filter((parameter) => parameter.category === category).map((parameter) => ({ ...parameter }))
}

export function getAllParameters(): ModelParameter[] {
  return parameterList.map((parameter) => ({ ...parameter }))
}

export function readNumberParameter(id: string): number {
  const parameter = parametersById.get(id)
  if (!parameter) throw new Error(`Unknown model parameter: ${id}`)
  const value = scopedOverrides && id in scopedOverrides ? scopedOverrides[id] : parameter.value
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`Model parameter ${id} must be a finite number`)
  return value
}

export function readStringParameter(id: string): string {
  const parameter = parametersById.get(id)
  if (!parameter) throw new Error(`Unknown model parameter: ${id}`)
  const value = scopedOverrides && id in scopedOverrides ? scopedOverrides[id] : parameter.value
  if (typeof value !== 'string') throw new TypeError(`Model parameter ${id} must be a string`)
  return value
}

/** Run a calculation against temporary inputs without mutating the registered values. */
export function withParameterOverrides<T>(overrides: Record<string, ParameterValue>, run: () => T): T {
  const previous = scopedOverrides
  scopedOverrides = { ...previous, ...overrides }
  try { return run() } finally { scopedOverrides = previous }
}

export function updateParameter(id: string, value: ParameterValue): ModelParameter {
  const parameter = parametersById.get(id)
  if (!parameter) throw new Error(`Unknown model parameter: ${id}`)
  if (!parameter.editable) throw new Error(`Model parameter ${id} is read-only`)
  if (typeof parameter.value !== typeof value) throw new TypeError(`Model parameter ${id} must retain its ${typeof parameter.value} value type`)
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`Model parameter ${id} must be finite`)
  parameter.value = value
  parameterRevision += 1
  persistRegisteredParameters()
  listeners.forEach((listener) => listener())
  return { ...parameter }
}

export type RegisteredParameterUpdate = Pick<ModelParameter, 'sourceType'> & Partial<Pick<ModelParameter, 'sourceId' | 'sourceTitle' | 'sourcePublisher' | 'sourceYear' | 'sourceUrl' | 'sourceDetails' | 'measurementPeriod' | 'notes' | 'status'>>

/** Explicitly register a value and its provenance in the shared capture registry. */
export function registerParameter(id: string, value: ParameterValue, provenance: RegisteredParameterUpdate): ModelParameter {
  const parameter = parametersById.get(id)
  if (!parameter) throw new Error(`Unknown model parameter: ${id}`)
  if (!parameter.editable) throw new Error(`Model parameter ${id} is read-only`)
  if (typeof parameter.value !== typeof value) throw new TypeError(`Model parameter ${id} must retain its ${typeof parameter.value} value type`)
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError(`Model parameter ${id} must be finite`)
  if (provenance.sourceType === 'literature' && (!provenance.sourceId || !provenance.sourceTitle)) throw new Error('Literature data requires a source ID and title.')
  parameter.value = value
  parameter.sourceType = provenance.sourceType
  const defaultSourceId = provenance.sourceType === 'company-data' && provenance.sourceTitle?.trim()
    ? `SRC-COMPANY-${id.toUpperCase()}-${Date.now()}`
    : 'SRC-TO-VERIFY'
  parameter.sourceId = provenance.sourceId?.trim() || defaultSourceId
  parameter.sourceTitle = provenance.sourceTitle?.trim() || undefined
  parameter.sourcePublisher = provenance.sourcePublisher?.trim() || undefined
  parameter.sourceYear = provenance.sourceYear ?? null
  parameter.sourceUrl = provenance.sourceUrl?.trim() || undefined
  parameter.sourceDetails = provenance.sourceDetails?.trim() || undefined
  parameter.measurementPeriod = provenance.measurementPeriod?.trim() || undefined
  parameter.notes = provenance.notes?.trim() || undefined
  parameter.status = provenance.status ?? (provenance.sourceType === 'assumption' || provenance.sourceType === 'literature' ? 'needs-verification' : 'active')
  parameter.updatedAt = new Date().toISOString()
  if (parameter.sourceId !== 'SRC-TO-VERIFY' && (parameter.sourceType === 'company-data' || parameter.sourceType === 'literature')) {
    registerParameterSource({ sourceId: parameter.sourceId, title: parameter.sourceTitle || 'SOURCE TO BE VERIFIED', sourceType: parameter.sourceType, publisher: parameter.sourcePublisher || (parameter.sourceType === 'company-data' ? 'Company-provided record' : 'Not supplied'), year: parameter.sourceYear ?? null, reference: parameter.sourceDetails || 'Not supplied', url: parameter.sourceUrl, verificationStatus: parameter.sourceType === 'literature' && parameter.status === 'active' ? 'verified' : 'needs-verification', notes: parameter.sourceType === 'literature' ? `User-entered source for ${parameter.name}; verify before treating this value as literature-derived.` : parameter.notes || 'Company-provided value; measurement method and traceability should be checked by the organisation.' })
  }
  parameterRevision += 1
  persistRegisteredParameters()
  listeners.forEach((listener) => listener())
  return { ...parameter }
}

export function subscribeToParameters(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getParameterRevision(): number {
  return parameterRevision
}
