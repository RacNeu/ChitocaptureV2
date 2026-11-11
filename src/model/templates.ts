import { annualTonnes, defaultSteelParams as steel, steelTargets } from './steel'
import type { Machine } from './types'

export type IndustryTemplate = {
  id: string
  label: string
  icon: string
  blurb: string
  /** Illustrative yearly production for per-tonne figures, if the template defines one. */
  production?: { tonnes: number; unit: string }
  machines: Omit<Machine, 'id'>[]
}

type Extra = { role: string; area: string; unitId?: string; targetPerT?: number }

/**
 * Illustrative sample factories. Every number is a round placeholder that only gives the demo a
 * realistic shape. Users replace them with their own meter and fuel data in step 2.
 */
const m = (name: string, kind: Machine['kind'], col: number, row: number, extra: Extra, electricityMWh: number, fuel: Machine['fuel'] = 'none', fuelGJ = 0, processT = 0): Omit<Machine, 'id'> =>
  ({ name, kind, col, row, electricityMWh, fuel, fuelGJ, processT, quality: 'estimated', ...extra })

/** Steel mini-mill machines derived from the same model the control room runs, so both views agree. */
const steelT = annualTonnes(steel)
const mwh = (kwhPerT: number) => Math.round(kwhPerT * steelT / 1_000)

export const industryTemplates: readonly IndustryTemplate[] = [
  {
    id: 'steel',
    label: 'Steel mini-mill',
    icon: '🔩',
    blurb: 'Electric arc furnace route. First in line for the EU CBAM and Malaysia’s planned carbon tax.',
    production: { tonnes: Math.round(steelT), unit: 'steel' },
    machines: [
      m('Electric arc furnace', 'furnace', 0, 0, { area: 'Melt shop', unitId: 'eaf', targetPerT: steelTargets.eaf, role: 'Melts scrap steel with a powerful electric arc between graphite electrodes. The plant’s biggest electricity user.' }, mwh(steel.kwhPerT.eaf), 'none', 0, Math.round(steel.eafDirectKgPerT * steelT / 1_000)),
      m('Ladle furnace', 'furnace', 1, 0, { area: 'Melt shop', unitId: 'lf', targetPerT: steelTargets.lf, role: 'Reheats the liquid steel in its ladle and adjusts the chemistry to the exact grade before casting.' }, mwh(steel.kwhPerT.lf)),
      m('Fume extraction fans', 'fan', 2, 0, { area: 'Melt shop', unitId: 'fume', targetPerT: steelTargets.fume, role: 'Giant fans that pull furnace fumes and dust through bag filters before the gas leaves the stack.' }, mwh(steel.kwhPerT.fume)),
      m('Oxygen plant', 'compressor', 3, 0, { area: 'Melt shop', unitId: 'oxygen', targetPerT: steelTargets.oxygen, role: 'Separates oxygen from air. The oxygen is injected into the furnace to speed up melting.' }, mwh(steel.kwhPerT.oxygen)),
      m('Continuous caster', 'production-line', 0, 1, { area: 'Casting', unitId: 'caster', targetPerT: steelTargets.caster, role: 'Pours liquid steel into water-cooled moulds where it solidifies into long square bars called billets.' }, mwh(steel.kwhPerT.caster)),
      m('Reheating furnace', 'furnace', 1, 1, { area: 'Hot rolling', unitId: 'reheat', targetPerT: steelTargets.reheat, role: 'Burns natural gas to heat billets back to about 1,150 °C so they are soft enough to roll. Its stack is the main on-site CO₂ point source.' }, 0, 'natural-gas', Math.round(steel.reheatGJPerT * steelT)),
      m('Rolling mill', 'mill', 2, 1, { area: 'Hot rolling', unitId: 'rolling', targetPerT: steelTargets.rolling, role: 'A line of heavy rollers that squeezes hot billets into reinforcing bars and wire rod.' }, mwh(steel.kwhPerT.rolling)),
      m('Compressed air & water', 'compressor', 3, 1, { area: 'Utilities', unitId: 'utilities', targetPerT: steelTargets.utilities, role: 'Compressors and pumps supplying air for tools and cooling water for the furnaces and caster.' }, mwh(steel.kwhPerT.utilities)),
      m('Office', 'office', 0, 2, { area: 'Buildings', role: 'Offices, control rooms and the quality lab.' }, 600),
    ],
  },
  {
    id: 'cement',
    label: 'Cement plant',
    icon: '🏭',
    blurb: 'A kiln line with mills, fans and compressed air. Process CO₂ from calcination dominates.',
    production: { tonnes: 1_000_000, unit: 'clinker' },
    machines: [
      m('Kiln line', 'kiln', 0, 0, { area: 'Kiln & clinker', targetPerT: 3.0, role: 'A long rotating tube at about 1,450 °C that turns limestone into clinker, the core of cement. Burns fuel, and the limestone itself releases CO₂.' }, 0, 'coal', 3_000_000, 520_000),
      m('Kiln ID fan', 'fan', 0, 1, { area: 'Kiln & clinker', targetPerT: 10, role: 'Induced-draft fan that pulls hot exhaust gas through the kiln and out of the stack.' }, 12_000),
      m('Cooler fans', 'fan', 1, 1, { area: 'Kiln & clinker', targetPerT: 5, role: 'Blow air over red-hot clinker leaving the kiln to cool it down.' }, 6_000),
      m('Raw mill', 'mill', 1, 0, { area: 'Grinding', targetPerT: 22, role: 'Grinds limestone and clay into a fine powder before it enters the kiln.' }, 25_000),
      m('Cement mill', 'mill', 2, 0, { area: 'Grinding', targetPerT: 35, role: 'Grinds clinker with gypsum into finished cement powder.' }, 40_000),
      m('Compressed air', 'compressor', 2, 1, { area: 'Utilities', targetPerT: 3, role: 'Compressors supplying high-pressure air around the plant.' }, 4_000),
      m('Office & lab', 'office', 3, 1, { area: 'Buildings', role: 'Offices plus the quality-control lab.' }, 800),
    ],
  },
  {
    id: 'steel-downstream',
    label: 'Wire & galvanising plant',
    icon: '🧷',
    blurb: 'Downstream steel: draws wire rod into wire and zinc-coats it. Gas-fired annealing and galvanising dominate.',
    production: { tonnes: 200_000, unit: 'wire' },
    machines: [
      m('Pickling line', 'production-line', 0, 0, { area: 'Surface preparation', targetPerT: 12, role: 'Acid baths that strip scale and rust from the wire rod so the zinc coating will stick.' }, 3_000),
      m('Wire drawing machines', 'production-line', 1, 0, { area: 'Drawing', targetPerT: 85, role: 'Pull the rod through ever smaller dies to make wire of the right thickness. The main electricity user.' }, 20_000),
      m('Annealing furnace', 'furnace', 2, 0, { area: 'Heat treatment', targetPerT: 0.7, role: 'Gas-fired furnace that reheats drawn wire to soften it again.' }, 0, 'natural-gas', 160_000),
      m('Galvanising zinc bath', 'furnace', 0, 1, { area: 'Coating', targetPerT: 1.0, role: 'A gas-heated bath of molten zinc at about 450 °C that coats the wire against rust.' }, 0, 'natural-gas', 240_000),
      m('Compressed air & cooling', 'compressor', 1, 1, { area: 'Utilities', targetPerT: 10, role: 'Compressors and cooling-water pumps for the drawing and coating lines.' }, 2_400),
      m('Wastewater treatment', 'wastewater', 2, 1, { area: 'Utilities', role: 'Neutralises spent pickling acid and rinse water before discharge.' }, 800),
      m('Site office', 'office', 3, 1, { area: 'Buildings', role: 'Plant office, lab and canteen.' }, 300),
    ],
  },
  {
    id: 'office',
    label: 'Head office',
    icon: '🏢',
    blurb: 'Offices, air-conditioning and a server room. Almost all of it is grid electricity.',
    machines: [
      m('Office tower', 'office', 0, 0, { area: 'Offices', role: 'Head office floors: lighting, computers, lifts and plug loads for about 400 staff.' }, 1_800),
      m('Central air-conditioning', 'chiller', 1, 0, { area: 'Offices', role: 'Chillers and air handlers that cool the office tower. Usually the biggest electricity user in a Malaysian office.' }, 2_600),
      m('Server room', 'chiller', 2, 0, { area: 'IT', role: 'Servers, network equipment and the precision cooling that runs around the clock.' }, 900),
      m('Backup diesel genset', 'genset', 0, 1, { area: 'Utilities', role: 'Standby generator, run for tests and during grid outages.' }, 0, 'diesel', 1_200),
    ],
  },
  {
    id: 'palm-oil',
    label: 'Palm oil mill',
    icon: '🌴',
    blurb: 'A biomass boiler, sterilisers and presses. Methane from POME ponds is often the biggest source.',
    machines: [
      m('Biomass boiler', 'boiler', 0, 0, { area: 'Steam & power', role: 'Burns fibre and shells from the fruit to raise steam for the mill.' }, 300, 'biomass', 250_000),
      m('Sterilisers', 'production-line', 1, 0, { area: 'Processing', role: 'Pressure-cook fresh fruit bunches with steam to loosen the fruit.' }, 400),
      m('Screw presses', 'production-line', 2, 0, { area: 'Processing', role: 'Squeeze crude palm oil out of the cooked fruit.' }, 1_200),
      m('POME ponds', 'wastewater', 0, 1, { area: 'Wastewater', role: 'Open ponds treating palm oil mill effluent. Bacteria release methane, a strong greenhouse gas.' }, 50, 'none', 0, 18_000),
      m('Diesel genset', 'genset', 1, 1, { area: 'Steam & power', role: 'Backup diesel generator for power.' }, 0, 'diesel', 6_000),
      m('Office', 'office', 2, 1, { area: 'Buildings', role: 'Offices and lab.' }, 120),
    ],
  },
  {
    id: 'food',
    label: 'Food & beverage',
    icon: '🥫',
    blurb: 'Steam from a gas boiler, plus refrigeration and packaging lines.',
    machines: [
      m('Gas boiler', 'boiler', 0, 0, { area: 'Utilities', role: 'Raises steam for cooking, cleaning and pasteurising.' }, 100, 'natural-gas', 60_000),
      m('Chillers', 'chiller', 1, 0, { area: 'Cooling', role: 'Make chilled water for process cooling.' }, 3_500),
      m('Cold rooms', 'cold-room', 2, 0, { area: 'Cooling', role: 'Refrigerated storage for ingredients and products.' }, 2_000),
      m('Compressed air', 'compressor', 0, 1, { area: 'Utilities', role: 'Air for packaging machines and tools.' }, 1_200),
      m('Packaging line', 'production-line', 1, 1, { area: 'Production', role: 'Fills, seals and labels products.' }, 1_500),
      m('Wastewater plant', 'wastewater', 2, 1, { area: 'Utilities', role: 'Treats process wastewater before discharge.' }, 600),
      m('Office', 'office', 3, 1, { area: 'Buildings', role: 'Offices and lab.' }, 300),
    ],
  },
  {
    id: 'electronics',
    label: 'Electronics',
    icon: '💾',
    blurb: 'Electricity-heavy: cleanroom HVAC, chillers and production lines.',
    machines: [
      m('Cleanroom HVAC', 'chiller', 0, 0, { area: 'Cleanroom', role: 'Keeps the cleanroom’s air filtered, cool and at stable humidity around the clock.' }, 9_000),
      m('Process chillers', 'chiller', 1, 0, { area: 'Utilities', role: 'Cool production tools.' }, 5_000),
      m('SMT lines', 'production-line', 2, 0, { area: 'Production', role: 'Surface-mount lines that place and solder components on boards.' }, 3_000),
      m('Compressed air', 'compressor', 0, 1, { area: 'Utilities', role: 'Air for pick-and-place machines and tools.' }, 2_200),
      m('Exhaust fans', 'fan', 1, 1, { area: 'Cleanroom', role: 'Extract process fumes.' }, 1_500),
      m('Office', 'office', 2, 1, { area: 'Buildings', role: 'Offices.' }, 700),
    ],
  },
  {
    id: 'textile',
    label: 'Textile & dyeing',
    icon: '🧵',
    blurb: 'A coal boiler feeding dye vats and stenters. Heat dominates.',
    machines: [
      m('Coal boiler', 'boiler', 0, 0, { area: 'Steam', role: 'Raises steam for dyeing and finishing.' }, 200, 'coal', 120_000),
      m('Dyeing machines', 'production-line', 1, 0, { area: 'Wet processing', role: 'Heat fabric in dye baths.' }, 2_500),
      m('Stenter', 'furnace', 2, 0, { area: 'Finishing', role: 'Gas-heated frame that dries and sets fabric width.' }, 900, 'natural-gas', 20_000),
      m('Compressed air', 'compressor', 0, 1, { area: 'Utilities', role: 'Air for machines and tools.' }, 800),
      m('Pumps', 'pump', 1, 1, { area: 'Utilities', role: 'Move water and dye liquor.' }, 1_100),
      m('Office', 'office', 2, 1, { area: 'Buildings', role: 'Offices.' }, 200),
    ],
  },
]

export function templateById(id: string) {
  return industryTemplates.find((template) => template.id === id)
}
