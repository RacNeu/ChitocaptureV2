import { useState } from 'react'
import { kindIcon, num, tonnes } from '../format'
import { summarise } from '../model/calc'
import { companyActions, useCompany } from '../model/store'
import { industryTemplates, templateById } from '../model/templates'

type Props = { onOpen: (view: 'twin' | 'control' | 'analysis') => void; onAddSite: () => void }

const siteColours = ['#059669', '#0ea5e9', '#f59e0b', '#7c3aed', '#e11d48', '#14b8a6', '#64748b']

export default function Company({ onOpen, onAddSite }: Props) {
  const company = useCompany()
  const [adding, setAdding] = useState(false)
  const rows = company.sites.map((site, index) => {
    const summary = summarise(site.state)
    const top = [...summary.byMachine].sort((a, b) => b.baselineT - a.baselineT)[0]
    return { site, summary, top, colour: siteColours[index % siteColours.length], template: templateById(site.state.settings.industryId) }
  })
  const total = rows.reduce((sum, row) => sum + row.summary.baselineT, 0)
  const afterPlan = rows.reduce((sum, row) => sum + row.summary.afterPlanT, 0)
  const target = rows.reduce((sum, row) => sum + row.summary.targetT, 0)
  const biggest = [...rows].sort((a, b) => b.summary.baselineT - a.summary.baselineT)[0]
  const open = (siteId: string, view: 'twin' | 'control' | 'analysis') => { companyActions.switchSite(siteId); onOpen(view) }

  return <div className="company">
    <header className="plan-head">
      <div>
        <span className="eyebrow">Company overview</span>
        <h1 className="company-name">{company.name}</h1>
        <p className="muted">{company.sites.length} sites · every figure is the sum of the sites below · sample data, illustrative only</p>
      </div>
      <button type="button" className="btn" onClick={() => setAdding(!adding)}>+ Add site</button>
    </header>

    {adding && <section className="card add-site">
      <h2>Add a site</h2>
      <p className="muted small">Each site keeps its own machines, map, plan and settings. You can review the sample machines in the next step.</p>
      <div className="industry-grid small">{industryTemplates.map((template) => <button key={template.id} type="button" className="industry" onClick={() => { companyActions.addSite(template.id); onAddSite() }}>
        <span className="industry-icon">{template.icon}</span><strong>{template.label}</strong><small>{template.blurb}</small>
      </button>)}</div>
    </section>}

    <div className="kpis">
      <div className="kpi"><span>Company emissions</span><strong>{tonnes(total)}</strong><small>CO₂e per year across {company.sites.length} sites</small></div>
      <div className="kpi accent"><span>With site plans</span><strong>{tonnes(afterPlan)}</strong><small>−{num(total > 0 ? (1 - afterPlan / total) * 100 : 0, 1)}% from planned actions</small></div>
      <div className="kpi"><span>Combined target</span><strong>{tonnes(target)}</strong><small>sum of each site’s target</small></div>
      <div className="kpi warn"><span>Biggest site</span><strong>{biggest?.site.state.settings.factoryName ?? '—'}</strong><small>{biggest ? `${num(biggest.summary.baselineT / Math.max(1, total) * 100, 1)}% of company emissions` : ''}</small></div>
    </div>

    <section className="card">
      <h2>Where the company’s carbon comes from</h2>
      <div className="site-split" role="img" aria-label="Share of company emissions by site">
        {rows.map((row) => <span key={row.site.id} style={{ flexGrow: Math.max(row.summary.baselineT, total * 0.004), background: row.colour }} title={`${row.site.state.settings.factoryName}: ${tonnes(row.summary.baselineT)}`} />)}
      </div>
      <div className="legend">{rows.map((row) => <span key={row.site.id}><i style={{ background: row.colour }} />{row.site.state.settings.factoryName} · {num(row.summary.baselineT / Math.max(1, total) * 100, row.summary.baselineT / Math.max(1, total) < 0.01 ? 2 : 1)}%</span>)}</div>
    </section>

    <div className="site-grid">
      {rows.map((row) => {
        const isSteel = row.site.state.settings.industryId === 'steel'
        const active = row.site.id === company.activeId
        return <article key={row.site.id} className={`site-card${active ? ' active' : ''}`} style={{ borderTopColor: row.colour }}>
          <header>
            <span className="site-icon">{row.template?.icon ?? '🏭'}</span>
            <div><h3>{row.site.state.settings.factoryName}</h3><small>{row.template?.label ?? 'Custom site'}{!row.site.state.onboarded ? ' · setup not finished' : ''}</small></div>
            {active && <span className="active-chip">Open now</span>}
          </header>
          <div className="site-number"><strong>{tonnes(row.summary.baselineT)}</strong><small>CO₂e per year</small></div>
          <dl className="site-facts">
            <div><dt>Share of company</dt><dd>{num(row.summary.baselineT / Math.max(1, total) * 100, 1)}%</dd></div>
            <div><dt>Biggest source</dt><dd>{row.top ? `${kindIcon[row.top.machine.kind] ?? ''} ${row.top.machine.name}` : '—'}</dd></div>
            <div><dt>Machines</dt><dd>{row.site.state.machines.length}</dd></div>
            <div><dt>Planned actions</dt><dd>{row.site.state.plan.length ? `${row.site.state.plan.length} · −${tonnes(row.summary.plannedReductionT)}/yr` : 'none yet'}</dd></div>
          </dl>
          <div className="site-actions">
            {isSteel && <button type="button" className="btn small" onClick={() => open(row.site.id, 'control')}>🔥 Control room</button>}
            <button type="button" className={`btn small${isSteel ? ' ghost' : ''}`} onClick={() => open(row.site.id, 'twin')}>◭ Site 3D</button>
            <button type="button" className="btn small ghost" onClick={() => open(row.site.id, 'analysis')}>📊 Analysis</button>
          </div>
        </article>
      })}
      <button type="button" className="site-card add" onClick={() => setAdding(true)}><span>+</span>Add another site<small>cement, palm oil, food, electronics, textile or an office</small></button>
    </div>

    <p className="muted small">Sites report separately and add up to the company total, the way corporate carbon inventories are organised. Electricity, fuel and process emissions are counted per site with that site’s own factors.</p>
  </div>
}
