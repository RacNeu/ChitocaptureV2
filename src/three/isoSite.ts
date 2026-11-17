import * as THREE from 'three'
import { box } from './shapes'
import type { Machine } from '../model/types'
import { buildWorld, type Agent } from './isoWorld'

/**
 * Light isometric site: pale ground, white buildings with soft-blue roofs, one simple, readable
 * shape per equipment type. Built in code from the machine list; nothing is downloaded.
 */

export const PLOT_W = 34
export const PLOT_D = 26
export const GAP = 12

export const palette = {
  ground: 0xe9eff7, pad: 0xf6f9fc, road: 0xd5dfeb, dash: 0xffffff, wall: 0xffffff, roof: 0xc9daf0,
  accent: 0xa9c1e0, metal: 0xe2e8f0, glass: 0x8fb1dc, water: 0xbcd8f2, tree: 0xa7d8b9, trunk: 0xc9b8a3,
  edge: 0x9fb4cf, select: 0x2563eb, truck: 0xffffff, cab: 0x3b82f6,
}

export type BuildingHandles = {
  id: string
  group: THREE.Group
  /** Roof and accent materials that take the colour of the chosen measure. */
  tint: THREE.MeshStandardMaterial[]
  outline: THREE.LineSegments
  anchor: THREE.Vector3
  centre: THREE.Vector3
  stacks: THREE.Vector3[]
  baseY: number
}

export type SiteHandles = { root: THREE.Group; buildings: BuildingHandles[]; agents: Agent[]; power: THREE.Group; steel: THREE.Group; size: THREE.Vector3; centre: THREE.Vector3 }

const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...extra })

function mesh(g: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, id: string) {
  const m = new THREE.Mesh(geometry, material)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  m.userData.machineId = id
  g.add(m)
  return m
}

/** Body + coloured roof slab; returns the roof top height. */
const doorMat = std(0x47648f, { roughness: 0.5 }), windowMat = std(0x9dbbe0, { roughness: 0.25 }), bandMat = std(0xdbe7f5)

/** Body + coloured roof slab, with loading doors on the front, a window strip and a wall band. */
function hall(g: THREE.Group, id: string, w: number, h: number, d: number, x: number, z: number, roof: THREE.MeshStandardMaterial, wall: THREE.MeshStandardMaterial) {
  mesh(g, box(w, h, d), wall, x, h / 2, z, id)
  mesh(g, box(w + 0.6, 0.8, d + 0.6), roof, x, h + 0.4, z, id)
  mesh(g, new THREE.BoxGeometry(w + 0.05, 0.8, d + 0.05), bandMat, x, 0.5, z, id)
  const doors = Math.max(1, Math.floor(w / 8))
  for (let i = 0; i < doors; i += 1) {
    const dx = x - w / 2 + (i + 0.5) * (w / doors)
    mesh(g, new THREE.BoxGeometry(Math.min(4, w / doors - 1.5), Math.min(4.2, h * 0.6), 0.2), doorMat, dx, Math.min(4.2, h * 0.6) / 2 + 0.2, z + d / 2 + 0.05, id)
  }
  if (h > 5) mesh(g, new THREE.BoxGeometry(0.1, 0.9, d * 0.8), windowMat, x - w / 2 - 0.03, h - 1.6, z, id)
  return h + 0.8
}

function cylinder(g: THREE.Group, id: string, r: number, h: number, x: number, y: number, z: number, material: THREE.Material, segments = 24) {
  return mesh(g, new THREE.CylinderGeometry(r, r, h, segments), material, x, y + h / 2, z, id)
}

function buildingFor(machine: Machine, emphasis: number): { group: THREE.Group; tint: THREE.MeshStandardMaterial[]; top: number; stacks: THREE.Vector3[]; body: THREE.Box3 } {
  const id = machine.id
  const g = new THREE.Group()
  const roof = std(palette.roof), accent = std(palette.accent), wall = std(palette.wall), metal = std(palette.metal, { roughness: 0.6, metalness: 0.15 }), glass = std(palette.glass, { roughness: 0.3 })
  const tint = [roof, accent]
  const stacks: THREE.Vector3[] = []
  const k = 1 + emphasis * 0.9
  let top = 6
  // A pale pad under every plot.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(PLOT_W, 0.3, PLOT_D), std(palette.pad))
  pad.position.y = 0.15; pad.receiveShadow = true; pad.userData.machineId = id; g.add(pad)
  switch (machine.kind) {
    case 'furnace': case 'kiln': {
      top = hall(g, id, 20, 9 * k, 14, -3, 0, roof, wall)
      const vent = mesh(g, box(7, 0.6, 3.4), std(0xffffff, { emissive: new THREE.Color(0xff7a1a), emissiveIntensity: 1 }), -3, top + 0.3, 0, id)
      vent.userData.glow = true; vent.castShadow = false
      mesh(g, box(8, 5 * k, 9), wall, 10, 2.5 * k, 2, id)
      mesh(g, box(8.4, 0.6, 9.4), accent, 10, 5 * k + 0.3, 2, id)
      for (const [x, z] of [[8, -6], [12, -6]] as const) { cylinder(g, id, 1.1, 18 * k, x, 0, z, metal, 16); stacks.push(new THREE.Vector3(x, 18 * k, z)) }
      top = Math.max(top, 18 * k)
      break
    }
    case 'mill': case 'production-line': {
      top = hall(g, id, 28, 6.5 * k, 10, 0, -2, roof, wall)
      for (let i = -2; i <= 2; i += 1) mesh(g, box(4.4, 1.2, 10.4), accent, i * 5.5, 6.5 * k + 1.2, -2, id)
      mesh(g, box(24, 0.8, 2), metal, 0, 1.2, 8, id)
      break
    }
    case 'boiler': {
      top = hall(g, id, 14, 9 * k, 11, -4, 0, roof, wall)
      cylinder(g, id, 1.2, 16 * k, 8, 0, -4, metal, 16); stacks.push(new THREE.Vector3(8, 16 * k, -4))
      cylinder(g, id, 3, 6, 8, 0, 5, metal)
      top = Math.max(top, 16 * k)
      break
    }
    case 'fan': {
      top = hall(g, id, 12, 5 * k, 10, -6, 0, roof, wall)
      for (const z of [-3, 0.5, 4]) cylinder(g, id, 1.4, 0.8, -6, 5 * k + 0.8, z, accent)
      mesh(g, box(14, 2.2, 2.2), metal, 6, 4, 0, id)
      cylinder(g, id, 1.2, 14 * k, 12, 0, 0, metal, 16); stacks.push(new THREE.Vector3(12, 14 * k, 0))
      top = Math.max(top, 14 * k)
      break
    }
    case 'compressor': case 'pump': {
      top = hall(g, id, 14, 5 * k, 10, -6, 0, roof, wall)
      for (const z of [-4, 4]) { const t = mesh(g, new THREE.CapsuleGeometry(2, 9, 6, 16), metal, 9, 2.6, z, id); t.rotation.z = Math.PI / 2 }
      break
    }
    case 'chiller': case 'cold-room': {
      top = hall(g, id, 18, 5 * k, 12, 0, 0, roof, wall)
      for (const x of [-5, 0, 5]) for (const z of [-3, 3]) cylinder(g, id, 1.6, 0.7, x, 5 * k + 0.8, z, accent)
      break
    }
    case 'genset': {
      top = hall(g, id, 12, 3.4, 5, 0, -3, roof, wall)
      cylinder(g, id, 0.6, 6, 5, 3.4, -3, metal, 12); stacks.push(new THREE.Vector3(5, 9.4, -3))
      mesh(g, box(12, 3.4, 5), wall, 0, 1.7, 5, id)
      break
    }
    case 'solar': {
      const panel = std(0x1e3a8a, { roughness: 0.25, metalness: 0.3 }), frame = std(0xcbd5e1)
      for (let r = -2; r <= 2; r += 1) for (let c = -3; c <= 3; c += 1) {
        const p = mesh(g, new THREE.BoxGeometry(3.6, 0.15, 2.2), panel, c * 4.2, 1.6, r * 4.4, id)
        p.rotation.x = -0.25
        mesh(g, new THREE.BoxGeometry(0.2, 1.4, 0.2), frame, c * 4.2, 0.7, r * 4.4 + 0.6, id)
      }
      top = 3
      break
    }
    case 'battery': {
      for (const [x, z] of [[-8, -4], [0, -4], [8, -4], [-8, 4], [0, 4], [8, 4]] as const) {
        mesh(g, box(6.5, 2.8, 2.6), wall, x, 1.55, z, id)
        mesh(g, new THREE.BoxGeometry(6.6, 0.35, 2.7), std(0x22c55e), x, 2.5, z, id)
      }
      mesh(g, box(4, 3, 3), metal, 13, 1.5, 0, id)
      top = 3.5
      break
    }
    case 'wastewater': {
      for (const x of [-7, 7]) {
        cylinder(g, id, 6, 2, x, 0, 0, wall, 32)
        const water = mesh(g, new THREE.CylinderGeometry(5.4, 5.4, 0.2, 32), std(palette.water, { roughness: 0.2 }), x, 1.95, 0, id)
        water.castShadow = false
      }
      top = 2.5
      break
    }
    case 'office': default: {
      top = hall(g, id, 14, 10 * k, 12, 0, 0, roof, wall)
      for (let f = 1; f <= 3; f += 1) mesh(g, box(14.2, 1, 12.2), glass, 0, f * 2.8 * k, 0, id)
      break
    }
  }
  const body = new THREE.Box3().setFromObject(g)
  return { group: g, tint, top, stacks, body }
}

/** Grid position of a machine's plot (from the machine's column and row). */
export function plotPosition(machine: Machine) {
  return new THREE.Vector3(machine.col * (PLOT_W + GAP), 0, machine.row * (PLOT_D + GAP))
}

export function buildSite(machines: Machine[], emphasis: (id: string) => number): SiteHandles {
  const root = new THREE.Group()
  const buildings: BuildingHandles[] = []
  // Machines without a sensible grid position are placed in a free row.
  const taken = new Set<string>()
  const placed = machines.map((m) => {
    let { col, row } = m
    while (taken.has(`${col},${row}`)) { col += 1; if (col > 5) { col = 0; row += 1 } }
    taken.add(`${col},${row}`)
    return { ...m, col, row }
  })
  for (const machine of placed) {
    const b = buildingFor(machine, emphasis(machine.id))
    const pos = plotPosition(machine)
    b.group.position.copy(pos)
    root.add(b.group)
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLOT_W - 0.5, 0.4, PLOT_D - 0.5)), new THREE.LineBasicMaterial({ color: palette.select, transparent: true, opacity: 0 }))
    edges.position.set(0, 0.4, 0)
    b.group.add(edges)
    buildings.push({ id: machine.id, group: b.group, tint: b.tint, outline: edges, anchor: new THREE.Vector3(pos.x, b.top + 2, pos.z), centre: pos.clone(), stacks: b.stacks.map((s) => s.clone().add(pos)), baseY: 0 })
  }
  const electricity = new Map(placed.map((m) => [m.id, m.electricityMWh]))
  const world = buildWorld(root, placed, electricity)
  const box3 = new THREE.Box3()
  buildings.forEach((b) => box3.expandByPoint(b.centre))
  world.extraPlots.forEach((p) => box3.expandByPoint(new THREE.Vector3(p.col * (PLOT_W + GAP), 0, p.row * (PLOT_D + GAP))))
  box3.expandByScalar(PLOT_W)
  const size = box3.getSize(new THREE.Vector3()), centre = box3.getCenter(new THREE.Vector3())

  // Ground, roads between rows and columns, and a few trees.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 160, size.z + 160), std(palette.ground, { roughness: 1 }))
  ground.rotation.x = -Math.PI / 2; ground.position.set(centre.x, 0, centre.z); ground.receiveShadow = true
  root.add(ground)
  const roadMat = std(palette.road, { roughness: 1 }), dashMat = new THREE.MeshBasicMaterial({ color: palette.dash })
  const cols = new Set([...placed.map((m) => m.col), ...world.extraPlots.map((p) => p.col)]), rows = new Set([...placed.map((m) => m.row), ...world.extraPlots.map((p) => p.row)])
  const minX = box3.min.x, maxX = box3.max.x, minZ = box3.min.z, maxZ = box3.max.z
  const roadsZ = [...rows].map((r) => r * (PLOT_D + GAP) + (PLOT_D + GAP) / 2)
  const roadsX = [...cols].map((c) => c * (PLOT_W + GAP) + (PLOT_W + GAP) / 2)
  const addRoad = (w: number, d: number, x: number, z: number, alongX: boolean) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), roadMat); r.position.set(x, 0.06, z); r.receiveShadow = true; root.add(r)
    const length = alongX ? w : d
    for (let s = -length / 2 + 3; s < length / 2 - 3; s += 7) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 3 : 0.4, 0.05, alongX ? 0.4 : 3), dashMat)
      dash.position.set(alongX ? x + s : x, 0.14, alongX ? z : z + s); root.add(dash)
    }
  }
  const roadZTop = Math.min(...[...rows]) * (PLOT_D + GAP) - (PLOT_D + GAP) / 2
  for (const z of [roadZTop, ...roadsZ]) addRoad(maxX - minX, 8, (minX + maxX) / 2, z, true)
  const roadXLeft = Math.min(...[...cols]) * (PLOT_W + GAP) - (PLOT_W + GAP) / 2
  for (const x of [roadXLeft, ...roadsX]) addRoad(8, maxZ - minZ, x, (minZ + maxZ) / 2, false)
  const treeMat = std(palette.tree), trunkMat = std(palette.trunk)
  for (let i = 0; i < 14; i += 1) {
    const side = i % 2 ? maxZ + 10 : minZ - 10
    const x = minX + (i / 14) * (maxX - minX) + 4
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 2, 8), trunkMat); trunk.position.set(x, 1, side); trunk.castShadow = true; root.add(trunk)
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10), treeMat); crown.position.set(x, 3.6, side); crown.castShadow = true; root.add(crown)
  }

  return { root, buildings, agents: world.agents, power: world.power, steel: world.steel, size, centre }
}

export function disposeSite(object: THREE.Object3D) {
  object.traverse((child) => {
    const m = child as THREE.Mesh
    m.geometry?.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose()
  })
}
