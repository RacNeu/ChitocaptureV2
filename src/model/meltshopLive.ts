/**
 * What the melt shop looks like at a given minute: each furnace's heat and phase, the ladle furnace,
 * the caster, heats in transport and an events log. Furnace phases come from the readings when they
 * exist; otherwise, and for the ladle furnace and caster, times are ESTIMATED from the heat log:
 * power-on ends 8 min before holding starts, the LF starts 10 min after tap, casting starts 10 min
 * after the LF and runs at the shop's average output. The UI labels these as estimated.
 */
import { coilLossKW, minutesOf, type Anomaly, type HeatView, type Reading } from './meltshop'

export type Phase = 'charging' | 'melting' | 'holding' | 'tapping' | 'idle'
export type FurnaceNow = {
  furnace: string
  phase: Phase
  heat: HeatView | null
  /** Minutes since this heat started and since the current phase began. */
  heatMin: number
  phaseMin: number
  kw: number
  hz: number | null
  bathC: number | null
  energyKwh: number
  /** Expected energy for the heat (its logged kWh) minus what has gone in. */
  missingKwh: number
  meltPct: number
  water: { inC: number; outC: number; flow: number; lossKW: number | null } | null
  alarm: Anomaly | null
  measured: boolean
  ratedKw: number
}
export type StationNow = { heat: HeatView; start: number; end: number; pct: number } | null
export type Transport = { heat: HeatView; route: string; since: number }
export type ShopEvent = { at: number; kind: 'tap' | 'power-on' | 'lf' | 'cast' | 'alarm'; text: string; furnace?: string }
export type ShopNow = { t: number; furnaces: FurnaceNow[]; lf: StationNow; caster: StationNow; transport: Transport[]; production: HeatView[]; events: ShopEvent[]; tappedToday: number; liquidOnFloorT: number }

const PREP_MIN = 8, LF_GAP = 10, CAST_GAP = 10

export function timeline(h: HeatView) {
  const powerOnEnd = h.tapMin - (h.holdMin ?? 0) - PREP_MIN
  const powerOnStart = powerOnEnd - h.powerOnMin
  const lfStart = h.tapMin + LF_GAP
  const lfEnd = lfStart + (h.lf?.minutes ?? 35)
  return { start: h.startMin, powerOnStart, powerOnEnd, tap: h.tapMin, lfStart, lfEnd }
}

export function shopAt(heats: HeatView[], readings: Reading[], anomalies: Anomaly[], t: number): ShopNow {
  const furnaces = [...new Set(heats.map((h) => h.furnace))].sort()
  const days = Math.max(1, (heats[heats.length - 1].tapMin - heats[0].startMin) / 1_440)
  const tPerMin = heats.reduce((a, h) => a + h.tappedT, 0) / (days * 1_440)
  const castMin = (h: HeatView) => Math.max(20, h.tappedT / Math.max(0.1, tPerMin))
  const byF = new Map<string, Reading[]>()
  for (const r of readings) byF.set(r.furnace, [...(byF.get(r.furnace) ?? []), r])

  const fNow = furnaces.map((f): FurnaceNow => {
    const hs = heats.filter((h) => h.furnace === f)
    const heat = hs.find((h) => t >= timeline(h).powerOnStart - 15 && t <= h.tapMin + 6) ?? null
    const rs = byF.get(f) ?? []
    const ratedKw = rs.length ? Math.max(...rs.map((r) => r.kw)) : Math.max(...hs.map((h) => h.mw * 1_000))
    // Reading at t (readings are minute-stamped strings; find the nearest within 2 min).
    let r: Reading | null = null
    if (rs.length) { let lo = 0, hi = rs.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (minutesOf(rs[m].at) < t) lo = m + 1; else hi = m } r = Math.abs(minutesOf(rs[lo].at) - t) <= 2 ? rs[lo] : null }
    const tl = heat ? timeline(heat) : null
    let phase: Phase = 'idle'
    if (tl) phase = t < tl.powerOnStart ? 'charging' : t < tl.powerOnEnd ? 'melting' : t < tl.tap - 3 ? 'holding' : 'tapping'
    if (r && tl) phase = r.kw > 0.45 * ratedKw ? 'melting' : t >= tl.tap - 3 && t <= tl.tap + 6 ? 'tapping' : t > tl.powerOnStart ? 'holding' : 'charging'
    const phaseStart = !tl ? t : phase === 'charging' ? tl.powerOnStart - 15 : phase === 'melting' ? tl.powerOnStart : phase === 'holding' ? tl.powerOnEnd : tl.tap - 3
    const energy = !heat || !tl ? 0 : r ? rs.filter((x) => { const m = minutesOf(x.at); return m >= tl.powerOnStart - 2 && m <= t }).reduce((a, x) => a + x.kw / 60, 0)
      : heat.kwh * Math.min(1, Math.max(0, (t - tl.powerOnStart) / heat.powerOnMin))
    const alarm = anomalies.find((a) => a.furnace === f && Math.abs(minutesOf(a.at) - t) <= 45) ?? null
    const bathC = r?.bathC ?? (heat && phase !== 'charging' && tl ? 1_200 + ((heat.tapTempC ?? 1_620) - 1_200) * Math.min(1, (t - tl.powerOnStart) / Math.max(1, heat.powerOnMin)) : null)
    return {
      furnace: f, phase, heat, heatMin: heat ? t - heat.startMin : 0, phaseMin: t - phaseStart,
      kw: r ? r.kw : phase === 'melting' && heat ? heat.mw * 1_000 : 0, hz: r?.hz ?? null, bathC: bathC !== null ? Math.round(bathC) : null,
      energyKwh: energy, missingKwh: heat ? Math.max(0, heat.kwh - energy) : 0, meltPct: heat ? Math.min(100, energy / heat.kwh * 100) : 0,
      water: r && r.waterInC !== undefined && r.waterOutC !== undefined && r.flowM3h !== undefined ? { inC: r.waterInC, outC: r.waterOutC, flow: r.flowM3h, lossKW: coilLossKW(r) } : null,
      alarm, measured: !!r, ratedKw,
    }
  })

  const lfHeat = heats.find((h) => { const tl = timeline(h); return t >= tl.lfStart && t < tl.lfEnd })
  const lf: StationNow = lfHeat ? (() => { const tl = timeline(lfHeat); return { heat: lfHeat, start: tl.lfStart, end: tl.lfEnd, pct: (t - tl.lfStart) / (tl.lfEnd - tl.lfStart) * 100 } })() : null
  const castHeat = heats.find((h) => { const s = timeline(h).lfEnd + CAST_GAP; return t >= s && t < s + castMin(h) })
  const caster: StationNow = castHeat ? (() => { const s = timeline(castHeat).lfEnd + CAST_GAP; return { heat: castHeat, start: s, end: s + castMin(castHeat), pct: (t - s) / castMin(castHeat) * 100 } })() : null
  const transport: Transport[] = []
  for (const h of heats) {
    const tl = timeline(h)
    if (t >= h.tapMin + 6 && t < tl.lfStart) transport.push({ heat: h, route: `${h.furnace} → LF`, since: h.tapMin })
    else if (t >= tl.lfEnd && t < tl.lfEnd + CAST_GAP) transport.push({ heat: h, route: 'LF → caster', since: tl.lfEnd })
  }
  const production = [...fNow.map((x) => x.heat).filter((x): x is HeatView => !!x), ...(lf ? [lf.heat] : []), ...(caster ? [caster.heat] : [])]

  const events: ShopEvent[] = []
  for (const h of heats) {
    const tl = timeline(h)
    if (tl.powerOnStart <= t && tl.powerOnStart > t - 360) events.push({ at: tl.powerOnStart, kind: 'power-on', text: `Power on · heat ${h.heat} · ${h.grade ?? ''} · ${h.chargeT.toFixed(1)} t charged`, furnace: h.furnace })
    if (h.tapMin <= t && h.tapMin > t - 360) events.push({ at: h.tapMin, kind: 'tap', text: `Tapped heat ${h.heat} · ${h.tappedT.toFixed(1)} t at ${h.tapTempC ?? '—'} °C · ${Math.round(h.kwhPerT)} kWh/t`, furnace: h.furnace })
    if (tl.lfStart <= t && tl.lfStart > t - 360) events.push({ at: tl.lfStart, kind: 'lf', text: `Ladle furnace started heat ${h.heat} (estimated)` })
    const cs = tl.lfEnd + CAST_GAP
    if (cs <= t && cs > t - 360) events.push({ at: cs, kind: 'cast', text: `Casting heat ${h.heat} (estimated)` })
  }
  for (const a of anomalies) { const m = minutesOf(a.at); if (m <= t && m > t - 720) events.push({ at: m, kind: 'alarm', text: `${a.signal === 'flowM3h' ? 'Coil water flow' : 'Coil water ΔT'} ${a.kind === 'drop' ? 'dropped' : 'rose'} to ${a.value.toFixed(1)} (normal ${a.normalLow.toFixed(1)}–${a.normalHigh.toFixed(1)})`, furnace: a.furnace }) }
  events.sort((x, y) => y.at - x.at)

  const dayStart = Math.floor(t / 1_440) * 1_440
  const tappedToday = heats.filter((h) => h.tapMin >= dayStart && h.tapMin <= t).reduce((a, h) => a + h.tappedT, 0)
  const liquidOnFloorT = fNow.reduce((a, x) => a + (x.heat && x.phase !== 'charging' ? x.heat.tappedT * x.meltPct / 100 : 0), 0) + (lf ? lf.heat.tappedT : 0) + transport.reduce((a, x) => a + x.heat.tappedT, 0)
  return { t, furnaces: fNow, lf, caster, transport, production, events, tappedToday, liquidOnFloorT }
}
