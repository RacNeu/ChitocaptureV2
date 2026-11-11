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

/**
 * Illustrative good-practice targets per tonne for this sample mill (kWh/t; GJ/t for the reheating
 * furnace). They are planning placeholders, not published benchmarks: set real targets from the
 * plant's own best months or an energy audit.
 */
export const steelTargets: Record<Exclude<UnitId, 'scrap'>, number> = {
  eaf: 380, lf: 35, caster: 12, reheat: 1.0, rolling: 85, fume: 28, utilities: 20, oxygen: 18,
}

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
  { key: 'captureShare', name: 'ChitoCapture chitosan capture', what: 'ChitoCapture’s chitosan sorbent unit on the reheating-furnace stack. A 5% pilot is running; slide right to see a full-scale installation. The sorbent is regenerated with furnace waste heat.', basis: '90% capture of the treated gas; 0.25 MWh electricity per t captured; RM 1,000 per t/yr capacity',
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

/* ---------------- Inside the arc furnace ---------------- */

export type EafInternals = {
  /** Share of the charged scrap that is molten (0–1). */
  meltFraction: number
  /** Liquid bath temperature, °C (approximate, illustrative). */
  bathTempC: number
  /** Foamy-slag height factor (0–1); foaming shields the arc and improves efficiency. */
  slagFoam: number
  /** CO₂ share in the off-gas, % by volume (illustrative). */
  offgasCO2Pct: number
  /** Cooling-water temperature rise across the panels, °C. */
  coolingDeltaT: number
  /** Electrode tip height above the bath, 0 = in the scrap/bath, 1 = fully raised. */
  electrodeLift: number
  /** Energy and CO₂ in the heat so far. */
  heatEnergyMWh: number
  heatCO2T: number
  /** Short explanation of what is happening now. */
  story: string
}

const stories: Record<EafPhase, string> = {
  Charging: 'The roof swings open and the crane drops a basket of scrap into the shell. Electrodes are raised; almost no power is drawn.',
  Melting: 'The electrodes bore down into the scrap and strike an arc hotter than the sun’s surface. This is where most of the electricity, and so most of the CO₂, is used.',
  Refining: 'Oxygen and carbon are injected to foam the slag, which blankets the arc. Impurities move into the slag and the bath is brought to tapping temperature.',
  Tapping: 'The furnace tilts and liquid steel pours through the bottom tap hole into the ladle, leaving the slag behind.',
}

/** What is happening inside the EAF at a moment of the heat (deterministic, illustrative). */
export function eafInternals(p: SteelParams, u: Upgrades, minutes: number): EafInternals {
  const live = liveState(p, u, minutes)
  const t = live.phaseProgress
  const smooth = (x: number) => x * x * (3 - 2 * x)
  let meltFraction = 0, bathTempC = 1_560, slagFoam = 0.1, electrodeLift = 1
  if (live.phase === 'Charging') { meltFraction = 0.08 * (1 - t); bathTempC = 1_560 - 60 * t; electrodeLift = 1 }
  else if (live.phase === 'Melting') { meltFraction = 0.05 + 0.85 * smooth(t); bathTempC = 1_480 + 100 * t; slagFoam = 0.2 + 0.3 * t; electrodeLift = 0.15 + 0.1 * Math.sin(minutes * 3) * (1 - t) }
  else if (live.phase === 'Refining') { meltFraction = 0.9 + 0.1 * t; bathTempC = 1_580 + 55 * t; slagFoam = 0.6 + 0.35 * Math.sin(Math.PI * t); electrodeLift = 0.3 }
  else { meltFraction = 1 - 0.95 * t; bathTempC = 1_635 - 15 * t; slagFoam = 0.3 * (1 - t); electrodeLift = 1 }
  const i = intensity(p, u)
  const cycleT = ((minutes % p.cycleMin) + p.cycleMin) % p.cycleMin / p.cycleMin
  // Energy so far in the heat, integrated with the same phase profile used for the live load.
  let energyShare = 0, acc = 0
  for (const item of phases) {
    const done = Math.min(item.share, Math.max(0, cycleT - acc))
    energyShare += done * item.powerFactor / meanFactor
    acc += item.share
  }
  const heatEnergyMWh = i.kwh.eaf * p.heatSizeT / 1_000 * energyShare
  const directSoFar = live.phase === 'Charging' ? 0 : i.eafDirectKgPerT * p.heatSizeT / 1_000 * Math.min(1, Math.max(0, (cycleT - 0.1) / 0.8))
  return {
    meltFraction,
    bathTempC,
    slagFoam,
    offgasCO2Pct: live.phase === 'Melting' ? 14 + 6 * t : live.phase === 'Refining' ? 22 - 6 * t : 2,
    coolingDeltaT: 4 + 10 * live.mw.eaf / Math.max(1, i.kwh.eaf * tonnesPerHour(p) / 1_000 * 1.3),
    electrodeLift,
    heatEnergyMWh,
    heatCO2T: heatEnergyMWh * p.gridKgPerKWh * (1 - u.greenShare) / 1_000 + directSoFar,
    story: stories[live.phase],
  }
}

/* ---------------- Inside the ChitoCapture unit ---------------- */

/** Two sorbent columns swap every half cycle: one captures CO₂ while the other is regenerated. */
export const CAPTURE_CYCLE_MIN = 60

export type CaptureInternals = {
  /** Which column is capturing now. */
  activeBed: 'A' | 'B'
  /** Progress through the current half cycle (0–1). */
  phaseT: number
  /** Height of the saturation front in the capturing bed (0 = fresh, 1 = full). */
  front: number
  /** Outlet/inlet CO₂ ratio of the capturing bed (breakthrough curve). */
  breakthrough: number
  /** CO₂ still held by the regenerating bed (0–1 of capacity). */
  regenLoading: number
  /** Temperature of the regenerating bed, °C. */
  regenTempC: number
  inletCO2Pct: number
  outletCO2Pct: number
  /** CO₂ captured now, kg/h. */
  capturedKgPerH: number
  /** CO₂ sent to the storage tank by the regenerating bed now, kg/h. */
  toTankKgPerH: number
  /** Storage tank fill, 0–1 (the tank is emptied by truck when full). */
  tankFill: number
  stage: string
}

export function captureInternals(p: SteelParams, u: Upgrades, minutes: number): CaptureInternals {
  const live = liveState(p, u, minutes)
  const half = CAPTURE_CYCLE_MIN / 2
  const m = ((minutes % CAPTURE_CYCLE_MIN) + CAPTURE_CYCLE_MIN) % CAPTURE_CYCLE_MIN
  const activeBed = m < half ? 'A' : 'B'
  const phaseT = (m % half) / half
  const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
  const front = smooth(phaseT * 1.05)
  // Logistic breakthrough: almost nothing slips until the bed nears saturation, then the bed is swapped.
  const breakthrough = 1 / (1 + Math.exp(-(phaseT - 0.9) * 18))
  const inletCO2Pct = 8.5 + 0.4 * Math.sin(minutes / 7)
  const running = u.captureShare > 0
  const capturedKgPerH = running ? live.capturedTPerH * 1_000 * (1 - breakthrough) / 0.92 : 0
  // Regeneration: heat up with waste heat (first 25%), release CO₂ (to 80%), then cool for the next swap.
  const heat = smooth(phaseT / 0.25), cool = smooth((phaseT - 0.8) / 0.2)
  const regenTempC = 40 + 80 * heat - 80 * cool
  const regenLoading = 1 - smooth((phaseT - 0.15) / 0.65)
  const releasing = phaseT > 0.15 && phaseT < 0.8
  const toTankKgPerH = running && releasing ? live.capturedTPerH * 1_000 / 0.65 : 0
  const hoursIntoFill = (minutes / 60) % 12
  return {
    activeBed, phaseT, front, breakthrough, regenLoading, regenTempC,
    inletCO2Pct, outletCO2Pct: running ? inletCO2Pct * (1 - 0.9 * (1 - breakthrough)) : inletCO2Pct,
    capturedKgPerH, toTankKgPerH, tankFill: running ? hoursIntoFill / 12 : 0,
    stage: !running ? 'The capture unit is switched off. Turn on the ChitoCapture slider in the what-if sandbox.'
      : phaseT < 0.25 ? `Column ${activeBed} captures CO₂ from the reheat-furnace exhaust. Column ${activeBed === 'A' ? 'B' : 'A'} is heated with furnace waste heat to start releasing its CO₂.`
        : phaseT < 0.8 ? `Column ${activeBed}’s chitosan sorbent is filling from the bottom up. Column ${activeBed === 'A' ? 'B' : 'A'} releases concentrated CO₂, which is compressed into the storage tank.`
          : `Column ${activeBed} is nearly full: CO₂ starts to slip through (breakthrough). The columns are about to swap; the regenerated column cools down ready to capture again.`,
  }
}
