import { useCallback, useEffect, useRef, useState } from 'react'
import { autoPlan } from '../model/copilot'
import { actions, companyActions, getCompany, getState, getWorkspace } from '../model/store'
import { sendSim, type SimCommand } from '../model/simEvents'

type Step = {
  view: string
  /** Element to spotlight. */
  target: string
  title: string
  text: string
  /** Optional clicks to set the scene, e.g. opening a deep dive. */
  clicks?: string[]
  /** Drive the steel simulation: open a zoomed-in view, select a unit. */
  sim?: SimCommand
  before?: () => void
  /** Which site of the demo company the step needs open. */
  site?: 'steel' | 'steel-downstream'
}

const steps: Step[] = [
  { view: 'company', target: '.site-grid', title: '1 · One company, every site', text: 'ChitoCapture tracks carbon for a whole company. Malaysia Steel Demo has a steel mill, a wire & galvanising plant and a head office; their emissions add up to the company total.' },
  { view: 'analysis', target: '.map-card', site: 'steel', title: '2 · Where the carbon comes from', text: 'Every piece of equipment as a block: taller and redder means more CO₂. The arc furnace dominates. Switch to “Whole company” to compare sites.' },
  { view: 'twin', target: '.floor-card', site: 'steel', title: '3 · The plant in 3D', text: 'The same machines as a 3D site. Hover any building to see what it does, its energy against target and the best way to cut it.' },
  { view: 'simulate', target: '.logo-row', title: '4 · Choose what to simulate', text: 'Sites with a live process model can be simulated: the steel mill and the wire & galvanising plant.' },
  { view: 'control', target: '.tickers', site: 'steel', title: '5 · The mill, running live', text: 'Power, CO₂ per hour, CO₂ per tonne of steel and carbon cost update every second as the arc furnace goes through each heat. The simulation runs on this site’s own machine data.', sim: { dive: null, select: null, heatmap: false } },
  { view: 'control', target: '.hall-card', site: 'steel', title: '6 · Inside the arc furnace', text: 'Double-click the arc furnace to zoom into the process: scrap melts under the arc, steel is tapped into the ladle. Purple tags are virtual sensors, where real meters plug in.', sim: { dive: 'eaf', select: 'eaf' } },
  { view: 'control', target: '.hall-card', site: 'steel', title: '7 · Inside the ChitoCapture unit', text: 'The green columns beside the reheating furnace. Our chitosan sorbent captures CO₂ from its exhaust: one column captures while the other is regenerated with waste heat; the curve shows breakthrough.', sim: { dive: 'capture', select: 'capture' } },
  { view: 'control', target: '.ledger', site: 'steel', title: '8 · The carbon ledger', text: 'Every kilogram of CO₂ per tonne of steel, traced to a process step as activity × emission factor, with targets. This is what auditors and CBAM ask for.', sim: { dive: null, select: null } },
  { view: 'control', target: '.cbam', site: 'steel', title: '9 · CBAM exposure', text: 'What the EU carbon border charge could cost per tonne exported, today and with upgrades, after deducting carbon price paid in Malaysia.' },
  { view: 'control', target: '.hall-card', site: 'steel-downstream', title: '10 · A second plant: wire & galvanising', text: 'The group’s wire plant draws rod into wire and zinc-coats it on four lines of 40 wires. Badges over each unit show live CO₂ and whether it is on target.', sim: { dive: null, select: null, heatmap: false } },
  { view: 'control', target: '.hall-card', site: 'steel-downstream', title: '11 · CO₂ heat map', text: 'Like a thermal camera for carbon: the floor glows red under the biggest live sources, so anyone can see where to act first.', sim: { heatmap: true } },
  { view: 'control', target: '.hall-card', site: 'steel-downstream', title: '12 · Inside the zinc kettle', text: 'Forty wires dive into molten zinc at 450 °C. The coating gauge shows zinc given away above specification, and only about 15% of the kettle’s gas actually heats the wire.', sim: { dive: 'kettle', select: 'kettle', heatmap: false } },
  { view: 'plan', target: '.board-card', site: 'steel', title: '13 · From plan to verified tonnes', text: 'Engineers propose and deliver actions, sustainability approves and verifies measured savings, management approves investment. Switch “View as” to play each team.',
    before: () => { const state = getState(); if (state.plan.length === 0) actions.setPlan(autoPlan(state)) } },
  { view: 'reports', target: '.report-paper', site: 'steel', title: '14 · One-click reports', text: 'Site carbon, EECA energy and CBAM reports, with every default factor cited, ready to save as PDF. The CBAM report shows why verified data matter: EU default values can cost many times more.' },
  { view: 'company', target: '.chat-fab', title: '15 · Ask the assistant', text: 'Ask in plain words: “Which process should we cut first?”, “Save RM 2 million a year”, “What if we shut the ladle furnace?”. Answers use the site’s own numbers, with one click to add an action to the plan.' },
]

async function waitFor(selector: string, timeout = 5_000) {
  const start = performance.now()
  while (performance.now() - start < timeout) {
    const element = document.querySelector<HTMLElement>(selector)
    if (element && element.getBoundingClientRect().height > 0) return element
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  return null
}

export default function Tour({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const targetRef = useRef<HTMLElement | null>(null)
  const step = steps[index]

  const show = useCallback(async (next: number) => {
    const current = steps[next]
    setRect(null)
    if (current.site) {
      const site = getWorkspace().companies.find((company) => company.id === getWorkspace().activeCompanyId)?.sites.find((item) => item.state.settings.industryId === current.site)
      if (site && site.id !== getCompany().activeId) { companyActions.switchSite(site.id); await new Promise((resolve) => setTimeout(resolve, 400)) }
    }
    current.before?.()
    if (window.location.hash !== `#${current.view}`) window.location.hash = current.view
    if (current.sim) {
      await waitFor('.hall-card')
      await new Promise((resolve) => setTimeout(resolve, 100))
      sendSim(current.sim)
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    for (const click of current.clicks ?? []) {
      const button = await waitFor(click, click === '.deepdive-back' ? 400 : 5_000)
      button?.click()
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    const target = await waitFor(current.target)
    targetRef.current = target
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setTimeout(() => setRect(target.getBoundingClientRect()), 450)
    }
  }, [])

  // Start on the steel mill so every step has something to show.
  useEffect(() => {
    const steelCompany = getWorkspace().companies.find((company) => company.fixed && company.sites.some((site) => site.state.settings.industryId === 'steel'))
    const steelSite = steelCompany?.sites.find((site) => site.state.settings.industryId === 'steel')
    if (steelSite) companyActions.switchSite(steelSite.id)
    void show(0)
  }, [show])

  // Keep the spotlight on its target while the page scrolls or resizes.
  useEffect(() => {
    const update = () => { if (targetRef.current) setRect(targetRef.current.getBoundingClientRect()) }
    const timer = window.setInterval(update, 300)
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => { window.clearInterval(timer); window.removeEventListener('scroll', update); window.removeEventListener('resize', update) }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && index < steps.length - 1) go(index + 1)
      if (event.key === 'ArrowLeft' && index > 0) go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const go = (next: number) => { setIndex(next); void show(next) }
  const pad = 10
  const last = index === steps.length - 1

  return <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    {rect
      ? <div className="tour-spot" style={{ left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      : <div className="tour-dim" />}
    <div className="tour-card">
      <div className="tour-progress">{steps.map((_, k) => <i key={k} className={k <= index ? 'on' : ''} />)}</div>
      <h2 id="tour-title">{step.title}</h2>
      <p>{step.text}</p>
      <div className="tour-actions">
        <button type="button" className="link" onClick={onClose}>Exit tour</button>
        <div className="row-actions">
          {index > 0 && <button type="button" className="btn ghost small" onClick={() => go(index - 1)}>← Back</button>}
          {last
            ? <button type="button" className="btn small" onClick={() => { window.location.hash = 'company'; onClose() }}>Finish ✓</button>
            : <button type="button" className="btn small" onClick={() => go(index + 1)}>Next →</button>}
        </div>
      </div>
    </div>
  </div>
}
