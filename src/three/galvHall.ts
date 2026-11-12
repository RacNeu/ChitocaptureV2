import * as THREE from 'three'
import { box } from './shapes'
import type { GalvUnitId } from '../model/galv'
import { textures, worldUVs } from './textures'

/**
 * A procedural 3D wire drawing & galvanising plant. The front of the hall is cut away. Back of the
 * hall: rod yard, rod pickling and two rows of multi-die drawing machines. Front: four continuous
 * galvanising lines running left to right, each carrying 40 wires through pay-off → annealing
 * furnace → quench → acid → rinse → flux → dryer → zinc kettle → wiping → cooling → take-up.
 */

export type GalvHallHandles = {
  root: THREE.Group
  units: Map<GalvUnitId, { group: THREE.Group; anchor: THREE.Vector3 }>
  /** Capstans of each drawing machine, spun while the machine draws. */
  capstans: THREE.Mesh[][]
  machineLamps: THREE.MeshStandardMaterial[]
  /** Moving wire bands, one per galvanising line. */
  wires: THREE.Texture[]
  annealGlow: THREE.MeshStandardMaterial[]
  zincGlow: THREE.MeshStandardMaterial[]
  burnerGlow: THREE.MeshStandardMaterial[]
  takeups: THREE.Mesh[]
  hoist: THREE.Group
  forklifts: { group: THREE.Group; path: THREE.CatmullRomCurve3; speed: number }[]
  crane: THREE.Group
  /** Centre of line 1's zinc kettle, for the zoom-in. */
  kettleAnchor: THREE.Vector3
  flows: { mesh: THREE.Mesh; texture: THREE.Texture; kind: 'power' | 'gas'; unit: GalvUnitId }[]
  stacks: { origin: THREE.Vector3; unit: 'anneal' | 'kettle' | 'pickling' }[]
}

export const LINE_Z = [6, 12, 18, 24]
export const DRAW_ROWS = [-24, -13]

const m = (color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...options })

/** 40 thin bright wires side by side, with faint marks so their movement shows. */
function wireTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128; canvas.height = 64
  const context = canvas.getContext('2d')!
  context.clearRect(0, 0, 128, 64)
  for (let k = 0; k < 20; k += 1) {
    const y = 1 + k * 3.15
    context.fillStyle = '#dfe6ec'
    context.fillRect(0, y, 128, 1.8)
    context.fillStyle = '#ffffff'
    context.fillRect((k * 37) % 128, y - 0.3, 14, 2.4)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

export function buildGalvHall(): GalvHallHandles {
  const root = new THREE.Group()
  const units = new Map<GalvUnitId, { group: THREE.Group; anchor: THREE.Vector3 }>()
  const unit = (id: GalvUnitId, anchor: THREE.Vector3) => {
    const group = new THREE.Group()
    group.userData.unitId = id
    root.add(group)
    units.set(id, { group, anchor })
    return group
  }
  const put = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = shadow
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  const darkSteel = m(0x3a4048, { metalness: 0.5, roughness: 0.45 })
  const grey = m(0x8c949c, { metalness: 0.3 })
  const white = m(0xe6e8ea)
  const green = m(0x2f8f5b, { roughness: 0.5 })
  const yellow = m(0xf2c230, { roughness: 0.5 })
  const rodRust = m(0x5a4a40, { metalness: 0.4, roughness: 0.8 })
  const wireSilver = m(0xd5dce3, { metalness: 0.35, roughness: 0.35, emissive: new THREE.Color(0x2a3038) })
  const brick = m(0x8a4b35, { roughness: 0.9 })
  const liquid = (color: number, emissive = 0x000000) => m(color, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85, emissive: new THREE.Color(emissive) })

  /* ---- Site layout: two open-sided sawtooth sheds offset across a paved yard ----
     Unlike the steel mill's single long hall, the wire plant is a drawing shed (back left) and a
     galvanising shed (front right), with paved yards in between. */
  put(root, box(320, 0.6, 180), m(0x3b4148, { roughness: 1 }), 0, -1.1, 0, false)
  const yard = m(0x6b7178, { roughness: 1 })
  put(root, box(200, 0.4, 72), yard, 0, -0.75, 0, false)
  const shedSteel = m(0x2f8f5b, { metalness: 0.35, roughness: 0.5 })
  const glazing = m(0xbfe3f2, { transparent: true, opacity: 0.45, emissive: new THREE.Color(0x4a7a8c), emissiveIntensity: 0.5, side: THREE.DoubleSide })
  const shedWall = m(0xdfe7e2, { map: textures.corrugated(), side: THREE.DoubleSide })
  /** An open-sided shed: epoxy floor, low walls on three sides, columns and a sawtooth roof frame. */
  const shed = (x0: number, x1: number, z0: number, z1: number, floorColor: number, openLeft = false) => {
    const floor = box(x1 - x0, 0.6, z1 - z0)
    worldUVs(floor, 8)
    put(root, floor, m(floorColor, { map: textures.slabs(), roughness: 0.85 }), (x0 + x1) / 2, -0.3, (z0 + z1) / 2, false)
    const back = box(x1 - x0, 3.5, 0.4)
    worldUVs(back, 2.5)
    put(root, back, shedWall, (x0 + x1) / 2, 1.75, z0, false)
    for (const x of openLeft ? [x1] : [x0, x1]) { const side = box(0.4, 3.5, z1 - z0); worldUVs(side, 2.5); put(root, side, shedWall, x, 1.75, (z0 + z1) / 2, false) }
    for (let x = x0; x <= x1 + 0.1; x += 12) {
      for (const z of [z0, z1]) put(root, box(0.8, 11, 0.8), shedSteel, x, 5.5, z)
      if (x + 12 > x1 + 0.1) continue
      // Sawtooth: a vertical glazed face, then a roof slope falling to the next bay.
      put(root, box(0.3, 3, z1 - z0), glazing, x + 0.2, 12.5, (z0 + z1) / 2, false).castShadow = false
      for (let z = z0; z <= z1 + 0.1; z += 8) {
        const rafter = put(root, box(12.4, 0.35, 0.35), shedSteel, x + 6, 12.5, Math.min(z, z1), false)
        rafter.rotation.z = Math.atan2(3, 12)
        put(root, box(0.35, 3, 0.35), shedSteel, x, 12.5, Math.min(z, z1), false)
      }
    }
    for (const z of [z0, z1]) put(root, box(x1 - x0, 0.5, 0.5), shedSteel, (x0 + x1) / 2, 11, z, false)
  }
  shed(-100, -4, -35, -3, 0xb2bcc5)
  shed(-4, 100, 1, 35, 0xbccfc1, true)

  /* ---- Rod yard: coils of 5.5 mm wire rod from the steel mill ---- */
  const coilGeometry = new THREE.TorusGeometry(1.1, 0.42, 10, 24)
  for (let k = 0; k < 12; k += 1) {
    const coil = put(root, coilGeometry, rodRust, -94 + (k % 3) * 3, 0.45 + Math.floor(k / 6) * 0.9, -22 + (Math.floor(k / 3) % 2) * 3.2)
    coil.rotation.x = Math.PI / 2
  }
  for (let k = 0; k < 6; k += 1) put(root, coilGeometry, rodRust, -86 + (k % 3) * 3, 0.45, -10 + Math.floor(k / 3) * 3.2).rotation.x = Math.PI / 2

  /* ---- Rod pickling: acid, rinse and coating tanks with a coil hoist ---- */
  const pickling = unit('pickling', new THREE.Vector3(-66, 13, -16))
  const tanks: [number, number][] = [[0xc8d24a, 0x2a2a00], [0xc8d24a, 0x2a2a00], [0x6fb7d9, 0], [0xe9e5d6, 0]]
  tanks.forEach(([color, glow], index) => {
    const x = -76 + index * 5.5
    put(pickling, box(4.6, 2.6, 6), m(0x3d4650, { roughness: 0.6 }), x, 1.3, -16)
    put(pickling, box(4.2, 0.1, 5.6), liquid(color, glow), x, 2.62, -16, false)
  })
  put(pickling, box(24, 0.6, 0.6), yellow, -68, 9, -12.5)
  put(pickling, box(24, 0.6, 0.6), yellow, -68, 9, -19.5)
  for (const x of [-80, -56]) for (const z of [-12.5, -19.5]) put(pickling, box(0.5, 9, 0.5), yellow, x, 4.5, z)
  const hoist = new THREE.Group()
  put(hoist, box(1.6, 0.8, 7.6), darkSteel, 0, 9, -16)
  put(hoist, new THREE.CylinderGeometry(0.06, 0.06, 5, 6), darkSteel, 0, 6.4, -16)
  const hoistCoil = put(hoist, coilGeometry, rodRust, 0, 3.6, -16)
  hoistCoil.rotation.y = Math.PI / 2
  hoist.position.x = -76
  pickling.add(hoist)
  // Acid fume scrubber.
  put(pickling, new THREE.CylinderGeometry(1.6, 1.6, 9, 16), m(0x2f7d8f), -60, 4.5, -28)
  put(pickling, new THREE.CylinderGeometry(0.5, 0.5, 8, 10), white, -60, 13, -28)

  /* ---- Drawing bay: two rows of 7 multi-die dry drawing machines ---- */
  const drawing = unit('drawing', new THREE.Vector3(-26, 11, -18))
  const capstans: THREE.Mesh[][] = []
  const machineLamps: THREE.MeshStandardMaterial[] = []
  const capstanGeometry = new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16)
  const capstanMat = m(0xc7ced5, { metalness: 0.8, roughness: 0.25 })
  for (let row = 0; row < 2; row += 1) {
    for (let k = 0; k < 7; k += 1) {
      const x = -46 + k * 6.4, z = DRAW_ROWS[row]
      put(drawing, box(5.6, 1.4, 2.4), m(0x2f6fb0, { roughness: 0.5 }), x, 0.7, z)
      // Die boxes and capstans: the wire thins and speeds up from left to right.
      const drums: THREE.Mesh[] = []
      for (let d = 0; d < 8; d += 1) {
        put(drawing, box(0.35, 0.5, 0.5), darkSteel, x - 2.5 + d * 0.66, 1.65, z + 0.7)
        const drum = put(drawing, capstanGeometry, capstanMat, x - 2.3 + d * 0.66, 1.85, z)
        drum.scale.setScalar(1 - d * 0.04)
        // A band of wire wound on each capstan, with a mark so the spin is visible.
        put(drum, new THREE.CylinderGeometry(0.57, 0.57, 0.35, 16), wireSilver, 0, 0.1, 0, false)
        put(drum, box(0.12, 0.92, 0.2), m(0x1f2937), 0.5, 0, 0, false)
        drums.push(drum)
      }
      capstans.push(drums)
      // Rod pay-off coil and finished spool.
      put(drawing, coilGeometry, rodRust, x - 4.2, 0.45, z).rotation.x = Math.PI / 2
      put(drawing, new THREE.CylinderGeometry(0.9, 0.9, 1.4, 16), wireSilver, x + 3.6, 0.7, z)
      const lamp = m(0x22c55e, { emissive: new THREE.Color(0x22c55e), emissiveIntensity: 1.5 })
      put(drawing, new THREE.SphereGeometry(0.22, 10, 8), lamp, x + 2.6, 2.6, z - 0.9, false)
      put(drawing, new THREE.CylinderGeometry(0.05, 0.05, 1, 6), darkSteel, x + 2.6, 2, z - 0.9, false)
      machineLamps.push(lamp)
    }
  }

  /* ---- Galvanising lines ---- */
  const anneal = unit('anneal', new THREE.Vector3(17, 9, 15))
  const kettle = unit('kettle', new THREE.Vector3(47, 10, 15))
  const wires: THREE.Texture[] = []
  const annealGlow: THREE.MeshStandardMaterial[] = []
  const zincGlow: THREE.MeshStandardMaterial[] = []
  const burnerGlow: THREE.MeshStandardMaterial[] = []
  const takeups: THREE.Mesh[] = []
  for (const z of LINE_Z) {
    // Pay-off: rows of drawn-wire coils feeding the line.
    for (let k = 0; k < 5; k += 1) put(anneal, new THREE.CylinderGeometry(0.75, 0.75, 1, 14), wireSilver, 1 + k * 0.1, 0.5 + k * 0.05, z - 1.6 + k * 0.8).scale.set(1, 0.9, 1)
    // The 40 wires as one moving band from pay-off to take-up.
    const texture = wireTexture()
    texture.repeat.set(30, 1)
    const band = put(root, new THREE.PlaneGeometry(86, 1.5), new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false }), 47, 1.95, z, false)
    band.rotation.x = -Math.PI / 2
    wires.push(texture)
    // Annealing furnace: a long refractory muffle with glowing firing slots.
    put(anneal, box(18, 3.4, 3), brick, 17, 1.7, z)
    const glow = m(0xff7a1a, { emissive: new THREE.Color(0xff5a00), emissiveIntensity: 1.6, roughness: 0.4 })
    for (let k = 0; k < 6; k += 1) put(anneal, box(1.8, 0.12, 1.6), glow, 10 + k * 2.8, 3.43, z, false)
    annealGlow.push(glow)
    // Quench, acid, rinse, flux, dryer.
    const bath = (x: number, w: number, color: number, glowColor = 0) => {
      put(kettle, box(w, 1.6, 2.4), m(0x3d4650, { roughness: 0.6 }), x, 0.8, z)
      put(kettle, box(w - 0.3, 0.08, 2.1), liquid(color, glowColor), x, 1.62, z, false)
    }
    bath(28, 2, 0x5aa9e6)
    bath(31.5, 3.4, 0xc8d24a, 0x2a2a00)
    bath(34.6, 1.6, 0x5aa9e6)
    bath(37.2, 2.6, 0xb7e4c7)
    put(kettle, box(3.4, 2.2, 2.6), m(0x6b7280), 40.6, 1.1, z)
    // Zinc kettle with burners and a fume hood.
    put(kettle, box(6.4, 2.6, 3.4), m(0x30363d, { metalness: 0.5 }), 46, 1.3, z)
    const zinc = m(0xc9d4de, { metalness: 0.9, roughness: 0.18, emissive: new THREE.Color(0x6a5a50), emissiveIntensity: 0.4 })
    put(kettle, box(6, 0.08, 3), zinc, 46, 2.62, z, false)
    zincGlow.push(zinc)
    const burner = m(0xff6a1a, { emissive: new THREE.Color(0xff4a00), emissiveIntensity: 1.5 })
    for (const dx of [-2.2, 0, 2.2]) put(kettle, box(0.7, 0.5, 0.1), burner, 46 + dx, 0.6, z + 1.72, false)
    burnerGlow.push(burner)
    put(kettle, box(7, 1.2, 3.6), m(0x9aa3ab, { transparent: true, opacity: 0.55 }), 46, 5, z, false)
    put(kettle, new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10), grey, 46, 3.4, z, false)
    // Wiping, cooling trough, take-up.
    put(kettle, box(1, 1.4, 2.2), m(0x1f2937), 50.2, 1.9, z)
    put(kettle, box(9, 1.2, 2.2), m(0x3d4650, { roughness: 0.6 }), 56, 0.6, z)
    put(kettle, box(8.7, 0.08, 1.9), liquid(0x5aa9e6), 56, 1.22, z, false)
    for (let k = 0; k < 8; k += 1) {
      const spool = put(kettle, new THREE.CylinderGeometry(1, 1, 1.2, 16), wireSilver, 66 + k * 3, 1.6, z)
      spool.rotation.x = Math.PI / 2
      put(spool, box(0.15, 1.22, 1.7), m(0x1f2937), 0, 0, 0, false)
      put(kettle, box(1.8, 0.6, 1.6), darkSteel, 66 + k * 3, 0.3, z)
      takeups.push(spool)
    }
  }
  // Common fume duct from the kettle hoods to a bag filter and stack, and the furnace flue stack.
  put(kettle, box(1.2, 1.2, 22), grey, 46, 5.4, 14, false)
  put(kettle, box(5, 7, 5), m(0x9aa3ab), 46, 3.5, -1)
  put(kettle, new THREE.CylinderGeometry(0.9, 1.1, 22, 14), white, 50, 11, -1)
  put(anneal, new THREE.CylinderGeometry(1, 1.3, 24, 14), m(0xd6d9dc), 14, 12, -1)
  put(anneal, new THREE.CylinderGeometry(1.05, 1.05, 1.6, 14), m(0xd9473f), 14, 23.5, -1, false)
  put(anneal, box(1, 1, 22), grey, 14, 3.4, 14, false)

  /* ---- Utilities: compressors and a cooling tower; wastewater plant ---- */
  const utilities = unit('utilities', new THREE.Vector3(86, 11, -20))
  for (let k = 0; k < 3; k += 1) put(utilities, box(4, 3, 3), white, 78 + k * 5, 1.5, -26)
  put(utilities, new THREE.CylinderGeometry(4, 5, 7, 20), m(0x7b8794), 90, 3.5, -16)
  const fan = put(utilities, box(6, 0.2, 0.6), darkSteel, 90, 7.2, -16, false)
  fan.userData.fan = true
  const wastewater = unit('wastewater', new THREE.Vector3(-86, 9, 18))
  for (const [x, z, r] of [[-90, 14, 4], [-80, 14, 3], [-86, 24, 3.5]] as const) {
    put(wastewater, new THREE.CylinderGeometry(r, r, 2.4, 24), m(0x9aa3ab), x, 1.2, z)
    put(wastewater, new THREE.CylinderGeometry(r - 0.3, r - 0.3, 0.1, 24), liquid(0x6b8e7f), x, 2.42, z, false)
  }
  put(wastewater, box(5, 3, 4), green, -78, 1.5, 24)

  /* ---- Back-right yard: acid tank farm, nitrogen for wiping, zinc ingot store ---- */
  const tankFarm = new THREE.Group()
  tankFarm.userData.unitId = 'pickling'
  put(tankFarm, box(22, 1, 9), m(0x9aa3ab), 8, 0.5, -26)
  ;[[0, 'fresh HCl'], [5.5, 'fresh HCl'], [11, 'spent acid'], [16.5, 'spent acid']].forEach(([dx], index) => {
    put(tankFarm, new THREE.CylinderGeometry(2.2, 2.2, 7, 20), m(index < 2 ? 0xefe7cf : 0xd9c58f, { roughness: 0.6 }), -0.5 + (dx as number), 4.5, -26)
    put(tankFarm, new THREE.CylinderGeometry(2.25, 2.25, 0.3, 20), m(0x64748b), -0.5 + (dx as number), 8.1, -26, false)
  })
  pickling.add(tankFarm)
  const n2 = new THREE.Group()
  n2.userData.unitId = 'kettle'
  put(n2, new THREE.CylinderGeometry(1.6, 1.6, 12, 18), white, 64, 6.5, -10)
  for (let k = 0; k < 6; k += 1) put(n2, box(0.15, 4, 1.6), grey, 59 + k * 0.6, 2, -10)
  kettle.add(n2)
  // Jumbo zinc ingots beside the kettles, and dross bins.
  for (let k = 0; k < 12; k += 1) put(kettle, box(1.6, 0.45, 0.8), m(0xc9d1d9, { metalness: 0.7, roughness: 0.35 }), 54 + (k % 4) * 1.8, 0.25 + Math.floor(k / 4) * 0.47, 2.4)
  for (let k = 0; k < 3; k += 1) put(kettle, box(1.4, 1, 1.4), m(0x4b5563), 62 + k * 1.8, 0.5, 2.4)

  /* ---- Front-left yard: covered store of drawn-wire coils waiting for the galvanising lines ---- */
  const canopy = put(root, box(40, 0.3, 18), m(0x2f8f5b, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }), -30, 7.5, 13, false)
  canopy.castShadow = false
  for (const x of [-50, -30, -10]) for (const z of [4, 22]) put(root, box(0.5, 7.5, 0.5), shedSteel, x, 3.75, z)
  for (let row = 0; row < 3; row += 1) for (let k = 0; k < 11; k += 1) {
    const x = -47 + k * 3.4, z = 8 + row * 5
    put(root, box(2.4, 0.3, 2.4), m(0x8b6b45), x, 0.15, z)
    put(root, new THREE.CylinderGeometry(0.95, 0.95, 1.3, 16), wireSilver, x, 0.95, z)
  }

  /* ---- Finished galvanised coils, strapping and a loading truck ---- */
  for (let k = 0; k < 16; k += 1) {
    const coil = put(root, new THREE.CylinderGeometry(1, 1, 1.2, 16), m(0xe3e9ee, { metalness: 0.5, roughness: 0.3 }), 30 + (k % 8) * 4, 0.6 + Math.floor(k / 8) * 1.25, 31)
    put(coil, box(2.05, 1.22, 0.12), m(0x1d4ed8), 0, 0, 0, false)
  }
  put(root, box(4, 3, 3), m(0x2f6fb0), 92, 1.5, 30)
  const truck = new THREE.Group()
  put(truck, box(14, 0.6, 3.2), darkSteel, 0, 1.4, 0)
  put(truck, box(3.5, 3, 3.2), m(0xe11d48), 8, 2.6, 0)
  for (const x of [-5, -2, 7.5]) for (const z of [-1.5, 1.5]) put(truck, new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12), m(0x111827), x, 0.6, z).rotation.x = Math.PI / 2
  for (let k = 0; k < 4; k += 1) put(truck, new THREE.CylinderGeometry(1, 1, 1.2, 14), m(0xe3e9ee, { metalness: 0.5 }), -5 + k * 3, 2.3, 0)
  truck.position.set(76, 0, 45)
  root.add(truck)

  /* ---- Moving equipment: forklifts and an overhead crane ---- */
  const forklift = (colour: number) => {
    const group = new THREE.Group()
    put(group, box(2.6, 1.2, 1.6), m(colour), 0, 0.9, 0)
    put(group, box(1, 1.2, 1.4), m(0x111827, { transparent: true, opacity: 0.6 }), -0.5, 2, 0)
    put(group, box(0.2, 3, 1.2), darkSteel, 1.4, 1.5, 0)
    put(group, box(1.4, 0.1, 1), darkSteel, 2.1, 0.5, 0)
    put(group, new THREE.CylinderGeometry(0.85, 0.85, 1.1, 14), wireSilver, 2.2, 1.1, 0)
    root.add(group)
    return group
  }
  const loop = (points: [number, number][]) => new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'catmullrom', 0.3)
  const forklifts = [
    { group: forklift(0xf2c230), path: loop([[-30, -1], [-14, 2], [0, 9], [-2, 24], [-28, 26], [-52, 22], [-54, 3]]), speed: 0.018 },
    { group: forklift(0xf28c28), path: loop([[88, 27], [66, 27.5], [24, 28], [20, 33], [24, 40], [60, 41], [84, 38]]), speed: 0.022 },
  ]
  const crane = new THREE.Group()
  put(crane, box(1.4, 1.2, 32), m(0xf2c230), 0, 10.4, -19)
  put(crane, box(2, 1.2, 2), darkSteel, 0, 9.6, -16)
  put(crane, new THREE.CylinderGeometry(0.05, 0.05, 5, 6), darkSteel, 0, 6.8, -16)
  put(crane, coilGeometry, rodRust, 0, 4.2, -16).rotation.x = Math.PI / 2
  root.add(crane)
  for (const z of [-34.5, -3.5]) put(root, box(96, 0.6, 0.6), darkSteel, -52, 10.8, z, false)

  /* ---- Gas and power supply lines ---- */
  const stripe = (colour: string) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 8
    const context = canvas.getContext('2d')!
    context.fillStyle = colour; context.fillRect(0, 0, 32, 8)
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    return texture
  }
  const flows: GalvHallHandles['flows'] = []
  const flow = (points: [number, number, number][], kind: 'power' | 'gas', target: GalvUnitId, radius = 0.4) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.1)
    const texture = stripe(kind === 'power' ? '#ffd23f' : '#ff8a3d')
    texture.repeat.set(Math.max(4, curve.getLength() / 3), 1)
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, radius, 8), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false }))
    root.add(mesh)
    flows.push({ mesh, texture, kind, unit: target })
  }
  put(root, new THREE.CylinderGeometry(3, 3, 6, 18), m(0xf28c28), 30, 3, 46)
  for (let k = 0; k < 3; k += 1) put(root, box(4, 5, 4), m(0x6a7480), -52 + k * 6, 2.5, 46)
  flow([[-46, 6, 46], [-40, 10, 30], [-30, 14, 2], [-26, 6, -12]], 'power', 'drawing', 0.55)
  flow([[-46, 6, 46], [-60, 10, 20], [-66, 8, -10]], 'power', 'pickling')
  flow([[-40, 6, 46], [40, 9, 40], [80, 10, 0], [84, 5, -20]], 'power', 'utilities')
  flow([[30, 6, 46], [24, 8, 32], [18, 4, 26]], 'gas', 'anneal')
  flow([[30, 6, 46], [40, 8, 32], [46, 3, 26]], 'gas', 'kettle')

  root.traverse((object) => { if ((object as THREE.Mesh).isMesh && !object.userData.unitId) { let parent = object.parent; while (parent && !parent.userData.unitId) parent = parent.parent; if (parent) object.userData.unitId = parent.userData.unitId } })

  return {
    root, units, capstans, machineLamps, wires, annealGlow, zincGlow, burnerGlow, takeups, hoist, flows, forklifts, crane, kettleAnchor: new THREE.Vector3(46, 3, LINE_Z[0]),
    stacks: [{ origin: new THREE.Vector3(14, 24.5, -1), unit: 'anneal' }, { origin: new THREE.Vector3(50, 22.5, -1), unit: 'kettle' }, { origin: new THREE.Vector3(-60, 17, -28), unit: 'pickling' }],
  }
}
