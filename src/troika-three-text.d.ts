declare module 'troika-three-text' {
  import { Mesh, Material } from 'three'

  export class Text extends Mesh {
    text: string
    font: string | null
    fontSize: number
    lineHeight: number | 'normal'
    letterSpacing: number
    maxWidth: number
    textAlign: 'left' | 'right' | 'center' | 'justify'
    whiteSpace: 'normal' | 'nowrap'
    anchorX: number | 'left' | 'center' | 'right' | string
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom' | string
    color: number | string
    fillOpacity: number
    outlineWidth: number | string
    outlineColor: number | string
    outlineOpacity: number
    curveRadius: number
    material: Material | Material[]
    sync(callback?: () => void): void
    dispose(): void
  }

  export function preloadFont(
    options: { font?: string; characters?: string | string[] },
    callback: () => void,
  ): void
}
