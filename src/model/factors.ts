import type { FuelType, GridRegion } from './types'

/**
 * Default factors. These are starting points so the demo works out of the box.
 * Grid factors were entered from the Energy Commission's provisional grid emission factor
 * publication in the earlier prototype and have NOT been re-verified here.
 * Fuel factors follow commonly used IPCC 2006 default combustion values for CO₂.
 * Every factor is editable in Settings and must be checked before real reporting.
 */
export const gridRegions: readonly GridRegion[] = [
  { id: 'my-peninsular', label: 'Peninsular Malaysia', kgPerKWh: 0.74, note: 'Provisional value carried over from the prototype; verify against the latest Energy Commission GEF publication.' },
  { id: 'my-sabah', label: 'Sabah', kgPerKWh: 0.539, note: 'Provisional value carried over from the prototype; verify against the latest Energy Commission GEF publication.' },
  { id: 'custom', label: 'Custom factor', kgPerKWh: 0.5, note: 'Enter your own sourced grid factor.' },
]

export const fuelFactorsKgPerGJ: Record<FuelType, number> = {
  none: 0,
  coal: 94.6,
  'natural-gas': 56.1,
  diesel: 74.1,
  'fuel-oil': 77.4,
  // Biogenic CO₂ from biomass is reported separately and not counted in the gross total here.
  biomass: 0,
}

export const fuelLabels: Record<FuelType, string> = {
  none: 'No fuel',
  coal: 'Coal',
  'natural-gas': 'Natural gas',
  diesel: 'Diesel',
  'fuel-oil': 'Fuel oil',
  biomass: 'Biomass',
}

export function gridFactor(regionId: string, custom: number): number {
  if (regionId === 'custom') return custom
  return gridRegions.find((region) => region.id === regionId)?.kgPerKWh ?? custom
}
