#!/usr/bin/env -S npx vite-node
/** Hand trial 2: Patch "Base Hand" (Base Hand by Polyfork, https://polyfork.dev/asset/base-hand-e3398a, CC BY 4.0;
 * credited in public/THIRD_PARTY_NOTICES.txt). A left hand on a 26-joint rig; mirrored to a right hand and retargeted
 * onto the first-person hand and finger bones (each joint's bind frame carried onto ours, blended by its weights), then
 * tagged as a two-tone glove: back, palm, knuckle panel. Writes public/game-art/breachline/hero/hand-trial/hand.json.
 *   npx vite-node scripts/breachline-assets/hero/hand-trial.ts <hand.glb> */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { FP_HAND, UPPER, FORE, fb, makeArm } from '../../../src/games/breachline/render/hero/hands';

const glb = await readFile(process.argv.slice(2).find(a => a.endsWith('.glb'))!);
const jl = glb.readUInt32LE(12), gj = JSON.parse(glb.subarray(20, 20 + jl).toString('utf8')), bin = glb.subarray(20 + jl + 8);
const acc = (i: number) => {
  const a = gj.accessors[i], v = gj.bufferViews[a.bufferView], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type as 'VEC3']!, C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType as 5126]!;
  return new C(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * C.BYTES_PER_ELEMENT)) as Float32Array;
};
const skin = gj.skins[0], names: string[] = skin.joints.map((i: number) => gj.nodes[i].name), ibm = acc(skin.inverseBindMatrices);
const MIRROR = new THREE.Matrix4().makeScale(-1, 1, 1);
// Joint bind positions (mirrored to a right hand).
const jp = names.map((_, k) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ibm, k * 16).invert()).applyMatrix4(MIRROR));
const J = (n: string) => jp[names.indexOf(n)];

// Our bones in bind pose (right arm, arm space).
const arm = makeArm(1); arm.bones[0].updateMatrixWorld(true);
const ourM = (b: number) => arm.bones[b].matrixWorld.clone();
const W = new THREE.Vector3(0, 0, -(UPPER + FORE));
// The asset hand frame: fingers along -Z, index to little finger along +X, back of the hand +Y.
const fingersDir = J('middle-finger-phalanx-proximal').clone().sub(J('wrist')).normalize();
const across = J('pinky-finger-phalanx-proximal').clone().sub(J('index-finger-phalanx-proximal'));
const frame = (origin: THREE.Vector3, along: THREE.Vector3) => {
  const z = along.clone().negate().normalize(), x = across.clone().addScaledVector(z, -across.dot(z)).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
};
// Back of the hand up: the fingertips curl toward the palm, so the palm side is where the tips lie below the knuckles.
const hand0 = frame(J('wrist'), fingersDir), tipLocal = J('middle-finger-tip').clone().applyMatrix4(hand0.clone().invert());
const flip = tipLocal.y > 0; // tips above the hand plane would mean +Y is the palm: rotate the hand frame half a turn about Z
const fixFrame = (m: THREE.Matrix4) => (flip ? m.multiply(new THREE.Matrix4().makeRotationZ(Math.PI)) : m);
// Scale: wrist to the middle fingertip, ours against theirs.
const ourTip = (() => { const d = FP_HAND[2]; return d.len[0] + d.len[1] + d.len[2] + d.rad[3] + Math.abs(d.base[2]); })();
const scale = ourTip / J('middle-finger-tip').distanceTo(J('wrist'));
// Joint pairs: asset joint (segment start, next joint) to our bone; the rest ride the hand.
const FING = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const pair = new Map<number, { ours: number; asset: THREE.Matrix4 }>();
const handPair = { ours: 2, asset: fixFrame(hand0.clone()) };
const ourHandFrame = new THREE.Matrix4().makeTranslation(W.x, W.y, W.z);
FING.forEach((f, d) => {
  const segs = d === 0 ? ['metacarpal', 'phalanx-proximal', 'phalanx-distal', 'tip'] : ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'];
  for (let s = 0; s < 3; s++) {
    const a = J(`${f}-${segs[s]}`), b = J(`${f}-${segs[s + 1]}`);
    pair.set(names.indexOf(`${f}-${segs[s]}`), { ours: fb(d, s), asset: fixFrame(frame(a, b.clone().sub(a))) });
  }
  pair.set(names.indexOf(`${f}-tip`), pair.get(names.indexOf(`${f}-${segs[2]}`))!);
});
const S = new THREE.Matrix4().makeScale(scale, scale, scale);
const retarget = (k: number) => {
  const p = pair.get(k) ?? handPair, our = p.ours === 2 ? ourHandFrame : ourM(p.ours);
  return { ours: p.ours, m: our.clone().multiply(S).multiply(p.asset.clone().invert()) };
};
const RT = names.map((_, k) => retarget(k));

const pos: number[] = [], nor: number[] = [], tag: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
const v = new THREE.Vector3(), n = new THREE.Vector3(), acc3 = new THREE.Vector3(), accN = new THREE.Vector3(), nm = new THREE.Matrix3();
let tris = 0;
for (const node of gj.nodes.filter((x: { mesh?: number }) => x.mesh !== undefined)) {
  const pr = gj.meshes[node.mesh].primitives[0], P = acc(pr.attributes.POSITION), N = acc(pr.attributes.NORMAL), Jt = acc(pr.attributes.JOINTS_0), Wt = acc(pr.attributes.WEIGHTS_0), I = acc(pr.indices);
  const base = pos.length / 3, wn = (q: number) => (Wt instanceof Uint8Array ? Wt[q] / 255 : Wt instanceof Uint16Array ? Wt[q] / 65535 : Wt[q]);
  for (let i = 0; i < P.length / 3; i++) {
    v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(MIRROR); n.set(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]).applyMatrix4(MIRROR);
    acc3.set(0, 0, 0); accN.set(0, 0, 0);
    const byBone = new Map<number, number>();
    for (let k = 0; k < 4; k++) {
      const w = wn(i * 4 + k); if (w <= 0) continue;
      const r = RT[Jt[i * 4 + k]];
      acc3.addScaledVector(v.clone().applyMatrix4(r.m), w);
      accN.addScaledVector(n.clone().applyMatrix3(nm.getNormalMatrix(r.m)), w);
      byBone.set(r.ours, (byBone.get(r.ours) ?? 0) + w);
    }
    const ws = [...byBone].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = ws.reduce((s, q) => s + q[1], 0) || 1;
    pos.push(acc3.x, acc3.y, acc3.z); accN.normalize(); nor.push(accN.x, accN.y, accN.z);
    for (let k = 0; k < 4; k++) { si.push(ws[k]?.[0] ?? 0); sw.push((ws[k]?.[1] ?? 0) / tot); }
    // Glove regions in our bind pose: back (up-facing), palm (down-facing), knuckle panel (back, across the knuckles).
    const local = acc3.clone().sub(W);
    const knuckle = accN.y > 0.35 && local.z < -0.088 && local.z > -0.118 && local.x > -0.042 && local.x < 0.038;
    tag.push(knuckle ? 2 : accN.y > -0.2 ? 0 : 1);
  }
  // Mirroring flips the winding.
  for (let t = 0; t < I.length; t += 3) idx.push(base + I[t], base + I[t + 2], base + I[t + 1]);
  tris += I.length / 3;
}
console.log(`hand: ${tris} triangles, ${pos.length / 3} vertices, scale ${scale.toFixed(3)}, palm flip ${flip}`);
await mkdir('public/game-art/breachline/hero/hand-trial', { recursive: true });
const r4 = (a: number[]) => a.map(x => Math.round(x * 1e5) / 1e5);
await writeFile('public/game-art/breachline/hero/hand-trial/hand.json', JSON.stringify({ credit: 'Base Hand by Polyfork (https://polyfork.dev/asset/base-hand-e3398a), CC BY 4.0. Changed for Breachline: mirrored to a right hand, retargeted to the first-person rig, coloured as a glove.', pos: r4(pos), nor: r4(nor), tag, si, sw: r4(sw), idx }));
