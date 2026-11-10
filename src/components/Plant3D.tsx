import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { num, tonnes } from '../format'
import type { Machine } from '../model/types'
import type { Point } from '../sensor/hub'
import { buildCampus, disposeObject, edgeMaterial, type PlotHandles, type ThemedEntry } from '../three/campus'

export type PlantItem = { machine: Machine; baselineT: number; afterT: number }
export type HoverInfo = { title: string; subtitle: string; rows: [string, string][]; footer?: string }
export type Look = 'real' | 'twin'

type Props = {
  items: PlantItem[]
  withPlan: boolean
  look: Look
  selectedId: string | null
  onSelect: (id: string) => void
  live: Point | null
  describe: (machineId: string) => HoverInfo | null
}

const TRANSITION_MS = 1800
const SWEEP_WIDTH = 0.55

/** Pure model look: blue for low emitters, red for the big ones. */
function modelHeat(base: THREE.Color, share: number) {
  const k = Math.min(1, Math.max(0, (Math.sqrt(share) - 0.12) / 0.5))
  return base.clone().lerp(new THREE.Color(0xe5484d), k)
}

function heatColour(share: number) {
  const stops = [new THREE.Color(0x3ddc97), new THREE.Color(0xffb547), new THREE.Color(0xff5d5d)]
  const x = Math.min(1, Math.max(0, Math.sqrt(share) * 1.6))
  return x < 0.5 ? stops[0].clone().lerp(stops[1], x / 0.5) : stops[1].clone().lerp(stops[2], (x - 0.5) / 0.5)
}
const smooth = (t: number) => t * t * (3 - 2 * t)

function makeSmokeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

type Puff = { sprite: THREE.Sprite; phase: number; origin: THREE.Vector3; machineId: string }

export default function Plant3D({ items, withPlan, look, selectedId, onSelect, live, describe }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const labelRefs = useRef(new Map<string, HTMLDivElement>())
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [interacted, setInteracted] = useState(false)

  // Mutable scene state shared between effects and the render loop.
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls
    plots: PlotHandles[]; themed: ThemedEntry[]; puffs: Puff[]; sweep: THREE.Mesh; minX: number; spanX: number
    sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; root: THREE.Group | null
    lookT: number; lookFrom: number; lookTarget: number; lookStart: number
    activePuffs: Map<string, number>; flyTo: THREE.Vector3 | null; selectedId: string | null
  } | null>(null)

  const layoutKey = useMemo(() => items.map(({ machine }) => `${machine.id}:${machine.kind}:${machine.col}:${machine.row}`).join('|'), [items])
  const shareById = useMemo(() => {
    const total = items.reduce((sum, item) => sum + item.baselineT, 0) || 1
    const max = Math.max(1, ...items.map((item) => item.baselineT))
    return new Map(items.map((item) => {
      const shown = withPlan ? item.afterT : item.baselineT
      return [item.machine.id, { share: shown / total, relative: shown / max, shown, item }]
    }))
  }, [items, withPlan])

  // One-time renderer, camera, lights and loop.
  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xe6edf2)
    scene.fog = new THREE.Fog(0xe6edf2, 260, 620)
    const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000)
    camera.position.set(150, 135, 190)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.32
    controls.minDistance = 50
    controls.maxDistance = 520
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.35
    const stopAuto = () => { controls.autoRotate = false; setInteracted(true) }
    controls.addEventListener('start', stopAuto)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a9a8a, 1.2)
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4)
    sun.position.set(-120, 200, 90)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const shadowCam = sun.shadow.camera
    shadowCam.left = -200; shadowCam.right = 200; shadowCam.top = 200; shadowCam.bottom = -200; shadowCam.far = 600
    sun.shadow.bias = -0.0005
    scene.add(hemi, sun, new THREE.AmbientLight(0xffffff, 0.15))

    const sweep = new THREE.Mesh(new THREE.BoxGeometry(0.8, 36, 400), new THREE.MeshBasicMaterial({ color: 0x3ddcff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }))
    sweep.position.y = 18
    scene.add(sweep)

    const state = {
      renderer, scene, camera, controls, plots: [] as PlotHandles[], themed: [] as ThemedEntry[], puffs: [] as Puff[], sweep, minX: 0, spanX: 1,
      sun, hemi, root: null as THREE.Group | null, lookT: 0, lookFrom: 0, lookTarget: 0, lookStart: 0,
      activePuffs: new Map<string, number>(), flyTo: null as THREE.Vector3 | null, selectedId: null as string | null,
    }
    sceneRef.current = state

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / Math.max(1, h)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(mount)
    resize()

    const realBg = new THREE.Color(0xe6edf2), twinBg = new THREE.Color(0x060e19)
    const projected = new THREE.Vector3()
    let frame = 0
    const clock = new THREE.Clock()
    const loop = () => {
      frame = requestAnimationFrame(loop)
      const elapsed = clock.getElapsedTime()

      // Look transition with a scanning sweep across the site.
      const progress = Math.min(1, (performance.now() - state.lookStart) / TRANSITION_MS)
      state.lookT = state.lookFrom + (state.lookTarget - state.lookFrom) * smooth(progress)
      const towardTwin = state.lookTarget > state.lookFrom
      const sweepFront = progress * (1 + SWEEP_WIDTH)
      for (const entry of state.themed) {
        let t: number
        if (progress >= 1) t = state.lookTarget
        else {
          const local = smooth(Math.min(1, Math.max(0, (sweepFront - entry.x) / SWEEP_WIDTH)))
          t = towardTwin ? local : 1 - local
          if (state.lookFrom === state.lookTarget) t = state.lookTarget
        }
        entry.material.color.copy(entry.real).lerp(entry.twin, t)
        entry.material.emissive.copy(entry.twin).multiplyScalar(0.3 * t)
        // Past the half-way point of its own transition, a surface becomes a plain model:
        // textures are removed and decorative parts (trees, fence, windows, markings) hidden.
        const wantMap = t < 0.5 ? entry.map : null
        if (entry.material.map !== wantMap) { entry.material.map = wantMap; entry.material.needsUpdate = true }
        if (entry.detail) entry.material.visible = t < 0.5
      }
      const t = state.lookT
      ;(scene.background as THREE.Color).copy(realBg).lerp(twinBg, t)
      ;(scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color)
      edgeMaterial.opacity = 0.85 * t
      sun.intensity = 2.4 - 1.4 * t
      hemi.intensity = 1.2 - 0.6 * t
      const sweepMat = sweep.material as THREE.MeshBasicMaterial
      if (progress < 1 && state.lookFrom !== state.lookTarget) {
        sweep.position.x = state.minX + state.spanX * Math.min(1.1, sweepFront - SWEEP_WIDTH / 2)
        sweepMat.opacity = 0.32 * Math.sin(Math.PI * progress)
      } else sweepMat.opacity = 0

      // Plot rings, beacons and selection pulse.
      for (const plot of state.plots) {
        const selected = plot.machineId === state.selectedId
        plot.ring.material.opacity = (0.35 + 0.6 * t) * (selected ? 0.75 + 0.25 * Math.sin(elapsed * 5) : 1)
        plot.beacon.material.opacity = 0.3 * t
      }

      // Smoke puffs rise, grow and fade; the number shown per machine follows its emissions.
      for (const puff of state.puffs) {
        const active = (state.activePuffs.get(puff.machineId) ?? 0) > (puff.phase * 100 % 1)
        const cycle = (elapsed * 0.22 + puff.phase) % 1
        puff.sprite.visible = active
        if (!active) continue
        puff.sprite.position.set(puff.origin.x + cycle * 6 + Math.sin(cycle * 6 + puff.phase * 10) * 0.8, puff.origin.y + cycle * 22, puff.origin.z + cycle * 2)
        const size = 2.5 + cycle * 9
        puff.sprite.scale.set(size, size, 1)
        ;(puff.sprite.material as THREE.SpriteMaterial).opacity = (1 - cycle) * 0.55 * (1 - t)
      }

      if (state.flyTo) {
        controls.target.lerp(state.flyTo, 0.06)
        if (controls.target.distanceTo(state.flyTo) < 0.5) state.flyTo = null
      }
      controls.update()
      renderer.render(scene, camera)

      // Position HTML labels over their plots.
      const width = mount.clientWidth, height = mount.clientHeight
      for (const plot of state.plots) {
        const element = labelRefs.current.get(plot.machineId)
        if (!element) continue
        projected.copy(plot.labelAnchor).project(camera)
        const visible = projected.z < 1
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * width}px, ${(1 - projected.y) / 2 * height}px)`
        element.style.opacity = visible ? '1' : '0'
      }
    }
    loop()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      controls.dispose()
      if (state.root) disposeObject(state.root)
      state.puffs.forEach((puff) => (puff.sprite.material as THREE.Material).dispose())
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // Rebuild the campus when machines are added, removed, moved or change type.
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    if (state.root) { state.scene.remove(state.root); disposeObject(state.root) }
    state.puffs.forEach((puff) => { state.scene.remove(puff.sprite); (puff.sprite.material as THREE.Material).dispose() })
    const campus = buildCampus(items.map((item) => item.machine))
    state.root = campus.root
    state.plots = campus.plots
    state.themed = campus.themed
    state.minX = campus.minX
    state.spanX = campus.spanX
    state.scene.add(campus.root)
    const texture = makeSmokeTexture()
    state.puffs = campus.plots.flatMap((plot) => plot.emitters.flatMap((origin) => Array.from({ length: 10 }, (_, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xd5dade, transparent: true, depthWrite: false, opacity: 0 }))
      state.scene.add(sprite)
      return { sprite, phase: index / 10 + Math.random() * 0.05, origin, machineId: plot.machineId }
    })))
    // Apply the current look immediately, without a sweep.
    const current = look === 'twin' ? 1 : 0
    state.lookFrom = state.lookTarget = state.lookT = current
    state.lookStart = 0
    const distance = Math.max(170, campus.size * 1.15)
    state.camera.position.set(distance * 0.62, distance * 0.62, distance * 0.82)
    state.controls.target.set(0, 0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey])

  // Emissions-driven visuals: heat tint (twin look), ring colour, beacon height and smoke amount.
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    for (const plot of state.plots) {
      const info = shareById.get(plot.machineId)
      if (!info) continue
      const colour = modelHeat(new THREE.Color(0x3a7cc0), info.share)
      plot.ring.material.color.copy(colour)
      plot.beacon.material.color.copy(colour)
      const height = 4 + 90 * Math.sqrt(info.relative)
      plot.beacon.scale.y = height
      plot.beacon.position.y = height / 2
      state.activePuffs.set(plot.machineId, info.shown <= 0 ? 0 : 0.15 + 0.85 * Math.sqrt(info.relative))
    }
    for (const entry of state.themed) {
      if (!entry.plotId) continue
      const info = shareById.get(entry.plotId)
      entry.twin.copy(entry.detail ? entry.twinBase : modelHeat(entry.twinBase, info?.share ?? 0))
    }
  }, [shareById, layoutKey])

  // Animate between the realistic and digital-twin looks.
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    const target = look === 'twin' ? 1 : 0
    if (state.lookTarget === target) return
    state.lookFrom = state.lookT
    state.lookTarget = target
    state.lookStart = performance.now()
  }, [look])

  // Fly the camera towards the selected machine.
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    state.selectedId = selectedId
    const plot = state.plots.find((item) => item.machineId === selectedId)
    if (plot) { state.flyTo = plot.centre.clone(); state.controls.autoRotate = false }
  }, [selectedId, layoutKey])

  // Hover picking.
  useEffect(() => {
    const state = sceneRef.current
    const mount = mountRef.current
    if (!state || !mount) return
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let pending = false
    let lastEvent: PointerEvent | null = null
    const pick = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, state.camera)
      const hit = raycaster.intersectObjects(state.plots.map((plot) => plot.group), true).find((item) => item.object.userData.machineId && (item.object as THREE.Mesh).isMesh)
      return hit ? { id: hit.object.userData.machineId as string, x: event.clientX - rect.left, y: event.clientY - rect.top } : null
    }
    const onMove = (event: PointerEvent) => {
      lastEvent = event
      if (pending) return
      pending = true
      requestAnimationFrame(() => { pending = false; if (lastEvent) { const found = pick(lastEvent); setHover(found); mount.style.cursor = found ? 'pointer' : 'grab' } })
    }
    let down: { x: number; y: number } | null = null
    const onDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY } }
    const onUp = (event: PointerEvent) => {
      if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) { const found = pick(event); if (found) onSelect(found.id) }
      down = null
    }
    const onLeave = () => setHover(null)
    mount.addEventListener('pointermove', onMove)
    mount.addEventListener('pointerdown', onDown)
    mount.addEventListener('pointerup', onUp)
    mount.addEventListener('pointerleave', onLeave)
    return () => {
      mount.removeEventListener('pointermove', onMove)
      mount.removeEventListener('pointerdown', onDown)
      mount.removeEventListener('pointerup', onUp)
      mount.removeEventListener('pointerleave', onLeave)
    }
  }, [onSelect, layoutKey])

  const hoverInfo = hover ? describe(hover.id) : null

  return <div className={`plant3d look-${look}`}>
    <div ref={mountRef} className="plant3d-canvas" role="img" aria-label="Interactive 3D model of the factory. Hover a building for details, click to open it." />
    <div className="plant3d-labels" aria-hidden="true">
      {items.map(({ machine }) => {
        const info = shareById.get(machine.id)
        const channel = machine.sensorChannel
        const reading = channel && live && typeof live[channel] === 'number' ? live[channel] : null
        return <div key={machine.id} ref={(element) => { if (element) labelRefs.current.set(machine.id, element); else labelRefs.current.delete(machine.id) }}
          className={`p3-label${machine.id === selectedId ? ' selected' : ''}${machine.id === hover?.id ? ' hovered' : ''}`}>
          <i style={{ background: `#${(look === 'twin' ? modelHeat(new THREE.Color(0x3a7cc0), info?.share ?? 0) : heatColour(info?.share ?? 0)).getHexString()}` }} />
          <b>{machine.name}</b>
          <span>{tonnes(info?.shown ?? 0)}</span>
          {reading !== null && <em>● {num(reading as number)} ppm</em>}
        </div>
      })}
    </div>
    {hover && hoverInfo && <div className="p3-tooltip" style={{ left: hover.x + 16, top: hover.y + 16 }}>
      <strong>{hoverInfo.title}</strong>
      <small>{hoverInfo.subtitle}</small>
      <dl>{hoverInfo.rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      {hoverInfo.footer && <p>{hoverInfo.footer}</p>}
    </div>}
    {!interacted && <div className="p3-hint">Drag to orbit · scroll to zoom · hover a building</div>}
  </div>
}
