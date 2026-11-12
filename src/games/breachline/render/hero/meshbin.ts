/** The baked weapon mesh format (`mesh.bin` beside a weapon's texture set): written offline by
 * scripts/breachline-assets/hero/sculpt.ts, read here at load. Layout: "BLM1", u32 header length, a JSON header, then
 * 4-byte aligned arrays: position f32×3 (metres, sight-line frame), normal i16×3 (normalised), uv f32×2, bone u8,
 * flags u8 (1 = glowing reticle), index u16 or u32; optionally a second mesh (the lens) in the same layout. */
import * as THREE from 'three';

export interface MeshBinHeader {
  meshes: { name: string; vertices: number; indices: number; offset: number }[];
  /** Free-form facts from the baker (triangles, texel density, part names). */
  info?: Record<string, unknown>;
}

const MAGIC = 0x314d4c42; // "BLM1"
const align = (n: number) => (n + 3) & ~3;

/** Bytes for one mesh's arrays (in order), given counts. */
export function meshBytes(v: number, i: number): number {
  return align(v * 12) + align(v * 6) + align(v * 8) + align(v) + align(v) + align(i * (v > 65535 ? 4 : 2));
}

export interface MeshArrays { pos: Float32Array; nor: Float32Array; uv: Float32Array; bone: Uint8Array; flags: Uint8Array; idx: Uint32Array }

/** Packs meshes into the binary format (offline). */
export function packMeshBin(meshes: { name: string; m: MeshArrays }[], info: Record<string, unknown> = {}): Uint8Array {
  const header: MeshBinHeader = { meshes: [], info };
  let off = 0;
  for (const { name, m } of meshes) { const v = m.pos.length / 3, i = m.idx.length; header.meshes.push({ name, vertices: v, indices: i, offset: off }); off += meshBytes(v, i); }
  const json = new TextEncoder().encode(JSON.stringify(header)), hl = align(json.length), start = 8 + hl;
  const buf = new ArrayBuffer(start + off), dv = new DataView(buf), u8 = new Uint8Array(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, hl, true); u8.set(json, 8); u8.fill(32, 8 + json.length, start);
  meshes.forEach(({ m }, k) => {
    const h = header.meshes[k], v = h.vertices;
    let p = start + h.offset;
    new Float32Array(buf, p, v * 3).set(m.pos); p += align(v * 12);
    const n = new Int16Array(buf, p, v * 3); for (let q = 0; q < v * 3; q++) n[q] = Math.round(Math.max(-1, Math.min(1, m.nor[q])) * 32767); p += align(v * 6);
    new Float32Array(buf, p, v * 2).set(m.uv); p += align(v * 8);
    u8.set(m.bone, p); p += align(v);
    u8.set(m.flags, p); p += align(v);
    if (v > 65535) new Uint32Array(buf, p, h.indices).set(m.idx); else new Uint16Array(buf, p, h.indices).set(m.idx);
  });
  return u8;
}

/** Reads the binary format into geometries ready for a rigid-skinned mesh (skinIndex = bone, weight 1) and the
 * hero materials (`pbr.w` = 8 marks the glowing reticle). */
export function readMeshBin(data: ArrayBuffer): { geometries: Map<string, THREE.BufferGeometry>; header: MeshBinHeader } {
  const dv = new DataView(data);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a Breachline mesh');
  const hl = dv.getUint32(4, true), header = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 8, hl))) as MeshBinHeader, start = 8 + hl;
  const geometries = new Map<string, THREE.BufferGeometry>();
  for (const h of header.meshes) {
    const v = h.vertices; let p = start + h.offset;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.slice(p, p + v * 12)), 3)); p += align(v * 12);
    g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(data.slice(p, p + v * 6)), 3, true)); p += align(v * 6);
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(data.slice(p, p + v * 8)), 2)); p += align(v * 8);
    const bone = new Uint8Array(data, p, v); p += align(v);
    const flags = new Uint8Array(data, p, v); p += align(v);
    const si = new Uint16Array(v * 4), sw = new Float32Array(v * 4), pbr = new Float32Array(v * 4);
    for (let q = 0; q < v; q++) { si[q * 4] = bone[q]; sw[q * 4] = 1; pbr[q * 4 + 1] = 0.5; pbr[q * 4 + 3] = flags[q] & 1 ? 8 : 0; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setAttribute('pbr', new THREE.BufferAttribute(pbr, 4));
    g.setIndex(new THREE.BufferAttribute(v > 65535 ? new Uint32Array(data.slice(p, p + h.indices * 4)) : new Uint16Array(data.slice(p, p + h.indices * 2)), 1));
    g.computeBoundingSphere();
    geometries.set(h.name, g);
  }
  return { geometries, header };
}
