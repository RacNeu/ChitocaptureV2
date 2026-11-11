import { useCallback, useEffect, useRef, useState } from 'react'
import { autoPlan } from '../model/copilot'
import { actions, companyActions, getState, getWorkspace } from '../model/store'

type Step = {
  view: string
  /** Element to spotlight. */
  target: string
  title: string
  text: string
  /** Optional clicks to set the scene, e.g. opening a deep dive. */
  clicks?: string[]
  before?: () => void
}

const steps: Step[] = [
  { view: 'company', target: '.site-grid', title: '1 · One company, every site', text: 'ChitoCapture tracks carbon for a whole company. Malaysia Steel Demo has a steel mill, a wire & galvanising plant and a head office; their emissions add up to the company total.' },
  { view: 'analysis', target: '.map-card', title: '2 · Where the carbon comes from', text: 'Every piece of equipment as a block: taller and redder means more CO₂. The arc furnace dominates. Switch to “Whole company” to compare sites.' },
  { view: 'twin', target: '.floor-card', title: '3 · The plant in 3D', text: 'The same machines as a 3D site. Hover any building to see what it does, its energy against target and the best way to cut it.' },
  { view: 'simulate', target: '.logo-row', title: '4 · Choose what to simulate', text: 'Sites with a live process model can be simulated. The steel mill is the flagship.' },
  { view: 'control', target: '.tickers', title: '5 · The mill, running live', text: 'Power, CO₂ per hour, CO₂ per tonne of steel and carbon cost update every second as the arc furnace goes through each heat.', clicks: ['.deepdive-back'] },
  { view: 'control', target: '.hall-card', title: '6 · Inside the arc furnace', text: 'Zoom into the process: scrap melts under the arc, steel is tapped into the ladle. Purple tags are virtual sensors, where real meters plug in.', clicks: ['.dive-eaf'] },
  { view: 'control', target: '.hall-card', title: '7 · Inside the ChitoCapture unit', text: 'Our chitosan sorbent captures CO₂ from the reheat-furnace exhaust. One column captures while the other is regenerated with waste heat; the curve shows breakthrough.', clicks: ['.deepdive-back', '.dive-capture'] },
  { view: 'control', target: '.ledger', title: '8 · The carbon ledger', text: 'Every kilogram of CO₂ per tonne of steel, traced to a process step as activity × emission factor, with targets. This is what auditors and CBAM ask for.', clicks: ['.deepdive-back'] },
  { view: 'control', target: '.cbam', title: '9 · CBAM exposure', text: 'What the EU carbon border charge could cost per tonne exported, today and with upgrades, after deducting carbon price paid in Malaysia.' },
  { view: 'plan', target: '.board-card', title: '10 · From plan to verified tonnes', text: 'Engineers propose and deliver actions, sustainability approves and verifies measured savings, management approves investment. Switch “View as” to play each team.',
    before: () => { const state = getState(); if (state.plan.length === 0) actions.setPlan(autoPlan(state)) } },
  { view: 'reports', target: '.report-paper', title: '11 · One-click reports', text: 'Site carbon, EECA energy and CBAM reports, with every default factor cited, ready to save as PDF. The CBAM report shows why verified data matter: EU default values can cost many times more.' },
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
    current.before?.()
    if (window.location.hash !== `#${current.view}`) window.location.hash = current.view
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
