import { energyBaseline, type Baseline } from './baseline'
import { defaultTaxInputs, taxBill, type TaxInputs, type TaxYear } from './carbonTax'
import { anomalies, forecast, historyFor, monthIndex, scopesFor, targetCheck, yearTotals, type Anomaly, type Forecast, type MonthScopes, type TargetCheck, type YearTotal } from './history'
import type { FactoryState } from './types'

/** Everything the dashboard, copilot and report need, computed once from a site's monthly history. */
export type Outlook = {
  /** True until the site uploads monthly data. */
  empty: boolean
  months: MonthScopes[]
  /** The last 12 months (or fewer), the headline period. */
  last12: { scope1T: number; scope2T: number; totalT: number; productionT: number; from: string; to: string; count: number }
  /** The 12 months before that, for the change figure; null without enough history. */
  prior12: { scope1T: number; scope2T: number; totalT: number } | null
  forecast: Forecast
  years: YearTotal[]
  tax: TaxYear[]
  target: TargetCheck
  anomalies: Anomaly[]
  /** Expected vs actual energy against the first 12 months. */
  baseline: Baseline
}

export function outlook(state: FactoryState, taxInputs: TaxInputs = defaultTaxInputs): Outlook {
  const { records } = historyFor(state)
  const months = records.map((record) => scopesFor(record, state.settings))
  const last = months.at(-1)
  // Forecast to the end of the target year (at least 12 months, at most 10 years).
  const horizon = last ? Math.min(120, Math.max(12, (state.settings.targetYear * 12 + 11) - monthIndex(last.month))) : 12
  const projected = forecast(months, horizon)
  const years = yearTotals(months, projected.months)
  const sum = (items: MonthScopes[]) => items.reduce((acc, item) => ({ scope1T: acc.scope1T + item.scope1T, scope2T: acc.scope2T + item.scope2T, totalT: acc.totalT + item.totalT, productionT: acc.productionT + item.productionT }), { scope1T: 0, scope2T: 0, totalT: 0, productionT: 0 })
  const recent = months.slice(-12)
  const before = months.length >= 24 ? months.slice(-24, -12) : null
  return {
    empty: records.length === 0,
    months,
    last12: { ...sum(recent), from: recent[0]?.month ?? '', to: recent.at(-1)?.month ?? '', count: recent.length },
    prior12: before ? sum(before) : null,
    forecast: projected,
    years,
    tax: taxBill(years.filter((item) => item.months === 12), taxInputs),
    target: targetCheck(years, state.settings),
    anomalies: anomalies(records),
    baseline: energyBaseline(records, state.settings),
  }
}
