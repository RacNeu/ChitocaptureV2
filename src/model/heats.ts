/**
 * EAF Optimise engine: per-heat data from the furnace's level-2 / HMI export.
 * Every coefficient is either learned from the plant's own heats (with a 90% range) or taken from
 * the verified published values in docs/eaf-optimisation-model.md. Nothing is invented; prices and
 * carbon contents are the plant's own inputs, shown as assumptions until replaced.
 */

/* ---------------- Data ---------------- */

export type HeatRecord = {
  heat: string
  /** ISO date-time of tap (or heat start). */
  at: string
  grade?: string
  tapToTapMin: number
  powerOnMin: number
  kwh: number
  tappedT: number
  /** Metallic charge: scrap (+ DRI/pig iron) in tonnes. */
  chargeT: number
  heelT?: number
  additionsT?: number
  o2Nm3: number
  ngNm3: number
  chargeCarbonKg: number
  injCarbonKg: number
  electrodeKg?: number
  limeKg?: number
  tapTempC?: number
  avgCosPhi?: number
}

export type EafSettings = {
  electrodeRMPerKg: number
  scrapRMPerT: number
  carbonRMPerKg: number
  /** Purchased oxygen price; 0 when it comes from the plant's own air separation unit (then its electricity counts). */
  o2RMPerNm3: number
  ngGJPerNm3: number
  tapTargetC: number
  carbonContent: number
  electrodeCarbon: number
  steelCarbonPct: number
}

/** Starting values: every one is an assumption the plant should replace (shown tagged in the app). */
export const defaultEaf: EafSettings = {
  electrodeRMPerKg: 25, scrapRMPerT: 1_600, carbonRMPerKg: 2, o2RMPerNm3: 0, ngGJPerNm3: 0.036,
  tapTargetC: 1_620, carbonContent: 0.85, electrodeCarbon: 0.99, steelCarbonPct: 0.2,
}

/* ---------------- Import ---------------- */

type Field = keyof HeatRecord
const aliases: [RegExp, Field, number][] = [
  [/^(heat|heat_?no|heat_?nr|heat_?number)$/, 'heat', 1],
  [/^(date|datetime|tap_?time|timestamp|at)$/, 'at', 1],
  [/^(grade|steel|steel_?grade)$/, 'grade', 1],
  [/^(tap_?to_?tap|ttt)(_?min)?$/, 'tapToTapMin', 1],
  [/^(power_?on|pon)(_?time)?(_?min)?$/, 'powerOnMin', 1],
  [/^(kwh|active_?energy|energy_?kwh|electricity_?kwh)$/, 'kwh', 1],
  [/^(mwh|electricity_?mwh)$/, 'kwh', 1_000],
  [/^(tapped|tapped_?steel|tap_?weight)(_?t)?$/, 'tappedT', 1],
  [/^(charge|scrap|total_?scrap|metallic_?charge)(_?t)?$/, 'chargeT', 1],
  [/^(heel|liquid_?heel)(_?t)?$/, 'heelT', 1],
  [/^(additions)(_?t)?$/, 'additionsT', 1],
  [/^(o2|oxygen)(_?nm3)?$/, 'o2Nm3', 1],
  [/^(ng|natural_?gas|gas)(_?nm3)?$/, 'ngNm3', 1],
  [/^(charge_?carbon|carbon_?charge|carbon)(_?kg)?$/, 'chargeCarbonKg', 1],
  [/^(inj(ected)?_?carbon|carbon_?inj(ection)?)(_?kg)?$/, 'injCarbonKg', 1],
  [/^(electrodes?|electrode_?consumption)(_?kg)?$/, 'electrodeKg', 1],
  [/^(lime)(_?kg)?$/, 'limeKg', 1],
  [/^(tap_?temp(erature)?|temp)(_?c)?$/, 'tapTempC', 1],
  [/^(cos_?phi|power_?factor)$/, 'avgCosPhi', 1],
]

export const HEAT_TEMPLATE = [
  'heat,date,grade,tap_to_tap_min,power_on_min,kwh,tapped_t,charge_t,heel_t,additions_t,o2_nm3,ng_nm3,charge_carbon_kg,inj_carbon_kg,electrode_kg,lime_kg,tap_temp_c',
  '000028,2026-10-01 02:33,Q235B,52,38,37800,95.0,104.2,20,1.2,3400,550,900,1000,160,3500,1625',
].join('\n')

export type HeatImport = { heats: HeatRecord[]; warnings: string[]; error?: string }

export function importHeatRows(rows: string[][]): HeatImport {
  const data = rows.filter((r) => r.some((c) => String(c ?? '').trim()))
  if (data.length < 2) return { heats: [], warnings: [], error: 'The file needs a header row and at least one heat.' }
  const cols = data[0].map((h) => { const key = String(h).trim().toLowerCase().replace(/[()[\]]/g, '').replace(/[\s.-]+/g, '_'); return aliases.find(([re]) => re.test(key)) ?? null })
  const need: Field[] = ['heat', 'kwh', 'tappedT', 'chargeT', 'powerOnMin', 'tapToTapMin']
  const missing = need.filter((f) => !cols.some((c) => c?.[1] === f))
  if (missing.length) return { heats: [], warnings: [], error: `Missing columns: ${missing.join(', ')}. Use the template headers.` }
  const ignored = data[0].filter((_, i) => !cols[i]).map((h) => String(h).trim()).filter(Boolean)
  const warnings = ignored.length ? [`Ignored columns: ${ignored.join(', ')}.`] : []
  const heats: HeatRecord[] = []
  let bad = 0
  data.slice(1).forEach((row) => {
    const rec: Partial<HeatRecord> & Record<string, unknown> = { o2Nm3: 0, ngNm3: 0, chargeCarbonKg: 0, injCarbonKg: 0 }
    cols.forEach((c, i) => {
      if (!c) return
      const [, field, scale] = c
      const raw = String(row[i] ?? '').trim().replace(/^"|"$/g, '')
      if (field === 'heat' || field === 'grade') { if (raw) rec[field] = raw; return }
      if (field === 'at') { const t = raw.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$2-$1'); const d = Date.parse(t.replace(' ', 'T')); if (!Number.isNaN(d)) rec.at = new Date(d).toISOString(); return }
      if (raw === '') return
      const v = Number(raw.replace(/,/g, ''))
      if (Number.isFinite(v)) rec[field] = v * scale
    })
    const ok = rec.heat && (rec.kwh ?? 0) > 0 && (rec.tappedT ?? 0) > 0 && (rec.chargeT ?? 0) > 0 && (rec.powerOnMin ?? 0) > 0 && (rec.tapToTapMin ?? 0) >= (rec.powerOnMin ?? 0)
    if (!ok) { bad += 1; return }
    heats.push({ at: '', ...rec } as HeatRecord)
  })
  if (bad) warnings.push(`${bad} heat(s) skipped: missing or impossible values (e.g. tap-to-tap shorter than power-on).`)
  if (!heats.length) return { heats, warnings, error: 'No usable heats found.' }
  heats.sort((a, b) => (a.at || a.heat).localeCompare(b.at || b.heat))
  if (heats.length < 30) warnings.push(`Only ${heats.length} heats: learned factors need about 30 or more; published values are used until then.`)
  return { heats, warnings }
}

/* ---------------- Per-heat values ---------------- */

export type HeatDerived = HeatRecord & {
  kwhPerT: number; o2PerT: number; ngPerT: number; carbonPerT: number; electrodePerT: number | null
  powerOffMin: number; yieldPct: number; mw: number; tph: number
  scope1KgPerT: number; scope2KgPerT: number
}

/** Natural gas: CO₂ from its carbon, at 56.1 kg CO₂/GJ (IPCC, net calorific value). */
export const NG_KG_PER_GJ = 56.1
/** Carbon → CO₂ (exact). */
export const CO2_PER_C = 44 / 12

export function derive(h: HeatRecord, s: EafSettings, gridKgPerKWh: number): HeatDerived {
  const t = h.tappedT
  const chargeIn = h.chargeT + (h.additionsT ?? 0)
  const carbonIn = (h.chargeCarbonKg + h.injCarbonKg) * s.carbonContent + (h.electrodeKg ?? 0) * s.electrodeCarbon
  const carbonOut = t * 1_000 * s.steelCarbonPct / 100
  const processCO2 = Math.max(0, carbonIn - carbonOut) * CO2_PER_C
  const ngCO2 = h.ngNm3 * s.ngGJPerNm3 * NG_KG_PER_GJ
  return {
    ...h,
    kwhPerT: h.kwh / t, o2PerT: h.o2Nm3 / t, ngPerT: h.ngNm3 / t, carbonPerT: (h.chargeCarbonKg + h.injCarbonKg) / t,
    electrodePerT: h.electrodeKg !== undefined ? h.electrodeKg / t : null,
    powerOffMin: h.tapToTapMin - h.powerOnMin, yieldPct: t / chargeIn * 100, mw: h.kwh / 1_000 / (h.powerOnMin / 60), tph: t / (h.tapToTapMin / 60),
    scope1KgPerT: (processCO2 + ngCO2) / t, scope2KgPerT: h.kwh * gridKgPerKWh / t,
  }
}

const quantile = (vals: number[], q: number) => { const s = [...vals].sort((a, b) => a - b); if (!s.length) return 0; const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo) }
const mean = (vals: number[]) => vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
export { quantile, mean }

/* ---------------- Regression (learned factors) ---------------- */

export type FactorId = 'o2PerT' | 'ngPerT' | 'carbonPerT' | 'powerOffMin' | 'tapTempC'
export type Published = { low: number; high: number; mid: number; note: string; confidence: 'verified' | 'rough' | 'none' }

/** Effect on electricity, kWh/t per unit of each driver, from the verified research (docs §3, §5). */
export const published: Record<FactorId, Published & { label: string; unit: string }> = {
  o2PerT: { label: 'Oxygen', unit: 'Nm³/t', low: -5, high: -2, mid: -3.5, note: 'Linde/InTech: ~3.5 kWh saved per Nm³ on average; lancing ≤2, post-combustion 3–5', confidence: 'verified' },
  ngPerT: { label: 'Natural gas', unit: 'Nm³/t', low: -9, high: -3, mid: -5, note: 'No verified per-Nm³ value; LBNL gives 10–20 kWh/short ton for whole lance-burner systems', confidence: 'rough' },
  carbonPerT: { label: 'Carbon (charge + injected)', unit: 'kg/t', low: -6, high: 0, mid: -2, note: 'No verified general value: learn from your heats', confidence: 'none' },
  powerOffMin: { label: 'Power-off time', unit: 'min', low: 0.5, high: 3, mid: 1.5, note: 'No published per-minute value: learn from your heats', confidence: 'none' },
  tapTempC: { label: 'Tap temperature', unit: '°C', low: 0.26, high: 1.3, mid: 1, note: 'Thermodynamics: ≥0.26 kWh/t per °C; practical 0.9–1.3 (rough, unverified source)', confidence: 'rough' },
}

export type Learned = { id: FactorId; coef: number; low: number; high: number; se: number; used: boolean; status: 'learned' | 'published' | 'check'; message: string }
export type Model = { factors: Learned[]; intercept: number; r2: number; n: number; residualSd: number; cov: number[][]; ids: FactorId[]; enough: boolean }

/** Solve (XᵀX)⁻¹ with Gauss-Jordan; returns null if singular. */
function invert(m: number[][]): number[][] | null {
  const n = m.length
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c += 1) {
    let p = c
    for (let r = c + 1; r < n; r += 1) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-12) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let j = 0; j < 2 * n; j += 1) a[c][j] /= d
    for (let r = 0; r < n; r += 1) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j += 1) a[r][j] -= f * a[c][j] }
  }
  return a.map((row) => row.slice(n))
}

const Z90 = 1.645
export const MIN_HEATS = 30

/** Multiple linear regression of kWh/t on the drivers the plant logs. */
export function learn(heats: HeatDerived[]): Model {
  const candidates: FactorId[] = ['o2PerT', 'ngPerT', 'carbonPerT', 'powerOffMin', 'tapTempC']
  const has = (h: HeatDerived, id: FactorId) => id === 'tapTempC' ? h.tapTempC !== undefined : true
  const usable = candidates.filter((id) => { const v = heats.filter((h) => has(h, id)).map((h) => h[id] as number); return v.length >= heats.length * 0.8 && quantile(v, 0.9) - quantile(v, 0.1) > 1e-6 })
  const rows = heats.filter((h) => usable.every((id) => has(h, id)))
  const n = rows.length, k = usable.length + 1
  const fallback = (enough: boolean): Model => ({
    factors: candidates.map((id) => ({ id, coef: published[id].mid, low: published[id].low, high: published[id].high, se: 0, used: false, status: 'published', message: n < MIN_HEATS ? `Only ${n} heats: using the published value` : 'Not enough variation in your data: using the published value' })),
    intercept: mean(rows.map((h) => h.kwhPerT)), r2: 0, n, residualSd: 0, cov: [], ids: [], enough,
  })
  if (n < Math.max(MIN_HEATS, 5 * k) || !usable.length) return fallback(false)
  const X = rows.map((h) => [1, ...usable.map((id) => h[id] as number)])
  const y = rows.map((h) => h.kwhPerT)
  const xtx = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)))
  const inv = invert(xtx)
  if (!inv) return fallback(false)
  const xty = Array.from({ length: k }, (_, i) => X.reduce((s, r, idx) => s + r[i] * y[idx], 0))
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0))
  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0))
  const sse = y.reduce((s, v, i) => s + (v - fitted[i]) ** 2, 0)
  const ym = mean(y), sst = y.reduce((s, v) => s + (v - ym) ** 2, 0)
  const s2 = sse / Math.max(1, n - k)
  const cov = inv.map((row) => row.map((v) => v * s2))
  const factors: Learned[] = candidates.map((id) => {
    const j = usable.indexOf(id)
    if (j < 0) return { id, coef: published[id].mid, low: published[id].low, high: published[id].high, se: 0, used: false, status: 'published', message: 'Not logged or not varying: using the published value' }
    const coef = beta[j + 1], se = Math.sqrt(Math.max(0, cov[j + 1][j + 1]))
    const low = coef - Z90 * se, high = coef + Z90 * se
    const p = published[id]
    const outside = p.confidence !== 'none' && (high < p.low * (p.low < 0 ? 1.6 : 0.4) || low > p.high * (p.high < 0 ? 0.4 : 1.6))
    const wrongSign = (p.mid < 0 && low > 0) || (p.mid > 0 && high < 0)
    return {
      id, coef, low, high, se, used: true,
      status: wrongSign || outside ? 'check' : 'learned',
      message: wrongSign ? 'Opposite sign to physics: check the meter or data for this driver' : outside ? 'Well outside the published range: check data before relying on it' : `Learned from ${n} heats`,
    }
  })
  return { factors, intercept: beta[0], r2: sst > 0 ? 1 - sse / sst : 0, n, residualSd: Math.sqrt(s2), cov, ids: usable, enough: true }
}

/** kWh/t predicted for a set of drivers, with a 90% range for the average heat at those settings. */
export function predict(model: Model, x: Partial<Record<FactorId, number>>, base: HeatDerived[]): { kwhPerT: number; low: number; high: number } {
  const avg = (id: FactorId) => mean(base.map((h) => (h[id] as number | undefined) ?? 0))
  if (!model.enough) {
    const kwh = mean(base.map((h) => h.kwhPerT)) + model.factors.reduce((s, f) => s + f.coef * ((x[f.id] ?? avg(f.id)) - avg(f.id)), 0)
    return { kwhPerT: kwh, low: kwh, high: kwh }
  }
  const row = [1, ...model.ids.map((id) => x[id] ?? avg(id))]
  const coefs = [model.intercept, ...model.ids.map((id) => model.factors.find((f) => f.id === id)!.coef)]
  const kwh = row.reduce((s, v, j) => s + v * coefs[j], 0)
  const varMean = row.reduce((s, vi, i) => s + row.reduce((t, vj, j) => t + vi * model.cov[i][j] * vj, 0), 0)
  const half = Z90 * Math.sqrt(Math.max(0, varMean))
  return { kwhPerT: kwh, low: kwh - half, high: kwh + half }
}

/* ---------------- Losses vs the plant's own best heats ---------------- */

export type Loss = { id: string; label: string; detail: string; rmPerMonth: number; co2TPerMonth: number; basis: 'learned' | 'published' | 'measured' | 'assumption'; low: number; high: number }

export function losses(heats: HeatDerived[], model: Model, s: EafSettings, elecRMPerMWh: number, gridKgPerKWh: number): Loss[] {
  if (!heats.length) return []
  const days = Math.max(1, (Date.parse(heats[heats.length - 1].at) - Date.parse(heats[0].at)) / 86_400_000) || 30
  const tPerMonth = heats.reduce((s2, h) => s2 + h.tappedT, 0) / days * 30.4
  const price = elecRMPerMWh / 1_000
  const out: Loss[] = []
  const f = (id: FactorId) => model.factors.find((x) => x.id === id)!
  const fromKwh = (id: string, label: string, detail: string, kwhPerT: number, factor: Learned) => {
    const scale = factor.coef !== 0 ? kwhPerT / factor.coef : 0
    const lo = Math.min(factor.low, factor.high) * scale, hi = Math.max(factor.low, factor.high) * scale
    out.push({ id, label, detail, rmPerMonth: kwhPerT * price * tPerMonth, co2TPerMonth: kwhPerT * gridKgPerKWh * tPerMonth / 1_000, basis: factor.used && factor.status === 'learned' ? 'learned' : 'published', low: Math.max(0, lo) * price * tPerMonth, high: Math.max(0, hi) * price * tPerMonth })
  }
  // Delays: power-off beyond the plant's own best quarter of heats.
  const off = heats.map((h) => h.powerOffMin), offBest = quantile(off, 0.25)
  const excessOff = mean(off.map((v) => Math.max(0, v - offBest)))
  fromKwh('delays', 'Power-off delays', `${excessOff.toFixed(1)} min/heat above your best quarter (${offBest.toFixed(0)} min)`, excessOff * f('powerOffMin').coef, f('powerOffMin'))
  // Overheating: tap temperature above target.
  const temps = heats.filter((h) => h.tapTempC !== undefined).map((h) => h.tapTempC!)
  if (temps.length) {
    const over = mean(temps.map((v) => Math.max(0, v - s.tapTargetC)))
    fromKwh('superheat', 'Tapping too hot', `${over.toFixed(0)} °C average above the ${s.tapTargetC} °C target`, over * f('tapTempC').coef, f('tapTempC'))
  }
  // Electrodes above the best quarter.
  const el = heats.filter((h) => h.electrodePerT !== null).map((h) => h.electrodePerT!)
  if (el.length) {
    const excess = mean(el) - quantile(el, 0.25)
    out.push({ id: 'electrodes', label: 'Electrode consumption', detail: `${excess.toFixed(2)} kg/t above your best quarter (${quantile(el, 0.25).toFixed(2)} kg/t)`, rmPerMonth: excess * s.electrodeRMPerKg * tPerMonth, co2TPerMonth: excess * s.electrodeCarbon * CO2_PER_C * tPerMonth / 1_000, basis: 'measured', low: excess * s.electrodeRMPerKg * tPerMonth, high: excess * s.electrodeRMPerKg * tPerMonth })
  }
  // Yield below the best quarter: extra scrap bought and melted.
  const y = heats.map((h) => h.yieldPct / 100), yBest = quantile(y, 0.75), yAvg = mean(y)
  if (yBest > yAvg) {
    const extraScrapPerT = 1 / yAvg - 1 / yBest
    const meltKwh = extraScrapPerT * mean(heats.map((h) => h.kwhPerT))
    out.push({ id: 'yield', label: 'Metal yield', detail: `${(yAvg * 100).toFixed(1)}% average vs ${(yBest * 100).toFixed(1)}% in your best quarter: ${(extraScrapPerT * 1_000).toFixed(0)} kg more scrap per tonne`, rmPerMonth: (extraScrapPerT * s.scrapRMPerT + meltKwh * price) * tPerMonth, co2TPerMonth: meltKwh * gridKgPerKWh * tPerMonth / 1_000, basis: 'measured', low: extraScrapPerT * s.scrapRMPerT * tPerMonth, high: (extraScrapPerT * s.scrapRMPerT + meltKwh * price) * tPerMonth })
  }
  // What the drivers don't explain: practice, scrap mix, arc control.
  if (model.enough) {
    const resid = heats.map((h) => h.kwhPerT - predict(model, { o2PerT: h.o2PerT, ngPerT: h.ngPerT, carbonPerT: h.carbonPerT, powerOffMin: h.powerOffMin, tapTempC: h.tapTempC }, heats).kwhPerT)
    const gap = mean(resid) - quantile(resid, 0.25)
    out.push({ id: 'practice', label: 'Practice & scrap mix (unexplained)', detail: `${gap.toFixed(0)} kWh/t between your typical and best-quarter heats after the drivers above`, rmPerMonth: gap * price * tPerMonth, co2TPerMonth: gap * gridKgPerKWh * tPerMonth / 1_000, basis: 'learned', low: gap * 0.5 * price * tPerMonth, high: gap * price * tPerMonth })
  }
  return out.filter((l) => l.rmPerMonth > 0).sort((a, b) => b.rmPerMonth - a.rmPerMonth)
}

/* ---------------- Optimiser ---------------- */

export type Setpoints = Record<FactorId, number>
export type Bounds = Record<FactorId, [number, number]>
export type Outcome = { kwhPerT: number; kwhLow: number; kwhHigh: number; costPerT: number; co2PerT: number }

/** Only within what this furnace has already done: the 5th–95th percentile of its own heats. */
export function boundsFor(heats: HeatDerived[], s: EafSettings): Bounds {
  const b = (id: FactorId) => { const v = heats.map((h) => h[id] as number | undefined).filter((x): x is number => x !== undefined); return v.length ? [quantile(v, 0.05), quantile(v, 0.95)] as [number, number] : [0, 0] as [number, number] }
  const t = b('tapTempC')
  return { o2PerT: b('o2PerT'), ngPerT: b('ngPerT'), carbonPerT: b('carbonPerT'), powerOffMin: b('powerOffMin'), tapTempC: [Math.max(t[0], s.tapTargetC - 10), Math.max(t[1], s.tapTargetC - 10)] }
}

export function outcome(model: Model, x: Setpoints, heats: HeatDerived[], s: EafSettings, elecRMPerMWh: number, ngRMPerGJ: number, gridKgPerKWh: number): Outcome {
  const p = predict(model, x, heats)
  const elec = elecRMPerMWh / 1_000
  const electrode = mean(heats.filter((h) => h.electrodePerT !== null).map((h) => h.electrodePerT!))
  // On-site oxygen: its own electricity (~0.5 kWh/Nm³, LBNL) is part of the cost and the Scope 2.
  const o2Kwh = s.o2RMPerNm3 > 0 ? 0 : x.o2PerT * 0.5
  const cost = (p.kwhPerT + o2Kwh) * elec + x.o2PerT * s.o2RMPerNm3 + x.ngPerT * s.ngGJPerNm3 * ngRMPerGJ + x.carbonPerT * s.carbonRMPerKg + electrode * s.electrodeRMPerKg
  const co2 = (p.kwhPerT + o2Kwh) * gridKgPerKWh + x.ngPerT * s.ngGJPerNm3 * NG_KG_PER_GJ + (x.carbonPerT * s.carbonContent + electrode * s.electrodeCarbon) * CO2_PER_C
  return { kwhPerT: p.kwhPerT, kwhLow: p.low, kwhHigh: p.high, costPerT: cost, co2PerT: co2 }
}

/** The model is linear, so the best setting of each driver sits at one end of its observed range. */
export function optimise(model: Model, bounds: Bounds, heats: HeatDerived[], s: EafSettings, elecRMPerMWh: number, ngRMPerGJ: number, gridKgPerKWh: number, goal: 'cost' | 'co2', fixed: Partial<Setpoints> = {}): Setpoints {
  const ids: FactorId[] = ['o2PerT', 'ngPerT', 'carbonPerT', 'powerOffMin', 'tapTempC']
  const start = Object.fromEntries(ids.map((id) => [id, fixed[id] ?? (bounds[id][0] + bounds[id][1]) / 2])) as Setpoints
  const score = (x: Setpoints) => { const o = outcome(model, x, heats, s, elecRMPerMWh, ngRMPerGJ, gridKgPerKWh); return goal === 'cost' ? o.costPerT : o.co2PerT }
  const best = { ...start }
  for (const id of ids) {
    if (fixed[id] !== undefined) continue
    const lo = { ...best, [id]: bounds[id][0] }, hi = { ...best, [id]: bounds[id][1] }
    best[id] = score(lo) <= score(hi) ? bounds[id][0] : bounds[id][1]
  }
  return best
}
