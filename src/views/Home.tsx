import { useEffect, useMemo, useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import { defaultTaxInputs } from '../model/carbonTax'
import { siteFindings } from '../model/findings'
import { outlook } from '../model/outlook'
import { impactLabel, likelihoodLabel, siteRisks } from '../model/risk'
import { useFactory } from '../model/store'
import type { View } from '../App'

/** Counts up to a value once, for the headline figure (skipped when motion is reduced). */
function useCountUp(target: number, ms = 1_200) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setValue(target); return }
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      setValue(target * (1 - (1 - t) ** 3))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return value
}

export default function Home({ go }: { go: (view: View) => void }) {
  const state = useFactory()
  const found = useMemo(() => siteFindings(state), [state])
  const view = useMemo(() => outlook(state, { ...defaultTaxInputs, ...state.settings.carbonTax }), [state])
  const riskView = useMemo(() => siteRisks(state), [state])
  const open = found.findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed')
  const perMonth = open.reduce((sum, f) => sum + f.rmPerMonth, 0)
  const counted = useCountUp(perMonth)
  const site = state.settings.factoryName
  const scored = riskView.risks.filter((r) => r.likelihood !== null && r.impact !== null).sort((a, b) => b.likelihood! * b.impact! - a.likelihood! * a.impact!)
  const topRisk = scored[0]
  const last = view.last12, prior = view.prior12
  const change = prior && prior.totalT > 0 ? (last.totalT / prior.totalT - 1) * 100 : null
  const t = view.target

  const steps: { label: string; done: boolean; view: View; hint: string }[] = [
    { label: 'Upload bills', done: !view.empty, view: 'data', hint: '12+ months of TNB bills, fuel and production' },
    { label: 'Add meter data', done: Boolean(found.load), view: 'load', hint: 'Half-hourly readings find peak and idle waste' },
    { label: 'Check risks', done: Boolean(state.settings.riskChecklist && Object.keys(state.settings.riskChecklist).length >= 4), view: 'risks', hint: 'Site checklist and NASA climate data' },
    { label: 'Act on savings', done: found.findings.some((f) => f.state.status !== 'new'), view: 'findings', hint: 'Assign an owner to each way to save' },
    { label: 'Report', done: false, view: 'reports', hint: 'Bursa / NSRF disclosure, ready as PDF' },
  ]
  const next = steps.find((step) => !step.done) ?? steps[steps.length - 1]

  const headline = perMonth > 0
    ? <>{site} could save <b>{ringgit(perMonth)} a month</b>.</>
    : view.empty && !found.load
      ? <>Upload your bills to see where {site}’s money and carbon go.</>
      : <>No savings found yet in {site}’s data. Add {found.load ? 'monthly bills' : 'half-hourly meter data'} to look deeper.</>

  return <div className="home">
    <header className="home-head">
      <h1>{headline}</h1>
      <p className="muted">Next step: <button type="button" className="link" onClick={() => go(next.view)}>{next.label}</button> · {next.hint}</p>
    </header>

    <section className={`hero${perMonth > 0 ? '' : ' hero-start'}`}>
      {perMonth > 0 ? <>
        <div className="hero-main">
          <span className="hero-label">Money you could save</span>
          <strong className="hero-value">{ringgit(counted)}<small>/month</small></strong>
          <span className="hero-sub">≈ {ringgit(perMonth * 12)} a year · {open.length} ways to save</span>
          <button type="button" className="btn hero-btn" onClick={() => go('findings')}>See how →</button>
        </div>
        <ol className="hero-list">
          {open.slice(0, 3).map((f, k) => <li key={f.key}>
            <button type="button" onClick={() => go('findings')}>
              <span className="hero-rank">{k + 1}</span>
              <span className="hero-text"><b>{f.title}</b><small>{f.actions[0]}</small></span>
              <span className="hero-rm">{ringgit(f.rmPerMonth)}<small>/mo</small></span>
            </button>
          </li>)}
        </ol>
      </> : <div className="hero-main">
        <span className="hero-label">Start here</span>
        <strong className="hero-value small">Your bills in, answers out.</strong>
        <span className="hero-sub">Upload 12 months of TNB bills and production. You’ll see Scope 1 & 2, your forecast, carbon tax and where you’re losing money.</span>
        <div className="row-actions"><button type="button" className="btn hero-btn" onClick={() => go('data')}>⇪ Upload bills</button><button type="button" className="btn ghost hero-ghost" onClick={() => go('load')}>⚡ Add meter data</button></div>
      </div>}
    </section>

    <div className="home-tiles">
      <button type="button" className="home-tile" onClick={() => go('dashboard')}>
        <span className="tile-label">Emissions · last 12 months</span>
        {view.empty ? <span className="tile-empty">Upload bills</span> : <>
          <strong>{tonnes(last.totalT)} <small>CO₂e</small></strong>
          <span className={change === null ? 'muted' : change <= 0 ? 'good' : 'bad'}>{change === null ? 'No prior year yet' : `${change <= 0 ? '▼' : '▲'} ${num(Math.abs(change), 1)}% vs year before`}</span>
        </>}
      </button>
      <button type="button" className="home-tile" onClick={() => go('dashboard')}>
        <span className="tile-label">Target · −{state.settings.targetReductionPct}% by {state.settings.targetYear}</span>
        {t.onTrack === null ? <span className="tile-empty">Needs 12+ months</span> : <>
          <strong className={t.onTrack ? 'good' : 'bad'}>{t.onTrack ? '✓ On track' : '⚠ Off track'}</strong>
          <span className="muted">{t.onTrack ? 'Forecast meets the target' : `${tonnes(t.gapT ?? 0)}/yr still to cut`}</span>
        </>}
      </button>
      <button type="button" className="home-tile" onClick={() => go('risks')}>
        <span className="tile-label">Biggest risk</span>
        {!topRisk ? <span className="tile-empty">Fill the site checklist</span> : <>
          <strong>{topRisk.name}</strong>
          <span className="muted">{likelihoodLabel[topRisk.likelihood!]} · {impactLabel[topRisk.impact!]}{topRisk.rm !== null ? ` · ${ringgit(topRisk.rm)}${topRisk.rmLabel}` : ''}</span>
        </>}
      </button>
    </div>

    <section className="journey" aria-label="How it works">
      {steps.map((step, k) => <button key={step.label} type="button" className={`journey-step${step.done ? ' done' : ''}${step === next ? ' next' : ''}`} onClick={() => go(step.view)}>
        <span className="journey-dot">{step.done ? '✓' : k + 1}</span>
        <b>{step.label}</b>
        <small>{step.hint}</small>
      </button>)}
    </section>
  </div>
}
