import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GalvLive, GalvParams, GalvUnitId, GalvUpgrades } from '../model/galv'
import { buildGalvHall, type GalvHallHandles } from '../three/galvHall'
import { createComposer } from '../three/post'
import { createHeatmap } from '../three/heatmap'
import type { UnitTooltip } from './SteelHall3D'

export type GalvFrame = { minutes: number; live: GalvLive; upgrades: GalvUpgrades; params: GalvParams }

type Props = {
  frame: MutableRefObject<GalvFrame>
  showFlows: boolean
  selected: GalvUnitId | null
  onSelect: (id: GalvUnitId) => void
  /** Double-click or double-tap on the zinc kettles opens the zoomed-in view. */
  onDive?: () => void
  labels: { id: GalvUnitId; text: string; hot: boolean; sub?: string; above?: boolean }[]
  describe: (id: GalvUnitId) => UnitTooltip | null
  heatmap?: boolean
  co2Of?: (id: GalvUnitId) => number
}

function smokeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.85)'); gradient.addColorStop(0.5, 'rgba(255,255,255,0.3)'); gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

export default function GalvHall3D({ frame, showFlows, selected, onSelect, onDive, labels, describe, heatmap = false, co2Of }: Props) {
  const heatRef = useRef(heatmap)
  heatRef.current = heatmap
  const co2Ref = useRef(co2Of)
  co2Ref.current = co2Of
  const mountRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef(new Map<GalvUnitId, HTMLDivElement>())
  const hallRef = useRef<GalvHallHandles | null>(null)
  const flowsRef = useRef(showFlows)
  const cameraRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)
  const [hover, setHover] = useState<{ id: GalvUnitId; x: number; y: number } | null>(null)
  const [touched, setTouched] = useState(false)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onDiveRef = useRef(onDive)
  onDiveRef.current = onDive
  flowsRef.current = showFlows

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe9eef3)
    scene.fog = new THREE.Fog(0xe9eef3, 260, 560)
    const camera = new THREE.PerspectiveCamera(34, 1, 1, 1500)
    camera.position.set(34, 64, 96)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(22, 2, 6)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.4
    controls.minDistance = 20
    controls.maxDistance = 360
    controls.addEventListener('start', () => setTouched(true))
    cameraRef.current = { camera, controls }

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 1.15))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-80, 160, 120)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 80, bottom: -80, far: 500 })
    scene.add(sun)

    const hall = buildGalvHall()
    hallRef.current = hall
    scene.add(hall.root)
    const heat = createHeatmap(200, 72, new THREE.Vector3(0, 0.12, 0))
    scene.add(heat.mesh)
    let lastHeat = -1
    const post = createComposer(renderer, scene, camera, { bloomStrength: 0.5, bloomThreshold: 0.95 })

    const texture = smokeTexture()
    const puffs = hall.stacks.flatMap((stack) => Array.from({ length: 14 }, (_, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xc3c9ce, transparent: true, depthWrite: false, opacity: 0 }))
      scene.add(sprite)
      return { sprite, stack, phase: index / 14 }
    }))

    const resize = () => {
      renderer.setSize(mount.clientWidth, mount.clientHeight, false)
      renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'
      post.setSize(mount.clientWidth, mount.clientHeight)
      camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const clock = new THREE.Clock()
    const projected = new THREE.Vector3()
    const fan = hall.units.get('utilities')!.group.children.find((child) => child.userData.fan)
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta())
      const elapsed = clock.elapsedTime
      const { minutes, live, params } = frame.current

      // Drawing machines: capstans spin while drawing, faster at each die; lamp green = drawing, amber = coil change.
      hall.capstans.forEach((drums, index) => {
        const running = live.machinesRunning[index]
        drums.forEach((drum, die) => { if (running) drum.rotation.y += dt * (2.5 + die * 1.1) })
        const lamp = hall.machineLamps[index]
        lamp.color.set(running ? 0x22c55e : 0xf59e0b)
        lamp.emissive.set(running ? 0x22c55e : 0xf59e0b)
        lamp.emissiveIntensity = running ? 1.5 : 1 + Math.sin(elapsed * 6) * 0.6
      })

      // Galvanising lines: wires move at line speed; furnace, kettle and burner glow follow the gas.
      const speed = live.lineSpeedMPerMin / 52
      for (const wire of hall.wires) wire.offset.x -= dt * 0.6 * speed
      const annealNorm = live.annealGJPerH > 0 ? Math.min(1.4, live.annealGJPerH / Math.max(1, 0.9 * live.wireTPerH)) : 0.9
      hall.annealGlow.forEach((glow, line) => { glow.emissiveIntensity = 0.8 + 1.2 * annealNorm + Math.sin(elapsed * 3 + line) * 0.08 })
      hall.burnerGlow.forEach((glow, line) => { glow.emissiveIntensity = 0.4 + 2.4 * live.burnerFiring[line] })
      hall.zincGlow.forEach((zinc, line) => { zinc.emissiveIntensity = 0.25 + (live.kettleTempC[line] - params.kettleTempC + 5) * 0.04 })
      for (const spool of hall.takeups) spool.rotation.y += dt * 3 * speed
      if (fan) fan.rotation.y += dt * 4
      // Forklifts drive their loops; the drawing-shed crane travels up and down the bay.
      const tangent = new THREE.Vector3()
      hall.forklifts.forEach((lift, index) => {
        const t = (elapsed * lift.speed + index * 0.37) % 1
        lift.group.position.copy(lift.path.getPointAt(t))
        lift.path.getTangentAt(t, tangent)
        lift.group.rotation.y = Math.atan2(-tangent.z, tangent.x)
      })
      hall.crane.position.x = -50 + (Math.sin(elapsed * 0.12) + 1) / 2 * 44

      // Rod pickling hoist: carries a coil from tank to tank and dips it.
      const cycle = (minutes % 12) / 12
      const stage = Math.min(3, Math.floor(cycle * 4))
      const within = cycle * 4 - stage
      hall.hoist.position.x = -76 + stage * 5.5 + (within > 0.85 ? (within - 0.85) / 0.15 * 5.5 : 0)
      hall.hoist.position.y = within < 0.1 ? -within * 20 : within < 0.75 ? -2 : within < 0.85 ? -2 + (within - 0.75) * 20 : 0

      for (const line of hall.flows) {
        const material = line.mesh.material as THREE.MeshBasicMaterial
        const amount = line.kind === 'gas' ? (line.unit === 'anneal' ? live.annealGJPerH : live.kettleGJPerH) / 12 : line.unit === 'drawing' ? live.mw.drawing / 1.2 : (live.mw[line.unit as 'pickling' | 'utilities'] ?? 0.2) / 0.3
        line.mesh.visible = flowsRef.current && amount > 0.01
        line.texture.offset.x -= dt * (0.4 + amount)
        material.opacity = 0.35 + Math.min(0.6, amount / 3)
      }

      // Smoke: furnace and kettle stacks follow gas burnt; the scrubber gives off a thin vapour.
      for (const puff of puffs) {
        const amount = puff.stack.unit === 'anneal' ? Math.min(1, live.annealGJPerH / 18) : puff.stack.unit === 'kettle' ? Math.min(1, live.kettleGJPerH / 22) : 0.25
        const active = (puff.phase * 7.13) % 1 < amount
        puff.sprite.visible = active
        if (!active) continue
        const t = (elapsed * 0.18 + puff.phase) % 1
        puff.sprite.position.set(puff.stack.origin.x + t * 9, puff.stack.origin.y + t * 20, puff.stack.origin.z + t * 3)
        const size = 2.5 + t * 10
        puff.sprite.scale.set(size, size, 1)
        ;(puff.sprite.material as THREE.SpriteMaterial).opacity = (1 - t) * (puff.stack.unit === 'pickling' ? 0.3 : 0.45)
      }

      heat.mesh.visible = heatRef.current
      if (heatRef.current && co2Ref.current && elapsed - lastHeat > 0.5) {
        lastHeat = elapsed
        heat.update([...hall.units].map(([id, { anchor }]) => ({ x: anchor.x, z: anchor.z, value: co2Ref.current!(id) })))
      }
      controls.update()
      post.render()

      for (const [id, { anchor }] of hall.units) {
        const element = labelRefs.current.get(id)
        if (!element) continue
        projected.copy(anchor).project(camera)
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
        element.style.opacity = projected.z < 1 ? '1' : '0'
      }
    }
    tick()

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects([...hall.units.values()].map((item) => item.group), true).find((item) => item.object.userData.unitId && item.object.visible)
      return hit ? { id: hit.object.userData.unitId as GalvUnitId, x: event.clientX - rect.left, y: event.clientY - rect.top } : null
    }
    let pending = false, last: PointerEvent | null = null, down: { x: number; y: number } | null = null
    const onMove = (event: PointerEvent) => { last = event; if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (last) { const found = pick(last); setHover(found); post.outline.selectedObjects = found ? [hall.units.get(found.id)!.group] : []; mount.style.cursor = found ? 'pointer' : 'grab' } }) }
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    let lastTap: { id: GalvUnitId; at: number } | null = null
    // A tap selects the unit; a second tap on the zinc kettles within 400 ms goes inside.
    const onUp = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) {
        const found = pick(event)
        if (found) {
          const now = performance.now()
          if (lastTap && lastTap.id === found.id && found.id === 'kettle' && now - lastTap.at < 400) { lastTap = null; onDiveRef.current?.() }
          else { lastTap = { id: found.id, at: now }; onSelectRef.current(found.id) }
        }
      }
      down = null
    }
    const onLeave = () => setHover(null)
    mount.addEventListener('pointermove', onMove); mount.addEventListener('pointerdown', onDown); mount.addEventListener('pointerup', onUp); mount.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      mount.removeEventListener('pointermove', onMove); mount.removeEventListener('pointerdown', onDown); mount.removeEventListener('pointerup', onUp); mount.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      post.dispose()
      heat.dispose()
      scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const material = mesh.material as THREE.Material | undefined; material?.dispose?.() })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      hallRef.current = null
      cameraRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Fly towards the selected unit.
  useEffect(() => {
    const hall = hallRef.current, cam = cameraRef.current
    if (!hall || !cam || !selected) return
    const target = hall.units.get(selected)?.anchor
    if (!target) return
    const goal = new THREE.Vector3(target.x, 3, target.z)
    let raf = 0
    const step = () => { cam.controls.target.lerp(goal, 0.08); if (cam.controls.target.distanceTo(goal) > 0.3) raf = requestAnimationFrame(step) }
    step()
    return () => cancelAnimationFrame(raf)
  }, [selected])

  const info = hover ? describe(hover.id) : null
  return <div className="hall3d">
    <div ref={mountRef} className="plant3d-canvas" role="img" aria-label="Live 3D view of the wire drawing and galvanising plant. Hover a unit for live readings; click to select it." />
    <div className="plant3d-labels" aria-hidden="true">
      {labels.map((label) => <div key={label.id} ref={(element) => { if (element) labelRefs.current.set(label.id, element); else labelRefs.current.delete(label.id) }}
        className={`p3-label hall-label${label.id === selected ? ' selected' : ''}${label.id === hover?.id ? ' hovered' : ''}${label.hot ? ' hot' : ''}${label.sub ? ' badge' : ''}${label.above ? ' above' : ''}`}><span className="badge-main">{label.text}</span>{label.sub && <small>{label.sub}</small>}</div>)}
    </div>
    {hover && info && <div className="p3-tooltip" style={{ left: Math.min(hover.x + 16, (mountRef.current?.clientWidth ?? 800) - 290), top: hover.y + 16 }}>
      <strong>{info.title}</strong>
      <dl>{info.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {info.note && <p>{info.note}</p>}
      {onDive && hover.id === 'kettle' && <p className="p3-dive-hint">Double-click or double-tap to go inside ↘</p>}
    </div>}
    {!touched && <div className="p3-hint">Drag to orbit · scroll to zoom · hover for live readings · double-click the zinc kettles to go inside</div>}
  </div>
}
