import * as THREE from 'three'
import fullscreenVert from './shaders/fullscreen.vert'
import fieldFrag from './shaders/field.frag'
import heroFrag from './shaders/hero.frag'

const LOCKUP_FRACTION_DESKTOP = 0.82
const LOCKUP_FRACTION_MOBILE = 0.92

/** Return a new canvas cropped to the bounding box of non-transparent pixels. */
function tightCrop(src: HTMLCanvasElement, ctx: CanvasRenderingContext2D, pad: number): HTMLCanvasElement {
  const { width, height } = src
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX) return src // nothing drawn

  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const w = Math.min(width, maxX + pad) - x0
  const h = Math.min(height, maxY + pad) - y0

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')
  if (!octx) return src
  octx.drawImage(src, x0, y0, w, h, 0, 0, w, h)
  return out
}

/**
 * The hero. "We are GENERIC" lives on the GPU as a shader surface. At rest the
 * wordmark is a flat, dead grey. The cursor lays down a heat field (ping-pong
 * FBO); where it's hot the glyphs turn to displaced liquid chrome with
 * chromatic fringing, then cool back to flat when you leave.
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

  private W = window.innerWidth
  private H = window.innerHeight
  private dpr = Math.min(window.devicePixelRatio, 2)

  private pointer = new THREE.Vector2(0.5, 0.5)
  private target = new THREE.Vector2(0.5, 0.5)
  private prevPointer = new THREE.Vector2(0.5, 0.5)
  private active = 0
  private down = 0

  private textAspect = 3.4

  constructor(canvas: HTMLCanvasElement) {
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
      fragmentShader: heroFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uText: { value: this.placeholderTexture() },
        uField: { value: this.rtA.texture },
        uResolution: { value: new THREE.Vector2(this.W * this.dpr, this.H * this.dpr) },
        uTextScale: { value: new THREE.Vector2(0.7, 0.2) },
        uTime: { value: 0 },
      },
    })

    this.fieldScene.add(new THREE.Mesh(this.quad, this.fieldMat))
    this.heroScene.add(new THREE.Mesh(this.quad, this.heroMat))

    this.clearTargets()
    void this.buildLockup()

    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
    window.addEventListener('blur', this.onLeave)
    document.addEventListener('pointerleave', this.onLeave)
    window.addEventListener('resize', this.onResize)

    this.renderer.setAnimationLoop(this.frame)
  }

  // ---- lockup texture ------------------------------------------------
  private placeholderTexture(): THREE.Texture {
    const c = document.createElement('canvas')
    c.width = c.height = 4
    return new THREE.CanvasTexture(c)
  }

  private async buildLockup(): Promise<void> {
    try {
      await Promise.all([
        document.fonts.load('700 440px Tinos'),
        document.fonts.load('italic 400 96px "EB Garamond"'),
      ])
    } catch {
      /* fall back to system serif */
    }

    const cw = 3600
    const ch = 1280
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch
    const g = c.getContext('2d')
    if (!g) return

    g.clearRect(0, 0, cw, ch)
    g.fillStyle = '#ffffff'
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'

    // GENERIC.
    const word = 'GENERIC.'
    let size = 640
    g.font = `700 ${size}px Tinos, Times, "Times New Roman", serif`
    let w = g.measureText(word).width
    const maxW = cw - 120
    if (w > maxW) {
      size = Math.floor((size * maxW) / w)
      g.font = `700 ${size}px Tinos, Times, "Times New Roman", serif`
      w = g.measureText(word).width
    }
    const gx = (cw - w) / 2
    const gy = ch * 0.86
    g.fillText(word, gx, gy)

    // "We are" — italic, tucked above the cap line, left-aligned to the G
    const wSize = Math.round(size * 0.2)
    g.font = `italic 400 ${wSize}px "EB Garamond", Georgia, serif`
    g.fillText('We are', gx + size * 0.02, gy - size * 0.86)

    // crop tight to the drawn ink so the lockup centers exactly on screen
    const cropped = tightCrop(c, g, Math.round(size * 0.08))

    const tex = new THREE.CanvasTexture(cropped)
    tex.colorSpace = THREE.NoColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    tex.needsUpdate = true

    this.heroMat.uniforms.uText.value = tex
    this.textAspect = cropped.width / cropped.height
    this.updateTextScale()
  }

  // ---- sizing ------------------------------------------------------
  private fieldSize(): [number, number] {
    return [
      Math.max(2, Math.round((this.W * this.dpr) / 2)),
      Math.max(2, Math.round((this.H * this.dpr) / 2)),
    ]
  }

  private updateTextScale(): void {
    const f = this.W < 700 ? LOCKUP_FRACTION_MOBILE : LOCKUP_FRACTION_DESKTOP
    const sx = f
    const sy = (f / this.textAspect) * (this.W / this.H)
    this.heroMat.uniforms.uTextScale.value.set(sx, sy)
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
    const elapsed = this.clock.getElapsedTime()

    // pointer smoothing
    this.pointer.lerp(this.target, 0.35)
    this.active += ((this.hasFocus() ? 1 : 0) - this.active) * 0.12

    // field pass: rtA (prev) -> rtB
    this.fieldMat.uniforms.uPrev.value = this.rtA.texture
    this.fieldMat.uniforms.uPointer.value.copy(this.pointer)
    this.fieldMat.uniforms.uPrevPointer.value.copy(this.prevPointer)
    this.fieldMat.uniforms.uAspect.value = this.W / this.H
    this.fieldMat.uniforms.uDown.value = this.down
    this.fieldMat.uniforms.uActive.value = this.active

    this.renderer.setRenderTarget(this.rtB)
    this.renderer.render(this.fieldScene, this.camera)
    this.renderer.setRenderTarget(null)

    const swap = this.rtA
    this.rtA = this.rtB
    this.rtB = swap

    // hero pass
    this.heroMat.uniforms.uField.value = this.rtA.texture
    this.heroMat.uniforms.uTime.value = elapsed
    this.renderer.render(this.heroScene, this.camera)

    this.prevPointer.copy(this.pointer)
  }

  private hasFocus(): boolean {
    return this.active > 0.001 || this.pointerInside
  }

  private pointerInside = false

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

  private onResize = (): void => {
    this.W = window.innerWidth
    this.H = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio, 2)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.W, this.H)
    const [fw, fh] = this.fieldSize()
    this.rtA.setSize(fw, fh)
    this.rtB.setSize(fw, fh)
    this.clearTargets()
    this.heroMat.uniforms.uResolution.value.set(this.W * this.dpr, this.H * this.dpr)
    this.updateTextScale()
  }
}
