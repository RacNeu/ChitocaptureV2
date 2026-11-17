import { fuelFactorsKgPerGJ, gridFactor } from './factors'
import { fuels, monthIndex } from './history'
import type { MonthlyRecord, Settings } from './types'

/**
 * Expected vs actual energy (ISO 50006 energy baseline). From a baseline period we learn how much
 * energy the plant needs for the tonnes it makes:
 *     energy per month = fixed load + energy per tonne × tonnes made
 * Every later month is compared with what that line expects for its production. The difference,
 * priced at the site's tariff, is money saved (below the line) or lost (above it). Its running
 * total is the CUSUM, the standard chart energy managers use to prove savings are real.
 */

export type Stream = 'electricity' | 'fuel'

export type LineFit = {
  /** Energy used regardless of output, per month (MWh or GJ). */
  fixed: number
  /** Extra energy for each tonne made (MWh/t or GJ/t). */
  perTonne: number
  /** Share of month-to-month variation explained by production, 0–1. */
  r2: number
  /** Typical error as a share of the mean (CV(RMSE)); ASHRAE Guideline 14 accepts ≤ 15% monthly. */
  cvRmse: number
  n: number
  /** True when production did not explain usage, so the baseline is the plain monthly average. */
  flat: boolean
}

/** Least-squares line of energy on production; falls back to the average when the line is unusable. */
export function fitLine(points: { x: number; y: number }[]): LineFit {
  const n = points.length
  const meanY = points.reduce((s, p) => s + p.y, 0) / Math.max(1, n)
  const meanX = points.reduce((s, p) => s + p.x, 0) / Math.max(1, n)
  const sxx = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0)
  const sxy = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0)
  const syy = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0)
  let perTonne = sxx > 0 ? sxy / sxx : 0
  let fixed = meanY - perTonne * meanX
  let flat = false
  // A negative slope or negative fixed load is not physical: use the average instead.
  if (n < 6 || perTonne <= 0 || fixed < 0) { perTonne = 0; fixed = meanY; flat = true }
  const sse = points.reduce((s, p) => s + (p.y - fixed - perTonne * p.x) ** 2, 0)
  const r2 = syy > 0 ? Math.max(0, 1 - sse / syy) : 0
  const rmse = Math.sqrt(sse / Math.max(1, n - (flat ? 1 : 2)))
  return { fixed, perTonne, r2, cvRmse: meanY > 0 ? rmse / meanY : 0, n, flat }
}

export type BaselineMonth = {
  month: string
  productionT: number
  actual: number
  expected: number
  /** actual − expected, in MWh or GJ; positive = used more than expected. */
  gap: number
  gapRM: number
  gapT: number
  /** Running total of gapRM from the first month after the baseline. */
  cusumRM: number
  inBaseline: boolean
}

export type StreamBaseline = {
  stream: Stream
  unit: 'MWh' | 'GJ'
  fit: LineFit
  months: BaselineMonth[]
  /** Price and emission factor used to turn energy into RM and tonnes. */
  rmPerUnit: number
  tPerUnit: number
}

export type Baseline = {
  available: boolean
  reason?: string
  from: string
  to: string
  streams: StreamBaseline[]
  /** Both streams together, month by month (after the baseline period only). */
  months: { month: string; gapRM: number; gapT: number; cusumRM: number }[]
  /** Last 12 months after the baseline. */
  recent: { gapRM: number; gapT: number; expectedRM: number; months: number }
  /** Fixed (production-independent) energy cost per month: what the plant spends just being on. */
  fixedRMPerMonth: number
}

const fuelGJ = (r: MonthlyRecord) => fuels.reduce((s, f) => s + (r.fuelGJ[f] ?? 0), 0)

/** Baseline = the first 12 months (or `baselineMonths`) of data. Needs production for every month. */
export function energyBaseline(records: MonthlyRecord[], settings: Settings, baselineMonths = 12): Baseline {
  const empty = { from: '', to: '', streams: [], months: [], recent: { gapRM: 0, gapT: 0, expectedRM: 0, months: 0 }, fixedRMPerMonth: 0 }
  const sorted = [...records].sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
  if (sorted.some((r) => r.productionT <= 0)) return { ...empty, available: false, reason: 'Add production tonnes for every month to compare energy with output.' }
  if (sorted.length < baselineMonths + 1) return { ...empty, available: false, reason: `Needs at least ${baselineMonths + 1} months: ${baselineMonths} to learn the baseline and one to compare.` }
  const base = sorted.slice(0, baselineMonths)
  const grid = gridFactor(settings.gridRegionId, settings.customGridKgPerKWh)

  // Fuel is priced and weighted by the baseline's own fuel mix.
  const fuelMix = fuels.map((f) => ({ f, gj: base.reduce((s, r) => s + (r.fuelGJ[f] ?? 0), 0) }))
  const fuelTotal = fuelMix.reduce((s, m) => s + m.gj, 0)
  const fuelRM = fuelTotal > 0 ? fuelMix.reduce((s, m) => s + m.gj * settings.fuelPriceRMPerGJ[m.f], 0) / fuelTotal : 0
  const fuelT = fuelTotal > 0 ? fuelMix.reduce((s, m) => s + m.gj * fuelFactorsKgPerGJ[m.f] / 1_000, 0) / fuelTotal : 0

  const build = (stream: Stream, read: (r: MonthlyRecord) => number, unit: 'MWh' | 'GJ', rmPerUnit: number, tPerUnit: number): StreamBaseline => {
    const fit = fitLine(base.map((r) => ({ x: r.productionT, y: read(r) })))
    let cusum = 0
    const months = sorted.map((r, k) => {
      const expected = fit.fixed + fit.perTonne * r.productionT
      const actual = read(r)
      const gap = actual - expected
      const inBaseline = k < baselineMonths
      if (!inBaseline) cusum += gap * rmPerUnit
      return { month: r.month, productionT: r.productionT, actual, expected, gap, gapRM: gap * rmPerUnit, gapT: gap * tPerUnit, cusumRM: inBaseline ? 0 : cusum, inBaseline }
    })
    return { stream, unit, fit, months, rmPerUnit, tPerUnit }
  }

  const streams = [build('electricity', (r) => r.electricityMWh, 'MWh', settings.electricityPriceRMPerMWh, grid)]
  if (fuelTotal > 0) streams.push(build('fuel', fuelGJ, 'GJ', fuelRM, fuelT))

  let cusum = 0
  const months = sorted.slice(baselineMonths).map((r) => {
    const parts = streams.map((s) => s.months.find((m) => m.month === r.month)!)
    const gapRM = parts.reduce((s, m) => s + m.gapRM, 0)
    cusum += gapRM
    return { month: r.month, gapRM, gapT: parts.reduce((s, m) => s + m.gapT, 0), cusumRM: cusum }
  })
  const last = months.slice(-12)
  const expectedRM = streams.reduce((s, st) => s + st.months.slice(-last.length).reduce((a, m) => a + m.expected * st.rmPerUnit, 0), 0)
  return {
    available: true,
    from: base[0].month,
    to: base.at(-1)!.month,
    streams,
    months,
    recent: { gapRM: last.reduce((s, m) => s + m.gapRM, 0), gapT: last.reduce((s, m) => s + m.gapT, 0), expectedRM, months: last.length },
    fixedRMPerMonth: streams.reduce((s, st) => s + st.fit.fixed * st.rmPerUnit, 0),
  }
}

/** Plain-language verdict on how well the baseline explains usage. */
export function fitQuality(fit: LineFit): { label: 'good' | 'fair' | 'weak'; text: string } {
  if (fit.flat) return { label: 'weak', text: 'Production did not explain energy use in the baseline months, so the baseline is the monthly average.' }
  if (fit.r2 >= 0.75 && fit.cvRmse <= 0.15) return { label: 'good', text: `Production explains ${Math.round(fit.r2 * 100)}% of the month-to-month change; typical error ${Math.round(fit.cvRmse * 100)}% (within ASHRAE Guideline 14’s 15%).` }
  if (fit.cvRmse <= 0.15) return { label: 'fair', text: `Typical error ${Math.round(fit.cvRmse * 100)}% is within ASHRAE Guideline 14’s 15%, but production explains only ${Math.round(fit.r2 * 100)}% of the change: shifts, product mix or weather may matter too.` }
  return { label: 'weak', text: `Typical error ${Math.round(fit.cvRmse * 100)}% is above ASHRAE Guideline 14’s 15%. Treat single months with caution; the running total is still useful.` }
}
