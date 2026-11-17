import { useMemo, useState } from 'react'
import { num, ringgit } from '../format'
import { monthLabel } from '../model/history'
import { DEFAULT_TARIFF, PER_DAY, analyseInterval, importIntervalRows, intervalFor, slotLabel, timeLabel, type IntervalAnalysis, type IntervalImport } from '../model/interval'
import { SHIFT_HOURS } from '../model/findings'
import { actions, useFactory } from '../model/store'
import Info from '../components/Info'

const TEMPLATE = ['timestamp,kW', '2026-08-01 00:00,41250', '2026-08-01 00:30,40980', '2026-08-01 01:00,52310'].join('\n')

async function readFile(file: File): Promise<IntervalImport> {
  if (/\.(xlsx|xlsm)$/i.test(file.name)) {
    const { default: readXlsxFile } = await import('read-excel-file')
    const rows = await readXlsxFile(file)
    return importIntervalRows(rows.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 16).replace('T', ' ') : cell === null ? '' : String(cell))), file.name)
  }
  const text = (await file.text()).replace(/^﻿/, '')
  const first = text.split(/\r?\n/)[0] ?? ''
  const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : first.includes('\t') ? '\t' : ','
  return importIntervalRows(text.split(/\r?\n/).map((line) => line.split(sep)), file.name)
}

const mw = (kW: number) => `${num(kW / 1_000, 1)} MW`

/** Sequential single-hue ramp (light → dark blue) for the carpet plot. */
function ramp(t: number) {
  const c = Math.min(1, Math.max(0, t))
  const from = [238, 244, 251], to = [22, 63, 122]
  return `rgb(${from.map((v, k) => Math.round(v + (to[k] - v) * c)).join(',')})`
}

function Carpet({ a }: { a: IntervalAnalysis }) {
  const [hover, setHover] = useState<{ d: number; s: number } | null>(null)
  const rows = a.days_
  const cw = 14, ch = Math.max(4, Math.min(8, Math.floor(420 / rows.length))), left = 70, top = 18
  const width = left + PER_DAY * cw + 8, height = top + rows.length * ch + 4
  const lo = a.baseKW * 0.8, hi = a.peakKW
  const mdCells = new Set(a.months.map((m) => m.mdAt))
  const h = hover ? { date: rows[hover.d].date, slot: hover.s, kW: rows[hover.d].kW[hover.s] } : null
  return <div className="mchart">
    <svg className="chart carpet" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Demand for every half hour, one row per day">
      {[0, 6, 12, 18, 23].map((hr) => <text key={hr} x={left + hr * 2 * cw} y={12} className="chart-tick">{String(hr).padStart(2, '0')}:00</text>)}
      {rows.map((row, d) => <g key={row.date}>
        {(d === 0 || row.date.endsWith('-01')) && <text x={left - 6} y={top + d * ch + ch} textAnchor="end" className="chart-tick">{monthLabel(row.date.slice(0, 7))}</text>}
        {row.kW.map((v, s) => <rect key={s} x={left + s * cw} y={top + d * ch} width={cw - 1} height={ch - (ch > 5 ? 1 : 0)} fill={v === null ? '#f1f5f9' : ramp((v - lo) / (hi - lo))}
          onPointerEnter={() => setHover({ d, s })} onPointerLeave={() => setHover(null)} />)}
        {row.kW.map((_, s) => mdCells.has(`${row.date}T${slotLabel(s)}`) ? <rect key={`md${s}`} x={left + s * cw - 1} y={top + d * ch - 1} width={cw + 1} height={ch + 1} className="md-cell" /> : null)}
      </g>)}
    </svg>
    {h && <div className="chart-tip" style={{ left: `${Math.min(70, (left + h.slot * cw) / width * 100)}%` }}>
      <b>{timeLabel(`${h.date}T${slotLabel(h.slot)}`)}</b>
      <span>{h.kW === null ? 'No reading' : `${num(h.kW)} kW`}</span>
      {mdCells.has(`${h.date}T${slotLabel(h.slot)}`) && <small className="tip-flag">Set this month’s demand charge</small>}
    </div>}
    <div className="legend"><span><i className="legend-ramp" />Low → high</span><span><i className="legend-md" />Sets the charge</span><span><i style={{ background: '#f1f5f9' }} />No reading</span></div>
  </div>
}

function Profile({ a }: { a: IntervalAnalysis }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 240, L = 56, R = 12, T = 12, B = 28
  const max = Math.max(...a.profile.weekday, ...a.profile.sunday) * 1.1
  const x = (s: number) => L + s / (PER_DAY - 1) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  const line = (vals: number[]) => vals.map((v, s) => `${s ? 'L' : 'M'}${x(s)},${y(v)}`).join(' ')
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Average demand by time of day, working days and Sundays">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="chart-grid" /><text x={L - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{mw(max * f)}</text></g>)}
      <rect x={L} y={y(a.thresholds.idleBelowKW)} width={W - L - R} height={y(0) - y(a.thresholds.idleBelowKW)} className="idle-zone" />
      <text x={W - R - 4} y={y(a.thresholds.idleBelowKW) + 12} textAnchor="end" className="chart-tick">Idle</text>
      {[0, 12, 24, 36, 47].map((s) => <text key={s} x={x(s)} y={H - 8} textAnchor="middle" className="chart-tick">{slotLabel(s)}</text>)}
      <path d={line(a.profile.weekday)} fill="none" stroke="var(--series-s2)" strokeWidth={2} />
      <path d={line(a.profile.sunday)} fill="none" stroke="var(--series-s1)" strokeWidth={2} />
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="crosshair" />}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={(event) => { const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect(); setHover(Math.max(0, Math.min(PER_DAY - 1, Math.round(((event.clientX - box.left) / box.width * W - L) / (W - L - R) * (PER_DAY - 1))))) }} onPointerLeave={() => setHover(null)} />
    </svg>
    {hover !== null && <div className="chart-tip" style={{ left: `${Math.min(70, x(hover) / W * 100)}%` }}>
      <b>{slotLabel(hover)}</b>
      <span><i style={{ background: 'var(--series-s2)' }} />Mon–Sat {mw(a.profile.weekday[hover])}</span>
      <span><i style={{ background: 'var(--series-s1)' }} />Sunday {mw(a.profile.sunday[hover])}</span>
    </div>}
    <div className="legend"><span><i style={{ background: 'var(--series-s2)' }} />Mon–Sat average</span><span><i style={{ background: 'var(--series-s1)' }} />Sunday average</span><span><i className="legend-idle" />Idle range</span></div>
  </div>
}

function Duration({ a, capKW }: { a: IntervalAnalysis; capKW: number }) {
  const W = 640, H = 220, L = 56, R = 12, T = 12, B = 28
  const vals = a.duration
  const max = vals[0] * 1.05
  const x = (k: number) => L + k / (vals.length - 1) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Load-duration curve: every half hour sorted from highest to lowest demand">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} className="chart-grid" /><text x={L - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{mw(max * f)}</text></g>)}
      <path d={`M${x(0)},${y(0)} ${vals.map((v, k) => `L${x(k)},${y(v)}`).join(' ')} L${x(vals.length - 1)},${y(0)} Z`} className="duration-area" />
      <line x1={L} x2={W - R} y1={y(capKW)} y2={y(capKW)} className="cap-line" />
      <text x={L + 6} y={y(capKW) - 6} className="chart-note">New peak {mw(capKW)}</text>
      <text x={L} y={H - 8} className="chart-tick">Highest</text><text x={W - R} y={H - 8} textAnchor="end" className="chart-tick">Lowest</text>
    </svg>
  </div>
}

export default function LoadProfile({ onFindings }: { onFindings: () => void }) {
  const state = useFactory()
  const tariff = { ...DEFAULT_TARIFF, ...state.settings.tariff }
  const { series, sample } = intervalFor(state)
  const a = useMemo(() => analyseInterval(series, tariff), [series, tariff.mdRMPerKW, tariff.energyRMPerMWh]) // eslint-disable-line react-hooks/exhaustive-deps
  const [hours, setHours] = useState(SHIFT_HOURS)
  const [result, setResult] = useState<(IntervalImport & { name: string }) | null>(null)
  const last = a.months.at(-1)!
  const shave = last.shave.find((s) => s.hours === hours)!
  const setTariff = (patch: Partial<typeof tariff>) => actions.updateSettings({ tariff: { ...tariff, ...patch } })

  const take = async (file?: File) => {
    if (!file) return
    try { setResult({ ...await readFile(file), name: file.name }) } catch { setResult({ series: null, warnings: [], error: 'The file could not be read.', name: file.name }) }
  }

  return <div className="dashboard load-profile">
    <header className="dash-head">
      <div><h1>Load profile</h1><p className="muted">{state.settings.factoryName} · half-hourly demand · {timeLabel(a.from).split(', ')[1]} – {timeLabel(a.to).split(', ')[1]}</p></div>
      <div className="dash-actions">
        <a className="btn ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="chitocapture-half-hourly-template.csv">⤓ Template</a>
        <label className="btn ghost file-btn">⇪ Upload<input type="file" accept=".csv,.txt,.xlsx,.xlsm" onChange={(event) => { void take(event.target.files?.[0]); event.target.value = '' }} /></label>
        <button type="button" className="btn" onClick={onFindings}>⚑ Ways to save</button>
      </div>
    </header>

    {sample && !result && <div className="sample-banner"><b>Sample data</b> · Upload your meter’s half-hourly readings (timestamp + kW or kWh). <Info>Medium- and high-voltage customers can usually request this load profile from TNB.</Info></div>}
    {result && <section className={`card import-result${result.error ? ' failed' : ''}`}>
      <h2>{result.error ? `Could not import ${result.name}` : `${num((result.series?.kW.length ?? 0) / PER_DAY)} days found in ${result.name}`}</h2>
      {result.error && <p className="alert">{result.error}</p>}
      {result.warnings.length > 0 && <ul className="warn-list">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <div className="row-actions">
        {result.series && <button type="button" className="btn" onClick={() => { actions.setInterval(result.series); setResult(null) }}>Use this data</button>}
        <button type="button" className="btn ghost" onClick={() => setResult(null)}>Cancel</button>
      </div>
    </section>}
    {!sample && !result && <p className="muted small">Using {series.source}. <button type="button" className="link" onClick={() => { if (confirm('Remove the uploaded half-hourly data? The page goes back to sample data.')) actions.setInterval(null) }}>Remove</button></p>}

    <div className="dash-kpis">
      <div className="dash-kpi"><span className="dash-kpi-label">Peak demand · {monthLabel(last.month)}</span><strong>{mw(last.mdKW)}</strong><small className="muted">Charge <b>{ringgit(last.mdRM)}</b> · {timeLabel(last.mdAt)}</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">Load factor <Info>Average ÷ peak demand. Higher is better: the demand charge is spread over more kWh.</Info></span><strong>{num(last.loadFactor * 100)}%</strong><small className="muted">Higher is better</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">Always-on load</span><strong>{mw(a.baseKW)}</strong><small className="muted">{num(a.baseKW / a.avgKW * 100)}% of average</small></div>
      <div className="dash-kpi"><span className="dash-kpi-label">Running · idle · off</span>
        <div className="state-bar" aria-hidden="true"><i className="s-run" style={{ width: `${a.share.running * 100}%` }} /><i className="s-idle" style={{ width: `${a.share.idle * 100}%` }} /><i className="s-off" style={{ width: `${a.share.off * 100}%` }} /></div>
        <strong className="state-nums">{num(a.share.running * 100)}% · {num(a.share.idle * 100)}% · {num(a.share.off * 100)}%</strong>
        <small className="muted">Idle costs {ringgit(a.idle.rm / Math.max(1, a.days / 30.4))}/month</small></div>
    </div>

    <section className="card">
      <header className="card-head"><div><h2>Every half hour <Info>Each row is a day, each square a half hour; darker = more demand. Pale bands are stops. Red outlines are the half-hours that set your demand charge.</Info></h2><p className="muted small">Red = sets your demand charge</p></div></header>
      <Carpet a={a} />
    </section>

    <div className="dash-grid even">
      <section className="card">
        <header className="card-head"><div><h2>Shave the peak <Info>The demand charge is set by the single highest half hour of the month. Moving a little load out of the top hours lowers it. The energy is still used later, so this saves money, not CO₂.</Info></h2><p className="muted small">{monthLabel(last.month)}</p></div></header>
        <label className="field">Hours moved per month<input type="range" min="0" max="4" step="1" value={[1, 2, 4, 8, 16].indexOf(hours)} onChange={(event) => setHours([1, 2, 4, 8, 16][Number(event.target.value)])} /><output>{hours} h</output></label>
        <div className="shave-result">
          <div><span>New maximum</span><b>{mw(last.mdKW - shave.kW)}</b></div>
          <div><span>Cut</span><b>−{num(shave.kW)} kW</b></div>
          <div><span>Saving</span><b className="good">{ringgit(shave.rmPerMonth)}/mo</b></div>
          <div><span>To move</span><b>{num(shave.mwhToMove, 1)} MWh</b></div>
        </div>
        <Duration a={a} capKW={last.mdKW - shave.kW} />
        
      </section>
      <section className="card">
        <header className="card-head"><div><h2>Typical day <Info>Average demand at each time of day. The gap at quiet times is load left running.</Info></h2><p className="muted small">Mon–Sat vs Sunday</p></div></header>
        <Profile a={a} />
      </section>
    </div>

    <section className="card">
      <header className="card-head"><div><h2>By month</h2></div></header>
      <div className="table-wrap"><table className="grid-table">
        <thead><tr><th>Month</th><th className="num">Peak</th><th>When</th><th className="num">Charge</th><th className="num">Energy</th><th className="num">Load factor</th><th className="num">Save ({hours} h)</th></tr></thead>
        <tbody>{a.months.map((m) => { const s = m.shave.find((x) => x.hours === hours)!; return <tr key={m.month}>
          <td>{monthLabel(m.month)}</td><td className="num">{num(m.mdKW)} kW</td><td>{timeLabel(m.mdAt)}</td><td className="num">{ringgit(m.mdRM)}</td><td className="num">{num(m.energyMWh)} MWh</td><td className="num">{num(m.loadFactor * 100)}%</td><td className="num">{ringgit(s.rmPerMonth)}</td>
        </tr> })}</tbody>
      </table></div>
      <div className="form-grid compact tariff-form">
        <label className="field">Demand charge (RM/kW)<input type="number" min="0" step="0.01" value={tariff.mdRMPerKW} onChange={(event) => setTariff({ mdRMPerKW: Number(event.target.value) })} /></label>
        <label className="field">Energy charge (RM/MWh)<input type="number" min="0" step="1" value={tariff.energyRMPerMWh} onChange={(event) => setTariff({ energyRMPerMWh: Number(event.target.value) })} /></label>
      </div>
      <p className="muted small">Default: TNB medium voltage, July 2025. Use your bill’s rates. <Info>Idle = below {mw(a.thresholds.idleBelowKW)}, set from the site’s own quiet and busy levels. Data coverage {num(a.coverage * 100, 1)}%.</Info></p>
    </section>
  </div>
}
