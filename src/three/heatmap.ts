import * as THREE from 'three'

/**
 * A CO₂ heat map laid on the floor: each source is a soft blob whose size and colour follow its
 * live CO₂ rate, from clear through green and amber to red.
 */
export type HeatPoint = { x: number; z: number; value: number }

const STOPS: [number, [number, number, number, number]][] = [
  [0, [16, 185, 129, 0]], [0.12, [16, 185, 129, 90]], [0.38, [132, 204, 22, 140]], [0.6, [245, 158, 11, 175]], [0.8, [249, 115, 22, 200]], [1, [225, 29, 72, 225]],
]

function palette() {
  const table = new Uint8ClampedArray(256 * 4)
  for (let k = 0; k < 256; k += 1) {
    const t = k / 255
    const upper = STOPS.findIndex(([at]) => at >= t)
    const [a0, c0] = STOPS[Math.max(0, upper - 1)], [a1, c1] = STOPS[Math.max(0, upper)]
    const f = a1 === a0 ? 0 : (t - a0) / (a1 - a0)
    for (let c = 0; c < 4; c += 1) table[k * 4 + c] = c0[c] + (c1[c] - c0[c]) * f
  }
  return table
}

export function createHeatmap(width: number, depth: number, centre = new THREE.Vector3(0, 0.08, 0)) {
  const resolution = 4
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * resolution); canvas.height = Math.round(depth * resolution)
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }))
  mesh.rotation.x = -Math.PI / 2
  mesh.position.copy(centre)
  mesh.renderOrder = 1
  const colours = palette()

  return {
    mesh,
    update(points: HeatPoint[]) {
      const max = Math.max(1e-6, ...points.map((point) => point.value))
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'lighter'
      for (const point of points) {
        if (point.value <= 0) continue
        const share = point.value / max
        const px = (point.x - centre.x + width / 2) * resolution, py = (point.z - centre.z + depth / 2) * resolution
        const radius = (8 + 12 * Math.sqrt(share)) * resolution
        const gradient = context.createRadialGradient(px, py, 0, px, py, radius)
        // A broad bright core (much of it sits under the machine) with a soft edge.
        gradient.addColorStop(0, `rgba(255,255,255,${0.15 + 0.85 * share})`)
        gradient.addColorStop(0.6, `rgba(255,255,255,${(0.15 + 0.85 * share) * 0.85})`)
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = gradient
        context.fillRect(px - radius, py - radius, radius * 2, radius * 2)
      }
      context.globalCompositeOperation = 'source-over'
      // Map intensity (the accumulated alpha of the white blobs) to the colour scale.
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      const data = image.data
      for (let k = 0; k < data.length; k += 4) {
        const level = Math.min(255, data[k + 3])
        data[k] = colours[level * 4]; data[k + 1] = colours[level * 4 + 1]; data[k + 2] = colours[level * 4 + 2]; data[k + 3] = colours[level * 4 + 3]
      }
      context.putImageData(image, 0, 0)
      texture.needsUpdate = true
    },
    dispose() { texture.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose() },
  }
}
