import { fuelFactorsKgPerGJ, gridFactor } from './factors'
import { measureById, measures, steelUnitMeasures } from './measures'
import type { EstimateContext, FactoryState, FuelType, Machine, MeasureEffect, PlanAction } from './types'

export function contextFor(state: FactoryState): EstimateContext {
  const { settings } = state
  return {
    gridKgPerKWh: gridFactor(settings.gridRegionId, settings.customGridKgPerKWh),
    fuelKgPerGJ: (fuel: FuelType) => fuelFactorsKgPerGJ[fuel],
    electricityPriceRMPerMWh: settings.electricityPriceRMPerMWh,
    fuelPriceRMPerGJ: (fuel: FuelType) => fuel === 'none' ? 0 : settings.fuelPriceRMPerGJ[fuel],
    measuredSorbentCapacity: state.measuredSorbentCapacity,
  }
}

const safe = (value: number) => (Number.isFinite(value) ? value : 0)

export type MachineEmissions = { electricityT: number; fuelT: number; processT: number; totalT: number }

export function machineEmissions(machine: Machine, ctx: EstimateContext): MachineEmissions {
  const electricityT = safe(machine.electricityMWh) * ctx.gridKgPerKWh
  const fuelT = safe(machine.fuelGJ) * ctx.fuelKgPerGJ(machine.fuel) / 1_000
  const processT = safe(machine.processT)
  return { electricityT, fuelT, processT, totalT: electricityT + fuelT + processT }
}

export function capitalRecoveryFactor(ratePct: number, years: number) {
  const n = Math.max(1, Math.round(safe(years)))
  const r = Math.max(0, safe(ratePct)) / 100
  return r === 0 ? 1 / n : r * (1 + r) ** n / ((1 + r) ** n - 1)
}

export type Economics = {
  effect: MeasureEffect
  grossT: number
  penaltyT: number
  netT: number
  capexRM: number
  /** Net annual cash saving (energy plus opex), positive = saves money. */
  annualSavingRM: number
  /** Annualised net cost per tonne. Negative = the measure makes money. Null if it does not cut CO₂e. */
  costPerTonneRM: number | null
  paybackYears: number | null
}

export function economics(effect: MeasureEffect, machine: Machine, ctx: EstimateContext, discountRatePct: number): Economics {
  const fuelFactor = ctx.fuelKgPerGJ(machine.fuel)
  const grossT = effect.electricitySavedMWh * ctx.gridKgPerKWh + effect.fuelSavedGJ * fuelFactor / 1_000 + effect.directT
  const penaltyT = effect.addedElectricityMWh * ctx.gridKgPerKWh
  const netT = grossT - penaltyT
  const energySavingRM = (effect.electricitySavedMWh - effect.addedElectricityMWh) * ctx.electricityPriceRMPerMWh
    + effect.fuelSavedGJ * ctx.fuelPriceRMPerGJ(machine.fuel)
  const annualSavingRM = energySavingRM - effect.opexChangeRM
  const annualCost = effect.capexRM * capitalRecoveryFactor(discountRatePct, effect.lifetimeYears) - annualSavingRM
  return {
    effect,
    grossT,
    penaltyT,
    netT,
    capexRM: effect.capexRM,
    annualSavingRM,
    costPerTonneRM: netT > 0 ? annualCost / netT : null,
    paybackYears: annualSavingRM > 0 ? effect.capexRM / annualSavingRM : null,
  }
}

export type Option = { machine: Machine; measureId: string; economics: Economics }

/** Every measure that applies to a machine, with its economics, best first. */
export function optionsFor(machine: Machine, state: FactoryState): Option[] {
  const ctx = contextFor(state)
  const steelSet = machine.unitId ? steelUnitMeasures[machine.unitId] : undefined
  return measures.filter((measure) => steelSet ? steelSet.includes(measure.id) : measure.appliesTo.includes(machine.kind) && !measure.steelOnly)
    .map((measure) => {
      const effect = measure.estimate(machine, ctx)
      return effect ? { machine, measureId: measure.id, economics: economics(effect, machine, ctx, state.settings.discountRatePct) } : null
    })
    .filter((option): option is Option => option !== null)
    .sort((a, b) => rankScore(a.economics) - rankScore(b.economics))
}

/** Rank cheap-per-tonne first; projects that cut no CO₂e go last. */
function rankScore(item: Economics) { return item.costPerTonneRM === null ? Number.POSITIVE_INFINITY : item.costPerTonneRM }

export type PlannedAction = { action: PlanAction; machine: Machine; economics: Economics }

export function plannedActions(state: FactoryState): PlannedAction[] {
  const ctx = contextFor(state)
  // Rejected actions no longer count towards the plan.
  return state.plan.filter((action) => action.status !== 'rejected').flatMap((action) => {
    const machine = state.machines.find((item) => item.id === action.machineId)
    const measure = measureById(action.measureId)
    const effect = machine && measure?.estimate(machine, ctx)
    return machine && effect ? [{ action, machine, economics: economics(effect, machine, ctx, state.settings.discountRatePct) }] : []
  })
}

export type FactorySummary = {
  baselineT: number
  targetT: number
  plannedReductionT: number
  afterPlanT: number
  gapT: number
  capexRM: number
  annualSavingRM: number
  byMachine: { machine: Machine; baselineT: number; reductionT: number; afterT: number }[]
}

export function summarise(state: FactoryState): FactorySummary {
  const ctx = contextFor(state)
  const actions = plannedActions(state)
  const byMachine = state.machines.map((machine) => {
    const baselineT = machineEmissions(machine, ctx).totalT
    const reductionT = actions.filter((item) => item.machine.id === machine.id).reduce((sum, item) => sum + item.economics.netT, 0)
    // Stacked measures on one machine cannot remove more than the machine emits.
    const capped = Math.min(baselineT, reductionT)
    return { machine, baselineT, reductionT: capped, afterT: baselineT - capped }
  })
  const baselineT = byMachine.reduce((sum, row) => sum + row.baselineT, 0)
  const plannedReductionT = byMachine.reduce((sum, row) => sum + row.reductionT, 0)
  const targetT = baselineT * (1 - state.settings.targetReductionPct / 100)
  const afterPlanT = baselineT - plannedReductionT
  return {
    baselineT,
    targetT,
    plannedReductionT,
    afterPlanT,
    gapT: Math.max(0, afterPlanT - targetT),
    capexRM: actions.reduce((sum, item) => sum + item.economics.capexRM, 0),
    annualSavingRM: actions.reduce((sum, item) => sum + item.economics.annualSavingRM, 0),
    byMachine,
  }
}

/** Emissions each year from the baseline year to the target year as planned actions start. */
export function trajectory(state: FactoryState): { year: number; emissionsT: number; targetPathT: number }[] {
  const summary = summarise(state)
  const actions = plannedActions(state)
  const { baselineYear, targetYear } = state.settings
  const span = Math.max(1, targetYear - baselineYear)
  const years: { year: number; emissionsT: number; targetPathT: number }[] = []
  for (let year = baselineYear; year <= targetYear; year += 1) {
    const reduction = actions.filter((item) => item.action.startYear <= year).reduce((sum, item) => sum + Math.max(0, item.economics.netT), 0)
    years.push({
      year,
      emissionsT: Math.max(summary.afterPlanT, summary.baselineT - reduction),
      targetPathT: summary.baselineT - (summary.baselineT - summary.targetT) * (year - baselineYear) / span,
    })
  }
  return years
}

/* ---------------- Energy performance vs target ---------------- */

export type Performance = {
  actual: number
  target: number
  unit: 'kWh/t' | 'GJ/t'
  /** Percentage above (+) or below (−) target. */
  gapPct: number
  status: 'on-target' | 'above' | 'better'
  /** CO₂e a year that would be avoided by bringing the machine down to its target. */
  excessT: number
}

/** Energy intensity per tonne of product compared with the machine's target, if both are known. */
export function performance(machine: Machine, state: FactoryState): Performance | null {
  const production = state.settings.productionTPerYear
  if (!machine.targetPerT || !production || production <= 0) return null
  const ctx = contextFor(state)
  const fuelled = machine.fuelGJ > 0
  const actual = fuelled ? machine.fuelGJ / production : machine.electricityMWh * 1_000 / production
  if (actual <= 0) return null
  const gapPct = (actual / machine.targetPerT - 1) * 100
  const emissions = machineEmissions(machine, ctx)
  const energyT = fuelled ? emissions.fuelT : emissions.electricityT
  return {
    actual,
    target: machine.targetPerT,
    unit: fuelled ? 'GJ/t' : 'kWh/t',
    gapPct,
    status: gapPct > 2 ? 'above' : gapPct < -2 ? 'better' : 'on-target',
    excessT: gapPct > 0 ? energyT * (1 - machine.targetPerT / actual) : 0,
  }
}

export type AreaSummary = { area: string; totalT: number; perTonneKg: number | null; machines: Machine[]; excessT: number }

/** Emissions grouped by process area, largest first. */
export function areaSummary(state: FactoryState, useAfterPlan = false): AreaSummary[] {
  const summary = summarise(state)
  const production = state.settings.productionTPerYear
  const areas = new Map<string, AreaSummary>()
  for (const row of summary.byMachine) {
    const area = row.machine.area ?? 'Other'
    const entry = areas.get(area) ?? { area, totalT: 0, perTonneKg: null, machines: [], excessT: 0 }
    entry.totalT += useAfterPlan ? row.afterT : row.baselineT
    entry.machines.push(row.machine)
    entry.excessT += performance(row.machine, state)?.excessT ?? 0
    areas.set(area, entry)
  }
  return [...areas.values()]
    .map((entry) => ({ ...entry, perTonneKg: production ? entry.totalT / production * 1_000 : null }))
    .sort((a, b) => b.totalT - a.totalT)
}
