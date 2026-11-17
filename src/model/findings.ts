import { ringgit as rm } from '../format'
import { defaultTaxInputs } from './carbonTax'
import { gridFactor } from './factors'
import { DEFAULT_TARIFF, analyseInterval, intervalFor, monthsSpanned, timeLabel, type IntervalAnalysis } from './interval'
import { monthLabel } from './history'
import { outlook, type Outlook } from './outlook'
import type { FactoryState, FindingState } from './types'

/**
 * Findings: things the data says are costing money, each with a ringgit figure, the evidence,
 * what to do, and where to look. They come from the half-hourly load profile (peak demand, idle
 * load) and the monthly history (expected vs actual, unusual months). The team works through them
 * like an inbox: assign, fix, then check the saving against the baseline.
 */

export type FindingKind = 'peak' | 'idle' | 'base' | 'overspend' | 'anomaly'

export type Finding = {
  /** Stable key, so the team's status survives re-analysis. */
  key: string
  kind: FindingKind
  title: string
  /** Estimated money at stake each month (RM). */
  rmPerMonth: number
  /** CO₂e avoided a year if fixed (t); demand-only savings have none. */
  tPerYear: number
  evidence: string[]
  actions: string[]
  /** How sure we are: high = measured directly, medium = estimated from patterns. */
  confidence: 'high' | 'medium'
  /** Where to look in the app. */
  view: 'load' | 'dashboard'
  /** Plan measures that address it, when there is a matching one. */
  measureIds?: string[]
}

export const kindLabel: Record<FindingKind, string> = { peak: 'Peak demand', idle: 'Idle load', base: 'Base load', overspend: 'Above expected', anomaly: 'Unusual month' }

const kw = (v: number) => v >= 10_000 ? `${(v / 1_000).toFixed(1)} MW` : `${Math.round(v).toLocaleString('en-MY')} kW`

/** Share of idle energy usually avoidable by switching off auxiliaries during stops (assumption). */
export const IDLE_AVOIDABLE = 0.2
/** Hours of peak load a mill can typically reschedule each month without losing output (assumption). */
export const SHIFT_HOURS = 2

export function findingsFrom(state: FactoryState, load: IntervalAnalysis, view: Outlook): Finding[] {
  const tariff = { ...DEFAULT_TARIFF, ...state.settings.tariff }
  const grid = gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh)
  const out: Finding[] = []

  // 1. Peak demand: a few half-hours set the whole month's demand charge.
  const lastMonth = load.months.at(-1)
  if (lastMonth) {
    const shave = lastMonth.shave.find((s) => s.hours === SHIFT_HOURS)!
    const avgShave = load.months.reduce((s, m) => s + m.shave.find((x) => x.hours === SHIFT_HOURS)!.kW, 0) / load.months.length
    if (avgShave * tariff.mdRMPerKW > 1_000) out.push({
      key: 'peak-shave', kind: 'peak', confidence: 'high', view: 'load',
      title: `Move ${SHIFT_HOURS} hours of peak load`,
      rmPerMonth: avgShave * tariff.mdRMPerKW, tPerYear: 0,
      evidence: [
        `Peak ${kw(lastMonth.mdKW)} on ${timeLabel(lastMonth.mdAt)} set a ${rm(lastMonth.mdRM)} demand charge.`,
        `Only ${SHIFT_HOURS} hours that month were above ${kw(lastMonth.mdKW - shave.kW)}. Moving about ${Math.round(shave.mwhToMove)} MWh out of them lowers the maximum by ${kw(shave.kW)}.`,
        `Averaged over ${load.months.length} months: −${kw(avgShave)}, at RM ${tariff.mdRMPerKW}/kW.`,
      ],
      actions: ['Don’t restart the rolling mill while the furnace is melting.', 'Add a demand alarm a few percent below the target maximum so operators can delay a heat.', 'Check the peak times on the Load profile page and agree a start-up sequence with production.'],
    })
  }

  // 2. Idle load: energy drawn while the plant is not producing.
  const perMonth = monthsSpanned(load)
  const idleRM = load.idle.rm / perMonth
  if (load.idle.hours > 0 && idleRM * IDLE_AVOIDABLE > 1_000) out.push({
    key: 'idle-load', kind: 'idle', confidence: 'medium', view: 'load',
    title: 'Cut idle load during stops',
    rmPerMonth: idleRM * IDLE_AVOIDABLE, tPerYear: load.idle.mwh / perMonth * 12 * IDLE_AVOIDABLE * grid,
    evidence: [
      `Idle ${Math.round(load.idle.hours / perMonth)} h/month at ${kw(load.idle.avgKW)}: ${rm(idleRM)} of energy.`,
      `That is ${Math.round(load.idle.mwh / perMonth).toLocaleString('en-MY')} MWh a month, ${rm(idleRM)} of energy. Cutting it by ${IDLE_AVOIDABLE * 100}% is typical once stops have a shutdown checklist.`,
    ],
    actions: ['Use a shutdown checklist at every stop: fans, compressors, pumps, lights.', 'Fit automatic shutdown on compressors and fans that run during maintenance stops.', 'Check the Sunday profile on the Load profile page after each change.'],
    measureIds: ['vsd', 'air-leaks', 'line-idle'],
  })

  // 3. Base load: what the site draws at its quietest.
  const baseShare = load.baseKW / Math.max(1, load.avgKW)
  if (baseShare > 0.2) out.push({
    key: 'base-load', kind: 'base', confidence: 'medium', view: 'load',
    title: 'Reduce always-on load',
    rmPerMonth: load.baseKW * 0.1 * 730 * tariff.energyRMPerMWh / 1_000, tPerYear: load.baseKW * 0.1 * 8_760 / 1_000 * grid,
    evidence: [`Never below ${kw(load.baseKW)} (${Math.round(baseShare * 100)}% of average). Savings shown for a 10% cut.`, 'Trimming 10% of always-on load (leaks, idling drives, lighting, cooling left on) saves energy every hour of the year.'],
    actions: ['Walk the site during a stop and list what is still running.', 'Run a compressed-air leak survey (ultrasonic) and fix the largest leaks.'],
    measureIds: ['air-leaks', 'vsd'],
  })

  // 4. Expected vs actual: recent months above the baseline.
  if (view.baseline.available) {
    for (const m of view.baseline.months.slice(-3)) if (m.gapRM > 50_000) out.push({
      key: `over-${m.month}`, kind: 'overspend', confidence: 'high', view: 'dashboard',
      title: `${monthLabel(m.month)} used more than expected`,
      rmPerMonth: m.gapRM, tPerYear: 0,
      evidence: [`${rm(m.gapRM)} above normal for the tonnes made.`],
      actions: ['Compare shift logs and stoppages with a normal month.', 'Check whether a recent change (new product, failed drive, burner tuning) explains it.'],
    })
  }

  // 5. Unusual months from the energy-per-tonne checks.
  for (const a of view.anomalies.slice(0, 3)) if (a.direction === 'high') out.push({
    key: `anomaly-${a.month}-${a.metric}`, kind: 'anomaly', confidence: 'medium', view: 'dashboard',
    title: `${monthLabel(a.month)}: ${a.metric.toLowerCase()} high`,
    rmPerMonth: 0, tPerYear: 0,
    evidence: [`${a.value.toFixed(a.unit === 'GJ/t' ? 2 : 0)} vs typical ${a.expected.toFixed(a.unit === 'GJ/t' ? 2 : 0)} ${a.unit}.`],
    actions: [a.hint],
  })

  return out.sort((a, b) => b.rmPerMonth - a.rmPerMonth)
}

export type FindingsView = { load: IntervalAnalysis; loadSample: boolean; findings: (Finding & { state: FindingState })[] }

export function siteFindings(state: FactoryState): FindingsView {
  const { series, sample } = intervalFor(state)
  const load = analyseInterval(series, { ...DEFAULT_TARIFF, ...state.settings.tariff })
  const view = outlook(state, { ...defaultTaxInputs, ...state.settings.carbonTax })
  return {
    load,
    loadSample: sample,
    findings: findingsFrom(state, load, view).map((f) => ({ ...f, state: state.findings?.[f.key] ?? { status: 'new', updatedAt: '' } })),
  }
}
