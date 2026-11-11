/** Weapons in fighters' hands. The weapons session will export `worldWeapon(id)` (a low-detail world model with grip and
 * support sockets); until it does, these stand-ins have the same sockets: a rifle-class receiver with handguard,
 * magazine, stock and optic, sized per weapon class. Weapon space: bore along -Z, up +Y, origin at the firing-hand
 * grip; the magazine is bone 1 so a reload can carry it in the support hand. One draw call. */
import * as THREE from 'three';
import { Builder, SURF, surf } from '../hero/geom';
import { placeHand } from '../hero/rig';
import * as hero from '../hero/index';
import type { WeaponId } from '../../config';

export interface HandSocket { p: THREE.Vector3; palm: THREE.Vector3; fingers: THREE.Vector3 }
export interface WorldWeapon {
  geo: THREE.BufferGeometry; triangles: number;
  grip: HandSocket; support: HandSocket;
  /** Butt of the stock (rests in the shoulder), muzzle, magazine seat, charging handle. */
  butt: THREE.Vector3; muzzle: THREE.Vector3; mag: THREE.Vector3; handle: THREE.Vector3;
  /** Height of the sight line above the bore at the grip. */
  sight: number;
  pistol: boolean;
  /** Bones the geometry is skinned to (bone 1 is the magazine). */
  bones: number;
}

interface Dims { len: number; barrel: number; stock: number; mag: [number, number, number]; magTilt: number; optic: 0 | 1 | 2; tube?: boolean; guard: number }
const DIMS: Record<WeaponId, Dims> = {
  ar: { len: 0.42, barrel: 0.3, stock: 0.26, mag: [0.026, 0.17, 0.065], magTilt: 0.22, optic: 1, guard: 0.3 },
  carbine: { len: 0.4, barrel: 0.22, stock: 0.24, mag: [0.026, 0.16, 0.062], magTilt: 0.2, optic: 1, guard: 0.24 },
  smg: { len: 0.32, barrel: 0.12, stock: 0.2, mag: [0.024, 0.17, 0.034], magTilt: 0.04, optic: 1, guard: 0.15 },
  shotgun: { len: 0.4, barrel: 0.4, stock: 0.32, mag: [0, 0, 0], magTilt: 0, optic: 0, tube: true, guard: 0.2 },
  dmr: { len: 0.46, barrel: 0.4, stock: 0.28, mag: [0.028, 0.12, 0.072], magTilt: 0.1, optic: 2, guard: 0.32 },
  pistol: { len: 0.18, barrel: 0, stock: 0, mag: [0.024, 0.11, 0.032], magTilt: -0.3, optic: 0, guard: 0 },
};

const cache = new Map<string, WorldWeapon>();
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function standInWeapon(id: WeaponId, lod = 0): WorldWeapon {
  const key = `${id}:${lod}`, hit = cache.get(key);
  if (hit) return hit;
  const d = DIMS[id], b = new Builder(lod), metal = surf(SURF.anod, {}), poly = surf(SURF.poly, {}), steel = surf(SURF.park, {});
  const pistol = id === 'pistol';
  // Grip at the origin; receiver above and ahead of it.
  const ry = pistol ? 0.06 : 0.055, rz0 = pistol ? 0.04 : 0.07, rz1 = rz0 - d.len;
  b.bone = 0;
  if (pistol) {
    b.box([0.028, 0.03, 0.19], [0, ry, -0.055], steel, 0.003);
    b.box([0.026, 0.1, 0.04], [0, 0.0, 0.0], poly, 0.006, [-0.25, 0, 0]);
    b.box([0.024, 0.018, 0.06], [0, ry - 0.025, -0.07], poly, 0.004);
  } else {
    b.box([0.034, 0.05, d.len], [0, ry, (rz0 + rz1) / 2], metal, 0.004);
    b.box([0.03, 0.1, 0.035], [0, 0.0, 0.0], poly, 0.006, [-0.32, 0, 0]);
    // Handguard and barrel.
    if (d.guard) b.box([0.042, 0.046, d.guard], [0, ry - 0.002, rz1 + 0.05 - d.guard / 2], d.tube ? surf(SURF.wood, { color: 0x3a2a1c }) : metal, 0.006);
    if (d.barrel) b.cyl(0.009, d.barrel, 'z', [0, ry + 0.004, rz1 - d.barrel / 2 + 0.05], steel, 8);
    if (d.tube) b.cyl(0.011, d.barrel * 0.85, 'z', [0, ry - 0.022, rz1 - d.barrel * 0.4 + 0.04], steel, 8);
    b.cyl(0.013, 0.04, 'z', [0, ry + 0.004, rz1 - d.barrel + 0.03], steel, 8);
    // Stock and buffer tube.
    if (d.stock) {
      b.cyl(0.014, d.stock * 0.8, 'z', [0, ry + 0.004, rz0 + d.stock * 0.4], metal, 8);
      b.box([0.034, 0.1, 0.06], [0, ry - 0.025, rz0 + d.stock - 0.03], poly, 0.008);
    }
    // Rail and optic.
    b.box([0.022, 0.008, d.len * 0.8], [0, ry + 0.029, (rz0 + rz1) / 2], metal, 0.001);
    if (d.optic === 1) { b.box([0.036, 0.04, 0.07], [0, ry + 0.06, rz0 - d.len * 0.45], metal, 0.006); b.box([0.03, 0.03, 0.004], [0, ry + 0.064, rz0 - d.len * 0.45 - 0.036], surf(SURF.lens, {}), 0.001); }
    if (d.optic === 2) b.cyl(0.02, 0.26, 'z', [0, ry + 0.065, rz0 - d.len * 0.45], metal, 10);
  }
  // Magazine (bone 1).
  b.bone = 1;
  const magAt = pistol ? V(0, -0.01, 0.0) : V(0, ry - 0.03, rz0 - d.len * 0.62);
  if (d.mag[1]) { const g = b.box([d.mag[0], d.mag[1], d.mag[2]], [0, -d.mag[1] / 2, 0], poly, 0.003); g.rotateX(d.magTilt); g.translate(magAt.x, magAt.y, magAt.z); }
  const geo = b.build({ ao: false });
  const guardZ = { ar: -0.23, carbine: -0.22, smg: -0.17, shotgun: -0.28, dmr: -0.25, pistol: 0 }[id];
  const out: WorldWeapon = {
    geo, triangles: geo.index!.count / 3, pistol,
    // Right hand: palm on the grip's right side, fingers wrapping forward round it.
    grip: { p: V(0.018, -0.005, 0.0), palm: V(-1, 0, 0), fingers: V(0, 0.32, -0.95).normalize() },
    // Left hand under the handguard, palm up and in, fingers forward and across (pistol: wrapped round the right).
    support: pistol ? { p: V(-0.02, -0.02, 0.005), palm: V(0.8, 0.3, -0.2).normalize(), fingers: V(0.3, 0.2, -0.93).normalize() } : { p: V(-0.008, ry - 0.045, guardZ), palm: V(0.35, 1, 0).normalize(), fingers: V(0.55, 0.15, -0.8).normalize() },
    butt: pistol ? V(0, 0, 0.1) : V(0, ry - 0.01, rz0 + d.stock), muzzle: V(0, ry + 0.004, pistol ? -0.15 : rz1 - d.barrel + 0.01),
    mag: magAt, handle: pistol ? V(0, ry, 0.02) : V(0, ry + 0.02, rz0 - 0.02), sight: pistol ? 0.08 : d.optic ? 0.115 : 0.07, bones: 2,
  };
  cache.set(key, out);
  return out;
}

const real = new Map<string, WorldWeapon>();
/** The weapons session's world model (`worldWeapon`, low detail with the first-person sockets) adapted to the
 * fighter's sockets; the stand-in if that export is missing. Level 1 near, 2 far. */
export function weaponFor(id: WeaponId, lod: 1 | 2 = 1): WorldWeapon {
  const ww = (hero as { worldWeapon?: typeof hero.worldWeapon }).worldWeapon;
  if (!ww) return standInWeapon(id, lod);
  const key = `${id}:${lod}`, hit = real.get(key);
  if (hit) return hit;
  const w = ww(id, lod), S = w.sockets;
  const hand = (pl: typeof w.hold.right, side: 1 | -1): HandSocket => {
    const p = new THREE.Vector3(), q = new THREE.Quaternion();
    placeHand(pl, side, p, q);
    return { p, palm: new THREE.Vector3(0, -1, 0).applyQuaternion(q), fingers: new THREE.Vector3(0, 0, -1).applyQuaternion(q) };
  };
  w.geometry.computeBoundingBox();
  const bb = w.geometry.boundingBox!, pistol = id === 'pistol';
  const out: WorldWeapon = {
    geo: w.geometry, triangles: w.triangles, pistol,
    grip: hand(w.hold.right, 1), support: hand(w.hold.left, -1),
    // The butt plate is the rearmost point, at about grip height below the sight line.
    butt: pistol ? V(0, S.grip.p[1], 0.1) : V(0, Math.max(bb.min.y * 0.4, -0.06), bb.max.z),
    muzzle: V(...S.muzzle), mag: V(...S.mag), handle: V(...S.handle),
    // Weapon space has the sight line through the origin.
    sight: 0, bones: 9,
  };
  real.set(key, out);
  return out;
}
