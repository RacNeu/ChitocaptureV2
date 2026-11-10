import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { num } from '../format'
import { eafInternals, steelTargets, type EafPhase } from '../model/steel'
import { buildEaf, type SensorId } from '../three/eafScene'
import { createComposer } from '../three/post'
import { Sparkline } from './Charts'
import type { SimFrame } from './SteelHall3D'

type Props = { frame: MutableRefObject<SimFrame>; onClose: () => void }

const phaseOrder: EafPhase[] = ['Charging', 'Melting', 'Refining', 'Tapping']
const sensorInfo: Record<SensorId, { name: string; unit: string; what: string }> = {
  power: { name: 'Transformer power meter', unit: 'MW', what: 'Electrical load drawn by the arc. Every MWh here becomes grid CO₂.' },
  thermo: { name: 'Bath thermocouple', unit: '°C', what: 'Disposable probe dipped into the liquid steel through the slag door.' },
  offgas: { name: 'Off-gas CO₂ analyser', unit: '% CO₂', what: 'Measures CO₂ in the extracted fumes: the direct (Scope 1) emissions from electrodes and carbon.' },
  cooling: { name: 'Cooling-water ΔT', unit: '°C', what: 'Temperature rise across the water-cooled panels, showing heat lost to the cooling water.' },
}
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }

function smokeTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)'); gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(canvas)
}

export default function EafDeepDive({ frame, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const tagRefs = useRef(new Map<SensorId, HTMLDivElement>())
  const history = useRef<Record<SensorId, number[]>>({ power: [], thermo: [], offgas: [], cooling: [] })
  const [, setTick] = useState(0)
  const [hover, setHover] = useState<string | null>(null)

  useEffect(() => {
    const mount = mountRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    mount.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x141a20)
    scene.fog = new THREE.Fog(0x141a20, 70, 160)
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 600)
    camera.position.set(-40, 50, 90)
    const goal = new THREE.Vector3(-19, 21, 37)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(3, 4, -2)
    controls.enableDamping = true
    controls.maxPolarAngle = 1.45
    controls.minDistance = 12
    controls.maxDistance = 110
    let flying = true
    controls.addEventListener('start', () => { flying = false })

    scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x2a2420, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.4)
    key.position.set(30, 60, 40)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    Object.assign(key.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, far: 200 })
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x7fb8ff, 0.6)
    rim.position.set(-40, 30, -30)
    scene.add(rim)

    const eaf = buildEaf()
    scene.add(eaf.root)
    const post = createComposer(renderer, scene, camera, { bloomStrength: 0.8, bloomThreshold: 0.9 })

    const texture = smokeTexture()
    const fumes = Array.from({ length: 26 }, (_, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xb8bcc2, transparent: true, depthWrite: false, opacity: 0 }))
      scene.add(sprite)
      return { sprite, phase: index / 26 }
    })

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

    const dummy = new THREE.Object3D()
    const zero = new THREE.Matrix4().makeScale(0, 0, 0)
    const projected = new THREE.Vector3()
    const clock = new THREE.Clock()
    let lastSample = -1, lastPublish = 0, raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const elapsed = clock.getElapsedTime()
      const { minutes, live, params, upgrades } = frame.current
      const inside = eafInternals(params, upgrades, minutes)
      const eafNorm = live.mw.eaf / (params.kwhPerT.eaf * 120 / 1_000)
      const p = live.phaseProgress

      if (flying) { camera.position.lerp(goal, 0.05); if (camera.position.distanceTo(goal) < 0.5) flying = false }

      // Tilt for tapping; roof swings open for charging.
      const tilt = live.phase === 'Tapping' ? -0.2 * smooth(p * 3) * smooth((1 - p) * 4) : 0
      eaf.furnace.rotation.z += (tilt - eaf.furnace.rotation.z) * 0.08
      const open = live.phase === 'Charging' ? smooth(p * 4) * smooth((1 - p) * 4) : 0
      eaf.roof.position.set(open * 11, open * 3, 0)
      eaf.electrodes.position.set(open * 11, inside.electrodeLift * 6 + open * 3, 0)
      // Basket comes down over the open shell, drops the scrap, and leaves.
      const basketY = live.phase === 'Charging' ? 30 - 16 * smooth(p * 2.5) * smooth((1 - p) * 2.2) : 34
      eaf.basket.position.set(0, basketY, 0)
      eaf.basket.visible = live.phase === 'Charging'

      // Scrap melts in order; the bath rises and the slag foams on top.
      // Scrap is only in the shell after the basket drops it, and is gone by tapping.
      const scrapShown = live.phase === 'Tapping' ? 0 : live.phase === 'Charging' ? (p > 0.45 ? 1 : 0.06) : 1 - inside.meltFraction
      const remaining = Math.round(scrapShown * eaf.scrapBase.length)
      eaf.scrapOrder.forEach((index, rank) => eaf.scrap.setMatrixAt(index, rank < eaf.scrapBase.length - remaining ? zero : eaf.scrapBase[index]))
      eaf.scrap.instanceMatrix.needsUpdate = true
      const level = 0.3 + inside.meltFraction * 2.6
      eaf.bath.scale.y = 0.4 + inside.meltFraction * 1.6
      eaf.bath.position.y = level / 2
      eaf.bath.visible = inside.meltFraction > 0.03
      const heat = (inside.bathTempC - 1_450) / 200
      eaf.bathMat.emissiveIntensity = 1.4 + heat * 1.6 + Math.sin(elapsed * 6) * 0.1
      const slagT = 0.15 + inside.slagFoam * 1.5
      eaf.slag.scale.y = slagT
      eaf.slag.position.y = level + slagT / 2 - 0.1
      eaf.slag.visible = inside.meltFraction > 0.2
      eaf.slagMat.emissiveIntensity = 0.5 + inside.slagFoam * 0.8
      const bubbleCount = Math.round(inside.slagFoam * 60 * (eaf.slag.visible ? 1 : 0))
      for (let k = 0; k < 60; k += 1) {
        if (k >= bubbleCount) { eaf.bubbles.setMatrixAt(k, zero); continue }
        const angle = k * 2.4, radius = 1 + (k % 7) * 0.6
        const cycle = (elapsed * 0.6 + k * 0.137) % 1
        dummy.position.set(Math.sin(angle) * radius, level + cycle * slagT, Math.cos(angle) * radius)
        dummy.scale.setScalar(0.5 + cycle)
        dummy.updateMatrix()
        eaf.bubbles.setMatrixAt(k, dummy.matrix)
      }
      eaf.bubbles.instanceMatrix.needsUpdate = true

      // Arcs flicker with the live load; the bath glows as it fills.
      const arcing = live.phase === 'Melting' || live.phase === 'Refining'
      eaf.arcs.forEach((arc, index) => {
        arc.visible = arcing
        const flicker = 0.75 + Math.random() * 0.5
        arc.scale.set(flicker, 0.6 + eafNorm * 0.8 * flicker, flicker)
        arc.position.y = 1.5 - 0.4 * index % 2
      })
      eaf.arcLight.intensity = arcing ? 110 * eafNorm * (0.7 + Math.random() * 0.6) : 0
      eaf.bathLight.intensity = 60 * inside.meltFraction
      eaf.tapStream.visible = live.phase === 'Tapping' && p > 0.12 && p < 0.92
      eaf.tapStream.scale.x = eaf.tapStream.scale.z = 0.8 + Math.random() * 0.4
      const ladleLevel = live.phase === 'Tapping' ? smooth((p - 0.12) / 0.8) : live.phase === 'Charging' ? 1 - smooth(p * 3) : 0
      eaf.ladleFill.position.y = -7.4 + ladleLevel * 4
      eaf.ladleFill.visible = ladleLevel > 0.02

      // Fumes leave through the off-gas duct while arcing.
      for (const fume of fumes) {
        const active = arcing ? true : (fume.phase * 9.7) % 1 < 0.2
        fume.sprite.visible = active
        if (!active) continue
        const cycle = (elapsed * 0.25 + fume.phase) % 1
        fume.sprite.position.set(eaf.offgasOrigin.x + Math.sin(fume.phase * 20) * 0.6, eaf.offgasOrigin.y + cycle * 3, eaf.offgasOrigin.z - cycle * 14)
        const size = 1.5 + cycle * 4
        fume.sprite.scale.set(size, size, 1)
        ;(fume.sprite.material as THREE.SpriteMaterial).opacity = (1 - cycle) * 0.45
      }

      controls.update()
      post.render()

      // Virtual sensors: sample the simulated readings and position their tags.
      if (minutes - lastSample > 0.2) {
        lastSample = minutes
        const push = (id: SensorId, value: number) => { history.current[id] = [...history.current[id], value].slice(-120) }
        push('power', live.mw.eaf)
        push('thermo', inside.bathTempC)
        push('offgas', inside.offgasCO2Pct)
        push('cooling', inside.coolingDeltaT)
      }
      for (const [id, point] of Object.entries(eaf.sensors) as [SensorId, THREE.Vector3][]) {
        const element = tagRefs.current.get(id)
        if (!element) continue
        projected.copy(point).project(camera)
        element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) / 2 * mount.clientWidth}px, ${(1 - projected.y) / 2 * mount.clientHeight}px)`
        element.style.opacity = projected.z < 1 ? '1' : '0'
      }
      if (elapsed - lastPublish > 0.25) { lastPublish = elapsed; setTick((value) => value + 1) }
    }
    tick()

    // Hover outlines.
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const onMove = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect()
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = eaf.pickables.find((item) => raycaster.intersectObject(item.object, true).length > 0)
      post.outline.selectedObjects = hit ? [hit.object] : []
      setHover(hit ? hit.id : null)
    }
    mount.addEventListener('pointermove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      mount.removeEventListener('pointermove', onMove)
      controls.dispose()
      post.dispose()
      scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); (mesh.material as THREE.Material | undefined)?.dispose?.() })
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [frame])

  const { minutes, live, params, upgrades } = frame.current
  const inside = eafInternals(params, upgrades, minutes)
  const heatShare = Math.min(1, (minutes % params.cycleMin) / params.cycleMin)
  const kwhPerTSoFar = heatShare > 0.05 ? inside.heatEnergyMWh * 1_000 / params.heatSizeT : null
  const reading: Record<SensorId, string> = {
    power: num(live.mw.eaf, 1),
    thermo: live.phase === 'Charging' ? '—' : num(inside.bathTempC),
    offgas: num(inside.offgasCO2Pct, 1),
    cooling: num(inside.coolingDeltaT, 1),
  }
  const hoverText = hover && hover in sensorInfo ? sensorInfo[hover as SensorId].what
    : hover === 'furnace' ? 'Electric arc furnace shell, cut away to show the scrap, arc, molten bath and foaming slag.'
      : hover === 'ladle' ? 'Ladle on its transfer car in the pit. It carries about 100 t of liquid steel to the ladle furnace.'
        : hover === 'transformer' ? 'Furnace transformer: steps grid power down to the very high current that feeds the electrodes.' : null

  return <div className="deepdive">
    <div ref={mountRef} className="deepdive-canvas" role="img" aria-label="Cutaway 3D view inside the electric arc furnace, synchronised with the live heat." />
    <div className="plant3d-labels" aria-hidden="true">
      {(Object.keys(sensorInfo) as SensorId[]).map((id) => <div key={id} ref={(element) => { if (element) tagRefs.current.set(id, element); else tagRefs.current.delete(id) }} className={`sensor-tag${hover === id ? ' hovered' : ''}`}>
        <div className="sensor-tag-head"><i />{sensorInfo[id].name}<em>virtual</em></div>
        <strong>{reading[id]} <small>{sensorInfo[id].unit}</small></strong>
        <Sparkline values={history.current[id]} width={140} height={26} className="tag-spark" />
      </div>)}
    </div>

    <button type="button" className="deepdive-back" onClick={onClose}>← Back to the mill</button>
    {hoverText && <div className="deepdive-hover">{hoverText}</div>}

    <aside className="deepdive-panel">
      <span className="eyebrow">Inside the electric arc furnace · Heat #{live.heatNumber}</span>
      <ol className="phase-steps">{phaseOrder.map((phase) => {
        const index = phaseOrder.indexOf(phase), current = phaseOrder.indexOf(live.phase)
        return <li key={phase} className={phase === live.phase ? 'current' : index < current ? 'done' : ''}>
          <b>{index + 1}</b><span>{phase}</span>
          {phase === live.phase && <i style={{ width: `${live.phaseProgress * 100}%` }} />}
        </li>
      })}</ol>
      <p className="deepdive-story">{inside.story}</p>
      <dl className="deepdive-stats">
        <div><dt>Arc power now</dt><dd>{num(live.mw.eaf, 1)} MW</dd></div>
        {live.phase === 'Tapping'
          ? <div><dt>Steel tapped</dt><dd>{num(Math.min(100, live.phaseProgress / 0.92 * 100))}%</dd></div>
          : <div><dt>Scrap melted</dt><dd>{live.phase === 'Charging' ? 'new charge' : `${num(inside.meltFraction * 100)}%`}</dd></div>}
        <div><dt>Energy this heat</dt><dd>{num(inside.heatEnergyMWh, 1)} MWh</dd></div>
        <div><dt>CO₂ this heat</dt><dd>{num(inside.heatCO2T, 1)} t</dd></div>
        <div className="wide"><dt>Heat so far vs target</dt><dd>{kwhPerTSoFar === null ? 'starting…' : `${num(kwhPerTSoFar)} kWh/t of ${params.kwhPerT.eaf} planned · target ${steelTargets.eaf}`}</dd></div>
      </dl>
      <p className="muted small">Readings come from virtual sensors driven by the simulation. Real meters or an ESP32 can feed the same tags later.</p>
    </aside>
  </div>
}
