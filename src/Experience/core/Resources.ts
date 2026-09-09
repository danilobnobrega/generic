import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EventEmitter } from './EventEmitter'

export type AssetSource =
  | { name: string; type: 'gltf'; path: string }
  | { name: string; type: 'texture'; path: string }
  | { name: string; type: 'ktx2'; path: string }
  | { name: string; type: 'audio'; path: string }

type Loaded = GLTF | THREE.Texture | AudioBuffer

interface ResourcesEvents extends Record<string, unknown> {
  progress: { loaded: number; total: number }
  ready: { name: string }
}

const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
const KTX2_PATH = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/libs/basis/'

/**
 * Per-room asset loader. Each room declares its `AssetSource[]`; nothing is
 * fetched until the room is entered, so payload stays route-split.
 */
export class Resources extends EventEmitter<ResourcesEvents> {
  private gltfLoader: GLTFLoader
  private textureLoader = new THREE.TextureLoader()
  private ktx2Loader: KTX2Loader
  private audioContext = new AudioContext()

  private cache = new Map<string, Loaded>()

  constructor(renderer: THREE.WebGLRenderer) {
    super()

    const draco = new DRACOLoader()
    draco.setDecoderPath(DRACO_PATH)

    this.gltfLoader = new GLTFLoader()
    this.gltfLoader.setDRACOLoader(draco)

    this.ktx2Loader = new KTX2Loader()
    this.ktx2Loader.setTranscoderPath(KTX2_PATH)
    this.ktx2Loader.detectSupport(renderer)
    this.gltfLoader.setKTX2Loader(this.ktx2Loader)
  }

  get<T extends Loaded>(name: string): T | undefined {
    return this.cache.get(name) as T | undefined
  }

  async load(sources: AssetSource[]): Promise<Map<string, Loaded>> {
    const total = sources.length
    let loaded = 0
    const out = new Map<string, Loaded>()

    await Promise.all(
      sources.map(async (source) => {
        if (this.cache.has(source.name)) {
          out.set(source.name, this.cache.get(source.name)!)
        } else {
          const asset = await this.loadOne(source)
          this.cache.set(source.name, asset)
          out.set(source.name, asset)
        }
        loaded += 1
        this.emit('progress', { loaded, total })
        this.emit('ready', { name: source.name })
      }),
    )

    return out
  }

  private async loadOne(source: AssetSource): Promise<Loaded> {
    switch (source.type) {
      case 'gltf':
        return this.gltfLoader.loadAsync(source.path)
      case 'texture': {
        const tex = await this.textureLoader.loadAsync(source.path)
        tex.colorSpace = THREE.SRGBColorSpace
        return tex
      }
      case 'ktx2':
        return this.ktx2Loader.loadAsync(source.path)
      case 'audio': {
        const res = await fetch(source.path)
        return this.audioContext.decodeAudioData(await res.arrayBuffer())
      }
    }
  }
}
