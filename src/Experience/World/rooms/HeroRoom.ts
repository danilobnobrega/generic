import * as THREE from 'three'
import gsap from 'gsap'
import { Text } from 'troika-three-text'
import { Room } from '../Room'
import { ROOMS } from '../../../config/rooms'
import vertexShader from '../../../shaders/hero/hero.vert'
import fragmentShader from '../../../shaders/hero/hero.frag'

const SHEET_W = 16
const SHEET_H = 10

/**
 * The hub. A blank sheet that dips under the cursor, with the room "doors"
 * printed on it as anomalies — no icons, no buttons, just text that has no
 * business being there. Hovering one tints it with that room's accent.
 */
export default class HeroRoom extends Room {
  private material!: THREE.ShaderMaterial
  private raycaster = new THREE.Raycaster()
  private pointerOnSheet = new THREE.Vector2(0, 0)
  private targetPointer = new THREE.Vector2(0, 0)

  private plane!: THREE.Mesh
  private headline!: Text
  private subline!: Text
  private doors: Array<{ text: Text; base: THREE.Vector3; accent: string; path: string; phase: number }> = []
  private tweens: gsap.core.Tween[] = []

  override async build(): Promise<void> {
    this.camera.position.set(0, 0, 7)

    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uPointer: { value: new THREE.Vector2(0, 0) },
        uTime: { value: 0 },
        uEnter: { value: 0 },
        uPaper: { value: new THREE.Color('#f2f1ec') },
      },
    })
    this.plane = new THREE.Mesh(new THREE.PlaneGeometry(SHEET_W, SHEET_H, 120, 72), this.material)
    this.scene.add(this.plane)

    this.headline = this.makeText('GENERIC.', 1.15, '#14150f')
    this.headline.position.set(0, 1.4, 0.05)
    this.headline.anchorX = 'center'

    this.subline = this.makeText('We do things for people.', 0.24, '#14150f')
    this.subline.position.set(0, 0.5, 0.05)
    this.subline.anchorX = 'center'
    this.subline.fillOpacity = 0.7

    this.scene.add(this.headline, this.subline)

    for (const def of Object.values(ROOMS)) {
      if (def.path === '/') continue
      const label = def.tag === 'pay money / do not pay money'
        ? '[ pay money ] [ do not pay money ]'
        : this.doorPhrase(def.path)
      const text = this.makeText(label, 0.2, '#14150f')
      text.anchorX = 'center'
      text.fillOpacity = 0.5
      const base = new THREE.Vector3(def.door[0], def.door[1], 0.12)
      text.position.copy(base)
      this.scene.add(text)
      this.doors.push({ text, base, accent: def.accent, path: def.path, phase: Math.random() * Math.PI * 2 })
    }

    await Promise.all([this.sync(this.headline), this.sync(this.subline), ...this.doors.map((d) => this.sync(d.text))])

    this.exp.canvas.addEventListener('click', this.onClick)
    this.onDispose(() => {
      this.exp.canvas.removeEventListener('click', this.onClick)
      this.tweens.forEach((t) => t.kill())
      this.headline.dispose()
      this.subline.dispose()
      this.doors.forEach((d) => d.text.dispose())
    })
  }

  override enter(): void {
    this.exp.cursor.set({ color: '#14150f', label: 'pick one' })
    this.tweens.push(gsap.to(this.material.uniforms.uEnter, { value: 1, duration: 1.3, ease: 'power2.out' }))
  }

  override update(delta: number, elapsed: number): void {
    this.material.uniforms.uTime.value = elapsed

    // project the cursor onto the sheet
    this.raycaster.setFromCamera(this.exp.cursor.pointer, this.camera)
    const hit = this.raycaster.intersectObject(this.plane)[0]
    if (hit) {
      this.targetPointer.set(hit.point.x / (SHEET_W / 2), hit.point.y / (SHEET_H / 2))
    }
    this.pointerOnSheet.lerp(this.targetPointer, 1 - Math.pow(0.001, delta))
    this.material.uniforms.uPointer.value.copy(this.pointerOnSheet)

    // hovered door?
    const hoveredObject = this.raycaster.intersectObjects(this.doors.map((d) => d.text))[0]?.object
    const hoveredDoor = this.doors.find((d) => d.text === hoveredObject)

    for (const door of this.doors) {
      const hovered = door === hoveredDoor
      door.text.color = hovered ? door.accent : '#14150f'
      door.text.fillOpacity += ((hovered ? 1 : 0.5) - door.text.fillOpacity) * 0.2
      const lift = Math.sin(elapsed * 0.8 + door.phase) * 0.05
      const scale = hovered ? 1.12 : 1
      door.text.position.set(door.base.x, door.base.y + lift, door.base.z)
      door.text.scale.setScalar(door.text.scale.x + (scale - door.text.scale.x) * 0.2)
    }

    // camera parallax
    this.camera.position.x += (this.exp.cursor.pointer.x * 0.35 - this.camera.position.x) * 2 * delta
    this.camera.position.y += (this.exp.cursor.pointer.y * 0.25 - this.camera.position.y) * 2 * delta
    this.camera.lookAt(0, 0.6, 0)
  }

  private onClick = (): void => {
    this.raycaster.setFromCamera(this.exp.cursor.pointer, this.camera)
    const object = this.raycaster.intersectObjects(this.doors.map((d) => d.text))[0]?.object
    const door = this.doors.find((d) => d.text === object)
    if (door) this.exp.router.navigate(door.path)
  }

  private doorPhrase(path: string): string {
    return {
      '/services': 'a 3D logo, spinning',
      '/faq': 'a question, folded',
      '/case-studies': 'a small light',
      '/social-proof': 'a logo, face down',
      '/pitch-deck': 'a rectangle of projected light',
      '/process': 'a gear, turning',
      '/team': 'a head. it is looking at you.',
      '/terms': 'text, too small to read',
    }[path] ?? path
  }

  private makeText(value: string, size: number, color: string): Text {
    const t = new Text()
    t.text = value
    t.fontSize = size
    t.color = color
    t.anchorY = 'middle'
    t.letterSpacing = 0.01
    return t
  }

  private sync(t: Text): Promise<void> {
    return new Promise((resolve) => t.sync(() => resolve()))
  }
}
