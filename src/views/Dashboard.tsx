import LineIcon from '../components/LineIcon'
import { useMemo, useState, type ReactNode } from 'react'
import { Sparkline } from '../components/Charts'
import ExpectedVsActual from '../components/ExpectedVsActual'
import Info from '../components/Info'
import EmptyState from '../components/EmptyState'
import { num, ringgit, tonnes } from '../format'
import { defaultTaxInputs, type RateCase, type TaxInputs } from '../model/carbonTax'
import { fuelFactorsKgPerGJ, fuelLabels, gridFactor } from '../model/factors'
import { fuels, historyFor, monthIndex, monthLabel, type ForecastMonth, type MonthScopes } from '../model/history'
import { outlook } from '../model/outlook'
import { siteFindings } from '../model/findings'
import { actions, useFactory } from '../model/store'

type Mode = 'total' | 'scope1' | 'scope2'
const modeLabel: Record<Mode, string> = { total: 'Total (Scope 1 + 2)', scope1: 'Scope 1', scope2: 'Scope 2' }

/** Validated categorical slots (dataviz reference palette): orange for Scope 1, blue for Scope 2. */
const C = { scope1: 'var(--series-s1)', scope2: 'var(--series-s2)', total: 'var(--series-total)' }

const pct = (now: number, before: number) => before > 0 ? (now / before - 1) * 100 : null

function Change({ now, before }: { now: number; before: number | null | undefined }) {
  const change = before ? pct(now, before) : null
  if (change === null) return <em className="kpi-change muted">no prior year</em>
  const down = change < 0
  return <em className={`kpi-change ${down ? 'good' : 'bad'}`}><span aria-hidden="true">{down ? '▼' : '▲'}</span> {num(Math.abs(change), 1)}% vs prior 12 months</em>
}

function Kpi({ label, value, unit, spark, color, children, active, onClick }: { label: string; value: string; unit: string; spark: number[]; color: string; children?: ReactNode; active?: boolean; onClick?: () => void }) {
  return <button type="button" className={`dash-kpi${active ? ' active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="dash-kpi-label"><i style={{ background: color }} />{label}</span>
    <strong>{value} <small>{unit}</small></strong>
    {children}
    <Sparkline values={spark} height={40} width={160} className="dash-spark" />
  </button>
}

/* ---------------- Monthly chart with forecast ---------------- */

function MonthlyChart({ actual, projected, mode, flagged }: { actual: MonthScopes[]; projected: ForecastMonth[]; mode: Mode; flagged: Set<string> }) {
  const [hover, setHover] = useState<number | null>(null)
  const ahead = projected.slice(0, 12)
  const width = 760, height = 290, left = 56, right = 14, top = 14, bottom = 30
  const all = [...actual.map((m) => ({ month: m.month, s1: m.scope1T, s2: m.scope2T, total: m.totalT, low: null as number | null, high: null as number | null, forecast: false })),
    ...ahead.map((m) => ({ month: m.month, s1: m.scope1T, s2: m.scope2T, total: m.totalT, low: m.lowT, high: m.highT, forecast: true }))]
  if (all.length < 2) return <div className="chart-empty">Upload at least two months to see the trend.</div>
  // In a scope view the band is the total band scaled to that scope's share.
  const pick = (row: typeof all[number]) => mode === 'total' ? row.total : mode === 'scope1' ? row.s1 : row.s2
  const band = (row: typeof all[number], value: number | null) => value === null ? null : mode === 'total' ? value : value * pick(row) / Math.max(1e-9, row.total)
  const max = Math.max(...all.map((row) => mode === 'total' ? Math.max(row.total, row.high ?? 0) : Math.max(pick(row), band(row, row.high) ?? 0))) * 1.08
  const x = (i: number) => left + i / (all.length - 1) * (width - left - right)
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom)
  const split = actual.length - 1
  const path = (values: (number | null)[], from: number, to: number) => values.slice(from, to + 1).map((v, k) => v === null ? '' : `${k === 0 ? 'M' : 'L'}${x(from + k).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const lines: { key: string; color: string; values: number[]; label: string }[] = mode === 'total'
    ? [{ key: 'total', color: C.total, values: all.map((r) => r.total), label: 'Total' }, { key: 's1', color: C.scope1, values: all.map((r) => r.s1), label: 'Scope 1' }, { key: 's2', color: C.scope2, values: all.map((r) => r.s2), label: 'Scope 2' }]
    : [{ key: mode, color: mode === 'scope1' ? C.scope1 : C.scope2, values: all.map(pick), label: modeLabel[mode] }]
  const bandTop = all.map((row, i) => i < split ? null : i === split ? pick(row) : band(row, row.high))
  const bandBottom = all.map((row, i) => i < split ? null : i === split ? pick(row) : band(row, row.low))
  const bandPath = bandTop.map((v, i) => v === null ? '' : `${i === split ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ') + ' ' + [...bandBottom.keys()].reverse().map((i) => bandBottom[i] === null ? '' : `L${x(i)},${y(bandBottom[i]!)}`).join(' ') + ' Z'
  const ticks = all.map((row, i) => ({ row, i })).filter(({ row }) => row.month.endsWith('-01') || row.month.endsWith('-07'))
  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect()
    const vx = (event.clientX - box.left) / box.width * width
    setHover(Math.max(0, Math.min(all.length - 1, Math.round((vx - left) / (width - left - right) * (all.length - 1)))))
  }
  const h = hover !== null ? all[hover] : null
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Monthly ${modeLabel[mode]} emissions, actual and forecast`}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={left} x2={width - right} y1={y(max * f)} y2={y(max * f)} className="chart-grid" /><text x={left - 8} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{tonnes(max * f)}</text></g>)}
      {ticks.map(({ row, i }) => <text key={row.month} x={x(i)} y={height - 10} textAnchor="middle" className="chart-tick">{monthLabel(row.month)}</text>)}
      <rect x={x(split)} y={top} width={width - right - x(split)} height={height - top - bottom} className="forecast-zone" />
      <text x={x(split) + 6} y={top + 12} className="chart-tick">Forecast →</text>
      <path d={bandPath} className="forecast-band" />
      {lines.map((line) => <g key={line.key}>
        <path d={path(line.values, 0, split)} fill="none" stroke={line.color} strokeWidth={line.key === 'total' ? 2.5 : 2} strokeLinejoin="round" />
        <path d={path(line.values, split, all.length - 1)} fill="none" stroke={line.color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" />
      </g>)}
      {all.map((row, i) => flagged.has(row.month) && !row.forecast ? <g key={row.month}><circle cx={x(i)} cy={y(pick(row))} r={6} className="anomaly-dot" /><text x={x(i)} y={y(pick(row)) - 10} textAnchor="middle" className="anomaly-mark">!</text></g> : null)}
      {h && hover !== null && <g pointerEvents="none">
        <line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} className="crosshair" />
        {lines.map((line) => <circle key={line.key} cx={x(hover)} cy={y(line.values[hover])} r={4} fill={line.color} stroke="var(--panel)" strokeWidth={2} />)}
      </g>}
      <rect x={left} y={top} width={width - left - right} height={height - top - bottom} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
    </svg>
    {h && hover !== null && <div className="chart-tip" style={{ left: `${Math.min(78, Math.max(4, x(hover) / width * 100))}%` }}>
      <b>{monthLabel(h.month)}{h.forecast ? ' · forecast' : ''}</b>
      {mode !== 'scope2' && <span><i style={{ background: C.scope1 }} />Scope 1 {tonnes(h.s1)}</span>}
      {mode !== 'scope1' && <span><i style={{ background: C.scope2 }} />Scope 2 {tonnes(h.s2)}</span>}
      {mode === 'total' && <span><i style={{ background: C.total }} />Total {tonnes(h.total)}</span>}
      {h.forecast && h.low !== null && <small>80% range {tonnes(band(h, h.low)!)} – {tonnes(band(h, h.high)!)}</small>}
      {flagged.has(h.month) && !h.forecast && <small className="tip-flag">⚠ Unusual month</small>}
    </div>}
    <div className="legend">
      {lines.map((line) => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}
      <span><i className="legend-dash" />Forecast</span><span><i className="legend-band" />80% range</span>
      {flagged.size > 0 && <span><i className="legend-flag" />Unusual month</span>}
    </div>
  </div>
}

/* ---------------- Target vs actual ---------------- */

function TargetChart({ rows, target }: { rows: { year: number; value: number; forecast: boolean; partial: boolean }[]; target: { year: number; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null)
  if (!rows.length) return <div className="chart-empty">Not enough data yet.</div>
  const width = 360, height = 260, left = 48, right = 8, top = 12, bottom = 26
  const max = Math.max(...rows.map((r) => r.value), ...target.map((t) => t.value)) * 1.1
  const slot = (width - left - right) / rows.length
  const bw = Math.min(26, slot * 0.6)
  const x = (i: number) => left + slot * i + slot / 2
  const y = (v: number) => top + (1 - v / max) * (height - top - bottom)
  const tPoints = target.map((t) => { const i = rows.findIndex((r) => r.year === t.year); return i >= 0 ? `${x(i)},${y(t.value)}` : '' }).filter(Boolean).join(' ')
  return <div className="mchart">
    <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Yearly emissions against the target path">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={left} x2={width - right} y1={y(max * f)} y2={y(max * f)} className="chart-grid" /><text x={left - 6} y={y(max * f) + 4} textAnchor="end" className="chart-tick">{tonnes(max * f)}</text></g>)}
      {rows.map((r, i) => <g key={r.year} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
        <rect x={x(i) - slot / 2} y={top} width={slot} height={height - top - bottom} fill="transparent" />
        <path d={`M${x(i) - bw / 2},${y(0)} V${y(r.value) + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 V${y(0)} Z`} className={r.forecast ? 'bar-forecast' : 'bar-actual'} />
        <text x={x(i)} y={height - 8} textAnchor="middle" className="chart-tick">{r.year}{r.partial ? '*' : ''}</text>
      </g>)}
      {tPoints && <polyline points={tPoints} className="target-line" />}
      {target.length > 0 && (() => { const last = target[target.length - 1]; const i = rows.findIndex((r) => r.year === last.year); return i >= 0 ? <text x={x(i)} y={y(last.value) - 8} textAnchor="end" className="chart-note">Target</text> : null })()}
    </svg>
    {hover !== null && <div className="chart-tip" style={{ left: `${Math.min(60, x(hover) / width * 100)}%` }}>
      <b>{rows[hover].year} · {rows[hover].forecast ? 'forecast' : rows[hover].partial ? 'actual + forecast' : 'actual'}</b>
      <span>{tonnes(rows[hover].value)}</span>
      {target.find((t) => t.year === rows[hover].year) && <small>Target path {tonnes(target.find((t) => t.year === rows[hover].year)!.value)}</small>}
    </div>}
    <div className="legend"><span><i className="legend-actual" />Actual</span><span><i className="legend-forecast" />Forecast</span><span><i className="legend-target" />Target path</span></div>
  </div>
}

/* ---------------- Page ---------------- */

export default function Dashboard({ onUpload, onReport, onFindings }: { onUpload: () => void; onReport: () => void; onFindings: () => void }) {
  const state = useFactory()
  const tax: TaxInputs = { ...defaultTaxInputs, ...state.settings.carbonTax }
  const view = useMemo(() => outlook(state, tax), [state, tax.rateCase, tax.rmPerSGD, tax.coverage, tax.exemptShare]) // eslint-disable-line react-hooks/exhaustive-deps
  const [mode, setMode] = useState<Mode>('total')
  const [period, setPeriod] = useState<string>('last12')
  const setTax = (patch: Partial<TaxInputs>) => actions.updateSettings({ carbonTax: { ...tax, ...patch } })
  const { records } = historyFor(state)
  const found = useMemo(() => siteFindings(state).findings.filter((f) => f.state.status !== 'fixed' && f.state.status !== 'dismissed'), [state])

  if (view.empty) return <div className="dashboard">
    <header className="dash-head"><div><h1>Emissions</h1><p className="muted">{state.settings.factoryName} · Scope 1 & 2</p></div></header>
    <EmptyState icon="chart" title="No data yet" action={<button type="button" className="btn" onClick={onUpload}>Upload monthly bills</button>}>Upload 12+ months of electricity bills, fuel invoices and production to see Scope 1 & 2, the forecast and your carbon tax.</EmptyState>
    {found.length > 0 && <button type="button" className="findings-strip" onClick={onFindings}><span className="strip-flag" aria-hidden="true"><LineIcon name="plan" /></span><span><b>{found.length} {found.length === 1 ? 'way' : 'ways'} to save{found.some((f) => f.rmPerMonth > 0) ? ` ${ringgit(found.reduce((s, f) => s + f.rmPerMonth, 0))}/month` : ''}</b><small>From your half-hourly data</small></span><span className="strip-go">View →</span></button>}
  </div>

  const fullYears = view.years.filter((y) => y.actualMonths === 12)
  const periodMonths = period === 'last12' ? view.months.slice(-12) : view.months.filter((m) => m.month.startsWith(period))
  const priorMonths = period === 'last12' ? (view.months.length >= 24 ? view.months.slice(-24, -12) : []) : view.months.filter((m) => m.month.startsWith(String(Number(period) - 1)))
  const sum = (items: MonthScopes[], key: 'scope1T' | 'scope2T' | 'totalT' | 'productionT') => items.reduce((s, m) => s + m[key], 0)
  const prior = (key: 'scope1T' | 'scope2T' | 'totalT') => priorMonths.length === periodMonths.length && priorMonths.length ? sum(priorMonths, key) : null
  const s1 = sum(periodMonths, 'scope1T'), s2 = sum(periodMonths, 'scope2T'), total = s1 + s2, production = sum(periodMonths, 'productionT')
  const s2Market = periodMonths.reduce((s, m) => s + m.scope2MarketT, 0), green = periodMonths.reduce((s, m) => s + m.greenMWh, 0)
  const sumMWh = periodMonths.reduce((s, m) => s + m.scope2T, 0) / Math.max(1e-9, gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh))
  const spark = (key: 'scope1T' | 'scope2T' | 'totalT') =>view.months.slice(-24).map((m) => m[key])
  const lastYear = Number(view.months.at(-1)?.month.slice(0, 4) ?? new Date().getFullYear())
  const nextTax = view.tax.find((t) => t.year === lastYear + 1) ?? view.tax.find((t) => t.year > lastYear)
  const flagged = new Set(view.anomalies.map((a) => a.month))
  const periodLabel = period === 'last12' ? `${monthLabel(view.last12.from)} – ${monthLabel(view.last12.to)}` : period

  // Scope breakdown for the period, by source.
  const periodRecords = records.filter((r) => periodMonths.some((m) => m.month === r.month))
  const grid = gridFactor(state.settings.gridRegionId, state.settings.customGridKgPerKWh)
  const sources = [
    ...fuels.map((fuel) => ({ scope: 1, label: `${fuelLabels[fuel]} combustion`, t: periodRecords.reduce((s, r) => s + (r.fuelGJ[fuel] ?? 0) * fuelFactorsKgPerGJ[fuel] / 1_000, 0) })),
    { scope: 1, label: 'Process (electrodes & carbon)', t: periodRecords.reduce((s, r) => s + r.processT, 0) },
    { scope: 2, label: `Purchased electricity (TNB grid, ${num(grid, 3)} kg/kWh)`, t: periodRecords.reduce((s, r) => s + r.electricityMWh * grid, 0) },
  ].filter((item) => item.t > 0.5).sort((a, b) => b.t - a.t)
  const biomassGJ = periodRecords.reduce((s, r) => s + (r.fuelGJ.biomass ?? 0), 0)

  // Target vs actual rows, from the baseline year to the target year.
  const t = view.target
  const span = Math.max(1, t.targetYear - t.baselineYear)
  const targetRows = view.years.filter((y) => y.year >= t.baselineYear && y.year <= t.targetYear && y.months === 12)
    .map((y) => ({ year: y.year, value: y.totalT, forecast: y.actualMonths === 0, partial: y.actualMonths > 0 && y.actualMonths < 12 }))
  const baseYear = view.years.find((y) => y.year === t.baselineYear)
  const targetPath = baseYear ? targetRows.map((row) => {
    const entry = view.years.find((y) => y.year === row.year)!
    const share = state.settings.targetReductionPct / 100 * Math.min(1, (row.year - t.baselineYear) / span)
    const base = t.basis === 'intensity' ? baseYear.totalT / Math.max(1, baseYear.productionT) * entry.productionT : baseYear.totalT * 12 / Math.max(1, baseYear.months)
    return { year: row.year, value: base * (1 - share) }
  }) : []

  const drivers = view.forecast.drivers
  const stale = monthIndex(view.months.at(-1)?.month ?? '2025-01') < monthIndex(new Date().toISOString().slice(0, 7)) - 3

  return <div className="dashboard">
    <header className="dash-head">
      <div>
        <h1>Emissions</h1>
        <p className="muted">{state.settings.factoryName} · Scope 1 & 2 <Info>Greenhouse gas emissions in tonnes of CO₂e, GHG Protocol. Scope 1: fuel burnt on site and process emissions. Scope 2: grid electricity (location-based).</Info></p>
      </div>
      <div className="dash-actions">
        <label className="field inline"><span className="sr-only">Period</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            <option value="last12">Last 12 months</option>
            {fullYears.slice().reverse().map((y) => <option key={y.year} value={String(y.year)}>{y.year}</option>)}
          </select>
        </label>
        <button type="button" className="btn ghost" onClick={onUpload}>⇪ Upload data</button>
        <button type="button" className="btn" onClick={onReport}>⤓ Report</button>
      </div>
    </header>

    {stale && <div className="sample-banner">Latest month is over 3 months old · <button type="button" className="link" onClick={onUpload}>Upload recent bills</button></div>}

    <div className="scope-tabs" role="tablist" aria-label="Emissions view">
      {(Object.keys(modeLabel) as Mode[]).map((key) => <button key={key} type="button" role="tab" aria-selected={mode === key} className={mode === key ? 'active' : ''} onClick={() => setMode(key)}>{modeLabel[key]}</button>)}
    </div>

    <div className="dash-kpis">
      <Kpi label="Total · Scope 1 + 2" value={num(total)} unit="tCO₂e" spark={spark('totalT')} color={C.total} active={mode === 'total'} onClick={() => setMode('total')}>
        <Change now={total} before={prior('totalT')} />
        <small className="muted">{periodLabel}{production > 0 ? ` · ${num(total / production * 1_000)} kg/t` : ''}</small>
      </Kpi>
      <Kpi label="Scope 1 · fuel & process" value={num(s1)} unit="tCO₂e" spark={spark('scope1T')} color={C.scope1} active={mode === 'scope1'} onClick={() => setMode('scope1')}>
        <Change now={s1} before={prior('scope1T')} />
        <small className="muted">{num(s1 / Math.max(1e-9, total) * 100)}% of total</small>
      </Kpi>
      <Kpi label="Scope 2 · electricity" value={num(s2)} unit="tCO₂e" spark={spark('scope2T')} color={C.scope2} active={mode === 'scope2'} onClick={() => setMode('scope2')}>
        <Change now={s2} before={prior('scope2T')} />
        <small className="muted">{num(s2 / Math.max(1e-9, total) * 100)}% of total · location-based</small>
        {s2Market < s2 - 0.5 && <small className="muted">Market-based {num(s2Market)} t · {num(green / Math.max(1e-9, sumMWh) * 100)}% green electricity</small>}
      </Kpi>
      <a className="dash-kpi tax-kpi" href="#tax">
        <span className="dash-kpi-label">Carbon tax {nextTax?.year ?? ''}</span>
        <strong>{nextTax ? ringgit(nextTax.billRM) : '—'}</strong>
        {nextTax && <small className="muted">RM {num(nextTax.rmPerT)}/t · estimate ↓</small>}
      </a>
    </div>

    {found.length > 0 && <button type="button" className="findings-strip" onClick={onFindings}>
      <span className="strip-flag" aria-hidden="true"><LineIcon name="plan" /></span>
      <span><b>{found.length} {found.length === 1 ? 'way' : 'ways'} to save{found.some((f) => f.rmPerMonth > 0) ? ` ${ringgit(found.reduce((s, f) => s + f.rmPerMonth, 0))}/month` : ''}</b><small>Top: {found[0].title}</small></span>
      <span className="strip-go">View →</span>
    </button>}

    <ExpectedVsActual baseline={view.baseline} productUnit={state.settings.productUnit} />

    <div className="dash-grid">
      <section className="card">
        <header className="card-head"><div><h2>Monthly emissions <Info label="How the forecast works">
          <b>Forecast = production × emissions per tonne.</b> Production follows its trend and seasonal pattern; emissions per tonne follow their own trend. Shaded band: 80% likely range. Planned actions are not included.
          {drivers.scope1KgPerT !== null && <><br />Production {drivers.productionGrowthPctPerYear! >= 0 ? '+' : ''}{num(drivers.productionGrowthPctPerYear!, 1)}%/yr · Scope 1 {num(drivers.scope1KgPerT!)} kg/t · Scope 2 {num(drivers.scope2KgPerT!)} kg/t · per-tonne trend {drivers.intensityChangePctPerYear! >= 0 ? '+' : ''}{num(drivers.intensityChangePctPerYear!, 1)}%/yr</>}
        </Info></h2><p className="muted small">Actual + 12-month forecast</p></div></header>
        <MonthlyChart actual={view.months} projected={view.forecast.months} mode={mode} flagged={flagged} />
      </section>
      <section className="card">
        <header className="card-head"><div><h2>Target <Info>Your goal from Settings: −{state.settings.targetReductionPct}% {t.basis === 'intensity' ? 'per tonne of product' : 'in total'} from {t.baselineYear} to {t.targetYear}. Bars: actual (dark) and forecast (light). Dashed line: where you need to be. * = part forecast.</Info></h2><p className="muted small">−{state.settings.targetReductionPct}% by {t.targetYear}</p></div></header>
        <div className={`track-status ${t.onTrack === null ? '' : t.onTrack ? 'good' : 'bad'}`}>
          {t.onTrack === null ? 'Not enough data yet'
            : t.onTrack ? <b>✓ On track</b>
              : <><b>⚠ Off track</b> · {tonnes(t.gapT ?? 0)}/yr gap in {t.targetYear}</>}
        </div>
        <TargetChart rows={targetRows} target={targetPath} />
      </section>
    </div>

    <div className="dash-grid even">
      <section className="card">
        <header className="card-head"><div><h2>Sources</h2><p className="muted small">{periodLabel}</p></div></header>
        <ul className="source-bars">
          {sources.map((item) => <li key={item.label}>
            <div className="source-row"><span><span className={`scope-chip s${item.scope}`}>S{item.scope}</span>{item.label}</span><b>{tonnes(item.t)}</b></div>
            <div className="sharebar"><span style={{ width: `${item.t / Math.max(1e-9, total) * 100}%`, background: item.scope === 1 ? C.scope1 : C.scope2 }} /></div>
          </li>)}
        </ul>
        {biomassGJ > 0 && <p className="muted small">Biomass CO₂ reported separately.</p>}
      </section>
      <section className="card">
        <header className="card-head"><div><h2>Unusual months <Info>Months whose energy per tonne is far from the site’s typical month.</Info></h2></div></header>
        {view.anomalies.length === 0 ? <p className="muted">None found ✓</p>
          : <ul className="anomaly-list">{view.anomalies.slice(0, 4).map((a) => <li key={`${a.month}-${a.metric}`}>
            <span className={`flag ${a.direction}`} aria-hidden="true">{a.direction === 'high' ? '▲' : '▼'}</span>
            <div><b>{monthLabel(a.month)} · {a.metric} {a.direction === 'high' ? '+' : ''}{num((a.value / a.expected - 1) * 100)}%</b>
              <small className="muted">{a.hint}</small></div>
          </li>)}</ul>}
      </section>
    </div>

    <section className="card tax-card" id="tax">
      <header className="card-head"><div><h2>Carbon tax <Info>Malaysia has not set its rate yet. This uses Singapore’s published path (S$25 → S$45 → S$50–80 by 2030), converted to ringgit, on your actual and forecast emissions. Replace it when Malaysia publishes its rate.</Info></h2><p className="muted small">Estimate · Singapore rate as reference</p></div></header>
      <div className="tax-grid">
        <div className="form-grid compact">
          <label className="field">2030 rate
            <select value={tax.rateCase} onChange={(event) => setTax({ rateCase: event.target.value as RateCase })}>
              <option value="low">Low · S$50/t</option><option value="mid">Mid · S$65/t</option><option value="high">High · S$80/t</option>
            </select></label>
          <label className="field">RM per S$<input type="number" min="0" step="0.05" value={tax.rmPerSGD} onChange={(event) => setTax({ rmPerSGD: Number(event.target.value) })} /></label>
          <label className="field">Taxed
            <select value={tax.coverage} onChange={(event) => setTax({ coverage: event.target.value as TaxInputs['coverage'] })}>
              <option value="scope1">Scope 1</option><option value="scope1and2">Scope 1 + 2</option>
            </select></label>
          <label className="field">Exempt share <output>{num(tax.exemptShare * 100)}%</output><input type="range" min="0" max="0.9" step="0.05" value={tax.exemptShare} onChange={(event) => setTax({ exemptShare: Number(event.target.value) })} /></label>
        </div>
        <div className="table-wrap"><table className="grid-table">
          <thead><tr><th>Year</th><th className="num">Rate</th><th className="num">Taxed</th><th className="num">Bill</th><th /></tr></thead>
          <tbody>{view.tax.filter((row) => row.year >= new Date().getFullYear() && row.year <= 2030).map((row) => {
            const y = view.years.find((item) => item.year === row.year)!
            return <tr key={row.year}>
              <td>{row.year}</td>
              <td className="num">RM {num(row.rmPerT)}/t</td>
              <td className="num">{tonnes(row.taxableT)}</td>
              <td className="num"><b>{ringgit(row.billRM)}</b></td>
              <td className="muted small">{y.actualMonths === 12 ? 'actual' : y.actualMonths > 0 ? 'part forecast' : 'forecast'}</td>
            </tr>
          })}</tbody>
        </table></div>
      </div>
    </section>
  </div>
}
