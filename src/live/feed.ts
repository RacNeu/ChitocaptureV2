/**
 * Simulated live feed: a "virtual plant" that streams readings the way sensors on a real melt shop
 * would (one reading per furnace per plant-minute), plus the alert engine that watches them.
 *
 * Readings come from the induction heat physics in model/furnaceSim.ts, so they behave like the real
 * thing (power on while melting, coil water heating up, bath temperature rising). Faults can be
 * injected for demos. In a real plant this module is replaced by an MQTT subscription; the reading
 * format and the alert engine stay the same (see docs/live-monitoring.md).
 */
import { defaultSetPoints, pointAt, simulateHeat, type SetPoints, type SimHeat, type SimPhase } from '../model/furnaceSim'
import { quantile } from '../model/regress'

export type LiveReading = {
  /** Plant time, minutes since the feed started. */
  t: number
  furnace: string
  phase: SimPhase
  kw: number
  hz: number
  bathC: number | null
  waterInC: number
  waterOutC: number
  flowM3h: number
  /** Ground (earth) leakage current measured by the furnace's leak detector, mA. */
  leakMA: number
  heatNo: number
}

export type FaultId = 'coil-leak' | 'pump-trip' | 'lining-wear' | 'overheat'
export const faults: { id: FaultId; label: string; what: string }[] = [
  { id: 'coil-leak', label: 'Coil water leak', what: 'Coil cooling flow falls slowly and the water heats up.' },
  { id: 'pump-trip', label: 'Cooling pump trip', what: 'One coil-water pump stops: flow drops sharply.' },
  { id: 'lining-wear', label: 'Lining wearing through', what: 'Earth-leakage current climbs as metal gets closer to the coil.' },
  { id: 'overheat', label: 'Bath overheating', what: 'The bath runs far above the tap aim.' },
]

export const FURNACES = ['IF1', 'IF2', 'IF3', 'IF4']

/** One furnace's heats: slightly different set points per furnace; the pair partner is offset by half a heat. */
function furnaceHeat(f: string): { heat: SimHeat; offset: number } {
  const k = FURNACES.indexOf(f)
  const sp: SetPoints = { ...defaultSetPoints, powerMW: 30 + (k % 2) * 1.2, chargeT: 58 + k, holdMin: 12 + k * 2 }
  const heat = simulateHeat(sp)
  return { heat, offset: (k % 2 ? heat.totalMin / 2 : 0) + Math.floor(k / 2) * 17 }
}
const heats = new Map(FURNACES.map((f) => [f, furnaceHeat(f)]))

/** Repeatable noise: same furnace and minute always give the same wobble. */
function noise(f: string, t: number, salt: number) {
  let x = Math.sin((FURNACES.indexOf(f) + 1) * 12.9898 + Math.floor(t) * 78.233 + salt * 37.719) * 43_758.5453
  x -= Math.floor(x)
  return x * 2 - 1
}

/** A reading at plant time t for one furnace, with any active faults (fault start times in plant minutes). */
export function readingAt(f: string, t: number, active: Partial<Record<FaultId, { furnace: string; since: number }>>): LiveReading {
  const { heat, offset } = heats.get(f)!
  const total = heat.totalMin
  const tt = t + offset
  const within = ((tt % total) + total) % total
  const p = pointAt(heat, within)
  const fault = (id: FaultId) => { const a = active[id]; return a && a.furnace === f && t >= a.since ? t - a.since : null }
  let flow = 410 + 5 * noise(f, t, 1)
  const leakAge = fault('coil-leak'), tripAge = fault('pump-trip')
  if (leakAge !== null) flow *= 1 - Math.min(0.6, leakAge * 0.04)
  if (tripAge !== null) flow *= 0.32
  const waterIn = 32 + 0.4 * noise(f, t, 2)
  const coilHeatKW = p.coilHeatKW * (1 + 0.02 * noise(f, t, 3))
  const dT = coilHeatKW / (flow * 1_000 / 3_600 * 4.18)
  const wearAge = fault('lining-wear')
  const leak = 3 + 0.8 * noise(f, t, 4) + (wearAge !== null ? Math.min(32, wearAge * 1.6) : 0)
  const hotAge = fault('overheat')
  const bath = p.phase === 'charging' ? null : p.bathC + (hotAge !== null && p.phase !== 'melting' ? Math.min(55, hotAge * 4) : 0)
  return {
    t, furnace: f, phase: p.phase,
    kw: Math.max(0, p.powerKW * (1 + 0.01 * noise(f, t, 5))), hz: p.hz, bathC: bath === null ? null : Math.round(bath),
    waterInC: +waterIn.toFixed(1), waterOutC: +(waterIn + dT).toFixed(1), flowM3h: Math.round(flow), leakMA: +leak.toFixed(1),
    heatNo: Math.floor(tt / total) + 1,
  }
}

/* ---------------- Alert engine ---------------- */

export type AlertLevel = 'warn' | 'alarm'
export type LiveAlert = { id: string; key: string; furnace: string; level: AlertLevel; title: string; detail: string; action: string; t: number; active: boolean; clearedAt?: number }
export type Rule = { key: string; label: string; level: AlertLevel; limit: string; source: string }

/** Fixed limits (examples: a real plant uses its furnace maker's set points). */
export const rules: Rule[] = [
  { key: 'flow', label: 'Coil water flow low', level: 'alarm', limit: '< 300 m³/h', source: 'Example set point; coil OEM sets the real one' },
  { key: 'outlet', label: 'Coil water outlet hot', level: 'alarm', limit: '> 55 °C', source: 'Example set point; above this, scale forms and the coil can fail' },
  { key: 'dt', label: 'Coil water ΔT high', level: 'warn', limit: '> 20 °C', source: 'Normal melting ΔT here is ~15–17 °C' },
  { key: 'leak', label: 'Earth leakage (lining)', level: 'alarm', limit: '> 25 mA (warn > 15 mA)', source: 'Ground/leak detector: rising current means metal is nearing the coil' },
  { key: 'bath', label: 'Bath over tap aim', level: 'warn', limit: '> aim + 30 °C', source: 'Superheat wastes ~0.4 kWh/t per °C' },
  { key: 'anomaly', label: 'Unusual reading', level: 'warn', limit: '3 readings outside the furnace’s own normal band', source: 'Median ± 4 robust σ over the last hour, melting and idle judged separately' },
]

const actions: Record<string, string> = {
  flow: 'Check coil cooling pumps, filters and hoses; cut power until flow is back.',
  outlet: 'Reduce power and check cooling-tower temperature and flow.',
  dt: 'Watch the coil water; check flow and the heat exchanger.',
  leak: 'Stop melting and inspect the lining: metal may be close to the coil.',
  bath: 'Lower power or tap now: every °C over aim costs energy.',
  anomaly: 'Look at this signal’s trend on the HMI (F3).',
}

type Check = { key: string; level: AlertLevel; title: string; detail: string } | null

/** Rule checks for one reading. */
export function checkReading(r: LiveReading, tapAimC = 1_620): Check[] {
  const dT = r.waterOutC - r.waterInC
  return [
    r.flowM3h < 300 ? { key: 'flow', level: 'alarm', title: `${r.furnace} coil water flow low`, detail: `Flow ${r.flowM3h} m³/h (min 300) · outlet ${r.waterOutC} °C` } : null,
    r.waterOutC > 55 ? { key: 'outlet', level: 'alarm', title: `${r.furnace} coil water outlet hot`, detail: `Outlet ${r.waterOutC} °C (max 55) · flow ${r.flowM3h} m³/h` } : null,
    dT > 20 && r.waterOutC <= 55 ? { key: 'dt', level: 'warn', title: `${r.furnace} coil water ΔT high`, detail: `ΔT ${dT.toFixed(1)} °C (warn above 20)` } : null,
    r.leakMA > 25 ? { key: 'leak', level: 'alarm', title: `${r.furnace} earth leakage high`, detail: `${r.leakMA} mA (alarm above 25 mA)` }
      : r.leakMA > 15 ? { key: 'leak', level: 'warn', title: `${r.furnace} earth leakage rising`, detail: `${r.leakMA} mA (warn above 15 mA)` } : null,
    r.bathC !== null && r.bathC > tapAimC + 30 ? { key: 'bath', level: 'warn', title: `${r.furnace} bath over tap aim`, detail: `${r.bathC} °C, ${r.bathC - tapAimC} °C over the ${tapAimC} °C aim` } : null,
  ]
}

/** Streaming "unusual for this furnace" check on one signal (same method as the replay analysis). */
export function unusual(history: LiveReading[], signal: 'flowM3h' | 'leakMA', floor: number): boolean {
  if (history.length < 25) return false
  const last = history.slice(-3), past = history.slice(-63, -3)
  const on = (r: LiveReading) => r.kw > 5_000
  const same = past.filter((r) => on(r) === on(last[2])).map((r) => r[signal])
  if (same.length < 20) return false
  const med = quantile(same, 0.5), mad = quantile(same.map((v) => Math.abs(v - med)), 0.5)
  const half = Math.max(4 * 1.4826 * mad, floor)
  return last.every((r) => on(r) === on(last[2]) && Math.abs(r[signal] - med) > half)
}

/**
 * Update the alert list with a new reading: raise each rule once while it lasts, clear it after
 * 3 clean readings. Returns the alerts that were newly raised (these are what get sent to Telegram).
 */
export function updateAlerts(alerts: LiveAlert[], history: LiveReading[], r: LiveReading, tapAimC = 1_620): { alerts: LiveAlert[]; raised: LiveAlert[] } {
  const found = checkReading(r, tapAimC).filter((x): x is NonNullable<Check> => x !== null)
  if (unusual(history, 'flowM3h', 25) && !found.some((x) => x.key === 'flow')) found.push({ key: 'anomaly', level: 'warn', title: `${r.furnace} coil water flow unusual`, detail: `Flow ${r.flowM3h} m³/h is outside this furnace’s normal band` })
  if (unusual(history, 'leakMA', 3) && !found.some((x) => x.key === 'leak')) found.push({ key: 'anomaly', level: 'warn', title: `${r.furnace} earth leakage unusual`, detail: `${r.leakMA} mA is outside this furnace’s normal band` })
  const next = alerts.map((a) => ({ ...a }))
  const raised: LiveAlert[] = []
  for (const x of found) {
    const key = `${r.furnace}:${x.key}`
    const open = next.find((a) => a.key === key && a.active)
    if (open) { if (x.level === 'alarm' && open.level === 'warn') { open.level = 'alarm'; open.title = x.title; open.detail = x.detail; raised.push(open) } else open.detail = x.detail; continue }
    const a: LiveAlert = { id: `${key}:${r.t}`, key, furnace: r.furnace, level: x.level, title: x.title, detail: x.detail, action: actions[x.key], t: r.t, active: true }
    next.push(a); raised.push(a)
  }
  // Clear alerts for this furnace whose condition has been gone for 3 readings.
  for (const a of next) {
    if (!a.active || a.furnace !== r.furnace || found.some((x) => `${r.furnace}:${x.key}` === a.key)) continue
    const recent = history.slice(-3)
    const stillBad = recent.some((h) => checkReading(h, tapAimC).some((c) => c && `${h.furnace}:${c.key}` === a.key))
    if (!stillBad && r.t - a.t >= 3) { a.active = false; a.clearedAt = r.t }
  }
  return { alerts: next.slice(-60), raised }
}

/** The message a Telegram alert would carry (Telegram MarkdownV2-free plain text with emoji markers). */
export function telegramText(a: LiveAlert, site: string, clock: string): string {
  return `${a.level === 'alarm' ? '🚨 ALARM' : '⚠️ WARNING'} · ${a.title}\n${a.detail}\nTime ${clock} · ${site}\n➡️ ${a.action}`
}
