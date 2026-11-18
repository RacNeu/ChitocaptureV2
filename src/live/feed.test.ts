import { describe, expect, it } from 'vitest'
import { FURNACES, readingAt, telegramText, updateAlerts, type FaultId, type LiveAlert, type LiveReading } from './feed'

/** Run the feed for `minutes` plant-minutes and collect every alert raised. */
function run(minutes: number, fault?: { id: FaultId; furnace: string; since: number }) {
  const active = fault ? { [fault.id]: { furnace: fault.furnace, since: fault.since } } : {}
  const hist = new Map<string, LiveReading[]>(FURNACES.map((f) => [f, []]))
  let alerts: LiveAlert[] = []
  const raised: LiveAlert[] = []
  for (let t = 0; t < minutes; t += 1) for (const f of FURNACES) {
    const r = readingAt(f, t, active)
    const h = hist.get(f)!
    const u = updateAlerts(alerts, h, r)
    alerts = u.alerts; raised.push(...u.raised)
    h.push(r); if (h.length > 120) h.shift()
  }
  return { alerts, raised, hist }
}

describe('simulated live feed', () => {
  it('behaves like a furnace: power while melting, coil water warmer while on', () => {
    const rs = Array.from({ length: 200 }, (_, t) => readingAt('IF1', t, {}))
    const melting = rs.filter((r) => r.phase === 'melting'), charging = rs.filter((r) => r.phase === 'charging')
    expect(Math.min(...melting.map((r) => r.kw))).toBeGreaterThan(25_000)
    expect(Math.max(...charging.map((r) => r.kw))).toBeLessThan(500)
    expect(melting[10].waterOutC - melting[10].waterInC).toBeGreaterThan(charging[2].waterOutC - charging[2].waterInC + 5)
  })
  it('raises no alarms on a healthy plant over 4 hours', () => {
    const { raised } = run(240)
    expect(raised.filter((a) => a.level === 'alarm')).toHaveLength(0)
    expect(raised.length).toBeLessThan(3)
  })
  it.each([
    ['pump-trip', 'flow'],
    ['coil-leak', 'flow'],
    ['lining-wear', 'leak'],
  ] as const)('%s on IF2 raises a %s alarm, once', (id, key) => {
    const { raised } = run(200, { id, furnace: 'IF2', since: 60 })
    const hits = raised.filter((a) => a.key === `IF2:${key}`)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((a) => a.level === 'alarm')).toBe(true)
    expect(hits.length).toBeLessThanOrEqual(2) // a warning may escalate to an alarm, but never repeats
    expect(raised.some((a) => !a.furnace.startsWith('IF2') && a.level === 'alarm')).toBe(false)
  })
  it('writes a readable Telegram message', () => {
    const { raised } = run(120, { id: 'pump-trip', furnace: 'IF3', since: 30 })
    const text = telegramText(raised.find((a) => a.level === 'alarm')!, 'Steel mini-mill', '14:32')
    expect(text).toMatch(/^🚨 ALARM · IF3 coil water flow low/)
    expect(text).toMatch(/➡️ Check coil cooling pumps/)
  })
})
