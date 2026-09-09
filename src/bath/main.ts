import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { makeTub } from './Tub'
import fullscreenVert from './fullscreen.vert'
import steamFrag from './steam.frag'

// add ?sweep to the URL to auto-animate progress instead of scrolling
const SWEEP = new URLSearchParams(location.search).has('sweep')

function banner(msg: string): void {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText =
    'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b00020;color:#fff;' +
    'font:12px/1.5 monospace;padding:10px;white-space:pre-wrap'
  document.body.appendChild(el)
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
  if (!canvas) throw new Error('no #webgl canvas')

  let W = window.innerWidth
  let H = window.innerHeight
  const dpr = Math.min(window.devicePixelRatio, 1.75)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(dpr)
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#ddd9d0')

  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture

  const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100)

  const key = new THREE.DirectionalLight('#fff6ea', 1.9)
  key.position.set(2.5, 5, 3)
  scene.add(key)
  scene.add(new THREE.HemisphereLight('#f4f4f0', '#9a948a', 0.7))

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(24, 64),
    new THREE.MeshStandardMaterial({ color: '#cfccc3', roughness: 0.92 }),
  )
  floor.rotation.x = -Math.PI / 2
  scene.add(floor)

  scene.add(makeTub())

  // ---- steam pass ----
  const rt = new THREE.WebGLRenderTarget(W * dpr, H * dpr, { depthBuffer: true, stencilBuffer: false })
  const steamScene = new THREE.Scene()
  const steamCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const steamMat = new THREE.ShaderMaterial({
    vertexShader: fullscreenVert,
    fragmentShader: steamFrag,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uScene: { value: rt.texture },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(W, H) },
    },
  })
  steamScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), steamMat))

  // ---- progress: native scroll OR wheel OR keys, whichever moves it ----
  let target = 0
  let progress = 0
  let manual = 0 // wheel / key accumulator, independent of the document scrollbar

  const scrollMax = (): number =>
    Math.max(1, document.documentElement.scrollHeight - window.innerHeight)

  function sync(): void {
    const fromBar = window.scrollY / scrollMax()
    target = THREE.MathUtils.clamp(Math.max(fromBar, manual), 0, 1)
  }
  window.addEventListener('scroll', sync, { passive: true })
  window.addEventListener(
    'wheel',
    (e) => {
      manual = THREE.MathUtils.clamp(manual + e.deltaY / 2400, 0, 1)
      sync()
    },
    { passive: true },
  )
  window.addEventListener('keydown', (e) => {
    const step = { ArrowDown: 0.08, PageDown: 0.25, ' ': 0.25, ArrowUp: -0.08, PageUp: -0.25 }[e.key]
    if (step === undefined) return
    manual = THREE.MathUtils.clamp(manual + step, 0, 1)
    sync()
  })
  sync()

  const camFrom = new THREE.Vector3(0, 2.6, 5.0)
  const camTo = new THREE.Vector3(0.35, 1.8, 3.15)
  const lookFrom = new THREE.Vector3(0, 0.9, 0)
  const lookTo = new THREE.Vector3(0, 0.45, 0.05)
  const _look = new THREE.Vector3()

  function resize(): void {
    W = window.innerWidth
    H = window.innerHeight
    renderer.setSize(W, H)
    rt.setSize(W * dpr, H * dpr)
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    steamMat.uniforms.uRes.value.set(W, H)
    sync()
  }
  window.addEventListener('resize', resize)

  const clock = new THREE.Clock()

  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.05)
    const t = clock.elapsedTime

    if (SWEEP) {
      const cy = (t % 9) / 9
      target = cy < 0.55 ? cy / 0.55 : cy < 0.8 ? 1 : 1 - (cy - 0.8) / 0.2
    }

    progress += (target - progress) * (1 - Math.pow(SWEEP ? 0.05 : 0.0015, dt))
    const eased = progress * progress * (3 - 2 * progress)

    camera.position.lerpVectors(camFrom, camTo, eased)
    _look.lerpVectors(lookFrom, lookTo, eased)
    camera.lookAt(_look)

    steamMat.uniforms.uProgress.value = progress
    steamMat.uniforms.uTime.value = t

    renderer.setRenderTarget(rt)
    renderer.render(scene, camera)
    renderer.setRenderTarget(null)
    renderer.render(steamScene, steamCam)

    requestAnimationFrame(frame)
  }

  frame()
} catch (e) {
  banner('bath crashed: ' + String((e as Error)?.stack ?? e))
}
