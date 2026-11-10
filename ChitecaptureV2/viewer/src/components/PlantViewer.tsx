import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { Box3, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import type { PerspectiveCamera } from 'three'
import ProcessParticles from './ProcessParticles'
import type { ProcessState } from '../types/process'
import MetricPanel from './MetricPanel'
import { makeProcessStream } from '../data/processStreams'

const modelUrl = `${import.meta.env.BASE_URL}models/carbon_capture_system.glb`

type EquipmentKey = 'flue_gas_inlet' | 'pretreatment' | 'adsorber' | 'regeneration' | 'co2_tank' | 'stack'
const equipmentNames: EquipmentKey[] = ['flue_gas_inlet', 'pretreatment', 'adsorber', 'regeneration', 'co2_tank', 'stack']
const equipmentIconText: Record<string, string> = { co2: 'CO₂', flow: '⇢', temperature: '°', pressure: 'P', sulfur: 'S', nitrogen: 'N', particles: 'PM' }

const annotationSpecs: Array<{ node: EquipmentKey; title: string; subtitle: string; offset: [number, number] }> = [
  { node: 'flue_gas_inlet', title: 'FLUE GAS INLET', subtitle: 'From industrial source', offset: [-132, -72] },
  { node: 'pretreatment', title: 'PRE-TREATMENT', subtitle: 'Particle removal', offset: [-114, -96] },
  { node: 'adsorber', title: 'CHITOSAN ADSORBER', subtitle: 'CO₂ capture', offset: [-84, -104] },
  { node: 'regeneration', title: 'REGENERATION', subtitle: 'Heat / desorption', offset: [22, -76] },
  { node: 'co2_tank', title: 'CAPTURED CO₂', subtitle: 'Storage / utilisation', offset: [12, 26] },
  { node: 'stack', title: 'TREATED FLUE GAS', subtitle: 'To stack', offset: [-142, -66] },
]

type AnnotationRefs = {
  cards: { current: Array<HTMLButtonElement | null> }
  lines: { current: Array<SVGLineElement | null> }
}

function EquipmentLabelProjector({ anchors, showLabels, refs, laneHeight }: { anchors: Map<EquipmentKey, Vector3>; showLabels: boolean; refs: AnnotationRefs; laneHeight: number }) {
  useFrame(({ camera, size }) => {
    if (!showLabels) return
    const cardWidth = Math.min(154, (size.width - 24) / 2)
    const cardHeight = 46
    const margin = 8
    const occupied: Array<{ x: number; y: number; right: number; bottom: number }> = []
    for (const [index, spec] of annotationSpecs.entries()) {
      const card = refs.cards.current[index]
      const line = refs.lines.current[index]
      const anchor = anchors.get(spec.node)
      if (!card || !line || !anchor) continue
      const projected = anchor.clone().project(camera)
      const onScreen = projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.08 && Math.abs(projected.y) <= 1.08
      card.style.visibility = onScreen ? 'visible' : 'hidden'
      line.style.visibility = onScreen ? 'visible' : 'hidden'
      if (!onScreen) continue

      const anchorX = (projected.x * 0.5 + 0.5) * size.width
      const totalHeight = size.height + laneHeight * 2
      const anchorY = laneHeight + (-projected.y * 0.5 + 0.5) * size.height
      const preferredY = index < 3 ? margin : totalHeight - cardHeight - margin
      const candidatePositions: Array<[number, number]> = [
        [anchorX - cardWidth / 2, preferredY],
        [anchorX + spec.offset[0], preferredY],
        [anchorX - cardWidth / 2, index < 3 ? totalHeight - cardHeight - margin : margin],
      ]
      let chosen = { x: 0, y: 0, right: 0, bottom: 0 }
      for (const [positionX, positionY] of candidatePositions) {
        const x = Math.max(margin, Math.min(size.width - cardWidth - margin, positionX))
        const y = Math.max(margin, Math.min(totalHeight - cardHeight - margin, positionY))
        const rect = { x, y, right: x + cardWidth, bottom: y + cardHeight }
        if (!occupied.some((other) => rect.x < other.right + 5 && rect.right + 5 > other.x && rect.y < other.bottom + 5 && rect.bottom + 5 > other.y)) {
          chosen = rect
          break
        }
        chosen = rect
      }
      if (occupied.some((other) => chosen.x < other.right + 5 && chosen.right + 5 > other.x && chosen.y < other.bottom + 5 && chosen.bottom + 5 > other.y)) {
        let placed = false
        for (let row = 0; row * (cardHeight + 5) + cardHeight <= totalHeight - margin && !placed; row += 1) {
          for (let column = 0; column * (cardWidth + 5) + cardWidth <= size.width - margin; column += 1) {
            const rect = { x: margin + column * (cardWidth + 5), y: margin + row * (cardHeight + 5), right: 0, bottom: 0 }
            rect.right = rect.x + cardWidth
            rect.bottom = rect.y + cardHeight
            const collision = occupied.some((other) => rect.x < other.right + 5 && rect.right + 5 > other.x && rect.y < other.bottom + 5 && rect.bottom + 5 > other.y)
            if (!collision) { chosen = rect; placed = true; break }
          }
        }
      }
      occupied.push(chosen)
      card.style.transform = `translate3d(${chosen.x}px, ${chosen.y}px, 0)`
      card.style.width = `${cardWidth}px`

      const startX = Math.max(chosen.x + 8, Math.min(chosen.right - 8, anchorX))
      const startY = anchorY < chosen.y ? chosen.y : anchorY > chosen.bottom ? chosen.bottom : Math.max(chosen.y + 6, Math.min(chosen.bottom - 6, anchorY))
      line.setAttribute('x1', String(startX))
      line.setAttribute('y1', String(startY))
      line.setAttribute('x2', String(anchorX))
      line.setAttribute('y2', String(anchorY))
    }
  })

  return null
}

function EquipmentAnnotationOverlay({ showLabels, onSelect, refs }: { showLabels: boolean; onSelect: (equipment: EquipmentKey) => void; refs: AnnotationRefs }) {
  if (!showLabels) return null
  return <div className="equipment-annotation-layer" aria-label="3D equipment labels">
    <svg className="equipment-annotation-leaders" aria-hidden="true">
      <defs><marker id="equipment-annotation-arrow" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0 L5,2.5 L0,5 z" fill="#91a49a" /></marker></defs>
      {annotationSpecs.map((spec, index) => <line key={spec.node} ref={(line) => { refs.lines.current[index] = line }} />)}
    </svg>
    {annotationSpecs.map((spec, index) => <button key={spec.node} type="button" className="equipment-annotation" ref={(card) => { refs.cards.current[index] = card }} onClick={(event) => { event.stopPropagation(); onSelect(spec.node) }}>
      <span className="annotation-number">{index + 1}</span>
      <span className="annotation-copy"><strong>{spec.title}</strong><small>{spec.subtitle}</small></span>
    </button>)}
  </div>
}

function CadModel({ phase, showLabels, onSelect, annotationRefs, laneHeight }: { phase: 'adsorption' | 'regeneration'; showLabels: boolean; onSelect: (equipment: EquipmentKey | null) => void; annotationRefs: AnnotationRefs; laneHeight: number }) {
  const { scene } = useGLTF(modelUrl)
  const { camera, size } = useThree()
  const displayScene = useMemo(() => {
    const isolated = scene.clone(true)
    isolated.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const cloneMaterial = (material: MeshStandardMaterial) => {
        const copy = material.clone()
        copy.userData.processBaseEmissive = copy.emissive.clone()
        copy.userData.processBaseEmissiveIntensity = copy.emissiveIntensity
        return copy
      }
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material instanceof MeshStandardMaterial ? cloneMaterial(material) : material)
        : object.material instanceof MeshStandardMaterial ? cloneMaterial(object.material) : object.material
    })
    return isolated
  }, [scene])

  const equipmentAnchors = useMemo(() => {
    const anchors = new Map<EquipmentKey, Vector3>()
    for (const spec of annotationSpecs) {
      const object = displayScene.getObjectByName(spec.node)
      if (!object) continue
      const bounds = new Box3().setFromObject(object)
      if (!bounds.isEmpty()) anchors.set(spec.node, bounds.getCenter(new Vector3()))
    }
    return anchors
  }, [displayScene])

  useEffect(() => {
    const bounds = new Box3().setFromObject(displayScene)
    if (bounds.isEmpty()) return

    const center = bounds.getCenter(new Vector3())
    const dimensions = bounds.getSize(new Vector3())
    const perspectiveCamera = camera as PerspectiveCamera
    const aspect = size.width / Math.max(1, size.height)
    perspectiveCamera.aspect = aspect
    perspectiveCamera.updateProjectionMatrix()
    const verticalFov = perspectiveCamera.fov * Math.PI / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect)
    const horizontalDistance = dimensions.x / (2 * Math.tan(horizontalFov / 2))
    const verticalDistance = dimensions.y / (2 * Math.tan(verticalFov / 2))
    const distance = (Math.max(horizontalDistance, verticalDistance) + dimensions.z / 2) * 1.18
    camera.up.set(0, 1, 0)
    camera.position.copy(center).add(new Vector3(0, distance * 0.08, distance))
    camera.lookAt(center)
    camera.near = Math.max(distance / 1_000, 0.01)
    camera.far = distance + dimensions.length() * 2
    camera.updateProjectionMatrix()

  }, [camera, displayScene, size.height, size.width])

  useEffect(() => {
    const setActiveTint = (nodeName: string, active: boolean, color: number, intensity: number) => {
      const root = displayScene.getObjectByName(nodeName)
      root?.traverse((object) => {
        if (!(object instanceof Mesh)) return
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          if (!(material instanceof MeshStandardMaterial)) continue
          if (active) {
            material.emissive.setHex(color)
            material.emissiveIntensity = intensity
          } else {
            const base = material.userData.processBaseEmissive
            if (base) material.emissive.copy(base)
            material.emissiveIntensity = material.userData.processBaseEmissiveIntensity ?? 0
          }
        }
      })
    }

    const regenerating = phase === 'regeneration'
    setActiveTint('regeneration', regenerating, 0xe98643, 0.38)
    setActiveTint('adsorbent_bed', regenerating, 0xd99055, 0.12)
  }, [displayScene, phase])

  useEffect(() => () => {
    displayScene.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material.userData.processBaseEmissive) material.dispose()
      }
    })
  }, [displayScene])

  // Mount the CAD scene as authored so its named nodes remain available for animation.
  return <>
    <primitive object={displayScene} dispose={null} onClick={(event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    let current: Object3D | null = event.object
    while (current) {
      if (equipmentNames.includes(current.name as EquipmentKey)) {
        onSelect(current.name as EquipmentKey)
        return
      }
      current = current.parent
    }
    }} />
    <EquipmentLabelProjector anchors={equipmentAnchors} showLabels={showLabels} refs={annotationRefs} laneHeight={laneHeight} />
  </>
}

function EquipmentPopup({ equipment, state }: { equipment: Exclude<EquipmentKey, 'flue_gas_inlet' | 'stack'>; state: ProcessState }) {
  type DetailRow = { label: string; value: string; icon: string }
  const details: Record<typeof equipment, { title: string; subtitle: string; values: DetailRow[] }> = {
    pretreatment: { title: 'Pre-treatment', subtitle: 'Particle removal', values: [
      { label: 'Particulate removal', value: `${Math.max(0, (1 - state.outlet.particulates / Math.max(state.inlet.particulates, 1e-9)) * 100).toFixed(1)}%`, icon: 'particles' },
      { label: 'SO₂ at outlet', value: `${state.outlet.so2.toFixed(1)} mg/Nm³`, icon: 'sulfur' },
      { label: 'NOₓ at outlet', value: `${state.outlet.nox.toFixed(1)} mg/Nm³`, icon: 'nitrogen' },
    ] },
    adsorber: { title: 'Chitosan adsorber', subtitle: 'CO₂ capture', values: [
      { label: 'Phase', value: state.phase, icon: 'co2' },
      { label: 'Loading', value: `${state.adsorbent.loadingPercentage.toFixed(1)}%`, icon: 'co2' },
      { label: 'Capacity', value: `${state.adsorbent.capacity.toFixed(2)} mmol/g`, icon: 'pressure' },
      { label: 'Adsorption status', value: state.phase === 'adsorption' ? 'Capturing CO₂' : 'Bed regeneration', icon: 'flow' },
    ] },
    regeneration: { title: 'Regeneration unit', subtitle: 'Heat / desorption', values: [
      { label: 'Status', value: state.phase === 'regeneration' ? 'Active' : 'Standby', icon: 'temperature' },
      { label: 'Temperature', value: `${state.adsorbent.currentRegenerationTemperature.toFixed(1)} °C`, icon: 'temperature' },
      { label: 'Elapsed', value: `${Math.floor(state.adsorbent.regenerationElapsed / 60)} min`, icon: 'flow' },
    ] },
    co2_tank: { title: 'Captured CO₂ tank', subtitle: 'Storage / utilisation', values: [
      { label: 'Captured', value: `${state.carbon.co2Captured.toFixed(2)} kg`, icon: 'co2' },
      { label: 'In tank', value: `${state.carbon.tankInventory.toFixed(2)} kg`, icon: 'co2' },
      { label: 'Collection', value: state.carbon.co2DesorptionRate > 0 ? 'Receiving CO₂' : 'Holding inventory', icon: 'flow' },
    ] },
  }
  const detail = details[equipment]
  return <section className="panel metric-panel equipment-detail-panel" aria-label={`${detail.title} details`}>
    <div className="panel-titlebar">
      <span className="stream-mark equipment-mark" aria-hidden="true">EQ</span>
      <div className="panel-title-copy"><h2>{detail.title}</h2><p>{detail.subtitle}</p></div>
      <span className="panel-kicker">PROCESS DATA</span>
    </div>
    <div className="metric-list">
      {detail.values.map(({ label, value, icon }) => <div className="metric-row" key={label}>
        <span className={`metric-icon ${icon}`} aria-hidden="true">{equipmentIconText[icon] ?? '•'}</span>
        <span className="metric-label">{label}</span>
        <strong className="metric-reading">{value}</strong>
      </div>)}
    </div>
  </section>
}

class ModelErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function CadPlaceholder() {
  return (
    <div className="cad-placeholder">
      <div className="placeholder-icon" aria-hidden="true"><span /><i /><b /></div>
      <strong>CAD model unavailable</strong>
      <span>Place the carbon capture system GLB in the public models folder.</span>
      <code>public/models/carbon_capture_system.glb</code>
    </div>
  )
}

function PlantViewer({ state, scenario }: { state: ProcessState; scenario: string }) {
  const [selectedEquipment, setSelectedEquipment] = useState<EquipmentKey | null>(null)
  const [showLabels, setShowLabels] = useState(true)
  const annotationRefs: AnnotationRefs = {
    cards: useRef<Array<HTMLButtonElement | null>>([]),
    lines: useRef<Array<SVGLineElement | null>>([]),
  }
  const phase = state.phase

  return (
    <div className="plant-with-info">
    <section className="panel plant-panel" aria-labelledby="plant-title">
      <div className="plant-heading">
        <div><span className="section-eyebrow">{scenario}</span><h2 id="plant-title">Capture process</h2></div>
        <div className="plant-actions">
          <div className="model-source"><span className="source-dot" />CAD MODEL <b>·</b> GLB</div>
          <button type="button" className={`label-toggle ${showLabels ? 'active' : ''}`} aria-pressed={showLabels} onClick={() => setShowLabels((visible) => !visible)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11M2.5 8h7M2.5 12.5h9" /><circle cx="12.5" cy="8" r="1.3" /></svg>
            Labels <span>{showLabels ? 'On' : 'Off'}</span>
          </button>
        </div>
      </div>
      <div className="plant-viewport">
        <div className="viewport-label viewport-label-left"><span className="viewport-live-dot" />MODEL VIEW · FRONT</div>
        <div className={`model-phase-badge ${phase}`}><i />{phase === 'adsorption' ? 'ADSORPTION' : 'REGENERATION'}</div>
        <ModelErrorBoundary fallback={<CadPlaceholder />}>
          <div className="plant-model-stage">
          <Canvas dpr={[1, 1.5]} camera={{ position: [20, 14, 22], fov: 38, near: 0.01, far: 1000, up: [0, 1, 0] }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} onPointerMissed={() => setSelectedEquipment(null)}>
            <color attach="background" args={['#e9efec']} />
            <ambientLight intensity={1.2} />
            <directionalLight position={[8, 16, 10]} intensity={2.1} />
            <directionalLight position={[-10, 8, -8]} intensity={0.7} />
            <ProcessParticles
              state={{
                phase,
                gasFlowRate: state.inlet.flowRate,
                co2DesorptionRate: state.carbon.co2DesorptionRate,
                adsorbentLoading: state.adsorbent.loadingPercentage,
                captureEfficiency: state.carbon.captureEfficiency,
                co2Captured: state.carbon.co2Captured,
                co2TankInventory: state.carbon.tankInventory,
                particulateRemovalFraction: state.inlet.particulates > 0 ? 1 - state.outlet.particulates / state.inlet.particulates : 0,
              }}
            />
            <Suspense fallback={<Html center><span className="model-loading">Loading CAD model…</span></Html>}>
              <CadModel phase={phase} showLabels={showLabels} onSelect={setSelectedEquipment} annotationRefs={annotationRefs} laneHeight={52} />
            </Suspense>
          </Canvas>
          </div>
        </ModelErrorBoundary>
        <EquipmentAnnotationOverlay showLabels={showLabels} onSelect={setSelectedEquipment} refs={annotationRefs} />
        <div className="axis-label" aria-label="Model coordinate axes"><span>X</span><span>Y</span><span>Z</span></div>
      </div>
      <div className="flow-legend" aria-label="Process flow legend">
        <span><i className="legend-inlet" />Flue gas</span><span><i className="legend-treated" />Treated gas</span><span><i className="legend-co2" />CO₂ recovery</span>
        <span className="flow-path">Flue gas <b>→</b> pre-treatment <b>→</b> adsorber <b>→</b> stack</span>
      </div>
    </section>
    <aside className="equipment-info-dock" data-equipment={selectedEquipment ?? 'none'} aria-label="Selected equipment information" aria-live="polite">
      {selectedEquipment
        ? selectedEquipment === 'flue_gas_inlet'
          ? <MetricPanel stream={makeProcessStream(state.inlet, 'inlet')} />
          : selectedEquipment === 'stack'
            ? <MetricPanel stream={makeProcessStream(state.outlet, 'outlet')} />
            : <EquipmentPopup equipment={selectedEquipment} state={state} />
        : <div className="equipment-info-empty"><span className="equipment-popup-kicker">EQUIPMENT DETAILS</span><h3>Select a label</h3><p>Choose a process label to view its simulated operating data here.</p></div>}
    </aside>
    </div>
  )
}

useGLTF.preload(modelUrl)

export default PlantViewer
