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
  // the cube's non-front faces — concrete grey so the tumble reads as a solid box
  private blockMat = new THREE.MeshStandardMaterial({ color: 0x6b665b, roughness: 0.85 })
  // 'free' mode tagline text — dark sign material, own instance so it can be tuned
  private tagMat = new THREE.MeshStandardMaterial({ color: 0x121214, roughness: 0.62, metalness: 0 })
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
      uniforms: { map: { value: this.heroRT.texture } },
      vertexShader: `
        precision highp float;
        uniform mat4 projectionMatrix;
        uniform mat4 modelViewMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(map, vUv);
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
      },
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

    // paper (heroRT) with baked UVs on the front face; concrete on the other five
    const bakeFront = (g: THREE.BufferGeometry, faceX: number): void => {
      const pos = g.attributes.position
      const uv = g.attributes.uv
      for (let i = 0; i < pos.count; i++) {
        if (pos.getZ(i) < -1e-4) continue // front face only (translated to z = 0)
        const worldX = faceX + pos.getX(i)
        const worldY = pos.getY(i)
        uv.setXY(i, (worldX + vw / 2) / vw, (worldY + vh / 2) / vh)
      }
      uv.needsUpdate = true
    }
    // BoxGeometry group order: +x, -x, +y, -y, +z(front), -z. At the 147° cap the
    // OUTER face shows: -x on the left cube, +x on the right — that's where the tagline goes.
    const mats = [this.blockMat, this.blockMat, this.blockMat, this.blockMat, this.doorMat, this.blockMat]

    // dir -1 = left cube (its inner/right edge at the seam x=0), +1 = right cube
    const buildLeaf = (hinge: THREE.Group, dir: -1 | 1): THREE.Mesh => {
      hinge.position.set((dir * vw) / 2, 0, 0)
      hinge.rotation.set(0, 0, 0)
      const cx = -dir * (S / 2 - over) // cube centre so the seam edge lands on x = 0
      const g = new THREE.BoxGeometry(S, S, S)
      g.translate(0, 0, -S / 2) // front face -> local z = 0
      bakeFront(g, (dir * vw) / 2 + cx)
      const mesh = new THREE.Mesh(g, mats)
      mesh.position.x = cx
      hinge.add(mesh)
      return mesh
    }

    this.leftPanel = buildLeaf(this.leftHinge, -1)
    this.rightPanel = buildLeaf(this.rightHinge, 1)

    if (this.spinMode === 'free') {
      // isolate each cube on its own light layer (see buildSpaceBehind)
      this.leftPanel.layers.set(1)
      this.rightPanel.layers.set(2)
      // the slab casts the shadow that hides the tagline letters; it also receives
      // (self-shading as it turns)
      for (const p of [this.leftPanel, this.rightPanel]) {
        p.castShadow = true
        p.receiveShadow = true
      }
    }
  }

  /** placeholder space beyond the doors — replace with section 2 */
  private buildSpaceBehind(): void {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshStandardMaterial({ color: 0x2a2723, roughness: 0.95 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.set(0, -2.2, -16)

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 34),
      new THREE.MeshStandardMaterial({ color: 0x1f1d1a, roughness: 1 }),
    )
    wall.position.set(0, 7, -28)

    const glow = new THREE.PointLight(0xffe6c4, 20, 30)
    glow.position.set(0, 1.5, -9)
    this.doorScene.add(floor, wall, glow)

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

  // ---- the sign -----------------------------------------------------
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
          gl_FragColor = vec4(mix(rest, chrome, k), 1.0);
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
      for (let i = 0; i < loop.length; i++) {
        const [y1, z1] = loop[i]
        const [y2, z2] = loop[(i + 1) % loop.length]
        L.push(0, cy, cz, 0, y2, z2, 0, y1, z1)
        R.push(0, cy, cz, 0, y1, z1, 0, y2, z2)
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
      return new THREE.Mesh(g, this.spinMode === 'free' ? this.tagMat : this.letterMat)
    }

    const tagL = makeTag('We do things')
    const tagR = makeTag('for people.')
    if (this.spinMode === 'free') {
      // left cube: on its -x (outer) face, facing -x, just outside it.
      tagL.rotation.y = -Math.PI / 2
      tagL.position.set(cxL - cs / 2 - 0.05, yOff, -cs / 2)
      tagL.layers.set(1) // same light layer as leftPanel
      tagL.castShadow = true // relief self-shadows once lit
      tagL.receiveShadow = true // sits in the slab's shadow until then
      // right cube: mirror — on its +x (outer) face
      tagR.rotation.y = Math.PI / 2
      tagR.position.set(-(cxL - cs / 2 - 0.05), yOff, -cs / 2)
      tagR.layers.set(2)
      tagR.castShadow = true
      tagR.receiveShadow = true
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

    // ground (paper) -> heroRT, mapped onto the door leaves
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

    // free mode: the whole transition freezes once the cubes hit the 147° frame
    // (~85% scroll) — no more rotation AND no more recede past that point
    const mp = this.spinMode === 'free' ? Math.min(P, 0.85) : P

    const fly = THREE.MathUtils.clamp((mp - 0.3) / 0.7, 0, 1)
    const f = fly * fly // gentle ease-in — no lurch when they launch
    const fwd = -f * 13 // recede into -z; the camera follows more slowly so distance grows
    const xPull = 1 - f * 0.3 // slight drift toward centre

    this.letterMat.uniforms.uField.value = this.rtA.texture
    this.letterMat.uniforms.uOpen.value = Math.min(1, P * 2.5)

    if (this.spinMode === 'free') {
      // doors open inward and DECELERATE into the 147° cap (reached at ~85% scroll)
      // instead of slamming into it — so the tagline face, which only clears its own
      // shadow in the last stretch of that rotation, brightens slowly as it eases to
      // a stop rather than popping.
      const u = THREE.MathUtils.clamp(P / 0.85, 0, 1)
      const ease = u * u * u * (u * (u * 6 - 15) + 10) // smootherstep, flat at both ends
      const spin = 2.566 * ease
      this.leftHinge.rotation.y = spin
      this.rightHinge.rotation.y = -spin
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

    // camera holds while the doors open, then eases in on the same curve — slower
    // than the cubes recede, so they shrink with distance smoothly
    this.doorCam.position.z = THREE.MathUtils.lerp(DOOR_CAM_Z, -1, f)
    this._look.set(0, THREE.MathUtils.lerp(0, -0.15, f), THREE.MathUtils.lerp(0, -12, f))
    this.doorCam.lookAt(this._look)

    this.crumbs.step(dt)

    this.renderer.render(this.doorScene, this.doorCam)

    this.prevPointer.copy(this.pointer)
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

  private onWheel = (e: WheelEvent): void => {
    this.manual = THREE.MathUtils.clamp(this.manual + e.deltaY / 2600, 0, 1)
    this.progressTarget = this.manual
  }

  private onScroll = (): void => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    this.progressTarget = THREE.MathUtils.clamp(Math.max(window.scrollY / max, this.manual), 0, 1)
  }

  private onKey = (e: KeyboardEvent): void => {
    const step: Record<string, number> = { ArrowDown: 0.07, PageDown: 0.22, ' ': 0.22, ArrowUp: -0.07, PageUp: -0.22 }
    const s = step[e.key]
    if (s === undefined) return
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
    this.doorCam.aspect = this.W / this.H
    this.doorCam.updateProjectionMatrix()
    this.buildDoors()
    this.layoutLetters()
    this.crumbs.layout(this.W / this.H)
  }
}
