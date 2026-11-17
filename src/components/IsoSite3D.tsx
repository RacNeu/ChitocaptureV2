import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { buildSite, disposeSite, palette, GAP, PLOT_D, PLOT_W, type SiteHandles } from '../three/isoSite'
import type { BuildingRow } from '../model/siteModel'

export type ColorBy = 'co2' | 'cost' | 'risk'

type Props = {
  rows: BuildingRow[]
  colorBy: ColorBy
  withPlan: boolean
  showFlows: boolean
  /** Plan mode: empty plots light up, and an armed or dragged asset can be placed on one. */
  planMode?: boolean
  cells?: { col: number; row: number }[]
  armed?: boolean
  onPlace?: (col: number, row: number) => void
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
}

/** Sequential single-hue ramp (pale → deep blue) for magnitude. */
const rampLow = new THREE.Color(0xdde8f6), rampHigh = new THREE.Color(0x1e4f9c)
const ramp = (t: number) => rampLow.clone().lerp(rampHigh, Math.min(1, Math.max(0, Math.sqrt(t))))
const riskColour = { none: new THREE.Color(0xd5e2f2), warn: new THREE.Color(0xf5b54a), bad: new THREE.Color(0xe5484d) }

function colourFor(row: BuildingRow, colorBy: ColorBy, maxCost: number, maxT: number, withPlan: boolean) {
  if (colorBy === 'risk') return row.flags.some((f) => f.level === 'bad') ? riskColour.bad : row.flags.length ? riskColour.warn : riskColour.none
  if (colorBy === 'cost') return ramp(maxCost > 0 ? row.costRM / maxCost : 0)
  return ramp(maxT > 0 ? (withPlan ? row.afterT : row.totalT) / maxT : 0)
}

export default function IsoSite3D({ rows, colorBy, withPlan, showFlows, planMode = false, cells = [], armed = false, onPlace, selectedId, hoverId, onSelect, onHover }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const pinRefs = useRef(new Map<string, HTMLDivElement>())
  const siteRef = useRef<SiteHandles | null>(null)
  const camRef = useRef<{ camera: THREE.OrthographicCamera; controls: OrbitControls } | null>(null)
  const stateRef = useRef({ selectedId, hoverId })
  stateRef.current = { selectedId, hoverId }
  const cbRef = useRef({ onSelect, onHover, onPlace })
  cbRef.current = { onSelect, onHover, onPlace }
  const sceneRef = useRef<{ scene: THREE.Scene; renderer: THREE.WebGLRenderer } | null>(null)
  const ghostRef = useRef<{ group: THREE.Group; tiles: Map<string, THREE.Mesh> } | null>(null)
  const planRef = useRef({ planMode, armed, cells })
  planRef.current = { planMode, armed, cells }
  const cellAt = useRef<(clientX: number, clientY: number) => { col: number; row: number } | null>(() => null)
  const [hoverCell, setHoverCell] = useState<string | null>(null)
  const machineKey = rows.map((r) => `${r.machine.id}:${r.machine.kind}:${r.machine.col}:${r.machine.row}:${r.share.toFixed(2)}`).join('|')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(palette.ground)
    const shares = new Map(rows.map((r) => [r.machine.id, r.share]))
    const site = buildSite(rows.map((r) => r.machine), (id) => shares.get(id) ?? 0)
    siteRef.current = site
    scene.add(site.root)
    scene.add(new THREE.HemisphereLight(0xffffff, 0xdbe6f3, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    const span = Math.max(site.size.x, site.size.z)
    sun.position.set(site.centre.x - span * 0.4, span * 0.9, site.centre.z + span * 0.6)
    sun.target.position.copy(site.centre)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: span * 4 })
    sun.shadow.bias = -0.0005
    scene.add(sun, sun.target)

    // Isometric camera: fixed tilt, free to turn and zoom.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 4000)
    const dist = span * 1.6
    camera.position.set(site.centre.x + dist, dist * 0.82, site.centre.z + dist)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(site.centre)
    controls.enableDamping = true
    controls.minPolarAngle = controls.maxPolarAngle = Math.PI * 0.3
    controls.minZoom = 0.6; controls.maxZoom = 4
    controls.screenSpacePanning = true
    camRef.current = { camera, controls }
    sceneRef.current = { scene, renderer }
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    const fit = () => {
      const w = mount.clientWidth, h = Math.max(1, mount.clientHeight)
      renderer.setSize(w, h)
      const view = span * 0.62
      const aspect = w / h
      camera.left = -view * aspect; camera.right = view * aspect; camera.top = view; camera.bottom = -view
      camera.updateProjectionMatrix()
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(mount)

    // Smoke puffs over stacks of fuel-burning buildings.
    const puffTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    const puffs: { sprite: THREE.Sprite; origin: THREE.Vector3; phase: number }[] = []
    for (const row of rows) if (row.scope1T > 0) {
      const b = site.buildings.find((x) => x.id === row.machine.id)
      for (const origin of b?.stacks ?? []) for (let i = 0; i < 5; i += 1) {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, depthWrite: false, color: 0xf3f6fa }))
        scene.add(sprite); puffs.push({ sprite, origin, phase: i / 5 })
      }
    }

    const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2()
    const pick = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(site.root.children, true).find((h) => h.object.userData.machineId)
      return (hit?.object.userData.machineId as string | undefined) ?? null
    }
    cellAt.current = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.ray.intersectPlane(groundPlane, new THREE.Vector3())
      if (!hit) return null
      const cell = { col: Math.round(hit.x / (PLOT_W + GAP)), row: Math.round(hit.z / (PLOT_D + GAP)) }
      return planRef.current.cells.some((c) => c.col === cell.col && c.row === cell.row) ? cell : null
    }
    let down: { x: number; y: number } | null = null
    const onMove = (e: PointerEvent) => {
      if (planRef.current.planMode && planRef.current.armed) { const c = cellAt.current(e.clientX, e.clientY); setHoverCell(c ? `${c.col},${c.row}` : null); renderer.domElement.style.cursor = c ? 'copy' : 'not-allowed'; return }
      const id = pick(e); cbRef.current.onHover(id); renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
    }
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) {
        const c = planRef.current.planMode && planRef.current.armed ? cellAt.current(e.clientX, e.clientY) : null
        if (c) cbRef.current.onPlace?.(c.col, c.row); else cbRef.current.onSelect(pick(e))
      }
      down = null
    }
    const onLeave = () => cbRef.current.onHover(null)
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)
    renderer.domElement.addEventListener('pointerleave', onLeave)

    const clock = new THREE.Clock()
    const projected = new THREE.Vector3()
    let raf = 0
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
      const { selectedId: sel, hoverId: hov } = stateRef.current
      for (const b of site.buildings) {
        const lifted = b.id === sel ? 1.6 : b.id === hov ? 0.6 : 0
        b.group.position.y += (lifted - b.group.position.y) * Math.min(1, dt * 10)
        const o = b.outline.material as THREE.LineBasicMaterial
        o.opacity += ((b.id === sel ? 1 : b.id === hov ? 0.5 : 0) - o.opacity) * Math.min(1, dt * 10)
      }
      if (!reduce) {
        for (const agent of site.agents) agent(dt, t)
        for (const puff of puffs) {
          const c = (t * 0.25 + puff.phase) % 1
          puff.sprite.position.set(puff.origin.x + c * 4, puff.origin.y + 1 + c * 10, puff.origin.z - c * 2)
          puff.sprite.scale.setScalar(2 + c * 6)
          ;(puff.sprite.material as THREE.SpriteMaterial).opacity = (1 - c) * 0.7
        }
      }
      controls.update()
      renderer.render(scene, camera)
      for (const b of site.buildings) {
        const el = pinRefs.current.get(b.id)
        if (!el) continue
        projected.copy(b.anchor).add(new THREE.Vector3(0, b.group.position.y, 0)).project(camera)
        el.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
      }
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      resize.disconnect()
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      controls.dispose()
      puffs.forEach((p) => p.sprite.material.dispose()); puffTex.dispose()
      disposeSite(scene)
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      siteRef.current = null; camRef.current = null; sceneRef.current = null; ghostRef.current = null
    }
    // Rebuild only when the set of buildings changes, not on every figure update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [machineKey])

  // Recolour roofs when the measure, plan view or figures change.
  useEffect(() => {
    const site = siteRef.current
    if (!site) return
    const maxCost = Math.max(...rows.map((r) => r.costRM), 0), maxT = Math.max(...rows.map((r) => r.totalT), 0)
    for (const row of rows) {
      const b = site.buildings.find((x) => x.id === row.machine.id)
      if (!b) continue
      const c = row.machine.id.startsWith('new-') ? new THREE.Color(0x86efac) : colourFor(row, colorBy, maxCost, maxT, withPlan)
      b.tint[0].color.copy(c)
      b.tint[1].color.copy(c.clone().lerp(new THREE.Color(0xffffff), 0.35))
    }
  }, [rows, colorBy, withPlan, machineKey])

  // Empty plots, shown in plan mode as drop targets.
  const cellsKey = cells.map((c) => `${c.col},${c.row}`).join('|')
  useEffect(() => {
    const holder = sceneRef.current
    if (!holder) return
    if (ghostRef.current) { holder.scene.remove(ghostRef.current.group); disposeSite(ghostRef.current.group); ghostRef.current = null }
    if (!planMode) return
    const group = new THREE.Group(), tiles = new Map<string, THREE.Mesh>()
    for (const c of cells) {
      const tile = new THREE.Mesh(new THREE.BoxGeometry(PLOT_W - 2, 0.2, PLOT_D - 2), new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.12, depthWrite: false }))
      tile.position.set(c.col * (PLOT_W + GAP), 0.2, c.row * (PLOT_D + GAP))
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(PLOT_W - 2, 0.2, PLOT_D - 2)), new THREE.LineDashedMaterial({ color: 0x059669, dashSize: 2, gapSize: 1.4 }))
      edge.computeLineDistances(); tile.add(edge)
      group.add(tile); tiles.set(`${c.col},${c.row}`, tile)
    }
    holder.scene.add(group)
    ghostRef.current = { group, tiles }
  }, [planMode, cellsKey, machineKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ghost = ghostRef.current
    if (!ghost) return
    for (const [key, tile] of ghost.tiles) (tile.material as THREE.MeshBasicMaterial).opacity = key === hoverCell ? 0.45 : armed ? 0.2 : 0.1
  }, [hoverCell, armed, cellsKey, planMode])

  // Power and steel flows on or off.
  useEffect(() => {
    const site = siteRef.current
    if (!site) return
    site.power.visible = showFlows; site.steel.visible = showFlows
  }, [showFlows, machineKey])

  // Fly towards the selected building.
  useEffect(() => {
    const site = siteRef.current, cam = camRef.current
    if (!site || !cam || !selectedId) return
    const b = site.buildings.find((x) => x.id === selectedId)
    if (!b) return
    const goal = b.centre.clone()
    const offset = cam.camera.position.clone().sub(cam.controls.target)
    let raf = 0
    const step = () => {
      cam.controls.target.lerp(goal, 0.12)
      cam.camera.position.copy(cam.controls.target).add(offset)
      if (cam.controls.target.distanceTo(goal) > 0.5) raf = requestAnimationFrame(step)
    }
    step()
    return () => cancelAnimationFrame(raf)
  }, [selectedId])

  const zoom = (factor: number) => { const cam = camRef.current; if (!cam) return; cam.camera.zoom = Math.min(4, Math.max(0.6, cam.camera.zoom * factor)); cam.camera.updateProjectionMatrix() }
  const reset = () => { const cam = camRef.current, site = siteRef.current; if (!cam || !site) return; const offset = cam.camera.position.clone().sub(cam.controls.target); cam.controls.target.copy(site.centre); cam.camera.position.copy(site.centre).add(offset); cam.camera.zoom = 1; cam.camera.updateProjectionMatrix(); cbRef.current.onSelect(null) }

  const dragOver = (e: React.DragEvent) => { if (!planMode) return; e.preventDefault(); const c = cellAt.current(e.clientX, e.clientY); setHoverCell(c ? `${c.col},${c.row}` : null); e.dataTransfer.dropEffect = c ? 'copy' : 'none' }
  const drop = (e: React.DragEvent) => { if (!planMode) return; e.preventDefault(); const c = cellAt.current(e.clientX, e.clientY); setHoverCell(null); if (c) onPlace?.(c.col, c.row) }

  return <div className="iso-stage" onDragOver={dragOver} onDragLeave={() => setHoverCell(null)} onDrop={drop}>
    <div ref={mountRef} className="iso-canvas" role="img" aria-label="Isometric 3D view of the site. Click a building for details." />
    <div className="iso-pins" aria-hidden="true">
      {rows.map((row) => {
        const bad = row.flags.some((f) => f.level === 'bad')
        const show = row.flags.length > 0 || row.machine.id === selectedId || row.machine.id === hoverId
        return <div key={row.machine.id} ref={(el) => { if (el) pinRefs.current.set(row.machine.id, el); else pinRefs.current.delete(row.machine.id) }}
          className={`iso-pin${show ? ' show' : ''}${row.machine.id === selectedId ? ' selected' : ''}`}>
          {(row.machine.id === selectedId || row.machine.id === hoverId) && <span className="iso-pin-name">{row.machine.name}</span>}
          {row.flags.length > 0 && <span className={`iso-pin-flag ${bad ? 'bad' : 'warn'}`}>{bad ? '!' : row.flags.length}</span>}
        </div>
      })}
    </div>
    <div className="iso-tools">
      <button type="button" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
      <button type="button" onClick={() => zoom(0.8)} aria-label="Zoom out">−</button>
      <button type="button" onClick={reset} aria-label="Reset view">⟲</button>
    </div>
  </div>
}
