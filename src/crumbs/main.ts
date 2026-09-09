import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { normalizeModel } from '../models/normalize'

type Kind = 'cookie' | 'cracker'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')!
const cookieNote = document.querySelector<HTMLParagraphElement>('#cookie-note')!
const hint = document.querySelector<HTMLParagraphElement>('#hint')!
const acceptBtn = document.querySelector<HTMLButtonElement>('#accept')!
const preferBtn = document.querySelector<HTMLButtonElement>('#prefer')!

// ---- three ----------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.background = new THREE.Color('#ecebe4')

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 3.4, 9)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.target.set(0, 1.1, 0)
controls.maxPolarAngle = Math.PI * 0.5

const key = new THREE.DirectionalLight('#fff4e6', 2.1)
key.position.set(5, 10, 6)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.left = -7
key.shadow.camera.right = 7
key.shadow.camera.top = 8
key.shadow.camera.bottom = -4
key.shadow.bias = -0.0002
scene.add(key)
scene.add(new THREE.HemisphereLight('#eef0f4', '#6b6659', 0.4))

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: '#dedcd2', roughness: 0.95 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

// ---- cannon --------------------------------------------------------------
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) })
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true
const mat = new CANNON.Material('crumb')
world.defaultContactMaterial.friction = 0.5
world.defaultContactMaterial.restitution = 0.08
world.addContactMaterial(new CANNON.ContactMaterial(mat, mat, { friction: 0.5, restitution: 0.08 }))

const floorBody = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: mat })
floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(floorBody)

for (const [nx, nz, px, pz] of [
  [1, 0, -4.5, 0],
  [-1, 0, 4.5, 0],
  [0, 1, 0, -3.5],
  [0, -1, 0, 3.5],
] as const) {
  const wall = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: mat })
  wall.quaternion.setFromEuler(0, Math.atan2(nx, nz), 0)
  wall.position.set(px, 0, pz)
  world.addBody(wall)
}

// ---- models -------------------------------------------------------------
interface Proto {
  wrapper: THREE.Object3D
  half: CANNON.Vec3
  mass: number
}
const protos: Partial<Record<Kind, Proto>> = {}
const loader = new GLTFLoader()

async function loadProto(kind: Kind, url: string, size: number, mass: number): Promise<void> {
  const gltf = await loader.loadAsync(url)
  const n = normalizeModel(gltf.scene, size, { floor: false })
  n.object.updateWorldMatrix(true, true)
  const s = new THREE.Box3().setFromObject(n.object).getSize(new THREE.Vector3())
  protos[kind] = {
    wrapper: n.object,
    half: new CANNON.Vec3(Math.max(s.x / 2, 0.02), Math.max(s.y / 2, 0.02), Math.max(s.z / 2, 0.02)),
    mass,
  }
}

// ---- rain --------------------------------------------------------------
interface Item {
  mesh: THREE.Object3D
  body: CANNON.Body
}
const items: Item[] = []

function spawnOne(kind: Kind): void {
  const proto = protos[kind]
  if (!proto) return

  const mesh = proto.wrapper.clone(true)
  mesh.traverse((c) => {
    const m = c as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  scene.add(mesh)

  const body = new CANNON.Body({
    mass: proto.mass,
    material: mat,
    allowSleep: true,
    sleepSpeedLimit: 0.35,
    sleepTimeLimit: 0.5,
    linearDamping: 0.12,
    angularDamping: 0.35,
  })
  body.addShape(new CANNON.Box(proto.half))
  body.position.set((Math.random() * 2 - 1) * 2.6, 8 + Math.random() * 5, (Math.random() * 2 - 1) * 1.8)
  body.quaternion.setFromEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6)
  body.angularVelocity.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7)
  world.addBody(body)

  items.push({ mesh, body })
}

function rain(kind: Kind, count = 34): void {
  let n = 0
  const iv = window.setInterval(() => {
    spawnOne(kind)
    if (++n >= count) window.clearInterval(iv)
  }, 45)
}

// ---- text swap ------------------------------------------------------
function swapCookieText(): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const found: Text[] = []
  let node = walker.nextNode()
  while (node) {
    const p = node.parentNode
    if (p && p.nodeName !== 'SCRIPT' && p.nodeName !== 'STYLE' && /cookie/i.test(node.nodeValue ?? '')) {
      found.push(node as Text)
    }
    node = walker.nextNode()
  }
  for (const t of found) {
    t.nodeValue = (t.nodeValue ?? '')
      .replace(/COOKIES/g, 'CRACKERS')
      .replace(/COOKIE/g, 'CRACKER')
      .replace(/Cookies/g, 'Crackers')
      .replace(/Cookie/g, 'Cracker')
      .replace(/cookies/g, 'crackers')
      .replace(/cookie/g, 'cracker')
  }
}

// ---- wire up -------------------------------------------------------
let chosen = false
function choose(kind: Kind): void {
  if (chosen) return
  chosen = true
  acceptBtn.remove()
  preferBtn.remove()
  if (kind === 'cracker') {
    swapCookieText()
    cookieNote.textContent = 'Fine. A cracker has been added to the current physics scene. Then 33 more.'
  } else {
    cookieNote.textContent = 'Noted.'
  }
  hint.textContent = ''
  rain(kind)
}

acceptBtn.addEventListener('click', () => choose('cookie'))
preferBtn.addEventListener('click', () => choose('cracker'))

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

const clock = new THREE.Clock()
Promise.all([
  loadProto('cookie', '/models/cookie.glb', 0.9, 0.3),
  loadProto('cracker', '/models/cracker.glb', 1.0, 0.5),
]).then(() => {
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05)
    world.step(1 / 60, dt, 3)
    for (const it of items) {
      it.mesh.position.set(it.body.position.x, it.body.position.y, it.body.position.z)
      it.mesh.quaternion.set(
        it.body.quaternion.x,
        it.body.quaternion.y,
        it.body.quaternion.z,
        it.body.quaternion.w,
      )
    }
    controls.update()
    renderer.render(scene, camera)
  })
})
