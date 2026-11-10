import { describe, expect, it } from 'vitest'
import { parseLine } from './parse'
import { analyseRig } from './rig'

describe('parseLine', () => {
  it('reads JSON, key:value pairs and bare numbers', () => {
    expect(parseLine('{"co2": 612, "temp": 24.1, "rh": 55}')).toEqual({ co2: 612, temp: 24.1, rh: 55 })
    expect(parseLine('CO2:612,T:24.1,RH:55')).toEqual({ co2: 612, temp: 24.1, rh: 55 })
    expect(parseLine('co2_in=5100 co2_out=820')).toEqual({ co2_in: 5100, co2_out: 820 })
    expect(parseLine('612')).toEqual({ co2: 612 })
  })

  it('ignores boot messages and broken lines', () => {
    expect(parseLine('ESP32 booting...')).toBeNull()
    expect(parseLine('{"co2": ')).toBeNull()
    expect(parseLine('')).toBeNull()
  })
})

describe('analyseRig', () => {
  it('integrates captured CO₂ into mmol per gram', () => {
    // 10 minutes at 1 L/min, inlet 10,000 ppm, outlet 0 → 0.01 × 10 L ÷ 22.414 = 4.4615 mmol
    const samples = Array.from({ length: 11 }, (_, minute) => ({ at: minute * 60_000, co2_in: 10_000, co2_out: 0 }))
    const result = analyseRig(samples, 1, 2)
    expect(result.capturedMmol).toBeCloseTo(4.4615, 3)
    expect(result.capacityMmolPerG).toBeCloseTo(2.2307, 3)
    expect(result.captureEfficiencyPct).toBeCloseTo(100)
    expect(result.breakthrough).toBe(0)
  })

  it('reports breakthrough and ignores gaps longer than five minutes', () => {
    const result = analyseRig([{ at: 0, co2_in: 1000, co2_out: 500 }, { at: 600_000, co2_in: 1000, co2_out: 900 }], 1, 1)
    expect(result.capturedMmol).toBe(0)
    expect(result.breakthrough).toBeCloseTo(0.9)
  })
})
