import { useEffect, useState } from 'react'
import { actions, companyActions, getCompany, getState, useCompany, useFactory, useRole, useWorkspace } from './model/store'
import { roles } from './model/roles'
import { templateById } from './model/templates'
import Company from './views/Company'
import SimulationPicker from './views/SimulationPicker'
import AddCompany from './views/AddCompany'
import { MAX_ADDED_COMPANIES } from './model/store'
import { useSensor } from './sensor/hub'
import Analysis from './views/Analysis'
import ControlRoom from './views/ControlRoom'
import Onboarding from './views/Onboarding'
import Plan from './views/Plan'
import Sensors from './views/Sensors'
import Settings from './views/Settings'
import Twin from './views/Twin'

type View = 'company' | 'add-company' | 'twin' | 'simulate' | 'control' | 'analysis' | 'plan' | 'sensors' | 'settings'
const views: { id: View; label: string; icon: string }[] = [
  { id: 'company', label: 'Company', icon: '🏢' },
  { id: 'twin', label: 'Site 3D', icon: '◭' },
  { id: 'simulate', label: 'Simulation', icon: '🔥' },
  { id: 'analysis', label: 'Analysis', icon: '📊' },
  { id: 'plan', label: 'Plan', icon: '🗺' },
  { id: 'sensors', label: 'Sensors', icon: '📡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const readView = (): View => {
  const hash = window.location.hash.replace('#', '')
  return views.some((view) => view.id === hash) || hash === 'control' || hash === 'add-company' ? hash as View : 'company'
}

export default function App() {
  const state = useFactory()
  const sensor = useSensor()
  const [view, setView] = useState<View>(readView)
  const company = useCompany()
  const workspace = useWorkspace()
  const role = useRole()
  const onboarding = !state.onboarded
  const [previousSite, setPreviousSite] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (next: View) => { window.location.hash = next; setView(next) }

  // After a site is set up, continue with the next site in the same company that still needs it.
  const finishSetup = () => {
    const next = getCompany().sites.find((site) => !site.state.onboarded)
    if (next) { companyActions.switchSite(next.id); return }
    go(getState().settings.industryId === 'steel' ? 'control' : 'twin')
  }
  const cancelSetup = () => {
    const id = company.activeId
    if (!company.fixed && company.sites.every((site) => !site.state.onboarded)) { companyActions.removeCompany(company.id); go('company'); return }
    const fallback = previousSite && previousSite !== id ? previousSite : company.sites.find((site) => site.id !== id)?.id
    if (fallback) { companyActions.switchSite(fallback); companyActions.removeSite(id) }
    go('company')
  }
  if (onboarding) return <Onboarding key={company.activeId} progress={company.sites.length > 1 ? `Site ${company.sites.findIndex((site) => site.id === company.activeId) + 1} of ${company.sites.length} · ${company.name}` : undefined} onDone={finishSetup} onCancel={company.sites.length > 1 || !company.fixed ? cancelSetup : undefined} />

  const siteScoped = view === 'twin' || view === 'plan' || view === 'settings' || view === 'sensors'
  const addedCount = workspace.companies.filter((item) => !item.fixed).length

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◭</span> ChitoCapture
        <label className="site-switch" title="Switch company">
          <span className="sr-only">Company</span>
          <select value={company.id} onChange={(event) => {
            const value = event.target.value
            if (value === '__add') { go('add-company'); return }
            companyActions.switchCompany(value)
            if (view === 'control' && getState().settings.industryId !== 'steel') go('simulate')
            if (view === 'add-company') go('company')
          }}>
            {workspace.companies.map((item) => <option key={item.id} value={item.id}>🏢 {item.name}</option>)}
            <option value="__add" disabled={addedCount >= MAX_ADDED_COMPANIES}>{addedCount >= MAX_ADDED_COMPANIES ? `Company limit reached (${MAX_ADDED_COMPANIES})` : '+ Add company…'}</option>
          </select>
        </label>
      </div>
      <nav className="tabs" aria-label="Main">
        {views.map((item) => { const current = view === item.id || (item.id === 'simulate' && view === 'control'); return <button key={item.id} type="button" className={current ? 'active' : ''} aria-current={current ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden="true">{item.icon}</span><span className="tab-label">{item.label}</span></button> })}
      </nav>
      <label className="role-switch" title="View the app as a different team">
        <span className="role-label">View as</span>
        <select value={role} onChange={(event) => actions.setRole(event.target.value as typeof role)}>
          {roles.map((item) => <option key={item.id} value={item.id}>{item.icon} {item.label}</option>)}
        </select>
      </label>
      <button type="button" className={`live-pill ${sensor.status}`} onClick={() => go('sensors')} title="Sensor status">
        <i />{sensor.status === 'live' ? 'Live' : sensor.status === 'simulated' ? 'Simulated' : sensor.status === 'error' ? 'Sensor error' : 'No sensor'}
      </button>
    </header>
    <main className="content">
      {siteScoped && company.sites.length > 1 && <div className="site-bar">
        <span className="eyebrow">Site</span>
        {company.sites.map((site) => <button key={site.id} type="button" className={site.id === company.activeId ? 'active' : ''} onClick={() => companyActions.switchSite(site.id)}>
          {templateById(site.state.settings.industryId)?.icon ?? '🏭'} {site.state.settings.factoryName}{site.state.onboarded ? '' : ' · set up'}
        </button>)}
      </div>}
      {view === 'add-company' && <AddCompany onCreated={() => undefined} onCancel={() => go('company')} />}
      {view === 'company' && <Company onOpen={go} onAddSite={() => setPreviousSite(company.activeId)} />}
      {view === 'twin' && <Twin onShowPlan={() => go('plan')} />}
      {view === 'simulate' && <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} onAddCompany={() => go('add-company')} />}
      {view === 'control' && (state.settings.industryId === 'steel' ? <ControlRoom onChooseSite={() => go('simulate')} /> : <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} onAddCompany={() => go('add-company')} />)}
      {view === 'analysis' && <Analysis />}
      {view === 'plan' && <Plan onShowTwin={() => go('twin')} />}
      {view === 'sensors' && <Sensors />}
      {view === 'settings' && <Settings onRestart={() => undefined} onRemoved={() => go('company')} />}
    </main>
    <footer className="foot">Prototype · sample data and factors are illustrative and must be verified before reporting · data stays in this browser</footer>
  </div>
}
