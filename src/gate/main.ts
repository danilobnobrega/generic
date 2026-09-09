import * as THREE from 'three'

function banner(msg: string): void {
  const el = document.createElement('div')
  el.textContent = msg
  el.style.cssText =
    'position:fixed;left:0;right:0;top:0;z-index:99999;background:#b00020;color:#fff;' +
    'font:12px/1.5 monospace;padding:10px;white-space:pre-wrap'
  document.body.appendChild(el)
}

/** draw text on a transparent canvas, cropped tight to the ink */
function textTexture(
  text: string,
  font: string,
  color = '#141410',
): { tex: THREE.CanvasTexture; aspect: number; splitFrac?: number; splitText?: string } {
  const pad = 40
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const m = probe.measureText(text)
  const w = Math.ceil(m.width) + pad * 2
  const h = Math.ceil((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || 200) + pad * 2

  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.font = font
  g.fillStyle = color
  g.textBaseline = 'alphabetic'
  g.fillText(text, pad, pad + (m.actualBoundingBoxAscent || 150))

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.minFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.anisotropy = 8
  return { tex, aspect: w / h }
}

try {
  const canvas = document.querySelector<HTMLCanvasElement>('#webgl')
  if (!canvas) throw new Error('no #webgl canvas')

  let W = window.innerWidth
  let H = window.innerHeight
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75))
  renderer.setSize(W, H)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#f0efe9')

  const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100)

  scene.add(new THREE.HemisphereLight('#ffffff', '#c9c6bd', 1.0))
  const dir = new THREE.DirectionalLight('#fff3e4', 1.0)
  dir.position.set(2, 4, 5)
  scene.add(dir)

  // ---- the wordmark, split GEN | ERIC. ----
  const fontLoaded = document.fonts.ready

  const GATE_W = 5.2 // total world width of the closed gate
  const gateGroup = new THREE.Group()
  scene.add(gateGroup)

  const leftHinge = new THREE.Group()
  const rightHinge = new THREE.Group()
  leftHinge.position.x = -GATE_W / 2
  rightHinge.position.x = GATE_W / 2
  gateGroup.add(leftHinge, rightHinge)

  let gateTop = 0.6

  fontLoaded.then(() => {
    const F = '700 300px Tinos, Times, "Times New Roman", serif'
    const probe = document.createElement('canvas').getContext('2d')!
    probe.font = F
    const genW = probe.measureText('GEN').width
    const fullW = probe.measureText('GENERIC.').width
    const splitFrac = genW / fullW

    const { tex, aspect } = textTexture('GENERIC.', F)
    const worldH = GATE_W / aspect
    gateTop = worldH / 2

    const leafMat = (repeatX: number, offsetX: number): THREE.MeshBasicMaterial => {
      const t = tex.clone()
      t.needsUpdate = true
      t.repeat.set(repeatX, 1)
      t.offset.set(offsetX, 0)
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.45, toneMapped: false })
    }

    const leftW = GATE_W * splitFrac
    const rightW = GATE_W * (1 - splitFrac)

    const leftLeaf = new THREE.Mesh(new THREE.PlaneGeometry(leftW, worldH), leafMat(splitFrac, 0))
    leftLeaf.position.x = leftW / 2
    leftHinge.add(leftLeaf)

    const rightLeaf = new THREE.Mesh(new THREE.PlaneGeometry(rightW, worldH), leafMat(1 - splitFrac, splitFrac))
    rightLeaf.position.x = -rightW / 2
    rightHinge.add(rightLeaf)

    // "We are" above the gate
    const we = textTexture('We are', 'italic 400 120px "EB Garamond", Georgia, serif', '#15150e')
    const weH = 0.42
    const weMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(weH * we.aspect, weH),
      new THREE.MeshBasicMaterial({ map: we.tex, transparent: true, alphaTest: 0.4, toneMapped: false }),
    )
    weMesh.position.set(-GATE_W / 2 + (weH * we.aspect) / 2 + 0.1, gateTop + 0.4, 0.01)
    scene.add(weMesh)
  })

  // ---- the space behind the gate (placeholder) ----
  const backMat = new THREE.MeshStandardMaterial({ color: '#2a2824', roughness: 0.9 })
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), backMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, -1.8, -10)
  scene.add(floor)
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 24), new THREE.MeshStandardMaterial({ color: '#211f1c', roughness: 1 }))
  backWall.position.set(0, 4, -18)
  scene.add(backWall)
  const glow = new THREE.PointLight('#ffe9c8', 12, 20)
  glow.position.set(0, 1, -6)
  scene.add(glow)

  // ---- scroll -> progress ----
  let target = 0
  let progress = 0
  let manual = 0
  const scrollMax = (): number => Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
  const sync = (): void => {
    target = THREE.MathUtils.clamp(Math.max(window.scrollY / scrollMax(), manual), 0, 1)
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
    const s = { ArrowDown: 0.07, PageDown: 0.22, ' ': 0.22, ArrowUp: -0.07, PageUp: -0.22 }[e.key]
    if (s === undefined) return
    manual = THREE.MathUtils.clamp(manual + s, 0, 1)
    sync()
  })
  sync()

  const _look = new THREE.Vector3()

  function resize(): void {
    W = window.innerWidth
    H = window.innerHeight
    renderer.setSize(W, H)
    camera.aspect = W / H
    camera.updateProjectionMatrix()
    sync()
  }
  window.addEventListener('resize', resize)

  const clock = new THREE.Clock()

  function frame(): void {
    const dt = Math.min(clock.getDelta(), 0.05)
    progress += (target - progress) * (1 - Math.pow(0.002, dt))

    // gate opens on the first ~70% of scroll, camera pushes through on all of it
    const openP = THREE.MathUtils.clamp(progress / 0.7, 0, 1)
    const open = openP * openP * (3 - 2 * openP)
    leftHinge.rotation.y = open * -2.15
    rightHinge.rotation.y = open * 2.15

    const dolly = progress * progress * (3 - 2 * progress)
    camera.position.set(0, gateTop * 0.5 + 0.1, THREE.MathUtils.lerp(7.0, -2.2, dolly))
    _look.set(0, THREE.MathUtils.lerp(gateTop * 0.5, -0.4, dolly), THREE.MathUtils.lerp(0, -12, dolly))
    camera.lookAt(_look)

    renderer.render(scene, camera)
    requestAnimationFrame(frame)
  }

  frame()
} catch (e) {
  banner('gate crashed: ' + String((e as Error)?.stack ?? e))
}
