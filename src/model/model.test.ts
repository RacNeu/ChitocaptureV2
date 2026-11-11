import { describe, expect, it } from 'vitest'
import { capitalRecoveryFactor, contextFor, economics, machineEmissions, optionsFor, summarise, trajectory } from './calc'
import { answer, autoPlan } from './copilot'
import { DEFAULT_SORBENT_CAPACITY, measureById, sorbentInventoryTonnes } from './measures'
import { freshState } from './store'
import { industryTemplates } from './templates'
import type { FactoryState, Machine } from './types'

function factory(machines: Partial<Machine>[], grid = 0.5): FactoryState {
  const base = freshState('cement')
  return {
    ...base,
    settings: { ...base.settings, gridRegionId: 'custom', customGridKgPerKWh: grid, discountRatePct: 0, targetReductionPct: 20 },
    machines: machines.map((machine, index) => ({ id: `m${index}`, name: `M${index}`, kind: 'fan', electricityMWh: 0, fuel: 'none', fuelGJ: 0, processT: 0, quality: 'estimated', col: index, row: 0, ...machine })),
  }
}

describe('emissions', () => {
  it('adds electricity, fuel and process emissions', () => {
    const state = factory([{ kind: 'kiln', electricityMWh: 100, fuel: 'coal', fuelGJ: 1_000, processT: 50 }])
    const result = machineEmissions(state.machines[0], contextFor(state))
    expect(result.electricityT).toBeCloseTo(50)
    expect(result.fuelT).toBeCloseTo(94.6)
    expect(result.totalT).toBeCloseTo(194.6)
  })

  it('does not count biogenic CO₂ from biomass in the gross total', () => {
    const state = factory([{ kind: 'boiler', fuel: 'biomass', fuelGJ: 10_000 }])
    expect(machineEmissions(state.machines[0], contextFor(state)).totalT).toBe(0)
  })
})

describe('economics', () => {
  it('uses straight-line recovery at a 0% discount rate', () => {
    expect(capitalRecoveryFactor(0, 10)).toBeCloseTo(0.1)
    expect(capitalRecoveryFactor(8, 10)).toBeCloseTo(0.149029, 5)
  })

  it('reports net CO₂ after the energy penalty and returns no cost per tonne when net is not positive', () => {
    const state = factory([{ kind: 'kiln' }], 1)
    const ctx = contextFor(state)
    const result = economics({ electricitySavedMWh: 0, fuelSavedGJ: 0, directT: 100, addedElectricityMWh: 150, capexRM: 1_000, opexChangeRM: 0, lifetimeYears: 10 }, state.machines[0], ctx, 0)
    expect(result.netT).toBeCloseTo(-50)
    expect(result.costPerTonneRM).toBeNull()
  })

  it('gives money-saving measures a negative cost per tonne and a payback', () => {
    const state = factory([{ kind: 'compressor', electricityMWh: 1_000 }])
    const leak = optionsFor(state.machines[0], state).find((option) => option.measureId === 'air-leaks')!
    expect(leak.economics.netT).toBeCloseTo(100)
    expect(leak.economics.costPerTonneRM!).toBeLessThan(0)
    expect(leak.economics.paybackYears).toBeCloseTo(0.5)
  })

  it('only offers measures that apply to the machine kind', () => {
    const state = factory([{ kind: 'office', electricityMWh: 100 }])
    const ids = optionsFor(state.machines[0], state).map((option) => option.measureId)
    expect(ids).toContain('led')
    expect(ids).not.toContain('air-leaks')
  })
})

describe('plan', () => {
  it('caps stacked reductions at what the machine emits', () => {
    const state = factory([{ kind: 'wastewater', processT: 100 }])
    state.plan = [{ id: 'a', machineId: 'm0', measureId: 'biogas', startYear: 2027 }]
    const summary = summarise(state)
    expect(summary.plannedReductionT).toBeCloseTo(80)
    expect(summary.afterPlanT).toBeCloseTo(20)
  })

  it('builds a trajectory that steps down in the start year', () => {
    const state = factory([{ kind: 'compressor', electricityMWh: 1_000 }])
    state.plan = [{ id: 'a', machineId: 'm0', measureId: 'air-leaks', startYear: 2028 }]
    const years = trajectory(state)
    expect(years.find((year) => year.year === 2027)!.emissionsT).toBeCloseTo(500)
    expect(years.find((year) => year.year === 2028)!.emissionsT).toBeCloseTo(400)
    expect(years.at(-1)!.targetPathT).toBeCloseTo(400)
  })

  it('auto-plans cheapest per tonne first until the target is met', () => {
    const state = factory([{ kind: 'compressor', electricityMWh: 1_000 }, { kind: 'kiln', fuel: 'coal', fuelGJ: 100_000, processT: 5_000 }])
    const plan = autoPlan(state)
    const planned = summarise({ ...state, plan })
    expect(plan.length).toBeGreaterThan(0)
    expect(planned.plannedReductionT).toBeGreaterThanOrEqual(planned.baselineT - planned.targetT - 1e-6)
  })
})

describe('chitosan capture', () => {
  it('needs less sorbent when the measured capacity is higher', () => {
    expect(sorbentInventoryTonnes(1_000, 3)).toBeCloseTo(sorbentInventoryTonnes(1_000, 1.5) / 2)
  })

  it('uses the measured capacity in the capex', () => {
    const state = factory([{ kind: 'kiln', processT: 100_000 }])
    const ctx = contextFor(state)
    const measure = measureById('chitosan-capture')!
    const assumed = measure.estimate(state.machines[0], ctx)!
    const measured = measure.estimate(state.machines[0], { ...ctx, measuredSorbentCapacity: DEFAULT_SORBENT_CAPACITY * 2 })!
    expect(measured.capexRM).toBeLessThan(assumed.capexRM)
    expect(measured.directT).toBeCloseTo(assumed.directT)
  })
})

describe('copilot and templates', () => {
  it('answers every question for every industry template without errors', () => {
    for (const template of industryTemplates) {
      const state = freshState(template.id)
      for (const question of ['start', 'target', 'capture', 'data', 'money'] as const) {
        const result = answer(question, state)
        expect(result.lines.length).toBeGreaterThan(0)
        expect(result.lines.join(' ')).not.toMatch(/NaN|undefined|Infinity/)
      }
    }
  })
})

import { areaSummary, performance } from './calc'

describe('energy performance and process areas', () => {
  it('compares energy per tonne with the target and works out the CO₂ at stake', () => {
    const state = factory([{ kind: 'fan', electricityMWh: 1_100, targetPerT: 100, area: 'Melt shop' }], 0.5)
    state.settings.productionTPerYear = 10_000
    const p = performance(state.machines[0], state)!
    expect(p.actual).toBeCloseTo(110)
    expect(p.status).toBe('above')
    expect(p.gapPct).toBeCloseTo(10)
    // 550 t from electricity; bringing 110 → 100 kWh/t cuts 1/11 of it.
    expect(p.excessT).toBeCloseTo(50)
  })

  it('uses GJ per tonne for fuel-fired machines and needs production to compare', () => {
    const state = factory([{ kind: 'furnace', fuel: 'natural-gas', fuelGJ: 9_000, targetPerT: 1 }])
    state.settings.productionTPerYear = 10_000
    expect(performance(state.machines[0], state)!.unit).toBe('GJ/t')
    expect(performance(state.machines[0], state)!.status).toBe('better')
    state.settings.productionTPerYear = null
    expect(performance(state.machines[0], state)).toBeNull()
  })

  it('groups machines by area with per-tonne figures', () => {
    const state = factory([
      { kind: 'fan', electricityMWh: 1_000, area: 'Melt shop' },
      { kind: 'pump', electricityMWh: 1_000, area: 'Melt shop' },
      { kind: 'office', electricityMWh: 200, area: 'Buildings' },
    ], 0.5)
    state.settings.productionTPerYear = 1_000
    const areas = areaSummary(state)
    expect(areas.map((area) => area.area)).toEqual(['Melt shop', 'Buildings'])
    expect(areas[0].totalT).toBeCloseTo(1_000)
    expect(areas[0].perTonneKg).toBeCloseTo(1_000)
  })

  it('gives every steel template machine a role and area, linked to control-room units', () => {
    const steel = freshState('steel')
    expect(steel.settings.productionTPerYear).toBeGreaterThan(0)
    expect(steel.machines.every((machine) => machine.role && machine.area)).toBe(true)
    expect(steel.machines.filter((machine) => machine.unitId).length).toBe(8)
  })
})

describe('steel-specific measures', () => {
  it('offers process measures on steel units and no generic mismatches', () => {
    const steel = freshState('steel')
    const byName = (name: string) => optionsFor(steel.machines.find((machine) => machine.name === name)!, steel).map((option) => option.measureId)
    expect(byName('Electric arc furnace')).toEqual(expect.arrayContaining(['eaf-optimisation', 'scrap-preheat']))
    expect(byName('Reheating furnace')).toEqual(expect.arrayContaining(['hot-charging', 'regen-burners', 'chitosan-capture']))
    expect(byName('Rolling mill')).not.toContain('grinding')
    expect(byName('Oxygen plant')).not.toContain('air-leaks')
    expect(byName('Oxygen plant')).toContain('oxygen-turndown')
    // Non-steel sites keep the generic library and never see steel-only measures.
    const cement = freshState('cement')
    expect(cement.machines.flatMap((machine) => optionsFor(machine, cement).map((option) => option.measureId))).not.toContain('hot-charging')
    expect(autoPlan(steel).every((action) => !['grinding'].includes(action.measureId))).toBe(true)
  })
})
