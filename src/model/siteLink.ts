import { calibrateGalv, defaultGalvParams, galvAnnualTonnes, galvIntensity, galvUnits, noGalvUpgrades, type GalvParams, type GalvUnitId } from './galv'
import { defaultSteelParams, steelUnits, tonnesPerHour, type SteelParams, type UnitId } from './steel'
import type { FactoryState, Machine } from './types'

/**
 * Links the live simulations to the machines entered for a site. Each simulated unit reads its
 * machine's yearly energy and the site's production, so editing a machine (or the production
 * figure) in Site 3D or Settings changes the simulation too.
 */

export type Deviation = { name: string; pct: number }
export type Linked<P> = { params: P; deviations: Deviation[]; linked: boolean }

const perT = (value: number, production: number) => value / Math.max(1, production)

export function steelFromSite(state: FactoryState, base: SteelParams = defaultSteelParams): Linked<SteelParams> {
  const production = state.settings.productionTPerYear
  if (!production) return { params: base, deviations: [], linked: false }
  const p: SteelParams = { ...base, kwhPerT: { ...base.kwhPerT } }
  const byUnit = (id: UnitId) => state.machines.find((machine) => machine.unitId === id)
  const deviations: Deviation[] = []
  const note = (machine: Machine | undefined, now: number, was: number) => {
    if (machine && was > 0 && Math.abs(now / was - 1) > 0.02) deviations.push({ name: machine.name, pct: (now / was - 1) * 100 })
  }
  for (const unit of steelUnits) {
    const machine = byUnit(unit.id)
    if (!machine || unit.id === 'scrap') continue
    if (unit.id === 'reheat') { const v = perT(machine.fuelGJ, production); note(machine, v, base.reheatGJPerT); p.reheatGJPerT = v; continue }
    const v = perT(machine.electricityMWh * 1_000, production)
    note(machine, v, base.kwhPerT[unit.id])
    p.kwhPerT[unit.id] = v
    if (unit.id === 'eaf') p.eafDirectKgPerT = perT(machine.processT * 1_000, production)
  }
  p.operatingHoursPerYear = Math.min(8_760, Math.max(1_000, production / tonnesPerHour(base)))
  const baseYear = tonnesPerHour(base) * base.operatingHoursPerYear
  if (Math.abs(production / baseYear - 1) > 0.02) deviations.push({ name: 'Production', pct: (production / baseYear - 1) * 100 })
  return { params: p, deviations, linked: true }
}

export function galvFromSite(state: FactoryState, base: GalvParams = defaultGalvParams): Linked<GalvParams> {
  const production = state.settings.productionTPerYear
  if (!production) return { params: base, deviations: [], linked: false }
  const machine = (id: GalvUnitId) => state.machines.find((item) => item.name === galvUnits.find((unit) => unit.id === id)?.machineName)
  const kwh = (id: GalvUnitId) => { const m = machine(id); return m ? perT(m.electricityMWh * 1_000, production) : undefined }
  const gj = (id: GalvUnitId) => { const m = machine(id); return m ? perT(m.fuelGJ, production) : undefined }
  const params = calibrateGalv(base, {
    productionT: production,
    picklingKWhPerT: kwh('pickling'),
    drawingKWhPerT: kwh('drawing'),
    annealGJPerT: gj('anneal'),
    kettleGJPerT: gj('kettle'),
    lineDrivesKWhPerT: kwh('kettle'),
    utilitiesKWhPerT: kwh('utilities'),
    wastewaterKWhPerT: kwh('wastewater'),
  })
  const before = galvIntensity(base, noGalvUpgrades), after = galvIntensity(params, noGalvUpgrades)
  const deviations: Deviation[] = []
  const compare = (id: GalvUnitId, now: number, was: number) => { if (was > 0 && Math.abs(now / was - 1) > 0.02) deviations.push({ name: machine(id)?.name ?? id, pct: (now / was - 1) * 100 }) }
  compare('pickling', after.kwh.pickling, before.kwh.pickling)
  compare('drawing', after.kwh.drawing, before.kwh.drawing)
  compare('anneal', after.annealGJPerT, before.annealGJPerT)
  compare('kettle', after.kettleGJPerT, before.kettleGJPerT)
  compare('utilities', after.kwh.utilities, before.kwh.utilities)
  compare('wastewater', after.kwh.wastewater, before.kwh.wastewater)
  const baseYear = galvAnnualTonnes(base)
  if (Math.abs(production / baseYear - 1) > 0.02) deviations.push({ name: 'Production', pct: (production / baseYear - 1) * 100 })
  return { params, deviations, linked: true }
}

