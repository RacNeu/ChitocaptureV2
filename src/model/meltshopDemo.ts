/**
 * DEMO melt shop: ILLUSTRATIVE, not a real plant. Sized to Masteel's published scale (60 t induction
 * furnaces, ~650–800 kt/yr; docs/induction-furnace-model.md §7b): four 60 t induction furnaces on two
 * power supplies (IF1/IF2 and IF3/IF4 share one each, so one melts while the other holds and taps),
 * one ladle furnace, October 2026. Generated the same way every time (seeded) and never stored, so it
 * can't be mistaken for uploaded data.
 *
 * Built-in physics, in kWh/t (so tests and the Melt shop pages can check the model learns it back):
 * holding +0.35/min, lid open +0.6/min, tap temperature +0.4/°C above 1,620, cold lining +100,
 * shredded share −15, turnings share +30, furnace fill −60 per 100%, IF4 (older coil) +15.
 *
 * Built-in events: night shift holds longer; Sunday 08:00–14:00 maintenance stop (next heat on each
 * furnace starts on a cold lining); a new lining on IF2 on 12 Oct; IF3 coil cooling water flow falls
 * on the last afternoon (should raise an anomaly); a few heats over the copper / CEV limits.
 */
import { seeded } from './regress'
import { minutesOf, stamp, type Chem, type MeltHeat, type MeltShop, type Reading, type ScrapType } from './meltshop'

export const DEMO_TRUTH = { holdMin: 0.35, lidOpenMin: 0.6, tapTempC: 0.4, coldLining: 100, shredded: -15, turnings: 30, fill: -60 }
const CU: Record<ScrapType, number> = { hms: 0.26, shredded: 0.17, turnings: 0.34, pigIron: 0.01, returns: 0.14, dri: 0.005 }

export function demoMeltShop(): MeltShop {
  const r = seeded(50_006)
  const heats: MeltHeat[] = []
  const chem: Chem[] = []
  const start = minutesOf('2026-10-01 00:00'), end = minutesOf('2026-11-01 00:00')
  const pairs: [string, string][] = [['IF1', 'IF2'], ['IF3', 'IF4']]
  let n = 0
  for (const [pi, pair] of pairs.entries()) {
    let t = start + pi * 35
    let turn = 0
    const lastTap: Record<string, number> = {}
    const cold: Record<string, boolean> = { [pair[0]]: true, [pair[1]]: true }
    const liningHeat: Record<string, number> = { [pair[0]]: 40 + pi * 30, [pair[1]]: 85 + pi * 10 }
    while (t < end) {
      const d = new Date(t * 60_000), h = d.getUTCHours(), dow = d.getUTCDay()
      if (dow === 0 && h >= 8 && h < 14) { t = Math.floor(t / 1_440) * 1_440 + 14 * 60; cold[pair[0]] = cold[pair[1]] = true; continue }
      const furnace = pair[turn % 2]
      turn += 1
      if (furnace === 'IF2' && !liningHeat.relined && t > minutesOf('2026-10-12 06:00')) { liningHeat[furnace] = 0; liningHeat.relined = 1; cold[furnace] = true }
      const night = h >= 23 || h < 7
      // Charge recipe (tonnes).
      const chargeT = Math.min(62, r.range(52, 62.5))
      const shred = r.range(0.15, 0.45), turnS = r.range(0.04, 0.25), pig = r.range(0, 0.08), ret = r.range(0.04, 0.1)
      const hms = Math.max(0.1, 1 - shred - turnS - pig - ret)
      const charge = { hms: hms * chargeT, shredded: shred * chargeT, turnings: turnS * chargeT, pigIron: pig * chargeT, returns: ret * chargeT }
      const yield_ = 0.955 - 0.06 * turnS + r.gauss() * 0.006
      const tappedT = chargeT * yield_
      const fill = chargeT / 62
      const hold = Math.max(2, r.range(6, 22) + (night ? 7 : 0) + (r.next() < 0.05 ? r.range(20, 50) : 0))
      const lid = Math.max(1, r.range(3, 9) + (night ? 2 : 0))
      const tap = Math.round(1_622 + r.gauss() * 10 + (night ? 8 : 0))
      const isCold = cold[furnace]
      const kwhPerT = 500 + DEMO_TRUTH.holdMin * hold + DEMO_TRUTH.lidOpenMin * lid + DEMO_TRUTH.tapTempC * (tap - 1_620) + (isCold ? DEMO_TRUTH.coldLining : 0)
        + DEMO_TRUTH.shredded * shred + DEMO_TRUTH.turnings * turnS + DEMO_TRUTH.fill * (fill - 0.95) + (furnace === 'IF4' ? 15 : 0) + r.gauss() * 10
      const kwh = kwhPerT * tappedT
      const mw = r.range(29, 33)
      const powerOn = kwh / 1_000 / mw * 60
      const tapAt = t + powerOn + hold + 8
      const ttt = lastTap[furnace] ? tapAt - lastTap[furnace] : powerOn + hold + 30
      lastTap[furnace] = tapAt
      cold[furnace] = false
      liningHeat[furnace] += 1
      n += 1
      const heat = `26${String.fromCharCode(65 + pi)}${String(n).padStart(4, '0')}`
      const lfIn = tap - r.range(35, 50)
      const lfOut = 1_595 + r.gauss() * 6
      const lfKwhPerT = 0.23 * Math.max(5, lfOut - lfIn + 20) / 0.17 * r.range(0.8, 1.0)
      heats.push({
        furnace, heat, at: stamp(Math.round(tapAt)), grade: r.next() < 0.8 ? 'B500B' : 'B500A',
        powerOnMin: Math.round(powerOn), tapToTapMin: Math.round(Math.max(ttt, powerOn + hold + 10)), holdMin: Math.round(hold), lidOpenMin: Math.round(lid),
        kwh: Math.round(kwh), chargeT: +chargeT.toFixed(1), tappedT: +tappedT.toFixed(1), heelT: 0, tapTempC: tap, coldLining: isCold, liningHeat: liningHeat[furnace],
        charge: Object.fromEntries(Object.entries(charge).map(([k, v]) => [k, +v.toFixed(1)])),
        lf: {
          kwh: Math.round(lfKwhPerT * tappedT), minutes: Math.round(r.range(28, 45)), electrodeKg: Math.round(r.range(0.28, 0.45) * tappedT),
          limeKg: Math.round(r.range(7, 11) * tappedT), alloyKg: Math.round(r.range(8, 11) * tappedT), alloyCarbonKg: Math.round(r.range(0.25, 0.4) * tappedT),
          tempInC: Math.round(lfIn), tempOutC: Math.round(lfOut), preheatGJ: +(r.range(0.25, 0.45) * tappedT).toFixed(1),
        },
      })
      const cu = (Object.entries(charge) as [ScrapType, number][]).reduce((a, [k, v]) => a + CU[k] * v, 0) / chargeT + r.gauss() * 0.02
      const mn = r.range(0.62, 0.95) + (r.next() < 0.03 ? 0.6 : 0)
      chem.push({ heat, C: +(r.range(0.16, 0.212) + (r.next() < 0.015 ? 0.02 : 0)).toFixed(3), Mn: +mn.toFixed(2), Si: +r.range(0.15, 0.3).toFixed(2), S: +r.range(0.018, 0.045).toFixed(3), P: +r.range(0.015, 0.04).toFixed(3), Cu: +Math.max(0.05, cu).toFixed(3), Cr: +r.range(0.06, 0.14).toFixed(2), Ni: +r.range(0.06, 0.12).toFixed(2), Mo: +r.range(0.01, 0.03).toFixed(3), V: 0.002, Sn: +r.range(0.008, 0.02).toFixed(3), N: +r.range(0.007, 0.011).toFixed(4) })
      t += powerOn + r.range(12, 20) // charging, sampling and turnaround on the shared power supply
    }
  }
  heats.sort((a, b) => a.at.localeCompare(b.at))
  return { heats, chem, readings: demoReadings(heats, r), source: 'Demo melt shop (illustrative)', demo: true }
}

/** One reading a minute for the last 48 hours per furnace, following the demo heats. */
function demoReadings(heats: MeltHeat[], r: ReturnType<typeof seeded>): Reading[] {
  const out: Reading[] = []
  const last = Math.max(...heats.map((h) => minutesOf(h.at)))
  const from = last - 48 * 60
  for (const f of ['IF1', 'IF2', 'IF3', 'IF4']) {
    const hs = heats.filter((h) => h.furnace === f).map((h) => { const tap = minutesOf(h.at); return { tap, on0: tap - (h.holdMin ?? 0) - 8 - h.powerOnMin, on1: tap - (h.holdMin ?? 0) - 8, mw: h.kwh / 1_000 / (h.powerOnMin / 60), tapC: h.tapTempC ?? 1_620 } })
    for (let t = from; t <= last; t += 1) {
      const h = hs.find((x) => t >= x.on0 && t <= x.tap + 5)
      const on = !!h && t <= h.on1
      const kw = on ? h!.mw * 1_000 * (0.96 + 0.04 * r.next()) : h ? 1_200 + 300 * r.next() : 150
      const bath = h ? (on ? 1_200 + (h.tapC - 1_200) * (t - h.on0) / (h.on1 - h.on0) : h.tapC - 0.2 * (t - h.on1)) : undefined
      let flow = 410 + r.gauss() * 4
      const waterIn = 32 + r.gauss() * 0.3
      // Melting: ~26% of the power leaves in coil water (DOE measured 26–29%): 31 MW × 0.26 ≈ 8 MW ≈ 410 m³/h × 17 °C.
      let dT = (on ? 17 : 3) + r.gauss() * 0.3
      // IF3 coil cooling fault on the last afternoon: flow falls, ΔT climbs.
      if (f === 'IF3' && t > last - 6 * 60 && t < last - 5 * 60) { const k = (t - (last - 6 * 60)) / 60; flow -= 140 * k; dT *= 1 + 0.9 * k }
      out.push({ at: stamp(t), furnace: f, kw: Math.round(kw), bathC: bath !== undefined ? Math.round(bath) : undefined, waterInC: +waterIn.toFixed(1), waterOutC: +(waterIn + dT).toFixed(1), flowM3h: Math.round(flow), hz: on ? Math.round(200 + 20 * r.next()) : undefined })
    }
  }
  return out
}
