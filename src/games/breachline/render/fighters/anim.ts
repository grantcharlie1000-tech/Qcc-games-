/** Fighter animation, authored in code and driven only by the simulation's pose fields. Every frame it builds the
 * pose from scratch in model space (fighter facing -Z, right +X):
 *
 * - Gait: a phase advanced by the distance actually covered; each foot is planted at a fixed world point for its
 *   stance and swings to where the hip will be at its next contact, so a foot on the ground never slides. Pelvis bob,
 *   sway and yaw, shoulder counter-rotation and a heel lift at toe-off come from the same phase.
 * - Upper body: lean rolls the spine, aim pitch bends spine and neck, crouch folds the hips back; then the pelvis is
 *   moved so the head lands exactly in the simulation's head sphere (`world.ts` `eyeOf` + 0.02 m).
 * - Weapon: butt in the shoulder pocket (or raised to the eye when aiming), the bore along the view direction, carried
 *   low when sprinting, canted for a reload, hung at the side while using an object; a recoil spring on each shot.
 * - Arms and legs: two-bone IK to the weapon's sockets and to the feet, with elbows and knees toward poles; helper bones
 *   take half of each joint's rotation.
 * - Reload: the support hand follows the beats in `reloads.ts`, carrying the magazine bone. Flinch: an impulse on the
 *   spine when health drops. Death: three keyed falls, chosen by the fighter's death count, ending at rest on the
 *   ground. */
import * as THREE from 'three';
import { BODY } from '../../config';
import { RELOADS } from '../../reloads';
import type { WeaponId } from '../../config';
import { ANKLE_H, B, BONES, SCALE, HEAD_CENTRE, JOINT, PARENT, SHIN_LEN, SIDE, THIGH_LEN, FORE_LEN, UPPER_LEN, armDir, sgn } from './skeleton';
import { basisQ, handBind } from './body';
import type { WorldWeapon } from './weapon';

export interface PoseInput {
  x: number; z: number; yaw: number; pitch: number; crouch: number; lean: number;
  alive: boolean; pace: number; sprint: boolean; ads: boolean;
  /** 0..1 of the reload still to go (0 when not reloading); `empty` for the full reload with the bolt. */
  reload: number; empty: boolean;
  act: number; actT: number; hp: number; deaths: number;
}
export const idleInput = (): PoseInput => ({ x: 0, z: 0, yaw: 0, pitch: 0, crouch: 0, lean: 0, alive: true, pace: 0, sprint: false, ads: false, reload: 0, empty: false, act: 0, actT: 0, hp: 100, deaths: 0 });

const V = () => new THREE.Vector3();
const Q = () => new THREE.Quaternion();
const ss = THREE.MathUtils.smoothstep;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const ease = (t: number) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const wrap = (a: number) => { a = (a + Math.PI) % (Math.PI * 2); return (a < 0 ? a + Math.PI * 2 : a) - Math.PI; };
const UP = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

/** A critically damped spring per component (stable at any frame time). */
class Spring {
  x = 0; v = 0;
  constructor(public k: number, public d = 2 * Math.sqrt(k)) {}
  step(dt: number, target = 0) { const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n; for (let i = 0; i < n; i++) { this.v += (-(this.x - target) * this.k - this.v * this.d) * h; this.x += this.v * h; } return this.x; }
}

interface Foot { plant: THREE.Vector3; yaw: number; lift: THREE.Vector3; liftYaw: number; stance: boolean }

/** Death keys: at each time (s), the pelvis position (model space at the moment of death) and rotation, and local
 * Euler angles per bone. Bones not listed hold the captured pose until the first key, then relax to zero. */
interface DeathKey { t: number; pelvis: [number, number, number]; prot: [number, number, number]; bones: Partial<Record<number, [number, number, number]>> }

const L = SIDE[0], R = SIDE[1];
const DEATHS: DeathKey[][] = [
  // 0: shot from the front, a stagger back, knees go, falls on the back, one knee raised, arms out.
  [
    { t: 0.12, pelvis: [0, 0.93, 0.08], prot: [0.12, 0, 0.05], bones: { [B.spine1]: [0.15, 0, 0], [B.spine2]: [0.2, 0, 0], [B.neck]: [0.25, 0, 0], [B.head]: [0.2, 0, 0], [L.upper]: [-0.3, 0, 0.2], [R.upper]: [-0.5, 0, -0.1], [L.fore]: [-0.9, 0, 0], [R.fore]: [-1.0, 0, 0], [L.thigh]: [0.15, 0, 0], [R.thigh]: [-0.1, 0, 0], [L.shin]: [-0.3, 0, 0], [R.shin]: [-0.15, 0, 0] } },
    { t: 0.42, pelvis: [0, 0.66, 0.32], prot: [0.6, 0.1, 0.05], bones: { [B.spine1]: [0.15, 0, 0], [B.spine2]: [0.2, 0, 0.05], [B.neck]: [-0.3, 0, 0], [B.head]: [-0.2, 0, 0], [L.upper]: [-0.5, 0, 0.2], [R.upper]: [-0.3, 0, -0.15], [L.fore]: [-0.8, 0, 0], [R.fore]: [-0.7, 0, 0], [L.thigh]: [-0.2, 0, -0.05], [R.thigh]: [-0.35, 0, 0.05], [L.shin]: [-0.9, 0, 0], [R.shin]: [-0.6, 0, 0] } },
    { t: 0.78, pelvis: [0, 0.16, 0.62], prot: [1.45, 0.15, 0.02], bones: { [B.spine1]: [0.12, 0, 0], [B.spine2]: [0.1, 0, 0], [B.neck]: [-0.35, 0, 0], [B.head]: [-0.2, 0.3, 0], [L.upper]: [0.3, 0, -0.45], [R.upper]: [0.1, 0, 0.5], [L.fore]: [-0.5, 0, 0], [R.fore]: [-0.3, 0, 0], [L.thigh]: [0.3, 0, -0.15], [R.thigh]: [0.0, 0, 0.12], [L.shin]: [-0.8, 0, 0], [R.shin]: [-0.2, 0, 0] } },
    { t: 1.05, pelvis: [0, 0.14, 0.66], prot: [1.55, 0.15, 0.02], bones: { [B.spine1]: [0.05, 0, 0], [B.spine2]: [0.0, 0, 0], [B.neck]: [-0.1, 0, 0], [B.head]: [-0.15, 0.55, 0], [L.upper]: [0.15, 0, -0.85], [R.upper]: [0.0, 0, 0.95], [L.fore]: [-0.35, 0, 0], [R.fore]: [-0.2, 0, 0], [L.thigh]: [0.45, 0, -0.18], [R.thigh]: [0.08, 0, 0.15], [L.shin]: [-0.9, 0, 0], [R.shin]: [-0.15, 0, 0], [L.foot]: [0.4, 0, 0], [R.foot]: [0.5, 0, 0] } },
  ],
  // 1: crumples: knees buckle first, folds at the waist, falls forward onto the chest, face turned.
  [
    { t: 0.14, pelvis: [0, 0.88, -0.02], prot: [-0.15, 0, -0.05], bones: { [B.spine1]: [-0.3, 0, 0], [B.spine2]: [-0.3, 0, 0], [B.neck]: [-0.2, 0, 0], [B.head]: [-0.3, 0, 0], [L.upper]: [0.3, 0, 0.2], [R.upper]: [0.4, 0, -0.2], [L.fore]: [-0.8, 0, 0], [R.fore]: [-0.9, 0, 0], [L.thigh]: [0.4, 0, 0], [R.thigh]: [0.3, 0, 0], [L.shin]: [-0.7, 0, 0], [R.shin]: [-0.6, 0, 0] } },
    { t: 0.42, pelvis: [0, 0.48, 0.05], prot: [-0.35, 0.05, -0.05], bones: { [B.spine1]: [-0.4, 0, 0], [B.spine2]: [-0.35, 0, 0], [B.neck]: [-0.1, 0, 0], [B.head]: [-0.1, 0, 0], [L.upper]: [0.6, 0, -0.1], [R.upper]: [0.7, 0, 0.15], [L.fore]: [-0.5, 0, 0], [R.fore]: [-0.6, 0, 0], [L.thigh]: [1.45, 0, 0], [R.thigh]: [1.35, 0, 0], [L.shin]: [-2.3, 0, 0], [R.shin]: [-2.2, 0, 0], [L.foot]: [0.6, 0, 0], [R.foot]: [0.6, 0, 0] } },
    { t: 0.8, pelvis: [0, 0.17, -0.42], prot: [-1.35, 0.1, -0.08], bones: { [B.spine1]: [0.0, 0, 0], [B.spine2]: [0.05, 0, 0], [B.neck]: [0.35, 0, 0], [B.head]: [0.3, 0.6, 0], [L.upper]: [1.0, 0, -0.5], [R.upper]: [-0.6, 0, 0.1], [L.fore]: [-1.2, 0, 0], [R.fore]: [-0.3, 0, 0], [L.thigh]: [0.5, 0, -0.05], [R.thigh]: [0.15, 0, 0.05], [L.shin]: [-0.9, 0, 0], [R.shin]: [-0.3, 0, 0] } },
    { t: 1.1, pelvis: [0, 0.15, -0.46], prot: [-1.52, 0.1, -0.08], bones: { [B.spine1]: [0.02, 0, 0], [B.spine2]: [0.06, 0, 0], [B.neck]: [0.3, 0, 0], [B.head]: [0.25, 0.9, 0], [L.upper]: [1.25, 0, -0.55], [R.upper]: [-0.65, 0, 0.05], [L.fore]: [-1.35, 0, 0], [R.fore]: [-0.25, 0, 0], [L.thigh]: [0.35, 0, -0.08], [R.thigh]: [0.05, 0, 0.05], [L.shin]: [-0.75, 0, 0], [R.shin]: [-0.15, 0, 0], [L.foot]: [-0.4, 0, 0], [R.foot]: [-0.5, 0, 0] } },
  ],
  // 2: spun by the hit, drops to the knees and slumps onto the right side, curled.
  [
    { t: 0.14, pelvis: [0.03, 0.92, 0.0], prot: [0.0, 0.5, 0.08], bones: { [B.spine1]: [-0.1, 0.25, 0.15], [B.spine2]: [-0.1, 0.3, 0.15], [B.neck]: [0, 0.2, 0], [B.head]: [0.1, 0.2, 0.1], [L.upper]: [0.3, 0, 0.15], [R.upper]: [0.5, 0, -0.15], [L.fore]: [-0.9, 0, 0], [R.fore]: [-1.0, 0, 0], [L.thigh]: [0.2, 0, -0.1], [R.thigh]: [0.0, 0, 0.1], [L.shin]: [-0.4, 0, 0], [R.shin]: [-0.2, 0, 0] } },
    { t: 0.45, pelvis: [0.08, 0.52, 0.0], prot: [-0.2, 1.0, 0.3], bones: { [B.spine1]: [-0.25, 0.1, 0.25], [B.spine2]: [-0.2, 0.1, 0.25], [B.neck]: [0.1, 0, 0.2], [B.head]: [0.1, 0, 0.2], [L.upper]: [0.6, 0, 0.25], [R.upper]: [0.5, 0, -0.2], [L.fore]: [-0.9, 0, 0], [R.fore]: [-0.8, 0, 0], [L.thigh]: [1.35, 0, -0.1], [R.thigh]: [1.25, 0, 0.1], [L.shin]: [-2.1, 0, 0], [R.shin]: [-2.0, 0, 0] } },
    { t: 0.82, pelvis: [0.3, 0.22, 0.05], prot: [0.0, 1.3, -1.45], bones: { [B.spine1]: [-0.25, 0, 0.05], [B.spine2]: [-0.25, 0, 0.0], [B.neck]: [-0.1, 0, 0.3], [B.head]: [0.0, 0, 0.35], [L.upper]: [0.6, 0, 0.5], [R.upper]: [0.9, 0, -0.6], [L.fore]: [-0.8, 0, 0], [R.fore]: [-0.8, 0, 0], [L.thigh]: [1.0, 0, -0.1], [R.thigh]: [1.2, 0, 0.1], [L.shin]: [-1.5, 0, 0], [R.shin]: [-1.6, 0, 0] } },
    { t: 1.1, pelvis: [0.33, 0.2, 0.06], prot: [0.0, 1.3, -1.52], bones: { [B.spine1]: [-0.3, 0, 0.05], [B.spine2]: [-0.3, 0, 0.0], [B.neck]: [-0.1, 0, 0.35], [B.head]: [0.0, 0, 0.4], [L.upper]: [0.7, 0, 0.6], [R.upper]: [0.95, 0, -0.6], [L.fore]: [-0.7, 0, 0], [R.fore]: [-0.9, 0, 0], [L.thigh]: [0.95, 0, -0.1], [R.thigh]: [1.15, 0, 0.1], [L.shin]: [-1.45, 0, 0], [R.shin]: [-1.6, 0, 0], [L.foot]: [0.3, 0, 0], [R.foot]: [0.3, 0, 0] } },
  ],
];
export const DEATH_KINDS = DEATHS.length;
export const DEATH_TIME = 1.1;

const OFFS = JOINT.map((j, i) => (PARENT[i] < 0 ? j.clone() : j.clone().sub(JOINT[PARENT[i]])));
const HAND_BIND = [handBind(0), handBind(1)], HAND_BIND_INV = HAND_BIND.map(q => q.clone().invert());
// Bind directions of the limb bones, and the direction each joint bends toward in the bind pose.
const DIR = (a: number, b: number) => JOINT[b].clone().sub(JOINT[a]).normalize();
const LEG_BIND = [0, 1].map(s => ({ up: DIR(SIDE[s].thigh, SIDE[s].shin), lo: DIR(SIDE[s].shin, SIDE[s].foot), pole: new THREE.Vector3(0, 0, -1) }));
const ARM_BIND = [0, 1].map(s => ({ up: armDir(s), lo: armDir(s), pole: new THREE.Vector3(0, 0, 1) }));
const TOE_FROM_ANKLE = [0, 1].map(s => JOINT[SIDE[s].toe].clone().sub(JOINT[SIDE[s].foot]));

const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
/** Rotation taking the bind frame (dir, pole) to the target frame (dir, pole). */
function frameRot(bd: THREE.Vector3, bp: THREE.Vector3, td: THREE.Vector3, tp: THREE.Vector3, out: THREE.Quaternion) {
  const bpp = bp.clone().addScaledVector(bd, -bp.dot(bd)).normalize(), tpp = tp.clone().addScaledVector(td, -tp.dot(td)).normalize();
  _m1.makeBasis(bd, bpp, new THREE.Vector3().crossVectors(bd, bpp));
  _m2.makeBasis(td, tpp, new THREE.Vector3().crossVectors(td, tpp));
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}

export interface Diag { dbg?: Record<string, unknown>; headErr: number; head: THREE.Vector3; headTarget: THREE.Vector3; pelvisShift: THREE.Vector3; armReach: [number, number]; legReach: [number, number]; feet: THREE.Vector3[]; stance: [boolean, boolean]; muzzle: THREE.Vector3; aimErr: number; chest: THREE.Vector3; pelvis: THREE.Vector3 }

export class Animator {
  /** Local rotations and world (model-space) transforms of every bone, rebuilt each frame. */
  readonly lq = Array.from({ length: BONES }, Q);
  readonly wq = Array.from({ length: BONES }, Q);
  readonly wp = Array.from({ length: BONES }, V);
  readonly pelvisPos = new THREE.Vector3();
  /** Fighter position (world) and yaw, as last given. */
  readonly root = new THREE.Vector3();
  yaw = 0;
  private vel = new THREE.Vector3();
  private prev = new THREE.Vector3();
  private phase = 0;
  private feet: Foot[] = [0, 1].map(() => ({ plant: V(), yaw: 0, lift: V(), liftYaw: 0, stance: true }));
  private moving = 0;
  private crouchS = 0;
  private recoil = [new Spring(320, 22), new Spring(260, 20)];
  private flinch = [new Spring(140, 11), new Spring(140, 11)];
  private lastHp = 100;
  private dead = false;
  private deathT = 0;
  private deathKind = 0;
  private deathFrom = Array.from({ length: BONES }, Q);
  private deathPelvis = new THREE.Vector3();
  private deathPelvisQ = new THREE.Quaternion();
  private weaponFrom = new THREE.Matrix4();
  private time = 0;
  private diagOut: Diag = { headErr: 0, head: V(), headTarget: V(), pelvisShift: V(), armReach: [0, 0], legReach: [0, 0], feet: [V(), V()], stance: [true, true], muzzle: V(), aimErr: 0, chest: V(), pelvis: V() };
  /** Weapon transform in model space. */
  readonly weaponM = new THREE.Matrix4();
  weaponId: WeaponId = 'ar';

  constructor(readonly bones: THREE.Bone[], readonly weapon: THREE.Object3D, readonly weaponBones: THREE.Bone[], public w: WorldWeapon) {}

  setWeapon(id: WeaponId, w: WorldWeapon) { this.weaponId = id; this.w = w; }

  /** Puts every bone back in the bind pose. */
  bindPose() {
    for (let i = 0; i < BONES; i++) { this.bones[i].quaternion.identity(); this.bones[i].position.copy(OFFS[i]); }
    this.weapon.visible = false;
  }

  /** Snaps to the input's pose with feet at rest (a spawn or a new round). */
  reset(p: PoseInput) {
    this.root.set(p.x, 0, p.z); this.prev.copy(this.root); this.yaw = p.yaw; this.vel.set(0, 0, 0); this.phase = 0; this.moving = 0;
    this.crouchS = p.crouch; this.dead = !p.alive; this.deathT = p.alive ? 0 : DEATH_TIME; this.deathKind = ((p.deaths % DEATH_KINDS) + DEATH_KINDS) % DEATH_KINDS; this.lastHp = p.hp;
    for (const sp of [...this.recoil, ...this.flinch]) { sp.x = 0; sp.v = 0; }
    for (let s = 0; s < 2; s++) { const f = this.feet[s]; this.restFoot(s, p.crouch, f.plant); f.yaw = p.yaw; f.lift.copy(f.plant); f.liftYaw = f.yaw; f.stance = true; }
    this.weapon.visible = true;
    if (this.dead) { this.update({ ...p, alive: true }, 0); this.startDeath(p); this.deathT = DEATH_TIME; this.update(p, 0); }
  }

  /** A shot by this fighter. */
  fire() { const k = this.w.pistol ? 1.3 : 1; this.recoil[0].v += 1.6 * k; this.recoil[1].v += 2.6 * k; }

  /** World position of the foot's rest spot under the hip. */
  private restFoot(s: number, crouch: number, out: THREE.Vector3) {
    const g = sgn(s), wide = 0.13 + crouch * 0.04, fwd = crouch * (s ? 0.1 : -0.12) + (s ? 0.07 : -0.08) * (1 - this.moving);
    const c = Math.cos(this.yaw), sn = Math.sin(this.yaw), lx = g * wide, lz = fwd;
    return out.set(this.root.x + c * lx + sn * lz, 0, this.root.z - sn * lx + c * lz);
  }

  /** Model-space to world (the group's transform). */
  private toWorld(v: THREE.Vector3, out: THREE.Vector3) { const c = Math.cos(this.yaw) * SCALE, s = Math.sin(this.yaw) * SCALE; return out.set(this.root.x + c * v.x + s * v.z, v.y * SCALE, this.root.z - s * v.x + c * v.z); }
  private toModel(v: THREE.Vector3, out: THREE.Vector3) { const c = Math.cos(this.yaw) / SCALE, s = Math.sin(this.yaw) / SCALE, dx = v.x - this.root.x, dz = v.z - this.root.z; return out.set(c * dx - s * dz, v.y / SCALE, s * dx + c * dz); }

  private startDeath(p: PoseInput) {
    this.dead = true; this.deathT = 0; this.deathKind = ((p.deaths % DEATH_KINDS) + DEATH_KINDS) % DEATH_KINDS;
    for (let i = 0; i < BONES; i++) this.deathFrom[i].copy(this.lq[i]);
    this.deathPelvis.copy(this.pelvisPos); this.deathPelvisQ.copy(this.lq[B.pelvis]);
    this.weaponFrom.copy(this.weaponM);
  }

  update(p: PoseInput, dt: number) {
    this.time += dt;
    // Position and velocity from the simulation's position (the only motion data a remote fighter has).
    this.root.set(p.x, 0, p.z); this.yaw = p.yaw;
    if (dt > 0) {
      const k = 1 - Math.exp(-dt * 12), vx = (this.root.x - this.prev.x) / dt, vz = (this.root.z - this.prev.z) / dt;
      if (Math.hypot(vx, vz) > 12) this.vel.set(0, 0, 0); else { this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k; }
    }
    this.prev.copy(this.root);
    if (!p.alive && !this.dead) this.startDeath(p);
    if (p.alive && this.dead) this.reset(p);
    if (this.dead) { this.deathT += dt; this.poseDeath(); this.write(); return; }
    if (p.hp < this.lastHp - 0.5) { const h = this.time * 7.3; this.flinch[0].v += 14; this.flinch[1].v += Math.sin(h) > 0 ? 10 : -10; }
    this.lastHp = p.hp;
    this.crouchS = p.crouch;
    this.recoil[0].step(dt); this.recoil[1].step(dt); this.flinch[0].step(dt); this.flinch[1].step(dt);
    this.gait(p, dt);
    this.upper(p);
    this.write();
  }

  // ---- Lower body --------------------------------------------------------------------------------------------------

  private hipBob = 0; private hipSway = 0; private hipYaw = 0; private heel = [0, 0];

  private gait(p: PoseInput, dt: number) {
    const speed = Math.hypot(this.vel.x, this.vel.z), crouch = p.crouch;
    // Shorter steps sideways, where the hip reaches less far.
    const side = speed > 0.1 ? Math.abs(Math.sin(Math.atan2(this.vel.x, this.vel.z) - p.yaw)) : 0;
    const stride = clamp(0.45 + 0.24 * speed, 0.7, 1.7) * (1 - crouch * 0.15) * (1 - side * 0.25);
    const stanceFrac = clamp(0.62 - speed * 0.045, 0.38, 0.62);
    // Error of each planted foot from its rest spot: a fighter turning on the spot re-steps.
    let err = 0;
    const rest = [V(), V()];
    for (let s = 0; s < 2; s++) { this.restFoot(s, crouch, rest[s]); const f = this.feet[s]; err = Math.max(err, f.plant.distanceTo(rest[s]) * 1.2, Math.abs(wrap(f.yaw - p.yaw)) * 0.25); }
    const wantMove = speed > 0.3 || err > 0.13;
    const fl = (s: number) => ((this.phase + (s ? 0.5 : 0)) % 1 + 1) % 1;
    const bothDown = fl(0) < stanceFrac && fl(1) < stanceFrac;
    let cadence = 0;
    if (wantMove || !bothDown) cadence = Math.max(speed / stride, 1.7);
    this.moving += ((speed > 0.3 ? 1 : 0) - this.moving) * Math.min(1, dt * 6);
    const prevPhase = this.phase;
    this.phase += cadence * dt;
    const stanceDur = cadence > 0 ? stanceFrac / cadence : 0.3;
    for (let s = 0; s < 2; s++) {
      const f = this.feet[s], a = ((prevPhase + (s ? 0.5 : 0)) % 1 + 1) % 1, b = fl(s);
      const wasStance = f.stance, isStance = b < stanceFrac;
      if (wasStance && !isStance) { f.lift.copy(f.plant); f.liftYaw = f.yaw; }
      f.stance = isStance;
      if (!isStance) {
        // Swing toward where the hip will be when this foot lands, plus half a stance of travel.
        const sw = (b - stanceFrac) / (1 - stanceFrac), tLand = cadence > 0 ? (1 - b) / cadence : 0;
        const target = rest[s].clone().addScaledVector(this.vel, tLand + stanceDur * 0.5);
        const e = ease(sw);
        f.plant.lerpVectors(f.lift, target, e);
        f.yaw = f.liftYaw + wrap(p.yaw + (s ? -0.08 : 0.08) - f.liftYaw) * e;
        const liftH = (0.05 + 0.05 * Math.min(1.5, speed / 3.5)) * (1 - crouch * 0.4);
        f.plant.y = liftH * Math.sin(Math.PI * Math.pow(sw, 0.8));
      } else f.plant.y = 0;
      // Heel lift over the last part of the stance (toe-off) and toes up into the landing.
      const st = b / stanceFrac, sw = (b - stanceFrac) / (1 - stanceFrac);
      this.heel[s] = isStance ? ss(st, 0.55, 1) * clamp(speed / 3.5, 0, 1) * 0.6 : (1 - ss(sw, 0.0, 0.7)) * 0.55 * clamp(speed / 3.5, 0, 1) - ss(sw, 0.7, 1) * 0.25 * clamp(speed / 3, 0, 1);
      void a;
    }
    // Pelvis: lowest at each contact, swaying over the stance foot, turning with the forward leg.
    const w = clamp(speed / 3.5, 0, 1.4);
    this.hipBob = -(0.5 + 0.5 * Math.cos(this.phase * Math.PI * 4)) * 0.034 * w;
    this.hipSway = -Math.sin(this.phase * Math.PI * 2) * 0.022 * Math.min(1, w + 0.2) * (cadence > 0 ? 1 : 0);
    this.hipYaw = Math.sin(this.phase * Math.PI * 2) * 0.16 * Math.min(1, w);
  }

  // ---- Upper body and limbs ----------------------------------------------------------------------------------------

  private upper(p: PoseInput) {
    const { lq, wq, wp } = this, c = this.crouchS, lean = p.lean;
    const reloading = p.reload > 0.001, using = p.act !== 0, sprint = p.sprint ? 1 : 0, ads = p.ads ? 1 : 0;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    // Movement direction in model space, for the lower body's turn toward a strafe.
    const vm = this.toModel(this.root.clone().add(this.vel), V());
    const strafe = speed > 0.5 ? clamp(Math.atan2(vm.x, -vm.z), -1.6, 1.6) : 0;
    const legTurn = (Math.abs(strafe) < 1.6 ? strafe : 0) * 0.35 * Math.min(1, speed / 2) * (Math.abs(strafe) > 2.2 ? 0 : 1);
    for (const q of lq) q.identity();
    // Pelvis: hips back and down in a crouch.
    const e = new THREE.Euler();
    // Blading: a rifleman stands with the support shoulder forward; the head turns back to the aim.
    const blade = (this.w.pistol ? -0.12 : -0.55) * (1 - sprint * 0.7) * (using ? 0.3 : 1);
    lq[B.pelvis].setFromEuler(e.set(-c * 0.22 - sprint * 0.12, this.hipYaw + legTurn + blade * 0.35, -this.hipSway * 1.5, 'YXZ'));
    // Spine: crouch folds forward, sprint leans in, aim pitch bends the chest, lean rolls; flinch adds on top.
    const aim = p.pitch, fl = this.flinch;
    const fold = c * 0.2 + sprint * 0.16 + this.moving * 0.05 * (1 - sprint);
    const chestPitch = clamp(aim, -1.2, 1.2) * (aim < 0 ? 0.22 : 0.45);
    const roll = -lean * 0.36;
    lq[B.spine1].setFromEuler(e.set(-fold * 0.4 + chestPitch * 0.35 + fl[0].x * 0.3, -(this.hipYaw + legTurn) * 0.5 + blade * 0.3, roll * 0.45 + fl[1].x * 0.25, 'YXZ'));
    lq[B.spine2].setFromEuler(e.set(-fold * 0.3 + chestPitch * 0.65 + fl[0].x * 0.25 - this.recoil[1].x * 0.25, -(this.hipYaw + legTurn) * 0.5 + blade * 0.35, roll * 0.4 + fl[1].x * 0.2, 'YXZ'));
    const neckPitch = clamp(aim - chestPitch, -0.9, 0.9) * 0.45 + fold * 0.45;
    lq[B.neck].setFromEuler(e.set(neckPitch - fl[0].x * 0.3, -blade * 0.45, -roll * 0.3, 'YXZ'));
    lq[B.head].setFromEuler(e.set(clamp(aim - chestPitch, -0.9, 0.9) * 0.55 + fold * 0.35 - fl[0].x * 0.4, -blade * 0.55, -roll * 0.25 + fl[1].x * 0.3, 'YXZ'));
    // Clavicles shrug forward when the arms are up.
    for (const s of [0, 1]) lq[SIDE[s].clav].setFromEuler(e.set(fl[0].x * 0.15, sgn(s) * (0.18 + ads * 0.06), sgn(s) * (-0.04 - Math.abs(fl[0].x) * 0.2), 'YXZ'));
    // Pelvis position: rest height, crouch drop and hips back, bob and sway; then corrected so the head is exact.
    this.pelvisPos.set(this.hipSway, JOINT[B.pelvis].y - 0.035 - c * 0.36 - sprint * 0.07, c * 0.07 + sprint * 0.03);
    this.fk();
    const target = this.headTarget(p, V());
    // Most of the head's horizontal error is taken by bending the lower spine toward the target (the body leans
    // into it, as a person reaching their head somewhere does); the pelvis moves for the rest.
    for (let it = 0; it < 2; it++) {
      const hc = this.headCentre(V()), d = target.clone().sub(hc); d.y = 0;
      const len = d.length(); if (len < 1e-4) break;
      const arm = hc.clone().sub(wp[B.spine1]), axis = new THREE.Vector3().crossVectors(arm, d).normalize();
      const rot = new THREE.Quaternion().setFromAxisAngle(axis, Math.atan(len * 0.75 / arm.length()));
      lq[B.spine1].copy(wq[B.pelvis]).invert().multiply(rot.multiply(wq[B.spine1]));
      this.fk();
    }
    const head = this.headCentre(V());
    const shift = target.clone().sub(head);
    // The head follows the simulation exactly except for the gait's bob (a few centimetres, inside the sphere).
    this.pelvisPos.add(shift); this.pelvisPos.y += this.hipBob;
    this.fk();
    const dg = this.diagOut;
    dg.pelvisShift.copy(shift); dg.head.copy(this.headCentre(V())); dg.headTarget.copy(target); dg.headErr = dg.head.distanceTo(target) - Math.abs(this.hipBob);
    dg.chest.copy(wp[B.spine2]); dg.pelvis.copy(wp[B.pelvis]);
    // Legs to the feet.
    for (const s of [0, 1]) {
      const f = this.feet[s], foot = this.toModel(f.plant, V()), yawM = wrap(f.yaw - this.yaw);
      const fq = new THREE.Quaternion().setFromEuler(e.set(this.heel[s], yawM, 0, 'YXZ'));
      // The ball of the foot stays where it was planted while the heel lifts: ankle = ball - R * (ball - ankle).
      const toe = TOE_FROM_ANKLE[s], ballGround = foot.clone().add(new THREE.Vector3(toe.x, 0, toe.z).applyAxisAngle(UP, yawM));
      const ankle = ballGround.clone().add(new THREE.Vector3(0, toe.y, 0)).sub(toe.clone().applyQuaternion(fq));
      ankle.y = Math.max(ankle.y, ANKLE_H * 0.85 + foot.y);
      if (this.heel[s] < 0) ankle.copy(foot).add(new THREE.Vector3(0, ANKLE_H, 0));
      const pole = new THREE.Vector3(-Math.sin(yawM), 0.15, -Math.cos(yawM)).normalize().add(new THREE.Vector3(sgn(s) * 0.12, 0, 0));
      dg.legReach[s] = this.limb(SIDE[s].thigh, SIDE[s].shin, SIDE[s].foot, THIGH_LEN, SHIN_LEN, ankle, pole, LEG_BIND[s], fq);
      // Toes flat on the ground while the heel is up.
      lq[SIDE[s].toe].setFromEuler(e.set(-Math.max(0, this.heel[s]) * 0.9, 0, 0));
      dg.feet[s].copy(f.plant); dg.stance[s] = f.stance;
    }
    // Weapon.
    this.placeWeapon(p, sprint, ads, reloading, using, speed);
    // Arms to the weapon (or the reload path, or the object in use).
    const hands = this.handTargets(p, reloading, using);
    // Protract the support shoulder until the hand is within reach (a rifleman's shoulder rolls forward onto a long
    // handguard), up to 0.8 rad.
    let extra = 0;
    for (let it = 0; it < 4; it++) {
      const r = this.wp[L.upper].distanceTo(hands[0].p) / (UPPER_LEN + FORE_LEN);
      if (r < 0.95) break;
      extra = Math.min(0.8, extra + (r - 0.93) * 2.2);
      lq[L.clav].setFromEuler(e.set(0.05 * extra, -(0.18 + ads * 0.06) - extra, 0.04 + extra * 0.25, 'YXZ'));
      this.fkFrom(L.clav);
    }
    for (const s of [0, 1]) {
      const S = SIDE[s], h = hands[s];
      const pole = new THREE.Vector3(sgn(s) * (s ? 0.75 : 0.5), -1, s ? 0.35 : 0.1);
      const hq = h.q.clone().multiply(HAND_BIND_INV[s]);
      dg.armReach[s] = this.limb(S.upper, S.fore, S.hand, UPPER_LEN, FORE_LEN, h.p, pole.applyQuaternion(this.wq[B.spine2]).add(this.wp[S.upper]).sub(this.wp[S.upper]), ARM_BIND[s], hq);
    }
    dg.dbg = { weapon: new THREE.Vector3().setFromMatrixPosition(this.weaponM).toArray(), grip: hands[1].p.toArray(), support: hands[0].p.toArray(), shR: this.wp[R.upper].toArray(), shL: this.wp[L.upper].toArray(), handR: this.wp[R.hand].toArray() };
    this.helpers();
    // Diagnostics: the muzzle and how far the bore is from the view direction.
    const mz = this.w.muzzle.clone().applyMatrix4(this.weaponM), bore = new THREE.Vector3(0, 0, -1).transformDirection(this.weaponM);
    const look = new THREE.Vector3(0, Math.sin(p.pitch), -Math.cos(p.pitch));
    dg.muzzle.copy(this.toWorld(mz, V())); dg.aimErr = bore.angleTo(look);
    void wq;
  }

  /** Head centre (model space). */
  headCentre(out: THREE.Vector3) { return out.copy(HEAD_CENTRE).applyQuaternion(this.wq[B.head]).add(this.wp[B.head]); }
  /** Where the simulation's head sphere is, in model space: eyeOf (lean shifts sideways and lowers) + 0.02. */
  headTarget(p: PoseInput, out: THREE.Vector3) {
    const eye = BODY.eyeStand + (BODY.eyeCrouch - BODY.eyeStand) * p.crouch - Math.abs(p.lean) * 0.05;
    return out.set(p.lean * BODY.lean, eye + 0.02 - (p.sprint ? 0.06 : 0), p.sprint ? -0.04 : 0).multiplyScalar(1 / SCALE);
  }

  /** Forward kinematics from local rotations (model space). */
  private fk() {
    const { lq, wq, wp } = this;
    for (let i = 0; i < BONES; i++) {
      const pa = PARENT[i];
      if (pa < 0) { wq[i].copy(lq[i]); wp[i].copy(OFFS[i]); continue; }
      wq[i].multiplyQuaternions(wq[pa], lq[i]);
      if (i === B.pelvis) wp[i].copy(this.pelvisPos);
      else wp[i].copy(OFFS[i]).applyQuaternion(wq[pa]).add(wp[pa]);
    }
  }
  /** FK of one bone's subtree after its local rotation changed. */
  private fkFrom(i: number) {
    const { lq, wq, wp } = this;
    for (let j = i; j < BONES; j++) {
      if (j !== i && !this.isDesc(j, i)) continue;
      const pa = PARENT[j];
      wq[j].multiplyQuaternions(wq[pa], lq[j]);
      wp[j].copy(OFFS[j]).applyQuaternion(wq[pa]).add(wp[pa]);
    }
  }
  private isDesc(j: number, i: number) { for (let k = PARENT[j]; k >= 0; k = PARENT[k]) if (k === i) return true; return false; }

  /** Two-bone IK in model space: `end` placed at `target` with world rotation `endQ`, the middle joint toward `pole`.
   * Returns the reach ratio (1 = fully straight; above 1 the target was out of reach). */
  private limb(a: number, b: number, c: number, l1: number, l2: number, target: THREE.Vector3, pole: THREE.Vector3, bind: { up: THREE.Vector3; lo: THREE.Vector3; pole: THREE.Vector3 }, endQ: THREE.Quaternion) {
    const { lq, wq, wp } = this, sh = wp[a];
    const d = target.clone().sub(sh), dist0 = d.length(), dist = clamp(dist0, 0.02, (l1 + l2) * 0.9995), dir = d.normalize();
    const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1), along = l1 * cosA, h = l1 * Math.sqrt(1 - cosA * cosA);
    const pv = pole.clone().addScaledVector(dir, -pole.dot(dir)); if (pv.lengthSq() < 1e-8) pv.copy(bind.pole); pv.normalize();
    const mid = sh.clone().addScaledVector(dir, along).addScaledVector(pv, h), wristR = sh.clone().addScaledVector(dir, dist);
    const qa = Q(), qb = Q();
    frameRot(bind.up, bind.pole, mid.clone().sub(sh).normalize(), pv, qa);
    frameRot(bind.lo, bind.pole, wristR.clone().sub(mid).normalize(), pv, qb);
    const pa = wq[PARENT[a]];
    lq[a].copy(pa).invert().multiply(qa);
    lq[b].copy(qa).invert().multiply(qb);
    lq[c].copy(qb).invert().multiply(endQ);
    this.fkFrom(a);
    return dist0 / (l1 + l2);
  }

  /** Helper bones: half the joint's rotation; forearm twist half the hand's roll. */
  private helpers() {
    const { lq } = this, I = new THREE.Quaternion();
    for (const s of [0, 1]) {
      const S = SIDE[s];
      lq[S.elbow].copy(I).slerp(lq[S.fore], 0.5);
      lq[S.knee].copy(I).slerp(lq[S.shin], 0.5);
      lq[S.delt].copy(I).slerp(lq[S.upper], 0.5);
      lq[S.hip].copy(I).slerp(lq[S.thigh], 0.5);
      // Twist: the hand's rotation about the forearm's axis (bind arm direction), halved.
      const ax = armDir(s), h = lq[S.hand], dot = h.x * ax.x + h.y * ax.y + h.z * ax.z;
      const tw = new THREE.Quaternion(ax.x * dot, ax.y * dot, ax.z * dot, h.w).normalize();
      lq[S.twist].copy(I).slerp(tw, 0.5);
    }
  }

  // ---- Weapon ---------------------------------------------------------------------------------------------------------

  private placeWeapon(p: PoseInput, sprint: number, ads: number, reloading: boolean, using: boolean, speed: number) {
    const { wq, wp } = this, w = this.w;
    const chest = wp[B.spine2], cq = wq[B.spine2];
    const look = new THREE.Vector3(0, Math.sin(p.pitch), -Math.cos(p.pitch));
    // Ready: butt in the right shoulder pocket. Aimed: the sight line just under the right eye.
    const pocket = new THREE.Vector3(0.1, 0.17, -0.075).applyQuaternion(cq).add(chest);
    const eye = this.headCentre(V()).add(new THREE.Vector3(0.035, -0.02, -0.03).applyQuaternion(wq[B.head]));
    const fwd = look.clone();
    const upRef = new THREE.Vector3(0, 1, 0).applyQuaternion(cq);
    const right = new THREE.Vector3().crossVectors(fwd, upRef).normalize(), up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, fwd.clone().negate());
    const qAim = new THREE.Quaternion().setFromRotationMatrix(basis);
    // Weapon origin is the grip; the butt is behind it. Position so the butt sits in the pocket.
    const buttW = w.butt.clone().applyQuaternion(qAim);
    const hipPos = pocket.clone().sub(buttW);
    const sightOff = new THREE.Vector3(0, w.sight, 0).applyQuaternion(qAim);
    const adsPos = eye.clone().sub(sightOff).addScaledVector(fwd, w.pistol ? 0.45 : Math.max(0.05, w.butt.z - 0.13));
    if (w.pistol) hipPos.copy(chest).add(new THREE.Vector3(0.04, 0.12, -0.36).applyQuaternion(cq));
    const pos = hipPos.lerp(adsPos, ads * (w.pistol ? 0.85 : 0.9));
    let q = qAim.clone();
    // Sprint: muzzle down and across the body, held at the chest.
    if (sprint > 0) {
      const sq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.75, 0.55, 0.5, 'YXZ'));
      q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)).multiply(sq);
      q.premultiply(cq);
      pos.copy(chest).add(new THREE.Vector3(0.02, 0.06, -0.3).applyQuaternion(cq)).sub(w.butt.clone().multiplyScalar(0.35).applyQuaternion(q));
      void speed;
    }
    // Reload: canted with the magazine well toward the support hand, pulled in a little.
    if (reloading) {
      const t = 1 - p.reload, k = ss(t, 0, 0.1) * (1 - ss(t, 0.88, 1));
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3 * k, 0.15 * k, -0.55 * k)));
      pos.add(new THREE.Vector3(-0.03, -0.04, 0.08).applyQuaternion(cq).multiplyScalar(k));
    }
    // Using an object: the weapon hangs on its sling at the right side, muzzle down.
    if (using) {
      q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.25, 0.25, 0.1, 'YXZ')).premultiply(cq);
      pos.copy(chest).add(new THREE.Vector3(0.27, -0.2, -0.1).applyQuaternion(cq));
    }
    // A hit knocks the weapon off line for a moment (the head stays in the sim's sphere, so this is where it shows).
    const fl = this.flinch;
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(fl[0].x * 0.22, fl[1].x * 0.18, fl[1].x * 0.3)));
    pos.add(new THREE.Vector3(fl[1].x * 0.03, fl[0].x * 0.03, fl[0].x * 0.05).applyQuaternion(cq));
    // Recoil: back along the bore and the muzzle up.
    const back = this.recoil[0].x * 0.6, rise = this.recoil[1].x * 1.1;
    pos.addScaledVector(fwd, -back);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(X, rise));
    this.weaponM.compose(pos, q, new THREE.Vector3(1, 1, 1));
  }

  /** Hand targets (model space): position and hand-space rotation for each side. */
  private handTargets(p: PoseInput, reloading: boolean, using: boolean) {
    const w = this.w, M = this.weaponM, wq = new THREE.Quaternion().setFromRotationMatrix(M);
    const sock = (s: { p: THREE.Vector3; palm: THREE.Vector3; fingers: THREE.Vector3 }) => ({ p: s.p.clone().applyMatrix4(M), q: basisQ(s.palm.clone().applyQuaternion(wq), s.fingers.clone().applyQuaternion(wq)) });
    const right = sock(w.grip);
    let left = sock(w.support);
    this.weaponBones[1].position.set(0, 0, 0); this.weaponBones[1].quaternion.identity();
    if (using) {
      // Both hands work at the object in front: low for the uplink, chest high for a wall.
      const low = p.act === 1 || p.act === 2, t = this.time * (low ? 5 : 3.2);
      const base = new THREE.Vector3(0, low ? 0.62 : 1.18, low ? -0.42 : -0.5).add(new THREE.Vector3(0, 0, 0).applyQuaternion(this.wq[B.spine1]));
      const palm = new THREE.Vector3(0, low ? -1 : 0, low ? 0 : -1), fingers = new THREE.Vector3(0, low ? 0 : 1, low ? -1 : 0);
      return [0, 1].map(s => ({ p: base.clone().add(new THREE.Vector3(sgn(s) * 0.12, Math.sin(t + s * 2) * 0.03, Math.cos(t * 0.7 + s) * 0.025)), q: basisQ(palm.clone().add(new THREE.Vector3(-sgn(s) * 0.3, 0, 0)).normalize(), fingers) }));
    }
    if (reloading) left = this.reloadHand(p, left);
    return [left, right];
  }

  /** The support hand's path through the reload beats (`reloads.ts`), carrying the magazine. */
  private reloadHand(p: PoseInput, support: { p: THREE.Vector3; q: THREE.Quaternion }) {
    const w = this.w, M = this.weaponM, wq = new THREE.Quaternion().setFromRotationMatrix(M), t = 1 - p.reload;
    const beats = RELOADS[this.weaponId][p.empty ? 'empty' : 'tactical'];
    const at = (n: string, d: number) => beats.find(b => b.name === n)?.at ?? d;
    const palmMag = basisQ(new THREE.Vector3(0, 1, 0.2).normalize().applyQuaternion(wq), new THREE.Vector3(0.6, 0, -0.8).normalize().applyQuaternion(wq));
    const magGrip = w.mag.clone().add(new THREE.Vector3(-0.01, -0.13, 0)).applyMatrix4(M);
    const pouch = new THREE.Vector3(-0.05, -0.02, -0.21).applyQuaternion(this.wq[B.spine2]).add(this.wp[B.spine2]);
    const pouchQ = basisQ(new THREE.Vector3(0.3, 0, -1).normalize().applyQuaternion(this.wq[B.spine2]), new THREE.Vector3(0, -1, 0).applyQuaternion(this.wq[B.spine2]));
    const handle = w.handle.clone().add(new THREE.Vector3(-0.03, 0.02, 0)).applyMatrix4(M);
    if (this.weaponId === 'shotgun') {
      // Shells from the carrier into the port, one per beat; a pump on the empty reload.
      const shells = beats.filter(b => b.name === 'shell').map(b => b.at), pump = at('pump', -1);
      const port = w.mag.clone().add(new THREE.Vector3(-0.02, -0.03, 0.05)).applyMatrix4(M);
      if (pump > 0 && Math.abs(t - pump) < 0.08) return support;
      let k = 0;
      for (const s of shells) { const d = (t - (s - 0.12)) / 0.15; if (d > 0 && d < 1) k = Math.sin(d * Math.PI); }
      const pp = pouch.clone().lerp(port, k);
      return { p: t < 0.08 || t > 0.9 ? support.p.clone().lerp(pp, ss(t, 0, 0.08) * (1 - ss(t, 0.9, 1))) : pp, q: pouchQ.clone().slerp(palmMag, k) };
    }
    const rel = at('release', 0.12), out = at('out', 0.19), fetch = at('fetch', 0.34), ins = at('in', 0.58), seat = at('seat', 0.66), bolt = at('bolt', -1);
    const keys: [number, THREE.Vector3, THREE.Quaternion, number][] = [
      [0, support.p, support.q, 0],
      [rel, magGrip, palmMag, 0],
      [out, magGrip.clone().add(new THREE.Vector3(0, -0.1, 0.02).applyQuaternion(wq)), palmMag, 1],
      [fetch, pouch, pouchQ, 1],
      [ins, magGrip.clone().add(new THREE.Vector3(0, -0.07, 0).applyQuaternion(wq)), palmMag, 1],
      [seat, magGrip, palmMag, 1],
    ];
    if (bolt > 0) keys.push([bolt - 0.06, handle, basisQ(new THREE.Vector3(-1, -0.2, 0).applyQuaternion(wq), new THREE.Vector3(0, 0, -1).applyQuaternion(wq)), 0], [bolt + 0.04, handle.clone().add(new THREE.Vector3(0, 0, 0.06).applyQuaternion(wq)), basisQ(new THREE.Vector3(-1, -0.2, 0).applyQuaternion(wq), new THREE.Vector3(0, 0, -1).applyQuaternion(wq)), 0]);
    keys.push([Math.min(0.97, (bolt > 0 ? bolt : seat) + 0.16), support.p, support.q, 0]);
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[i + 1], k = ease((t - a[0]) / Math.max(1e-3, b[0] - a[0]));
    const pos = a[1].clone().lerp(b[1], k), q = a[2].clone().slerp(b[2], k);
    // Carry the magazine with the hand between release and seat.
    const held = t > out - 0.03 && t < seat;
    if (held) {
      const inv = M.clone().invert(), local = pos.clone().add(new THREE.Vector3(0.01, 0.13, 0).applyQuaternion(wq)).applyMatrix4(inv);
      this.weaponBones[1].position.copy(local.sub(w.mag));
    } else if (t > rel && t < out) this.weaponBones[1].position.set(0, -0.02 * ss(t, rel, out), 0);
    return { p: pos, q };
  }

  // ---- Death ------------------------------------------------------------------------------------------------------------

  private poseDeath() {
    const keys = DEATHS[this.deathKind], t = Math.min(this.deathT, DEATH_TIME), { lq } = this;
    // Find the segment; segment 0 starts from the captured pose.
    let i = -1; while (i < keys.length - 1 && t > keys[i + 1].t) i++;
    const a = i < 0 ? null : keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
    const t0 = a ? a.t : 0, k = i >= keys.length - 1 ? 1 : falls((t - t0) / Math.max(1e-3, b.t - t0), i);
    const e = new THREE.Euler(), qa = Q(), qb = Q();
    for (let j = 0; j < BONES; j++) {
      if (j === B.pelvis || j === B.root) continue;
      if (a) { const ea = a.bones[j]; qa.setFromEuler(e.set(...(ea ?? [0, 0, 0]))); } else qa.copy(this.deathFrom[j]);
      const eb = b.bones[j]; qb.setFromEuler(e.set(...(eb ?? [0, 0, 0])));
      lq[j].copy(qa).slerp(qb, k);
    }
    const pa = a ? new THREE.Vector3(...a.pelvis) : this.deathPelvis, pb = new THREE.Vector3(...b.pelvis);
    const ra = a ? new THREE.Quaternion().setFromEuler(e.set(...a.prot)) : this.deathPelvisQ, rb = new THREE.Quaternion().setFromEuler(e.set(...b.prot));
    this.pelvisPos.lerpVectors(pa, pb, k);
    lq[B.pelvis].copy(ra).slerp(rb, k);
    this.fk();
    this.helpers();
    // The weapon falls from the hands to the floor beside the body.
    const wt = ss(t, 0.05, 0.7), from = new THREE.Vector3(), fq = Q(), sc = V();
    this.weaponFrom.decompose(from, fq, sc);
    const restP = new THREE.Vector3(0.45, 0.03, -0.25 + this.deathKind * 0.2), restQ = new THREE.Quaternion().setFromEuler(e.set(0, 0.6 + this.deathKind, Math.PI / 2));
    const pos = from.clone().lerp(restP, wt); pos.y = lerp(from.y, restP.y, wt * wt) + Math.sin(wt * Math.PI) * 0.08;
    this.weaponM.compose(pos, fq.clone().slerp(restQ, ss(t, 0.05, 0.55)), new THREE.Vector3(1, 1, 1));
  }

  /** Writes the pose to the bones and the weapon. */
  private write() {
    const { bones, lq } = this;
    for (let i = 0; i < BONES; i++) bones[i].quaternion.copy(lq[i]);
    bones[B.pelvis].position.copy(this.pelvisPos);
    this.weaponM.decompose(this.weapon.position, this.weapon.quaternion, this.weapon.scale);
  }

  diag(): Diag { return this.diagOut; }
  /** Gait phase in cycles (two steps per cycle). */
  get gaitPhase() { return this.phase; }
}

/** Death timing: the first segment snaps (the hit), falls accelerate into the ground, the last settles. */
function falls(t: number, seg: number) {
  t = clamp(t, 0, 1);
  if (seg < 0) return 1 - (1 - t) * (1 - t);
  if (seg === 1) return t * t;
  return ease(t);
}
void Z;
