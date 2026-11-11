/** Loads Breachline's shipped art: GPU-compressed textures (KTX 1.1 with BC1/BC5 blocks, read by three's KTXLoader,
 * no WebAssembly), JPEG fallbacks where the GPU has no S3TC, binary glTF models and baked lightmaps. Reports
 * progress; any failure rejects, and the caller keeps the procedural look. */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTXLoader } from 'three/examples/jsm/loaders/KTXLoader.js';

export type Tier = 'low' | 'medium' | 'high';
export const ART_BASE = `${import.meta.env.BASE_URL}game-art/breachline/`;

/** sRGB BC1, which three expresses as the linear format plus an sRGB colour space. */
const BC1_SRGB = 0x8c4c;

export class ArtLoader {
  private ktx = new KTXLoader();
  private img = new THREE.TextureLoader();
  private gltf = new GLTFLoader();
  readonly compressed: boolean;
  private total = 0;
  private done = 0;
  readonly textures: THREE.Texture[] = [];
  bytes = 0;
  constructor(renderer: THREE.WebGLRenderer, readonly tier: Tier, private progress: (fraction: number) => void = () => {}) {
    this.compressed = renderer.extensions.has('WEBGL_compressed_texture_s3tc') && renderer.extensions.has('EXT_texture_compression_rgtc') && renderer.extensions.has('WEBGL_compressed_texture_s3tc_srgb');
  }
  private track<T>(p: Promise<T>): Promise<T> {
    this.total++;
    return p.then(v => { this.done++; this.progress(this.done / this.total); return v; });
  }
  /** One map of a texture set. `size` is the texel size wanted; the fallback is always 512 px JPEG. */
  texture(set: string, kind: 'diff' | 'nor' | 'arm', size: number): Promise<THREE.Texture> {
    const srgb = kind === 'diff';
    if (!this.compressed) {
      return this.track(this.img.loadAsync(`${ART_BASE}tex/${set}/${kind}-512.jpg`).then(t => {
        t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.needsUpdate = true;
        this.textures.push(t);
        return t;
      }));
    }
    const url = `${ART_BASE}tex/${set}/${kind}-${size}.ktx`;
    return this.track(this.ktxTexture(url, srgb).catch(err => {
      // The 1K BC files are local build outputs until phase 1 ships KTX2; fall back to the committed 512 px set.
      if (size > 512) return this.texture(set, kind, 512);
      throw err;
    }));
  }
  /** Fetches and parses a KTX 1.1 file. A missing file can come back as the site's HTML page, so check the magic. */
  private async ktxTexture(url: string, srgb: boolean): Promise<THREE.CompressedTexture> {
    const r = await fetch(url);
    const buf = r.ok ? await r.arrayBuffer() : null;
    const magic = buf && buf.byteLength > 64 ? new Uint8Array(buf, 0, 12) : null;
    if (!buf || !magic || magic[0] !== 0xab || magic[1] !== 0x4b || magic[2] !== 0x54 || magic[3] !== 0x58) throw new Error(`not a KTX file: ${url}`);
    const d = this.ktx.parse(buf, true) as { mipmaps: { data: Uint8Array; width: number; height: number }[]; width: number; height: number; format: number };
    const tex = new THREE.CompressedTexture(d.mipmaps, d.width, d.height, (d.format === BC1_SRGB ? THREE.RGB_S3TC_DXT1_Format : d.format) as THREE.CompressedPixelFormat);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    for (const m of d.mipmaps) this.bytes += m.data.byteLength;
    this.textures.push(tex);
    return tex;
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
  dispose() { for (const t of this.textures) t.dispose(); }
}
