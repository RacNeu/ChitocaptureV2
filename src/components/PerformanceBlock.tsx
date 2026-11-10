import { num, tonnes } from '../format'
import type { Performance } from '../model/calc'

const statusText: Record<Performance['status'], string> = { 'on-target': 'On target', above: 'Above target', better: 'Better than target' }

export function performanceLabel(p: Performance) {
  return p.status === 'on-target' ? 'on target' : `${p.gapPct > 0 ? '+' : ''}${num(p.gapPct)}% vs target`
}

/** Energy per tonne against the machine's target, with the CO₂ at stake. */
export function PerformanceBlock({ performance: p }: { performance: Performance }) {
  const scaleMax = Math.max(p.actual, p.target) * 1.15
  return <div className={`perf ${p.status}`}>
    <div className="perf-head"><span>Energy per tonne</span><b className="perf-chip">{statusText[p.status]}</b></div>
    <div className="perf-track" role="img" aria-label={`${num(p.actual, p.unit === 'GJ/t' ? 2 : 0)} ${p.unit} against a target of ${num(p.target, p.unit === 'GJ/t' ? 2 : 0)} ${p.unit}`}>
      <span className="perf-fill" style={{ width: `${p.actual / scaleMax * 100}%` }} />
      <i className="perf-target" style={{ left: `${p.target / scaleMax * 100}%` }} />
    </div>
    <div className="perf-numbers">
      <span><b>{num(p.actual, p.unit === 'GJ/t' ? 2 : 0)}</b> {p.unit} now</span>
      <span>target <b>{num(p.target, p.unit === 'GJ/t' ? 2 : 0)}</b> {p.unit}</span>
    </div>
    {p.excessT > 0 && <p className="perf-stake">Bringing it to target would avoid about <b>{tonnes(p.excessT)} CO₂e a year</b>.</p>}
  </div>
}
