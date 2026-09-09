import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/**
 * A plain freestanding tub — a rounded ceramic body with a carved basin and a
 * low plinth. Built entirely from RoundedBoxGeometry (no extrude / no CSG), so
 * it always renders. Generic. Refine or swap for a real model later.
 */
export function makeTub(): THREE.Group {
  const g = new THREE.Group()

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: 0xf5f4f1,
    roughness: 0.16,
    clearcoat: 0.75,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.1,
  })

  const L = 1.75
  const Wd = 0.88
  const height = 0.6

  // solid outer body
  const body = new THREE.Mesh(new RoundedBoxGeometry(L, height, Wd, 6, 0.2), ceramic)
  body.position.y = height / 2
  g.add(body)

  // carved basin — a smaller box, inside-out, poking through the top
  const basin = new THREE.Mesh(
    new RoundedBoxGeometry(L - 0.24, height - 0.14, Wd - 0.24, 6, 0.14),
    new THREE.MeshPhysicalMaterial({
      color: 0xefeeea,
      roughness: 0.2,
      clearcoat: 0.6,
      side: THREE.BackSide,
    }),
  )
  basin.position.y = height / 2 + 0.09
  g.add(basin)

  // low plinth
  const plinth = new THREE.Mesh(
    new RoundedBoxGeometry(L - 0.16, 0.12, Wd - 0.12, 3, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xeae8e2, roughness: 0.55 }),
  )
  plinth.position.y = 0.05
  g.add(plinth)

  return g
}
