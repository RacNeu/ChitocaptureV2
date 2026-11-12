import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { box } from '../three/shapes'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { num, ringgit } from '../format'
import { kettleInternals } from '../model/galv'
import { createComposer } from '../three/post'
import { Sparkline } from './Charts'
import type { GalvFrame } from './GalvHall3D'

type TagId = 'temp' | 'gas' | 'coating' | 'zinc'
type Props = { frame: MutableRefObject<GalvFrame>; onClose: () => void }

const tagInfo: Record<TagId, { name: string; unit: string; what: string }> = {
  temp: { name: 'Bath thermocouple', unit: '°C', what: 'Zinc temperature. Burners hold it near 450 °C: hotter wastes gas and makes more dross, colder makes thick, uneven coats.' },
  gas: { name: 'Burner gas meter', unit: 'Nm³/h', what: 'Natural gas to this kettle’s burners. It swings as the controller fires harder and softer around the set point.' },
  coating: { name: 'Coating gauge', unit: 'g/m²', what: 'Zinc on the wire after wiping, measured on line. Every g/m² above the specification is zinc paid for and given away.' },
  zinc: { name: 'Zinc feed', unit: 'kg/h', what: 'Zinc leaving the kettle on the wire plus dross and ash. A one-tonne jumbo ingot is lowered in to top the bath up.' },
}

const WIRES = 40
const BATH_TOP = 3
const STRIPES = (light: string, dark: string) => {
  const canvas = document.createElement('canvas')
  canvas.width = 64; canvas.height = 4
  const context = canvas.getContext('2d')!
  context.fillStyle = light; context.fillRect(0, 0, 64, 4)
  context.fillStyle = dark; context.fillRect(0, 0, 10, 4)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(24, 1)
  return texture
}

export default function KettleDeepDive({ frame, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const tagRefs = useRef(new Map<TagId, HTMLDivElement>())
  const history = useRef<Record<TagId, number[]>>({ temp: [], gas: [], coating: [], zinc: [] })
  const coatingTrace = useRef<number[]>([])
  const [line, setLine] = useState(0)
  const lineRef = useRef(0)
  lineRef.current = line
  const [step, setStep] = useState(0)
  const [, setTick] = useState(0)
  const [hover, setHover] = useState<TagId | null>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x11161d)
    scene.fog = new THREE.Fog(0x11161d, 60, 130)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.3, 400)
    camera.position.set(-6, 30, 52)
    const goal = new THREE.Vector3(1, 13, 27)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(6.5, 4, 0)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.5
    controls.minDistance = 8
    controls.maxDistance = 90
    let flying = true
    controls.addEventListener('start', () => { flying = false })

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1))
    const key = new THREE.DirectionalLight(0xffffff, 1.3)
    key.position.set(-15, 40, 30)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 })
    scene.add(key)
    const glowLight = new THREE.PointLight(0xff7a2a, 30, 30, 1.8)
    glowLight.position.set(0, 1.5, -5)
    scene.add(glowLight)
    const post = createComposer(renderer, scene, camera, { bloomStrength: 0.7, bloomThreshold: 0.8 })

    const m = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, ...o })
    const put = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = scene) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh
    }

    // Floor, furnace casing (back and ends) and the steel kettle with its front cut away.
    put(box(70, 1, 40), m(0x2b3440, { roughness: 0.95, metalness: 0 }), 0, -0.5, 0)
    const brick = m(0x7a3f2c, { roughness: 0.9, metalness: 0 })
    put(box(20, 4.6, 1.4), brick, 0, 2.3, -5.6)
    for (const x of [-10.3, 10.3]) put(box(1.4, 4.6, 10), brick, x, 2.3, -1.2)
    const steel = m(0x3b424b, { metalness: 0.6, roughness: 0.4 })
    put(box(16.8, 0.4, 7.6), steel, 0, -0.2, 0)
    put(box(16.8, 3.6, 0.3), steel, 0, 1.6, -3.8)
    for (const x of [-8.4, 8.4]) put(box(0.3, 3.6, 7.6), steel, x, 1.6, 0)
    const cut = put(box(16.8, 3.6, 0.1), new THREE.MeshPhysicalMaterial({ color: 0x9fb3c8, transparent: true, opacity: 0.12, roughness: 0.1 }), 0, 1.6, 3.8)
    cut.castShadow = false

    // Molten zinc (see-through so the sinker roll and wires show), dross on the floor, ash on the surface.
    const zincMat = new THREE.MeshPhysicalMaterial({ color: 0xc3ccd6, metalness: 0.85, roughness: 0.2, transparent: true, opacity: 0.55, emissive: new THREE.Color(0x4a2f22), emissiveIntensity: 0.5 })
    const zinc = put(box(16.4, BATH_TOP - 0.05, 7.3), zincMat, 0, (BATH_TOP - 0.05) / 2, 0)
    zinc.castShadow = false
    const surface = put(new THREE.PlaneGeometry(16.4, 7.3, 40, 18), new THREE.MeshStandardMaterial({ color: 0xd4dce4, metalness: 0.95, roughness: 0.15, emissive: new THREE.Color(0x3a2a20), emissiveIntensity: 0.4 }), 0, BATH_TOP, 0)
    surface.rotation.x = -Math.PI / 2
    const surfacePositions = (surface.geometry.getAttribute('position') as THREE.BufferAttribute)
    const baseZ = Float32Array.from({ length: surfacePositions.count }, () => 0)
    const dross = put(box(16.2, 1, 7.1), m(0x5b6068, { roughness: 1, metalness: 0.2, flatShading: true }), 0, 0.5, 0)
    for (const [x, z, w] of [[-7.4, -2, 1.4], [-7, 1.5, 1.1], [5.2, -2.6, 0.9], [-6.2, 3, 0.8]] as const) put(box(w, 0.05, w * 0.7), m(0x8a8f96, { roughness: 1 }), x, BATH_TOP + 0.03, z)
    // Covers over the idle middle of the bath, shown when the kettle-cover upgrade is on.
    const covers = new THREE.Group()
    for (const x of [-2.4, 1.2]) put(box(3.4, 0.3, 7.2), m(0x9aa3ab, { metalness: 0.5 }), x, BATH_TOP + 0.2, 0, covers)
    scene.add(covers)

    // Sinker roll that holds the wires under the zinc.
    const roll = put(new THREE.CylinderGeometry(0.45, 0.45, 7.2, 20), m(0x8b8f94, { metalness: 0.4 }), 0, 0.95, 0)
    roll.rotation.x = Math.PI / 2

    // Burners along the back and ends, with flames sized by the firing rate.
    const flames: THREE.Mesh[] = []
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
    const burnerMat = m(0x52525b, { metalness: 0.6 })
    const burner = (x: number, z: number, rotY: number) => {
      const body = put(new THREE.CylinderGeometry(0.3, 0.3, 1.2, 12), burnerMat, x, 0.9, z)
      body.rotation.set(Math.PI / 2, 0, 0)
      body.rotation.y = rotY
      const flame = put(new THREE.ConeGeometry(0.32, 1.6, 12, 1, true), flameMat, x, 0.9, z)
      flame.rotation.set(Math.PI / 2, 0, 0)
      flame.castShadow = false
      flame.userData.dir = rotY
      flames.push(flame)
    }
    for (let k = 0; k < 6; k += 1) burner(-6.5 + k * 2.6, -4.6, 0)
    const gasPipe = put(new THREE.CylinderGeometry(0.18, 0.18, 18, 10), m(0xf28c28), 0, 0.2, -6.5)
    gasPipe.rotation.z = Math.PI / 2
    for (let k = 0; k < 6; k += 1) put(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 8), m(0xf28c28), -6.5 + k * 2.6, 0.55, -5.7).rotation.x = Math.PI / 2

    // 40 wires: dull flux-coated wire in, bright galvanised wire out, up through the wiping and over a pulley.
    const inTexture = STRIPES('#8b8378', '#6b645b')
    const outTexture = STRIPES('#e8eef3', '#b8c3cc')
    const inMat = new THREE.MeshStandardMaterial({ map: inTexture, roughness: 0.6, metalness: 0.4 })
    const outMat = new THREE.MeshStandardMaterial({ map: outTexture, roughness: 0.25, metalness: 0.8, emissive: new THREE.Color(0x222831) })
    for (let k = 0; k < WIRES; k += 1) {
      const z = -3.2 + k * (6.4 / (WIRES - 1))
      const into = new THREE.CatmullRomCurve3([[-22, 6.5], [-12, 4.6], [-8, BATH_TOP], [-4, 1.6], [0, 0.5]].map(([x, y]) => new THREE.Vector3(x, y, z)))
      const out = new THREE.CatmullRomCurve3([[0, 0.5], [3.5, 1.2], [5.4, 2.6], [6, 4], [6, 9.5], [6.6, 11], [8.5, 11.4], [22, 11.4]].map(([x, y]) => new THREE.Vector3(x, y, z)))
      put(new THREE.TubeGeometry(into, 60, 0.04, 5), inMat).castShadow = false
      put(new THREE.TubeGeometry(out, 80, 0.04, 5), outMat).castShadow = false
    }
    const pulley = put(new THREE.CylinderGeometry(0.6, 0.6, 7.2, 20), m(0x64748b, { metalness: 0.6 }), 6.3, 10.9, 0)
    pulley.rotation.x = Math.PI / 2
    for (const z of [-3.8, 3.8]) put(box(0.4, 11, 0.4), m(0x2f8f5b), 6.3, 5.5, z)
    // Flux dryer outlet on the left, cooling trough on the right.
    put(box(6, 2.4, 7.6), m(0x6b7280), -19, 5.6, 0)
    put(box(10, 1, 7.6), m(0x3d4650), 17, 10.4, 0)
    put(box(9.6, 0.08, 7.2), new THREE.MeshStandardMaterial({ color: 0x5aa9e6, transparent: true, opacity: 0.8 }), 17, 10.95, 0)

    // Wiping: nitrogen knives (blue jets) with coating control, otherwise charcoal pads.
    const wipeN2 = new THREE.Group()
    for (const dx of [-0.55, 0.55]) put(box(0.4, 0.5, 7.4), m(0x2563eb, { metalness: 0.5 }), 6 + dx, 4.6, 0, wipeN2)
    const jetCount = 160
    const jetGeometry = new THREE.BufferGeometry()
    jetGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(jetCount * 3), 3))
    const jets = new THREE.Points(jetGeometry, new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.12, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }))
    wipeN2.add(jets)
    scene.add(wipeN2)
    const wipePad = new THREE.Group()
    put(box(1.4, 0.9, 7.4), m(0x111827, { roughness: 1 }), 6, 4.6, 0, wipePad)
    put(box(1.42, 0.12, 7.42), m(0xff6a1a, { emissive: new THREE.Color(0xff4a00), emissiveIntensity: 1.2 }), 6, 4.2, 0, wipePad)
    scene.add(wipePad)
    // Coating gauge above the wiping.
    put(box(0.8, 0.6, 7.6), m(0x0ea5e9, { emissive: new THREE.Color(0x075985), emissiveIntensity: 0.6 }), 6, 7.6, 0)

    // Thermocouple, and the hoist that lowers a jumbo zinc ingot.
    put(new THREE.CylinderGeometry(0.08, 0.08, 3.6, 8), m(0xd4d4d8, { metalness: 0.7 }), -7.2, 2.6, -3)
    put(box(0.5, 0.5, 0.5), m(0x7c3aed), -7.2, 4.6, -3)
    put(box(0.6, 0.6, 12), m(0xf2c230), -3, 13.6, -1)
    const ingot = new THREE.Group()
    put(box(2.2, 0.55, 1), m(0xc9d1d9, { metalness: 0.8, roughness: 0.3 }), 0, 0, 0, ingot)
    const chain = put(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), m(0x374151), 0, 0, 0)
    ingot.position.set(-3, 9, -2.2)
    scene.add(ingot)

    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      post.setSize(w, h)
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const tagPoints: Record<TagId, THREE.Vector3> = {
      temp: new THREE.Vector3(-7.2, 5.2, -3), gas: new THREE.Vector3(3, 0.6, -6.6), coating: new THREE.Vector3(6, 8.2, 3.6), zinc: new THREE.Vector3(-3, 9.6, -2.2),
    }
    const projected = new THREE.Vector3()
    const clock = new THREE.Clock()
    let raf = 0, lastSample = -1, lastPublish = 0, lastStep = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta())
      const elapsed = clock.elapsedTime
      const { minutes, params, upgrades, live } = frame.current
      const k = kettleInternals(params, upgrades, live, minutes, lineRef.current)
      if (flying) { camera.position.lerp(goal, 0.04); if (camera.position.distanceTo(goal) < 0.4) flying = false }

      // Wires move at line speed.
      const speed = live.lineSpeedMPerMin / 52
      inTexture.offset.x -= dt * 0.5 * speed
      outTexture.offset.x -= dt * 0.5 * speed
      // Burner flames and glow follow the firing rate; the bath brightens slightly as it heats.
      flames.forEach((flame, index) => {
        const flicker = 0.85 + Math.sin(elapsed * 17 + index * 2.3) * 0.08 + Math.random() * 0.07
        const size = (0.35 + k.firing) * flicker
        flame.scale.set(1, size, 1)
        flame.position.z = -4.6 + 0.8 * size
      })
      flameMat.opacity = 0.45 + 0.45 * k.firing
      glowLight.intensity = 10 + 40 * k.firing
      zincMat.emissiveIntensity = 0.3 + (k.tempC - 445) * 0.04
      // Gentle ripples where the wires enter and leave.
      for (let index = 0; index < surfacePositions.count; index += 1) {
        const x = surfacePositions.getX(index), y = surfacePositions.getY(index)
        const near = Math.exp(-((x + 8) ** 2) / 4) + Math.exp(-((x - 5.6) ** 2) / 3)
        surfacePositions.setZ(index, baseZ[index] + Math.sin(elapsed * 4 + x * 2.2 + y * 1.3) * 0.025 * near + Math.sin(elapsed * 1.3 + x * 0.6) * 0.008)
      }
      surfacePositions.needsUpdate = true
      covers.visible = upgrades.kettleCover
      wipeN2.visible = upgrades.coatingControl
      wipePad.visible = !upgrades.coatingControl
      if (upgrades.coatingControl) {
        const attr = jets.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let index = 0; index < jetCount; index += 1) {
          const t = (elapsed * 1.6 + index * 0.137) % 1
          const side = index % 2 ? 1 : -1
          attr.setXYZ(index, 6 + side * (0.55 - t * 0.5), 4.6 + (Math.random() - 0.5) * 0.2, -3.6 + ((index * 0.37) % 1) * 7.2)
        }
        attr.needsUpdate = true
      }
      // Dross builds up on the floor over a shift.
      dross.scale.y = 0.15 + k.drossLayer * 0.85
      dross.position.y = dross.scale.y * 0.5
      // Ingot: hangs high, then is lowered in and melts away near the end of each cycle.
      const dip = Math.max(0, (k.ingotPhase - 0.88) / 0.12)
      ingot.position.y = 9 - Math.min(1, dip * 2) * 6.4
      ingot.scale.setScalar(dip > 0.5 ? Math.max(0.05, 1 - (dip - 0.5) * 2) : 1)
      chain.scale.y = 13.3 - ingot.position.y
      chain.position.set(-3, (13.3 + ingot.position.y) / 2, -2.2)

      controls.update()
      post.render()

      if (minutes - lastSample > 0.25) {
        lastSample = minutes
        const push = (id: TagId, value: number) => { history.current[id] = [...history.current[id], value].slice(-120) }
        push('temp', k.tempC); push('gas', k.gasNm3PerH); push('coating', k.coatingGPerM2); push('zinc', k.zincKgPerH)
        coatingTrace.current = [...coatingTrace.current, k.coatingGPerM2].slice(-120)
      }
      for (const [id, point] of Object.entries(tagPoints) as [TagId, THREE.Vector3][]) {
        const element = tagRefs.current.get(id)
        if (!element) continue
        projected.copy(point).project(camera)
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
        element.style.opacity = projected.z < 1 ? '1' : '0'
      }
      if (elapsed - lastStep > 3.5) { lastStep = elapsed; setStep((value) => (value + 1) % 4) }
      if (elapsed - lastPublish > 0.25) { lastPublish = elapsed; setTick((value) => value + 1) }
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      controls.dispose()
      post.dispose()
      scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); (mesh.material as THREE.Material | undefined)?.dispose?.() })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [frame])

  const { minutes, params, upgrades, live } = frame.current
  const k = kettleInternals(params, upgrades, live, minutes, line)
  const reading: Record<TagId, string> = { temp: num(k.tempC, 1), gas: num(k.gasNm3PerH), coating: num(k.coatingGPerM2), zinc: num(k.zincKgPerH) }
  const steps = [
    { name: 'Wire dives in', text: 'Clean wire, coated in zinc ammonium chloride flux and dried, dives into the molten zinc and runs under the sinker roll.' },
    { name: 'Iron and zinc bond', text: 'In about a second at 450 °C the iron at the wire’s surface reacts with zinc, growing a thin iron-zinc alloy layer that locks the coating on.' },
    { name: 'Wiping sets the thickness', text: upgrades.coatingControl ? 'Nitrogen knives blow excess zinc back into the bath, steered by the coating gauge, so the coat stays just above specification.' : 'Charcoal pads wipe the rising wire by hand-set pressure, so the coat wanders and operators run it thick to stay safe.' },
    { name: 'Cooling locks it in', text: 'Above the bath the zinc freezes; a water trough cools the wire before it is coiled on the take-up.' },
  ]
  const w = 250, h = 80
  const trace = coatingTrace.current
  const lo = params.coatingSpecGPerM2 - 10, hi = params.coatingSpecGPerM2 + 45
  const y = (value: number) => h - (Math.min(hi, Math.max(lo, value)) - lo) / (hi - lo) * h
  const path = trace.map((value, index) => `${index ? 'L' : 'M'}${index / Math.max(1, trace.length - 1) * w},${y(value)}`).join(' ')
  const heat = [
    { key: 'wire', label: 'Heating the wire', value: k.heat.wire, colour: '#0ea5e9' },
    { key: 'zinc', label: 'Melting new zinc', value: k.heat.zinc, colour: '#94a3b8' },
    { key: 'losses', label: 'Kettle walls & zinc surface', value: k.heat.losses, colour: '#f59e0b' },
    { key: 'flue', label: 'Up the flue', value: k.heat.flue, colour: '#e11d48' },
  ]

  return <div className="deepdive kettle-dive">
    <div ref={mountRef} className="deepdive-canvas" role="img" aria-label="Cutaway 3D view of a zinc kettle on a wire galvanising line." />
    <div className="plant3d-labels" aria-hidden="true">
      {(Object.keys(tagInfo) as TagId[]).map((id) => <div key={id} ref={(element) => { if (element) tagRefs.current.set(id, element); else tagRefs.current.delete(id) }}
        className={`sensor-tag${hover === id ? ' hovered' : ''}`} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} style={{ pointerEvents: 'auto' }}>
        <div className="sensor-tag-head"><i />{tagInfo[id].name}<em>virtual</em></div>
        <strong>{reading[id]} <small>{tagInfo[id].unit}</small></strong>
        <Sparkline values={history.current[id]} width={140} height={26} className="tag-spark" />
      </div>)}
    </div>
    <button type="button" className="deepdive-back" onClick={onClose}>← Back to the plant</button>
    {hover && <div className="deepdive-hover">{tagInfo[hover].what}</div>}

    <aside className="deepdive-panel">
      <span className="eyebrow">Inside the zinc kettle</span>
      <div className="line-pick" role="radiogroup" aria-label="Galvanising line">{Array.from({ length: params.galvLines }, (_, index) => <button key={index} type="button" role="radio" aria-checked={line === index} className={line === index ? 'active' : ''} onClick={() => setLine(index)}>Line {index + 1}</button>)}</div>
      <ol className="phase-steps">{steps.map((item, index) => <li key={item.name} className={index === step ? 'current' : index < step ? 'done' : ''}><b>{index + 1}</b><span>{item.name}</span></li>)}</ol>
      <p className="deepdive-story">{steps[step].text}</p>
      <div className="bt-chart">
        <div className="bt-head"><span>Coating after wiping</span><b>{num(k.coatingGPerM2)} g/m²</b></div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Measured coating against the specification">
          <line x1="0" x2={w} y1={y(params.coatingSpecGPerM2)} y2={y(params.coatingSpecGPerM2)} className="spec-line" />
          {path && <path d={path} className="bt-line" />}
        </svg>
        <small className="muted">Dashed line: {params.coatingSpecGPerM2} g/m² specification. Average now {num(k.coatingAvgGPerM2)} g/m²{k.overcoatZincTPerYear > 1 ? `: about ${num(k.overcoatZincTPerYear)} t of extra zinc a year on this line (${ringgit(k.overcoatRMPerYear)})` : ''}.</small>
      </div>
      <div className="heat-split">
        <div className="bt-head"><span>Where this kettle’s gas goes</span></div>
        <div className="heat-bar">{heat.map((part) => <i key={part.key} style={{ width: `${part.value * 100}%`, background: part.colour }} title={`${part.label}: ${num(part.value * 100)}%`} />)}</div>
        <ul>{heat.map((part) => <li key={part.key}><i style={{ background: part.colour }} />{part.label}<b>{num(part.value * 100)}%</b></li>)}</ul>
        <small className="muted">Only {num(k.heat.wire * 100)}% actually heats the wire; most keeps the bath hot or leaves up the flue. That is why kettle covers and better burners pay back.</small>
      </div>
      <dl className="deepdive-stats">
        <div><dt>Wire through</dt><dd>{num(k.wireTPerH, 2)} t/h</dd></div>
        <div><dt>Zinc used</dt><dd>{num(k.zincKgPerH)} kg/h</dd></div>
        <div><dt>Dross made</dt><dd>{num(k.drossKgPerH, 1)} kg/h</dd></div>
        <div><dt>Next ingot</dt><dd>{k.minutesToIngot < 1 ? 'going in now' : `in ${num(k.minutesToIngot)} min`}</dd></div>
      </dl>
      <p className="muted small">Illustrative heat balance for a sample wire kettle. Dross (iron-zinc crystals) settles on the floor and is grabbed out each shift; it is sold back for recycling.</p>
    </aside>
  </div>
}
