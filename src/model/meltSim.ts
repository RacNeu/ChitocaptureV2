/**
 * Decarbonisation simulator for the melt shop. Every lever works on the plant's own heats with the
 * learned (or published) factors from meltshop.ts; equipment levers use sourced values from
 * docs/induction-furnace-model.md and the planner's design estimates. Results are monthly, from the
 * uploaded period scaled to 30.4 days.
 */
import { CO2_PER_C, NG_KG_PER_GJ, learnCopper, period, scrapTypes, type Chem, type DriverId, type HeatView, type MeltModel, type MeltSettings, type ScrapType } from './meltshop'
import { mean, ols, quantile } from './regress'

export type Levers = {
  /** Cap on holding minutes per heat (null = as today). */
  holdCap: number | null
  lidCap: number | null
  /** Heats tapped above this are tapped at it. */
  tapCap: number | null
  /** Gas-preheat cold linings before the first heat (DOE: lining loss 95 → 58 kWh/short ton, −39%). */
  preheatLining: boolean
  /** Schedule heats at least this full (share of the furnace's largest charge). */
  minFill: number | null
  /** Scrap mix in % (null = each heat's own recipe). */
  mix: Record<ScrapType, number> | null
  /** Share of weekday-peak melting moved to off-peak (0–1). */
  shiftOffPeak: number
  solarMWp: number
  /** Share of remaining grid electricity bought as green (TNB GET or PPA), 0–1. */
  greenShare: number
  greenPremiumSen: number
  /** New IGBT power supplies (vendor claims 5–25%; the simulator uses the conservative 5%). */
  igbt: boolean
}

export const SOLAR_MWH_PER_MWP = 1_300   // planner: Malaysian average yield
export const SOLAR_RM_PER_MWP = 3_000_000
export const IGBT_SAVING = 0.05          // conservative end of vendor claims (docs §4)
export const PREHEAT_CUT = 0.39          // Missouri S&T/DOE: 95 → 58 kWh/short ton on the first heat

export function baseLevers(): Levers {
  return { holdCap: null, lidCap: null, tapCap: null, preheatLining: false, minFill: null, mix: null, shiftOffPeak: 0, solarMWp: 0, greenShare: 0, greenPremiumSen: 3, igbt: false }
}

export function currentMix(heats: HeatView[]): Record<ScrapType, number> {
  const withRecipe = heats.filter((h) => h.charge)
  return Object.fromEntries(scrapTypes.map((x) => [x.id, withRecipe.length ? mean(withRecipe.map((h) => h.shares[x.id])) * 100 : 0])) as Record<ScrapType, number>
}

/** Yield learned against scrap mix (shredded, turnings); null when there isn't enough data. */
function yieldModel(heats: HeatView[]) {
  const rows = heats.filter((h) => h.charge)
  if (rows.length < 30) return null
  const fit = ols(rows.map((h) => [h.shares.shredded, h.shares.turnings, h.shares.pigIron]), rows.map((h) => h.yieldPct))
  return fit ? { shredded: fit.beta[1], turnings: fit.beta[2], pigIron: fit.beta[3] } : null
}

export type Outcome = { ifKwhPerT: number; lfKwhPerT: number; solarKwhPerT: number; costPerT: number; elecRMPerT: number; scrapRMPerT: number; co2LocPerT: number; co2MktPerT: number; yieldPct: number; cuPct: number | null }
export type Step = { id: string; label: string; rmPerMonth: number; co2TPerMonth: number; basis: string }
export type SimResult = { base: Outcome; scen: Outcome; steps: Step[]; tPerMonth: number; capexRM: number; warnings: string[]; utilisation: number; peakDemandKW: number; cuLimit: number }

const factor = (m: MeltModel, id: DriverId) => m.factors.find((f) => f.id === id)!.coef

/** Highest melting demand (kW) seen in weekday peak hours, from overlapping power-on windows. */
function peakDemand(heats: HeatView[]): number {
  const bins = new Map<number, number>()
  for (const h of heats) for (let t = Math.ceil(h.startMin / 15) * 15; t < h.startMin + h.powerOnMin; t += 15) {
    const d = new Date(t * 60_000), dow = d.getUTCDay(), hr = d.getUTCHours()
    if (dow >= 1 && dow <= 5 && hr >= 14 && hr < 22) bins.set(t, (bins.get(t) ?? 0) + h.mw * 1_000)
  }
  return bins.size ? quantile([...bins.values()], 0.98) : 0
}

export function simulate(heats: HeatView[], model: MeltModel, s: MeltSettings, grid: number, chem: Chem[], lv: Levers): SimResult {
  const { tPerMonth, days } = period(heats)
  const cap = new Map<string, number>()
  for (const h of heats) cap.set(h.furnace, Math.max(cap.get(h.furnace) ?? 0, h.chargeT))
  const mixNow = currentMix(heats)
  const ym = yieldModel(heats)
  const cu = learnCopper(heats, chem)
  const peakPrice = s.peakSenPerKWh / 100, offPrice = s.offPeakSenPerKWh / 100
  const scrapAvg = (mix: Record<ScrapType, number>) => scrapTypes.reduce((a, x) => a + mix[x.id] / 100 * s.scrapRMPerT[x.id], 0)
  const peakKW = peakDemand(heats)
  const powerOnMin = heats.reduce((a, h) => a + h.powerOnMin, 0)
  const supplies = Math.max(1, Math.ceil(new Set(heats.map((h) => h.furnace)).size / 2))
  const utilisation = powerOnMin / (days * 1_440 * supplies)

  const run = (L: Levers): Outcome => {
    let ifKwh = 0, lfKwh = 0, peakKwh = 0, t = 0, s1 = 0, yieldW = 0
    const mix = L.mix ?? mixNow
    for (const h of heats) {
      let d = 0
      if (L.holdCap !== null && h.holdMin !== undefined) d += factor(model, 'holdMin') * (Math.min(h.holdMin, L.holdCap) - h.holdMin)
      if (L.lidCap !== null && h.lidOpenMin !== undefined) d += factor(model, 'lidOpenMin') * (Math.min(h.lidOpenMin, L.lidCap) - h.lidOpenMin)
      if (L.tapCap !== null && h.tapTempC !== undefined) d += factor(model, 'tapTempC') * (Math.min(h.tapTempC, L.tapCap) - h.tapTempC)
      if (L.preheatLining && h.coldLining) d -= factor(model, 'coldLining') * PREHEAT_CUT
      if (L.minFill !== null) d += factor(model, 'fill') * (Math.max(h.fill, L.minFill) - h.fill)
      if (L.mix && h.charge) d += factor(model, 'shredded') * (mix.shredded / 100 - h.shares.shredded) + factor(model, 'turnings') * (mix.turnings / 100 - h.shares.turnings)
      const k = Math.max(389, h.kwhPerT + d) * (L.igbt ? 1 - IGBT_SAVING : 1)
      ifKwh += k * h.tappedT
      lfKwh += (h.lf?.kwh ?? 0)
      peakKwh += k * h.tappedT * h.peakShare * (1 - L.shiftOffPeak)
      t += h.tappedT
      s1 += ((h.lf?.electrodeKg ?? 0) * s.electrodeCarbon + (h.lf?.alloyCarbonKg ?? 0)) * CO2_PER_C + (h.lf?.preheatGJ ?? 0) * NG_KG_PER_GJ
      let y = h.yieldPct
      if (L.mix && h.charge && ym) y += ym.shredded * (mix.shredded / 100 - h.shares.shredded) + ym.turnings * (mix.turnings / 100 - h.shares.turnings) + ym.pigIron * (mix.pigIron / 100 - h.shares.pigIron)
      yieldW += y * h.tappedT
    }
    const solarKwh = L.solarMWp * SOLAR_MWH_PER_MWP * 1_000 / 365 * days
    const gridKwh = Math.max(0, ifKwh + lfKwh - solarKwh)
    // Solar displaces mostly off-peak daytime (08:00–14:00) and some peak energy; priced at the off-peak rate (conservative).
    const energyRM = peakKwh * peakPrice + (ifKwh + lfKwh - peakKwh) * offPrice - solarKwh * offPrice + gridKwh * L.greenShare * L.greenPremiumSen / 100
    const mdRM = peakKW * L.shiftOffPeak * s.demandRMPerKW * days / 30.4
    const yieldPct = yieldW / t
    const scrapRM = scrapAvg(mix) / (yieldPct / 100) * t
    const loc = gridKwh * grid + s1
    return {
      ifKwhPerT: ifKwh / t, lfKwhPerT: lfKwh / t, solarKwhPerT: solarKwh / t,
      elecRMPerT: (energyRM - mdRM) / t, scrapRMPerT: scrapRM / t, costPerT: (energyRM - mdRM + scrapRM) / t,
      co2LocPerT: loc / t, co2MktPerT: (loc - gridKwh * L.greenShare * grid) / t, yieldPct,
      cuPct: cu ? scrapTypes.reduce((a, x) => a + (cu[x.id] ?? 0) * mix[x.id] / 100, 0) : null,
    }
  }

  const base = run(baseLevers())
  const scen = run(lv)
  const b0 = baseLevers()
  const one = (id: string, label: string, patch: Partial<Levers>, basis: string): Step | null => {
    const o = run({ ...b0, ...patch })
    const rm = (base.costPerT - o.costPerT) * tPerMonth, co2 = (base.co2MktPerT - o.co2MktPerT) * tPerMonth / 1_000
    return Math.abs(rm) < 1 && Math.abs(co2) < 0.01 ? null : { id, label, rmPerMonth: rm, co2TPerMonth: co2, basis }
  }
  const steps = [
    one('hold', 'Less holding', { holdCap: lv.holdCap }, 'learned'),
    one('lid', 'Lid discipline', { lidCap: lv.lidCap }, 'learned'),
    one('tap', 'Tap temperature', { tapCap: lv.tapCap }, 'learned'),
    one('preheat', 'Preheat cold linings', { preheatLining: lv.preheatLining }, 'DOE trial'),
    one('fill', 'Full heats only', { minFill: lv.minFill }, 'learned'),
    one('mix', 'Scrap mix', { mix: lv.mix }, 'learned'),
    one('shift', 'Melt off-peak', { shiftOffPeak: lv.shiftOffPeak }, 'TNB tariff'),
    one('solar', `Solar ${lv.solarMWp} MWp`, { solarMWp: lv.solarMWp }, 'design estimate'),
    one('green', `Green electricity ${Math.round(lv.greenShare * 100)}%`, { greenShare: lv.greenShare, greenPremiumSen: lv.greenPremiumSen }, 'assumption'),
    one('igbt', 'IGBT power supplies', { igbt: lv.igbt }, 'vendor claim (5% used)'),
  ].filter((x): x is Step => x !== null)

  const warnings: string[] = []
  if (lv.shiftOffPeak > 0 && utilisation > 0.75) warnings.push(`Power supplies are already on ${Math.round(utilisation * 100)}% of the time: moving melting out of peak hours needs spare off-peak capacity, or output falls.`)
  const cuLimit = 0.8
  if (scen.cuPct !== null && scen.cuPct > cuLimit * 0.85) warnings.push(`Predicted copper ${scen.cuPct.toFixed(3)}% is close to the ${cuLimit}% limit: risk of off-grade heats.`)
  if (lv.mix && Math.abs(Object.values(lv.mix).reduce((a, b) => a + b, 0) - 100) > 0.5) warnings.push('Scrap mix does not add up to 100%.')
  if (lv.igbt) warnings.push('IGBT saving uses the conservative 5%; vendors claim 5–25%. Get a supplier quote for capex.')
  return { base, scen, steps, tPerMonth, capexRM: lv.solarMWp * SOLAR_RM_PER_MWP, warnings, utilisation, peakDemandKW: peakKW, cuLimit }
}
