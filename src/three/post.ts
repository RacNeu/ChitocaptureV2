import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/** See-through effects (smoke, sparks, gas streams, heat map) live on this layer, out of the occlusion pass. */
export const FX_LAYER = 1

/**
 * Rendering quality shared by every 3D view:
 * • an image-based studio environment, so metal, glass and molten zinc reflect light like real materials;
 * • ground-truth ambient occlusion (GTAO), the soft contact shadow in corners, under machines and between
 *   parts that makes a scene read as solid rather than "sandbox" (skipped on phones to keep them smooth);
 * • bloom, so molten steel and flames genuinely glow (a high threshold keeps the light background calm);
 * • a soft green outline around whatever the user is hovering.
 */
export function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: { bloomStrength?: number; bloomThreshold?: number; aoRadius?: number; environment?: number } = {}) {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = environment
  scene.environmentIntensity = options.environment ?? 0.45
  renderer.toneMappingExposure = 1.05

  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const size = renderer.getSize(new THREE.Vector2())
  const lowPower = typeof window !== 'undefined' && (window.innerWidth < 720 || /Mobi|Android/i.test(navigator.userAgent))
  let ao: GTAOPass | null = null
  // The occlusion pass looks through its own copy of the camera that only sees solid objects (layer 0).
  const aoCamera = new THREE.PerspectiveCamera()
  camera.layers.enable(FX_LAYER)
  if (!lowPower) {
    ao = new GTAOPass(scene, aoCamera, Math.max(1, size.x), Math.max(1, size.y))
    ao.updateGtaoMaterial({ radius: options.aoRadius ?? 2.2, distanceExponent: 1.4, thickness: 1.2, scale: 1 })
    ao.blendIntensity = 0.9
    composer.addPass(ao)
  }
  const bloom = new UnrealBloomPass(size, options.bloomStrength ?? 0.7, 0.55, options.bloomThreshold ?? 0.92)
  composer.addPass(bloom)
  const outline = new OutlinePass(size, scene, camera)
  outline.edgeStrength = 4
  outline.edgeGlow = 0.6
  outline.edgeThickness = 1.6
  outline.visibleEdgeColor.set(0x10b981)
  outline.hiddenEdgeColor.set(0x10b981)
  composer.addPass(outline)
  composer.addPass(new OutputPass())
  let frames = 0
  // Adaptive quality: after a short warm-up, if frames take too long (a slow laptop or integrated
  // graphics), switch off ambient occlusion and render at a lower resolution so the demo stays smooth.
  let lastTime = 0, slowFrames = 0, measured = 0, degraded = false
  const watchSpeed = () => {
    const now = performance.now()
    if (lastTime && frames > 30 && !degraded) {
      measured += 1
      if (now - lastTime > 45) slowFrames += 1
      if (measured === 90) {
        if (slowFrames > 45) {
          degraded = true
          if (ao) ao.enabled = false
          renderer.setPixelRatio(1)
          const current = renderer.getSize(new THREE.Vector2())
          composer.setPixelRatio(1)
          composer.setSize(current.x, current.y)
        }
      }
    }
    lastTime = now
  }
  return {
    composer,
    bloom,
    outline,
    setSize(width: number, height: number) {
      composer.setSize(width, height)
      bloom.resolution.set(width, height)
      ao?.setSize(width, height)
    },
    render() {
      // Every second, move any see-through effect objects onto the effects layer.
      if (frames++ % 60 === 0) scene.traverse((object) => {
        const material = (object as THREE.Mesh).material as THREE.Material | undefined
        if ((object as THREE.Sprite).isSprite || (object as THREE.Points).isPoints || (material && !Array.isArray(material) && material.transparent && !material.depthWrite)) object.layers.set(FX_LAYER)
      })
      watchSpeed()
      aoCamera.copy(camera)
      aoCamera.layers.set(0)
      composer.render()
    },
    dispose() { composer.dispose(); ao?.dispose(); environment.dispose(); pmrem.dispose() },
  }
}
