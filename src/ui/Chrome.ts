import type { Experience } from '../Experience/Experience'
import { ROOMS } from '../config/rooms'

/**
 * The persistent layer: wordmark, the ugly native <select> nav, the domain, and
 * the cookie banner that never closes. The only things on screen that are
 * identical in every room.
 */
export class Chrome {
  private select!: HTMLSelectElement
  private crackerDone = false

  constructor(private exp: Experience) {
    this.buildWordmark()
    this.buildNav()
    this.buildDomain()
    this.buildCookie()
    this.buildA11yCopy()
  }

  syncRoute(path: string): void {
    if (this.select.value !== path) this.select.value = path
  }

  private buildWordmark(): void {
    const a = document.createElement('a')
    a.className = 'wordmark'
    a.href = '/'
    a.textContent = 'GENERIC'
    document.body.appendChild(a)
  }

  private buildNav(): void {
    const select = document.createElement('select')
    select.className = 'netnav'
    select.setAttribute('aria-label', 'go somewhere')

    for (const def of Object.values(ROOMS)) {
      const opt = document.createElement('option')
      opt.value = def.path
      opt.textContent = def.path === '/' ? '— go somewhere —' : def.name.toLowerCase()
      select.appendChild(opt)
    }

    select.addEventListener('change', () => {
      this.exp.router.navigate(select.value)
    })

    document.body.appendChild(select)
    this.select = select
  }

  private buildDomain(): void {
    const span = document.createElement('span')
    span.className = 'domain'
    span.textContent = 'generic.bargains'
    document.body.appendChild(span)
  }

  private buildCookie(): void {
    const bar = document.createElement('div')
    bar.className = 'cookie'

    const note = document.createElement('p')
    note.textContent =
      'We use cookies. Not to track your soul across the internet, but because the web browser freaks out if we don\'t put this banner here.'

    const btns = document.createElement('span')
    btns.className = 'btns'

    const accept = button('[ ACCEPT COOKIES ]')
    const cracker = button('[ I PREFER CRACKERS ]')

    accept.addEventListener('click', () => {
      note.textContent = 'Noted.'
      accept.remove()
      cracker.remove()
    })

    cracker.addEventListener('click', () => {
      this.toCrackers()
      note.textContent = 'Fine. A cracker has been added to the current physics scene.'
      accept.remove()
      cracker.remove()
    })

    btns.append(accept, cracker)
    bar.append(note, btns)
    document.body.appendChild(bar)
  }

  private buildA11yCopy(): void {
    // crawlable / screen-reader copy — the connective tissue, out of the way
    const region = document.createElement('div')
    region.className = 'sr-only'
    region.innerHTML =
      '<h1>GENERIC</h1><p>We do things for people. We make software for people who need software.</p>'
    document.body.appendChild(region)
  }

  private toCrackers(): void {
    if (this.crackerDone) return
    this.crackerDone = true
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let node = walker.nextNode()
    while (node) {
      const parent = node.parentNode
      if (parent && parent.nodeName !== 'SCRIPT' && parent.nodeName !== 'STYLE' && /cookie/i.test(node.nodeValue ?? '')) {
        nodes.push(node as Text)
      }
      node = walker.nextNode()
    }
    for (const n of nodes) {
      n.nodeValue = (n.nodeValue ?? '')
        .replace(/COOKIES/g, 'CRACKERS')
        .replace(/COOKIE/g, 'CRACKER')
        .replace(/Cookies/g, 'Crackers')
        .replace(/Cookie/g, 'Cracker')
        .replace(/cookies/g, 'crackers')
        .replace(/cookie/g, 'cracker')
    }
  }
}

function button(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  return b
}
