/**
 * Illustrative steel mini-mill model: scrap-based electric arc furnace (EAF) → ladle furnace →
 * continuous caster → reheating furnace → rolling mill.
 *
 * All figures are rounded, typical-order-of-magnitude assumptions for a demo. They are NOT data
 * from any real plant. Replace them with the plant's own meter readings before any decision or
 * reporting. The CBAM section is a simplified illustration of the mechanism, not a compliance tool.
 */

export type UnitId = 'scrap' | 'eaf' | 'lf' | 'caster' | 'reheat' | 'rolling' | 'fume' | 'utilities' | 'oxygen'

export type SteelUnit = { id: UnitId; name: string; short: string; role: string }

export const steelUnits: readonly SteelUnit[] = [
  { id: 'scrap', name: 'Scrap yard & charging', short: 'Scrap', role: 'Scrap is sorted and loaded into baskets that charge the furnace.' },
  { id: 'eaf', name: 'Electric arc furnace', short: 'EAF', role: 'Melts scrap with an electric arc between graphite electrodes. The biggest electricity user.' },
  { id: 'lf', name: 'Ladle furnace', short: 'Ladle furnace', role: 'Adjusts chemistry and temperature of the liquid steel before casting.' },
  { id: 'caster', name: 'Continuous caster', short: 'Caster', role: 'Solidifies liquid steel into long billets.' },
  { id: 'reheat', name: 'Reheating furnace', short: 'Reheat furnace', role: 'Burns natural gas to reheat billets to about 1,150 °C for rolling. Its stack is the main fuel-CO₂ point source.' },
  { id: 'rolling', name: 'Rolling mill', short: 'Rolling mill', role: 'Rolls hot billets into bars and rods.' },
  { id: 'fume', name: 'Fume extraction & baghouse', short: 'Fume fans', role: 'Large fans pull furnace fumes through bag filters.' },
  { id: 'utilities', name: 'Compressed air & water', short: 'Utilities', role: 'Compressors and cooling-water pumps.' },
  { id: 'oxygen', name: 'Oxygen plant', short: 'Oxygen', role: 'Produces oxygen injected into the furnace.' },
]

export type SteelParams = {
  heatSizeT: number
  /** Tap-to-tap cycle in minutes. */
  cycleMin: number
  operatingHoursPerYear: number
  gridKgPerKWh: number
  gasKgPerGJ: number
  /** kWh per tonne of liquid steel, by unit. */
  kwhPerT: Record<Exclude<UnitId, 'scrap' | 'reheat'>, number>
  /** Direct EAF CO₂ from electrodes, charge carbon and injected carbon (kg/t). */
  eafDirectKgPerT: number
  /** Reheating furnace natural gas (GJ/t). */
  reheatGJPerT: number
  electricityRMPerMWh: number
  gasRMPerGJ: number
}

export const defaultSteelParams: SteelParams = {
  heatSizeT: 100,
  cycleMin: 50,
  operatingHoursPerYear: 7_000,
  gridKgPerKWh: 0.74,
  gasKgPerGJ: 56.1,
  kwhPerT: { eaf: 412, lf: 40, caster: 15, rolling: 100, fume: 35, utilities: 25, oxygen: 20 },
  eafDirectKgPerT: 70,
  reheatGJPerT: 1.2,
  electricityRMPerMWh: 450,
  gasRMPerGJ: 40,
}

export type Upgrades = {
  eafOptimisation: boolean
  fumeVsd: boolean
  hotCharging: boolean
  regenBurners: boolean
  /** Share of electricity from renewables (0–1), e.g. rooftop solar or a green tariff. */
  greenShare: number
  /** Share of reheating-furnace flue gas treated by chitosan capture (0–1). */
  captureShare: number
}

export const noUpgrades: Upgrades = { eafOptimisation: false, fumeVsd: false, hotCharging: false, regenBurners: false, greenShare: 0, captureShare: 0 }

export type UpgradeInfo = { key: keyof Upgrades; name: string; what: string; basis: string; capexRM: (p: SteelParams, annualT: number, u: Upgrades) => number }

/** Indicative planning assumptions, shown to the user with each upgrade. */
export const upgradeInfo: UpgradeInfo[] = [
  { key: 'eafOptimisation', name: 'EAF optimisation', what: 'Scrap preheating, foamy-slag control and better power programmes.', basis: '−10% EAF electricity; capex RM 25m', capexRM: () => 25_000_000 },
  { key: 'fumeVsd', name: 'Variable-speed fume fans', what: 'Run the extraction fans only as hard as the fumes need.', basis: '−30% fume-fan electricity; capex RM 4m', capexRM: () => 4_000_000 },
  { key: 'hotCharging', name: 'Hot charging', what: 'Send billets straight from the caster to the reheating furnace while still hot.', basis: '−30% reheating gas; capex RM 15m', capexRM: () => 15_000_000 },
  { key: 'regenBurners', name: 'Regenerative burners', what: 'Recover exhaust heat to preheat combustion air in the reheating furnace.', basis: '−15% reheating gas; capex RM 20m', capexRM: () => 20_000_000 },
  { key: 'greenShare', name: 'Green electricity', what: 'Rooftop solar plus a renewable electricity tariff or power purchase agreement.', basis: 'Cuts grid CO₂ in proportion to the green share; tariff premium not modelled', capexRM: () => 0 },
  { key: 'captureShare', name: 'Chitosan capture on the reheat stack', what: 'Treat part of the reheating-furnace flue gas with chitosan sorbent, regenerated with furnace waste heat.', basis: '90% capture of the treated gas; 0.25 MWh electricity per t captured; RM 1,000 per t/yr capacity',
    capexRM: (p, annualT, u) => Math.round(intensity(p, u).capturedKgPerT * annualT / 1_000 * 1_000) },
]

export type Intensity = {
  /** kWh per tonne of steel, by unit. */
  kwh: Record<Exclude<UnitId, 'scrap' | 'reheat'>, number>
  totalKwhPerT: number
  reheatGJPerT: number
  eafDirectKgPerT: number
  reheatKgPerT: number
  capturedKgPerT: number
  /** Scope 1: on-site combustion and process, after capture. */
  directKgPerT: number
  /** Scope 2: purchased grid electricity, after the green share. */
  indirectKgPerT: number
  totalKgPerT: number
}

export function intensity(p: SteelParams, u: Upgrades): Intensity {
  const reheatGJPerT = p.reheatGJPerT * (u.hotCharging ? 0.7 : 1) * (u.regenBurners ? 0.85 : 1)
  const reheatGrossKg = reheatGJPerT * p.gasKgPerGJ
  const capturedKgPerT = reheatGrossKg * Math.min(1, Math.max(0, u.captureShare)) * 0.9
  const kwh = {
    ...p.kwhPerT,
    eaf: p.kwhPerT.eaf * (u.eafOptimisation ? 0.9 : 1),
    fume: p.kwhPerT.fume * (u.fumeVsd ? 0.7 : 1),
    // Capture's own electricity use is counted under utilities.
    utilities: p.kwhPerT.utilities + capturedKgPerT / 1_000 * 250,
  }
  const totalKwhPerT = Object.values(kwh).reduce((sum, value) => sum + value, 0)
  const indirectKgPerT = totalKwhPerT * p.gridKgPerKWh * (1 - Math.min(1, Math.max(0, u.greenShare)))
  const reheatKgPerT = reheatGrossKg - capturedKgPerT
  const directKgPerT = p.eafDirectKgPerT + reheatKgPerT
  return { kwh, totalKwhPerT, reheatGJPerT, eafDirectKgPerT: p.eafDirectKgPerT, reheatKgPerT, capturedKgPerT, directKgPerT, indirectKgPerT, totalKgPerT: directKgPerT + indirectKgPerT }
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
    energyCostRM: electricityMWh * p.electricityRMPerMWh + gasGJ * p.gasRMPerGJ,
  }
}

export type UpgradeImpact = { info: UpgradeInfo; savedKgPerT: number; savedTPerYear: number; capexRM: number; annualSavingRM: number; paybackYears: number | null }

/** Impact of each active upgrade on its own, measured against no upgrades. */
export function upgradeImpacts(p: SteelParams, u: Upgrades): UpgradeImpact[] {
  const base = annual(p, noUpgrades), baseI = intensity(p, noUpgrades)
  return upgradeInfo.filter((info) => Boolean(u[info.key])).map((info) => {
    const only = { ...noUpgrades, [info.key]: u[info.key] } as Upgrades
    const result = annual(p, only)
    const capexRM = info.capexRM(p, result.steelT, only)
    const captureOpex = info.key === 'captureShare' ? intensity(p, only).capturedKgPerT * result.steelT / 1_000 * 60 : 0
    const annualSavingRM = base.energyCostRM - result.energyCostRM - captureOpex
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

/* ---------------- Live heat cycle ---------------- */

export type EafPhase = 'Charging' | 'Melting' | 'Refining' | 'Tapping'
const phases: { phase: EafPhase; share: number; powerFactor: number }[] = [
  // Shares of the tap-to-tap time and relative arc power; the weighted average equals 1.
  { phase: 'Charging', share: 0.1, powerFactor: 0.1 },
  { phase: 'Melting', share: 0.64, powerFactor: 1.32 },
  { phase: 'Refining', share: 0.16, powerFactor: 0.92 },
  { phase: 'Tapping', share: 0.1, powerFactor: 0.04 },
]
const meanFactor = phases.reduce((sum, item) => sum + item.share * item.powerFactor, 0)

export type LiveState = {
  phase: EafPhase
  phaseProgress: number
  heatNumber: number
  /** Electrical load by unit in MW. */
  mw: Record<Exclude<UnitId, 'scrap' | 'reheat'>, number>
  totalMW: number
  reheatGJPerH: number
  /** CO₂ being emitted right now, t/h. */
  co2TPerH: number
  directTPerH: number
  indirectTPerH: number
  capturedTPerH: number
  rollingOn: boolean
}

/** Instantaneous plant state at a simulated time (minutes since start). Deterministic. */
export function liveState(p: SteelParams, u: Upgrades, minutes: number): LiveState {
  const i = intensity(p, u)
  const tph = tonnesPerHour(p)
  const cycleT = ((minutes % p.cycleMin) + p.cycleMin) % p.cycleMin / p.cycleMin
  let acc = 0
  let current = phases[0], phaseProgress = 0
  for (const item of phases) {
    if (cycleT < acc + item.share) { current = item; phaseProgress = (cycleT - acc) / item.share; break }
    acc += item.share
  }
  // Arc power flickers while melting, as it does on a real EAF.
  const flicker = current.phase === 'Melting' ? 1 + 0.06 * Math.sin(minutes * 7.3) + 0.04 * Math.sin(minutes * 23.1) : 1
  const eafMW = i.kwh.eaf * tph / 1_000 * current.powerFactor / meanFactor * flicker
  // The rolling mill pauses briefly for roll changes (about 10% of the time).
  const rollingOn = (minutes % 120) < 108
  const mw = {
    eaf: eafMW,
    lf: i.kwh.lf * tph / 1_000,
    caster: i.kwh.caster * tph / 1_000,
    rolling: rollingOn ? i.kwh.rolling * tph / 1_000 / 0.9 : 0.4,
    fume: i.kwh.fume * tph / 1_000 * (current.phase === 'Melting' ? 1.15 : 0.7),
    utilities: i.kwh.utilities * tph / 1_000,
    oxygen: i.kwh.oxygen * tph / 1_000,
  }
  const totalMW = Object.values(mw).reduce((sum, value) => sum + value, 0)
  const reheatGJPerH = i.reheatGJPerT * tph
  const greenFactor = 1 - Math.min(1, Math.max(0, u.greenShare))
  const indirectTPerH = totalMW * p.gridKgPerKWh * greenFactor
  const eafDirectTPerH = ['Melting', 'Refining'].includes(current.phase) ? i.eafDirectKgPerT * tph / 1_000 / 0.8 : 0
  const reheatTPerH = i.reheatKgPerT * tph / 1_000
  return {
    phase: current.phase,
    phaseProgress,
    heatNumber: Math.floor(minutes / p.cycleMin) + 1,
    mw,
    totalMW,
    reheatGJPerH,
    co2TPerH: indirectTPerH + eafDirectTPerH + reheatTPerH,
    directTPerH: eafDirectTPerH + reheatTPerH,
    indirectTPerH,
    capturedTPerH: i.capturedKgPerT * tph / 1_000,
    rollingOn,
  }
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
