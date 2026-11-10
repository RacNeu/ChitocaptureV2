import { describe, expect, it } from 'vitest'
import type { ActivityData, CalculationRecord, Organisation, Site } from '../types/organisationCarbon'
import { buildBusinessReportPages } from './businessReportContent'
import { createBusinessReportSnapshot, getBusinessReportMetrics, getBusinessReportPeriods } from './businessReportSnapshot'
import { createBusinessReportArtifact } from './reportPdf'

const organisation: Organisation = { organisationId: 'org-1', organisationName: 'QA Test Company' }
const site: Site = { siteId: 'site-1', organisationId: organisation.organisationId, siteName: 'Malaysia Plant' }
function record(id: string, period: string, emissions: number, partial: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    recordId: `record-${id}-${period}`, activityId: id, organisationId: organisation.organisationId, siteId: site.siteId,
    reportingPeriod: period, category: 'Electricity', activityValue: 100, activityUnit: 'kWh', factorId: 'factor-1',
    factorValue: 0.4, factorUnit: 'kg CO2e/kWh', normalisedActivityValue: 100, normalisedUnit: 'kWh', gasType: 'CO2e',
    calculatedKgCO2e: emissions * 1000, calculatedTCO2e: emissions, scope: 'Scope 2', dataStatus: 'COMPANY PROVIDED',
    calculationMethod: 'test', calculatedAt: `${period}-28T00:00:00.000Z`, validationStatus: 'valid', sourceId: 'source-1', ...partial,
  }
}

describe('business report snapshots and exports', () => {
  it('builds selectable periods and aggregates only the frozen reporting period', () => {
    const inventory = [record('a', '2026-01', 4), record('b', '2026-02', 7), record('c', '2026-02', 3)]
    const periods = getBusinessReportPeriods(inventory, 'monthly')
    expect(periods.map((period) => period.key)).toEqual(['2026-01', '2026-02'])
    const snapshot = createBusinessReportSnapshot({
      reportType: 'monthly-performance', generatedAt: '2026-03-01T00:00:00.000Z', organisation, site, sites: [site],
      period: periods[1], comparisonPeriod: periods[0], allBoundaryRecords: inventory, activities: [], factors: [], sources: [], targets: [],
    })
    expect(getBusinessReportMetrics(snapshot).total).toBe(10)
    expect(getBusinessReportMetrics(snapshot).previousTotal).toBe(4)
    inventory[1].calculatedTCO2e = 100
    expect(getBusinessReportMetrics(snapshot).total).toBe(10)
  })

  it('renders an explicit no-inventory state without fabricating chart history', () => {
    const snapshot = createBusinessReportSnapshot({
      reportType: 'monthly-performance', generatedAt: '2026-03-01T00:00:00.000Z', organisation, site: null, sites: [site],
      period: { grain: 'monthly', key: '2026-02', label: 'February 2026', start: '2026-02-01', end: '2026-02-28' },
      allBoundaryRecords: [], activities: [], factors: [], sources: [], targets: [],
    })
    const pages = buildBusinessReportPages(snapshot)
    expect(pages.some((page) => page.notes?.some((note) => note.includes('No organisational emissions records')))).toBe(true)
    expect(pages.flatMap((page) => page.charts ?? []).some((chart) => chart.kind === 'line' && chart.rows.length > 0)).toBe(false)
  })

  it('includes ranked, unquantified reduction screening in the Emission Hotspots report', () => {
    const activities: ActivityData[] = [
      { activityId: 'kiln', organisationId: organisation.organisationId, siteId: site.siteId, reportingPeriod: '2026-02', category: 'Industrial Activity', activityType: 'Cement kiln', activityValue: 100, unit: 'tonnes', factorId: 'factor-1', scopeClassification: 'Scope 1', dataStatus: 'COMPANY PROVIDED', industry: 'Cement', processType: 'Cement kiln', isPointSource: true, captureCompatible: true },
      { activityId: 'power', organisationId: organisation.organisationId, siteId: site.siteId, reportingPeriod: '2026-02', category: 'Electricity', activityType: 'Grid electricity', activityValue: 100, unit: 'kWh', factorId: 'factor-1', scopeClassification: 'Scope 2', dataStatus: 'COMPANY PROVIDED', isPointSource: false, captureCompatible: false },
    ]
    const inventory = [
      record('kiln', '2026-02', 60, { category: 'Industrial Activity', scope: 'Scope 1' }),
      record('power', '2026-02', 30, { category: 'Electricity', scope: 'Scope 2' }),
    ]
    const snapshot = createBusinessReportSnapshot({
      reportType: 'hotspots', generatedAt: '2026-03-01T00:00:00.000Z', organisation, site, sites: [site],
      period: { grain: 'monthly', key: '2026-02', label: 'February 2026', start: '2026-02-01', end: '2026-02-28' },
      allBoundaryRecords: inventory, activities, factors: [], sources: [], targets: [],
    })
    const pages = buildBusinessReportPages(snapshot)
    const opportunities = pages.find((page) => page.id === 'reduction-opportunities')
    expect(opportunities?.title).toBe('Reduction Opportunities')
    expect(opportunities?.tables?.[0].rows).toEqual([
      ['1', 'Cement kiln · Industrial Activity · Scope 1 · Malaysia Plant', '60.00 tCO₂e · 66.7%', 'Process-efficiency assessment · Heat and energy optimisation · Material-efficiency opportunities · Fuel-switching feasibility · Point-source CO₂ capture feasibility'],
      ['2', 'Grid electricity · Electricity · Scope 2 · Malaysia Plant', '30.00 tCO₂e · 33.3%', 'Energy-efficiency assessment · Equipment and operating-schedule optimisation · On-site renewable generation assessment · Renewable electricity procurement'],
    ])
    expect(opportunities?.notes?.join(' ')).toContain('Reduction potential is not yet quantified')
    expect(opportunities?.notes?.join(' ')).toContain('does not store an Action Plan')
  })

  it('exports a numbered vector PDF and exposes actual section page destinations', async () => {
    const snapshot = createBusinessReportSnapshot({
      reportType: 'annual-inventory', generatedAt: '2026-03-01T00:00:00.000Z', organisation, site: null, sites: [site],
      period: { grain: 'yearly', key: '2026', label: '2026', start: '2026-01-01', end: '2026-12-31' },
      allBoundaryRecords: [record('a', '2026-01', 4)], activities: [], factors: [], sources: [], targets: [],
    })
    const pages = buildBusinessReportPages(snapshot)
    const artifact = createBusinessReportArtifact(snapshot, pages)
    const pdf = await artifact.blob.text()
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf).toContain('Saved activity records')
    expect(pdf).toContain('1 / ')
    expect(artifact.pageCount).toBeGreaterThanOrEqual(2)
    expect(artifact.sectionPages['inventory-detail']).toBeGreaterThan(1)
    expect(artifact.sectionPages['inventory-detail']).toBeLessThanOrEqual(artifact.pageCount)
    expect(pdf.endsWith('%%EOF')).toBe(true)
  })
})
