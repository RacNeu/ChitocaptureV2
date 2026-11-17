import { useState } from 'react'
import { num, ringgit, tonnes } from '../format'
import { fitQuality, type Baseline, type StreamBaseline } from '../model/baseline'
import { monthLabel } from '../model/history'
import Info from './Info'

type Tab = 'cusum' | 'electricity' | 'fuel'

const W = 760, H = 260, L = 64, R = 14, T = 14, B = 30

function axis(min: number, max: number, y: (v: number) => number, fmt: (v: number) => string) {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => { const v = min + (max - min) * f; return <g key={f}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="chart-tick">{fmt(v)}</text></g> })
}

function useHover(count: number) {
  const [hover, setHover] = useState<number | null>(null)
  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const vx = (event.clientX - box.left) / box.width * W
    setHover(Math.max(0, Math.min(count - 1, Math.round((vx - L) / (W - L - R) * (count - 1)))))
  }
  return { hover, onMove, clear: () => setHover(null) }
}

/** Running total of money lost (above zero) or saved (below zero) against the baseline. */
function CusumChart({ baseline }: { baseline: Baseline }) {
  const rows = baseline.months
  const { hover, onMove, clear } = useHover(rows.length)
  if (rows.length < 2) return <div className="chart-empty">Needs two months after the baseline.</div>
  const values = rows.map((r) => r.cusumRM)
  const min = Math.min(0, ...values) * 1.1, max = Math.max(0, ...values) * 1.1 || 1
  const x = (i: number) => L + i / (rows.length - 1) * (W - L - R)
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const end = values.at(-1)!
  const h = hover !== null ? rows[hover] : null
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Running total of energy cost against the baseline">
      {axis(min, max, y, ringgit)}
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} className="zero-line" />
      <text x={W - R} y={y(0) - 6} textAnchor="end" className="chart-tick">Normal</text>
      <path d={`${line} L${x(rows.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className={end <= 0 ? 'cusum-area good' : 'cusum-area bad'} />
      <path d={line} fill="none" className={end <= 0 ? 'cusum-line good' : 'cusum-line bad'} />
      {rows.map((r, i) => r.gapRM > 0 ? <circle key={r.month} cx={x(i)} cy={y(r.cusumRM)} r={4} className="cusum-up" /> : null)}
      {rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 8)) === 0).map((r) => { const i = rows.indexOf(r); return <text key={r.month} x={x(i)} y={H - 10} textAnchor="middle" className="chart-tick">{monthLabel(r.month)}</text> })}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="crosshair" />}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerLeave={clear} />
    </svg>
    {h && hover !== null && <div className="chart-tip" style={{ left: `${Math.min(72, Math.max(4, x(hover) / W * 100))}%` }}>
      <b>{monthLabel(h.month)}</b>
      <span>This month: {h.gapRM > 0 ? `▲ ${ringgit(h.gapRM)} over` : `▼ ${ringgit(-h.gapRM)} under`} expected</span>
      <span>Running total: {h.cusumRM > 0 ? `${ringgit(h.cusumRM)} lost` : `${ringgit(-h.cusumRM)} saved`}</span>
      <small>{h.gapT > 0 ? '+' : '−'}{tonnes(Math.abs(h.gapT))} CO₂e this month</small>
    </div>}
    <div className="legend"><span><i className={end <= 0 ? 'legend-good' : 'legend-bad'} />Saved (−) / lost (+) so far</span><span><i className="legend-up" />Bad month</span></div>
  </div>
}

/** Actual energy against what the baseline expects for that month's production. */
function StreamChart({ stream }: { stream: StreamBaseline }) {
  const rows = stream.months
  const { hover, onMove, clear } = useHover(rows.length)
  const max = Math.max(...rows.flatMap((r) => [r.actual, r.expected])) * 1.08
  const min = Math.min(...rows.flatMap((r) => [r.actual, r.expected])) * 0.9
  const x = (i: number) => L + i / (rows.length - 1) * (W - L - R)
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B)
  const path = (key: 'actual' | 'expected') => rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(r[key])}`).join(' ')
  const split = rows.findIndex((r) => !r.inBaseline)
  const color = stream.stream === 'electricity' ? 'var(--series-s2)' : 'var(--series-s1)'
  const h = hover !== null ? rows[hover] : null
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${stream.stream} actual against expected`}>
      {split > 0 && <rect x={L} y={T} width={x(split) - L} height={H - T - B} className="forecast-zone" />}
      {split > 0 && <text x={L + 6} y={T + 12} className="chart-tick">Learning period</text>}
      {axis(min, max, y, (v) => `${num(v / 1_000, 1)}k`)}
      {rows.map((r, i) => !r.inBaseline ? <line key={r.month} x1={x(i)} x2={x(i)} y1={y(r.expected)} y2={y(r.actual)} className={r.gap > 0 ? 'gap-bad' : 'gap-good'} /> : null)}
      <path d={path('expected')} fill="none" className="expected-line" />
      <path d={path('actual')} fill="none" stroke={color} strokeWidth={2} />
      {rows.filter((_, i) => i % Math.max(1, Math.ceil(rows.length / 8)) === 0).map((r) => { const i = rows.indexOf(r); return <text key={r.month} x={x(i)} y={H - 10} textAnchor="middle" className="chart-tick">{monthLabel(r.month)}</text> })}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="crosshair" />}
      <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onPointerMove={onMove} onPointerLeave={clear} />
    </svg>
    {h && hover !== null && <div className="chart-tip" style={{ left: `${Math.min(72, Math.max(4, x(hover) / W * 100))}%` }}>
      <b>{monthLabel(h.month)}{h.inBaseline ? ' · baseline' : ''}</b>
      <span><i style={{ background: color }} />Actual {num(h.actual)} {stream.unit}</span>
      <span><i className="tip-expected" />Expected {num(h.expected)} {stream.unit}</span>
      <small>for {num(h.productionT)} t made · {h.gap > 0 ? '+' : ''}{num(h.gap / Math.max(1e-9, h.expected) * 100, 1)}% ({h.gapRM > 0 ? '+' : '−'}{ringgit(Math.abs(h.gapRM))})</small>
    </div>}
    <div className="legend"><span><i style={{ background: color }} />Actual</span><span><i className="legend-dash" />Expected</span><span><i className="legend-bad" />Over</span><span><i className="legend-good" />Under</span></div>
  </div>
}

export default function ExpectedVsActual({ baseline, productUnit }: { baseline: Baseline; productUnit: string }) {
  const [tab, setTab] = useState<Tab>('cusum')
  if (!baseline.available) return <section className="card eva">
    <header className="card-head"><div><h2>Expected vs actual</h2><p className="muted small">{baseline.reason}</p></div></header>
  </section>
  const { recent } = baseline
  const saved = recent.gapRM <= 0
  const pct = recent.expectedRM > 0 ? recent.gapRM / recent.expectedRM * 100 : 0
  const total = baseline.months.at(-1)?.cusumRM ?? 0
  const streams = baseline.streams
  const active = streams.find((s) => s.stream === tab)
  return <section className="card eva">
    <header className="card-head">
      <div><h2>Expected vs actual <Info>
        <b>Expected</b> = what the plant normally uses for the tonnes it made, learned from {monthLabel(baseline.from)} – {monthLabel(baseline.to)}.
        {streams.map((s) => { const q = fitQuality(s.fit); return <span key={s.stream} className="info-line">{s.stream === 'electricity' ? 'Electricity' : 'Fuel'}: {num(s.fit.fixed)} {s.unit}/month + {num(s.fit.perTonne * (s.unit === 'MWh' ? 1_000 : 1), s.unit === 'MWh' ? 0 : 2)} {s.unit === 'MWh' ? 'kWh' : 'GJ'}/t {productUnit} · {q.label} fit</span> })}
      </Info></h2><p className="muted small">Energy vs your normal, in RM</p></div>
      <div className="scope-tabs small" role="tablist" aria-label="Expected vs actual view">
        <button type="button" role="tab" aria-selected={tab === 'cusum'} className={tab === 'cusum' ? 'active' : ''} onClick={() => setTab('cusum')}>Running total</button>
        {streams.map((s) => <button key={s.stream} type="button" role="tab" aria-selected={tab === s.stream} className={tab === s.stream ? 'active' : ''} onClick={() => setTab(s.stream)}>{s.stream === 'electricity' ? 'Electricity' : 'Fuel'}</button>)}
      </div>
    </header>
    <div className="eva-grid">
      <div className="eva-side">
        <div className={`eva-verdict ${saved ? 'good' : 'bad'}`}>
          <span>Last {recent.months} months</span>
          <strong>{saved ? '▼' : '▲'} {ringgit(Math.abs(recent.gapRM))}</strong>
          <em>{saved ? 'saved' : 'overspent'} · {pct > 0 ? '+' : '−'}{num(Math.abs(pct), 1)}%</em>
        </div>
        <div className="eva-stat"><span>Since baseline</span><b className={total <= 0 ? 'good' : 'bad'}>{total <= 0 ? `${ringgit(-total)} saved` : `${ringgit(total)} lost`}</b></div>
        <div className="eva-stat"><span>Base load <Info>Energy used whatever the output: idling, leaks, lighting, cooling. Cutting it saves every month.</Info></span><b>{ringgit(baseline.fixedRMPerMonth)}/month</b></div>
      </div>
      <div>{tab === 'cusum' || !active ? <CusumChart baseline={baseline} /> : <StreamChart stream={active} />}</div>
    </div>
  </section>
}
