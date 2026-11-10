import * as THREE from 'three'
import type { UnitId } from '../model/steel'
import { textures, worldUVs } from './textures'

/**
 * Procedural interior of a steel mini-mill (an original, simplified layout).
 * The process runs left to right along X: scrap → EAF → ladle furnace → caster → reheating
 * furnace → rolling mill → cooling bed. Outside the hall: substation, gas station, oxygen plant.
 */

export type HallHandles = {
  root: THREE.Group
  units: Map<UnitId, { group: THREE.Group; anchor: THREE.Vector3 }>
  eafLight: THREE.PointLight
  eafGlow: THREE.MeshStandardMaterial
  electrodes: THREE.Group
  sparks: THREE.Points
  ladle: THREE.Group
  ladleGlow: THREE.MeshStandardMaterial
  crane: THREE.Group
  billets: THREE.Mesh[]
  bar: THREE.Mesh
  reheatGlow: THREE.MeshStandardMaterial
  reheatLight: THREE.PointLight
  captureUnit: THREE.Group
  flows: { mesh: THREE.Mesh; texture: THREE.Texture; kind: 'power' | 'gas' | 'capture'; unit: UnitId }[]
  stacks: { origin: THREE.Vector3; unit: 'fume' | 'reheat' }[]
  size: number
}

const m = (color: number, options: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.15, ...options })

export function buildSteelHall(): HallHandles {
  const root = new THREE.Group()
  const units = new Map<UnitId, { group: THREE.Group; anchor: THREE.Vector3 }>()
  const unit = (id: UnitId, anchor: THREE.Vector3) => {
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

  const steelBlue = m(0x1f4fa8, { metalness: 0.4, roughness: 0.5 })
  const yellow = m(0xf2c230, { roughness: 0.5 })
  const darkSteel = m(0x3a4048, { metalness: 0.5, roughness: 0.45 })
  const grey = m(0x8c949c, { metalness: 0.3 })
  const white = m(0xe6e8ea)
  const orangeHot = (intensity = 2) => m(0xff7a1a, { emissive: new THREE.Color(0xff5a00), emissiveIntensity: intensity, roughness: 0.4 })

  /* ---- Hall shell ---- */
  const floorMat = m(0x9ea4a8, { map: textures.slabs(), roughness: 0.9 })
  const floorGeometry = new THREE.BoxGeometry(200, 1, 70)
  worldUVs(floorGeometry, 8)
  put(root, floorGeometry, floorMat, 0, -0.5, 0, false)
  const outside = put(root, new THREE.BoxGeometry(320, 0.6, 180), m(0x2a3138, { roughness: 1 }), 0, -1.1, 0, false)
  outside.receiveShadow = true
  // Yellow walkway lines.
  for (const z of [-14, 14]) put(root, new THREE.BoxGeometry(190, 0.05, 0.4), m(0xf2c230, { emissive: new THREE.Color(0x3a2e00) }), 0, 0.03, z, false)
  // Back wall (cutaway front so we can see inside).
  const wallMat = m(0x8f9aa3, { map: textures.corrugated(), side: THREE.DoubleSide })
  const wallGeometry = new THREE.BoxGeometry(200, 26, 0.6)
  worldUVs(wallGeometry, 2.5)
  put(root, wallGeometry, wallMat, 0, 13, -35, false)
  for (const x of [-100, 100]) { const side = new THREE.BoxGeometry(0.6, 26, 70); worldUVs(side, 2.5); put(root, side, wallMat, x, 13, 0, false) }
  // Window band.
  put(root, new THREE.BoxGeometry(196, 3, 0.7), m(0x8fb3cc, { emissive: new THREE.Color(0x30506a), emissiveIntensity: 0.6 }), 0, 22, -35, false)
  // Columns and roof trusses.
  for (let x = -96; x <= 96; x += 16) {
    // Back row of columns only: the front of the hall is cut away so the process is visible.
    put(root, new THREE.BoxGeometry(1.2, 28, 1.2), steelBlue, x, 14, -33)
    const truss = put(root, new THREE.BoxGeometry(0.8, 1.2, 68), steelBlue, x, 28, 0)
    truss.castShadow = false
  }
  // Crane rails.
  for (const z of [-31, 31]) put(root, new THREE.BoxGeometry(196, 1, 1), darkSteel, 0, 22, z)
  // Overhead crane.
  const crane = new THREE.Group()
  put(crane, new THREE.BoxGeometry(2.4, 2, 64), m(0xf2c230), 0, 23.5, 0)
  put(crane, new THREE.BoxGeometry(4, 2.2, 4), darkSteel, 0, 22, 4)
  put(crane, new THREE.CylinderGeometry(0.08, 0.08, 10, 6), darkSteel, 0, 16, 4)
  put(crane, new THREE.BoxGeometry(1.4, 1, 1.4), m(0xd9473f), 0, 11, 4)
  root.add(crane)

  /* ---- Scrap yard ---- */
  const scrap = unit('scrap', new THREE.Vector3(-82, 10, 0))
  const rust = [0x6b4a32, 0x5a4636, 0x7d5a3c, 0x4e4a46]
  for (let k = 0; k < 9; k += 1) {
    const pile = put(scrap, new THREE.IcosahedronGeometry(3 + (k % 3), 0), m(rust[k % rust.length], { flatShading: true, roughness: 1 }), -90 + (k % 3) * 6, 1.5, -10 + Math.floor(k / 3) * 8)
    pile.scale.y = 0.55
  }
  put(scrap, new THREE.CylinderGeometry(3, 2.5, 4, 16, 1, true), m(0x50565c, { side: THREE.DoubleSide, metalness: 0.5 }), -72, 2, 12)

  /* ---- Electric arc furnace ---- */
  const eaf = unit('eaf', new THREE.Vector3(-55, 22, 0))
  put(eaf, new THREE.BoxGeometry(18, 4, 18), darkSteel, -55, 2, 0) // platform
  put(eaf, new THREE.CylinderGeometry(6.5, 6, 7, 32), m(0x2f343a, { metalness: 0.6, roughness: 0.4 }), -55, 7.5, 0)
  const eafGlow = orangeHot(0.4)
  put(eaf, new THREE.CylinderGeometry(5.6, 5.6, 0.4, 32), eafGlow, -55, 11.1, 0, false)
  put(eaf, new THREE.CylinderGeometry(6.8, 6.8, 1.2, 32, 1, true), m(0x1f4fa8, { metalness: 0.5, side: THREE.DoubleSide }), -55, 11.6, 0)
  const electrodes = new THREE.Group()
  for (let k = 0; k < 3; k += 1) {
    const angle = k / 3 * Math.PI * 2
    put(electrodes, new THREE.CylinderGeometry(0.7, 0.7, 12, 12), m(0x222222, { metalness: 0.2, roughness: 0.6 }), -55 + Math.cos(angle) * 1.8, 16, Math.sin(angle) * 1.8)
    put(electrodes, new THREE.BoxGeometry(8, 0.9, 1), steelBlue, -51 + Math.cos(angle) * 1.8, 21, Math.sin(angle) * 1.8)
  }
  eaf.add(electrodes)
  put(eaf, new THREE.BoxGeometry(2, 18, 2), steelBlue, -46, 9, 0) // electrode mast
  const eafLight = new THREE.PointLight(0xff7a2a, 0, 70, 1.6)
  eafLight.position.set(-55, 13, 0)
  eaf.add(eafLight)
  const sparkGeometry = new THREE.BufferGeometry()
  const sparkPositions = new Float32Array(160 * 3)
  sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3))
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ color: 0xffc04d, size: 0.6, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
  sparks.userData.velocities = new Float32Array(160 * 3)
  eaf.add(sparks)

  /* ---- Fume extraction: duct, baghouse, fans, stack ---- */
  const fume = unit('fume', new THREE.Vector3(-58, 30, -24))
  const duct = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-55, 12, -2), new THREE.Vector3(-55, 20, -8), new THREE.Vector3(-58, 20, -20)]), 20, 1.4, 12)
  put(fume, duct, grey, 0, 0, 0)
  put(fume, new THREE.BoxGeometry(16, 10, 7), m(0xb8bec4, { map: textures.corrugated() }), -66, 9, -26)
  for (let k = 0; k < 4; k += 1) put(fume, new THREE.ConeGeometry(1.6, 3, 4), grey, -72 + k * 4, 2.6, -26).rotation.x = Math.PI
  for (let k = 0; k < 2; k += 1) { const fan = put(fume, new THREE.CylinderGeometry(2.2, 2.2, 1.6, 20), steelBlue, -52 + k * 5, 3, -27); fan.rotation.x = Math.PI / 2 }
  put(fume, new THREE.CylinderGeometry(1.6, 2, 46, 16), m(0xd6d9dc), -46, 23, -28)
  put(fume, new THREE.CylinderGeometry(1.65, 1.65, 2, 16), m(0xd9473f), -46, 42, -28, false)

  /* ---- Ladle on a transfer car ---- */
  const ladle = new THREE.Group()
  put(ladle, new THREE.BoxGeometry(6, 1.2, 5), m(0xf2c230), 0, 0.6, 0)
  put(ladle, new THREE.CylinderGeometry(2.6, 2.1, 4.4, 20), m(0x3b2f2a, { metalness: 0.4 }), 0, 3.4, 0)
  const ladleGlow = orangeHot(1.5)
  put(ladle, new THREE.CylinderGeometry(2.3, 2.3, 0.2, 20), ladleGlow, 0, 5.5, 0, false)
  ladle.position.set(-45, 0, 10)
  root.add(ladle)

  /* ---- Ladle furnace ---- */
  const lf = unit('lf', new THREE.Vector3(-30, 18, 10))
  put(lf, new THREE.BoxGeometry(10, 1, 10), darkSteel, -30, 0.5, 10)
  put(lf, new THREE.CylinderGeometry(3.2, 3.2, 2, 20), steelBlue, -30, 8.5, 10)
  for (let k = 0; k < 3; k += 1) put(lf, new THREE.CylinderGeometry(0.45, 0.45, 8, 10), m(0x222222), -31 + k, 12, 10)
  put(lf, new THREE.BoxGeometry(1.4, 14, 1.4), steelBlue, -25, 7, 10)

  /* ---- Continuous caster ---- */
  const caster = unit('caster', new THREE.Vector3(-12, 18, 0))
  put(caster, new THREE.BoxGeometry(14, 10, 12), m(0x1f4fa8, { metalness: 0.4, transparent: true, opacity: 0.35 }), -12, 5, 0, false)
  put(caster, new THREE.BoxGeometry(12, 0.6, 12), yellow, -12, 10, 0) // platform
  put(caster, new THREE.BoxGeometry(8, 2, 3), m(0x5a4a40), -12, 11.6, 0) // tundish
  for (let k = 0; k < 4; k += 1) {
    const strand = put(caster, new THREE.BoxGeometry(0.8, 0.8, 9), orangeHot(1.2), -15 + k * 2, 6, 3)
    strand.rotation.x = -0.6
  }
  for (const z of [-6, 6]) for (const x of [-18, -6]) put(caster, new THREE.BoxGeometry(0.4, 10, 0.4), yellow, x, 5, z) // handrail posts

  /* ---- Roller table with billets ---- */
  put(root, new THREE.BoxGeometry(34, 1, 4), darkSteel, 10, 1.2, 6)
  for (let x = -6; x <= 26; x += 2) { const roller = put(root, new THREE.CylinderGeometry(0.35, 0.35, 3.6, 8), grey, x, 1.9, 6); roller.rotation.x = Math.PI / 2 }
  const billets: THREE.Mesh[] = []
  for (let k = 0; k < 6; k += 1) billets.push(put(root, new THREE.BoxGeometry(5, 0.9, 0.9), orangeHot(1.6), 0, 2.6, 6))

  /* ---- Reheating furnace ---- */
  const reheat = unit('reheat', new THREE.Vector3(38, 26, -2))
  const furnaceBody = new THREE.BoxGeometry(24, 9, 12)
  worldUVs(furnaceBody, 3)
  put(reheat, furnaceBody, m(0x8a5a44, { map: textures.brick() }), 38, 4.5, -2)
  const reheatGlow = orangeHot(2)
  put(reheat, new THREE.BoxGeometry(0.3, 3, 8), reheatGlow, 50.2, 3.5, -2, false)
  put(reheat, new THREE.BoxGeometry(0.3, 3, 8), reheatGlow, 25.8, 3.5, -2, false)
  for (let k = 0; k < 5; k += 1) put(reheat, new THREE.CylinderGeometry(0.5, 0.5, 2, 10), grey, 30 + k * 4, 9.8, -2)
  put(reheat, new THREE.CylinderGeometry(1.4, 1.8, 40, 16), m(0xd6d9dc), 44, 20, -10)
  put(reheat, new THREE.CylinderGeometry(1.45, 1.45, 2, 16), m(0xd9473f), 44, 37, -10, false)
  const reheatLight = new THREE.PointLight(0xff8a3a, 30, 40, 1.8)
  reheatLight.position.set(52, 4, -2)
  reheat.add(reheatLight)

  // Chitosan capture skid next to the reheat stack (shown when capture is switched on).
  const captureUnit = new THREE.Group()
  captureUnit.userData.unitId = 'reheat'
  put(captureUnit, new THREE.CylinderGeometry(2.2, 2.2, 14, 20), m(0x3ddc97, { roughness: 0.4, emissive: new THREE.Color(0x0d5a3b), emissiveIntensity: 0.6 }), 32, 7, -22)
  put(captureUnit, new THREE.CylinderGeometry(2.2, 2.2, 14, 20), m(0x3ddc97, { roughness: 0.4, emissive: new THREE.Color(0x0d5a3b), emissiveIntensity: 0.6 }), 38, 7, -22)
  put(captureUnit, new THREE.CylinderGeometry(1.4, 1.4, 6, 16), m(0xe6e8ea), 26, 3, -22)
  const captureDuct = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(44, 8, -10), new THREE.Vector3(42, 10, -18), new THREE.Vector3(38, 12, -22)]), 16, 0.6, 8)
  put(captureUnit, captureDuct, grey, 0, 0, 0)
  captureUnit.scale.setScalar(0.001)
  reheat.add(captureUnit)

  /* ---- Rolling mill ---- */
  const rolling = unit('rolling', new THREE.Vector3(70, 16, 6))
  for (let k = 0; k < 7; k += 1) {
    const x = 58 + k * 4.4
    put(rolling, new THREE.BoxGeometry(2, 6 - k * 0.3, 5), steelBlue, x, 3, 6)
    const roll = put(rolling, new THREE.CylinderGeometry(0.9, 0.9, 4.2, 14), m(0x9aa2a9, { metalness: 0.7, roughness: 0.3 }), x, 2.2, 6)
    roll.rotation.x = Math.PI / 2
  }
  put(rolling, new THREE.BoxGeometry(34, 0.8, 3), darkSteel, 70, 0.9, 6)
  const bar = put(rolling, new THREE.BoxGeometry(36, 0.35, 0.35), orangeHot(2), 70, 2.2, 6, false)

  /* ---- Cooling bed (finished bars) ---- */
  put(root, new THREE.BoxGeometry(12, 1.2, 20), darkSteel, 92, 0.6, 2)
  for (let k = 0; k < 14; k += 1) put(root, new THREE.BoxGeometry(11, 0.3, 0.3), m(k < 4 ? 0x9a4a2a : 0x4b4f54, k < 4 ? { emissive: new THREE.Color(0x5a1800) } : {}), 92, 1.4, -6 + k * 1.2)

  /* ---- Utilities & oxygen plant ---- */
  const utilities = unit('utilities', new THREE.Vector3(-14, 12, 24))
  for (let k = 0; k < 3; k += 1) put(utilities, new THREE.BoxGeometry(5, 4, 4), white, -20 + k * 6, 2, 25)
  for (let k = 0; k < 2; k += 1) put(utilities, new THREE.CylinderGeometry(1.2, 1.2, 7, 14), grey, -4 + k * 3, 3.5, 26)
  const oxygen = unit('oxygen', new THREE.Vector3(-84, 26, 26))
  put(oxygen, new THREE.CylinderGeometry(1.6, 1.6, 22, 16), white, -86, 11, 26)
  put(oxygen, new THREE.CylinderGeometry(1.2, 1.2, 16, 16), white, -81, 8, 27)
  put(oxygen, new THREE.BoxGeometry(6, 4, 5), m(0x2f6fb0), -84, 2, 21)

  /* ---- Substation, gas station and animated supply lines ---- */
  const substation = new THREE.Group()
  for (let k = 0; k < 3; k += 1) put(substation, new THREE.BoxGeometry(4, 5, 4), m(0x6a7480), -74 + k * 6, 2.5, 46)
  for (let k = 0; k < 4; k += 1) put(substation, new THREE.BoxGeometry(0.4, 9, 0.4), grey, -77 + k * 6, 4.5, 51)
  root.add(substation)
  put(root, new THREE.CylinderGeometry(3, 3, 6, 18), m(0xf28c28), 40, 3, 48)

  const stripe = (colour: string) => {
    const canvas = document.createElement('canvas')
    canvas.width = 64; canvas.height = 8
    const context = canvas.getContext('2d')!
    context.fillStyle = 'rgba(0,0,0,0)'; context.fillRect(0, 0, 64, 8)
    context.fillStyle = colour; context.fillRect(0, 0, 32, 8)
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    return texture
  }
  const flows: HallHandles['flows'] = []
  const flow = (points: [number, number, number][], kind: 'power' | 'gas' | 'capture', target: UnitId, radius = 0.45) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.1)
    const texture = stripe(kind === 'power' ? '#ffd23f' : kind === 'gas' ? '#ff8a3d' : '#3ddc97')
    texture.repeat.set(Math.max(4, curve.getLength() / 3), 1)
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.95, depthWrite: false })
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, radius, 8), material)
    root.add(mesh)
    flows.push({ mesh, texture, kind, unit: target })
  }
  flow([[-68, 6, 46], [-68, 8, 36], [-60, 20, 30], [-55, 20, 4]], 'power', 'eaf', 0.6)
  flow([[-62, 6, 46], [-50, 8, 36], [-32, 14, 20], [-30, 14, 11]], 'power', 'lf')
  flow([[-62, 6, 46], [20, 8, 40], [62, 10, 20], [66, 8, 8]], 'power', 'rolling')
  flow([[-62, 6, 46], [-30, 6, 40], [-50, 6, 30], [-52, 4, -24]], 'power', 'fume', 0.35)
  flow([[40, 6, 48], [40, 8, 30], [38, 10, 10], [38, 10, 4]], 'gas', 'reheat', 0.55)
  flow([[38, 12, -22], [26, 6, -22], [20, 4, -30], [10, 2, -45]], 'capture', 'reheat', 0.4)

  root.traverse((object) => { if ((object as THREE.Mesh).isMesh && !object.userData.unitId) { let parent = object.parent; while (parent && !parent.userData.unitId) parent = parent.parent; if (parent) object.userData.unitId = parent.userData.unitId } })

  return {
    root, units, eafLight, eafGlow, electrodes, sparks, ladle, ladleGlow, crane, billets, bar, reheatGlow, reheatLight, captureUnit, flows,
    stacks: [{ origin: new THREE.Vector3(-46, 47, -28), unit: 'fume' }, { origin: new THREE.Vector3(44, 41, -10), unit: 'reheat' }],
    size: 200,
  }
}
