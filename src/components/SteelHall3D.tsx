import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { LiveState, SteelParams, UnitId, Upgrades } from '../model/steel'
import { buildSteelHall, type HallHandles } from '../three/steelHall'
import { createComposer } from '../three/post'
import { createHeatmap } from '../three/heatmap'

export type SimFrame = { minutes: number; live: LiveState; upgrades: Upgrades; params: SteelParams }
export type UnitTooltip = { title: string; rows: [string, string][]; note?: string }
/** Anything you can point at in the hall: a process unit, or the ChitoCapture unit. */
export type PickId = UnitId | 'capture'
/** Units with a zoomed-in view; double-click or double-tap takes you inside. */
export type { DiveId } from '../model/simEvents'
import type { DiveId } from '../model/simEvents'
const diveable = (id: PickId): id is DiveId => id === 'eaf' || id === 'capture'

type Props = {
  frame: MutableRefObject<SimFrame>
  showFlows: boolean
  selected: PickId | null
  onSelect: (id: PickId) => void
  /** Double-click or double-tap on a unit that has a zoomed-in view. */
  onDive?: (id: DiveId) => void
  labels: { id: PickId; text: string; hot: boolean; sub?: string; above?: boolean }[]
  describe: (id: PickId) => UnitTooltip | null
  /** Show the CO₂ heat map on the floor. */
  heatmap?: boolean
  /** Live CO₂ of a unit (t/h), for the heat map. */
  co2Of?: (id: UnitId) => number
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

export default function SteelHall3D({ frame, showFlows, selected, onSelect, onDive, labels, describe, heatmap = false, co2Of }: Props) {
  const heatRef = useRef(heatmap)
  heatRef.current = heatmap
  const co2Ref = useRef(co2Of)
  co2Ref.current = co2Of
  const mountRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef(new Map<PickId, HTMLDivElement>())
  const hallRef = useRef<HallHandles | null>(null)
  const flowsRef = useRef(showFlows)
  const selectedRef = useRef(selected)
  const cameraRef = useRef<{ camera: THREE.PerspectiveCamera; controls: OrbitControls } | null>(null)
  const [hover, setHover] = useState<{ id: PickId; x: number; y: number } | null>(null)
  const [touched, setTouched] = useState(false)
  flowsRef.current = showFlows
  selectedRef.current = selected

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
    camera.position.set(30, 120, 135)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 6, 0)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.4
    controls.minDistance = 30
    controls.maxDistance = 360
    controls.addEventListener('start', () => setTouched(true))
    cameraRef.current = { camera, controls }

    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3530, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(-80, 160, 120)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -120, right: 120, top: 80, bottom: -80, far: 500 })
    scene.add(sun)

    const hall = buildSteelHall()
    hallRef.current = hall
    scene.add(hall.root)
    const heat = createHeatmap(200, 70)
    scene.add(heat.mesh)
    let lastHeat = -1
    const post = createComposer(renderer, scene, camera, { bloomStrength: 0.55, bloomThreshold: 0.95 })

    const texture = smokeTexture()
    const puffs = hall.stacks.flatMap((stack) => Array.from({ length: 16 }, (_, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xb9c0c6, transparent: true, depthWrite: false, opacity: 0 }))
      scene.add(sprite)
      return { sprite, stack, phase: index / 16 }
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
    const sparkPositions = hall.sparks.geometry.getAttribute('position') as THREE.BufferAttribute
    const sparkVelocity = hall.sparks.userData.velocities as Float32Array
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta())
      const elapsed = clock.elapsedTime
      const { minutes, live, upgrades, params } = frame.current
      const cycleT = (minutes % params.cycleMin) / params.cycleMin
      const eafNorm = Math.min(1.4, live.mw.eaf / (params.kwhPerT.eaf * 120 / 1_000))

      // Arc furnace glow, light flicker and electrodes (raised while charging).
      hall.eafLight.intensity = 140 * eafNorm * (0.85 + Math.random() * 0.3)
      hall.eafGlow.emissiveIntensity = 0.3 + 2.6 * eafNorm
      const electrodeTarget = live.phase === 'Charging' ? 7 : live.phase === 'Tapping' ? 3 : 0
      hall.electrodes.position.y += (electrodeTarget - hall.electrodes.position.y) * 0.05
      const melting = live.phase === 'Melting' || live.phase === 'Refining'
      for (let k = 0; k < sparkPositions.count; k += 1) {
        let y = sparkPositions.getY(k)
        if (y < 1 || y === 0) {
          if (melting && Math.random() < 0.3) {
            sparkPositions.setXYZ(k, -55 + (Math.random() - 0.5) * 3, 12, (Math.random() - 0.5) * 3)
            sparkVelocity[k * 3] = (Math.random() - 0.5) * 14; sparkVelocity[k * 3 + 1] = 8 + Math.random() * 12; sparkVelocity[k * 3 + 2] = (Math.random() - 0.5) * 14
          } else { sparkPositions.setXYZ(k, 0, -100, 0); continue }
        }
        sparkVelocity[k * 3 + 1] -= 30 * dt
        sparkPositions.setXYZ(k, sparkPositions.getX(k) + sparkVelocity[k * 3] * dt, (y = sparkPositions.getY(k) + sparkVelocity[k * 3 + 1] * dt), sparkPositions.getZ(k) + sparkVelocity[k * 3 + 2] * dt)
      }
      sparkPositions.needsUpdate = true

      // Ladle path: tap at the EAF → ladle furnace → caster → back.
      const path: [number, number, number][] = [[-46, 0, 9], [-30, 0, 10], [-12, 0, 9]]
      let lx: number, lz: number, fill = 1
      if (cycleT >= 0.9) { [lx, , lz] = path[0]; fill = (cycleT - 0.9) / 0.1 }
      else if (cycleT < 0.1) { const f = cycleT / 0.1; lx = path[0][0] + (path[1][0] - path[0][0]) * f; lz = 9.5 }
      else if (cycleT < 0.45) { [lx, , lz] = path[1] }
      else if (cycleT < 0.55) { const f = (cycleT - 0.45) / 0.1; lx = path[1][0] + (path[2][0] - path[1][0]) * f; lz = 9.5 }
      else if (cycleT < 0.85) { [lx, , lz] = path[2]; fill = 1 - (cycleT - 0.55) / 0.3 }
      else { const f = (cycleT - 0.85) / 0.05; lx = path[2][0] + (path[0][0] - path[2][0]) * f; lz = 9; fill = 0 }
      hall.ladle.position.set(lx, 0, lz)
      hall.ladleGlow.emissiveIntensity = 0.2 + 1.8 * Math.max(0, Math.min(1, fill))

      hall.crane.position.x = Math.sin(elapsed * 0.08) * 70
      // Billet-yard magnet crane travels and lifts; the slag carrier drives its loop; ladle preheaters flicker.
      hall.magnetCrane.position.x = -2 + Math.sin(elapsed * 0.11) * 20
      hall.magnet.position.y = 9 + Math.max(0, Math.sin(elapsed * 0.33)) * 5
      const slagT = (elapsed * 0.012) % 1
      hall.slagCarrier.position.copy(hall.slagPath.getPointAt(slagT))
      const slagTangent = hall.slagPath.getTangentAt(slagT)
      hall.slagCarrier.rotation.y = Math.atan2(-slagTangent.z, slagTangent.x)
      hall.preheatFlames.forEach((flame, index) => { flame.emissiveIntensity = 1.2 + Math.sin(elapsed * 13 + index * 2) * 0.3 + Math.random() * 0.3 })

      // Billets travel down the roller table and cool from orange to dark red.
      hall.billets.forEach((billet, index) => {
        const x = -6 + ((minutes * 4 + index * 5.5) % 33)
        billet.position.x = x
        const material = billet.material as THREE.MeshStandardMaterial
        material.emissiveIntensity = Math.max(0.15, 1.8 - (x + 6) / 22)
      })
      hall.bar.visible = live.rollingOn
      hall.bar.position.x = 70 + Math.sin(elapsed * 3) * 0.6
      hall.reheatGlow.emissiveIntensity = 1 + live.reheatGJPerH / 144 * 1.6 + Math.sin(elapsed * 4) * 0.15
      hall.reheatLight.intensity = 25 + Math.sin(elapsed * 5) * 4
      const captureTarget = upgrades.captureShare > 0 ? 1 : 0.001
      const scale = hall.captureUnit.scale.x + (captureTarget - hall.captureUnit.scale.x) * 0.08
      hall.captureUnit.scale.setScalar(scale)

      // Flowing power and gas lines: speed follows the unit's live load.
      for (const line of hall.flows) {
        const material = line.mesh.material as THREE.MeshBasicMaterial
        const show = flowsRef.current && (line.kind !== 'capture' || upgrades.captureShare > 0)
        line.mesh.visible = show
        const speed = line.kind === 'gas' ? live.reheatGJPerH / 60 : line.kind === 'capture' ? 0.8 :
          line.unit === 'eaf' ? live.mw.eaf / 20 : line.unit === 'lf' ? live.mw.lf / 3 : line.unit === 'rolling' ? live.mw.rolling / 6 : live.mw.fume / 3
        line.texture.offset.x -= dt * (0.4 + speed)
        material.opacity = 0.35 + Math.min(0.6, speed / 3)
      }

      // Smoke: the fume stack follows EAF direct emissions; the reheat stack follows gas burnt, minus capture.
      const reheatShare = (1 - 0.9 * upgrades.captureShare) * live.reheatGJPerH / 144
      for (const puff of puffs) {
        const amount = puff.stack.unit === 'fume' ? (melting ? 0.9 : 0.25) : puff.stack.unit === 'steam' ? 0.7 : Math.min(1, reheatShare)
        const active = (puff.phase * 7.13) % 1 < amount
        puff.sprite.visible = active
        if (!active) continue
        const cycle = (elapsed * 0.18 + puff.phase) % 1
        const steam = puff.stack.unit === 'steam'
        puff.sprite.position.set(puff.stack.origin.x + cycle * (steam ? 3 : 10), puff.stack.origin.y + cycle * (steam ? 10 : 24), puff.stack.origin.z + cycle * (steam ? 1 : 3))
        const size = steam ? 2 + cycle * 6 : 3 + cycle * 12
        puff.sprite.scale.set(size, size, 1)
        ;(puff.sprite.material as THREE.SpriteMaterial).opacity = (1 - cycle) * 0.5
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
      const captureLabel = labelRefs.current.get('capture')
      if (captureLabel) {
        projected.copy(hall.captureAnchor).project(camera)
        captureLabel.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
        captureLabel.style.opacity = projected.z < 1 && hall.captureUnit.scale.x > 0.5 ? '1' : '0'
      }
    }
    tick()

    // Hover and click picking.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects([...hall.units.values()].map((item) => item.group), true).find((item) => item.object.userData.unitId && item.object.visible)
      // The capture unit is hidden (scaled to nothing) when capture is off.
      if (hit?.object.userData.unitId === 'capture' && hall.captureUnit.scale.x < 0.5) return null
      return hit ? { id: hit.object.userData.unitId as PickId, x: event.clientX - rect.left, y: event.clientY - rect.top } : null
    }
    let pending = false, last: PointerEvent | null = null, down: { x: number; y: number } | null = null
    let lastTap: { id: PickId; at: number } | null = null
    const onMove = (event: PointerEvent) => { last = event; if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; if (last) { const found = pick(last); setHover(found); post.outline.selectedObjects = found ? [found.id === 'capture' ? hall.captureUnit : hall.units.get(found.id)!.group] : []; mount.style.cursor = found ? 'pointer' : 'grab' } }) }
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    // A tap selects the unit; a second tap on the same unit within 400 ms goes inside it.
    const onUp = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) {
        const found = pick(event)
        if (found) {
          const now = performance.now()
          if (lastTap && lastTap.id === found.id && now - lastTap.at < 400 && diveable(found.id)) { lastTap = null; onDiveRef.current?.(found.id) }
          else {
            lastTap = { id: found.id, at: now }
            onSelectRef.current(found.id)
          }
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

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onDiveRef = useRef(onDive)
  onDiveRef.current = onDive

  // Fly towards the selected unit.
  useEffect(() => {
    const hall = hallRef.current, cam = cameraRef.current
    if (!hall || !cam || !selected) return
    const target = selected === 'capture' ? hall.captureAnchor : hall.units.get(selected)?.anchor
    if (!target) return
    const goal = new THREE.Vector3(target.x, 4, target.z)
    let raf = 0
    const step = () => { cam.controls.target.lerp(goal, 0.08); if (cam.controls.target.distanceTo(goal) > 0.3) raf = requestAnimationFrame(step) }
    step()
    return () => cancelAnimationFrame(raf)
  }, [selected])

  const info = hover ? describe(hover.id) : null
  return <div className="hall3d">
    <div ref={mountRef} className="plant3d-canvas" role="img" aria-label="Live 3D view inside the steel mill. Hover a unit for live readings; click to select it." />
    <div className="plant3d-labels" aria-hidden="true">
      {labels.map((label) => <div key={label.id} ref={(element) => { if (element) labelRefs.current.set(label.id, element); else labelRefs.current.delete(label.id) }}
        className={`p3-label hall-label${label.id === 'capture' ? ' capture' : ''}${label.id === selected ? ' selected' : ''}${label.id === hover?.id ? ' hovered' : ''}${label.hot ? ' hot' : ''}${label.sub ? ' badge' : ''}${label.above ? ' above' : ''}`}><span className="badge-main">{label.text}</span>{label.sub && <small>{label.sub}</small>}</div>)}
    </div>
    {hover && info && <div className="p3-tooltip" style={{ left: Math.min(hover.x + 16, (mountRef.current?.clientWidth ?? 800) - 290), top: hover.y + 16 }}>
      <strong>{info.title}</strong>
      <dl>{info.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {info.note && <p>{info.note}</p>}
      {onDive && diveable(hover.id) && <p className="p3-dive-hint">Double-click or double-tap to go inside ↘</p>}
    </div>}
    {!touched && <div className="p3-hint">Drag to orbit · scroll to zoom · hover for live readings · double-click or double-tap the arc furnace or ChitoCapture unit to go inside</div>}
  </div>
}
