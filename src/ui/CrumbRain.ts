import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { normalizeModel } from '../models/normalize'

export type CrumbKind = 'cookie' | 'cracker'

/** world half-height of the orthographic view */
const VIEW_H = 6
const GRAVITY = -160
const TAU = Math.PI * 2
const SLOTS = 10
const POOL = 26

interface Proto {
  wrapper: THREE.Object3D
  shape: RAPIER.ColliderDesc
  pool: THREE.Object3D[]
}
interface Item {
  mesh: THREE.Object3D
  body: RAPIER.RigidBody
}

/**
 * A transparent full-screen physics layer, on Rapier. Orthographic so a crumb
 * never changes size with depth.
 *
 * Colliders are rounded boxes sized to each model — rounded edges can't balance
 * on a corner, flat faces stack cleanly, the solver converges and the pile
 * reaches Rapier's own sleep with no jitter. No side walls (an invisible thing
 * to rest against looks impossible). The render uses cheap lit materials, no
 * image-based lighting — kind on integrated GPUs.
 */
export class CrumbRain {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200)

  private world?: RAPIER.World
  private ready: Promise<void>
  private floorC?: RAPIER.Collider

  private loader = new GLTFLoader()
  private protos: Partial<Record<CrumbKind, Proto>> = {}
  private items: Item[] = []
  private clock = new THREE.Clock()
  private acc = 0
  private running = false
  private halfW = 1
  private spawnIndex = 0
  private crumbScale: number

  constructor(crumbScale = 1) {
    this.crumbScale = crumbScale

    this.canvas = document.createElement('canvas')
    const cs = this.canvas.style
    cs.position = 'fixed'
    cs.inset = '0'
    cs.width = '100%'
    cs.height = '100%'
    cs.zIndex = '6'
    cs.pointerEvents = 'none'
    document.body.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera.position.set(0, 0, 30)
    this.camera.lookAt(0, 0, 0)

    const dir = new THREE.DirectionalLight('#fff4e6', 2.6)
    dir.position.set(3, 6, 8)
    this.scene.add(dir, new THREE.HemisphereLight('#f2f0ea', '#6b6456', 1.1))

    this.ready = this.initPhysics()
    window.addEventListener('resize', this.resize)
    this.resize()
  }

  private fail(msg: string): void {
    const el = document.createElement('div')
    el.textContent = 'CrumbRain — ' + msg
    el.style.cssText =
      'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b00020;color:#fff;' +
      'font:12px/1.5 monospace;padding:10px;white-space:pre-wrap'
    document.body.appendChild(el)
  }

  private async initPhysics(): Promise<void> {
    try {
      await RAPIER.init()
    } catch (e) {
      this.fail('RAPIER.init failed: ' + String(e))
      throw e
    }

    const world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 })
    world.timestep = 1 / 120
    world.integrationParameters.numSolverIterations = 8
    world.integrationParameters.numInternalPgsIterations = 2
    this.world = world

    this.floorC = world.createCollider(
      RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setFriction(0.6).setRestitution(0),
    )
    this.placeBounds()
  }

  private placeBounds(): void {
    this.floorC?.setTranslation({ x: 0, y: -VIEW_H, z: 0 })
  }

  private resize = (): void => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.halfW = VIEW_H * (w / h)

    this.camera.left = -this.halfW
    this.camera.right = this.halfW
    this.camera.top = VIEW_H
    this.camera.bottom = -VIEW_H
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.placeBounds()
  }

  private async proto(kind: CrumbKind): Promise<Proto> {
    const existing = this.protos[kind]
    if (existing) return existing

    const url = kind === 'cracker' ? '/models/cracker.glb' : '/models/cookie.glb'
    const base = 0.88 // same size for both so neither reads as slower
    const gltf = await this.loader.loadAsync(url)
    const n = normalizeModel(gltf.scene, base * this.crumbScale, { floor: false })
    n.object.updateWorldMatrix(true, true)
    const s = new THREE.Box3().setFromObject(n.object).getSize(new THREE.Vector3())

    // swap PBR for a cheap lit material — the crumb is tiny, IBL isn't worth it
    n.object.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const src = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial
      m.material = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: 0xffffff })
    })

    const br = Math.min(0.045, s.y * 0.35, s.z * 0.35, s.x * 0.35)
    const shape = RAPIER.ColliderDesc.roundCuboid(
      Math.max(s.x / 2 - br, 0.02),
      Math.max(s.y / 2 - br, 0.01),
      Math.max(s.z / 2 - br, 0.01),
      br,
    )
      .setDensity(0.7)
      .setFriction(0.6)
      .setRestitution(0)

    // pre-clone the render meshes so spawning has zero per-crumb cost
    const pool: THREE.Object3D[] = []
    for (let i = 0; i < POOL; i++) {
      const clone = n.object.clone(true)
      clone.visible = false
      this.scene.add(clone)
      pool.push(clone)
    }

    const p: Proto = { wrapper: n.object, shape, pool }
    this.protos[kind] = p
    return p
  }

  async preload(): Promise<void> {
    await this.ready
    await Promise.all([this.proto('cookie'), this.proto('cracker')])
  }

  async rain(kind: CrumbKind, count = 22): Promise<void> {
    await this.ready
    const proto = await this.proto(kind)
    if (!this.world) return

    if (!this.running) {
      this.running = true
      this.clock.getDelta()
      this.renderer.setAnimationLoop(this.frame)
    }

    const total = Math.min(count, POOL)
    const burst = Math.min(5, total)
    for (let i = 0; i < burst; i++) this.spawn(proto)

    let n = burst
    const iv = window.setInterval(() => {
      this.spawn(proto)
      if (++n >= total) window.clearInterval(iv)
    }, 55)
  }

  private spawn(proto: Proto): void {
    const world = this.world
    if (!world || proto.pool.length === 0) return

    const mesh = proto.pool.pop() as THREE.Object3D
    mesh.visible = true

    // spread across fixed slots so two crumbs never spawn inside each other
    const slot = this.spawnIndex++ % SLOTS
    const x = (slot / (SLOTS - 1) - 0.5) * 2 * this.halfW * 0.55

    const q = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU),
    )

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, VIEW_H + 1.6 + Math.random() * 1.4, (Math.random() * 2 - 1) * 0.3)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinvel((Math.random() - 0.5) * 0.6, -2 - Math.random() * 2, 0)
        .setAngvel({ x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 })
        .setLinearDamping(0.07)
        .setAngularDamping(0.5)
        .setCcdEnabled(true),
    )
    world.createCollider(proto.shape, body)

    this.items.push({ mesh, body })
  }

  private frame = (): void => {
    const world = this.world
    if (!world) return

    const d = Math.min(this.clock.getDelta(), 0.1)
    this.acc = Math.min(this.acc + d, world.timestep * 3)
    let steps = 0
    while (this.acc >= world.timestep && steps < 3) {
      world.step()
      this.acc -= world.timestep
      steps += 1
    }

    for (const it of this.items) {
      const t = it.body.translation()
      const r = it.body.rotation()
      it.mesh.position.set(t.x, t.y, t.z)
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w)
    }

    this.renderer.render(this.scene, this.camera)
  }
}
