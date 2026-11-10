import type { ReportSnapshot } from './reportSnapshot'
import { formatMalaysiaDateTime } from '../utils/malaysiaTime'
import type { BusinessReportSnapshot } from './businessReportSnapshot'
import type { PreviewPage, ReportChart } from './businessReportContent'
import { getBusinessReportMetrics } from './businessReportSnapshot'

const PAGE_W = 595
const PAGE_H = 842
const NAVY = '0.08 0.19 0.28'
const GREEN = '0.12 0.57 0.4'
const INK = '0.13 0.22 0.28'
const MUTED = '0.38 0.46 0.5'
const GRID = '0.83 0.87 0.88'
const PAPER = '0.96 0.975 0.97'
const safe = (value: unknown) => String(value ?? '').replaceAll('CO₂', 'CO2').replaceAll('CO₃', 'CO3').replaceAll('NOₓ', 'NOx').replaceAll('–', '-').replaceAll('÷', '/').replaceAll('·', '-').replaceAll('≥', '>=').replaceAll('≤', '<=').replaceAll('×', 'x').replace(/[^ -~]/g, '?')
const esc = (value: unknown) => safe(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)')
const fmt = (n: number | null | undefined, digits = 1) => typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }) : 'Not available'

class PdfDocument {
  pages: Array<{ commands: string[]; y: number }> = []
  tocPageNumbers = new Map<string, number>()
  constructor(private reportId: string, private numberCover = false) { this.newPage() }
  get page() { return this.pages[this.pages.length - 1] }
  get pageNumber() { return this.pages.length }
  newPage() { this.pages.push({ commands: [], y: 786 }); return this.page }
  ensure(height = 24) { if (this.page.y - height < 68) this.newPage() }
  raw(command: string) { this.page.commands.push(command) }
  text(value: unknown, x = 48, size = 9, bold = false, color = INK, y = this.page.y) {
    this.raw(`${color} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${y} Td (${esc(value)}) Tj ET`)
  }
  line(x1: number, y1: number, x2: number, y2: number, color = GRID, width = 0.6) { this.raw(`${color} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`) }
  rect(x: number, y: number, w: number, h: number, fill: string, stroke?: string) { this.raw(`${fill} rg ${stroke ? `${stroke} RG 0.7 w` : ''} ${x} ${y} ${w} ${h} re ${stroke ? 'B' : 'f'}`) }
  paragraph(value: unknown, size = 9, color = MUTED, maxChars = 105) {
    const words = safe(value).split(/\s+/); let current = ''
    const lines: string[] = []
    for (const word of words) { if (`${current} ${word}`.trim().length > maxChars && current) { lines.push(current); current = word } else current = `${current} ${word}`.trim() }
    if (current) lines.push(current)
    for (const line of lines) { this.ensure(size + 6); this.text(line, 48, size, false, color); this.page.y -= size + 5 }
  }
  heading(title: string, toc = false) {
    this.ensure(48)
    if (toc) this.tocPageNumbers.set(title, this.pageNumber)
    this.page.y -= 7; this.text(title, 48, 15, true, NAVY); this.page.y -= 12
    this.line(48, this.page.y, 547, this.page.y, '0.72 0.83 0.82', 1.1); this.page.y -= 18
  }
  subheading(title: string) { this.ensure(30); this.text(title, 48, 10, true, GREEN); this.page.y -= 16 }
  labelValue(label: string, value: unknown, status?: string) {
    const left = safe(label); const right = safe(value)
    const chunks = wrap(right, 54)
    const height = Math.max(18, chunks.length * 10 + 4); this.ensure(height)
    this.text(left.slice(0, 36), 48, 8, true, MUTED)
    chunks.forEach((chunk, index) => this.text(chunk, 228, 8, false, INK, this.page.y - index * 10))
    if (status) this.text(status.toUpperCase(), 475, 6, true, statusColor(status), this.page.y)
    this.page.y -= height
  }
  table(headers: string[], rows: Array<Array<string | number>>, widths: number[], fontSize = 7) {
    const x0 = 48; const tableW = widths.reduce((a, b) => a + b, 0)
    const drawHeader = () => {
      this.ensure(40); this.rect(x0, this.page.y - 19, tableW, 20, NAVY)
      let x = x0; headers.forEach((header, index) => { this.text(header, x + 5, 7, true, '1 1 1', this.page.y - 13); x += widths[index] })
      this.page.y -= 23
    }
    drawHeader()
    for (const row of rows) {
      // Helvetica glyph widths vary, so keep a conservative character budget to
      // prevent long IDs and uppercase registry labels from crossing columns.
      const lines = row.map((cell, index) => {
        const maxChars = Math.max(6, Math.floor(widths[index] / (fontSize * 0.62)))
        return wrap(safe(cell), maxChars)
      })
      const lineCount = Math.max(...lines.map((items) => items.length), 1); const rowH = Math.max(16, lineCount * (fontSize + 1) + 5)
      if (this.page.y - rowH < 65) { this.newPage(); drawHeader() }
      if (Math.floor((this.page.y - 65) / rowH) % 2 === 0) this.rect(x0, this.page.y - rowH + 3, tableW, rowH, '0.97 0.98 0.975')
      let x = x0
      row.forEach((_, index) => { lines[index].forEach((line, lineIndex) => this.text(line, x + 5, fontSize, false, INK, this.page.y - 9 - lineIndex * (fontSize + 1))); x += widths[index] })
      this.page.y -= rowH; this.line(x0, this.page.y + 2, x0 + tableW, this.page.y + 2, GRID, 0.35)
    }
    this.page.y -= 10
  }
  section(_title: string, _toc = true) { this.newPage() }
  contents(entries: string[], reportPeriod: string) {
    this.newPage(); this.heading('Contents')
    this.paragraph(`Report sections and page references. Reporting period: ${reportPeriod}`, 9)
    for (const entry of entries) {
      this.ensure(23); const page = this.tocPageNumbers.get(entry) ?? ''
      this.text(entry, 58, 9, false, INK); this.text(String(page), 520, 9, true, NAVY); this.line(58, this.page.y - 5, 532, this.page.y - 5, GRID, 0.35); this.page.y -= 24
    }
  }
  finish() {
    const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>']
    const pageIds = this.pages.map((_, i) => 5 + i * 2)
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${this.pages.length} >>`
    this.pages.forEach((page, index) => {
      if (index > 0 || this.numberCover) {
        page.commands.push(`0.48 0.55 0.58 rg BT /F1 7 Tf 48 31 Td (${esc(this.reportId)}) Tj ET`)
        page.commands.push(`0.48 0.55 0.58 rg BT /F1 7 Tf 510 31 Td (${index + 1} / ${this.pages.length}) Tj ET`)
        page.commands.push(`0.8 0.84 0.85 RG 0.4 w 48 46 m 547 46 l S`)
      }
      const stream = page.commands.join('\n'); const pageId = 5 + index * 2; const contentId = pageId + 1
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`)
      objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`)
    })
    let pdf = '%PDF-1.4\n%ChitoCapture\n'; const offsets = [0]
    objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
    const xref = new TextEncoder().encode(pdf).length
    pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
    return new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' })
  }
}

function wrap(value: string, max: number) {
  const words = value.split(/\s+/).flatMap((word) => {
    if (word.length <= max) return [word]
    const segments: string[] = []
    for (let index = 0; index < word.length; index += max) segments.push(word.slice(index, index + max))
    return segments
  })
  const lines: string[] = []; let line = ''
  for (const word of words) {
    if (`${line} ${word}`.trim().length > max && line) { lines.push(line); line = word }
    else line = `${line} ${word}`.trim()
  }
  if (line) lines.push(line)
  return lines
}
function statusColor(status: string) { return status.toLowerCase().includes('literature') ? GREEN : status.toLowerCase().includes('simulat') ? '0.18 0.39 0.72' : status.toLowerCase().includes('measured') ? GREEN : '0.72 0.43 0.15' }
function sourceValue(parameter: ReportSnapshot['parameters'][number]) { return `${parameter.value}${parameter.unit ? ` ${parameter.unit}` : ''}` }
function bucketsFor(report: ReportSnapshot) {
  const buckets = new Map<string, { label: string; baseline: number; treated: number; captured: number; energy: number; regeneration: number; gas: number; auxiliaries: number; efficiency: number[] }>()
  for (const sample of report.timeSeriesData) {
    const date = new Date(new Date(sample.timestamp).getTime() - 1)
    const key = report.reportType === 'monthly' ? `${date.getUTCFullYear()}-${date.getUTCMonth()}-${date.getUTCDate()}` : `${date.getUTCFullYear()}-${date.getUTCMonth()}`
    const label = report.reportType === 'monthly' ? String(date.getUTCDate()) : new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date)
    const entry = buckets.get(key) ?? { label, baseline: 0, treated: 0, captured: 0, energy: 0, regeneration: 0, gas: 0, auxiliaries: 0, efficiency: [] }
    entry.baseline += sample.baselineEmissionsT; entry.treated += sample.treatedEmissionsT; entry.captured += sample.baselineEmissionsT - sample.treatedEmissionsT
    entry.energy += sample.energyMWh; entry.regeneration += sample.regenerationEnergyMWh; entry.gas += sample.gasHandlingEnergyMWh; entry.auxiliaries += sample.coolingEnergyMWh + sample.auxiliariesEnergyMWh; entry.efficiency.push(sample.captureEfficiency)
    buckets.set(key, entry)
  }
  return [...buckets.values()]
}
function verticalChart(doc: PdfDocument, title: string, groups: Array<{ label: string; values: number[] }>, names: string[], colors: string[], units = '') {
  doc.ensure(230); doc.subheading(title); const top = doc.page.y - 8; const chartH = 126; const left = 75; const right = 535; const base = top - chartH
  doc.line(left, base, right, base, MUTED, 0.6); doc.line(left, base, left, top, MUTED, 0.6)
  const max = Math.max(1e-9, ...groups.flatMap((group) => group.values));
  for (let i = 1; i <= 4; i++) { const y = base + chartH * i / 4; doc.line(left, y, right, y, '0.89 0.91 0.91', 0.35); doc.text(fmt(max * i / 4, 0), 48, 6, false, MUTED, y - 2) }
  const slot = (right - left) / Math.max(groups.length, 1); const bw = Math.min(13, slot * 0.32)
  groups.forEach((group, index) => {
    const center = left + slot * (index + 0.5); const groupWidth = group.values.length * bw + (group.values.length - 1) * 2
    group.values.forEach((value, series) => { const h = chartH * value / max; doc.rect(center - groupWidth / 2 + series * (bw + 2), base, bw, h, colors[series] ?? GREEN) })
    if (groups.length <= 16 || index % Math.ceil(groups.length / 16) === 0) doc.text(group.label, center - 7, 6, false, MUTED, base - 12)
  })
  doc.page.y = base - 34
  names.forEach((name, i) => { doc.rect(80 + i * 180, doc.page.y + 1, 8, 8, colors[i]); doc.text(`${name} (${units})`, 92 + i * 180, 7, false, MUTED) })
  doc.page.y -= 19
}
function stackedEnergyChart(doc: PdfDocument, groups: ReturnType<typeof bucketsFor>) {
  doc.ensure(225); doc.subheading('Stacked energy components by reporting interval (MWh)')
  const top = doc.page.y - 8; const chartH = 126; const left = 75; const right = 535; const base = top - chartH
  doc.line(left, base, right, base, MUTED, 0.6); doc.line(left, base, left, top, MUTED, 0.6)
  const max = Math.max(1e-9, ...groups.map((group) => group.energy));
  for (let i = 1; i <= 4; i++) { const y = base + chartH * i / 4; doc.line(left, y, right, y, '0.89 0.91 0.91', 0.35); doc.text(fmt(max * i / 4, 1), 48, 6, false, MUTED, y - 2) }
  const colors = ['0.12 0.57 0.4', '0.25 0.48 0.68', '0.77 0.58 0.23', '0.64 0.72 0.74']
  const slot = (right - left) / Math.max(groups.length, 1); const bw = Math.min(13, slot * 0.64)
  groups.forEach((group, index) => {
    const x = left + slot * (index + 0.5) - bw / 2; let y = base
    const values = [group.regeneration, group.gas, group.auxiliaries, Math.max(0, group.energy - group.regeneration - group.gas - group.auxiliaries)]
    values.forEach((value, series) => { const h = chartH * value / max; if (h > 0) doc.rect(x, y, bw, h, colors[series]); y += h })
    if (groups.length <= 16 || index % Math.ceil(groups.length / 16) === 0) doc.text(group.label, x - 3, 6, false, MUTED, base - 12)
  })
  const labels = ['Regeneration', 'Gas handling', 'Cooling + auxiliaries', 'Other']
  const positions = [76, 184, 290, 431]
  labels.forEach((label, index) => { doc.rect(positions[index], base - 27, 8, 8, colors[index]); doc.text(label, positions[index] + 11, 6, false, MUTED, base - 26) })
  doc.page.y = base - 43
}
function lineChart(doc: PdfDocument, title: string, groups: ReturnType<typeof bucketsFor>, values: (bucket: ReturnType<typeof bucketsFor>[number]) => number, color = GREEN, unit = '%') {
  doc.ensure(220); doc.subheading(title); const top = doc.page.y - 8; const chartH = 126; const left = 75; const right = 535; const base = top - chartH
  doc.line(left, base, right, base, MUTED, 0.6); doc.line(left, base, left, top, MUTED, 0.6)
  const nums = groups.map(values); const max = Math.max(1, ...nums); const min = Math.min(0, ...nums); const range = Math.max(1e-9, max - min)
  for (let i = 0; i <= 4; i++) { const y = base + chartH * i / 4; doc.line(left, y, right, y, '0.89 0.91 0.91', 0.35); doc.text(`${fmt(min + range * i / 4, 1)}${unit}`, 45, 6, false, MUTED, y - 2) }
  if (groups.length === 1) { const y = base + chartH * (nums[0] - min) / range; doc.rect(left + 2, y - 2, 4, 4, color) }
  else for (let i = 1; i < groups.length; i++) { const x1 = left + (right - left) * (i - 1) / (groups.length - 1); const x2 = left + (right - left) * i / (groups.length - 1); const y1 = base + chartH * (nums[i - 1] - min) / range; const y2 = base + chartH * (nums[i] - min) / range; doc.raw(`${color} RG 1.8 w ${x1} ${y1} m ${x2} ${y2} l S`); doc.rect(x2 - 1.5, y2 - 1.5, 3, 3, color) }
  groups.forEach((group, index) => { if (groups.length <= 16 || index % Math.ceil(groups.length / 16) === 0) { const x = left + (right - left) * index / Math.max(1, groups.length - 1); doc.text(group.label, x - 5, 6, false, MUTED, base - 12) } })
  doc.page.y = base - 28
}
function sourceLabel(type: string) { return type === 'literature' ? 'LITERATURE' : type === 'simulated' ? 'SIMULATED' : 'ASSUMED' }

export function createReportPdf(report: ReportSnapshot): Blob {
  const doc = new PdfDocument(report.reportId); const k = report.calculatedKPIs; const scenario = report.scenario; const buckets = bucketsFor(report)
  const sectionTitles = [
    '1. Executive Summary', '2. Source Configuration & Feed Gas', '3. Capture System Configuration',
    '4. Emissions Performance', '5. CO2 Capture Performance', '6. Energy Analysis', '7. Carbon Flow & Operations',
    '8. Data Quality & Sources', '9. Methodology, Assumptions & Limitations', '10. Appendices',
  ]

  // Cover, drawn entirely with vector primitives.
  doc.rect(0, 560, PAGE_W, 282, NAVY); doc.rect(47, 755, 38, 38, GREEN); doc.text('C', 59, 16, true, '1 1 1', 765)
  doc.text('ChitoCapture', 48, 18, true, '1 1 1', 696); doc.text('Carbon Capture Performance Report', 48, 12, true, '0.72 0.87 0.82', 668)
  doc.text(report.reportType.toUpperCase() + ' REPORT', 48, 9, true, '0.74 0.83 0.86', 638); doc.text(report.reportingPeriod.label, 48, 20, true, '1 1 1', 600)
  // Simplified vector process schematic.
  doc.line(86, 482, 496, 482, '0.68 0.8 0.82', 4); doc.rect(118, 414, 50, 68, '0.35 0.58 0.6', '0.8 0.9 0.87'); doc.rect(255, 390, 66, 92, GREEN, '0.8 0.9 0.87'); doc.rect(389, 430, 46, 52, '0.43 0.59 0.64', '0.8 0.9 0.87'); doc.rect(482, 372, 17, 110, '0.36 0.47 0.52')
  doc.text('PRE-TREATMENT', 102, 6, true, '1 1 1', 398); doc.text('ADSORBER', 270, 6, true, '1 1 1', 373); doc.text('REGEN.', 394, 6, true, '1 1 1', 416); doc.text('STACK', 478, 6, true, '1 1 1', 355)
  doc.page.y = 326; doc.labelValue('Industry', scenario.industry); doc.labelValue('Emission source', scenario.emissionSource); doc.labelValue('Site', scenario.site); doc.labelValue('Scenario ID', report.scenarioId); doc.labelValue('Report ID', report.reportId); doc.labelValue('Generated (MYT)', formatMalaysiaDateTime(report.generatedAt)); doc.labelValue('Data status', 'SIMULATION-BASED; no measured plant data registered')
  doc.text('DATA STATUS: SIMULATION-BASED', 48, 8, true, GREEN, 84)
  doc.paragraph('Prepared from the active ChitoCapture scenario, centralized parameter and source registries, and the shared simulation calculation engine.');

  // A placeholder contents page is filled after section page numbers are known.
  doc.newPage(); const tocPage = doc.page

  doc.section(sectionTitles[0]); doc.heading(sectionTitles[0], true)
  doc.paragraph(`This ${report.reportType} model report covers ${report.reportingPeriod.start} through ${report.reportingPeriod.end} using ${report.timeSeriesSummary.sampleCount} daily simulation samples.`)
  for (const [title, value] of [
    ['Baseline CO2 emissions', `${fmt(k.baselineEmissions)} t`], ['With-capture CO2 emissions', `${fmt(k.treatedEmissions)} t`], ['CO2 captured', `${fmt(k.capturedTonnes)} t`], ['Emission reduction', `${fmt(k.emissionReductionPercent, 2)}%`], ['Capture efficiency', `${fmt(k.captureEfficiency, 2)}%`], ['Energy consumed', `${fmt(k.totalEnergyMWh)} MWh`], ['Energy per tonne captured', `${fmt(k.energyIntensityKWhPerTonne)} kWh/tCO2`], ['Carbon intensity', k.carbonIntensity == null ? 'Not available - product output is not configured' : fmt(k.carbonIntensity)], ['Data completeness', `${report.dataCompleteness.percent}% (${report.dataCompleteness.count}/${report.dataCompleteness.total})`],
  ]) doc.labelValue(title, value)
  doc.paragraph(`Within the modeled boundary, ${fmt(k.inputTonnes)} tCO2 entered the capture calculation. The model estimates ${fmt(k.capturedTonnes)} t captured and ${fmt(k.remainingTonnes)} t remaining in treated gas. These are simulation outputs, not verified measurements.`)
  doc.paragraph(`Period mass balance: ${report.validationResults.massBalanceOk ? 'PASS' : 'CHECK'}. Energy components reconcile: ${report.validationResults.energyBalanceOk ? 'PASS' : 'CHECK'}.`)
  verticalChart(doc, 'Reporting-period emissions at a glance', [{ label: 'Period', values: [k.baselineEmissions, k.treatedEmissions] }], ['Baseline', 'With capture'], ['0.65 0.72 0.76', GREEN], 't CO2')

  doc.section(sectionTitles[1]); doc.heading(sectionTitles[1], true); doc.paragraph('Source configuration copied from the selected scenario at snapshot time.');
  doc.table(['Configuration', 'Value', 'Provenance', 'Source ID'], report.parameters.filter((p) => p.category === 'SOURCE CONFIGURATION').map((p) => [p.name, sourceValue(p), sourceLabel(p.sourceType), p.sourceId]), [110, 160, 75, 154])
  doc.paragraph('Report boundary: configured flue-gas capture system. No separate upstream, downstream product or lifecycle inventory is modeled.');
  doc.subheading('Feed gas conditions'); doc.paragraph('Feed conditions represented in the modeled scenario.');
  doc.table(['Feed parameter', 'Value', 'Status', 'Source ID'], report.parameters.filter((p) => p.category === 'FEED GAS CONDITIONS').map((p) => [p.name, sourceValue(p), sourceLabel(p.sourceType), p.sourceId]), [140, 130, 75, 154])
  doc.paragraph('The feed flow and concentration are configured inputs. Inlet readings displayed elsewhere in the prototype remain simulated values and are not real-time plant instrumentation.');

  doc.section(sectionTitles[2]); doc.heading(sectionTitles[2], true); doc.paragraph('Capture-system parameters are shown with their registry provenance. The model working capacity is the scenario input used by calculations; it is not interchangeable with a literature reference capacity.');
  doc.table(['Capture parameter', 'Value', 'Status', 'Source ID'], report.parameters.filter((p) => p.category === 'CHITOSAN CAPTURE UNIT').map((p) => [p.name, sourceValue(p), sourceLabel(p.sourceType), p.sourceId]), [140, 130, 75, 154])
  const literatureCapacity = report.parameters.find((p) => p.id === 'literature-reference-capacity')
  if (literatureCapacity) doc.labelValue('Literature reference capacity', `${sourceValue(literatureCapacity)}; reference data only`)
  doc.labelValue('Scenario working capacity', `${scenario.workingCapacity} mmol/g; used in simulation`)

  doc.section(sectionTitles[3]); doc.heading(sectionTitles[3], true); doc.paragraph('Totals are period sums from the shared simulation time series.');
  doc.table(['Measure', 'Baseline', 'With capture', 'Unit'], [['CO2 emissions', fmt(k.baselineEmissions), fmt(k.treatedEmissions), 't CO2'], ['Absolute reduction', '-', fmt(k.absoluteReduction), 't CO2'], ['Reduction vs baseline', '-', `${fmt(k.emissionReductionPercent, 2)}%`, '%']], [135, 120, 130, 114])
  verticalChart(doc, 'Grouped emissions by reporting interval', buckets.map((b) => ({ label: b.label, values: [b.baseline, b.treated] })), ['Baseline', 'Treated'], ['0.65 0.72 0.76', GREEN], 't CO2')
  doc.paragraph('The chart groups baseline and treated emissions by daily interval for monthly reports and by month for quarterly and yearly reports.');

  doc.section(sectionTitles[4]); doc.heading(sectionTitles[4], true); doc.paragraph('The capture balance uses the same period totals as the Carbon Flow calculation.');
  doc.labelValue('CO2 input', `${fmt(k.inputTonnes)} t CO2`); doc.labelValue('CO2 captured', `${fmt(k.capturedTonnes)} t CO2`); doc.labelValue('CO2 remaining', `${fmt(k.remainingTonnes)} t CO2`); doc.labelValue('Capture efficiency', `${fmt(k.captureEfficiency, 2)}%`)
  doc.rect(48, doc.page.y - 42, 499, 34, PAPER, GRID); doc.text(`${fmt(k.inputTonnes)} input = ${fmt(k.capturedTonnes)} captured + ${fmt(k.remainingTonnes)} remaining t CO2`, 61, 9, true, NAVY, doc.page.y - 28); doc.page.y -= 52
  doc.labelValue('Mass-balance validation', report.validationResults.massBalanceOk ? 'PASS within calculation tolerance' : `CHECK; residual ${fmt(k.balanceErrorTonnes, 6)} t`)
  doc.labelValue('Sample efficiency minimum / average / maximum', `${fmt(k.minimumCaptureEfficiency, 2)}% / ${fmt(k.averageCaptureEfficiency, 2)}% / ${fmt(k.maximumCaptureEfficiency, 2)}%`)
  lineChart(doc, 'Capture efficiency over reporting period', buckets, (b) => b.efficiency.length ? b.efficiency.reduce((a, c) => a + c, 0) / b.efficiency.length : 0)
  doc.paragraph('Cycle count, adsorbent loading profile and transient bed breakthrough are not available from the current daily simulation output.');

  doc.section(sectionTitles[5]); doc.heading(sectionTitles[5], true); doc.paragraph('Energy values are aggregated from the same ScenarioSample outputs used in Carbon Flow and the Executive Dashboard.');
  doc.table(['Energy KPI', 'Value', 'Unit'], [['Total energy', fmt(k.totalEnergyMWh), 'MWh'], ['Energy per CO2 captured', fmt(k.energyIntensityKWhPerTonne), 'kWh/t CO2'], ['Daily average', fmt(k.averageDailyKWh, 0), 'kWh/day']], [220, 150, 129])
  doc.table(['Energy component', 'Energy', 'Share of total'], [['Regeneration / desorption', `${fmt(report.energyBreakdown.regenerationMWh)} MWh`, `${fmt(k.totalEnergyMWh ? report.energyBreakdown.regenerationMWh / k.totalEnergyMWh * 100 : 0, 1)}%`], ['Gas handling', `${fmt(report.energyBreakdown.gasHandlingMWh)} MWh`, `${fmt(k.totalEnergyMWh ? report.energyBreakdown.gasHandlingMWh / k.totalEnergyMWh * 100 : 0, 1)}%`], ['Cooling', `${fmt(report.energyBreakdown.coolingMWh)} MWh`, `${fmt(k.totalEnergyMWh ? report.energyBreakdown.coolingMWh / k.totalEnergyMWh * 100 : 0, 1)}%`], ['Other auxiliaries', `${fmt(report.energyBreakdown.auxiliariesMWh)} MWh`, `${fmt(k.totalEnergyMWh ? report.energyBreakdown.auxiliariesMWh / k.totalEnergyMWh * 100 : 0, 1)}%`], ['Total', `${fmt(report.energyBreakdown.totalMWh)} MWh`, '100%']], [220, 140, 139])
  stackedEnergyChart(doc, buckets)
  doc.labelValue('Energy balance', report.validationResults.energyBalanceOk ? 'PASS - components reconcile to total' : `CHECK; residual ${fmt(k.balanceErrorMWh, 6)} MWh`)

  doc.section(sectionTitles[6]); doc.heading(sectionTitles[6], true); doc.paragraph('Modeled carbon path for the reporting boundary. Captured CO2 represents calculated adsorption/removal; an actual storage or utilization destination has not been verified.');
  doc.table(['Modeled stream', 'Period amount', 'Destination / status'], [['CO2 entering capture boundary', `${fmt(k.inputTonnes)} t`, 'Flue-gas feed; SIMULATED'], ['Captured CO2', `${fmt(k.capturedTonnes)} t`, 'Captured stream; final storage/use not confirmed'], ['CO2 remaining', `${fmt(k.remainingTonnes)} t`, 'Treated flue gas to stack; SIMULATED']], [180, 120, 199])
  const flowY = doc.page.y - 85; doc.line(92, flowY + 28, 495, flowY + 28, GREEN, 2); doc.rect(55, flowY + 12, 76, 32, NAVY); doc.rect(239, flowY + 12, 100, 32, GREEN); doc.rect(458, flowY + 12, 82, 32, '0.38 0.52 0.57'); doc.text('FLUE GAS', 66, 7, true, '1 1 1', flowY + 24); doc.text('ADSORBER', 258, 7, true, '1 1 1', flowY + 24); doc.text('TREATED GAS', 465, 6, true, '1 1 1', flowY + 24); doc.page.y = flowY - 5

  doc.subheading('Operating performance'); doc.paragraph('Only operating statistics available from current model outputs are reported. Unsupported operating measurements are explicitly marked.');
  doc.table(['Operating measure', 'Reported value', 'Availability'], [['Simulated sample intervals', String(report.operatingStatistics.periodDays), 'Available'], ['Mean capture efficiency', `${fmt(report.operatingStatistics.averageCaptureEfficiency, 2)}%`, 'Calculated from time series'], ['Minimum / maximum efficiency', `${fmt(report.operatingStatistics.minimumCaptureEfficiency, 2)}% / ${fmt(report.operatingStatistics.maximumCaptureEfficiency, 2)}%`, 'Calculated from time series'], ['Adsorption / regeneration cycles', 'Not available', 'No cycle-count output'], ['Adsorbent loading', 'Not available', 'No loading time series'], ['Online availability / uptime', 'Not available', 'No availability model'], ['Regeneration energy per cycle', 'Not available', 'No cycle energy output']], [175, 190, 134])

  doc.section(sectionTitles[7]); doc.heading(sectionTitles[7], true); doc.paragraph('Counts are computed from the frozen registry snapshot. Literature is counted only when the mapped source is registered as literature and is not a verification placeholder.');
  doc.table(['Provenance', 'Parameter count', 'Interpretation'], [['LITERATURE', String(report.provenanceCounts.literature), 'Verified external source mapping'], ['ASSUMED', String(report.provenanceCounts.assumption), 'Engineering/design assumptions'], ['SIMULATED', String(report.provenanceCounts.simulated), 'Model/runtime configuration or outputs'], ['MEASURED', String(report.provenanceCounts.measured), 'Measured sources registered in system']], [110, 110, 279])
  doc.labelValue('Data completeness', `${report.dataCompleteness.count}/${report.dataCompleteness.total} (${report.dataCompleteness.percent}%)`); doc.labelValue('Time-series intervals', `${report.timeSeriesSummary.sampleCount}; ${report.timeSeriesSummary.start} to ${report.timeSeriesSummary.end}`); doc.labelValue('Expected period coverage', report.validationResults.timeSeriesComplete ? 'Complete' : 'Partial or unavailable')
  doc.subheading('Source library');
  doc.table(['Source ID', 'Title / author', 'Year', 'Reference / URL', 'Used for'], report.sources.map((source) => [source.sourceId, `${source.title} - ${source.publisher}`, source.year ?? 'Not supplied', `${source.reference}${source.url ? ` | ${source.url}` : ''}`, report.parameters.filter((parameter) => parameter.sourceId === source.sourceId).map((parameter) => parameter.name).join(', ') || 'No parameters linked']), [82, 112, 38, 140, 127], 5.8)
  doc.paragraph('The complete parameter/source trace is included in Appendix A and Appendix B. No source or citation has been created by this report generator.');

  doc.section(sectionTitles[8]); doc.heading(sectionTitles[8], true);
  doc.subheading('Calculation definitions');
  doc.table(['Output', 'Definition used'], [['CO2 input', 'Sum of baseline CO2 emissions across selected daily samples.'], ['CO2 captured', 'Sum of baseline emissions minus treated emissions for each sample.'], ['CO2 remaining', 'Sum of treated flue-gas CO2 emissions across selected samples.'], ['Capture efficiency', 'Captured CO2 / CO2 input x 100%.'], ['Emission reduction', '(Baseline emissions - with-capture emissions) / baseline x 100%.'], ['Energy intensity', 'Total modeled energy (MWh) x 1,000 / CO2 captured (t).'], ['Average daily energy', 'Total modeled energy (MWh) x 1,000 / included daily samples.'], ['Mass balance', 'Input - captured - remaining; PASS when within numerical tolerance.'], ['Energy balance', 'Total energy - regeneration - gas handling - cooling - auxiliaries.']], [145, 354])
  doc.subheading('Assumptions applied');
  doc.table(['Assumption', 'Value', 'Source ID'], report.assumptions.map((parameter) => [parameter.name, sourceValue(parameter), parameter.sourceId]), [190, 190, 119], 6)
  doc.paragraph('The calculation engine applies the active scenario inputs and centralized model configuration. Literature reference values are not substituted for scenario operating inputs unless the registry explicitly links them.');

  doc.subheading('Model limitations');
  for (const limitation of [
    'All process results in this report are simulated estimates; no verified plant sensor feed is registered.',
    'The model uses configured engineering assumptions where validated operating data is unavailable.',
    'Laboratory adsorbent properties may differ under actual flue-gas composition, moisture, contaminants and scale.',
    'Adsorption cycles, bed loading, uptime and cycle-resolved regeneration performance are not outputs in the current aggregation.',
    'Captured CO2 is not evidence of permanent storage, transport, sale or utilization.',
    'Carbon intensity cannot be calculated because product output is not configured.',
    'This prototype does not provide independent verification, certification or a complete lifecycle emissions inventory.',
  ]) doc.paragraph(`- ${limitation}`)

  doc.section(sectionTitles[9]); doc.heading(sectionTitles[9], true); doc.labelValue('Report ID', report.reportId); doc.labelValue('Scenario ID', report.scenarioId); doc.labelValue('Report type / period', `${report.reportType} / ${report.reportingPeriod.label}`); doc.labelValue('Generated at', report.generatedAt)
  doc.subheading('Validation checklist');
  doc.table(['Check', 'Result', 'Detail'], [['Mass balance', report.validationResults.massBalanceOk ? 'PASS' : 'CHECK', `Residual ${fmt(k.balanceErrorTonnes, 8)} t CO2`], ['Energy balance', report.validationResults.energyBalanceOk ? 'PASS' : 'CHECK', `Residual ${fmt(k.balanceErrorMWh, 8)} MWh`], ['Input ranges', report.validationResults.invalidParameters.length ? 'CHECK' : 'PASS', report.validationResults.invalidParameters.join(', ') || 'No invalid scenario inputs'], ['Source mappings', report.validationResults.unresolvedSources.length ? 'CHECK' : 'PASS', report.validationResults.unresolvedSources.join(', ') || 'Registry IDs resolved'], ['Literature mapping', report.validationResults.unverifiedSources.length ? 'CHECK' : 'PASS', report.validationResults.unverifiedSources.join(', ') || 'No unverified literature mappings'], ['Time-series coverage', report.validationResults.timeSeriesComplete ? 'PASS' : 'CHECK', `${report.timeSeriesSummary.sampleCount} samples, ${report.reportingPeriod.start} to ${report.reportingPeriod.end}`], ['Measured data', report.provenanceCounts.measured ? 'PRESENT' : 'NOT AVAILABLE', `${report.provenanceCounts.measured} measured registry entries`], ['Assumptions disclosed', 'PASS', `${report.assumptions.length} assumptions listed`]], [135, 85, 264])

  // Appendix A: complete, frozen registry with IDs, categories, provenance and status.
  doc.section('Appendix A - Complete Parameter Registry', false); doc.heading('Appendix A - Complete Parameter Registry', true)
  doc.table(['ID', 'Parameter', 'Value / unit', 'Category', 'Type', 'Source ID', 'Status'], report.parameterSnapshot.map((p) => [p.id, p.name, sourceValue(p), p.category, sourceLabel(p.sourceType), p.sourceId, p.status]), [77, 90, 58, 88, 45, 76, 65], 5.5)
  // Appendix B: verified sources and placeholders are both shown without inventing citations.
  doc.section('Appendix B - Source Register', false); doc.heading('Appendix B - Source Register', true)
  doc.paragraph('This register lists the provenance records used by the report. A source is not treated as literature unless the registry identifies it as verified literature.', 8)
  for (const [index, source] of report.sourceSnapshot.entries()) {
    const linkedParameters = report.parameterSnapshot.filter((parameter) => parameter.sourceId === source.sourceId).map((parameter) => parameter.id)
    doc.subheading(`Source ${index + 1} - ${source.sourceId}`)
    doc.paragraph(`Title: ${source.title}`, 7, INK, 104)
    doc.paragraph(`Source type: ${source.sourceType.toUpperCase()} | Author / publisher: ${source.publisher} | Year: ${source.year ?? 'Not supplied'}`, 7, MUTED, 104)
    doc.paragraph(`Reference: ${source.reference} | URL: ${source.url ?? 'Not supplied'}`, 7, MUTED, 104)
    doc.paragraph(`Parameters using this source (IDs; see Appendix A): ${linkedParameters.length ? linkedParameters.join(', ') : 'No parameters linked'}`, 7, MUTED, 104)
    doc.paragraph(`Notes: ${source.notes}`, 7, MUTED, 104)
  }
  // Appendix C: reproducibility / run configuration.
  doc.section('Appendix C - Simulation Configuration', false); doc.heading('Appendix C - Simulation Configuration', true)
  doc.labelValue('Report period', `${report.reportType}; ${report.reportingPeriod.start} through ${report.reportingPeriod.end}`); doc.labelValue('Time-series samples', report.timeSeriesSummary.sampleCount); doc.labelValue('Scenario ID', report.scenarioId); doc.labelValue('Generated at', report.generatedAt); doc.labelValue('Industry / source / site', `${scenario.industry} / ${scenario.emissionSource} / ${scenario.site}`)
  doc.table(['Scenario input', 'Snapshot value', 'Unit'], [['CO2 concentration', scenario.co2Concentration, 'vol %'], ['Flue gas flow', scenario.flowRate, 'Nm3/h'], ['Feed temperature', scenario.temperature, 'deg C'], ['Feed pressure', scenario.pressure, 'bar'], ['Adsorption temperature', scenario.adsorptionTemperature, 'deg C'], ['Working capacity', scenario.workingCapacity, 'mmol/g'], ['Adsorbent mass', scenario.adsorbentMass, 'kg'], ['Regeneration temperature', scenario.regenerationTemperature, 'deg C'], ['Cycle duration', scenario.cycleDurationHours, 'h'], ['Regeneration duration', scenario.regenerationTimeHours, 'h']], [190, 160, 139])
  // Appendix D: definitions are repeated here for readers using the appendix on its own.
  doc.heading('Appendix D - Calculation Definitions', true)
  doc.paragraph('Period totals are recomputed from the report snapshot time series, not copied from an unrelated dashboard period. Daily samples are summed by the report period; each sample timestamp represents the preceding modeled 24-hour interval.')
  doc.paragraph('Carbon intensity is reported only when a valid product output is configured. No value is inferred from feed flow, capture mass or energy use. A source is counted as literature only when both parameter and source records designate verified literature; assumed and simulated entries retain their own status.')
  doc.paragraph('Capture balance and energy balance checks use numerical tolerances in the simulation calculation helpers. A PASS means the reported components reconcile within that tolerance; it does not constitute external verification.')
  // Appendix E/F: completeness and checks.
  doc.section('Appendix E - Data Completeness', false); doc.heading('Appendix E - Data Completeness', true)
  doc.table(['Completeness item', 'Result'], [['Registry completeness', `${report.dataCompleteness.count}/${report.dataCompleteness.total} (${report.dataCompleteness.percent}%)`], ['Simulation samples', report.timeSeriesSummary.sampleCount], ['Date coverage', `${report.timeSeriesSummary.start} to ${report.timeSeriesSummary.end}`], ['Literature parameters', report.provenanceCounts.literature], ['Assumption parameters', report.provenanceCounts.assumption], ['Simulated parameters', report.provenanceCounts.simulated], ['Measured parameters', report.provenanceCounts.measured], ['Parameters missing / unspecified', report.validationResults.missingParameters.length]], [250, 249])
  doc.paragraph('A parameter marked missing or unspecified is not replaced by an invented literature value. The report retains the registry entry and its provenance for review.')
  doc.heading('Appendix F - Validation Checklist', true)
  doc.table(['Validation item', 'Result', 'Evidence'], [['Carbon mass balance', report.validationResults.massBalanceOk ? 'PASS' : 'CHECK', `${fmt(k.inputTonnes)} = ${fmt(k.capturedTonnes)} + ${fmt(k.remainingTonnes)} t`], ['Energy component balance', report.validationResults.energyBalanceOk ? 'PASS' : 'CHECK', `${fmt(k.totalEnergyMWh)} MWh total`], ['Scenario input validation', report.validationResults.invalidParameters.length ? 'CHECK' : 'PASS', report.validationResults.invalidParameters.join(', ') || 'Validated'], ['Registry/source link validation', report.validationResults.unresolvedSources.length ? 'CHECK' : 'PASS', report.validationResults.unresolvedSources.join(', ') || 'Resolved'], ['Time-series completeness', report.validationResults.timeSeriesComplete ? 'PASS' : 'PARTIAL', `${report.timeSeriesSummary.sampleCount} daily samples`], ['Literature provenance', report.validationResults.unverifiedSources.length ? 'CHECK' : 'PASS', report.validationResults.unverifiedSources.join(', ') || `${report.provenanceCounts.literature} verified literature parameter(s)`], ['Assumptions disclosed', 'PASS', `${report.assumptions.length} entries`], ['Measured-data availability', report.provenanceCounts.measured ? 'AVAILABLE' : 'NOT AVAILABLE', 'No sensor readings claimed as measured']], [150, 90, 259])

  // TOC inserted on page 2 after final pagination gives correct page references.
  tocPage.commands = []; tocPage.y = 786
  tocPage.commands.push(`${NAVY} rg BT /F2 15 Tf 48 779 Td (Contents) Tj ET`)
  tocPage.y = 759; tocPage.commands.push(`0.72 0.83 0.82 RG 1.1 w 48 ${tocPage.y} m 547 ${tocPage.y} l S`); tocPage.y -= 18
  const tocText = (value: string, x: number, size: number, bold = false) => tocPage.commands.push(`${INK} rg BT /${bold ? 'F2' : 'F1'} ${size} Tf ${x} ${tocPage.y} Td (${esc(value)}) Tj ET`)
  const tocLine = () => { tocPage.commands.push(`${GRID} RG 0.35 w 58 ${tocPage.y - 5} m 532 ${tocPage.y - 5} l S`); tocPage.y -= 24 }
  tocText(`Report ID ${report.reportId} | Period ${report.reportingPeriod.label}`, 48, 8); tocPage.y -= 15
  for (const title of sectionTitles) { const target = doc.tocPageNumbers.get(title) ?? ''; tocText(title, 58, 8); tocText(String(target), 520, 8, true); tocLine() }
  for (const title of ['Appendix A - Complete Parameter Registry', 'Appendix B - Source Register', 'Appendix C - Simulation Configuration', 'Appendix D - Calculation Definitions', 'Appendix E - Data Completeness', 'Appendix F - Validation Checklist']) { const target = doc.tocPageNumbers.get(title) ?? ''; tocText(title, 58, 7); tocText(String(target), 520, 7, true); tocPage.y -= 19 }
  return doc.finish()
}

function businessBarChart(doc: PdfDocument, chart: ReportChart) {
  const rows = chart.rows.filter((row) => Number.isFinite(row.value) && row.value >= 0)
  if (!rows.length) { doc.subheading(chart.title); doc.paragraph('No data available for this chart.'); return }
  const rowHeight = rows.length > 10 ? 17 : 21
  const height = rows.length * rowHeight + 50
  doc.ensure(height)
  doc.subheading(chart.title)
  doc.text(`Emissions / values (${chart.unit})`, 48, 7, false, MUTED)
  const top = doc.page.y - 11
  const labelX = 48, barX = 205, barWidth = 267, valueX = 480
  const maximum = Math.max(1e-12, ...rows.map((row) => row.value))
  rows.forEach((row, index) => {
    const y = top - (index + 1) * rowHeight
    doc.text(row.label, labelX, 7, false, INK, y + 2)
    doc.rect(barX, y, barWidth, 8, '0.94 0.96 0.95')
    if (row.value > 0) doc.rect(barX, y, Math.max(1, barWidth * row.value / maximum), 8, GREEN)
    doc.text(`${fmt(row.value, row.value < 1 ? 3 : 2)} ${chart.unit}`, valueX, 7, true, NAVY, y + 1)
    if (row.share != null) doc.text(`${fmt(row.share, 1)}%`, valueX, 6, false, MUTED, y - 8)
    doc.line(48, y - 4, 547, y - 4, GRID, 0.25)
  })
  doc.page.y = top - rows.length * rowHeight - 15
}

function businessLineChart(doc: PdfDocument, chart: ReportChart) {
  const rows = chart.rows.filter((row) => Number.isFinite(row.value))
  doc.ensure(225); doc.subheading(chart.title)
  if (rows.length < 2) { doc.paragraph('Historical trend unavailable for the selected reporting period.'); return }
  doc.paragraph(`Actual saved reporting periods · ${chart.unit}`, 7, MUTED)
  const top = doc.page.y - 8, height = 120, left = 78, right = 525, base = top - height
  const max = Math.max(1e-9, ...rows.map((row) => row.value))
  doc.line(left, base, right, base, MUTED, 0.5); doc.line(left, base, left, top, MUTED, 0.5)
  for (let i = 0; i <= 4; i++) { const y = base + height * i / 4; doc.line(left, y, right, y, '0.9 0.92 0.91', 0.3); doc.text(fmt(max * i / 4, max < 10 ? 2 : 0), 48, 6, false, MUTED, y - 2) }
  rows.forEach((row, index) => {
    const x = left + (right - left) * index / (rows.length - 1)
    const y = base + height * row.value / max
    if (index > 0) {
      const prior = rows[index - 1]
      const px = left + (right - left) * (index - 1) / (rows.length - 1)
      const py = base + height * prior.value / max
      doc.raw(`${GREEN} RG 1.6 w ${px} ${py} m ${x} ${y} l S`)
    }
    doc.rect(x - 2, y - 2, 4, 4, GREEN)
    if (rows.length <= 12 || index % Math.ceil(rows.length / 12) === 0) doc.text(row.label, x - 12, 6, false, MUTED, base - 13)
  })
  doc.text(chart.unit, 48, 6, false, MUTED, top + 3)
  doc.page.y = base - 29
}

function businessFlow(doc: PdfDocument, chart: ReportChart) {
  const rows = chart.rows
  const input = rows.find((row) => row.label === 'Input')?.value ?? 0
  const captured = rows.find((row) => row.label === 'Captured')?.value ?? 0
  const remaining = rows.find((row) => row.label === 'Remaining')?.value ?? 0
  doc.ensure(142); doc.subheading(chart.title)
  doc.paragraph(`CO2 input = CO2 captured + CO2 remaining · ${chart.unit}`, 7, MUTED)
  const x = 70, y = doc.page.y - 74, width = 450, height = 25
  doc.rect(x, y, width, height, '0.94 0.96 0.95')
  if (input > 0) {
    const capW = width * captured / input
    doc.rect(x, y, capW, height, GREEN)
    doc.rect(x + capW, y, Math.max(0, width - capW), height, '0.38 0.52 0.57')
  }
  doc.rect(x, y, width, height, '0 0 0', GRID)
  doc.rect(74, y - 31, 8, 8, GREEN); doc.text(`Captured ${fmt(captured)} ${chart.unit}`, 87, 7, false, INK, y - 29)
  doc.rect(282, y - 31, 8, 8, '0.38 0.52 0.57'); doc.text(`Remaining ${fmt(remaining)} ${chart.unit}`, 295, 7, false, INK, y - 29)
  doc.text(`Input: ${fmt(input)} ${chart.unit}`, x, 8, true, NAVY, y + 37)
  doc.page.y = y - 48
}

function businessProgress(doc: PdfDocument, chart: ReportChart) {
  const rows = chart.rows
  const max = Math.max(1e-12, ...rows.map((row) => row.value))
  doc.ensure(rows.length * 37 + 60); doc.subheading(chart.title)
  rows.forEach((row, index) => {
    const y = doc.page.y - 18
    doc.text(row.label, 48, 8, false, INK, y + 2)
    doc.rect(220, y, 255, 10, '0.94 0.96 0.95')
    doc.rect(220, y, 255 * row.value / max, 10, index === 2 ? '0.38 0.52 0.57' : GREEN)
    doc.text(`${fmt(row.value)} ${chart.unit}`, 484, 8, true, NAVY, y + 1)
    doc.page.y = y - 19
  })
}

function drawBusinessChart(doc: PdfDocument, chart: ReportChart) {
  if (chart.kind === 'line') businessLineChart(doc, chart)
  else if (chart.kind === 'flow') businessFlow(doc, chart)
  else if (chart.kind === 'progress') businessProgress(doc, chart)
  else businessBarChart(doc, chart)
}

function drawKpis(doc: PdfDocument, rows: NonNullable<PreviewPage['kpis']>) {
  if (!rows.length) return
  const columns = 2, gap = 8, cardW = (499 - gap) / columns, cardH = 49
  doc.ensure(Math.ceil(rows.length / columns) * (cardH + 7) + 22)
  doc.subheading('Key performance indicators')
  for (let index = 0; index < rows.length; index++) {
    const column = index % columns, line = Math.floor(index / columns)
    const x = 48 + column * (cardW + gap), y = doc.page.y - (line + 1) * (cardH + 7)
    doc.rect(x, y, cardW, cardH, PAPER, GRID)
    doc.text(rows[index].label, x + 9, 7, false, MUTED, y + 34)
    doc.text(rows[index].value, x + 9, 11, true, NAVY, y + 17)
    if (rows[index].detail) doc.text(rows[index].detail!, x + 9, 6, false, MUTED, y + 6)
  }
  doc.page.y -= Math.ceil(rows.length / columns) * (cardH + 7) + 10
}

function drawBusinessTable(doc: PdfDocument, table: NonNullable<PreviewPage['tables']>[number]) {
  doc.subheading(table.title)
  const count = table.headers.length
  const available = 499
  const preferred = count === 2 ? [210, 289] : count === 3 ? [155, 150, 194] : count === 4 ? [90, 140, 120, 149] : Array.from({ length: count }, () => available / count)
  const widths = preferred.length === count ? preferred : Array.from({ length: count }, () => available / count)
  const fontSize = count > 7 ? 5.3 : count > 5 ? 6.2 : 7
  doc.table(table.headers, table.rows, widths, fontSize)
}

export type BusinessReportPdfArtifact = { blob: Blob; pageCount: number; sectionPages: Record<string, number> }

/** Builds a vector PDF from the same frozen report snapshot and preview sections. */
export function createBusinessReportArtifact(snapshot: BusinessReportSnapshot, pages: PreviewPage[]): BusinessReportPdfArtifact {
  const doc = new PdfDocument(snapshot.reportId, true)
  const metrics = getBusinessReportMetrics(snapshot)
  const reportLabel: Record<BusinessReportSnapshot['reportType'], string> = {
    'monthly-performance': 'Monthly Carbon Performance', 'annual-inventory': 'Annual GHG Inventory',
    hotspots: 'Emission Hotspots & Actions', capture: 'Carbon Capture Operations',
    targets: 'Targets & Progress', 'data-quality': 'Data Quality & Sources',
  }
  const siteName = snapshot.reportType === 'capture' ? snapshot.captureScenario?.snapshot.site ?? 'Scenario site unavailable' : snapshot.site?.siteName ?? 'All Sites'
  doc.rect(0, 596, PAGE_W, 246, NAVY); doc.rect(47, 756, 40, 40, GREEN); doc.text('C', 60, 18, true, '1 1 1', 768)
  // Simple vector carbon motif: rings are decorative only, not data marks.
  const circle = (cx: number, cy: number, radius: number, color: string, width: number) => {
    const k = radius * 0.55228475
    doc.raw(`${color} RG ${width} w ${cx + radius} ${cy} m ${cx + radius} ${cy + k} ${cx + k} ${cy + radius} ${cx} ${cy + radius} c ${cx - k} ${cy + radius} ${cx - radius} ${cy + k} ${cx - radius} ${cy} c ${cx - radius} ${cy - k} ${cx - k} ${cy - radius} ${cx} ${cy - radius} c ${cx + k} ${cy - radius} ${cx + radius} ${cy - k} ${cx + radius} ${cy} c S`)
  }
  circle(505, 720, 27, GREEN, 4)
  circle(505, 720, 43, '0.55 0.78 0.68', 1.2)
  doc.text('CHITOCAPTURE', 48, 16, true, '1 1 1', 704)
  doc.text('CARBON MANAGEMENT', 48, 10, true, '0.66 0.83 0.76', 671)
  const titleLines = wrap(`${reportLabel[snapshot.reportType]} Report`, 33)
  titleLines.forEach((line, index) => doc.text(line.toUpperCase(), 48, 21, true, '1 1 1', 628 - index * 27))
  const periodY = 628 - titleLines.length * 27 - 2
  doc.text(snapshot.period.label, 48, 15, true, '0.85 0.92 0.89', periodY)
  doc.page.y = 560
  doc.labelValue('Organisation', snapshot.organisation.organisationName)
  doc.labelValue('Site', siteName)
  doc.labelValue('Reporting period', `${snapshot.period.start} to ${snapshot.period.end}`)
  doc.labelValue('Generated (MYT)', formatMalaysiaDateTime(snapshot.generatedAt))
  doc.labelValue('Report ID', snapshot.reportId)
  doc.labelValue('Data status', snapshot.reportType === 'capture' ? 'SIMULATED CAPTURE PERFORMANCE' : 'SAVED INVENTORY DATA')
  doc.page.y -= 10
  const coverKpis = pages[0]?.kpis?.slice(0, 4) ?? []
  if (coverKpis.length) drawKpis(doc, coverKpis)
  doc.paragraph(snapshot.reportType === 'capture' ? 'Capture outputs are simulation results and are not measured plant performance.' : 'This report includes saved organisational inventory data for the selected boundary. Capture results, if included, remain separate from organisational emissions.', 8, MUTED)

  const sectionPages: Record<string, number> = {}
  for (const page of pages) {
    doc.section(page.title); doc.heading(page.title, true)
    sectionPages[page.id] = doc.pageNumber
    if (page.subtitle) doc.paragraph(page.subtitle, 8, MUTED)
    if (page.empty) doc.paragraph(page.empty, 9, MUTED)
    drawKpis(doc, page.kpis ?? [])
    for (const chart of page.charts ?? []) drawBusinessChart(doc, chart)
    for (const table of page.tables ?? []) drawBusinessTable(doc, table)
    for (const note of page.notes ?? []) doc.paragraph(note, 8, MUTED)
    if (page.id === 'data-quality-sources') {
      doc.subheading('Capture input provenance')
      const provenance = Object.entries(metrics.provenanceCounts).map(([label, value]) => [label, String(value)])
      if (provenance.length) doc.table(['Provenance', 'Registered inputs'], provenance, [250, 249], 7)
    }
  }
  const pageCount = doc.pageNumber
  return { blob: doc.finish(), pageCount, sectionPages }
}

export function createBusinessReportPdf(snapshot: BusinessReportSnapshot, pages: PreviewPage[]): Blob {
  return createBusinessReportArtifact(snapshot, pages).blob
}
