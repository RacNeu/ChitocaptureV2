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
export type CameraView = 'standard' | 'top' | 'front' | 'back' | 'side'

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
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  for (let k = 0; k < 900; k += 1) {
    const a = rnd() * Math.PI * 2, r = rnd() * 120
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '40,40,40'},${0.05 + rnd() * 0.12})`
    g.beginPath(); g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 2 + rnd() * 9, 1 + rnd() * 3, a, 0, Math.PI * 2); g.fill()
  }
  const tex = new THREE.CanvasTexture(cv); tex.center.set(0.5, 0.5); tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const VIEWS: Record<CameraView, { pos: [number, number, number]; target: [number, number, number] }> = {
  standard: { pos: [13, 9.5, 14], target: [0.5, 2.6, 0] },
  top: { pos: [0.6, 24, 0.8], target: [0.5, 0, 0] },
  front: { pos: [0.5, 4.5, 19], target: [0.5, 2.6, 0] },
  back: { pos: [0.5, 4.5, -19], target: [0.5, 2.6, 0] },
  side: { pos: [21, 4.5, 0.01], target: [0.5, 2.6, 0] },
}

type Tag = { text: string; obj: THREE.Object3D; at: THREE.Vector3 }

export default function InductionFurnace3D({ state, label, view = 'standard', tags = true }: { state: FurnaceState; label: string; view?: CameraView; tags?: boolean }) {
  const host = useRef<HTMLDivElement>(null)
  const tagLayer = useRef<HTMLDivElement>(null)
  const live = useRef({ state, view })
  live.current = { state, view }

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
    scene.fog = new THREE.Fog(0x0f2443, 30, 64)
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200)
    camera.position.set(...VIEWS.standard.pos)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(...VIEWS.standard.target)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 8; controls.maxDistance = 34
    controls.maxPolarAngle = Math.PI * 0.49
    controls.autoRotate = true; controls.autoRotateSpeed = 0.25
    renderer.domElement.addEventListener('pointerdown', () => { controls.autoRotate = false })

    scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x0b1a2e, 0.6))
    const key = new THREE.DirectionalLight(0xdbe8ff, 1.2)
    key.position.set(8, 16, 6); key.castShadow = true; key.shadow.mapSize.set(1024, 1024)
    Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 })
    scene.add(key)

    const std = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o })
    const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m }

    // ---- Floor: steel deck with a pit grid and safety lines.
    add(scene, new THREE.BoxGeometry(26, 0.4, 20), std(0x1a2a40, { roughness: 0.85, metalness: 0.35 }), 0, -0.2, 0)
    const grid = new THREE.GridHelper(26, 26, 0x2a4366, 0x1c3150); grid.position.y = 0.01; scene.add(grid)
    const stripe = std(0xf5b301, { roughness: 0.6, emissive: 0x3a2a00 })
    for (const z of [-4.8, 4.8]) add(scene, new THREE.BoxGeometry(10, 0.03, 0.18), stripe, 0, 0.02, z)

    // ---- Furnace geometry, built around its own base centre.
    const H = 4.6, R = 2.3
    const LIP = new THREE.Vector3(R + 1.05, H + 0.42, 0)
    // Tilting furnaces pour over the spout: the trunnion axis runs through the spout lip, so the
    // stream stays put while the body rotates.
    const pivot = new THREE.Group(); pivot.position.copy(LIP); scene.add(pivot)
    const body = new THREE.Group(); body.position.set(-LIP.x, -LIP.y, 0); pivot.add(body)
    const frame = std(0x2b3d57, { metalness: 0.6, roughness: 0.4 })
    add(body, new THREE.CylinderGeometry(R + 0.55, R + 0.6, 0.45, 48), frame, 0, 0.22, 0)
    add(body, new THREE.CylinderGeometry(R + 0.55, R + 0.55, 0.4, 48), frame, 0, H + 0.2, 0)
    // Magnetic yokes: laminated steel packs around the coil, clamped top and bottom.
    const yoke = std(0x3d4f69, { metalness: 0.7, roughness: 0.35 })
    const clamp = std(0x8a9bb0, { metalness: 0.8, roughness: 0.3 })
    for (let k = 0; k < 10; k += 1) {
      const a = k / 10 * Math.PI * 2 + 0.31
      const m = add(body, new THREE.BoxGeometry(0.42, H - 0.4, 0.62), yoke, Math.cos(a) * (R + 0.42), H / 2 + 0.2, Math.sin(a) * (R + 0.42))
      m.rotation.y = -a
      for (const y of [0.7, H - 0.3]) { const c = add(body, new THREE.BoxGeometry(0.5, 0.12, 0.7), clamp, Math.cos(a) * (R + 0.45), y, Math.sin(a) * (R + 0.45)); c.rotation.y = -a }
    }
    // Copper coil: a helix tube that glows with power.
    const turns = 11
    const helix = new THREE.CatmullRomCurve3(Array.from({ length: turns * 24 + 1 }, (_, k) => { const t = k / (turns * 24), a = t * turns * Math.PI * 2; return new THREE.Vector3(Math.cos(a) * (R + 0.05), 0.55 + t * (H - 1.0), Math.sin(a) * (R + 0.05)) }))
    const copper = std(0xb87333, { metalness: 0.95, roughness: 0.28, emissive: 0xff5a1a, emissiveIntensity: 0 })
    add(body, new THREE.TubeGeometry(helix, 900, 0.11, 10, false), copper)
    // Refractory lining, top ring and spout.
    add(body, new THREE.CylinderGeometry(R - 0.12, R - 0.25, H - 0.3, 48, 1, true), std(0xcbbfa8, { roughness: 0.95, side: THREE.DoubleSide }), 0, H / 2 + 0.25, 0)
    add(body, new THREE.RingGeometry(R - 0.55, R + 0.55, 48).rotateX(-Math.PI / 2), std(0xb8ab92, { roughness: 0.95 }), 0, H + 0.41, 0)
    const spout = add(body, new THREE.BoxGeometry(1.1, 0.32, 0.8), std(0x9a8f7c, { roughness: 0.9 }), R + 0.5, H + 0.26, 0)
    const bathTex = bathTexture()
    const bathMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a12, emissiveMap: bathTex, emissiveIntensity: 2.2, roughness: 0.4 })
    const bath = add(body, new THREE.CircleGeometry(R - 0.3, 48).rotateX(-Math.PI / 2), bathMat, 0, H - 0.4, 0)
    bath.castShadow = false
    const glow = new THREE.PointLight(0xff8a2a, 30, 14, 1.6); glow.position.set(0, H + 1.2, 0); body.add(glow)
    // Trunnion pedestals and axle at the spout lip (fixed to the floor).
    const pedestal = std(0x334763, { metalness: 0.5, roughness: 0.45 })
    for (const z of [-(R + 0.95), R + 0.95]) {
      add(scene, new THREE.BoxGeometry(0.9, LIP.y, 0.7), pedestal, LIP.x, LIP.y / 2, z)
      add(scene, new THREE.CylinderGeometry(0.28, 0.28, 0.5, 20).rotateX(Math.PI / 2), clamp, LIP.x, LIP.y, z * 0.92)
    }
    // Hydraulic tilt rams: from floor anchors to the back of the furnace; they extend as it tilts.
    const ramMat = std(0xc9d3df, { metalness: 0.9, roughness: 0.2 }), barrelMat = std(0x475569, { metalness: 0.6, roughness: 0.4 })
    const rams = [-1.5, 1.5].map((z) => {
      const anchor = new THREE.Vector3(-R - 1.2, 0, z)
      const hook = new THREE.Object3D(); hook.position.set(-R - 0.2, 0.5, z); body.add(hook)
      const barrel = add(scene, new THREE.CylinderGeometry(0.2, 0.2, 1, 16), barrelMat)
      const rod = add(scene, new THREE.CylinderGeometry(0.11, 0.11, 1, 12), ramMat)
      add(scene, new THREE.BoxGeometry(0.5, 0.25, 0.5), pedestal, anchor.x, 0.12, z)
      return { anchor, hook, barrel, rod }
    })

    // ---- Lid on a swing arm.
    const lidArm = new THREE.Group(); lidArm.position.set(-R - 1.3, 0, -R - 0.9); scene.add(lidArm)
    add(lidArm, new THREE.CylinderGeometry(0.2, 0.25, H + 2.2, 16), frame, 0, (H + 2.2) / 2, 0)
    const lid = new THREE.Group(); lid.position.set(0, H + 1.95, 0); lidArm.add(lid)
    add(lid, new THREE.BoxGeometry(0.3, 0.25, 0.3), frame, 0, 0, 0)
    const lidDisk = add(lid, new THREE.CylinderGeometry(R + 0.3, R + 0.3, 0.35, 40), std(0x56677f, { metalness: 0.5, roughness: 0.5 }), R + 1.3, -0.15, R + 0.9)
    add(lid, new THREE.BoxGeometry(Math.hypot(R + 1.3, R + 0.9), 0.22, 0.35), frame, (R + 1.3) / 2, 0.05, (R + 0.9) / 2).rotation.y = -Math.atan2(R + 0.9, R + 1.3)

    // ---- Power supply (converter) and water-cooled cables.
    const cab = new THREE.Group(); cab.position.set(-8.2, 0, -3.8); scene.add(cab)
    add(cab, new THREE.BoxGeometry(3.4, 3.2, 1.6), std(0x23344d, { metalness: 0.4, roughness: 0.5 }), 0, 1.6, 0)
    const led = new THREE.MeshStandardMaterial({ color: 0x062a18, emissive: 0x10b981, emissiveIntensity: 1.2 })
    for (let k = 0; k < 5; k += 1) add(cab, new THREE.BoxGeometry(0.42, 0.08, 0.02), led, -1.2 + k * 0.6, 2.7, 0.81)
    add(cab, new THREE.BoxGeometry(3.0, 1.4, 0.02), std(0x0e1b2e, { roughness: 0.2, metalness: 0.6 }), 0, 1.6, 0.81)
    const cableMat = std(0x111b2b, { roughness: 0.7 })
    for (const off of [-0.35, 0.35]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-6.6, 1.0, -3.8 + off), new THREE.Vector3(-5.4, 0.3, -2.8 + off), new THREE.Vector3(-4.0, 0.3, -1.4 + off), new THREE.Vector3(-R - 0.8, 0.9, -0.5 + off)])
      add(scene, new THREE.TubeGeometry(curve, 60, 0.12, 10, false), cableMat)
    }
    // ---- Cooling-water skid with pumps and pipes.
    const skid = new THREE.Group(); skid.position.set(-7.6, 0, 4.4); scene.add(skid)
    add(skid, new THREE.BoxGeometry(3.6, 0.3, 2.2), frame, 0, 0.15, 0)
    const pumpMat = std(0x2563eb, { metalness: 0.5, roughness: 0.35 })
    for (const x of [-0.9, 0.9]) { add(skid, new THREE.CylinderGeometry(0.45, 0.45, 1.0, 20), pumpMat, x, 0.85, 0).rotation.z = Math.PI / 2 }
    add(skid, new THREE.CylinderGeometry(0.7, 0.7, 1.9, 24), std(0x94a3b8, { metalness: 0.8, roughness: 0.25 }), 0, 1.25, -0.6)
    const pipe = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.5, roughness: 0.3, emissive: 0x0369a1, emissiveIntensity: 0.25 })
    const hot = new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.5, roughness: 0.3, emissive: 0x9a3412, emissiveIntensity: 0.2 })
    for (const [mat, z] of [[pipe, 4.1], [hot, 4.7]] as const) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-5.8, 0.6, z), new THREE.Vector3(-4.0, 0.4, z - 1.3), new THREE.Vector3(-R - 0.8, 0.5, 1.4)])
      add(scene, new THREE.TubeGeometry(curve, 50, 0.1, 10, false), mat)
    }
    // ---- Ladle on a transfer car under the spout.
    const ladle = new THREE.Group(); ladle.position.set(LIP.x + 1.9, 0, 0); scene.add(ladle)
    add(ladle, new THREE.BoxGeometry(3.2, 0.35, 2.6), std(0x0f766e, { metalness: 0.4, roughness: 0.5 }), 0, 0.18, 0)
    add(ladle, new THREE.CylinderGeometry(1.35, 1.1, 2.1, 32, 1, true), std(0x3a4658, { metalness: 0.6, roughness: 0.5, side: THREE.DoubleSide }), 0, 1.4, 0)
    add(ladle, new THREE.CylinderGeometry(1.1, 1.1, 0.12, 32), std(0x3a4658), 0, 0.42, 0)
    for (const z of [-1.38, 1.38]) add(ladle, new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12).rotateX(Math.PI / 2), clamp, 0, 2.1, z)
    const ladleBath = add(ladle, new THREE.CircleGeometry(1.2, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xff7a12, emissiveIntensity: 1.6 }), 0, 0.55, 0)
    ladleBath.castShadow = false
    // Pouring stream: a fixed arc from the spout lip into the ladle (the lip is the pivot, so it never moves).
    const pour = new THREE.QuadraticBezierCurve3(LIP.clone().add(new THREE.Vector3(0.15, -0.05, 0)), new THREE.Vector3(LIP.x + 1.0, LIP.y - 0.2, 0), new THREE.Vector3(LIP.x + 1.75, 1.0, 0))
    const streamMat = new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffa040, emissiveIntensity: 3, transparent: true, opacity: 0 })
    const stream = add(scene, new THREE.TubeGeometry(pour, 40, 0.16, 12, false), streamMat)
    stream.castShadow = false

    // ---- Sparks over the bath while melting at power.
    const sparkGeo = new THREE.BufferGeometry()
    const N = 140, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3)
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sparkMat = new THREE.PointsMaterial({ color: 0xffc070, size: 0.08, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const sparks = new THREE.Points(sparkGeo, sparkMat)
    body.add(sparks)
    const respawn = (i: number) => { const a = Math.random() * Math.PI * 2, r = Math.random() * (R - 0.6); pos.set([Math.cos(a) * r, bath.position.y + 0.05, Math.sin(a) * r], i * 3); vel.set([(Math.random() - 0.5) * 0.7, 1.5 + Math.random() * 2.2, (Math.random() - 0.5) * 0.7], i * 3) }
    for (let i = 0; i < N; i += 1) { respawn(i); pos[i * 3 + 1] += Math.random() * 1.5 }

    // ---- Tags that follow the parts (like the HMI's labels).
    const tagDefs: Tag[] = [
      { text: 'Copper coil', obj: body, at: new THREE.Vector3(-R - 0.6, H * 0.55, R * 0.4) },
      { text: 'Bath', obj: body, at: new THREE.Vector3(0, H + 0.5, 0) },
      { text: 'Lid', obj: lidDisk, at: new THREE.Vector3(0, 0.4, 0) },
      { text: 'Power supply', obj: cab, at: new THREE.Vector3(0, 3.5, 0) },
      { text: 'Coil cooling', obj: skid, at: new THREE.Vector3(0, 2.4, 0) },
      { text: 'Ladle', obj: ladle, at: new THREE.Vector3(0, 2.7, 0) },
      { text: 'Tilt ram', obj: scene, at: new THREE.Vector3(-R - 1.2, 0.6, 1.5) },
    ]
    const tagEls: HTMLSpanElement[] = []
    if (tags && tagLayer.current) {
      tagLayer.current.replaceChildren()
      for (const d of tagDefs) { const s = document.createElement('span'); s.className = 'f3d-tag'; s.textContent = d.text; tagLayer.current.appendChild(s); tagEls.push(s) }
    }

    // ---- Resize + loop.
    const resize = () => { const w = el.clientWidth, h = el.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
    const ro = new ResizeObserver(resize); ro.observe(el); resize()
    const clock = new THREE.Clock()
    let tilt = 0, lidA = 0, glowP = 0, pourA = 0, raf = 0
    let shownView: CameraView = 'standard'
    let fly: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; k: number } | null = null
    const ray = new THREE.Raycaster(), hidden = new Array(tagDefs.length).fill(false)
    const isPart = (o: THREE.Object3D | null, of: THREE.Object3D) => { for (let p = o; p; p = p.parent) if (p === of) return true; return false }
    let tick = 0
    const ease = (x: number) => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
    const v = new THREE.Vector3(), a = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion()
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.05, clock.getDelta()), t = clock.elapsedTime
      const { state: s, view: want } = live.current
      // Camera presets: fly smoothly to the chosen view.
      if (want !== shownView) {
        shownView = want; controls.autoRotate = false
        fly = { from: camera.position.clone(), to: new THREE.Vector3(...VIEWS[want].pos), tFrom: controls.target.clone(), tTo: new THREE.Vector3(...VIEWS[want].target), k: 0 }
      }
      if (fly) {
        fly.k = Math.min(1, fly.k + dt / 0.9)
        const e = ease(fly.k)
        camera.position.lerpVectors(fly.from, fly.to, e); controls.target.lerpVectors(fly.tFrom, fly.tTo, e)
        if (fly.k >= 1) fly = null
      }
      // Coil glow follows power smoothly (no flicker).
      glowP += (s.power - glowP) * Math.min(1, dt * 2.5)
      copper.emissiveIntensity = glowP * 0.6
      // Bath colour and level.
      const col = steelColour(s.bathC)
      bathMat.emissive.lerp(col, Math.min(1, dt * 3)); glow.color.copy(bathMat.emissive)
      const hotness = s.bathC === null ? 0 : Math.max(0, (s.bathC - 1_150) / 500)
      bathMat.emissiveIntensity += (0.6 + 2.2 * hotness - bathMat.emissiveIntensity) * Math.min(1, dt * 3)
      glow.intensity = 6 + 40 * hotness
      const level = 0.9 + (H - 1.3) * Math.max(0.15, s.fill)
      bath.position.y += (level - bath.position.y) * Math.min(1, dt * 2)
      bathTex.rotation += dt * (0.2 + 1.0 * glowP) // electromagnetic stirring
      // Tilt about the spout lip while tapping; slow, eased like a hydraulic drive.
      const tiltTarget = s.phase === 'tapping' ? -0.55 : 0
      tilt += Math.sign(tiltTarget - tilt) * Math.min(Math.abs(tiltTarget - tilt), dt * 0.35)
      pivot.rotation.z = tilt
      // Rams: barrel from the floor anchor, rod out to the hook on the furnace.
      for (const r of rams) {
        r.hook.getWorldPosition(v)
        a.subVectors(v, r.anchor); const len = a.length(); a.normalize()
        q.setFromUnitVectors(up, a)
        r.barrel.quaternion.copy(q); r.barrel.scale.set(1, 1.6, 1); r.barrel.position.copy(r.anchor).addScaledVector(a, 0.8)
        const rodLen = Math.max(0.2, len - 1.6)
        r.rod.quaternion.copy(q); r.rod.scale.set(1, rodLen, 1); r.rod.position.copy(r.anchor).addScaledVector(a, 1.6 + rodLen / 2)
      }
      // Lid: closed while melting at power and while holding; open to charge and to tap.
      const lidTarget = s.phase === 'tapping' || s.phase === 'idle' ? 1.7 : s.phase === 'melting' && s.power < 0.3 ? 1.7 : 0
      lidA += (lidTarget - lidA) * Math.min(1, dt * 1.2)
      lid.rotation.y = lidA
      // Pour: fades in once the furnace is tilted far enough; ladle fills while pouring.
      const pouring = s.phase === 'tapping' && tilt < -0.4
      pourA += ((pouring ? 1 : 0) - pourA) * Math.min(1, dt * 2.5)
      streamMat.opacity = pourA; stream.visible = pourA > 0.02
      streamMat.emissiveIntensity = 2.6 + 0.3 * Math.sin(t * 3)
      const ladleTarget = s.phase === 'tapping' ? 1.9 : 0.55
      ladleBath.position.y += (ladleTarget - ladleBath.position.y) * Math.min(1, dt * (pouring ? 0.25 : 0.6))
      // Sparks while melting at power.
      sparkMat.opacity += ((glowP > 0.4 && tilt > -0.05 ? 0.85 : 0) - sparkMat.opacity) * Math.min(1, dt * 3)
      sparks.visible = sparkMat.opacity > 0.02
      for (let i = 0; i < N; i += 1) {
        vel[i * 3 + 1] -= 5 * dt
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt
        if (pos[i * 3 + 1] < bath.position.y - 0.1) respawn(i)
      }
      sparkGeo.attributes.position.needsUpdate = true
      // Alarm: the cooling skid's hot-water pipe pulses red.
      hot.emissive.setHex(s.alarm ? 0xff1a1a : 0x9a3412)
      hot.emissiveIntensity = s.alarm ? 0.6 + 0.4 * Math.sin(t * 4) : 0.2
      controls.update()
      renderer.render(scene, camera)
      // Tags.
      if (tagEls.length) {
        const w = el.clientWidth, h = el.clientHeight
        tick += 1
        tagDefs.forEach((d, i) => {
          v.copy(d.at); d.obj.localToWorld(v)
          // Every few frames, hide a tag whose part is behind something else (e.g. the cabinet behind the furnace).
          if (tick % 12 === i % 12 && d.obj !== scene) {
            a.subVectors(v, camera.position); const dist = a.length(); ray.set(camera.position, a.normalize()); ray.far = dist
            const hit = ray.intersectObjects(scene.children, true).find((x) => x.object instanceof THREE.Mesh && (x.object as THREE.Mesh).visible && (x.object as THREE.Object3D) !== grid)
            hidden[i] = !!hit && hit.distance < dist - 0.6 && !isPart(hit.object, d.obj === body ? body : d.obj)
          }
          v.project(camera)
          const vis = !hidden[i] && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05
          tagEls[i].style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`
          tagEls[i].style.opacity = vis ? '1' : '0'
        })
      }
      void spout
    }
    loop()
    return () => { cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); pmrem.dispose(); renderer.dispose(); scene.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()) } }); el.removeChild(renderer.domElement); tagLayer.current?.replaceChildren() }
  }, [tags])

  return <div className="ms-3d" ref={host} role="img" aria-label={`${label}: 3D induction furnace, ${state.phase}, ${state.bathC ?? '—'} °C`}>
    <div className="f3d-tags" ref={tagLayer} aria-hidden="true" />
  </div>
}
