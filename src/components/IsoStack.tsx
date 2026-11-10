import { useState } from 'react'
import { num, tonnes } from '../format'
import type { Machine } from '../model/types'

export type StackSegment = { key: 'electricity' | 'fuel' | 'process'; label: string; value: number }
export type StackItem = { machine: Machine; segments: StackSegment[]; total: number; before?: number }

/** Light (top) and dark (bottom) tones per cause, used for vertical gradients on each face. */
const tones: Record<StackSegment['key'], { light: string; mid: string; dark: string }> = {
  electricity: { light: '#7dd3fc', mid: '#0ea5e9', dark: '#0369a1' },
  fuel: { light: '#fcd34d', mid: '#f59e0b', dark: '#b45309' },
  process: { light: '#fda4af', mid: '#e11d48', dark: '#9f1239' },
}

const TILE_W = 120
const TILE_H = 60
const MAX_H = 270
const W = TILE_W * 0.34
const D = TILE_H * 0.34

/**
 * Ranked isometric skyline of emission sources. Towers are stacked by cause and lit with
 * gradients; they grow in on load. Heights use a square-root scale so small sources remain
 * visible next to a dominant one; exact values are printed on every tower.
 */
export default function IsoStack({ items, onSelect }: { items: StackItem[]; onSelect?: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const ranked = [...items].sort((a, b) => b.total - a.total)
  const maxT = Math.max(1, ...ranked.map((item) => Math.max(item.total, item.before ?? 0)))
  const grand = ranked.reduce((sum, item) => sum + item.total, 0) || 1
  const scale = (t: number) => t <= 0 ? 0 : 6 + (MAX_H - 6) * Math.sqrt(t / maxT)
  const step = ranked.length > 9 ? 0.5 : 0.64
  const pos = (index: number) => ({ x: index * TILE_W * step, y: index * TILE_H * step })
  const last = pos(Math.max(0, ranked.length - 1))
  const minX = -TILE_W * 1.2, maxX = last.x + TILE_W * 2.6
  const minY = -MAX_H - 40, maxY = last.y + TILE_H * 1.6

  // Floor diamond under the whole row, with grid lines.
  const floor = (dx: number, dy: number) => `${dx},${dy}`
  const fx0 = -TILE_W * 0.9, fx1 = last.x + TILE_W * 0.9
  const floorPts = [floor(fx0, 0), floor(0, -TILE_H * 0.9), floor(fx1 + TILE_W * 0.9, last.y), floor(last.x, last.y + TILE_H * 0.9)]

  return <svg className="isostack" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Emission sources ranked as 3D towers, split by electricity, fuel and process emissions">
    <defs>
      {(Object.keys(tones) as StackSegment['key'][]).map((key) => <g key={key}>
        <linearGradient id={`g-left-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={tones[key].mid} /><stop offset="1" stopColor={tones[key].dark} /></linearGradient>
        <linearGradient id={`g-right-${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={tones[key].light} /><stop offset="1" stopColor={tones[key].mid} /></linearGradient>
      </g>)}
      <radialGradient id="g-floor" cx="0.3" cy="0.3" r="0.9"><stop offset="0" stopColor="#a7f3d0" stopOpacity="0.55" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10" /></filter>
    </defs>

    <polygon points={floorPts.join(' ')} fill="url(#g-floor)" />
    {Array.from({ length: ranked.length + 2 }, (_, k) => { const a = pos(k - 1); return <line key={k} className="is-grid" x1={a.x - TILE_W * 0.55} y1={a.y + TILE_H * 0.27} x2={a.x + TILE_W * 0.55} y2={a.y - TILE_H * 0.27} /> })}

    {ranked.map((item, index) => {
      const { x: cx, y: cy } = pos(index)
      const totalH = scale(item.total)
      const ghostH = item.before && item.before > item.total ? scale(item.before) : 0
      const segments = item.segments.filter((segment) => segment.value > 0)
      const share = item.total / grand
      const isHover = hover === item.machine.id
      const dim = hover !== null && !isHover
      const topKey = segments.at(-1)?.key ?? 'electricity'
      let base = 0
      return <g key={item.machine.id} className={`is-tower${isHover ? ' hover' : ''}${dim ? ' dim' : ''}`} style={{ animationDelay: `${index * 70}ms` }}
        onMouseEnter={() => setHover(item.machine.id)} onMouseLeave={() => setHover(null)} onClick={() => onSelect?.(item.machine.id)}
        role="button" tabIndex={0} aria-label={`Rank ${index + 1}: ${item.machine.name}, ${tonnes(item.total)} per year, ${num(share * 100, 1)}%`}
        onKeyDown={(event) => { if (event.key === 'Enter') onSelect?.(item.machine.id) }}>
        {index === 0 && totalH > 0 && <ellipse cx={cx} cy={cy} rx={W * 2.2} ry={D * 2.2} fill={tones[topKey].mid} opacity="0.35" filter="url(#glow)" />}
        <polygon className="is-plate" points={`${cx},${cy - D * 1.5} ${cx + W * 1.5},${cy} ${cx},${cy + D * 1.5} ${cx - W * 1.5},${cy}`} />
        <g className="is-body">
          {ghostH > 0 && <polygon className="is-ghost" points={`${cx - W},${cy - ghostH} ${cx},${cy - ghostH - D} ${cx + W},${cy - ghostH} ${cx},${cy - ghostH + D}`} />}
          {segments.map((segment) => {
            const h = totalH * segment.value / Math.max(1e-9, item.total)
            const bottom = cy - base, top = cy - base - h
            base += h
            return <g key={segment.key}>
              <title>{`${item.machine.name} · ${segment.label}: ${tonnes(segment.value)}/yr`}</title>
              <polygon points={`${cx - W},${top} ${cx},${top + D} ${cx},${bottom + D} ${cx - W},${bottom}`} fill={`url(#g-left-${segment.key})`} />
              <polygon points={`${cx + W},${top} ${cx},${top + D} ${cx},${bottom + D} ${cx + W},${bottom}`} fill={`url(#g-right-${segment.key})`} />
              <line x1={cx - W} y1={top} x2={cx} y2={top + D} className="is-seam" /><line x1={cx} y1={top + D} x2={cx + W} y2={top} className="is-seam" />
            </g>
          })}
          {totalH > 0 && <polygon className="is-top" points={`${cx},${cy - totalH - D} ${cx + W},${cy - totalH} ${cx},${cy - totalH + D} ${cx - W},${cy - totalH}`} fill={tones[topKey].light} />}
          <line x1={cx} y1={cy - totalH + D} x2={cx} y2={cy + D} className="is-edge" />
        </g>
        {/* Callout to the upper right with a leader line, so labels never sit on a neighbour. */}
        {(() => {
          const ax = cx + W * 0.6, ay = cy - Math.max(totalH, ghostH) - 4
          const lx = cx + W * 1.6, ly = ay - 26
          return <g className="is-callout">
            <polyline points={`${ax},${ay} ${lx - 6},${ly} ${lx + 4},${ly}`} className="is-leader" />
            <circle cx={lx + 16} cy={ly} r="11" className={`is-badge${index === 0 ? ' first' : ''}`} />
            <text x={lx + 16} y={ly + 4} textAnchor="middle" className="is-badge-text">{index + 1}</text>
            <text x={lx + 33} y={ly - 2} className="is-name">{item.machine.name}</text>
            <text x={lx + 33} y={ly + 14} className="is-value">{tonnes(item.total)}<tspan className="is-share"> · {share < 0.001 ? '<0.1' : num(share * 100, share < 0.01 ? 1 : 0)}%</tspan></text>
          </g>
        })()}
      </g>
    })}
  </svg>
}
