import GUI from 'lil-gui'
import Stats from 'stats.js'

/**
 * Dev-only tooling. Active when the URL carries `#debug`. In production builds
 * this stays inert (no panel, no stats, negligible cost).
 */
export class Debug {
  active = false
  ui?: GUI
  stats?: Stats

  constructor() {
    this.active = window.location.hash === '#debug'
    if (!this.active) return

    this.ui = new GUI({ title: 'GENERIC — it works' })

    this.stats = new Stats()
    this.stats.dom.style.left = 'auto'
    this.stats.dom.style.right = '0'
    document.body.appendChild(this.stats.dom)
  }

  beginFrame(): void {
    this.stats?.begin()
  }

  endFrame(): void {
    this.stats?.end()
  }

  folder(name: string): GUI | undefined {
    return this.ui?.addFolder(name)
  }
}
