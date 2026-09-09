const LINES = [
  'this should be instant',
  'loading things',
  'almost',
  "why is this taking so long, it's just a website",
  'retrieving the thing',
  'the thing is loading',
  "please wait. or don't.",
  'this page loaded in 0.00001 seconds',
]

/**
 * The one constant transition surface. A default spinner and a deadpan line —
 * the same generic loader between every room. It sits on top of the real
 * render-target tear underneath.
 */
export class Loader {
  private el: HTMLDivElement
  private line: HTMLParagraphElement

  constructor() {
    this.el = document.createElement('div')
    this.el.id = 'loader'

    const spinner = document.createElement('div')
    spinner.className = 'spinner'

    this.line = document.createElement('p')
    this.line.textContent = LINES[1]

    this.el.append(spinner, this.line)
    document.body.appendChild(this.el)
  }

  show(): void {
    this.line.textContent = LINES[Math.floor(Math.random() * LINES.length)]
    this.el.classList.add('is-on')
  }

  hide(): void {
    this.el.classList.remove('is-on')
  }
}
