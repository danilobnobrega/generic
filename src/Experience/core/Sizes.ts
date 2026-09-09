import { EventEmitter } from './EventEmitter'

interface SizesEvents extends Record<string, unknown> {
  resize: { width: number; height: number }
}

/**
 * Tracks viewport size and a capped device pixel ratio. Emits `resize`.
 */
export class Sizes extends EventEmitter<SizesEvents> {
  width = window.innerWidth
  height = window.innerHeight
  pixelRatio = Math.min(window.devicePixelRatio, 2)

  constructor() {
    super()
    window.addEventListener('resize', this.onResize)
  }

  get aspect(): number {
    return this.width / this.height
  }

  private onResize = (): void => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.pixelRatio = Math.min(window.devicePixelRatio, 2)
    this.emit('resize', { width: this.width, height: this.height })
  }

  override destroy(): void {
    window.removeEventListener('resize', this.onResize)
    super.destroy()
  }
}
