import { useState } from 'react'
import { kindIcon, num, tonnes } from '../format'
import type { Machine } from '../model/types'

export type StackSegment = { key: 'electricity' | 'fuel' | 'process'; label: string; value: number }
export type StackItem = { machine: Machine; segments: StackSegment[]; total: number; before?: number }

const segmentColour: Record<StackSegment['key'], [number, number, number]> = {
  electricity: [108, 184, 255],
  fuel: [255, 181, 71],
  process: [255, 93, 93],
}
const shade = ([r, g, b]: [number, number, number], f: number) => `rgb(${Math.round(r * f)} ${Math.round(g * f)} ${Math.round(b * f)})`

const TILE_W = 120
const TILE_H = 60
const MAX_H = 260
const BOX = 0.36

/**
 * Isometric "skyline": sources ranked tallest-first along a diagonal. Each tower is stacked by
 * cause (grid electricity, fuel, process), so the chart shows both WHO emits and WHY.
 * Heights use a square-root scale so small sources stay visible next to a dominant one.
 */
export default function IsoStack({ items, onSelect }: { items: StackItem[]; onSelect?: (id: string) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const ranked = [...items].sort((a, b) => b.total - a.total)
  const maxT = Math.max(1, ...ranked.map((item) => Math.max(item.total, item.before ?? 0)))
  const grand = ranked.reduce((sum, item) => sum + item.total, 0) || 1
  const scale = (t: number) => t <= 0 ? 0 : MAX_H * Math.sqrt(t / maxT)

  // One diagonal row, tallest first, so the ranking reads left to right.
  const step = ranked.length > 9 ? 0.5 : 0.62
  const at = (index: number) => ({ x: index * TILE_W * step, y: index * TILE_H * step })
  const positions = ranked.map((_, index) => at(index))
  const minX = Math.min(...positions.map((p) => p.x)) - TILE_W, maxX = Math.max(...positions.map((p) => p.x)) + TILE_W
  const minY = -MAX_H - 70, maxY = Math.max(...positions.map((p) => p.y)) + TILE_H + 30
  const w = TILE_W * BOX, d = TILE_H * BOX

  // Back-to-front drawing order.
  const order = ranked.map((item, index) => ({ item, index, pos: positions[index] })).sort((a, b) => a.pos.y - b.pos.y)

  return <svg className="isostack" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label="Emission sources ranked as 3D towers, split by electricity, fuel and process emissions">
    {order.map(({ item, index, pos }) => {
      const cx = pos.x, cy = pos.y
      const plate = `${cx},${cy - d * 1.6} ${cx + w * 1.6},${cy} ${cx},${cy + d * 1.6} ${cx - w * 1.6},${cy}`
      let base = 0
      const totalH = scale(item.total)
      const segments = item.segments.filter((segment) => segment.value > 0)
      const isHover = hover === item.machine.id
      const ghostH = item.before && item.before > item.total ? scale(item.before) : 0
      return <g key={item.machine.id} className={`is-tower${isHover ? ' hover' : ''}`} onMouseEnter={() => setHover(item.machine.id)} onMouseLeave={() => setHover(null)}
        onClick={() => onSelect?.(item.machine.id)} role="button" tabIndex={0} aria-label={`Rank ${index + 1}: ${item.machine.name}, ${tonnes(item.total)} per year`}
        onKeyDown={(event) => { if (event.key === 'Enter') onSelect?.(item.machine.id) }}>
        <polygon points={plate} className="is-plate" />
        {ghostH > 0 && <polygon className="is-ghost" points={`${cx - w},${cy - ghostH} ${cx},${cy - ghostH - d} ${cx + w},${cy - ghostH} ${cx},${cy - ghostH + d}`} />}
        {segments.map((segment) => {
          // Each segment's height is its share of the tower's (square-root-scaled) height.
          const h = totalH * segment.value / Math.max(1e-9, item.total)
          const bottom = cy - base, top = cy - base - h
          base += h
          const colour = segmentColour[segment.key]
          return <g key={segment.key}>
            <title>{`${item.machine.name} · ${segment.label}: ${tonnes(segment.value)}/yr`}</title>
            <polygon points={`${cx - w},${top} ${cx},${top + d} ${cx},${bottom + d} ${cx - w},${bottom}`} fill={shade(colour, 0.62)} />
            <polygon points={`${cx + w},${top} ${cx},${top + d} ${cx},${bottom + d} ${cx + w},${bottom}`} fill={shade(colour, 0.8)} />
          </g>
        })}
        {totalH > 0 && (() => { const top = cy - totalH; const colour = segmentColour[segments.at(-1)?.key ?? 'electricity']; return <polygon className="is-top" points={`${cx},${top - d} ${cx + w},${top} ${cx},${top + d} ${cx - w},${top}`} fill={shade(colour, 1)} /> })()}
        <text x={cx} y={cy - Math.max(totalH, ghostH) - d - 30} textAnchor="middle" className="is-rank">#{index + 1} {kindIcon[item.machine.kind] ?? ''}</text>
        <text x={cx} y={cy - Math.max(totalH, ghostH) - d - 14} textAnchor="middle" className="is-name">{item.machine.name}</text>
        <text x={cx} y={cy - Math.max(totalH, ghostH) - d} textAnchor="middle" className="is-value">{tonnes(item.total)} · {item.total / grand < 0.001 ? '<0.1' : num(item.total / grand * 100, item.total / grand < 0.01 ? 1 : 0)}%</text>
      </g>
    })}
  </svg>
}
