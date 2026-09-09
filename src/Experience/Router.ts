import type { Experience } from './Experience'
import { ROOMS } from '../config/rooms'

/**
 * History-API router. Intercepts same-origin link clicks and drives
 * `world.goto`. Every room is deep-linkable.
 */
export class Router {
  constructor(private exp: Experience) {}

  start(): void {
    window.addEventListener('popstate', this.onPopState)
    document.addEventListener('click', this.onClick)
    void this.exp.world.goto(this.normalize(window.location.pathname))
  }

  navigate(path: string): void {
    const target = this.normalize(path)
    if (target === this.normalize(window.location.pathname)) return
    window.history.pushState({}, '', target)
    void this.exp.world.goto(target)
  }

  private normalize(path: string): string {
    const clean = path.replace(/\/+$/, '') || '/'
    return ROOMS[clean] ? clean : '/'
  }

  private onPopState = (): void => {
    void this.exp.world.goto(this.normalize(window.location.pathname))
  }

  private onClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (!href || !href.startsWith('/') || anchor.target === '_blank') return
    e.preventDefault()
    this.navigate(href)
  }
}
