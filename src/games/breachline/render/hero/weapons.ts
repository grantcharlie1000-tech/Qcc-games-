/** The six weapons, authored as real parts. Each is one geometry with rigid bones for its moving parts, so a weapon is
 * one draw call (plus a transparent lens where it has glass). Coordinates: metres, the sight line runs along -Z through
 * the origin, +Y up, +X to the shooter's right; the origin is at the rear of the receiver. Designs are Breachline's
 * own; proportions follow published dimensions of real service weapons. */
import * as THREE from 'three';
import type { WeaponId } from '../../config';
import { Builder, SURF, fillet, rect, surf, type Surface } from './geom';

/** Bone slots shared by every weapon. */
export const WB = { root: 0, mag: 1, bolt: 2, trigger: 3, handle: 4, aux: 5, case0: 6 } as const;
/** Ejected casings: three bones in the weapon mesh (no extra draw call), hidden by scaling to zero. */
export const CASES = 3;
export const WEAPON_BONES = 6 + CASES;

/** A spent case at a bone's origin, mouth forward. Shotgun hulls are wider and red. */
function casings(b: Builder, kind: 'rifle' | 'pistol' | 'shell', at: V3) {
  for (let i = 0; i < CASES; i++) {
    b.bone = WB.case0 + i;
    const m0 = b.mark;
    if (kind === 'shell') { b.cyl(0.0105, 0.05, 'z', [0, 0, 0.004], surf(SURF.poly, { color: 0x7a1c16, rough: 0.5 }), 10); b.cyl(0.0108, 0.012, 'z', [0, 0, 0.024], SURF.brass, 10); }
    else b.lathe(kind === 'rifle' ? [[0, -0.022], [0.0048, -0.022], [0.0048, 0.01], [0.0032, 0.016], [0.003, 0.022], [0, 0.022]] : [[0, -0.01], [0.0049, -0.01], [0.0049, 0.009], [0, 0.009]], SURF.brass, [0, 0, 0], 8);
    // Bound at the ejection port: the bone's offset from there is where the case flies.
    b.transformSince(m0, new THREE.Matrix4().makeTranslation(...at));
  }
  b.bone = WB.root;
}

export interface Socket { p: [number, number, number]; r: [number, number, number] }
export interface WeaponSockets {
  /** Firing-hand grip frame: palm centre on the grip, rotation of the grip axis (Euler XYZ). */
  grip: Socket;
  /** Support-hand frame on the handguard, pump, or (pistol) wrapped round the firing hand. */
  support: Socket;
  /** Where the magazine sits (its bone origin is this point when seated) and where the hand takes it. */
  mag: [number, number, number];
  muzzle: [number, number, number];
  eject: [number, number, number];
  /** Charging handle, bolt handle or slide serrations: where the support hand grabs to cycle. */
  handle: [number, number, number];
  /** How far the bolt/slide and handle travel. */
  boltTravel: number; handleTravel: number;
  /** Trigger finger contact point. */
  trigger: [number, number, number];
  /** Distance from the sight line to the bore. */
  bore: number;
  /** Shotgun: where shells go in (loading port) and where they are taken from (side saddle). */
  port?: [number, number, number];
}
export interface WeaponModel { id: WeaponId; geo: THREE.BufferGeometry; lens: THREE.BufferGeometry | null; sockets: WeaponSockets; triangles: number }

type V3 = [number, number, number];

// ---- Shared parts ---------------------------------------------------------------------------------------------

/** A picatinny-style rail: a base strip and cross-slotted teeth, from z0 to z1 (forward), top at y. */
function rail(b: Builder, z0: number, z1: number, y: number, s: Surface, x = 0, rot = 0) {
  const mark = b.mark, w = 0.0212, pitch = 0.01;
  b.extrudeZ([[-w / 2 + 0.002, y - 0.006], [w / 2 - 0.002, y - 0.006], [w / 2 - 0.002, y - 0.0035], [-w / 2 + 0.002, y - 0.0035]], z0, z1, s, 0.0005);
  const tooth: [number, number][] = [[-w / 2 + 0.0025, y - 0.0036], [w / 2 - 0.0025, y - 0.0036], [w / 2, y - 0.0022], [w / 2 - 0.0012, y], [-w / 2 + 0.0012, y], [-w / 2, y - 0.0022]];
  for (let z = z0 - 0.002; z - 0.0052 >= z1; z -= pitch) b.extrudeZ(tooth, z, z - 0.0052, s, 0.0004, undefined, 1);
  if (rot || x) b.transformSince(mark, new THREE.Matrix4().makeTranslation(x, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(rot)));
}

/** A tube red-dot sight centred on the sight line, with its mount on a rail whose top is at railY. */
function tubeDot(b: Builder, z: number, railY: number, body: Surface): void {
  const R = 0.0155, L = 0.072;
  // Tube: open at both ends so the shooter can see through; flare at the objective, rubbered eyepiece ring.
  b.lathe([[R - 0.0012, z + L / 2 - 0.004], [R, z + L / 2], [R + 0.0012, z + L / 2 - 0.001], [R + 0.0012, z + L / 2 - 0.012], [R, z + L / 2 - 0.014], [R, z - L / 2 + 0.016], [R + 0.0028, z - L / 2 + 0.006], [R + 0.0028, z - L / 2], [R + 0.0012, z - L / 2 - 0.001], [R + 0.0005, z - L / 2]].map(([r, zz]) => [r, -zz] as const), body, [0, 0, 0], 28);
  // Inner wall so the tube reads as a tube from behind.
  b.lathe([[R - 0.0012, -(z + L / 2 - 0.004)], [R - 0.0012, -(z - L / 2)]].map(([r, d]) => [r, d] as const).reverse(), surf(body, { color: 0x111213 }), [0, 0, 0], 22);
  // Turrets: elevation on top, windage on the right, battery cap on the left.
  b.cyl(0.0085, 0.012, 'y', [0, R + 0.005, z + 0.002], body, 16);
  b.cyl(0.0078, 0.003, 'y', [0, R + 0.0115, z + 0.002], surf(body, { color: 0x1b1c1d }), 16);
  b.cyl(0.0085, 0.012, 'x', [R + 0.005, 0, z + 0.002], body, 16);
  b.cyl(0.0095, 0.008, 'x', [-R - 0.003, 0, z + 0.002], body, 16);
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; b.box([0.0016, 0.012, 0.0016], [Math.cos(a) * 0.0088, R + 0.005, z + 0.002 + Math.sin(a) * 0.0088], body, 0); }
  // Mount: a riser with a cross-bolt clamp down to the rail.
  const top = -R + 0.002, h = top - railY;
  b.prism(fillet([[z + 0.024, railY], [z + 0.024, top], [z - 0.024, top], [z - 0.024, railY]], [0, 0.004, 0.004, 0]), 0.018, body, { bevel: 0.0012 });
  b.box([0.026, 0.006, 0.03], [0, railY + 0.002, z], body, 0.001);
  b.cyl(0.004, 0.006, 'x', [0.015, railY + 0.002, z], SURF.bright, 6);
  b.box([0.003, 0.009, 0.008], [0.019, railY + 0.002, z], body, 0.001);
  void h;
  // The dot itself, on the front lens plane, on the sight line.
  b.sphere(0.0006, [0, 0, z - L / 2 + 0.004], SURF.red, 6);
}

// ---- Marrow AR-5: 5.56 mm assault rifle --------------------------------------------------------------------

function marrowAR5(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.072; // bore height below the sight line
  const up = SURF.anodGrey, low = SURF.anod, hg = SURF.anodGrey, poly = SURF.poly;
  // Upper receiver: a flat-sided forging with a raised rail deck, ejection port and forward assist.
  b.tag = 'Upper receiver';
  b.prism(fillet([[0.004, B - 0.013], [0.004, B + 0.016], [-0.006, B + 0.02], [-0.238, B + 0.02], [-0.238, B - 0.013], [-0.2, B - 0.016], [-0.02, B - 0.016]], [0, 0.003, 0.003, 0.002, 0.002, 0.004, 0.004]), 0.031, up, { bevel: 0.0016 });
  // Ejection port recess with the bolt carrier visible inside it (bolt bone).
  b.tag = 'Ejection port recess wit';
  b.box([0.0012, 0.015, 0.058], [0.0159, B + 0.002, -0.095], surf(up, { color: 0x0c0c0d }), 0);
  b.box([0.0022, 0.0022, 0.062], [0.0164, B + 0.0104, -0.095], up, 0.0008);
  b.cyl(0.0014, 0.064, 'z', [0.0168, B - 0.0068, -0.095], SURF.steel, 8);
  b.bone = WB.bolt;
  b.box([0.0012, 0.0095, 0.05], [0.0163, B + 0.002, -0.093], SURF.steel, 0.0004);
  b.cyl(0.0022, 0.004, 'x', [0.0171, B + 0.002, -0.108], SURF.bright, 8);
  b.bone = WB.root;
  // Brass deflector and forward assist.
  b.tag = 'Brass deflector and forw';
  b.prism(fillet([[-0.03, B - 0.004], [-0.03, B + 0.012], [-0.052, B + 0.012], [-0.06, B - 0.004]], 0.003), 0.012, up, { x: 0.019, bevel: 0.0015 });
  b.lathe([[0, 0], [0.0068, 0], [0.0068, 0.012], [0.0055, 0.018], [0.0068, 0.02], [0.0068, 0.028], [0, 0.028]], up, [0, 0, 0], 12);
  b.transformSince(b.mark - 1, new THREE.Matrix4().makeTranslation(0.016, B + 0.008, -0.03).multiply(new THREE.Matrix4().makeRotationY(-0.55)));
  // Full-length top rail, receiver and handguard as one deck.
  b.tag = 'Full-length top rail';
  rail(b, 0.004, -0.555, B + 0.033, up);
  b.box([0.022, 0.008, 0.56], [0, B + 0.024, -0.275], up, 0.0012);
  // Charging handle (handle bone): a T at the rear of the upper with an ambidextrous latch.
  b.tag = 'Charging handle (handle ';
  b.bone = WB.handle;
  b.prism([[0.006, B + 0.02], [0.006, B + 0.027], [-0.012, B + 0.027], [-0.012, B + 0.02]], 0.014, low, { bevel: 0.001 });
  b.prism(fillet([[0.014, B + 0.017], [0.014, B + 0.027], [0.004, B + 0.027], [0.004, B + 0.017]], 0.002), 0.05, low, { bevel: 0.0015 });
  b.bone = WB.root;
  // Barrel nut shroud and the barrel inside the handguard, then a three-prong flash hider.
  b.tag = 'Barrel nut shroud and th';
  b.lathe([[0.0098, 0.235], [0.0098, 0.6], [0.0108, 0.6], [0.0108, 0.605]], SURF.park, [0, B, 0], 16);
  b.lathe([[0.0128, 0.6], [0.0128, 0.61], [0.0135, 0.612], [0.0135, 0.625], [0.0122, 0.628]], SURF.park, [0, B, 0], 18);
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + i * (Math.PI * 2 / 3), m0 = b.mark;
    b.prism(fillet([[-0.624, -0.003], [-0.624, 0.003], [-0.664, 0.0028], [-0.666, 0], [-0.664, -0.0028]], 0.0008), 0.0042, SURF.park, { bevel: 0.0007 });
    b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, B, 0).multiply(new THREE.Matrix4().makeRotationZ(a)).multiply(new THREE.Matrix4().makeTranslation(0.0098, 0, 0)).multiply(new THREE.Matrix4().makeRotationZ(-Math.PI / 2)));
  }
  b.lathe([[0.004, 0.62], [0.004, 0.664]], surf(SURF.park, { color: 0x0b0b0b }), [0, B, 0], 10);
  // Free-float handguard: slotted side walls, bevelled corners, a slotted belly, an end cap.
  b.tag = 'Free-float handguard';
  const hz0 = -0.238, hz1 = -0.553, top = B + 0.021, bot = B - 0.027, hw = 0.0255;
  const slots: [number, number][][] = [];
  for (let z = hz0 - 0.03; z - 0.04 > hz1 + 0.012; z -= 0.052) slots.push(fillet(rect(z, B - 0.012, z - 0.038, B + 0.006).map(([a, c]) => [a, c] as [number, number]), 0.0038, 2));
  for (const side of [-1, 1]) b.prism([[hz0, bot + 0.008], [hz0, top - 0.006], [hz1, top - 0.006], [hz1, bot + 0.008]], 0.0035, hg, { x: side * (hw - 0.0018), bevel: 0.0008, holes: slots });
  const chamfer = (x: number, y: number, rz: number) => { const m0 = b.mark; b.box([0.004, 0.0115, -hz1 + hz0], [0, 0, (hz0 + hz1) / 2], hg, 0.0008); b.transformSince(m0, new THREE.Matrix4().makeTranslation(x, y, 0).multiply(new THREE.Matrix4().makeRotationZ(rz))); };
  chamfer(-hw + 0.0033, top - 0.0035, Math.PI / 4); chamfer(hw - 0.0033, top - 0.0035, -Math.PI / 4);
  chamfer(-hw + 0.0033, bot + 0.0045, -Math.PI / 4); chamfer(hw - 0.0033, bot + 0.0045, Math.PI / 4);
  const belly: [number, number][][] = [];
  for (let z = hz0 - 0.03; z - 0.04 > hz1 + 0.012; z -= 0.052) belly.push(fillet(rect(-0.006, z, 0.006, z - 0.038), 0.004, 2));
  b.slab([[-hw + 0.006, hz0], [hw - 0.006, hz0], [hw - 0.006, hz1], [-hw + 0.006, hz1]], bot, bot + 0.0035, hg, 0.0008);
  void belly;
  b.box([0.04, 0.0035, -hz1 + hz0 - 0.006], [0, top - 0.002, (hz0 + hz1) / 2], hg, 0.001);
  // Front sling point and a hand stop on the belly.
  b.tag = 'Front sling point and a ';
  b.box([0.008, 0.012, 0.022], [0, bot - 0.005, -0.33], poly, 0.003);
  b.cyl(0.006, 0.01, 'x', [-hw - 0.002, B - 0.004, -0.53], SURF.steel, 12);
  // Lower receiver: magazine well, trigger guard, takedown pins, bolt catch.
  b.tag = 'Lower receiver';
  b.prism(fillet([[0.006, B - 0.013], [0.006, B - 0.034], [-0.03, B - 0.04], [-0.07, B - 0.04], [-0.084, B - 0.064], [-0.15, B - 0.064], [-0.158, B - 0.05], [-0.172, B - 0.042], [-0.2, B - 0.03], [-0.2, B - 0.013]], [0, 0.006, 0.004, 0.002, 0.004, 0.004, 0.006, 0.006, 0.004, 0]), 0.03, low, { bevel: 0.0016 });
  // Magazine well flare.
  b.tag = 'Magazine well flare.';
  b.prism(fillet([[-0.082, B - 0.054], [-0.08, B - 0.068], [-0.152, B - 0.068], [-0.154, B - 0.054]], 0.003), 0.034, low, { bevel: 0.0018 });
  // Trigger guard: an integral loop.
  b.tag = 'Trigger guard';
  b.prism(fillet([[-0.004, B - 0.034], [-0.004, B - 0.07], [-0.07, B - 0.072], [-0.078, B - 0.064], [-0.078, B - 0.04]], [0, 0.012, 0.008, 0.004, 0]), 0.012, low, { bevel: 0.0014, holes: [fillet([[-0.01, B - 0.039], [-0.01, B - 0.064], [-0.064, B - 0.065], [-0.07, B - 0.058], [-0.07, B - 0.042]], [0, 0.009, 0.005, 0.003, 0])] });
  // Takedown and pivot pins, both sides.
  b.tag = 'Takedown and pivot pins';
  b.mirrorX(() => {
    b.cyl(0.0032, 0.004, 'x', [0.0165, B - 0.02, -0.004], SURF.steel, 10);
    b.cyl(0.0032, 0.004, 'x', [0.0165, B - 0.02, -0.19], SURF.steel, 10);
    b.cyl(0.0022, 0.003, 'x', [0.016, B - 0.03, -0.045], SURF.steel, 8);
    b.cyl(0.0022, 0.003, 'x', [0.016, B - 0.03, -0.06], SURF.steel, 8);
  });
  // Selector (left side, a lever), magazine release (right), bolt catch (left).
  b.tag = 'Selector (left side';
  b.prism(fillet([[-0.004, -0.0025], [-0.004, 0.0025], [-0.022, 0.003], [-0.024, 0], [-0.022, -0.003]], 0.001), 0.003, SURF.park, { x: -0.0175, bevel: 0.0006 });
  b.transformSince(b.mark - 1, new THREE.Matrix4().makeTranslation(0, B - 0.025, -0.012));
  b.cyl(0.0045, 0.004, 'x', [-0.0168, B - 0.025, -0.016], SURF.steel, 10);
  b.cyl(0.0042, 0.004, 'x', [0.0168, B - 0.035, -0.078], SURF.steel, 12);
  b.prism(fillet([[-0.086, B - 0.02], [-0.086, B - 0.034], [-0.1, B - 0.04], [-0.104, B - 0.026]], 0.002), 0.004, SURF.steel, { x: -0.017, bevel: 0.0007 });
  // Trigger (trigger bone).
  b.tag = 'Trigger (trigger bone).';
  b.bone = WB.trigger;
  b.prism(fillet([[-0.034, B - 0.036], [-0.036, B - 0.046], [-0.039, B - 0.058], [-0.043, B - 0.064], [-0.046, B - 0.062], [-0.043, B - 0.052], [-0.041, B - 0.036]], 0.0012), 0.006, SURF.steel, { bevel: 0.0008 });
  b.bone = WB.root;
  // Pistol grip: raked about 20 degrees, finger groove, polymer with a stippled panel.
  b.tag = 'Pistol grip';
  {
    const m0 = b.mark, gz = 0.012, gy = B - 0.035;
    b.prism(fillet([[0.012, 0.002], [0.016, -0.03], [0.02, -0.078], [0.016, -0.1], [0.008, -0.108], [-0.026, -0.108], [-0.03, -0.1], [-0.026, -0.07], [-0.03, -0.05], [-0.024, -0.03], [-0.024, 0.002]], [0, 0.006, 0.012, 0.008, 0.006, 0.006, 0.006, 0.01, 0.008, 0.004, 0]), 0.03, poly, { bevel: 0.004, seg: 3 });
    b.prism(fillet([[0.016, -0.104], [0.016, -0.112], [-0.03, -0.112], [-0.03, -0.104]], 0.002), 0.032, poly, { bevel: 0.002 });
    b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, gy, gz - 0.02).multiply(new THREE.Matrix4().makeRotationX(-0.33)));
  }
  // Buffer tube, castle nut, receiver end plate.
  b.tag = 'Buffer tube';
  b.lathe([[0.0145, -0.004], [0.0158, 0], [0.0158, -0.2], [0.0145, -0.206], [0, -0.206]], SURF.anod, [0, B + 0.004, 0], 18);
  b.lathe([[0.0178, -0.004], [0.0178, -0.016]], SURF.park, [0, B + 0.004, 0], 10);
  b.box([0.03, 0.026, 0.004], [0, B - 0.002, 0.008], SURF.steel, 0.001);
  // Stock: a slim collapsible polymer body riding on the buffer tube, with a cheek weld, release latch and butt pad.
  b.tag = 'Stock';
  {
    const SY = B + 0.004; // buffer tube axis
    b.prism(fillet([[0.105, SY + 0.02], [0.105, SY - 0.02], [0.13, SY - 0.034], [0.2, SY - 0.07], [0.235, SY - 0.082], [0.242, SY - 0.082], [0.242, SY + 0.028], [0.17, SY + 0.03]], [0, 0.008, 0.01, 0.014, 0.004, 0, 0, 0.012]), 0.036, poly, { bevel: 0.004, seg: 3, holes: [fillet([[0.15, SY - 0.03], [0.205, SY - 0.058], [0.226, SY - 0.064], [0.226, SY - 0.03]], 0.008, 2)] });
    b.prism(fillet([[0.12, SY + 0.016], [0.12, SY + 0.03], [0.15, SY + 0.036], [0.232, SY + 0.036], [0.24, SY + 0.03], [0.24, SY + 0.016]], 0.005), 0.03, poly, { bevel: 0.003 });
    b.prism(fillet([[0.242, SY + 0.034], [0.242, SY - 0.085], [0.256, SY - 0.085], [0.256, SY + 0.036]], 0.004), 0.04, SURF.rubber, { bevel: 0.003 });
    for (let i = 0; i < 6; i++) b.box([0.041, 0.0035, 0.004], [0, SY + 0.02 - i * 0.019, 0.258], SURF.rubber, 0.0012);
    b.prism(fillet([[0.11, SY - 0.02], [0.11, SY - 0.028], [0.148, SY - 0.036], [0.148, SY - 0.026]], 0.002), 0.008, SURF.poly, { bevel: 0.001 });
    b.cyl(0.0062, 0.04, 'x', [0, SY - 0.055, 0.215], SURF.steel, 10);
  }
  // Magazine (mag bone): curved polymer 30-rounder with ribs and a wide floorplate; its origin is the seat point.
  b.tag = 'Magazine (mag bone)';
  b.bone = WB.mag;
  const MZ = -0.118, MY = B - 0.03;
  {
    const m0 = b.mark, D = 0.19, n = 10, curve = (t: number) => 0.055 * t * t; // forward sweep (m) at depth fraction t
    const tilt = (t: number) => Math.atan(2 * 0.055 * t / D);
    const prof: [number, number][] = [];
    for (let i = 0; i <= n; i++) { const t = i / n; prof.push([-0.032 - curve(t), -D * t]); }
    for (let i = n; i >= 0; i--) { const t = i / n; prof.push([0.032 - curve(t) - 0.004 * t, -D * t]); }
    b.prism(prof, 0.022, SURF.poly, { bevel: 0.0022 });
    for (let i = 0; i < 5; i++) { const t = 0.22 + i * 0.13; b.box([0.0245, 0.003, 0.056], [0, -D * t, -curve(t) - 0.002 * t], SURF.poly, 0.0012, [-tilt(t), 0, 0]); }
    b.box([0.03, 0.012, 0.074], [0, -D - 0.003, -curve(1) - 0.002], SURF.poly, 0.004, [-tilt(1), 0, 0]);
    // Top of the follower and cartridge visible at the lips.
    b.lathe([[0, 0], [0.0047, 0.004], [0.0047, 0.044], [0.0028, 0.056], [0, 0.058]].map(([r, d]) => [r, d] as const), SURF.brass, [0, 0.004, 0.022], 10);
    b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, MY, MZ));
  }
  b.bone = WB.root;
  casings(b, 'rifle', [0.018, B + 0.002, -0.095]);
  // Optic.
  b.tag = 'Optic.';
  tubeDot(b, -0.1, B + 0.033, SURF.anod);
  // Rear flip sight (folded) at the rear of the rail.
  b.tag = 'Rear flip sight (folded)';
  b.prism(fillet([[-0.004, B + 0.033], [-0.004, B + 0.042], [-0.03, B + 0.04], [-0.034, B + 0.033]], 0.002), 0.02, SURF.anod, { bevel: 0.0012 });
  census = b.census();
  const geo = b.build({ aoRange: 0.03, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2] });
  const lens = new THREE.CylinderGeometry(0.0143, 0.0143, 0.002, 24).rotateX(Math.PI / 2).translate(0, 0, -0.1 + 0.03);
  return {
    geo, lens, triangles: geo.index!.count / 3,
    sockets: {
      grip: { p: [0, B - 0.075, 0.012], r: [-0.33, 0, 0] },
      support: { p: [-0.004, B - 0.034, -0.40], r: [0, 0, 0] },
      mag: [0, MY, MZ], muzzle: [0, B, -0.668], eject: [0.018, B + 0.002, -0.095], handle: [-0.018, B - 0.03, -0.095],
      boltTravel: 0.06, handleTravel: 0, trigger: [0, B - 0.05, -0.04], bore: -B,
    },
  };
}

const BUILDERS: Partial<Record<WeaponId, (lod: number) => Omit<WeaponModel, 'id'>>> = { ar: marrowAR5 };
const cache = new Map<string, WeaponModel>();
/** Triangles per part of the last weapon built (dev accounting). */
export let census: Record<string, number> = {};

/** Builds (once) and returns a weapon at a level of detail: 0 first person, 1 third person near, 2 far. */
export function weaponModel(id: WeaponId, lod = 0): WeaponModel {
  const k = `${id}${lod}`;
  let m = cache.get(k);
  if (!m) { const f = BUILDERS[id] ?? BUILDERS.ar!; m = { id, ...f(lod) }; cache.set(k, m); }
  return m;
}
export const weaponBuilt = (id: WeaponId) => !!BUILDERS[id];
export type { V3 };
