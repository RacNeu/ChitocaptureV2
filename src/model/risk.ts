import { ringgit as rm, tonnes as t } from '../format'
import { defaultTaxInputs, rmPerTonne } from './carbonTax'
import { DEFAULT_TARIFF, analyseInterval, intervalFor, type IntervalAnalysis } from './interval'
import { evidenceShare, fuels, historyFor, monthIndex } from './history'
import { outlook, type Outlook } from './outlook'
import type { FactoryState, FindingState } from './types'

/**
 * Site risk register for the plant manager: likelihood (1–5) × impact (1–5), per horizon.
 * Nothing is invented. Each risk is computed only from the site's uploads, NASA POWER climate data,
 * the site checklist, or a published rate; when an input is missing the risk says what it needs.
 */

export type Horizon = 'month' | 'years' | '2030'
export const horizonLabel: Record<Horizon, string> = { month: 'Next month', years: '1–3 years', '2030': 'To 2030' }
export type Basis = 'your data' | 'NASA POWER' | 'checklist' | 'published rate' | 'assumption'
export type View = 'load' | 'dashboard' | 'data' | 'findings' | 'plan' | 'settings'

export type Risk = {
  id: string
  name: string
  horizon: Horizon
  /** 1 rare · 2 unlikely · 3 possible · 4 likely · 5 almost certain. Null when an input is missing. */
  likelihood: number | null
  impact: number | null
  /** Money at stake a year (or per event for flood), RM. */
  rm: number | null
  rmLabel: string
  missing: string[]
  evidence: string[]
  actions: string[]
  basis: Basis[]
  links: View[]
}

export const likelihoodLabel = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain']
export const impactLabel = ['', 'Minor', 'Moderate', 'Significant', 'Major', 'Severe']

/** Probability (0–1) → likelihood level. */
export const levelFromP = (p: number) => p < 0.05 ? 1 : p < 0.2 ? 2 : p < 0.5 ? 3 : p < 0.8 ? 4 : 5

/** RM a year → impact level, as a share of the site's yearly energy bill (absolute bands if unknown). */
export function impactLevel(rmValue: number, energyBillRM: number | null) {
  if (energyBillRM && energyBillRM > 0) {
    const share = rmValue / energyBillRM
    return share < 0.005 ? 1 : share < 0.02 ? 2 : share < 0.05 ? 3 : share < 0.1 ? 4 : 5
  }
  return rmValue < 50_000 ? 1 : rmValue < 500_000 ? 2 : rmValue < 2_000_000 ? 3 : rmValue < 10_000_000 ? 4 : 5
}

const Z80 = 1.2816
const normalCdf = (z: number) => 0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z ** 3)))

export type RiskInputs = { state: FactoryState; view: Outlook; load: IntervalAnalysis | null }

export function risks({ state, view, load }: RiskInputs): { risks: Risk[]; energyBillRM: number | null } {
  const s = state.settings
  const c = s.riskChecklist ?? {}
  const tariff = { ...DEFAULT_TARIFF, ...s.tariff }
  const tax = { ...defaultTaxInputs, ...s.carbonTax }
  const { records } = historyFor(state)
  const last12 = records.slice(-12)
  const energyBillRM = last12.length
    ? last12.reduce((sum, r) => sum + r.electricityMWh * s.electricityPriceRMPerMWh + fuels.reduce((f, fuel) => f + (r.fuelGJ[fuel] ?? 0) * s.fuelPriceRMPerGJ[fuel], 0), 0) * 12 / last12.length
    : null
  const climate = state.climate
  const out: Risk[] = []
  const add = (r: Omit<Risk, 'impact'> & { impact?: number | null }) => out.push({ ...r, impact: r.impact !== undefined ? r.impact : r.rm !== null ? impactLevel(r.rm, energyBillRM) : null })

  // 1. Peak-demand spike next month (measured).
  if (load && load.months.length) {
    const spiky = load.months.filter((m) => m.shave[0].kW / m.mdKW >= 0.05)
    const avgSpikeKW = load.months.reduce((sum, m) => sum + m.shave[0].kW, 0) / load.months.length
    add({ id: 'peak', name: 'Peak-demand spike', horizon: 'month', likelihood: levelFromP(spiky.length / load.months.length), rm: avgSpikeKW * tariff.mdRMPerKW * 12, rmLabel: '/yr',
      missing: [], basis: ['your data'], links: ['load', 'findings'],
      evidence: [`${spiky.length} of ${load.months.length} months: peak set by a 1-hour spike ≥5% above normal running.`, `Spikes add ~${Math.round(avgSpikeKW).toLocaleString('en-MY')} kW to the demand charge at RM ${tariff.mdRMPerKW}/kW.`],
      actions: ['Stagger start-ups; no rolling-mill restart during melting.', 'Set a demand alarm just below your target peak.'] })
  } else add({ id: 'peak', name: 'Peak-demand spike', horizon: 'month', likelihood: null, rm: null, rmLabel: '', missing: ['Half-hourly meter data'], basis: [], links: ['load'], evidence: [], actions: ['Upload half-hourly data on Load profile.'] })

  // 2. Tariff increase (your bill × your expected change).
  if (energyBillRM !== null && c.tariffRisePct !== undefined) {
    const elec = last12.reduce((sum, r) => sum + r.electricityMWh, 0) * 12 / last12.length * s.electricityPriceRMPerMWh
    add({ id: 'tariff', name: 'Electricity tariff rise', horizon: 'years', likelihood: c.tariffRisePct > 0 ? 3 : 1, rm: elec * c.tariffRisePct / 100, rmLabel: '/yr',
      missing: [], basis: ['your data', 'assumption'], links: ['load', 'plan'],
      evidence: [`Electricity ~${rm(elec)}/yr × your expected ${c.tariffRisePct}% rise.`, 'Likelihood “possible” until TNB announces its next review.'],
      actions: ['Cut the always-on load and peaks first: they shrink any tariff rise.', 'Price a solar or green-electricity contract against the higher tariff.'] })
  } else add({ id: 'tariff', name: 'Electricity tariff rise', horizon: 'years', likelihood: null, rm: null, rmLabel: '', missing: [...(energyBillRM === null ? ['Monthly bills'] : []), ...(c.tariffRisePct === undefined ? ['Expected tariff change % (checklist)'] : [])], basis: [], links: ['data'], evidence: [], actions: [] })

  // 3. Flood (checklist + NASA rainfall trend).
  const floodAnswered = c.pastFloods !== undefined && c.floodProneArea !== undefined && c.riverDistance !== undefined
  const costKnown = c.costPerDayRM !== undefined && c.downtimeDaysPerFlood !== undefined
  if (floodAnswered && costKnown) {
    const rainUp = climate ? climate.rain.recentPerYear / Math.max(0.01, climate.rain.earlyPerYear) : 1
    const score = [0, 2, 3][c.pastFloods!] + (c.floodProneArea === 'yes' ? 2 : 0) + ({ near: 2, mid: 1, far: 0 })[c.riverDistance!] + (rainUp > 1.25 ? 1 : 0)
    const level = score <= 1 ? 1 : score <= 3 ? 2 : score <= 5 ? 3 : score <= 7 ? 4 : 5
    const perEvent = c.downtimeDaysPerFlood! * c.costPerDayRM! * (c.groundLevelCritical ? 1.5 : 1)
    add({ id: 'flood', name: 'Flood shutdown', horizon: 'years', likelihood: level, rm: perEvent, rmLabel: '/event',
      missing: climate ? [] : ['NASA climate data (optional)'], basis: climate ? ['checklist', 'NASA POWER'] : ['checklist'], links: ['settings'],
      evidence: [
        `Checklist: ${['no', 'one', 'two or more'][c.pastFloods!]} floods in 10 years · ${c.floodProneArea === 'yes' ? 'in' : 'outside'} a JPS flood-prone area · river ${({ near: '<500 m', mid: '0.5–2 km', far: '>2 km' })[c.riverDistance!]}.`,
        `One flood ≈ ${c.downtimeDaysPerFlood} days × ${rm(c.costPerDayRM!)}${c.groundLevelCritical ? ' × 1.5 (critical equipment at ground level)' : ''}.`,
        ...(climate ? [`NASA POWER: extreme-rain days ${climate.rain.earlyPerYear.toFixed(1)}/yr (1996–2010) → ${climate.rain.recentPerYear.toFixed(1)}/yr (2011–2025). Wettest 3 days: ${Math.round(climate.rain.max3DayMm)} mm (${climate.rain.max3DayDate}).`] : []),
      ],
      actions: ['Raise or bund transformers, switchgear and drives above past flood level.', 'Agree a flood shutdown plan; subscribe to JPS and MetMalaysia warnings.'] })
  } else add({ id: 'flood', name: 'Flood shutdown', horizon: 'years', likelihood: null, rm: null, rmLabel: '', missing: [...(floodAnswered ? [] : ['Flood questions (checklist)']), ...(costKnown ? [] : ['Downtime days and cost per day (checklist)'])], basis: [], links: ['settings'], evidence: [], actions: [] })

  // 4. Heat (NASA trend + checklist cost).
  if (climate && c.heatLostDaysPerYear !== undefined && c.costPerDayRM !== undefined) {
    const ratio = climate.hot.recentPerYear / Math.max(0.01, climate.hot.earlyPerYear)
    add({ id: 'heat', name: 'Heat disruption', horizon: '2030', likelihood: ratio <= 1.1 ? 2 : ratio <= 1.5 ? 3 : ratio <= 2.5 ? 4 : 5, rm: c.heatLostDaysPerYear * c.costPerDayRM * Math.max(1, ratio), rmLabel: '/yr',
      missing: [], basis: ['NASA POWER', 'checklist'], links: ['settings'],
      evidence: [`NASA POWER: days above ${climate.hot.thresholdC.toFixed(1)} °C went from ${climate.hot.earlyPerYear.toFixed(1)}/yr (1996–2010) to ${climate.hot.recentPerYear.toFixed(1)}/yr (2011–2025), ×${ratio.toFixed(1)}.`, `Your ${c.heatLostDaysPerYear} lost days/yr scaled by that trend.`],
      actions: ['Check transformer and drive cooling; clean fins and filters before hot months.', 'Heat-stress breaks and cooling for melt-shop crews.'] })
  } else add({ id: 'heat', name: 'Heat disruption', horizon: '2030', likelihood: null, rm: null, rmLabel: '', missing: [...(climate ? [] : ['Site location + NASA climate data']), ...(c.heatLostDaysPerYear === undefined || c.costPerDayRM === undefined ? ['Heat lost days and cost per day (checklist)'] : [])], basis: [], links: ['settings'], evidence: [], actions: [] })

  // 5. Missing the target (forecast range vs target).
  const tg = view.target
  const targetMonths = view.forecast.months.filter((m) => m.month.startsWith(String(tg.targetYear)))
  if (tg.projectedT !== null && targetMonths.length === 12) {
    const sd = Math.sqrt(targetMonths.reduce((sum, m) => sum + ((m.highT - m.lowT) / (2 * Z80)) ** 2, 0))
    const p = sd > 0 ? 1 - normalCdf((tg.targetT - tg.projectedT) / sd) : tg.projectedT > tg.targetT ? 1 : 0
    const price = rmPerTonne(tg.targetYear, tax)
    add({ id: 'target', name: 'Missing the target', horizon: '2030', likelihood: levelFromP(p), rm: Math.max(0, tg.gapT ?? 0) * price, rmLabel: '/yr', impact: (tg.gapT ?? 0) <= 0 ? 1 : undefined,
      missing: [], basis: ['your data', 'published rate'], links: ['dashboard', 'plan'],
      evidence: [`Forecast ${t(tg.projectedT)} in ${tg.targetYear} vs target ${t(tg.targetT)}: ${Math.round(p * 100)}% chance of missing it.`, `The gap priced at the ${tg.targetYear} carbon rate (RM ${Math.round(price)}/t, Singapore reference).`],
      actions: ['Pick plan actions that close the gap, cheapest per tonne first.'] })
  } else add({ id: 'target', name: 'Missing the target', horizon: '2030', likelihood: null, rm: null, rmLabel: '', missing: ['12+ months of bills with production'], basis: [], links: ['data'], evidence: [], actions: [] })

  // 6. Disclosure gaps (data completeness).
  const nowIndex = monthIndex(new Date().toISOString().slice(0, 7)) - 1
  const covered = new Set(records.map((r) => r.month))
  let have = 0
  for (let k = 0; k < 12; k += 1) { const i = nowIndex - k; if (covered.has(`${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`)) have += 1 }
  const evidence = evidenceShare(last12)
  const gapP = 1 - (have / 12) * (0.5 + 0.5 * evidence)
  add({ id: 'disclosure', name: 'Disclosure gaps', horizon: 'years', likelihood: levelFromP(gapP), rm: null, rmLabel: '', impact: 3,
    missing: [], basis: ['your data'], links: ['data'],
    evidence: [`${have} of the last 12 months uploaded; ${Math.round(evidence * 100)}% have a bill attached as evidence.`, 'Impact: compliance and buyer trust (not priced).'],
    actions: ['Upload each month’s TNB bill and fuel invoice with the data.'] })

  // 7. Carbon tax (published reference rate on your emissions).
  const next = view.tax.find((row) => row.year === new Date().getFullYear() + 1)
  const y2030 = view.tax.find((row) => row.year === 2030)
  if (next) add({ id: 'carbon-years', name: 'Carbon tax', horizon: 'years', likelihood: 4, rm: next.billRM, rmLabel: '/yr', missing: [], basis: ['your data', 'published rate'], links: ['dashboard', 'plan'],
    evidence: [`${next.year}: ${t(next.taxableT)} × RM ${Math.round(next.rmPerT)}/t (Singapore reference).`, 'Likely: announced for iron and steel; rate not yet set.'],
    actions: ['Do plan actions that cost less per tonne than the tax.'] })
  if (y2030) add({ id: 'carbon-2030', name: 'Carbon tax 2030', horizon: '2030', likelihood: 4, rm: y2030.billRM, rmLabel: '/yr', missing: [], basis: ['your data', 'published rate'], links: ['dashboard', 'plan'],
    evidence: [`2030: ${t(y2030.taxableT)} × RM ${Math.round(y2030.rmPerT)}/t (S$${tax.rateCase === 'low' ? 50 : tax.rateCase === 'high' ? 80 : 65} case).`],
    actions: ['Lock in efficiency and green electricity before the rate rises.'] })
  if (!next && !y2030) add({ id: 'carbon-years', name: 'Carbon tax', horizon: 'years', likelihood: null, rm: null, rmLabel: '', missing: ['Monthly bills'], basis: [], links: ['data'], evidence: [], actions: [] })

  return { risks: out, energyBillRM }
}

export type RiskView = { risks: (Risk & { state: FindingState })[]; energyBillRM: number | null; load: IntervalAnalysis | null }

export function siteRisks(state: FactoryState): RiskView {
  const series = intervalFor(state)
  const load = series ? analyseInterval(series, { ...DEFAULT_TARIFF, ...state.settings.tariff }) : null
  const view = outlook(state, { ...defaultTaxInputs, ...state.settings.carbonTax })
  const result = risks({ state, view, load })
  return { ...result, load, risks: result.risks.map((r) => ({ ...r, state: state.findings?.[`risk-${r.id}`] ?? { status: 'new', updatedAt: '' } })) }
}
