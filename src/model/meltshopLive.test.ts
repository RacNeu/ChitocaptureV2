import { describe, expect, it } from 'vitest'
import { defaultMelt, deriveHeats, findAnomalies, minutesOf } from './meltshop'
import { demoMeltShop } from './meltshopDemo'
import { shopAt, timeline } from './meltshopLive'

const demo = demoMeltShop()
const heats = deriveHeats(demo.heats, defaultMelt, 0.774)
const alarms = findAnomalies(demo.readings)

describe('shop at a moment', () => {
  it('follows one heat through melting, holding and tapping', () => {
    const h = heats.filter((x) => x.furnace === 'IF1').at(-3)!
    const tl = timeline(h)
    const at = (t: number) => shopAt(heats, demo.readings, alarms, t).furnaces.find((f) => f.furnace === 'IF1')!
    expect(at(tl.powerOnStart + 10).phase).toBe('melting')
    expect(at(tl.powerOnEnd + 3).phase).toBe('holding')
    expect(at(h.tapMin).phase).toBe('tapping')
    const mid = at(tl.powerOnStart + h.powerOnMin / 2)
    expect(mid.meltPct).toBeGreaterThan(30)
    expect(mid.meltPct).toBeLessThan(70)
    expect(mid.missingKwh).toBeGreaterThan(0)
  })
  it('puts heats on the ladle furnace and caster after tap, and logs events', () => {
    const h = heats.at(-20)!
    const tl = timeline(h)
    const s = shopAt(heats, demo.readings, alarms, tl.lfStart + 5)
    expect(s.lf?.heat.heat).toBe(h.heat)
    expect(s.events.some((e) => e.kind === 'tap' && e.text.includes(h.heat))).toBe(true)
    expect(s.tappedToday).toBeGreaterThan(0)
  })
  it('reports the IF3 coil alarm near its time', () => {
    const a = alarms.find((x) => x.furnace === 'IF3')!
    const s = shopAt(heats, demo.readings, alarms, minutesOf(a.at))
    expect(s.furnaces.find((f) => f.furnace === 'IF3')!.alarm).not.toBeNull()
    expect(s.events.some((e) => e.kind === 'alarm')).toBe(true)
  })
})
