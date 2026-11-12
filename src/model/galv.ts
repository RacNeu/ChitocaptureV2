/**
 * Process model of a wire drawing & continuous hot-dip galvanising plant (illustrative sample site).
 *
 * Route: wire rod coils → rod pickling & coating → multi-die dry drawing machines → galvanising lines
 * (pay-off → annealing furnace → quench → in-line acid → rinse → flux → dryer → molten zinc kettle →
 * wiping → cooling → take-up). The numbers come from first principles, checked against published data:
 *
 * • Drawing work = mean flow stress × true strain ÷ density ÷ efficiency. True strain ε = 2·ln(d₀/d₁).
 *   Suliga et al. (Materials, 2023) measured 42–56 TJ per 100,000 t (118–155 kWh/t) drawing 0.42 %C
 *   wire 5.5 → 2.2 mm in 7 passes, about 50 % efficient against the ideal work; low-carbon wire needs less.
 * • Annealing and zinc-kettle gas = heat into the wire (and zinc) + wall and surface losses, ÷ burner efficiency.
 * • Zinc use = coating mass (g/m²) × wire surface (m²/t) × (1 + dross and ash losses).
 * • Primary zinc carbon footprint 3.5 kg CO₂e/kg (International Zinc Association, global average). It is a
 *   purchased material (Scope 3), shown separately from the site's own Scope 1 and 2.
 */

export type GalvUnitId = 'pickling' | 'drawing' | 'anneal' | 'kettle' | 'utilities' | 'wastewater'
export type GalvUnit = { id: GalvUnitId; name: string; short: string; role: string; machineName: string }

export const galvUnits: readonly GalvUnit[] = [
  { id: 'pickling', name: 'Pickling & pre-treatment', short: 'Pickling', machineName: 'Pickling line', role: 'Hydrochloric-acid baths strip mill scale from the rod, then a borax/lime coat carries drawing lubricant. In-line acid, rinse and flux tanks clean the wire again before zinc. Fume scrubbers catch the acid mist.' },
  { id: 'drawing', name: 'Wire drawing machines', short: 'Drawing', machineName: 'Wire drawing machines', role: 'Multi-die dry drawing machines pull 5.5 mm rod through a series of tungsten-carbide dies, each one a little smaller, with a powered capstan after every die. The plant’s biggest electricity user.' },
  { id: 'anneal', name: 'Annealing furnaces', short: 'Annealing', machineName: 'Annealing furnace', role: 'Gas-fired tube furnaces heat the hard drawn wire to about 720 °C so it recrystallises and becomes soft and ductile again, then it is water-quenched.' },
  { id: 'kettle', name: 'Galvanising lines & zinc kettles', short: 'Zinc kettle', machineName: 'Galvanising zinc bath', role: 'Each line pulls about 40 wires side by side through a kettle of molten zinc at about 450 °C. Gas burners keep the zinc liquid; wiping sets the coating thickness before the wire is cooled and coiled.' },
  { id: 'utilities', name: 'Compressed air & cooling', short: 'Utilities', machineName: 'Compressed air & cooling', role: 'Air compressors, and cooling-water pumps and towers that take heat away from the drawing capstans, dies and quench tanks.' },
  { id: 'wastewater', name: 'Wastewater treatment', short: 'Wastewater', machineName: 'Wastewater treatment', role: 'Neutralises spent acid and rinse water with lime, settles the iron and zinc sludge, and treats the water before discharge.' },
]

export type GalvParams = {
  galvLines: number
  strandsPerLine: number
  /** Finished wire diameter (mm). */
  wireDiaMm: number
  /** Galvanising line speed (m/min). DV (mm × m/min) of about 120–130 is typical for wire lines. */
  lineSpeedMPerMin: number
  rodDiaMm: number
  dies: number
  drawMachines: number
  /** Finishing speed of a drawing machine (m/s). */
  drawSpeedMPerS: number
  rodCoilT: number
  coilChangeMin: number
  /** Mean flow stress over the drawing passes, low-carbon wire (MPa). */
  flowStressMPa: number
  drawEfficiency: number
  drawAuxKWhPerT: number
  annealTempC: number
  annealEfficiency: number
  /** Furnace wall losses per line while running (kW of heat). */
  annealLossKW: number
  kettleTempC: number
  /** Wire temperature entering the zinc after the flux dryer (°C). */
  wireEntryC: number
  /** Kettle wall and zinc-surface losses per line (kW of heat). */
  kettleLossKW: number
  burnerEfficiency: number
  /** Actual average coating (g/m²). Specification for this sample product is 240 g/m² (heavy coat). */
  coatingGPerM2: number
  coatingSpecGPerM2: number
  /** Extra zinc lost as dross and ash, as a share of the coating. */
  zincLossShare: number
  picklingKWhPerT: number
  lineDrivesKWhPerT: number
  utilitiesKWhPerT: number
  wastewaterKWhPerT: number
  operatingHoursPerYear: number
  gridKgPerKWh: number
  gasKgPerGJ: number
  zincKgCO2PerKg: number
  electricityRMPerMWh: number
  gasRMPerGJ: number
  zincRMPerT: number
  /** Direct (CBAM) emissions of the wire rod bought from the steel mill, kg CO₂ per tonne of rod. */
  rodDirectKgPerT: number
}

export const defaultGalvParams: GalvParams = {
  galvLines: 4,
  strandsPerLine: 40,
  wireDiaMm: 2.5,
  lineSpeedMPerMin: 52,
  rodDiaMm: 5.5,
  dies: 8,
  drawMachines: 14,
  drawSpeedMPerS: 12,
  rodCoilT: 2,
  coilChangeMin: 6,
  flowStressMPa: 620,
  drawEfficiency: 0.45,
  drawAuxKWhPerT: 12,
  annealTempC: 720,
  annealEfficiency: 0.5,
  annealLossKW: 60,
  kettleTempC: 450,
  wireEntryC: 90,
  kettleLossKW: 450,
  burnerEfficiency: 0.45,
  coatingGPerM2: 265,
  coatingSpecGPerM2: 240,
  zincLossShare: 0.15,
  picklingKWhPerT: 22,
  lineDrivesKWhPerT: 15,
  utilitiesKWhPerT: 10,
  wastewaterKWhPerT: 4,
  operatingHoursPerYear: 7_800,
  gridKgPerKWh: 0.774,
  gasKgPerGJ: 56.1,
  zincKgCO2PerKg: 3.5,
  electricityRMPerMWh: 450,
  gasRMPerGJ: 40,
  zincRMPerT: 13_000,
  rodDirectKgPerT: 137,
}

export type GalvUpgrades = {
  drawing: boolean
  kettleCover: boolean
  recuperator: boolean
  induction: boolean
  coatingControl: boolean
  greenShare: number
}
export const noGalvUpgrades: GalvUpgrades = { drawing: false, kettleCover: false, recuperator: false, induction: false, coatingControl: false, greenShare: 0 }

const STEEL_DENSITY = 7_850
/** Mean specific heat of steel from 30 °C to about 720 °C (J/kg·K). */
const STEEL_CP_ANNEAL = 600
/** Mean specific heat of steel from 90 °C to 450 °C (J/kg·K). */
const STEEL_CP_KETTLE = 480
/** Heat to warm zinc from 25 °C, melt it (112 kJ/kg) and bring it to bath temperature (kJ/kg). */
const ZINC_HEAT_KJ_PER_KG = 280
const INDUCTION_EFFICIENCY = 0.85

export const kgPerMetre = (p: GalvParams) => Math.PI * (p.wireDiaMm / 2_000) ** 2 * STEEL_DENSITY
/** Wire throughput of all galvanising lines (t/h). */
export const galvTonnesPerHour = (p: GalvParams) => p.galvLines * p.strandsPerLine * p.lineSpeedMPerMin * 60 * kgPerMetre(p) / 1_000
export const galvAnnualTonnes = (p: GalvParams) => galvTonnesPerHour(p) * p.operatingHoursPerYear
/** Output of one drawing machine while it runs (t/h). */
export const drawMachineTph = (p: GalvParams) => kgPerMetre(p) * p.drawSpeedMPerS * 3.6
export const trueStrain = (p: GalvParams) => 2 * Math.log(p.rodDiaMm / p.wireDiaMm)

/** Die-by-die schedule with equal strain per pass, as most multi-die machines are set up. */
export function dieSchedule(p: GalvParams) {
  const step = trueStrain(p) / p.dies
  return Array.from({ length: p.dies }, (_, index) => {
    const dIn = p.rodDiaMm / Math.exp(step * index / 2)
    const dOut = p.rodDiaMm / Math.exp(step * (index + 1) / 2)
    return { die: index + 1, dInMm: dIn, dOutMm: dOut, reductionPct: (1 - (dOut / dIn) ** 2) * 100, speedMPerS: p.drawSpeedMPerS * (p.wireDiaMm / dOut) ** 2 }
  })
}

export type GalvIntensity = {
  kwh: Record<'pickling' | 'drawing' | 'utilities' | 'wastewater' | 'lineDrives' | 'induction', number>
  annealGJPerT: number
  kettleGJPerT: number
  zincKgPerT: number
  directKgPerT: number
  indirectKgPerT: number
  totalKgPerT: number
  zincKgCO2PerT: number
}

function effective(p: GalvParams, u: GalvUpgrades) {
  return {
    // Upgrades act relative to the plant's own figures, so they still make sense on calibrated site data.
    drawEfficiency: u.drawing ? Math.min(0.75, p.drawEfficiency * 0.55 / 0.45) : p.drawEfficiency,
    drawAux: u.drawing ? p.drawAuxKWhPerT * 0.75 : p.drawAuxKWhPerT,
    annealEfficiency: u.recuperator ? Math.min(0.8, p.annealEfficiency * 0.62 / 0.5) : p.annealEfficiency,
    kettleLossKW: u.kettleCover ? p.kettleLossKW * 280 / 450 : p.kettleLossKW,
    burnerEfficiency: u.kettleCover ? Math.min(0.75, p.burnerEfficiency * 0.55 / 0.45) : p.burnerEfficiency,
    coating: u.coatingControl ? p.coatingSpecGPerM2 + 8 : p.coatingGPerM2,
  }
}

export function galvIntensity(p: GalvParams, u: GalvUpgrades): GalvIntensity {
  const e = effective(p, u)
  const tphPerLine = galvTonnesPerHour(p) / p.galvLines
  // Drawing: ideal work (J/kg) = σ × ε / ρ; kWh/t = J/kg ÷ 3,600.
  const drawing = p.flowStressMPa * 1e6 * trueStrain(p) / STEEL_DENSITY / 3_600 / e.drawEfficiency + e.drawAux
  // Annealing heat into the wire plus wall losses, either from gas or from induction coils.
  const annealHeatMJ = STEEL_CP_ANNEAL * (p.annealTempC - 30) / 1_000 + p.annealLossKW * 3.6 / tphPerLine
  const annealGJPerT = u.induction ? 0 : annealHeatMJ / e.annealEfficiency / 1_000
  const induction = u.induction ? annealHeatMJ / INDUCTION_EFFICIENCY / 3.6 : 0
  // Zinc: coating mass over the wire surface, plus dross and ash.
  const surfaceM2PerT = Math.PI * p.wireDiaMm / 1_000 * (1_000 / kgPerMetre(p))
  const zincKgPerT = e.coating * surfaceM2PerT / 1_000 * (1 + p.zincLossShare)
  const kettleHeatMJ = STEEL_CP_KETTLE * (p.kettleTempC - p.wireEntryC) / 1_000 + zincKgPerT * ZINC_HEAT_KJ_PER_KG / 1_000 + e.kettleLossKW * 3.6 / tphPerLine
  const kettleGJPerT = kettleHeatMJ / e.burnerEfficiency / 1_000
  const kwh = { pickling: p.picklingKWhPerT, drawing, utilities: p.utilitiesKWhPerT, wastewater: p.wastewaterKWhPerT, lineDrives: p.lineDrivesKWhPerT, induction }
  const totalKWh = Object.values(kwh).reduce((sum, value) => sum + value, 0)
  const directKgPerT = (annealGJPerT + kettleGJPerT) * p.gasKgPerGJ
  const indirectKgPerT = totalKWh * p.gridKgPerKWh * (1 - u.greenShare)
  return { kwh, annealGJPerT, kettleGJPerT, zincKgPerT, directKgPerT, indirectKgPerT, totalKgPerT: directKgPerT + indirectKgPerT, zincKgCO2PerT: zincKgPerT * p.zincKgCO2PerKg }
}

export type GalvAnnual = { wireT: number; co2T: number; directT: number; indirectT: number; zincT: number; zincCO2T: number; electricityMWh: number; gasGJ: number; costRM: number }

export function galvAnnual(p: GalvParams, u: GalvUpgrades): GalvAnnual {
  const i = galvIntensity(p, u)
  const wireT = galvAnnualTonnes(p)
  const electricityMWh = Object.values(i.kwh).reduce((sum, value) => sum + value, 0) * wireT / 1_000
  const gasGJ = (i.annealGJPerT + i.kettleGJPerT) * wireT
  const zincT = i.zincKgPerT * wireT / 1_000
  return {
    wireT,
    co2T: i.totalKgPerT * wireT / 1_000,
    directT: i.directKgPerT * wireT / 1_000,
    indirectT: i.indirectKgPerT * wireT / 1_000,
    zincT,
    zincCO2T: i.zincKgCO2PerT * wireT / 1_000,
    electricityMWh,
    gasGJ,
    costRM: electricityMWh * p.electricityRMPerMWh + gasGJ * p.gasRMPerGJ + zincT * p.zincRMPerT,
  }
}

export type GalvUpgradeInfo = { key: keyof GalvUpgrades; name: string; what: string; basis: string; capexRM: (p: GalvParams) => number }

export const galvUpgradeInfo: GalvUpgradeInfo[] = [
  { key: 'coatingControl', name: 'Coating-weight control', what: 'Nitrogen wiping with an online coating gauge brings the average zinc coat from about 265 g/m² down to just above the 240 g/m² specification. Less zinc bought, less zinc to melt.', basis: 'Over-coating of 5–15 % is common on wire lines with manual wiping.', capexRM: (p) => 0.8e6 * p.galvLines },
  { key: 'drawing', name: 'Drawing machine drives, dies & lubrication', what: 'AC vector drives with regeneration, better die profiles and lubricant: drawing efficiency from about 45 % to 55 %.', basis: 'Suliga et al. (2023) found up to 37 % lower drawing energy with an optimised drawing route.', capexRM: (p) => 0.55e6 * p.drawMachines },
  { key: 'kettleCover', name: 'Kettle covers & high-efficiency burners', what: 'Insulated covers over the idle zinc surface, better kettle insulation and pulse-fired burners: surface and wall losses drop by a third and burners run more efficiently.', basis: 'Most of a zinc kettle’s gas keeps the bath hot rather than heating the wire.', capexRM: (p) => 1.1e6 * p.galvLines },
  { key: 'recuperator', name: 'Annealing furnace recuperators', what: 'Preheat the combustion air with the furnace’s own flue gas: furnace efficiency from about 50 % to 62 %.', basis: 'Recuperative burners typically save 15–25 % of fuel on 700–900 °C furnaces.', capexRM: (p) => 1.4e6 * p.galvLines },
  { key: 'induction', name: 'Electric induction annealing', what: 'Replace the gas furnaces with induction heaters. This removes the gas, but adds electricity, so whether it cuts CO₂ depends on how clean the electricity is.', basis: 'Induction heats wire at about 85 % efficiency. On Peninsular Malaysia’s grid it can raise CO₂ unless paired with green power.', capexRM: (p) => 6e6 * p.galvLines },
  { key: 'greenShare', name: 'Renewable electricity (green tariff or solar)', what: 'Share of electricity from renewables, for example the Green Electricity Tariff or rooftop solar on the large wire-plant roofs.', basis: 'Cuts Scope 2 emissions in proportion.', capexRM: () => 0 },
]

export type GalvUpgradeImpact = { info: GalvUpgradeInfo; savedKgPerT: number; savedTPerYear: number; zincSavedT: number; capexRM: number; annualSavingRM: number; paybackYears: number | null }

/** Effect of each active upgrade on its own, against today. */
export function galvUpgradeImpacts(p: GalvParams, u: GalvUpgrades): GalvUpgradeImpact[] {
  const base = galvAnnual(p, noGalvUpgrades)
  const baseCost = base.electricityMWh * p.electricityRMPerMWh + base.gasGJ * p.gasRMPerGJ + base.zincT * p.zincRMPerT
  return galvUpgradeInfo.filter((info) => Boolean(u[info.key])).map((info) => {
    const only = { ...noGalvUpgrades, [info.key]: u[info.key] } as GalvUpgrades
    const after = galvAnnual(p, only)
    const cost = after.electricityMWh * p.electricityRMPerMWh + after.gasGJ * p.gasRMPerGJ + after.zincT * p.zincRMPerT
    const capexRM = info.capexRM(p)
    const annualSavingRM = baseCost - cost
    return {
      info,
      savedKgPerT: galvIntensity(p, noGalvUpgrades).totalKgPerT - galvIntensity(p, only).totalKgPerT,
      savedTPerYear: base.co2T - after.co2T,
      zincSavedT: base.zincT - after.zincT,
      capexRM,
      annualSavingRM,
      paybackYears: annualSavingRM > 0 && capexRM > 0 ? capexRM / annualSavingRM : null,
    }
  })
}

/* ---------------- Live state ---------------- */

export type GalvLive = {
  /** Electric power by unit (MW). */
  mw: Record<'pickling' | 'drawing' | 'utilities' | 'wastewater' | 'kettle' | 'anneal', number>
  annealGJPerH: number
  kettleGJPerH: number
  /** Bath temperature of each line's kettle (°C): it swings a few degrees as the burners modulate. */
  kettleTempC: number[]
  /** Firing rate of each kettle's burners, 0–1. */
  burnerFiring: number[]
  /** Which drawing machines are drawing (the rest are changing coils or waiting). */
  machinesRunning: boolean[]
  lineSpeedMPerMin: number
  wireTPerH: number
  zincKgPerH: number
  totalMW: number
  directTPerH: number
  indirectTPerH: number
  co2TPerH: number
}

const wave = (minutes: number, periodMin: number, phase = 0) => Math.sin((minutes / periodMin + phase) * Math.PI * 2)

export function galvLive(p: GalvParams, u: GalvUpgrades, minutes: number): GalvLive {
  const i = galvIntensity(p, u)
  const tph = galvTonnesPerHour(p)
  // Small speed changes as coils are welded on and lines are trimmed.
  const speedFactor = 1 + 0.015 * wave(minutes, 37) + 0.008 * wave(minutes, 11, 0.3)
  const wireTPerH = tph * speedFactor
  // Drawing machines run a coil, then stop for a coil change, staggered so the plant output stays steady.
  const machineTph = drawMachineTph(p)
  const utilisation = Math.min(0.98, tph / (p.drawMachines * machineTph))
  const runMin = p.rodCoilT / machineTph * 60
  const cycleMin = runMin / utilisation
  const machinesRunning = Array.from({ length: p.drawMachines }, (_, index) => ((minutes + index * cycleMin / p.drawMachines * 1.37) % cycleMin) < runMin)
  const running = machinesRunning.filter(Boolean).length
  const idleShare = 0.12
  const runKW = i.kwh.drawing * tph * 1_000 / (p.drawMachines * (utilisation + idleShare * (1 - utilisation))) / 1_000
  const drawingMW = (running * runKW + (p.drawMachines - running) * runKW * idleShare) / 1_000
  // Kettles: burners modulate around the set point; the bath swings a few degrees behind the firing rate.
  const burnerFiring = Array.from({ length: p.galvLines }, (_, line) => Math.max(0.2, Math.min(1, 0.62 + 0.3 * wave(minutes, 14, line * 0.27))))
  const kettleTempC = burnerFiring.map((_, line) => p.kettleTempC + 4 * wave(minutes, 14, line * 0.27 - 0.25))
  const meanFiring = burnerFiring.reduce((sum, value) => sum + value, 0) / p.galvLines
  const kettleGJPerH = i.kettleGJPerT * tph * meanFiring / 0.62
  const annealGJPerH = i.annealGJPerT * wireTPerH * (1 + 0.02 * wave(minutes, 23, 0.1))
  const mw = {
    pickling: i.kwh.pickling * tph / 1_000 * (1 + 0.05 * wave(minutes, 9)),
    drawing: drawingMW,
    utilities: i.kwh.utilities * tph / 1_000 * (0.9 + 0.1 * running / Math.max(1, p.drawMachines * utilisation)),
    wastewater: i.kwh.wastewater * tph / 1_000,
    kettle: i.kwh.lineDrives * wireTPerH / 1_000,
    anneal: i.kwh.induction * wireTPerH / 1_000,
  }
  const totalMW = Object.values(mw).reduce((sum, value) => sum + value, 0)
  const directTPerH = (annealGJPerH + kettleGJPerH) * p.gasKgPerGJ / 1_000
  const indirectTPerH = totalMW * p.gridKgPerKWh * (1 - u.greenShare)
  return {
    mw, annealGJPerH, kettleGJPerH, kettleTempC, burnerFiring, machinesRunning,
    lineSpeedMPerMin: p.lineSpeedMPerMin * speedFactor, wireTPerH, zincKgPerH: i.zincKgPerT * wireTPerH,
    totalMW, directTPerH, indirectTPerH, co2TPerH: directTPerH + indirectTPerH,
  }
}

/** CO₂ rate of one unit (t/h) in a live snapshot. */
export function galvUnitCo2(p: GalvParams, u: GalvUpgrades, live: GalvLive, id: GalvUnitId) {
  const grid = p.gridKgPerKWh * (1 - u.greenShare)
  if (id === 'anneal') return live.annealGJPerH * p.gasKgPerGJ / 1_000 + live.mw.anneal * grid
  if (id === 'kettle') return live.kettleGJPerH * p.gasKgPerGJ / 1_000 + live.mw.kettle * grid
  return live.mw[id] * grid
}

/** Simplified CBAM embedded emissions of the wire: own direct emissions plus the rod precursor. */
export function galvCbamDirectKgPerT(p: GalvParams, u: GalvUpgrades) {
  // About 2 % of the rod is lost as scale and crop ends, so a tonne of wire carries 1.02 t of rod.
  return galvIntensity(p, u).directKgPerT + p.rodDirectKgPerT * 1.02
}

/* ---------------- Inside a zinc kettle ---------------- */

export type KettleInternals = {
  line: number
  tempC: number
  firing: number
  gasGJPerH: number
  /** Gas flow in normal cubic metres per hour (about 38 MJ/Nm³). */
  gasNm3PerH: number
  wireTPerH: number
  zincKgPerH: number
  drossKgPerH: number
  /** Coating measured after wiping (g/m²), wandering around its average. */
  coatingGPerM2: number
  coatingAvgGPerM2: number
  coatingSpecGPerM2: number
  /** Zinc above specification, per year for this line (t) and its cost (RM). */
  overcoatZincTPerYear: number
  overcoatRMPerYear: number
  /** Where the gas heat goes, shares adding to 1. */
  heat: { wire: number; zinc: number; losses: number; flue: number }
  /** 0 → 1 through the time between jumbo ingots; the ingot goes in near the end. */
  ingotPhase: number
  minutesToIngot: number
  /** Dross on the kettle floor, 0 → 1 over a shift until it is grabbed out. */
  drossLayer: number
}

const INGOT_KG = 1_000
const SHIFT_MIN = 480
/** Dross is about 60 % of the zinc lost as dross and ash. */
const DROSS_SHARE_OF_LOSS = 0.6

export function kettleInternals(p: GalvParams, u: GalvUpgrades, live: GalvLive, minutes: number, line = 0): KettleInternals {
  const e = effective(p, u)
  const wireTPerH = live.wireTPerH / p.galvLines
  const zincKgPerH = live.zincKgPerH / p.galvLines
  const gasGJPerH = live.kettleGJPerH / p.galvLines * live.burnerFiring[line] / Math.max(0.01, live.burnerFiring.reduce((sum, value) => sum + value, 0) / p.galvLines)
  // Manual wiping wanders ±10 g/m²; automatic coating control holds ±3 g/m².
  const swing = u.coatingControl ? 3 : 10
  const coatingGPerM2 = e.coating + swing * (0.7 * wave(minutes, 6, line * 0.31) + 0.3 * wave(minutes, 2.3, line * 0.7))
  const surfaceM2PerT = Math.PI * p.wireDiaMm / 1_000 * (1_000 / kgPerMetre(p))
  const overcoatKgPerT = Math.max(0, e.coating - p.coatingSpecGPerM2) * surfaceM2PerT / 1_000
  const lineTPerYear = galvAnnualTonnes(p) / p.galvLines
  const zincKgPerT = e.coating * surfaceM2PerT / 1_000 * (1 + p.zincLossShare)
  const wireMJ = STEEL_CP_KETTLE * (p.kettleTempC - p.wireEntryC) / 1_000
  const zincMJ = zincKgPerT * ZINC_HEAT_KJ_PER_KG / 1_000
  const lossMJ = e.kettleLossKW * 3.6 / (galvTonnesPerHour(p) / p.galvLines)
  const gasMJ = (wireMJ + zincMJ + lossMJ) / e.burnerEfficiency
  const ingotCycleMin = INGOT_KG / Math.max(1, zincKgPerH) * 60
  const ingotPhase = ((minutes + line * ingotCycleMin * 0.27) % ingotCycleMin) / ingotCycleMin
  return {
    line,
    tempC: live.kettleTempC[line],
    firing: live.burnerFiring[line],
    gasGJPerH,
    gasNm3PerH: gasGJPerH * 1_000 / 38,
    wireTPerH,
    zincKgPerH,
    drossKgPerH: zincKgPerH * p.zincLossShare / (1 + p.zincLossShare) * DROSS_SHARE_OF_LOSS,
    coatingGPerM2,
    coatingAvgGPerM2: e.coating,
    coatingSpecGPerM2: p.coatingSpecGPerM2,
    overcoatZincTPerYear: overcoatKgPerT * (1 + p.zincLossShare) * lineTPerYear / 1_000,
    overcoatRMPerYear: overcoatKgPerT * (1 + p.zincLossShare) * lineTPerYear / 1_000 * p.zincRMPerT,
    heat: { wire: wireMJ / gasMJ, zinc: zincMJ / gasMJ, losses: lossMJ / gasMJ, flue: 1 - (wireMJ + zincMJ + lossMJ) / gasMJ },
    ingotPhase,
    minutesToIngot: Math.max(0, (0.9 - ingotPhase) * ingotCycleMin),
    drossLayer: ((minutes + line * 97) % SHIFT_MIN) / SHIFT_MIN,
  }
}

/* ---------------- Calibrating the simulation to the site's own machine data ---------------- */

export type GalvSiteData = Partial<{ productionT: number; picklingKWhPerT: number; drawingKWhPerT: number; annealGJPerT: number; kettleGJPerT: number; lineDrivesKWhPerT: number; utilitiesKWhPerT: number; wastewaterKWhPerT: number }>

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

/**
 * Adjust the process model so its per-tonne energy matches what the site entered for each machine.
 * Efficiencies are solved backwards from the entered figures, so the live behaviour (coil changes,
 * burner cycling) and the upgrades still work on the site's own numbers.
 */
export function calibrateGalv(base: GalvParams, data: GalvSiteData): GalvParams {
  const p = { ...base }
  if (data.productionT && data.productionT > 0) p.operatingHoursPerYear = clamp(data.productionT / galvTonnesPerHour(base), 1_000, 8_760)
  const tphPerLine = galvTonnesPerHour(p) / p.galvLines
  if (data.picklingKWhPerT !== undefined) p.picklingKWhPerT = Math.max(0, data.picklingKWhPerT)
  if (data.drawingKWhPerT !== undefined) {
    const ideal = p.flowStressMPa * 1e6 * trueStrain(p) / STEEL_DENSITY / 3_600
    p.drawEfficiency = clamp(ideal / Math.max(1, data.drawingKWhPerT - p.drawAuxKWhPerT), 0.2, 0.75)
  }
  if (data.annealGJPerT !== undefined && data.annealGJPerT > 0) {
    const heatMJ = STEEL_CP_ANNEAL * (p.annealTempC - 30) / 1_000 + p.annealLossKW * 3.6 / tphPerLine
    p.annealEfficiency = clamp(heatMJ / (data.annealGJPerT * 1_000), 0.2, 0.8)
  }
  if (data.kettleGJPerT !== undefined && data.kettleGJPerT > 0) {
    const i = galvIntensity(p, noGalvUpgrades)
    const heatMJ = STEEL_CP_KETTLE * (p.kettleTempC - p.wireEntryC) / 1_000 + i.zincKgPerT * ZINC_HEAT_KJ_PER_KG / 1_000 + p.kettleLossKW * 3.6 / tphPerLine
    p.burnerEfficiency = clamp(heatMJ / (data.kettleGJPerT * 1_000), 0.2, 0.75)
  }
  if (data.lineDrivesKWhPerT !== undefined) p.lineDrivesKWhPerT = Math.max(0, data.lineDrivesKWhPerT)
  if (data.utilitiesKWhPerT !== undefined) p.utilitiesKWhPerT = Math.max(0, data.utilitiesKWhPerT)
  if (data.wastewaterKWhPerT !== undefined) p.wastewaterKWhPerT = Math.max(0, data.wastewaterKWhPerT)
  return p
}
