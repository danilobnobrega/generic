import * as THREE from 'three'
import type { Experience } from '../Experience'
import type { RoomDef } from '../../config/rooms'
import { disposeScene } from '../../utils/dispose'

/**
 * A self-contained world. Rooms share nothing but the deadpan voice and the
 * persistent chrome. Lifecycle:
 *   new Room()  ->  build()  ->  enter()  ->  update() * n  ->  dispose()
 */
export abstract class Room {
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera

  protected exp: Experience
  protected def: RoomDef
  protected disposers: Array<() => void> = []

  constructor(exp: Experience, def: RoomDef) {
    this.exp = exp
    this.def = def
    this.scene.background = new THREE.Color(def.background)
    this.camera = new THREE.PerspectiveCamera(45, exp.sizes.aspect, 0.1, 200)
    this.camera.position.set(0, 0, 7)
  }

  /** Load assets and construct the scene graph. May be async. */
  abstract build(): Promise<void> | void

  /** Called once the room is visible. Set the cursor mode here. */
  enter(): void {
    this.exp.cursor.set({ color: this.def.accent, label: this.def.cursor })
  }

  update(_delta: number, _elapsed: number): void {}

  resize(): void {
    this.camera.aspect = this.exp.sizes.aspect
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    for (const d of this.disposers) d()
    this.disposers = []
    disposeScene(this.scene)
  }

  /** Register a cleanup callback (event listeners, gsap tweens, troika text). */
  protected onDispose(fn: () => void): void {
    this.disposers.push(fn)
  }
}
