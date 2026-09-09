/**
 * Tiny synthesised UI sound. Each kerning nudge gets an arrow-key tick; the
 * "almost resolved, then broken" beat gets a low thunk. No assets.
 */
export class Ticker {
  enabled = true

  private ctx: AudioContext | null = null
  private unlocked = false
  private lastAt = 0

  private ensure(): void {
    if (this.ctx) return
    try {
      this.ctx = new AudioContext()
    } catch {
      this.ctx = null
    }
  }

  /** call from a real user gesture (pointerdown) */
  unlock(): void {
    this.ensure()
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
    this.unlocked = true
  }

  tick(strength = 0.4): void {
    if (!this.ready()) return
    const now = performance.now()
    if (now - this.lastAt < 22) return
    this.lastAt = now

    const ctx = this.ctx as AudioContext
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 1500 + strength * 850 + Math.random() * 120
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.006 + strength * 0.02, t + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.04)
  }

  thunk(): void {
    if (!this.ready()) return
    const ctx = this.ctx as AudioContext
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(210, t)
    osc.frequency.exponentialRampToValueAtTime(58, t + 0.13)
    gain.gain.setValueAtTime(0.07, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.19)
  }

  private ready(): boolean {
    return this.enabled && this.unlocked && this.ctx !== null
  }
}
