import { fuelFactorsKgPerGJ, gridFactor } from './factors'
import type { FactoryState, FuelType, MonthlyRecord, Settings } from './types'

/**
 * Monthly activity history: Scope 1 and 2 per month, CSV import, a sample history for demos,
 * a forecast and anomaly flags. The forecast is deliberately simple and explainable:
 *   emissions = production × emissions per tonne,
 * with production forecast from its trend and month-of-year pattern, and each scope's emissions
 * per tonne forecast from its own trend. Auditors can follow every step.
 */

export type Fuel = Exclude<FuelType, 'none'>
export const fuels: Fuel[] = ['natural-gas', 'diesel', 'fuel-oil', 'coal', 'biomass']

export type MonthScopes = {
  month: string
  /** Scope 1: fuel burnt on site plus process emissions (biogenic CO₂ from biomass excluded). */
  scope1T: number
  /** Scope 2: purchased grid electricity, location-based. */
  scope2T: number
  totalT: number
  productionT: number
  /** kg CO₂e per tonne of product, null without production. */
  intensityKg: number | null
}

export function scopesFor(record: MonthlyRecord, settings: Settings): MonthScopes {
  const grid = gridFactor(settings.gridRegionId, settings.customGridKgPerKWh)
  const fuelT = fuels.reduce((sum, fuel) => sum + (record.fuelGJ[fuel] ?? 0) * fuelFactorsKgPerGJ[fuel] / 1_000, 0)
  const scope1T = fuelT + record.processT
  const scope2T = record.electricityMWh * grid
  const totalT = scope1T + scope2T
  return { month: record.month, scope1T, scope2T, totalT, productionT: record.productionT, intensityKg: record.productionT > 0 ? totalT / record.productionT * 1_000 : null }
}

/* ---------------- Months ---------------- */

export const monthIndex = (month: string) => { const [y, m] = month.split('-').map(Number); return y * 12 + (m - 1) }
export const monthFromIndex = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
export const monthLabel = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })

/** Accepts 2025-01, 2025/1, 01/2025, Jan 2025, Jan-25 and 2025-01-15; returns YYYY-MM or null. */
export function parseMonth(raw: string): string | null {
  const text = raw.trim().replace(/^"|"$/g, '')
  let match = text.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/)
  if (match) return valid(Number(match[1]), Number(match[2]))
  match = text.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (match) return valid(Number(match[2]), Number(match[1]))
  match = text.match(/^([A-Za-z]{3,9})[\s\-/.]*(\d{2}|\d{4})$/)
  if (match) {
    const m = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[1].slice(0, 3).toLowerCase()) + 1
    const y = Number(match[2]) < 100 ? 2000 + Number(match[2]) : Number(match[2])
    return m ? valid(y, m) : null
  }
  return null
}
const valid = (y: number, m: number) => y >= 2000 && y <= 2100 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null

/* ---------------- CSV import ---------------- */

export const CSV_TEMPLATE = [
  'month,electricity_kwh,natural_gas_gj,diesel_litres,fuel_oil_gj,coal_gj,biomass_gj,process_t,production_t',
  '2025-01,24500000,61000,12000,0,0,0,3600,51000',
  '2025-02,22100000,55500,11000,0,0,0,3250,46000',
].join('\n')

/** Diesel: 0.0386 GJ per litre (net calorific value, IPCC 2006 / typical density). */
const GJ_PER_LITRE_DIESEL = 0.0386

type Column = { field: 'month' | 'electricity' | Fuel | 'process' | 'production'; scale: number }

/** Recognised headers, with the factor that converts the column into MWh, GJ or tonnes. */
function columnFor(header: string): Column | null {
  const h = header.trim().toLowerCase().replace(/^"|"$/g, '').replace(/[()]/g, '').replace(/[\s-]+/g, '_')
  if (/^(month|period|date|bulan)$/.test(h)) return { field: 'month', scale: 1 }
  if (/^electricity(_mwh)?$/.test(h)) return { field: 'electricity', scale: 1 }
  if (/^electricity_kwh$|^kwh$/.test(h)) return { field: 'electricity', scale: 1 / 1_000 }
  if (/^(natural_)?gas(_gj)?$/.test(h) || h === 'ng_gj') return { field: 'natural-gas', scale: 1 }
  if (/^(natural_)?gas_mmbtu$/.test(h)) return { field: 'natural-gas', scale: 1.055056 }
  if (/^diesel(_gj)?$/.test(h)) return { field: 'diesel', scale: 1 }
  if (/^diesel_(litres|liters|l)$/.test(h)) return { field: 'diesel', scale: GJ_PER_LITRE_DIESEL }
  if (/^fuel_oil(_gj)?$/.test(h)) return { field: 'fuel-oil', scale: 1 }
  if (/^coal(_gj)?$/.test(h)) return { field: 'coal', scale: 1 }
  if (/^biomass(_gj)?$/.test(h)) return { field: 'biomass', scale: 1 }
  if (/^process(_t|_co2_t|_co2e_t)?$/.test(h)) return { field: 'process', scale: 1 }
  if (/^production(_t|_tonnes)?$|^output_t$/.test(h)) return { field: 'production', scale: 1 }
  return null
}

export type ImportResult = { records: MonthlyRecord[]; warnings: string[]; error?: string }

const splitLine = (line: string, separator: string) => {
  const cells: string[] = []
  let current = '', quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (char === separator && !quoted) { cells.push(current); current = '' }
    else current += char
  }
  return [...cells, current]
}

/** Rows of cells (from a CSV or a spreadsheet) into monthly records. */
export function importRows(rows: string[][]): ImportResult {
  const nonEmpty = rows.filter((row) => row.some((cell) => String(cell ?? '').trim()))
  if (nonEmpty.length < 2) return { records: [], warnings: [], error: 'The file needs a header row and at least one month.' }
  const header = nonEmpty[0].map((cell) => columnFor(String(cell ?? '')))
  const unknown = nonEmpty[0].filter((_, index) => !header[index]).map((cell) => String(cell).trim()).filter(Boolean)
  if (!header.some((column) => column?.field === 'month')) return { records: [], warnings: [], error: 'No “month” column found. Use the template headers.' }
  if (!header.some((column) => column?.field === 'electricity')) return { records: [], warnings: [], error: 'No electricity column found (electricity_kwh or electricity_mwh).' }
  const warnings = unknown.length ? [`Ignored columns: ${unknown.join(', ')}.`] : []
  const byMonth = new Map<string, MonthlyRecord>()
  nonEmpty.slice(1).forEach((row, index) => {
    const record: MonthlyRecord = { month: '', electricityMWh: 0, fuelGJ: {}, processT: 0, productionT: 0 }
    let bad = false
    header.forEach((column, col) => {
      if (!column) return
      const raw = String(row[col] ?? '').trim()
      if (column.field === 'month') { record.month = parseMonth(raw) ?? ''; return }
      const value = raw === '' ? 0 : Number(raw.replace(/[,\s]/g, '').replace(/^"|"$/g, ''))
      if (!Number.isFinite(value) || value < 0) { bad = true; return }
      const scaled = value * column.scale
      if (column.field === 'electricity') record.electricityMWh += scaled
      else if (column.field === 'process') record.processT += scaled
      else if (column.field === 'production') record.productionT += scaled
      else record.fuelGJ[column.field] = (record.fuelGJ[column.field] ?? 0) + scaled
    })
    if (!record.month) { warnings.push(`Row ${index + 2}: month not recognised, skipped.`); return }
    if (bad) { warnings.push(`Row ${index + 2} (${record.month}): a number could not be read, skipped.`); return }
    if (byMonth.has(record.month)) warnings.push(`${record.month} appears twice; the later row is used.`)
    byMonth.set(record.month, record)
  })
  const records = [...byMonth.values()].sort((a, b) => monthIndex(a.month) - monthIndex(b.month))
  if (!records.length) return { records, warnings, error: 'No usable months found.' }
  const gaps = records.length > 1 ? monthIndex(records.at(-1)!.month) - monthIndex(records[0].month) + 1 - records.length : 0
  if (gaps > 0) warnings.push(`${gaps} month(s) are missing between ${records[0].month} and ${records.at(-1)!.month}. The forecast fills them by trend.`)
  if (records.every((record) => record.productionT === 0)) warnings.push('No production column: emissions per tonne and the production-linked forecast are unavailable.')
  return { records, warnings }
}

export function importCsv(text: string): ImportResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const first = lines.find((line) => line.trim()) ?? ''
  const separator = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
  return importRows(lines.map((line) => splitLine(line, separator)))
}

/* ---------------- Sample history ---------------- */

/** Malaysian steel demand dips around Hari Raya and in the year-end shutdown. Index by month 1–12. */
const SEASON = [0.97, 0.9, 0.98, 1.02, 1.03, 1.0, 1.02, 1.04, 1.03, 1.05, 1.01, 0.88]

/**
 * 36 illustrative months ending last month, built from the site's own yearly machine figures, with
 * seasonality, slow growth, a little noise, a mid-period efficiency gain and one faulty month.
 */
export function sampleHistory(state: FactoryState, endMonth = monthFromIndex(monthIndex(new Date().toISOString().slice(0, 7)) - 1), months = 36): MonthlyRecord[] {
  const yearly = state.machines.reduce((acc, machine) => {
    acc.electricity += machine.electricityMWh
    if (machine.fuel !== 'none') acc.fuel[machine.fuel] = (acc.fuel[machine.fuel] ?? 0) + machine.fuelGJ
    acc.process += machine.processT
    return acc
  }, { electricity: 0, fuel: {} as Partial<Record<Fuel, number>>, process: 0 })
  const production = state.settings.productionTPerYear ?? 0
  let seed = 7
  const noise = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 0.04 }
  const end = monthIndex(endMonth)
  return Array.from({ length: months }, (_, k) => {
    const index = end - months + 1 + k
    const month = monthFromIndex(index)
    const season = SEASON[index % 12]
    const growth = 0.94 + 0.06 * k / Math.max(1, months - 1)
    const output = season * growth * (1 + noise())
    // An energy-efficiency programme from the second year trims energy per tonne by about 4%.
    const efficiency = k >= 14 ? 0.96 : 1
    // One month with a faulty fume-fan drive and an air leak: electricity per tonne jumps.
    const fault = k === months - 8 ? 1.18 : 1
    const fuelGJ = Object.fromEntries(Object.entries(yearly.fuel).map(([fuel, gj]) => [fuel, Math.round(gj / 12 * output * efficiency * (1 + noise()))]))
    return {
      month,
      electricityMWh: Math.round(yearly.electricity / 12 * output * efficiency * fault * (1 + noise())),
      fuelGJ,
      processT: Math.round(yearly.process / 12 * output * (1 + noise())),
      productionT: Math.round(production / 12 * output),
    }
  })
}

/** The site's uploaded history, or the sample history when nothing has been uploaded. */
export function historyFor(state: FactoryState): { records: MonthlyRecord[]; sample: boolean } {
  return state.monthly?.length ? { records: state.monthly, sample: false } : { records: sampleHistory(state), sample: true }
}

/* ---------------- Forecast ---------------- */

export type SeriesFit = { level: number; slope: number; seasonal: number[]; residualSd: number; n: number }

/** Least-squares trend on the series after removing a month-of-year pattern (when ≥ 24 months). */
export function fitSeries(values: { index: number; value: number }[], seasonal: boolean): SeriesFit {
  const n = values.length
  const mean = values.reduce((sum, item) => sum + item.value, 0) / Math.max(1, n)
  const factors = new Array(12).fill(1)
  if (seasonal && n >= 24 && mean > 0) {
    // Ratio of each month to a centred 12-month average, averaged by calendar month.
    const sums = new Array(12).fill(0), counts = new Array(12).fill(0)
    values.forEach((item, k) => {
      const window = values.slice(Math.max(0, k - 6), Math.min(n, k + 6))
      const local = window.reduce((sum, w) => sum + w.value, 0) / window.length
      if (local > 0) { sums[item.index % 12] += item.value / local; counts[item.index % 12] += 1 }
    })
    for (let m = 0; m < 12; m += 1) factors[m] = counts[m] ? sums[m] / counts[m] : 1
    const average = factors.reduce((sum, f) => sum + f, 0) / 12
    for (let m = 0; m < 12; m += 1) factors[m] /= average
  }
  const points = values.map((item) => ({ x: item.index, y: item.value / factors[item.index % 12] }))
  const xMean = points.reduce((sum, p) => sum + p.x, 0) / Math.max(1, n)
  const yMean = points.reduce((sum, p) => sum + p.y, 0) / Math.max(1, n)
  const sxx = points.reduce((sum, p) => sum + (p.x - xMean) ** 2, 0)
  const slope = n >= 6 && sxx > 0 ? points.reduce((sum, p) => sum + (p.x - xMean) * (p.y - yMean), 0) / sxx : 0
  const level = yMean - slope * xMean
  const residuals = values.map((item) => item.value - (level + slope * item.index) * factors[item.index % 12])
  const residualSd = Math.sqrt(residuals.reduce((sum, r) => sum + r * r, 0) / Math.max(1, n - 2))
  return { level, slope, seasonal: factors, residualSd, n }
}

export const predict = (fit: SeriesFit, index: number) => Math.max(0, (fit.level + fit.slope * index) * fit.seasonal[index % 12])

export type ForecastMonth = { month: string; scope1T: number; scope2T: number; totalT: number; lowT: number; highT: number; productionT: number }

export type Forecast = {
  months: ForecastMonth[]
  method: string
  /** Fitted drivers, for the explanation shown to users. */
  drivers: { productionGrowthPctPerYear: number | null; scope1KgPerT: number | null; scope2KgPerT: number | null; intensityChangePctPerYear: number | null }
}

/** 80% band: ±1.28 standard errors, widening with distance from the data. */
const Z80 = 1.2816

export function forecast(history: MonthScopes[], horizon: number): Forecast {
  const data = history.filter((item) => item.totalT > 0)
  if (data.length < 3) return { months: [], method: 'Needs at least 3 months of data.', drivers: { productionGrowthPctPerYear: null, scope1KgPerT: null, scope2KgPerT: null, intensityChangePctPerYear: null } }
  const last = monthIndex(data.at(-1)!.month)
  const indexed = data.map((item) => ({ ...item, index: monthIndex(item.month) }))
  const withProduction = indexed.every((item) => item.productionT > 0)
  const months: ForecastMonth[] = []
  if (withProduction) {
    const production = fitSeries(indexed.map((item) => ({ index: item.index, value: item.productionT })), true)
    const s1 = fitSeries(indexed.map((item) => ({ index: item.index, value: item.scope1T / item.productionT })), false)
    const s2 = fitSeries(indexed.map((item) => ({ index: item.index, value: item.scope2T / item.productionT })), false)
    const meanP = indexed.reduce((sum, item) => sum + item.productionT, 0) / indexed.length
    const meanI = indexed.reduce((sum, item) => sum + item.totalT / item.productionT, 0) / indexed.length
    for (let h = 1; h <= horizon; h += 1) {
      const index = last + h
      const p = predict(production, index)
      const i1 = predict(s1, index), i2 = predict(s2, index)
      const widen = Math.sqrt(1 + h / production.n)
      const relP = production.residualSd / Math.max(1e-9, meanP)
      const relI = Math.hypot(s1.residualSd, s2.residualSd) / Math.max(1e-9, meanI)
      const total = p * (i1 + i2)
      const half = total * Math.hypot(relP, relI) * Z80 * widen
      months.push({ month: monthFromIndex(index), scope1T: p * i1, scope2T: p * i2, totalT: total, lowT: Math.max(0, total - half), highT: total + half, productionT: p })
    }
    const intensityNow = predict(s1, last) + predict(s2, last)
    return {
      months,
      method: `Production × emissions per tonne. Production follows its trend and month-of-year pattern${production.seasonal.some((f) => Math.abs(f - 1) > 0.005) ? '' : ' (pattern needs 24+ months)'}; each scope’s emissions per tonne follow their own trend. Shaded band: 80% range.`,
      drivers: {
        productionGrowthPctPerYear: production.slope * 12 / Math.max(1e-9, meanP) * 100,
        scope1KgPerT: predict(s1, last) * 1_000,
        scope2KgPerT: predict(s2, last) * 1_000,
        intensityChangePctPerYear: (s1.slope + s2.slope) * 12 / Math.max(1e-9, intensityNow) * 100,
      },
    }
  }
  // No production data: forecast each scope's tonnes directly.
  const s1 = fitSeries(indexed.map((item) => ({ index: item.index, value: item.scope1T })), true)
  const s2 = fitSeries(indexed.map((item) => ({ index: item.index, value: item.scope2T })), true)
  for (let h = 1; h <= horizon; h += 1) {
    const index = last + h
    const a = predict(s1, index), b = predict(s2, index)
    const half = Math.hypot(s1.residualSd, s2.residualSd) * Z80 * Math.sqrt(1 + h / s1.n)
    months.push({ month: monthFromIndex(index), scope1T: a, scope2T: b, totalT: a + b, lowT: Math.max(0, a + b - half), highT: a + b + half, productionT: 0 })
  }
  return { months, method: 'Each scope’s monthly tonnes follow their trend and month-of-year pattern (add production to link the forecast to output). Shaded band: 80% range.', drivers: { productionGrowthPctPerYear: null, scope1KgPerT: null, scope2KgPerT: null, intensityChangePctPerYear: null } }
}

/* ---------------- Anomalies ---------------- */

export type Anomaly = { month: string; metric: string; value: number; expected: number; unit: string; direction: 'high' | 'low'; z: number; hint: string }

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); const mid = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2 }

/** Robust check (median and median absolute deviation) of energy per tonne, month by month. */
export function anomalies(records: MonthlyRecord[], threshold = 3.5): Anomaly[] {
  if (records.length < 6) return []
  const metrics: { metric: string; unit: string; value: (r: MonthlyRecord) => number | null; high: string; low: string }[] = [
    { metric: 'Electricity per tonne', unit: 'kWh/t', value: (r) => r.productionT > 0 ? r.electricityMWh * 1_000 / r.productionT : null, high: 'Check for a faulty drive, compressed-air leaks, idling equipment or a billing error.', low: 'Check the meter reading or the production figure for this month.' },
    { metric: 'Fuel per tonne', unit: 'GJ/t', value: (r) => { const gj = fuels.reduce((sum, fuel) => sum + (r.fuelGJ[fuel] ?? 0), 0); return r.productionT > 0 && gj > 0 ? gj / r.productionT : null }, high: 'Check burner tuning, furnace doors, cold charging or a gas-bill error.', low: 'Check the gas invoice or the production figure for this month.' },
    { metric: 'Electricity', unit: 'MWh', value: (r) => records.every((item) => item.productionT <= 0) ? r.electricityMWh : null, high: 'Check for a billing error or unusual operation.', low: 'Check for a missing bill or a shutdown.' },
  ]
  const found: Anomaly[] = []
  for (const metric of metrics) {
    const points = records.map((record) => ({ record, value: metric.value(record) })).filter((item): item is { record: MonthlyRecord; value: number } => item.value !== null)
    if (points.length < 6) continue
    const mid = median(points.map((item) => item.value))
    const mad = median(points.map((item) => Math.abs(item.value - mid))) * 1.4826
    if (mad <= mid * 0.005) continue
    for (const { record, value } of points) {
      const z = (value - mid) / mad
      if (Math.abs(z) >= threshold) found.push({ month: record.month, metric: metric.metric, value, expected: mid, unit: metric.unit, direction: z > 0 ? 'high' : 'low', z, hint: z > 0 ? metric.high : metric.low })
    }
  }
  return found.sort((a, b) => monthIndex(b.month) - monthIndex(a.month))
}

/* ---------------- Years and targets ---------------- */

export type YearTotal = { year: number; scope1T: number; scope2T: number; totalT: number; productionT: number; months: number; actualMonths: number }

/** Calendar-year totals from actual months, topped up with forecast months. */
export function yearTotals(actual: MonthScopes[], projected: ForecastMonth[]): YearTotal[] {
  const years = new Map<number, YearTotal>()
  const add = (month: string, s1: number, s2: number, p: number, isActual: boolean) => {
    const year = Number(month.slice(0, 4))
    const entry = years.get(year) ?? { year, scope1T: 0, scope2T: 0, totalT: 0, productionT: 0, months: 0, actualMonths: 0 }
    entry.scope1T += s1; entry.scope2T += s2; entry.totalT += s1 + s2; entry.productionT += p; entry.months += 1
    if (isActual) entry.actualMonths += 1
    years.set(year, entry)
  }
  actual.forEach((item) => add(item.month, item.scope1T, item.scope2T, item.productionT, true))
  projected.forEach((item) => add(item.month, item.scope1T, item.scope2T, item.productionT, false))
  return [...years.values()].sort((a, b) => a.year - b.year)
}

export type TargetCheck = {
  baselineYear: number
  baselineT: number
  targetYear: number
  targetT: number
  projectedT: number | null
  gapT: number | null
  onTrack: boolean | null
  /** Where emissions should be this year on a straight line from baseline to target. */
  pathNowT: number | null
  basis: 'intensity' | 'absolute'
}

/**
 * Target check. The baseline is the baseline year's total (scaled up if months are missing). With
 * production data, the target is read as emissions per tonne, so growth in output is not penalised.
 */
export function targetCheck(years: YearTotal[], settings: Settings): TargetCheck {
  const { baselineYear, targetYear, targetReductionPct } = settings
  const base = years.find((item) => item.year === baselineYear && item.actualMonths >= 6) ?? years.find((item) => item.actualMonths >= 12) ?? years.find((item) => item.actualMonths > 0)
  const end = years.find((item) => item.year === targetYear && item.months === 12)
  const basis = base && base.productionT > 0 ? 'intensity' : 'absolute'
  if (!base) return { baselineYear, baselineT: 0, targetYear, targetT: 0, projectedT: null, gapT: null, onTrack: null, pathNowT: null, basis }
  const baseValue = basis === 'intensity' ? base.totalT / base.productionT : base.totalT * 12 / base.months
  const scale = (value: number, entry: YearTotal) => basis === 'intensity' ? value * entry.productionT : value
  const targetValue = baseValue * (1 - targetReductionPct / 100)
  const projected = end ? (basis === 'intensity' ? end.totalT / end.productionT : end.totalT) : null
  const thisYear = years.find((item) => item.year === new Date().getFullYear() && item.months === 12)
  const span = Math.max(1, targetYear - base.year)
  const pathValue = thisYear ? baseValue - (baseValue - targetValue) * Math.min(1, Math.max(0, (thisYear.year - base.year) / span)) : null
  return {
    baselineYear: base.year,
    baselineT: basis === 'intensity' ? base.totalT : baseValue,
    targetYear,
    targetT: end ? scale(targetValue, end) : targetValue,
    projectedT: end ? end.totalT : null,
    gapT: end && projected !== null ? scale(projected - targetValue, end) : null,
    onTrack: projected !== null ? projected <= targetValue : null,
    pathNowT: thisYear && pathValue !== null ? scale(pathValue, thisYear) : null,
    basis,
  }
}
