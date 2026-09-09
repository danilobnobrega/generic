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

/** distance from the door camera to the closed doors (z = 0) */
const DOOR_CAM_Z = 4
/** how far each leaf swings open, radians */
const DOOR_SWING = 2.2
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
  private _look = new THREE.Vector3()

  private letterMat!: THREE.ShaderMaterial
  private lettersL = new THREE.Group()
  private lettersR = new THREE.Group()
  private fonts?: { bold: Font; italic: Font }

  /** the cookie/cracker pile — lives in doorScene, in front of the doors */
  readonly crumbs: CrumbRain

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

  constructor(canvas: HTMLCanvasElement, opts: { crumbScale?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.W, this.H)

    const rtOpts: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }
    const [fw, fh] = this.fieldSize()
    this.rtA = new THREE.WebGLRenderTarget(fw, fh, rtOpts)
    this.rtB = new THREE.WebGLRenderTarget(fw, fh, rtOpts)
    this.heroRT = new THREE.WebGLRenderTarget(this.W * this.dpr, this.H * this.dpr, {
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
        uResolution: { value: new THREE.Vector2(this.W * this.dpr, this.H * this.dpr) },
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
    window.addEventListener('resize', this.onResize)
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
    // small bleed so a sub-pixel seam or edge never shows the space behind
    const over = vw * 0.006
    const PW = pw + 2 * over
    const PH = vh + 2 * over

    for (const p of [this.leftPanel, this.rightPanel]) {
      if (!p) continue
      p.geometry.dispose() // material is shared (this.doorMat) — never disposed here
      p.parent?.remove(p)
    }

    // UVs are baked from each vertex's closed-state world position so that
    // worldX -vw/2..0 -> u 0..0.5 (left leaf) and 0..vw/2 -> u 0.5..1 (right),
    // worldY -vh/2..vh/2 -> v 0..1. The bleed spills slightly past [0,1] and
    // clamps to the edge texel — outside the frustum, never seen.
    const bake = (g: THREE.PlaneGeometry, hingeX: number, panelX: number): void => {
      const pos = g.attributes.position
      const uv = g.attributes.uv
      for (let i = 0; i < pos.count; i++) {
        const worldX = hingeX + panelX + pos.getX(i)
        const worldY = pos.getY(i)
        uv.setXY(i, (worldX + vw / 2) / vw, (worldY + vh / 2) / vh)
      }
      uv.needsUpdate = true
    }
    this.leftHinge.position.set(-vw / 2, 0, 0)
    this.leftHinge.rotation.set(0, 0, 0)
    const leftPanelX = over - PW / 2 + vw / 2
    const lg = new THREE.PlaneGeometry(PW, PH)
    bake(lg, -vw / 2, leftPanelX)
    this.leftPanel = new THREE.Mesh(lg, this.doorMat)
    this.leftPanel.position.x = leftPanelX
    this.leftHinge.add(this.leftPanel)

    this.rightHinge.position.set(vw / 2, 0, 0)
    this.rightHinge.rotation.set(0, 0, 0)
    const rightPanelX = -over + PW / 2 - vw / 2
    const rg = new THREE.PlaneGeometry(PW, PH)
    bake(rg, vw / 2, rightPanelX)
    this.rightPanel = new THREE.Mesh(rg, this.doorMat)
    this.rightPanel.position.x = rightPanelX
    this.rightHinge.add(this.rightPanel)
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

    this.doorScene.add(floor, wall, glow, new THREE.HemisphereLight(0x3c3934, 0x191715, 0.45))
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

    // split triangles at x = 0 so each half rides its own leaf
    const tri = geo.toNonIndexed()
    const p = tri.attributes.position.array as Float32Array
    const nr = tri.attributes.normal.array as Float32Array
    const buf: Record<'L' | 'R', { p: number[]; n: number[] }> = { L: { p: [], n: [] }, R: { p: [], n: [] } }
    for (let t = 0; t < p.length; t += 9) {
      const side = (p[t] + p[t + 3] + p[t + 6]) / 3 < 0 ? buf.L : buf.R
      for (let k = 0; k < 9; k++) {
        side.p.push(p[t + k])
        side.n.push(nr[t + k])
      }
    }
    geo.dispose()
    tri.dispose()

    const half = (d: { p: number[]; n: number[] }): THREE.BufferGeometry => {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.p, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(d.n, 3))
      return g
    }

    const yOff = vh * 0.03
    const zOff = 0.015
    const meshL = new THREE.Mesh(half(buf.L), this.letterMat)
    meshL.position.set(vw / 2, yOff, zOff)
    this.lettersL.add(meshL)
    const meshR = new THREE.Mesh(half(buf.R), this.letterMat)
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
  }

  // ---- sizing ------------------------------------------------------
  private fieldSize(): [number, number] {
    return [
      Math.max(2, Math.round((this.W * this.dpr) / 2)),
      Math.max(2, Math.round((this.H * this.dpr) / 2)),
    ]
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

    // doors
    this.progress += (this.progressTarget - this.progress) * (1 - Math.pow(0.003, dt))
    const P = this.progress

    // the leaves swing through the first 60% of the scroll, camera still
    const openP = THREE.MathUtils.clamp(P / 0.6, 0, 1)
    const open = openP * openP * (3 - 2 * openP)
    // the camera only starts moving once the leaves are ~half open, then pushes through
    const dollyP = THREE.MathUtils.clamp((P - 0.35) / 0.65, 0, 1)
    const dolly = dollyP * dollyP * (3 - 2 * dollyP)

    this.letterMat.uniforms.uField.value = this.rtA.texture
    this.letterMat.uniforms.uOpen.value = Math.min(1, P * 3)
    this.leftHinge.rotation.y = open * DOOR_SWING
    this.rightHinge.rotation.y = open * -DOOR_SWING
    this.doorCam.position.z = THREE.MathUtils.lerp(DOOR_CAM_Z, -2.6, dolly)
    this._look.set(0, THREE.MathUtils.lerp(0, -0.6, dolly), THREE.MathUtils.lerp(0, -16, dolly))
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
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.W, this.H)
    const [fw, fh] = this.fieldSize()
    this.rtA.setSize(fw, fh)
    this.rtB.setSize(fw, fh)
    this.heroRT.setSize(this.W * this.dpr, this.H * this.dpr)
    this.clearTargets()
    this.heroMat.uniforms.uResolution.value.set(this.W * this.dpr, this.H * this.dpr)
    this.doorCam.aspect = this.W / this.H
    this.doorCam.updateProjectionMatrix()
    this.buildDoors()
    this.layoutLetters()
    this.crumbs.layout(this.W / this.H)
  }
}
