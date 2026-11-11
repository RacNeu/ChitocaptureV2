import type { FuelType, GridRegion } from './types'

/**
 * Grid emission factors from the Energy Commission (Suruhanjaya Tenaga), "Grid Emission Factor (GEF)
 * in Malaysia", 2022 values (t CO₂/MWh = kg CO₂/kWh), the figures used by Bursa Malaysia's SEDG GHG
 * calculator for 2022 onwards. Fuel factors are IPCC 2006 default combustion values for CO₂.
 * Every factor is editable in Settings; check for newer publications before reporting.
 */
export const gridRegions: readonly GridRegion[] = [
  { id: 'my-peninsular', label: 'Peninsular Malaysia', kgPerKWh: 0.774, note: 'Energy Commission GEF 2022 (0.774 t CO₂/MWh). The Single Buyer’s 2024 figure for Peninsular Malaysia is 0.740; check for newer official values before reporting.' },
  { id: 'my-sabah', label: 'Sabah', kgPerKWh: 0.525, note: 'Energy Commission GEF 2022 (0.525 t CO₂/MWh).' },
  { id: 'my-sarawak', label: 'Sarawak', kgPerKWh: 0.199, note: 'Energy Commission GEF 2022 (0.199 t CO₂/MWh), low because of hydropower.' },
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
