import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * A box with softly rounded edges. Real equipment is folded sheet metal and cast parts, never
 * knife-edged blocks; the small bevel catches light along every edge and removes the "sandbox" look.
 * Large flat slabs (floors, walls) keep sharp boxes.
 */
export function box(width: number, height: number, depth: number) {
  const smallest = Math.min(width, height, depth)
  if (Math.max(width, depth) > 60 || smallest < 0.04) return new THREE.BoxGeometry(width, height, depth)
  return new RoundedBoxGeometry(width, height, depth, 2, Math.min(0.22, smallest * 0.18))
}
