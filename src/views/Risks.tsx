import { useMemo, useState } from 'react'
import { ringgit } from '../format'
import Info from '../components/Info'
import { horizonLabel, impactLabel, likelihoodLabel, siteRisks, type Horizon, type View } from '../model/risk'
import { roleById } from '../model/roles'
import { actions, useFactory, useRole } from '../model/store'
import type { FindingStatus, RiskChecklist } from '../model/types'
import { DEMO_LINING_LIFE, earlyWarnings, fmtDays, type Series, type Warning, type WarnStatus } from '../model/warnings'
import { useMelt } from './MeltShop'

const statuses: { id: FindingStatus; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'assigned', label: 'Assigned' }, { id: 'in-progress', label: 'In progress' }, { id: 'fixed', label: 'Mitigated' }, { id: 'dismissed', label: 'Accepted' },
]
const viewLabel: Record<View, string> = { load: 'Electricity load', dashboard: 'Emissions', data: 'Upload bills', findings: 'Ways to save', plan: 'Plan', meltshop: 'Melt shop', settings: 'Assumptions' }
const tone = (score: number) => score >= 15 ? 'r4' : score >= 10 ? 'r3' : score >= 5 ? 'r2' : 'r1'
const statusLabel: Record<WarnStatus, string> = { act: 'Act now', watch: 'Watch', needs: 'Needs data', ok: 'OK' }
/** " · 90% range a–b", or nothing when both ends read the same. */
const range = (d: { low: number; high: number }) => {
  const lo = fmtDays(d.low), hi = Number.isFinite(d.high) ? fmtDays(d.high) : 'longer'
  return lo === hi ? '' : ` · 90% range ${lo}–${hi}`
}
const rank: Record<WarnStatus, number> = { act: 0, watch: 1, needs: 2, ok: 3 }

export default function Risks({ onOpen }: { onOpen: (view: Exclude<View, 'settings'>) => void }) {
  const state = useFactory()
  const steel = state.settings.industryId === 'steel'
  return <div className="dashboard risks">
    <header className="dash-head">
      <div><h1>Risks</h1><p className="muted">{steel ? 'Plant early warnings first: what is likely to go wrong soon, how soon, and what to do now. Business risks below.' : 'Cost, compliance and target risks for this site.'}</p></div>
    </header>
    {steel && <PlantWarnings onOpen={onOpen} />}
    <BusinessRisks onOpen={onOpen} />
    <Assumptions />
  </div>
}

/* ---------------- Plant early warnings ---------------- */

function PlantWarnings({ onOpen }: { onOpen: (view: Exclude<View, 'settings'>) => void }) {
  const melt = useMelt()
  const list = useMemo(() => melt ? earlyWarnings({ heats: melt.heats, chem: melt.data.chem, readings: melt.data.readings, anomalies: melt.anomalies, model: melt.model, s: melt.s, isDemo: melt.isDemo }) : [], [melt])
  if (!melt) return <section className="card warn-empty">
    <h2>Plant early warnings</h2>
    <p className="muted">These come from the melt shop’s own data: coil-water readings, the heat log (lining and energy) and lab results. Upload them in the Melt shop, or open the demo melt shop to see how it works.</p>
    <div className="row-actions">
      <button type="button" className="btn" onClick={() => actions.setMeltShopDemo(true)}>Open the demo melt shop</button>
      <button type="button" className="btn ghost" onClick={() => onOpen('meltshop')}>Upload in Melt shop →</button>
    </div>
  </section>

  // Linings are one schedule card (one row per furnace) rather than a card each.
  const linings = list.filter((w) => w.area === 'Lining').sort((a, b) => (a.days?.mid ?? Infinity) - (b.days?.mid ?? Infinity))
  const liningStatus = linings.reduce<WarnStatus>((s, w) => rank[w.status] < rank[s] ? w.status : s, 'ok')
  const rest = list.filter((w) => w.area !== 'Lining')
  const open = rest.filter((w) => w.status !== 'ok')
  const ok = rest.filter((w) => w.status === 'ok')
  const firstQuiet = open.findIndex((w) => rank[w.status] > rank[liningStatus])
  const at = firstQuiet < 0 ? open.length : firstQuiet
  const count = (s: WarnStatus) => rest.filter((w) => w.status === s).length + (linings.length && liningStatus === s ? 1 : 0)
  return <section className="warn-section" aria-labelledby="warn-h">
    <div className="warn-head">
      <h2 id="warn-h">Plant early warnings <Info>Each warning follows the same pattern: a leading signal from your own data, its trend (Theil–Sen, robust to odd readings), the time until it reaches the limit with a 90% range, and the action that prevents it. Alarms on Live data say something is happening now; these say it will happen unless you act.</Info></h2>
      <div className="warn-counts">
        {(['act', 'watch', 'needs', 'ok'] as WarnStatus[]).filter((s) => count(s)).map((s) => <span key={s} className={`warn-count ${s}`}>{count(s)} {statusLabel[s].toLowerCase()}</span>)}
      </div>
    </div>
    {melt.isDemo && <p className="warn-demo">Demo melt shop (illustrative): built-in events include IF1’s coil water slowly heating up, IF4 using more energy, and linings at different ages. The {DEMO_LINING_LIFE}-heat lining life is a demo setting.</p>}
    <div className="warn-grid">
      {open.slice(0, at).map((w) => <WarnCard key={w.id} w={w} />)}
      {linings.length > 0 && <LiningCard list={linings} status={liningStatus} />}
      {open.slice(at).map((w) => <WarnCard key={w.id} w={w} />)}
    </div>
    {ok.length > 0 && <div className="warn-ok"><b>All clear</b>{ok.map((w) => <span key={w.id} className="warn-ok-chip" title={w.headline}><i aria-hidden="true" />{w.title}</span>)}</div>}
  </section>
}

function WarnCard({ w }: { w: Warning }) {
  const state = useFactory()
  const role = useRole()
  const key = `warn-${w.id}`
  const f = state.findings?.[key] ?? { status: 'new' as FindingStatus, updatedAt: '' }
  const done = f.status === 'fixed' || f.status === 'dismissed'
  return <article className={`warn-card ${w.status}${done ? ' done' : ''}`}>
    <header>
      <span className={`warn-badge ${w.status}`}>{statusLabel[w.status]}</span>
      <span className="warn-area">{w.area}{w.furnace ? ` · ${w.furnace}` : ''}</span>
    </header>
    <h3>{w.title}</h3>
    {w.days && <div className="warn-time"><b>{w.days.mid <= 0 ? 'At the limit' : `~${fmtDays(w.days.mid)}`}</b>{w.days.mid > 0 && <span>to the limit{range(w.days)}</span>}</div>}
    {!w.days && w.rmPerMonth !== null && w.rmPerMonth > 0 && <div className="warn-time"><b>{ringgit(w.rmPerMonth)}</b><span>a month at stake</span></div>}
    <p className="warn-headline">{w.headline}</p>
    {w.series && w.series.x.length > 1 && <TrendChart s={w.series} />}
    {w.missing.length > 0 && <p className="warn-missing">Needs: {w.missing.join(', ')}</p>}
    <p className="warn-action"><b>Do</b>{w.action}</p>
    {w.evidence.length > 0 && <details className="warn-evidence"><summary>Evidence</summary><ul>{w.evidence.map((e) => <li key={e}>{e}</li>)}</ul></details>}
    <footer>
      <div className="basis">{w.basis.map((b) => <span key={b} className={`basis-tag ${/demo|example/.test(b) ? 'assume' : ''}`}>{b}</span>)}</div>
      {w.status !== 'needs' && <div className="finding-controls">
        <select value={f.status} onChange={(e) => actions.setFinding(key, { status: e.target.value as FindingStatus, owner: f.owner ?? roleById(role).person }, w.title)} aria-label={`Status of ${w.title}`}>{statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <input className="owner-input" placeholder="Owner" value={f.owner ?? ''} onChange={(e) => actions.setFinding(key, { owner: e.target.value }, w.title)} aria-label={`Owner of ${w.title}`} />
      </div>}
    </footer>
  </article>
}

/** Every furnace's lining against its usual life, soonest reline first. */
function LiningCard({ list, status }: { list: Warning[]; status: WarnStatus }) {
  const state = useFactory()
  const role = useRole()
  const key = 'warn-lining'
  const f = state.findings?.[key] ?? { status: 'new' as FindingStatus, updatedAt: '' }
  const life = state.settings.melt?.liningLifeHeats
  const first = list[0]
  const limit = first.series?.limit ?? null
  const relines = list.flatMap((w) => w.evidence.filter((e) => e.startsWith('Relined')).map((e) => `${w.furnace}: ${e}`))
  return <article className={`warn-card lining ${status}${f.status === 'fixed' || f.status === 'dismissed' ? ' done' : ''}`}>
    <header><span className={`warn-badge ${status}`}>{statusLabel[status]}</span><span className="warn-area">Lining · reline schedule</span></header>
    <h3>{status === 'needs' ? 'Lining life not set' : first.days && first.days.mid <= 0 ? `${first.furnace} lining past its usual life` : `${first.furnace} reline due first`}</h3>
    {first.days && <div className="warn-time"><b>{first.days.mid <= 0 ? 'Now' : `~${fmtDays(first.days.mid)}`}</b>{first.days.mid > 0 && <span>until {first.furnace} reaches {Math.round(limit ?? 0)} heats{range(first.days)}</span>}</div>}
    <ul className="lining-rows">
      {list.map((w) => {
        const now = w.series?.y[w.series.y.length - 1] ?? 0
        const share = limit ? Math.min(1, now / limit) : 0
        return <li key={w.id} className={w.status}>
          <b>{w.furnace}</b>
          <span className="lining-bar" role="img" aria-label={limit ? `${now} of ${Math.round(limit)} heats` : `${now} heats`}><i style={{ width: `${share * 100}%` }} /></span>
          <span className="lining-num">{now}{limit ? ` / ${Math.round(limit)}` : ''}</span>
          <span className="lining-days">{w.days ? (w.days.mid <= 0 ? 'past life' : `~${fmtDays(w.days.mid)}`) : '—'}</span>
        </li>
      })}
    </ul>
    <label className="warn-life">Usual lining life
      <input type="number" min="20" step="10" placeholder={String(DEMO_LINING_LIFE)} value={life ?? ''} onChange={(e) => actions.updateSettings({ melt: { ...state.settings.melt, liningLifeHeats: e.target.value === '' ? undefined : Math.max(1, Number(e.target.value)) } })} />heats</label>
    {first.missing.length > 0 && <p className="warn-missing">Needs: {first.missing.join(', ')}</p>}
    <p className="warn-action"><b>Do</b>{first.action}</p>
    <details className="warn-evidence"><summary>Evidence</summary><ul>
      {list.map((w) => <li key={w.id}>{w.furnace}: {w.evidence[0]}</li>)}
      {relines.map((e) => <li key={e}>{e}</li>)}
      {first.evidence.slice(-2).filter((e) => !e.startsWith('Relined') && !e.startsWith('Heat ')).map((e) => <li key={e}>{e}</li>)}
    </ul></details>
    <footer>
      <div className="basis">{first.basis.map((b) => <span key={b} className={`basis-tag ${/demo|example/.test(b) ? 'assume' : ''}`}>{b}</span>)}</div>
      {status !== 'needs' && <div className="finding-controls">
        <select value={f.status} onChange={(e) => actions.setFinding(key, { status: e.target.value as FindingStatus, owner: f.owner ?? roleById(role).person }, 'Reline schedule')} aria-label="Status of the reline schedule">{statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
        <input className="owner-input" placeholder="Owner" value={f.owner ?? ''} onChange={(e) => actions.setFinding(key, { owner: e.target.value }, 'Reline schedule')} aria-label="Owner of the reline schedule" />
      </div>}
    </footer>
  </article>
}

/** The signal, its trend projected forward, and the limit it is heading for. */
function TrendChart({ s }: { s: Series }) {
  const W = 320, H = 96, P = { l: 4, r: 4, t: 10, b: 14 }
  const x0 = s.x[0], xLast = s.x[s.x.length - 1], span = Math.max(1e-6, xLast - x0)
  const at = (x: number) => s.fit ? s.fit.a + s.fit.b * x : NaN
  let cross: number | null = null
  if (s.fit && s.limit !== null && s.fit.b !== 0) { const c = (s.limit - s.fit.a) / s.fit.b; if (c > xLast && c < xLast + 3 * span) cross = c }
  const x1 = cross !== null ? cross + span * 0.04 : xLast
  const ys = [...s.y, ...(s.limit !== null ? [s.limit] : []), ...(s.fit ? [at(x0), at(x1)] : [])].filter(Number.isFinite)
  let lo = Math.min(...ys), hi = Math.max(...ys)
  const pad = (hi - lo || 1) * 0.12; lo -= pad; hi += pad
  const sx = (x: number) => P.l + (x - x0) / (x1 - x0) * (W - P.l - P.r)
  const sy = (y: number) => P.t + (hi - y) / (hi - lo) * (H - P.t - P.b)
  const line = s.x.map((x, k) => `${k ? 'L' : 'M'}${sx(x).toFixed(1)} ${sy(s.y[k]).toFixed(1)}`).join(' ')
  const unit = s.xUnit === 'h' ? 'hours' : 'days'
  return <svg className="warn-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trend of the signal over ${Math.round(span)} ${unit}${s.limit !== null ? `, limit ${s.limitLabel}` : ''}${cross !== null ? ', projected to reach it' : ''}`}>
    {cross !== null && <rect x={sx(xLast)} y={P.t} width={sx(x1) - sx(xLast)} height={H - P.t - P.b} className="wc-future" />}
    {s.limit !== null && <><line x1={P.l} x2={W - P.r} y1={sy(s.limit)} y2={sy(s.limit)} className="wc-limit" /><text x={W - P.r - 2} y={sy(s.limit) - 3} textAnchor="end" className="wc-label">{s.limitLabel}</text></>}
    <path d={line} className="wc-line" />
    {s.fit && <line x1={sx(x0)} y1={sy(at(x0))} x2={sx(cross ?? xLast)} y2={sy(at(cross ?? xLast))} className="wc-fit" />}
    {cross !== null && <circle cx={sx(cross)} cy={sy(s.limit!)} r="3.5" className="wc-cross" />}
    <line x1={sx(xLast)} x2={sx(xLast)} y1={P.t} y2={H - P.b} className="wc-now" />
    <text x={sx(xLast)} y={H - 3} textAnchor={cross !== null ? 'middle' : 'end'} className="wc-label">now</text>
    <text x={P.l} y={H - 3} className="wc-label">{Math.round(span)} {unit} ago</text>
  </svg>
}

/* ---------------- Business risks ---------------- */

function BusinessRisks({ onOpen }: { onOpen: (view: Exclude<View, 'settings'>) => void }) {
  const state = useFactory()
  const role = useRole()
  const view = useMemo(() => siteRisks(state), [state])
  const [horizon, setHorizon] = useState<Horizon>('month')
  const [selected, setSelected] = useState<string | null>(null)
  const shown = view.risks.filter((r) => r.horizon === horizon)
  const scored = shown.filter((r) => r.likelihood !== null && r.impact !== null)
  const waiting = shown.filter((r) => r.likelihood === null || r.impact === null)
  const pick = view.risks.find((r) => r.id === selected) ?? null
  const go = (target: View) => target === 'settings' ? document.getElementById('assumptions')?.scrollIntoView({ behavior: 'smooth' }) : onOpen(target)

  return <section className="biz-section" aria-labelledby="biz-h">
    <div className="warn-head"><h2 id="biz-h">Business risks <Info>Cost, compliance and target risks, scored likelihood × impact. Impact is measured against your yearly energy bill{view.energyBillRM ? ` (~${ringgit(view.energyBillRM)})` : ' (absolute RM bands until bills are uploaded)'}. Each is computed from your uploads, your assumptions or a published rate.</Info></h2></div>
    <div className="scope-tabs" role="tablist" aria-label="Horizon">
      {(['month', 'years', '2030'] as Horizon[]).map((h) => <button key={h} type="button" role="tab" aria-selected={horizon === h} className={horizon === h ? 'active' : ''} onClick={() => { setHorizon(h); setSelected(null) }}>
        {horizonLabel[h]} <span className="tab-count">{view.risks.filter((r) => r.horizon === h && r.likelihood !== null && r.impact !== null).length}</span></button>)}
    </div>

    <div className="risk-layout">
      <section className="card">
        <div className="matrix" role="grid" aria-label={`Risk matrix, ${horizonLabel[horizon]}`}>
          <div className="matrix-y">Likelihood</div>
          {[5, 4, 3, 2, 1].map((l) => <div key={l} className="matrix-row" role="row">
            <span className="matrix-label">{likelihoodLabel[l]}</span>
            {[1, 2, 3, 4, 5].map((i) => <div key={i} role="gridcell" className={`matrix-cell ${tone(l * i)}`}>
              {scored.filter((r) => r.likelihood === l && r.impact === i).map((r) => <button key={r.id} type="button" className={`risk-chip${selected === r.id ? ' active' : ''}${r.state.status === 'fixed' || r.state.status === 'dismissed' ? ' done' : ''}`} onClick={() => setSelected(r.id)}>{r.name}</button>)}
            </div>)}
          </div>)}
          <div className="matrix-row axis"><span />{[1, 2, 3, 4, 5].map((i) => <span key={i} className="matrix-label x">{impactLabel[i]}</span>)}</div>
          <div className="matrix-x">Impact</div>
        </div>
        {waiting.length > 0 && <div className="needs">
          <b>Needs input</b>
          {waiting.map((r) => <button key={r.id} type="button" className="needs-chip" onClick={() => setSelected(r.id)}>{r.name} · <span className="muted">{r.missing.join(', ')}</span></button>)}
        </div>}
      </section>

      <aside className="card risk-panel">
        {!pick ? <p className="muted">Pick a risk to see the evidence and what to do.</p> : <>
          <header><h2>{pick.name}</h2><button type="button" className="icon-btn" aria-label="Close" onClick={() => setSelected(null)}>✕</button></header>
          {pick.likelihood !== null && pick.impact !== null ? <div className="risk-score">
            <span className={`score-dot ${tone(pick.likelihood * pick.impact)}`}>{pick.likelihood * pick.impact}</span>
            <div><b>{likelihoodLabel[pick.likelihood]} · {impactLabel[pick.impact]}</b>{pick.rm !== null && <small>{ringgit(pick.rm)}{pick.rmLabel}</small>}</div>
          </div> : <p className="alert">Needs: {pick.missing.join(', ')}</p>}
          {pick.basis.length > 0 && <div className="basis">{pick.basis.map((b) => <span key={b} className={`basis-tag ${b === 'assumption' ? 'assume' : ''}`}>{b}</span>)}</div>}
          {pick.evidence.length > 0 && <><h3>Evidence</h3><ul className="evidence">{pick.evidence.map((e) => <li key={e}>{e}</li>)}</ul></>}
          {pick.actions.length > 0 && <><h3>Do</h3><ol className="risk-actions">{pick.actions.map((a) => <li key={a}>{a}</li>)}</ol></>}
          {pick.likelihood !== null && <div className="finding-controls">
            <select value={pick.state.status} onChange={(event) => actions.setFinding(`risk-${pick.id}`, { status: event.target.value as FindingStatus, owner: pick.state.owner ?? roleById(role).person }, pick.name)} aria-label="Status">{statuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
            <input className="owner-input" placeholder="Owner" value={pick.state.owner ?? ''} onChange={(event) => actions.setFinding(`risk-${pick.id}`, { owner: event.target.value }, pick.name)} aria-label="Owner" />
          </div>}
          <div className="row-actions">{pick.links.map((l) => <button key={l} type="button" className="btn ghost small" onClick={() => go(l)}>{viewLabel[l]} →</button>)}</div>
        </>}
      </aside>
    </div>
  </section>
}

function Assumptions() {
  const state = useFactory()
  const c = state.settings.riskChecklist ?? {}
  const set = (patch: Partial<RiskChecklist>) => actions.updateSettings({ riskChecklist: { ...c, ...patch } })
  return <section className="card assumptions" id="assumptions">
    <h2>Assumptions <Info>Used by the tariff risk. Leave it blank if you don’t know: the risk will say what it needs instead of guessing.</Info></h2>
    <label className="field"><span><span className="tag-assume">assumption</span> Expected electricity tariff change (%)</span>
      <input type="number" step="1" value={c.tariffRisePct ?? ''} onChange={(e) => set({ tariffRisePct: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
  </section>
}
