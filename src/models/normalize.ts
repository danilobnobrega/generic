import * as THREE from 'three'

export interface Normalized {
  object: THREE.Object3D
  /** original bounding box size, before scaling */
  originalSize: THREE.Vector3
  /** uniform scale that was applied */
  scale: number
  triangles: number
}

/**
 * Sketchfab exports arrive at arbitrary scale and offset (one of ours sits at
 * y≈25, the other is 150 units wide). Recenter on the origin, drop the base to
 * y=0, and scale so the largest dimension is `targetSize`.
 */
export function normalizeModel(
  source: THREE.Object3D,
  targetSize = 1,
  opts: { floor?: boolean } = {},
): Normalized {
  const { floor = true } = opts
  const object = source
  object.updateWorldMatrix(true, true)

  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = targetSize / maxDim

  const wrapper = new THREE.Group()
  object.position.sub(center) // origin at centroid
  wrapper.add(object)
  wrapper.scale.setScalar(scale)

  if (floor) {
    // sit it on the floor
    const scaledBox = new THREE.Box3().setFromObject(wrapper)
    wrapper.position.y -= scaledBox.min.y
  }

  let triangles = 0
  wrapper.traverse((child) => {
    const mesh = child as THREE.Mesh
    const geo = mesh.geometry
    if (geo) {
      const idx = geo.getIndex()
      triangles += idx ? idx.count / 3 : (geo.getAttribute('position')?.count ?? 0) / 3
    }
    if (mesh.isMesh) {
      mesh.castShadow = true
      mesh.receiveShadow = true
    }
  })

  return { object: wrapper, originalSize: size, scale, triangles: Math.round(triangles) }
}
