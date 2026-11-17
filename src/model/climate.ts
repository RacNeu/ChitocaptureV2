/**
 * Real climate history for a site from NASA POWER (power.larc.nasa.gov): daily maximum temperature
 * and rainfall, 1996–2025, from the MERRA-2 reanalysis on a grid of about 50 km. Free, no key.
 *
 * A grid cell is smoother than a weather station (peaks read a little lower), so heat and rain are
 * judged against the site's OWN history: how often the recent 15 years exceed what was extreme in
 * the earlier 15 years. That trend is what matters for risk, and it is robust to the smoothing.
 */

export const CLIMATE_YEARS = { from: 1996, to: 2025, split: 2010 }
export const CLIMATE_SOURCE = 'NASA POWER daily point data (MERRA-2 reanalysis, ~0.5° grid), 1996–2025'

export type ClimateSummary = {
  lat: number
  lon: number
  fetchedAt: string
  source: string
  hot: { thresholdC: number; earlyPerYear: number; recentPerYear: number; maxC: number; maxDate: string }
  rain: { thresholdMm: number; earlyPerYear: number; recentPerYear: number; max1DayMm: number; max1DayDate: string; max3DayMm: number; max3DayDate: string }
  /** Average rainfall by calendar month, mm. */
  monthlyRainMm: number[]
  days: number
}

type Daily = Record<string, number>

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))] : 0
}
const fmt = (key: string) => `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`

/** Summarise daily T2M_MAX (°C) and PRECTOTCORR (mm/day) series. Missing values (-999) are skipped. */
export function summariseClimate(tmax: Daily, rain: Daily, lat: number, lon: number, fetchedAt = new Date().toISOString()): ClimateSummary {
  const keys = Object.keys(tmax).filter((k) => tmax[k] > -900 && rain[k] !== undefined && rain[k] > -900).sort()
  const early = keys.filter((k) => Number(k.slice(0, 4)) <= CLIMATE_YEARS.split)
  const recent = keys.filter((k) => Number(k.slice(0, 4)) > CLIMATE_YEARS.split)
  const years = (list: string[]) => Math.max(1, new Set(list.map((k) => k.slice(0, 4))).size)
  // "Extreme" = the hottest 5% / wettest 1% of days in the earlier period.
  const hotT = quantile(early.map((k) => tmax[k]), 0.95)
  const wetT = quantile(early.map((k) => rain[k]), 0.99)
  const count = (list: string[], test: (k: string) => boolean) => list.filter(test).length
  let maxC = -Infinity, maxCKey = '', max1 = -Infinity, max1Key = '', max3 = -Infinity, max3Key = ''
  const monthSum = new Array(12).fill(0), monthYears = new Array(12).fill(0).map(() => new Set<string>())
  keys.forEach((k, i) => {
    if (tmax[k] > maxC) { maxC = tmax[k]; maxCKey = k }
    if (rain[k] > max1) { max1 = rain[k]; max1Key = k }
    if (i >= 2) { const three = rain[keys[i - 2]] + rain[keys[i - 1]] + rain[k]; if (three > max3) { max3 = three; max3Key = k } }
    const m = Number(k.slice(4, 6)) - 1
    monthSum[m] += rain[k]; monthYears[m].add(k.slice(0, 4))
  })
  return {
    lat, lon, fetchedAt, source: CLIMATE_SOURCE, days: keys.length,
    hot: { thresholdC: hotT, earlyPerYear: count(early, (k) => tmax[k] >= hotT) / years(early), recentPerYear: count(recent, (k) => tmax[k] >= hotT) / years(recent), maxC, maxDate: maxCKey ? fmt(maxCKey) : '' },
    rain: { thresholdMm: wetT, earlyPerYear: count(early, (k) => rain[k] >= wetT) / years(early), recentPerYear: count(recent, (k) => rain[k] >= wetT) / years(recent), max1DayMm: max1, max1DayDate: max1Key ? fmt(max1Key) : '', max3DayMm: max3, max3DayDate: max3Key ? fmt(max3Key) : '' },
    monthlyRainMm: monthSum.map((s, m) => s / Math.max(1, monthYears[m].size)),
  }
}

export function validCoords(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
}

/** Fetch 30 years of daily data for one point from NASA POWER (sends only the coordinates). */
export async function fetchClimate(lat: number, lon: number): Promise<ClimateSummary> {
  if (!validCoords(lat, lon)) throw new Error('Enter a valid latitude and longitude.')
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M_MAX,PRECTOTCORR&community=RE&latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start=${CLIMATE_YEARS.from}0101&end=${CLIMATE_YEARS.to}1231&format=JSON`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`NASA POWER returned ${response.status}. Try again later.`)
  const data = await response.json() as { properties?: { parameter?: { T2M_MAX?: Daily; PRECTOTCORR?: Daily } } }
  const p = data.properties?.parameter
  if (!p?.T2M_MAX || !p.PRECTOTCORR) throw new Error('NASA POWER returned no data for this point.')
  return summariseClimate(p.T2M_MAX, p.PRECTOTCORR, lat, lon)
}
