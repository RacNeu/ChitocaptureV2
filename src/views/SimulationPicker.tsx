import { useState } from 'react'
import CompanyLogo, { logoKindFor } from '../components/CompanyLogo'
import { tonnes } from '../format'
import { summarise } from '../model/calc'
import { companyActions, MAX_ADDED_COMPANIES, useCompany, useWorkspace, type Company } from '../model/store'
import { templateById } from '../model/templates'

/** Industries that have a live process simulation. Others open in Site 3D. */
export const simulatedIndustries = new Set(['steel'])

type Props = { onStart: () => void; onView3D: () => void; onAddCompany: () => void }
type Step = { kind: 'logos' } | { kind: 'others' } | { kind: 'sites'; companyId: string }

const primaryIndustry = (company: Company) => company.sites[0]?.state.settings.industryId

export default function SimulationPicker({ onStart, onView3D, onAddCompany }: Props) {
  const workspace = useWorkspace()
  const active = useCompany()
  const [step, setStep] = useState<Step>({ kind: 'logos' })
  const samples = workspace.companies.filter((item) => item.fixed)
  const added = workspace.companies.filter((item) => !item.fixed)
  const otherIsCurrent = added.some((item) => item.id === active.id)

  const Back = ({ to }: { to: Step }) => <button type="button" className="sim-back" onClick={() => setStep(to)}>← Back</button>

  return <div className="sim-stage">
    {step.kind === 'logos' && <div className="sim-step" key="logos">
      <h1 className="sim-title">Which would you like to simulate?</h1>
      <div className="logo-row">
        {samples.map((company, index) => <button key={company.id} type="button" className="logo-card" style={{ animationDelay: `${index * 120}ms` }} onClick={() => setStep({ kind: 'sites', companyId: company.id })}>
          <CompanyLogo kind={logoKindFor(primaryIndustry(company))} />
          <strong>{company.name}</strong>
          {company.id === active.id && <em>(current)</em>}
        </button>)}
        <button type="button" className="logo-card other" style={{ animationDelay: `${samples.length * 120}ms` }} onClick={() => setStep({ kind: 'others' })}>
          <CompanyLogo kind="factory" />
          <strong>Other companies</strong>
          <span className="logo-sub">{added.length ? `${added.length} added` : 'none added yet'}</span>
          {otherIsCurrent && <em>(current)</em>}
        </button>
      </div>
    </div>}

    {step.kind === 'others' && <div className="sim-step" key="others">
      <Back to={{ kind: 'logos' }} />
      <h1 className="sim-title">Your companies</h1>
      {added.length === 0
        ? <div className="sim-empty"><p>You haven’t added a company yet.</p><button type="button" className="btn" onClick={onAddCompany}>+ Add company</button></div>
        : <div className="logo-row small">
          {added.map((company, index) => <button key={company.id} type="button" className="logo-card" style={{ animationDelay: `${index * 100}ms` }} onClick={() => setStep({ kind: 'sites', companyId: company.id })}>
            <CompanyLogo kind={logoKindFor(primaryIndustry(company))} size={140} />
            <strong>{company.name}</strong>
            {company.id === active.id && <em>(current)</em>}
          </button>)}
          {added.length < MAX_ADDED_COMPANIES && <button type="button" className="logo-card add" onClick={onAddCompany}><span>+</span><strong>Add company</strong><span className="logo-sub">{MAX_ADDED_COMPANIES - added.length} of {MAX_ADDED_COMPANIES} left</span></button>}
        </div>}
    </div>}

    {step.kind === 'sites' && (() => {
      const company = workspace.companies.find((item) => item.id === step.companyId)
      if (!company) return null
      return <div className="sim-step" key={`sites-${company.id}`}>
        <Back to={company.fixed ? { kind: 'logos' } : { kind: 'others' }} />
        <div className="sim-company-head"><CompanyLogo kind={logoKindFor(primaryIndustry(company))} size={64} /><div><span>Choose a site</span><h1>{company.name}</h1></div></div>
        <div className="sim-sites">
          {company.sites.map((site, index) => {
            const template = templateById(site.state.settings.industryId)
            const live = simulatedIndustries.has(site.state.settings.industryId) && site.state.onboarded
            return <button key={site.id} type="button" className={`sim-site${live ? ' live' : ''}`} style={{ animationDelay: `${index * 80}ms` }}
              onClick={() => { companyActions.switchSite(site.id); if (live) onStart(); else onView3D() }}>
              <span className="sim-site-icon">{template?.icon ?? '🏭'}</span>
              <span className="sim-site-text"><strong>{site.state.settings.factoryName}</strong><small>{template?.label ?? 'Custom site'} · {tonnes(summarise(site.state).baselineT)} CO₂e/yr</small></span>
              <span className={`sim-badge${live ? ' on' : ''}`}>{live ? '▶ Simulate' : site.state.onboarded ? '◭ Open in 3D' : 'Set up machines'}</span>
            </button>
          })}
        </div>
        <p className="sim-hint">Sites with a live process model run the simulation. Others open in Site 3D.</p>
      </div>
    })()}
  </div>
}
