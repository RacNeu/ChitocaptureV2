import type { EstimateContext, Machine, Measure, MeasureEffect } from './types'

/**
 * Reduction-measure library.
 *
 * Every percentage, payback and unit cost here is an INDICATIVE PLANNING ASSUMPTION
 * for ranking first ideas. None is a sourced value. The app shows the basis and the
 * engineering checks for each measure, and tells users to replace the estimate with
 * an audit, a quote or trial data.
 */

const none: MeasureEffect = { electricitySavedMWh: 0, fuelSavedGJ: 0, directT: 0, addedElectricityMWh: 0, capexRM: 0, opexChangeRM: 0, lifetimeYears: 10 }

const paybackCapex = (electricityMWh: number, fuelGJ: number, machine: Machine, ctx: EstimateContext, years: number) =>
  Math.round((electricityMWh * ctx.electricityPriceRMPerMWh + fuelGJ * ctx.fuelPriceRMPerGJ(machine.fuel)) * years)

const electricShare = (share: number, paybackYears: number, lifetimeYears: number) => (machine: Machine, ctx: EstimateContext): MeasureEffect | null => {
  if (machine.electricityMWh <= 0) return null
  const saved = machine.electricityMWh * share
  return { ...none, electricitySavedMWh: saved, capexRM: paybackCapex(saved, 0, machine, ctx, paybackYears), lifetimeYears }
}

const fuelShare = (share: number, paybackYears: number, lifetimeYears: number) => (machine: Machine, ctx: EstimateContext): MeasureEffect | null => {
  if (machine.fuelGJ <= 0 || ctx.fuelKgPerGJ(machine.fuel) <= 0) return null
  const saved = machine.fuelGJ * share
  return { ...none, fuelSavedGJ: saved, capexRM: paybackCapex(0, saved, machine, ctx, paybackYears), lifetimeYears }
}

/** Default sorbent working capacity, used until the capture rig measures a real value (mmol/g). */
export const DEFAULT_SORBENT_CAPACITY = 1.5
const CAPTURE_SLIPSTREAM = 0.05
const CAPTURE_EFFICIENCY = 0.9
const CYCLES_PER_YEAR = 6 * 330
const SORBENT_RM_PER_KG = 60

export function sorbentInventoryTonnes(capturedTPerYear: number, capacityMmolPerG: number) {
  const perCycleT = capturedTPerYear / CYCLES_PER_YEAR
  const tCO2PerTSorbent = capacityMmolPerG * 44.01 / 1_000
  return tCO2PerTSorbent > 0 ? perCycleT / tCO2PerTSorbent : Infinity
}

export const measures: readonly Measure[] = [
  {
    id: 'air-leaks', name: 'Fix compressed-air leaks', short: 'Air leaks', category: 'Efficiency', appliesTo: ['compressor'],
    explain: 'Leaking air lines can waste a large share of compressor power. An ultrasonic survey finds the leaks so they can be fixed cheaply.',
    checks: ['Run an ultrasonic leak survey', 'Measure compressor power with production stopped'],
    basis: '20% of the compressor’s electricity, 6-month payback', estimate: electricShare(0.2, 0.5, 5),
  },
  {
    id: 'vsd', name: 'Variable-speed drives', short: 'VSD', category: 'Efficiency', appliesTo: ['fan', 'pump', 'compressor'],
    explain: 'Slow motors down when full flow isn’t needed instead of throttling with dampers or valves.',
    checks: ['Log the load profile for one week', 'Confirm the motor is suitable for inverter duty'],
    basis: '20% of the machine’s electricity, 2-year payback', estimate: electricShare(0.2, 2, 15),
  },
  {
    id: 'grinding', name: 'High-efficiency grinding upgrade', short: 'Grinding', category: 'Efficiency', appliesTo: ['mill'],
    explain: 'Modern separators and grinding aids cut the energy needed per tonne of product.',
    checks: ['Benchmark kWh per tonne', 'Run a product fineness trial'],
    basis: '8% of the mill’s electricity, 4-year payback', estimate: electricShare(0.08, 4, 15),
  },
  {
    id: 'chiller-opt', name: 'Chiller & HVAC optimisation', short: 'Chiller opt.', category: 'Efficiency', appliesTo: ['chiller', 'cold-room'],
    explain: 'Raise setpoints, sequence the chillers and fix the controls so cooling runs only when and where it is needed.',
    checks: ['Trend chiller kW per refrigeration ton', 'Confirm process temperature limits'],
    basis: '15% of the machine’s electricity, 2-year payback', estimate: electricShare(0.15, 2, 10),
  },
  {
    id: 'line-idle', name: 'Idle-power shutdown on lines', short: 'Idle shutdown', category: 'Efficiency', appliesTo: ['production-line'],
    explain: 'Automatically switch off conveyors, heaters and drives during breaks and changeovers.',
    checks: ['Meter the line during non-production hours', 'Check restart times'],
    basis: '10% of the line’s electricity, 1-year payback', estimate: electricShare(0.1, 1, 8),
  },
  {
    id: 'led', name: 'LED lighting & smart controls', short: 'LED', category: 'Efficiency', appliesTo: ['office'],
    explain: 'Switch to LED lighting with occupancy sensors.',
    checks: ['Count fixtures and operating hours'],
    basis: '20% of building electricity, 2.5-year payback', estimate: electricShare(0.2, 2.5, 12),
  },
  {
    id: 'solar', name: 'Rooftop solar PV', short: 'Solar', category: 'Renewables', appliesTo: ['office', 'production-line', 'cold-room', 'chiller'],
    explain: 'Generate daytime electricity on your own roof to offset grid power.',
    checks: ['Assess the roof structure and area', 'Check grid connection rules'],
    basis: 'Covers 25% of the machine’s electricity, 6-year payback', estimate: electricShare(0.25, 6, 25),
  },
  {
    id: 'combustion', name: 'Combustion tuning & O₂ trim', short: 'Tuning', category: 'Efficiency', appliesTo: ['boiler', 'kiln', 'furnace'],
    explain: 'Burn fuel with less excess air so less heat goes up the stack.',
    checks: ['Analyse the flue gas at several loads'],
    basis: '3% of the fuel, 1-year payback', estimate: fuelShare(0.03, 1, 10),
  },
  {
    id: 'insulation', name: 'Insulation & condensate return', short: 'Insulation', category: 'Heat recovery', appliesTo: ['boiler', 'furnace', 'kiln'],
    explain: 'Fix hot spots and recover hot condensate so less fuel is needed.',
    checks: ['Run a thermal-imaging survey', 'Measure the condensate return rate'],
    basis: '4% of the fuel, 1.5-year payback', estimate: fuelShare(0.04, 1.5, 10),
  },
  {
    id: 'heat-pump', name: 'Industrial heat pump for low-temperature heat', short: 'Heat pump', category: 'Fuel switch', appliesTo: ['boiler'],
    explain: 'Use electricity to supply process heat below about 100 °C several times more efficiently than burning fuel.',
    checks: ['Confirm that heat demand is below about 100 °C', 'Check electrical supply capacity'],
    basis: 'Replaces 30% of the boiler fuel at a coefficient of performance of 3.5, 5-year payback on the net energy saving',
    estimate: (machine, ctx) => {
      if (machine.fuelGJ <= 0 || ctx.fuelKgPerGJ(machine.fuel) <= 0) return null
      const fuelSaved = machine.fuelGJ * 0.3
      const addedMWh = fuelSaved * 0.9 / 3.6 / 3.5
      const netRM = fuelSaved * ctx.fuelPriceRMPerGJ(machine.fuel) - addedMWh * ctx.electricityPriceRMPerMWh
      return { ...none, fuelSavedGJ: fuelSaved, addedElectricityMWh: addedMWh, capexRM: Math.round(Math.max(netRM, fuelSaved * 2) * 5), lifetimeYears: 15 }
    },
  },
  {
    id: 'whr', name: 'Waste-heat recovery to power', short: 'WHR power', category: 'Heat recovery', appliesTo: ['kiln', 'furnace'],
    explain: 'Turn hot exhaust gas into electricity so less is bought from the grid.',
    checks: ['Measure the exhaust temperature and flow', 'Run a power-cycle feasibility study'],
    basis: 'Recovers 3% of the fuel energy as electricity, 5-year payback',
    estimate: (machine, ctx) => {
      if (machine.fuelGJ <= 0) return null
      const generated = machine.fuelGJ * 0.03 / 3.6
      return { ...none, electricitySavedMWh: generated, capexRM: paybackCapex(generated, 0, machine, ctx, 5), opexChangeRM: Math.round(generated * ctx.electricityPriceRMPerMWh * 0.05), lifetimeYears: 20 }
    },
  },
  {
    id: 'biomass', name: 'Biomass co-firing', short: 'Biomass', category: 'Fuel switch', appliesTo: ['boiler', 'kiln', 'furnace'],
    explain: 'Replace part of the fossil fuel with local biomass residues such as palm kernel shell or wood waste.',
    checks: ['Secure the fuel supply', 'Check product quality and emission permits'],
    basis: 'Replaces 20% of the fossil fuel; capex of RM 150 per t CO₂/yr avoided',
    estimate: (machine, ctx) => {
      const factor = ctx.fuelKgPerGJ(machine.fuel)
      if (machine.fuelGJ <= 0 || factor <= 0) return null
      const avoided = machine.fuelGJ * 0.2 * factor / 1_000
      return { ...none, directT: avoided, capexRM: Math.round(avoided * 150), lifetimeYears: 15 }
    },
  },
  {
    id: 'clinker', name: 'Lower clinker ratio', short: 'Clinker', category: 'Process', appliesTo: ['kiln'],
    explain: 'Blend in supplementary materials such as slag or calcined clay so less clinker, and less process CO₂, is needed.',
    checks: ['Meet product standards and run strength tests', 'Secure the material supply'],
    basis: 'Cuts process CO₂ by 10%; capex of RM 100 per t/yr',
    estimate: (machine) => machine.processT <= 0 ? null : { ...none, directT: machine.processT * 0.1, capexRM: Math.round(machine.processT * 0.1 * 100), lifetimeYears: 15 },
  },
  {
    id: 'biogas', name: 'Capture biogas from wastewater', short: 'Biogas', category: 'Methane capture', appliesTo: ['wastewater'],
    explain: 'Cover the ponds or install a digester so methane is captured and burned or used for power instead of escaping.',
    checks: ['Measure the COD load and biogas yield', 'Check the gas-engine or flare design'],
    basis: 'Captures 80% of process methane (as CO₂e); capex of RM 120 per t CO₂e/yr',
    estimate: (machine) => machine.processT <= 0 ? null : { ...none, directT: machine.processT * 0.8, capexRM: Math.round(machine.processT * 0.8 * 120), opexChangeRM: Math.round(machine.processT * 0.8 * 5), lifetimeYears: 15 },
  },
  {
    id: 'chitosan-capture', name: 'Chitosan sorbent CO₂ capture', short: 'Chitosan capture', category: 'Carbon capture', appliesTo: ['kiln', 'boiler', 'furnace'],
    explain: 'Pass a slipstream of the flue gas through an amine-modified chitosan sorbent that holds CO₂, then heat it with waste heat to release concentrated CO₂ for use or storage.',
    checks: ['Measure the sorbent capacity on the bench rig (Sensors page)', 'Confirm waste heat is available for regeneration', 'Identify a CO₂ use or storage route'],
    basis: '5% slipstream at 90% capture; 0.25 MWh/t electricity penalty with regeneration heat from waste heat; sorbent at RM 60/kg sized from the measured capacity, plus RM 1,000 per t/yr of equipment',
    estimate: (machine, ctx) => {
      const pointSource = machine.processT + machine.fuelGJ * ctx.fuelKgPerGJ(machine.fuel) / 1_000
      if (pointSource <= 0) return null
      const captured = pointSource * CAPTURE_SLIPSTREAM * CAPTURE_EFFICIENCY
      const sorbentT = sorbentInventoryTonnes(captured, ctx.measuredSorbentCapacity ?? DEFAULT_SORBENT_CAPACITY)
      return { ...none, directT: captured, addedElectricityMWh: captured * 0.25, capexRM: Math.round(captured * 1_000 + sorbentT * 1_000 * SORBENT_RM_PER_KG), opexChangeRM: Math.round(captured * 60), lifetimeYears: 15 }
    },
  },

  /* ---------- Steel mini-mill process measures (indicative planning assumptions) ---------- */
  {
    id: 'scrap-preheat', name: 'Scrap preheating with furnace off-gas', short: 'Scrap preheat', category: 'Heat recovery', appliesTo: ['furnace'], steelOnly: true,
    explain: 'Pass the hot furnace off-gas through the scrap before it is charged, so the arc has less heating to do.',
    checks: ['Check off-gas temperature and dust load', 'Confirm space for a preheating shaft or conveyor', 'Review dioxin control for preheated scrap'],
    basis: '8% of the arc furnace’s electricity; capex RM 30m', estimate: (machine) => machine.electricityMWh > 0 ? { ...none, electricitySavedMWh: machine.electricityMWh * 0.08, capexRM: 30_000_000, lifetimeYears: 20 } : null,
  },
  {
    id: 'eaf-optimisation', name: 'Arc furnace power & foamy-slag optimisation', short: 'EAF optimise', category: 'Efficiency', appliesTo: ['furnace'], steelOnly: true,
    explain: 'Tune the electrical power programme and keep a foamy slag over the arc, so more energy goes into the steel and less into the furnace walls.',
    checks: ['Analyse kWh/t per heat against scrap mix', 'Trial carbon and oxygen injection rates', 'Check electrode consumption'],
    basis: '6% of the arc furnace’s electricity; capex RM 6m', estimate: (machine) => machine.electricityMWh > 0 ? { ...none, electricitySavedMWh: machine.electricityMWh * 0.06, capexRM: 6_000_000, lifetimeYears: 10 } : null,
  },
  {
    id: 'green-ppa', name: 'Renewable electricity supply (green tariff or PPA)', short: 'Green power', category: 'Renewables', appliesTo: ['furnace', 'mill', 'production-line'], steelOnly: true,
    explain: 'Buy part of the plant’s electricity as certified renewable power, for example through a green electricity tariff or a power purchase agreement.',
    checks: ['Compare available green tariffs and PPA prices', 'Agree how the certificates are counted in reporting', 'Check contract length and volume'],
    basis: '30% of the machine’s grid electricity becomes renewable; premium RM 20/MWh',
    estimate: (machine, ctx) => machine.electricityMWh > 0 ? { ...none, directT: machine.electricityMWh * 0.3 * ctx.gridKgPerKWh, opexChangeRM: Math.round(machine.electricityMWh * 0.3 * 20), lifetimeYears: 10 } : null,
  },
  {
    id: 'lf-control', name: 'Ladle furnace heating control & ladle covers', short: 'LF control', category: 'Efficiency', appliesTo: ['furnace'], steelOnly: true,
    explain: 'Keep ladles covered and preheated, and control reheating so the steel is not heated more than casting needs.',
    checks: ['Log temperature loss between tapping and casting', 'Check ladle cover handling with the crane'],
    basis: '10% of the ladle furnace’s electricity; 2-year payback', estimate: electricShare(0.1, 2, 10),
  },
  {
    id: 'hot-charging', name: 'Hot charging of billets', short: 'Hot charging', category: 'Heat recovery', appliesTo: ['furnace'], steelOnly: true,
    explain: 'Send billets straight from the caster into the reheating furnace while still hot, instead of letting them cool in the yard.',
    checks: ['Match caster and rolling schedules', 'Check billet surface quality when hot charged', 'Plan the transfer route'],
    basis: '30% of the reheating furnace’s gas; capex RM 15m', estimate: (machine) => machine.fuelGJ > 0 ? { ...none, fuelSavedGJ: machine.fuelGJ * 0.3, capexRM: 15_000_000, lifetimeYears: 20 } : null,
  },
  {
    id: 'regen-burners', name: 'Regenerative burners', short: 'Regen burners', category: 'Heat recovery', appliesTo: ['furnace'], steelOnly: true,
    explain: 'Use the furnace’s own exhaust heat to preheat the combustion air, so less gas is burnt.',
    checks: ['Check burner layout and NOx limits', 'Plan installation during a shutdown'],
    basis: '15% of the reheating furnace’s gas; capex RM 20m', estimate: (machine) => machine.fuelGJ > 0 ? { ...none, fuelSavedGJ: machine.fuelGJ * 0.15, capexRM: 20_000_000, lifetimeYears: 20 } : null,
  },
  {
    id: 'mill-drives', name: 'Rolling mill drive & motor upgrade', short: 'Mill drives', category: 'Efficiency', appliesTo: ['mill'], steelOnly: true,
    explain: 'Replace old DC drives and motors on the rolling stands with modern AC drives that waste less power.',
    checks: ['Survey motor ages and duty', 'Check harmonics and grid connection'],
    basis: '8% of the rolling mill’s electricity; 4-year payback', estimate: electricShare(0.08, 4, 20),
  },
  {
    id: 'oxygen-turndown', name: 'Oxygen plant turndown & demand matching', short: 'O₂ turndown', category: 'Efficiency', appliesTo: ['compressor'], steelOnly: true,
    explain: 'Run the oxygen plant to match what the furnace actually uses, instead of producing and venting surplus.',
    checks: ['Log oxygen production vs consumption', 'Check the plant’s minimum stable load'],
    basis: '10% of the oxygen plant’s electricity; 2-year payback', estimate: electricShare(0.1, 2, 10),
  },
]

export const measureById = (id: string) => measures.find((measure) => measure.id === id)

/**
 * Measures that make sense for each unit of the steel mini-mill. Steel machines (those linked to a
 * control-room unit) only get these; other machines get the generic measures for their kind.
 */
export const steelUnitMeasures: Record<string, readonly string[]> = {
  eaf: ['eaf-optimisation', 'scrap-preheat', 'green-ppa'],
  lf: ['lf-control'],
  caster: ['line-idle'],
  reheat: ['hot-charging', 'regen-burners', 'combustion', 'insulation', 'chitosan-capture'],
  rolling: ['mill-drives', 'green-ppa'],
  fume: ['vsd'],
  utilities: ['air-leaks', 'vsd'],
  oxygen: ['oxygen-turndown'],
}
