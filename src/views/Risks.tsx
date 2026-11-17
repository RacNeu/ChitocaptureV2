import { useMemo, useState } from 'react'
import { num, ringgit } from '../format'
import Info from '../components/Info'
import { CLIMATE_YEARS, fetchClimate, validCoords } from '../model/climate'
import { horizonLabel, impactLabel, likelihoodLabel, siteRisks, type Horizon, type View } from '../model/risk'
import { roleById } from '../model/roles'
import { actions, useFactory, useRole } from '../model/store'
import type { FindingStatus, RiskChecklist } from '../model/types'

const statuses: { id: FindingStatus; label: string }[] = [
  { id: 'new', label: 'New' }, { id: 'assigned', label: 'Assigned' }, { id: 'in-progress', label: 'In progress' }, { id: 'fixed', label: 'Mitigated' }, { id: 'dismissed', label: 'Accepted' },
]
const viewLabel: Record<View, string> = { load: 'Load profile', dashboard: 'Dashboard', data: 'Monthly data', findings: 'Findings', plan: 'Plan', settings: 'Checklist' }
const tone = (score: number) => score >= 15 ? 'r4' : score >= 10 ? 'r3' : score >= 5 ? 'r2' : 'r1'

export default function Risks({ onOpen }: { onOpen: (view: Exclude<View, 'settings'>) => void }) {
  const state = useFactory()
  const role = useRole()
  const view = useMemo(() => siteRisks(state), [state])
  const [horizon, setHorizon] = useState<Horizon>('month')
  const [selected, setSelected] = useState<string | null>(null)
  const shown = view.risks.filter((r) => r.horizon === horizon)
  const scored = shown.filter((r) => r.likelihood !== null && r.impact !== null)
  const waiting = shown.filter((r) => r.likelihood === null || r.impact === null)
  const pick = view.risks.find((r) => r.id === selected) ?? null
  const go = (target: View) => target === 'settings' ? document.getElementById('checklist')?.scrollIntoView({ behavior: 'smooth' }) : onOpen(target)

  return <div className="dashboard risks">
    <header className="dash-head">
      <div><h1>Risks</h1><p className="muted">{state.settings.factoryName} · likelihood × impact <Info>Impact is measured against your yearly energy bill{view.energyBillRM ? ` (~${ringgit(view.energyBillRM)})` : ' (absolute RM bands until bills are uploaded)'}. Every risk is computed from your data, NASA POWER climate data, your checklist or a published rate; nothing is invented.</Info></p></div>
    </header>

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

    <Checklist />
  </div>
}

function Checklist() {
  const state = useFactory()
  const c = state.settings.riskChecklist ?? {}
  const loc = state.settings.location
  const [lat, setLat] = useState(loc ? String(loc.lat) : '')
  const [lon, setLon] = useState(loc ? String(loc.lon) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch: Partial<RiskChecklist>) => actions.updateSettings({ riskChecklist: { ...c, ...patch } })
  const numberOrUndef = (value: string) => value === '' ? undefined : Number(value)
  const climate = state.climate

  const getClimate = async () => {
    const la = Number(lat), lo = Number(lon)
    if (!validCoords(la, lo) || lat === '' || lon === '') { setError('Enter latitude and longitude, e.g. 5.3700, 100.4000.'); return }
    setBusy(true); setError('')
    actions.updateSettings({ location: { lat: la, lon: lo } })
    try { actions.setClimate(await fetchClimate(la, lo)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not reach NASA POWER.') }
    setBusy(false)
  }

  return <section className="card" id="checklist">
    <header className="card-head"><div><h2>Site checklist <Info>Your answers drive the flood, heat and tariff risks. Leave a question blank if you don’t know: the risk will say what it needs instead of guessing.</Info></h2></div></header>
    <div className="checklist-grid">
      <fieldset>
        <legend>Location · NASA climate</legend>
        <div className="form-grid compact two">
          <label className="field">Latitude<input inputMode="decimal" value={lat} placeholder="5.3700" onChange={(e) => setLat(e.target.value)} /></label>
          <label className="field">Longitude<input inputMode="decimal" value={lon} placeholder="100.4000" onChange={(e) => setLon(e.target.value)} /></label>
        </div>
        <button type="button" className="btn small" disabled={busy} onClick={() => void getClimate()}>{busy ? 'Fetching 30 years…' : climate ? '↻ Refresh NASA data' : '⤓ Get NASA climate data'}</button>
        {error && <p className="alert">{error}</p>}
        {climate && <div className="climate-box">
          <div><span>Hot days/yr <Info>Days above {climate.hot.thresholdC.toFixed(1)} °C (this grid cell’s hottest 5% in 1996–{CLIMATE_YEARS.split}).</Info></span><b>{climate.hot.earlyPerYear.toFixed(0)} → {climate.hot.recentPerYear.toFixed(0)}</b></div>
          <div><span>Extreme-rain days/yr <Info>Days above {climate.rain.thresholdMm.toFixed(0)} mm (wettest 1% in 1996–{CLIMATE_YEARS.split}).</Info></span><b>{climate.rain.earlyPerYear.toFixed(1)} → {climate.rain.recentPerYear.toFixed(1)}</b></div>
          <div><span>Wettest 3 days</span><b>{num(climate.rain.max3DayMm)} mm</b></div>
          <small className="muted">NASA POWER, {CLIMATE_YEARS.from}–{CLIMATE_YEARS.split} vs {CLIMATE_YEARS.split + 1}–{CLIMATE_YEARS.to} · ~50 km grid · {climate.lat.toFixed(3)}, {climate.lon.toFixed(3)}</small>
        </div>}
      </fieldset>
      <fieldset>
        <legend>Flood</legend>
        <label className="field">Floods at the site, last 10 yrs<select value={c.pastFloods ?? ''} onChange={(e) => set({ pastFloods: e.target.value === '' ? undefined : Number(e.target.value) as 0 | 1 | 2 })}><option value="">Don’t know</option><option value="0">None</option><option value="1">One</option><option value="2">Two or more</option></select></label>
        <label className="field">In a JPS flood-prone area?<select value={c.floodProneArea ?? ''} onChange={(e) => set({ floodProneArea: (e.target.value || undefined) as RiskChecklist['floodProneArea'] })}><option value="">Don’t know</option><option value="yes">Yes</option><option value="no">No</option></select></label>
        <label className="field">Nearest river<select value={c.riverDistance ?? ''} onChange={(e) => set({ riverDistance: (e.target.value || undefined) as RiskChecklist['riverDistance'] })}><option value="">Don’t know</option><option value="near">Under 500 m</option><option value="mid">0.5–2 km</option><option value="far">Over 2 km</option></select></label>
        <label className="field check"><input type="checkbox" checked={Boolean(c.groundLevelCritical)} onChange={(e) => set({ groundLevelCritical: e.target.checked })} /> Transformers or switchgear at ground level</label>
      </fieldset>
      <fieldset>
        <legend>Cost & other</legend>
        <label className="field">Cost of one shutdown day (RM)<input type="number" min="0" step="10000" value={c.costPerDayRM ?? ''} onChange={(e) => set({ costPerDayRM: numberOrUndef(e.target.value) })} /></label>
        <label className="field">Days lost per flood<input type="number" min="0" value={c.downtimeDaysPerFlood ?? ''} onChange={(e) => set({ downtimeDaysPerFlood: numberOrUndef(e.target.value) })} /></label>
        <label className="field">Days lost to heat per year<input type="number" min="0" value={c.heatLostDaysPerYear ?? ''} onChange={(e) => set({ heatLostDaysPerYear: numberOrUndef(e.target.value) })} /></label>
        <label className="field"><span><span className="tag-assume">assumption</span> Expected tariff change (%)</span><input type="number" step="1" value={c.tariffRisePct ?? ''} onChange={(e) => set({ tariffRisePct: numberOrUndef(e.target.value) })} /></label>
      </fieldset>
    </div>
  </section>
}
