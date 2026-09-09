import { KerningWar } from './KerningWar'
import { Ticker } from './sound'

const SVGNS = 'http://www.w3.org/2000/svg'

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVGNS, tag)
  for (const k in attrs) node.setAttribute(k, String(attrs[k]))
  return node
}

function need<T extends Element>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing #${id}`)
  return node as unknown as T
}

const WORD = 'GENERIC'
const REST_KERN = [-0.012, 0.004, 0.002, -0.01, -0.018, -0.008]
const RESISTANT = 1

export class KerningHero {
  private readonly word = need<HTMLDivElement>('word')
  private readonly tool = need<SVGSVGElement>('tool')
  private readonly metricTrack = need<HTMLElement>('m-track')
  private readonly metricStatus = need<HTMLElement>('m-status')
  private readonly sndBtn = need<HTMLButtonElement>('snd')

  private readonly letters = WORD.split('')
  private readonly glyphEls: HTMLSpanElement[] = []
  private readonly war = new KerningWar(REST_KERN, this.letters.length, RESISTANT)
  private readonly ticker = new Ticker()

  private adv: number[] = []
  private gw: number[] = []
  private fontPx = 200
  private baseline = 0
  private capTop = 0
  private xTop = 0
  private wordW = 0
  private wordH = 0

  private last = performance.now()
  private frame = 0
  private resizeTimer = 0

  private guides: SVGLineElement[] = []
  private bboxes: SVGRectElement[] = []
  private sbTicks: SVGLineElement[] = []
  private sbVals: SVGTextElement[] = []
  private seps: SVGLineElement[] = []
  private kvs: SVGTextElement[] = []
  private dim!: SVGLineElement
  private dimA!: SVGLineElement
  private dimB!: SVGLineElement
  private caret!: SVGRectElement

  constructor() {
    for (const ch of this.letters) {
      const s = document.createElement('span')
      s.className = 'glyph'
      s.textContent = ch
      this.word.appendChild(s)
      this.glyphEls.push(s)
    }

    this.war.onTick = (strength) => this.ticker.tick(strength * 0.6 + 0.15)
    this.war.onBreak = () => this.ticker.thunk()

    this.word.addEventListener('pointerenter', this.onEnter)
    this.word.addEventListener('pointerleave', this.onLeave)
    window.addEventListener('pointerdown', () => this.ticker.unlock(), { once: true })
    window.addEventListener('resize', this.onResize)

    this.sndBtn.addEventListener('click', () => {
      this.ticker.enabled = !this.ticker.enabled
      this.sndBtn.setAttribute('aria-pressed', String(this.ticker.enabled))
      this.sndBtn.textContent = `sound: ${this.ticker.enabled ? 'on' : 'off'}`
    })

    void document.fonts.ready.then(() => {
      this.measure()
      requestAnimationFrame(this.tick)
    })
  }

  private measure = (): void => {
    this.fontPx = parseFloat(getComputedStyle(this.word).fontSize) || 200

    const wrap = document.createElement('span')
    wrap.style.whiteSpace = 'nowrap'
    this.glyphEls.forEach((g) => {
      g.style.position = 'static'
      g.style.transform = 'none'
      wrap.appendChild(g)
    })
    this.word.appendChild(wrap)

    const wrapRect = wrap.getBoundingClientRect()
    this.adv = []
    this.gw = []
    let right = 0
    for (const g of this.glyphEls) {
      const r = g.getBoundingClientRect()
      this.adv.push(r.left - wrapRect.left)
      this.gw.push(r.width)
      right = r.right - wrapRect.left
    }
    this.wordH = wrapRect.height

    this.glyphEls.forEach((g) => {
      g.style.position = 'absolute'
      this.word.appendChild(g)
    })
    wrap.remove()

    const restPx = REST_KERN.reduce((s, k) => s + k * this.fontPx, 0)
    this.wordW = right + restPx

    this.baseline = this.wordH * 0.8
    this.capTop = this.baseline - this.fontPx * 0.662
    this.xTop = this.baseline - this.fontPx * 0.448

    this.word.style.width = `${this.wordW}px`
    this.word.style.height = `${this.wordH}px`

    const padL = 84
    const padT = 48
    this.tool.setAttribute('viewBox', `${-padL} ${-padT} ${this.wordW + padL * 2} ${this.wordH + padT * 2.4}`)
    this.tool.style.left = `${-padL}px`
    this.tool.style.top = `${-padT}px`
    this.tool.style.width = `${this.wordW + padL * 2}px`
    this.tool.style.height = `${this.wordH + padT * 2.4}px`

    this.buildTool()
    this.render()
  }

  private restPx(i: number): number {
    return REST_KERN[i] * this.fontPx
  }
  private warScale(): number {
    return this.fontPx / 300
  }
  private glyphX(i: number): number {
    let x = this.adv[i]
    for (let j = 0; j < i; j++) x += this.restPx(j) + this.war.pairs[j].v * this.warScale()
    return x
  }

  private buildTool(): void {
    this.tool.replaceChildren()
    this.guides = []
    this.bboxes = []
    this.sbTicks = []
    this.sbVals = []
    this.seps = []
    this.kvs = []

    const guideRows: Array<[number, string]> = [
      [this.baseline, 'baseline'],
      [this.capTop, 'cap'],
      [this.xTop, 'x-ht'],
    ]
    for (const [y, label] of guideRows) {
      const line = el('line', { class: 'guide', x1: -60, y1: y, x2: this.wordW + 60, y2: y, pathLength: 1 })
      const text = el('text', { class: 'lbl', x: -72, y: y + 3, 'text-anchor': 'end' })
      text.textContent = label
      this.tool.append(line, text)
      this.guides.push(line)
    }

    for (let i = 0; i < this.letters.length; i++) {
      const box = el('rect', { class: 'bbox', x: 0, y: this.capTop, width: 10, height: this.baseline - this.capTop })
      const tickL = el('line', { class: 'sb', x1: 0, y1: this.baseline, x2: 0, y2: this.baseline + 20 })
      const tickR = el('line', { class: 'sb', x1: 0, y1: this.baseline, x2: 0, y2: this.baseline + 20 })
      const valL = el('text', { class: 'sbv', x: 0, y: this.baseline + 32 })
      const valR = el('text', { class: 'sbv', x: 0, y: this.baseline + 32 })
      valL.textContent = String(Math.round(6 + i))
      valR.textContent = String(Math.round(5 + (this.letters.length - i)))
      this.tool.append(box, tickL, tickR, valL, valR)
      this.bboxes.push(box)
      this.sbTicks.push(tickL, tickR)
      this.sbVals.push(valL, valR)
    }

    for (let i = 0; i < this.war.pairs.length; i++) {
      const sep = el('line', { class: 'guide v', x1: 0, y1: this.capTop - 26, x2: 0, y2: this.baseline + 12, pathLength: 1 })
      const kv = el('text', { class: 'kv', x: 0, y: this.capTop - 16 })
      kv.textContent = '+0'
      this.tool.append(sep, kv)
      this.seps.push(sep)
      this.kvs.push(kv)
    }

    this.dim = el('line', { class: 'dim', x1: 0, y1: 0, x2: 0, y2: 0 })
    this.dimA = el('line', { class: 'dim', x1: 0, y1: 0, x2: 0, y2: 0 })
    this.dimB = el('line', { class: 'dim', x1: 0, y1: 0, x2: 0, y2: 0 })
    this.caret = el('rect', { class: 'caret', x: 0, y: this.capTop, width: 2, height: this.baseline - this.capTop })
    this.tool.append(this.dim, this.dimA, this.dimB, this.caret)
  }

  private render(): void {
    this.tool.style.setProperty('--ap', String(this.war.apEnter))
    const scale = this.warScale()
    const midY = (this.capTop + this.baseline) / 2

    for (let i = 0; i < this.glyphEls.length; i++) {
      const x = this.glyphX(i)
      const g = this.war.glyphs[i]
      this.glyphEls[i].style.left = `${x}px`
      this.glyphEls[i].style.transform = `translateY(${g.dy * scale}px) rotate(${g.rot}deg)`

      const box = this.bboxes[i]
      box.setAttribute('x', String(x))
      box.setAttribute('width', String(Math.max(this.gw[i], 1)))
      const rightEdge = x + this.gw[i]
      this.sbTicks[i * 2].setAttribute('x1', String(x))
      this.sbTicks[i * 2].setAttribute('x2', String(x))
      this.sbTicks[i * 2 + 1].setAttribute('x1', String(rightEdge))
      this.sbTicks[i * 2 + 1].setAttribute('x2', String(rightEdge))
      this.sbVals[i * 2].setAttribute('x', String(x))
      this.sbVals[i * 2 + 1].setAttribute('x', String(rightEdge))
    }

    for (let i = 0; i < this.war.pairs.length; i++) {
      const edge = this.glyphX(i) + this.gw[i]
      const nextStart = this.glyphX(i + 1)
      this.seps[i].setAttribute('x1', String(edge))
      this.seps[i].setAttribute('x2', String(edge))

      const val = Math.round(this.war.pairs[i].v * scale)
      const kv = this.kvs[i]
      kv.textContent = (val >= 0 ? '+' : '') + val
      kv.setAttribute('x', String((edge + nextStart) / 2))
      kv.classList.toggle('focus', i === this.war.focus && this.war.apEnter > 0.5)
    }

    const f = this.war.focus
    const fEdge = this.glyphX(f) + this.gw[f]
    const fNext = this.glyphX(f + 1)
    this.dim.setAttribute('x1', String(fEdge))
    this.dim.setAttribute('y1', String(midY))
    this.dim.setAttribute('x2', String(fNext))
    this.dim.setAttribute('y2', String(midY))
    this.dimA.setAttribute('x1', String(fEdge))
    this.dimA.setAttribute('y1', String(midY - 6))
    this.dimA.setAttribute('x2', String(fEdge))
    this.dimA.setAttribute('y2', String(midY + 6))
    this.dimB.setAttribute('x1', String(fNext))
    this.dimB.setAttribute('y1', String(midY - 6))
    this.dimB.setAttribute('x2', String(fNext))
    this.dimB.setAttribute('y2', String(midY + 6))
    this.caret.setAttribute('x', String(fNext - 1))
  }

  private tick = (now: number): void => {
    const dt = Math.min((now - this.last) / 1000, 0.05)
    this.last = now

    this.war.update(dt, now)
    this.render()

    if (this.frame++ % 4 === 0) {
      const trackingEm = (this.war.tracking * this.warScale()) / this.wordW
      this.metricTrack.textContent = `tracking ${trackingEm >= 0 ? '+' : '-'}${Math.abs(trackingEm).toFixed(3)} em`
      const s = this.war.statusLabel
      this.metricStatus.textContent =
        s === 'unresolved' ? `unresolved · ${this.war.sessionNudges.toLocaleString()} nudges` : s
    }

    requestAnimationFrame(this.tick)
  }

  private onEnter = (): void => {
    this.war.enter(performance.now())
    this.word.classList.add('contested')
  }

  private onLeave = (): void => {
    this.war.leave(performance.now())
    this.word.classList.remove('contested')
  }

  private onResize = (): void => {
    window.clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(this.measure, 150)
  }
}
