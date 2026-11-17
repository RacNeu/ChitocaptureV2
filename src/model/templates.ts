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
    id: 'steel-downstream',
    label: 'Wire & galvanising plant',
    icon: '🧷',
    blurb: 'Downstream steel: draws wire rod into wire and hot-dip galvanises it. Gas for annealing and the zinc kettles, electricity for drawing, and zinc as the biggest bought-in footprint.',
    production: { tonnes: 150_000, unit: 'wire' },
    machines: [
      m('Pickling line', 'production-line', 0, 0, { area: 'Surface preparation', targetPerT: 18, role: 'Acid baths that strip scale from the rod before drawing, and in-line acid, rinse and flux tanks that clean the wire before zinc.' }, 3_300),
      m('Wire drawing machines', 'production-line', 1, 0, { area: 'Drawing', targetPerT: 80, role: 'Pull the rod through ever smaller dies to make wire of the right thickness. The main electricity user.' }, 13_330),
      m('Annealing furnace', 'furnace', 2, 0, { area: 'Heat treatment', targetPerT: 0.8, role: 'Gas-fired tube furnaces that heat the drawn wire to about 720 °C to soften it again.' }, 0, 'natural-gas', 137_700),
      m('Galvanising zinc bath', 'furnace', 0, 1, { area: 'Coating', targetPerT: 1.0, role: 'Gas-heated kettles of molten zinc at about 450 °C that coat the wire against rust; electricity runs the line drives and take-up.' }, 2_250, 'natural-gas', 175_700),
      m('Compressed air & cooling', 'compressor', 1, 1, { area: 'Utilities', targetPerT: 9, role: 'Compressors and cooling-water pumps for the drawing and coating lines.' }, 1_500),
      m('Wastewater treatment', 'wastewater', 2, 1, { area: 'Utilities', role: 'Neutralises spent pickling acid and rinse water before discharge.' }, 600),
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
]

export function templateById(id: string) {
  return industryTemplates.find((template) => template.id === id)
}
