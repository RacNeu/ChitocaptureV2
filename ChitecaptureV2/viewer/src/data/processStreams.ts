import type { GasReadings, ProcessMetric, ProcessStream } from '../types/process'

const metricFields: Array<{ key: keyof GasReadings; label: string; unit: string; icon: ProcessMetric['icon']; decimals: number }> = [
  { key: 'co2Concentration', label: 'CO₂ concentration', unit: 'vol %', icon: 'co2', decimals: 2 },
  { key: 'flowRate', label: 'Flow rate', unit: 'Nm³/h', icon: 'flow', decimals: 0 },
  { key: 'temperature', label: 'Temperature', unit: '°C', icon: 'temperature', decimals: 1 },
  { key: 'pressure', label: 'Pressure', unit: 'bar', icon: 'pressure', decimals: 3 },
  { key: 'humidity', label: 'Humidity', unit: '% RH', icon: 'humidity', decimals: 2 },
  { key: 'so2', label: 'SO₂', unit: 'ppm', icon: 'sulfur', decimals: 1 },
  { key: 'nox', label: 'NOₓ', unit: 'ppm', icon: 'nitrogen', decimals: 1 },
  { key: 'particulates', label: 'Particulates', unit: 'mg/Nm³', icon: 'particles', decimals: 2 },
]

function formatReading(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

export function makeProcessStream(readings: GasReadings, direction: 'inlet' | 'outlet'): ProcessStream {
  return {
    title: direction === 'inlet' ? 'Flue gas inlet' : 'Treated flue gas',
    subtitle: direction === 'inlet' ? 'Upstream of pre-treatment' : 'Downstream of adsorber',
    direction,
    metrics: metricFields.map((field) => ({
      label: field.label,
      value: formatReading(readings[field.key], field.decimals),
      unit: field.unit,
      icon: field.icon,
    })),
  }
}
