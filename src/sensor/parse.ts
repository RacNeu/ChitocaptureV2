export type Reading = {
  co2?: number
  co2_in?: number
  co2_out?: number
  temp?: number
  rh?: number
}

const keyMap: Record<string, keyof Reading> = {
  co2: 'co2', ppm: 'co2', co2_ppm: 'co2',
  co2_in: 'co2_in', in: 'co2_in', inlet: 'co2_in',
  co2_out: 'co2_out', out: 'co2_out', outlet: 'co2_out',
  temp: 'temp', t: 'temp', temperature: 'temp',
  rh: 'rh', humidity: 'rh',
}

/**
 * Parse one line from a sensor board. Accepts any of:
 *   {"co2": 612, "temp": 24.1, "rh": 55}
 *   {"co2_in": 5100, "co2_out": 820}
 *   CO2:612,T:24.1,RH:55        (key:value or key=value pairs)
 *   612                          (a bare number is treated as CO₂ ppm)
 * Returns null for anything that is not a usable reading.
 */
export function parseLine(line: string): Reading | null {
  const text = line.trim()
  if (!text) return null
  const out: Reading = {}
  const put = (rawKey: string, rawValue: unknown) => {
    const key = keyMap[rawKey.trim().toLowerCase()]
    const value = typeof rawValue === 'number' ? rawValue : Number(String(rawValue).trim())
    if (key && Number.isFinite(value)) out[key] = value
  }
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text) as Record<string, unknown>
      Object.entries(json).forEach(([key, value]) => put(key, value))
    } catch { return null }
  } else if (/^-?\d+(\.\d+)?$/.test(text)) {
    out.co2 = Number(text)
  } else {
    text.split(/[,;\s]+/).forEach((pair) => {
      const [key, value] = pair.split(/[:=]/)
      if (key && value !== undefined) put(key, value)
    })
  }
  return Object.keys(out).length ? out : null
}
