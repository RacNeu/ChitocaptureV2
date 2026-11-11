import { useState } from 'react'
import { companyActions, MAX_ADDED_COMPANIES, useWorkspace } from '../model/store'
import { industryTemplates } from '../model/templates'

type Props = { onCreated: () => void; onCancel: () => void }
type Pick = { key: number; industryId: string; name: string }

let counter = 0

export default function AddCompany({ onCreated, onCancel }: Props) {
  const workspace = useWorkspace()
  const added = workspace.companies.filter((item) => !item.fixed).length
  const [name, setName] = useState('')
  const [sites, setSites] = useState<Pick[]>([])
  const full = added >= MAX_ADDED_COMPANIES
  const addSite = (industryId: string) => {
    const label = industryTemplates.find((item) => item.id === industryId)?.label ?? 'New site'
    const same = sites.filter((item) => item.industryId === industryId).length
    setSites([...sites, { key: counter++, industryId, name: same ? `${label} ${same + 1}` : label }])
  }
  const canCreate = !full && name.trim().length > 0 && sites.length > 0 && sites.every((item) => item.name.trim())

  return <div className="add-company">
    <header className="plan-head">
      <div><span className="eyebrow">New company · {added} of {MAX_ADDED_COMPANIES} added</span><h1>Add a company</h1>
        <p className="muted">Name the company, pick its sites, then set up each site’s machines. Sample machines are filled in so you only change what you know.</p></div>
      <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
    </header>

    {full ? <section className="card"><p>You’ve added the maximum of {MAX_ADDED_COMPANIES} companies. Delete one on its Company page to add another.</p></section> : <>
      <section className="card add-step">
        <h2><b>1</b> Company name</h2>
        <input className="big-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Klang Valley Foods Sdn Bhd" maxLength={60} autoFocus />
      </section>

      <section className="card add-step">
        <h2><b>2</b> Sites <small className="muted">click a type to add a site; add as many as the company has (up to 6)</small></h2>
        <div className="industry-grid small">{industryTemplates.map((template) => <button key={template.id} type="button" className="industry" disabled={sites.length >= 6} onClick={() => addSite(template.id)}>
          <span className="industry-icon">{template.icon}</span><strong>+ {template.label}</strong><small>{template.blurb}</small>
        </button>)}</div>
        {sites.length > 0 && <ul className="picked-sites">{sites.map((site) => <li key={site.key}>
          <span>{industryTemplates.find((item) => item.id === site.industryId)?.icon}</span>
          <input aria-label="Site name" value={site.name} onChange={(event) => setSites(sites.map((item) => item.key === site.key ? { ...item, name: event.target.value } : item))} />
          <small className="muted">{industryTemplates.find((item) => item.id === site.industryId)?.label}</small>
          <button type="button" className="icon-btn" aria-label={`Remove ${site.name}`} onClick={() => setSites(sites.filter((item) => item.key !== site.key))}>✕</button>
        </li>)}</ul>}
      </section>

      <section className="card add-step">
        <h2><b>3</b> Machines</h2>
        <p className="muted">After you create the company, each site opens its setup so you can check its machines, fuels and energy use. You can come back to any site later from the Company page.</p>
        <button type="button" className="btn big" disabled={!canCreate} onClick={() => { if (companyActions.addCompany(name, sites.map(({ industryId, name: siteName }) => ({ industryId, name: siteName.trim() })))) onCreated() }}>Create company & set up machines →</button>
      </section>
    </>}
  </div>
}
