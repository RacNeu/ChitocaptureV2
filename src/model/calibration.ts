import { fuels, monthIndex, type Fuel } from './history'
import type { FuelType, Machine, MonthlyRecord, Settings } from './types'

/**
 * One source of truth: the uploaded bills. The machine list (used by the plan, the 3D site, the
 * simulations and the equipment breakdowns) is rescaled so its yearly totals equal the last 12
 * months of bills, stream by stream: electricity, each fuel, and process CO₂.
 *
 * Machines the plant marked "metered" keep their figures; only "estimated" machines are scaled to
 * make up the rest. Energy the machine list has no home for goes to an "Other … (from bills)" line,
 * so nothing on the bills is lost and nothing is invented.
 */

export type Stream = 'electricity' | Fuel | 'process'
export type StreamMatch = { stream: Stream; billTotal: number; meteredTotal: number; estimatedBefore: number; factor: number | null; added: boolean; meteredOver: boolean }
export type Calibration = { at: string; from: string; to: string; months: number; productionT: number | null; streams: StreamMatch[] }

const unitOf = (stream: Stream) => stream === 'electricity' ? 'MWh' : stream === 'process' ? 't CO₂' : 'GJ'
export const streamLabel = (stream: Stream) => stream === 'electricity' ? 'Electricity' : stream === 'process' ? 'Process CO₂' : ({ 'natural-gas': 'Natural gas', diesel: 'Diesel', 'fuel-oil': 'Fuel oil', coal: 'Coal', biomass: 'Biomass' } as Record<Fuel, string>)[stream]
export { unitOf }

/** The last 12 months of bills (fewer if that is all there is), and the factor that makes them a year. */
export function billYear(records: MonthlyRecord[]) {
  const sorted = [...records].sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
  const last = sorted.slice(-12)
  return { last, toYear: last.length ? 12 / last.length : 0 }
}

/** Yearly bill totals by stream. */
export function billTotals(records: MonthlyRecord[]) {
  const { last, toYear } = billYear(records)
  const totals: Record<Stream, number> = { electricity: 0, process: 0, 'natural-gas': 0, diesel: 0, 'fuel-oil': 0, coal: 0, biomass: 0 }
  for (const r of last) {
    totals.electricity += r.electricityMWh
    totals.process += r.processT
    for (const f of fuels) totals[f] += r.fuelGJ[f] ?? 0
  }
  for (const key of Object.keys(totals) as Stream[]) totals[key] *= toYear
  const production = last.reduce((s, r) => s + r.productionT, 0) * toYear
  return { totals, production, last }
}

const amount = (m: Machine, stream: Stream) => stream === 'electricity' ? m.electricityMWh : stream === 'process' ? m.processT : m.fuel === stream ? m.fuelGJ : 0
const withAmount = (m: Machine, stream: Stream, value: number): Machine =>
  stream === 'electricity' ? { ...m, electricityMWh: value } : stream === 'process' ? { ...m, processT: value } : { ...m, fuelGJ: value }

/** Yearly machine totals by stream. */
export function machineTotals(machines: Machine[]) {
  const totals: Record<Stream, number> = { electricity: 0, process: 0, 'natural-gas': 0, diesel: 0, 'fuel-oil': 0, coal: 0, biomass: 0 }
  for (const m of machines) {
    totals.electricity += m.electricityMWh
    totals.process += m.processT
    if (m.fuel !== 'none') totals[m.fuel as Fuel] += m.fuelGJ
  }
  return totals
}

const round = (v: number) => Math.round(v * 10) / 10

/** Rescale the machine list to the bills. Returns null when there are no bills. */
export function calibrate(machines: Machine[], records: MonthlyRecord[], settings: Settings, newId: (prefix: string) => string, at = new Date().toISOString()):
  { machines: Machine[]; productionTPerYear: number | null; calibration: Calibration } | null {
  if (!records.length) return null
  const { totals, production, last } = billTotals(records)
  let next = [...machines]
  const streams: StreamMatch[] = []
  const nextRow = () => Math.max(-1, ...next.map((m) => m.row)) + 1
  for (const stream of ['electricity', ...fuels, 'process'] as Stream[]) {
    const bill = totals[stream]
    const carriers = next.filter((m) => amount(m, stream) > 0)
    const metered = carriers.filter((m) => m.quality === 'metered').reduce((s, m) => s + amount(m, stream), 0)
    const estimated = carriers.filter((m) => m.quality !== 'metered')
    const before = estimated.reduce((s, m) => s + amount(m, stream), 0)
    if (bill <= 0 && before <= 0 && metered <= 0) continue
    const target = Math.max(0, bill - metered)
    const match: StreamMatch = { stream, billTotal: bill, meteredTotal: metered, estimatedBefore: before, factor: null, added: false, meteredOver: metered > bill * 1.02 }
    if (before > 0) {
      match.factor = target / before
      const ids = new Set(estimated.map((m) => m.id))
      next = next.map((m) => ids.has(m.id) ? withAmount(m, stream, round(amount(m, stream) * match.factor!)) : m)
    } else if (target > 0) {
      // The bills show energy the machine list has no place for: keep it on its own line.
      const fuel: FuelType = stream === 'electricity' || stream === 'process' ? 'none' : stream
      next = [...next, {
        id: newId('m'), name: `Other ${streamLabel(stream).toLowerCase()} (from bills)`, kind: stream === 'electricity' ? 'production-line' : stream === 'process' ? 'furnace' : stream === 'diesel' ? 'genset' : 'boiler',
        electricityMWh: stream === 'electricity' ? round(target) : 0, fuel, fuelGJ: fuel !== 'none' ? round(target) : 0, processT: stream === 'process' ? round(target) : 0,
        quality: 'estimated', col: 0, row: nextRow(), area: 'From bills', role: 'Energy on the bills that is not yet assigned to a machine. Split it across equipment when you know where it goes.',
      }]
      match.added = true
    }
    streams.push(match)
  }
  return {
    machines: next,
    productionTPerYear: production > 0 ? Math.round(production) : settings.productionTPerYear,
    calibration: { at, from: last[0].month, to: last[last.length - 1].month, months: last.length, productionT: production > 0 ? Math.round(production) : null, streams },
  }
}

/** Live check: do the machines still add up to the bills? (They drift if someone edits a machine.) */
export function matchStatus(machines: Machine[], records: MonthlyRecord[]) {
  if (!records.length) return { state: 'template' as const, worstPct: 0, from: '', to: '' }
  const { totals, last } = billTotals(records)
  const mine = machineTotals(machines)
  let worst = 0
  for (const stream of Object.keys(totals) as Stream[]) {
    const bill = totals[stream], have = mine[stream]
    const scale = Math.max(bill, have)
    if (scale > 0) worst = Math.max(worst, Math.abs(have - bill) / scale)
  }
  return { state: worst <= 0.02 ? 'matched' as const : 'drifted' as const, worstPct: worst * 100, from: last[0].month, to: last[last.length - 1].month }
}
