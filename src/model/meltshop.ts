/**
 * Melt shop model: coreless induction furnaces (IF) → ladle furnace (LF), the route of Masteel-type
 * Malaysian long-steel mills. Every factor is either learned from the plant's own heats (with a 90%
 * range) or taken from docs/induction-furnace-model.md, where each value carries its source and
 * confidence. Prices are the plant's inputs, tagged as assumptions until replaced.
 */
import { invert, mean, ols, quantile, Z90 } from './regress'

/* ---------------- Data ---------------- */

export type ScrapType = 'hms' | 'shredded' | 'turnings' | 'pigIron' | 'returns' | 'dri'
export const scrapTypes: { id: ScrapType; label: string; short: string }[] = [
  { id: 'hms', label: 'Heavy melting scrap', short: 'HMS' },
  { id: 'shredded', label: 'Shredded', short: 'Shred' },
  { id: 'turnings', label: 'Turnings & light', short: 'Turn' },
  { id: 'pigIron', label: 'Pig iron', short: 'Pig' },
  { id: 'returns', label: 'Own returns', short: 'Ret' },
  { id: 'dri', label: 'DRI / HBI', short: 'DRI' },
]

export type LfTreatment = {
  kwh: number
  minutes?: number
  electrodeKg?: number
  limeKg?: number
  alloyKg?: number
  /** Carbon in ferroalloys and carburiser added (kg C), from supplier certificates. */
  alloyCarbonKg?: number
  tempInC?: number
  tempOutC?: number
  /** Gas burned preheating the ladle for this heat (GJ). */
  preheatGJ?: number
}

export type MeltHeat = {
  furnace: string
  heat: string
  /** Tap time, local Malaysian time, 'YYYY-MM-DD HH:mm'. */
  at: string
  grade?: string
  powerOnMin: number
  tapToTapMin: number
  /** Minutes holding liquid steel at temperature before tapping (waiting for LF/caster or chemistry). */
  holdMin?: number
  lidOpenMin?: number
  kwh: number
  chargeT: number
  tappedT: number
  heelT?: number
  tapTempC?: number
  /** First heat after a stop or a new lining (lining starts cold). */
  coldLining?: boolean
  liningHeat?: number
  charge?: Partial<Record<ScrapType, number>>
  lf?: LfTreatment
}

export type ChemKey = 'C' | 'Mn' | 'Si' | 'S' | 'P' | 'Cu' | 'Cr' | 'Ni' | 'Mo' | 'V' | 'Sn' | 'N'
export const chemKeys: ChemKey[] = ['C', 'Mn', 'Si', 'S', 'P', 'Cu', 'Cr', 'Ni', 'Mo', 'V', 'Sn', 'N']
export type Chem = { heat: string } & Partial<Record<ChemKey, number>>

export type Reading = { at: string; furnace: string; kw: number; bathC?: number; waterInC?: number; waterOutC?: number; flowM3h?: number; hz?: number }

export type MeltShop = { heats: MeltHeat[]; chem: Chem[]; readings: Reading[]; source: string; demo?: boolean }

export type MeltSettings = {
  tapTargetC: number
  electrodeRMPerKg: number
  electrodeCarbon: number
  scrapRMPerT: Record<ScrapType, number>
  /** Energy charge (sen/kWh) in peak and off-peak hours, and the peak demand charge (RM/kW·month). */
  peakSenPerKWh: number
  offPeakSenPerKWh: number
  demandRMPerKW: number
  grade: string
}

/** Starting values (assumptions until the plant enters its own): TNB HV ToU per docs §8; scrap prices indicative. */
export const defaultMelt: MeltSettings = {
  tapTargetC: 1_620, electrodeRMPerKg: 22, electrodeCarbon: 0.99,
  scrapRMPerT: { hms: 1_550, shredded: 1_700, turnings: 1_300, pigIron: 2_100, returns: 1_500, dri: 1_900 },
  peakSenPerKWh: 44.52, offPeakSenPerKWh: 40.43, demandRMPerKW: 21.76 + 23.06, grade: 'B500B',
}

/** BS 4449:2005 cast analysis maxima (basis of MS 146 rebar), docs §7 (⚠ confirm against the standard). */
export const gradeLimits: Record<string, Partial<Record<ChemKey | 'CEV', number>>> = {
  B500B: { C: 0.22, S: 0.05, P: 0.05, N: 0.012, Cu: 0.8, CEV: 0.5 },
  B500A: { C: 0.22, S: 0.05, P: 0.05, N: 0.012, Cu: 0.8, CEV: 0.5 },
  B500C: { C: 0.22, S: 0.05, P: 0.05, N: 0.012, Cu: 0.8, CEV: 0.5 },
}

/** IIW carbon equivalent used by BS 4449. */
export const cev = (c: Chem) => (c.C ?? 0) + (c.Mn ?? 0) / 6 + ((c.Cr ?? 0) + (c.Mo ?? 0) + (c.V ?? 0)) / 5 + ((c.Ni ?? 0) + (c.Cu ?? 0)) / 15

/* ---------------- Time helpers (Malaysian local time, no time-zone drift) ---------------- */

/** Minutes since epoch for a local 'YYYY-MM-DD HH:mm' string, treated as a fixed clock. */
export function minutesOf(at: string): number {
  const m = at.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60_000
}
export function stamp(min: number): string {
  const d = new Date(min * 60_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}
/** TNB ToU peak: Monday–Friday 14:00–22:00 (docs §8). */
export function isPeak(min: number): boolean {
  const d = new Date(min * 60_000)
  const dow = d.getUTCDay(), h = d.getUTCHours()
  return dow >= 1 && dow <= 5 && h >= 14 && h < 22
}
/** Share of a time window that falls in TNB peak hours. */
export function peakShare(startMin: number, endMin: number): number {
  if (!(endMin > startMin)) return 0
  let peak = 0
  for (let t = startMin; t < endMin; t += 5) if (isPeak(t)) peak += Math.min(5, endMin - t)
  return peak / (endMin - startMin)
}

/* ---------------- Per-heat values ---------------- */

export const CO2_PER_C = 44 / 12
export const NG_KG_PER_GJ = 56.1
/** Physics, docs §1 and §9: liquid steel at ~1,600 °C holds ~389 kWh/t; a heat below this is a data error. */
export const LIQUID_STEEL_KWH_T = 389

export type HeatView = MeltHeat & {
  startMin: number; tapMin: number
  kwhPerT: number; lfKwhPerT: number; totalKwhPerT: number
  yieldPct: number; superheatC: number | null; mw: number; tph: number
  peakShare: number; fill: number
  shares: Record<ScrapType, number>
  scope1KgPerT: number; scope2KgPerT: number
  electrodePerT: number | null
  flags: string[]
}

export function deriveHeats(heats: MeltHeat[], s: MeltSettings, grid: number): HeatView[] {
  const cap = new Map<string, number>()
  for (const h of heats) cap.set(h.furnace, Math.max(cap.get(h.furnace) ?? 0, h.chargeT))
  return heats.map((h) => {
    const t = h.tappedT
    const tapMin = minutesOf(h.at), startMin = tapMin - h.tapToTapMin
    const lfKwh = h.lf?.kwh ?? 0
    const chargeTotal = scrapTypes.reduce((a, x) => a + (h.charge?.[x.id] ?? 0), 0)
    const shares = Object.fromEntries(scrapTypes.map((x) => [x.id, chargeTotal > 0 ? (h.charge?.[x.id] ?? 0) / chargeTotal : 0])) as Record<ScrapType, number>
    const carbonKg = (h.lf?.electrodeKg ?? 0) * s.electrodeCarbon + (h.lf?.alloyCarbonKg ?? 0)
    const flags: string[] = []
    if (h.kwh / t < LIQUID_STEEL_KWH_T) flags.push(`${Math.round(h.kwh / t)} kWh/t is below the ${LIQUID_STEEL_KWH_T} kWh/t physics minimum: check the meter or weights`)
    if (t > h.chargeT + (h.heelT ?? 0) + 0.5) flags.push('Tapped more than charged: check the weights')
    return {
      ...h, startMin, tapMin,
      kwhPerT: h.kwh / t, lfKwhPerT: lfKwh / t, totalKwhPerT: (h.kwh + lfKwh) / t,
      yieldPct: t / h.chargeT * 100,
      superheatC: h.tapTempC !== undefined ? h.tapTempC - s.tapTargetC : null,
      mw: h.kwh / 1_000 / (h.powerOnMin / 60), tph: t / (h.tapToTapMin / 60),
      peakShare: peakShare(startMin, startMin + h.powerOnMin),
      fill: h.chargeT / (cap.get(h.furnace) || h.chargeT),
      shares,
      scope1KgPerT: (carbonKg * CO2_PER_C + (h.lf?.preheatGJ ?? 0) * NG_KG_PER_GJ) / t,
      scope2KgPerT: (h.kwh + lfKwh) * grid / t,
      electrodePerT: h.lf?.electrodeKg !== undefined ? h.lf.electrodeKg / t : null,
      flags,
    }
  })
}

/* ---------------- Learned factors (kWh/t of the induction furnace) ---------------- */

export type DriverId = 'holdMin' | 'lidOpenMin' | 'tapTempC' | 'coldLining' | 'shredded' | 'turnings' | 'fill'
export type Prior = { label: string; unit: string; low: number; high: number; mid: number; confidence: 'verified' | 'rough' | 'none'; note: string }

/** Published effect on kWh/t per unit of each driver (docs §2–§3). */
export const priors: Record<DriverId, Prior> = {
  holdMin: { label: 'Holding time', unit: 'min', low: 0.15, high: 0.5, mid: 0.3, confidence: 'rough', note: 'Otto Junker: ~275 kW thermal loss on a 15 t furnace with lid closed ≈ 0.3 kWh/t per minute' },
  lidOpenMin: { label: 'Lid open', unit: 'min', low: 0.3, high: 0.9, mid: 0.6, confidence: 'rough', note: 'Otto Junker: 20 min lid open ≈ +15 kWh/t; physics ≈ 280 kW/m² radiated (docs §9)' },
  tapTempC: { label: 'Tap temperature', unit: '°C', low: 0.23, high: 0.6, mid: 0.4, confidence: 'verified', note: '0.23 kWh/t per °C into the steel (CTC-N); ~0.4 from the grid (Otto Junker: 20 kWh/t per 50 K)' },
  coldLining: { label: 'Cold-lining heat', unit: 'heat', low: 60, high: 115, mid: 100, confidence: 'verified', note: 'Missouri S&T/DOE: lining heat-up 95 kWh/short ton (~105 kWh/t); 58 when gas-preheated' },
  shredded: { label: 'Shredded share', unit: '× 100%', low: -25, high: 0, mid: -15, confidence: 'rough', note: 'Denser charge melts faster: BEE 15–20 kWh/t; Otto Junker 25 kWh/t for 2.0 vs 1.3 t/m³' },
  turnings: { label: 'Turnings & light share', unit: '× 100%', low: 0, high: 55, mid: 30, confidence: 'rough', note: 'Light, rusty charge: Otto Junker +25 kWh/t (density) and +30 kWh/t (rust)' },
  fill: { label: 'Furnace fill', unit: '× 100%', low: -120, high: 0, mid: -60, confidence: 'none', note: 'Part-full heats lose the same heat per hour over fewer tonnes (Missouri S&T: schedule full heats). Learn from your heats' },
}
const driverIds = Object.keys(priors) as DriverId[]

export function driverValue(h: HeatView, id: DriverId): number | undefined {
  switch (id) {
    case 'holdMin': return h.holdMin
    case 'lidOpenMin': return h.lidOpenMin
    case 'tapTempC': return h.tapTempC
    case 'coldLining': return h.coldLining === undefined ? undefined : h.coldLining ? 1 : 0
    case 'shredded': return h.charge ? h.shares.shredded : undefined
    case 'turnings': return h.charge ? h.shares.turnings : undefined
    case 'fill': return h.fill
  }
}

export type Factor = { id: DriverId; coef: number; low: number; high: number; used: boolean; status: 'learned' | 'published' | 'check'; message: string }
export type MeltModel = { factors: Factor[]; ids: DriverId[]; intercept: number; cov: number[][]; r2: number; residualSd: number; n: number; enough: boolean }
export const MIN_HEATS = 30

export function learnFactors(heats: HeatView[]): MeltModel {
  const usable = driverIds.filter((id) => {
    const v = heats.map((h) => driverValue(h, id)).filter((x): x is number => x !== undefined)
    // Varies enough to learn from: at least 10 heats away from the typical value (so rare yes/no events count).
    const mid = quantile(v, 0.5)
    return v.length >= heats.length * 0.8 && v.filter((x) => Math.abs(x - mid) > 1e-9).length >= 10
  })
  const rows = heats.filter((h) => !h.flags.length && usable.every((id) => driverValue(h, id) !== undefined))
  const published = (msg: string): Factor[] => driverIds.map((id) => ({ id, coef: priors[id].mid, low: priors[id].low, high: priors[id].high, used: false, status: 'published', message: msg }))
  const fit = rows.length >= Math.max(MIN_HEATS, 5 * (usable.length + 1)) && usable.length ? ols(rows.map((h) => usable.map((id) => driverValue(h, id)!)), rows.map((h) => h.kwhPerT)) : null
  if (!fit) return { factors: published(rows.length < MIN_HEATS ? `Only ${rows.length} usable heats: published value` : 'Not enough variation: published value'), ids: [], intercept: mean(rows.map((h) => h.kwhPerT)), cov: [], r2: 0, residualSd: 0, n: rows.length, enough: false }
  const factors = driverIds.map((id): Factor => {
    const j = usable.indexOf(id)
    const p = priors[id]
    if (j < 0) return { id, coef: p.mid, low: p.low, high: p.high, used: false, status: 'published', message: 'Not logged or not varying: published value' }
    const coef = fit.beta[j + 1], se = fit.se[j + 1]
    const low = coef - Z90 * se, high = coef + Z90 * se
    const wrongSign = (p.mid < 0 && low > 0) || (p.mid > 0 && high < 0)
    const span = Math.max(Math.abs(p.low), Math.abs(p.high))
    const outside = p.confidence !== 'none' && (low > p.high + span || high < p.low - span)
    return { id, coef, low, high, used: true, status: wrongSign || outside ? 'check' : 'learned', message: wrongSign ? 'Opposite to physics: check this measurement' : outside ? 'Far outside the published range: check the data' : `Learned from ${fit.n} heats` }
  })
  return { factors, ids: usable, intercept: fit.beta[0], cov: fit.cov, r2: fit.r2, residualSd: fit.residualSd, n: fit.n, enough: true }
}

export type Setting = Partial<Record<DriverId, number>>

/** Average induction-furnace kWh/t at these settings, with a 90% range. */
export function predictKwh(model: MeltModel, x: Setting, base: HeatView[]): { kwhPerT: number; low: number; high: number } {
  const avg = (id: DriverId) => mean(base.map((h) => driverValue(h, id)).filter((v): v is number => v !== undefined))
  if (!model.enough) {
    const k = mean(base.map((h) => h.kwhPerT)) + model.factors.reduce((a, f) => a + f.coef * ((x[f.id] ?? avg(f.id)) - avg(f.id)), 0)
    return { kwhPerT: k, low: k, high: k }
  }
  const row = [1, ...model.ids.map((id) => x[id] ?? avg(id))]
  const coefs = [model.intercept, ...model.ids.map((id) => model.factors.find((f) => f.id === id)!.coef)]
  const k = row.reduce((a, v, j) => a + v * coefs[j], 0)
  const v = row.reduce((a, vi, i) => a + row.reduce((b, vj, j) => b + vi * model.cov[i][j] * vj, 0), 0)
  const half = Z90 * Math.sqrt(Math.max(0, v))
  return { kwhPerT: k, low: k - half, high: k + half }
}

/* ---------------- Summary, losses vs the plant's own best heats ---------------- */

export function period(heats: HeatView[]) {
  const first = Math.min(...heats.map((h) => h.startMin)), last = Math.max(...heats.map((h) => h.tapMin))
  const days = Math.max(1, (last - first) / 1_440)
  const tonnes = heats.reduce((a, h) => a + h.tappedT, 0)
  return { days, tonnes, tPerMonth: tonnes / days * 30.4, from: stamp(first), to: stamp(last) }
}

export type Loss = { id: string; label: string; detail: string; rmPerMonth: number; low: number; high: number; co2TPerMonth: number; basis: 'learned' | 'published' | 'measured' }

export function meltLosses(heats: HeatView[], model: MeltModel, s: MeltSettings, grid: number): Loss[] {
  if (!heats.length) return []
  const { tPerMonth } = period(heats)
  const price = (s.peakSenPerKWh + s.offPeakSenPerKWh) / 2 / 100
  const f = (id: DriverId) => model.factors.find((x) => x.id === id)!
  const out: Loss[] = []
  const add = (id: string, label: string, detail: string, perT: number, factor: Factor) => {
    if (!(perT > 0) || factor.coef === 0) return
    const lo = Math.min(factor.low, factor.high) / factor.coef * perT, hi = Math.max(factor.low, factor.high) / factor.coef * perT
    out.push({ id, label, detail, rmPerMonth: perT * price * tPerMonth, low: Math.max(0, lo) * price * tPerMonth, high: Math.max(0, hi) * price * tPerMonth, co2TPerMonth: perT * grid * tPerMonth / 1_000, basis: factor.used && factor.status === 'learned' ? 'learned' : 'published' })
  }
  const col = (g: (h: HeatView) => number | undefined | null) => heats.map(g).filter((v): v is number => v !== undefined && v !== null)
  const hold = col((h) => h.holdMin)
  if (hold.length) { const best = quantile(hold, 0.25), ex = mean(hold.map((v) => Math.max(0, v - best))); add('holding', 'Holding liquid steel', `${ex.toFixed(0)} min/heat above your best quarter (${best.toFixed(0)} min)`, ex * f('holdMin').coef, f('holdMin')) }
  const lid = col((h) => h.lidOpenMin)
  if (lid.length) { const best = quantile(lid, 0.25), ex = mean(lid.map((v) => Math.max(0, v - best))); add('lid', 'Lid left open', `${ex.toFixed(1)} min/heat above your best quarter (${best.toFixed(0)} min)`, ex * f('lidOpenMin').coef, f('lidOpenMin')) }
  const temp = col((h) => h.tapTempC)
  if (temp.length) { const ex = mean(temp.map((v) => Math.max(0, v - s.tapTargetC))); add('superheat', 'Tapping too hot', `${ex.toFixed(0)} °C average above the ${s.tapTargetC} °C target`, ex * f('tapTempC').coef, f('tapTempC')) }
  const cold = heats.filter((h) => h.coldLining).length / heats.length
  if (cold > 0) add('cold', 'Cold-lining heats', `${(cold * 100).toFixed(0)}% of heats start on a cold lining; gas-preheating halves the penalty (DOE)`, cold * f('coldLining').coef * 0.45, f('coldLining'))
  // Melting in TNB peak hours: energy price gap, plus demand charge on peak kW.
  const kwh = heats.reduce((a, h) => a + h.kwh, 0), peakKwh = heats.reduce((a, h) => a + h.kwh * h.peakShare, 0)
  const gapRM = peakKwh * (s.peakSenPerKWh - s.offPeakSenPerKWh) / 100 / period(heats).days * 30.4
  if (gapRM > 0) out.push({ id: 'peak', label: 'Melting in peak hours', detail: `${(peakKwh / kwh * 100).toFixed(0)}% of melting energy falls in TNB peak (Mon–Fri 14:00–22:00)`, rmPerMonth: gapRM, low: gapRM * 0.5, high: gapRM, co2TPerMonth: 0, basis: 'measured' })
  const y = heats.map((h) => h.yieldPct / 100), yBest = quantile(y, 0.75), yAvg = mean(y)
  if (yBest > yAvg) {
    const extra = 1 / yAvg - 1 / yBest, rm = extra * mean(Object.values(s.scrapRMPerT)) * tPerMonth
    out.push({ id: 'yield', label: 'Metal yield', detail: `${(yAvg * 100).toFixed(1)}% average vs ${(yBest * 100).toFixed(1)}% in your best quarter: ${(extra * 1_000).toFixed(0)} kg more scrap per tonne`, rmPerMonth: rm, low: rm * 0.8, high: rm, co2TPerMonth: extra * mean(heats.map((h) => h.kwhPerT)) * grid * tPerMonth / 1_000, basis: 'measured' })
  }
  const lf = col((h) => h.lf ? h.lfKwhPerT : null)
  if (lf.length) { const ex = mean(lf) - quantile(lf, 0.25); if (ex > 0) out.push({ id: 'lf', label: 'Ladle furnace energy', detail: `${ex.toFixed(0)} kWh/t above your best quarter (${quantile(lf, 0.25).toFixed(0)} kWh/t; benchmark 33–70)`, rmPerMonth: ex * price * tPerMonth, low: ex * price * tPerMonth * 0.7, high: ex * price * tPerMonth, co2TPerMonth: ex * grid * tPerMonth / 1_000, basis: 'measured' }) }
  return out.sort((a, b) => b.rmPerMonth - a.rmPerMonth)
}

/* ---------------- Chemistry ---------------- */

export type ChemCheck = { heat: string; grade: string; fails: { key: string; value: number; limit: number }[]; cev: number }

export function checkChem(chem: Chem[], heats: MeltHeat[], fallbackGrade: string): ChemCheck[] {
  const gradeOf = new Map(heats.map((h) => [h.heat, h.grade ?? fallbackGrade]))
  return chem.map((c) => {
    const grade = gradeOf.get(c.heat) ?? fallbackGrade
    const lim = gradeLimits[grade] ?? gradeLimits.B500B
    const e = cev(c)
    const fails = Object.entries(lim).flatMap(([k, limit]) => { const v = k === 'CEV' ? e : c[k as ChemKey]; return v !== undefined && limit !== undefined && v > limit ? [{ key: k, value: v, limit }] : [] })
    return { heat: c.heat, grade, fails, cev: e }
  })
}

/** Copper each scrap type brings, learned from heats with both a recipe and a spectrometer result (no intercept, clamped ≥ 0). */
export function learnCopper(heats: HeatView[], chem: Chem[]): Partial<Record<ScrapType, number>> | null {
  const cu = new Map(chem.filter((c) => c.Cu !== undefined).map((c) => [c.heat, c.Cu!]))
  const rows = heats.filter((h) => h.charge && cu.has(h.heat))
  const types = scrapTypes.map((x) => x.id).filter((id) => rows.some((h) => h.shares[id] > 0.02))
  if (rows.length < 30 || types.length < 2) return null
  // Least squares without intercept: shares sum to 1, so each coefficient is that scrap's own copper.
  const X = rows.map((h) => types.map((id) => h.shares[id]))
  const k = types.length
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((a, r) => a + r[i] * r[j], 0)))
  const xty = Array.from({ length: k }, (_, i) => X.reduce((a, r, n) => a + r[i] * cu.get(rows[n].heat)!, 0))
  const inv = invert(xtx)
  if (!inv) return null
  const beta = inv.map((row) => row.reduce((a, v, j) => a + v * xty[j], 0))
  return Object.fromEntries(types.map((id, i) => [id, Math.max(0, beta[i])]))
}

/* ---------------- Live readings: anomalies ---------------- */

export type Anomaly = { at: string; furnace: string; signal: 'waterDT' | 'flowM3h'; value: number; normalLow: number; normalHigh: number; kind: 'spike' | 'drop' | 'drift' }

/** Coil cooling-water heat (kW) = flow × 4.18 kJ/kg·K × ΔT (docs §9). */
export const coilLossKW = (r: Reading) => r.flowM3h !== undefined && r.waterInC !== undefined && r.waterOutC !== undefined ? r.flowM3h * 1_000 / 3_600 * 4.18 * (r.waterOutC - r.waterInC) : null

/**
 * Flags a signal that leaves its own recent normal band (median ± 4 robust σ over the previous 60
 * readings in the same state, melting or idle) by more than a minimum amount, for 3 readings in a
 * row, so one noisy sample or the normal jump when power comes on never alarms.
 * No fixed OEM limits: the furnace's own history sets "normal".
 */
export function findAnomalies(readings: Reading[]): Anomaly[] {
  const out: Anomaly[] = []
  const byF = new Map<string, Reading[]>()
  for (const r of readings) byF.set(r.furnace, [...(byF.get(r.furnace) ?? []), r])
  const signals: { id: Anomaly['signal']; floor: number; get: (r: Reading) => number | undefined }[] = [
    { id: 'waterDT', floor: 1.5, get: (r) => r.waterOutC !== undefined && r.waterInC !== undefined ? r.waterOutC - r.waterInC : undefined },
    { id: 'flowM3h', floor: 25, get: (r) => r.flowM3h },
  ]
  for (const [furnace, rs] of byF) {
    const maxKw = Math.max(...rs.map((r) => r.kw))
    const on = rs.map((r) => r.kw > 0.3 * maxKw)
    for (const sig of signals) {
      const vals = rs.map(sig.get)
      let lastFlag = -99, run = 0
      for (let i = 63; i < rs.length; i += 1) {
        const v = vals[i]
        if (v === undefined || on[i] !== on[i - 1]) { run = 0; continue }
        // Normal band from earlier readings in the same state, excluding the current run so a growing fault doesn't widen its own band.
        const win: number[] = []
        for (let j = i - 4; j >= 0 && win.length < 60; j -= 1) { const x = vals[j]; if (x !== undefined && on[j] === on[i]) win.push(x) }
        if (win.length < 20) continue
        const med = quantile(win, 0.5), mad = quantile(win.map((x) => Math.abs(x - med)), 0.5)
        const half = Math.max(4 * 1.4826 * mad, sig.floor)
        const lo = med - half, hi = med + half
        run = v > hi || v < lo ? run + 1 : 0
        if (run >= 3 && i - lastFlag > 30) {
          out.push({ at: rs[i].at, furnace, signal: sig.id, value: v, normalLow: lo, normalHigh: hi, kind: v > hi ? 'spike' : 'drop' })
          lastFlag = i
        }
      }
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/* ---------------- Import ---------------- */

type Col = { re: RegExp; set: (rec: Record<string, unknown>, raw: string) => void }
const num = (raw: string) => { const v = Number(raw.replace(/,/g, '')); return Number.isFinite(v) ? v : undefined }
const put = (path: string, scale = 1): Col['set'] => (rec, raw) => {
  const v = num(raw); if (v === undefined) return
  const [a, b] = path.split('.')
  if (b) { rec[a] = { ...(rec[a] as object ?? {}), [b]: v * scale } } else rec[a] = v * scale
}
const heatCols: Col[] = [
  { re: /^(furnace|if|furnace_?id|unit)$/, set: (r, v) => { if (v) r.furnace = v } },
  { re: /^(heat|heat_?no|heat_?nr|heat_?number)$/, set: (r, v) => { if (v) r.heat = v } },
  { re: /^(date|datetime|tap_?time|timestamp|at)$/, set: (r, v) => { const m = minutesOf(v.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1')); if (Number.isFinite(m)) r.at = stamp(m) } },
  { re: /^(grade|steel_?grade)$/, set: (r, v) => { if (v) r.grade = v } },
  { re: /^(power_?on|pon)(_?time)?(_?min)?$/, set: put('powerOnMin') },
  { re: /^(tap_?to_?tap|ttt)(_?min)?$/, set: put('tapToTapMin') },
  { re: /^(hold|holding)(_?time)?(_?min)?$/, set: put('holdMin') },
  { re: /^lid_?open(_?min)?$/, set: put('lidOpenMin') },
  { re: /^(kwh|if_?kwh|energy_?kwh)$/, set: put('kwh') },
  { re: /^(mwh|if_?mwh)$/, set: put('kwh', 1_000) },
  { re: /^(charge|charge_?t|total_?charge(_?t)?)$/, set: put('chargeT') },
  { re: /^(tapped|tapped_?t|tap_?weight(_?t)?)$/, set: put('tappedT') },
  { re: /^(heel|heel_?t)$/, set: put('heelT') },
  { re: /^(tap_?temp(erature)?|tap_?temp_?c)$/, set: put('tapTempC') },
  { re: /^(cold_?lining|cold_?start|first_?heat)$/, set: (r, v) => { r.coldLining = /^(1|y|yes|true)$/i.test(v) } },
  { re: /^lining_?heat(_?no)?$/, set: put('liningHeat') },
  ...scrapTypes.map((x): Col => ({ re: new RegExp(`^${x.id === 'pigIron' ? 'pig_?iron' : x.id}(_?t)?$`), set: put(`charge.${x.id}`) })),
  { re: /^lf_?kwh$/, set: put('lf.kwh') },
  { re: /^lf_?min(utes)?$/, set: put('lf.minutes') },
  { re: /^(lf_?)?electrode(s)?(_?kg)?$/, set: put('lf.electrodeKg') },
  { re: /^(lf_?)?lime(_?kg)?$/, set: put('lf.limeKg') },
  { re: /^(lf_?)?alloys?(_?kg)?$/, set: put('lf.alloyKg') },
  { re: /^(lf_?)?alloy_?carbon(_?kg)?$/, set: put('lf.alloyCarbonKg') },
  { re: /^lf_?temp_?in(_?c)?$/, set: put('lf.tempInC') },
  { re: /^lf_?temp_?out(_?c)?$/, set: put('lf.tempOutC') },
  { re: /^(ladle_?)?preheat(_?gj)?$/, set: put('lf.preheatGJ') },
]
const chemCols: Col[] = [{ re: /^(heat|heat_?no|heat_?nr|heat_?number)$/, set: (r, v) => { if (v) r.heat = v } }, ...chemKeys.map((k): Col => ({ re: new RegExp(`^${k.toLowerCase()}(_?pct|_?%)?$`), set: put(k) }))]
const readingCols: Col[] = [
  { re: /^(timestamp|time|datetime|at)$/, set: (r, v) => { const m = minutesOf(v); if (Number.isFinite(m)) r.at = stamp(m) } },
  { re: /^(furnace|if|unit)$/, set: (r, v) => { if (v) r.furnace = v } },
  { re: /^(kw|power_?kw)$/, set: put('kw') },
  { re: /^(mw|power_?mw)$/, set: put('kw', 1_000) },
  { re: /^(bath_?temp|bath)(_?c)?$/, set: put('bathC') },
  { re: /^water_?in(_?c)?$/, set: put('waterInC') },
  { re: /^water_?out(_?c)?$/, set: put('waterOutC') },
  { re: /^(flow|water_?flow)(_?m3h)?$/, set: put('flowM3h') },
  { re: /^(hz|frequency)(_?hz)?$/, set: put('hz') },
]

export type MeltImport = { kind: 'heats' | 'chem' | 'readings'; heats: MeltHeat[]; chem: Chem[]; readings: Reading[]; warnings: string[]; error?: string }

export function importMeltRows(rows: string[][]): MeltImport {
  const empty: MeltImport = { kind: 'heats', heats: [], chem: [], readings: [], warnings: [] }
  const data = rows.filter((r) => r.some((c) => String(c ?? '').trim()))
  if (data.length < 2) return { ...empty, error: 'The file needs a header row and at least one data row.' }
  const keys = data[0].map((h) => String(h).trim().toLowerCase().replace(/[()[\]%]/g, '').replace(/[\s./-]+/g, '_').replace(/_+$/, ''))
  const has = (re: RegExp) => keys.some((k) => re.test(k))
  const kind: MeltImport['kind'] = has(/^(kw|power_?kw|mw)$/) && !has(/^heat/) ? 'readings' : has(/^(kwh|mwh|if_?kwh)$/) ? 'heats' : has(/^c(_?pct)?$/) || has(/^cu(_?pct)?$/) ? 'chem' : 'heats'
  const cols = kind === 'heats' ? heatCols : kind === 'chem' ? chemCols : readingCols
  const map = keys.map((k) => cols.find((c) => c.re.test(k)) ?? null)
  const ignored = data[0].filter((_, i) => !map[i]).map((h) => String(h).trim()).filter(Boolean)
  const warnings = ignored.length ? [`Ignored columns: ${ignored.join(', ')}.`] : []
  const recs = data.slice(1).map((row) => { const rec: Record<string, unknown> = {}; map.forEach((c, i) => c?.set(rec, String(row[i] ?? '').trim().replace(/^"|"$/g, ''))); return rec })
  let bad = 0
  if (kind === 'heats') {
    const heats = recs.filter((r) => {
      const ok = r.heat && r.at && (r.kwh as number) > 0 && (r.tappedT as number) > 0 && (r.chargeT as number) > 0 && (r.powerOnMin as number) > 0 && (r.tapToTapMin as number) >= (r.powerOnMin as number)
      if (!ok) bad += 1
      return ok
    }).map((r) => ({ furnace: 'IF1', ...r }) as MeltHeat).sort((a, b) => a.at.localeCompare(b.at))
    if (bad) warnings.push(`${bad} heat(s) skipped: missing or impossible values (needs heat, date, kWh, charge, tapped, power-on and tap-to-tap; tap-to-tap ≥ power-on).`)
    if (!heats.length) return { ...empty, warnings, error: 'No usable heats found.' }
    if (heats.length < MIN_HEATS) warnings.push(`Only ${heats.length} heats: about ${MIN_HEATS}+ are needed to learn your furnace; published values are used until then.`)
    return { ...empty, kind, heats, warnings }
  }
  if (kind === 'chem') {
    const chem = recs.filter((r) => { const ok = !!r.heat; if (!ok) bad += 1; return ok }) as Chem[]
    if (bad) warnings.push(`${bad} row(s) skipped: no heat number.`)
    return chem.length ? { ...empty, kind, chem, warnings } : { ...empty, kind, warnings, error: 'No usable spectrometer rows found.' }
  }
  const readings = recs.filter((r) => { const ok = r.at && Number.isFinite(r.kw as number); if (!ok) bad += 1; return ok }).map((r) => ({ furnace: 'IF1', ...r }) as Reading).sort((a, b) => a.at.localeCompare(b.at))
  if (bad) warnings.push(`${bad} reading(s) skipped: no time or kW.`)
  return readings.length ? { ...empty, kind, readings, warnings } : { ...empty, kind, warnings, error: 'No usable readings found.' }
}

export const TEMPLATES = {
  heats: [
    'furnace,heat,date,grade,power_on_min,tap_to_tap_min,hold_min,lid_open_min,kwh,charge_t,tapped_t,heel_t,tap_temp_c,cold_lining,lining_heat,hms_t,shredded_t,turnings_t,pig_iron_t,returns_t,lf_kwh,lf_min,lf_electrode_kg,lf_lime_kg,lf_alloy_kg,lf_alloy_carbon_kg,lf_temp_in_c,lf_temp_out_c,preheat_gj',
    'IF1,26A0001,2026-10-01 02:33,B500B,62,95,14,6,33600,60.5,56.2,0,1625,0,41,24,18,9,3,6.5,2500,38,25,600,520,28,1585,1600,22',
  ].join('\n'),
  chem: ['heat,c,mn,si,s,p,cu,cr,ni,mo,v,sn,n', '26A0001,0.21,0.78,0.21,0.031,0.028,0.31,0.10,0.09,0.02,0.002,0.012,0.009'].join('\n'),
  readings: ['timestamp,furnace,kw,bath_temp_c,water_in_c,water_out_c,flow_m3h,hz', '2026-10-01 02:00,IF1,30500,1540,32.1,41.8,410,210'].join('\n'),
}
