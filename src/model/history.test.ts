import { describe, expect, it } from 'vitest'
import { defaultTaxInputs, rmPerTonne, singaporePath, taxBill, taxableT } from './carbonTax'
import { anomalies, CSV_TEMPLATE, diffRecords, evidenceShare, fitSeries, forecast, importCsv, monthFromIndex, monthIndex, parseMonth, predict, sampleHistory, scopesFor, targetCheck, yearTotals } from './history'
import { outlook } from './outlook'
import { freshState } from './store'

const mill = { ...freshState('steel'), onboarded: true }

describe('carbon tax (Singapore reference)', () => {
  it('follows Singapore’s legislated path and converts to RM', () => {
    expect(singaporePath().find((p) => p.year === 2026)!.sgdPerT).toBe(45)
    expect(rmPerTonne(2026, { ...defaultTaxInputs, rmPerSGD: 3.3 })).toBeCloseTo(148.5)
    expect(rmPerTonne(2030, { ...defaultTaxInputs, rateCase: 'high' })).toBeCloseTo(80 * defaultTaxInputs.rmPerSGD)
    expect(rmPerTonne(2035, defaultTaxInputs)).toBe(rmPerTonne(2030, defaultTaxInputs))
  })
  it('taxes Scope 1 only by default, less any exempt share', () => {
    expect(taxableT(100, 50, defaultTaxInputs)).toBe(100)
    expect(taxableT(100, 50, { ...defaultTaxInputs, coverage: 'scope1and2', exemptShare: 0.2 })).toBeCloseTo(120)
    expect(taxBill([{ year: 2026, scope1T: 1_000, scope2T: 5_000 }], defaultTaxInputs)[0].billRM).toBeCloseTo(1_000 * 45 * defaultTaxInputs.rmPerSGD)
  })
})

describe('monthly history', () => {
  it('reads common month formats', () => {
    expect(parseMonth('2025-3')).toBe('2025-03')
    expect(parseMonth('03/2025')).toBe('2025-03')
    expect(parseMonth('Mar 2025')).toBe('2025-03')
    expect(parseMonth('Mar-25')).toBe('2025-03')
    expect(parseMonth('2025-03-31')).toBe('2025-03')
    expect(parseMonth('13/2025')).toBeNull()
    expect(monthFromIndex(monthIndex('2025-12') + 1)).toBe('2026-01')
  })
  it('imports the template, converting kWh and diesel litres', () => {
    const { records, error } = importCsv(CSV_TEMPLATE)
    expect(error).toBeUndefined()
    expect(records).toHaveLength(2)
    expect(records[0].electricityMWh).toBeCloseTo(24_500)
    expect(records[0].fuelGJ.diesel).toBeCloseTo(12_000 * 0.0386)
    expect(records[0].productionT).toBe(51_000)
  })
  it('handles semicolons, thousands separators and bad rows', () => {
    const { records, warnings } = importCsv('Month;Electricity_kWh;Production_t\n2025-01;"1,000,000";500\nfoo;1;1\n2025-02;abc;1')
    expect(records).toHaveLength(1)
    expect(records[0].electricityMWh).toBe(1_000)
    expect(warnings.length).toBeGreaterThanOrEqual(2)
  })
  it('rejects files without month or electricity', () => {
    expect(importCsv('a,b\n1,2').error).toBeTruthy()
  })
  it('splits Scope 1 and Scope 2', () => {
    const s = scopesFor({ month: '2025-01', electricityMWh: 1_000, fuelGJ: { 'natural-gas': 1_000, biomass: 500 }, processT: 10, productionT: 100 }, mill.settings)
    expect(s.scope1T).toBeCloseTo(56.1 + 10)
    expect(s.scope2T).toBeCloseTo(1_000 * 0.774)
    expect(s.scope2MarketT).toBeCloseTo(s.scope2T)
  })
  it('reports market-based Scope 2 with green electricity at zero', () => {
    const record = { month: '2025-01', electricityMWh: 1_000, greenMWh: 300, fuelGJ: {}, processT: 0, productionT: 100 }
    const s = scopesFor(record, mill.settings)
    expect(s.scope2T).toBeCloseTo(774)
    expect(s.scope2MarketT).toBeCloseTo(700 * 0.774)
    expect(scopesFor(record, { ...mill.settings, residualKgPerKWh: 0.8 }).scope2MarketT).toBeCloseTo(560)
    expect(scopesFor({ ...record, greenMWh: 5_000 }, mill.settings).scope2MarketT).toBe(0)
  })
  it('reads a green electricity column in kWh', () => {
    const { records, warnings } = importCsv(['month,electricity_kwh,green_kwh', '2025-01,1000000,250000', '2025-02,1000000,2000000'].join('\n'))
    expect(records[0].greenMWh).toBeCloseTo(250)
    expect(records[1].greenMWh).toBeCloseTo(1_000)
    expect(warnings.some((w) => w.includes('capped'))).toBe(true)
  })
  it('lists field-level changes between two uploads', () => {
    const a = [{ month: '2025-01', electricityMWh: 100, fuelGJ: { 'natural-gas': 10 }, processT: 0, productionT: 5 }]
    const b = [{ month: '2025-01', electricityMWh: 120, fuelGJ: { 'natural-gas': 10 }, processT: 0, productionT: 5 }, { month: '2025-02', electricityMWh: 90, fuelGJ: {}, processT: 0, productionT: 4 }]
    expect(diffRecords(a, b)).toEqual([{ month: '2025-01', field: 'Electricity MWh', from: 100, to: 120 }, { month: '2025-02', field: 'Month', from: null, to: 1 }])
    expect(diffRecords(b, b)).toEqual([])
    expect(evidenceShare([{ ...a[0], evidence: [{ name: 'bill.pdf', sizeBytes: 1, sha256: 'x', kind: 'electricity', at: '', who: '' }] }, b[1]])).toBe(0.5)
  })
})

describe('forecast', () => {
  it('recovers a linear trend with a seasonal pattern', () => {
    const values = Array.from({ length: 36 }, (_, k) => ({ index: 24_000 + k, value: (100 + k) * (k % 12 === 1 ? 0.8 : 1.02) }))
    const fit = fitSeries(values, true)
    expect(fit.slope).toBeGreaterThan(0.8)
    expect(predict(fit, 24_000 + 37) / predict(fit, 24_000 + 38)).toBeLessThan(0.85)
  })
  it('forecasts the sample mill sensibly, with a band', () => {
    const months = sampleHistory(mill, '2026-10').map((r) => scopesFor(r, mill.settings))
    const result = forecast(months, 12)
    expect(result.months).toHaveLength(12)
    expect(result.months[0].month).toBe('2026-11')
    const lastYear = months.slice(-12).reduce((sum, m) => sum + m.totalT, 0)
    const nextYear = result.months.reduce((sum, m) => sum + m.totalT, 0)
    expect(nextYear / lastYear).toBeGreaterThan(0.9)
    expect(nextYear / lastYear).toBeLessThan(1.15)
    for (const m of result.months) { expect(m.lowT).toBeLessThan(m.totalT); expect(m.highT).toBeGreaterThan(m.totalT) }
  })
  it('flags the faulty month in the sample history', () => {
    const records = sampleHistory(mill, '2026-10')
    const found = anomalies(records)
    expect(found.some((a) => a.month === records[records.length - 8].month && a.metric === 'Electricity per tonne' && a.direction === 'high')).toBe(true)
  })
  it('checks the target on emissions per tonne when production is known', () => {
    const months = sampleHistory(mill, '2026-10').map((r) => scopesFor(r, mill.settings))
    const years = yearTotals(months, forecast(months, 60).months)
    const check = targetCheck(years, { ...mill.settings, baselineYear: 2024, targetYear: 2030, targetReductionPct: 25 })
    expect(check.basis).toBe('intensity')
    expect(check.onTrack).toBe(false)
    expect(check.gapT).toBeGreaterThan(0)
  })
  it('builds a full outlook without NaN', () => {
    expect(outlook(mill).empty).toBe(true)
    expect(outlook(mill).months).toHaveLength(0)
    const view = outlook({ ...mill, monthly: sampleHistory(mill, '2026-10') })
    expect(view.empty).toBe(false)
    expect(view.last12.count).toBe(12)
    expect(view.tax.length).toBeGreaterThan(0)
    expect(JSON.stringify(view)).not.toMatch(/NaN|null,"scope1T"|Infinity/)
  })
})
