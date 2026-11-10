import { annualTonnes, defaultSteelParams as steel } from './steel'
import type { Machine } from './types'

export type IndustryTemplate = {
  id: string
  label: string
  icon: string
  blurb: string
  machines: Omit<Machine, 'id'>[]
}

/**
 * Illustrative sample factories. Every number is a round placeholder that only gives the
 * demo a realistic shape. Users replace them with their own meter and fuel data in step 2.
 */
const m = (name: string, kind: Machine['kind'], col: number, row: number, electricityMWh: number, fuel: Machine['fuel'] = 'none', fuelGJ = 0, processT = 0): Omit<Machine, 'id'> =>
  ({ name, kind, col, row, electricityMWh, fuel, fuelGJ, processT, quality: 'estimated' })

/** Steel mini-mill machines derived from the same model the control room runs, so both views agree. */
const steelT = annualTonnes(steel)
const mwh = (kwhPerT: number) => Math.round(kwhPerT * steelT / 1_000)

export const industryTemplates: readonly IndustryTemplate[] = [
  {
    id: 'steel',
    label: 'Steel mini-mill',
    icon: '🔩',
    blurb: 'Electric arc furnace route. First in line for the EU CBAM and Malaysia’s planned carbon tax.',
    machines: [
      m('Electric arc furnace', 'furnace', 0, 0, mwh(steel.kwhPerT.eaf), 'none', 0, Math.round(steel.eafDirectKgPerT * steelT / 1_000)),
      m('Ladle furnace', 'furnace', 1, 0, mwh(steel.kwhPerT.lf)),
      m('Continuous caster', 'production-line', 2, 0, mwh(steel.kwhPerT.caster)),
      m('Reheating furnace', 'furnace', 3, 0, 0, 'natural-gas', Math.round(steel.reheatGJPerT * steelT)),
      m('Rolling mill', 'mill', 0, 1, mwh(steel.kwhPerT.rolling)),
      m('Fume extraction fans', 'fan', 1, 1, mwh(steel.kwhPerT.fume)),
      m('Compressed air & water', 'compressor', 2, 1, mwh(steel.kwhPerT.utilities)),
      m('Oxygen plant', 'compressor', 3, 1, mwh(steel.kwhPerT.oxygen)),
      m('Office', 'office', 0, 2, 600),
    ],
  },
  {
    id: 'cement',
    label: 'Cement plant',
    icon: '🏭',
    blurb: 'A kiln line with mills, fans and compressed air. Process CO₂ from calcination dominates.',
    machines: [
      m('Kiln line', 'kiln', 0, 0, 0, 'coal', 3_000_000, 520_000),
      m('Raw mill', 'mill', 1, 0, 25_000),
      m('Cement mill', 'mill', 2, 0, 40_000),
      m('Kiln ID fan', 'fan', 0, 1, 12_000),
      m('Cooler fans', 'fan', 1, 1, 6_000),
      m('Compressed air', 'compressor', 2, 1, 4_000),
      m('Office & lab', 'office', 3, 1, 800),
    ],
  },
  {
    id: 'palm-oil',
    label: 'Palm oil mill',
    icon: '🌴',
    blurb: 'A biomass boiler, sterilisers and presses. Methane from POME ponds is often the biggest source.',
    machines: [
      m('Biomass boiler', 'boiler', 0, 0, 300, 'biomass', 250_000),
      m('Sterilisers', 'production-line', 1, 0, 400),
      m('Screw presses', 'production-line', 2, 0, 1_200),
      m('POME ponds', 'wastewater', 0, 1, 50, 'none', 0, 18_000),
      m('Diesel genset', 'genset', 1, 1, 0, 'diesel', 6_000),
      m('Office', 'office', 2, 1, 120),
    ],
  },
  {
    id: 'food',
    label: 'Food & beverage',
    icon: '🥫',
    blurb: 'Steam from a gas boiler, plus refrigeration and packaging lines.',
    machines: [
      m('Gas boiler', 'boiler', 0, 0, 100, 'natural-gas', 60_000),
      m('Chillers', 'chiller', 1, 0, 3_500),
      m('Cold rooms', 'cold-room', 2, 0, 2_000),
      m('Compressed air', 'compressor', 0, 1, 1_200),
      m('Packaging line', 'production-line', 1, 1, 1_500),
      m('Wastewater plant', 'wastewater', 2, 1, 600),
      m('Office', 'office', 3, 1, 300),
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    icon: '💾',
    blurb: 'Electricity-heavy: cleanroom HVAC, chillers and production lines.',
    machines: [
      m('Cleanroom HVAC', 'chiller', 0, 0, 9_000),
      m('Process chillers', 'chiller', 1, 0, 5_000),
      m('SMT lines', 'production-line', 2, 0, 3_000),
      m('Compressed air', 'compressor', 0, 1, 2_200),
      m('Exhaust fans', 'fan', 1, 1, 1_500),
      m('Office', 'office', 2, 1, 700),
    ],
  },
  {
    id: 'textile',
    label: 'Textile & dyeing',
    icon: '🧵',
    blurb: 'A coal boiler feeding dye vats and stenters. Heat dominates.',
    machines: [
      m('Coal boiler', 'boiler', 0, 0, 200, 'coal', 120_000),
      m('Dyeing machines', 'production-line', 1, 0, 2_500),
      m('Stenter', 'furnace', 2, 0, 900, 'natural-gas', 20_000),
      m('Compressed air', 'compressor', 0, 1, 800),
      m('Pumps', 'pump', 1, 1, 1_100),
      m('Office', 'office', 2, 1, 200),
    ],
  },
]

export function templateById(id: string) {
  return industryTemplates.find((template) => template.id === id)
}
