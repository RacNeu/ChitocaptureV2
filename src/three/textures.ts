import * as THREE from 'three'

/**
 * Procedural canvas textures for the realistic look. They are drawn light and neutral
 * so each material's colour tints them (e.g. red brick, grey concrete).
 */

const cache = new Map<string, THREE.CanvasTexture>()

function make(name: string, size: number, draw: (context: CanvasRenderingContext2D, size: number) => void) {
  const existing = cache.get(name)
  if (existing) return existing
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  draw(context, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  cache.set(name, texture)
  return texture
}

/** Deterministic pseudo-random numbers so textures look the same on every load. */
function rng(seed: number) {
  let value = seed
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646 }
}

function noise(context: CanvasRenderingContext2D, size: number, amount: number, seed: number) {
  const random = rng(seed)
  const image = context.getImageData(0, 0, size, size)
  for (let i = 0; i < image.data.length; i += 4) {
    const delta = (random() - 0.5) * amount
    image.data[i] += delta; image.data[i + 1] += delta; image.data[i + 2] += delta
  }
  context.putImageData(image, 0, 0)
}

export const textures = {
  brick: () => make('brick', 256, (c, s) => {
    const random = rng(7)
    c.fillStyle = '#9a9a9a'; c.fillRect(0, 0, s, s)
    const rows = 16, cols = 8, h = s / rows, w = s / cols
    for (let r = 0; r < rows; r += 1) for (let k = -1; k < cols; k += 1) {
      const x = k * w + (r % 2 ? w / 2 : 0)
      const shade = 215 + Math.round((random() - 0.5) * 50)
      c.fillStyle = `rgb(${shade},${shade},${shade})`
      c.fillRect(x + 1.5, r * h + 1.5, w - 3, h - 3)
    }
    noise(c, s, 22, 11)
  }),
  panels: () => make('panels', 256, (c, s) => {
    c.fillStyle = '#ececec'; c.fillRect(0, 0, s, s)
    noise(c, s, 14, 3)
    c.strokeStyle = 'rgba(80,80,80,0.35)'; c.lineWidth = 2
    for (let x = 0; x <= s; x += s / 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, s); c.stroke() }
    c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke()
    // Small square windows on every panel.
    c.fillStyle = 'rgba(55,75,95,0.8)'
    for (let x = 0; x < 4; x += 1) for (let y = 0; y < 2; y += 1) c.fillRect(x * s / 4 + s / 8 - 10, y * s / 2 + s / 4 - 14, 20, 16)
  }),
  plaster: () => make('plaster', 128, (c, s) => { c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, s, s); noise(c, s, 20, 5) }),
  corrugated: () => make('corrugated', 128, (c, s) => {
    for (let x = 0; x < s; x += 1) { const v = 200 + Math.round(30 * Math.sin(x / s * Math.PI * 16)); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(x, 0, 1, s) }
    noise(c, s, 10, 9)
  }),
  metal: () => make('metal', 128, (c, s) => {
    c.fillStyle = '#dcdcdc'; c.fillRect(0, 0, s, s)
    const random = rng(21)
    for (let i = 0; i < 60; i += 1) { c.fillStyle = `rgba(255,255,255,${random() * 0.25})`; c.fillRect(0, random() * s, s, 1) }
    noise(c, s, 10, 13)
  }),
  grass: () => make('grass', 256, (c, s) => {
    c.fillStyle = '#c8c8c8'; c.fillRect(0, 0, s, s)
    const random = rng(31)
    for (let i = 0; i < 2500; i += 1) { const v = 170 + Math.round(random() * 85); c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(random() * s, random() * s, 2, 2) }
  }),
  asphalt: () => make('asphalt', 256, (c, s) => { c.fillStyle = '#b4b4b4'; c.fillRect(0, 0, s, s); noise(c, s, 40, 17) }),
  slabs: () => make('slabs', 256, (c, s) => {
    c.fillStyle = '#dedede'; c.fillRect(0, 0, s, s); noise(c, s, 16, 19)
    c.strokeStyle = 'rgba(90,90,90,0.4)'; c.lineWidth = 2
    for (let x = 0; x <= s; x += s / 4) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, s); c.stroke(); c.beginPath(); c.moveTo(0, x); c.lineTo(s, x); c.stroke() }
  }),
}

export type TextureName = keyof typeof textures

/**
 * Replace a geometry's UVs with box-projected world-scale UVs, so a brick is the same size on
 * a small hut and a big hall. unit = metres covered by one texture tile.
 */
export function worldUVs(geometry: THREE.BufferGeometry, unit: number) {
  const position = geometry.getAttribute('position')
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  const uv = new Float32Array(position.count * 2)
  for (let i = 0; i < position.count; i += 1) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i))
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i)
    let u: number, v: number
    if (ny >= nx && ny >= nz) { u = x; v = z } else if (nx >= nz) { u = z; v = y } else { u = x; v = y }
    uv[i * 2] = u / unit; uv[i * 2 + 1] = v / unit
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}
