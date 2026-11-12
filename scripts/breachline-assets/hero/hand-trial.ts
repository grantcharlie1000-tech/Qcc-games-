#!/usr/bin/env -S npx vite-node
/** Hand trial 2: Patch "Base Hand" (Base Hand by Polyfork, https://polyfork.dev/asset/base-hand-e3398a, CC BY 4.0;
 * credited in public/THIRD_PARTY_NOTICES.txt). A left hand on a 26-joint rig; mirrored to a right hand and retargeted
 * onto the first-person hand and finger bones (each joint's bind frame carried onto ours, blended by its weights), then
 * tagged as a glove: back, palm, knuckle panel. Welded and smoothed here, unwrapped, and a glove texture set baked in
 * the bind pose (region colours, stitched seams on the region borders, a padded knuckle panel, weave on the back,
 * grain on the palm). Writes public/game-art/breachline/hero/hand-trial/hand.json and its set (1024 and 512).
 *   npx vite-node scripts/breachline-assets/hero/hand-trial.ts <hand.glb> */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { chartUnwrap } from './chart';
import { writeSet } from './ktx';
import { STRIDE, dilate, encodeNormal, fbm, lin, srgb8, sstep, texelFrames } from './texels';
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

// Weld the asset's seams and smooth (as the game did at load), then unwrap: charts never cross a region border.
let g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
g.setAttribute('skinIndex', new THREE.Float32BufferAttribute(si, 4));
g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
g.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
g.setIndex(idx);
g = mergeVertices(g, 1e-5); g.computeVertexNormals();
const GP = g.getAttribute('position').array as Float32Array, GN = g.getAttribute('normal').array as Float32Array, GT = g.getAttribute('tag'), GI = g.index!.array;
const nv = GP.length / 3, gtag = Uint8Array.from({ length: nv }, (_, i) => GT.getX(i));
const TS = 1024;
const u = chartUnwrap({ pos: GP, nor: GN, uv: new Float32Array(nv * 2), bone: new Uint8Array(nv), flags: new Uint8Array(nv), part: gtag, idx: Uint32Array.from(GI) },
  { size: TS, pad: 4, axisWeight: [1, 1, 1.3, 0.9, 1, 0.8], partWeight: () => 1 });
const m = u.mesh, nOut = m.pos.length / 3;
console.log(`glove: ${u.charts} charts, ${(u.coverage * 100).toFixed(0)} % of the atlas`);

// Region borders as segments (mm): in each triangle with mixed regions, between the midpoints of its mixed edges.
const seg: number[] = [];
const mid = (a: number, b: number) => [0, 1, 2].map(q => (GP[a * 3 + q] + GP[b * 3 + q]) * 500);
for (let t = 0; t < GI.length; t += 3) {
  const v = [GI[t], GI[t + 1], GI[t + 2]], mixed: number[][] = [];
  for (let k = 0; k < 3; k++) if (gtag[v[k]] !== gtag[v[(k + 1) % 3]]) mixed.push(mid(v[k], v[(k + 1) % 3]));
  if (mixed.length === 2) seg.push(...mixed[0], ...mixed[1]);
}
const nseg = seg.length / 6;
// Seams down the finger valleys on the back of the hand, from the knuckle row toward the fingers (wrist frame, mm).
const ZW = W.z * 1000, VALLEYS = [1, 2, 3].map(d => (FP_HAND[d].base[0] + FP_HAND[d + 1].base[0]) * 500);
/** Distance (mm) to the nearest seam (a region border, or a valley seam on the back) and the distance along it. */
function seam(x: number, y: number, z: number, ny: number): [number, number] {
  const b = border(x, y, z), lz = z - ZW;
  if (ny > 0.3 && lz < -95 && lz > -140) for (const xv of VALLEYS) { const d = Math.abs(x - xv); if (d < b[0]) { b[0] = d; b[1] = lz; } }
  return b;
}
/** Distance (mm) to the nearest border and the distance along that segment. */
function border(x: number, y: number, z: number): [number, number] {
  let best = 1e9, along = 0;
  for (let i = 0; i < nseg; i++) {
    const o = i * 6, ax = seg[o], ay = seg[o + 1], az = seg[o + 2], dx = seg[o + 3] - ax, dy = seg[o + 4] - ay, dz = seg[o + 5] - az;
    const L2 = dx * dx + dy * dy + dz * dz || 1e-9, t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2));
    const ex = x - ax - dx * t, ey = y - ay - dy * t, ez = z - az - dz * t, d = ex * ex + ey * ey + ez * ez;
    if (d < best) { best = d; along = ax * 0.7 + ay * 1.3 + az + t * Math.sqrt(L2); }
  }
  return [Math.sqrt(best), along];
}

// Paint. Region from the barycentric vote of the triangle's vertex tags; height (mm) from seams, padding, weave.
const { list, n: nTex, rec, tan, tri, bary } = texelFrames(m, TS, 0);
const COL = [lin(0x857b67), lin(0x4a443b), lin(0x2c2d2a)];
const diff = Buffer.alloc(TS * TS * 4), gNor = Buffer.alloc(TS * TS * 4), gArm = Buffer.alloc(TS * TS * 4), filled = new Uint8Array(TS * TS);
let NY = 0;
const height = (x: number, y: number, z: number, region: number): number => {
  const [d, along] = seam(x, y, z, NY);
  let h = -0.6 * Math.exp(-(d * d) / 1.6); // the seam groove
  // Stitches: a row of dashes 2.8 mm off the seam on each side.
  h += 0.25 * Math.exp(-((d - 2.8) ** 2) / 0.45) * sstep(0.2, 0.6, Math.sin(along * 1.3) * 0.5 + 0.5);
  if (region === 2) h += 1.0 * sstep(0, 3, d) + 0.35 * Math.sin(x * 0.9); // padded panel with ribs across the knuckles
  else if (region === 0) h += 0.05 * Math.sin(x * 5.2 + z * 1.1) * Math.sin(z * 5.2 - x * 1.1); // weave
  else h += 0.08 * (fbm(x * 1.6, y * 1.6, z * 1.6, 2) - 0.5); // grain
  return h;
};
for (let j = 0; j < nTex; j++) {
  const k = list[j], o = j * STRIDE, x = rec[o], y = rec[o + 1], z = rec[o + 2], t = tri[j];
  const w = [bary[j * 2], bary[j * 2 + 1], 1 - bary[j * 2] - bary[j * 2 + 1]], vote = [0, 0, 0];
  for (let q = 0; q < 3; q++) vote[m.part[m.idx[t * 3 + q]]] += Math.max(0, w[q]);
  const region = vote[2] > vote[0] && vote[2] > vote[1] ? 2 : vote[1] > vote[0] ? 1 : 0;
  const N0 = [rec[o + 3], rec[o + 4], rec[o + 5]], e = 0.15; NY = N0[1]; const h0 = height(x, y, z, region);
  const g3 = [height(x + e, y, z, region) - h0, height(x, y + e, z, region) - h0, height(x, y, z + e, region) - h0].map(v => v / e);
  const gn = g3[0] * N0[0] + g3[1] * N0[1] + g3[2] * N0[2], hn = [0, 1, 2].map(q => N0[q] - (g3[q] - gn * N0[q]));
  const hl = Math.hypot(hn[0], hn[1], hn[2]); for (let q = 0; q < 3; q++) hn[q] /= hl;
  const [d, along] = seam(x, y, z, NY), blot = fbm(x * 0.08, y * 0.08, z * 0.08, 3), fine = fbm(x * 0.9, y * 0.9, z * 0.9, 2);
  const groove = Math.exp(-(d * d) / 1.8), stitch = Math.exp(-((d - 2.8) ** 2) / 0.45) * sstep(0.2, 0.6, Math.sin(along * 1.3) * 0.5 + 0.5);
  // Wear: lighter, smoother on the fingertip pads and the palm heel.
  const pad = region === 1 ? sstep(0.55, 0.75, fbm(x * 0.15 + 4, y * 0.15, z * 0.15, 2)) * 0.25 : 0;
  const alb = COL[region].map(c => c * (0.92 + (blot - 0.5) * 0.18 + (fine - 0.5) * 0.08) * (1 - groove * 0.6) * (1 + pad * 0.4));
  const st = lin(0xb3ab96); for (let q = 0; q < 3; q++) alb[q] += (st[q] - alb[q]) * stitch * 0.7;
  diff[k * 4] = srgb8(alb[0]); diff[k * 4 + 1] = srgb8(alb[1]); diff[k * 4 + 2] = srgb8(alb[2]); diff[k * 4 + 3] = 255;
  const rough = (region === 2 ? 0.55 : region === 1 ? 0.62 : 0.86) + (fine - 0.5) * 0.08 - pad * 0.15 + groove * 0.06;
  gArm[k * 4] = Math.round(255 * (1 - groove * 0.35)); gArm[k * 4 + 1] = Math.round(255 * Math.min(1, rough)); gArm[k * 4 + 2] = 0; gArm[k * 4 + 3] = 255;
  encodeNormal([tan[j * 6], tan[j * 6 + 1], tan[j * 6 + 2]], [tan[j * 6 + 3], tan[j * 6 + 4], tan[j * 6 + 5]], N0, hn, gNor, k);
  filled[k] = 1;
}
for (const img of [diff, gNor, gArm]) dilate(img, filled, TS, 6);
// Empty space, and an 8 x 8 block at the top right that the sleeve and cuff sample (uv 0.999, 0.001): white, flat, cloth.
for (let y = 0; y < 8; y++) for (let x = TS - 8; x < TS; x++) { if (filled[y * TS + x]) throw new Error('the plain corner is inside a chart'); diff[(y * TS + x) * 4 + 3] = 0; }
for (let k = 0; k < TS * TS; k++) if (!diff[k * 4 + 3]) { diff.fill(255, k * 4, k * 4 + 4); gNor[k * 4] = 128; gNor[k * 4 + 1] = 128; gNor[k * 4 + 2] = 255; gNor[k * 4 + 3] = 255; gArm[k * 4] = 255; gArm[k * 4 + 1] = 225; gArm[k * 4 + 2] = 0; gArm[k * 4 + 3] = 255; }
const bytes = await writeSet(process.cwd(), 'hand-trial', TS, { diff, nor: gNor, arm: gArm }, [1024, 512]);
console.log(`glove set: ${(bytes / 1024).toFixed(0)} KB`);

await mkdir('public/game-art/breachline/hero/hand-trial', { recursive: true });
const r4 = (a: ArrayLike<number>) => Array.from(a, x => Math.round(x * 1e5) / 1e5);
const srcI = u.src, SI = g.getAttribute('skinIndex'), SW = g.getAttribute('skinWeight');
const osi: number[] = [], osw: number[] = [];
for (let i = 0; i < nOut; i++) for (let q = 0; q < 4; q++) { osi.push(SI.getComponent(srcI[i], q)); osw.push(SW.getComponent(srcI[i], q)); }
await writeFile('public/game-art/breachline/hero/hand-trial/hand.json', JSON.stringify({ credit: 'Base Hand by Polyfork (https://polyfork.dev/asset/base-hand-e3398a), CC BY 4.0. Changed for Breachline: mirrored to a right hand, retargeted to the first-person rig, coloured and textured as a glove.', pos: r4(m.pos), nor: r4(m.nor), uv: r4(m.uv), tag: Array.from(m.part), si: osi, sw: r4(osw), idx: Array.from(m.idx) }));
