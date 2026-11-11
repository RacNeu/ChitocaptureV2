import { kindIcon, num, tonnes } from '../format'
import type { Machine } from '../model/types'
import type { Point } from '../sensor/hub'

/** sub = where the component belongs, e.g. its site or process area. */
export type FloorItem = { machine: Machine; baselineT: number; afterT: number; sub?: string; subColour?: string; hideLabel?: boolean }
/** A labelled area of the floor, in grid cells (before spacing), e.g. one site in the company view. */
export type FloorZone = { label: string; col: number; row: number; cols: number; rows: number; colour: string }

type Props = {
  items: FloorItem[]
  withPlan: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  live: Point | null
  zones?: FloorZone[]
  /** Grid cells per machine slot; larger values leave more room for labels. */
  spacing?: number
}

const TILE_W = 150
const TILE_H = 75
const MAX_H = 150
const MIN_H = 16

/** Green → amber → red as a machine's share of the factory's emissions grows. */
function heatColour(share: number) {
  const stops = [[16, 185, 129], [245, 158, 11], [225, 29, 72]]
  const x = Math.min(1, Math.max(0, Math.sqrt(share) * 1.6))
  const [a, b, f] = x < 0.5 ? [stops[0], stops[1], x / 0.5] : [stops[1], stops[2], (x - 0.5) / 0.5]
  return a.map((channel, index) => Math.round(channel + (b[index] - channel) * f))
}
const rgb = ([r, g, b]: number[], shade = 1) => `rgb(${Math.round(r * shade)} ${Math.round(g * shade)} ${Math.round(b * shade)})`

const iso = (col: number, row: number) => ({ x: (col - row) * TILE_W / 2, y: (col + row) * TILE_H / 2 })

function liveValue(machine: Machine, live: Point | null) {
  if (!machine.sensorChannel || !live) return null
  const value = live[machine.sensorChannel]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default function IsoFloor({ items, withPlan, selectedId, onSelect, live, zones = [], spacing = 1.9 }: Props) {
  const SPACING = spacing
  const subOf = (id: string) => items.find((entry) => entry.machine.id === id)?.sub
  const place = (machine: Machine) => iso(machine.col * SPACING + 0.75, machine.row * SPACING + 0.75)
  const total = items.reduce((sum, item) => sum + item.baselineT, 0) || 1
  const maxT = Math.max(1, ...items.map((item) => item.baselineT))
  const cols = Math.ceil(Math.max(4, ...items.map((item) => item.machine.col + 1)) * SPACING)
  const rows = Math.ceil(Math.max(2, ...items.map((item) => item.machine.row + 1)) * SPACING)
  const height = (t: number) => t <= 0 ? 4 : MIN_H + (MAX_H - MIN_H) * Math.sqrt(t / maxT)

  const corners = [iso(0, 0), iso(cols, 0), iso(cols, rows), iso(0, rows)]
  const minX = Math.min(...corners.map((c) => c.x)) - 40, maxX = Math.max(...corners.map((c) => c.x)) + 40
  const labelScale = Math.min(1.9, Math.max(1, (maxX - minX) / 1500))
  const minY = -MAX_H - 120 * labelScale, maxY = Math.max(...corners.map((c) => c.y)) + (zones.length ? 90 : 50)

  // Draw back-to-front so nearer boxes overlap farther ones.
  const ordered = [...items].sort((a, b) => (a.machine.col + a.machine.row) - (b.machine.col + b.machine.row))

  return <svg className="iso" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} role="group" aria-label="Factory floor map. Taller and redder machines emit more CO₂.">
    <defs>
      <radialGradient id="smoke"><stop offset="0%" stopColor="#c8d3cf" stopOpacity=".55" /><stop offset="100%" stopColor="#c8d3cf" stopOpacity="0" /></radialGradient>
    </defs>
    <polygon className="iso-floor" points={corners.map((c) => `${c.x},${c.y}`).join(' ')} />
    {Array.from({ length: cols + 1 }, (_, col) => { const a = iso(col, 0), b = iso(col, rows); return <line key={`c${col}`} className="iso-grid" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}
    {Array.from({ length: rows + 1 }, (_, row) => { const a = iso(0, row), b = iso(cols, row); return <line key={`r${row}`} className="iso-grid" x1={a.x} y1={a.y} x2={b.x} y2={b.y} /> })}

    {zones.map((zone) => {
      const a = iso(zone.col * SPACING + 0.05, zone.row * SPACING + 0.05), b = iso((zone.col + zone.cols) * SPACING - 0.35, zone.row * SPACING + 0.05)
      const c = iso((zone.col + zone.cols) * SPACING - 0.35, (zone.row + zone.rows) * SPACING - 0.35), d = iso(zone.col * SPACING + 0.05, (zone.row + zone.rows) * SPACING - 0.35)
      return <g key={zone.label} className="iso-zone">
        <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}`} fill={zone.colour} fillOpacity="0.12" stroke={zone.colour} strokeOpacity="0.6" strokeWidth="2" strokeDasharray="8 6" />

      </g>
    })}
    {ordered.map(({ machine, baselineT, afterT }) => {
      const shownT = withPlan ? afterT : baselineT
      const h = height(shownT)
      const colour = heatColour(shownT / total)
      const centre = place(machine)
      const w = TILE_W * 0.36, d = TILE_H * 0.36
      const top = { x: centre.x, y: centre.y - h }
      const topFace = `${top.x},${top.y - d} ${top.x + w},${top.y} ${top.x},${top.y + d} ${top.x - w},${top.y}`
      const left = `${top.x - w},${top.y} ${top.x},${top.y + d} ${centre.x},${centre.y + d} ${centre.x - w},${centre.y}`
      const right = `${top.x + w},${top.y} ${top.x},${top.y + d} ${centre.x},${centre.y + d} ${centre.x + w},${centre.y}`
      const ghostH = height(baselineT)
      const smokeCount = shownT <= 0 ? 0 : Math.max(1, Math.round(Math.sqrt(shownT / total) * 6))
      const selected = machine.id === selectedId
      const reading = liveValue(machine, live)
      return <g key={machine.id} className={`iso-machine${selected ? ' selected' : ''}`} onClick={() => onSelect(machine.id)}
        role="button" tabIndex={0} aria-label={`${machine.name}: ${tonnes(shownT)} CO₂e per year`}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(machine.id) } }}>
        <title>{`${machine.name}${subOf(machine.id) ? ` · ${subOf(machine.id)}` : ''}: ${tonnes(shownT)} CO₂e/yr`}</title>
        <ellipse cx={centre.x} cy={centre.y + d * 0.3} rx={w * 1.25} ry={d * 1.25} className="iso-shadow" />
        {withPlan && afterT < baselineT && <polygon className="iso-ghost" points={`${centre.x - w},${centre.y - ghostH} ${centre.x},${centre.y - ghostH - d} ${centre.x + w},${centre.y - ghostH} ${centre.x},${centre.y - ghostH + d}`} />}
        <polygon points={left} fill={rgb(colour, 0.62)} className="iso-face" />
        <polygon points={right} fill={rgb(colour, 0.8)} className="iso-face" />
        <polygon points={topFace} fill={rgb(colour)} className="iso-face iso-top" />
        {Array.from({ length: smokeCount }, (_, index) => <circle key={index} className="iso-smoke" cx={top.x + (index % 3 - 1) * 9} cy={top.y - 6} r={10 + index * 2}
          fill="url(#smoke)" style={{ animationDelay: `${index * 0.55}s`, animationDuration: `${3 + (index % 3)}s` }} />)}
        <text x={top.x} y={top.y + 5} textAnchor="middle" className="iso-icon">{kindIcon[machine.kind] ?? '■'}</text>
        {reading !== null && <g transform={`translate(${top.x + TILE_W * 0.36 + 34}, ${top.y + 6})`} className="iso-live">
          <rect x="-44" y="-15" width="88" height="24" rx="12" />
          <circle cx="-30" cy="-3" r="4" className="iso-live-dot" />
          <text x="6" y="2" textAnchor="middle">{num(reading)} ppm</text>
        </g>}
      </g>
    })}
    {ordered.map((item) => {
      const { machine, baselineT, afterT } = item
      const shownT = withPlan ? afterT : baselineT
      const centre = place(machine)
      // Float each label just above its machine so labels never sit on top of a neighbour's box.
      const labelY = centre.y - height(Math.max(shownT, withPlan ? baselineT : shownT)) - TILE_H * 0.36 - 34
      if (item.hideLabel) return null
      return <g key={`label-${machine.id}`} transform={`translate(${centre.x}, ${labelY - (labelScale - 1) * 30}) scale(${labelScale})`} className={`iso-label${machine.id === selectedId ? ' selected' : ''}`} pointerEvents="none">
        {(() => {
          const valueText = `${tonnes(shownT)}/yr`
          const w = Math.max(machine.name.length * 8.4, (item.sub?.length ?? 0) * 7.6, valueText.length * 7.2) + 20
          const top = item.sub ? -34 : -18
          return <rect x={-w / 2} y={top} width={w} height={(item.sub ? 56 : 40)} rx="9" className="iso-label-bg" />
        })()}
        <text textAnchor="middle" className="iso-name">{machine.name}</text>
        {item.sub && <text y="-17" textAnchor="middle" className="iso-sub" style={item.subColour ? { fill: item.subColour } : undefined}>{item.sub}</text>}
        <text y="16" textAnchor="middle" className="iso-value">{tonnes(shownT)}/yr{withPlan && afterT < baselineT ? `  ↓${num((1 - afterT / Math.max(baselineT, 1e-9)) * 100)}%` : ''}</text>
      </g>
    })}
    {zones.map((zone) => {
      const a = iso(zone.col * SPACING + 0.05, zone.row * SPACING + 0.05), d = iso(zone.col * SPACING + 0.05, (zone.row + zone.rows) * SPACING - 0.35)
      return <g key={`pill-${zone.label}`} pointerEvents="none">
        <g transform={`translate(${(d.x + a.x) / 2 - 40 * labelScale}, ${(d.y + a.y) / 2 + 10 * labelScale}) scale(${labelScale})`}>
          <rect x={-zone.label.length * 6.6 - 14} y="-20" width={zone.label.length * 13.2 + 28} height="32" rx="16" fill="#ffffff" stroke={zone.colour} strokeWidth="2" />
          <text y="2" textAnchor="middle" className="iso-zone-label" fill={zone.colour}>{zone.label}</text>
        </g>
      </g>
    })}
  </svg>
}
