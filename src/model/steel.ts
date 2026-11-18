import { GET_PREMIUM_RM_PER_MWH } from './prices'
/**
 * Illustrative steel mini-mill model, induction route (the route of Masteel-type Malaysian long-steel
 * mills): coreless induction furnaces → ladle furnace → continuous caster → reheating furnace →
 * rolling mill.
 *
 * Per-tonne figures follow docs/induction-furnace-model.md (sources and confidence listed there).
 * They describe a SAMPLE plant, not any real one: the app replaces them with the plant's own bills
 * and heat logs. The CBAM section is a simplified illustration of the mechanism, not a compliance tool.
 */

export type UnitId = 'scrap' | 'melt' | 'lf' | 'caster' | 'reheat' | 'rolling' | 'fume' | 'utilities'

export type SteelUnit = { id: UnitId; name: string; short: string; role: string }

export const steelUnits: readonly SteelUnit[] = [
  { id: 'scrap', name: 'Scrap yard & charging', short: 'Scrap', role: 'Scrap is sorted and loaded into charging buckets for the furnaces.' },
  { id: 'melt', name: 'Induction furnaces', short: 'Induction', role: 'Coreless induction furnaces melt scrap with a magnetic field from a water-cooled copper coil. No electrodes. The biggest electricity user.' },
  { id: 'lf', name: 'Ladle furnace', short: 'Ladle furnace', role: 'Adjusts chemistry and temperature of the liquid steel before casting. Its graphite electrodes and alloys are most of the melt shop’s direct CO₂.' },
  { id: 'caster', name: 'Continuous caster', short: 'Caster', role: 'Solidifies liquid steel into long billets.' },
  { id: 'reheat', name: 'Reheating furnace', short: 'Reheat furnace', role: 'Burns natural gas to reheat billets to about 1,150 °C for rolling. Its stack is the main fuel-CO₂ point source.' },
  { id: 'rolling', name: 'Rolling mill', short: 'Rolling mill', role: 'Rolls hot billets into bars and rods.' },
  { id: 'fume', name: 'Fume extraction & baghouse', short: 'Fume fans', role: 'Fans pull furnace fumes through bag filters.' },
  { id: 'utilities', name: 'Cooling water & compressed air', short: 'Utilities', role: 'Coil cooling-water pumps and cooling towers, plus compressors.' },
]

/**
 * Good-practice targets per tonne (kWh/t; GJ/t for the reheating furnace).
 * Induction: 500 kWh/t, the low end of good ferrous practice (Otto Junker 500–560 kWh/t). Ladle
 * furnace: 35 kWh/t, the better half of the CTC-N 33–70 benchmark. The rest are
 * planning placeholders: set real targets from the plant's best months or an energy audit.
 */
export const steelTargets: Record<Exclude<UnitId, 'scrap'>, number> = {
  melt: 500, lf: 35, caster: 12, reheat: 1.0, rolling: 85, fume: 15, utilities: 25,
}

export type SteelParams = {
  /** Tapped tonnes per heat and the shop's tap-to-tap interval (all furnaces together). */
  heatSizeT: number
  cycleMin: number
  operatingHoursPerYear: number
  gridKgPerKWh: number
  gasKgPerGJ: number
  /** kWh per tonne of liquid steel, by unit. */
  kwhPerT: Record<Exclude<UnitId, 'scrap' | 'reheat'>, number>
  /** Direct melt-shop CO₂: LF electrodes, alloy carbon and ladle-preheat gas (kg/t). */
  meltDirectKgPerT: number
  /** Reheating furnace natural gas (GJ/t). */
  reheatGJPerT: number
  electricityRMPerMWh: number
  gasRMPerGJ: number
}

export const defaultSteelParams: SteelParams = {
  // 4 × 60 t induction furnaces on 2 power supplies: one heat about every 30 minutes across the shop.
  heatSizeT: 57,
  cycleMin: 30,
  operatingHoursPerYear: 7_000,
  gridKgPerKWh: 0.74,
  gasKgPerGJ: 56.1,
  // Induction 520 ≈ the best Missouri S&T/DOE trial (473 kWh/short ton) and inside Otto Junker’s 500–560;
  // chosen so the melt shop matches Masteel’s published 0.456–0.489 tCO₂e/t. LF 40 (CTC-N 33–70).
  kwhPerT: { melt: 520, lf: 40, caster: 15, rolling: 100, fume: 20, utilities: 30 },
  // LF electrodes ~0.35 kg/t (1.3 kg CO₂) + alloy carbon (~1.2) + ladle preheat 0.35 GJ/t (~19.6): docs §5–6.
  meltDirectKgPerT: 22,
  reheatGJPerT: 1.2,
  electricityRMPerMWh: 450,
  gasRMPerGJ: 40,
}

/**
 * Sandbox upgrades. Each uses the same saving and cost assumptions as the matching measure in the
 * plan library (measures.ts), so a scenario turned into a plan gives the same figures.
 */
export type Upgrades = {
  meltPractice: boolean
  igbt: boolean
  fumeVsd: boolean
  hotCharging: boolean
  regenBurners: boolean
  /** Share of electricity from renewables (0–1), e.g. rooftop solar or a green tariff. */
  greenShare: number
}

export const noUpgrades: Upgrades = { meltPractice: false, igbt: false, fumeVsd: false, hotCharging: false, regenBurners: false, greenShare: 0 }

export type UpgradeInfo = { key: keyof Upgrades; name: string; what: string; basis: string; capexRM: (p: SteelParams, annualT: number) => number }

/** Indicative planning assumptions, shown to the user with each upgrade. */
export const upgradeInfo: UpgradeInfo[] = [
  { key: 'meltPractice', name: 'Induction melting best practice', what: 'Cut holding, keep lids closed, tap at target temperature, preheat cold linings and charge full, dense heats.', basis: '−6% induction electricity (Missouri S&T/DOE trial: 5–10% on hot linings, 15% on first heats); capex RM 0.8m (lid automation, scheduling, training)', capexRM: () => 800_000 },
  { key: 'igbt', name: 'IGBT power supplies', what: 'Replace thyristor (SCR) converters with IGBT units that hold full power and a power factor near 1 through the melt.', basis: '−5% induction electricity (vendors claim 5–25%; conservative end used); capex RM 12m design estimate: get a supplier quote', capexRM: () => 12_000_000 },
  { key: 'fumeVsd', name: 'Variable-speed fume fans', what: 'Run the extraction fans only as hard as the fumes need.', basis: '−20% fume-fan electricity; capex about 2 years of the saving',
    capexRM: (p, annualT) => Math.round(p.kwhPerT.fume * 0.2 * annualT / 1_000 * p.electricityRMPerMWh * 2) },
  { key: 'hotCharging', name: 'Hot charging', what: 'Send billets straight from the caster to the reheating furnace while still hot.', basis: '−30% reheating gas; capex RM 15m', capexRM: () => 15_000_000 },
  { key: 'regenBurners', name: 'Regenerative burners', what: 'Recover exhaust heat to preheat combustion air in the reheating furnace.', basis: '−15% reheating gas; capex RM 20m', capexRM: () => 20_000_000 },
  { key: 'greenShare', name: 'Green electricity', what: 'Rooftop solar plus a renewable electricity tariff or power purchase agreement.', basis: 'Cuts grid CO₂ in proportion to the green share; adds TNB’s Green Electricity Tariff premium of 3 sen/kWh (3-year subscription)', capexRM: () => 0 },
]

export type Intensity = {
  /** kWh per tonne of steel, by unit. */
  kwh: Record<Exclude<UnitId, 'scrap' | 'reheat'>, number>
  totalKwhPerT: number
  reheatGJPerT: number
  meltDirectKgPerT: number
  reheatKgPerT: number
  /** Scope 1: on-site combustion and process. */
  directKgPerT: number
  /** Scope 2: purchased grid electricity, after the green share. */
  indirectKgPerT: number
  totalKgPerT: number
}

export function intensity(p: SteelParams, u: Upgrades): Intensity {
  // Savings add up as shares of the plant's own figures, the same way the plan adds up separate measures.
  const reheatGJPerT = p.reheatGJPerT * (1 - (u.hotCharging ? 0.3 : 0) - (u.regenBurners ? 0.15 : 0))
  const kwh = {
    ...p.kwhPerT,
    melt: p.kwhPerT.melt * (1 - (u.meltPractice ? 0.06 : 0) - (u.igbt ? 0.05 : 0)),
    fume: p.kwhPerT.fume * (u.fumeVsd ? 0.8 : 1),
  }
  const totalKwhPerT = Object.values(kwh).reduce((sum, value) => sum + value, 0)
  const indirectKgPerT = totalKwhPerT * p.gridKgPerKWh * (1 - Math.min(1, Math.max(0, u.greenShare)))
  const reheatKgPerT = reheatGJPerT * p.gasKgPerGJ
  const directKgPerT = p.meltDirectKgPerT + reheatKgPerT
  return { kwh, totalKwhPerT, reheatGJPerT, meltDirectKgPerT: p.meltDirectKgPerT, reheatKgPerT, directKgPerT, indirectKgPerT, totalKgPerT: directKgPerT + indirectKgPerT }
}

export const tonnesPerHour = (p: SteelParams) => p.heatSizeT / (p.cycleMin / 60)
export const annualTonnes = (p: SteelParams) => tonnesPerHour(p) * p.operatingHoursPerYear

export type AnnualResult = { steelT: number; co2T: number; directT: number; indirectT: number; electricityMWh: number; gasGJ: number; energyCostRM: number }

export function annual(p: SteelParams, u: Upgrades): AnnualResult {
  const steelT = annualTonnes(p)
  const i = intensity(p, u)
  const electricityMWh = i.totalKwhPerT * steelT / 1_000
  const gasGJ = i.reheatGJPerT * steelT
  return {
    steelT,
    co2T: i.totalKgPerT * steelT / 1_000,
    directT: i.directKgPerT * steelT / 1_000,
    indirectT: i.indirectKgPerT * steelT / 1_000,
    electricityMWh,
    gasGJ,
    energyCostRM: electricityMWh * p.electricityRMPerMWh + gasGJ * p.gasRMPerGJ
      // Green electricity bought through TNB's Green Electricity Tariff costs a premium per kWh.
      + electricityMWh * Math.min(1, Math.max(0, u.greenShare)) * GET_PREMIUM_RM_PER_MWH,
  }
}

export type UpgradeImpact = { info: UpgradeInfo; savedKgPerT: number; savedTPerYear: number; capexRM: number; annualSavingRM: number; paybackYears: number | null }

/** Impact of each active upgrade on its own, measured against no upgrades. */
export function upgradeImpacts(p: SteelParams, u: Upgrades): UpgradeImpact[] {
  const base = annual(p, noUpgrades), baseI = intensity(p, noUpgrades)
  return upgradeInfo.filter((info) => Boolean(u[info.key])).map((info) => {
    const only = { ...noUpgrades, [info.key]: u[info.key] } as Upgrades
    const result = annual(p, only)
    const capexRM = info.capexRM(p, result.steelT)
    const annualSavingRM = base.energyCostRM - result.energyCostRM
    return {
      info,
      savedKgPerT: baseI.totalKgPerT - intensity(p, only).totalKgPerT,
      savedTPerYear: base.co2T - result.co2T,
      capexRM,
      annualSavingRM,
      paybackYears: annualSavingRM > 0 && capexRM > 0 ? capexRM / annualSavingRM : null,
    }
  })
}

/* ---------------- CBAM (simplified) ---------------- */

/**
 * Share of the CBAM obligation that applies each year while EU free allocation is phased out.
 * Simplified from the EU's published phase-out schedule; check the current regulation.
 */
export const cbamPhaseIn: Record<number, number> = { 2026: 0.025, 2027: 0.05, 2028: 0.1, 2029: 0.225, 2030: 0.485, 2031: 0.61, 2032: 0.735, 2033: 0.86, 2034: 1 }

export type CbamInputs = { exportTPerYear: number; euPriceEUR: number; rmPerEUR: number; malaysiaPriceRM: number; year: number }

export type CbamResult = {
  /** Embedded direct emissions per tonne exported (t CO₂/t). For iron and steel, CBAM charges direct emissions. */
  directTPerT: number
  indirectTPerT: number
  phaseIn: number
  /** RM per tonne of steel exported, after deducting carbon price paid in Malaysia. */
  costRMPerT: number
  costRMPerYear: number
}

export function cbam(i: Intensity, inputs: CbamInputs): CbamResult {
  const directTPerT = i.directKgPerT / 1_000
  const phaseIn = cbamPhaseIn[inputs.year] ?? (inputs.year > 2034 ? 1 : 0)
  const netPriceRM = Math.max(0, inputs.euPriceEUR * inputs.rmPerEUR - inputs.malaysiaPriceRM)
  const costRMPerT = directTPerT * netPriceRM * phaseIn
  return { directTPerT, indirectTPerT: i.indirectKgPerT / 1_000, phaseIn, costRMPerT, costRMPerYear: costRMPerT * inputs.exportTPerYear }
}
