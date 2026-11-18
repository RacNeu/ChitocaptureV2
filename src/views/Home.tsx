import { useEffect, useMemo, useState } from 'react'
import { kindIcon, num, ringgit, tonnes } from '../format'
import Info from '../components/Info'
import { Donut, HBars, Kpi, Legend, StackBars } from '../components/MsCharts'
import PlantArt from '../components/PlantArt'
import { summarise } from '../model/calc'
import { defaultTaxInputs } from '../model/carbonTax'
import { siteFindings } from '../model/findings'
import { outlook } from '../model/outlook'
import { impactLabel, likelihoodLabel, siteRisks } from '../model/risk'
import { useFactory } from '../model/store'
import type { View } from '../App'

const COL = { s1: 'var(--series-s1)', s2: 'var(--series-s2)', green: '#10b981', sky: '#0ea5e9', violet: '#7c3aed', amber: '#f59e0b' }

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

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

export default function Home({ go }: { go: (view: View) => void }) {
  const state = useFactory()
  const found = useMemo(() => siteFindings(state), [state])
  const view = useMemo(() => outlook(state, { ...defaultTaxInputs, ...state.settings.carbonTax }), [state])
  const riskView = useMemo(() => siteRisks(state), [state])
  const summary = useMemo(() => summarise(state), [state])
  const open = found.findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed')
  const perMonth = open.reduce((sum, f) => sum + f.rmPerMonth, 0)
  const counted = useCountUp(perMonth)
  const site = state.settings.factoryName
  const scored = riskView.risks.filter((r) => r.likelihood !== null && r.impact !== null).sort((a, b) => b.likelihood! * b.impact! - a.likelihood! * a.impact!)
  const last = view.last12, prior = view.prior12
  const change = prior && prior.totalT > 0 ? (last.totalT / prior.totalT - 1) * 100 : null
  const t = view.target
  const months = view.months.slice(-12)
  const intensity = last.productionT > 0 ? last.totalT / last.productionT : null
  const sources = [...summary.byMachine].filter((r) => r.baselineT > 0).sort((a, b) => b.baselineT - a.baselineT)
  const totalMachines = sources.reduce((a, r) => a + r.baselineT, 0)
  const steel = state.settings.industryId === 'steel', wire = state.settings.industryId === 'steel-downstream'
  const hasMelt = !!state.meltshop?.heats.length || !!state.meltshopDemo

  const steps: { label: string; done: boolean; view: View; hint: string }[] = [
    { label: 'Upload bills', done: !view.empty, view: 'data', hint: '12+ months of TNB bills, fuel and production' },
    { label: 'Add meter data', done: Boolean(found.load), view: 'load', hint: 'Half-hourly readings find peak and idle waste' },
    { label: 'Check risks', done: Boolean(state.settings.riskChecklist && Object.keys(state.settings.riskChecklist).length >= 4), view: 'risks', hint: 'Site checklist and NASA climate data' },
    { label: 'Act on savings', done: found.findings.some((f) => f.state.status !== 'new'), view: 'findings', hint: 'Assign an owner to each way to save' },
    { label: 'Report', done: false, view: 'reports', hint: 'Bursa / NSRF disclosure, ready as PDF' },
  ]
  const next = steps.find((step) => !step.done) ?? steps[steps.length - 1]

  return <div className="ms home2">
    <header className="h2-head">
      <div>
        <h1>{greeting()}, {site}</h1>
        <p className="muted">{view.empty ? 'Here’s what we can show so far, and what to add next.' : `Your site’s money and carbon at a glance · bills ${last.from} to ${last.to}`}</p>
      </div>
      <button type="button" className="btn" onClick={() => go(next.view)}>Next: {next.label} →</button>
    </header>

    <div className="ms-kpis">
      <Kpi icon="💰" label="Money you could save" value={perMonth > 0 ? ringgit(counted) : '—'} unit={perMonth > 0 ? '/month' : undefined} delta={perMonth > 0 ? `≈ ${ringgit(perMonth * 12)} a year · ${open.length} ways` : view.empty ? 'Add bills or meter data' : 'Add half-hourly meter data'} good={perMonth > 0 ? true : undefined} color={COL.green} />
      <Kpi icon="☁" label="Emissions · last 12 months" value={view.empty ? '—' : tonnes(last.totalT)} unit={view.empty ? undefined : 'CO₂e'} delta={view.empty ? 'Upload bills' : change === null ? 'No prior year yet' : `${change <= 0 ? '▼' : '▲'} ${num(Math.abs(change), 1)}% vs year before`} good={change === null ? undefined : change <= 0} spark={months.length > 1 ? months.map((m) => m.totalT) : undefined} color={COL.violet} />
      <Kpi icon="🍃" label="Carbon intensity" value={intensity !== null ? num(intensity, 3) : '—'} unit={intensity !== null ? `tCO₂e/t ${state.settings.productUnit}` : undefined} delta={intensity === null ? 'Needs production in the bills' : 'Scope 1 + 2 per tonne'} spark={months.length > 1 ? months.map((m) => (m.intensityKg ?? 0) / 1_000) : undefined} color={COL.sky} />
      <Kpi icon="🎯" label={`Target · −${state.settings.targetReductionPct}% by ${state.settings.targetYear}`} value={t.onTrack === null ? '—' : t.onTrack ? 'On track' : 'Off track'} delta={t.onTrack === null ? 'Needs 12+ months of bills' : t.onTrack ? 'Forecast meets the target' : `${tonnes(t.gapT ?? 0)}/yr still to cut`} good={t.onTrack ?? undefined} color={COL.amber} />
    </div>

    <div className="ov">
      <section className="ms-card h2-save">
        {perMonth > 0 ? <>
          <div className="ms-card-head"><h3>💰 Ways to save</h3><button type="button" className="link" onClick={() => go('findings')}>See all {open.length} →</button></div>
          <ol className="h2-list">{open.slice(0, 4).map((f, k) => <li key={f.key}><button type="button" onClick={() => go('findings')}>
            <span className="h2-rank">{k + 1}</span><span className="h2-text"><b>{f.title}</b><small>{f.actions[0]}</small></span><span className="h2-rm">{ringgit(f.rmPerMonth)}<small>/mo</small></span>
          </button></li>)}</ol>
        </> : <div className="h2-start">
          <PlantArt variant="hero" />
          <div className="h2-start-body">
            {view.empty ? <>
              <span className="eyebrow">Start here</span>
              <h2>Your bills in, answers out.</h2>
              <p>Upload 12 months of TNB bills and production. You’ll see Scope 1 & 2, the forecast, carbon tax and where you’re losing money.</p>
              <div className="row-actions"><button type="button" className="btn" onClick={() => go('data')}>⇪ Upload bills</button><button type="button" className="btn ghost" onClick={() => go('load')}>⚡ Add meter data</button></div>
            </> : <>
              <span className="eyebrow">Next: find the money</span>
              <h2>Bills are in. Now look deeper.</h2>
              <p>{found.load ? 'No savings stand out in the data yet.' : 'Half-hourly meter data shows peak-demand spikes and idle load, where most savings hide.'}{steel ? ' Furnace heat logs in the Melt shop show losses heat by heat.' : ''}</p>
              <div className="row-actions">{!found.load && <button type="button" className="btn" onClick={() => go('load')}>⚡ Add meter data</button>}{steel && <button type="button" className="btn ghost" onClick={() => go('meltshop')}>🔥 Melt shop</button>}</div>
            </>}
          </div>
        </div>}
      </section>

      <section className="ms-card ov-emis">
        <div className="ms-card-head"><h3>☁ Emissions trend</h3>{months.length > 0 && <Legend items={[{ label: 'Scope 1', color: COL.s1 }, { label: 'Scope 2', color: COL.s2 }]} />}</div>
        {months.length ? <StackBars x={months.map((m) => monthLabel(m.month))} stacks={[{ label: 'Scope 2', values: months.map((m) => m.scope2T), color: COL.s2 }, { label: 'Scope 1', values: months.map((m) => m.scope1T), color: COL.s1 }]} unit="tCO₂e" width={420} height={220} />
          : <div className="h2-empty"><span aria-hidden="true">📈</span><p>Monthly Scope 1 and 2 appear here once bills are uploaded.</p><button type="button" className="link" onClick={() => go('data')}>Upload bills →</button></div>}
      </section>

      <section className="ms-card ov-donut ms-center">
        <h3>🍃 Carbon footprint</h3>
        {!view.empty ? <>
          <Donut parts={[{ label: 'Scope 2', value: last.scope2T, color: COL.s2 }, { label: 'Scope 1', value: last.scope1T, color: COL.s1 }]} center={tonnes(last.totalT).replace(' CO₂e', '')} sub="CO₂e, 12 months" size={150} />
          <ul className="ms-balance-list">
            <li><i style={{ background: COL.s1 }} /><span>Scope 1</span><b>{num(last.scope1T / last.totalT * 100)}%</b><small>fuel & process</small></li>
            <li><i style={{ background: COL.s2 }} /><span>Scope 2</span><b>{num(last.scope2T / last.totalT * 100)}%</b><small>electricity</small></li>
          </ul>
        </> : <>
          <Donut parts={[]} center="—" sub="needs bills" size={150} />
          <p className="ms-note">Scope 1 and 2 come from your bills, the single source of truth.</p>
        </>}
      </section>

      <section className="ms-card h2-sources">
        <div className="ms-card-head"><h3>🏭 Biggest sources {view.empty && <span className="ms-badge b-none">template figures</span>}</h3><button type="button" className="link" onClick={() => go('analysis')}>By machine →</button></div>
        <HBars rows={sources.slice(0, 5).map((r) => ({ label: `${kindIcon[r.machine.kind] ?? '•'} ${r.machine.name}`, value: r.baselineT / totalMachines * 100, color: COL.green, note: `${tonnes(r.baselineT)}/yr` }))} unit="%" />
        {view.empty && <p className="ms-note">A typical {steel ? 'induction mini-mill' : 'site of this kind'}, until your bills replace it.</p>}
      </section>

      <section className="ms-card h2-risks">
        <div className="ms-card-head"><h3>◬ Top risks</h3><button type="button" className="link" onClick={() => go('risks')}>Risk matrix →</button></div>
        {scored.length ? <ul className="h2-risk-list">{scored.slice(0, 3).map((r) => { const score = r.likelihood! * r.impact!; return <li key={r.id}>
          <span className={`h2-sev ${score >= 15 ? 'high' : score >= 8 ? 'mid' : 'low'}`}>{score}</span>
          <span><b>{r.name}</b><small>{likelihoodLabel[r.likelihood!]} · {impactLabel[r.impact!]}{r.rm !== null ? ` · ${ringgit(r.rm)}${r.rmLabel}` : ''}</small></span>
        </li> })}</ul> : <div className="h2-empty"><span aria-hidden="true">◬</span><p>Fill the site checklist to score flood, heat and cost risks.</p><button type="button" className="link" onClick={() => go('risks')}>Open checklist →</button></div>}
      </section>

      <section className="ms-card ov-sim">
        <PlantArt variant="plant" />
        <div className="ov-sim-body">
          <h3>{steel ? '🔥 Melt shop' : wire ? '🧵 Galvanising line' : '◭ Site 3D'}</h3>
          <p>{steel ? (hasMelt ? 'Your induction furnaces: live twin, energy, chemistry, carbon and the simulator.' : 'Upload furnace heat logs, or open the demo melt shop.') : wire ? 'The wire plant running live, with its carbon heat map.' : 'Your buildings in 3D, with carbon, risks and actions.'}</p>
        </div>
        <button type="button" className="btn" onClick={() => go(steel || wire ? 'meltshop' : 'twin')}>Open →</button>
      </section>

      <section className="ms-card h2-journey">
        <h3>How it works</h3>
        <div className="journey" aria-label="How it works">
          {steps.map((step, k) => <button key={step.label} type="button" className={`journey-step${step.done ? ' done' : ''}${step === next ? ' next' : ''}`} onClick={() => go(step.view)}>
            <span className="journey-dot">{step.done ? '✓' : k + 1}</span><b>{step.label}</b><small>{step.hint}</small>
          </button>)}
        </div>
      </section>

      <section className={`ov-banner ${t.onTrack === false ? 'warn' : ''}`}>
        <PlantArt variant="skyline" />
        <span className="ov-leaf" aria-hidden="true">🍃</span>
        <div>
          <b>{t.onTrack === null ? `Target: −${state.settings.targetReductionPct}% by ${state.settings.targetYear}` : t.onTrack ? 'On track to meet your decarbonisation target' : 'Not yet on track for your target'}</b>
          <span>{t.onTrack === null ? 'Upload 12+ months of bills to check progress against it.' : t.onTrack ? `The forecast meets the ${state.settings.targetYear} target.` : `${tonnes(t.gapT ?? 0)} a year still to cut. Your plan and the simulator show how.`} <Info>Target from Settings, checked against the bill-based forecast ({t.basis === 'intensity' ? 'per tonne' : 'absolute'}).</Info></span>
        </div>
      </section>
    </div>
  </div>
}
