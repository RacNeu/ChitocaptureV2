import { scopesFor } from './history'
import type { Settings } from './types'

/**
 * Real published data used to check CarbonPath's calculation: Malaysia Steel Works (KL) Bhd
 * (Masteel, Bursa-listed), Sustainability Report FY2024 — energy table p.50, electricity in kWh
 * p.51, GHG table and methodology p.152. Masteel used the grid factor published at the time of each
 * report, so each year is checked with that year's factor.
 */
export const MASTEEL_SOURCE = {
  label: 'Masteel Sustainability Report FY2024, pp. 50–51 and 152',
  url: 'https://www.masteel.com.my/wp-content/uploads/2025/05/optimized_full_masteel_sustainability_report_fy2024_complete.pdf',
}

export type PublishedYear = {
  year: number
  electricityMWh: number
  naturalGasGJ: number
  dieselGJ: number
  gridKgPerKWh: number
  gridSource: string
  /** dieselT null where the report's method changed and the figure isn't comparable. */
  reported: { scope2T: number; dieselT: number | null; processT: number }
}

export const masteelPublished: PublishedYear[] = [
  { year: 2022, electricityMWh: 1_374_433.97 / 3.6, naturalGasGJ: 182_994.00, dieselGJ: 54_265.69, gridKgPerKWh: 0.585, gridSource: '2017 CDM electricity baseline', reported: { scope2T: 223_345.52, dieselT: null, processT: 152_306.57 } },
  { year: 2023, electricityMWh: 428_835.395, naturalGasGJ: 71_054.00, dieselGJ: 21_955.60, gridKgPerKWh: 0.758, gridSource: 'Energy Commission GEF 2021', reported: { scope2T: 325_057.23, dieselT: 1_505.08, processT: 4_943.03 } },
  { year: 2024, electricityMWh: 398_450.750, naturalGasGJ: 42_327.00, dieselGJ: 21_616.15, gridKgPerKWh: 0.774, gridSource: 'Energy Commission GEF 2022', reported: { scope2T: 308_400.88, dieselT: 1_622.61, processT: 3_228.77 } },
]

export type CheckRow = { year: number; gridKgPerKWh: number; gridSource: string; scope2: { ours: number; theirs: number; pct: number }; diesel: { ours: number; theirs: number; pct: number } | null; gasT: number; carbonInputsT: number }

/** Runs each published year through the same scopesFor() the dashboard and reports use. */
export function checkMasteel(base: Settings): CheckRow[] {
  return masteelPublished.map((y) => {
    const settings: Settings = { ...base, gridRegionId: 'custom', customGridKgPerKWh: y.gridKgPerKWh, residualKgPerKWh: undefined }
    const one = (electricityMWh: number, fuelGJ: Partial<Record<'natural-gas' | 'diesel', number>>) => scopesFor({ month: `${y.year}-01`, electricityMWh, fuelGJ, processT: 0, productionT: 0 }, settings)
    const s2 = one(y.electricityMWh, {}).scope2T
    const diesel = one(0, { diesel: y.dieselGJ }).scope1T
    const gasT = one(0, { 'natural-gas': y.naturalGasGJ }).scope1T
    const pct = (ours: number, theirs: number) => (ours - theirs) / theirs * 100
    return { year: y.year, gridKgPerKWh: y.gridKgPerKWh, gridSource: y.gridSource, scope2: { ours: s2, theirs: y.reported.scope2T, pct: pct(s2, y.reported.scope2T) }, diesel: y.reported.dieselT === null ? null : { ours: diesel, theirs: y.reported.dieselT, pct: pct(diesel, y.reported.dieselT) }, gasT, carbonInputsT: y.reported.processT - gasT }
  })
}
