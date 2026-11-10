import { useMemo, useState, useSyncExternalStore } from 'react'
import Header from '../components/Header'
import {
  addAsset, addProjectComment, createProjectFromMeasure, getActionHubRevision, getActionHubState, moveProject,
  removeAsset, removeProject, resetActionHubDemo, subscribeToActionHub, updateAsset, updateProject, updateSettings,
} from '../data/actionHub'
import { getMeasure, suggestOpportunities } from '../data/measureLibrary'
import { getOrganisationCarbonState } from '../data/organisationCarbon'
import { allowedTransitions, assetBaselineTCO2, buildMacc, portfolioSummary, projectContributionTCO2, projectEconomics } from '../simulation/abatement'
import type { Asset, AssetType, MeterStatus, PlanSettings, ProjectStatus, ReductionProject, Role } from '../types/actionHub'
import { projectStatuses } from '../types/actionHub'

type Tab = 'plan' | 'projects' | 'opportunities' | 'assets' | 'settings'

const fmt = (value: number, digits = 0) => new Intl.NumberFormat('en-MY', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0)
const money = (value: number) => `MYR ${fmt(value)}`
const assetTypes: AssetType[] = ['Kiln / furnace', 'Boiler', 'Fan / blower', 'Pump', 'Air compressor', 'Chiller / HVAC', 'Mill / grinder', 'Motor drive', 'Lighting', 'Building', 'Other']
const meterStatuses: MeterStatus[] = ['Metered', 'Sub-metered', 'Estimated']
const statusTone: Record<ProjectStatus, string> = {
  Idea: 'pipeline', Assessed: 'pipeline', Approved: 'committed', 'In progress': 'committed', Verifying: 'committed', Verified: 'verified', Rejected: 'rejected',
}
const roleIntro: Record<Role, string> = {
  Sustainability: 'Set the target, prioritise projects by cost per tonne, and verify the results before they count.',
  Engineering: 'Own the assets, turn opportunities into projects, enter the engineering estimates, and report what was delivered.',
  Management: 'See the gap to target, the cost of closing it, and which projects are waiting for approval.',
}

const readTab = (): Tab => {
  const value = new URLSearchParams(window.location.search).get('tab')
  return value === 'projects' || value === 'opportunities' || value === 'assets' || value === 'settings' ? value : 'plan'
}

function Kpi({ label, value, detail, tone = '' }: { label: string; value: string; detail: string; tone?: string }) {
  return <article className={`carbon-kpi ${tone}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
}

function TargetBar({ required, verified, committed, pipeline }: { required: number; verified: number; committed: number; pipeline: number }) {
  const total = Math.max(required, verified + committed + Math.max(0, pipeline), 1)
  const width = (value: number) => `${Math.max(0, value) / total * 100}%`
  return <div className="ah-target">
    <div className="ah-target-track" role="img" aria-label={`Verified ${fmt(verified)} t, committed ${fmt(committed)} t, pipeline ${fmt(pipeline)} t against a required ${fmt(required)} t`}>
      <span className="ah-seg verified" style={{ width: width(verified) }} />
      <span className="ah-seg committed" style={{ width: width(committed) }} />
      <span className="ah-seg pipeline" style={{ width: width(pipeline) }} />
      <i className="ah-target-line" style={{ left: width(required) }} title="Reduction required to meet the target" />
    </div>
    <div className="ah-legend">
      <span><i className="verified" />Verified {fmt(verified)} t</span>
      <span><i className="committed" />Committed {fmt(committed)} t</span>
      <span><i className="pipeline" />Pipeline {fmt(pipeline)} t</span>
      <span><i className="target" />Required {fmt(required)} t/yr</span>
    </div>
  </div>
}

function MaccChart({ projects, settings, required, onSelect }: { projects: ReductionProject[]; settings: PlanSettings; required: number; onSelect: (id: string) => void }) {
  const bars = buildMacc(projects, settings)
  if (bars.length === 0) return <div className="carbon-chart-empty">No projects with positive net abatement yet. Add opportunities to build the curve.</div>
  const width = 820, height = 300, left = 70, right = 20, top = 20, bottom = 46
  const plotW = width - left - right, plotH = height - top - bottom
  const totalT = Math.max(bars.at(-1)!.startTCO2 + bars.at(-1)!.netTCO2, required)
  const costs = bars.map((bar) => bar.costPerTonneMYR).concat([settings.carbonPriceMYRPerT, 0])
  const maxCost = Math.max(...costs), minCost = Math.min(...costs)
  const span = Math.max(1, maxCost - minCost)
  const x = (t: number) => left + t / totalT * plotW
  const y = (cost: number) => top + (maxCost - cost) / span * plotH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => maxCost - span * fraction)
  return <div className="carbon-chart-scroll"><svg className="ah-macc" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Marginal abatement cost curve: projects ordered from cheapest to most expensive per tonne">
    {ticks.map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid-line" /><text x={left - 8} y={y(tick) + 3} textAnchor="end" className="chart-axis-text">{fmt(tick)}</text></g>)}
    <line x1={left} x2={width - right} y1={y(0)} y2={y(0)} className="ah-zero" />
    {bars.map((bar) => {
      const barTop = Math.min(y(bar.costPerTonneMYR), y(0)), barHeight = Math.max(2, Math.abs(y(bar.costPerTonneMYR) - y(0)))
      return <g key={bar.projectId} className={`ah-macc-bar ${statusTone[bar.status]}`} onClick={() => onSelect(bar.projectId)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter') onSelect(bar.projectId) }}>
        <title>{`${bar.title}\n${fmt(bar.netTCO2)} t CO₂e/yr net · ${money(bar.costPerTonneMYR)}/t · ${bar.status}`}</title>
        <rect x={x(bar.startTCO2) + 1} y={barTop} width={Math.max(2, x(bar.startTCO2 + bar.netTCO2) - x(bar.startTCO2) - 2)} height={barHeight} rx="2" />
      </g>
    })}
    <line x1={left} x2={width - right} y1={y(settings.carbonPriceMYRPerT)} y2={y(settings.carbonPriceMYRPerT)} className="ah-price-line" />
    <text x={width - right} y={y(settings.carbonPriceMYRPerT) - 5} textAnchor="end" className="ah-chart-note">Internal carbon price {money(settings.carbonPriceMYRPerT)}/t</text>
    {required > 0 && <><line x1={x(required)} x2={x(required)} y1={top} y2={top + plotH} className="ah-required-line" /><text x={x(required) - 4} y={top + 10} textAnchor="end" className="ah-chart-note">Target gap</text></>}
    <text x={left + plotW / 2} y={height - 8} textAnchor="middle" className="chart-axis-title">Cumulative net abatement (t CO₂e/yr) →</text>
    <text x="14" y={top + plotH / 2} transform={`rotate(-90 14 ${top + plotH / 2})`} textAnchor="middle" className="chart-axis-title">MYR per t CO₂e</text>
  </svg></div>
}

function NumberField({ label, value, onChange, disabled, step = 'any' }: { label: string; value: number; onChange: (value: number) => void; disabled?: boolean; step?: string }) {
  return <label>{label}<input type="number" step={step} value={Number.isFinite(value) ? value : 0} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} /></label>
}

function ProjectDrawer({ project, role, onClose }: { project: ReductionProject; role: Role; onClose: () => void }) {
  const { settings, assets } = getActionHubState()
  const asset = assets.find((item) => item.assetId === project.assetId)
  const measure = getMeasure(project.measureId)
  const economics = projectEconomics(project, settings)
  const [comment, setComment] = useState('')
  const author = role === 'Engineering' ? project.ownerEngineer : role === 'Sustainability' ? project.sustainabilitySponsor : 'Management'
  const engineeringEditable = role === 'Engineering' && !['Verified', 'Rejected'].includes(project.status)
  const set = (patch: Partial<ReductionProject>) => updateProject({ ...project, ...patch })
  const transitions = allowedTransitions(project.status, role)
  const needsMeasurement = project.status === 'Verifying' && role === 'Sustainability' && !Number.isFinite(project.measuredNetTCO2)

  return <div className="org-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="org-modal wide ah-drawer" role="dialog" aria-modal="true" aria-labelledby="ah-drawer-title">
      <div className="org-modal-heading">
        <div><span className={`ah-status ${statusTone[project.status]}`}>{project.status}</span><h2 id="ah-drawer-title">{project.title}</h2><p>{asset?.name ?? 'Unknown asset'} · Engineer: {project.ownerEngineer} · Sponsor: {project.sustainabilitySponsor}</p></div>
        <button type="button" aria-label="Close project" onClick={onClose}>×</button>
      </div>

      <div className="ah-drawer-grid">
        <section>
          <h3>Impact (per year)</h3>
          <dl className="ah-facts">
            <div><dt>Gross abatement</dt><dd>{fmt(economics.grossTCO2, 1)} t CO₂e</dd></div>
            <div><dt>Energy penalty</dt><dd>{economics.penaltyTCO2 > 0 ? `−${fmt(economics.penaltyTCO2, 1)}` : "0"} t CO₂e</dd></div>
            <div className={economics.netTCO2 <= 0 ? 'bad' : 'good'}><dt>Net abatement</dt><dd>{fmt(economics.netTCO2, 1)} t CO₂e</dd></div>
            <div><dt>Cost per tonne</dt><dd>{economics.costPerTonneMYR === null ? 'n/a (no net abatement)' : `${money(economics.costPerTonneMYR)}/t`}</dd></div>
            <div><dt>Simple payback</dt><dd>{economics.simplePaybackYears === null ? 'No payback from energy savings' : `${fmt(economics.simplePaybackYears, 1)} years`}</dd></div>
            {project.status === 'Verified' && <div className="good"><dt>Measured net result</dt><dd>{fmt(project.measuredNetTCO2 ?? 0, 1)} t CO₂e</dd></div>}
          </dl>
          {economics.netTCO2 <= 0 && economics.penaltyTCO2 > 0 && <p className="org-alert">This measure emits more through its own energy use than it abates at the current grid and fuel factors. Supply the energy from waste heat or renewables, or reduce the penalty.</p>}
          {measure && <>
            <h3>Engineering checks before approval</h3>
            <ul className="ah-checks">{measure.engineeringChecks.map((check) => <li key={check}>{check}</li>)}</ul>
            <p className="ah-basis">Starting estimate: {measure.estimateBasis}. <strong>This is an indicative planning assumption. Replace it with an audit, a quote or trial data.</strong></p>
          </>}
        </section>

        <section>
          <h3>Engineering estimate {engineeringEditable ? '' : <small>(edited by Engineering)</small>}</h3>
          <div className="org-form-grid ah-fields">
            <NumberField label="Electricity saved (MWh/yr)" value={project.electricitySavedMWh} disabled={!engineeringEditable} onChange={(value) => set({ electricitySavedMWh: value })} />
            <NumberField label="Fuel saved (GJ/yr)" value={project.fuelSavedGJ} disabled={!engineeringEditable} onChange={(value) => set({ fuelSavedGJ: value })} />
            <NumberField label="Direct CO₂ avoided/captured (t/yr)" value={project.directTCO2} disabled={!engineeringEditable} onChange={(value) => set({ directTCO2: value })} />
            <NumberField label="Added electricity (MWh/yr)" value={project.addedElectricityMWh} disabled={!engineeringEditable} onChange={(value) => set({ addedElectricityMWh: value })} />
            <NumberField label="Added fuel (GJ/yr)" value={project.addedFuelGJ} disabled={!engineeringEditable} onChange={(value) => set({ addedFuelGJ: value })} />
            <NumberField label="Capex (MYR)" value={project.capexMYR} disabled={!engineeringEditable} onChange={(value) => set({ capexMYR: value })} />
            <NumberField label="Opex change (MYR/yr, − = saving)" value={project.annualOpexChangeMYR} disabled={!engineeringEditable} onChange={(value) => set({ annualOpexChangeMYR: value })} />
            <NumberField label="Lifetime (years)" value={project.lifetimeYears} step="1" disabled={!engineeringEditable} onChange={(value) => set({ lifetimeYears: value })} />
            <label>Target date<input type="month" value={project.targetDate} disabled={!engineeringEditable} onChange={(event) => set({ targetDate: event.target.value })} /></label>
          </div>
          {role === 'Sustainability' && ['Verifying', 'Verified'].includes(project.status) && <div className="org-form-grid ah-fields ah-verify">
            <NumberField label="Measured net result (t CO₂e/yr)" value={project.measuredNetTCO2 ?? NaN} onChange={(value) => set({ measuredNetTCO2: value })} />
            <label className="org-wide">Measurement & verification basis<input value={project.verificationNote ?? ''} placeholder="e.g. 12 weeks of sub-meter data compared with a production-normalised baseline" onChange={(event) => set({ verificationNote: event.target.value })} /></label>
          </div>}
          {project.verificationNote && role !== 'Sustainability' && <p className="ah-basis">Verification basis: {project.verificationNote}</p>}

          <h3>Next step for {role}</h3>
          <div className="ah-actions">
            {transitions.length === 0 && <span className="ah-muted">No action for {role} at this stage.</span>}
            {transitions.map((next) => <button key={next} type="button" className={next === 'Rejected' ? 'secondary-button' : 'primary-button'} disabled={next === 'Verified' && needsMeasurement}
              onClick={() => moveProject(project.projectId, next, { author, role, text: `Moved from ${project.status} to ${next}.` })}>→ {next}</button>)}
          </div>
          {needsMeasurement && <p className="ah-muted">Enter the measured net result before marking the project as Verified.</p>}
        </section>
      </div>

      <section className="ah-thread">
        <h3>Discussion</h3>
        {project.comments.length === 0 && <p className="ah-muted">No comments yet.</p>}
        <ol>{project.comments.map((item, index) => <li key={`${item.at}-${index}`} className={item.role.toLowerCase()}><b>{item.author}</b> <small>{item.role} · {item.at.slice(0, 10)}</small><p>{item.text}</p></li>)}</ol>
        <form onSubmit={(event) => { event.preventDefault(); if (!comment.trim()) return; addProjectComment(project.projectId, { author, role, text: comment.trim() }); setComment('') }}>
          <input value={comment} onChange={(event) => setComment(event.target.value)} placeholder={`Comment as ${author}…`} aria-label="Add a comment" />
          <button type="submit" className="secondary-button">Post</button>
        </form>
      </section>
      {role !== 'Management' && <footer className="ah-drawer-foot"><button type="button" className="secondary-button" onClick={() => { if (confirm('Delete this project?')) { removeProject(project.projectId); onClose() } }}>Delete project</button></footer>}
    </section>
  </div>
}

function AssetForm({ siteOptions, onDone, initial }: { siteOptions: { siteId: string; siteName: string }[]; onDone: () => void; initial?: Asset }) {
  const [draft, setDraft] = useState<Omit<Asset, 'assetId'>>(initial ?? { siteId: siteOptions[0]?.siteId ?? '', name: '', type: 'Fan / blower', electricityMWh: 0, fuelGJ: 0, processTCO2: 0, ownerEngineer: '', meterStatus: 'Estimated' })
  return <form className="org-form-grid ah-asset-form" onSubmit={(event) => { event.preventDefault(); if (!draft.name.trim()) return; if (initial) updateAsset({ ...draft, assetId: initial.assetId }); else addAsset(draft); onDone() }}>
    <label>Asset name<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Boiler 2" /></label>
    <label>Type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as AssetType })}>{assetTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
    <label>Site<select value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: event.target.value })}>{siteOptions.map((site) => <option key={site.siteId} value={site.siteId}>{site.siteName}</option>)}</select></label>
    <label>Owner (engineering)<input value={draft.ownerEngineer} onChange={(event) => setDraft({ ...draft, ownerEngineer: event.target.value })} placeholder="Team or person" /></label>
    <NumberField label="Electricity (MWh/yr)" value={draft.electricityMWh} onChange={(value) => setDraft({ ...draft, electricityMWh: value })} />
    <NumberField label="Fuel (GJ/yr)" value={draft.fuelGJ} onChange={(value) => setDraft({ ...draft, fuelGJ: value })} />
    <NumberField label="Process CO₂ (t/yr)" value={draft.processTCO2} onChange={(value) => setDraft({ ...draft, processTCO2: value })} />
    <label>Data quality<select value={draft.meterStatus} onChange={(event) => setDraft({ ...draft, meterStatus: event.target.value as MeterStatus })}>{meterStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
    <div className="org-form-actions"><button type="button" className="secondary-button" onClick={onDone}>Cancel</button><button type="submit" className="primary-button">{initial ? 'Save asset' : 'Add asset'}</button></div>
  </form>
}

function ActionHubPage() {
  useSyncExternalStore(subscribeToActionHub, getActionHubRevision, getActionHubRevision)
  const { settings, assets, projects } = getActionHubState()
  const carbon = getOrganisationCarbonState()
  const siteOptions = carbon.sites.map((site) => ({ siteId: site.siteId, siteName: site.siteName }))
  const siteName = (siteId: string) => carbon.sites.find((site) => site.siteId === siteId)?.siteName ?? 'Unassigned site'

  const [role, setRole] = useState<Role>('Sustainability')
  const [tab, setTabState] = useState<Tab>(readTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mineOnly, setMineOnly] = useState(false)
  const [owner, setOwner] = useState('')
  const [assetFormOpen, setAssetFormOpen] = useState<Asset | 'new' | null>(null)

  const setTab = (next: Tab) => {
    setTabState(next)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', next)
    window.history.replaceState(null, '', `?${params.toString()}`)
  }

  const summary = useMemo(() => portfolioSummary(assets, projects, settings), [assets, projects, settings])
  const suggestions = useMemo(() => suggestOpportunities(assets, settings, projects)
    .map((item) => ({ ...item, economics: projectEconomics({ ...item.estimate, projectId: '', assetId: item.asset.assetId, measureId: item.measure.measureId, title: '', status: 'Idea', ownerEngineer: '', sustainabilitySponsor: '', targetDate: '', comments: [] }, settings) }))
    .sort((a, b) => b.economics.netTCO2 - a.economics.netTCO2), [assets, projects, settings])
  const owners = [...new Set(assets.map((asset) => asset.ownerEngineer).filter(Boolean))].sort()
  const effectiveOwner = owner || owners[0] || ''
  const visibleProjects = role === 'Engineering' && mineOnly ? projects.filter((project) => project.ownerEngineer === effectiveOwner) : projects
  const awaitingMe = projects.filter((project) => allowedTransitions(project.status, role).length > 0 && project.status !== 'Rejected' && (role !== 'Engineering' || !mineOnly || project.ownerEngineer === effectiveOwner))
  const selected = projects.find((project) => project.projectId === selectedId)
  const progressPct = summary.requiredReductionTCO2 > 0 ? (summary.verifiedTCO2 + summary.committedTCO2) / summary.requiredReductionTCO2 * 100 : 0

  return <div className="dashboard-shell ah-page">
    <Header page="action-hub" title="Action Hub" subtitle="One shared plan for engineering and sustainability: find reductions, decide by cost per tonne, deliver, and verify." />
    <main className="dashboard-main ah-main">
      <section className="ah-rolebar">
        <div className="ah-roles" role="tablist" aria-label="View as">
          {(['Sustainability', 'Engineering', 'Management'] as Role[]).map((item) => <button key={item} type="button" role="tab" aria-selected={role === item} className={role === item ? 'active' : ''} onClick={() => setRole(item)}>{item}</button>)}
        </div>
        <p>{roleIntro[role]}</p>
        {role === 'Engineering' && <div className="ah-owner"><label className="org-checkbox"><input type="checkbox" checked={mineOnly} onChange={(event) => setMineOnly(event.target.checked)} /> Only my projects</label>
          {mineOnly && <select aria-label="Engineering owner" value={effectiveOwner} onChange={(event) => setOwner(event.target.value)}>{owners.map((item) => <option key={item}>{item}</option>)}</select>}</div>}
      </section>

      <p className="simulation-notice ah-notice">Demo plan for illustration only. Asset energy figures, factors, prices and measure estimates are assumptions that must be replaced with metered data, audits and quotes before any decision.</p>

      <nav className="ah-tabs" aria-label="Action Hub sections">
        {([['plan', 'Plan & target'], ['projects', `Projects (${visibleProjects.length})`], ['opportunities', `Opportunities (${suggestions.length})`], ['assets', `Assets (${assets.length})`], ['settings', 'Factors & prices']] as [Tab, string][])
          .map(([key, label]) => <button key={key} type="button" className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}
      </nav>

      {awaitingMe.length > 0 && tab !== 'projects' && <section className="ah-inbox">
        <strong>{awaitingMe.length} project{awaitingMe.length === 1 ? '' : 's'} waiting for {role}:</strong>
        {awaitingMe.slice(0, 4).map((project) => <button key={project.projectId} type="button" onClick={() => setSelectedId(project.projectId)}>{project.title} <span className={`ah-status ${statusTone[project.status]}`}>{project.status}</span></button>)}
      </section>}

      {tab === 'plan' && <>
        <section className="carbon-kpi-grid">
          <Kpi label={`Baseline (${settings.baselineYear})`} value={`${fmt(summary.baselineTCO2)} t`} detail="CO₂e/yr from the registered assets" />
          <Kpi label={`Target (${settings.targetYear})`} value={`${fmt(summary.targetTCO2)} t`} detail={`−${fmt(settings.targetReductionPct)}% · ${fmt(summary.requiredReductionTCO2)} t/yr to cut`} />
          <Kpi label="Verified + committed" value={`${fmt(progressPct, 1)}%`} detail={`${fmt(summary.verifiedTCO2 + summary.committedTCO2)} t/yr of the required reduction`} tone={progressPct >= 100 ? 'positive' : ''} />
          <Kpi label="Remaining gap" value={`${fmt(summary.remainingGapTCO2)} t`} detail={`Pipeline holds ${fmt(summary.pipelineTCO2)} t/yr of ideas`} tone={summary.remainingGapTCO2 > 0 ? 'warning' : 'positive'} />
        </section>
        <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Progress to target</h2><p>Verified projects count at their measured value. Everything else counts at its engineering estimate.</p></div></div>
          <TargetBar required={summary.requiredReductionTCO2} verified={summary.verifiedTCO2} committed={summary.committedTCO2} pipeline={summary.pipelineTCO2} />
        </section>
        <section className="carbon-card"><div className="carbon-card-heading"><div><h2>Marginal abatement cost curve</h2><p>Each bar is a project: its width is net t CO₂e/yr and its height is the cost per tonne. Bars below zero save money. Click a bar to open the project.</p></div></div>
          <MaccChart projects={projects} settings={settings} required={summary.requiredReductionTCO2} onSelect={setSelectedId} />
          {summary.netCapturePenaltyWarnings.length > 0 && <div className="org-alert">{summary.netCapturePenaltyWarnings.map((warning) => <div key={warning}>⚠ {warning}</div>)}</div>}
        </section>
      </>}

      {tab === 'projects' && <section className="ah-board" aria-label="Project board">
        {projectStatuses.map((status) => {
          const column = visibleProjects.filter((project) => project.status === status)
          return <div key={status} className={`ah-column ${statusTone[status]}`}>
            <h3>{status} <small>{column.length}</small></h3>
            {column.map((project) => {
              const economics = projectEconomics(project, settings)
              const contribution = projectContributionTCO2(project, settings)
              const actionable = allowedTransitions(project.status, role).length > 0
              return <button key={project.projectId} type="button" className={`ah-card${actionable ? ' actionable' : ''}`} onClick={() => setSelectedId(project.projectId)}>
                <strong>{project.title}</strong>
                <span className={contribution <= 0 ? 'bad' : ''}>{fmt(contribution)} t CO₂e/yr{project.status === 'Verified' ? ' (measured)' : ''}</span>
                <span>{economics.costPerTonneMYR === null ? 'No net abatement' : `${money(economics.costPerTonneMYR)}/t`}</span>
                <small>{project.ownerEngineer} · due {project.targetDate}</small>
                {actionable && <em>Action for {role}</em>}
              </button>
            })}
          </div>
        })}
      </section>}

      {tab === 'opportunities' && <section className="carbon-card">
        <div className="carbon-card-heading"><div><h2>Suggested opportunities</h2><p>Generated from your asset register and the measure library, ranked by estimated net abatement. These are first estimates: creating a project hands it to the asset owner to confirm.</p></div></div>
        {suggestions.length === 0 ? <div className="carbon-chart-empty">No new suggestions. Register more assets or add their energy data.</div> : <div className="ah-table-wrap"><table className="ah-table">
          <thead><tr><th>Asset</th><th>Measure</th><th>Category</th><th className="num">Net t CO₂e/yr</th><th className="num">MYR/t</th><th className="num">Payback</th><th>Owner</th><th /></tr></thead>
          <tbody>{suggestions.map(({ asset, measure, economics }) => <tr key={`${asset.assetId}-${measure.measureId}`}>
            <td>{asset.name}<small>{siteName(asset.siteId)}</small></td>
            <td>{measure.name}<small title={measure.estimateBasis}>{measure.summary}</small></td>
            <td>{measure.category}</td>
            <td className={`num ${economics.netTCO2 <= 0 ? 'bad' : ''}`}>{fmt(economics.netTCO2)}</td>
            <td className="num">{economics.costPerTonneMYR === null ? '—' : fmt(economics.costPerTonneMYR)}</td>
            <td className="num">{economics.simplePaybackYears === null ? '—' : `${fmt(economics.simplePaybackYears, 1)} y`}</td>
            <td>{asset.ownerEngineer || '—'}</td>
            <td>{role !== 'Management' && <button type="button" className="secondary-button" onClick={() => { const created = createProjectFromMeasure(asset.assetId, measure.measureId); if (created) setSelectedId(created.projectId) }}>Create project</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>}

      {tab === 'assets' && <section className="carbon-card">
        <div className="carbon-card-heading"><div><h2>Asset register</h2><p>The equipment that produces your emissions, with an engineering owner for each item. Metered data makes the plan and the verification credible.</p></div>
          {role !== 'Management' && <button type="button" className="primary-button" onClick={() => setAssetFormOpen('new')}>Add asset</button>}</div>
        {assetFormOpen && <AssetForm key={assetFormOpen === 'new' ? 'new' : assetFormOpen.assetId} siteOptions={siteOptions} initial={assetFormOpen === 'new' ? undefined : assetFormOpen} onDone={() => setAssetFormOpen(null)} />}
        <div className="ah-table-wrap"><table className="ah-table">
          <thead><tr><th>Asset</th><th>Type</th><th className="num">Electricity MWh</th><th className="num">Fuel GJ</th><th className="num">Process t</th><th className="num">Baseline t CO₂e</th><th>Data</th><th>Owner</th><th /></tr></thead>
          <tbody>{assets.map((asset) => <tr key={asset.assetId}>
            <td>{asset.name}<small>{siteName(asset.siteId)}</small></td><td>{asset.type}</td>
            <td className="num">{fmt(asset.electricityMWh)}</td><td className="num">{fmt(asset.fuelGJ)}</td><td className="num">{fmt(asset.processTCO2)}</td>
            <td className="num"><b>{fmt(assetBaselineTCO2(asset, settings))}</b></td>
            <td><span className={`ah-meter ${asset.meterStatus === 'Estimated' ? 'warn' : ''}`}>{asset.meterStatus}</span></td>
            <td>{asset.ownerEngineer}</td>
            <td>{role !== 'Management' && <div className="ah-row-actions"><button type="button" className="secondary-button" onClick={() => setAssetFormOpen(asset)}>Edit</button><button type="button" className="secondary-button" onClick={() => { if (confirm(`Remove ${asset.name} and its projects?`)) removeAsset(asset.assetId) }}>Remove</button></div>}</td>
          </tr>)}</tbody>
        </table></div>
      </section>}

      {tab === 'settings' && <section className="carbon-card">
        <div className="carbon-card-heading"><div><h2>Factors & prices</h2><p>These values drive every tonne and ringgit on this page. The demo values are unverified placeholders: replace them with your site’s grid factor, fuel factor and tariffs.</p></div>
          <button type="button" className="secondary-button" onClick={() => { if (confirm('Reset the Action Hub to the demo plan? Your assets and projects will be replaced.')) resetActionHubDemo() }}>Reset demo plan</button></div>
        <div className="org-form-grid ah-fields" aria-disabled={role === 'Engineering'}>
          {([
            ['gridFactorKgPerKWh', 'Grid emission factor (kg CO₂e/kWh)'],
            ['fuelFactorKgPerGJ', 'Fuel emission factor (kg CO₂e/GJ)'],
            ['electricityPriceMYRPerMWh', 'Electricity price (MYR/MWh)'],
            ['fuelPriceMYRPerGJ', 'Fuel price (MYR/GJ)'],
            ['discountRatePct', 'Discount rate (%)'],
            ['carbonPriceMYRPerT', 'Internal carbon price (MYR/t)'],
            ['baselineYear', 'Baseline year'],
            ['targetYear', 'Target year'],
            ['targetReductionPct', 'Target reduction (%)'],
          ] as [keyof PlanSettings, string][]).map(([key, label]) => <NumberField key={key} label={label} value={settings[key]} disabled={role === 'Engineering'} onChange={(value) => updateSettings({ [key]: value })} />)}
        </div>
        {role === 'Engineering' && <p className="ah-muted">Factors and targets are owned by the sustainability team.</p>}
      </section>}
    </main>
    {selected && <ProjectDrawer project={selected} role={role} onClose={() => setSelectedId(null)} />}
  </div>
}

export default ActionHubPage
