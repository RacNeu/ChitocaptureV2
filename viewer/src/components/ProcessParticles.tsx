import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh, MeshBasicMaterial, Vector3 } from 'three'
import type { ProcessPhase } from '../types/process'
import { flowParticleSpeed, filteredParticulateFraction, retainedParticleCount, unretainedCo2Fraction } from '../simulation/processVisualState'

type Point3 = readonly [number, number, number]
type Path = ReturnType<typeof buildPath>

// Centerlines are measured from the CAD pipe routes. The X axis is the process direction.
const pretreatmentRoute: Point3[] = [
  [-7.5, 1.67, 0], [-4.92, 1.67, 0], [-4.3, 1.67, 0], [-4.3, 2.9, 0],
  [-4.3, 3.8, 0], [-1.6, 3.8, 0], [-1.6, 2.45, 0], [-0.5, 2.45, 0],
]
const treatedGasRoute: Point3[] = [
  [-0.5, 4.75, 0], [-0.5, 5.25, 0], [6.09, 5.25, 0], [6.4, 5.25, 0], [6.4, 8.5, 0],
]
const co2ToBedRoute: Point3[] = [...pretreatmentRoute, [-0.5, 4.75, 0]]
const co2RecoveryRoute: Point3[] = [
  [-0.5, 1.6, 0], [0.6, 1.6, 0], [1.68, 1.6, 0], [2.3, 1.6, 0],
  [2.92, 1.6, 0], [3.6, 1.6, 0], [3.6, 0.79, 0], [3.75, 0.79, 0],
]

function buildPath(points: Point3[]) {
  const vectors = points.map((point) => new Vector3(...point))
  const lengths = vectors.slice(1).map((point, index) => point.distanceTo(vectors[index]))
  const totalLength = lengths.reduce((sum, length) => sum + length, 0)
  return { vectors, lengths, totalLength }
}

function pointAt(path: Path, progress: number, target: Vector3): Vector3 {
  let distance = Math.max(0, Math.min(1, progress)) * path.totalLength
  for (let index = 0; index < path.lengths.length; index += 1) {
    const segmentLength = path.lengths[index]
    if (distance <= segmentLength || index === path.lengths.length - 1) {
      return target.copy(path.vectors[index]).lerp(path.vectors[index + 1], segmentLength > 0 ? distance / segmentLength : 0)
    }
    distance -= segmentLength
  }
  return target.copy(path.vectors[path.vectors.length - 1])
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => media.removeEventListener?.('change', update)
  }, [])
  return reduced
}

function ParticleStream({ name, points, count, radius, color, speed, active, reducedMotion, visibleFraction = 1, filterPoint }: {
  name: string
  points: Point3[]
  count: number
  radius: number
  color: string
  speed: number
  active: boolean
  reducedMotion: boolean
  visibleFraction?: number
  filterPoint?: number
}) {
  const refs = useRef<Array<Mesh | null>>([])
  const path = useMemo(() => buildPath(points), [points])
  const scratch = useMemo(() => new Vector3(), [])

  useFrame(({ clock }) => {
    const movement = Math.max(0, speed)
    refs.current.forEach((particle, index) => {
      if (!particle) return
      const survivesFilter = index / count < visibleFraction
      const progress = reducedMotion ? (index + 0.5) / count : (clock.elapsedTime * movement + (index + 0.5) / count) % 1
      particle.visible = active && (filterPoint === undefined || progress < filterPoint || survivesFilter)
      if (!particle.visible) return
      particle.position.copy(pointAt(path, progress, scratch))
    })
  })

  return (
    <group name={name}>
      {Array.from({ length: count }, (_, index) => (
        <mesh key={`${name}-${index}`} name={`${name}_${String(index + 1).padStart(2, '0')}`} ref={(mesh) => { refs.current[index] = mesh }} visible={active} frustumCulled={false} renderOrder={10}>
          <sphereGeometry args={[radius, 7, 5]} />
          <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function RetainedCO2({ loading, reducedMotion }: { loading: number; reducedMotion: boolean }) {
  const particles = useRef<Array<Mesh | null>>([])
  // A deterministic, even bed layout: occupancy is exactly controlled by ProcessState loading.
  const positions = useMemo(() => Array.from({ length: 36 }, (_, index): Point3 => {
    const ring = Math.floor(index / 12)
    const angle = (index % 12) / 12 * Math.PI * 2 + ring * 0.18
    const radius = 0.34 + ring * 0.25
    return [-0.5 + Math.cos(angle) * radius, 2.95 + ring * 0.62, Math.sin(angle) * radius]
  }), [])
  const retainedCount = retainedParticleCount(loading, positions.length)

  useFrame(({ clock }) => {
    particles.current.forEach((particle, index) => {
      if (!particle) return
      particle.visible = index < retainedCount
      if (!particle.visible) return
      const pulse = reducedMotion ? 1 : 0.88 + Math.sin(clock.elapsedTime * 1.4 + index) * 0.06
      particle.scale.setScalar(pulse)
    })
  })

  return (
    <group name="visualization_adsorbed_co2">
      {positions.map((position, index) => (
        <mesh key={index} ref={(mesh) => { particles.current[index] = mesh }} position={position} visible={index < retainedCount} frustumCulled={false} renderOrder={11}>
          <sphereGeometry args={[0.11, 8, 6]} />
          <meshBasicMaterial color="#438bc0" depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function RegenerationHeat({ active, reducedMotion }: { active: boolean; reducedMotion: boolean }) {
  const refs = useRef<Array<Mesh | null>>([])
  useFrame(({ clock }) => {
    refs.current.forEach((mesh, index) => {
      if (!mesh) return
      mesh.visible = active
      if (!active) return
      const cycle = reducedMotion ? 0.55 : (clock.elapsedTime * 0.11 + index / refs.current.length) % 1
      const vesselX = index < 7 ? -0.5 : 2.3
      const particleIndex = index % 7
      mesh.position.set(vesselX + Math.sin(particleIndex * 2.3) * (0.66 + cycle * 0.12), 1.9 + cycle * 2.1, Math.cos(particleIndex * 2.3) * (0.66 + cycle * 0.12))
      if (mesh.material instanceof MeshBasicMaterial) mesh.material.opacity = 0.22 + Math.sin(index * 1.9) * 0.08
    })
  })
  return <group name="visualization_regeneration_heat">{Array.from({ length: 14 }, (_, index) => <mesh key={index} ref={(mesh) => { refs.current[index] = mesh }} visible={active}>
    <sphereGeometry args={[0.045, 6, 4]} />
    <meshBasicMaterial color="#e98550" transparent opacity={0.24} depthWrite={false} />
  </mesh>)}</group>
}

function TankCollection({ inventory, reducedMotion }: { inventory: number; reducedMotion: boolean }) {
  const refs = useRef<Array<Mesh | null>>([])
  const visibleCount = Math.max(0, Math.min(12, Math.ceil(inventory / 12)))
  useFrame(({ clock }) => refs.current.forEach((mesh, index) => {
    if (!mesh) return
    mesh.visible = index < visibleCount
    if (!mesh.visible) return
    const pulse = reducedMotion ? 1 : 0.82 + Math.sin(clock.elapsedTime * 1.8 + index) * 0.08
    mesh.scale.setScalar(pulse)
  }))
  return <group name="visualization_co2_tank_collection">
    {Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2
      return <mesh key={index} ref={(mesh) => { refs.current[index] = mesh }} position={[3.75 + Math.cos(angle) * 0.2, 0.92 + Math.sin(angle) * 0.12, 0.12]} visible={index < visibleCount} renderOrder={12}>
        <sphereGeometry args={[0.07, 7, 5]} />
        <meshBasicMaterial color="#438bc0" transparent opacity={0.8} depthTest={false} depthWrite={false} />
      </mesh>
    })}
  </group>
}

export type ProcessAnimationState = {
  phase: ProcessPhase
  gasFlowRate: number
  co2DesorptionRate: number
  adsorbentLoading: number
  captureEfficiency: number
  co2Captured: number
  co2TankInventory: number
  particulateRemovalFraction: number
}

function ProcessParticles({ state }: { state: ProcessAnimationState }) {
  const reducedMotion = useReducedMotion()
  const gasSpeed = flowParticleSpeed(state.gasFlowRate)
  const adsorption = state.phase === 'adsorption'
  const capturedHistory = Math.max(0, Math.min(1, state.co2Captured / 1))
  const uncapturedFraction = unretainedCo2Fraction(state.phase, state.captureEfficiency)
  const desorbingCount = state.co2DesorptionRate > 0 ? Math.max(3, Math.min(10, Math.round(state.co2DesorptionRate / 22))) : 0
  const filteredFraction = filteredParticulateFraction(1, 1 - state.particulateRemovalFraction)

  return <>
    <ParticleStream name="visualization_other_flue_gas" points={pretreatmentRoute} count={14} radius={0.065} color="#e9874b" speed={gasSpeed} active={state.gasFlowRate > 0} reducedMotion={reducedMotion} />
    <ParticleStream name="visualization_filtered_gas_to_stack" points={treatedGasRoute} count={14} radius={0.065} color="#55a879" speed={gasSpeed} active={state.gasFlowRate > 0} reducedMotion={reducedMotion} />
    <ParticleStream name="visualization_inlet_co2" points={co2ToBedRoute} count={12} radius={0.075} color="#e9874b" speed={gasSpeed * 0.55} active={state.gasFlowRate > 0} reducedMotion={reducedMotion} />
    <ParticleStream name="visualization_uncaptured_co2_to_stack" points={treatedGasRoute} count={12} radius={0.07} color="#55a879" speed={gasSpeed * 0.88} active={state.gasFlowRate > 0} reducedMotion={reducedMotion} visibleFraction={uncapturedFraction} />
    <ParticleStream name="visualization_filter_impurities" points={pretreatmentRoute} count={10} radius={0.055} color="#b97853" speed={gasSpeed * 0.78} active={state.gasFlowRate > 0} reducedMotion={reducedMotion} visibleFraction={filteredFraction} filterPoint={0.4} />
    <RetainedCO2 loading={state.adsorbentLoading} reducedMotion={reducedMotion} />
    <ParticleStream name="visualization_co2_to_tank" points={co2RecoveryRoute} count={10} radius={0.085} color="#438bc0" speed={0.12 * Math.max(0.45, Math.min(1.8, state.co2DesorptionRate / 220))} active={!adsorption && capturedHistory > 0 && desorbingCount > 0} reducedMotion={reducedMotion} visibleFraction={Math.min(desorbingCount / 10, capturedHistory)} />
    <RegenerationHeat active={!adsorption} reducedMotion={reducedMotion} />
    <TankCollection inventory={state.co2TankInventory} reducedMotion={reducedMotion} />
  </>
}

export default ProcessParticles
