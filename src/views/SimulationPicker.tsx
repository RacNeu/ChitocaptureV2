import { tonnes } from '../format'
import { summarise } from '../model/calc'
import { companyActions, useCompany, useWorkspace } from '../model/store'
import { templateById } from '../model/templates'

/** Industries that have a live process simulation. Others open in Site 3D. */
export const simulatedIndustries = new Set(['steel'])

type Props = { onStart: () => void; onView3D: () => void }

export default function SimulationPicker({ onStart, onView3D }: Props) {
  const workspace = useWorkspace()
  const active = useCompany()
  // The active company first, then the other demo customers.
  const companies = [active, ...workspace.companies.filter((item) => item.id !== active.id)]

  return <div className="picker">
    <header className="picker-head">
      <span className="eyebrow">Simulation</span>
      <h1>Choose a site to simulate</h1>
      <p className="muted">A live simulation runs the site’s process minute by minute: the 3D plant moves, power and CO₂ tick in real time, you can zoom inside the equipment, read the virtual sensors and test upgrades. Sites without a process model yet open in Site 3D instead.</p>
    </header>

    {companies.map((company) => <section key={company.id} className="picker-group">
      <h2>{company.name}{company.id === active.id ? '' : <small> · other demo customer</small>}</h2>
      <div className="picker-grid">
        {company.sites.map((site) => {
          const template = templateById(site.state.settings.industryId)
          const canSimulate = simulatedIndustries.has(site.state.settings.industryId)
          const total = summarise(site.state).baselineT
          return <article key={site.id} className={`picker-card${canSimulate ? ' live' : ''}`}>
            <div className="picker-top">
              <span className="site-icon">{template?.icon ?? '🏭'}</span>
              <div><h3>{site.state.settings.factoryName}</h3><small>{template?.label ?? 'Custom site'} · {tonnes(total)} CO₂e/yr</small></div>
              <span className={`sim-chip${canSimulate ? ' on' : ''}`}>{canSimulate ? '● Live simulation' : '3D view only'}</span>
            </div>
            {canSimulate
              ? <ul className="picker-features"><li>Arc furnace heat cycle, live MW and t CO₂/h</li><li>Zoom inside the furnace with virtual sensors</li><li>What-if upgrades, ChitoCapture pilot and CBAM</li></ul>
              : <p className="muted small">No process simulation for this type of site yet. You can still explore its machines, emissions and reduction options in Site 3D.</p>}
            {canSimulate
              ? <button type="button" className="btn" onClick={() => { companyActions.switchSite(site.id); onStart() }}>▶ Start simulation</button>
              : <button type="button" className="btn ghost" onClick={() => { companyActions.switchSite(site.id); onView3D() }}>◭ Open in Site 3D</button>}
          </article>
        })}
      </div>
    </section>)}
  </div>
}
