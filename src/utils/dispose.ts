import * as THREE from 'three'

/**
 * Recursively free every GPU resource under an object. Called on room exit —
 * the whole point of disconnected worlds is that leaving one costs nothing.
 */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()

    const material = mesh.material
    if (!material) return
    const materials = Array.isArray(material) ? material : [material]
    for (const mat of materials) {
      for (const key of Object.keys(mat)) {
        const value = (mat as unknown as Record<string, unknown>)[key]
        if (value instanceof THREE.Texture) value.dispose()
      }
      mat.dispose()
    }
  })
}

export function disposeScene(scene: THREE.Scene): void {
  disposeObject(scene)
  scene.clear()
}
