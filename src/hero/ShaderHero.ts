import * as THREE from 'three'
import { TTFLoader } from 'three/examples/jsm/loaders/TTFLoader.js'
import { Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import fullscreenVert from './shaders/fullscreen.vert'
import fieldFrag from './shaders/field.frag'
import paperFrag from './shaders/paper.frag'
import galaxyFrag from './shaders/galaxy.frag'
import beyondFrag from './shaders/beyond.frag'
import { CrumbRain, CRUMB_VIEW_H } from '../ui/CrumbRain'

const LOCKUP_FRACTION_DESKTOP = 0.82
const LOCKUP_FRACTION_MOBILE = 0.92

/** CSS px the canvas extends above the viewport (must match `#stage { top }` in hero.css).
 *  Chrome offsets the WebGL surface a few px down from the element box on this
 *  machine; the dirty edge lands in this clipped-away overscan instead of on screen. */
const OVERSCAN = 100

/** distance from the door camera to the closed doors (z = 0) */
const DOOR_CAM_Z = 4
/** the door camera's resting field of view — frustum maths use this, not the live
 *  `doorCam.fov`, which the wormhole widens at runtime */
const DOOR_FOV = 50
/** z of the crumb pile — in front of the closed doors, so the camera leaves it behind */
const CRUMB_Z = 2.4
/** extrusion depth of the sign letters, as a fraction of cap height */
const LETTER_DEPTH = 0.17
/** how far the door-cubes rotate before freezing (radians). 2.129 = 122° */
const SPIN_CAP = 2.129
/** scroll fraction at which the rotation + recede freeze and the camera starts its
 *  forward dive */
const FREEZE_P = 0.61
/** where the camera ends its dive — punched fully past the frozen cubes */
const CAM_DIVE_END = -17
/** section 2 — the photo tunnel behind the doors (Floema's recipe) */
const TUNNEL_ARM_P = 0.99 // turns on once the camera has punched fully past the cubes
const TUNNEL_REVEAL_P = 0.55 // photos start appearing one at a time just before the zoom-in
const TUNNEL_STAGGER = 0.085 // seconds between each photo's fade-in (random order)
const TUNNEL_RADIUS = 10 // photos ride a circle of this radius around the forward axis
const TUNNEL_SPACING = 1.4 // z-gap between photos
const TUNNEL_FOG_FAR = 78 // photos dissolve into the dark by this distance (tunnel running)
const TUNNEL_FOG_INTRO = 210 // fog pushed back during the one-by-one reveal so it reads
const TUNNEL_PLANES = 72 // enough to fill the corridor + a buffer — denser, so it doesn't feel sparse at high speed
const TUNNEL_IMG_SIZE = 1.5
const TUNNEL_SCALE_RAND = 0.5
const TUNNEL_SPEED_WARP = 240 // units/sec burst the instant the tunnel arms
const TUNNEL_SPEED_IDLE = 10 // baseline drift once the burst settles
const TUNNEL_WARP_TIME = 1.1 // seconds to ease from warp -> idle
const TUNNEL_SCROLL_BOOST = 60 // extra units/sec per unit of accumulated scroll input

/** section 2 — the wormhole. Sustained fast scrolling inside the armed tunnel
 *  builds a charge; easing off bleeds it away fast (but not instantly — a 0.5s
 *  pause costs real ground). This first stretch — up to WORM_STREAK_ON, where the
 *  hyperspace streaks take over — is the hard, scroll-driven part. Past that it's
 *  WORM_AUTO_TIME of automatic charging: the streaks appearing IS the promise that
 *  you've earned the rest of the ride, so scroll stops being required. Hold it
 *  pinned at full and it locks: from there the fall itself is also automatic. */
const WARP_SCROLL_THRESH = 0.9 // tunnelScroll above this counts as "scrolling hard" — reachable by a mouse wheel's fewer, larger notches, not just a trackpad's fast stream
const WARP_CHARGE_TIME = 2.6 // seconds of hard scroll to fill the charge from empty, at full commitment
const WARP_DISCHARGE_TIME = 0.9 // seconds to bleed a full charge back to empty when you ease off
const WARP_HOLD_TIME = 0.6 // seconds pinned at full charge before the wormhole locks
const WARP_CHARGE_SPEED = 780 // extra tunnel units/sec at full charge — the rush as it forms
const WORM_AUTO_TIME = 3.5 // seconds to auto-finish the charge once the streaks appear
// "commitment" — charging rewards several distinct scroll pushes, not one powerful
// held scroll. A gap of WORM_GESTURE_GAP since the last wheel input starts counting
// the next one as a NEW push; one continuous scroll (any length, any speed) only
// ever counts as a single push and charges at WORM_GESTURE_FLOOR speed.
const WORM_GESTURE_GAP = 0.15 // seconds of quiet that starts a new push
const WORM_GESTURE_DECAY = 2.4 // seconds for one counted push to fade away
const WORM_GESTURE_NEEDED = 10 // distinct recent pushes for full-speed charging
const WORM_GESTURE_FLOOR = 0.12 // charging speed with only a single continuous push
const WARP_FOV_GAIN = 14 // degrees the camera fov widens at full charge
const WORMHOLE_DURATION = 3.4 // seconds of automatic fall through the throat once it locks
const WORMHOLE_SPEED = 650 // photo-suck rush speed during the fall
const WORM_DIST_FAR = 95 // how far ahead the vortex sits at charge 0 — a small speck
const WORM_DIST_NEAR = 7 // how close it comes at full charge — about to swallow the view
const WORM_SCALE_FAR = 4
const WORM_SCALE_NEAR = 8
const WORM_TILT = 0.34 // radians the disc leans back — the near-face-on 3D read of the ref
const WORM_SPIN_BASE = 0.06 // rad/sec the galaxy turns at rest
const WORM_RT_SIZE = 1024 // baked galaxy texture resolution
// the chapter tunnel — what's beyond the wormhole (placeholder destination, TBD).
// One tube, one shader, four looks crossfading in sequence: dark faceted metal,
// green digital grid, purple fractal energy, red fractal energy. Fully automatic.
// The tube is a real winding path (TubeGeometry along a closed, wavy curve) that
// the camera actually travels — a straight tube centred on the camera looks dead
// ahead into a black hole (no wall lies exactly on the view axis) and can't be
// sinuous either; a real curved path fixes both at once.
const BEYOND_TUBE_R = 5 // tube radius
const BEYOND_BASE_R = 110 // the loop's base radius — big, so the curl doesn't read as an obvious circle, and long enough that a fast camera doesn't lap it mid-ride
const BEYOND_SEGMENTS = 500 // tubular segments along the curve
const BEYOND_SPEED = 55 // units/sec the camera travels along the path
const TUNNEL_CH_COUNT = 4
const TUNNEL_CH_DURATION = 3.0 // seconds per chapter
const TUNNEL_CH_BLEND = 0.9 // seconds of crossfade into the next chapter, at the end of each
// the hyperspace streak field (below) fades in across this charge window, so it
// takes over right as the photos are dissolving out
const WORM_STREAK_ON = 0.42
const WORM_STREAK_OFF = 0.30
// the hyperspace streak field — hundreds of tiny dashes scattered around the
// forward axis (NOT the photo ring), each length driven by its own radius (far
// off-axis = longer streak, near-centre = a short dash) and by speed
const WORM_STREAK_COUNT = 900
const WORM_STREAK_RAD_MIN = 0.5
const WORM_STREAK_RAD_MAX = 17
const WORM_STREAK_RANGE = 130 // z depth each dash recycles across
const WORM_STREAK_WIDTH = 0.028
const WORM_STREAK_LEN_BASE = 0.05
const WORM_STREAK_LEN_RAD = 0.11 // extra length per world unit of radius
const WORM_STREAK_SPEED = 55 // base z advance, scaled up by charge/fall

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

  private progress = 0
  private progressTarget = 0
  private manual = 0

  // section 2 — the photo tunnel
  private gallery = new THREE.Group()
  private galleryPhotos: THREE.Mesh[] = []
  private streakTex?: THREE.CanvasTexture // plain thin light-dash texture, shared by the streak field
  private streakField?: THREE.InstancedMesh
  private streakMat?: THREE.MeshBasicMaterial
  private streakAngle?: Float32Array
  private streakRadius?: Float32Array
  private streakZ?: Float32Array
  private streakLen?: Float32Array
  private revealClock = -1 // seconds since the one-by-one reveal started (-1 = not started)
  private tunnelTime = -1 // seconds since the tunnel armed (-1 = not armed)
  private tunnelScroll = 0 // 0..1 scroll input, coasts back to 0 -> speed boost on top of idle
  // the wormhole
  private warpCharge = 0 // 0..1 — builds while scrolling hard, bleeds away fast when you ease off
  private warpHold = 0 // seconds pinned at full charge (locks the wormhole at WARP_HOLD_TIME)
  private wormPulses = 0 // decaying count of distinct recent scroll pushes (commitment, not power)
  private lastPulseTime = -1 // performance.now()/1000 of the last qualifying scroll input
  private wormAuto = false // latched once the streaks appear — charging finishes on its own from there
  private wormAutoStartCharge = 0 // raw warpCharge at the moment autopilot engaged
  private inWormhole = false // locked in — the ride is automatic from here, scroll ignored
  private wormholeTime = 0 // seconds since the wormhole locked
  private arrived = false // reached the other side (undefined for now — ends on black)
  private wormTube?: THREE.Mesh // the spinning vortex disc
  private wormTubeMat?: THREE.ShaderMaterial
  private wormRT?: THREE.WebGLRenderTarget // the procedural spiral-galaxy texture, baked once
  private wormSpin = 0 // accumulated disc rotation (radians)
  private wormFlash?: THREE.Mesh // full-view white plane for the arrival white-out
  private beyondTube?: THREE.Mesh // the chapter tunnel beyond the wormhole
  private beyondMat?: THREE.ShaderMaterial
  private beyondCurve?: THREE.CatmullRomCurve3 // the winding path the camera travels
  private beyondCurveLen = 1 // cached arc length
  private tunnelT = 0 // 0..1 progress along the path (wraps — the loop is closed)
  private inTunnel = false // past the wormhole — the chapter tunnel is running, fully automatic
  private tunnelSeqTime = 0 // seconds since the chapter tunnel started
  private tunnelEnded = false // one pass through all four chapters done — faded out, holding

  constructor(canvas: HTMLCanvasElement, opts: { crumbScale?: number } = {}) {
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
        uniform float uPhase;
        uniform float uPhaseB;
        varying vec2 vUv;
        varying float vKind;
        void main() {
          vec3 tex = texture2D(map, vUv).rgb;
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

    this.doorCam = new THREE.PerspectiveCamera(DOOR_FOV, this.W / this.H, 0.1, 200)
    this.doorCam.position.set(0, 0, DOOR_CAM_Z)
    this.leftHinge.add(this.lettersL)
    this.rightHinge.add(this.lettersR)
    this.doorScene.add(this.leftHinge, this.rightHinge)
    this.buildSpaceBehind()
    this.buildDoors()
    this.buildGallery()

    // the crumb pile — a scaled sub-world planted at CRUMB_Z, in front of the
    // closed doors. Scale maps the crumb ortho view (2·CRUMB_VIEW_H tall) exactly
    // onto the door frustum at that z, so at rest it reads like a screen overlay;
    // once the camera dollies past CRUMB_Z the pile is behind it, out of frame.
    this.crumbs = new CrumbRain({ parent: this.doorScene, crumbScale: opts.crumbScale })
    const k = ((DOOR_CAM_Z - CRUMB_Z) * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))) / CRUMB_VIEW_H
    this.crumbs.stage.position.z = CRUMB_Z
    this.crumbs.stage.scale.setScalar(k)
    this.crumbs.layout(this.W / this.H)

    this.clearTargets()
    this.bakeWormhole()
    this.buildBeyondTunnel()
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
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
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

    this.leftPanel.layers.set(1)
    this.rightPanel.layers.set(2)
    for (const p of [this.leftPanel, this.rightPanel]) {
      p.castShadow = true
      p.receiveShadow = true
    }
  }

  /** the space beyond the doors — the tunnel's fog IS the backdrop now */
  private buildSpaceBehind(): void {
    const glow = new THREE.PointLight(0xffe6c4, 20, 30)
    glow.position.set(0, 1.5, -9)
    this.doorScene.add(glow)

    // the two door-cubes are lit ONLY by the lights below — nothing else
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
   * TUNNEL_RADIUS around the forward axis, spread by the golden angle, SPACING apart
   * in z. Just before the zoom-in they fade in one at a time, deep in the distance
   * (fog pushed back so they read). Then, once the camera is past the cubes, the
   * tunnel arms: fog closes to TUNNEL_FOG_FAR, a warp burst eases to an idle drift
   * (+ scroll boost), and a plane that passes the camera recycles to the far end.
   */
  private buildGallery(): void {
    let seed = 0x9e37
    const rng = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0
      return seed / 0xffffffff
    }
    const golden = Math.PI * (3 - Math.sqrt(5))
    const geo = new THREE.PlaneGeometry(1, 1)
    // each photo appears in a shuffled order, not around-the-ring
    const order = Array.from({ length: TUNNEL_PLANES }, (_, i) => i)
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
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

    // shared dash texture for the hyperspace streak field below — a thin vertical
    // light bar, bright core fading to transparent at both ends and both sides
    const streakCnv = document.createElement('canvas')
    streakCnv.width = 48
    streakCnv.height = 512
    const sctx = streakCnv.getContext('2d')!
    const vgrad = sctx.createLinearGradient(0, 0, 0, 512)
    vgrad.addColorStop(0.0, 'rgba(200,215,255,0)')
    vgrad.addColorStop(0.4, 'rgba(215,228,255,0.85)')
    vgrad.addColorStop(0.5, 'rgba(255,255,255,1)')
    vgrad.addColorStop(0.6, 'rgba(215,228,255,0.85)')
    vgrad.addColorStop(1.0, 'rgba(200,215,255,0)')
    sctx.fillStyle = vgrad
    sctx.fillRect(0, 0, 48, 512)
    const hgrad = sctx.createLinearGradient(0, 0, 48, 0)
    hgrad.addColorStop(0.0, 'rgba(0,0,0,0)')
    hgrad.addColorStop(0.5, 'rgba(0,0,0,1)')
    hgrad.addColorStop(1.0, 'rgba(0,0,0,0)')
    sctx.globalCompositeOperation = 'destination-in'
    sctx.fillStyle = hgrad
    sctx.fillRect(0, 0, 48, 512)
    sctx.globalCompositeOperation = 'source-over'
    this.streakTex = new THREE.CanvasTexture(streakCnv)
    this.streakTex.colorSpace = THREE.SRGBColorSpace
    this.streakTex.generateMipmaps = false
    this.streakTex.minFilter = THREE.LinearFilter

    for (let i = 0; i < TUNNEL_PLANES; i++) {
      const tex = texes[i % NDISTINCT]
      const m = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }),
      )
      const a = i * golden
      m.userData.ang = a
      m.position.x = Math.cos(a) * TUNNEL_RADIUS
      m.position.y = Math.sin(a) * TUNNEL_RADIUS
      m.position.z = CAM_DIVE_END - 26 - i * TUNNEL_SPACING // scattered deep, but shallow enough to read
      m.userData.z0 = m.position.z
      m.userData.revealAt = order[i] * TUNNEL_STAGGER // seconds after the reveal clock starts
      const aspect = tex.image.width / tex.image.height
      const base = TUNNEL_IMG_SIZE + rng() * TUNNEL_SCALE_RAND
      if (aspect >= 1) m.scale.set(base * aspect, base, 1)
      else m.scale.set(base, base / aspect, 1)
      m.userData.s0 = m.scale.clone() // resting scale — the charge stretches them into streaks
      this.galleryPhotos.push(m)
      this.gallery.add(m)
    }

    // the hyperspace streak field — hundreds of tiny dashes scattered around the
    // axis (their own radii, not the photo ring), each a thin sliver of streakTex.
    // Length is driven by radius (far off-axis = long streak, near-centre = a dot)
    // and by speed, so it reads as real radial motion, not a uniform blur.
    this.streakAngle = new Float32Array(WORM_STREAK_COUNT)
    this.streakRadius = new Float32Array(WORM_STREAK_COUNT)
    this.streakZ = new Float32Array(WORM_STREAK_COUNT)
    this.streakLen = new Float32Array(WORM_STREAK_COUNT)
    for (let i = 0; i < WORM_STREAK_COUNT; i++) {
      this.streakAngle[i] = rng() * Math.PI * 2
      this.streakRadius[i] = WORM_STREAK_RAD_MIN + (WORM_STREAK_RAD_MAX - WORM_STREAK_RAD_MIN) * rng()
      this.streakZ[i] = CAM_DIVE_END - rng() * WORM_STREAK_RANGE
    }
    this.streakMat = new THREE.MeshBasicMaterial({
      map: this.streakTex,
      transparent: true,
      depthWrite: false,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    })
    this.streakField = new THREE.InstancedMesh(geo, this.streakMat, WORM_STREAK_COUNT)
    this.streakField.frustumCulled = false
    this.gallery.add(this.streakField)

    this.gallery.visible = false
    this.doorScene.add(this.gallery)
    this.doorScene.fog = new THREE.Fog(0x000000, 0.1, TUNNEL_FOG_INTRO)

    // the wormhole — a spiral-galaxy disc (procedurally baked in bakeWormhole()).
    // It's a tilted disc far down the corridor; sustained fast scroll grows it and
    // brings it closer (stepGallery), the disc spins about its own axis the whole
    // time, and once it fills the view the fall through the core goes automatic
    // (stepWormhole). Black space keyed out so a small/far disc doesn't occlude the
    // tunnel behind it.
    this.wormTubeMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMap: { value: this.wormRT ? this.wormRT.texture : null },
        uGrow: { value: 0 }, // 0..1 charge / approach
        uBloom: { value: 0 }, // 0..1 final white-out as you fall through the core
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D uMap;
        uniform float uGrow;
        uniform float uBloom;
        varying vec2 vUv;
        void main() {
          // zoom into the core as it energises / as you fall in
          vec2 uv = 0.5 + (vUv - 0.5) / (1.0 + uGrow * 0.25 + uBloom * 3.2);
          vec3 col = texture2D(uMap, uv).rgb * (1.0 + uGrow * 0.25);
          float luma = dot(col, vec3(0.299, 0.587, 0.114));
          float alpha = smoothstep(0.008, 0.10, luma); // key out the black surround

          col = mix(col, vec3(1.0), uBloom);
          alpha = max(alpha, uBloom);
          gl_FragColor = vec4(col, alpha);
        }`,
    })
    this.wormTube = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.wormTubeMat)
    this.wormTube.visible = false
    this.wormTube.frustumCulled = false
    this.doorScene.add(this.wormTube)

    this.wormFlash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }),
    )
    this.wormFlash.visible = false
    this.wormFlash.frustumCulled = false
    this.wormFlash.renderOrder = 999
    this.doorScene.add(this.wormFlash)
  }

  /**
   * Bake the wormhole's spiral-galaxy texture once. A procedural face-on galaxy —
   * two logarithmic-spiral arms, a dense star field biased to the arms and centre,
   * dark dust lanes, rose-pink HII knots, a hot bulge — rendered to wormRT. The
   * disc mesh just leans it back and spins it (like the reference model).
   */
  private bakeWormhole(): void {
    this.wormRT = new THREE.WebGLRenderTarget(WORM_RT_SIZE, WORM_RT_SIZE, {
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: true,
    })
    this.wormRT.texture.colorSpace = THREE.SRGBColorSpace

    const genMat = new THREE.ShaderMaterial({
      vertexShader: fullscreenVert,
      fragmentShader: galaxyFrag,
      depthTest: false,
      depthWrite: false,
    })
    const scene = new THREE.Scene()
    const mesh = new THREE.Mesh(this.quad, genMat)
    scene.add(mesh)

    const prev = this.renderer.getClearColor(new THREE.Color()).getHex()
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.setRenderTarget(this.wormRT)
    this.renderer.clear()
    this.renderer.render(scene, this.camera)
    this.renderer.setRenderTarget(null)
    this.renderer.setClearColor(prev, 1)

    scene.remove(mesh)
    genMat.dispose()
    if (this.wormTubeMat) this.wormTubeMat.uniforms.uMap.value = this.wormRT.texture
  }

  /**
   * The chapter tunnel beyond the wormhole (placeholder destination — TBD). A
   * real winding path — TubeGeometry along a closed, wavy CatmullRom loop — that
   * the camera actually travels (a straight tube centred on the camera looks
   * straight down a black hole with no wall on the view axis, and can't read as
   * sinuous either). The shader alone sells the chapter changes: four "looks"
   * crossfading on the very same surface (see beyond.frag) — one continuous
   * surface is what makes the transitions seamless.
   */
  private buildBeyondTunnel(): void {
    const pts: THREE.Vector3[] = []
    const N = 24
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      const r = BEYOND_BASE_R + 18 * Math.sin(a * 3.1 + 0.7) + 11 * Math.sin(a * 5.3 + 2.1)
      const y = 14 * Math.sin(a * 2.2 + 1.3) + 9 * Math.sin(a * 4.7 + 0.4)
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    this.beyondCurve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5)
    this.beyondCurveLen = this.beyondCurve.getLength()

    const geo = new THREE.TubeGeometry(this.beyondCurve, BEYOND_SEGMENTS, BEYOND_TUBE_R, 24, true)
    this.beyondMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        uTime: { value: 0 },
        uLookA: { value: 0 },
        uLookB: { value: 1 },
        uBlend: { value: 0 },
        uResolution: { value: new THREE.Vector2(...this.bufSize()) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: beyondFrag,
    })
    this.beyondTube = new THREE.Mesh(geo, this.beyondMat)
    this.beyondTube.visible = false
    this.beyondTube.frustumCulled = false
    this.doorScene.add(this.beyondTube)
  }

  /** the chapter tunnel: fully automatic, no scroll — the camera actually travels
   *  the winding tube (real curve, not an illusion), while the four looks
   *  crossfade in sequence on that one shared surface (see beyond.frag) */
  private stepTunnel(dt: number): void {
    const tube = this.beyondTube
    const mat = this.beyondMat
    const curve = this.beyondCurve
    if (!tube || !mat || !curve) return
    tube.visible = true

    this.tunnelSeqTime += dt
    const onePass = TUNNEL_CH_DURATION * TUNNEL_CH_COUNT
    const done = this.tunnelSeqTime >= onePass // one trip through all four, then it actually ends
    const t = Math.min(this.tunnelSeqTime, onePass - 0.001)
    const idx = Math.min(TUNNEL_CH_COUNT - 1, Math.floor(t / TUNNEL_CH_DURATION))
    const nextIdx = done ? idx : (idx + 1) % TUNNEL_CH_COUNT
    const localT = t - idx * TUNNEL_CH_DURATION
    const blendStart = TUNNEL_CH_DURATION - TUNNEL_CH_BLEND
    const blend = !done && localT > blendStart ? THREE.MathUtils.smoothstep(localT, blendStart, TUNNEL_CH_DURATION) : 0

    mat.uniforms.uLookA.value = idx
    mat.uniforms.uLookB.value = nextIdx
    mat.uniforms.uBlend.value = blend
    mat.uniforms.uTime.value += dt

    if (!done) {
      // travel the real curve — the winding is genuine geometry, not a texture
      // trick, so the camera always has a wall ahead of it (never a straight,
      // wall-less sightline down the axis) and actually turns with the path
      this.tunnelT = (this.tunnelT + (BEYOND_SPEED * dt) / this.beyondCurveLen) % 1
      const pos = curve.getPointAt(this.tunnelT)
      const ahead = curve.getPointAt((this.tunnelT + 0.006) % 1)
      this.doorCam.position.copy(pos)
      this.doorCam.up.set(0, 1, 0)
      this.doorCam.lookAt(ahead)
      return
    }

    // one pass done — it actually ends here (no infinite loop): fade to black and
    // hold. The other side, past this fade, hasn't been designed yet.
    const flash = this.wormFlash
    if (flash) {
      flash.visible = true
      ;(flash.material as THREE.MeshBasicMaterial).color.set(0x000000)
      flash.quaternion.copy(this.doorCam.quaternion)
      flash.position.set(this.doorCam.position.x, this.doorCam.position.y, this.doorCam.position.z - 0.5)
      const endT = this.tunnelSeqTime - onePass
      ;(flash.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(endT / 1.2, 0, 1)
      if (!this.tunnelEnded && endT >= 1.2) {
        this.tunnelEnded = true
        console.info('[hero] chapter tunnel: ended — other side TBD')
      }
    }
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

    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
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

    // tagline — on the cube's outer face, revealed once the cube has turned far enough
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

    // doors — held shut while the crumbs are still evacuating. Scroll made during
    // that wait must NOT bank: pin the target just past the suction threshold so it
    // can't accumulate; the hero only starts building once the crumbs are gone.
    if (!this.crumbs.clear) {
      this.manual = Math.min(this.manual, 0.02)
      this.progressTarget = this.manual
    } else {
      // gentle cinematic smoothing for normal scrolling; the further the target is
      // (scrolling hard) the faster it catches up, so a violent scroll rips through.
      const gap = this.progressTarget - this.progress
      const k = Math.min(1, (1 - Math.pow(0.003, dt)) + Math.min(0.55, Math.abs(gap) * 4))
      this.progress += gap * k
    }
    const P = this.progress
    const vh = 2 * DOOR_CAM_Z * Math.tan(THREE.MathUtils.degToRad(DOOR_FOV / 2))
    const vw = vh * (this.W / this.H)

    // one shared curve drives the rotation AND the recede, so the cubes turn and
    // pull back together from the first frame (not spin-then-slide). Reaches 1 at
    // FREEZE_P (the SPIN_CAP / frozen frame), smootherstep so it eases to a stop.
    const du = THREE.MathUtils.clamp(P / FREEZE_P, 0, 1)
    const doorE = du * du * du * (du * (du * 6 - 15) + 10)

    const fwd = -doorE * 9
    // NO inward drift — it made the two halves of the split wordmark (and the two
    // cube faces) converge and overlap at the seam as the scroll began. Perspective
    // shrink alone keeps the receding cubes framed.
    const xPull = 1

    this.letterMat.uniforms.uField.value = this.rtA.texture
    this.letterMat.uniforms.uOpen.value = Math.min(1, P * 2.5)

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

    this.leftHinge.position.set((-vw / 2) * xPull, 0, fwd)
    this.rightHinge.position.set((vw / 2) * xPull, 0, fwd)

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

    this.crumbs.step(dt)

    this.renderer.render(this.doorScene, this.doorCam)

    this.prevPointer.copy(this.pointer)
  }

  /** advance the photo tunnel: photos appear one at a time just before the zoom-in,
   *  then Floema's warp burst -> idle drift + a scroll-RATE speed boost + fog + recycle.
   *  Sustained fast scrolling here charges the wormhole (see stepWormhole). */
  private stepGallery(dt: number, P: number, camZ: number): void {
    if (this.inTunnel) {
      this.stepTunnel(dt)
      return
    }
    // photos start appearing just before the zoom-in; scrolling back drops them
    if (P < TUNNEL_REVEAL_P - 0.06) this.revealClock = -1
    else if (this.revealClock < 0) this.revealClock = 0
    else this.revealClock += dt

    this.gallery.visible = this.revealClock >= 0
    if (!this.gallery.visible) return

    const armed = P >= TUNNEL_ARM_P
    const fog = this.doorScene.fog as THREE.Fog

    // tunnelScroll is a decaying accumulator of scroll INPUT — 3 flicks/sec really is
    // ~3x faster than 1 flick/sec, and it's not capped at 1
    this.tunnelScroll = Math.max(0, this.tunnelScroll * Math.pow(0.1, dt) - dt * 0.6)

    // ---- wormhole charge -------------------------------------------------
    // scrolling hard and continuously (tunnelScroll over the threshold) fills
    // warpCharge; anything less bleeds it away over WARP_DISCHARGE_TIME — fast,
    // but a brief pause doesn't zero it. Pinned at full for WARP_HOLD_TIME it
    // locks and the ride goes automatic.
    this.wormPulses = Math.max(0, this.wormPulses - dt / WORM_GESTURE_DECAY)

    if (!this.inWormhole) {
      // once the charge has already reached WORM_STREAK_ON once (the streaks are
      // up), the hard part is over — it finishes on its own, scroll or not
      if (!this.wormAuto) {
        const ccNow = this.warpCharge * this.warpCharge * (3 - 2 * this.warpCharge)
        if (ccNow >= WORM_STREAK_ON) {
          this.wormAuto = true
          this.wormAutoStartCharge = this.warpCharge
          console.info('[hero] wormhole: streaks up — autopilot to the throat')
        }
      }
      if (this.wormAuto) {
        // no extra hold here — autopilot is already a deliberate, timed ramp (not
        // a fluke instant spike), so it locks the moment it reaches full charge
        // instead of sitting fully-close for another beat first
        this.warpCharge = Math.min(1, this.warpCharge + dt / WORM_AUTO_TIME)
        if (this.warpCharge >= 1) {
          this.inWormhole = true
          this.wormholeTime = 0
          console.info('[hero] wormhole: locked')
        }
      } else {
        if (armed && this.tunnelScroll > WARP_SCROLL_THRESH) {
          const power = 1 + (this.tunnelScroll - WARP_SCROLL_THRESH) * 0.35 // how hard, right now
          const frac = THREE.MathUtils.clamp((this.wormPulses - 1) / (WORM_GESTURE_NEEDED - 1), 0, 1)
          const commitment = THREE.MathUtils.lerp(WORM_GESTURE_FLOOR, 1, frac) // how many separate pushes
          const over = power * commitment
          this.warpCharge = Math.min(1, this.warpCharge + (dt / WARP_CHARGE_TIME) * over)
          this.warpHold = this.warpCharge >= 1 ? this.warpHold + dt : 0
        } else {
          this.warpCharge = Math.max(0, this.warpCharge - dt / WARP_DISCHARGE_TIME)
          this.warpHold = 0
        }
        if (this.warpHold >= WARP_HOLD_TIME) {
          this.inWormhole = true
          this.wormholeTime = 0
          console.info('[hero] wormhole: locked')
        }
      }
    }

    if (this.inWormhole) {
      this.stepWormhole(dt, camZ)
      return
    }

    // eased charge — drives every visible reaction, so the corridor springs
    // straight back the instant you ease off
    const c = this.warpCharge
    const cc = c * c * (3 - 2 * c)

    const fogTarget = armed ? THREE.MathUtils.lerp(TUNNEL_FOG_FAR, TUNNEL_FOG_FAR * 0.55, cc) : TUNNEL_FOG_INTRO
    fog.far += (fogTarget - fog.far) * (1 - Math.pow(0.02, dt))

    if (armed) {
      if (this.tunnelTime < 0) this.tunnelTime = 0
      this.tunnelTime += dt
      const expo = (x: number): number => (x >= 1 ? 1 : 1 - 2 ** (-6 * x))
      const warp = expo(THREE.MathUtils.clamp(this.tunnelTime / TUNNEL_WARP_TIME, 0, 1))
      const speed =
        THREE.MathUtils.lerp(TUNNEL_SPEED_WARP, TUNNEL_SPEED_IDLE, warp) +
        this.tunnelScroll * TUNNEL_SCROLL_BOOST +
        cc * WARP_CHARGE_SPEED
      let backZ = Infinity
      for (const m of this.galleryPhotos) if (m.position.z < backZ) backZ = m.position.z
      for (const m of this.galleryPhotos) {
        m.position.z += speed * dt
        if (m.position.z > camZ) {
          m.position.z = backZ - TUNNEL_SPACING
          backZ = m.position.z
        }
      }
    } else {
      this.tunnelTime = -1
    }

    // photos stretch gently and fade — radially, along their own direction from the
    // axis (not just "tall") — as the charge builds, dissolving into the dense
    // hyperspace streak field (stepStreaks) rather than becoming a big smeared bar
    for (const m of this.galleryPhotos) {
      const revealAt = m.userData.revealAt as number
      const mat = m.material as THREE.MeshBasicMaterial
      const reveal = THREE.MathUtils.smoothstep(this.revealClock, revealAt, revealAt + 0.4)
      // fully gone by WORM_STREAK_OFF, the moment the streaks start fading in — a
      // clean handoff, never both on screen at once
      mat.opacity = reveal * (1 - THREE.MathUtils.smoothstep(cc, 0.18, WORM_STREAK_OFF))
      if (!armed) m.position.z = m.userData.z0 as number
      const a = m.userData.ang as number
      m.position.x = Math.cos(a) * TUNNEL_RADIUS
      m.position.y = Math.sin(a) * TUNNEL_RADIUS
      m.rotation.z = a - Math.PI / 2 // "up" (the stretch axis) points radially outward
      const s0 = m.userData.s0 as THREE.Vector3
      m.scale.set(s0.x * (1 - cc * 0.5), s0.y * (1 + cc * 2.5), 1)
    }
    this.stepStreaks(dt, cc, camZ)

    // the vortex, far down the corridor: hidden at rest, and as the charge builds
    // it grows and comes closer — "vê um pequeno buraco de minhoca que vai crescendo
    // até chegar". At full charge it's about to swallow the view and the fall locks.
    const worm = this.wormTube!
    worm.visible = armed && cc > 0.004
    if (worm.visible) {
      this.wormSpin += dt * (WORM_SPIN_BASE + cc * 0.6) // spins faster as it energises
      // while it's still scroll-driven (manual), stay far — a single smooth curve,
      // no plateau-then-snap. Once autopilot takes over, switch to its OWN 0..1
      // progress (from the charge level at the moment it engaged, not the global
      // charge) eased evenly both ends, so the approach spends its whole automatic
      // stretch actually closing the gap instead of sitting far, then snapping
      // close, then idling right on top of it.
      let distT: number
      if (this.wormAuto) {
        const autoP = THREE.MathUtils.clamp(
          (this.warpCharge - this.wormAutoStartCharge) / (1 - this.wormAutoStartCharge),
          0,
          1,
        )
        distT = autoP * autoP * (3 - 2 * autoP)
      } else {
        distT = cc * cc * cc * cc * cc
      }
      this.placeWorm(
        camZ,
        THREE.MathUtils.lerp(WORM_DIST_FAR, WORM_DIST_NEAR, distT),
        THREE.MathUtils.lerp(WORM_SCALE_FAR, WORM_SCALE_NEAR, distT),
      )
      this.wormTubeMat!.uniforms.uGrow.value = cc
      this.wormTubeMat!.uniforms.uBloom.value = 0
    }

    this.setDoorFov(THREE.MathUtils.lerp(DOOR_FOV, DOOR_FOV + WARP_FOV_GAIN, cc))
  }

  /** the hyperspace streak field: hundreds of small dashes at their own radii,
   *  each advancing along z and recycling independently. Fades in across the
   *  WORM_STREAK_OFF..ON window as the charge builds, full strength during the
   *  fall (cc === 1 from stepWormhole). */
  private stepStreaks(dt: number, cc: number, camZ: number): void {
    const field = this.streakField
    const angle = this.streakAngle
    const radius = this.streakRadius
    const z = this.streakZ
    const len = this.streakLen
    if (!field || !angle || !radius || !z || !len) return

    const opacity = THREE.MathUtils.smoothstep(cc, WORM_STREAK_OFF, WORM_STREAK_ON)
    this.streakMat!.opacity = opacity
    field.visible = opacity > 0.003
    if (!field.visible) return

    const speed = WORM_STREAK_SPEED * (0.4 + cc * 2.6)
    const dummy = new THREE.Object3D()
    for (let i = 0; i < WORM_STREAK_COUNT; i++) {
      z[i] += speed * dt
      if (z[i] > camZ) z[i] -= WORM_STREAK_RANGE
      len[i] = WORM_STREAK_LEN_BASE + radius[i] * WORM_STREAK_LEN_RAD * (0.3 + cc * 1.4)
      dummy.position.set(Math.cos(angle[i]) * radius[i], Math.sin(angle[i]) * radius[i], z[i])
      dummy.rotation.set(0, 0, angle[i] - Math.PI / 2)
      dummy.scale.set(WORM_STREAK_WIDTH, len[i], 1)
      dummy.updateMatrix()
      field.setMatrixAt(i, dummy.matrix)
    }
    field.instanceMatrix.needsUpdate = true
  }

  /** sit the galaxy disc `dist` ahead of the camera, leaning back by WORM_TILT and
   *  spun to wormSpin about its own axis (the reference model's "Plane rotating") */
  private placeWorm(camZ: number, dist: number, scale: number): void {
    const w = this.wormTube!
    w.position.set(this.doorCam.position.x, this.doorCam.position.y, camZ - dist)
    w.rotation.set(WORM_TILT, 0, this.wormSpin)
    w.scale.setScalar(scale)
  }

  /** the automatic fall through the throat, once the vortex has grown to fill the
   *  view. Scroll is ignored: the vortex rushes the last of the way in and blooms
   *  to white while the photos are pulled into the centre, then it's the other
   *  side — undefined for now, so it holds on black. */
  private stepWormhole(dt: number, camZ: number): void {
    this.wormholeTime += dt
    const t = this.wormholeTime
    const fog = this.doorScene.fog as THREE.Fog
    const worm = this.wormTube!
    const flash = this.wormFlash!

    fog.far += (400 - fog.far) * (1 - Math.pow(0.02, dt)) // let the void open right up

    // disorienting roll as you go through (set before anything copies the camera orientation)
    this.doorCam.rotation.z = Math.sin(t * 1.1) * 0.18 + t * 0.35
    this.setDoorFov(DOOR_FOV + WARP_FOV_GAIN)

    // the disc closes the last of the distance, spins up and blooms
    const k = THREE.MathUtils.smoothstep(t, 0, WORMHOLE_DURATION)
    worm.visible = t < WORMHOLE_DURATION - 0.1
    if (worm.visible) {
      this.wormSpin += dt * (1.4 + k * 5.0)
      this.placeWorm(camZ, THREE.MathUtils.lerp(WORM_DIST_NEAR, 1.2, k * k), THREE.MathUtils.lerp(WORM_SCALE_NEAR, WORM_SCALE_NEAR * 2.6, k))
      const mat = this.wormTubeMat!
      mat.uniforms.uGrow.value = 1
      mat.uniforms.uBloom.value = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 1.6, WORMHOLE_DURATION - 0.3)
    } else if (this.gallery.visible) {
      this.gallery.visible = false
    }

    // photos pulled into the centre and gone — the hyperspace streak field (below)
    // is the only thing selling speed by now, photos are already invisible
    const suck = THREE.MathUtils.smoothstep(t, 0, 1.1)
    for (const m of this.galleryPhotos) {
      const a = (m.userData.ang as number) + dt * (2 + suck * 7)
      m.userData.ang = a
      const r = TUNNEL_RADIUS * (1 - suck) * (1 - suck)
      m.position.x = Math.cos(a) * r
      m.position.y = Math.sin(a) * r
      m.position.z += (200 + suck * WORMHOLE_SPEED * 2) * dt
      m.rotation.z = a - Math.PI / 2
      ;(m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - suck * 1.3)
    }
    this.stepStreaks(dt, 1, camZ)

    // hard white at the peak of the bloom, then fall away into the chapter tunnel
    flash.visible = true
    flash.quaternion.copy(this.doorCam.quaternion)
    flash.position.set(this.doorCam.position.x, this.doorCam.position.y, this.doorCam.position.z - 0.5)
    const up = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 0.7, WORMHOLE_DURATION - 0.15)
    const down = THREE.MathUtils.smoothstep(t, WORMHOLE_DURATION - 0.05, WORMHOLE_DURATION + 0.9)
    ;(flash.material as THREE.MeshBasicMaterial).opacity = Math.max(0, up - down)

    if (t >= WORMHOLE_DURATION + 0.9) {
      flash.visible = false
      if (!this.arrived) {
        this.arrived = true
        this.inTunnel = true
        this.tunnelSeqTime = 0
        this.gallery.visible = false
        console.info('[hero] wormhole: arrived — entering the chapter tunnel')
      }
    }
  }

  private setDoorFov(fov: number): void {
    if (Math.abs(this.doorCam.fov - fov) < 0.05) return
    this.doorCam.fov = fov
    this.doorCam.updateProjectionMatrix()
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

  /** counts a scroll "push" toward the wormhole charge — a gap of WORM_GESTURE_GAP
   *  since the last qualifying input means this is a NEW push, not a continuation
   *  of the same scroll. One long scroll only ever counts as a single push, however
   *  fast or long it runs. Uses wall-clock time — never the render clock, which
   *  frame() alone is allowed to advance. */
  private notePulse(): void {
    const now = performance.now() / 1000
    if (this.lastPulseTime < 0 || now - this.lastPulseTime > WORM_GESTURE_GAP) {
      this.wormPulses = Math.min(WORM_GESTURE_NEEDED + 2, this.wormPulses + 1)
    }
    this.lastPulseTime = now
  }

  private onWheel = (e: WheelEvent): void => {
    if (this.locked || this.inWormhole) return
    if (this.manual >= 1) {
      // hero scroll is spent — every flick (either direction) feeds the tunnel speed
      // AND charges the wormhole; decays fast, so the RATE of flicking sets both.
      this.tunnelScroll = Math.min(6, this.tunnelScroll + Math.abs(e.deltaY) * 0.0016)
      if (Math.abs(e.deltaY) > 4) this.notePulse()
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
    if (this.locked || this.inWormhole) return
    const step: Record<string, number> = { ArrowDown: 0.07, PageDown: 0.22, ' ': 0.22, ArrowUp: -0.07, PageUp: -0.22 }
    const s = step[e.key]
    if (s === undefined) return
    if (this.manual >= 1) {
      this.tunnelScroll = Math.min(6, this.tunnelScroll + Math.abs(s) * 3)
      this.notePulse()
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
    this.beyondMat?.uniforms.uResolution.value.set(bw, bh)
    this.doorCam.aspect = this.W / this.H
    this.doorCam.updateProjectionMatrix()
    this.buildDoors()
    this.layoutLetters()
    this.crumbs.layout(this.W / this.H)
  }
}
