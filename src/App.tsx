import { useEffect, useState } from 'react'
import { companyActions, useCompany, useFactory, useWorkspace } from './model/store'
import { templateById } from './model/templates'
import Company from './views/Company'
import SimulationPicker from './views/SimulationPicker'
import { useSensor } from './sensor/hub'
import Analysis from './views/Analysis'
import ControlRoom from './views/ControlRoom'
import Onboarding from './views/Onboarding'
import Plan from './views/Plan'
import Sensors from './views/Sensors'
import Settings from './views/Settings'
import Twin from './views/Twin'

type View = 'company' | 'twin' | 'simulate' | 'control' | 'analysis' | 'plan' | 'sensors' | 'settings'
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
  return views.some((view) => view.id === hash) || hash === 'control' ? hash as View : 'company'
}

export default function App() {
  const state = useFactory()
  const sensor = useSensor()
  const [view, setView] = useState<View>(readView)
  const company = useCompany()
  const workspace = useWorkspace()
  const onboarding = !state.onboarded
  const [previousSite, setPreviousSite] = useState<string | null>(null)

  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (next: View) => { window.location.hash = next; setView(next) }

  if (onboarding) return <Onboarding
    onDone={() => go(state.settings.industryId === 'steel' ? 'control' : 'twin')}
    onCancel={company.sites.length > 1 ? () => { const id = company.activeId; companyActions.switchSite(previousSite && previousSite !== id ? previousSite : company.sites.find((site) => site.id !== id)!.id); companyActions.removeSite(id); go('company') } : undefined} />

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◭</span> ChitoCapture
        <label className="site-switch" title="Switch site">
          <span className="sr-only">Site</span>
          <select value={view === 'company' ? `__company:${company.id}` : company.activeId} onChange={(event) => {
            const value = event.target.value
            if (value.startsWith('__company:')) { companyActions.switchCompany(value.slice('__company:'.length)); go('company') }
            else if (value === '__add') { go('company'); window.setTimeout(() => document.querySelector<HTMLButtonElement>('.site-card.add')?.click(), 0) }
            else {
              setPreviousSite(company.activeId)
              companyActions.switchSite(value)
              const industry = workspace.companies.flatMap((item) => item.sites).find((site) => site.id === value)?.state.settings.industryId
              if (view === 'company' || (view === 'control' && industry !== 'steel')) go(industry === 'steel' ? 'control' : 'twin')
            }
          }}>
            {workspace.companies.map((item) => <optgroup key={item.id} label={item.name}>
              <option value={`__company:${item.id}`}>🏢 Company overview</option>
              {item.sites.map((site) => <option key={site.id} value={site.id}>{templateById(site.state.settings.industryId)?.icon ?? '🏭'} {site.state.settings.factoryName}</option>)}
            </optgroup>)}
            <option value="__add">+ Add site to {company.name}…</option>
          </select>
        </label>
      </div>
      <nav className="tabs" aria-label="Main">
        {views.map((item) => { const current = view === item.id || (item.id === 'simulate' && view === 'control'); return <button key={item.id} type="button" className={current ? 'active' : ''} aria-current={current ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button> })}
      </nav>
      <button type="button" className={`live-pill ${sensor.status}`} onClick={() => go('sensors')} title="Sensor status">
        <i />{sensor.status === 'live' ? 'Live' : sensor.status === 'simulated' ? 'Simulated' : sensor.status === 'error' ? 'Sensor error' : 'No sensor'}
      </button>
    </header>
    <main className="content">
      {view === 'company' && <Company onOpen={go} onAddSite={() => setPreviousSite(company.activeId)} />}
      {view === 'twin' && <Twin onShowPlan={() => go('plan')} />}
      {view === 'simulate' && <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} />}
      {view === 'control' && (state.settings.industryId === 'steel' ? <ControlRoom onChooseSite={() => go('simulate')} /> : <SimulationPicker onStart={() => go('control')} onView3D={() => go('twin')} />)}
      {view === 'analysis' && <Analysis />}
      {view === 'plan' && <Plan onShowTwin={() => go('twin')} />}
      {view === 'sensors' && <Sensors />}
      {view === 'settings' && <Settings onRestart={() => undefined} onRemoved={() => go('company')} />}
    </main>
    <footer className="foot">Prototype · sample data and factors are illustrative and must be verified before reporting · data stays in this browser</footer>
  </div>
}
