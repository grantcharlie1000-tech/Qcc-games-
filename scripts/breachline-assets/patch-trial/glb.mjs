// Minimal GLB reading and writing for the Patch trial (pure data: accessors, meshes, images; nothing executed).
import { readFile, writeFile } from 'node:fs/promises';

const COMP = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export async function readGlb(file) {
  const b = await readFile(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  const jl = b.readUInt32LE(12), json = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bo = 20 + jl, bl = b.readUInt32LE(bo), bin = b.subarray(bo + 8, bo + 8 + bl);
  const view = i => { const v = json.bufferViews[i]; return bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength); };
  const accessor = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], T = COMP[a.componentType], n = SIZE[a.type];
    const stride = v.byteStride ?? 0, src = view(a.bufferView), out = new T(a.count * n), es = T.BYTES_PER_ELEMENT;
    if (!stride || stride === n * es) { const s = src.subarray(a.byteOffset ?? 0, (a.byteOffset ?? 0) + a.count * n * es); out.set(new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.length))); }
    else for (let k = 0; k < a.count; k++) { const s = src.subarray((a.byteOffset ?? 0) + k * stride, (a.byteOffset ?? 0) + k * stride + n * es); out.set(new T(s.buffer.slice(s.byteOffset, s.byteOffset + s.length)), k * n); }
    if (a.normalized && T !== Float32Array) { const f = new Float32Array(out.length), m = T === Uint8Array ? 255 : T === Uint16Array ? 65535 : T === Int8Array ? 127 : 32767; for (let k = 0; k < out.length; k++) f[k] = Math.max(-1, out[k] / m); return f; }
    return out;
  };
  const image = i => view(json.images[i].bufferView);
  return { json, accessor, image };
}

/** Writes a GLB. `meshes`: [{ name, attributes: { POSITION: Float32Array(3n), NORMAL, TEXCOORD_0(2n), JOINTS_0: Uint16Array(4n), WEIGHTS_0: Float32Array(4n), _MASK: ... }, indices: Uint32Array, translation? }].
 * Nodes are flat, one per mesh. `extras` goes on the asset. No images: textures are shipped as separate files. */
export async function writeGlb(file, meshes, extras = {}) {
  const json = { asset: { version: '2.0', generator: 'Qcc-games patch-trial', extras }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [{ byteLength: 0 }] };
  const chunks = []; let off = 0;
  const push = (arr, target) => {
    const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - (off % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length, ...(target ? { target } : {}) });
    chunks.push(buf); off += buf.length; return json.bufferViews.length - 1;
  };
  const acc = (arr, type, ct, target, minmax) => {
    const n = SIZE[type], a = { bufferView: push(arr, target), componentType: ct, count: arr.length / n, type };
    if (minmax) { const mn = new Array(n).fill(Infinity), mx = new Array(n).fill(-Infinity); for (let k = 0; k < arr.length; k++) { const c = k % n; mn[c] = Math.min(mn[c], arr[k]); mx[c] = Math.max(mx[c], arr[k]); } a.min = mn; a.max = mx; }
    json.accessors.push(a); return json.accessors.length - 1;
  };
  for (const m of meshes) {
    const attributes = {};
    for (const [k, v] of Object.entries(m.attributes)) {
      if (k === 'POSITION') attributes[k] = acc(v, 'VEC3', 5126, 34962, true);
      else if (k === 'NORMAL') attributes[k] = acc(v, 'VEC3', 5126, 34962);
      else if (k === 'TANGENT') attributes[k] = acc(v, 'VEC4', 5126, 34962);
      else if (k.startsWith('TEXCOORD')) attributes[k] = acc(v, 'VEC2', 5126, 34962);
      else if (k === 'JOINTS_0') attributes[k] = acc(v, 'VEC4', 5123, 34962);
      else if (k === 'WEIGHTS_0') attributes[k] = acc(v, 'VEC4', 5126, 34962);
      else attributes[k] = acc(v, v.length === (m.attributes.POSITION.length / 3) ? 'SCALAR' : 'VEC4', 5126, 34962);
    }
    json.meshes.push({ name: m.name, primitives: [{ attributes, indices: acc(m.indices, 'SCALAR', 5125, 34963), mode: 4 }] });
    json.nodes.push({ name: m.name, mesh: json.meshes.length - 1, ...(m.translation ? { translation: m.translation } : {}), ...(m.extras ? { extras: m.extras } : {}) });
    json.scenes[0].nodes.push(json.nodes.length - 1);
  }
  const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
  json.buffers[0].byteLength = off;
  let js = Buffer.from(JSON.stringify(json)); const jp = (4 - (js.length % 4)) % 4; js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bin = Buffer.concat(chunks), head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  await writeFile(file, Buffer.concat([head, jh, js, bh, bin]));
}

/** One mesh's first primitive, with its node transform applied (translation/rotation/scale only, no parents). */
export function primitive(g, nodeIndex) {
  const node = g.json.nodes[nodeIndex], p = g.json.meshes[node.mesh].primitives[0];
  const pos = g.accessor(p.attributes.POSITION), nrm = p.attributes.NORMAL !== undefined ? g.accessor(p.attributes.NORMAL) : null;
  const uv = p.attributes.TEXCOORD_0 !== undefined ? g.accessor(p.attributes.TEXCOORD_0) : null;
  const idx = p.indices !== undefined ? Uint32Array.from(g.accessor(p.indices)) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  return { node, pos, nrm, uv, idx, material: p.material };
}
