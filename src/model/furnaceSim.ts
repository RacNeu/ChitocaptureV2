/**
 * Induction furnace heat simulator: the physics behind the Melt shop HMI's set points.
 * Every constant is from docs/induction-furnace-model.md:
 * - 389 kWh/t brings scrap to liquid steel at 1,600 °C; 0.23 kWh/t per °C of superheat (§1, §3)
 * - power supply efficiency ~97% (DOE: > 96%) (§1)
 * - coil + cooling-water losses calibrated so the coil water carries ~26–29% of the power while
 *   melting (Missouri S&T/DOE measured) (§2)
 * - radiation from the bath εσT⁴ (ε ≈ 0.4) through an open lid; a closed lid keeps ~85% in (§9)
 * - cold lining +100 kWh/t (DOE), rusty light scrap +30 kWh/t, dense shredded −15 kWh/t (§3, rough)
 * Electrical values on the primary and secondary side are indicative (IGBT supply, 33 kV feed).
 */
import type { ScrapType } from './meltshop'

export type SetPoints = {
  powerMW: number
  ratedMW: number
  chargeT: number
  heelT: number
  /** Scrap mix in %. */
  mix: Record<ScrapType, number>
  tapAimC: number
  holdMin: number
  /** Extra minutes the lid is open after charging (sampling, additions). */
  lidOpenMin: number
  waterFlowM3h: number
  waterInC: number
  coldLining: boolean
  electricityRMPerMWh: number
  gridKgPerKWh: number
}

export const defaultSetPoints: SetPoints = {
  powerMW: 31, ratedMW: 33, chargeT: 60, heelT: 0,
  mix: { hms: 44, shredded: 30, turnings: 15, pigIron: 4, returns: 7, dri: 0 },
  tapAimC: 1_620, holdMin: 14, lidOpenMin: 6, waterFlowM3h: 410, waterInC: 32, coldLining: false,
  electricityRMPerMWh: 424, gridKgPerKWh: 0.774,
}

export type SimPhase = 'charging' | 'melting' | 'superheat' | 'holding' | 'tapping'
export type SimPoint = {
  min: number; phase: SimPhase
  powerKW: number; energyKwh: number; meltPct: number; bathC: number; hz: number
  coilJouleKW: number; conductionKW: number; radiationKW: number; coilHeatKW: number
  waterOutC: number; waterDT: number; liningC: number; lidOpen: boolean; tiltDeg: number
  primary: { pMW: number; qMvar: number; cosPhi: number; kV: number; amps: number }
  secondary: { coilV: number; coilKA: number; dcKA: number }
  missingKwh: number
}
export type SimAlarm = { min: number; level: 'warn' | 'alarm'; text: string }
export type SimHeat = { points: SimPoint[]; alarms: SimAlarm[]; totalMin: number; powerOnMin: number; kwh: number; kwhPerT: number; tappedT: number; yieldPct: number; costRM: number; co2Kg: number; expectedKwh: number }

const H_LIQ_1530 = 389 - 0.23 * 70 // kWh/t to bring scrap to liquid at 1,530 °C
const CP_LIQ = 0.23                // kWh/t per °C (liquid steel)
const CONVERTER = 0.97
const COIL_JOULE = 0.2             // share of converter output lost in the copper coil
const SIGMA = 5.67e-8, EPS = 0.4
const CHARGE_MIN = 10, TAP_MIN = 6, DT = 0.25

export const yieldFor = (mix: SetPoints['mix']) => 0.955 - 0.06 * mix.turnings / 100
const extraKwhPerT = (sp: SetPoints) => 30 * sp.mix.turnings / 100 - 15 * sp.mix.shredded / 100 + (sp.coldLining ? 100 : 0)

export function simulateHeat(sp: SetPoints): SimHeat {
  const scale = Math.pow(Math.max(5, sp.chargeT + sp.heelT) / 60, 2 / 3)
  const areaM2 = 4.15 * scale                         // open bath surface of a ~60 t crucible
  const conductionFull = 700 * scale                  // kW through the lining when the bath is hot
  const tappedT = sp.chargeT * yieldFor(sp.mix) + sp.heelT * 0 // heel stays in the furnace
  const steelT = sp.chargeT * yieldFor(sp.mix) + sp.heelT
  // Energy the charge must absorb to be liquid at 1,530 °C (heel already liquid).
  const meltNeedKwh = sp.chargeT * (H_LIQ_1530 + extraKwhPerT(sp))
  const flowKgS = Math.max(1, sp.waterFlowM3h) * 1_000 / 3_600
  const points: SimPoint[] = [], alarms: SimAlarm[] = []
  let t = 0, phase: SimPhase = 'charging', phaseT = 0, energy = 0, absorbed = 0, bathC = sp.heelT > 0 ? 1_480 : 25, lining = sp.coldLining ? 150 : 900
  let lidLeft = sp.lidOpenMin, holdLeft = sp.holdMin, tapLeft = TAP_MIN, powerOnMin = 0
  const pRated = sp.ratedMW * 1_000
  const alarmOnce = new Set<string>()
  const raise = (key: string, level: SimAlarm['level'], text: string) => { if (!alarmOnce.has(key)) { alarmOnce.add(key); alarms.push({ min: t, level, text }) } }
  let guard = 0
  while (guard++ < 4_000) {
    const melted = absorbed >= meltNeedKwh
    const hotFrac = Math.min(1, Math.max(0, (bathC - 200) / 1_400))
    let lidOpen = phase === 'charging' || phase === 'tapping'
    if (!lidOpen && lidLeft > 0 && (phase === 'melting' || phase === 'superheat')) { lidOpen = true; lidLeft -= DT }
    // Power by phase.
    let power = 0
    if (phase === 'melting' || phase === 'superheat') power = Math.min(sp.powerMW * 1_000, pRated)
    const conduction = conductionFull * hotFrac
    const radiationOpen = EPS * SIGMA * Math.pow(bathC + 273, 4) * areaM2 / 1_000
    const radiation = (melted || sp.heelT > 0 ? 1 : 0.35) * radiationOpen * (lidOpen ? 1 : 0.15)
    if (phase === 'holding') power = Math.min(pRated, (conduction + radiation) / (CONVERTER * (1 - COIL_JOULE)))
    const coilJoule = power * CONVERTER * COIL_JOULE
    const net = power * CONVERTER - coilJoule - conduction - radiation
    // Energy balance this step.
    const kwh = power * DT / 60
    energy += kwh
    if (phase !== 'charging' && phase !== 'tapping') {
      if (power > 0) powerOnMin += DT
      if (!melted) {
        absorbed += Math.max(0, net) * DT / 60
        // The liquid pool (heel or first melt) sits just under the melting point while scrap melts into it;
        // when the last scrap melts, the whole bath is liquid at ~1,530 °C.
        const frac = Math.min(1, absorbed / meltNeedKwh)
        bathC = absorbed >= meltNeedKwh ? 1_530 : sp.heelT > 0 ? 1_480 + 50 * frac : 1_150 + 380 * Math.sqrt(frac)
      } else {
        bathC += net * DT / 60 / (CP_LIQ * steelT)
      }
    } else if (phase === 'tapping' || melted) {
      bathC -= (conduction + radiation) * DT / 60 / (CP_LIQ * Math.max(1, steelT))
    }
    lining += ((sp.coldLining && t < 60 ? 400 : 1_000) - lining) * 0.01 * DT
    const coilHeat = coilJoule + conduction
    const dT = coilHeat / (flowKgS * 4.18)
    const out = sp.waterInC + dT
    if (sp.waterFlowM3h < 300) raise('flow', 'alarm', `Coil water flow low: ${Math.round(sp.waterFlowM3h)} m³/h (min 300)`)
    if (out > 55) raise('outlet', 'alarm', `Coil water outlet ${out.toFixed(1)} °C above 55 °C`)
    else if (dT > 20) raise('dt', 'warn', `Coil water ΔT ${dT.toFixed(1)} °C above 20 °C`)
    if (bathC > sp.tapAimC + 25) raise('bath', 'warn', `Bath ${Math.round(bathC)} °C, ${Math.round(bathC - sp.tapAimC)} °C over the tap aim`)
    if (power > pRated * 0.999) raise('rating', 'warn', 'Power at the converter rating')
    const pGrid = power / CONVERTER, cosPhi = power > 100 ? 0.98 : 0.9
    const liquidFrac = melted ? 1 : (sp.heelT + absorbed / Math.max(1, meltNeedKwh) * sp.chargeT) / Math.max(1, sp.chargeT + sp.heelT)
    const coilV = power > 0 ? 3_000 * Math.sqrt(power / pRated) : 0
    points.push({
      min: t, phase, powerKW: power, energyKwh: energy, meltPct: Math.min(100, absorbed / meltNeedKwh * 100), bathC,
      hz: power > 0 ? Math.round(250 - 45 * liquidFrac) : 0,
      coilJouleKW: coilJoule, conductionKW: conduction, radiationKW: radiation, coilHeatKW: coilHeat, waterOutC: out, waterDT: dT, liningC: lining, lidOpen,
      tiltDeg: phase === 'tapping' ? 31 : 0,
      primary: { pMW: pGrid / 1_000, qMvar: pGrid / 1_000 * Math.tan(Math.acos(cosPhi)), cosPhi, kV: 33, amps: pGrid > 0 ? pGrid * 1_000 / (Math.sqrt(3) * 33_000 * cosPhi) : 0 },
      secondary: { coilV, coilKA: coilV > 0 ? power * 1_000 / (coilV * 0.12) / 1_000 : 0, dcKA: power * 1_000 / 1_800 / 1_000 },
      missingKwh: 0,
    })
    // Phase transitions.
    t += DT; phaseT += DT
    if (phase === 'charging' && phaseT >= CHARGE_MIN) { phase = 'melting'; phaseT = 0 }
    else if (phase === 'melting' && absorbed >= meltNeedKwh) { phase = 'superheat'; phaseT = 0 }
    else if (phase === 'superheat' && bathC >= sp.tapAimC) { phase = 'holding'; phaseT = 0 }
    else if (phase === 'holding') { holdLeft -= DT; if (holdLeft <= 0) { phase = 'tapping'; phaseT = 0 } }
    else if (phase === 'tapping') { tapLeft -= DT; if (tapLeft <= 0) break }
    if (phase === 'superheat' && power <= 0) break
  }
  const kwhTotal = energy
  for (const p of points) p.missingKwh = Math.max(0, kwhTotal - p.energyKwh)
  if (points.length && points[points.length - 1].min > 300) alarms.push({ min: points[points.length - 1].min, level: 'alarm', text: 'Heat did not finish in 5 hours: power set point too low for the losses' })
  return {
    points, alarms, totalMin: t, powerOnMin, kwh: kwhTotal, kwhPerT: kwhTotal / Math.max(1, tappedT), tappedT, yieldPct: yieldFor(sp.mix) * 100,
    costRM: kwhTotal / 1_000 * sp.electricityRMPerMWh, co2Kg: kwhTotal * sp.gridKgPerKWh, expectedKwh: kwhTotal,
  }
}

/** The point at a given minute of the heat (clamped). */
export const pointAt = (h: SimHeat, min: number) => h.points[Math.max(0, Math.min(h.points.length - 1, Math.round(min / DT)))]
