type HeaderProps = {
  timestamp?: string
  page?: 'monitoring' | 'sources' | 'scenario-analysis' | 'executive' | 'carbon-dashboard' | 'carbon-flow' | 'reports' | 'carbon-calculator' | 'hotspots' | 'action-hub'
  title?: string
  subtitle?: string
}

function Header({ timestamp, page = 'monitoring', title, subtitle }: HeaderProps) {
  const appBase = import.meta.env.BASE_URL
  return (
    <header className="app-header">
      <aside className="app-sidebar" aria-label="Main navigation">
        <a className="brand" href={appBase} aria-label="ChitoCapture home">
          <span className="brand-leaf" aria-hidden="true">🍃</span>
          <span className="brand-word">ChitoCapture</span>
        </a>
        <nav className="sidebar-nav">
          <div className="sidebar-group"><span className="sidebar-group-label">Organisation Carbon</span>
            <a href={appBase} className={page === 'carbon-dashboard' ? 'active' : ''} aria-current={page === 'carbon-dashboard' ? 'page' : undefined}><span aria-hidden="true">▦</span>Carbon Dashboard</a>
            <a href={`${appBase}?page=carbon-calculator`} className={page === 'carbon-calculator' ? 'active' : ''} aria-current={page === 'carbon-calculator' ? 'page' : undefined}><span aria-hidden="true">⊕</span>Carbon Footprint Calculator</a>
            <a href={`${appBase}?page=emission-hotspots`} className={page === 'hotspots' ? 'active' : ''} aria-current={page === 'hotspots' ? 'page' : undefined}><span aria-hidden="true">⌁</span>Emission Hotspots</a>
          </div>
          <div className="sidebar-group"><span className="sidebar-group-label">Reduce &amp; Verify</span>
            <a href={`${appBase}?page=action-hub`} className={page === 'action-hub' ? 'active' : ''} aria-current={page === 'action-hub' ? 'page' : undefined}><span aria-hidden="true">✓</span>Action Hub</a>
          </div>
          <div className="sidebar-group"><span className="sidebar-group-label">Capture Technology</span>
            <a href={`${appBase}?page=scenario-analysis`} className={page === 'scenario-analysis' ? 'active' : ''} aria-current={page === 'scenario-analysis' ? 'page' : undefined}><span aria-hidden="true">⌁</span>Scenario Analysis</a>
            <a href={`${appBase}?page=process-monitoring`} className={page === 'monitoring' ? 'active' : ''} aria-current={page === 'monitoring' ? 'page' : undefined}><span aria-hidden="true">▥</span>Process Monitoring</a>
            <a href={`${appBase}?page=carbon-flow`} className={page === 'carbon-flow' ? 'active' : ''} aria-current={page === 'carbon-flow' ? 'page' : undefined}><span aria-hidden="true">⇄</span>Carbon Flow</a>
            <a href={`${appBase}?page=executive-dashboard`} className={page === 'executive' ? 'active' : ''} aria-current={page === 'executive' ? 'page' : undefined}><span aria-hidden="true">▣</span>Capture Summary</a>
          </div>
          <div className="sidebar-group"><span className="sidebar-group-label">Data &amp; Reporting</span>
            <a href={`${appBase}?page=data-sources`} className={page === 'sources' ? 'active' : ''} aria-current={page === 'sources' ? 'page' : undefined}><span aria-hidden="true">▤</span>Data &amp; Sources</a>
            <a href={`${appBase}?page=reports`} className={page === 'reports' ? 'active' : ''} aria-current={page === 'reports' ? 'page' : undefined}><span aria-hidden="true">▧</span>Reports</a>
          </div>
        </nav>
        <div className="sidebar-foot"><i /> Simulation Prototype · Demo data</div>
      </aside>
      <div className="page-heading">
        <h1>{title ?? 'Process Monitoring'}</h1>
        <p>{subtitle ?? 'Live system diagram with real-time process data'}</p>
      </div>
      {timestamp && <div className="header-meta">
        <span className="live-badge"><i />LIVE SIMULATION</span>
        <span className="sim-time"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>{timestamp}</span>
      </div>}
    </header>
  )
}

export default Header
