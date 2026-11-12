/** Job 2.2: fits the cleaned Tactical soldier to the fighters' skeleton (src/games/breachline/render/fighters/
 * skeleton.ts, imported read-only). Run with `npx vite-node scripts/breachline-assets/patch-trial/skin-soldier.ts`.
 *
 * 1. Joint positions measured on the soldier's A-pose mesh (CAND below), in the fighters' frame (facing -Z).
 * 2. Weights by distance to bone segments in that pose: each vertex takes its nearest bone and the bones adjacent to
 *    it in the hierarchy (never an arm bone for the torso or the other side), w = 1/d^4, then smoothed over the
 *    position-welded mesh. Elbows, knees, shoulders and hips hand part of their blend to the helper bones.
 * 3. The mesh is moved into the skeleton's bind pose by those weights (each bone's measured direction rotated onto its
 *    bind direction), so it binds with the stock bind matrices and plays the stock animator unchanged.
 * Writes public/game-art/breachline/patch/tactical/body-skinned.glb (nodes body_lod0, body_lod1; JOINTS_0 indices
 * are the skeleton's bone order `B`). */
import * as THREE from 'three';
import { B, BONES, JOINT, PARENT, SIDE, sgn, armDir } from '../../../src/games/breachline/render/fighters/skeleton';
// @ts-expect-error plain JS module
import { readGlb, primitive, writeGlb } from './glb.mjs';

const OUT = 'public/game-art/breachline/patch/tactical';
/** Weight smoothing passes over the welded mesh. */
const SMOOTH = +(process.env.SMOOTH ?? 10);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Job 3: skin the uncut mesh (head and hands kept). */
const FULL = process.env.FULL === '1';

/** Measured joints of the soldier mesh in the fighters' frame (x and z negated from the file's +Z-facing frame). */
const CAND: THREE.Vector3[] = JOINT.map(j => j.clone());
for (const s of [0, 1]) {
  const S = SIDE[s], g = sgn(s);
  CAND[S.clav] = V(g * 0.03, 1.41, 0);
  CAND[S.upper] = V(g * 0.205, 1.40, 0.02);
  CAND[S.fore] = V(g * 0.34, 1.10, 0.02);
  // Job 3 (FULL): the asset's own hands are kept, so the hand bone sits at the real wrist below the glove cuff.
  CAND[S.hand] = FULL ? V(g * 0.39, 0.915, -0.10) : V(g * 0.388, 0.95, -0.08);
  CAND[S.twist] = CAND[S.fore].clone().lerp(CAND[S.hand], 0.5);
  CAND[S.elbow] = CAND[S.fore].clone(); CAND[S.delt] = CAND[S.upper].clone();
  CAND[S.thigh] = V(g * 0.10, 0.90, 0); CAND[S.hip] = CAND[S.thigh].clone();
  CAND[S.shin] = V(g * 0.15, 0.50, 0.0); CAND[S.knee] = CAND[S.shin].clone();
  CAND[S.foot] = V(g * 0.175, 0.105, 0.01);
  CAND[S.toe] = V(g * 0.19, 0.03, -0.12);
}
CAND[B.pelvis] = V(0, 0.95, 0); CAND[B.spine1] = V(0, 1.065, 0); CAND[B.spine2] = V(0, 1.22, 0); CAND[B.neck] = V(0, 1.46, 0); CAND[B.head] = V(0, 1.565, 0);

/** Segment end for each deforming bone (its main child), or null for a point bone. */
const CHILD: (number | null)[] = new Array(BONES).fill(null);
CHILD[B.pelvis] = B.spine1; CHILD[B.spine1] = B.spine2; CHILD[B.spine2] = B.neck; CHILD[B.neck] = B.head;
for (const s of [0, 1]) { const S = SIDE[s]; CHILD[S.clav] = S.upper; CHILD[S.upper] = S.fore; CHILD[S.fore] = S.hand; CHILD[S.thigh] = S.shin; CHILD[S.shin] = S.foot; CHILD[S.foot] = S.toe; }
/** Segment ends for bones without a child: the hand to the fingertips, the head to the crown (measured / bind). */
const TIP_C: (THREE.Vector3 | null)[] = new Array(BONES).fill(null), TIP_B: (THREE.Vector3 | null)[] = new Array(BONES).fill(null);
for (const s of [0, 1]) { const S = SIDE[s], g = sgn(s); TIP_C[S.hand] = V(g * 0.37, 0.74, -0.15); TIP_B[S.hand] = JOINT[S.hand].clone().addScaledVector(armDir(s), 0.18); }
TIP_C[B.head] = V(0, 1.74, 0); TIP_B[B.head] = JOINT[B.head].clone().add(V(0, 0.18, 0));
const endC = (b: number) => CHILD[b] !== null ? CAND[CHILD[b]!] : TIP_C[b]!;
/** Bones a vertex may weight to (main bones; helpers are added at the joints afterwards). */
const MAIN = [B.pelvis, B.spine1, B.spine2, B.neck, ...(FULL ? [B.head] : []), ...[0, 1].flatMap(s => { const S = SIDE[s]; return [S.clav, S.upper, S.fore, ...(FULL ? [S.hand] : []), S.thigh, S.shin, S.foot]; })];
const sideOf = (b: number) => SIDE[0] && Object.values(SIDE[0]).includes(b as never) ? 0 : Object.values(SIDE[1]).includes(b as never) ? 1 : -1;
const adjacent = (a: number, b: number) => a === b || PARENT[a] === b || PARENT[b] === a || (PARENT[a] === PARENT[b] && PARENT[a] > 0 && sideOf(a) === sideOf(b));

/** World rotation of each bone from the bind pose to the measured pose: bind direction onto measured direction. */
const ROT: THREE.Quaternion[] = Array.from({ length: BONES }, () => new THREE.Quaternion());
for (let i = 0; i < BONES; i++) {
  const c = CHILD[i]; if (c === null) continue;
  ROT[i].setFromUnitVectors(JOINT[c].clone().sub(JOINT[i]).normalize(), CAND[c].clone().sub(CAND[i]).normalize());
}
for (const s of [0, 1]) { const S = SIDE[s]; if (FULL) ROT[S.hand].setFromUnitVectors(TIP_B[S.hand]!.clone().sub(JOINT[S.hand]).normalize(), TIP_C[S.hand]!.clone().sub(CAND[S.hand]).normalize()); else ROT[S.hand].copy(ROT[S.fore]); ROT[S.twist].copy(ROT[S.fore]); ROT[S.elbow].copy(ROT[S.upper]).slerp(ROT[S.fore], 0.5); ROT[S.knee].copy(ROT[S.thigh]).slerp(ROT[S.shin], 0.5); ROT[S.delt].copy(ROT[S.clav]).slerp(ROT[S.upper], 0.5); ROT[S.hip].copy(ROT[B.pelvis]).slerp(ROT[S.thigh], 0.5); ROT[S.toe].copy(ROT[S.foot]); }

/** Each limb bone's length ratio, ours / measured: the soldier's forearm (elbow to glove cuff) is 0.19 m against our
 * 0.255 m, so without this the hand floats 6 cm beyond the cuff. Applied along the bone, not across it. */
const STRETCH: number[] = new Array(BONES).fill(1);
const AXIS: THREE.Vector3[] = Array.from({ length: BONES }, () => new THREE.Vector3());
for (let i = 0; i < BONES; i++) { const c = CHILD[i]; if (c === null) continue; const lc = CAND[c].distanceTo(CAND[i]); STRETCH[i] = JOINT[c].distanceTo(JOINT[i]) / lc; AXIS[i].copy(CAND[c]).sub(CAND[i]).normalize(); }
for (const s of [0, 1]) { const S = SIDE[s]; STRETCH[S.twist] = STRETCH[S.fore]; AXIS[S.twist].copy(AXIS[S.fore]); STRETCH[S.hand] = 1; }
console.log('stretch', [0, 1].map(s => { const S = SIDE[s]; return [S.upper, S.fore, S.thigh, S.shin].map(b => STRETCH[b].toFixed(2)).join('/'); }).join(' | '));
function segDist(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a), t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  return { d: p.distanceTo(a.clone().addScaledVector(ab, t)), t };
}

function skin(pos: Float32Array, nrm: Float32Array, idx: Uint32Array) {
  const n = pos.length / 3, W: Map<number, number>[] = [];
  const P = (i: number) => V(-pos[i * 3], pos[i * 3 + 1], -pos[i * 3 + 2]);   // file frame -> fighters' frame
  for (let i = 0; i < n; i++) {
    const p = P(i), side = Math.abs(p.x) < 0.04 ? -1 : p.x < 0 ? 0 : 1;
    const ds = MAIN.map(b => {
      const sb = sideOf(b);
      if (sb >= 0 && side >= 0 && sb !== side) return { b, d: Infinity };
      let d = segDist(p, CAND[b], endC(b)).d;
      // Arm bones only for points outside the torso's width (the A-pose arm hangs 6 cm clear of the body).
      const arm = [SIDE[0].upper, SIDE[0].fore, SIDE[0].hand, SIDE[1].upper, SIDE[1].fore, SIDE[1].hand].includes(b as never);
      if (b === B.head && p.y < 1.47) d = Infinity;
      if (arm && p.y < 1.3) d *= 1 + 6 * (1 - THREE.MathUtils.smoothstep(Math.abs(p.x), 0.235, 0.29)); // soft: no hard seam at the inner arm
      if (!arm && b !== B.neck && Math.abs(p.x) > 0.29 && p.y > 0.85) d *= 3;
      return { b, d };
    }).sort((x, y) => x.d - y.d);
    const near = ds[0], m = new Map<number, number>();
    for (const e of ds.slice(0, 4)) if (e.d < Infinity && adjacent(e.b, near.b) && e.d < near.d * 2.2 + 0.02) m.set(e.b, 1 / Math.pow(e.d + 0.01, 4));
    W.push(m);
  }
  // Smooth over the welded mesh (UV seams split vertices; weld by position so seams cannot tear).
  const key = (i: number) => `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`;
  const weld = new Map<string, number>(), wid = new Int32Array(n); let nw = 0;
  for (let i = 0; i < n; i++) { const k = key(i); let w = weld.get(k); if (w === undefined) { w = nw++; weld.set(k, w); } wid[i] = w; }
  const nb: Set<number>[] = Array.from({ length: nw }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) { const a = wid[idx[t + k]], b = wid[idx[t + (k + 1) % 3]]; nb[a].add(b); nb[b].add(a); }
  let WW: Map<number, number>[] = Array.from({ length: nw }, () => new Map());
  const norm = (m: Map<number, number>) => { let s = 0; for (const v of m.values()) s += v; for (const [k, v] of m) m.set(k, v / s); return m; };
  for (let i = 0; i < n; i++) WW[wid[i]] = norm(new Map(W[i]));
  for (let it = 0; it < SMOOTH; it++) {
    WW = WW.map((m, w) => {
      const acc = new Map<number, number>(); for (const [k, v] of m) acc.set(k, v * 2);
      for (const o of nb[w]) for (const [k, v] of WW[o]) acc.set(k, (acc.get(k) ?? 0) + v / Math.max(1, nb[w].size) * 2);
      return norm(acc);
    });
  }
  // Helpers: half of each joint's two-bone blend goes to its helper bone.
  const HELP: [number, number, number][] = [0, 1].flatMap(s => { const S = SIDE[s]; return [[S.upper, S.fore, S.elbow], [S.thigh, S.shin, S.knee], [S.clav, S.upper, S.delt], [B.pelvis, S.thigh, S.hip], [S.fore, S.hand, S.twist]] as [number, number, number][]; });
  for (const m of WW) for (const [a, b, h] of HELP) { const wa = m.get(a) ?? 0, wb = m.get(b) ?? 0, share = Math.min(wa, wb); if (share > 0.02) { m.set(a, wa - share * 0.5); m.set(b, wb - share * 0.5); m.set(h, (m.get(h) ?? 0) + share); } }
  // Forearm twist: the distal half of the forearm leans on the twist bone.
  // (Each welded vertex once: UV-seam duplicates share their weights.)
  const once = (f: (i: number) => void) => { const seen = new Uint8Array(nw); for (let i = 0; i < n; i++) if (!seen[wid[i]]) { seen[wid[i]] = 1; f(i); } };
  once(i => {
    const m = WW[wid[i]], p = P(i);
    for (const s of [0, 1]) { const S = SIDE[s], f = m.get(S.fore) ?? 0; if (f > 0) { const t = segDist(p, CAND[S.fore], CAND[S.hand]).t, k = THREE.MathUtils.smoothstep(t, 0.3, 0.9) * 0.6; m.set(S.fore, f * (1 - k)); m.set(S.twist, (m.get(S.twist) ?? 0) + f * k); } }
  });
  // Fix 1 (aim): above the armpit, the shoulder cap and the top of the vest's shoulder strap follow the shoulder
  // helper (half the upper arm's rotation) rather than the chest, so raising the rifle no longer bunches them.
  // Fix 2 (crouch): the drop holster and the thigh pockets are rigid to their thigh (the generated mesh fuses them to
  // the belly, which tore at the hip).
  let shoulderFixed = 0, rigid = 0;
  once(i => {
    const m = WW[wid[i]], p = P(i), side = p.x < 0 ? 0 : 1, S = SIDE[side], ax = Math.abs(p.x);
    if (p.y > 1.18 && ax > 0.13 && ((m.get(S.upper) ?? 0) + (m.get(S.delt) ?? 0)) > 0.05) {
      const k = THREE.MathUtils.smoothstep(ax, 0.13, 0.22) * THREE.MathUtils.smoothstep(p.y, 1.18, 1.3);
      for (const b of [B.spine2, S.clav]) { const w = m.get(b) ?? 0; if (w > 0) { m.set(b, w * (1 - 0.7 * k)); m.set(S.delt, (m.get(S.delt) ?? 0) + w * 0.7 * k); } }
      shoulderFixed++;
    }
    const holster = side === 1 && p.x > 0.195 && p.x < 0.30 && p.y > 0.64 && p.y < 0.97 && Math.abs(p.z) < 0.13;
    const pocket = ax > 0.16 && ax < 0.28 && p.y > 0.58 && p.y < 0.86 && Math.abs(p.z) < 0.12;
    if (holster || pocket) {
      const top = holster ? THREE.MathUtils.smoothstep(p.y, 0.86, 0.97) * 0.35 : 0;
      m.clear(); m.set(S.thigh, 1 - top); if (top > 0) m.set(S.hip, top); rigid++;
    }
  });
  console.log('shoulder vertices re-weighted', shoulderFixed, 'rigid holster/pocket vertices', rigid);
  // Top four, normalised; then move each vertex into the bind pose.
  const ji = new Uint16Array(n * 4), jw = new Float32Array(n * 4), outP = new Float32Array(n * 3), outN = new Float32Array(n * 3);
  const qi = new THREE.Quaternion();
  for (let i = 0; i < n; i++) {
    const top = [...WW[wid[i]].entries()].filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4), s = top.reduce((a, e) => a + e[1], 0);
    const p = P(i), nn = V(-nrm[i * 3], nrm[i * 3 + 1], -nrm[i * 3 + 2]), op = V(0, 0, 0), on = V(0, 0, 0);
    top.forEach(([b, w], k) => {
      ji[i * 4 + k] = b; jw[i * 4 + k] = w / s;
      qi.copy(ROT[b]).invert();
      const rel = p.clone().sub(CAND[b]), a = rel.dot(AXIS[b]);
      // Stretch along the bone over its length only (points past the child joint move with the child's end).
      // Twist bones sit mid-forearm on both skeletons, so for them the same stretch applies unclamped about their joint.
      const twist = b === SIDE[0].twist || b === SIDE[1].twist;
      if (STRETCH[b] !== 1 && AXIS[b].lengthSq() > 0) { const len = twist ? 0 : CAND[CHILD[b]!].distanceTo(CAND[b]); rel.addScaledVector(AXIS[b], (STRETCH[b] - 1) * (twist ? a : THREE.MathUtils.clamp(a, 0, len))); }
      op.addScaledVector(rel.applyQuaternion(qi).add(JOINT[b]), w / s);
      on.addScaledVector(nn.clone().applyQuaternion(qi), w / s);
    });
    outP.set([op.x, op.y, op.z], i * 3); on.normalize(); outN.set([on.x, on.y, on.z], i * 3);
  }
  // Winding stays valid: x and z were both negated (a rotation, not a mirror).
  return { pos: outP, nrm: outN, ji, jw };
}

/** Hidden fill (job 3): a closed ellipsoid inside each hip fold, black cloth, half pelvis and half thigh (with the hip
 * helper), so when a crouch opens the fused crotch and pocket geometry there is cloth behind it, not the backdrop.
 * It sits inside the trousers in every standing pose. */
function addFill(m: { pos: Float32Array; nrm: Float32Array; uv: Float32Array; j8: Uint8Array; w8: Uint8Array; idx: Uint32Array }) {
  const n0 = m.pos.length / 3; let best = 0, bd = Infinity;
  for (let i = 0; i < n0; i++) { const d = Math.hypot(Math.abs(m.pos[i * 3]) - 0.36, m.pos[i * 3 + 1] - 1.2, m.pos[i * 3 + 2]); if (d < bd) { bd = d; best = i; } }
  const uv0 = [m.uv[best * 2], m.uv[best * 2 + 1]];
  const P: number[] = [], N: number[] = [], U: number[] = [], J: number[] = [], W: number[] = [], I: number[] = [];
  const SEG = 14, RING = 9;
  for (const s of [0, 1]) {
    const S = SIDE[s], c = V(sgn(s) * 0.1, 0.85, -0.01), r = V(0.075, 0.07, 0.08), base = n0 + P.length / 3;
    for (let a = 0; a <= RING; a++) for (let b = 0; b <= SEG; b++) {
      const th = Math.PI * a / RING, ph = 2 * Math.PI * b / SEG, d = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
      P.push(c.x + d.x * r.x, c.y + d.y * r.y, c.z + d.z * r.z); const nn = V(d.x / r.x, d.y / r.y, d.z / r.z).normalize(); N.push(nn.x, nn.y, nn.z); U.push(uv0[0], uv0[1]);
      J.push(B.pelvis, S.thigh, S.hip, 0); W.push(102, 102, 51, 0);
    }
    for (let a = 0; a < RING; a++) for (let b = 0; b < SEG; b++) { const i0 = base + a * (SEG + 1) + b, i1 = i0 + SEG + 1; I.push(i0, i0 + 1, i1, i0 + 1, i1 + 1, i1); }
  }
  const cat = <T extends Float32Array | Uint8Array | Uint32Array>(a: T, b: number[], C: new (n: number) => T) => { const o = new C(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
  return { pos: cat(m.pos, P, Float32Array), nrm: cat(m.nrm, N, Float32Array), uv: cat(m.uv, U, Float32Array), j8: cat(m.j8, J, Uint8Array), w8: cat(m.w8, W, Uint8Array), idx: cat(m.idx, I, Uint32Array) };
}

async function main() {
const g = await readGlb(process.env.STATIC ?? `${OUT}/body.glb`);
const meshes = [];
for (const name of ['body_lod0', 'body_lod1', 'body_lod2']) {
  const ni = g.json.nodes.findIndex((nd: { name: string }) => nd.name === name); if (ni < 0) continue;
  const p = primitive(g, ni);
  const t0 = performance.now(), r = skin(p.pos, p.nrm, p.idx);
  console.log(name, p.pos.length / 3, 'verts', (performance.now() - t0).toFixed(0), 'ms');
  // Joints and weights as normalised bytes (the weights' rounding error goes to the largest so each set sums to 255).
  const j8 = Uint8Array.from(r.ji), w8 = new Uint8Array(r.jw.length);
  for (let i = 0; i < r.jw.length; i += 4) { let sum = 0, big = i; for (let k = 0; k < 4; k++) { w8[i + k] = Math.round(r.jw[i + k] * 255); sum += w8[i + k]; if (r.jw[i + k] > r.jw[big]) big = i + k; } w8[big] += 255 - sum; }
  const out = FULL ? addFill({ pos: r.pos, nrm: r.nrm, uv: p.uv, j8, w8, idx: p.idx }) : { pos: r.pos, nrm: r.nrm, uv: p.uv, j8, w8, idx: p.idx };
  meshes.push({ name, attributes: { POSITION: out.pos, NORMAL: out.nrm, TEXCOORD_0: out.uv, JOINTS_0: out.j8, WEIGHTS_0: out.w8 }, indices: out.idx });
}
await writeGlb(`${OUT}/body-skinned.glb`, meshes, { ...g.json.asset.extras, skeleton: 'src/games/breachline/render/fighters/skeleton.ts (32 bones, order B; bind rotations identity)', facing: '-Z (fighters frame)', units: 'metres, authored size: the fighter group carries SCALE', measuredJoints: CAND.map(v => v.toArray().map(x => +x.toFixed(3))) });
console.log('written');
}
main();
