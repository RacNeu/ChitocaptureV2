import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

/**
 * Post-processing: bloom makes molten steel and the arc genuinely glow; the outline pass draws
 * a soft green edge around whatever the user is hovering. A high bloom threshold keeps the light
 * background from glowing, so only hot, emissive surfaces bloom.
 */
export function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, options: { bloomStrength?: number; bloomThreshold?: number } = {}) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const size = renderer.getSize(new THREE.Vector2())
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
  return {
    composer,
    bloom,
    outline,
    setSize(width: number, height: number) {
      composer.setSize(width, height)
      bloom.resolution.set(width, height)
    },
    render() { composer.render() },
    dispose() { composer.dispose() },
  }
}
