import { describe, expect, it } from 'vitest'
import { analyseInterval, DEFAULT_TARIFF, importIntervalRows, parseTimestamp, sampleInterval, timeAt } from './interval'
import { freshState } from './store'

const mill = { ...freshState('steel'), onboarded: true }

describe('half-hourly import', () => {
  it('reads common timestamp formats', () => {
    expect(parseTimestamp('2026-08-01 00:30')).toBe('2026-08-01T00:30')
    expect(parseTimestamp('01/08/2026 13:00')).toBe('2026-08-01T13:00')
    expect(parseTimestamp('2026-08-01T07:30:00')).toBe('2026-08-01T07:30')
    expect(parseTimestamp('yesterday')).toBeNull()
  })
  it('converts kWh per half hour to kW and keeps gaps', () => {
    const rows = [['Date', 'Time', 'kWh']]
    for (let k = 0; k < 100; k += 1) {
      if (k === 50) continue
      const t = new Date(Date.UTC(2026, 7, 1) + k * 1_800_000)
      rows.push([`${String(t.getUTCDate()).padStart(2, '0')}/08/2026`, t.toISOString().slice(11, 16), '500'])
    }
    const fixed = rows
    const result = importIntervalRows(fixed, 'test.csv')
    expect(result.error).toBeUndefined()
    expect(result.series!.kW[0]).toBe(1_000)
    expect(result.series!.kW.filter((v) => v === null)).toHaveLength(1)
    expect(result.warnings.join(' ')).toMatch(/missing/)
  })
  it('rejects files without demand or time', () => {
    expect(importIntervalRows([['a', 'b'], ['1', '2'], ['3', '4']], 'x').error).toBeTruthy()
  })
})

describe('load-profile analysis', () => {
  const series = sampleInterval(mill, '2026-11')
  const a = analyseInterval(series)
  it('builds three months that match the site’s yearly electricity', () => {
    expect(series.start).toBe('2026-08-01T00:00')
    expect(a.months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10'])
    const yearlyMWh = mill.machines.reduce((s, m) => s + m.electricityMWh, 0)
    expect(a.avgKW / (yearlyMWh * 1_000 / 8_760)).toBeCloseTo(1, 2)
  })
  it('finds the coincident peak as the maximum demand', () => {
    for (const m of a.months) {
      expect(m.mdAt.slice(11, 13)).toBe('14')
      expect(m.mdRM).toBeCloseTo(m.mdKW * DEFAULT_TARIFF.mdRMPerKW)
    }
  })
  it('shows that moving a few hours of load cuts maximum demand', () => {
    const shave = a.months[0].shave
    expect(shave[0].hours).toBe(1)
    expect(shave[0].kW).toBeGreaterThan(0)
    for (let k = 1; k < shave.length; k += 1) expect(shave[k].kW).toBeGreaterThanOrEqual(shave[k - 1].kW)
  })
  it('separates running, idle and off time', () => {
    expect(a.share.running + a.share.idle + a.share.off).toBeCloseTo(1)
    // Sunday maintenance (12 h a week) is idle: about 7% of the time, plus furnace delays.
    expect(a.share.idle).toBeGreaterThan(0.05)
    expect(a.idle.rm).toBeCloseTo(a.idle.mwh * DEFAULT_TARIFF.energyRMPerMWh)
    expect(a.profile.sunday[24]).toBeLessThan(a.profile.weekday[24])
  })
  it('lays out a day × half-hour grid', () => {
    expect(a.days_).toHaveLength(92)
    expect(a.days_[0].kW).toHaveLength(48)
    expect(timeAt(series, 48)).toBe('2026-08-02T00:00')
  })
})
