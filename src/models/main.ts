import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { normalizeModel } from './normalize'

const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
const hud = document.querySelector<HTMLDivElement>('#hud')
if (!canvas || !hud) throw new Error('missing dom')

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap

const scene = new THREE.Scene()
scene.background = new THREE.Color('#d9d8d2')

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100)
camera.position.set(0, 2.2, 6)

const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true
controls.target.set(0, 0.7, 0)
controls.maxPolarAngle = Math.PI * 0.52

const key = new THREE.DirectionalLight('#fff5e8', 2)
key.position.set(5, 9, 6)
key.castShadow = true
key.shadow.mapSize.set(2048, 2048)
key.shadow.camera.left = -6
key.shadow.camera.right = 6
key.shadow.camera.top = 6
key.shadow.camera.bottom = -6
key.shadow.bias = -0.0002
scene.add(key)
scene.add(new THREE.HemisphereLight('#eef0f4', '#6b6659', 0.35))

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(30, 64),
  new THREE.MeshStandardMaterial({ color: '#cdccc4', roughness: 0.95 }),
)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const loader = new GLTFLoader()
const turntables: THREE.Object3D[] = []

async function place(url: string, x: number, label: string): Promise<string> {
  const gltf = await loader.loadAsync(url)
  const { object, originalSize, scale, triangles } = normalizeModel(gltf.scene, 1.8)
  object.position.x = x
  const pivot = new THREE.Group()
  pivot.position.x = x
  object.position.x = 0
  pivot.add(object)
  scene.add(pivot)
  turntables.push(pivot)
  const s = originalSize
  return `${label}\n  tris ${triangles.toLocaleString()}   applied scale ${scale.toExponential(2)}\n  source bounds ${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)}`
}

Promise.all([
  place('/models/cookie.glb', -1.4, 'cookie.glb'),
  place('/models/cracker.glb', 1.4, 'cracker.glb'),
])
  .then((lines) => {
    hud.textContent = lines.join('\n\n')
  })
  .catch((err) => {
    hud.textContent = `load failed:\n${String(err)}`
  })

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

renderer.setAnimationLoop(() => {
  for (const t of turntables) t.rotation.y += 0.004
  controls.update()
  renderer.render(scene, camera)
})
