/** Small SVG charts for the dark melt-shop pages: sparkline KPI cards, trend with target, donut, ring, bars. */
import { useId, type ReactNode } from 'react'
import { num } from '../format'
import LineIcon from './LineIcon'

/** Older call sites pass emoji; they draw as the matching line icon. */
const iconFor: Record<string, string> = { '💰': 'coin', '☁': 'cloud', '🍃': 'leaf', '🎯': 'target', '⚡': 'bolt', '🏭': 'building', '🔥': 'furnace' }

const extent = (v: number[]) => { const lo = Math.min(...v), hi = Math.max(...v); return hi - lo < 1e-9 ? [lo - 1, hi + 1] : [lo, hi] }

export function Sparkline({ values, color = 'var(--sky)', height = 34 }: { values: number[]; color?: string; height?: number }) {
  const id = useId()
  if (values.length < 2) return null
  const [lo, hi] = extent(values), W = 120
  const pts = values.map((v, i) => [i / (values.length - 1) * W, height - 3 - (v - lo) / (hi - lo) * (height - 6)])
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return <svg className="ms-spark" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
    <polygon points={`0,${height} ${line} ${W},${height}`} fill={`url(#${id})`} className="fade-in" />
    <polyline points={line} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" pathLength={1} className="draw" />
  </svg>
}

/** KPI card: icon, label, the figure with its unit, change vs comparison, sparkline. `source` is the provenance tag every figure carries. */
export function Kpi({ icon, label, value, unit, delta, good, spark, color, info, source }: { icon?: string; label: string; value: string; unit?: string; delta?: string; good?: boolean; spark?: number[]; color?: string; info?: ReactNode; source?: string }) {
  return <div className="ms-kpi">
    {icon && <span className="ms-kpi-icon" aria-hidden="true" style={color ? { color, background: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}><LineIcon name={iconFor[icon] ?? icon} size={18} /></span>}
    <div className="ms-kpi-body">
      <span className="ms-kpi-label">{label}{info}{source && <span className="src-tag">{source}</span>}</span>
      <b className={`ms-kpi-value${/\d/.test(value) ? '' : ' word'}`}>{value}{unit && <small> {unit}</small>}</b>
      {delta && <span className={`ms-kpi-delta ${good === undefined ? '' : good ? 'good' : 'bad'}`}>{delta}</span>}
    </div>
    {spark && <Sparkline values={spark} color={color} />}
  </div>
}

export type Series = { label: string; values: (number | null)[]; color: string; dashed?: boolean; area?: boolean }

/** Line chart over categories (days or hours) with optional target line and shaded bands. */
export function TrendChart({ x, series, target, targetLabel, unit, height = 220, width = 640, bands, onPick }: { x: string[]; series: Series[]; target?: number; targetLabel?: string; unit?: string; height?: number; width?: number; bands?: { from: number; to: number; label?: string }[]; onPick?: (i: number) => void }) {
  const id = useId()
  const W = width, P = { l: 44, r: 12, t: 12, b: 24 }
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null)).concat(target !== undefined ? [target] : [])
  if (!all.length) return <p className="muted small">No data.</p>
  const [lo0, hi0] = extent(all), pad = (hi0 - lo0) * 0.12
  const lo = lo0 - pad, hi = hi0 + pad
  const X = (i: number) => P.l + i / Math.max(1, x.length - 1) * (W - P.l - P.r)
  const Y = (v: number) => P.t + (1 - (v - lo) / (hi - lo)) * (height - P.t - P.b)
  const ticks = Array.from({ length: 4 }, (_, k) => lo + (hi - lo) * (k + 0.5) / 4)
  const step = Math.max(1, Math.ceil(x.length / (W / 80)))
  return <svg className="ms-trend" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={series.map((s) => s.label).join(', ')}>
    {bands?.map((b, k) => <g key={k}><rect x={X(b.from)} y={P.t} width={Math.max(2, X(b.to) - X(b.from))} height={height - P.t - P.b} className="ms-band" />{b.label && k === 0 && <text x={X(b.from) + 4} y={P.t + 12} className="ms-axis">{b.label}</text>}</g>)}
    {ticks.map((t) => <g key={t}><line x1={P.l} x2={W - P.r} y1={Y(t)} y2={Y(t)} className="ms-grid" /><text x={P.l - 6} y={Y(t) + 4} textAnchor="end" className="ms-axis">{num(t, hi - lo < 10 ? 1 : 0)}</text></g>)}
    {x.map((l, i) => i % step === 0 && <text key={i} x={X(i)} y={height - 6} textAnchor="middle" className="ms-axis">{l}</text>)}
    {target !== undefined && <g><line x1={P.l} x2={W - P.r} y1={Y(target)} y2={Y(target)} className="ms-target" /><text x={W - P.r} y={Y(target) - 5} textAnchor="end" className="ms-axis target">{targetLabel ?? 'Target'} {num(target, 0)}{unit ? ` ${unit}` : ''}</text></g>}
    {series.map((s, k) => {
      const pts = s.values.map((v, i) => v === null ? null : [X(i), Y(v)] as const).filter((p): p is readonly [number, number] => p !== null)
      if (!pts.length) return null
      const line = pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
      return <g key={k}>
        {s.area && <><defs><linearGradient id={`${id}-${k}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient></defs>
          <polygon points={`${pts[0][0]},${height - P.b} ${line} ${pts[pts.length - 1][0]},${height - P.b}`} fill={`url(#${id}-${k})`} className="fade-in" /></>}
        <polyline points={line} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? '5 4' : undefined} className={s.dashed ? 'ms-line' : 'ms-line draw'} pathLength={s.dashed ? undefined : 1} />
        {k === 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="4" fill={s.color} className="ms-dot" />}
      </g>
    })}
    {onPick && x.map((_, i) => <rect key={i} x={X(i) - (W - P.l - P.r) / x.length / 2} y={P.t} width={(W - P.l - P.r) / x.length} height={height - P.t - P.b} fill="transparent" style={{ cursor: 'pointer' }} onClick={() => onPick(i)}><title>{x[i]}</title></rect>)}
  </svg>
}

/** Donut with a centre label. */
export function Donut({ parts, center, sub, size = 170 }: { parts: { label: string; value: number; color: string }[]; center: string; sub?: string; size?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  const r = 60, C = 2 * Math.PI * r
  let acc = 0
  return <svg className="ms-donut" viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={parts.map((p) => `${p.label} ${Math.round(p.value / total * 100)}%`).join(', ')}>
    <circle cx="80" cy="80" r={r} className="ms-ring-bg" strokeWidth="18" fill="none" />
    {parts.map((p) => { const len = p.value / total * C; const el = <circle key={p.label} cx="80" cy="80" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" />; acc += len; return el })}
    <text x="80" y="78" textAnchor="middle" className="ms-donut-big">{center}</text>
    {sub && <text x="80" y="98" textAnchor="middle" className="ms-axis">{sub}</text>}
  </svg>
}

/** Single-value ring (e.g. metallic yield). */
export function Ring({ pct, label, color = 'var(--green)', size = 150 }: { pct: number; label: string; color?: string; size?: number }) {
  const r = 58, C = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct))
  return <svg className="ms-donut" viewBox="0 0 160 160" width={size} height={size} role="img" aria-label={`${label} ${num(pct, 1)}%`}>
    <circle cx="80" cy="80" r={r} className="ms-ring-bg" strokeWidth="14" fill="none" />
    <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${v / 100 * C} ${C}`} transform="rotate(-90 80 80)" className="ms-ring-glow sweep" style={{ ['--len' as string]: `${v / 100 * C}` }} />
    <text x="80" y="84" textAnchor="middle" className="ms-donut-big">{num(pct, 1)}%</text>
    <text x="80" y="104" textAnchor="middle" className="ms-axis">{label}</text>
  </svg>
}

/** Horizontal bars with value labels; optional limit marker per row. */
export function HBars({ rows, unit, digits = 0 }: { rows: { label: string; value: number; color?: string; note?: string; limit?: number; max?: number }[]; unit?: string; digits?: number }) {
  const max = Math.max(...rows.map((r) => Math.max(r.max ?? 0, r.value, r.limit ?? 0)), 1e-9)
  return <div className="ms-hbars">{rows.map((r) => <div key={r.label} className="ms-hbar">
    <span className="ms-hbar-label">{r.label}</span>
    <span className="ms-hbar-track"><i style={{ width: `${r.value / max * 100}%`, background: r.color ?? 'var(--sky)' }} />{r.limit !== undefined && <em style={{ left: `${r.limit / max * 100}%` }} title={`Limit ${r.limit}`} />}</span>
    <b>{num(r.value, digits)}{unit ? ` ${unit}` : ''}</b>
    {r.note && <small>{r.note}</small>}
  </div>)}</div>
}

/** Stacked vertical bars (e.g. daily Scope 1 + Scope 2). */
export function StackBars({ x, stacks, height = 200, width = 640, unit }: { x: string[]; stacks: { label: string; values: number[]; color: string }[]; height?: number; width?: number; unit?: string }) {
  const W = width, P = { l: 44, r: 8, t: 10, b: 24 }
  const totals = x.map((_, i) => stacks.reduce((a, s) => a + (s.values[i] ?? 0), 0))
  const hi = Math.max(...totals, 1e-9) * 1.1
  const bw = (W - P.l - P.r) / x.length
  const Y = (v: number) => (v / hi) * (height - P.t - P.b)
  const step = Math.max(1, Math.ceil(x.length / 8))
  return <svg className="ms-trend" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={stacks.map((s) => s.label).join(', ')}>
    {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1={P.l} x2={W - P.r} y1={height - P.b - Y(hi * f)} y2={height - P.b - Y(hi * f)} className="ms-grid" /><text x={P.l - 6} y={height - P.b - Y(hi * f) + 4} textAnchor="end" className="ms-axis">{num(hi * f, 0)}</text></g>)}
    {x.map((l, i) => { let y0 = height - P.b; return <g key={i}>
      {stacks.map((s) => { const h = Y(s.values[i] ?? 0); y0 -= h; return <rect key={s.label} x={P.l + i * bw + bw * 0.18} y={y0} width={bw * 0.64} height={Math.max(0, h)} rx="2" fill={s.color} className="grow-up" style={{ animationDelay: `${i * 25}ms` }}><title>{`${l} · ${s.label}: ${num(s.values[i] ?? 0, 0)}${unit ? ` ${unit}` : ''}`}</title></rect> })}
      {i % step === 0 && <text x={P.l + i * bw + bw / 2} y={height - 6} textAnchor="middle" className="ms-axis">{l}</text>}
    </g> })}
  </svg>
}

export const Legend = ({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) =>
  <div className="ms-legend">{items.map((i) => <span key={i.label}><i style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} className={i.dashed ? 'dashed' : ''} />{i.label}</span>)}</div>
