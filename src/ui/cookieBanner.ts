import type { CrumbRain, CrumbKind } from './CrumbRain'

const BANNER_CSS = `
.cookie-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 24;
  background: #15150e; color: #efeee7;
  font: 400 12px/1.45 "IBM Plex Mono", ui-monospace, Menlo, monospace;
  padding: 10px 18px;
  display: flex; align-items: center; gap: 12px 20px; flex-wrap: wrap;
}
.cookie-bar p { margin: 0; max-width: 54ch; }
.cookie-bar .cb-btns { margin-left: auto; display: flex; gap: 8px; }
.cookie-bar button {
  font: inherit; font-size: 11px;
  background: transparent; color: #efeee7;
  border: 1px solid #efeee7; padding: 5px 9px; cursor: pointer;
}
.cookie-bar button:hover { background: #efeee7; color: #15150e; }
`

let mounted = false

/**
 * The persistent cookie banner. Never closes. Picking an option rains that
 * baked good onto the floor in front of the doors (via the caller's CrumbRain)
 * and, for crackers, rewrites every "cookie" on the page to "cracker".
 */
export function mountCookieBanner(crumbs: CrumbRain, onChoice?: () => void): void {
  if (mounted) return
  mounted = true

  const style = document.createElement('style')
  style.textContent = BANNER_CSS
  document.head.appendChild(style)

  const bar = document.createElement('div')
  bar.className = 'cookie-bar'

  const note = document.createElement('p')
  note.textContent =
    "We use cookies. Not to track your soul across the internet, but because the web browser freaks out if we don't put this banner here."

  const btns = document.createElement('span')
  btns.className = 'cb-btns'

  const accept = mkButton('[ ACCEPT COOKIES ]')
  const prefer = mkButton('[ I PREFER CRACKERS ]')
  btns.append(accept, prefer)
  bar.append(note, btns)
  document.body.appendChild(bar)

  // fetch both models now, so the first crumb drops the instant a button is clicked
  void crumbs.preload()

  let done = false

  const choose = (kind: CrumbKind): void => {
    if (done) return
    done = true
    bar.remove()
    if (kind === 'cracker') swapCookieText()
    void crumbs.rain(kind)
    onChoice?.() // release the scroll lock
  }

  accept.addEventListener('click', () => choose('cookie'))
  prefer.addEventListener('click', () => choose('cracker'))
}

function mkButton(label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  return b
}

function swapCookieText(): void {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const found: Text[] = []
  let node = walker.nextNode()
  while (node) {
    const p = node.parentNode
    if (p && p.nodeName !== 'SCRIPT' && p.nodeName !== 'STYLE' && /cookie/i.test(node.nodeValue ?? '')) {
      found.push(node as Text)
    }
    node = walker.nextNode()
  }
  for (const t of found) {
    t.nodeValue = (t.nodeValue ?? '')
      .replace(/COOKIES/g, 'CRACKERS')
      .replace(/COOKIE/g, 'CRACKER')
      .replace(/Cookies/g, 'Crackers')
      .replace(/Cookie/g, 'Cracker')
      .replace(/cookies/g, 'crackers')
      .replace(/cookie/g, 'cracker')
  }
}
