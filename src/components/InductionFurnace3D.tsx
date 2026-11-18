import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export type FurnaceState = {
  /** 0–1 share of the furnace's full power. */
  power: number
  bathC: number | null
  phase: 'melting' | 'holding' | 'tapping' | 'idle'
  /** 0–1 how full the crucible is. */
  fill: number
  /** Coil water ΔT is abnormal (alarm). */
  alarm: boolean
}

/** Colour of liquid steel by temperature: dull red at 1,200 °C, orange-yellow at 1,550, near-white at 1,650+. */
function steelColour(c: number | null): THREE.Color {
  const t = c === null ? 0 : Math.max(0, Math.min(1, (c - 1_150) / 520))
  const stops = [new THREE.Color(0x3a0a00), new THREE.Color(0xc2280a), new THREE.Color(0xff7a12), new THREE.Color(0xffd27a), new THREE.Color(0xfff4dc)]
  const x = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x))
  return stops[i].clone().lerp(stops[i + 1], x - i)
}

/** A stirring, glowing bath texture (canvas noise, rotated each frame). */
function bathTexture() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')!
  const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128)
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.6, '#e8e8e8'); grad.addColorStop(1, '#8a8a8a')
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256)
  for (let k = 0; k < 900; k += 1) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 120
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,40,40'},${0.05 + Math.random() * 0.12})`
    g.beginPath(); g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + Math.random() * 9, 1 + Math.random() * 3, a, 0, Math.PI * 2); g.fill()
  }
  const tex = new THREE.CanvasTexture(cv); tex.center.set(0.5, 0.5); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function InductionFurnace3D({ state, label }: { state: FurnaceState; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const live = useRef(state)
  live.current = state

  useEffect(() => {
    const el = host.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    el.appendChild(renderer.domElement)
    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.fog = new THREE.Fog(0x07111f, 26, 60)
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
    camera.position.set(13, 9.5, 14)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 2.6, 0)
    controls.enableDamping = true
    controls.minDistance = 8; controls.maxDistance = 34
    controls.maxPolarAngle = Math.PI * 0.49
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35
    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false })

    scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x0b1a2e, 0.55))
    const key = new THREE.DirectionalLight(0xdbe8ff, 1.2)
    key.position.set(8, 16, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 })
    scene.add(key)

    const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o })
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m }

    // ---- Floor: steel deck with a pit grid and safety lines.
    const deckMat = std(0x1a2a40, { roughness: 0.85, metalness: 0.35 })
    add(scene, new THREE.BoxGeometry(26, 0.4, 20), deckMat, 0, -0.2, 0)
    const grid = new THREE.GridHelper(26, 26, 0x2a4366, 0x1c3150); grid.position.y = 0.01; scene.add(grid)
    const stripe = std(0xf5b301, { roughness: 0.6, emissive: 0x3a2a00 })
    for (const z of [-4.6, 4.6]) add(scene, new THREE.BoxGeometry(9.5, 0.03, 0.18), stripe, 0, 0.02, z)

    // ---- Tilting furnace (pivots about the spout axle).
    const pivot = new THREE.Group(); pivot.position.set(2.6, 1.2, 0); scene.add(pivot)
    const body = new THREE.Group(); body.position.set(-2.6, 0, 0); pivot.add(body)
    const H = 4.6, R = 2.3
    // Base and top rings of the steel frame.
    const frame = std(0x2b3d57, { metalness: 0.6, roughness: 0.4 })
    add(body, new THREE.CylinderGeometry(R + 0.55, R + 0.6, 0.45, 48), frame, 0, 0.22, 0)
    add(body, new THREE.CylinderGeometry(R + 0.55, R + 0.55, 0.4, 48), frame, 0, H + 0.2, 0)
    // Magnetic yokes: laminated steel packs around the coil.
    const yoke = std(0x3d4f69, { metalness: 0.7, roughness: 0.35 })
    for (let k = 0; k < 10; k += 1) {
      const a = k / 10 * Math.PI * 2 + 0.31
      const m = add(body, new THREE.BoxGeometry(0.42, H - 0.4, 0.62), yoke, Math.cos(a) * (R + 0.42), H / 2 + 0.2, Math.sin(a) * (R + 0.42))
      m.rotation.y = -a
    }
    // Copper coil: a helix tube that glows with power.
    const turns = 11
    const helix = new THREE.CatmullRomCurve3(Array.from({ length: turns * 24 + 1 }, (_, k) => { const t = k / (turns * 24), a = t * turns * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * (R + 0.05), 0.55 + t * (H - 1.0), Math.sin(a) * (R + 0.05)) }))
    const copper = std(0xb87333, { metalness: 0.95, roughness: 0.28, emissive: 0xff5a1a, emissiveIntensity: 0 })
    add(body, new THREE.TubeGeometry(helix, 900, 0.11, 10, false), copper)
    // Refractory lining (crucible) and the steel inside.
    add(body, new THREE.CylinderGeometry(R - 0.12, R - 0.25, H - 0.3, 48, 1, true), std(0xcbbfa8, { roughness: 0.95, side: THREE.DoubleSide }), 0, H / 2 + 0.25, 0)
    add(body, new THREE.RingGeometry(R - 0.55, R + 0.55, 48).rotateX(-Math.PI / 2), std(0xb8ab92, { roughness: 0.95 }), 0, H + 0.41, 0)
    const bathTex = bathTexture()
    const bathMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a12, emissiveMap: bathTex, emissiveIntensity: 2.2, roughness: 0.4 })
    const bath = add(body, new THREE.CircleGeometry(R - 0.3, 48).rotateX(-Math.PI / 2), bathMat, 0, H - 0.4, 0)
    bath.castShadow = false
    const glow = new THREE.PointLight(0xff8a2a, 30, 14, 1.6); glow.position.set(0, H + 1.2, 0); body.add(glow)
    // Spout.
    add(body, new THREE.BoxGeometry(1.0, 0.35, 0.7), std(0x9a8f7c, { roughness: 0.9 }), R + 0.55, H + 0.25, 0)
    // Hydraulic tilt cylinders.
    const hyd = std(0xc9d3df, { metalness: 0.9, roughness: 0.2 })
    for (const z of [-1.7, 1.7]) { const c = add(scene, new THREE.CylinderGeometry(0.13, 0.13, 2.2, 16), hyd, -2.3, 0.9, z); c.rotation.z = 0.35 }

    // ---- Lid on a swing arm.
    const lidArm = new THREE.Group(); lidArm.position.set(-R - 1.1, 0, -R - 0.6); scene.add(lidArm)
    add(lidArm, new THREE.CylinderGeometry(0.2, 0.25, H + 2.2, 16), frame, 0, (H + 2.2) / 2, 0)
    const lid = new THREE.Group(); lid.position.set(0, H + 1.95, 0); lidArm.add(lid)
    add(lid, new THREE.BoxGeometry(0.3, 0.25, 0.3), frame, 0, 0, 0)
    const lidDisk = add(lid, new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.35, 40), std(0x56677f, { metalness: 0.5, roughness: 0.5 }), R + 1.1, -0.15, R + 0.6)
    add(lid, new THREE.BoxGeometry(Math.hypot(R + 1.1, R + 0.6), 0.22, 0.35), frame, (R + 1.1) / 2, 0.05, (R + 0.6) / 2).rotation.y = -Math.atan2(R + 0.6, R + 1.1)
    void lidDisk

    // ---- Power cabinet (IGBT/thyristor converter) and water-cooled cables.
    const cab = new THREE.Group(); cab.position.set(-8.2, 0, -3.6); scene.add(cab)
    add(cab, new THREE.BoxGeometry(3.4, 3.2, 1.6), std(0x23344d, { metalness: 0.4, roughness: 0.5 }), 0, 1.6, 0)
    const led = new THREE.MeshStandardMaterial({ color: 0x062a18, emissive: 0x10b981, emissiveIntensity: 1.2 })
    for (let k = 0; k < 5; k += 1) add(cab, new THREE.BoxGeometry(0.42, 0.08, 0.02), led, -1.2 + k * 0.6, 2.7, 0.81)
    add(cab, new THREE.BoxGeometry(3.0, 1.4, 0.02), std(0x0e1b2e, { roughness: 0.2, metalness: 0.6 }), 0, 1.6, 0.81)
    const cableMat = std(0x111b2b, { roughness: 0.7 })
    for (const off of [-0.35, 0.35]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-6.6, 1.0, -3.6 + off), new THREE.Vector3(-5.2, 0.35, -2.6 + off), new THREE.Vector3(-3.6, 0.35, -1.6 + off), new THREE.Vector3(-R - 0.6, 1.2, -0.6 + off)])
      add(scene, new THREE.TubeGeometry(curve, 60, 0.12, 10, false), cableMat)
    }
    // ---- Cooling-water skid with pumps and pipes.
    const skid = new THREE.Group(); skid.position.set(-7.6, 0, 4.2); scene.add(skid)
    add(skid, new THREE.BoxGeometry(3.6, 0.3, 2.2), frame, 0, 0.15, 0)
    const pumpMat = std(0x2563eb, { metalness: 0.5, roughness: 0.35 })
    for (const x of [-0.9, 0.9]) { add(skid, new THREE.CylinderGeometry(0.45, 0.45, 1.0, 20), pumpMat, x, 0.85, 0).rotation.z = Math.PI / 2 }
    add(skid, new THREE.CylinderGeometry(0.7, 0.7, 1.9, 24), std(0x94a3b8, { metalness: 0.8, roughness: 0.25 }), 0, 1.25, -0.6)
    const pipe = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.5, roughness: 0.3, emissive: 0x0369a1, emissiveIntensity: 0.25 })
    const hot = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.5, roughness: 0.3, emissive: 0x9a3412, emissiveIntensity: 0.2 })
    for (const [mat, z] of [[pipe, 3.9], [hot, 4.5]] as const) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-5.8, 0.6, z), new THREE.Vector3(-3.8, 0.5, z - 1.2), new THREE.Vector3(-R - 0.7, 0.6, 1.6)])
      add(scene, new THREE.TubeGeometry(curve, 50, 0.1, 10, false), mat)
    }
    // ---- Ladle waiting under the spout.
    const ladle = new THREE.Group(); ladle.position.set(5.2, 0, 0); scene.add(ladle)
    add(ladle, new THREE.CylinderGeometry(1.3, 1.05, 2.0, 32, 1, true), std(0x3a4658, { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }), 0, 1.0, 0)
    add(ladle, new THREE.CylinderGeometry(1.05, 1.05, 0.12, 32), std(0x3a4658), 0, 0.06, 0)
    const ladleBath = add(ladle, new THREE.CircleGeometry(1.15, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff7a12, emissiveIntensity: 1.6 }), 0, 0.4, 0)
    // Pouring stream.
    const stream = add(scene, new THREE.CylinderGeometry(0.12, 0.18, 1, 12), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa040, emissiveIntensity: 3 }), 4.6, 2.6, 0)
    stream.castShadow = false

    // ---- Sparks (points) over the bath while melting.
    const sparkGeo = new THREE.BufferGeometry()
    const N = 160, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3)
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: 0xffc070, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    body.add(sparks)
    const respawn = (i: number) => { const a = Math.random() * Math.PI * 2, r = Math.random() * (R - 0.6); pos.set([Math.cos(a) * r, H - 0.35, Math.sin(a) * r], i * 3); vel.set([(Math.random() - 0.5) * 0.9, 2 + Math.random() * 3, (Math.random() - 0.5) * 0.9], i * 3) }
    for (let i = 0; i < N; i += 1) { respawn(i); pos[i * 3 + 1] -= Math.random() * 2 }

    // ---- Resize + loop.
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    const clock = new THREE.Clock()
    let tilt = 0, lidA = 0, raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
      const s = live.current
      // Coil glows with power; flickers a little like the real converter.
      copper.emissiveIntensity = s.power * (0.55 + 0.08 * Math.sin(t * 40))
      // Bath colour and level from the reading.
      const col = steelColour(s.bathC)
      bathMat.emissive.copy(col); glow.color.copy(col)
      const hotness = s.bathC === null ? 0 : Math.max(0, (s.bathC - 1_150) / 500)
      bathMat.emissiveIntensity = 0.6 + 2.2 * hotness
      glow.intensity = 6 + 40 * hotness
      bath.position.y = 0.9 + (H - 1.3) * Math.max(0.15, s.fill)
      bathTex.rotation += dt * (0.25 + 1.4 * s.power) // electromagnetic stirring
      // Tilt to pour while tapping; lid swings open for charging and tapping.
      const tiltTarget = s.phase === 'tapping' ? -0.62 : 0
      tilt += (tiltTarget - tilt) * Math.min(1, dt * 1.6)
      pivot.rotation.z = tilt
      const lidTarget = s.phase === 'holding' ? 0 : s.phase === 'melting' ? (s.power > 0.5 ? 0 : 1.2) : 1.6
      lidA += (lidTarget - lidA) * Math.min(1, dt * 1.8)
      lid.rotation.y = lidA
      const pouring = s.phase === 'tapping' && tilt < -0.45
      stream.visible = pouring
      stream.scale.y = 2.2; stream.position.y = 2.0 + 0.1 * Math.sin(t * 30)
      ladleBath.position.y = pouring ? Math.min(1.7, ladleBath.position.y + dt * 0.25) : 0.4
      // Sparks while melting at power.
      sparks.visible = s.power > 0.3
      for (let i = 0; i < N; i += 1) {
        vel[i * 3 + 1] -= 6 * dt
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        if (pos[i * 3 + 1] < H - 0.5) respawn(i)
      }
      sparkGeo.attributes.position.needsUpdate = true
      // Alarm: the cooling skid's hot-water pipe pulses red.
      hot.emissive.setHex(s.alarm ? 0xff1a1a : 0x9a3412)
      hot.emissiveIntensity = s.alarm ? 0.6 + 0.5 * Math.sin(t * 8) : 0.2
      controls.update()
      renderer.render(scene, camera)
    }
    loop()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); pmrem.dispose(); renderer.dispose(); scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()) } }); el.removeChild(renderer.domElement) }
  }, [])

  return <div className="ms-3d" ref={host} role="img" aria-label={`${label}: 3D induction furnace, ${state.phase}, ${state.bathC ?? '—'} °C`} />
}
