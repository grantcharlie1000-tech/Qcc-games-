/** The fighter's body: torso, legs and arms lofted from anatomical cross-sections under the uniform (shirt and
 * trousers with folds), a head with a face (brow, nose, cheekbones, jaw, ears) and gloved gripping hands built from
 * signed-distance primitives and meshed with the hero toolkit's surface nets. Everything is skinned to the skeleton in
 * `skeleton.ts`, with smooth weights across every joint. */
import * as THREE from 'three';
import { simplify } from '../hero/geom';
import { HAND } from '../hero/hands';
import { cone, ell, meshField, rbox, type Field, type Prim, type Vec } from '../hero/sdf';
import { chain, frame, loft, section, table, type Ring, type Weights } from './loft';
import { B, JOINT, SIDE, armDir, armOut, sgn } from './skeleton';

/** Surface tags on the body (index into the look's body surfaces). */
export const BT = { shirt: 0, pants: 1, skin: 2, band: 3, face: 4, hair: 5, glove: 6, palm: 7, knuckle: 8, lip: 9 } as const;

/** Detail per level: rings and segments for lofts, SDF cell sizes and decimation targets. */
export const LOD = [
  { torso: [17, 18], leg: [16, 12], arm: [14, 10], headH: 0.0075, headTris: 620, handH: 0.0055, handTris: 150 },
  { torso: [11, 11], leg: [9, 8], arm: [8, 7], headH: 0.011, headTris: 260, handH: 0.0075, handTris: 50 },
  { torso: [6, 7], leg: [5, 5], arm: [4, 5], headH: 0.016, headTris: 70, handH: 0.01, handTris: 16 },
] as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ss = THREE.MathUtils.smoothstep;
const mix = (a: Weights, b: Weights, t: number): Weights => [...a.map(([i, w]) => [i, w * (1 - t)] as [number, number]), ...b.map(([i, w]) => [i, w * t] as [number, number])];

/** Rows: y, half-width, front, back. Shirt over a lean, broad-shouldered build. */
const TORSO = [
  [0.79, 0.07, 0.05, 0.06],
  [0.83, 0.14, 0.08, 0.1],
  [0.88, 0.168, 0.095, 0.118],
  [0.94, 0.172, 0.1, 0.118],
  [1, 0.163, 0.1, 0.105],
  [1.06, 0.152, 0.098, 0.094],
  [1.12, 0.1575, 0.1048, 0.09646],
  [1.19, 0.1732, 0.1191, 0.1042],
  [1.26, 0.1895, 0.1319, 0.1121],
  [1.32, 0.2034, 0.1349, 0.1158],
  [1.375, 0.2128, 0.1232, 0.1145],
  [1.415, 0.2016, 0.1012, 0.1018],
  [1.442, 0.1659, 0.07962, 0.08783],
  [1.468, 0.108, 0.06349, 0.07304],
  [1.49, 0.072, 0.056, 0.062],
  [1.51, 0.062, 0.053, 0.056],
  [1.54, 0.058, 0.05, 0.053],
] as const;

function torso(lod: number, collar: boolean) {
  const [nr, seg] = LOD[lod].torso, y0 = TORSO[0][0], y1 = TORSO[TORSO.length - 1][0], rings: Ring[] = [];
  for (let i = 0; i < nr; i++) {
    // Rings packed closer at the shoulders and crotch, where the shape turns fastest.
    const t = i / (nr - 1), y = y0 + (y1 - y0) * (t - Math.sin(t * Math.PI * 2) * 0.06);
    const [w, f, b] = table(TORSO, y);
    // Spine curve: the chest sits forward of the pelvis and the neck leans forward.
    const z = -0.012 * Math.sin((y - 0.8) / 0.7 * Math.PI) + Math.max(0, y - 1.44) * -0.25;
    const fold = ss(y, 0.98, 1.05) * (1 - ss(y, 1.08, 1.14));
    const n = y > 1.43 ? 2 : y < 0.85 ? 2.2 : 2.7;
    rings.push({ c: V(0, y, z), u: V(1, 0, 0), v: V(0, 0, -1), at: section(w, w, f, b, n, a => fold * 0.018 * Math.sin(a * 7 + 1.3) + 0.004 * Math.sin(a * 11 + y * 60)) });
  }
  return loft(rings, {
    seg, capStart: true, a0: -Math.PI / 2 + Math.PI / seg,
    weight(p) {
      let w = chain([[B.pelvis, 0.92], [B.spine1, 1.08], [B.spine2, 1.27], [B.neck, 1.5], [B.head, 1.6]], p.y);
      const ax = Math.abs(p.x), s = p.x > 0 ? 1 : 0;
      const cl = ss(p.y, 1.32, 1.42) * ss(ax, 0.08, 0.15);
      if (cl > 0) w = mix(w, [[SIDE[s].clav, 1]], cl * 0.7);
      const hp = (1 - ss(p.y, 0.82, 0.9)) * ss(ax, 0.03, 0.11) * 0.45;
      if (hp > 0) w = mix(w, [[SIDE[s].hip, 1]], hp);
      return w;
    },
    tag: p => (p.y > 1.47 && collar ? BT.face : p.y < 1.0 ? BT.pants : BT.shirt),
  });
}

/** Rows: y, inner, outer, front, back (half extents about the leg's axis). Trousers, loose at the thigh. */
const LEG = [
  [0.1, 0.04968, 0.04968, 0.04968, 0.054],
  [0.17, 0.054, 0.054, 0.05184, 0.05832],
  [0.24, 0.06372, 0.06372, 0.059, 0.07316],
  [0.31, 0.06264, 0.06264, 0.05832, 0.0756],
  [0.38, 0.0648, 0.0648, 0.06048, 0.07884],
  [0.44, 0.06156, 0.06372, 0.0648, 0.06912],
  [0.5, 0.06264, 0.06588, 0.07344, 0.06264],
  [0.56, 0.0648, 0.07128, 0.07344, 0.06912],
  [0.64, 0.07128, 0.07992, 0.08208, 0.07776],
  [0.74, 0.07884, 0.08964, 0.08964, 0.08964],
  [0.84, 0.08424, 0.09828, 0.09504, 0.1058],
  [0.92, 0.0864, 0.1037, 0.09936, 0.1188],
  [1, 0.08208, 0.0972, 0.0972, 0.108],
] as const;

function leg(lod: number, s: number) {
  const [nr, seg] = LOD[lod].leg, S = SIDE[s], g = sgn(s), rings: Ring[] = [];
  const top = V(g * 0.085, 1.0, 0.0), hip = JOINT[S.thigh], knee = JOINT[S.shin], ankle = JOINT[S.foot];
  const axis = (y: number) => y > hip.y ? top.clone().lerp(hip, (1.0 - y) / (1.0 - hip.y)) : y > knee.y ? hip.clone().lerp(knee, (hip.y - y) / (hip.y - knee.y)) : knee.clone().lerp(ankle, (knee.y - y) / (knee.y - ankle.y));
  for (let i = 0; i < nr; i++) {
    const t = i / (nr - 1), y = 1.0 - 0.9 * t;
    const c = axis(y), dir = axis(y - 0.01).sub(axis(y + 0.01)).normalize();
    const F = frame(c, dir, V(0, 0, -1)), [inner, outer, front, back] = table(LEG, y);
    // u points to +X or -X depending on the side; put the outer extent on the outside.
    const outSide = F.u.x * g > 0;
    const knees = Math.exp(-Math.pow((y - 0.5) / 0.05, 2)) * 1.8, cuff = Math.exp(-Math.pow((y - 0.2) / 0.05, 2)) * 1.7 + Math.exp(-Math.pow((y - 0.72) / 0.06, 2)) * 0.6;
    const fold = (knees * 0.05 + cuff * 0.07);
    rings.push({ ...F, at: section(outSide ? outer : inner, outSide ? inner : outer, front, back, 2.2, a => fold * Math.abs(Math.sin(a * 2.5 + y * 40)) + 0.012 * Math.sin(a * 5 + y * 23) * Math.sin(y * 31)) });
  }
  return loft(rings, {
    seg, capEnd: true,
    weight(p) {
      let w = chain([[S.foot, 0.09], [S.shin, 0.2], [S.shin, 0.415], [S.knee, 0.495], [S.thigh, 0.575], [S.thigh, 0.8], [S.hip, 0.9]], p.y);
      if (p.y > 0.93) w = mix(w, [[B.pelvis, 1]], ss(p.y, 0.93, 1.0));
      return w;
    },
    tag: () => BT.pants,
  });
}

/** Rows: distance along the arm from the shoulder joint, outer, inner, front, back. Combat-shirt sleeve. */
const ARM = [
  [-0.09, 0.0575, 0.0575, 0.0644, 0.0644],
  [-0.03, 0.075, 0.0675, 0.08, 0.0775],
  [0.03, 0.08, 0.0625, 0.0775, 0.075],
  [0.09, 0.07125, 0.05875, 0.07, 0.06625],
  [0.16, 0.05865, 0.05175, 0.0621, 0.0552],
  [0.23, 0.05405, 0.04945, 0.05405, 0.05175],
  [0.29, 0.05175, 0.0483, 0.04945, 0.0552],
  [0.34, 0.0552, 0.0506, 0.0529, 0.0506],
  [0.42, 0.04945, 0.04485, 0.046, 0.0437],
  [0.5, 0.04255, 0.0391, 0.03795, 0.03565],
  [0.55, 0.04025, 0.0368, 0.03565, 0.03335],
] as const;

function arm(lod: number, s: number) {
  const [nr, seg] = LOD[lod].arm, S = SIDE[s], g = sgn(s), d = armDir(s), sh = JOINT[S.upper], rings: Ring[] = [];
  for (let i = 0; i < nr; i++) {
    const t = i / (nr - 1), a = ARM[0][0] + (ARM[ARM.length - 1][0] - ARM[0][0]) * t;
    const F = frame(sh.clone().addScaledVector(d, a), d, V(0, 0, -1)), [outer, inner, front, back] = table(ARM, a);
    const outSide = F.u.x * g > 0;
    const elbow = Math.exp(-Math.pow((a - 0.29) / 0.04, 2)), cuff = Math.exp(-Math.pow((a - 0.5) / 0.035, 2));
    const fold = elbow * 0.06 + cuff * 0.05;
    rings.push({ ...F, at: section(outSide ? outer : inner, outSide ? inner : outer, front, back, 2, q => fold * Math.abs(Math.sin(q * 2 + a * 70)) + 0.01 * Math.sin(q * 4 + a * 40)) });
  }
  return loft(rings, {
    seg,
    weight(p) {
      const a = p.clone().sub(sh).dot(d);
      // The inner end stays with the clavicle (inside the torso), so less of the sleeve stretches when the arm rises.
      return chain([[S.clav, -0.09], [S.clav, -0.03], [S.delt, 0.04], [S.upper, 0.13], [S.upper, 0.245], [S.elbow, 0.29], [S.fore, 0.335], [S.twist, 0.45], [S.hand, 0.565]], a);
    },
    tag: p => { const a = p.clone().sub(sh).dot(d); return a > 0.17 && a < 0.205 ? BT.band : BT.shirt; },
  });
}

// ---- Head ---------------------------------------------------------------------------------------------------------

/** The head and neck as signed-distance primitives in model space: cranium, brow ridge, nose, cheekbones, jaw, chin,
 * lips, ears. Group 0 is the skull, smooth-blended; features join it with small radii so their edges stay readable. */
function headField(): Field {
  const H = B.head, N = B.neck, P: Prim[] = [];
  P.push(ell([0, 1.668, 0.008], [0.074, 0.092, 0.097], H, 0));
  P.push(ell([0, 1.6, -0.03], [0.062, 0.068, 0.072], H, 0));
  // Jaw: two cones from under the ears to the chin.
  for (const g of [-1, 1]) P.push(cone([g * 0.058, 1.588, -0.005], [g * 0.024, 1.53, -0.07], 0.022, 0.019, H, 0));
  P.push(ell([0, 1.53, -0.074], [0.03, 0.021, 0.022], H, 0));
  // Neck and the back of the neck into the skull.
  P.push(cone([0, 1.44, 0.014], [0, 1.6, 0.004], 0.054, 0.05, N, 1));
  // Features.
  P.push(ell([0, 1.657, -0.083], [0.058, 0.0135, 0.02], H, 2, 0, new THREE.Euler(-0.15, 0, 0)));
  P.push(cone([0, 1.648, -0.094], [0, 1.603, -0.113], 0.0075, 0.011, H, 2));
  P.push(ell([0, 1.598, -0.107], [0.016, 0.01, 0.012], H, 2));
  for (const g of [-1, 1]) {
    P.push(ell([g * 0.045, 1.617, -0.072], [0.022, 0.015, 0.02], H, 2));
    P.push(ell([g * 0.0105, 1.599, -0.103], [0.006, 0.006, 0.007], H, 2));
    P.push(ell([g * 0.074, 1.623, 0.008], [0.011, 0.03, 0.019], H, 3, BT.skin, new THREE.Euler(0, g * 0.3, 0)));
  }
  P.push(ell([0, 1.567, -0.095], [0.021, 0.0075, 0.011], H, 2, BT.lip));
  return { prims: P, groups: [{ k: 0.03, join: 0 }, { k: 0, join: 0.018 }, { k: 0.012, join: 0.012 }, { k: 0, join: 0.006 }] };
}

let headCache: { geo: THREE.BufferGeometry; tags: Uint8Array }[] = [];
function headMesh(lod: number) {
  return (headCache[lod] ??= meshField(headField(), LOD[lod].headH, b => (b === B.head ? [B.neck] : [B.head])));
}

/** The head with tags for the look: `mask` 'balaclava' leaves only an eye window of skin; 'scarf' leaves the face bare
 * (the scarf is kit) with short hair at the back and sides. */
function head(lod: number, mask: 'balaclava' | 'scarf') {
  const m = headMesh(lod), geo = m.geo.clone(), P = geo.getAttribute('position'), tag = new Float32Array(P.count);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), t = m.tags[i];
    if (mask === 'balaclava') {
      const eye = y > 1.608 && y < 1.664 && z < -0.035 && Math.abs(x) < 0.064 - Math.max(0, 1.62 - y) * 1.2;
      tag[i] = eye ? BT.skin : BT.face;
    } else {
      const hair = y > 1.61 && z > -0.03 && !(t === BT.skin) || y > 1.69;
      tag[i] = t === BT.lip ? BT.lip : hair ? BT.hair : BT.skin;
    }
  }
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
  return simplify(geo, LOD[lod].headTris, [0.01, 0.03, 0.08][lod]);
}

// ---- Hands ----------------------------------------------------------------------------------------------------------

/** Curl of each finger's three joints and spread, gripping a 32 mm handle; the thumb wraps the other way. */
const GRIP = [[0.35, 0.55, 0.35, 0.45], [1.05, 1.25, 0.7, 0.04], [1.15, 1.3, 0.72, 0], [1.2, 1.32, 0.72, -0.04], [1.2, 1.3, 0.7, -0.1]];
const HT = { back: BT.glove, palm: BT.palm, guard: BT.knuckle };

/** A right gloved hand in hand space (wrist at the origin, palm down -Y, fingers along -Z), gripping. Built from the
 * weapons session's hand anatomy (`HAND`), at low detail. */
function handField(): Field {
  const P: Prim[] = [], HB = 0;
  for (let d = 1; d <= 4; d++) {
    const k = HAND[d].base, r = HAND[d].rad[0];
    P.push(cone([k[0] * 0.55, k[1] - 0.002, -0.014], k as Vec, r * 1.12, r * 1.05, HB, 0));
  }
  P.push(ell([0.003, -0.006, -0.05], [0.038, 0.014, 0.042], HB, 0, HT.palm));
  P.push(ell([-0.002, -0.001, -0.006], [0.031, 0.02, 0.027], HB, 0));
  P.push(ell([0, 0.0, 0.03], [0.036, 0.03, 0.034], HB, 0, HT.back));
  P.push(rbox([0.0, 0.0145, -0.072], [0.027, 0.004, 0.007], 0.002, HB, 1, HT.guard));
  const q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let d = 0; d < 5; d++) {
    const h = HAND[d], c = GRIP[d];
    let dir: THREE.Vector3, up: THREE.Vector3;
    if (d === 0) { dir = V(-0.55, -0.35, -0.75).normalize(); up = V(-0.6, 0.8, 0).normalize(); }
    else { q.setFromEuler(e.set(h.pitch, h.yaw + c[3], 0, 'YXZ')); dir = V(0, 0, -1).applyQuaternion(q); up = V(0, 1, 0).applyQuaternion(q); }
    let p = V(...(h.base as Vec));
    if (d === 0) P.push(ell([-0.019, -0.011, -0.04], [0.018, 0.016, 0.027], HB, 0, HT.palm, new THREE.Euler(0, 0.45, 0)));
    for (let s = 0; s < 3; s++) {
      // Curl about the finger's side axis (toward the palm, -up).
      const side = new THREE.Vector3().crossVectors(dir, up).normalize();
      const rq = new THREE.Quaternion().setFromAxisAngle(side, d === 0 ? -c[s] * 0.6 : -c[s]);
      dir = dir.clone().applyQuaternion(rq); up = up.clone().applyQuaternion(rq);
      const n = p.clone().addScaledVector(dir, h.len[s]);
      P.push(cone([p.x, p.y, p.z], [n.x, n.y, n.z], h.rad[s] * 1.08, h.rad[s + 1] * 1.08, HB, 2 + d, s === 2 ? HT.palm : HT.back));
      p = n;
    }
  }
  return {
    prims: P,
    groups: [{ k: 0.012, join: 0 }, { k: 0.002, join: 0.003 }, ...[0, 1, 2, 3, 4].map(() => ({ k: 0.004, join: 0.008, hardSet: 0 }))],
  };
}

let handCache: { geo: THREE.BufferGeometry; tags: Uint8Array }[] = [];
/** Hand-space to bind-pose rotation for each side: fingers along the A-pose arm, palm toward the thigh. */
export function handBind(s: number): THREE.Quaternion {
  const fingers = armDir(s), palm = armOut(s).negate();
  return basisQ(palm, fingers);
}
/** Rotation taking hand space (palm -Y, fingers -Z) to the frame with the given palm and finger directions. */
export function basisQ(palm: THREE.Vector3, fingers: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  const z = fingers.clone().negate().normalize(), y = palm.clone().negate();
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function hand(lod: number, s: number) {
  const m = (handCache[lod] ??= meshField(handField(), LOD[lod].handH, () => []));
  const geo = m.geo.clone(), n = geo.getAttribute('position').count, tag = new Float32Array(n);
  const N = geo.getAttribute('normal');
  for (let i = 0; i < n; i++) tag[i] = m.tags[i] === HT.back && N.getY(i) < -0.6 ? HT.palm : m.tags[i];
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
  let g = simplify(geo, LOD[lod].handTris, [0.02, 0.05, 0.1][lod]);
  if (!s) { g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1)); const ix = g.index!.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  g = g.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(JOINT[SIDE[s].hand], handBind(s), V(1, 1, 1)));
  const k = g.getAttribute('position').count, si = new Uint16Array(k * 4), sw = new Float32Array(k * 4);
  for (let i = 0; i < k; i++) { si[i * 4] = SIDE[s].hand; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

/** Every body part for one level of detail, each with `tag`, `skinIndex` and `skinWeight`. */
export function bodyParts(lod: number, mask: 'balaclava' | 'scarf'): THREE.BufferGeometry[] {
  return [torso(lod, mask === 'balaclava'), leg(lod, 0), leg(lod, 1), arm(lod, 0), arm(lod, 1), head(lod, mask), hand(lod, 0), hand(lod, 1)];
}
