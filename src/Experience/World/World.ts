import type { Experience } from '../Experience'
import type { Room } from './Room'
import { resolveRoom, type RoomDef } from '../../config/rooms'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Holds the one live Room and orchestrates the swap: freeze -> Loader ->
 * dispose -> build -> tear away.
 */
export class World {
  current?: Room
  activeDef?: RoomDef

  private busy = false

  constructor(private exp: Experience) {}

  async goto(pathname: string): Promise<void> {
    const def = resolveRoom(pathname)
    if (this.busy) return
    if (this.current && this.activeDef?.path === def.path) return
    this.busy = true

    this.exp.loader.show()
    if (this.current) this.exp.transition.freeze(this.current)

    await wait(120)

    this.current?.dispose()
    this.current = undefined

    this.activeDef = def
    this.exp.chrome.syncRoute(def.path)

    const started = performance.now()
    const mod = await def.load()
    const room = new mod.default(this.exp, def)
    await room.build()
    room.resize()

    const held = performance.now() - started
    if (held < def.minLoad) await wait(def.minLoad - held)

    this.current = room
    this.exp.loader.hide()
    room.enter()

    await this.exp.transition.play()
    this.busy = false
  }

  update(delta: number, elapsed: number): void {
    this.current?.update(delta, elapsed)
  }

  resize(): void {
    this.current?.resize()
  }
}
