/** The fighter skeleton: 32 bones in a fixed order, bind pose in model space (metres, facing -Z, right is +X, feet on
 * y = 0), every bone's bind rotation the identity. Helper bones sit at the elbows, knees, shoulders and hips and take
 * half of their joint's rotation so skin there keeps its volume; a twist bone in each forearm takes half the wrist's
 * roll. Proportions follow the reference study in docs/evidence/breachline/fighters/STATUS.md and are fitted to the
 * simulation's head sphere and body cylinder (`world.ts` `rayBody`). */
import * as THREE from 'three';

export const B = {
  root: 0, pelvis: 1, spine1: 2, spine2: 3, neck: 4, head: 5,
  clavL: 6, upperL: 7, foreL: 8, handL: 9, clavR: 10, upperR: 11, foreR: 12, handR: 13,
  thighL: 14, shinL: 15, footL: 16, toeL: 17, thighR: 18, shinR: 19, footR: 20, toeR: 21,
  elbowL: 22, elbowR: 23, kneeL: 24, kneeR: 25, deltL: 26, deltR: 27, hipL: 28, hipR: 29, twistL: 30, twistR: 31,
} as const;
export const BONES = 32;
/** The fighter is authored at 1.76 m and drawn 2% larger, so at the simulation's eye height the knees are a little
 * bent (a ready stance) rather than locked. The animator works in authored units; the fighter's group carries this. */
export const SCALE = 1.02;

/** Per side (0 left, -X; 1 right, +X) bone indices. */
export const SIDE = [
  { clav: B.clavL, upper: B.upperL, fore: B.foreL, hand: B.handL, thigh: B.thighL, shin: B.shinL, foot: B.footL, toe: B.toeL, elbow: B.elbowL, knee: B.kneeL, delt: B.deltL, hip: B.hipL, twist: B.twistL },
  { clav: B.clavR, upper: B.upperR, fore: B.foreR, hand: B.handR, thigh: B.thighR, shin: B.shinR, foot: B.footR, toe: B.toeR, elbow: B.elbowR, knee: B.kneeR, delt: B.deltR, hip: B.hipR, twist: B.twistR },
] as const;
export const sgn = (s: number) => (s ? 1 : -1);

/** A-pose arm: angle of the arm from straight down, toward the side. */
export const ARM_A = 0.62;
export const UPPER_LEN = 0.29, FORE_LEN = 0.255;
/** Bind direction of each arm: down, out and forward, halfway to holding a rifle, so the shoulders deform less. */
export const armDir = (s: number) => new THREE.Vector3(sgn(s) * Math.sin(ARM_A), -Math.cos(ARM_A), -0.62).normalize();
/** Outward face of the upper arm in the bind pose (perpendicular to the arm, away from the body and up). */
export const armOut = (s: number) => { const d = armDir(s), o = new THREE.Vector3(sgn(s) * Math.cos(ARM_A), Math.sin(ARM_A), 0); return o.addScaledVector(d, -o.dot(d)).normalize(); };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Bind joint positions in model space. */
export const JOINT: THREE.Vector3[] = (() => {
  const j: THREE.Vector3[] = new Array(BONES);
  j[B.root] = V(0, 0, 0);
  j[B.pelvis] = V(0, 0.95, 0.0);
  j[B.spine1] = V(0, 1.065, 0.01);
  j[B.spine2] = V(0, 1.22, 0.015);
  j[B.neck] = V(0, 1.46, 0.0);
  j[B.head] = V(0, 1.565, -0.005);
  for (const s of [0, 1]) {
    const S = SIDE[s], g = sgn(s), d = armDir(s);
    j[S.clav] = V(g * 0.03, 1.41, -0.005);
    j[S.upper] = V(g * 0.2, 1.415, 0.0);
    j[S.fore] = j[S.upper].clone().addScaledVector(d, UPPER_LEN);
    j[S.hand] = j[S.fore].clone().addScaledVector(d, FORE_LEN);
    j[S.thigh] = V(g * 0.092, 0.915, 0.0);
    j[S.shin] = V(g * 0.1, 0.495, -0.01);
    j[S.foot] = V(g * 0.105, 0.085, 0.02);
    j[S.toe] = V(g * 0.11, 0.022, -0.115);
    j[S.elbow] = j[S.fore].clone();
    j[S.knee] = j[S.shin].clone();
    j[S.delt] = j[S.upper].clone();
    j[S.hip] = j[S.thigh].clone();
    j[S.twist] = j[S.fore].clone().addScaledVector(d, FORE_LEN * 0.5);
  }
  return j;
})();

export const PARENT: number[] = (() => {
  const p = new Array(BONES).fill(-1);
  p[B.pelvis] = B.root; p[B.spine1] = B.pelvis; p[B.spine2] = B.spine1; p[B.neck] = B.spine2; p[B.head] = B.neck;
  for (const s of [0, 1]) {
    const S = SIDE[s];
    p[S.clav] = B.spine2; p[S.upper] = S.clav; p[S.fore] = S.upper; p[S.hand] = S.fore;
    p[S.thigh] = B.pelvis; p[S.shin] = S.thigh; p[S.foot] = S.shin; p[S.toe] = S.foot;
    p[S.elbow] = S.upper; p[S.knee] = S.thigh; p[S.delt] = S.clav; p[S.hip] = B.pelvis; p[S.twist] = S.fore;
  }
  return p;
})();

/** Thigh, shin and ankle-to-ground lengths. */
export const THIGH_LEN = JOINT[B.thighR].distanceTo(JOINT[B.shinR]);
export const SHIN_LEN = JOINT[B.shinR].distanceTo(JOINT[B.footR]);
export const ANKLE_H = JOINT[B.footR].y;

/** The centre of the head (and helmet) in head-bone space: the point that must sit at the simulation's head sphere
 * centre (eye + 0.02 m). */
export const HEAD_CENTRE = V(0, 0.08, 0.0);

/** Makes the bone objects for one fighter (each SkinnedMesh level shares them). */
export function makeBones(): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONES; i++) { const b = new THREE.Bone(); b.name = `b${i}`; bones.push(b); }
  for (let i = 0; i < BONES; i++) {
    const p = PARENT[i];
    if (p < 0) bones[i].position.copy(JOINT[i]);
    else { bones[i].position.subVectors(JOINT[i], JOINT[p]); bones[p].add(bones[i]); }
  }
  return bones;
}
