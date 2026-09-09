import * as THREE from 'three'
import type { Experience } from '../Experience'

export interface CursorMode {
  color: string
  label: string
}

const DEFAULT: CursorMode = { color: '#14150f', label: '' }

/**
 * The custom pointer: a lagging ring + dot + a one-word label that tells you
 * what this room lets you do. Rooms call `set()` on enter.
 */
export class Cursor {
  private el: HTMLDivElement
  private ring: HTMLDivElement
  private dot: HTMLDivElement
  private labelEl: HTMLDivElement

  private target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  private pos = { x: this.target.x, y: this.target.y }

  /** normalized -1..1, consumed by rooms for parallax / raycasting */
  pointer = new THREE.Vector2(0, 0)
  down = false

  constructor(private exp: Experience) {
    this.el = document.createElement('div')
    this.el.id = 'cursor'
    this.ring = el('div', 'ring')
    this.dot = el('div', 'dot')
    this.labelEl = el('div', 'label')
    this.el.append(this.ring, this.dot, this.labelEl)
    document.body.appendChild(this.el)

    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointerup', this.onUp)

    this.set(DEFAULT)
  }

  set(mode: Partial<CursorMode>): void {
    const m = { ...DEFAULT, ...mode }
    this.el.style.color = m.color
    this.ring.style.borderColor = m.color
    this.labelEl.textContent = m.label
  }

  update(delta: number): void {
    const k = 1 - Math.pow(0.0015, delta)
    this.pos.x += (this.target.x - this.pos.x) * k
    this.pos.y += (this.target.y - this.pos.y) * k
    this.el.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px) translate(-50%, -50%)`
  }

  private onMove = (e: PointerEvent): void => {
    this.target.x = e.clientX
    this.target.y = e.clientY
    this.pointer.set(
      (e.clientX / this.exp.sizes.width) * 2 - 1,
      -((e.clientY / this.exp.sizes.height) * 2 - 1),
    )
  }

  private onDown = (): void => {
    this.down = true
    this.el.classList.add('is-down')
  }

  private onUp = (): void => {
    this.down = false
    this.el.classList.remove('is-down')
  }
}

function el(tag: string, className: string): HTMLDivElement {
  const node = document.createElement(tag) as HTMLDivElement
  node.className = className
  return node
}
