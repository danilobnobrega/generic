import { EventEmitter } from './EventEmitter'

interface TimeEvents extends Record<string, unknown> {
  tick: { delta: number; elapsed: number }
}

/**
 * The single requestAnimationFrame loop. `delta` is in seconds and clamped so a
 * backgrounded tab does not produce a huge jump on return.
 */
export class Time extends EventEmitter<TimeEvents> {
  start = performance.now()
  current = this.start
  elapsed = 0
  delta = 1 / 60

  private raf = 0
  private running = false

  run(): void {
    if (this.running) return
    this.running = true
    this.current = performance.now()
    this.raf = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  private tick = (now: number): void => {
    this.delta = Math.min((now - this.current) / 1000, 1 / 20)
    this.current = now
    this.elapsed = (now - this.start) / 1000
    this.emit('tick', { delta: this.delta, elapsed: this.elapsed })
    if (this.running) this.raf = requestAnimationFrame(this.tick)
  }

  override destroy(): void {
    this.stop()
    super.destroy()
  }
}
