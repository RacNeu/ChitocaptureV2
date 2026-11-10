import { num, tonnes } from '../format'

export function Sparkline({ values, width = 260, height = 60, className = '' }: { values: number[]; width?: number; height?: number; className?: string }) {
  if (values.length < 2) return <svg className={`spark ${className}`} viewBox={`0 0 ${width} ${height}`} />
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1
  const points = values.map((value, index) => `${index / (values.length - 1) * width},${height - 4 - (value - min) / span * (height - 8)}`)
  return <svg className={`spark ${className}`} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
    <polyline points={`0,${height} ${points.join(' ')} ${width},${height}`} className="spark-fill" />
    <polyline points={points.join(' ')} className="spark-line" />
  </svg>
}

/** Semi-circular gauge for a CO₂ reading. */
export function Gauge({ value, max, label, unit = 'ppm' }: { value: number | null; max: number; label: string; unit?: string }) {
  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value / max))
  const angle = Math.PI * (1 - fraction)
  const x = 100 + 80 * Math.cos(angle), y = 100 - 80 * Math.sin(angle)
  const tone = fraction < 0.4 ? 'ok' : fraction < 0.75 ? 'warn' : 'hot'
  return <figure className={`gauge ${tone}`}>
    <svg viewBox="0 0 200 115" role="img" aria-label={`${label}: ${value === null ? 'no reading' : `${num(value)} ${unit}`}`}>
      <path d="M20 100 A80 80 0 0 1 180 100" className="gauge-track" />
      {value !== null && <path d={`M20 100 A80 80 0 0 1 ${x} ${y}`} className="gauge-value" />}
      <text x="100" y="88" textAnchor="middle" className="gauge-number">{value === null ? '—' : num(value)}</text>
      <text x="100" y="108" textAnchor="middle" className="gauge-unit">{unit}</text>
    </svg>
    <figcaption>{label}</figcaption>
  </figure>
}

type Series = { label: string; values: number[]; className: string; dashed?: boolean }

export function LineChart({ labels, series, height = 240, yLabel }: { labels: (string | number)[]; series: Series[]; height?: number; yLabel: string }) {
  const width = 640, left = 64, right = 16, top = 16, bottom = 32
  const all = series.flatMap((item) => item.values)
  const hi = Math.max(1, ...all), lo = Math.min(...all)
  // Zoom to the data so year-on-year changes are visible; tick labels show the real values.
  const max = hi + (hi - lo) * 0.15 + 1e-9, min = Math.max(0, lo - (hi - lo) * 0.4)
  const x = (index: number) => left + index / Math.max(1, labels.length - 1) * (width - left - right)
  const y = (value: number) => top + (max - value) / (max - min) * (height - top - bottom)
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={yLabel}>
    {[0, 0.25, 0.5, 0.75, 1].map((f) => { const value = min + (max - min) * f; return <g key={f}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-tick">{tonnes(value)}</text></g> })}
    {labels.map((label, index) => <text key={label} x={x(index)} y={height - 10} textAnchor="middle" className="chart-tick">{label}</text>)}
    {series.map((item) => <g key={item.label} className={item.className}>
      <polyline points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(' ')} className={`chart-line${item.dashed ? ' dashed' : ''}`} />
      {item.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r="3.5" className="chart-dot"><title>{`${item.label} ${labels[index]}: ${tonnes(value)}`}</title></circle>)}
    </g>)}
  </svg>
}

export type WaterfallStep = { label: string; value: number; kind: 'start' | 'cut' | 'end' | 'target' }

/** Baseline → each cut → result, with the target as a reference line. */
export function Waterfall({ steps, target }: { steps: WaterfallStep[]; target: number }) {
  const width = 640, height = 260, left = 64, right = 12, top = 22, bottom = 70
  const start = steps.find((step) => step.kind === 'start')?.value ?? 0
  const end = steps.find((step) => step.kind === 'end')?.value ?? start
  const max = Math.max(start, target) * 1.03 || 1
  // Zoom in on the range that changes; the axis says where it starts, so nothing is hidden.
  const floor = Math.max(0, Math.min(end, target) - (max - Math.min(end, target)) * 0.35)
  const slot = (width - left - right) / Math.max(1, steps.length)
  const y = (value: number) => top + (max - Math.max(floor, value)) / (max - floor) * (height - top - bottom)
  let running = 0
  return <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Waterfall from baseline emissions through each planned cut to the result">
    {[0, 0.5, 1].map((f) => { const value = floor + (max - floor) * f; return <g key={f}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="chart-grid" /><text x={left - 8} y={y(value) + 4} textAnchor="end" className="chart-tick">{tonnes(value)}</text></g> })}
    {floor > 0 && <text x={left} y={10} className="chart-tick">axis starts at {tonnes(floor)}</text>}
    {steps.map((step, index) => {
      let from: number, to: number
      if (step.kind === 'start') { from = floor; to = step.value; running = step.value }
      else if (step.kind === 'cut') { from = running - step.value; to = running; running -= step.value }
      else { from = floor; to = step.value }
      const x = left + index * slot + slot * 0.18
      return <g key={`${step.label}-${index}`} className={`wf-${step.kind}`}>
        <rect x={x} y={y(to)} width={slot * 0.64} height={Math.max(1.5, y(from) - y(to))} rx="3"><title>{`${step.label}: ${step.kind === 'cut' ? '−' : ''}${tonnes(step.value)}`}</title></rect>
        <text x={x + slot * 0.32} y={height - bottom + 14} textAnchor="end" transform={`rotate(-35 ${x + slot * 0.32} ${height - bottom + 14})`} className="chart-tick">{step.label.length > 16 ? `${step.label.slice(0, 15)}…` : step.label}</text>
      </g>
    })}
    <line x1={left} x2={width - right} y1={y(target)} y2={y(target)} className="wf-target-line" />
    <text x={width - right} y={y(target) - 6} textAnchor="end" className="chart-note">Target {tonnes(target)}</text>
  </svg>
}
