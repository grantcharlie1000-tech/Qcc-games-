/** Loads Breachline's shipped art: KTX2/Basis textures (transcoded in a same-origin worker to whatever the GPU
 * reads: BC, ETC2 or ASTC), JPEG fallbacks if transcoding fails, binary glTF models and baked lightmaps. Reports
 * progress; any failure rejects, and the caller keeps the procedural look. */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export type Tier = 'low' | 'medium' | 'high';
export const ART_BASE = `${import.meta.env.BASE_URL}game-art/breachline/`;

/** three's KTX2Loader builds its transcoder worker from a blob: URL, which the site's CSP (worker-src 'self') forbids.
 * This one runs the identical worker from a file served by the site (written by scripts/breachline-assets/build.mjs). */
class SameOriginKTX2Loader extends KTX2Loader {
  init(): Promise<void> {
    const self = this as unknown as {
      transcoderPending?: Promise<void>; transcoderBinary?: ArrayBuffer; workerConfig: unknown;
      workerPool: { setWorkerCreator(f: () => Worker): void };
    };
    if (!self.transcoderPending) {
      self.transcoderPending = fetch(`${ART_BASE}basis/basis_transcoder.wasm`).then(r => {
        if (!r.ok) throw new Error(`Basis transcoder: ${r.status}`);
        return r.arrayBuffer();
      }).then(bin => {
        self.transcoderBinary = bin;
        self.workerPool.setWorkerCreator(() => {
          const worker = new Worker(`${ART_BASE}basis/ktx2-worker.js`), copy = bin.slice(0);
          worker.postMessage({ type: 'init', config: self.workerConfig, transcoderBinary: copy }, [copy]);
          return worker;
        });
      });
    }
    return self.transcoderPending;
  }
}

/** One KTX2 loader for every ArtLoader (world, fighters, weapons): the transcoder is fetched once and its workers
 * are shared, instead of once and a pool per loader. */
let sharedKtx2: SameOriginKTX2Loader | null = null, ktx2Users = 0;
export class ArtLoader {
  private ktx2 = sharedKtx2 ??= new SameOriginKTX2Loader();
  private released = false;
  private img = new THREE.TextureLoader();
  private gltf = new GLTFLoader();
  private total = 0;
  private done = 0;
  readonly textures: THREE.Texture[] = [];
  bytes = 0;
  constructor(renderer: THREE.WebGLRenderer, readonly tier: Tier, private progress: (fraction: number) => void = () => {}) {
    ktx2Users++;
    this.ktx2.detectSupport(renderer);
  }
  private track<T>(p: Promise<T>): Promise<T> {
    this.total++;
    return p.then(v => { this.done++; this.progress(this.done / this.total); return v; });
  }
  /** One map of a texture set at `size` texels; the 512 px JPEG if the transcoder cannot run. */
  texture(set: string, kind: 'diff' | 'nor' | 'arm', size: number): Promise<THREE.Texture> {
    const srgb = kind === 'diff';
    const finish = <T extends THREE.Texture>(t: T) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
      this.textures.push(t);
      return t;
    };
    const jpeg = () => this.img.loadAsync(`${ART_BASE}tex/${set}/${kind}-512.jpg`).then(t => { t.flipY = false; return finish(t); });
    // A worker that dies (a blocked script, say) never answers: give up after a while and use the JPEG.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('KTX2 transcoder timed out')), 20000));
    return this.track(Promise.race([this.ktx2.loadAsync(`${ART_BASE}tex/${set}/${kind}-${size}.ktx2`), timeout]).then(t => {
      const tex = t as THREE.CompressedTexture;
      for (const m of tex.mipmaps as { data?: ArrayBufferView }[]) this.bytes += m.data?.byteLength ?? 0;
      return finish(tex);
    }).catch(err => { console.warn('Breachline art: KTX2 failed, using JPEG', set, kind, err); return jpeg(); }));
  }
  /** A baked map: PNG, no mipmaps beyond what the GPU makes, not flipped (the baker writes row 0 at v = 0). */
  bakeMap(path: string, srgb: boolean): Promise<THREE.Texture> {
    return this.track(this.img.loadAsync(`${ART_BASE}${path}`).then(t => {
      t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.channel = 1;
      t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
      t.needsUpdate = true;
      this.textures.push(t);
      return t;
    }));
  }
  json<T>(path: string): Promise<T> {
    return this.track(fetch(`${ART_BASE}${path}`).then(r => { if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json() as Promise<T>; }));
  }
  model(name: string): Promise<GLTF> { return this.track(this.gltf.loadAsync(`${ART_BASE}models/${name}.glb`)); }
  dispose() {
    for (const t of this.textures) t.dispose();
    // The transcoder and its workers go with the last loader using them.
    if (this.released) return;
    this.released = true;
    if (--ktx2Users === 0 && sharedKtx2) { sharedKtx2.dispose(); sharedKtx2 = null; }
  }
}
