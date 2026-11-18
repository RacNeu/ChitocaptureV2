import { useEffect, useState, type ReactNode } from 'react'
import LineIcon from './components/LineIcon'
import { actions, companyActions, getCompany, getState, useCompany, useFactory, useRole, useWorkspace } from './model/store'
import { roles } from './model/roles'
import Company from './views/Company'
import AddCompany from './views/AddCompany'
import Tour from './components/Tour'
import Reports from './views/Reports'
import Sources from './views/Sources'
import { useSensor } from './sensor/hub'
import Analysis from './views/Analysis'
import GalvControlRoom from './views/GalvControlRoom'
import Onboarding from './views/Onboarding'
import Plan from './views/Plan'
import LiveFeeds from './views/LiveFeeds'
import Settings from './views/Settings'
import Login from './views/Login'
import Dashboard from './views/Dashboard'
import DataUpload from './views/DataUpload'
import LoadProfile from './views/LoadProfile'
import Findings from './views/Findings'
import Risks from './views/Risks'
import Home from './views/Home'
import Site3D from './views/Site3D'
import MeltShop from './views/MeltShop'
import SteelSimulation from './views/SteelSimulation'
import SourceBadge from './components/SourceBadge'
import ChatAssistant from './components/ChatAssistant'
import Polish from './components/Polish'
import BrandLogo from './components/BrandLogo'
import { isCompanyAccount, signOut, useSession, visibleCompanies } from './model/auth'
import { getWorkspace } from './model/store'

type View = 'home' | 'dashboard' | 'load' | 'findings' | 'risks' | 'meltshop' | 'data' | 'company' | 'add-company' | 'reports' | 'sources' | 'twin' | 'simulate' | 'analysis' | 'plan' | 'sensors' | 'settings'
export type { View }

type MenuItem = { id: View; label: string; icon: ReactNode; match: View[] }
/** The company comes first; the open site's pages follow, in the order of the story. */
const companyMenu: MenuItem[] = [
  { id: 'company', label: 'Company overview', icon: '🏢', match: ['company', 'add-company'] },
  { id: 'twin', label: 'Site 3D', icon: '◭', match: ['twin'] },
  { id: 'simulate', label: '3D simulation', icon: '🎛', match: ['simulate'] },
]
const siteMenu: MenuItem[] = [
  { id: 'home', label: 'Site overview', icon: <LineIcon name="home" />, match: ['home'] },
  { id: 'dashboard', label: 'Energy & carbon', icon: <LineIcon name="bolt" />, match: ['dashboard', 'load', 'analysis', 'data'] },
  { id: 'meltshop', label: 'Melt shop', icon: <LineIcon name="furnace" />, match: ['meltshop'] },
  { id: 'findings', label: 'Savings and Plans', icon: <LineIcon name="plan" />, match: ['findings', 'plan'] },
  { id: 'risks', label: 'Risks', icon: <LineIcon name="risk" />, match: ['risks'] },
]
const reportMenu: MenuItem[] = [
  { id: 'reports', label: 'Reports', icon: '📄', match: ['reports', 'sources'] },
]
const setupMenu: MenuItem[] = [
  { id: 'settings', label: 'Settings', icon: '⚙', match: ['settings', 'sensors'] },
]
/** Pages that show one site; switching site keeps you on the same page. */
const sitePages: View[] = ['home', 'dashboard', 'load', 'data', 'findings', 'plan', 'risks', 'meltshop', 'reports', 'twin', 'simulate', 'analysis', 'settings', 'sensors']
const allViews = [...companyMenu, ...siteMenu, ...reportMenu, ...setupMenu].flatMap((item) => item.match)

/** Tabs inside a main place, plus one line on where its data comes from and where it leads. */
const sections: { views: View[]; tabs: { id: View; label: string }[]; flow: Record<string, string> }[] = [
  { views: ['dashboard', 'load', 'analysis', 'data'], tabs: [{ id: 'dashboard', label: 'Emissions' }, { id: 'load', label: 'Electricity load' }, { id: 'analysis', label: 'By machine' }, { id: 'data', label: 'Upload bills' }],
    flow: { dashboard: 'Uses your monthly bills · leads to Savings and Plans, and Reports', load: 'Uses half-hourly meter data · leads to Savings', analysis: 'Each machine’s share, matched to your bills', data: 'Feeds Energy & carbon, Savings, Risks and Reports' } },
  { views: ['settings', 'sensors'], tabs: [{ id: 'settings', label: 'Site settings' }, { id: 'sensors', label: 'Data feeds' }],
    flow: { settings: 'Prices, grid factor and targets used everywhere', sensors: 'Live readings, alerts and Telegram · feeds the Melt shop HMI' } },
  { views: ['findings', 'plan'], tabs: [{ id: 'findings', label: 'Ways to save' }, { id: 'plan', label: 'Plan' }],
    flow: { findings: 'Found in your energy data · add the fixes to your Plan', plan: 'Upgrades you’ve chosen · savings checked on Energy & carbon' } },
]

const readView = (): View => {
  const hash = window.location.hash.replace('#', '') as View
  return allViews.includes(hash) ? hash : 'company'
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
    go(['steel', 'steel-downstream'].includes(getState().settings.industryId) ? 'simulate' : 'twin')
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
    go('company')
  }} />
  if (onboarding) return <Onboarding key={company.activeId} progress={company.sites.length > 1 ? `Site ${company.sites.findIndex((site) => site.id === company.activeId) + 1} of ${company.sites.length} · ${company.name}` : undefined} onDone={finishSetup} onCancel={company.sites.length > 1 || !company.fixed ? cancelSetup : undefined} />

  /** The site's live process page: the melt shop for a steel mill, the galvanising line for the wire plant. */
  const hasMeltShop = state.settings.industryId === 'steel'
  const canTour = companies.some((item) => item.fixed && item.sites.some((site) => site.state.settings.industryId === 'steel'))

  return <div className="app shell">
    <aside className="sidebar" aria-label="Main menu">
      <div className="brand"><BrandLogo size={32} className="brand-mark-logo" /><span className="brand-word">ChitoCapture</span></div>
      <p className="brand-tag">Find the money your plant wastes. Cut carbon on the way.</p>
      <nav className="side-nav" aria-label="Company">
        {companyMenu.map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
      </nav>
      <span className="side-label">This site</span>
      <nav className="side-nav side-site-nav" aria-label={`Pages for ${state.settings.factoryName}`}>
        {siteMenu.filter((item) => item.id !== 'meltshop' || hasMeltShop).map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
      </nav>
      <nav className="side-nav" aria-label="Reports">
        {reportMenu.map((item) => <MenuButton key={item.id} item={item} view={view} go={go} />)}
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
      <button type="button" className="topbar-company" onClick={() => go('company')} title="Company overview">
        <span aria-hidden="true">🏢</span><b>{company.name}</b>
      </button>
      <span className="topbar-sep" aria-hidden="true">›</span>
      <label className="site-pick" title="Choose a site">
        <span className="sr-only">Site</span>
        <select value={view === 'company' || view === 'add-company' ? '__all' : company.activeId} onChange={(event) => {
          const value = event.target.value
          if (value === '__all') { go('company'); return }
          companyActions.switchSite(value)
          if (!sitePages.includes(view)) go('home')
        }}>
          <option value="__all">All sites · company overview</option>
          {company.sites.map((site) => <option key={site.id} value={site.id}>{site.state.monthly?.length ? '● ' : '○ '}{site.state.settings.factoryName}{site.state.onboarded ? '' : ' (set up)'}</option>)}
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
    <main className={`content${view === 'twin' ? ' full' : view === 'meltshop' || view === 'simulate' ? ' wide' : ''}`}>
      {(() => {
        const section = sections.find((item) => item.views.includes(view))
        return section && <div className="section-head">
          <div className="section-tabs" role="tablist">{section.tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id} className={view === tab.id ? 'active' : ''} onClick={() => go(tab.id)}>{tab.label}</button>)}</div>
          <span className="flow-line">↳ {section.flow[view]}</span>
        </div>
      })()}
      {(['twin', 'simulate', 'plan'] as View[]).includes(view) && <SourceBadge onUpload={() => go('data')} />}
      {view === 'home' && <Home go={go} />}
      {view === 'dashboard' && <Dashboard onUpload={() => go('data')} onReport={() => go('reports')} onFindings={() => go('findings')} />}
      {view === 'data' && <DataUpload onDone={() => go('dashboard')} />}
      {view === 'load' && <LoadProfile onFindings={() => go('findings')} />}
      {view === 'findings' && <Findings onOpen={(next) => go(next)} />}
      {view === 'risks' && <Risks onOpen={(next) => go(next)} />}
      {view === 'meltshop' && <MeltShop />}
      {view === 'simulate' && (state.settings.industryId === 'steel-downstream' ? <GalvControlRoom onChooseSite={() => go('company')} /> : state.settings.industryId === 'steel' ? <SteelSimulation /> : <section className="card empty-state"><h2>No live simulation for this site</h2><p className="muted">3D simulations exist for the steel mill and the wire & galvanising plant. Pick one of them in the site menu above.</p></section>)}
      {view === 'reports' && <Reports />}
      {view === 'sources' && <Sources />}
      {view === 'add-company' && !companyAccount && <AddCompany onCreated={() => undefined} onCancel={() => go('company')} />}
      {view === 'company' && <Company go={go} onAddSite={() => setPreviousSite(company.activeId)} />}
      {view === 'twin' && <Site3D go={go} />}
      {view === 'analysis' && <Analysis />}
      {view === 'plan' && <Plan onShowTwin={() => go('twin')} />}
      {view === 'sensors' && <LiveFeeds />}
      {view === 'settings' && <Settings onRestart={() => undefined} onRemoved={() => go('company')} />}
    </main>
    {touring && <Tour onClose={() => setTouring(false)} />}
    {!touring && <ChatAssistant />}
    <Polish />
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
