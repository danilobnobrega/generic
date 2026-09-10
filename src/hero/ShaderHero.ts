import * as THREE from 'three'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fullscreenVert from './shaders/fullscreen.vert'
import fieldFrag from './shaders/field.frag'
import paperFrag from './shaders/paper.frag'
import { CrumbRain, CRUMB_VIEW_H } from '../ui/CrumbRain'

const LOCKUP_FRACTION_DESKTOP = 0.82
const LOCKUP_FRACTION_MOBILE = 0.92

/** CSS px the canvas extends above the viewport (must match `#stage { top }` in hero.css).
 *  Chrome offsets the WebGL surface a few px down from the element box on this
 *  machine; the dirty edge lands in this clipped-away overscan instead of on screen. */
const OVERSCAN = 100

/** distance from the door camera to the closed doors (z = 0) */
const DOOR_CAM_Z = 4
/** z of the crumb pile — in front of the closed doors, so the camera leaves it behind */
const CRUMB_Z = 2.4
/** extrusion depth of the sign letters, as a fraction of cap height */
const LETTER_DEPTH = 0.17
/** 'free' mode: how far the door-cubes rotate before freezing (radians). 2.129 = 122° */
const SPIN_CAP = 2.129
/** 'free' mode: scroll fraction at which the rotation + recede freeze and the camera
 *  starts its forward dive */
const FREEZE_P = 0.61
/** 'free' mode: where the camera ends its dive — punched fully past the frozen cubes */
const CAM_DIVE_END = -17
/** section 2 — the photo tunnel behind the doors (Floema's recipe) */
const TUNNEL_ARM_P = 0.99 // turns on once the camera has punched fully past the cubes
const TUNNEL_RADIUS = 10 // photos ride a circle of this radius around the forward axis
const TUNNEL_SPACING = 2 // z-gap between photos
const TUNNEL_FOG_FAR = 78 // photos dissolve into the dark by this distance
const TUNNEL_PLANES = 44 // enough to fill the corridor + a buffer
const TUNNEL_IMG_SIZE = 1.5
const TUNNEL_SCALE_RAND = 0.5
const TUNNEL_SPEED_WARP = 240 // units/sec burst the instant the tunnel arms
const TUNNEL_SPEED_IDLE = 10 // baseline drift once the burst settles
const TUNNEL_WARP_TIME = 1.1 // seconds to ease from warp -> idle
const TUNNEL_SCROLL_BOOST = 42 // extra units/sec at full scroll input

/**
 * The hero. The off-white ground is a shader (grain + vignette); on it stands a
 * physical sign — "We are GENERIC" as extruded Tinos (Times-metric) letters
 * with real depth and a bevel, dark polished metal. The cursor lays a heat field
 * (ping-pong FBO) and where it's hot the metal turns to liquid chrome, cooling
 * back when you leave.
 *
 * The ground is rendered to a target and mapped onto two giant door leaves; the
 * letters are split GEN | ERIC. and parented to the leaves, so each half rides
 * its own door. Closed (scroll 0) it reads as a plain hero; scroll swings the
 * leaves open from the centre and pushes the camera through into the space
 * beyond. The chrome-on-hover fades out as the doors open.
 */
export class ShaderHero {
  private renderer: THREE.WebGLRenderer
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private clock = new THREE.Clock()

  private quad = new THREE.PlaneGeometry(2, 2)
  private fieldScene = new THREE.Scene()
  private heroScene = new THREE.Scene()
  private fieldMat: THREE.ShaderMaterial
  private heroMat: THREE.ShaderMaterial

  private rtA: THREE.WebGLRenderTarget
  private rtB: THREE.WebGLRenderTarget
  private heroRT: THREE.WebGLRenderTarget

  private doorScene = new THREE.Scene()
  private doorCam: THREE.PerspectiveCamera
  private doorMat: THREE.RawShaderMaterial
  private leftHinge = new THREE.Group()
  private rightHinge = new THREE.Group()
  private leftPanel?: THREE.Mesh
  private rightPanel?: THREE.Mesh
  // The tagline TEXT material. Self-contained shader (ignores the scene light list so
  // the other cube's key can't cross-light it): one key direction, gated by the flat
  // face's orientation — dark until the cube turns that face into its key (~123°),
  // then it lights up. Left/right keys mirror.
  private KEY_L = new THREE.Vector3(8.4, 2.0, -5.45)
  private KEY_R = new THREE.Vector3(-8.4, 2.0, -5.45)
  private tagMatL = this.makeSideMat(this.KEY_L, 0x242424, 1.05)
  private tagMatR = this.makeSideMat(this.KEY_R, 0x242424, 1.05)
  private cubeSide = 1 // real edge length of each door-cube, set in buildDoors
  private _look = new THREE.Vector3()

  private letterMat!: THREE.ShaderMaterial
  private lettersL = new THREE.Group()
  private lettersR = new THREE.Group()
  private fonts?: { bold: Font; italic: Font }

  /** the cookie/cracker pile — lives in doorScene, in front of the doors */
  readonly crumbs: CrumbRain

  private canvas: HTMLCanvasElement
  private W = window.innerWidth
  private H = window.innerHeight
  private dpr = Math.min(window.devicePixelRatio, 2)

  private pointer = new THREE.Vector2(0.5, 0.5)
  private target = new THREE.Vector2(0.5, 0.5)
  private prevPointer = new THREE.Vector2(0.5, 0.5)
  private active = 0
  private down = 0
  private pointerInside = false

  private spinMode: 'cap' | 'free'

  private progress = 0
  private progressTarget = 0
  private manual = 0

  // section 2 — the photo tunnel
  private gallery = new THREE.Group()
  private galleryPhotos: THREE.Mesh[] = []
  private tunnelTime = -1 // seconds since the tunnel armed (-1 = not armed)
  private tunnelScroll = 0 // 0..1 scroll input, coasts back to 0 -> speed boost on top of idle

  constructor(canvas: HTMLCanvasElement, opts: { crumbScale?: number; spinMode?: 'cap' | 'free' } = {}) {
    this.spinMode = opts.spinMode ?? 'cap'
    this.canvas = canvas
    // Size to the canvas's own laid-out box — and pass the RAW fractional size to
    // setSize. Rounding it here makes the backing store a pixel short of the box,
    // which forces Chrome to scale the canvas, and the Intel compositor at
    // fractional Windows scaling then leaves a dirty strip at the top.
    const box = canvas.getBoundingClientRect() // width x (visibleHeight + OVERSCAN)
    this.W = Math.max(1, box.width)
    this.H = Math.max(1, box.height - OVERSCAN) // the visible design frame

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(this.dpr)
    // real shadows in the door scene: the concrete slab occludes its key light from
    // the raised tagline letters until the cube has turned far enough, so the letters
    // sit in the slab's shadow — not just dimly lit — and then reveal their volume
    // through self-shadowing once the light rakes across.
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setSize(box.width, box.height, false) // backing store covers the whole oversized canvas
    this.renderer.setViewport(0, 0, this.W, this.H) // ...but render only the visible bottom part

    const bw = Math.round(this.W * this.dpr)
    const bh = Math.round(this.H * this.dpr) // device-px size of the visible frame

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    this.rtA = new THREE.WebGLRenderTarget(Math.max(2, Math.round(bw / 2)), Math.max(2, Math.round(bh / 2)), rtOpts)
    this.rtB = new THREE.WebGLRenderTarget(Math.max(2, Math.round(bw / 2)), Math.max(2, Math.round(bh / 2)), rtOpts)
    this.heroRT = new THREE.WebGLRenderTarget(bw, bh, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    // hero.frag writes display-ready values straight to gl_FragColor (no colour
    // management in that shader). Keep the whole door path free of colour-space
    // conversion too — linear-tagged target + a RawShaderMaterial that just
    // samples it — so the closed doors are byte-identical to the old direct render.
    this.heroRT.texture.colorSpace = THREE.LinearSRGBColorSpace

    this.doorMat = new THREE.RawShaderMaterial({
      side: THREE.DoubleSide, // the leaves must stay visible through the whole swing
      uniforms: {
        map: { value: this.heroRT.texture },
        uPlay: { value: this.spinMode === 'free' ? 1 : 0 }, // light/shadow play only in 'free'
        // 0 -> 1, set in frame(): GENERIC faces fall into shadow on uPhase (fast),
        // the tagline outer faces come up on uPhaseB (slower)
        uPhase: { value: 0 },
        uPhaseB: { value: 0 },
      },
      vertexShader: `
        precision highp float;
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        attribute float aFaceKind; // 0 = GENERIC front, 1 = tagline outer, 2 = other
        varying vec2 vUv;
        varying float vKind;
        void main() {
          vUv = uv;
          vKind = aFaceKind;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D map;
        uniform float uPlay;
        uniform float uPhase;
        uniform float uPhaseB;
        varying vec2 vUv;
        varying float vKind;
        void main() {
          vec3 tex = texture2D(map, vUv).rgb;
          if (uPlay < 0.5) { gl_FragColor = vec4(tex, 1.0); return; }
          float bright = 1.0;
          if (vKind < 0.5) {
            bright = mix(1.0, 0.03, uPhase);   // GENERIC front: full -> deep shadow (fast)
          } else if (vKind < 1.5) {
            bright = mix(0.02, 1.0, uPhaseB);  // tagline outer: invisible -> full (slow)
          } else {
            bright = mix(1.0, 0.24, uPhase);   // the rest: rides down with GENERIC
          }
          gl_FragColor = vec4(tex * bright, 1.0);
        }`,
    })

    this.fieldMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: fieldFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uPrev: { value: this.rtA.texture },
        uPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uPrevPointer: { value: new THREE.Vector2(0.5, 0.5) },
        uAspect: { value: this.W / this.H },
        uDown: { value: 0 },
        uActive: { value: 0 },
      },
    })

    this.heroMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: paperFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uResolution: { value: new THREE.Vector2(bw, bh) },
        uTex: { value: null },
        uHasTex: { value: 0 },
        uTexMix: { value: 0 }, // 0 = off-white paper, 1 = concrete; ramped by scroll in frame()
        uViewAspect: { value: bw / bh },
        uTexAspect: { value: 1 },
      },
    })
    // test: a concrete slab instead of the flat off-white ground
    new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}textures/hero-concrete.png`, (tex) => {
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
      this.heroMat.uniforms.uTex.value = tex
      this.heroMat.uniforms.uTexAspect.value = tex.image.width / tex.image.height
      this.heroMat.uniforms.uHasTex.value = 1
    })

    this.buildLetterMaterial()

    this.fieldScene.add(new THREE.Mesh(this.quad, this.fieldMat))
    this.heroScene.add(new THREE.Mesh(this.quad, this.heroMat))

    this.doorCam = new THREE.PerspectiveCamera(50, this.W / this.H, 0.1, 120)
    this.doorCam.position.set(0, 0, DOOR_CAM_Z)
    this.leftHinge.add(this.lettersL)
    this.rightHinge.add(this.lettersR)
    this.doorScene.add(this.leftHinge, this.rightHinge)
    this.buildSpaceBehind()
    this.buildDoors()
    if (this.spinMode === 'free') this.buildGallery()

    // the crumb pile — a scaled sub-world planted at CRUMB_Z, in front of the
    // closed doors. Scale maps the crumb ortho view (2·CRUMB_VIEW_H tall) exactly
    // onto the door frustum at that z, so at rest it reads like a screen overlay;
    // once the camera dollies past CRUMB_Z the pile is behind it, out of frame.
    this.crumbs = new CrumbRain({ parent: this.doorScene, crumbScale: opts.crumbScale })
    const k = ((DOOR_CAM_Z - CRUMB_Z) * Math.tan(THREE.MathUtils.degToRad(this.doorCam.fov / 2))) / CRUMB_VIEW_H
    this.crumbs.stage.position.z = CRUMB_Z
    this.crumbs.stage.scale.setScalar(k)
    this.crumbs.layout(this.W / this.H)

    this.clearTargets()
    void this.loadFonts().then(() => this.layoutLetters())

    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onLeave)
    document.addEventListener('pointerleave', this.onLeave)
    new ResizeObserver(this.onResize).observe(canvas)
    window.addEventListener('wheel', this.onWheel, { passive: true })
    window.addEventListener('scroll', this.onScroll, { passive: true })
    window.addEventListener('keydown', this.onKey)

    this.renderer.setAnimationLoop(this.frame)
  }

  // ---- doors ------------------------------------------------------
  private buildDoors(): void {
    // the frustum cross-section at the closed doors (z = 0)
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(this.doorCam.fov / 2))
    const vw = vh * (this.W / this.H)
    const pw = vw / 2
    const over = vw * 0.006

    // a REAL cube: one edge length for all three sides. It covers its half of the
    // frame (whichever of half-width / height is bigger) and overshoots the other
    // way off-screen. Front (+z) face at local z = 0 when closed.
    const S = Math.max(pw, vh) + 2 * over
    this.cubeSide = S

    for (const p of [this.leftPanel, this.rightPanel]) {
      if (!p) continue
      p.geometry.dispose() // materials are shared — never disposed here
      p.parent?.remove(p)
    }

    // every face samples the hero ground (heroRT) with clean cube-local 0..1 UVs so
    // nothing ever samples out of bounds (that clamp-stretch at the frame edge was the
    // bowed band). Front face x is mirrored per cube so the concrete stays continuous
    // across the closed seam. Also tag each vertex by face kind for the light play.
    const bakeUVs = (g: THREE.BufferGeometry, dir: -1 | 1): void => {
      const pos = g.attributes.position
      const nor = g.attributes.normal
      const uv = g.attributes.uv
      const kind = new Float32Array(pos.count)
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i)
        const py = pos.getY(i)
        const pz = pos.getZ(i)
        const nx = nor.getX(i)
        if (pz > -1e-4 && Math.abs(nor.getZ(i)) > 0.5) {
          const u = px / S + 0.5
          uv.setXY(i, dir === -1 ? u : 1.0 - u, py / S + 0.5) // front — mirror x on the right cube
          kind[i] = 0 // GENERIC front
        } else if (Math.abs(nx) > 0.5) {
          uv.setXY(i, pz / S + 1.0, py / S + 0.5) // ±x face
          kind[i] = Math.sign(nx) === dir ? 1 : 2 // outer x-face (toward the frame edge) = tagline
        } else if (Math.abs(nor.getY(i)) > 0.5) {
          uv.setXY(i, px / S + 0.5, pz / S + 1.0) // ±y face
          kind[i] = 2
        } else {
          uv.setXY(i, px / S + 0.5, py / S + 0.5) // back (-z) face
          kind[i] = 2
        }
      }
      uv.needsUpdate = true
      g.setAttribute('aFaceKind', new THREE.BufferAttribute(kind, 1))
    }
    // all six slots: the same door material (heroRT / concrete), like the GENERIC face
    const D = this.doorMat
    const mats: THREE.Material[] = [D, D, D, D, D, D]

    // dir -1 = left cube (its inner/right edge at the seam x=0), +1 = right cube
    const buildLeaf = (hinge: THREE.Group, dir: -1 | 1): THREE.Mesh => {
      hinge.position.set((dir * vw) / 2, 0, 0)
      hinge.rotation.set(0, 0, 0)
      const cx = -dir * (S / 2 - over) // cube centre so the seam edge lands on x = 0
      const g = new THREE.BoxGeometry(S, S, S)
      g.translate(0, 0, -S / 2) // front face -> local z = 0
      bakeUVs(g, dir)
      const mesh = new THREE.Mesh(g, mats)
      mesh.position.x = cx
      // the two cubes overlap by ~`over` at the seam; sit the right one a hair back
      // in z so that coplanar strip can't z-fight as the doors split
      mesh.position.z = dir === 1 ? -0.008 : 0
      hinge.add(mesh)
      return mesh
    }

    this.leftPanel = buildLeaf(this.leftHinge, -1)
    this.rightPanel = buildLeaf(this.rightHinge, 1)

    if (this.spinMode === 'free') {
      this.leftPanel.layers.set(1)
      this.rightPanel.layers.set(2)
      for (const p of [this.leftPanel, this.rightPanel]) {
        p.castShadow = true
        p.receiveShadow = true
      }
    }
  }

  /** the space beyond the doors — the tunnel's fog IS the backdrop now */
  private buildSpaceBehind(): void {
    const glow = new THREE.PointLight(0xffe6c4, 20, 30)
    glow.position.set(0, 1.5, -9)
    this.doorScene.add(glow)

    if (this.spinMode !== 'free') {
      const key = new THREE.DirectionalLight(0xfff4e6, 2.4) // soft key from the camera side
      key.position.set(3, 4, 7)
      this.doorScene.add(key, new THREE.HemisphereLight(0x45423c, 0x26241f, 0.5))
      return
    }

    // 'free' mode: the two door-cubes are lit ONLY by the lights below — nothing else
    // in the scene (not the glow, not the room fill) can spill onto them. That's what
    // the layers are for: the left panel + its tagline are on layer 1, the right on
    // layer 2, and each key light + the fill match. Each outer (tagline) face is
    // turned AWAY from its key through the whole swing and only crosses into the
    // light once it has rotated past ~123° — it comes out of its own shadow purely
    // by turning. Sources sit off to the far side, set back into the room, mirrored.
    const shadow = (l: THREE.DirectionalLight): void => {
      l.castShadow = true
      l.shadow.mapSize.set(2048, 2048)
      l.shadow.camera.near = 0.5
      l.shadow.camera.far = 40
      l.shadow.camera.left = -9
      l.shadow.camera.right = 9
      l.shadow.camera.top = 9
      l.shadow.camera.bottom = -9
      l.shadow.bias = -0.0004
      l.shadow.normalBias = 0.03
    }
    const keyL = new THREE.DirectionalLight(0xffe8cc, 1.3)
    keyL.position.set(8.4, 2.0, -5.45)
    keyL.layers.set(1)
    shadow(keyL)
    const keyR = new THREE.DirectionalLight(0xffe8cc, 1.3)
    keyR.position.set(-8.4, 2.0, -5.45)
    keyR.layers.set(2)
    shadow(keyR)
    // barely-there fill. sky === ground so it's fully normal-independent: while the
    // slab shadow covers the letters, face and raised letters take the exact same
    // flat value and the relief is invisible. It shows only once keyL rakes across.
    const fill = new THREE.HemisphereLight(0x3a3732, 0x3a3732, 0.09)
    fill.layers.set(1)
    fill.layers.enable(2)
    // dim ambient for the placeholder room itself — layer 0, never touches the cubes
    const room = new THREE.HemisphereLight(0x45423c, 0x26241f, 0.3)
    this.doorScene.add(keyL, keyR, fill, room)
    this.doorCam.layers.enable(1)
    this.doorCam.layers.enable(2)
  }

  /**
   * Section 2 — a photo tunnel, Floema's recipe. Planes ride a circle of radius
   * TUNNEL_RADIUS around the forward axis, spread by the golden angle, spaced
   * TUNNEL_SPACING apart in z, all bunched behind the fog to start (invisible). Once
   * the camera is past the cubes the tunnel arms: a warp burst that eases to an idle
   * drift, plus a scroll boost. THREE.Fog (= the dark behind) does all the fade; a
   * plane that passes the camera recycles to the far end. Placeholders: grey cards.
   */
  private buildGallery(): void {
    let seed = 0x9e37
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    const golden = Math.PI * (3 - Math.sqrt(5))
    const geo = new THREE.PlaneGeometry(1, 1)
    const NDISTINCT = 12
    const texes: THREE.CanvasTexture[] = []
    for (let k = 0; k < NDISTINCT; k++) {
      const portrait = rng() > 0.5
      const cw = portrait ? 150 : 220
      const ch = portrait ? 220 : 150
      const cnv = document.createElement('canvas')
      cnv.width = cw
      cnv.height = ch
      const ctx = cnv.getContext('2d')!
      const g = 34 + Math.round(rng() * 78)
      ctx.fillStyle = `rgb(${g},${g},${g + 4})`
      ctx.fillRect(0, 0, cw, ch)
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, cw - 4, ch - 4)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = `bold ${Math.round(ch * 0.4)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(k + 1), cw / 2, ch / 2)
      const tex = new THREE.CanvasTexture(cnv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.generateMipmaps = false
      tex.minFilter = THREE.LinearFilter
      texes.push(tex)
    }
    for (let i = 0; i < TUNNEL_PLANES; i++) {
      const tex = texes[i % NDISTINCT]
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }))
      const a = i * golden
      m.position.x = Math.cos(a) * TUNNEL_RADIUS
      m.position.y = Math.sin(a) * TUNNEL_RADIUS
      m.position.z = CAM_DIVE_END - TUNNEL_FOG_FAR - i * TUNNEL_SPACING // bunched behind the fog
      const aspect = tex.image.width / tex.image.height
      const base = TUNNEL_IMG_SIZE + rng() * TUNNEL_SCALE_RAND
      if (aspect >= 1) m.scale.set(base * aspect, base, 1)
      else m.scale.set(base, base / aspect, 1)
      this.galleryPhotos.push(m)
      this.gallery.add(m)
    }
    this.doorScene.add(this.gallery)
    this.doorScene.fog = new THREE.Fog(0x000000, 0.1, TUNNEL_FOG_FAR)
  }

  // ---- the sign -----------------------------------------------------
  /**
   * The outer-face / tagline material. Ignores the scene light list entirely (so the
   * other cube's key can't cross-light it). One key direction, `uKeyDir`. A gate from
   * the flat face's world normal `uFaceN` (fed per frame): 0 while the face is turned
   * away from its key, ramping over ~123°→140°. The shading itself uses the real
   * geometry normal, so the flat face reads as flat diffuse and the raised letters
   * pick up relief — but both stay pure black until the gate opens.
   */
  private makeSideMat(keyPos: THREE.Vector3, albedo: number, keyInt: number): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uKeyDir: { value: keyPos.clone().normalize() },
        uFaceN: { value: new THREE.Vector3(0, 0, 1) },
        uReveal: { value: 0 }, // scroll-paced brightening, driven from frame()
        uAlbedo: { value: new THREE.Color(albedo) },
        uKeyColor: { value: new THREE.Color(0xffe8cc) },
        uKeyInt: { value: keyInt }, // final reveal brightness (light amount, not colour)
      },
      vertexShader: `
        varying vec3 vRealN;
        void main() {
          vRealN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uKeyDir;
        uniform vec3 uFaceN;
        uniform float uReveal;
        uniform vec3 uAlbedo;
        uniform vec3 uKeyColor;
        uniform float uKeyInt;
        varying vec3 vRealN;
        void main() {
          // how far the flat face is still turned AWAY from its key. dot goes
          // ~-0.5 (spin 100°) -> 0 (123°) -> +0.05 (126°). Gate opens over ~105-120°
          // so it doesn't depend on the face turning far past the crossover.
          float d = dot(normalize(uFaceN), uKeyDir);
          float gate = smoothstep(-0.32, -0.04, d);
          // relief detail from the real normal (subtle) — gives the raised letters form
          float relief = mix(0.72, 1.0, clamp(dot(normalize(vRealN), uKeyDir) * 2.0 + 0.55, 0.0, 1.0));
          // a dark-concrete floor (not #000) once the surface is in play
          float amb = 0.015 * gate;
          vec3 col = uAlbedo * (amb + uKeyColor * uReveal * gate * relief * uKeyInt);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  }

  /**
   * Dark polished metal: a vertical studio gradient off the view normal, a hard
   * fresnel sliver on the edges, and a sharp bevel highlight. Where the cursor's
   * heat field is hot it lerps to liquid chrome; that lerp is killed as the
   * doors open (uOpen -> 1).
   */
  private buildLetterMaterial(): void {
    this.letterMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide, // cut caps have arbitrary winding; also hides any thin seam crack
      uniforms: {
        uField: { value: this.rtA.texture },
        uOpen: { value: 0 },
        uLight: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() },
        uPhase: { value: 0 }, // "We are GENERIC" falls into shadow with its face
      },
      vertexShader: `
        varying vec3 vViewN;
        varying vec4 vClip;
        void main() {
          vViewN = normalize(normalMatrix * normal);
          vClip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = vClip;
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uField;
        uniform float uOpen;
        uniform vec3 uLight;
        uniform float uPhase;
        varying vec3 vViewN;
        varying vec4 vClip;

        void main() {
          vec3 n = normalize(vViewN);
          vec2 suv = (vClip.xy / vClip.w) * 0.5 + 0.5;

          float heat = 0.0;
          if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) {
            heat = clamp(texture2D(uField, suv).r, 0.0, 1.0);
          }

          float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
          float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);
          float spec = pow(max(dot(reflect(-uLight, n), vec3(0.0, 0.0, 1.0)), 0.0), 55.0);

          // rest: near-black painted metal, volume readable from the gradient + edges
          vec3 rest = mix(vec3(0.014), vec3(0.11), smoothstep(0.12, 0.96, up));
          rest += spec * 0.55 + fres * 0.05;

          // hot: liquid chrome
          vec3 chrome = mix(vec3(0.05, 0.06, 0.08), vec3(0.95, 0.97, 1.0), smoothstep(0.10, 0.55, up));
          chrome = mix(chrome, vec3(1.0), smoothstep(0.62, 0.66, up));
          chrome += fres * 0.45 + spec;

          float k = smoothstep(0.06, 0.5, heat) * (1.0 - uOpen);
          vec3 col = mix(rest, chrome, k) * mix(1.0, 0.05, uPhase); // darken into shadow
          gl_FragColor = vec4(col, 1.0);
        }`,
    })

  }

  private async loadFonts(): Promise<void> {
    if (this.fonts) return
    try {
      const ttf = new TTFLoader()
      const [b, i] = await Promise.all([
        ttf.loadAsync('/fonts/Tinos-Bold.ttf'),
        ttf.loadAsync('/fonts/Tinos-Italic.ttf'),
      ])
      type FontData = ConstructorParameters<typeof Font>[0]
      this.fonts = { bold: new Font(b as unknown as FontData), italic: new Font(i as unknown as FontData) }
    } catch (e) {
      console.error('[hero] sign font load failed', e)
    }
  }

  /**
   * Split an extruded-text geometry by the plane x = 0 into two closed halves.
   * Triangles that straddle the plane are clipped (clean vertical seam, not a
   * ragged triangle-bucket edge) and each half gets a flat cap on the cut so the
   * bisected glyph reads as solid, not hollow.
   */
  private bisect(geo: THREE.BufferGeometry): [THREE.BufferGeometry, THREE.BufferGeometry] {
    const src = geo.index ? geo.toNonIndexed() : geo
    const P = src.attributes.position.array
    const N = src.attributes.normal.array

    const L: number[] = []
    const Ln: number[] = []
    const R: number[] = []
    const Rn: number[] = []
    const cut: number[] = [] // segments on x=0: [y1,z1,y2,z2,...]

    const fan = (arr: number[], narr: number[], poly: number[][]): void => {
      for (let i = 1; i < poly.length - 1; i++) {
        for (const v of [poly[0], poly[i], poly[i + 1]]) {
          arr.push(v[0], v[1], v[2])
          narr.push(v[3], v[4], v[5])
        }
      }
    }

    for (let t = 0; t < P.length; t += 9) {
      const v = [0, 1, 2].map((k) => [
        P[t + k * 3], P[t + k * 3 + 1], P[t + k * 3 + 2],
        N[t + k * 3], N[t + k * 3 + 1], N[t + k * 3 + 2],
      ])
      const lp: number[][] = []
      const rp: number[][] = []
      const onPlane: number[][] = []
      for (let i = 0; i < 3; i++) {
        const a = v[i]
        const b = v[(i + 1) % 3]
        if (a[0] <= 1e-6) lp.push(a)
        if (a[0] >= -1e-6) rp.push(a)
        if ((a[0] < 0 && b[0] > 0) || (a[0] > 0 && b[0] < 0)) {
          const s = a[0] / (a[0] - b[0])
          const m = a.map((av, k) => av + s * (b[k] - av))
          m[0] = 0
          lp.push(m)
          rp.push(m)
          onPlane.push(m)
        }
      }
      if (lp.length >= 3) fan(L, Ln, lp)
      if (rp.length >= 3) fan(R, Rn, rp)
      if (onPlane.length === 2) cut.push(onPlane[0][1], onPlane[0][2], onPlane[1][1], onPlane[1][2])
    }

    // cap the cut: chain the boundary segments into closed loops (a glyph like E
    // gives several disjoint loops) and fan each one on its own — a single global
    // fan would bridge the gaps and leave stray webs poking off the seam.
    const q = (y: number, z: number): string => `${Math.round(y * 1e4)}_${Math.round(z * 1e4)}`
    const segs: number[][] = []
    for (let i = 0; i < cut.length; i += 4) segs.push([cut[i], cut[i + 1], cut[i + 2], cut[i + 3]])
    const byKey = new Map<string, number[]>()
    segs.forEach((s, i) => {
      for (const k of [q(s[0], s[1]), q(s[2], s[3])]) {
        if (!byKey.has(k)) byKey.set(k, [])
        byKey.get(k)!.push(i)
      }
    })
    const unused = new Set(segs.map((_, i) => i))
    while (unused.size) {
      const start = unused.values().next().value as number
      unused.delete(start)
      const loop: number[][] = [
        [segs[start][0], segs[start][1]],
        [segs[start][2], segs[start][3]],
      ]
      const startKey = q(segs[start][0], segs[start][1])
      let curKey = q(segs[start][2], segs[start][3])
      for (let guard = 0; curKey !== startKey && guard < 5000; guard++) {
        const next = (byKey.get(curKey) ?? []).find((i) => unused.has(i))
        if (next === undefined) break
        unused.delete(next)
        const s = segs[next]
        const near = q(s[0], s[1]) === curKey
        loop.push(near ? [s[2], s[3]] : [s[0], s[1]])
        curKey = q(near ? s[2] : s[0], near ? s[3] : s[1])
      }
      if (loop.length < 3) continue
      let cy = 0
      let cz = 0
      for (const [y, z] of loop) {
        cy += y
        cz += z
      }
      cy /= loop.length
      cz /= loop.length
      // recess each cap's centroid a hair into its own half so the cap becomes a
      // shallow cone instead of a flat plane at x=0. The perimeter still meets the
      // cut edge exactly (no gap in the glyph), but the two caps no longer share a
      // coincident plane — which was the faint shimmer as the halves split.
      for (let i = 0; i < loop.length; i++) {
        const [y1, z1] = loop[i]
        const [y2, z2] = loop[(i + 1) % loop.length]
        L.push(-0.012, cy, cz, 0, y2, z2, 0, y1, z1)
        R.push(0.012, cy, cz, 0, y1, z1, 0, y2, z2)
        for (let j = 0; j < 3; j++) {
          Ln.push(-1, 0, 0)
          Rn.push(1, 0, 0)
        }
      }
    }

    if (src !== geo) src.dispose()

    const g = (p: number[], nn: number[]): THREE.BufferGeometry => {
      const bg = new THREE.BufferGeometry()
      bg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
      bg.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3))
      return bg
    }
    return [g(L, Ln), g(R, Rn)]
  }

  private disposeLetters(): void {
    for (const grp of [this.lettersL, this.lettersR]) {
      for (const child of [...grp.children]) {
        ;(child as THREE.Mesh).geometry?.dispose()
        grp.remove(child)
      }
    }
  }

  /** (re)build the extruded letters for the current viewport and split them GEN | ERIC. */
  private layoutLetters(): void {
    if (!this.fonts) return
    this.disposeLetters()

    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(this.doorCam.fov / 2))
    const vw = vh * (this.W / this.H)
    const targetW = vw * (this.W < 700 ? LOCKUP_FRACTION_MOBILE : LOCKUP_FRACTION_DESKTOP)

    // size the type so "GENERIC." spans targetW
    const probe = new TextGeometry('GENERIC.', { font: this.fonts.bold, size: 1, depth: 0.001, bevelEnabled: false })
    probe.computeBoundingBox()
    const w1 = probe.boundingBox!.max.x - probe.boundingBox!.min.x
    probe.dispose()
    const size = targetW / w1
    const depth = size * LETTER_DEPTH
    const bevel = size * 0.018

    const geo = new TextGeometry('GENERIC.', {
      font: this.fonts.bold,
      size,
      depth,
      curveSegments: 5,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
    })
    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    const halfW = (bb.max.x - bb.min.x) / 2
    const halfH = (bb.max.y - bb.min.y) / 2

    // lockup centre -> origin; extrusion runs z 0..depth so the back sits on the panel
    geo.translate(-(bb.max.x + bb.min.x) / 2, -(bb.max.y + bb.min.y) / 2, 0)

    const [gl, gr] = this.bisect(geo)
    geo.dispose()

    const yOff = vh * 0.03
    const zOff = 0.015
    const meshL = new THREE.Mesh(gl, this.letterMat)
    meshL.position.set(vw / 2, yOff, zOff)
    this.lettersL.add(meshL)
    const meshR = new THREE.Mesh(gr, this.letterMat)
    meshR.position.set(-vw / 2, yOff, zOff)
    this.lettersR.add(meshR)

    // "We are" — italic, just above the G, entirely on the left leaf
    const weSize = size * 0.165
    const weGeo = new TextGeometry('We are', {
      font: this.fonts.italic,
      size: weSize,
      depth: weSize * 0.16,
      curveSegments: 4,
      bevelEnabled: true,
      bevelThickness: weSize * 0.03,
      bevelSize: weSize * 0.03,
      bevelSegments: 1,
    })
    weGeo.computeBoundingBox()
    const wb = weGeo.boundingBox!
    weGeo.translate(-wb.min.x, -wb.min.y, 0)
    const we = new THREE.Mesh(weGeo, this.letterMat)
    we.position.set(vw / 2 - halfW + size * 0.03, yOff + halfH + size * 0.06, zOff)
    this.lettersL.add(we)

    // tagline — 'free' mode: on the cube's BACK face (the one that faces the
    // camera at the 147° cap). 'cap' mode: on the inner/seam face (shows at 90°).
    const cs = this.cubeSide
    const cxL = cs / 2 - vw * 0.006 // left cube centre offset inside its hinge (matches buildLeaf)
    const tagW = cs * 0.7
    const makeTag = (text: string): THREE.Mesh => {
      const pr = new TextGeometry(text, { font: this.fonts!.italic, size: 1, depth: 0.001, bevelEnabled: false })
      pr.computeBoundingBox()
      const s = tagW / (pr.boundingBox!.max.x - pr.boundingBox!.min.x)
      pr.dispose()
      const g = new TextGeometry(text, {
        font: this.fonts!.italic,
        size: s,
        depth: s * 0.14,
        curveSegments: 4,
        bevelEnabled: true,
        bevelThickness: s * 0.02,
        bevelSize: s * 0.02,
        bevelSegments: 1,
      })
      g.computeBoundingBox()
      const gb = g.boundingBox!
      g.translate(-(gb.max.x + gb.min.x) / 2, -(gb.max.y + gb.min.y) / 2, 0)
      return new THREE.Mesh(g, this.letterMat)
    }

    const tagL = makeTag('We do things')
    const tagR = makeTag('for people.')
    if (this.spinMode === 'free') {
      // left cube: on its -x (outer) face, facing -x, just outside it.
      tagL.material = this.tagMatL // self-contained, same key/gate as the face, darker albedo
      tagL.rotation.y = -Math.PI / 2
      tagL.position.set(cxL - cs / 2 - 0.05, yOff, -cs / 2)
      tagL.layers.set(1)
      // right cube: mirror — on its +x (outer) face
      tagR.material = this.tagMatR
      tagR.rotation.y = Math.PI / 2
      tagR.position.set(-(cxL - cs / 2 - 0.05), yOff, -cs / 2)
      tagR.layers.set(2)
    } else {
      tagL.rotation.y = Math.PI / 2 // inner (seam) face
      tagL.position.set(vw / 2 - 0.02, yOff, -cs / 2)
      tagR.rotation.y = -Math.PI / 2
      tagR.position.set(-vw / 2 + 0.02, yOff, -cs / 2)
    }
    this.lettersL.add(tagL)
    this.lettersR.add(tagR)
  }

  // ---- sizing ------------------------------------------------------
  /** device-pixel size of the visible frame (canvas minus the hidden overscan) */
  private bufSize(): [number, number] {
    return [Math.max(2, Math.round(this.W * this.dpr)), Math.max(2, Math.round(this.H * this.dpr))]
  }

  private clearTargets(): void {
    const prev = this.renderer.getClearColor(new THREE.Color()).getHex()
    this.renderer.setClearColor(0x000000, 1)
    for (const rt of [this.rtA, this.rtB]) {
      this.renderer.setRenderTarget(rt)
      this.renderer.clear()
    }
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(prev, 1)
  }

  // ---- loop -------------------------------------------------------
  private frame = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05)

    this.pointer.lerp(this.target, 0.35)
    this.active += ((this.hasFocus() ? 1 : 0) - this.active) * 0.12

    // heat field pass
    this.fieldMat.uniforms.uPrev.value = this.rtA.texture
    this.fieldMat.uniforms.uPointer.value.copy(this.pointer)
    this.fieldMat.uniforms.uPrevPointer.value.copy(this.prevPointer)
    this.fieldMat.uniforms.uAspect.value = this.W / this.H
    this.fieldMat.uniforms.uDown.value = this.down
    this.fieldMat.uniforms.uActive.value = this.active
    this.renderer.setRenderTarget(this.rtB)
    this.renderer.render(this.fieldScene, this.camera)
    const swap = this.rtA
    this.rtA = this.rtB
    this.rtB = swap

    // ground -> heroRT, mapped onto the door leaves. Off-white at rest, morphs to
    // concrete over the first stretch of scroll.
    this.heroMat.uniforms.uTexMix.value = THREE.MathUtils.smoothstep(this.progress, 0.02, 0.28)
    this.renderer.setRenderTarget(this.heroRT)
    this.renderer.render(this.heroScene, this.camera)
    this.renderer.setRenderTarget(null)

    // the instant the user starts scrolling, the pile is sucked off the sides —
    // and the doors don't begin to move until it's gone
    this.crumbs.setSuction(this.progressTarget > 0.01)

    // doors — held shut while the crumbs are still evacuating
    if (this.crumbs.clear) {
      this.progress += (this.progressTarget - this.progress) * (1 - Math.pow(0.003, dt))
    }
    const P = this.progress
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(this.doorCam.fov / 2))
    const vw = vh * (this.W / this.H)

    const fly = THREE.MathUtils.clamp((P - 0.3) / 0.7, 0, 1)
    const f = fly * fly // gentle ease-in — no lurch when they launch (cap mode)

    // free mode: one shared curve drives the rotation AND the recede, so the cubes
    // turn and pull back together from the first frame (not spin-then-slide). Reaches
    // 1 at FREEZE_P (the SPIN_CAP / frozen frame), smootherstep so it eases to a stop.
    const du = THREE.MathUtils.clamp(P / FREEZE_P, 0, 1)
    const doorE = du * du * du * (du * (du * 6 - 15) + 10)

    const fwd = this.spinMode === 'free' ? -doorE * 9 : -f * 13
    // 'free' mode: NO inward drift — it made the two halves of the split wordmark
    // (and the two cube faces) converge and overlap at the seam as the scroll began.
    // Perspective shrink alone keeps the receding cubes framed.
    const xPull = this.spinMode === 'free' ? 1 : 1 - f * 0.3

    this.letterMat.uniforms.uField.value = this.rtA.texture
    this.letterMat.uniforms.uOpen.value = Math.min(1, P * 2.5)

    if (this.spinMode === 'free') {
      // rotation rides the same curve as the recede (doorE) and decelerates into
      // SPIN_CAP at FREEZE_P instead of slamming into it
      const spin = SPIN_CAP * doorE
      this.leftHinge.rotation.y = spin
      this.rightHinge.rotation.y = -spin
      // feed each tagline text material the world normal of the flat face it gates
      // on (left: -x rotated; right: +x rotated the other way)
      const cs = Math.cos(spin)
      const sn = Math.sin(spin)
      this.tagMatL.uniforms.uFaceN.value.set(-cs, 0, sn)
      this.tagMatR.uniforms.uFaceN.value.set(cs, 0, sn)
      // light/shadow play, tied to the rotation: GENERIC drops into full shadow FAST
      // and is completely dark well before the tagline (+ its text) comes up slowly,
      // so the two are never legible at once
      const deg = (spin * 180) / Math.PI
      const dark = THREE.MathUtils.smoothstep(deg, 52, 70)
      const bright = THREE.MathUtils.smoothstep(deg, 80, 122)
      this.doorMat.uniforms.uPhase.value = dark
      this.doorMat.uniforms.uPhaseB.value = bright
      this.letterMat.uniforms.uPhase.value = dark
      this.tagMatL.uniforms.uReveal.value = bright
      this.tagMatR.uniforms.uReveal.value = bright
    } else {
      // rotate exactly 90° — front face swings away, the inner (tagline) face
      // comes fully round to the camera — then stop turning
      const rotP = THREE.MathUtils.clamp(P / 0.4, 0, 1)
      const spin = (Math.PI / 2) * (rotP * rotP * (3 - 2 * rotP))
      this.leftHinge.rotation.y = -spin
      this.rightHinge.rotation.y = spin
    }
    this.leftHinge.position.set((-vw / 2) * xPull, 0, fwd)
    this.rightHinge.position.set((vw / 2) * xPull, 0, fwd)

    if (this.spinMode === 'free') {
      // once the cubes lock (FREEZE_P) the camera eases forward toward them — the
      // approved shot that lets you take in the revealed tagline up close (settles
      // ~z -4 by 90% scroll) — then in the last stretch it PUNCHES through the gap
      // into the tunnel.
      const d1 = THREE.MathUtils.clamp((P - FREEZE_P) / (0.9 - FREEZE_P), 0, 1)
      const d2 = THREE.MathUtils.clamp((P - 0.9) / 0.1, 0, 1)
      const camZ = THREE.MathUtils.lerp(DOOR_CAM_Z, -4, d1 * (2 - d1)) + Math.pow(d2, 2.2) * (CAM_DIVE_END + 4)
      this.doorCam.position.z = camZ
      this._look.set(0, 0, camZ - 10) // always straight ahead
      this.doorCam.lookAt(this._look)

      this.stepGallery(dt, P, camZ)
    } else {
      // cap mode: camera holds while the doors open, then eases in on the same curve
      this.doorCam.position.z = THREE.MathUtils.lerp(DOOR_CAM_Z, -1, f)
      this._look.set(0, THREE.MathUtils.lerp(0, -0.15, f), THREE.MathUtils.lerp(0, -12, f))
      this.doorCam.lookAt(this._look)
    }

    this.crumbs.step(dt)

    this.renderer.render(this.doorScene, this.doorCam)

    this.prevPointer.copy(this.pointer)
  }

  /** advance the photo tunnel — Floema's model: warp burst -> idle drift, + a scroll
   *  boost, recycle past the camera, THREE.Fog does the fade */
  private stepGallery(dt: number, P: number, camZ: number): void {
    if (P < TUNNEL_ARM_P) {
      this.tunnelTime = -1 // parked behind the fog, invisible
      this.tunnelScroll = 0
      return
    }
    if (this.tunnelTime < 0) this.tunnelTime = 0
    this.tunnelTime += dt
    this.tunnelScroll = Math.max(0, this.tunnelScroll - dt * 0.55) // coasts back to idle

    const expo = (x: number): number => (x >= 1 ? 1 : 1 - 2 ** (-6 * x))
    const warp = expo(THREE.MathUtils.clamp(this.tunnelTime / TUNNEL_WARP_TIME, 0, 1))
    const speed =
      THREE.MathUtils.lerp(TUNNEL_SPEED_WARP, TUNNEL_SPEED_IDLE, warp) + expo(this.tunnelScroll) * TUNNEL_SCROLL_BOOST

    let backZ = Infinity
    for (const m of this.galleryPhotos) if (m.position.z < backZ) backZ = m.position.z
    for (const m of this.galleryPhotos) {
      m.position.z += speed * dt
      if (m.position.z > camZ) {
        m.position.z = backZ - TUNNEL_SPACING // recycle to just behind the furthest one
        backZ = m.position.z
      }
    }
  }

  private hasFocus(): boolean {
    return this.active > 0.001 || this.pointerInside
  }

  // ---- events --------------------------------------------------
  private onPointerMove = (e: PointerEvent): void => {
    this.target.set(e.clientX / this.W, 1 - e.clientY / this.H)
    this.pointerInside = true
    this.active = Math.max(this.active, 0.02)
  }

  private onPointerDown = (): void => {
    this.down = 1
  }

  private onPointerUp = (): void => {
    this.down = 0
  }

  private onLeave = (): void => {
    this.pointerInside = false
  }

  /** scroll is inert until the cookie banner is answered */
  private locked = true

  /** called by the cookie banner once the visitor picks cookies or crackers */
  unlock(): void {
    this.locked = false
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.locked) return
    if (this.spinMode === 'free' && this.manual >= 1) {
      // hero scroll is spent — the wheel now boosts the tunnel speed (never reverses)
      this.tunnelScroll = THREE.MathUtils.clamp(this.tunnelScroll + e.deltaY * 0.0011, 0, 1)
      return
    }
    this.manual = THREE.MathUtils.clamp(this.manual + e.deltaY / 2600, 0, 1)
    this.progressTarget = this.manual
  }

  private onScroll = (): void => {
    if (this.locked) return
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    this.progressTarget = THREE.MathUtils.clamp(Math.max(window.scrollY / max, this.manual), 0, 1)
  }

  private onKey = (e: KeyboardEvent): void => {
    if (this.locked) return
    const step: Record<string, number> = { ArrowDown: 0.07, PageDown: 0.22, ' ': 0.22, ArrowUp: -0.07, PageUp: -0.22 }
    const s = step[e.key]
    if (s === undefined) return
    if (this.spinMode === 'free' && this.manual >= 1) {
      this.tunnelScroll = THREE.MathUtils.clamp(this.tunnelScroll + s * 1.6, 0, 1)
      return
    }
    this.manual = THREE.MathUtils.clamp(this.manual + s, 0, 1)
    this.progressTarget = this.manual
  }

  private onResize = (): void => {
    const box = this.canvas.getBoundingClientRect()
    const w = Math.max(1, box.width)
    const h = Math.max(1, box.height - OVERSCAN)
    if (Math.abs(w - this.W) < 0.5 && Math.abs(h - this.H) < 0.5) return
    this.W = w
    this.H = h
    this.dpr = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(box.width, box.height, false)
    this.renderer.setViewport(0, 0, this.W, this.H)
    const [bw, bh] = this.bufSize()
    this.rtA.setSize(Math.max(2, Math.round(bw / 2)), Math.max(2, Math.round(bh / 2)))
    this.rtB.setSize(Math.max(2, Math.round(bw / 2)), Math.max(2, Math.round(bh / 2)))
    this.heroRT.setSize(bw, bh)
    this.clearTargets()
    this.heroMat.uniforms.uResolution.value.set(bw, bh)
    this.heroMat.uniforms.uViewAspect.value = bw / bh
    this.doorCam.aspect = this.W / this.H
    this.doorCam.updateProjectionMatrix()
    this.buildDoors()
    this.layoutLetters()
    this.crumbs.layout(this.W / this.H)
  }
}
