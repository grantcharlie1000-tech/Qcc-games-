/** The first-person rig: both arms and a weapon as two skinned meshes in camera space (plus a transparent lens on
 * weapons with glass). The weapon is placed by the viewmodel's motion; the hands follow placements on the weapon, the
 * magazine or the handle through two-bone IK, blended by the reload timeline, with a finger pose per hand. Shared by
 * the game's viewmodel and the dev studio so both show exactly the same thing. */
import * as THREE from 'three';
import type { WeaponId } from '../../config';
import { SURF, surf } from './geom';
import { ARM_BONES, POSE, armsGeometry, lerpPose, makeArm, type Arm, type ArmsLook, type HandPose } from './hands';
import { heroMaterial } from './material';
import { idleFrame, type ReloadFrame } from './reload';
import { CASES, WB, WEAPON_BONES, heldWeapon, type WeaponModel } from './weapons';

type V3 = [number, number, number];
/** A hand placement: the point on the palm surface that touches, the direction the palm faces, and the direction the
 * straightened fingers point. */
export interface Place { at: V3; palm: V3; fingers: V3 }
export interface Hold {
  right: Place; left: Place; rightPose: HandPose; leftPose: HandPose;
  /** Support hand on the magazine (magazine space: origin at the seat point, magazine hanging along -Y). */
  magGrip: Place; magPose: HandPose;
  /** Support hand on the charging handle, slide or pump (relative to the handle socket, at rest). */
  handleGrip: Place; handlePose: HandPose;
  /** Shoulders and elbow poles in camera space. */
  shoulderR: V3; shoulderL: V3; poleR: V3; poleL: V3;
  /** Weapon placement in camera space at the hip (position, Euler) and the aimed eye relief (z). */
  hip: { p: V3; r: V3 }; adsZ: number;
}
/** Palm contact point in hand space (palm down, fingers -Z, wrist at the origin). */
const PALM: V3 = [0, -0.019, -0.052];
const _pz = new THREE.Vector3(), _py = new THREE.Vector3(), _px = new THREE.Vector3(), _pm = new THREE.Matrix4();
/** Wrist position and hand rotation for a placement (same space as the placement). */
export function placeHand(pl: Place, side: 1 | -1, outP: THREE.Vector3, outQ: THREE.Quaternion) {
  _py.set(-pl.palm[0], -pl.palm[1], -pl.palm[2]).normalize();
  _pz.set(-pl.fingers[0], -pl.fingers[1], -pl.fingers[2]);
  _pz.addScaledVector(_py, -_pz.dot(_py)).normalize();
  _px.crossVectors(_py, _pz);
  outQ.setFromRotationMatrix(_pm.makeBasis(_px, _py, _pz));
  outP.set(PALM[0] * side, PALM[1], PALM[2]).applyQuaternion(outQ);
  outP.set(pl.at[0] - outP.x, pl.at[1] - outP.y, pl.at[2] - outP.z);
}

/** Trigger hand: index finger along the trigger, three fingers round the grip, thumb over the top. */
const RIFLE_GRIP: HandPose = [[0.35, 0.25, 0.3, 0.6], [0.35, 0.55, 0.35, 0.05], [1.35, 1.35, 0.7, 0], [1.4, 1.35, 0.7, -0.03], [1.4, 1.3, 0.7, -0.08]];
/** Trigger finger straight along the receiver while reloading. */
const OFF_TRIGGER: HandPose = [[0.35, 0.25, 0.3, 0.6], [0.05, 0.1, 0.05, 0.12], [1.35, 1.35, 0.7, 0], [1.4, 1.35, 0.7, -0.03], [1.4, 1.3, 0.7, -0.08]];
/** Support hand under the handguard: fingers wrapped up the far side, thumb along the near side. */
const RIFLE_SUPPORT: HandPose = [[0.2, 0.1, 0.2, 0.3], [0.9, 0.9, 0.5, 0.03], [0.95, 0.95, 0.5, 0], [1.0, 0.95, 0.5, -0.04], [1.05, 0.95, 0.5, -0.1]];
const MAG_GRIP: HandPose = [[0.45, 0.3, 0.3, 0.4], [0.9, 0.9, 0.5, 0], [0.95, 0.95, 0.5, 0], [1.0, 1.0, 0.5, -0.03], [1.05, 1.0, 0.5, -0.08]];
const POSE_SLAP: HandPose = [[0.1, 0.1, 0.1, 0.2], [0.15, 0.2, 0.1, 0.04], [0.15, 0.2, 0.1, 0], [0.15, 0.2, 0.1, -0.04], [0.2, 0.25, 0.15, -0.1]];
const HOOK: HandPose = [[0.3, 0.2, 0.2, 0.1], [1.1, 1.2, 0.7, 0], [1.15, 1.25, 0.7, 0], [1.2, 1.25, 0.7, 0], [1.25, 1.25, 0.7, 0]];
export const POSES = { RIFLE_GRIP, OFF_TRIGGER, RIFLE_SUPPORT, MAG_GRIP, HOOK, POSE_SLAP };

/** A rifle-style hold built from a weapon's sockets: the trigger hand on the grip's palm point with fingers square to
 * the grip's rake, the support hand under the handguard. */
function rifleHold(id: WeaponId, o: Partial<Hold> = {}): Hold {
  const S = heldWeapon(id).sockets, rake = S.grip.r[0];
  const sup = S.support.p;
  return {
    right: { at: S.grip.p, palm: [-1, 0, 0], fingers: [0, Math.sin(rake), -Math.cos(rake)] },
    left: { at: [sup[0] - 0.004, sup[1] - 0.004, sup[2]], palm: [0.15, 1, 0], fingers: [0.7, 0, -0.7] },
    rightPose: RIFLE_GRIP, leftPose: RIFLE_SUPPORT,
    magGrip: { at: [-0.016, -0.075, -0.012], palm: [1, 0, 0], fingers: [0, -0.25, -0.97] }, magPose: MAG_GRIP,
    handleGrip: { at: [-0.012, 0.004, 0.0], palm: [1, 0, 0], fingers: [0, 0.35, -1] }, handlePose: POSE_SLAP,
    shoulderR: [0.17, -0.38, 0.0], shoulderL: [-0.17, -0.34, -0.08], poleR: [0.6, -1, 0.4], poleL: [-1, -0.8, 0],
    hip: { p: [0.12, -0.092, -0.22], r: [0.04, 0.09, -0.26] }, adsZ: -0.1,
    ...o,
  };
}
/** Pistol: thumbs-forward two-hand grip; the support palm over the firing hand's fingers. */
const PISTOL_SUPPORT: HandPose = [[0.1, 0.1, 0.15, 0.2], [0.95, 0.9, 0.5, 0], [1.0, 0.95, 0.5, 0], [1.05, 1.0, 0.5, -0.03], [1.1, 1.0, 0.5, -0.08]];
const PISTOL_GRIP: HandPose = [[0.15, 0.15, 0.2, 0.3], [0.3, 0.5, 0.3, 0.05], [1.4, 1.4, 0.7, 0], [1.45, 1.4, 0.7, -0.03], [1.45, 1.35, 0.7, -0.08]];
const holds = new Map<WeaponId, Hold>();
export function holdFor(id: WeaponId): Hold {
  let h = holds.get(id);
  if (h) return h;
  const S = heldWeapon(id).sockets;
  switch (id) {
    // The Tern C8 shares the AR-5's hold (same family: same grip, handguard section and sockets' layout).
    case 'ar': case 'carbine': case 'smg': case 'dmr': h = rifleHold(id, {
      // Palm cupped up against the underside of the handguard (no gap), fingers running across it and wrapping the far
      // side, thumb straight along the near side. (Fingers pointing forward along the handguard read as a claw.)
      // The wrist rolled 20° so the back of the hand turns toward the player (seen end-on it read as a ball); the
      // fingers still wrap under the handguard and the thumb lies along the near side (gate5-ar5-wrist-roll.jpg).
      left: { at: [-0.008, S.support.p[1] + 0.008, S.support.p[2] - 0.03], palm: rollAbout([0.35, 1, 0], [0.9, 0.1, -0.42], 0.35), fingers: [0.9, 0.1, -0.42] },
      // The left elbow out and down: the forearm enters from the lower left and runs diagonally to the handguard.
      shoulderL: [-0.27, -0.36, -0.04], poleL: [-1, -1, 0.3], adsZ: id === 'carbine' ? -0.1 : id === 'smg' ? -0.12 : id === 'dmr' ? -0.09 : -0.075,
      // Lower right, barrel only slightly in from straight ahead, little cant: the receiver's left side, the magazine
      // well and the grip stay in frame (chosen by eye from the holds in hero/v2/gate5-ar5-holds.jpg).
      // The DMR sits lower so the receiver and handguard, not the scope's eyepiece, lead at the hip.
      hip: { p: [0.12, id === 'dmr' ? -0.125 : -0.1, -0.255], r: [0.015, 0.045, -0.13] },
      leftPose: [[0.15, 0.05, 0.1, 0.15], [1.25, 1.2, 0.65, 0.1], [1.3, 1.2, 0.65, 0.02], [1.35, 1.2, 0.65, -0.07], [1.4, 1.2, 0.65, -0.16]],
    }); break;
    case 'shotgun': h = rifleHold(id, {
      left: { at: [0, S.support.p[1] - 0.008, S.support.p[2]], palm: rollAbout([0.1, 1, 0], [0.75, 0, -0.66], 0.35), fingers: [0.75, 0, -0.66] },
      hip: { p: [0.1, -0.075, -0.25], r: [0.03, 0.02, -0.03] }, adsZ: -0.115,
    }); break;
    case 'pistol': h = rifleHold(id, {
      left: { at: [-0.034, S.grip.p[1] - 0.012, S.grip.p[2] - 0.004], palm: [1, 0, 0], fingers: [0.25, -0.45, -0.86] },
      rightPose: PISTOL_GRIP, leftPose: PISTOL_SUPPORT,
      magGrip: { at: [-0.014, -0.08, 0.02], palm: [1, 0, 0], fingers: [0, -0.4, -0.9] },
      handleGrip: { at: [0, 0.03, 0.0], palm: [0, -1, 0.1], fingers: [1, 0, 0] }, handlePose: HOOK,
      shoulderR: [0.16, -0.32, -0.02], shoulderL: [-0.14, -0.32, -0.04], poleR: [0.5, -1, 0.3], poleL: [-0.6, -1, 0.2],
      hip: { p: [0.08, -0.1, -0.42], r: [0.03, 0.05, -0.02] }, adsZ: -0.42,
    }); break;
    default: h = rifleHold(id);
  }
  holds.set(id, h);
  return h;
}
/** Rotates `v` about the axis `axis` by `a` radians (Rodrigues). */
export function rollAbout(v: V3, axis: V3, a: number): V3 {
  const k = new THREE.Vector3(...axis).normalize(), p = new THREE.Vector3(...v);
  return p.applyAxisAngle(k, a).toArray() as V3;
}
/** Forgets cached holds (after a baked weapon with new sockets is registered). */
export function resetHolds() { holds.clear(); }
/** Kept for the studio and tests: the hold of each weapon. */
export const HOLDS = new Proxy({} as Record<WeaponId, Hold>, { get: (_, k) => holdFor(k as WeaponId) });

export interface FpRig {
  root: THREE.Group;
  gun: THREE.Group;
  weapon: WeaponModel;
  weaponBones: THREE.Bone[];
  arms: [Arm, Arm];
  lens: THREE.Mesh | null;
  material: THREE.MeshStandardMaterial;
  /** Distance (m) between each wrist and its target after the last solve. */
  residual: [number, number];
  setWeapon(id: WeaponId): void;
  /** Gives a weapon its baked texture set; used whenever that weapon is in hand. */
  setTextures(id: WeaponId, material: THREE.Material): void;
  /** Gives both arms the hands' baked set. */
  setArmMaterial(material: THREE.Material): void;
  /** Replaces the arms' geometry (same bones), for asset trials. */
  setArmGeometry(geometry: THREE.BufferGeometry): void;
  /** Poses moving parts and solves both arms for a reload frame (idle when omitted). */
  solve(f?: ReloadFrame): void;
  dispose(): void;
}

const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), gunQ = new THREE.Quaternion(), tmpE = new THREE.Euler();
const pA = new THREE.Vector3(), qA = new THREE.Quaternion(), magM = new THREE.Matrix4(), magQ = new THREE.Quaternion(), magP = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
const sh = new THREE.Vector3(), pole = new THREE.Vector3(), target = new THREE.Vector3(), wq = new THREE.Quaternion();
const IDLE = idleFrame();

export function createFpRig(look: ArmsLook, armGeometry?: THREE.BufferGeometry): FpRig {
  const root = new THREE.Group(), gun = new THREE.Group();
  root.add(gun);
  const material = heroMaterial({ skinned: true });
  // Coated glass: a faint cool tint and a soft reflection, not an amber disc.
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c2, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.3 });
  const arms: [Arm, Arm] = [makeArm(1), makeArm(-1)];
  const armGeo = armGeometry ?? armsGeometry(look);
  const armMesh = new THREE.SkinnedMesh(armGeo, material);
  armMesh.frustumCulled = false;
  root.add(armMesh);
  for (const a of arms) root.add(a.bones[0]);
  root.updateMatrixWorld(true);
  armMesh.bind(new THREE.Skeleton([...arms[0].bones, ...arms[1].bones]), new THREE.Matrix4());
  const weaponBones: THREE.Bone[] = [];
  for (let i = 0; i < WEAPON_BONES; i++) { const b = new THREE.Bone(); weaponBones.push(b); gun.add(b); }
  let weaponMesh: THREE.SkinnedMesh | null = null, lens: THREE.Mesh | null = null;
  const textured = new Map<WeaponId, THREE.Material>();
  const rootInv = new THREE.Matrix4(), rootQInv = new THREE.Quaternion();
  const toRoot = (p: THREE.Vector3, q: THREE.Quaternion) => { p.applyMatrix4(gun.matrixWorld).applyMatrix4(rootInv); q.premultiply(gunQ).premultiply(rootQInv); };
  const rig: FpRig = {
    root, gun, weaponBones, arms, lens: null, material, residual: [0, 0],
    weapon: heldWeapon('ar'),
    setWeapon(id) {
      if (weaponMesh) gun.remove(weaponMesh);
      if (lens) gun.remove(lens);
      rig.weapon = heldWeapon(id);
      weaponMesh = new THREE.SkinnedMesh(rig.weapon.geo, textured.get(id) ?? material);
      weaponMesh.frustumCulled = false;
      gun.add(weaponMesh);
      const p = gun.position.clone(), q = gun.quaternion.clone();
      gun.position.set(0, 0, 0); gun.quaternion.identity();
      for (const b of weaponBones) { b.position.set(0, 0, 0); b.quaternion.identity(); b.scale.set(1, 1, 1); }
      gun.updateMatrixWorld(true);
      weaponMesh.bind(new THREE.Skeleton(weaponBones), new THREE.Matrix4());
      gun.position.copy(p); gun.quaternion.copy(q);
      for (let i = 0; i < CASES; i++) weaponBones[WB.case0 + i].scale.setScalar(0);
      lens = rig.weapon.lens ? new THREE.Mesh(rig.weapon.lens, lensMat) : null;
      if (lens) { lens.renderOrder = 2; gun.add(lens); }
      rig.lens = lens;
    },
    setArmMaterial(m) { (armMesh as THREE.Mesh).material = m; },
    setArmGeometry(g) { armMesh.geometry = g; },
    setTextures(id, m) { textured.set(id, m); if (rig.weapon.id === id && weaponMesh) weaponMesh.material = m; },
    solve(f = IDLE) {
      const hold = holdFor(rig.weapon.id), S = rig.weapon.sockets;
      // Moving parts.
      const mb = weaponBones[WB.mag];
      magQ.setFromEuler(tmpE.set(f.magR[0], f.magR[1], f.magR[2]));
      // The magazine rotates about its seat point.
      magP.set(S.mag[0], S.mag[1], S.mag[2]);
      mb.position.copy(magP).sub(pA.copy(magP).applyQuaternion(magQ)).add(tmpV.set(f.magP[0], f.magP[1], f.magP[2]));
      mb.quaternion.copy(magQ);
      mb.scale.setScalar(f.magOn ? 1 : 0);
      weaponBones[WB.handle].position.z = f.handle * S.handleTravel;
      if (rig.weapon.id === 'shotgun') { const a = weaponBones[WB.aux]; a.position.set(...f.magP); a.scale.setScalar(f.shell ? 1 : 0); }
      weaponBones[WB.bolt].position.z = Math.max(weaponBones[WB.bolt].position.z, f.bolt * S.boltTravel);
      root.updateMatrixWorld(true);
      gun.getWorldQuaternion(gunQ);
      rootInv.copy(root.matrixWorld).invert(); root.getWorldQuaternion(rootQInv).invert();
      // Magazine frame (weapon space): the seat point carried by the magazine bone.
      magM.compose(magP.applyQuaternion(magQ).add(mb.position), magQ, one);
      for (let s = 0; s < 2; s++) {
        let pose: HandPose;
        if (s === 0) {
          placeHand(hold.right, 1, tmpV, tmpQ);
          pose = f.off > 0 ? lerpPose(hold.rightPose, OFF_TRIGGER, f.off) : hold.rightPose;
        } else {
          // Weighted blend of the support placements.
          const w = f.hand, sum = w[0] + w[1] + w[2] + w[3] || 1;
          let acc = 0;
          tmpV.set(0, 0, 0); pose = hold.leftPose;
          const add = (pl: Place, weight: number, m: THREE.Matrix4 | null, hp: HandPose) => {
            if (weight <= 1e-4) return;
            placeHand(pl, -1, pA, qA);
            if (m) { pA.applyMatrix4(m); qA.premultiply(magQ); }
            tmpV.addScaledVector(pA, weight / sum);
            const k = weight / (acc + weight);
            if (acc === 0) { tmpQ.copy(qA); pose = hp; } else { tmpQ.slerp(qA, k); pose = lerpPose(pose, hp, k); }
            acc += weight;
          };
          let L = rig.weapon.id === 'shotgun' ? { ...hold.left, at: [hold.left.at[0], hold.left.at[1], hold.left.at[2] + f.handle * S.handleTravel] as V3 } : hold.left;
          // Dev only: `__heroRoll` rolls the support hand about its finger direction (radians), to try poses by eye.
          const roll = import.meta.env?.DEV ? (globalThis as { __heroRoll?: number }).__heroRoll : undefined;
          if (roll) L = { ...L, palm: rollAbout(L.palm, L.fingers, roll) };
          add(L, w[0], null, hold.leftPose);
          add(hold.magGrip, w[1], magM, hold.magPose);
          const hg = hold.handleGrip;
          add({ ...hg, at: [hg.at[0] + S.handle[0], hg.at[1] + S.handle[1], hg.at[2] + S.handle[2] + f.handle * S.handleTravel] }, w[2], null, hold.handlePose);
        }
        toRoot(tmpV, tmpQ);
        target.copy(tmpV); wq.copy(tmpQ);
        sh.set(...(s === 0 ? hold.shoulderR : hold.shoulderL)); pole.set(...(s === 0 ? hold.poleR : hold.poleL)).add(sh);
        arms[s].solve(sh, target, wq, pole);
        arms[s].pose(pose);
      }
    },
    dispose() { armGeo.dispose(); material.dispose(); lensMat.dispose(); },
  };
  rig.setWeapon('ar');
  return rig;
}

// A lighter coyote glove than the handguard it holds, so the hand separates from the gun; darker palm and knuckle panel.
export const DEFAULT_LOOK = (squad: 0 | 1, band: number): ArmsLook => ({ sleeve: SURF.cloth, glove: surf(SURF.glove, { color: 0x8a806e }), palm: surf(SURF.gloveTan, { color: 0x4d473d }), guard: surf(SURF.knuckle, { color: 0x3b3c39 }), band, squad });
export { POSE, lerpPose, ARM_BONES, WB };
