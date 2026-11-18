import { capitalRecoveryFactor, contextFor, economics, machineEmissions } from './calc'
import { defaultTaxInputs, rmPerTonne } from './carbonTax'
import { fuelFactorsKgPerGJ } from './factors'
import { DEFAULT_TARIFF, analyseInterval, intervalFor } from './interval'
import { measureById } from './measures'
import type { FactoryState, Machine, MachineKind } from './types'

/**
 * Pre-operations planner: scenarios of changes to a site, drawn on the Site 3D.
 *   upgrade: a measure from the library on an existing building (same figures as the Plan)
 *   replace: swap a building's technology (e.g. gas reheating → induction)       [design estimate]
 *   add:     place a new asset on an empty plot (solar, battery, new line)       [design estimate]
 * Design estimates use the typical engineering values listed below, shown to the user with a tag.
 */

export type Change =
  | { id: string; type: 'upgrade'; machineId: string; measureId: string }
  | { id: string; type: 'replace'; machineId: string; replaceId: ReplaceId }
  | { id: string; type: 'add'; assetId: AssetId; col: number; row: number; size: number }

export type Scenario = { id: string; name: string; changes: Change[]; createdAt: string }
/** A change before it gets an id. */
export type NewChange = { [K in Change['type']]: Omit<Extract<Change, { type: K }>, 'id'> }[Change['type']]

/* ---------------- Design-estimate libraries ---------------- */

export type ReplaceId = 'induction-heating' | 'electric-boiler'
export const replacements: Record<ReplaceId, { name: string; from: string; appliesTo: MachineKind[]; fuelEff: number; elecEff: number; capexRMPerMW: number; hours: number; lifetime: number; note: string }> = {
  'induction-heating': { name: 'Induction billet heating', from: 'gas-fired reheating', appliesTo: ['furnace'], fuelEff: 0.55, elecEff: 0.75, capexRMPerMW: 3_500_000, hours: 7_000, lifetime: 20, note: 'Gas furnace ~55% efficient, induction ~75%; RM 3.5m per MW of induction power; 7,000 h/yr.' },
  'electric-boiler': { name: 'Electric boiler', from: 'fuel-fired boiler', appliesTo: ['boiler'], fuelEff: 0.85, elecEff: 0.99, capexRMPerMW: 600_000, hours: 6_000, lifetime: 20, note: 'Fuel boiler ~85% efficient, electric ~99%; RM 0.6m per MW; 6,000 h/yr.' },
}

export type AssetId = 'solar' | 'battery' | 'rolling-line' | 'melt-shop'
export type AssetSpec = { name: string; icon: string; kind: MachineKind; unit: string; min: number; max: number; step: number; size: number; lifetime: number; note: string }
export const assets: Record<AssetId, AssetSpec> = {
  solar: { name: 'Solar PV farm', icon: '☀️', kind: 'solar', unit: 'MWp', min: 1, max: 30, step: 1, size: 5, lifetime: 25, note: '1,300 MWh per MWp a year (Malaysian average); RM 3.0m per MWp; O&M 1% of capex a year.' },
  battery: { name: 'Battery storage', icon: '🔋', kind: 'battery', unit: 'MW (2 h)', min: 1, max: 30, step: 1, size: 5, lifetime: 12, note: 'Cuts maximum demand by its MW; 2-hour battery at RM 1.6m per MWh; 300 cycles a year with 10% losses.' },
  'rolling-line': { name: 'New rolling line', icon: '⚙️', kind: 'mill', unit: 'kt/yr', min: 50, max: 800, step: 50, size: 200, lifetime: 30, note: '110 kWh/t electricity and 1.3 GJ/t gas reheating per tonne rolled; RM 600 per t/yr of capacity.' },
  'melt-shop': { name: 'New induction melt shop', icon: '🔥', kind: 'furnace', unit: 'kt/yr', min: 100, max: 1500, step: 50, size: 500, lifetime: 30, note: '560 kWh/t (520 induction + 40 ladle furnace) and 22 kg/t direct CO₂ (LF electrodes, alloy carbon, ladle preheat) per tonne melted; RM 1,200 per t/yr of capacity.' },
}

/** A new asset as a machine, so the 3D site and the totals can include it. */
export function assetMachine(change: Extract<Change, { type: 'add' }>): Machine {
  const spec = assets[change.assetId]
  const base: Machine = { id: `new-${change.id}`, name: `${spec.name} (${change.size} ${spec.unit.split(' ')[0]})`, kind: spec.kind, electricityMWh: 0, fuel: 'none', fuelGJ: 0, processT: 0, quality: 'estimated', col: change.col, row: change.row, area: 'Planned', role: `Planned in a scenario. Design estimate: ${spec.note}` }
  if (change.assetId === 'solar') return { ...base, electricityMWh: -change.size * 1_300 }
  if (change.assetId === 'battery') return { ...base, electricityMWh: change.size * 2 * 300 * 0.1 }
  if (change.assetId === 'rolling-line') return { ...base, electricityMWh: change.size * 1_000 * 0.11, fuel: 'natural-gas', fuelGJ: change.size * 1_000 * 1.3 }
  return { ...base, electricityMWh: change.size * 1_000 * 0.56, processT: change.size * 1_000 * 0.022 }
}

/* ---------------- Impact ---------------- */

export type ChangeImpact = {
  change: Change
  label: string
  target: string
  /** CO₂e cut per year (negative = adds emissions). */
  cutT: number
  scope1CutT: number
  /** Net yearly cash saving (negative = costs more to run). */
  savingRM: number
  capexRM: number
  /** Maximum-demand cut in kW (battery). */
  mdCutKW: number
  /** RM per tonne cut, annualised; null when it doesn't cut CO₂. */
  costPerT: number | null
  growth: boolean
  design: boolean
  lifetime: number
}

export type Totals = { totalT: number; scope1T: number; scope2T: number; costRM: number; taxRM: number; mdKW: number | null; productionT: number | null }
export type ScenarioImpact = { before: Totals; after: Totals; changes: ChangeImpact[]; capexRM: number; savingRM: number; paybackYears: number | null; taxYear: number }

export function scenarioImpact(state: FactoryState, scenario: Scenario | null): ScenarioImpact {
  const s = state.settings
  const ctx = contextFor(state)
  const tariff = { ...DEFAULT_TARIFF, ...s.tariff }
  const tax = { ...defaultTaxInputs, ...s.carbonTax }
  const taxYear = new Date().getFullYear() + 1
  const rate = rmPerTonne(taxYear, tax)
  const series = intervalFor(state)
  const mdKW = series ? analyseInterval(series, tariff).months.at(-1)?.mdKW ?? null : null
  const sum = (machines: Machine[]) => machines.reduce((acc, m) => { const e = machineEmissions(m, ctx); return { s1: acc.s1 + e.fuelT + e.processT, s2: acc.s2 + e.electricityT, cost: acc.cost + m.electricityMWh * s.electricityPriceRMPerMWh + (m.fuel !== 'none' ? m.fuelGJ * s.fuelPriceRMPerGJ[m.fuel] : 0) } }, { s1: 0, s2: 0, cost: 0 })
  const b = sum(state.machines)
  const before: Totals = { totalT: b.s1 + b.s2, scope1T: b.s1, scope2T: b.s2, costRM: b.cost, taxRM: b.s1 * rate, mdKW, productionT: s.productionTPerYear }
  const changes: ChangeImpact[] = []
  const crf = (life: number) => capitalRecoveryFactor(s.discountRatePct, life)
  for (const change of scenario?.changes ?? []) {
    if (change.type === 'upgrade') {
      const machine = state.machines.find((m) => m.id === change.machineId), measure = measureById(change.measureId)
      const effect = machine && measure?.estimate(machine, ctx)
      if (!machine || !measure || !effect) continue
      const eco = economics(effect, machine, ctx, s.discountRatePct)
      const scope1Cut = effect.fuelSavedGJ * fuelFactorsKgPerGJ[machine.fuel] / 1_000 + effect.directT
      changes.push({ change, label: measure.name, target: machine.name, cutT: eco.netT, scope1CutT: scope1Cut, savingRM: eco.annualSavingRM, capexRM: eco.capexRM, mdCutKW: 0, costPerT: eco.costPerTonneRM, growth: false, design: false, lifetime: effect.lifetimeYears })
    } else if (change.type === 'replace') {
      const machine = state.machines.find((m) => m.id === change.machineId)
      const r = replacements[change.replaceId]
      if (!machine || machine.fuel === 'none' || machine.fuelGJ <= 0) continue
      const addedMWh = machine.fuelGJ * r.fuelEff / r.elecEff / 3.6
      const scope1Cut = machine.fuelGJ * fuelFactorsKgPerGJ[machine.fuel] / 1_000
      const cut = scope1Cut - addedMWh * ctx.gridKgPerKWh
      const saving = machine.fuelGJ * s.fuelPriceRMPerGJ[machine.fuel] - addedMWh * s.electricityPriceRMPerMWh
      const capex = addedMWh / r.hours * r.capexRMPerMW
      changes.push({ change, label: `Replace with ${r.name.toLowerCase()}`, target: machine.name, cutT: cut, scope1CutT: scope1Cut, savingRM: saving, capexRM: capex, mdCutKW: 0, costPerT: cut > 0 ? (capex * crf(r.lifetime) - saving) / cut : null, growth: false, design: true, lifetime: r.lifetime })
    } else {
      const spec = assets[change.assetId]
      const m = assetMachine(change)
      const e = machineEmissions(m, ctx)
      const cut = -e.totalT
      if (change.assetId === 'solar') {
        const capex = change.size * 3_000_000
        const saving = -m.electricityMWh * s.electricityPriceRMPerMWh - capex * 0.01
        changes.push({ change, label: `${spec.name} ${change.size} MWp`, target: 'New plot', cutT: cut, scope1CutT: 0, savingRM: saving, capexRM: capex, mdCutKW: 0, costPerT: cut > 0 ? (capex * crf(spec.lifetime) - saving) / cut : null, growth: false, design: true, lifetime: spec.lifetime })
      } else if (change.assetId === 'battery') {
        const capex = change.size * 2 * 1_600_000
        const mdCut = change.size * 1_000
        const saving = mdCut * tariff.mdRMPerKW * 12 - m.electricityMWh * s.electricityPriceRMPerMWh
        changes.push({ change, label: `${spec.name} ${change.size} MW`, target: 'New plot', cutT: cut, scope1CutT: 0, savingRM: saving, capexRM: capex, mdCutKW: mdCut, costPerT: null, growth: false, design: true, lifetime: spec.lifetime })
      } else {
        const perT = change.assetId === 'rolling-line' ? 600 : 1_200
        const capex = change.size * 1_000 * perT
        const running = m.electricityMWh * s.electricityPriceRMPerMWh + m.fuelGJ * s.fuelPriceRMPerGJ['natural-gas']
        changes.push({ change, label: `${spec.name} ${change.size} kt/yr`, target: 'New plot', cutT: cut, scope1CutT: -(e.fuelT + e.processT), savingRM: -running, capexRM: capex, mdCutKW: 0, costPerT: null, growth: true, design: true, lifetime: spec.lifetime })
      }
    }
  }
  const cut = changes.reduce((a, c) => a + c.cutT, 0), cut1 = changes.reduce((a, c) => a + c.scope1CutT, 0)
  const saving = changes.reduce((a, c) => a + c.savingRM, 0), capex = changes.reduce((a, c) => a + c.capexRM, 0)
  const mdCut = changes.reduce((a, c) => a + c.mdCutKW, 0)
  const growthT = changes.filter((c) => c.growth).reduce((a, c) => a + (c.change.type === 'add' ? c.change.size * 1_000 : 0), 0)
  const after: Totals = {
    totalT: before.totalT - cut, scope1T: before.scope1T - cut1, scope2T: before.scope2T - (cut - cut1), costRM: before.costRM - saving,
    taxRM: Math.max(0, before.scope1T - cut1) * rate, mdKW: mdKW !== null ? Math.max(0, mdKW - mdCut) : null, productionT: before.productionT !== null ? before.productionT + growthT : null,
  }
  const abatementSaving = changes.filter((c) => !c.growth).reduce((a, c) => a + c.savingRM, 0)
  const abatementCapex = changes.filter((c) => !c.growth).reduce((a, c) => a + c.capexRM, 0)
  return { before, after, changes, capexRM: capex, savingRM: saving, paybackYears: abatementSaving > 0 && abatementCapex > 0 ? abatementCapex / abatementSaving : null, taxYear }
}

/** Empty plots next to the site where a new asset can go (never on the yard/substation column). */
export function freeCells(occupied: { col: number; row: number }[]) {
  const taken = new Set(occupied.map((c) => `${c.col},${c.row}`))
  const maxCol = Math.max(3, ...occupied.map((c) => c.col)) + 1, maxRow = Math.max(1, ...occupied.map((c) => c.row)) + 1
  const out: { col: number; row: number }[] = []
  for (let row = 0; row <= maxRow; row += 1) for (let col = 0; col <= maxCol; col += 1) if (!taken.has(`${col},${row}`)) out.push({ col, row })
  return out
}
