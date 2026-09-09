import * as THREE from 'three'
import { Text } from 'troika-three-text'
import { Room } from '../Room'

/**
 * Honest stand-in for a room not built yet. Still fully WebGL: the room's
 * background, its characteristic object turning slowly in its accent colour,
 * the real copy, and a deadpan note. Replaced one at a time by real rooms.
 */
export default class PlaceholderRoom extends Room {
  private object!: THREE.Object3D
  private texts: Text[] = []

  override async build(): Promise<void> {
    this.camera.position.set(0, 0, 7)

    this.scene.add(new THREE.HemisphereLight(0xffffff, new THREE.Color(this.def.background).getHex(), 0.9))
    const key = new THREE.DirectionalLight(0xffffff, 0.8)
    key.position.set(3, 5, 6)
    this.scene.add(key)

    this.object = this.characteristicObject()
    this.object.position.z = -0.5
    this.scene.add(this.object)

    const fg = this.def.dark ? '#f2f1ec' : '#14150f'

    this.addText(this.def.name, 0.44, fg, 2.35, 1, 'center')
    this.addText(this.def.tag, 0.16, fg, 1.85, 0.5, 'center')
    this.addText(this.def.copy, 0.17, fg, -1.7, 0.85, 'center', 6.4)
    this.addText('this room is being built. it will be very good. — GENERIC', 0.14, fg, -2.55, 0.4, 'center')

    await Promise.all(this.texts.map((t) => new Promise<void>((res) => t.sync(() => res()))))

    this.onDispose(() => this.texts.forEach((t) => t.dispose()))
  }

  override update(delta: number, elapsed: number): void {
    this.object.rotation.y += delta * 0.4
    this.object.rotation.x = Math.sin(elapsed * 0.3) * 0.15
    this.camera.position.x += (this.exp.cursor.pointer.x * 0.4 - this.camera.position.x) * 1.6 * delta
    this.camera.position.y += (this.exp.cursor.pointer.y * 0.3 - this.camera.position.y) * 1.6 * delta
    this.camera.lookAt(0, 0, 0)
  }

  private addText(
    value: string,
    size: number,
    color: string,
    y: number,
    opacity: number,
    align: 'left' | 'center' | 'right',
    maxWidth = 20,
  ): void {
    const t = new Text()
    t.text = value
    t.fontSize = size
    t.color = color
    t.fillOpacity = opacity
    t.anchorX = 'center'
    t.anchorY = 'middle'
    t.textAlign = align
    t.maxWidth = maxWidth
    t.letterSpacing = 0.01
    t.position.set(0, y, 0.1)
    this.scene.add(t)
    this.texts.push(t)
  }

  private characteristicObject(): THREE.Object3D {
    const accent = new THREE.Color(this.def.accent)
    switch (this.def.path) {
      case '/services': {
        const shape = new THREE.Shape()
        for (let i = 0; i <= 10; i++) {
          const r = i % 2 ? 0.42 : 1.1
          const a = (i / 10) * Math.PI * 2
          const x = Math.cos(a) * r
          const yy = Math.sin(a) * r
          i === 0 ? shape.moveTo(x, yy) : shape.lineTo(x, yy)
        }
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 })
        return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xdfe2e5, metalness: 0.9, roughness: 0.28 }))
      }
      case '/faq': {
        const g = new THREE.Group()
        for (let i = 0; i < 7; i++) {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(3.2, 0.32, 1.5),
            new THREE.MeshStandardMaterial({ color: i % 2 ? 0xc0392b : 0x8c1f16, roughness: 0.7 }),
          )
          m.position.y = (i - 3) * 0.4
          m.rotation.z = (i % 2 ? 1 : -1) * 0.05
          g.add(m)
        }
        return g
      }
      case '/case-studies': {
        const n = 900
        const pos = new Float32Array(n * 3)
        for (let i = 0; i < n; i++) {
          pos[i * 3] = (Math.random() - 0.5) * 12
          pos[i * 3 + 1] = (Math.random() - 0.5) * 8
          pos[i * 3 + 2] = (Math.random() - 0.5) * 8
        }
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
        return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 0.05 }))
      }
      case '/social-proof': {
        const g = new THREE.Group()
        for (let i = 0; i < 5; i++) {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(2 + i * 0.2, 1.1, 0.3),
            new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.85 }),
          )
          m.position.set((Math.random() - 0.5) * 1.5, i * 0.5 - 1, (Math.random() - 0.5) * 1.5)
          m.rotation.set(Math.random() * 0.3, Math.random() * 0.6, (Math.random() - 0.5) * 0.4)
          g.add(m)
        }
        return g
      }
      case '/pitch-deck': {
        const g = new THREE.Group()
        for (let i = 0; i < 4; i++) {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(3.4, 1.9, 0.12),
            new THREE.MeshStandardMaterial({ color: 0xfdfdf7, roughness: 0.9 }),
          )
          m.position.set((i - 1.5) * 0.22, (i - 1.5) * 0.16, -i * 0.55)
          g.add(m)
        }
        return g
      }
      case '/process': {
        const g = new THREE.Group()
        g.add(new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.5, 12, 9), new THREE.MeshStandardMaterial({ color: accent, metalness: 0.6, roughness: 0.4 })))
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.3, 10, 7), new THREE.MeshStandardMaterial({ color: 0x8a5f1c, metalness: 0.6, roughness: 0.5 })))
        return g
      }
      case '/team':
        return new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.7, 1),
          new THREE.MeshStandardMaterial({ color: 0xc8a08a, flatShading: true, roughness: 0.9 }),
        )
      case '/terms': {
        const g = new THREE.Group()
        for (let i = 0; i < 10; i++) {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.06, 0.02),
            new THREE.MeshStandardMaterial({ color: 0xe9e9e2, roughness: 1 }),
          )
          m.position.set(0, 1.9 - i * 0.16, -i * 0.4)
          g.add(m)
        }
        return g
      }
      case '/checkout': {
        const g = new THREE.Group()
        const card = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 2, 0.08),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, metalness: 0.1 }),
        )
        g.add(card)
        return g
      }
      default:
        return new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: accent }))
    }
  }
}
