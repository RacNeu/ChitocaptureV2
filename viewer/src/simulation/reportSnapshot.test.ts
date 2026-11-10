import { describe, expect, it } from 'vitest'
import { createReportSnapshot, getAvailableReportPeriods } from './reportSnapshot'
import { createReportPdf } from './reportPdf'
import { getCurrentScenarioSnapshot, runScenario } from './scenarioRunner'

describe('report snapshots', () => {
  const annual = runScenario(getCurrentScenarioSnapshot(), 'yearly')

  it('offers monthly, quarterly, and annual periods from the same annual time series', () => {
    const monthly = getAvailableReportPeriods(annual.dailySamples, 'monthly')
    const quarterly = getAvailableReportPeriods(annual.dailySamples, 'quarterly')
    const yearly = getAvailableReportPeriods(annual.dailySamples, 'yearly')
    expect(monthly.some((period) => period.key === '2026-04')).toBe(true)
    expect(quarterly.some((period) => period.key === '2026-Q2')).toBe(true)
    expect(yearly.some((period) => period.key === '2026')).toBe(true)
  })

  it('aggregates only the selected reporting period and reconciles mass and energy', () => {
    const month = getAvailableReportPeriods(annual.dailySamples, 'monthly').find((period) => period.key === '2026-04')!
    const quarter = getAvailableReportPeriods(annual.dailySamples, 'quarterly').find((period) => period.key === '2026-Q2')!
    const year = getAvailableReportPeriods(annual.dailySamples, 'yearly').find((period) => period.key === '2026')!
    const monthlyReport = createReportSnapshot('monthly', month, annual, '2026-09-27T00:00:00.000Z')
    const quarterlyReport = createReportSnapshot('quarterly', quarter, annual, '2026-09-27T00:00:00.000Z')
    const annualReport = createReportSnapshot('yearly', year, annual, '2026-09-27T00:00:00.000Z')
    expect(monthlyReport.samples).toHaveLength(30)
    expect(quarterlyReport.samples).toHaveLength(91)
    expect(annualReport.samples).toHaveLength(275)
    expect(monthlyReport.validationResults.massBalanceOk).toBe(true)
    expect(monthlyReport.validationResults.energyBalanceOk).toBe(true)
    expect(monthlyReport.calculatedKPIs.regenerationMWh + monthlyReport.calculatedKPIs.gasHandlingMWh + monthlyReport.calculatedKPIs.auxiliariesMWh).toBeCloseTo(monthlyReport.calculatedKPIs.totalEnergyMWh, 7)
    expect(monthlyReport.calculatedKPIs.inputTonnes).toBeCloseTo(monthlyReport.calculatedKPIs.capturedTonnes + monthlyReport.calculatedKPIs.remainingTonnes, 7)
    expect(monthlyReport.calculatedKPIs.emissionReductionPercent).toBeCloseTo(monthlyReport.calculatedKPIs.captureEfficiency, 10)
    expect(monthlyReport.energyBreakdown.totalMWh).toBeCloseTo(monthlyReport.calculatedKPIs.totalEnergyMWh, 8)
    expect(monthlyReport.provenanceCounts.measured).toBe(0)
    expect(monthlyReport.validationResults.timeSeriesComplete).toBe(true)
  })

  it('retains traceable source metadata and remains unchanged after another scenario run', () => {
    const period = getAvailableReportPeriods(annual.dailySamples, 'monthly').find((item) => item.key === '2026-04')!
    const report = createReportSnapshot('monthly', period, annual, '2026-09-27T00:00:00.000Z')
    const savedInput = report.calculatedKPIs.inputTonnes
    const sourceIds = new Set(report.sources.map((source) => source.sourceId))
    expect(report.parameters.every((parameter) => sourceIds.has(parameter.sourceId))).toBe(true)
    expect(report.sources.find((source) => source.sourceId === 'SRC-CS-TEPA-700-2026')?.url).toContain('doi.org')
    runScenario({ ...annual.snapshot, co2Concentration: annual.snapshot.co2Concentration - 2 }, 'monthly')
    expect(report.calculatedKPIs.inputTonnes).toBe(savedInput)
    expect(report.scenario.co2Concentration).toBe(annual.snapshot.co2Concentration)
  })

  it('exports a structured multi-page PDF with page numbering and simulation status', async () => {
    const period = getAvailableReportPeriods(annual.dailySamples, 'monthly').find((item) => item.key === '2026-04')!
    const report = createReportSnapshot('monthly', period, annual, '2026-09-27T00:00:00.000Z')
    const pdf = await createReportPdf(report).text()
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('Carbon Capture Performance Report')
    expect(pdf).toContain('DATA STATUS: SIMULATION-BASED')
    expect(pdf).toContain(`${report.reportId}) Tj`)
    const pageCount = pdf.match(/\/Type \/Page /g)?.length ?? 0
    expect(pageCount).toBeGreaterThanOrEqual(12)
    expect(pageCount).toBeLessThanOrEqual(18)
    expect(pdf).toContain('Appendix F - Validation Checklist')
    expect(pdf.endsWith('%%EOF')).toBe(true)
  })
})
