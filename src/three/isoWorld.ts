import * as THREE from 'three'
import { box } from './shapes'
import type { Machine } from '../model/types'

/**
 * The living part of the isometric site: yards and props, vehicles on the roads, forklifts and
 * workers, blinking stack lights, glowing furnace vents, and two flows that carry meaning:
 * power from the substation to each electric building (more pulses = more electricity), and hot
 * steel moving through the process route. Everything is generated in code.
 */

export const W = 34, D = 26, G = 12
export const roadX = (col: number) => col * (W + G) - (W + G) / 2
export const roadZ = (row: number) => row * (D + G) - (D + G) / 2
export const plotXZ = (col: number, row: number) => new THREE.Vector3(col * (W + G), 0, row * (D + G))

export type Placed = Machine & { col: number; row: number }
export type Agent = (dt: number, t: number) => void
export type World = { agents: Agent[]; power: THREE.Group; steel: THREE.Group; extraPlots: { col: number; row: number }[] }

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra })
const C = {
  crate: 0xd8b48a, pallet: 0xb88d62, fork: 0xf5b324, forkDark: 0x334155, hat: 0xf97316, vest: 0xfacc15, skin: 0xe8c4a0, trouser: 0x334155,
  scrapA: 0xa98467, scrapB: 0x9ca3af, scrapC: 0x8b6b52, billet: 0x9aa4b2, hot: 0xff7a1a, rebar: 0x7c8794, container: [0x3b82f6, 0x14b8a6, 0xf59e0b, 0x6366f1],
  car: [0xffffff, 0x93c5fd, 0xfca5a5, 0x334155, 0xd1d5db], transformer: 0x94a3b8, fence: 0xcbd5e1, grass: 0xcfe8d6, lamp: 0x94a3b8, power: 0xfacc15, steel: 0xff7a1a, beacon: 0xef4444,
}

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = shadow; m.receiveShadow = true
  parent.add(m)
  return m
}

/** Length-parametrised polyline, for things that travel along paths. */
function polyline(points: THREE.Vector3[]) {
  const lengths = [0]
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]))
  const total = lengths[lengths.length - 1] || 1
  const at = (u: number, out = new THREE.Vector3()) => {
    const d = ((u % 1) + 1) % 1 * total
    let i = 1
    while (i < lengths.length - 1 && lengths[i] < d) i += 1
    const seg = Math.max(1e-6, lengths[i] - lengths[i - 1])
    return out.copy(points[i - 1]).lerp(points[i], (d - lengths[i - 1]) / seg)
  }
  return { at, total }
}

/** A flat ribbon along a path plus pulses travelling along it. */
function flow(group: THREE.Group, points: THREE.Vector3[], color: number, pulses: number, speed: number, pulseGeo: THREE.BufferGeometry, agents: Agent[], strong = false) {
  const ribbon = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strong ? 0.4 : 0.16, depthWrite: false })
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1], b = points[i], len = a.distanceTo(b)
    if (len < 0.01) continue
    const m = new THREE.Mesh(new THREE.BoxGeometry(len + (strong ? 0.9 : 0.35), 0.06, strong ? 0.9 : 0.35), ribbon)
    m.position.copy(a).lerp(b, 0.5)
    m.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x)
    group.add(m)
  }
  const path = polyline(points)
  const mat = new THREE.MeshBasicMaterial({ color })
  const dots = Array.from({ length: pulses }, () => { const d = new THREE.Mesh(pulseGeo, mat); group.add(d); return d })
  let u = Math.random()
  agents.push((dt) => {
    if (!group.visible) return
    u += dt * speed / Math.max(10, path.total) * 12
    dots.forEach((d, k) => path.at(u + k / pulses, d.position))
  })
}

/** A vehicle or person going back and forth along a path, turning to face where it goes. */
function shuttle(object: THREE.Object3D, points: THREE.Vector3[], speed: number, agents: Agent[], bob = false) {
  const path = polyline(points)
  let s = Math.random(), dir = 1
  const prev = new THREE.Vector3()
  agents.push((dt, t) => {
    prev.copy(object.position)
    s += dir * dt * speed / path.total
    if (s > 1) { s = 1; dir = -1 } else if (s < 0) { s = 0; dir = 1 }
    path.at(s * 0.9999, object.position)
    const dx = object.position.x - prev.x, dz = object.position.z - prev.z
    if (Math.abs(dx) + Math.abs(dz) > 1e-4) object.rotation.y = Math.atan2(-dz, dx)
    if (bob) object.position.y = Math.abs(Math.sin(t * 9)) * 0.12
  })
}

function truck(color: number, load?: number) {
  const g = new THREE.Group()
  add(g, box(5.2, 2.6, 2.3), std(0xffffff), -0.9, 1.5, 0)
  add(g, box(1.9, 2.1, 2.2), std(color), 2.5, 1.25, 0)
  add(g, box(1.95, 0.8, 2.15), std(0x1e293b, { roughness: 0.3 }), 2.6, 1.8, 0, false)
  if (load) add(g, box(4.6, 0.6, 1.9), std(load), -0.9, 3.1, 0)
  for (const x of [-2.6, 0.6, 2.6]) for (const z of [-1.1, 1.1]) { const w = add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12), std(0x1f2937), x, 0.45, z); w.rotation.x = Math.PI / 2 }
  return g
}

function forklift() {
  const g = new THREE.Group()
  add(g, box(1.8, 1, 1.2), std(C.fork), 0, 0.7, 0)
  add(g, box(0.9, 1.1, 1.1), std(C.fork), -0.3, 1.6, 0)
  add(g, new THREE.BoxGeometry(0.12, 2.4, 0.9), std(C.forkDark), 1, 1.3, 0)
  add(g, box(1.2, 0.9, 1), std(C.crate), 1.6, 0.6, 0)
  return g
}

function worker(hat = C.hat) {
  const g = new THREE.Group()
  add(g, new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), std(C.trouser), 0, 0.6, 0)
  add(g, new THREE.CapsuleGeometry(0.34, 0.5, 4, 8), std(C.vest), 0, 1.3, 0)
  add(g, new THREE.SphereGeometry(0.26, 10, 8), std(C.skin), 0, 1.95, 0)
  add(g, new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(hat), 0, 2.05, 0)
  return g
}

function crates(parent: THREE.Object3D, x: number, z: number, n = 4) {
  const pallet = std(C.pallet), crate = std(C.crate)
  for (let i = 0; i < n; i += 1) {
    const px = x + (i % 2) * 2.4, pz = z + Math.floor(i / 2) * 2.4
    add(parent, new THREE.BoxGeometry(2, 0.3, 2), pallet, px, 0.45, pz)
    const h = 1 + (i % 3) * 0.5
    add(parent, box(1.8, h, 1.8), crate, px, 0.6 + h / 2, pz)
  }
}

function billets(parent: THREE.Object3D, x: number, z: number, hot = false) {
  const m = hot ? std(C.billet, { emissive: new THREE.Color(C.hot), emissiveIntensity: 0.35 }) : std(C.billet)
  for (let layer = 0; layer < 3; layer += 1) for (let i = 0; i < 5; i += 1) add(parent, new THREE.BoxGeometry(7, 0.6, 0.6), m, x, 0.6 + layer * 0.62, z + i * 0.7 + (layer % 2) * 0.3)
}

function rebar(parent: THREE.Object3D, x: number, z: number) {
  const m = std(C.rebar, { metalness: 0.4, roughness: 0.5 })
  for (let b = 0; b < 3; b += 1) for (let i = 0; i < 7; i += 1) {
    const r = add(parent, new THREE.CylinderGeometry(0.12, 0.12, 9, 6), m, x, 0.4 + (i % 2) * 0.2 + b * 0.6, z + b * 1.6 + (i - 3) * 0.2)
    r.rotation.z = Math.PI / 2
  }
}

function car(parent: THREE.Object3D, x: number, z: number, color: number) {
  add(parent, box(4, 1, 2), std(color), x, 0.75, z)
  add(parent, box(2.2, 0.8, 1.8), std(0xe2e8f0, { roughness: 0.3 }), x - 0.2, 1.6, z)
}

function lamp(parent: THREE.Object3D, x: number, z: number) {
  add(parent, new THREE.CylinderGeometry(0.12, 0.15, 6, 8), std(C.lamp), x, 3, z)
  add(parent, box(1.4, 0.2, 0.4), std(C.lamp), x + 0.6, 6, z)
}

export function buildWorld(root: THREE.Group, placed: Placed[], electricity: Map<string, number>): World {
  const agents: Agent[] = []
  const power = new THREE.Group(), steel = new THREE.Group()
  root.add(power, steel)
  const pulseGeo = new THREE.SphereGeometry(0.45, 10, 8)
  const hotGeo = new THREE.BoxGeometry(2.2, 0.8, 0.8)
  const byUnit = new Map(placed.filter((m) => m.unitId).map((m) => [m.unitId!, m]))
  const isSteel = byUnit.has('eaf')
  const minRow = Math.min(...placed.map((m) => m.row))
  const extraPlots = isSteel ? [{ col: -1, row: minRow }, { col: -1, row: minRow + 1 }] : [{ col: -1, row: minRow }]
  const subPlot = isSteel ? extraPlots[1] : extraPlots[0]

  // ---- Substation: transformers on a fenced pad.
  const sub = plotXZ(subPlot.col, subPlot.row)
  const subG = new THREE.Group(); subG.position.copy(sub); root.add(subG)
  add(subG, new THREE.BoxGeometry(W - 6, 0.3, D - 6), std(0xeef2f7), 0, 0.15, 0)
  for (const [x, z] of [[-7, -4], [0, -4], [7, -4]] as const) {
    add(subG, box(4, 4, 3.4), std(C.transformer, { metalness: 0.3 }), x, 2.3, z)
    for (let f = -1.5; f <= 1.5; f += 0.75) add(subG, new THREE.BoxGeometry(0.15, 3, 3.8), std(0x7c8ea4), x + f, 2.1, z)
    add(subG, new THREE.CylinderGeometry(0.25, 0.25, 2, 8), std(0xe2e8f0), x, 5.2, z)
  }
  add(subG, box(8, 3.2, 5), std(0xffffff), -6, 1.75, 6)
  for (let x = -12; x <= 12; x += 3) { add(subG, new THREE.BoxGeometry(0.15, 2, 0.15), std(C.fence), x, 1, -10); add(subG, new THREE.BoxGeometry(0.15, 2, 0.15), std(C.fence), x, 1, 10) }
  const beaconMat = new THREE.MeshBasicMaterial({ color: C.beacon })

  // ---- Scrap yard with a gantry magnet crane (steel sites).
  if (isSteel) {
    const yard = plotXZ(extraPlots[0].col, extraPlots[0].row)
    const yG = new THREE.Group(); yG.position.copy(yard); root.add(yG)
    add(yG, new THREE.BoxGeometry(W - 2, 0.25, D - 2), std(0xe7e2dc), 0, 0.12, 0)
    const piles = [[-9, -5, 5, 4, C.scrapA], [1, -6, 6, 5, C.scrapB], [10, -4, 4.5, 3.5, C.scrapC], [-6, 6, 4.5, 3.2, C.scrapB], [6, 6, 5, 3.8, C.scrapA]] as const
    for (const [x, z, r, h, c] of piles) add(yG, new THREE.ConeGeometry(r, h, 9), std(c, { flatShading: true }), x, h / 2 + 0.2, z)
    for (const x of [-14, 14]) add(yG, new THREE.BoxGeometry(0.8, 11, 0.8), std(0xf59e0b), x, 5.5, -10), add(yG, new THREE.BoxGeometry(0.8, 11, 0.8), std(0xf59e0b), x, 5.5, 10)
    const beam = new THREE.Group(); yG.add(beam)
    add(beam, new THREE.BoxGeometry(29, 1, 1), std(0xf59e0b), 0, 11, 0)
    const magnet = add(beam, new THREE.CylinderGeometry(1.4, 1.4, 0.6, 16), std(0x334155), 0, 7, 0)
    add(beam, new THREE.CylinderGeometry(0.06, 0.06, 4, 4), std(0x334155), 0, 9, 0, false)
    agents.push((_, t) => { beam.position.z = Math.sin(t * 0.25) * 7; magnet.position.x = Math.sin(t * 0.4) * 11; magnet.position.y = 6 + Math.abs(Math.sin(t * 0.8)) * 2 })
  }

  // ---- Per-plot props, forklifts, workers, glows and beacons.
  const glowMats: THREE.MeshStandardMaterial[] = []
  placed.forEach((m, i) => {
    const p = plotXZ(m.col, m.row)
    const g = new THREE.Group(); g.position.copy(p); root.add(g)
    const front = D / 2 - 3
    const kind = m.kind
    if (m.unitId === 'caster' || m.unitId === 'reheat') billets(g, -8, front - 3, m.unitId === 'reheat')
    else if (kind === 'mill') rebar(g, -6, front - 3)
    else if (kind === 'office') {
      for (let k = 0; k < 4; k += 1) car(g, -12 + k * 5, front, C.car[k % C.car.length])
      lamp(g, 13, front); lamp(g, -15, front - 4)
    } else if (kind !== 'wastewater' && kind !== 'solar' && kind !== 'battery') crates(g, -14, front - 2.5, 4)
    if (kind !== 'office' && kind !== 'wastewater' && kind !== 'genset' && kind !== 'solar' && kind !== 'battery') {
      const f = forklift(); g.add(f)
      shuttle(f, [new THREE.Vector3(-12, 0, front + 1.5), new THREE.Vector3(10, 0, front + 1.5)], 3 + (i % 3), agents)
    }
    for (let k = 0; k < (kind === 'office' ? 2 : 1); k += 1) {
      const w = worker(k % 2 ? 0xffffff : C.hat); g.add(w)
      const z = -D / 2 + 2 + k * 2
      shuttle(w, [new THREE.Vector3(-13, 0, z), new THREE.Vector3(13, 0, z)], 1.3, agents, true)
    }
  })
  // Furnace vents glow and stacks blink.
  root.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.userData?.glow) glowMats.push(mesh.material as THREE.MeshStandardMaterial) })
  agents.push((_, t) => { glowMats.forEach((mat, k) => { mat.emissiveIntensity = 0.6 + 0.5 * Math.abs(Math.sin(t * 1.7 + k)) }) })
  const beacons: THREE.Mesh[] = []
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry instanceof THREE.CylinderGeometry) { const geo = (o as THREE.Mesh).geometry as THREE.CylinderGeometry; if (geo.parameters.height >= 12 && geo.parameters.radiusTop <= 1.3) beacons.push(o as THREE.Mesh) } })
  const beaconDots = beacons.map((stack) => {
    const pos = new THREE.Vector3(); stack.getWorldPosition(pos)
    const h = (stack.geometry as THREE.CylinderGeometry).parameters.height
    const dot = add(root, new THREE.SphereGeometry(0.45, 8, 6), beaconMat.clone(), pos.x, pos.y + h / 2 + 0.4, pos.z, false)
    return dot
  })
  agents.push((_, t) => { beaconDots.forEach((d, k) => { d.visible = Math.sin(t * 3 + k) > 0.2 }) })

  // ---- Vehicles: a truck on every road, going back and forth.
  const cols = [...new Set([...placed.map((m) => m.col), ...extraPlots.map((p) => p.col)])].sort((a, b) => a - b)
  const rows = [...new Set([...placed.map((m) => m.row), ...extraPlots.map((p) => p.row)])].sort((a, b) => a - b)
  const xMin = roadX(cols[0]), xMax = roadX(cols[cols.length - 1] + 1)
  const zMin = roadZ(rows[0]), zMax = roadZ(rows[rows.length - 1] + 1)
  const loads = [undefined, C.container[0], C.rebar, C.container[2], undefined, C.container[1]]
  ;[...rows, rows[rows.length - 1] + 1].forEach((r, k) => {
    const v = truck(C.container[k % 4], loads[k % loads.length]); root.add(v)
    const z = roadZ(r) + (k % 2 ? 1.8 : -1.8)
    shuttle(v, [new THREE.Vector3(xMin, 0, z), new THREE.Vector3(xMax, 0, z)], 9 + k, agents)
  })
  ;[...cols, cols[cols.length - 1] + 1].forEach((c, k) => {
    if (k % 2) return
    const v = truck(C.container[(k + 1) % 4], loads[(k + 2) % loads.length]); root.add(v)
    const x = roadX(c) + 1.8
    shuttle(v, [new THREE.Vector3(x, 0, zMin), new THREE.Vector3(x, 0, zMax)], 8, agents)
  })

  // ---- Power: substation → each electric building, pulses scale with its electricity.
  const maxE = Math.max(1, ...placed.map((m) => electricity.get(m.id) ?? 0))
  const subFront = new THREE.Vector3(sub.x + W / 2 - 2, 0.25, sub.z)
  placed.filter((m) => (electricity.get(m.id) ?? 0) > 0).forEach((m, k) => {
    const p = plotXZ(m.col, m.row)
    const lane = (k % 5) * 0.9 - 1.8
    const rx = roadX(m.col) + lane, rz = roadZ(subPlot.row) + lane
    const pts = [subFront, new THREE.Vector3(roadX(subPlot.col + 1) + lane, 0.25, sub.z), new THREE.Vector3(roadX(subPlot.col + 1) + lane, 0.25, rz), new THREE.Vector3(rx, 0.25, rz), new THREE.Vector3(rx, 0.25, p.z), new THREE.Vector3(p.x - W / 2 + 3, 0.25, p.z)]
    const share = (electricity.get(m.id) ?? 0) / maxE
    flow(power, pts, C.power, 2 + Math.round(share * 8), 4 + share * 6, pulseGeo, agents)
  })

  // ---- Steel: scrap yard → arc furnace → ladle → caster → reheat → rolling mill → dispatch.
  if (isSteel) {
    const route = ['eaf', 'lf', 'caster', 'reheat', 'rolling'].map((u) => byUnit.get(u)).filter((m): m is Placed => Boolean(m))
    const stops: THREE.Vector3[] = [plotXZ(extraPlots[0].col, extraPlots[0].row), ...route.map((m) => plotXZ(m.col, m.row))]
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < stops.length; i += 1) {
      const s = stops[i]
      const rowOf = Math.round(s.z / (D + G))
      const below = roadZ(rowOf + 1) - 2.6
      if (i === 0) pts.push(new THREE.Vector3(s.x, 0.35, s.z + D / 2 - 2))
      pts.push(new THREE.Vector3(s.x, 0.35, below))
      if (i < stops.length - 1) {
        const n = stops[i + 1], nRow = Math.round(n.z / (D + G))
        if (nRow !== rowOf) { const vx = roadX(Math.round(n.x / (W + G))) + 2.6; pts.push(new THREE.Vector3(vx, 0.35, below), new THREE.Vector3(vx, 0.35, roadZ(nRow + 1) - 2.6)) }
      }
    }
    const last = stops[stops.length - 1]
    pts.push(new THREE.Vector3(last.x + W / 2 + G / 2, 0.35, pts[pts.length - 1].z))
    flow(steel, pts, C.steel, 16, 5, hotGeo, agents, true)
  }

  // ---- Grass patches and extra trees along the site edge.
  const grass = std(C.grass, { roughness: 1 })
  for (const [x, z, w, d] of [[xMin - 18, (zMin + zMax) / 2, 20, zMax - zMin], [xMax + 18, (zMin + zMax) / 2, 20, zMax - zMin]] as const) add(root, new THREE.BoxGeometry(w, 0.1, d), grass, x, 0.05, z, false)

  return { agents, power, steel, extraPlots }
}
