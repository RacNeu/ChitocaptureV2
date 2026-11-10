import { useEffect, useState } from 'react'
import { useFactory } from './model/store'
import { useSensor } from './sensor/hub'
import Analysis from './views/Analysis'
import ControlRoom from './views/ControlRoom'
import Onboarding from './views/Onboarding'
import Plan from './views/Plan'
import Sensors from './views/Sensors'
import Settings from './views/Settings'
import Twin from './views/Twin'

type View = 'twin' | 'control' | 'analysis' | 'plan' | 'sensors' | 'settings'
const views: { id: View; label: string; icon: string }[] = [
  { id: 'twin', label: 'Twin', icon: '◭' },
  { id: 'control', label: 'Control room', icon: '🔥' },
  { id: 'analysis', label: 'Analysis', icon: '📊' },
  { id: 'plan', label: 'Plan', icon: '🗺' },
  { id: 'sensors', label: 'Sensors', icon: '📡' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

const readView = (): View => {
  const hash = window.location.hash.replace('#', '')
  return views.some((view) => view.id === hash) ? hash as View : 'twin'
}

export default function App() {
  const state = useFactory()
  const sensor = useSensor()
  const [view, setView] = useState<View>(readView)
  const [onboarding, setOnboarding] = useState(!state.onboarded)

  useEffect(() => {
    const onHash = () => setView(readView())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const go = (next: View) => { window.location.hash = next; setView(next) }

  if (onboarding) return <Onboarding onDone={() => { setOnboarding(false); go('twin') }} />

  return <div className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">◭</span> ChitoCapture <small>{state.settings.factoryName}</small></div>
      <nav className="tabs" aria-label="Main">
        {views.map((item) => <button key={item.id} type="button" className={view === item.id ? 'active' : ''} aria-current={view === item.id ? 'page' : undefined} onClick={() => go(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}
      </nav>
      <button type="button" className={`live-pill ${sensor.status}`} onClick={() => go('sensors')} title="Sensor status">
        <i />{sensor.status === 'live' ? 'Live' : sensor.status === 'simulated' ? 'Simulated' : sensor.status === 'error' ? 'Sensor error' : 'No sensor'}
      </button>
    </header>
    <main className="content">
      {view === 'twin' && <Twin onShowPlan={() => go('plan')} />}
      {view === 'control' && <ControlRoom />}
      {view === 'analysis' && <Analysis />}
      {view === 'plan' && <Plan onShowTwin={() => go('twin')} />}
      {view === 'sensors' && <Sensors />}
      {view === 'settings' && <Settings onRestart={() => setOnboarding(true)} />}
    </main>
    <footer className="foot">Prototype · sample data and factors are illustrative and must be verified before reporting · data stays in this browser</footer>
  </div>
}
