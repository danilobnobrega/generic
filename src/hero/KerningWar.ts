export interface WarGlyph {
  rot: number
  dy: number
}

export interface WarPair {
  rest: number
  v: number
  home: number
  resistant: boolean
}

export type WarPhase = 'idle' | 'assembling' | 'fighting' | 'settling' | 'collapsing'

/**
 * Simulates a type designer kerning a word and never being satisfied. The
 * designer's attention (`focus`) moves between pairs; on a pair it does a burst
 * of discrete arrow-key nudges toward a target, then leans back, then picks
 * another — often revisiting one it "fixed" to undo it. Every so often the whole
 * word eases toward zero and *looks* settled, then one pair violently breaks.
 */
export class KerningWar {
  readonly pairs: WarPair[]
  readonly glyphs: WarGlyph[]

  phase: WarPhase = 'idle'
  apEnter = 0
  focus = 0
  sessionNudges = 0

  onTick?: (strength: number) => void
  onBreak?: () => void

  private burstLeft = 0
  private nextStepAt = 0
  private nextBurstAt = 0
  private phaseUntil = 0
  private nextAlmostAt = 0
  private settleUntil = 0

  constructor(restKern: number[], glyphCount: number, resistantIndex: number) {
    this.pairs = restKern.map((rest, i) => ({
      rest,
      v: 0,
      home: 0,
      resistant: i === resistantIndex,
    }))
    this.glyphs = Array.from({ length: glyphCount }, () => ({ rot: 0, dy: 0 }))
  }

  enter(now: number): void {
    this.phase = 'assembling'
    this.phaseUntil = now + 520
    this.nextBurstAt = now + 520
    this.nextAlmostAt = now + 5200 + Math.random() * 4200
  }

  leave(now: number): void {
    this.phase = 'collapsing'
    this.phaseUntil = now + 460
    for (const p of this.pairs) p.home = 0
  }

  update(dt: number, now: number): void {
    const wantAp = this.phase === 'idle' || this.phase === 'collapsing' ? 0 : 1
    const apK = this.phase === 'assembling' ? 6 : 9
    this.apEnter += (wantAp - this.apEnter) * (1 - Math.exp(-apK * dt))

    switch (this.phase) {
      case 'assembling':
        this.ease(dt, 6)
        if (now >= this.phaseUntil) this.phase = 'fighting'
        break

      case 'fighting':
        this.fight(dt, now)
        if (now >= this.nextAlmostAt) {
          this.phase = 'settling'
          this.settleUntil = now + 640
          for (const p of this.pairs) p.home = 0
        }
        break

      case 'settling':
        this.ease(dt, 9)
        if (now >= this.settleUntil) {
          const k = Math.floor(Math.random() * this.pairs.length)
          const dir = Math.random() < 0.5 ? -1 : 1
          this.pairs[k].v += dir * (30 + Math.random() * 24)
          this.pairs[k].home = this.pairs[k].v
          this.glyphs[k].rot -= dir * 0.9
          if (this.glyphs[k + 1]) this.glyphs[k + 1].rot += dir * 0.9
          this.onBreak?.()
          this.phase = 'fighting'
          this.nextAlmostAt = now + 6500 + Math.random() * 6500
          this.nextBurstAt = now + 420
        }
        break

      case 'collapsing':
        this.ease(dt, 11)
        if (now >= this.phaseUntil && this.apEnter < 0.02) {
          this.phase = 'idle'
          for (const p of this.pairs) p.v = 0
        }
        break

      case 'idle':
        this.ease(dt, 14)
        break
    }

    for (const g of this.glyphs) {
      const s = 1 - Math.exp(-9 * dt)
      g.rot += -g.rot * s
      g.dy += -g.dy * s
    }
  }

  get tracking(): number {
    let s = 0
    for (const p of this.pairs) s += p.v
    return s
  }

  get contested(): number {
    return this.pairs.reduce((n, p) => n + (Math.abs(p.v) > 2 ? 1 : 0), 0)
  }

  get statusLabel(): string {
    switch (this.phase) {
      case 'idle':
        return 'fine'
      case 'assembling':
        return 'opening'
      case 'settling':
        return 'almost'
      case 'collapsing':
        return 'abandoned'
      default:
        return 'unresolved'
    }
  }

  private ease(dt: number, k: number): void {
    const s = 1 - Math.exp(-k * dt)
    for (const p of this.pairs) p.v += (p.home - p.v) * s
  }

  private fight(dt: number, now: number): void {
    for (let i = 0; i < this.pairs.length; i++) {
      if (i === this.focus) continue
      const p = this.pairs[i]
      const k = p.resistant ? 2.2 : 0.25
      p.v += -p.v * (1 - Math.exp(-k * dt))
    }

    if (this.burstLeft <= 0 && now >= this.nextBurstAt) {
      if (Math.random() < 0.36) {
        let far = -1
        let fi = 0
        this.pairs.forEach((p, i) => {
          const d = Math.abs(p.v)
          if (d > far) {
            far = d
            fi = i
          }
        })
        this.focus = fi
        this.pairs[fi].home = -this.pairs[fi].v * (0.35 + Math.random() * 0.55)
      } else {
        this.focus = Math.floor(Math.random() * this.pairs.length)
        const amp = 9 + Math.random() * 42
        this.pairs[this.focus].home = (Math.random() * 2 - 1) * amp
      }
      this.burstLeft = 3 + Math.floor(Math.random() * 7)
      this.nextStepAt = now
    }

    if (this.burstLeft > 0 && now >= this.nextStepAt) {
      const p = this.pairs[this.focus]
      const dir = Math.sign(p.home - p.v) || 1
      const big = Math.random() < 0.16
      let step = dir * (big ? 10 : 1)
      if (p.resistant) step *= 0.12
      p.v += step
      this.sessionNudges++
      this.onTick?.(big ? 1 : 0.4)

      const kick = (big ? 0.55 : 0.16) * dir
      const gL = this.glyphs[this.focus]
      const gR = this.glyphs[this.focus + 1]
      if (gL) gL.rot -= kick
      if (gR) gR.rot += kick
      if (big && gR) gR.dy += (Math.random() - 0.5) * 4

      this.burstLeft--
      this.nextStepAt = now + 50 + Math.random() * 80

      if (Math.abs(p.v - p.home) < 1.3 || this.burstLeft === 0) {
        this.burstLeft = 0
        this.nextBurstAt = now + 230 + Math.random() * 520
      }
    }
  }
}
