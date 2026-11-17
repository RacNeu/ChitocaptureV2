import { describe, expect, it } from 'vitest'
import { parseLine } from './parse'

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
