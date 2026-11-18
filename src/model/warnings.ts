/**
 * Plant early warnings (Risks page): what is likely to go wrong in the melt shop soon, how soon, and
 * what to do now. Each warning follows one pattern:
 *
 *     leading signal → trend → time to the limit → action
 *
 * Trends use the Theil–Sen slope (the median of all pairwise slopes) with its standard rank-based 90%
 * range, so one bad hour or one odd heat can't swing the forecast. A forecast is only given when the
 * whole range points the same way; otherwise the warning says the signal is steady.
 *
 * Nothing is invented: every warning is computed from the plant's own readings, heat log and lab
 * results. Limits are the example coil-water set points used by the alarms (src/live/feed.ts) and the
 * BS 4449 chemistry limits; when an input is missing the warning says what it needs.
 */
import { checkChem, cev, gradeLimits, minutesOf, period, type Chem, type ChemKey, type DriverId, type HeatView, type MeltModel, type MeltSettings, type Reading, type Anomaly } from './meltshop'
import { mean, quantile } from './regress'

export type WarnStatus = 'act' | 'watch' | 'ok' | 'needs'
export type WarnArea = 'Coil cooling' | 'Lining' | 'Chemistry' | 'Furnace energy'
export type Series = { x: number[]; y: number[]; limit: number | null; limitLabel: string; fit: { a: number; b: number } | null; xUnit: 'h' | 'd'; unit: string }
export type Warning = {
  id: string
  area: WarnArea
  furnace: string | null
  title: string
  status: WarnStatus
  /** One-line reading of the signal now, e.g. "ΔT 18.0 °C, rising 0.5 °C a day". */
  headline: string
  /** Days until the limit is reached at the current trend, with a 90% range. null when there is no trend. */
  days: { mid: number; low: number; high: number } | null
  /** Money at stake a month, where it can be priced. */
  rmPerMonth: number | null
  series: Series | null
  evidence: string[]
  action: string
  basis: string[]
  missing: string[]
}

/** Demo only: an illustrative lining life, used when the demo melt shop is open and no value is set. */
export const DEMO_LINING_LIFE = 450
const ACT_DAYS = 7, WATCH_DAYS = 30
/** Example coil-water limits, the same as the live alarms (a real furnace uses its maker's values). */
export const COIL_LIMITS = { dtC: 20, flowM3h: 300 }

/* ---------------- Robust trend ---------------- */

export type Trend = { slope: number; low: number; high: number; intercept: number; n: number }

/** Theil–Sen slope with its 90% range (Sen 1968; rank-based interval as in the Mann–Kendall test). */
export function senSlope(x: number[], y: number[]): Trend | null {
  const n = x.length
  if (n < 6) return null
  const slopes: number[] = []
  for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) if (x[j] !== x[i]) slopes.push((y[j] - y[i]) / (x[j] - x[i]))
  if (slopes.length < 10) return null
  slopes.sort((a, b) => a - b)
  const N = slopes.length
  const c = 1.645 * Math.sqrt(n * (n - 1) * (2 * n + 5) / 18)
  const lo = slopes[Math.max(0, Math.floor((N - c) / 2))], hi = slopes[Math.min(N - 1, Math.ceil((N + c) / 2))]
  const slope = quantile(slopes, 0.5)
  const intercept = quantile(y.map((v, k) => v - slope * x[k]), 0.5)
  return { slope, low: lo, high: hi, intercept, n }
}

/** Time for a trend to move from `now` to `limit` (same units as x), or null if it isn't heading there. */
function timeTo(t: Trend, now: number, limit: number) {
  const gap = limit - now
  if (gap === 0) return { mid: 0, low: 0, high: 0 }
  const rising = gap > 0
  // The whole 90% range must point towards the limit.
  if (rising ? t.low <= 0 : t.high >= 0) return null
  const fast = rising ? t.high : t.low, slow = rising ? t.low : t.high
  return { mid: gap / t.slope, low: gap / fast, high: gap / slow }
}
const statusFor = (days: number | null): WarnStatus => days === null ? 'ok' : days <= ACT_DAYS ? 'act' : days <= WATCH_DAYS ? 'watch' : 'ok'
const worse = (a: WarnStatus, b: WarnStatus): WarnStatus => (['act', 'watch', 'needs', 'ok'].find((s) => s === a || s === b) as WarnStatus)
export const fmtDays = (d: number) => d < 1 ? `${Math.max(1, Math.round(d * 24))} h` : d < 60 ? `${d < 10 ? d.toFixed(1) : Math.round(d)} days` : `${Math.round(d / 30.4)} months`

/* ---------------- 1. Coil cooling (per furnace) ---------------- */

function coilWarnings(readings: Reading[], anomalies: Anomaly[]): Warning[] {
  const out: Warning[] = []
  const furnaces = [...new Set(readings.map((r) => r.furnace))].sort()
  for (const f of furnaces) {
    const rs = readings.filter((r) => r.furnace === f && r.waterInC !== undefined && r.waterOutC !== undefined)
    if (rs.length < 120) continue
    const maxKw = Math.max(...rs.map((r) => r.kw))
    const t0 = minutesOf(rs[0].at)
    // Hourly medians while melting (idle readings would mix two different normals).
    const hours = new Map<number, { dt: number[]; flow: number[] }>()
    for (const r of rs) {
      if (r.kw <= 0.3 * maxKw) continue
      const h = Math.floor((minutesOf(r.at) - t0) / 60)
      const b = hours.get(h) ?? { dt: [], flow: [] }
      b.dt.push(r.waterOutC! - r.waterInC!)
      if (r.flowM3h !== undefined) b.flow.push(r.flowM3h)
      hours.set(h, b)
    }
    const hs = [...hours.entries()].filter(([, b]) => b.dt.length >= 5).sort((a, b) => a[0] - b[0])
    if (hs.length < 12) continue
    const x = hs.map(([h]) => h)
    const dt = hs.map(([, b]) => quantile(b.dt, 0.5))
    const flow = hs.map(([, b]) => b.flow.length ? quantile(b.flow, 0.5) : NaN)
    const dtTrend = senSlope(x, dt)
    const flowOk = flow.every(Number.isFinite)
    const flowTrend = flowOk ? senSlope(x, flow) : null
    const xLast = x[x.length - 1]
    const dtNow = dtTrend ? dtTrend.intercept + dtTrend.slope * xLast : dt[dt.length - 1]
    const flowNow = flowTrend ? flowTrend.intercept + flowTrend.slope * xLast : flow[flow.length - 1]
    const dtTime = dtTrend ? timeTo(dtTrend, dtNow, COIL_LIMITS.dtC) : null
    const flowTime = flowTrend ? timeTo(flowTrend, flowNow, COIL_LIMITS.flowM3h) : null
    const toDays = (v: { mid: number; low: number; high: number } | null) => v && { mid: Math.max(0, v.mid / 24), low: Math.max(0, v.low / 24), high: Math.max(0, v.high / 24) }
    const dtDays = toDays(dtTime), flowDays = toDays(flowTime)
    const useFlow = !!flowDays && (!dtDays || flowDays.mid < dtDays.mid)
    const days = useFlow ? flowDays : dtDays
    let status = statusFor(days?.mid ?? null)
    if (dtNow >= COIL_LIMITS.dtC || flowNow <= COIL_LIMITS.flowM3h) status = 'act'
    // Recent events on this furnace: the cause may still be there even if the reading recovered.
    const lastAt = rs[rs.length - 1].at
    const recent = anomalies.filter((a) => a.furnace === f && minutesOf(lastAt) - minutesOf(a.at) <= 24 * 60)
    if (recent.length) status = worse(status, 'watch')
    const perDay = (t: Trend | null, unit: string) => t ? `${t.slope * 24 >= 0 ? '+' : ''}${(t.slope * 24).toFixed(unit === '°C' ? 2 : 0)} ${unit} a day` : 'no trend'
    const tr = useFlow ? flowTrend! : dtTrend
    out.push({
      id: `coil-${f}`, area: 'Coil cooling', furnace: f,
      title: useFlow ? `${f} coil water flow falling` : status === 'ok' ? `${f} coil cooling steady` : recent.length && !days ? `${f} coil water had an unusual drop` : `${f} coil water heating up`,
      status,
      headline: `ΔT ${dtNow.toFixed(1)} °C (${perDay(dtTrend, '°C')}) · flow ${Math.round(flowNow)} m³/h (${perDay(flowTrend, 'm³/h')}) while melting`,
      days, rmPerMonth: null,
      series: { x, y: useFlow ? flow : dt, limit: useFlow ? COIL_LIMITS.flowM3h : COIL_LIMITS.dtC, limitLabel: useFlow ? 'min 300 m³/h' : 'warn 20 °C', fit: tr ? { a: tr.intercept, b: tr.slope } : null, xUnit: 'h', unit: useFlow ? 'm³/h' : '°C' },
      evidence: [
        `${hs.length} hours of melting readings, ${new Date(minutesOf(rs[0].at) * 60_000).toISOString().slice(0, 16).replace('T', ' ')} to ${lastAt}; hourly medians, robust trend.`,
        days ? `At this rate ${useFlow ? `flow reaches ${COIL_LIMITS.flowM3h} m³/h` : `ΔT reaches ${COIL_LIMITS.dtC} °C`} in ~${fmtDays(days.mid)} (90% range ${fmtDays(days.low)}–${days.high === Infinity ? 'longer' : fmtDays(days.high)}).` : 'No significant trend towards a limit.',
        ...recent.slice(0, 2).map((a) => `${a.at}: ${a.signal === 'flowM3h' ? `flow ${Math.round(a.value)} m³/h` : `ΔT ${a.value.toFixed(1)} °C`} was outside this furnace’s normal band (${a.normalLow.toFixed(a.signal === 'flowM3h' ? 0 : 1)}–${a.normalHigh.toFixed(a.signal === 'flowM3h' ? 0 : 1)}).`),
      ],
      action: useFlow ? `Check ${f}'s coil-water pumps, strainers and hoses at the next stop; a coil can fail within minutes of losing flow.`
        : days || dtNow >= COIL_LIMITS.dtC ? `Plan descaling or cleaning of ${f}'s coil-water circuit and heat exchanger before the trend reaches the limit; check the cooling-tower temperature.`
          : recent.length ? `Find what caused ${f}'s drop (pump, strainer, air lock) before the next campaign.` : 'Nothing to do; keep logging.',
      basis: ['your readings', 'example limit'], missing: [],
    })
  }
  return out
}

/* ---------------- 2. Lining life (per furnace) ---------------- */

function liningWarnings(heats: HeatView[], s: MeltSettings, isDemo: boolean): Warning[] {
  const out: Warning[] = []
  const furnaces = [...new Set(heats.map((h) => h.furnace))].sort()
  // Completed campaigns in the log: the heat count just before each reline.
  const campaigns: number[] = []
  for (const f of furnaces) {
    const hs = heats.filter((h) => h.furnace === f && h.liningHeat !== undefined)
    for (let i = 1; i < hs.length; i += 1) if (hs[i].liningHeat! < hs[i - 1].liningHeat!) campaigns.push(hs[i - 1].liningHeat!)
  }
  const life = s.liningLifeHeats ?? (campaigns.length >= 3 ? quantile(campaigns, 0.25) : isDemo ? DEMO_LINING_LIFE : null)
  const lifeBasis = s.liningLifeHeats ? 'your setting' : campaigns.length >= 3 ? 'your past relines' : isDemo ? 'demo setting' : null
  const { days: span } = period(heats)
  for (const f of furnaces) {
    const hs = heats.filter((h) => h.furnace === f && h.liningHeat !== undefined)
    if (!hs.length) continue
    const now = hs[hs.length - 1].liningHeat!
    const t0 = hs[0].tapMin
    // Heats a day on this furnace, with the spread across days.
    const perDay = new Map<number, number>()
    for (const h of hs) { const d = Math.floor((h.tapMin - t0) / 1_440); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
    const counts = [...perDay.values()]
    const rate = hs.length / Math.max(1, span)
    const relined = hs.find((h, i) => i > 0 && h.liningHeat! < hs[i - 1].liningHeat!)
    const evidence = [
      `Heat ${now} on the current lining; ${rate.toFixed(1)} heats a day on ${f}.`,
      ...(relined ? [`Relined on ${relined.at.slice(0, 10)} after heat ${hs[hs.indexOf(relined) - 1].liningHeat}.`] : []),
    ]
    const series: Series = { x: hs.map((h) => (h.tapMin - t0) / 1_440), y: hs.map((h) => h.liningHeat!), limit: life, limitLabel: life ? `usual life ${Math.round(life)} heats` : '', fit: null, xUnit: 'd', unit: 'heats' }
    if (life === null) {
      out.push({ id: `lining-${f}`, area: 'Lining', furnace: f, title: `${f} lining: heat ${now}`, status: 'needs', headline: `${now} heats on the current lining`, days: null, rmPerMonth: null, series, evidence,
        action: 'Enter your usual lining life (from the refractory supplier or past relines) to get a reline date.', basis: ['your heat log'], missing: ['Usual lining life (heats)'] })
      continue
    }
    const left = life - now
    const days = left <= 0 ? { mid: 0, low: 0, high: 0 } : { mid: left / rate, low: left / Math.max(rate, quantile(counts, 0.75)), high: left / Math.max(0.1, Math.min(rate, quantile(counts, 0.25))) }
    const status = statusFor(days.mid)
    out.push({
      id: `lining-${f}`, area: 'Lining', furnace: f,
      title: left <= 0 ? `${f} lining past its usual life` : status === 'ok' ? `${f} lining in good life` : `${f} lining nearing its usual life`,
      status, headline: `Heat ${now} of ~${Math.round(life)} · ${Math.max(0, Math.round(left))} heats left`,
      days, rmPerMonth: null, series: { ...series, fit: { a: series.y[series.y.length - 1] - rate * series.x[series.x.length - 1], b: rate } },
      evidence: [...evidence, `Usual life ${Math.round(life)} heats (${lifeBasis}).`, 'Wear speeds up near the end of a campaign; an earth-leakage reading each shift shows it directly.'],
      action: left <= 0 ? `Inspect ${f}'s lining now (thickness, cracks, earth leakage) and reline at the next stop.` : `Book ${f}'s reline into the stop before heat ${Math.round(life)}; check earth leakage every shift from now on.`,
      basis: ['your heat log', lifeBasis!], missing: [],
    })
  }
  return out
}

/* ---------------- 3. Chemistry (whole shop) ---------------- */

const chemAction: Record<string, string> = {
  C: 'Reduce carburiser additions and check the carbon of pig iron and returns in the charge.',
  CEV: 'Trim manganese and carbon additions; CEV is the weldability limit.',
  Cu: 'Change the scrap mix: less of the high-copper scrap (Material & yield shows copper per scrap type).',
  S: 'Use lower-sulphur scrap and carburiser; an induction furnace cannot remove sulphur.',
  P: 'Use lower-phosphorus scrap; an induction furnace cannot remove phosphorus.',
  N: 'Shorten holding with the lid open; nitrogen is picked up from the air.',
}

function chemWarning(heats: HeatView[], chem: Chem[], s: MeltSettings): Warning | null {
  if (!chem.length) return null
  const tap = new Map(heats.map((h) => [h.heat, h.tapMin]))
  const rows = chem.filter((c) => tap.has(c.heat)).sort((a, b) => tap.get(a.heat)! - tap.get(b.heat)!)
  if (rows.length < 30) return { id: 'chem', area: 'Chemistry', furnace: null, title: 'Chemistry', status: 'needs', headline: `${rows.length} heats with lab results`, days: null, rmPerMonth: null, series: null, evidence: [], action: 'Upload spectrometer results matched to heat numbers.', basis: [], missing: ['30+ heats with lab results'] }
  const last = tap.get(rows[rows.length - 1].heat)!, t0 = tap.get(rows[0].heat)!
  const checks = checkChem(rows, heats, s.grade)
  const fails = checks.filter((c) => c.fails.length)
  const recentFails = fails.filter((c) => last - tap.get(c.heat)! <= 7 * 1_440)
  const lim = gradeLimits[s.grade] ?? gradeLimits.B500B
  const value = (c: Chem, k: string) => k === 'CEV' ? cev(c) : c[k as ChemKey]
  // The element with the least room: highest 95th percentile against its limit over the last 7 days.
  const recent = rows.filter((c) => last - tap.get(c.heat)! <= 7 * 1_440)
  const tight = Object.entries(lim).map(([k, limit]) => {
    const v = recent.map((c) => value(c, k)).filter((x): x is number => x !== undefined)
    return { k, limit: limit!, p95: v.length ? quantile(v, 0.95) : 0, avg: mean(v) }
  }).filter((x) => x.limit > 0).sort((a, b) => b.p95 / b.limit - a.p95 / a.limit)[0]
  // Daily averages of that element, and its trend.
  const byDay = new Map<number, number[]>()
  for (const c of rows) { const v = value(c, tight.k); if (v === undefined) continue; const d = Math.floor((tap.get(c.heat)! - t0) / 1_440); byDay.set(d, [...(byDay.get(d) ?? []), v]) }
  const days = [...byDay.keys()].sort((a, b) => a - b)
  const y = days.map((d) => mean(byDay.get(d)!))
  const tr = senSlope(days, y)
  const nowV = tr ? tr.intercept + tr.slope * days[days.length - 1] : tight.avg
  const time = tr ? timeTo(tr, nowV, tight.limit) : null
  let status: WarnStatus = recentFails.length >= 3 || tight.p95 > tight.limit ? 'act' : recentFails.length || tight.p95 > 0.95 * tight.limit ? 'watch' : 'ok'
  status = worse(status, statusFor(time?.mid ?? null))
  const failKeys = [...new Set(fails.flatMap((c) => c.fails.map((x) => x.key)))]
  return {
    id: 'chem', area: 'Chemistry', furnace: null,
    title: recentFails.length ? `${recentFails.length} off-spec heat${recentFails.length > 1 ? 's' : ''} in the last 7 days` : status === 'ok' ? 'Chemistry inside the limits' : `${tight.k} close to its limit`,
    status,
    headline: `${tight.k}: 95% of recent heats ≤ ${tight.p95.toFixed(3)} vs limit ${tight.limit} (${s.grade}, BS 4449)`,
    days: time ? { mid: time.mid, low: time.low, high: time.high } : null, rmPerMonth: null,
    series: { x: days, y, limit: tight.limit, limitLabel: `${tight.k} limit ${tight.limit}`, fit: tr ? { a: tr.intercept, b: tr.slope } : null, xUnit: 'd', unit: tight.k === 'CEV' ? '' : '%' },
    evidence: [
      `${fails.length} of ${rows.length} heats over a limit in the period${failKeys.length ? ` (${failKeys.join(', ')})` : ''}; ${recentFails.length} in the last 7 days.`,
      ...fails.slice(-3).map((c) => `${c.heat}: ${c.fails.map((x) => `${x.key} ${x.value.toFixed(3)} > ${x.limit}`).join(', ')}`),
      time ? `Daily average ${tight.k} trending to the limit in ~${fmtDays(time.mid)}.` : `No trend towards the ${tight.k} limit.`,
    ],
    action: chemAction[failKeys[0] ?? tight.k] ?? 'Check the charge and additions for the failing element.',
    basis: ['your lab results', 'BS 4449 limit'], missing: [],
  }
}

/* ---------------- 4. Furnace energy (per furnace, vs the shop's own model) ---------------- */

function energyWarnings(heats: HeatView[], model: MeltModel, s: MeltSettings): Warning[] {
  if (!model.enough) return [{ id: 'energy', area: 'Furnace energy', furnace: null, title: 'Furnace energy', status: 'needs', headline: `${model.n} usable heats`, days: null, rmPerMonth: null, series: null, evidence: [], action: 'Upload a heat log of 30 or more heats.', basis: [], missing: ['30+ heats in the heat log'] }]
  const coef = new Map(model.factors.map((f) => [f.id, f.coef]))
  const value = (h: HeatView, id: DriverId): number | undefined => id === 'holdMin' ? h.holdMin : id === 'lidOpenMin' ? h.lidOpenMin : id === 'tapTempC' ? h.tapTempC : id === 'coldLining' ? (h.coldLining ? 1 : 0) : id === 'shredded' ? h.shares.shredded : id === 'turnings' ? h.shares.turnings : h.fill
  // What each heat "should" have used given its own practice, from the shop-wide learned factors.
  const resid = (h: HeatView) => { let p = model.intercept; for (const id of model.ids) p += (coef.get(id) ?? 0) * (value(h, id) ?? 0); return h.kwhPerT - p }
  const price = (s.peakSenPerKWh + s.offPeakSenPerKWh) / 2 / 100
  const { days: span } = period(heats)
  const t0 = Math.min(...heats.map((h) => h.tapMin))
  const out: Warning[] = []
  for (const f of [...new Set(heats.map((h) => h.furnace))].sort()) {
    const hs = heats.filter((h) => h.furnace === f && !h.flags.length)
    if (hs.length < 20) continue
    const r = hs.map(resid)
    const m = mean(r), sd = Math.sqrt(mean(r.map((v) => (v - m) ** 2))), se = sd / Math.sqrt(r.length)
    const tPerMonth = hs.reduce((a, h) => a + h.tappedT, 0) / Math.max(1, span) * 30.4
    const byDay = new Map<number, number[]>()
    hs.forEach((h, k) => { const d = Math.floor((h.tapMin - t0) / 1_440); byDay.set(d, [...(byDay.get(d) ?? []), r[k]]) })
    const days = [...byDay.keys()].sort((a, b) => a - b)
    const y = days.map((d) => mean(byDay.get(d)!))
    const tr = senSlope(days, y)
    const rising = !!tr && tr.low > 0
    const high = m > 5 && m / se > 3
    const status: WarnStatus = (high && m > 20) || (rising && high) ? 'act' : high || rising ? 'watch' : 'ok'
    out.push({
      id: `energy-${f}`, area: 'Furnace energy', furnace: f,
      title: status === 'ok' ? `${f} energy normal` : rising ? `${f} energy creeping up` : `${f} uses more energy than the others`,
      status,
      headline: `${m >= 0 ? '+' : ''}${m.toFixed(1)} kWh/t vs the shop’s normal for the same practice (±${(1.645 * se).toFixed(1)})`,
      days: null, rmPerMonth: m > 0 ? m * tPerMonth * price : 0,
      series: { x: days, y, limit: 0, limitLabel: 'shop normal', fit: tr ? { a: tr.intercept, b: tr.slope } : null, xUnit: 'd', unit: 'kWh/t' },
      evidence: [
        `${hs.length} heats compared with what the shop’s learned factors expect for their holding, lid, tap temperature, scrap mix, fill and lining.`,
        rising ? `The gap is growing: +${(tr!.slope * 7).toFixed(1)} kWh/t a week.` : 'The gap is steady over the period.',
        ...(m > 0 ? [`≈ RM ${Math.round(m * tPerMonth * price).toLocaleString('en-MY')} a month at ${(price * 100).toFixed(1)} sen/kWh on ${Math.round(tPerMonth).toLocaleString('en-MY')} t.`] : []),
      ],
      action: status === 'ok' ? 'Nothing to do.' : `Inspect ${f}: coil insulation and water scale, power-supply efficiency (capacitor bank), and lining thickness; compare with its sister furnace.`,
      basis: ['your heat log', 'learned factors'], missing: [],
    })
  }
  return out
}

/* ---------------- All ---------------- */

export type WarningInput = { heats: HeatView[]; chem: Chem[]; readings: Reading[]; anomalies: Anomaly[]; model: MeltModel; s: MeltSettings; isDemo: boolean }

const order: Record<WarnStatus, number> = { act: 0, watch: 1, needs: 2, ok: 3 }

/** Every plant early warning, most urgent first (act, then watch, sooner limits first). */
export function earlyWarnings(i: WarningInput): Warning[] {
  const list = [
    ...(i.readings.length ? coilWarnings(i.readings, i.anomalies) : [{ id: 'coil', area: 'Coil cooling', furnace: null, title: 'Coil cooling', status: 'needs', headline: 'No furnace readings', days: null, rmPerMonth: null, series: null, evidence: [], action: 'Upload furnace readings (coil water in/out and flow) or connect live sensors.', basis: [], missing: ['Furnace readings with coil water'] } as Warning]),
    ...liningWarnings(i.heats, i.s, i.isDemo),
    ...(i.chem.length ? [chemWarning(i.heats, i.chem, i.s)!] : [{ id: 'chem', area: 'Chemistry', furnace: null, title: 'Chemistry', status: 'needs', headline: 'No lab results', days: null, rmPerMonth: null, series: null, evidence: [], action: 'Upload spectrometer results.', basis: [], missing: ['Spectrometer results'] } as Warning]),
    ...energyWarnings(i.heats, i.model, i.s),
  ]
  // A forecast further out than ~3 months rests on too little data to show as a date; the trend stays in the evidence.
  for (const w of list) if (w.days && w.days.mid > 90) w.days = null
  return list.sort((a, b) => order[a.status] - order[b.status] || (a.days?.mid ?? Infinity) - (b.days?.mid ?? Infinity) || (b.rmPerMonth ?? 0) - (a.rmPerMonth ?? 0))
}
