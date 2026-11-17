import { contextFor, machineEmissions, optionsFor, performance, plannedActions, type Option } from './calc'
import { measureById } from './measures'
import { siteRisks } from './risk'
import type { FactoryState, Machine, PlanAction } from './types'

/**
 * One row per building on the Site 3D: its carbon, cost, risk flags and actions. Figures come
 * from the machine list, which is matched to the site's bills (see calibration.ts).
 */

export type Flag = { id: 'target' | 'peak' | 'flood' | 'fuel'; label: string; detail: string; level: 'warn' | 'bad' }

export type BuildingRow = {
  machine: Machine
  scope1T: number
  scope2T: number
  totalT: number
  /** Share of the site's emissions (0–1). */
  share: number
  /** Energy cost a year at the site's tariff, RM. */
  costRM: number
  /** Emissions after planned actions. */
  afterT: number
  flags: Flag[]
  planned: { action: PlanAction; name: string; netT: number }[]
  /** Best upgrades not yet planned, cheapest per tonne first. */
  options: Option[]
}

export type SiteModel = { rows: BuildingRow[]; totalT: number; afterT: number; costRM: number; plannedCount: number; optionCount: number }

export function siteModel(state: FactoryState): SiteModel {
  const ctx = contextFor(state)
  const s = state.settings
  const planned = plannedActions(state)
  const electricTotal = state.machines.reduce((sum, m) => sum + m.electricityMWh, 0)
  const risks = siteRisks(state).risks
  const flood = risks.find((r) => r.id === 'flood')
  const floodHigh = flood?.likelihood !== null && (flood?.likelihood ?? 0) >= 3
  const groundLevel = Boolean(s.riskChecklist?.groundLevelCritical)
  const rows = state.machines.map((machine) => {
    const e = machineEmissions(machine, ctx)
    const scope1T = e.fuelT + e.processT, scope2T = e.electricityT
    const mine = planned.filter((p) => p.machine.id === machine.id)
    const reduction = Math.min(e.totalT, mine.reduce((sum, p) => sum + Math.max(0, p.economics.netT), 0))
    const inPlan = new Set(state.plan.filter((a) => a.machineId === machine.id).map((a) => a.measureId))
    const options = optionsFor(machine, state).filter((o) => !inPlan.has(o.measureId) && o.economics.netT > 0).slice(0, 3)
    const flags: Flag[] = []
    const perf = performance(machine, state)
    if (perf && perf.status === 'above') flags.push({ id: 'target', label: `${Math.round(perf.gapPct)}% over energy target`, detail: `${perf.actual.toFixed(perf.unit === 'GJ/t' ? 2 : 0)} vs target ${perf.target} ${perf.unit}`, level: perf.gapPct > 25 ? 'bad' : 'warn' })
    const elecShare = electricTotal > 0 ? machine.electricityMWh / electricTotal : 0
    if (elecShare >= 0.25) flags.push({ id: 'peak', label: 'Main peak-demand load', detail: `${Math.round(elecShare * 100)}% of the site’s electricity: its start-ups set the demand charge`, level: 'warn' })
    if (floodHigh && groundLevel && (machine.electricityMWh > 0)) flags.push({ id: 'flood', label: 'Flood-exposed equipment', detail: 'Site flood risk is possible or higher, and critical electrical gear is at ground level (site checklist)', level: 'bad' })
    return {
      machine, scope1T, scope2T, totalT: e.totalT, share: 0,
      costRM: machine.electricityMWh * s.electricityPriceRMPerMWh + (machine.fuel !== 'none' ? machine.fuelGJ * s.fuelPriceRMPerGJ[machine.fuel] : 0),
      afterT: e.totalT - reduction, flags,
      planned: mine.map((p) => ({ action: p.action, name: measureById(p.action.measureId)?.name ?? 'Action', netT: p.economics.netT })),
      options,
    }
  })
  const totalT = rows.reduce((sum, r) => sum + r.totalT, 0)
  for (const r of rows) r.share = totalT > 0 ? r.totalT / totalT : 0
  return {
    rows, totalT,
    afterT: rows.reduce((sum, r) => sum + r.afterT, 0),
    costRM: rows.reduce((sum, r) => sum + r.costRM, 0),
    plannedCount: rows.reduce((sum, r) => sum + r.planned.length, 0),
    optionCount: rows.reduce((sum, r) => sum + r.options.length, 0),
  }
}
