import { parseMonth } from './history'
import type { FactoryState, IntervalSeries } from './types'

/**
 * Half-hourly electricity demand (the load profile a TNB meter records), and the analyses an
 * energy engineer runs on it: maximum demand, peak shaving, base load, and running vs idle time.
 *
 * Demand is stored as the average kW in each 30-minute block, which is what maximum-demand
 * charges are based on. Timestamps are Malaysian local time, kept as plain “YYYY-MM-DDTHH:mm”.
 */

export const STEP_MIN = 30
export const PER_DAY = 24 * 60 / STEP_MIN
const HOURS = STEP_MIN / 60

/** TNB medium-voltage tariff from 1 July 2025 (see prices.ts): RM 89.27/kW MD, 29.83 sen/kWh energy. */
export const DEFAULT_TARIFF = { mdRMPerKW: 89.27, energyRMPerMWh: 298.3 }

/* ---------------- Time helpers ---------------- */

const toMs = (local: string) => Date.parse(`${local}:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 16)
export const timeAt = (series: IntervalSeries, index: number) => fromMs(toMs(series.start) + index * STEP_MIN * 60_000)
export const dayOfWeek = (local: string) => new Date(toMs(local)).getUTCDay()
export const timeLabel = (local: string) => {
  const d = new Date(toMs(local))
  return `${d.toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${local.slice(11, 16)}`
}
const slotLabel = (slot: number) => `${String(Math.floor(slot / 2)).padStart(2, '0')}:${slot % 2 ? '30' : '00'}`
export { slotLabel }

/* ---------------- Import ---------------- */

export type IntervalImport = { series: IntervalSeries | null; warnings: string[]; error?: string }

/** Accepts 2026-08-01 00:30, 01/08/2026 00:30 (day first, as on Malaysian exports) and ISO timestamps. */
export function parseTimestamp(raw: string): string | null {
  const text = raw.trim().replace(/^"|"$/g, '').replace('T', ' ')
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ ]+(\d{1,2}):(\d{2})/)
  if (m) return stamp(+m[1], +m[2], +m[3], +m[4], +m[5])
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})[ ]+(\d{1,2}):(\d{2})/)
  if (m) return stamp(+m[3], +m[2], +m[1], +m[4], +m[5])
  return null
}
const stamp = (y: number, mo: number, d: number, h: number, mi: number) =>
  mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 24 && mi < 60 ? fromMs(Date.UTC(y, mo - 1, d, h, mi)) : null

/**
 * Rows of cells into a half-hourly series. Columns: a timestamp (or date + time), and either kW
 * (average demand) or kWh (energy in the half hour, converted to kW × 2). Gaps are kept as null.
 */
export function importIntervalRows(rows: string[][], source: string): IntervalImport {
  const data = rows.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  if (data.length < 3) return { series: null, warnings: [], error: 'The file needs a header row and some readings.' }
  const header = data[0].map((cell) => String(cell).trim().toLowerCase().replace(/[\s()_-]+/g, ''))
  const tsCol = header.findIndex((h) => /^(timestamp|datetime|time|date|interval|period)/.test(h) && !/^time$/.test(h) || h === 'timestamp')
  const dateCol = header.findIndex((h) => h === 'date')
  const timeCol = header.findIndex((h) => h === 'time')
  const kwCol = header.findIndex((h) => /^(kw|demand|demandkw|avgkw|averagekw|power|powerkw)$/.test(h))
  const kwhCol = header.findIndex((h) => /^(kwh|energy|energykwh|consumption|consumptionkwh)$/.test(h))
  if (kwCol < 0 && kwhCol < 0) return { series: null, warnings: [], error: 'No kW or kWh column found.' }
  if (tsCol < 0 && (dateCol < 0 || timeCol < 0)) return { series: null, warnings: [], error: 'No timestamp column found (timestamp, or date and time).' }
  const points = new Map<number, number>()
  let bad = 0
  for (const row of data.slice(1)) {
    const when = dateCol >= 0 && timeCol >= 0 && (tsCol < 0 || tsCol === dateCol) ? parseTimestamp(`${row[dateCol]} ${row[timeCol]}`) : parseTimestamp(String(row[tsCol] ?? ''))
    const raw = String(row[kwCol >= 0 ? kwCol : kwhCol] ?? '').replace(/[,\s"]/g, '')
    const value = Number(raw)
    if (!when || raw === '' || !Number.isFinite(value) || value < 0) { bad += 1; continue }
    const ms = toMs(when)
    points.set(ms, kwCol >= 0 ? value : value / HOURS)
  }
  if (points.size < PER_DAY) return { series: null, warnings: [], error: 'Fewer than one day of readings could be read.' }
  const times = [...points.keys()].sort((a, b) => a - b)
  const step = STEP_MIN * 60_000
  const odd = times.filter((t, k) => k > 0 && (t - times[k - 1]) % step !== 0).length
  if (odd > times.length * 0.1) return { series: null, warnings: [], error: 'Readings are not every 30 minutes. Export half-hourly data.' }
  const first = times[0], last = times[times.length - 1]
  const count = Math.round((last - first) / step) + 1
  const kW = Array.from({ length: count }, (_, k) => points.get(first + k * step) ?? null)
  const missing = kW.filter((v) => v === null).length
  const warnings = [
    ...(bad ? [`${bad} row(s) could not be read and were skipped.`] : []),
    ...(missing ? [`${missing} half-hour(s) are missing (${(missing / count * 100).toFixed(1)}%). They are left out of the analysis.`] : []),
  ]
  return { series: { start: fromMs(first), kW, source }, warnings }
}

/* ---------------- Sample profile ---------------- */

/**
 * Three illustrative months of half-hourly demand for a site, scaled so the average matches its
 * yearly electricity. For the steel mill: an arc furnace that swings heat by heat, three shifts,
 * a Sunday day-shift maintenance stop (when the plant idles but auxiliaries stay on), short
 * delays, and one coincident peak a month when the rolling mill restarts while the furnace melts.
 */
export function sampleInterval(state: FactoryState, endMonth = new Date().toISOString().slice(0, 7), months = 3): IntervalSeries {
  const yearlyMWh = state.machines.reduce((s, m) => s + m.electricityMWh, 0)
  const meanKW = Math.max(1, yearlyMWh * 1_000 / 8_760)
  const end = parseMonth(endMonth)!
  const [ey, em] = end.split('-').map(Number)
  const startMs = Date.UTC(ey, em - 1 - months, 1)
  const endMs = Date.UTC(ey, em - 1, 1)
  const count = Math.round((endMs - startMs) / (STEP_MIN * 60_000))
  let seed = 11
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const raw: number[] = []
  for (let k = 0; k < count; k += 1) {
    const ms = startMs + k * STEP_MIN * 60_000
    const d = new Date(ms)
    const dow = d.getUTCDay(), hour = d.getUTCHours() + d.getUTCMinutes() / 60, day = d.getUTCDate()
    const maintenance = dow === 0 && hour >= 8 && hour < 20
    const base = 0.24
    if (maintenance) { raw.push(base * (1.25 + 0.05 * rand())); continue }
    // The coincident peak: the second Tuesday of the month, 14:00–15:00, when the rolling mill
    // restarts and the ladle furnace reheats while the arc furnace is melting.
    const peak = day >= 8 && day <= 14 && dow === 2 && hour >= 14 && hour < 15
    const delay = !peak && rand() < 0.06
    // Arc furnace: power-on for most of each 50-minute heat; half-hour averages swing between heats.
    const eaf = delay ? 0.05 : peak ? 0.97 + 0.03 * rand() : 0.55 + 0.25 * rand() + 0.1 * rand()
    const rolling = hour >= 7 && hour < 23 ? 0.18 : 0.1
    const value = base + 0.12 + rolling + eaf
    raw.push(value)
  }
  const mean = raw.reduce((s, v) => s + v, 0) / raw.length
  return { start: fromMs(startMs), kW: raw.map((v) => Math.round(v / mean * meanKW)), source: 'sample' }
}

export function intervalFor(state: FactoryState): { series: IntervalSeries; sample: boolean } {
  return state.interval?.kW.length ? { series: state.interval, sample: false } : { series: sampleInterval(state), sample: true }
}

/* ---------------- Analysis ---------------- */

const quantile = (sorted: number[], q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))] : 0

export type MonthDemand = {
  month: string
  /** Maximum demand: the highest half-hour average in the month. */
  mdKW: number
  mdAt: string
  mdRM: number
  energyMWh: number
  loadFactor: number
  /** kW you could take off the MD by moving the load in the top `hours` of the month. */
  shave: { hours: number; kW: number; rmPerMonth: number; mwhToMove: number }[]
  count: number
}

export type LoadState = 'running' | 'idle' | 'off'

export type IntervalAnalysis = {
  from: string
  to: string
  days: number
  coverage: number
  months: MonthDemand[]
  /** Always-on demand: the 5th percentile of all half-hours. */
  baseKW: number
  avgKW: number
  peakKW: number
  thresholds: { idleBelowKW: number; offBelowKW: number }
  share: Record<LoadState, number>
  idle: { hours: number; mwh: number; rm: number; avgKW: number }
  /** Average kW by half-hour of the day, for working days and for Sundays & public-holiday-like days. */
  profile: { weekday: number[]; sunday: number[] }
  /** Day × half-hour grid of kW, for the carpet plot. */
  days_: { date: string; kW: (number | null)[] }[]
  /** Load-duration curve: all readings, highest first (down-sampled). */
  duration: number[]
}

export function analyseInterval(series: IntervalSeries, tariff = DEFAULT_TARIFF): IntervalAnalysis {
  const valid = series.kW.map((kW, i) => ({ kW, i })).filter((p): p is { kW: number; i: number } => p.kW !== null)
  const sorted = valid.map((p) => p.kW).sort((a, b) => a - b)
  const baseKW = quantile(sorted, 0.05)
  const p90 = quantile(sorted, 0.9)
  const avgKW = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length)
  // Running vs idle: production loads sit well above the always-on level. Off = below half of it.
  const idleBelowKW = baseKW + 0.35 * (p90 - baseKW)
  const offBelowKW = baseKW * 0.5
  const state = (kW: number): LoadState => kW < offBelowKW ? 'off' : kW < idleBelowKW ? 'idle' : 'running'
  const counts = { running: 0, idle: 0, off: 0 }
  let idleKWh = 0
  for (const p of valid) { const s = state(p.kW); counts[s] += 1; if (s === 'idle') idleKWh += p.kW * HOURS }

  const byMonth = new Map<string, { kW: number; i: number }[]>()
  for (const p of valid) { const m = timeAt(series, p.i).slice(0, 7); byMonth.set(m, [...(byMonth.get(m) ?? []), p]) }
  const months: MonthDemand[] = [...byMonth.entries()].map(([month, points]) => {
    const top = points.reduce((a, b) => b.kW > a.kW ? b : a)
    const desc = points.map((p) => p.kW).sort((a, b) => b - a)
    const energyMWh = points.reduce((s, p) => s + p.kW * HOURS, 0) / 1_000
    const shave = [1, 2, 4, 8, 16].map((hours) => {
      const n = hours / HOURS
      const cap = desc[Math.min(desc.length - 1, n)]
      const kW = desc[0] - cap
      const mwhToMove = desc.slice(0, n).reduce((s, v) => s + (v - cap), 0) * HOURS / 1_000
      return { hours, kW, rmPerMonth: kW * tariff.mdRMPerKW, mwhToMove }
    })
    return { month, mdKW: top.kW, mdAt: timeAt(series, top.i), mdRM: top.kW * tariff.mdRMPerKW, energyMWh, loadFactor: energyMWh * 1_000 / (top.kW * points.length * HOURS), shave, count: points.length }
  }).sort((a, b) => a.month.localeCompare(b.month))

  const sums = { weekday: new Array(PER_DAY).fill(0), sunday: new Array(PER_DAY).fill(0) }
  const ns = { weekday: new Array(PER_DAY).fill(0), sunday: new Array(PER_DAY).fill(0) }
  const days = new Map<string, (number | null)[]>()
  series.kW.forEach((kW, i) => {
    const t = timeAt(series, i), date = t.slice(0, 10)
    const slot = Number(t.slice(11, 13)) * 2 + (t.slice(14, 16) === '30' ? 1 : 0)
    const row = days.get(date) ?? new Array(PER_DAY).fill(null)
    row[slot] = kW
    days.set(date, row)
    if (kW === null) return
    const kind = dayOfWeek(t) === 0 ? 'sunday' : 'weekday'
    sums[kind][slot] += kW; ns[kind][slot] += 1
  })
  const step = Math.max(1, Math.floor(sorted.length / 400))
  const desc = [...sorted].reverse()
  return {
    from: timeAt(series, 0),
    to: timeAt(series, series.kW.length - 1),
    days: days.size,
    coverage: valid.length / Math.max(1, series.kW.length),
    months,
    baseKW,
    avgKW,
    peakKW: sorted.at(-1) ?? 0,
    thresholds: { idleBelowKW, offBelowKW },
    share: { running: counts.running / Math.max(1, valid.length), idle: counts.idle / Math.max(1, valid.length), off: counts.off / Math.max(1, valid.length) },
    idle: { hours: counts.idle * HOURS, mwh: idleKWh / 1_000, rm: idleKWh / 1_000 * tariff.energyRMPerMWh, avgKW: counts.idle ? idleKWh / (counts.idle * HOURS) : 0 },
    profile: { weekday: sums.weekday.map((s, k) => ns.weekday[k] ? s / ns.weekday[k] : 0), sunday: sums.sunday.map((s, k) => ns.sunday[k] ? s / ns.sunday[k] : 0) },
    days_: [...days.entries()].map(([date, kW]) => ({ date, kW })),
    duration: desc.filter((_, k) => k % step === 0),
  }
}

/** Months covered by the series, per calendar month, as a share of the analysis span. */
export const monthsSpanned = (a: IntervalAnalysis) => Math.max(1, a.days / 30.4)
