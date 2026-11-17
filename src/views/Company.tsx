import { useMemo, useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import Info from '../components/Info'
import { defaultTaxInputs } from '../model/carbonTax'
import { siteFindings } from '../model/findings'
import { monthLabel } from '../model/history'
import { outlook } from '../model/outlook'
import { impactLabel, likelihoodLabel, siteRisks } from '../model/risk'
import { roleById, waitingFor } from '../model/roles'
import { companyActions, MAX_ADDED_COMPANIES, useCompany, useRole, useWorkspace } from '../model/store'
import { isCompanyAccount, useSession, visibleCompanies } from '../model/auth'
import { industryTemplates, templateById } from '../model/templates'
import { stateById } from '../model/malaysia'
import type { View } from '../App'

const siteColours = ['#059669', '#0ea5e9', '#f59e0b', '#7c3aed', '#e11d48', '#14b8a6', '#64748b']

/**
 * The company, all sites at once. Every figure comes from each site's own uploads; a site
 * without bills is listed as "no data yet" and adds nothing (no template figures are counted).
 */
export default function Company({ go, onAddSite }: { go: (view: View) => void; onAddSite: () => void }) {
  const company = useCompany()
  const role = useRole()
  const [adding, setAdding] = useState(false)
  const workspace = useWorkspace()
  const session = useSession()
  const companies = visibleCompanies(workspace, session)
  const canAddCompany = !isCompanyAccount(session) && workspace.companies.filter((c) => !c.fixed).length < MAX_ADDED_COMPANIES

  const rows = useMemo(() => company.sites.map((site, index) => {
    const s = site.state
    const view = outlook(s, { ...defaultTaxInputs, ...s.settings.carbonTax })
    const found = siteFindings(s)
    const open = found.findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed')
    const risks = siteRisks(s).risks.filter((r) => r.likelihood !== null && r.impact !== null).sort((a, b) => b.likelihood! * b.impact! - a.likelihood! * a.impact!)
    const tax = view.tax.find((t) => t.year === new Date().getFullYear() + 1)
    return {
      site, colour: siteColours[index % siteColours.length], template: templateById(s.settings.industryId),
      hasBills: !view.empty, hasMeter: Boolean(found.load), months: view.months.length,
      s1: view.last12.scope1T, s2: view.last12.scope2T, total: view.last12.totalT, from: view.last12.from, to: view.last12.to,
      change: view.prior12 && view.prior12.totalT > 0 ? (view.last12.totalT / view.prior12.totalT - 1) * 100 : null,
      saving: open.reduce((sum, f) => sum + f.rmPerMonth, 0), ways: open.length,
      onTrack: view.target.onTrack, topRisk: risks[0] ?? null, taxRM: tax?.billRM ?? 0,
      waiting: s.plan.filter((action) => waitingFor(role, action.status ?? 'proposed')).length,
    }
  }), [company, role])

  const withData = rows.filter((r) => r.hasBills)
  const sum = (key: 's1' | 's2' | 'total' | 'saving' | 'taxRM') => rows.reduce((acc, r) => acc + r[key], 0)
  const total = sum('total')
  const saving = sum('saving')
  const waiting = rows.filter((r) => r.waiting > 0)
  const topRisk = rows.flatMap((r) => r.topRisk ? [{ risk: r.topRisk, site: r.site }] : []).sort((a, b) => b.risk.likelihood! * b.risk.impact! - a.risk.likelihood! * a.risk.impact!)[0]
  const openSite = (id: string, view: View = 'home') => { companyActions.switchSite(id); go(view) }

  return <div className="company-overview">
    <header className="dash-head">
      <div>
        <span className="eyebrow">Company overview</span>
        <h1 className="company-name">{company.name}</h1>
        <p className="muted">{company.sites.length} site{company.sites.length === 1 ? '' : 's'} · {withData.length} with bills uploaded <Info>Company totals are the sum of each site’s own uploaded bills, the way Bursa and NSRF disclosures are organised. Sites without bills add nothing until they upload.</Info></p>
      </div>
      <div className="dash-actions">
        {companies.length > 1 && <label className="field inline"><span className="sr-only">Switch company</span><select value={company.id} onChange={(event) => companyActions.switchCompany(event.target.value)}>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {canAddCompany && <button type="button" className="btn ghost" onClick={() => go('add-company')}>+ Add company</button>}
        {!company.fixed && <button type="button" className="btn ghost" onClick={() => { if (confirm(`Delete ${company.name} and all its sites? This cannot be undone.`)) companyActions.removeCompany(company.id) }}>🗑 Delete company</button>}
        <button type="button" className="btn ghost" onClick={() => setAdding(!adding)}>+ Add site</button>
        <button type="button" className="btn" onClick={() => go('reports')}>⤓ Reports</button>
      </div>
    </header>

    {adding && <section className="card add-site">
      <h2>Add a site</h2>
      <div className="industry-grid small">{industryTemplates.map((template) => <button key={template.id} type="button" className="industry" onClick={() => { companyActions.addSite(template.id); onAddSite() }}>
        <span className="industry-icon">{template.icon}</span><strong>{template.label}</strong><small>{template.blurb}</small>
      </button>)}</div>
    </section>}

    {waiting.length > 0 && <div className="waiting-banner">
      <span>{roleById(role).icon} <b>{waiting.reduce((s, r) => s + r.waiting, 0)} plan action(s) waiting for you</b> as {roleById(role).label}</span>
      <button type="button" className="btn small" onClick={() => openSite(waiting[0].site.id, 'plan')}>Open →</button>
    </div>}

    <div className="dash-kpis">
      <div className="dash-kpi"><span className="dash-kpi-label">Company emissions · last 12 months</span>
        {withData.length ? <><strong>{tonnes(total)} <small>CO₂e</small></strong><small className="muted">Scope 1 {tonnes(sum('s1'))} · Scope 2 {tonnes(sum('s2'))}</small></> : <span className="tile-empty">No bills yet</span>}</div>
      <div className="dash-kpi"><span className="dash-kpi-label">Money you could save</span>
        {saving > 0 ? <><strong className="good-text">{ringgit(saving)} <small>/month</small></strong><small className="muted">{rows.reduce((s, r) => s + r.ways, 0)} ways across {rows.filter((r) => r.saving > 0).length} site(s)</small></> : <span className="tile-empty">Add meter data</span>}</div>
      <div className="dash-kpi"><span className="dash-kpi-label">Carbon tax {new Date().getFullYear() + 1} (estimate)</span>
        {sum('taxRM') > 0 ? <><strong>{ringgit(sum('taxRM'))}</strong><small className="muted">Singapore rate as reference</small></> : <span className="tile-empty">Needs bills</span>}</div>
      <div className="dash-kpi"><span className="dash-kpi-label">Biggest risk</span>
        {topRisk ? <><strong className="risk-name">{topRisk.risk.name}</strong><small className="muted">{topRisk.site.state.settings.factoryName} · {likelihoodLabel[topRisk.risk.likelihood!]} · {impactLabel[topRisk.risk.impact!]}</small></> : <span className="tile-empty">Fill a site checklist</span>}</div>
    </div>

    {withData.length > 0 && <section className="card">
      <header className="card-head"><div><h2>Where the company’s carbon comes from</h2></div></header>
      <div className="site-split" role="img" aria-label="Share of company emissions by site">
        {rows.filter((r) => r.total > 0).map((r) => <span key={r.site.id} style={{ flexGrow: r.total, background: r.colour }} title={`${r.site.state.settings.factoryName}: ${tonnes(r.total)}`} />)}
      </div>
      <div className="legend">{rows.filter((r) => r.total > 0).map((r) => <span key={r.site.id}><i style={{ background: r.colour }} />{r.site.state.settings.factoryName} · {num(r.total / Math.max(1, total) * 100, 1)}%</span>)}</div>
    </section>}

    <div className="site-cards">
      {rows.map((r) => {
        const s = r.site.state.settings
        const where = stateById(s.stateId)
        const active = r.site.id === company.activeId
        return <article key={r.site.id} className={`site-row${active ? ' active' : ''}`} style={{ borderLeftColor: r.colour }}>
          <div className="site-who">
            <span className="site-icon">{r.template?.icon ?? '🏭'}</span>
            <div><h3>{s.factoryName}</h3><small className="muted">{r.template?.label ?? 'Site'}{where ? ` · ${s.industrialPark ? `${s.industrialPark}, ` : ''}${where.label}` : ''}{!r.site.state.onboarded ? ' · setup not finished' : ''}</small></div>
          </div>
          <div className="site-data">
            <span className={`chip-data${r.hasBills ? ' on' : ''}`}>{r.hasBills ? `✓ ${r.months} months of bills` : 'No bills'}</span>
            <span className={`chip-data${r.hasMeter ? ' on' : ''}`}>{r.hasMeter ? '✓ Meter data' : 'No meter data'}</span>
          </div>
          <div className="site-stat"><span>Emissions</span>{r.hasBills ? <><b>{tonnes(r.total)}</b><small className={r.change === null ? 'muted' : r.change <= 0 ? 'good-text' : 'bad-text'}>{r.change === null ? `${monthLabel(r.from)} – ${monthLabel(r.to)}` : `${r.change <= 0 ? '▼' : '▲'} ${num(Math.abs(r.change), 1)}%`}</small></> : <b className="muted">—</b>}</div>
          <div className="site-stat"><span>Could save</span>{r.saving > 0 ? <><b className="good-text">{ringgit(r.saving)}</b><small className="muted">/month</small></> : <b className="muted">—</b>}</div>
          <div className="site-stat"><span>Target</span><b className={r.onTrack === null ? 'muted' : r.onTrack ? 'good-text' : 'bad-text'}>{r.onTrack === null ? '—' : r.onTrack ? '✓ On track' : '⚠ Off track'}</b></div>
          <div className="site-stat"><span>Top risk</span>{r.topRisk ? <><b>{r.topRisk.name}</b><small className="muted">{likelihoodLabel[r.topRisk.likelihood!]}</small></> : <b className="muted">—</b>}</div>
          <div className="site-go">
            {r.hasBills ? <button type="button" className="btn small" onClick={() => openSite(r.site.id)}>Open site →</button>
              : <button type="button" className="btn small" onClick={() => openSite(r.site.id, 'data')}>⇪ Upload bills</button>}
            {!r.site.fixed && <button type="button" className="icon-btn" title="Delete this site" aria-label={`Delete ${s.factoryName}`}
              onClick={() => { if (confirm(`Delete “${s.factoryName}” and everything entered for it? This cannot be undone.`)) companyActions.removeSite(r.site.id) }}>🗑</button>}
          </div>
        </article>
      })}
      <button type="button" className="site-row add" onClick={() => setAdding(true)}>+ Add another site <small className="muted">plant, warehouse or office</small></button>
    </div>
  </div>
}
