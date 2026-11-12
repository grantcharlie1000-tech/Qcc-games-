#!/usr/bin/env -S npx vite-node
/** Arms asset trial: the Patch "Tactical soldier in black" (CC-BY-4.0, credited in patch-trial/STATUS.md) arms from
 * the shoulder down, moved into the first-person arm's bind pose (shoulder at the origin, arm along -Z, back of the
 * hand up) and bound to its upper arm, forearm and hand bones. Its skeleton has no finger bones, so the fingers stay
 * as modelled. Writes public/game-art/breachline/hero/arms-trial/arms.bin (right arm; the left is its mirror). */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { JOINT, SIDE, UPPER_LEN, FORE_LEN, armDir } from '../../../src/games/breachline/render/fighters/skeleton';
import { FORE, UPPER } from '../../../src/games/breachline/render/hero/hands';
import { packMeshBin } from '../../../src/games/breachline/render/hero/meshbin';

const glb = await readFile('public/game-art/breachline/patch/tactical/body-skinned.glb');
const jl = glb.readUInt32LE(12), gj = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8')), bin = glb.subarray(20 + jl + 8);
const acc = (i: number) => {
  const a = gj.accessors[i], v = gj.bufferViews[a.bufferView], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'VEC3']!, C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType as 5126]!;
  return new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * C.BYTES_PER_ELEMENT)) as Float32Array;
};
const prim = gj.meshes.find((m: { name: string }) => m.name === 'body_lod0').primitives[0];
const P = acc(prim.attributes.POSITION), N = acc(prim.attributes.NORMAL), T = acc(prim.attributes.TEXCOORD_0), J = acc(prim.attributes.JOINTS_0), W = acc(prim.attributes.WEIGHTS_0), I = acc(prim.indices);
const S = SIDE[1], wn = (k: number) => (W instanceof Uint8Array ? W[k] / 255 : W[k]);
// Our bone for each of the asset's arm bones (fingers ride the hand).
const MAP = new Map<number, number>([[S.delt, 0], [S.upper, 0], [S.elbow, 1], [S.fore, 1], [S.twist, 1], [S.hand, 2]]);
const dominant = (v: number) => { let b = -1, w = 0; for (let k = 0; k < 4; k++) if (wn(v * 4 + k) > w) { w = wn(v * 4 + k); b = J[v * 4 + k]; } return b; };
// The arm frame in the asset's bind pose: shoulder, along the arm, outward (the back of the hand).
const sh = JOINT[S.upper], d = armDir(1), out = new THREE.Vector3(1, 0, 0).addScaledVector(d, -d.x).normalize(), side = new THREE.Vector3().crossVectors(d, out);
const toArm = (x: number, y: number, z: number, o: THREE.Vector3) => {
  const p = new THREE.Vector3(x, y, z).sub(sh), t = p.dot(d), a = p.dot(out), b = p.dot(side);
  const t2 = t < UPPER_LEN ? t * (UPPER / UPPER_LEN) : UPPER + (t - UPPER_LEN) * (FORE / FORE_LEN);
  // FP arm space: along -Z, back of the hand +Y; `side` completes a right-handed frame as +X.
  return o.set(b, a, -t2);
};
const keep = new Map<number, number>(), pos: number[] = [], nor: number[] = [], uv: number[] = [], bone: number[] = [], idx: number[] = [];
let handTris = 0;
const v3 = new THREE.Vector3();
for (let t = 0; t < I.length; t += 3) {
  const vs = [I[t], I[t + 1], I[t + 2]], bs = vs.map(dominant);
  if (!bs.every(b => MAP.has(b))) continue;
  // Keep the shoulder cap out of view: nothing above the deltoid's own top.
  if (bs.every(b => MAP.get(b) === 2)) handTris++;
  for (const v of vs) {
    let n = keep.get(v);
    if (n === undefined) {
      n = pos.length / 3; keep.set(v, n);
      toArm(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], v3); pos.push(v3.x, v3.y, v3.z);
      const nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2], nv = new THREE.Vector3(nx, ny, nz);
      nor.push(nv.dot(side), nv.dot(out), -nv.dot(d));
      uv.push(T[v * 2], T[v * 2 + 1]); bone.push(MAP.get(dominant(v))!);
    }
    idx.push(n);
  }
}
const tris = idx.length / 3;
console.log(`right arm: ${tris} triangles (hand ${handTris}), ${pos.length / 3} vertices`);
await mkdir('public/game-art/breachline/hero/arms-trial', { recursive: true });
await writeFile('public/game-art/breachline/hero/arms-trial/arms.bin', packMeshBin([{ name: 'arm', m: { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), bone: Uint8Array.from(bone), flags: new Uint8Array(bone.length), idx: Uint32Array.from(idx) } }], { triangles: tris, handTriangles: handTris, source: 'Patch Tactical soldier in black, CC-BY-4.0' }));
