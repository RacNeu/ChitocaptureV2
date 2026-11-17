import { useEffect, useState } from 'react'
import { actions, companyActions, getCompany, getState, useCompany, useFactory, useRole, useWorkspace } from './model/store'
import { roles } from './model/roles'
import { templateById } from './model/templates'
import Company from './views/Company'
import SimulationPicker from './views/SimulationPicker'
import AddCompany from './views/AddCompany'
import Tour from './components/Tour'
import Reports from './views/Reports'
import Sources from './views/Sources'
import { MAX_ADDED_COMPANIES } from './model/store'
import { useSensor } from './sensor/hub'
import Analysis from './views/Analysis'
import ControlRoom from './views/ControlRoom'
import GalvControlRoom from './views/GalvControlRoom'
import { simulatedIndustries } from './views/SimulationPicker'
import Onboarding from './views/Onboarding'
import Plan from './views/Plan'
import Sensors from './views/Sensors'
import Settings from './views/Settings'
import Twin from './views/Twin'
import Login from './views/Login'
import Dashboard from './views/Dashboard'
import DataUpload from './views/DataUpload'
import LoadProfile from './views/LoadProfile'
import Findings from './views/Findings'
import Risks from './views/Risks'
import Home from './views/Home'
import ChatAssistant from './components/ChatAssistant'
import BrandLogo from './components/BrandLogo'
import { isCompanyAccount, signOut, useSession, visibleCompanies } from './model/auth'
import { getWorkspace } from './model/store'

type View = 'home' | 'dashboard' | 'load' | 'findings' | 'risks' | 'data' | 'company' | 'add-company' | 'reports' | 'sources' | 'twin' | 'simulate' | 'control' | 'analysis' | 'plan' | 'sensors' | 'settings'
export type { View }

type MenuItem = { id: View; label: string; icon: string; match: View[] }
/** Five main places, in the order of the story: see → understand → act → protect → report. */
const mainMenu: MenuItem[] = [
  { id: 'home', label: 'Home', icon: '⌂', match: ['home'] },
  { id: 'dashboard', label: 'Energy & carbon', icon: '⚡', match: ['dashboard', 'load', 'data'] },
  { id: 'findings', label: 'Savings', icon: '⚑', match: ['findings', 'plan'] },
  { id: 'risks', label: 'Risks', icon: '◬', match: ['risks'] },
  { id: 'reports', label: 'Reports', icon: '📄', match: ['reports', 'sources'] },
]
const moreMenu: MenuItem[] = [
  { id: 'twin', label: 'Site 3D', icon: '◭', match: ['twin'] },
  { id: 'simulate', label: 'Simulation', icon: '🔥', match: ['simulate', 'control'] },
  { id: 'company', label: 'Company', icon: '🏢', match: ['company', 'add-company'] },
  { id: 'analysis', label: 'Analysis', icon: '📊', match: ['analysis'] },
]
const setupMenu: MenuItem[] = [
  { id: 'sensors', label: 'Sensors', icon: '📡', match: ['sensors'] },
  { id: 'settings', label: 'Settings', icon: '⚙', match: ['settings'] },
]
const allViews = [...mainMenu, ...moreMenu, ...setupMenu].flatMap((item) => item.match)

/** Tabs inside a main place, plus one line on where its data comes from and where it leads. */
const sections: { views: View[]; tabs: { id: View; label: string }[]; flow: Record<string, string> }[] = [
  { views: ['dashboard', 'load', 'data'], tabs: [{ id: 'dashboard', label: 'Emissions' }, { id: 'load', label: 'Electricity load' }, { id: 'data', label: 'Upload bills' }],
    flow: { dashboard: 'Uses your monthly bills · leads to Savings and Reports', load: 'Uses half-hourly meter data · leads to Savings', data: 'Feeds Energy & carbon, Savings, Risks and Reports' } },
  { views: ['findings', 'plan'], tabs: [{ id: 'findings', label: 'Ways to save' }, { id: 'plan', label: 'Plan' }],
    flow: { findings: 'Found in your energy data · add the fixes to your Plan', plan: 'Upgrades you’ve chosen · savings checked on Energy & carbon' } },
]

const readView = (): View => {
  const hash = window.location.hash.replace('#', '') as View
  return allViews.includes(hash) ? hash : 'home'
}

export default function App() {
  const state = useFactory()
  const sensor = useSensor()
  const [view, setView] = useState<View>(readView)
  const company = useCompany()
  const workspace = useWorkspace()
  const role = useRole()
  const [touring, setTouring] = useState(false)
  const onboarding = !state.onboarded
  const [previousSite, setPreviousSite] = useState<string | null>(null)
  const session = useSession()
  const companies = visibleCompanies(workspace, session)
  const companyAccount = isCompanyAccount(session)

  // A company account only ever opens its own company.
  useEffect(() => {
    if (session && !companies.some((item) => item.id === company.id) && companies[0]) companyActions.switchCompany(companies[0].id)
  }, [session, companies, company.id])

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
    go(simulatedIndustries.has(getState().settings.industryId) ? 'control' : 'twin')
  }
  const cancelSetup = () => {
    const id = company.activeId
    if (!company.fixed && company.sites.every((site) => !site.state.onboarded)) { companyActions.removeCompany(company.id); go('company'); return }
    const fallback = previousSite && previousSite !== id ? previousSite : company.sites.find((site) => site.id !== id)?.id
    if (fallback) { companyActions.switchSite(fallback); companyActions.removeSite(id) }
    go('company')
  }
  if (!session) return <Login onSignedIn={(name) => {
    const match = name ? getWorkspace().companies.find((item) => item.name === name) : null
    if (match) companyActions.switchCompany(match.id)
    go('home')
  }} />
  if (onboarding) return <Onboarding key={company.activeId} progress={company.sites.length > 1 ? `Site ${company.sites.findIndex((site) => site.id === company.activeId) + 1} of ${company.sites.length} · ${company.name}` : undefined} onDone={finishSetup} onCancel={company.sites.length > 1 || !company.fixed ? cancelSetup : undefined} />

  const siteScoped = view === 'home' || view === 'dashboard' || view === 'load' || view === 'findings' || view === 'risks' || view === 'data' || view === 'twin' || view === 'plan' || view === 'reports' || view === 'settings' || view === 'sensors'
  const addedCount = workspace.companies.filter((item) => !item.fixed).length
  const canTour = companies.some((item) => item.fixed && item.sites.some((site) => site.state.settings.industryId === 'steel'))

  return <div className="app shell">
    <aside className="sidebar" aria-label="Main menu">
      <div className="brand"><BrandLogo size={32} className="brand-mark-logo" /><span className="brand-word">ChitoCapture</span></div>
      <p className="brand-tag">Find the money your plant wastes. Cut carbon on the way.</p>
      <nav className="side-nav" aria-label="Main">
        {mainMenu.map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
        <details className="side-more" open={moreMenu.some((item) => item.match.includes(view))}>
          <summary><span className="side-icon" aria-hidden="true">⋯</span><span className="tab-label">Plant twin & more</span></summary>
          {moreMenu.map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
        </details>
      </nav>
      <nav className="side-nav side-setup" aria-label="Setup">
        {setupMenu.map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
      </nav>
      <button type="button" className="account-btn side-account" onClick={() => { if (confirm(`Sign out of ${session.accountId}?`)) { setTouring(false); signOut() } }} title={`Signed in as ${session.accountId}. Click to sign out.`}>
        <span className="account-id">{session.accountId}</span><span aria-hidden="true">⎋</span><span className="sr-only">Sign out</span>
      </button>
    </aside>
    <div className="main-col">
    <header className="topbar">
      <label className="site-switch" title="Switch company">
        <span className="sr-only">Company</span>
        <select value={company.id} onChange={(event) => {
          const value = event.target.value
          if (value === '__add') { go('add-company'); return }
          companyActions.switchCompany(value)
          if (view === 'control' && !simulatedIndustries.has(getState().settings.industryId)) go('simulate')
          if (view === 'add-company') go('company')
        }}>
          {companies.map((item) => <option key={item.id} value={item.id}>🏢 {item.name}</option>)}
          {!companyAccount && <option value="__add" disabled={addedCount >= MAX_ADDED_COMPANIES}>{addedCount >= MAX_ADDED_COMPANIES ? `Company limit reached (${MAX_ADDED_COMPANIES})` : '+ Add company…'}</option>}
        </select>
      </label>
      <span className="topbar-spacer" />
      {canTour && <button type="button" className="tour-btn" onClick={() => setTouring(true)} title="A 2-minute guided tour">▶ Tour</button>}
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
      {(() => {
        const section = sections.find((item) => item.views.includes(view))
        return section && <div className="section-head">
          <div className="section-tabs" role="tablist">{section.tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} className={view === tab.id ? 'active' : ''} onClick={() => go(tab.id)}>{tab.label}</button>)}</div>
          <span className="flow-line">↳ {section.flow[view]}</span>
        </div>
      })()}
      {view === 'home' && <Home go={go} />}
      {view === 'dashboard' && <Dashboard onUpload={() => go('data')} onReport={() => go('reports')} onFindings={() => go('findings')} />}
      {view === 'data' && <DataUpload onDone={() => go('dashboard')} />}
      {view === 'load' && <LoadProfile onFindings={() => go('findings')} />}
      {view === 'findings' && <Findings onOpen={(next) => go(next)} />}
      {view === 'risks' && <Risks onOpen={(next) => go(next)} />}
      {view === 'reports' && <Reports />}
      {view === 'sources' && <Sources />}
      {view === 'add-company' && !companyAccount && <AddCompany onCreated={() => undefined} onCancel={() => go('company')} />}
      {view === 'company' && <Company onOpen={go} onAddSite={() => setPreviousSite(company.activeId)} />}
      {view === 'twin' && <Twin onShowPlan={() => go('plan')} />}
      {view === 'simulate' && <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} onAddCompany={() => go('add-company')} />}
      {view === 'control' && (state.settings.industryId === 'steel' ? <ControlRoom onChooseSite={() => go('simulate')} /> : state.settings.industryId === 'steel-downstream' ? <GalvControlRoom onChooseSite={() => go('simulate')} /> : <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} onAddCompany={() => go('add-company')} />)}
      {view === 'analysis' && <Analysis />}
      {view === 'plan' && <Plan onShowTwin={() => go('twin')} />}
      {view === 'sensors' && <Sensors />}
      {view === 'settings' && <Settings onRestart={() => undefined} onRemoved={() => go('company')} />}
    </main>
    {touring && <Tour onClose={() => setTouring(false)} />}
    {!touring && <ChatAssistant />}
    <footer className="foot">Prototype · factors are sourced · <a href="#sources">Data & sources</a> · your data stays in this browser</footer>
    </div>
  </div>
}

function MenuButton({ item, view, go }: { item: MenuItem; view: View; go: (next: View) => void }) {
  const current = item.match.includes(view)
  return <div className="side-item">
    <button type="button" className={current ? 'active' : ''} aria-current={current ? 'page' : undefined} onClick={() => go(item.id)} title={item.label}>
      <span className="side-icon" aria-hidden="true">{item.icon}</span><span className="tab-label">{item.label}</span>
    </button>
  </div>
}
