import * as THREE from 'three'
import gsap from 'gsap'
import type { Experience } from '../Experience'
import type { Room } from '../World/Room'
import vertexShader from '../../shaders/transition/transition.vert'
import fragmentShader from '../../shaders/transition/transition.frag'

/**
 * Room-to-room transition. We freeze the last frame of the outgoing room into a
 * render target, dispose it, build the incoming room, then tear the frozen frame
 * away with a roughened diagonal sweep. The deadpan DOM Loader sits on top during
 * the build gap.
 */
export class Transition {
  active = false

  private target: THREE.WebGLRenderTarget
  private scene = new THREE.Scene()
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private material: THREE.ShaderMaterial
  private quad: THREE.Mesh

  constructor(private exp: Experience) {
    const { width, height, pixelRatio } = exp.sizes
    this.target = new THREE.WebGLRenderTarget(width * pixelRatio, height * pixelRatio, {
      depthBuffer: false,
      stencilBuffer: false,
    })

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPrev: { value: this.target.texture },
        uProgress: { value: 0 },
        uAspect: { value: exp.sizes.aspect },
      },
    })

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.scene.add(this.quad)
  }

  /** Capture the outgoing room's current frame. */
  freeze(room: Room): void {
    const renderer = this.exp.renderer.instance
    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.clear()
    renderer.render(room.scene, room.camera)
    renderer.setRenderTarget(prevTarget)

    this.material.uniforms.uProgress.value = 0
    this.material.uniforms.uAspect.value = this.exp.sizes.aspect
    this.active = true
  }

  /** Animate the frozen frame off. Resolves when the incoming room is fully shown. */
  play(duration = 0.8): Promise<void> {
    return new Promise((resolve) => {
      gsap.fromTo(
        this.material.uniforms.uProgress,
        { value: 0 },
        {
          value: 1,
          duration,
          ease: 'power2.inOut',
          onComplete: () => {
            this.active = false
            resolve()
          },
        },
      )
    })
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera)
  }

  resize(): void {
    const { width, height, pixelRatio } = this.exp.sizes
    this.target.setSize(width * pixelRatio, height * pixelRatio)
    this.material.uniforms.uAspect.value = this.exp.sizes.aspect
  }
}
