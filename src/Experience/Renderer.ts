import * as THREE from 'three'
import type { Experience } from './Experience'

/**
 * Owns the single WebGLRenderer for the whole site. Rooms never touch it
 * directly — they expose a `scene` + `camera` and this decides what to draw.
 */
export class Renderer {
  instance: THREE.WebGLRenderer

  constructor(private exp: Experience) {
    this.instance = new THREE.WebGLRenderer({
      canvas: exp.canvas,
      antialias: exp.sizes.pixelRatio < 2,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.instance.setClearColor(0xf2f1ec, 1)
    this.instance.outputColorSpace = THREE.SRGBColorSpace
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1.0
    this.resize()
  }

  resize(): void {
    this.instance.setSize(this.exp.sizes.width, this.exp.sizes.height)
    this.instance.setPixelRatio(this.exp.sizes.pixelRatio)
  }

  update(): void {
    const room = this.exp.world.current

    if (this.exp.transition.active && room) {
      // live incoming room, then the frozen outgoing frame tearing away on top
      this.instance.render(room.scene, room.camera)
      const prevAutoClear = this.instance.autoClear
      this.instance.autoClear = false
      this.exp.transition.render(this.instance)
      this.instance.autoClear = prevAutoClear
      return
    }

    if (room) this.instance.render(room.scene, room.camera)
  }
}
