/** First-person arms: parametric five-finger gloved hands (signed-distance primitives per phalanx, knuckle guards, cuff)
 * meshed with surface nets, on combat-shirt sleeves with folds and the squad's band and shape patch. Both arms are one
 * skinned mesh (18 bones each), posed by two-bone IK to sockets on the weapon and by per-finger curl poses.
 *
 * Arm space (bind pose): shoulder at the origin, the arm straight along -Z, palm down (-Y), back of the hand up. The
 * right arm is authored; the left is its mirror in X. */
import * as THREE from 'three';
import { Builder, SURF, simplify, surf, type Surface } from './geom';
import { cone, ell, meshField, rbox, type Field, type Prim, type Vec } from './sdf';

export const UPPER = 0.3, FORE = 0.28;
/** Triangles per gloved hand after decimation (the surface-nets mesh is about 18k). */
export const HAND_TRIS = 2300;
/** Bones per arm: 0 upper arm, 1 forearm, 2 hand, then 3 + finger * 3 + segment (thumb, index, middle, ring, little). */
export const ARM_BONES = 18;
export const FINGER = { thumb: 0, index: 1, middle: 2, ring: 3, little: 4 } as const;
export const fb = (finger: number, seg: number) => 3 + finger * 3 + seg;

/** Hand anatomy (right hand, metres, wrist joint at the origin, palm down, fingers along -Z). Gloved radii. */
interface Digit { base: Vec; len: [number, number, number]; rad: [number, number, number, number]; yaw: number; pitch: number }
const G = 0.0009;
export const HAND: Digit[] = [
  { base: [-0.02, -0.01, -0.024], len: [0.044, 0.032, 0.028], rad: [0.0142 + G, 0.0118 + G, 0.0108 + G, 0.0093 + G], yaw: 0.62, pitch: -0.32 },
  { base: [-0.026, 0.002, -0.088], len: [0.041, 0.024, 0.021], rad: [0.0096 + G, 0.0086 + G, 0.0078 + G, 0.0068 + G], yaw: 0.07, pitch: 0 },
  { base: [-0.0075, 0.004, -0.092], len: [0.046, 0.028, 0.022], rad: [0.0099 + G, 0.0089 + G, 0.0081 + G, 0.007 + G], yaw: 0, pitch: 0 },
  { base: [0.0108, 0.002, -0.087], len: [0.043, 0.027, 0.021], rad: [0.0093 + G, 0.0084 + G, 0.0076 + G, 0.0066 + G], yaw: -0.06, pitch: 0 },
  { base: [0.0272, -0.003, -0.077], len: [0.034, 0.021, 0.019], rad: [0.0083 + G, 0.0075 + G, 0.0068 + G, 0.006 + G], yaw: -0.15, pitch: 0 },
];
/** Rest rotation of each digit's first bone: yaw (toward the thumb side) and pitch. */
export function digitRest(d: number): THREE.Quaternion {
  const h = HAND[d];
  if (d === 0) {
    // The thumb points forward, out and down, its nail facing out and up.
    const dir = new THREE.Vector3(-0.55, -0.16, -0.82).normalize(), nail = new THREE.Vector3(-0.55, 0.83, 0);
    nail.addScaledVector(dir, -nail.dot(dir)).normalize();
    const z = dir.clone().negate(), x = new THREE.Vector3().crossVectors(nail, z).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, nail, z));
  }
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(h.pitch, h.yaw, 0, 'YXZ'));
}

/** Surface regions of the glove and sleeve, chosen per vertex from the nearest primitive and the side it faces. */
const TAG = { back: 0, palm: 1, guard: 2, cuff: 3, tip: 4, strap: 5, gusset: 6 } as const;

function handField(wrist: Vec): Field {
  const P: Prim[] = [], W = (v: Vec): Vec => [v[0] + wrist[0], v[1] + wrist[1], v[2] + wrist[2]];
  const HB = 2; // hand bone
  // Palm (group 0): metacarpals from the carpus to each knuckle, a palm pad, the heel and the wrist.
  for (let d = 1; d <= 4; d++) {
    const k = HAND[d].base, r = HAND[d].rad[0];
    P.push(cone(W([k[0] * 0.55, k[1] - 0.002, -0.014]), W(k), r * 1.08, r * 1.02, HB, 0));
    P.push(ell(W([k[0], k[1] + 0.001, k[2] + 0.002]), [r * 1.05, r * 0.95, r * 1.1], HB, 0));
  }
  P.push(ell(W([0.003, -0.006, -0.052]), [0.037, 0.0125, 0.04], HB, 0, TAG.palm));
  P.push(ell(W([0.021, -0.006, -0.03]), [0.017, 0.0135, 0.03], HB, 0, TAG.palm));
  P.push(ell(W([-0.002, -0.001, -0.006]), [0.03, 0.019, 0.026], HB, 0));
  // Thumb (group 1): the thenar mound on the thumb's first bone, then the chain.
  const t = HAND[0], tq = digitRest(0), tdir = new THREE.Vector3(0, 0, -1).applyQuaternion(tq);
  let at = new THREE.Vector3(...W(t.base));
  P.push(ell(W([-0.019, -0.011, -0.04]), [0.017, 0.015, 0.027], fb(0, 0), 1, TAG.palm, new THREE.Euler(0, 0.45, 0)));
  for (let s = 0; s < 3; s++) {
    const next = at.clone().addScaledVector(tdir, t.len[s]);
    P.push(cone([at.x, at.y, at.z], [next.x, next.y, next.z], t.rad[s], t.rad[s + 1], fb(0, s), 1, s === 2 ? TAG.tip : TAG.back));
    at = next;
  }
  // Web between thumb and index.
  P.push(ell(W([-0.03, -0.004, -0.056]), [0.008, 0.0065, 0.018], fb(0, 0), 1, TAG.palm, new THREE.Euler(0, 0.5, 0)));
  // Fingers (groups 2..5, a hard set so they never fuse with each other).
  for (let d = 1; d <= 4; d++) {
    const h = HAND[d], dir = new THREE.Vector3(0, 0, -1).applyQuaternion(digitRest(d));
    let p = new THREE.Vector3(...W(h.base));
    for (let s = 0; s < 3; s++) {
      const n = p.clone().addScaledVector(dir, h.len[s]);
      P.push(cone([p.x, p.y, p.z], [n.x, n.y, n.z], h.rad[s], h.rad[s + 1], fb(d, s), 1 + d, s === 2 ? TAG.tip : TAG.back));
      // Pads on the palm side of each phalanx.
      const m = p.clone().lerp(n, 0.55);
      P.push(ell([m.x, m.y - h.rad[s] * 0.25, m.z], [h.rad[s] * 0.95, h.rad[s] * 0.8, h.len[s] * 0.36], fb(d, s), 1 + d, TAG.palm));
      p = n;
    }
  }
  // Cuff (group 6) on the forearm bone, with a strap.
  P.push(ell(W([0, 0.0, 0.03]), [0.034, 0.026, 0.03], 1, 6, TAG.cuff));
  P.push(ell(W([0, 0.0, 0.05]), [0.035, 0.028, 0.02], 1, 6, TAG.cuff));
  P.push(rbox(W([0.004, 0.0255, 0.03]), [0.013, 0.0025, 0.012], 0.0015, 1, 6, TAG.strap));
  // Knuckle guard (group 7): moulded pads over each knuckle and a bridge.
  for (let d = 1; d <= 4; d++) { const k = HAND[d].base; P.push(ell(W([k[0], k[1] + HAND[d].rad[0] + 0.003, k[2] + 0.004]), [0.0086, 0.0058, 0.009], HB, 7, TAG.guard)); }
  P.push(rbox(W([0.0, 0.0155, -0.072]), [0.026, 0.004, 0.006], 0.0025, HB, 7, TAG.guard, new THREE.Euler(0, 0.12, 0)));
  // Finger-back guards on the middle phalanges.
  for (let d = 1; d <= 4; d++) {
    const h = HAND[d], dir = new THREE.Vector3(0, 0, -1).applyQuaternion(digitRest(d));
    const m = new THREE.Vector3(...W(h.base)).addScaledVector(dir, h.len[0] + h.len[1] * 0.35);
    P.push(ell([m.x, m.y + h.rad[1] + 0.0012, m.z], [h.rad[1] * 0.75, 0.0024, h.len[1] * 0.3], fb(d, 1), 7, TAG.guard));
  }
  return {
    prims: P,
    groups: [
      { k: 0.011, join: 0 }, { k: 0.006, join: 0.012 },
      { k: 0.0035, join: 0.0075, hardSet: 0 }, { k: 0.0035, join: 0.0075, hardSet: 0 }, { k: 0.0035, join: 0.0075, hardSet: 0 }, { k: 0.0035, join: 0.0075, hardSet: 0 },
      { k: 0.004, join: 0.006 }, { k: 0.002, join: 0.0016 },
    ],
  };
}

/** Bones a vertex dominated by `b` may also take weight from: its parent and children along the chain. */
function armNeighbours(b: number): number[] {
  if (b === 0) return [1];
  if (b === 1) return [0, 2];
  if (b === 2) return [1, fb(0, 0), fb(1, 0), fb(2, 0), fb(3, 0), fb(4, 0)];
  const f = Math.floor((b - 3) / 3), s = (b - 3) % 3;
  return [s === 0 ? 2 : fb(f, s - 1), ...(s < 2 ? [fb(f, s + 1)] : [])];
}

export interface ArmsLook { sleeve: Surface; glove: Surface; palm: Surface; guard: Surface; band: number; squad: 0 | 1 }

/** Sleeve: a tube from the shoulder to just over the cuff, with folds at the elbow and wrist, a squad band on the
 * forearm and the squad's shape patch (diamond or triangle) on its outer face. */
function sleeve(b: Builder, look: ArmsLook) {
  const rings = 20, seg = 14, z0 = 0.02, z1 = -(UPPER + FORE) + 0.04;
  const pos: number[] = [], nor: number[] = [], si: number[] = [], sw: number[] = [], tag: number[] = [], idx: number[] = [];
  const radius = (z: number, a: number) => {
    const t = (z0 - z) / (z0 - z1);
    let r = THREE.MathUtils.lerp(0.05, 0.042, Math.min(1, t / 0.55)) - Math.max(0, t - 0.55) / 0.45 * 0.009;
    // Folds: bunching above the cuff and around the elbow, varying round the arm.
    const nearElbow = Math.exp(-Math.pow((z + UPPER) / 0.05, 2)), nearCuff = Math.exp(-Math.pow((z - z1 - 0.03) / 0.04, 2));
    r += (nearElbow * 0.004 + nearCuff * 0.0045) * Math.abs(Math.sin(z * 260 + Math.sin(a * 2) * 1.5)) * (0.6 + 0.4 * Math.sin(a * 3 + z * 40));
    r += 0.0012 * Math.sin(a * 5 + z * 30) * Math.sin(z * 70);
    // Slightly flattened: forearms are wider than deep.
    return r * (1 + 0.08 * Math.cos(2 * a));
  };
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, z = z0 + (z1 - z0) * t;
    const wFore = THREE.MathUtils.smoothstep(z, -UPPER + 0.035, -UPPER - 0.035), wHand = THREE.MathUtils.smoothstep(z, -UPPER - FORE + 0.075, -UPPER - FORE + 0.03) * 0.35;
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, r = radius(z, a), r2 = radius(z + 0.002, a);
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      pos.push(x, y, z);
      const dn = new THREE.Vector3(Math.cos(a), Math.sin(a), (r2 - r) / 0.002 * 0).normalize();
      nor.push(dn.x, dn.y, dn.z);
      si.push(0, 1, 2, 0); sw.push(1 - wFore, wFore * (1 - wHand), wFore * wHand, 0);
      const band = z < -UPPER - 0.03 && z > -UPPER - 0.075;
      tag.push(band ? 1 : 0);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) { const a = i * (seg + 1) + j, c = a + seg + 1; idx.push(a, c, a + 1, a + 1, c, c + 1); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  b.addTagged(geo, [look.sleeve, surf(SURF.webbing, { color: look.band })]);
  // Shape patch on the outer face of the forearm (+X for the right arm, which faces away from the gun).
  const zc = -UPPER - 0.115, rr = 0.047, ang = 0.25;
  const shape = new THREE.Shape(), sz = 0.013;
  if (look.squad === 0) { shape.moveTo(0, sz); shape.lineTo(sz * 0.8, 0); shape.lineTo(0, -sz); shape.lineTo(-sz * 0.8, 0); }
  else { shape.moveTo(0, sz); shape.lineTo(sz, -sz * 0.75); shape.lineTo(-sz, -sz * 0.75); }
  const patch = new THREE.ExtrudeGeometry(shape, { depth: 0.0012, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1 });
  // Patch faces outward (+X), its up along -Z of the arm.
  patch.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -Math.sin(ang), Math.cos(ang)).cross(new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0)).normalize(), new THREE.Vector3(0, 0, -1), new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0)));
  patch.translate(Math.cos(ang) * rr, Math.sin(ang) * rr, zc);
  b.bone = 1;
  b.add(patch, surf(SURF.white, { color: look.band, rough: 0.5 }));
  // Border of the band patch in dark thread for contrast.
  b.bone = 0;
}

let gloveCache: { geo: THREE.BufferGeometry; tags: Uint8Array } | null = null;

/** Builds both arms as one skinned geometry: bones 0..17 the right arm, 18..35 the left. */
export function armsGeometry(look: ArmsLook): THREE.BufferGeometry {
  const right = new Builder(0);
  if (!gloveCache) gloveCache = meshField(handField([0, 0, -(UPPER + FORE)]), 0.0038, armNeighbours);
  const full = gloveCache.geo.clone(), tags = gloveCache.tags;
  const tagAttr = new Float32Array(tags.length), N = full.getAttribute('normal');
  for (let i = 0; i < tags.length; i++) {
    let t: number = tags[i];
    // Palm side of fingers and hand faces down in the bind pose: synthetic leather; back is nylon.
    if (t === TAG.back && N.getY(i) < -0.55) t = TAG.palm;
    // Finger sides are separate gusset panels (fourchettes), darker, so the fingers read apart at a glance.
    const zw = -(UPPER + FORE), P = full.getAttribute('position');
    if (P.getZ(i) < zw - 0.09 && Math.abs(N.getX(i)) > 0.72 && t !== TAG.guard) t = TAG.gusset;
    tagAttr[i] = t;
  }
  full.setAttribute('tag', new THREE.Float32BufferAttribute(tagAttr, 1));
  const hand = simplify(full, HAND_TRIS, 0.004);
  right.addTagged(hand, [look.glove, look.palm, look.guard, look.glove, look.palm, surf(look.guard, { color: 0x3a3a36 }), surf(look.glove, { color: 0x1f201d, rough: 0.95 })]);
  sleeve(right, look);
  const geo = right.build({ ao: false });
  // The left arm: mirror in X, flip winding, offset bones.
  const left = geo.clone();
  left.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
  const ix = left.index!.array as Uint32Array | Uint16Array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  const si = left.getAttribute('skinIndex');
  for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) si.setComponent(i, k, si.getComponent(i, k) + ARM_BONES);
  return mergeTwo(geo, left);
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry(), n = a.getAttribute('position').count;
  for (const name of Object.keys(a.attributes)) {
    const A = a.getAttribute(name), B = b.getAttribute(name);
    const arr = new (A.array.constructor as Float32ArrayConstructor)(A.array.length + B.array.length);
    arr.set(A.array as Float32Array); arr.set(B.array as Float32Array, A.array.length);
    out.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize, A.normalized));
  }
  const ia = a.index!.array, ib = b.index!.array, idx = new Uint32Array(ia.length + ib.length);
  idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + n;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// ---- Rig ---------------------------------------------------------------------------------------------------

/** Finger pose: per digit [flex0, flex1, flex2, spread] (thumb: spread is opposition). */
export type HandPose = number[][];
export const POSE = {
  relaxed: [[0.15, 0.2, 0.15, 0], [0.25, 0.35, 0.2, 0], [0.3, 0.4, 0.25, 0], [0.35, 0.45, 0.25, 0], [0.4, 0.5, 0.3, 0]],
  open: [[0, 0, 0, 0], [0, 0, 0, 0.05], [0, 0, 0, 0], [0, 0, 0, -0.04], [0, 0, 0, -0.1]],
  fist: [[0.5, 0.5, 0.6, 0.5], [1.45, 1.6, 0.9, 0], [1.5, 1.65, 0.9, 0], [1.5, 1.65, 0.9, 0], [1.45, 1.6, 0.9, 0]],
} satisfies Record<string, HandPose>;
export const lerpPose = (a: HandPose, b: HandPose, t: number): HandPose => a.map((d, i) => d.map((v, k) => v + (b[i][k] - v) * t));

export interface Arm {
  bones: THREE.Bone[];
  /** Places the arm: shoulder at `shoulder`, wrist at `wrist` with hand orientation `hand`, elbow toward `pole`. */
  solve(shoulder: THREE.Vector3, wrist: THREE.Vector3, hand: THREE.Quaternion, pole: THREE.Vector3): void;
  pose(p: HandPose): void;
}

const restQ = HAND.map((_, d) => digitRest(d));
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3();

/** Makes one arm's bone hierarchy in bind pose. `side` 1 right, -1 left (mirrored in X). Bone positions are local. */
export function makeArm(side: 1 | -1): Arm {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < ARM_BONES; i++) bones.push(new THREE.Bone());
  bones[1].position.set(0, 0, -UPPER); bones[0].add(bones[1]);
  bones[2].position.set(0, 0, -FORE); bones[1].add(bones[2]);
  const mirror = (q: THREE.Quaternion) => (side === 1 ? q.clone() : new THREE.Quaternion(q.x, -q.y, -q.z, q.w));
  for (let d = 0; d < 5; d++) {
    const h = HAND[d], b0 = bones[fb(d, 0)];
    b0.position.set(h.base[0] * side, h.base[1], h.base[2]); b0.quaternion.copy(mirror(restQ[d])); bones[2].add(b0);
    for (let s = 1; s < 3; s++) { const bn = bones[fb(d, s)]; bn.position.set(0, 0, -h.len[s - 1]); bones[fb(d, s - 1)].add(bn); }
  }
  const restMirror = restQ.map(mirror);
  // World-space bases for the two long bones: -Z along the bone, Y from the pole plane.
  const basis = (from: THREE.Vector3, to: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion) => {
    const z = _c.subVectors(from, to).normalize();
    const x = _x.crossVectors(up, z).normalize(), y = _y.crossVectors(z, x);
    return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
  };
  const parentInv = new THREE.Quaternion(), upperW = new THREE.Quaternion(), foreW = new THREE.Quaternion();
  return {
    bones,
    solve(shoulder, wrist, hand, pole) {
      const root = bones[0];
      // A target out of reach pulls the shoulder toward it (up to 12 cm), as a real shooter leans into the gun.
      const reach = UPPER + FORE - 0.004, far = _a.subVectors(wrist, shoulder).length() - reach;
      const sh = far > 0 ? _b.copy(shoulder).addScaledVector(_a.normalize(), Math.min(0.12, far)) : _b.copy(shoulder);
      shoulder = sh.clone();
      root.position.copy(shoulder);
      if (root.parent) { root.parent.updateWorldMatrix(true, false); root.parent.getWorldQuaternion(parentInv).invert(); } else parentInv.identity();
      // Law of cosines for the elbow, bent toward the pole.
      const dir = _a.subVectors(wrist, shoulder), dist = Math.min(UPPER + FORE - 1e-4, Math.max(Math.abs(UPPER - FORE) + 1e-3, dir.length()));
      dir.normalize();
      const along = (dist * dist + UPPER * UPPER - FORE * FORE) / (2 * dist), hgt = Math.sqrt(Math.max(0, UPPER * UPPER - along * along));
      const pv = _b.subVectors(pole, shoulder); pv.addScaledVector(dir, -pv.dot(dir)).normalize();
      const elbow = _d.copy(shoulder).addScaledVector(dir, along).addScaledVector(pv, hgt);
      const wristR = new THREE.Vector3().copy(shoulder).addScaledVector(dir, dist);
      // Upper arm and forearm keep their "up" pointing away from the pole bend, so the elbow faces the pole.
      const upHint = pv.clone().negate();
      basis(shoulder, elbow, upHint, upperW);
      root.quaternion.copy(parentInv).multiply(upperW);
      // Forearm: up from the hand's back so the forearm twists toward the hand.
      const handUp = new THREE.Vector3(0, 1, 0).applyQuaternion(hand), foreUp = upHint.clone().lerp(handUp, 0.6).normalize();
      basis(elbow, wristR, foreUp, foreW);
      bones[1].quaternion.copy(_q.copy(upperW).invert().multiply(foreW));
      bones[2].quaternion.copy(_q2.copy(foreW).invert().multiply(hand));
    },
    pose(p) {
      for (let d = 0; d < 5; d++) {
        const v = p[d];
        // First joint: rest orientation, then spread (about Y) and flex (about X, negative curls toward the palm).
        _e.set(-v[0], v[3] * side * (d === 0 ? -1 : 1), 0, 'YXZ');
        bones[fb(d, 0)].quaternion.copy(restMirror[d]).multiply(_q.setFromEuler(_e));
        bones[fb(d, 1)].quaternion.setFromEuler(_e.set(-v[1], 0, 0));
        bones[fb(d, 2)].quaternion.setFromEuler(_e.set(-v[2], 0, 0));
      }
    },
  };
}
