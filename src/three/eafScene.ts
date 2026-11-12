import * as THREE from 'three'
import { box } from './shapes'
import { textures, worldUVs } from './textures'

/**
 * A detailed, original cutaway of an electric arc furnace, built procedurally.
 * A quarter of the shell is cut away so the scrap, the arc, the molten bath and the slag are visible.
 */

export type SensorId = 'power' | 'thermo' | 'offgas' | 'cooling'

export type EafHandles = {
  root: THREE.Group
  furnace: THREE.Group
  roof: THREE.Group
  electrodes: THREE.Group
  scrap: THREE.InstancedMesh
  scrapBase: THREE.Matrix4[]
  scrapOrder: number[]
  bath: THREE.Mesh
  bathMat: THREE.MeshStandardMaterial
  slag: THREE.Mesh
  slagMat: THREE.MeshStandardMaterial
  bubbles: THREE.InstancedMesh
  arcs: THREE.Mesh[]
  arcLight: THREE.PointLight
  bathLight: THREE.PointLight
  offgasOrigin: THREE.Vector3
  tapStream: THREE.Mesh
  ladleFill: THREE.Mesh
  basket: THREE.Group
  sensors: Record<SensorId, THREE.Vector3>
  pickables: { object: THREE.Object3D; id: SensorId | 'furnace' | 'ladle' | 'transformer' }[]
}

const SHELL_R = 6.5
const CUT_START = Math.PI * 0.15
const CUT_LEN = Math.PI * 1.5 // 270° of shell; the front quarter is open

const m = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3, ...o })

export function buildEaf(): EafHandles {
  const root = new THREE.Group()
  const put = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }

  const steel = m(0x4a535d, { metalness: 0.6, roughness: 0.4 })
  const blue = m(0x1f4fa8, { metalness: 0.5, roughness: 0.45 })
  const yellow = m(0xf2c230, { roughness: 0.5, metalness: 0.2 })
  const refractory = m(0x9a6a52, { map: textures.brick(), roughness: 0.95, metalness: 0 })
  const copper = m(0xc77a3a, { metalness: 0.85, roughness: 0.3 })
  const graphite = m(0x2a2c30, { roughness: 0.75, metalness: 0.1 })
  const panelMat = m(0x6b7c8c, { metalness: 0.7, roughness: 0.35 })
  const grating = m(0x7d868f, { map: textures.slabs(), metalness: 0.4, roughness: 0.7 })

  /* ---- Building floor, pit and operating platform ---- */
  const floorGeo = box(70, 1, 50)
  worldUVs(floorGeo, 6)
  put(root, floorGeo, m(0x9aa2a8, { map: textures.slabs(), metalness: 0, roughness: 0.95 }), 0, -9.5, 0)
  const platformGeo = box(30, 0.6, 26)
  worldUVs(platformGeo, 3)
  const platform = put(root, platformGeo, grating, 4, -0.3, -2)
  platform.receiveShadow = true
  // Platform legs, handrails and stairs.
  for (const [x, z] of [[-10, -14], [18, -14], [18, 10], [-10, 10]]) put(root, box(0.6, 9, 0.6), blue, x, -4.8, z)
  const railPosts: [number, number][] = []
  for (let x = -10; x <= 18; x += 2.8) railPosts.push([x, 10.6])
  for (let z = -14; z <= 10; z += 2.8) railPosts.push([18.6, z])
  for (const [x, z] of railPosts) put(root, box(0.15, 1.1, 0.15), yellow, x, 0.55, z)
  put(root, box(28.6, 0.12, 0.12), yellow, 4.3, 1.1, 10.6)
  put(root, box(0.12, 0.12, 24.6), yellow, 18.6, 1.1, -1.7)
  put(root, box(28.6, 0.1, 0.1), yellow, 4.3, 0.6, 10.6)
  for (let k = 0; k < 12; k += 1) put(root, box(3, 0.25, 0.8), grating, 21 + k * 0.0, -0.6 - k * 0.72, 9 - k * 0.8)

  /* ---- Furnace (tilts as one group around a pivot near the tap hole) ---- */
  const furnace = new THREE.Group()
  root.add(furnace)
  // Rocker cradle.
  for (const z of [-3.6, 3.6]) {
    const rocker = put(furnace, new THREE.TorusGeometry(7, 0.5, 8, 32, Math.PI * 0.42), blue, 0, 6.3, z)
    rocker.rotation.z = Math.PI * 1.29
  }

  // Hearth bowl: steel shell outside, refractory inside (bottom half-sphere, cut open at the front).
  const hearthOuter = new THREE.SphereGeometry(SHELL_R, 48, 18, CUT_START, CUT_LEN, Math.PI / 2, Math.PI / 2)
  put(furnace, hearthOuter, m(0x3a4048, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }), 0, 0.8, 0).scale.y = 0.55
  const hearthInner = new THREE.SphereGeometry(SHELL_R - 0.7, 48, 18, CUT_START, CUT_LEN, Math.PI / 2, Math.PI / 2)
  worldUVs(hearthInner, 1.2)
  put(furnace, hearthInner, new THREE.MeshStandardMaterial({ color: 0x9a6a52, map: textures.brick(), roughness: 0.95, side: THREE.BackSide }), 0, 0.8, 0).scale.y = 0.5
  // Lower shell ring (refractory-lined) and upper water-cooled shell.
  const lowerOuter = new THREE.CylinderGeometry(SHELL_R, SHELL_R, 2.2, 48, 1, true, CUT_START, CUT_LEN)
  put(furnace, lowerOuter, m(0x3a4048, { metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide }), 0, 1.9, 0)
  const lowerInner = new THREE.CylinderGeometry(SHELL_R - 0.7, SHELL_R - 0.7, 2.2, 48, 1, true, CUT_START, CUT_LEN)
  worldUVs(lowerInner, 1.2)
  put(furnace, lowerInner, new THREE.MeshStandardMaterial({ color: 0x9a6a52, map: textures.brick(), roughness: 0.95, side: THREE.BackSide }), 0, 1.9, 0)
  // Cut faces showing the wall thickness.
  for (const angle of [CUT_START, CUT_START + CUT_LEN]) {
    const face = put(furnace, box(0.7, 2.2, 0.15), refractory, Math.sin(angle) * (SHELL_R - 0.35), 1.9, Math.cos(angle) * (SHELL_R - 0.35))
    face.rotation.y = angle
  }
  // Water-cooled panels: vertical tubes around the upper shell.
  const panelCount = 64
  const tubes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 8), panelMat, panelCount)
  const dummy = new THREE.Object3D()
  let used = 0
  for (let k = 0; k < panelCount; k += 1) {
    const angle = k / panelCount * Math.PI * 2
    const inCut = ((angle - CUT_START + Math.PI * 4) % (Math.PI * 2)) > CUT_LEN
    if (inCut) continue
    dummy.position.set(Math.sin(angle) * (SHELL_R - 0.25), 5.1, Math.cos(angle) * (SHELL_R - 0.25))
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    tubes.setMatrixAt(used, dummy.matrix)
    used += 1
  }
  tubes.count = used
  tubes.castShadow = true
  furnace.add(tubes)
  // Panel headers (cooling-water manifolds) top and bottom.
  for (const y of [3.0, 7.2]) put(furnace, new THREE.TorusGeometry(SHELL_R - 0.25, 0.28, 8, 64, CUT_LEN), m(0x2f6fb0, { metalness: 0.6 }), 0, y, 0).rotation.set(Math.PI / 2, 0, Math.PI / 2 - CUT_START - CUT_LEN)
  // Slag door and tapping spout (eccentric bottom tap).
  put(furnace, box(2.4, 2, 1), steel, 0, 2.6, -SHELL_R)
  put(furnace, box(3, 2.2, 3), m(0x3a4048, { metalness: 0.6 }), -SHELL_R - 0.6, 1.4, 0)

  /* ---- Contents: scrap, molten bath, foaming slag, bubbles ---- */
  const scrapCount = 150
  const scrap = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), m(0x5b4636, { flatShading: true, roughness: 1, metalness: 0.4 }), scrapCount)
  const scrapBase: THREE.Matrix4[] = []
  const heights: number[] = []
  let seed = 11
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  for (let k = 0; k < scrapCount; k += 1) {
    const radius = Math.sqrt(random()) * (SHELL_R - 1.4)
    const angle = random() * Math.PI * 2
    const height = 0.3 + random() * 5.2 - radius * 0.25
    dummy.position.set(Math.sin(angle) * radius, Math.max(0.3, height), Math.cos(angle) * radius)
    dummy.rotation.set(random() * 3, random() * 3, random() * 3)
    dummy.scale.set(0.6 + random() * 1.4, 0.3 + random() * 0.6, 0.5 + random() * 1.2)
    dummy.updateMatrix()
    scrapBase.push(dummy.matrix.clone())
    heights.push(height)
    scrap.setMatrixAt(k, dummy.matrix)
  }
  scrap.castShadow = true
  furnace.add(scrap)
  // Melting order: pieces nearest the electrodes (centre) and lowest melt first.
  const scrapOrder = heights.map((height, index) => ({ index, key: height + Math.random() * 1.5 })).sort((a, b) => a.key - b.key).map((item) => item.index)

  const bathMat = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: new THREE.Color(0xff6a00), emissiveIntensity: 2.4, roughness: 0.35, metalness: 0 })
  const bath = put(furnace, new THREE.CylinderGeometry(SHELL_R - 0.9, SHELL_R - 2.6, 1, 48, 1, false, CUT_START, CUT_LEN), bathMat, 0, 0.4, 0)
  bath.castShadow = false
  const slagMat = new THREE.MeshStandardMaterial({ color: 0x7a3a14, emissive: new THREE.Color(0xff4a00), emissiveIntensity: 0.9, roughness: 0.9, transparent: true, opacity: 0.92 })
  const slag = put(furnace, new THREE.CylinderGeometry(SHELL_R - 0.8, SHELL_R - 0.9, 1, 48, 1, false, CUT_START, CUT_LEN), slagMat, 0, 1.2, 0)
  slag.castShadow = false
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: new THREE.Color(0xff7a00), emissiveIntensity: 2 }), 60)
  furnace.add(bubbles)

  /* ---- Roof, electrodes, arcs ---- */
  const roof = new THREE.Group()
  furnace.add(roof)
  const roofDome = new THREE.SphereGeometry(SHELL_R + 0.1, 48, 10, 0, Math.PI * 2, 0, Math.PI * 0.22)
  put(roof, roofDome, panelMat, 0, 2.6, 0).scale.y = 0.9
  put(roof, new THREE.TorusGeometry(SHELL_R + 0.1, 0.35, 8, 64), m(0x2f6fb0, { metalness: 0.6 }), 0, 7.5, 0).rotation.x = Math.PI / 2
  put(roof, new THREE.CylinderGeometry(2.4, 2.4, 1.6, 24), m(0xd9d4c8, { roughness: 0.9, metalness: 0 }), 0, 9.4, 0) // refractory delta
  // Fourth hole: off-gas elbow, then duct towards the back.
  const elbowCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(3.4, 9, -2.2), new THREE.Vector3(3.6, 12, -3), new THREE.Vector3(4, 13.4, -8), new THREE.Vector3(4, 13.4, -20)])
  put(roof, new THREE.TubeGeometry(elbowCurve, 40, 1.2, 16), m(0x8c949c, { metalness: 0.5 }), 0, 0, 0)

  const electrodes = new THREE.Group()
  furnace.add(electrodes)
  const arcs: THREE.Mesh[] = []
  for (let k = 0; k < 3; k += 1) {
    const angle = k / 3 * Math.PI * 2 + Math.PI / 2
    const ex = Math.cos(angle) * 1.4, ez = Math.sin(angle) * 1.4
    put(electrodes, new THREE.CylinderGeometry(0.55, 0.55, 15, 18), graphite, ex, 9.5, ez)
    put(electrodes, box(1.5, 1.6, 1.5), copper, ex, 15.4, ez) // clamp
    const arm = put(electrodes, box(10, 1, 1.1), blue, ex + 5, 16.2, ez)
    arm.castShadow = true
    put(electrodes, new THREE.CylinderGeometry(0.22, 0.22, 10, 10), copper, ex + 5, 16.9, ez).rotation.z = Math.PI / 2 // bus tube
    const arcMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
    const arc = put(electrodes, new THREE.ConeGeometry(0.7, 1.8, 12, 1, true), arcMat, ex, 1.1, ez)
    arc.rotation.x = Math.PI
    arc.castShadow = false
    arcs.push(arc)
  }
  // Masts and the electrode column structure.
  for (let k = 0; k < 3; k += 1) put(furnace, box(1.2, 18, 1.2), blue, 10.5, 7, -1.6 + k * 1.6)
  const arcLight = new THREE.PointLight(0xfff0c0, 0, 40, 1.4)
  arcLight.position.set(0, 2.2, 0)
  furnace.add(arcLight)
  const bathLight = new THREE.PointLight(0xff7a20, 0, 30, 1.6)
  bathLight.position.set(0, 2.5, 3)
  furnace.add(bathLight)

  /* ---- Transformer house and flexible cables ---- */
  const transformer = new THREE.Group()
  const thGeo = box(9, 9, 8)
  worldUVs(thGeo, 2.5)
  put(transformer, thGeo, m(0xb8bec4, { map: textures.corrugated(), metalness: 0.2 }), 16, -4.5, -16)
  put(transformer, box(5, 4, 4), m(0x6a7480, { metalness: 0.5 }), 16, 2, -16)
  for (let k = 0; k < 4; k += 1) put(transformer, new THREE.CylinderGeometry(0.3, 0.3, 3, 10), m(0xcfd5da), 14.6 + k, 5.4, -16)
  root.add(transformer)
  for (let k = 0; k < 3; k += 1) {
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(14 + k, 4, -13.5), new THREE.Vector3(14 + k * 0.5, 10, -7 + k), new THREE.Vector3(15.5, 16.6, -1.6 + k * 1.6)])
    put(root, new THREE.TubeGeometry(cable, 30, 0.35, 10), m(0x1d1f22, { roughness: 0.8 }))
  }

  /* ---- Pit: ladle on transfer car and the tap stream ---- */
  const ladle = new THREE.Group()
  put(ladle, box(7, 1.2, 6), yellow, 0, -8.4, 0)
  put(ladle, new THREE.CylinderGeometry(2.8, 2.3, 5, 28, 1, true), m(0x3b2f2a, { metalness: 0.5, side: THREE.DoubleSide }), 0, -5.3, 0)
  const ladleFill = put(ladle, new THREE.CylinderGeometry(2.5, 2.5, 0.2, 28), new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: new THREE.Color(0xff6a00), emissiveIntensity: 2.2 }), 0, -7.4, 0)
  ladle.position.set(-10.5, 0, 0)
  root.add(ladle)
  const tapStream = put(root, new THREE.CylinderGeometry(0.35, 0.25, 6, 12), new THREE.MeshStandardMaterial({ color: 0xffc04d, emissive: new THREE.Color(0xff7a00), emissiveIntensity: 3 }), -10.2, -3.4, 0)
  tapStream.castShadow = false

  /* ---- Charging basket on the crane hook ---- */
  const basket = new THREE.Group()
  put(basket, new THREE.CylinderGeometry(3.2, 2.8, 4.4, 28, 1, true), m(0x50565c, { metalness: 0.5, side: THREE.DoubleSide }), 0, 0, 0)
  for (let k = 0; k < 18; k += 1) put(basket, new THREE.IcosahedronGeometry(0.6, 0), m(0x5b4636, { flatShading: true, roughness: 1 }), Math.sin(k) * 1.8, -0.5 + (k % 4) * 0.6, Math.cos(k * 1.7) * 1.8)
  put(basket, new THREE.CylinderGeometry(0.06, 0.06, 14, 6), steel, 0, 9, 0)
  basket.position.set(0, 30, 0)
  root.add(basket)

  const sensors: Record<SensorId, THREE.Vector3> = {
    power: new THREE.Vector3(14, 8.5, -16),
    thermo: new THREE.Vector3(-6.2, 3.2, 3.2),
    offgas: new THREE.Vector3(1, 13.5, -14),
    cooling: new THREE.Vector3(-SHELL_R - 0.2, 7.6, -2.4),
  }
  // Small sensor housings at each tag position.
  const sensorMat = m(0x7c3aed, { emissive: new THREE.Color(0x4c1d95), emissiveIntensity: 0.6, metalness: 0.2 })
  const pickables: EafHandles['pickables'] = [{ object: furnace, id: 'furnace' }, { object: ladle, id: 'ladle' }, { object: transformer, id: 'transformer' }]
  for (const [id, point] of Object.entries(sensors) as [SensorId, THREE.Vector3][]) {
    const housing = put(root, box(0.9, 0.9, 0.9), sensorMat, point.x, point.y - 0.6, point.z)
    pickables.push({ object: housing, id })
  }

  return { root, furnace, roof, electrodes, scrap, scrapBase, scrapOrder, bath, bathMat, slag, slagMat, bubbles, arcs, arcLight, bathLight, offgasOrigin: new THREE.Vector3(4, 13.4, -20), tapStream, ladleFill, basket, sensors, pickables }
}
