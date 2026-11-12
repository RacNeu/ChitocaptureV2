import * as THREE from 'three'
import { box as roundedBox } from './shapes'
import type { Machine, MachineKind } from '../model/types'
import { textures, worldUVs, type TextureName } from './textures'

/**
 * Procedural factory campus. Every machine gets a plot with an original, simplified
 * "architectural model" of its equipment type. Nothing is loaded from external assets.
 */

export const PLOT_W = 40
export const PLOT_D = 30
export const ROAD = 12

export type PlotHandles = {
  machineId: string
  group: THREE.Group
  /** Materials that get tinted in heatmap mode. */
  tintable: THREE.MeshStandardMaterial[]
  baseColours: THREE.Color[]
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  beacon: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>
  emitters: THREE.Vector3[]
  /** World position for the floating label. */
  labelAnchor: THREE.Vector3
  centre: THREE.Vector3
}

/** Each material role has a realistic look and a digital-twin look. */
const looks = {
  wall:    { real: 0xe8e5de, twin: 0x2f6fb0 },
  wall2:   { real: 0xd6d2c8, twin: 0x2a64a2 },
  brick:   { real: 0xb0634a, twin: 0x2f6fb0 },
  roof:    { real: 0x9aa2a9, twin: 0x3a7cc0 },
  metal:   { real: 0xc7ccd1, twin: 0x3470ae },
  dark:    { real: 0x4f5862, twin: 0x1d4573 },
  glass:   { real: 0x5d7f99, twin: 0x2f6fb0 },
  water:   { real: 0x3f8aa0, twin: 0x1d4f7a },
  grass:   { real: 0x5e9a43, twin: 0x10243a },
  concrete:{ real: 0xc9c9c4, twin: 0x10243a },
  asphalt: { real: 0x4b5056, twin: 0x0a1828 },
  ground:  { real: 0xe4e9ec, twin: 0x060e19 },
  tree:    { real: 0x4e8f39, twin: 0x10243a },
  trunk:   { real: 0x7a6650, twin: 0x10243a },
  marking: { real: 0xf2f2ee, twin: 0x10243a },
  band:    { real: 0xc9473f, twin: 0x2f6fb0 },
  fence:   { real: 0xf0f0ee, twin: 0x10243a },
  lamp:    { real: 0xb9bfc5, twin: 0x10243a },
} as const
export type Role = keyof typeof looks

export type ThemedEntry = { material: THREE.MeshStandardMaterial; real: THREE.Color; twinBase: THREE.Color; twin: THREE.Color; x: number; plotId?: string; map: THREE.Texture | null; detail: boolean }

/** Decorative roles that the pure model look hides. */
const detailRoles = new Set<Role>(['tree', 'trunk', 'marking', 'fence', 'band', 'glass', 'lamp'])
/** Realistic-look texture and tile size (metres) per role. */
const roleTextures: Partial<Record<Role, [TextureName, number]>> = {
  brick: ['brick', 3], wall: ['panels', 9], wall2: ['plaster', 6], roof: ['corrugated', 2.5], metal: ['metal', 4],
  grass: ['grass', 8], asphalt: ['asphalt', 10], concrete: ['slabs', 6],
}

/** Filled during a build; Plant3D blends every entry between its two looks. */
let registry: ThemedEntry[] = []
let currentPlot: string | undefined
let currentX = 0

function mat(role: Role, options: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const look = looks[role]
  const textured = roleTextures[role]
  const map = textured ? textures[textured[0]]() : null
  const material = new THREE.MeshStandardMaterial({ color: look.real, roughness: 0.8, metalness: 0.05, map, ...options })
  if (textured) material.userData.uvUnit = textured[1]
  if (detailRoles.has(role)) material.userData.detail = true
  registry.push({ material, real: new THREE.Color(look.real), twinBase: new THREE.Color(look.twin), twin: new THREE.Color(look.twin), x: currentX, plotId: currentPlot, map, detail: detailRoles.has(role) })
  return material
}

export const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xd6ecff, transparent: true, opacity: 0 })

type Builder = { group: THREE.Group; tintable: THREE.MeshStandardMaterial[]; emitters: THREE.Vector3[]; top: number }

function builder(): Builder { return { group: new THREE.Group(), tintable: [], emitters: [], top: 0 } }

function add(b: Builder, geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, x: number, y: number, z: number, edges = true, tint = true) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(x, y, z)
  mesh.castShadow = true
  mesh.receiveShadow = true
  if (edges && !material.userData.detail) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), edgeMaterial))
  if (tint && !b.tintable.includes(material)) b.tintable.push(material)
  b.group.add(mesh)
  geometry.computeBoundingBox()
  b.top = Math.max(b.top, y + (geometry.boundingBox?.max.y ?? 0))
  return mesh
}

const box = (b: Builder, w: number, h: number, d: number, x: number, z: number, m: THREE.MeshStandardMaterial, y = 0) => add(b, roundedBox(w, h, d), m, x, y + h / 2, z)
const cyl = (b: Builder, r: number, h: number, x: number, z: number, m: THREE.MeshStandardMaterial, y = 0, seg = 24) => add(b, new THREE.CylinderGeometry(r, r, h, seg), m, x, y + h / 2, z, true)

function gableRoof(b: Builder, w: number, d: number, rise: number, x: number, z: number, y: number, m: THREE.MeshStandardMaterial, alongX = true) {
  const shape = new THREE.Shape()
  const span = alongX ? d : w
  shape.moveTo(-span / 2, 0); shape.lineTo(span / 2, 0); shape.lineTo(0, rise); shape.closePath()
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: alongX ? w : d, bevelEnabled: false })
  geometry.translate(0, 0, -(alongX ? w : d) / 2)
  const mesh = add(b, geometry, m, x, y, z)
  if (alongX) mesh.rotation.y = Math.PI / 2
  return mesh
}

function stack(b: Builder, x: number, z: number, height: number, radius: number, m: THREE.MeshStandardMaterial, y = 0) {
  add(b, new THREE.CylinderGeometry(radius * 0.8, radius, height, 16), m, x, y + height / 2, z)
  // Two red-and-white aviation bands near the top, like real tall stacks.
  const band = mat('band')
  add(b, new THREE.CylinderGeometry(radius * 0.83, radius * 0.85, 1.2, 16), band, x, y + height - 2.5, z, false, false)
  b.emitters.push(new THREE.Vector3(x, y + height + 0.5, z))
}

function coolingTower(b: Builder, x: number, z: number, height: number, radius: number, m: THREE.MeshStandardMaterial) {
  const points: THREE.Vector2[] = []
  for (let i = 0; i <= 20; i += 1) {
    const t = i / 20
    const waist = 0.62 + 0.38 * ((t - 0.68) / 0.68) ** 2
    points.push(new THREE.Vector2(radius * Math.min(1, waist), t * height))
  }
  const geometry = new THREE.LatheGeometry(points, 40)
  const mesh = add(b, geometry, m, x, 0, z, false)
  ;(mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide
  b.emitters.push(new THREE.Vector3(x, height + 1, z))
}

function silo(b: Builder, x: number, z: number, r: number, h: number, m: THREE.MeshStandardMaterial) {
  cyl(b, r, h, x, z, m)
  add(b, new THREE.ConeGeometry(r, r * 0.6, 24), m, x, h + r * 0.3, z, false)
}

function tank(b: Builder, x: number, z: number, r: number, h: number, m: THREE.MeshStandardMaterial) {
  cyl(b, r, h, x, z, m)
  add(b, new THREE.SphereGeometry(r, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2), m, x, h, z, false)
}

function pipe(b: Builder, from: THREE.Vector3, to: THREE.Vector3, r: number, m: THREE.MeshStandardMaterial) {
  const length = from.distanceTo(to)
  const geometry = new THREE.CylinderGeometry(r, r, length, 10)
  const mesh = add(b, geometry, m, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, false)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize())
}

function windows(b: Builder, w: number, d: number, floors: number, floorH: number, x: number, z: number) {
  const glass = mat('glass', { roughness: 0.25, metalness: 0.4 })
  for (let f = 0; f < floors; f += 1) add(b, roundedBox(w + 0.08, floorH * 0.38, d + 0.08), glass, x, f * floorH + floorH * 0.55, z, false, false)
}

/** One builder per machine kind. All fit inside roughly 36 × 26 units. */
const archetypes: Record<MachineKind, (b: Builder, m: () => THREE.MeshStandardMaterial) => void> = {
  kiln: (b, m) => {
    const clay = m(), metal = mat('metal', { metalness: 0.35 })
    b.tintable.push(metal)
    box(b, 7, 22, 7, -12, -4, clay)
    box(b, 8, 3, 8, -12, -4, clay, 22)
    stack(b, -7, -9, 34, 1.4, m())
    const kilnBody = add(b, new THREE.CylinderGeometry(1.8, 1.8, 26, 24), metal, 3, 4.6, -1)
    kilnBody.rotation.z = Math.PI / 2 - 0.05
    for (const px of [-6, 3, 12]) box(b, 2, 3.4, 3.4, px, -1, clay)
    silo(b, 12, 8, 3, 13, m()); silo(b, 5, 9, 3, 13, clay)
    box(b, 10, 6, 6, -10, 9, clay)
    gableRoof(b, 10, 6, 2, -10, 9, 6, mat('roof'))
  },
  boiler: (b, m) => {
    const clay = m()
    box(b, 16, 11, 12, -4, 0, clay)
    gableRoof(b, 16, 12, 3, -4, 0, 11, mat('roof'))
    stack(b, 8, -6, 26, 1.3, m())
    tank(b, 9, 7, 2.6, 7, mat('metal'))
    tank(b, 14, 2, 2.6, 7, mat('metal'))
    pipe(b, new THREE.Vector3(4, 8, -2), new THREE.Vector3(8, 8, -6), 0.4, mat('metal'))
  },
  furnace: (b, m) => {
    const clay = m()
    box(b, 26, 8, 11, -2, 0, clay)
    gableRoof(b, 26, 11, 2.5, -2, 0, 8, mat('roof'))
    stack(b, -10, -8, 18, 1, m()); stack(b, 6, -8, 18, 1, m())
  },
  genset: (b, m) => {
    for (const [i, x] of [-10, -2, 6].entries()) { box(b, 6, 3, 2.6, x, -2, m()); stack(b, x + 2, -4, 7, 0.4, m()); if (i === 0) tank(b, 13, 6, 2, 4, mat('metal')) }
    box(b, 8, 4, 6, -6, 8, m())
  },
  mill: (b, m) => {
    const clay = m()
    box(b, 14, 15, 11, -8, 0, clay)
    gableRoof(b, 14, 11, 2.5, -8, 0, 15, mat('roof'))
    silo(b, 7, -6, 3.2, 16, m()); silo(b, 14, -6, 3.2, 16, clay); silo(b, 10.5, 3, 3.2, 16, m())
    const conveyor = add(b, roundedBox(16, 1, 1.4), mat('metal'), 2, 13, 6)
    conveyor.rotation.z = 0.35
  },
  fan: (b, m) => {
    const clay = m(), metal = mat('metal', { metalness: 0.4 })
    b.tintable.push(metal)
    const housing = add(b, new THREE.CylinderGeometry(4, 4, 3, 28), metal, -4, 4.5, 0)
    housing.rotation.x = Math.PI / 2
    box(b, 4, 4, 3.2, -10, 0, clay)
    box(b, 12, 2.4, 2.4, 5, 0, metal, 3.2)
    stack(b, 12, 0, 16, 1.4, m())
    box(b, 8, 5, 7, -8, 9, clay)
  },
  pump: (b, m) => {
    const clay = m()
    box(b, 12, 6, 9, -6, 0, clay)
    gableRoof(b, 12, 9, 2, -6, 0, 6, mat('roof'))
    tank(b, 9, 3, 4, 6, mat('metal'))
    pipe(b, new THREE.Vector3(0, 2, 0), new THREE.Vector3(9, 2, 3), 0.6, mat('metal'))
  },
  compressor: (b, m) => {
    const clay = m()
    box(b, 18, 6, 10, -5, -2, clay)
    gableRoof(b, 18, 10, 1.8, -5, -2, 6, mat('roof'))
    cyl(b, 1.3, 8, 9, -4, mat('metal')); cyl(b, 1.3, 8, 13, -4, mat('metal'))
    pipe(b, new THREE.Vector3(4, 4, -2), new THREE.Vector3(9, 4, -4), 0.35, mat('metal'))
    box(b, 6, 3, 5, 10, 8, m())
  },
  chiller: (b, m) => {
    const clay = m()
    box(b, 18, 7, 12, -6, -2, clay)
    for (let i = 0; i < 4; i += 1) cyl(b, 1.3, 0.8, -12 + i * 4, 0, mat('dark'), 7)
    coolingTower(b, 11, 2, 18, 6, m())
  },
  'cold-room': (b, m) => {
    const clay = m()
    box(b, 22, 9, 14, -2, 0, clay)
    for (let i = 0; i < 6; i += 1) box(b, 0.4, 9.1, 14.1, -12 + i * 4, 0, mat('wall2'), 0)
    box(b, 6, 4, 4, 14, -6, m())
  },
  'production-line': (b, m) => {
    const clay = m()
    box(b, 32, 7, 18, 0, 0, clay)
    for (let i = 0; i < 4; i += 1) gableRoof(b, 8, 18, 2.4, -12 + i * 8, 0, 7, mat('roof'), false)
    box(b, 6, 4, 6, 13, -13, m())
  },
  wastewater: (b, m) => {
    const water = mat('water', { roughness: 0.15, metalness: 0.2 })
    for (const [x, z, r] of [[-9, -3, 7], [6, -4, 6], [-2, 8, 4.5]] as const) {
      const wall = m()
      add(b, new THREE.CylinderGeometry(r, r, 2, 40, 1, true), wall, x, 1, z, false)
      ;(wall as THREE.MeshStandardMaterial).side = THREE.DoubleSide
      add(b, new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.2, 40), water, x, 1.6, z, false, false)
    }
    box(b, 8, 4, 6, 12, 8, m())
  },
  office: (b, m) => {
    const clay = m()
    box(b, 18, 12, 11, -5, -3, clay)
    windows(b, 18, 11, 3, 4, -5, -3)
    box(b, 8, 4, 9, 10, -3, m())
    for (let i = 0; i < 6; i += 1) box(b, 0.3, 0.05, 4, 4 + i * 2.6, 9, mat('marking'), 0)
  },
}

function treeAt(group: THREE.Group, x: number, z: number, scale = 1) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, 1.6 * scale, 6), mat('trunk'))
  trunk.position.set(x, 0.8 * scale, z)
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * scale, 0), mat('tree', { flatShading: true }))
  crown.position.set(x, 2.6 * scale, z)
  trunk.castShadow = crown.castShadow = true
  group.add(trunk, crown)
}

export function plotCentre(machine: Machine, cols: number, rows: number) {
  const x = machine.col * (PLOT_W + ROAD) - (cols - 1) * (PLOT_W + ROAD) / 2
  const z = machine.row * (PLOT_D + ROAD) - (rows - 1) * (PLOT_D + ROAD) / 2
  return new THREE.Vector3(x, 0, z)
}

export function buildCampus(machines: Machine[]) {
  registry = []
  currentPlot = undefined
  // Site-wide surfaces (roads, ground, fence) change when the sweep is half-way across.
  currentX = 0.5
  const root = new THREE.Group()
  const cols = Math.max(2, ...machines.map((machine) => machine.col + 1))
  const rows = Math.max(1, ...machines.map((machine) => machine.row + 1))
  const siteW = cols * (PLOT_W + ROAD) + ROAD, siteD = rows * (PLOT_D + ROAD) + ROAD

  // Site slab, perimeter road and lane markings.
  const asphalt = new THREE.Mesh(roundedBox(siteW + 24, 1, siteD + 24), mat('asphalt', { roughness: 0.95 }))
  asphalt.position.y = -0.55; asphalt.receiveShadow = true
  root.add(asphalt)
  const grass = new THREE.Mesh(roundedBox(siteW + 60, 0.6, siteD + 60), mat('ground', { roughness: 1 }))
  grass.position.y = -1.1; grass.receiveShadow = true
  root.add(grass)
  const marking = mat('marking')
  for (let x = -siteW / 2; x < siteW / 2; x += 6) {
    for (let r = 0; r <= rows; r += 1) {
      const dash = new THREE.Mesh(roundedBox(2.6, 0.05, 0.35), marking)
      dash.position.set(x, 0.01, -siteD / 2 + ROAD / 2 + r * (PLOT_D + ROAD))
      root.add(dash)
    }
  }

  // Pipe rack along the central road, linking the plots like a real process plant.
  const rackMat = mat('metal', { metalness: 0.35 })
  const rackZ = rows > 1 ? -siteD / 2 + ROAD / 2 + (PLOT_D + ROAD) : -siteD / 2 + ROAD / 2
  for (let x = -siteW / 2 + 8; x <= siteW / 2 - 8; x += 8) {
    for (const dz of [-1.6, 1.6]) {
      const post = new THREE.Mesh(roundedBox(0.4, 6, 0.4), rackMat)
      post.position.set(x, 3, rackZ + dz); post.castShadow = true
      root.add(post)
    }
  }
  for (const [dy, dz, r, colour] of [[6.2, -0.8, 0.45, 'metal'], [6.2, 0.4, 0.35, 'band'], [6.9, 0, 0.3, 'metal']] as const) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(r, r, siteW - 16, 10), mat(colour, { metalness: 0.3 }))
    run.rotation.z = Math.PI / 2; run.position.set(0, dy, rackZ + dz); run.castShadow = true
    root.add(run)
  }

  // Tree lines along the site edge.
  for (let x = -siteW / 2 - 6; x <= siteW / 2 + 6; x += 9) { treeAt(root, x, -siteD / 2 - 8, 1.1); treeAt(root, x + 4, siteD / 2 + 8, 1.1) }
  for (let z = -siteD / 2; z <= siteD / 2; z += 9) { treeAt(root, -siteW / 2 - 8, z, 1.1); treeAt(root, siteW / 2 + 8, z + 4, 1.1) }

  // Perimeter fence and street lamps.
  const fence = mat('fence')
  const fenceW = siteW + 20, fenceD = siteD + 20
  for (let x = -fenceW / 2; x <= fenceW / 2; x += 5) for (const z of [-fenceD / 2, fenceD / 2]) { const post = new THREE.Mesh(roundedBox(0.3, 2.2, 0.3), fence); post.position.set(x, 1.1, z); root.add(post) }
  for (let z = -fenceD / 2; z <= fenceD / 2; z += 5) for (const x of [-fenceW / 2, fenceW / 2]) { const post = new THREE.Mesh(roundedBox(0.3, 2.2, 0.3), fence); post.position.set(x, 1.1, z); root.add(post) }
  for (const z of [-fenceD / 2, fenceD / 2]) { const rail = new THREE.Mesh(roundedBox(fenceW, 0.12, 0.12), fence); rail.position.set(0, 1.9, z); root.add(rail) }
  for (const x of [-fenceW / 2, fenceW / 2]) { const rail = new THREE.Mesh(roundedBox(0.12, 0.12, fenceD), fence); rail.position.set(x, 1.9, 0); root.add(rail) }
  const lamp = mat('lamp')
  for (let x = -siteW / 2 + 4; x <= siteW / 2; x += 16) for (let r = 0; r <= rows; r += 1) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 5, 6), lamp)
    pole.position.set(x, 2.5, -siteD / 2 + ROAD / 2 + r * (PLOT_D + ROAD) - 4.5)
    root.add(pole)
  }

  const minX = -siteW / 2, spanX = siteW
  const heavy = new Set(['kiln', 'boiler', 'furnace', 'mill', 'genset'])
  const plots: PlotHandles[] = machines.map((machine) => {
    const centre = plotCentre(machine, cols, rows)
    currentPlot = machine.id
    currentX = (centre.x - minX) / spanX
    const b = builder()
    // Heavy-industry buildings are brick in the realistic look; others are rendered concrete.
    const shared = mat(heavy.has(machine.kind) ? 'brick' : 'wall')
    let toggle = false
    // Alternate two tones so neighbouring buildings read as separate volumes.
    const clayFactory = () => { toggle = !toggle; return toggle ? shared : mat('wall2') }
    archetypes[machine.kind](b, clayFactory)

    const pad = new THREE.Mesh(roundedBox(PLOT_W, 0.5, PLOT_D), mat('grass', { roughness: 0.9 }))
    pad.position.y = -0.2; pad.receiveShadow = true
    b.group.add(pad)
    // Concrete apron in front of the buildings.
    const apron = new THREE.Mesh(roundedBox(PLOT_W - 4, 0.52, 7), mat('concrete'))
    apron.position.set(0, -0.19, PLOT_D / 2 - 5); apron.receiveShadow = true
    b.group.add(apron)
    if (machine.kind === 'office') {
      const stripe = mat('marking')
      for (let i = 0; i < 10; i += 1) { const line = new THREE.Mesh(roundedBox(0.2, 0.05, 4), stripe); line.position.set(-15 + i * 3, 0.1, PLOT_D / 2 - 5); b.group.add(line) }
    }
    for (const [tx, tz] of [[-PLOT_W / 2 + 2, PLOT_D / 2 - 2], [PLOT_W / 2 - 2, PLOT_D / 2 - 2], [-PLOT_W / 2 + 2, -PLOT_D / 2 + 2]]) treeAt(b.group, tx, tz, 0.8)

    // Glowing outline around the plot, coloured by emissions.
    const ringShape = new THREE.Shape()
    ringShape.moveTo(-PLOT_W / 2, -PLOT_D / 2); ringShape.lineTo(PLOT_W / 2, -PLOT_D / 2); ringShape.lineTo(PLOT_W / 2, PLOT_D / 2); ringShape.lineTo(-PLOT_W / 2, PLOT_D / 2); ringShape.closePath()
    const hole = new THREE.Path()
    hole.moveTo(-PLOT_W / 2 + 0.7, -PLOT_D / 2 + 0.7); hole.lineTo(-PLOT_W / 2 + 0.7, PLOT_D / 2 - 0.7); hole.lineTo(PLOT_W / 2 - 0.7, PLOT_D / 2 - 0.7); hole.lineTo(PLOT_W / 2 - 0.7, -PLOT_D / 2 + 0.7); hole.closePath()
    ringShape.holes.push(hole)
    const ring = new THREE.Mesh(new THREE.ShapeGeometry(ringShape), new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.9 }))
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08
    b.group.add(ring)

    // Light beam whose height shows the share of emissions.
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x3ddc97, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
    beacon.position.set(PLOT_W / 2 - 3, 0.5, -PLOT_D / 2 + 3)
    b.group.add(beacon)

    b.group.position.copy(centre)
    b.group.traverse((object) => { object.userData.machineId = machine.id })
    root.add(b.group)
    return {
      machineId: machine.id,
      group: b.group,
      tintable: b.tintable,
      baseColours: b.tintable.map((material) => material.color.clone()),
      ring,
      beacon,
      emitters: b.emitters.map((point) => point.clone().add(centre)),
      labelAnchor: new THREE.Vector3(centre.x, b.top + 6, centre.z),
      centre,
    }
  })

  currentPlot = undefined
  // Give every textured surface world-scale UVs so texture detail is consistent in size.
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const material = mesh.material as THREE.MeshStandardMaterial | undefined
    if (mesh.isMesh && material?.userData?.uvUnit && !mesh.geometry.userData.worldUV) {
      worldUVs(mesh.geometry, material.userData.uvUnit)
      mesh.geometry.userData.worldUV = true
    }
  })
  const themed = registry
  registry = []
  return { root, plots, themed, size: Math.max(siteW, siteD), minX, spanX }
}

export function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh
    mesh.geometry?.dispose()
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(material)) material.forEach((item) => item.dispose()); else material?.dispose()
  })
}
