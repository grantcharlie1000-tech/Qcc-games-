/** Baked texture sets for fighters (made offline by scripts/breachline-assets/fighters/bake.ts). Per variant and level
 * of detail: albedo, tangent-space normal and occlusion/roughness/metalness as KTX2, and `uv.bin`: the unwrap of the
 * very mesh `figure.ts` builds (for each output vertex its source vertex, then the index, then the UVs). The game
 * applies that to its own mesh, after checking the vertex count, and draws it with one standard PBR material: diffuse
 * from the light probe, specular from the room's reflection probe (as the fighter material does). If anything fails to
 * load or does not match, the fighter keeps its procedural material. */
import * as THREE from 'three';
import { ART_BASE, ArtLoader } from '../assets';
import { FIGHTER_SETS, type FighterSetMeta } from './sets';

export { BAKED, FIGHTER_SETS } from './sets';

export interface FighterLevel { data: ArrayBuffer; level: FighterSetMeta['levels'][number]; maps: { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }; geo?: THREE.BufferGeometry | null }
export interface FighterTextures { levels: (FighterLevel | null)[] }

/** The textured geometry for a level, made from the built mesh on first use; null if it does not match. */
export function texturedGeometry(t: FighterTextures, lod: number, built: () => THREE.BufferGeometry): THREE.BufferGeometry | null {
  const lv = t.levels[lod];
  if (!lv) return null;
  if (lv.geo === undefined) {
    lv.geo = applyUnwrap(built(), lv.data, lv.level);
    if (!lv.geo) console.warn(`Breachline fighters: level ${lod} of the baked set does not match the built mesh; keeping the procedural look`);
  }
  return lv.geo;
}

/** Rebuilds a geometry with the bake's split vertices and UVs. Every attribute is copied from its source vertex. */
export function applyUnwrap(src: THREE.BufferGeometry, data: ArrayBuffer, level: FighterSetMeta['levels'][number]): THREE.BufferGeometry | null {
  if (src.getAttribute('position').count !== level.vertices) return null;
  const n = level.outVertices, remapBytes = n * (level.wide ? 4 : 2);
  const remap = level.wide ? new Uint32Array(data, 0, n) : new Uint16Array(data, 0, n);
  const index = new Uint32Array(data.slice(remapBytes, remapBytes + level.indices * 4));
  const uvq = new Uint16Array(data.slice(remapBytes + level.indices * 4, remapBytes + level.indices * 4 + n * 4));
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const A = src.getAttribute(name) as THREE.BufferAttribute, k = A.itemSize, arr = new (A.array.constructor as Float32ArrayConstructor)(n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) arr[i * k + j] = A.array[remap[i] * k + j];
    out.setAttribute(name, new THREE.BufferAttribute(arr, k, A.normalized));
  }
  const uv = new Float32Array(n * 2); for (let i = 0; i < n * 2; i++) uv[i] = uvq[i] / 65535;
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

/** Loads a squad's baked set: UV data and maps for every level (geometry is made later, when a level is needed). */
export async function loadFighterTextures(renderer: THREE.WebGLRenderer, squad: 0 | 1): Promise<FighterTextures> {
  const name = FIGHTER_SETS[squad], base = `${ART_BASE}fighters/${name}/`;
  const meta = await fetch(`${base}set.json`).then(r => { if (!r.ok) throw new Error(`${r.status} set.json`); return r.json() as Promise<FighterSetMeta>; });
  const loader = new ArtLoader(renderer, 'high');
  const out: FighterTextures = { levels: [null, null, null] };
  await Promise.all(meta.levels.map(async lv => {
    const [sd, sn, sa] = lv.sizes;
    // ArtLoader reads tex/<set>/<kind>-<size>.ktx2: a relative set name reaches this folder.
    const set = `../fighters/${name}/l${lv.lod}`;
    const [data, map, normalMap, arm] = await Promise.all([
      fetch(`${base}l${lv.lod}/uv.bin`).then(r => { if (!r.ok) throw new Error(`${r.status} uv.bin`); return r.arrayBuffer(); }),
      loader.texture(set, 'diff', sd), loader.texture(set, 'nor', sn), loader.texture(set, 'arm', sa),
    ]);
    for (const t of [map, normalMap, arm]) { t.flipY = false; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
    out.levels[lv.lod] = { data, level: lv, maps: { map, normalMap, arm } };
  }));
  return out;
}

export interface TexturedFighterMaterial extends THREE.MeshStandardMaterial { userData: { probe: { value: THREE.Color } } }

/** One standard PBR material for a baked set, with the lighting split the probes need: the reflection probe for
 * specular only, the light probe as diffuse irradiance (uniform `uProbe`). */
export function texturedFighterMaterial(maps: { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }): TexturedFighterMaterial {
  const m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normalMap, aoMap: maps.arm, roughnessMap: maps.arm, metalnessMap: maps.arm, roughness: 1, metalness: 1 }) as TexturedFighterMaterial;
  const probe = { value: new THREE.Color(0.5, 0.5, 0.5) };
  m.userData.probe = probe;
  m.customProgramCacheKey = () => 'fighter-baked';
  m.onBeforeCompile = shader => {
    shader.uniforms.uProbe = probe;
    const maps = THREE.ShaderChunk.lights_fragment_maps.replace(/iblIrradiance \+= getIBLIrradiance\( geometryNormal \);/, '');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uProbe;')
      .replace('#include <lights_fragment_maps>', `${maps}\niblIrradiance += uProbe;`);
  };
  return m;
}
