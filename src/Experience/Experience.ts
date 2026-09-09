import { Sizes } from './core/Sizes'
import { Time } from './core/Time'
import { Debug } from './core/Debug'
import { Resources } from './core/Resources'
import { Renderer } from './Renderer'
import { Cursor } from './systems/Cursor'
import { Transition } from './systems/Transition'
import { Router } from './Router'
import { World } from './World/World'
import { Loader } from '../ui/Loader'
import { Chrome } from '../ui/Chrome'

/**
 * Top-level wiring. One canvas, one loop, one renderer. Everything else hangs
 * off here and is reachable through the instance passed to each Room.
 */
export class Experience {
  readonly canvas: HTMLCanvasElement

  readonly sizes: Sizes
  readonly time: Time
  readonly debug: Debug
  readonly renderer: Renderer
  readonly resources: Resources
  readonly loader: Loader
  readonly cursor: Cursor
  readonly transition: Transition
  readonly chrome: Chrome
  readonly world: World
  readonly router: Router

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('is-touch')

    this.sizes = new Sizes()
    this.time = new Time()
    this.debug = new Debug()
    this.renderer = new Renderer(this)
    this.resources = new Resources(this.renderer.instance)
    this.loader = new Loader()
    this.cursor = new Cursor(this)
    this.transition = new Transition(this)
    this.chrome = new Chrome(this)
    this.world = new World(this)
    this.router = new Router(this)

    this.sizes.on('resize', () => this.onResize())
    this.time.on('tick', ({ delta, elapsed }) => this.onTick(delta, elapsed))

    this.router.start()
    this.time.run()
  }

  private onResize(): void {
    this.renderer.resize()
    this.transition.resize()
    this.world.resize()
  }

  private onTick(delta: number, elapsed: number): void {
    this.debug.beginFrame()
    this.cursor.update(delta)
    this.world.update(delta, elapsed)
    this.renderer.update()
    this.debug.endFrame()
  }
}
