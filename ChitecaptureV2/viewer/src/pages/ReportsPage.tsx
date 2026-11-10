import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Header from '../components/Header'
import { getOrganisationCarbonRevision, getOrganisationCarbonState, subscribeToOrganisationCarbon } from '../data/organisationCarbon'
import type { Site } from '../types/organisationCarbon'
import { getActiveScenarioResult, subscribeToActiveScenario } from '../simulation/activeScenario'
import { createBusinessReportSnapshot, getBusinessReportPeriods, getPreviousReportPeriod } from '../simulation/businessReportSnapshot'
import type { BusinessReportGrain, BusinessReportKind, BusinessReportPeriod, BusinessReportSnapshot } from '../simulation/businessReportSnapshot'
import { buildBusinessReportPages } from '../simulation/businessReportContent'
import type { PreviewPage } from '../simulation/businessReportContent'
import { createBusinessReportArtifact } from '../simulation/reportPdf'
import { validInventoryRecords } from '../simulation/carbonDashboardMetrics'
import { reportModelLimitations } from '../data/reportMetadata'
import { formatMalaysiaDateTime } from '../utils/malaysiaTime'

const reportTypes: Array<{ id: BusinessReportKind; label: string }> = [
  { id: 'monthly-performance', label: 'Monthly Carbon Performance' },
  { id: 'annual-inventory', label: 'Annual GHG Inventory' },
  { id: 'hotspots', label: 'Emission Hotspots & Actions' },
  { id: 'capture', label: 'Carbon Capture Operations' },
  { id: 'targets', label: 'Targets & Progress' },
  { id: 'data-quality', label: 'Data Quality & Sources' },
]
const fmt = (value: number, digits = 2) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
const t = (value: number) => `${fmt(value)} tCO₂e`
type GeneratedReport = { snapshot: BusinessReportSnapshot; pages: PreviewPage[]; pdf: Blob; pdfPageCount: number; sectionPages: Record<string, number> }

function grainFor(kind: BusinessReportKind, preferred: BusinessReportGrain): BusinessReportGrain {
  if (kind === 'annual-inventory' || kind === 'targets') return 'yearly'
  if (kind === 'monthly-performance' || kind === 'capture') return 'monthly'
  return preferred
}
function scenarioPeriod(result: ReturnType<typeof getActiveScenarioResult>): BusinessReportPeriod | null {
  if (!result) return null
  const samples = result.dailySamples.length ? result.dailySamples : result.samples
  if (!samples.length) return null
  const dates = samples.map((sample) => new Date(new Date(sample.timestamp).getTime() - 1).toISOString().slice(0, 10)).sort()
  const start = dates[0], end = dates.at(-1) ?? dates[0]
  const year = start.slice(0, 4)
  const grain: BusinessReportGrain = result.period === 'yearly' ? 'yearly' : 'monthly'
  const key = grain === 'yearly' ? year : start.slice(0, 7)
  const label = `${result.period[0].toUpperCase()}${result.period.slice(1)} simulation · ${start} to ${end}`
  return { grain, key, label, start, end }
}
function activeCaptureMatchesSite(result: ReturnType<typeof getActiveScenarioResult>, selectedSiteId: string, sites: Site[]) {
  if (!result) return false
  const matchingSite = sites.some((site) => site.siteName === result.snapshot.site)
  return selectedSiteId === 'All sites' ? matchingSite : sites.some((site) => site.siteId === selectedSiteId && site.siteName === result.snapshot.site)
}
function scenarioOverlapsPeriod(result: ReturnType<typeof getActiveScenarioResult>, period: BusinessReportPeriod) {
  if (!result) return false
  const samples = result.dailySamples.length ? result.dailySamples : result.samples
  if (!samples.length) return false
  const dates = samples.map((sample) => new Date(new Date(sample.timestamp).getTime() - 1).toISOString().slice(0,10)).sort()
  return dates[0] <= period.end && dates.at(-1)! >= period.start
}
function siteLabel(site: Site | null) { return site?.siteName ?? 'All Sites' }

function MRVReports({ report, onGenerate }: { report: GeneratedReport | null; onGenerate: () => void }) {
  if (!report) return <section className="business-mrv-empty panel"><span className="business-mrv-tag">MRV SUPPORT · PROTOTYPE</span><h2>Generate a snapshot to review monitoring and traceability</h2><p>MRV support summarizes registered values and model outputs. It does not provide independent verification or certification.</p><button className="report-generate" type="button" onClick={onGenerate}>Generate MRV snapshot →</button></section>
  const { snapshot } = report
  const scenario = snapshot.captureScenario
  const metrics = scenario ? {
    input: scenario.inputTonnes,
    captured: scenario.capturedTonnes,
    remaining: scenario.remainingTonnes,
    efficiency: scenario.inputTonnes > 0 ? scenario.capturedTonnes / scenario.inputTonnes * 100 : 0,
  } : null
  const provenance = scenario?.snapshot.inputs ?? []
  return <div className="business-mrv-view"><div className="business-mrv-header"><div><span className="business-mrv-tag">MRV SUPPORT · NOT CERTIFIED</span><h2>Monitoring · Reporting · Verification support</h2><p>{snapshot.reportId} · {snapshot.organisation.organisationName} · {snapshot.period.label}</p></div><button type="button" className="report-generate" onClick={onGenerate}>Generate MRV snapshot →</button></div>
    <div className="business-mrv-grid">
      <section className="panel"><h3>Monitoring</h3><p>Values in this snapshot and their provenance.</p><dl><div><dt>Inventory records</dt><dd>{snapshot.inventoryRecords.length}</dd></div><div><dt>Organisational emissions</dt><dd>{t(snapshot.inventoryRecords.reduce((sum,record)=>sum+record.calculatedTCO2e,0))}</dd></div><div><dt>Capture results</dt><dd>{metrics ? `${t(metrics.captured)} · SIMULATED` : 'No capture simulation in snapshot'}</dd></div><div><dt>Capture input / remaining</dt><dd>{metrics ? `${t(metrics.input)} / ${t(metrics.remaining)} · SIMULATED` : '—'}</dd></div><div><dt>Capture efficiency</dt><dd>{metrics ? `${fmt(metrics.efficiency,1)}% · SIMULATED` : '—'}</dd></div></dl></section>
      <section className="panel"><h3>Reporting</h3><p>Frozen boundary and period used to generate the report.</p><dl><div><dt>Organisation</dt><dd>{snapshot.organisation.organisationName}</dd></div><div><dt>Site boundary</dt><dd>{siteLabel(snapshot.site)}</dd></div><div><dt>Report type</dt><dd>{reportTypes.find((item)=>item.id===snapshot.reportType)?.label}</dd></div><div><dt>Period</dt><dd>{snapshot.period.start} to {snapshot.period.end}</dd></div><div><dt>Generated at</dt><dd>{formatMalaysiaDateTime(snapshot.generatedAt)} MYT</dd></div></dl></section>
      <section className="panel"><h3>Verification support</h3><p>Traceability checks only; no third-party verification is performed.</p><dl><div><dt>Verified factors</dt><dd>{snapshot.factorSnapshot.filter((factor)=>factor.verificationStatus==='verified').length}</dd></div><div><dt>Unverified factors</dt><dd>{snapshot.factorSnapshot.filter((factor)=>factor.verificationStatus!=='verified').length}</dd></div><div><dt>Registered sources</dt><dd>{snapshot.sourceSnapshot.length + snapshot.captureSources.length}</dd></div><div><dt>Capture mass balance</dt><dd>{scenario ? (Math.abs(scenario.inputTonnes-scenario.capturedTonnes-scenario.remainingTonnes) < Math.max(1e-7,scenario.inputTonnes*1e-9) ? 'PASS · simulated' : 'CHECK · simulated') : 'Unavailable'}</dd></div></dl></section>
    </div>
    {provenance.length > 0 && <section className="panel business-mrv-trace"><div className="report-builder-title"><div><span className="business-mrv-tag">FROZEN SCENARIO INPUTS</span><h2>Parameter → source trace</h2></div></div><div className="business-preview-table-wrap"><table><thead><tr><th>Parameter ID</th><th>Value / unit</th><th>Provenance</th><th>Source ID</th><th>Source title</th></tr></thead><tbody>{provenance.map((input)=><tr key={input.parameterId}><td>{input.parameterId}</td><td>{input.value} {input.unit}</td><td>{input.provenance.toUpperCase()}</td><td>{input.sourceId || 'Not supplied'}</td><td>{snapshot.captureSources.find((source)=>source.sourceId===input.sourceId)?.title ?? input.sourceTitle ?? 'Not available'}</td></tr>)}</tbody></table></div></section>}
    <aside className="business-mrv-disclaimer">MRV-oriented support report only. It is not an assurance statement or regulatory certification. {reportModelLimitations.slice(0,3).join(' ')}</aside>
  </div>
}

function ReportsPage() {
  useSyncExternalStore(subscribeToOrganisationCarbon, getOrganisationCarbonRevision, getOrganisationCarbonRevision)
  const activeScenario = useSyncExternalStore(subscribeToActiveScenario, getActiveScenarioResult, getActiveScenarioResult)
  const state = getOrganisationCarbonState()
  const inventory = useMemo(() => validInventoryRecords(state.inventory), [state.inventory])
  const [tab, setTab] = useState<'reports'|'mrv'>('reports')
  const [kind, setKind] = useState<BusinessReportKind>('monthly-performance')
  const [grainChoice, setGrainChoice] = useState<BusinessReportGrain>('monthly')
  const [organisationId, setOrganisationId] = useState(state.organisations[0]?.organisationId ?? '')
  const [siteId, setSiteId] = useState('All sites')
  const [periodKey, setPeriodKey] = useState('')
  const [generated, setGenerated] = useState<GeneratedReport|null>(null)
  const [pdfUrl, setPdfUrl] = useState('')
  const [pdfPage, setPdfPage] = useState(1)
  const [error, setError] = useState('')
  const organisation = state.organisations.find((item)=>item.organisationId===organisationId) ?? state.organisations[0]
  const organisationSites = state.sites.filter((site)=>site.organisationId===organisation?.organisationId)
  const siteFilteredInventory = inventory.filter((record)=>record.organisationId===organisation?.organisationId && (siteId==='All sites' || record.siteId===siteId))
  const grain = grainFor(kind,grainChoice)
  const periods = useMemo(()=>getBusinessReportPeriods(siteFilteredInventory,grain).reverse(),[siteFilteredInventory,grain])
  const selectedPeriod = periods.find((period)=>period.key===periodKey) ?? periods[0] ?? null
  const scenarioDatePeriod = scenarioPeriod(activeScenario)
  const captureAttached = kind==='capture' ? !!activeScenario : activeCaptureMatchesSite(activeScenario,siteId,organisationSites)
  const hasPeriod = kind==='capture' ? !!scenarioDatePeriod || !!selectedPeriod : !!selectedPeriod

  useEffect(()=>{
    if (!periods.some((period)=>period.key===periodKey)) setPeriodKey(periods[0]?.key ?? '')
  },[periods,periodKey])
  useEffect(()=>{
    if (!generated) { setPdfUrl(''); return }
    const url=URL.createObjectURL(generated.pdf)
    setPdfUrl(url)
    return ()=>URL.revokeObjectURL(url)
  },[generated])
  useEffect(()=>()=>{ if(pdfUrl) URL.revokeObjectURL(pdfUrl) },[pdfUrl])

  function clearReport() { setGenerated(null); setPdfPage(1); setError('') }
  function chooseKind(next: BusinessReportKind) {
    setKind(next)
    if(next==='annual-inventory'||next==='targets') setGrainChoice('yearly')
    else if(next==='monthly-performance'||next==='capture') setGrainChoice('monthly')
    if(next==='targets') setSiteId('All sites')
    clearReport()
  }
  function buildReport() {
    setError('')
    if(!organisation){setError('Add or select an organisation before generating a report.');return}
    const period = kind==='capture' && scenarioDatePeriod ? scenarioDatePeriod : selectedPeriod
    if(!period){setError(kind==='capture'?'No capture simulation or saved reporting period is available.':'No saved inventory reporting period is available for this organisation and site.');return}
    const boundary = kind==='capture' ? [] : siteFilteredInventory
    const previous = kind==='capture' ? null : getPreviousReportPeriod(period)
    const matchingScenario = kind==='capture' ? activeScenario : captureAttached && scenarioOverlapsPeriod(activeScenario, period) ? activeScenario : null
    const site = kind==='capture' ? null : kind==='targets' || siteId==='All sites' ? null : organisationSites.find((item)=>item.siteId===siteId) ?? null
    const snapshot = createBusinessReportSnapshot({
      reportType:kind, organisation, site, sites:organisationSites, period, comparisonPeriod:previous,
      allBoundaryRecords:boundary,
      activities:state.activities.filter((activity)=>activity.organisationId===organisation.organisationId && (kind==='capture'||siteId==='All sites'||activity.siteId===siteId)),
      factors:state.factors, sources:state.sources, targets:state.targets,
      captureScenario:matchingScenario,
    })
    const pages=buildBusinessReportPages(snapshot)
    const artifact=createBusinessReportArtifact(snapshot,pages)
    setGenerated({snapshot,pages,pdf:artifact.blob,pdfPageCount:artifact.pageCount,sectionPages:artifact.sectionPages});setPdfPage(1)
  }

  const availableGrains: BusinessReportGrain[] = kind==='hotspots'||kind==='data-quality' ? ['monthly','quarterly','yearly'] : []
  const periodPlaceholder = kind==='capture' && scenarioDatePeriod ? scenarioDatePeriod.label : periods.length ? undefined : 'No saved reporting periods'
  const captureSite = activeScenario?.snapshot.site ?? 'Scenario site not specified'
  const previewSnapshot = generated?.snapshot
  const fileName=generated?`${generated.snapshot.reportId}-${generated.snapshot.reportType}-${generated.snapshot.period.key}.pdf`:''
  const periodLabel = (period:BusinessReportPeriod) => period.label

  return <div className="dashboard-shell reports-page">
    <Header page="reports" title="Reports" subtitle="Generate performance, inventory and capture reports from saved ChitoCapture data." />
    <main className="dashboard-main reports-main business-reports-main">
      <div className="business-report-tabs" role="tablist" aria-label="Report workspace"><button type="button" role="tab" aria-selected={tab==='reports'} className={tab==='reports'?'active':''} onClick={()=>setTab('reports')}>Reports</button><button type="button" role="tab" aria-selected={tab==='mrv'} className={tab==='mrv'?'active':''} onClick={()=>setTab('mrv')}>MRV Reports</button></div>
      {tab==='reports' ? <>
        <section className="business-report-controls panel">
          <div className="business-report-selector"><label>Report Type</label><div className="business-report-type-tabs" role="tablist" aria-label="Select report type">{reportTypes.map((item)=><button type="button" key={item.id} role="tab" aria-selected={kind===item.id} className={kind===item.id?'active':''} onClick={()=>chooseKind(item.id)}>{item.label}</button>)}</div></div>
          <div className="business-report-setting-row">
            <label><span>Organisation</span><select value={organisation?.organisationId ?? ''} disabled={!state.organisations.length} onChange={(event)=>{setOrganisationId(event.target.value);setSiteId('All sites');clearReport()}}>{state.organisations.map((item)=><option key={item.organisationId} value={item.organisationId}>{item.organisationName}</option>)}</select></label>
            <label><span>{kind==='capture'?'Scenario site':kind==='targets'?'Target boundary':'Site'}</span><select value={kind==='capture'?'scenario-site':kind==='targets'?'All sites':siteId} disabled={kind==='capture'||kind==='targets'} onChange={(event)=>{setSiteId(event.target.value);clearReport()}}>{kind==='capture'?<option value="scenario-site">{captureSite}</option>:kind==='targets'?<option value="All sites">Organisation-wide · all sites</option>:<><option value="All sites">All sites</option>{organisationSites.map((site)=><option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}</>}</select></label>
            {kind==='capture' ? <label><span>Capture scenario / period</span><select disabled value={scenarioDatePeriod?'active':'none'}><option value={scenarioDatePeriod?'active':'none'}>{scenarioDatePeriod?.label ?? 'No active capture simulation'}</option></select></label> : <>
              {!!availableGrains.length && <label><span>Period type</span><select value={grainChoice} onChange={(event)=>{setGrainChoice(event.target.value as BusinessReportGrain);setPeriodKey('');clearReport()}}>{availableGrains.map((item)=><option value={item} key={item}>{item==='monthly'?'Month':item==='quarterly'?'Quarter':'Year'}</option>)}</select></label>}
              <label className="business-report-period"><span>{grain==='monthly'?'Reporting period':grain==='quarterly'?'Reporting quarter':'Reporting year'}</span><select value={selectedPeriod?.key ?? ''} disabled={!periods.length} onChange={(event)=>{setPeriodKey(event.target.value);clearReport()}}>{periods.map((period)=><option key={period.key} value={period.key}>{periodLabel(period)}</option>)}{!periods.length&&<option value="">{periodPlaceholder}</option>}</select></label>
            </>}
            <button type="button" className="report-generate" onClick={buildReport} disabled={!hasPeriod}>Generate Report <span aria-hidden="true">→</span></button>
          </div>
          {error&&<p className="report-error" role="alert">{error}</p>}
          {!periods.length&&kind!=='capture'&&<p className="business-report-inline-note">No saved organisational inventory records are available for this selection. No sample emissions will be added to the report.</p>}
          {kind==='capture'&&!activeScenario&&<p className="business-report-inline-note">No capture simulation is available for this period. Run a scenario in Scenario Analysis first.</p>}
        </section>
        {!generated ? <section className="business-report-empty panel"><span>▤</span><h2>Report preview</h2><p>Select a report type and period, then generate a fixed snapshot to preview its contents and download the PDF.</p></section> : <>
          <section className="business-report-preview-toolbar"><div><span className="business-report-eyebrow">REPORT PREVIEW</span><strong>{previewSnapshot?.reportId} · {previewSnapshot?.period.label}</strong></div><a className="business-report-download" href={pdfUrl||undefined} download={fileName} aria-disabled={!pdfUrl}><span>↓</span> Download PDF</a></section>
          <section className="business-report-preview-workspace" aria-label="Generated report preview">
            <nav className="business-report-contents panel" aria-label="Report contents"><h2>Report Contents</h2><button type="button" className={pdfPage===1?'selected':''} onClick={()=>setPdfPage(1)}><span>▧</span><b>Cover</b><i>›</i></button>{generated.pages.map((page)=><button type="button" className={pdfPage===generated.sectionPages[page.id]?'selected':''} key={page.id} onClick={()=>setPdfPage(generated.sectionPages[page.id] ?? 1)}><span>✓</span><b>{page.title}</b><i>›</i></button>)}</nav>
            <div className="business-report-pdf-panel panel"><div className="business-report-pdf-heading"><span>PDF Preview</span><div><button type="button" onClick={()=>setPdfPage((page)=>Math.max(1,page-1))} disabled={pdfPage<=1}>‹</button><span>Page {pdfPage} / {generated.pdfPageCount}</span><button type="button" onClick={()=>setPdfPage((page)=>Math.min(generated.pdfPageCount,page+1))} disabled={pdfPage>=generated.pdfPageCount}>›</button></div></div>
              <div className="business-report-pdf-frame-wrap">{pdfUrl&&<iframe key={pdfUrl} src={`${pdfUrl}#page=${pdfPage}&view=FitH`} title={`${previewSnapshot?.reportId} PDF preview`} className="business-report-pdf-frame"/>}</div>
            </div>
          </section>
          <p className="business-report-snapshot-note">Fixed snapshot · Generated {formatMalaysiaDateTime(previewSnapshot!.generatedAt)} MYT. Later changes to dashboard data do not alter this report.</p>
        </>}
      </> : <MRVReports report={generated} onGenerate={buildReport}/>}
      <footer className="app-footer"><span><i/> REPORTING WORKSPACE</span><span>{organisation?.organisationName ?? 'No organisation selected'}</span><span>Inventory and capture results remain separate in every report.</span></footer>
    </main>
  </div>
}

export default ReportsPage
