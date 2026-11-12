import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { box } from '../three/shapes'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { num } from '../format'
import { DEFAULT_SORBENT_CAPACITY, sorbentInventoryTonnes } from '../model/measures'
import { annual, captureInternals, intensity } from '../model/steel'
import { createComposer } from '../three/post'
import { Sparkline } from './Charts'
import type { SimFrame } from './SteelHall3D'

type TagId = 'inlet' | 'outlet' | 'bedTemp' | 'toTank'
type Props = { frame: MutableRefObject<SimFrame>; capacity: number | null; onClose: () => void }

const tagInfo: Record<TagId, { name: string; unit: string; what: string }> = {
  inlet: { name: 'Inlet CO₂ analyser', unit: '% CO₂', what: 'CO₂ in the reheat-furnace exhaust entering the capturing column.' },
  outlet: { name: 'Outlet CO₂ analyser', unit: '% CO₂', what: 'CO₂ left in the cleaned gas. It rises sharply at breakthrough, which is when the columns swap.' },
  bedTemp: { name: 'Regeneration thermocouple', unit: '°C', what: 'Temperature of the column being regenerated with furnace waste heat.' },
  toTank: { name: 'CO₂ product flow meter', unit: 'kg/h', what: 'Concentrated CO₂ released by the regenerating column, compressed into the storage tank.' },
}

const BED_X = { A: -6, B: 6 } as const
const BED_H = 14
const BED_R = 2.6
const FRESH = new THREE.Color(0x10b981)
const FULL = new THREE.Color(0xf59e0b)

type Stream = { points: THREE.Points; curve: THREE.CatmullRomCurve3; offsets: Float32Array; speed: number; bed: 'A' | 'B' | null; kind: 'flue' | 'clean' | 'co2' }

export default function CaptureDeepDive({ frame, capacity, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const tagRefs = useRef(new Map<TagId, HTMLDivElement>())
  const history = useRef<Record<TagId, number[]>>({ inlet: [], outlet: [], bedTemp: [], toTank: [] })
  const curve = useRef<{ t: number; v: number }[]>([])
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
    scene.background = new THREE.Color(0x0f1a24)
    scene.fog = new THREE.Fog(0x0f1a24, 70, 150)
    const camera = new THREE.PerspectiveCamera(36, 1, 0.5, 500)
    camera.position.set(-30, 44, 80)
    const goal = new THREE.Vector3(-8, 24, 58)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(7, 7, 0)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.45
    controls.minDistance = 15
    controls.maxDistance = 110
    let flying = true
    controls.addEventListener('start', () => { flying = false })

    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.1))
    const key = new THREE.DirectionalLight(0xffffff, 1.5)
    key.position.set(20, 50, 30)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40 })
    scene.add(key)
    const post = createComposer(renderer, scene, camera, { bloomStrength: 0.6, bloomThreshold: 0.85 })

    const m = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.3, ...o })
    const put = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh
    }
    put(box(80, 1, 50), m(0x334155, { roughness: 0.95, metalness: 0 }), 0, -0.5, 0)
    put(box(30, 0.6, 14), m(0x64748b), 0, 0.3, 0)

    // Reheat furnace stack (left) feeding the unit, clean-gas vent (right back), compressor and CO₂ tank (right).
    put(new THREE.CylinderGeometry(1.6, 2, 30, 18), m(0xcbd5e1), -24, 15, -6)
    put(new THREE.CylinderGeometry(1.65, 1.65, 2, 18), m(0xe11d48), -24, 27, -6)
    put(new THREE.CylinderGeometry(0.9, 1, 22, 14), m(0xe2e8f0), 4, 11, -10)
    put(box(5, 4, 4), m(0x1d4ed8), 15, 2.3, 6)
    const tank = new THREE.Group()
    const tankShell = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 14, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.28, side: THREE.DoubleSide }))
    tankShell.rotation.z = Math.PI / 2
    tank.add(tankShell)
    for (const x of [-7, 7]) { const cap = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 12), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.28 })); cap.position.x = x; cap.scale.x = 0.4; tank.add(cap) }
    const tankFill = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 13.6, 28), new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: new THREE.Color(0x065f46), emissiveIntensity: 0.8, transparent: true, opacity: 0.85 }))
    tankFill.rotation.z = Math.PI / 2
    tank.add(tankFill)
    tank.position.set(20, 4.2, -2)
    scene.add(tank)
    for (const x of [14, 26]) put(box(1, 3, 4), m(0x475569), x, 1.5, -2)

    // Two columns with sorbent granules and waste-heat coils.
    const beds = (['A', 'B'] as const).map((id) => {
      const x = BED_X[id]
      put(new THREE.CylinderGeometry(BED_R + 0.3, BED_R + 0.3, 1, 28), m(0x475569), x, 1, 0)
      put(new THREE.CylinderGeometry(BED_R + 0.3, BED_R + 0.3, 1, 28), m(0x475569), x, BED_H + 2, 0)
      const glass = put(new THREE.CylinderGeometry(BED_R, BED_R, BED_H, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xbfe7ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, side: THREE.DoubleSide }), x, BED_H / 2 + 1.5, 0)
      glass.castShadow = false
      const count = 520
      const granules = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }), count)
      const heights: number[] = []
      const dummy = new THREE.Object3D()
      let seed = id === 'A' ? 7 : 13
      const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
      for (let k = 0; k < count; k += 1) {
        const r = Math.sqrt(rand()) * (BED_R - 0.4), a = rand() * Math.PI * 2, h = rand()
        dummy.position.set(x + Math.cos(a) * r, 2 + h * (BED_H - 1), Math.sin(a) * r)
        dummy.rotation.set(rand() * 3, rand() * 3, rand() * 3)
        dummy.updateMatrix()
        granules.setMatrixAt(k, dummy.matrix)
        granules.setColorAt(k, FRESH)
        heights.push(h)
      }
      scene.add(granules)
      const coilPath = new THREE.CatmullRomCurve3(Array.from({ length: 60 }, (_, k) => new THREE.Vector3(x + Math.cos(k * 0.75) * (BED_R + 0.5), 2.5 + k / 59 * (BED_H - 2), Math.sin(k * 0.75) * (BED_R + 0.5))))
      const coilMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, emissive: new THREE.Color(0xf97316), emissiveIntensity: 0 })
      put(new THREE.TubeGeometry(coilPath, 240, 0.16, 6), coilMat)
      const label = new THREE.Vector3(x, BED_H + 4.5, 0)
      return { id, x, granules, heights, coilMat, label }
    })

    // Particle streams along pipes.
    const streams: Stream[] = []
    const pipeMat = m(0x94a3b8, { metalness: 0.5 })
    const stream = (pts: [number, number, number][], kind: Stream['kind'], bed: 'A' | 'B' | null, colour: number, speed: number) => {
      const c = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), false, 'catmullrom', 0.05)
      const pipe = put(new THREE.TubeGeometry(c, 60, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.35, metalness: 0.4 }))
      pipe.castShadow = false
      const n = 46
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
      const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color: colour, size: 0.75, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }))
      scene.add(points)
      streams.push({ points, curve: c, offsets: Float32Array.from({ length: n }, (_, k) => k / n), speed, bed, kind })
    }
    for (const id of ['A', 'B'] as const) {
      const x = BED_X[id]
      stream([[-24, 6, -6], [-16, 6, -2], [x - 3, 1.5, 3], [x, 1.5, 0]], 'flue', id, 0x94a3b8, 0.18)
      stream([[x, BED_H + 2.5, 0], [x * 0.5, BED_H + 4, -6], [4, BED_H + 3, -10], [4, 22, -10]], 'clean', id, 0xe0f2fe, 0.22)
      stream([[x, BED_H + 2.5, 0], [x + 2, BED_H + 3.5, 4], [12, 6, 6], [15, 4.3, 6]], 'co2', id, 0x34d399, 0.16)
    }
    stream([[17.5, 2.3, 6], [19, 3, 2], [20, 4.2, -2]], 'co2', null, 0x34d399, 0.25)
    void pipeMat

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
      inlet: new THREE.Vector3(-17, 9, -3), outlet: new THREE.Vector3(4, 24, -10), bedTemp: new THREE.Vector3(9, 5, 3), toTank: new THREE.Vector3(22, 9, -2),
    }
    const projected = new THREE.Vector3()
    const clock = new THREE.Clock()
    let raf = 0, lastSample = -1, lastPublish = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta())
      const elapsed = clock.elapsedTime
      const { minutes, params, upgrades } = frame.current
      const c = captureInternals(params, upgrades, minutes)
      const running = upgrades.captureShare > 0
      if (flying) { camera.position.lerp(goal, 0.05); if (camera.position.distanceTo(goal) < 0.5) flying = false }

      for (const bed of beds) {
        const capturing = bed.id === c.activeBed
        const loading = capturing ? c.front : c.regenLoading
        const colour = new THREE.Color()
        bed.heights.forEach((h, k) => {
          // Capturing bed fills from the bottom; the regenerating bed empties evenly.
          const amount = capturing ? Math.min(1, Math.max(0, (loading - h) * 6 + 0.5)) * (h < loading + 0.08 ? 1 : 0) : loading
          colour.copy(FRESH).lerp(FULL, running ? amount : 0)
          bed.granules.setColorAt(k, colour)
        })
        bed.granules.instanceColor!.needsUpdate = true
        bed.coilMat.emissiveIntensity = !capturing && running ? Math.max(0, (c.regenTempC - 40) / 80) * 2.4 : 0
      }

      for (const s of streams) {
        const show = running && (s.bed === null ? c.toTankKgPerH > 0 : s.kind === 'co2' ? s.bed !== c.activeBed && c.toTankKgPerH > 0 : s.bed === c.activeBed)
        s.points.visible = show
        if (!show) continue
        const attr = s.points.geometry.getAttribute('position') as THREE.BufferAttribute
        for (let k = 0; k < s.offsets.length; k += 1) {
          s.offsets[k] = (s.offsets[k] + dt * s.speed) % 1
          const point = s.curve.getPointAt(s.offsets[k])
          attr.setXYZ(k, point.x + Math.sin(k * 3.1 + elapsed) * 0.18, point.y + Math.cos(k * 1.7 + elapsed) * 0.18, point.z)
        }
        attr.needsUpdate = true
        if (s.kind === 'clean') (s.points.material as THREE.PointsMaterial).color.setHex(c.breakthrough > 0.3 ? 0xfcd34d : 0xe0f2fe)
      }
      tankFill.scale.y = Math.max(0.02, c.tankFill)
      tankFill.position.y = -(1 - Math.max(0.02, c.tankFill)) * 2.7

      controls.update()
      post.render()

      if (minutes - lastSample > 0.25) {
        lastSample = minutes
        const push = (id: TagId, value: number) => { history.current[id] = [...history.current[id], value].slice(-120) }
        push('inlet', c.inletCO2Pct); push('outlet', c.outletCO2Pct); push('bedTemp', c.regenTempC); push('toTank', c.toTankKgPerH)
        if (curve.current.length && c.phaseT < curve.current.at(-1)!.t) curve.current = []
        curve.current.push({ t: c.phaseT, v: running ? c.breakthrough : 0 })
      }
      tagPoints.bedTemp.set(BED_X[c.activeBed === 'A' ? 'B' : 'A'] + 3.4, 5, 2.5)
      for (const [id, point] of Object.entries(tagPoints) as [TagId, THREE.Vector3][]) {
        const element = tagRefs.current.get(id)
        if (!element) continue
        projected.copy(point).project(camera)
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
        element.style.opacity = projected.z < 1 ? '1' : '0'
      }
      for (const bed of beds) {
        const element = mount.parentElement?.querySelector<HTMLDivElement>(`.bed-label[data-bed="${bed.id}"]`)
        if (!element) continue
        projected.copy(bed.label).project(camera)
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
      }
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

  const { minutes, params, upgrades } = frame.current
  const c = captureInternals(params, upgrades, minutes)
  const running = upgrades.captureShare > 0
  const capturedTPerYear = intensity(params, upgrades).capturedKgPerT * annual(params, upgrades).steelT / 1_000
  const cap = capacity ?? DEFAULT_SORBENT_CAPACITY
  const sorbentT = sorbentInventoryTonnes(capturedTPerYear, cap)
  const reading: Record<TagId, string> = { inlet: num(c.inletCO2Pct, 1), outlet: num(c.outletCO2Pct, 2), bedTemp: num(c.regenTempC), toTank: num(c.toTankKgPerH) }
  const other = c.activeBed === 'A' ? 'B' : 'A'
  const steps = ['Capture', 'Heat', 'Release CO₂', 'Swap']
  const stepIndex = c.phaseT < 0.15 ? 0 : c.phaseT < 0.3 ? 1 : c.phaseT < 0.85 ? 2 : 3
  const w = 250, h = 80
  const path = curve.current.map((point, index) => `${index ? 'L' : 'M'}${point.t * w},${h - point.v * h}`).join(' ')

  return <div className="deepdive capture-dive">
    <div ref={mountRef} className="deepdive-canvas" role="img" aria-label="Cutaway 3D view of the ChitoCapture two-column chitosan capture unit." />
    <div className="plant3d-labels" aria-hidden="true">
      {(['A', 'B'] as const).map((id) => <div key={id} data-bed={id} className={`bed-label${id === c.activeBed ? ' capturing' : ' regen'}`}>Column {id} · {id === c.activeBed ? 'capturing' : 'regenerating'}</div>)}
      {(Object.keys(tagInfo) as TagId[]).map((id) => <div key={id} ref={(element) => { if (element) tagRefs.current.set(id, element); else tagRefs.current.delete(id) }}
        className={`sensor-tag${hover === id ? ' hovered' : ''}`} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)} style={{ pointerEvents: 'auto' }}>
        <div className="sensor-tag-head"><i />{tagInfo[id].name}<em>virtual</em></div>
        <strong>{reading[id]} <small>{tagInfo[id].unit}</small></strong>
        <Sparkline values={history.current[id]} width={140} height={26} className="tag-spark" />
      </div>)}
    </div>
    <button type="button" className="deepdive-back" onClick={onClose}>← Back to the mill</button>
    {hover && <div className="deepdive-hover">{tagInfo[hover].what}</div>}

    <aside className="deepdive-panel">
      <span className="eyebrow">Inside the ChitoCapture unit · reheat-furnace stack</span>
      <ol className="phase-steps">{steps.map((step, index) => <li key={step} className={index === stepIndex ? 'current' : index < stepIndex ? 'done' : ''}><b>{index + 1}</b><span>{step}</span>{index === stepIndex && <i style={{ width: `${c.phaseT * 100}%` }} />}</li>)}</ol>
      <p className="deepdive-story">{c.stage}</p>
      <div className="bt-chart">
        <div className="bt-head"><span>Column {c.activeBed} breakthrough</span><b>{num(c.breakthrough * 100)}%</b></div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Outlet over inlet CO₂ during this capture half cycle">
          <line x1="0" x2={w} y1={h * 0.5} y2={h * 0.5} className="chart-grid" />
          {path && <path d={path} className="bt-line" />}
        </svg>
        <small className="muted">Outlet ÷ inlet CO₂ while column {c.activeBed} captures. When it climbs, column {other} takes over.</small>
      </div>
      <dl className="deepdive-stats">
        <div><dt>Capturing now</dt><dd>{num(c.capturedKgPerH)} kg/h</dd></div>
        <div><dt>Per year</dt><dd>{num(capturedTPerYear)} t CO₂</dd></div>
        <div><dt>Gas treated</dt><dd>{num(upgrades.captureShare * 100)}% of stack</dd></div>
        <div><dt>Tank fill</dt><dd>{num(c.tankFill * 100)}%</dd></div>
        <div className="wide"><dt>Sorbent per column</dt><dd>{num(sorbentT, 1)} t at {num(cap, 2)} mmol/g {capacity ? '(measured on the rig)' : '(assumed: measure on the Sensors tab)'}</dd></div>
      </dl>
      {!running && <p className="note">The unit is off. Turn on the ChitoCapture slider in the what-if sandbox below.</p>}
      <p className="muted small">Illustrative two-column temperature-swing cycle. Regeneration heat comes from furnace waste heat; captured CO₂ needs a use or storage route before it counts as removed.</p>
    </aside>
  </div>
}
