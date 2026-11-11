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
  for (let z = z0 - 0.002; z - 0.0052 >= z1; z -= pitch) b.extrudeZ(tooth, z, z - 0.0052, s, 0);
  if (rot || x) b.transformSince(mark, new THREE.Matrix4().makeTranslation(x, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(rot)));
}

/** A tube red-dot sight centred on the sight line, with its mount on a rail whose top is at railY. */
function tubeDot(b: Builder, z: number, railY: number, body: Surface): void {
  const R = 0.0155, L = 0.072;
  // Tube: open at both ends so the shooter can see through; flare at the objective, rubbered eyepiece ring.
  b.lathe([[R - 0.0012, z + L / 2 - 0.004], [R, z + L / 2], [R + 0.0012, z + L / 2 - 0.001], [R + 0.0012, z + L / 2 - 0.012], [R, z + L / 2 - 0.014], [R, z - L / 2 + 0.016], [R + 0.0028, z - L / 2 + 0.006], [R + 0.0028, z - L / 2], [R + 0.0012, z - L / 2 - 0.001], [R + 0.0005, z - L / 2]].map(([r, zz]) => [r, -zz] as const), body, [0, 0, 0], 28);
  // Inner wall so the tube reads as a tube from behind.
  b.lathe([[R - 0.0012, -(z + L / 2 - 0.004)], [R - 0.0012, -(z - L / 2)]].map(([r, d]) => [r, d] as const).reverse(), surf(body, { color: 0x111213 }), [0, 0, 0], 16);
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
  for (const side of [-1, 1]) b.prism([[hz0, bot + 0.008], [hz0, top - 0.006], [hz1, top - 0.006], [hz1, bot + 0.008]], 0.0035, hg, { x: side * (hw - 0.0018), bevel: 0.0008, holes: slots, seg: 1 });
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
    b.prism(fillet([[0.105, SY + 0.02], [0.105, SY - 0.02], [0.13, SY - 0.034], [0.2, SY - 0.07], [0.235, SY - 0.082], [0.242, SY - 0.082], [0.242, SY + 0.028], [0.17, SY + 0.03]], [0, 0.008, 0.01, 0.014, 0.004, 0, 0, 0.012]), 0.036, poly, { bevel: 0.004, seg: 2, holes: [fillet([[0.15, SY - 0.03], [0.205, SY - 0.058], [0.226, SY - 0.064], [0.226, SY - 0.03]], 0.008, 2)] });
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


// ---- Shared parts for the other five --------------------------------------------------------------------------

/** A raked pistol grip whose top front is at (gy, gz); `rake` radians back from vertical. Returns the palm contact on its
 * right side, a third of the way down. */
function pistolGrip(b: Builder, gy: number, gz: number, s: Surface, rake = 0.33, len = 0.1, width = 0.03, depth = 0.046): V3 {
  const m0 = b.mark, d = depth;
  b.prism(fillet([[d * 0.26, 0.002], [d * 0.35, -len * 0.3], [d * 0.43, -len * 0.75], [d * 0.35, -len * 0.95], [d * 0.17, -len], [-d * 0.57, -len], [-d * 0.65, -len * 0.93], [-d * 0.57, -len * 0.65], [-d * 0.65, -len * 0.46], [-d * 0.52, -len * 0.28], [-d * 0.52, 0.002]], [0, 0.006, 0.012, 0.008, 0.006, 0.006, 0.006, 0.01, 0.008, 0.004, 0]), width, s, { bevel: 0.004, seg: 3 });
  b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, gy, gz).multiply(new THREE.Matrix4().makeRotationX(-rake)));
  const c = new THREE.Vector3(width / 2 + 0.002, -len * 0.32, -d * 0.12).applyAxisAngle(new THREE.Vector3(1, 0, 0), -rake);
  return [c.x, c.y + gy, c.z + gz];
}

/** A curved trigger blade on the trigger bone, pivoting near (y, z). */
function triggerBlade(b: Builder, y: number, z: number, s: Surface = SURF.steel) {
  b.bone = WB.trigger;
  b.prism(fillet([[z, y], [z - 0.002, y - 0.01], [z - 0.005, y - 0.022], [z - 0.009, y - 0.028], [z - 0.012, y - 0.026], [z - 0.009, y - 0.016], [z - 0.007, y]], 0.0012), 0.006, s, { bevel: 0.0008 });
  b.bone = WB.root;
}

/** An open trigger guard loop from (y0, z0) at the front of the grip forward to z1. */
function guardLoop(b: Builder, y0: number, z0: number, z1: number, s: Surface, depth = 0.034) {
  b.prism(fillet([[z0, y0], [z0, y0 - depth], [z1 + 0.008, y0 - depth - 0.002], [z1, y0 - depth + 0.006], [z1, y0]], [0, 0.012, 0.008, 0.004, 0]), 0.011, s, { bevel: 0.0014, holes: [fillet([[z0 - 0.006, y0 - 0.004], [z0 - 0.006, y0 - depth + 0.005], [z1 + 0.012, y0 - depth + 0.004], [z1 + 0.007, y0 - depth + 0.01], [z1 + 0.007, y0 - 0.004]], [0, 0.009, 0.005, 0.003, 0])] });
}

/** A straight box magazine on the mag bone, hanging from its seat point (0, 0, 0) with a forward rake. */
function boxMag(b: Builder, at: V3, depth: number, len: number, width: number, s: Surface, rake = 0.08, base: Surface = s) {
  const m0 = b.mark;
  b.bone = WB.mag;
  b.prism(fillet([[depth / 2, 0], [depth / 2 - len * rake, -len], [-depth / 2 - len * rake, -len], [-depth / 2, 0]], [0, 0.003, 0.003, 0]), width, s, { bevel: 0.0018 });
  // Witness ribs down the sides and a floorplate with a lip.
  for (let i = 0; i < 3; i++) { const t = 0.25 + i * 0.22; b.box([width + 0.0016, 0.003, depth * 0.62], [0, -len * t, -len * t * rake], s, 0.001, [rake, 0, 0]); }
  b.box([width + 0.006, 0.009, depth + 0.012], [0, -len - 0.003, -len * rake - 0.002], base, 0.003, [rake, 0, 0]);
  b.lathe([[0, 0], [0.0045, 0.004], [0.0045, depth * 0.7], [0.0026, depth * 0.85], [0, depth * 0.88]], SURF.brass, [0, 0.002, depth * 0.4], 8);
  b.transformSince(m0, new THREE.Matrix4().makeTranslation(...at));
  b.bone = WB.root;
}

/** A holographic sight: a box body with a hooded window, buttons, and a reticle ring with a centre dot. */
function holo(b: Builder, z: number, railY: number, body: Surface): THREE.BufferGeometry {
  const top = 0.024, bot = -0.018, half = 0.024, L = 0.05;
  // Base on the rail, battery housing at the front.
  b.box([0.05, bot - railY, L + 0.03], [0, (railY + bot) / 2, z + 0.008], body, 0.003);
  // Window frame: two side walls and a hood.
  for (const sx of [-1, 1]) b.prism(fillet([[z + L / 2, bot], [z + L / 2, top - 0.004], [z - L / 2, top], [z - L / 2, bot]], [0, 0.004, 0.004, 0]), 0.005, body, { x: sx * (half + 0.0025), bevel: 0.0012 });
  b.prism(fillet([[z + L / 2, top - 0.006], [z + L / 2, top], [z - L / 2 - 0.004, top + 0.004], [z - L / 2 - 0.004, top - 0.004]], 0.002), half * 2 + 0.01, body, { bevel: 0.0015 });
  b.box([0.052, 0.006, 0.014], [0, bot - 0.002, z + L / 2 + 0.01], body, 0.0015);
  b.cyl(0.003, 0.004, 'x', [half + 0.006, bot + 0.004, z + 0.012], SURF.rubber, 8);
  b.cyl(0.003, 0.004, 'x', [half + 0.006, bot + 0.004, z + 0.002], SURF.rubber, 8);
  b.box([0.01, 0.006, 0.016], [0.026, railY + 0.001, z + 0.02], SURF.steel, 0.001);
  // Reticle: a ring and a dot, glowing, on the front window plane.
  const ring = new THREE.TorusGeometry(0.0055, 0.00028, 4, 28); ring.translate(0, 0, z - L / 2 + 0.003);
  b.add(ring, SURF.red);
  b.sphere(0.00045, [0, 0, z - L / 2 + 0.003], SURF.red, 6);
  const lens = new THREE.PlaneGeometry(half * 2, top - bot); lens.translate(0, (top + bot) / 2, z - L / 2 + 0.002);
  return lens;
}

/** A variable-power scope: eyepiece, 30 mm tube, turret saddle, objective bell, two rings onto the rail. */
function scope(b: Builder, z0: number, railY: number, body: Surface): THREE.BufferGeometry {
  const R = 0.015;
  const prof: [number, number][] = [[0.019, z0 - 0.0], [0.02, z0 - 0.004], [0.02, z0 - 0.03], [0.0175, z0 - 0.034], [0.0175, z0 - 0.06], [R, z0 - 0.075], [R, z0 - 0.22], [0.019, z0 - 0.25], [0.0235, z0 - 0.28], [0.0235, z0 - 0.33], [0.0225, z0 - 0.333]];
  b.lathe(prof.map(([r, z]) => [r, -z] as const), body, [0, 0, 0], 26);
  b.lathe([[0.0175, -(z0 - 0.002)], [0.0175, -(z0 - 0.33)]].reverse().map(([r, d]) => [r, d] as const), surf(body, { color: 0x0b0b0b }), [0, 0, 0], 20);
  // Magnification ring grip, turrets and the parallax knob.
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; b.box([0.002, 0.002, 0.012], [Math.cos(a) * 0.0205, Math.sin(a) * 0.0205, z0 - 0.045], body, 0); }
  const tz = z0 - 0.15;
  b.box([0.04, 0.03, 0.04], [0, 0, tz], body, 0.008);
  b.cyl(0.011, 0.016, 'y', [0, 0.02, tz], body, 18); b.cyl(0.0105, 0.004, 'y', [0, 0.03, tz], surf(body, { color: 0x1a1b1c }), 18);
  b.cyl(0.011, 0.016, 'x', [0.02, 0, tz], body, 18); b.cyl(0.012, 0.012, 'x', [-0.022, 0, tz], body, 18);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; b.box([0.0016, 0.012, 0.0016], [Math.cos(a) * 0.0108, 0.021, tz + Math.sin(a) * 0.0108], body, 0); }
  // Rings: a clamp around the tube and a base to the rail.
  for (const rz of [z0 - 0.095, z0 - 0.205]) {
    b.lathe([[R + 0.003, -(rz + 0.008)], [R + 0.004, -(rz + 0.006)], [R + 0.004, -(rz - 0.006)], [R + 0.003, -(rz - 0.008)]], SURF.anod, [0, 0, 0], 20);
    b.prism(fillet([[rz + 0.009, railY], [rz + 0.009, -R], [rz - 0.009, -R], [rz - 0.009, railY]], 0.002), 0.016, SURF.anod, { bevel: 0.001 });
    b.box([0.024, 0.006, 0.02], [0, railY + 0.002, rz], SURF.anod, 0.001);
    b.cyl(0.003, 0.03, 'x', [0, -R - 0.003, rz], SURF.steel, 8);
  }
  // Two lens surfaces (transparent), eyepiece and objective.
  const lens = new THREE.CylinderGeometry(0.0172, 0.0172, 0.001, 24).rotateX(Math.PI / 2).translate(0, 0, z0 - 0.006);
  const obj = new THREE.CylinderGeometry(0.0215, 0.0215, 0.001, 24).rotateX(Math.PI / 2).translate(0, 0, z0 - 0.325);
  return mergeLens([lens, obj]);
}
function mergeLens(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const b = new Builder(0); for (const g of gs) b.add(g, SURF.lens);
  const out = b.build({ ao: false }); return out;
}

/** An upper receiver body (AR-family) from z 0 to `len`, with a flush ejection port and the bolt carrier in it. */
function upper(b: Builder, B: number, len: number, s: Surface) {
  b.prism(fillet([[0.004, B - 0.013], [0.004, B + 0.016], [-0.006, B + 0.02], [-len, B + 0.02], [-len, B - 0.013], [-len + 0.038, B - 0.016], [-0.02, B - 0.016]], [0, 0.003, 0.003, 0.002, 0.002, 0.004, 0.004]), 0.031, s, { bevel: 0.0016 });
  b.box([0.0012, 0.015, 0.058], [0.0159, B + 0.002, -0.095], surf(s, { color: 0x0c0c0d }), 0);
  b.box([0.0022, 0.0022, 0.062], [0.0164, B + 0.0104, -0.095], s, 0.0008);
  b.cyl(0.0014, 0.064, 'z', [0.0168, B - 0.0068, -0.095], SURF.steel, 8);
  b.bone = WB.bolt;
  b.box([0.0012, 0.0095, 0.05], [0.0163, B + 0.002, -0.093], SURF.steel, 0.0004);
  b.cyl(0.0022, 0.004, 'x', [0.0171, B + 0.002, -0.108], SURF.bright, 8);
  b.bone = WB.root;
}
/** A lower receiver with a magazine well whose seat is at z `mz`, pins, selector and catch. */
function lower(b: Builder, B: number, s: Surface, mz = -0.118, well = 0.068) {
  const f = mz - well / 2 - 0.004, r = mz + well / 2 + 0.004;
  b.prism(fillet([[0.006, B - 0.013], [0.006, B - 0.034], [-0.03, B - 0.04], [r, B - 0.04], [r - 0.012, B - 0.064], [f + 0.006, B - 0.064], [f - 0.002, B - 0.05], [f - 0.016, B - 0.042], [-0.2, B - 0.03], [-0.2, B - 0.013]], [0, 0.006, 0.004, 0.002, 0.004, 0.004, 0.006, 0.006, 0.004, 0]), 0.03, s, { bevel: 0.0016 });
  b.prism(fillet([[r - 0.01, B - 0.054], [r - 0.008, B - 0.068], [f + 0.004, B - 0.068], [f + 0.002, B - 0.054]], 0.003), 0.034, s, { bevel: 0.0018 });
  b.mirrorX(() => { b.cyl(0.0032, 0.004, 'x', [0.0165, B - 0.02, -0.004], SURF.steel, 10); b.cyl(0.0032, 0.004, 'x', [0.0165, B - 0.02, -0.19], SURF.steel, 10); });
  b.cyl(0.0045, 0.004, 'x', [-0.0168, B - 0.025, -0.016], SURF.steel, 10);
  b.prism(fillet([[-0.004, -0.0025], [-0.004, 0.0025], [-0.022, 0.003], [-0.024, 0], [-0.022, -0.003]], 0.001), 0.003, SURF.park, { x: -0.0175, bevel: 0.0006 });
  b.transformSince(b.mark - 1, new THREE.Matrix4().makeTranslation(0, B - 0.025, -0.012));
  b.cyl(0.0042, 0.004, 'x', [0.0168, B - 0.035, r - 0.006], SURF.steel, 12);
  b.prism(fillet([[f + 0.03, B - 0.02], [f + 0.03, B - 0.034], [f + 0.016, B - 0.04], [f + 0.012, B - 0.026]], 0.002), 0.004, SURF.steel, { x: -0.017, bevel: 0.0007 });
}

// ---- Tern C8: compact piston carbine, flat dark earth ------------------------------------------------------------

function ternC8(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.066, fde = SURF.anodFde, poly = SURF.polyFde;
  upper(b, B, 0.215, fde);
  rail(b, 0.004, -0.415, B + 0.033, fde);
  b.box([0.022, 0.008, 0.42], [0, B + 0.024, -0.205], fde, 0.0012);
  // Charging handle: a non-reciprocating side handle on the left of the upper.
  b.bone = WB.handle;
  b.prism(fillet([[-0.05, B + 0.002], [-0.05, B + 0.012], [-0.075, B + 0.012], [-0.08, B + 0.002]], 0.002), 0.012, SURF.anod, { x: -0.021, bevel: 0.0012 });
  b.bone = WB.root;
  // Octagonal handguard with short rails at three, six and nine o'clock.
  const oct = fillet([[-0.024, -0.012], [-0.012, -0.026], [0.012, -0.026], [0.024, -0.012], [0.024, 0.012], [0.012, 0.022], [-0.012, 0.022], [-0.024, 0.012]], 0.004, 2).map(([x, y]) => [x, y + B] as [number, number]);
  b.extrudeZ(oct, -0.215, -0.415, fde, 0.0015);
  for (let i = 0; i < 6; i++) { b.box([0.0012, 0.009, 0.022], [0.0246, B, -0.235 - i * 0.03], surf(fde, { color: 0x24211c }), 0); b.box([0.0012, 0.009, 0.022], [-0.0246, B, -0.235 - i * 0.03], surf(fde, { color: 0x24211c }), 0); }
  rail(b, -0.3, -0.405, -(B - 0.03), fde, 0, Math.PI);
  // Gas block, short barrel and a slotted compensator.
  b.box([0.03, 0.03, 0.03], [0, B + 0.006, -0.43], SURF.park, 0.003);
  b.lathe([[0.0098, 0.415], [0.0098, 0.47]], SURF.park, [0, B, 0], 16);
  b.lathe([[0.0115, 0.468], [0.0128, 0.472], [0.0128, 0.52], [0.0118, 0.524], [0.006, 0.524]], SURF.park, [0, B, 0], 18);
  for (let i = 0; i < 3; i++) for (const a of [0, Math.PI / 2, -Math.PI / 2]) { const m0 = b.mark; b.box([0.0008, 0.004, 0.009], [0.0129, 0, -0.48 - i * 0.013], surf(SURF.park, { color: 0x080808 }), 0); b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, B, 0).multiply(new THREE.Matrix4().makeRotationZ(a))); }
  lower(b, B, fde, -0.115);
  guardLoop(b, B - 0.034, -0.004, -0.075, fde);
  triggerBlade(b, B - 0.036, -0.034);
  const palm = pistolGrip(b, B - 0.035, -0.008, poly, 0.3);
  // Side-folding skeleton stock: a hinge block, a triangle of tubes, a butt plate.
  b.box([0.03, 0.03, 0.02], [0, B + 0.002, 0.012], SURF.anod, 0.004);
  b.tube([[0, B + 0.012, 0.02], [0, B + 0.016, 0.12], [0, B + 0.018, 0.21]], 0.0065, SURF.anod, 12, 10);
  b.tube([[0, B - 0.01, 0.02], [0, B - 0.045, 0.12], [0, B - 0.07, 0.205]], 0.0065, SURF.anod, 12, 10);
  b.tube([[0, B - 0.036, 0.11], [0, B + 0.015, 0.11]], 0.005, SURF.anod, 4, 8);
  b.prism(fillet([[0.2, B + 0.03], [0.2, B - 0.082], [0.218, B - 0.084], [0.218, B + 0.032]], 0.006), 0.036, SURF.rubber, { bevel: 0.003 });
  b.prism(fillet([[0.12, B + 0.018], [0.12, B + 0.034], [0.2, B + 0.036], [0.2, B + 0.018]], 0.005), 0.026, poly, { bevel: 0.003 });
  // Steel magazine, slightly curved, grey.
  const MZ = -0.115, MY = B - 0.03;
  boxMag(b, [0, MY, MZ], 0.062, 0.17, 0.022, SURF.anodGrey, 0.16);
  casings(b, 'rifle', [0.018, B + 0.002, -0.095]);
  const lens = holo(b, -0.09, B + 0.033, SURF.anod);
  const geo = b.build({ aoRange: 0.03, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2] });
  return { geo, lens, triangles: geo.index!.count / 3, sockets: {
    grip: { p: palm, r: [-0.3, 0, 0] }, support: { p: [-0.004, B - 0.03, -0.32], r: [0, 0, 0] },
    mag: [0, MY, MZ], muzzle: [0, B, -0.525], eject: [0.018, B + 0.002, -0.095], handle: [-0.024, B + 0.007, -0.065],
    boltTravel: 0.055, handleTravel: 0.06, trigger: [0, B - 0.05, -0.04], bore: -B,
  } };
}

// ---- Wren-9: 9 mm submachine gun -----------------------------------------------------------------------------

function wren9(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.05, steel = SURF.park, poly = SURF.poly;
  // Stamped receiver: a tall rounded-top box with pressed ribs.
  b.prism(fillet([[0.006, B - 0.02], [0.006, B + 0.016], [-0.24, B + 0.016], [-0.24, B - 0.02]], [0.004, 0.012, 0.012, 0.004]), 0.036, steel, { bevel: 0.002 });
  b.mirrorX(() => { b.box([0.0014, 0.005, 0.15], [0.0186, B + 0.004, -0.12], steel, 0.0008); b.box([0.0014, 0.004, 0.05], [0.0186, B - 0.012, -0.2], steel, 0.0008); });
  // Ejection port on the right with the bolt face visible.
  b.box([0.0012, 0.014, 0.04], [0.0186, B + 0.003, -0.07], surf(steel, { color: 0x0b0b0b }), 0);
  b.bone = WB.bolt; b.box([0.0012, 0.01, 0.034], [0.0189, B + 0.003, -0.068], SURF.steel, 0.0004); b.bone = WB.root;
  // Cocking tube above the barrel on the left, with a folding handle (handle bone).
  b.lathe([[0.0085, 0.05], [0.0085, 0.25], [0.007, 0.255]], steel, [-0.008, B + 0.024, 0], 12);
  b.bone = WB.handle;
  b.box([0.016, 0.006, 0.008], [-0.022, B + 0.026, -0.2], SURF.poly, 0.002);
  b.sphere(0.005, [-0.031, B + 0.026, -0.2], SURF.poly, 8);
  b.bone = WB.root;
  // Front trunnion, hooded front sight, short barrel with a thread protector.
  b.box([0.03, 0.036, 0.03], [0, B, -0.255], steel, 0.006);
  b.lathe([[0.0085, 0.24], [0.0085, 0.31]], SURF.park, [0, B, 0], 14);
  b.lathe([[0.0105, 0.3], [0.0105, 0.322], [0.0095, 0.326], [0.005, 0.326]], SURF.steel, [0, B, 0], 16);
  b.lathe([[0.008, 0.235], [0.008, 0.25]], SURF.park, [0, B + 0.032, 0], 14);
  // Polymer handguard with finger grooves under the barrel.
  b.prism(fillet([[-0.18, B - 0.018], [-0.18, B - 0.034], [-0.27, B - 0.036], [-0.285, B - 0.026], [-0.285, B - 0.012]], 0.006), 0.04, poly, { bevel: 0.004, seg: 3 });
  for (let i = 0; i < 4; i++) b.box([0.042, 0.003, 0.004], [0, B - 0.034 - 0.0, -0.195 - i * 0.02], poly, 0.0012);
  // Short top rail with a mini reflex sight.
  rail(b, -0.02, -0.12, B + 0.024, steel);
  b.box([0.03, 0.007, 0.03], [0, B + 0.027, -0.07], SURF.anod, 0.002);
  b.prism(fillet([[-0.055, B + 0.03], [-0.055, 0.012], [-0.09, 0.014], [-0.09, B + 0.03]], [0, 0.008, 0.008, 0]), 0.034, SURF.anod, { bevel: 0.002, holes: [fillet([[-0.06, -0.012], [-0.06, 0.008], [-0.085, 0.009], [-0.085, -0.012]], 0.004)] });
  b.sphere(0.0006, [0, 0, -0.086], SURF.red, 6);
  // Trigger group: polymer housing with grip, guard and the magazine well ahead of it.
  b.prism(fillet([[0.004, B - 0.02], [0.004, B - 0.036], [-0.16, B - 0.036], [-0.16, B - 0.02]], 0.004), 0.032, poly, { bevel: 0.002 });
  guardLoop(b, B - 0.036, -0.002, -0.07, poly, 0.032);
  triggerBlade(b, B - 0.038, -0.03);
  const palm = pistolGrip(b, B - 0.036, -0.0, poly, 0.26, 0.098);
  b.prism(fillet([[-0.085, B - 0.03], [-0.085, B - 0.072], [-0.128, B - 0.072], [-0.128, B - 0.03]], 0.004), 0.034, poly, { bevel: 0.002 });
  // Collapsible wire stock: two rods and a hinged butt plate.
  b.box([0.03, 0.03, 0.012], [0, B - 0.004, 0.012], steel, 0.004);
  for (const sx of [-1, 1]) b.lathe([[0.0042, -0.006], [0.0042, -0.2]], SURF.steel, [sx * 0.012, B + 0.004, 0], 8);
  b.prism(fillet([[0.198, B + 0.024], [0.198, B - 0.074], [0.214, B - 0.074], [0.214, B + 0.024]], 0.006), 0.04, SURF.rubber, { bevel: 0.003 });
  // Straight 32-round stick magazine.
  const MZ = -0.106, MY = B - 0.03;
  boxMag(b, [0, MY, MZ], 0.034, 0.215, 0.024, SURF.park, 0.06, SURF.poly);
  casings(b, 'pistol', [0.02, B + 0.003, -0.07]);
  const lens = new THREE.PlaneGeometry(0.025, 0.021).translate(0, 0, -0.088);
  const geo = b.build({ aoRange: 0.03, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2] });
  return { geo, lens, triangles: geo.index!.count / 3, sockets: {
    grip: { p: palm, r: [-0.26, 0, 0] }, support: { p: [-0.004, B - 0.036, -0.235], r: [0, 0, 0] },
    mag: [0, MY, MZ], muzzle: [0, B, -0.33], eject: [0.02, B + 0.003, -0.07], handle: [-0.022, B + 0.026, -0.2],
    boltTravel: 0.04, handleTravel: 0.07, trigger: [0, B - 0.05, -0.035], bore: -B,
  } };
}

// ---- Halden 12: pump shotgun, wood furniture ----------------------------------------------------------------

function halden12(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.032, steel = SURF.park, wood = SURF.wood;
  // Receiver: a tall flat-sided steel box with a loading port underneath and an ejection port on the right.
  b.prism(fillet([[0.004, B - 0.04], [0.004, B + 0.012], [-0.012, B + 0.018], [-0.2, B + 0.018], [-0.2, B - 0.04]], [0, 0.006, 0.008, 0.004, 0.004]), 0.036, steel, { bevel: 0.002 });
  b.box([0.0012, 0.022, 0.07], [0.0186, B, -0.1], surf(steel, { color: 0x0a0a0a }), 0);
  b.bone = WB.bolt; b.box([0.0012, 0.016, 0.05], [0.0189, B + 0.001, -0.095], SURF.bright, 0.0005); b.bone = WB.root;
  b.box([0.024, 0.0012, 0.075], [0, B - 0.0406, -0.12], surf(steel, { color: 0x0a0a0a }), 0);
  // Side saddle on the left: a plate with four shells (red hulls, brass heads).
  b.box([0.004, 0.034, 0.1], [-0.02, B - 0.012, -0.1], SURF.poly, 0.0015);
  for (let i = 0; i < 4; i++) { b.cyl(0.0105, 0.05, 'y', [-0.033, B - 0.012, -0.065 - i * 0.024], surf(SURF.poly, { color: 0x7a1c16, rough: 0.5 }), 12); b.cyl(0.0108, 0.01, 'y', [-0.033, B - 0.042, -0.065 - i * 0.024], SURF.brass, 12); }
  // Ghost-ring rear sight on the receiver.
  b.box([0.024, 0.008, 0.014], [0, B + 0.022, -0.01], steel, 0.002);
  for (const sx of [-1, 1]) b.box([0.004, 0.022, 0.01], [sx * 0.009, B + 0.03, -0.01], steel, 0.0015);
  const ring = new THREE.TorusGeometry(0.0045, 0.0016, 6, 18); ring.translate(0, 0, -0.01); b.add(ring, steel);
  // Barrel with a ventilated rib and a bead; the magazine tube under it with a knurled cap.
  b.lathe([[0.0108, 0.2], [0.0108, 0.66], [0.0098, 0.663], [0.0072, 0.663]], SURF.steel, [0, B, 0], 18);
  b.box([0.008, 0.003, 0.44], [0, B + 0.0125, -0.43], SURF.steel, 0.001);
  for (let i = 0; i < 12; i++) b.box([0.004, 0.004, 0.006], [0, B + 0.0095, -0.23 - i * 0.036], SURF.steel, 0);
  b.sphere(0.0022, [0, B + 0.016 + 0.002, -0.648], SURF.brass, 8);
  b.lathe([[0.0112, 0.2], [0.0112, 0.6]], SURF.steel, [0, B - 0.024, 0], 16);
  b.lathe([[0.0122, 0.598], [0.0128, 0.6], [0.0128, 0.624], [0.0115, 0.628], [0.0, 0.628]], SURF.park, [0, B - 0.024, 0], 18);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; b.box([0.0014, 0.0014, 0.02], [Math.cos(a) * 0.0129, B - 0.024 + Math.sin(a) * 0.0129, -0.612], SURF.park, 0); }
  b.box([0.008, 0.016, 0.014], [0, B - 0.012, -0.6], SURF.steel, 0.002);
  // Pump (handle bone): a wooden forend with grooves on the tube, action bars back to the receiver.
  b.bone = WB.handle;
  b.lathe([[0.016, 0.3], [0.0195, 0.31], [0.0205, 0.33], [0.0205, 0.45], [0.0185, 0.47], [0.0155, 0.48]], wood, [0, B - 0.026, 0], 22);
  for (let i = 0; i < 7; i++) b.lathe([[0.0207, 0.34 + i * 0.016], [0.0195, 0.344 + i * 0.016], [0.0207, 0.348 + i * 0.016]], surf(wood, { color: 0x3a2412 }), [0, B - 0.026, 0], 22);
  for (const sx of [-1, 1]) b.box([0.002, 0.005, 0.14], [sx * 0.0135, B - 0.03, -0.25], SURF.steel, 0.0008);
  b.bone = WB.root;
  // Trigger guard and trigger under the receiver.
  guardLoop(b, B - 0.04, 0.0, -0.065, steel, 0.03);
  triggerBlade(b, B - 0.042, -0.03);
  // Wooden stock with a pistol-grip wrist, a comb, a rubber recoil pad.
  b.prism(fillet([[0.004, B + 0.012], [0.004, B - 0.04], [0.02, B - 0.05], [0.04, B - 0.105], [0.06, B - 0.118], [0.08, B - 0.11], [0.075, B - 0.072], [0.12, B - 0.08], [0.3, B - 0.115], [0.33, B - 0.118], [0.338, B - 0.004], [0.24, B - 0.01], [0.07, B + 0.004]], [0, 0.006, 0.02, 0.012, 0.012, 0.014, 0.012, 0.03, 0.006, 0, 0, 0.02, 0.01]), 0.038, wood, { bevel: 0.005, seg: 3 });
  b.prism(fillet([[0.336, B - 0.002], [0.336, B - 0.12], [0.356, B - 0.122], [0.356, B + 0.0]], 0.008), 0.042, SURF.rubber, { bevel: 0.004 });
  b.cyl(0.006, 0.04, 'x', [0, B - 0.09, 0.27], SURF.steel, 12);
  // Loading shell for reloads (aux bone), hidden until used.
  b.bone = WB.aux; const m0 = b.mark;
  b.cyl(0.0105, 0.05, 'z', [0, 0, 0], surf(SURF.poly, { color: 0x7a1c16, rough: 0.5 }), 12); b.cyl(0.0108, 0.01, 'z', [0, 0, 0.026], SURF.brass, 12);
  b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, B - 0.05, -0.12)); b.bone = WB.root;
  casings(b, 'shell', [0.02, B, -0.1]);
  const geo = b.build({ aoRange: 0.03, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2, WB.aux] });
  return { geo, lens: null, triangles: geo.index!.count / 3, sockets: {
    grip: { p: [0.021, B - 0.075, 0.045], r: [-0.45, 0, 0] }, support: { p: [0, B - 0.048, -0.39], r: [0, 0, 0] },
    mag: [0, B - 0.05, -0.12], muzzle: [0, B, -0.665], eject: [0.02, B, -0.1], handle: [0, B - 0.026, -0.39],
    boltTravel: 0.09, handleTravel: 0.09, trigger: [0, B - 0.055, -0.035], bore: -B, port: [0, B - 0.045, -0.12],
  } };
}

// ---- Corvin DMR: 7.62 mm marksman rifle with a variable scope --------------------------------------------------

function corvinDMR(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.07, up = SURF.anodOd, poly = SURF.polyOd;
  upper(b, B, 0.26, up);
  rail(b, 0.004, -0.3, B + 0.033, up);
  b.box([0.022, 0.008, 0.3], [0, B + 0.024, -0.148], up, 0.0012);
  b.bone = WB.handle;
  b.prism([[0.006, B + 0.02], [0.006, B + 0.027], [-0.012, B + 0.027], [-0.012, B + 0.02]], 0.014, SURF.anod, { bevel: 0.001 });
  b.prism(fillet([[0.014, B + 0.017], [0.014, B + 0.027], [0.004, B + 0.027], [0.004, B + 0.017]], 0.002), 0.05, SURF.anod, { bevel: 0.0015 });
  b.bone = WB.root;
  // Round free-float handguard with flats and long slots, a short top rail section.
  const hz0 = -0.26, hz1 = -0.6;
  b.lathe([[0.025, -hz0], [0.026, -hz0 - 0.004], [0.026, -hz1 + 0.006], [0.024, -hz1]], up, [0, B - 0.002, 0], 12);
  for (let i = 0; i < 5; i++) for (const sx of [-1, 1]) b.box([0.0015, 0.01, 0.045], [sx * 0.0262, B - 0.002, hz0 - 0.04 - i * 0.06], surf(up, { color: 0x15160f }), 0);
  rail(b, -0.3, -0.59, B + 0.033, up);
  // Heavy barrel and a muzzle brake with side ports.
  b.lathe([[0.0118, -hz1], [0.0118, 0.7]], SURF.park, [0, B, 0], 18);
  b.lathe([[0.0145, 0.698], [0.015, 0.702], [0.015, 0.77], [0.013, 0.775], [0.006, 0.775]], SURF.park, [0, B, 0], 20);
  for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) b.box([0.002, 0.008, 0.012], [sx * 0.0145, B, -0.715 - i * 0.02], surf(SURF.park, { color: 0x070707 }), 0);
  lower(b, B, up, -0.12, 0.08);
  guardLoop(b, B - 0.034, -0.004, -0.074, up);
  triggerBlade(b, B - 0.036, -0.034);
  const palm = pistolGrip(b, B - 0.035, -0.008, poly, 0.22, 0.104, 0.032);
  // Buffer tube and a fixed precision stock with an adjustable cheek piece.
  b.lathe([[0.0158, -0.004], [0.0158, -0.12]], SURF.anod, [0, B + 0.004, 0], 16);
  b.prism(fillet([[0.06, B + 0.022], [0.06, B - 0.025], [0.1, B - 0.035], [0.25, B - 0.07], [0.27, B - 0.09], [0.29, B - 0.09], [0.29, B + 0.025], [0.2, B + 0.022]], [0, 0.01, 0.012, 0.02, 0.006, 0, 0, 0.01]), 0.04, poly, { bevel: 0.004, seg: 3, holes: [fillet([[0.12, B - 0.025], [0.24, B - 0.058], [0.255, B - 0.07], [0.255, B - 0.01], [0.13, B - 0.01]], 0.008, 2)] });
  b.prism(fillet([[0.11, B + 0.03], [0.11, B + 0.05], [0.26, B + 0.052], [0.27, B + 0.042], [0.27, B + 0.03]], 0.006), 0.034, poly, { bevel: 0.003 });
  for (const zz of [0.15, 0.23]) b.cyl(0.0028, 0.036, 'y', [0, B + 0.034, zz], SURF.steel, 8);
  b.prism(fillet([[0.29, B + 0.028], [0.29, B - 0.094], [0.305, B - 0.096], [0.305, B + 0.03]], 0.006), 0.044, SURF.rubber, { bevel: 0.003 });
  // 20-round box magazine.
  const MZ = -0.12, MY = B - 0.03;
  boxMag(b, [0, MY, MZ], 0.076, 0.135, 0.028, SURF.park, 0.07);
  casings(b, 'rifle', [0.018, B + 0.002, -0.095]);
  const lens = scope(b, 0.02, B + 0.033, SURF.anod);
  const geo = b.build({ aoRange: 0.03, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2] });
  return { geo, lens, triangles: geo.index!.count / 3, sockets: {
    grip: { p: palm, r: [-0.22, 0, 0] }, support: { p: [-0.004, B - 0.03, -0.4], r: [0, 0, 0] },
    mag: [0, MY, MZ], muzzle: [0, B, -0.775], eject: [0.018, B + 0.002, -0.095], handle: [-0.018, B - 0.03, -0.095],
    boltTravel: 0.07, handleTravel: 0, trigger: [0, B - 0.05, -0.04], bore: -B,
  } };
}

// ---- P-11: polymer-framed 9 mm pistol ------------------------------------------------------------------------

function p11(lod: number): Omit<WeaponModel, 'id'> {
  const b = new Builder(lod), B = -0.026, slideS = SURF.steel, frame = SURF.poly;
  // Slide (bolt bone): flat sides, bevelled top, serrations front and rear, an ejection port, three-dot sights.
  b.bone = WB.bolt;
  b.prism(fillet([[0.002, B - 0.011], [0.002, B + 0.013], [-0.004, B + 0.017], [-0.182, B + 0.017], [-0.19, B + 0.011], [-0.19, B - 0.011]], [0, 0.003, 0.006, 0.006, 0.003, 0.002]), 0.025, slideS, { bevel: 0.0016 });
  b.mirrorX(() => {
    for (let i = 0; i < 8; i++) b.box([0.0012, 0.018, 0.0022], [0.0128, B + 0.002, -0.006 - i * 0.0042], surf(slideS, { color: 0x111213 }), 0);
    for (let i = 0; i < 5; i++) b.box([0.0012, 0.014, 0.0022], [0.0128, B + 0.004, -0.15 - i * 0.0042], surf(slideS, { color: 0x111213 }), 0);
  });
  b.box([0.014, 0.0012, 0.05], [0.002, B + 0.0174, -0.07], surf(slideS, { color: 0x0b0b0b }), 0);
  b.box([0.012, 0.004, 0.045], [0.001, B + 0.016, -0.07], SURF.bright, 0.001);
  b.box([0.024, 0.008, 0.008], [0, B + 0.021, -0.006], slideS, 0.0015);
  b.box([0.0035, 0.009, 0.006], [0, B + 0.021, -0.177], slideS, 0.001);
  for (const sx of [-0.0062, 0.0062]) b.sphere(0.0011, [sx, B + 0.0235, -0.0024], SURF.tritium, 6);
  b.sphere(0.0012, [0, B + 0.0245, -0.18], SURF.tritium, 6);
  b.bone = WB.root;
  // Barrel crown at the muzzle and the barrel hood visible through the port.
  b.lathe([[0.0066, 0.186], [0.0066, 0.192], [0.0042, 0.192]], SURF.steel, [0, B, 0], 14);
  // Frame: dust cover with a short rail, an undercut square trigger guard, a raked grip with texture and a beavertail.
  b.prism(fillet([[0.006, B - 0.011], [0.006, B - 0.024], [-0.04, B - 0.026], [-0.18, B - 0.026], [-0.18, B - 0.011]], [0, 0.004, 0.004, 0.004, 0]), 0.023, frame, { bevel: 0.0016 });
  for (let i = 0; i < 3; i++) b.box([0.024, 0.003, 0.004], [0, B - 0.0265, -0.13 - i * 0.012], frame, 0.0008);
  b.prism(fillet([[-0.03, B - 0.024], [-0.03, B - 0.052], [-0.082, B - 0.054], [-0.088, B - 0.048], [-0.088, B - 0.024]], [0, 0.01, 0.002, 0.004, 0]), 0.012, frame, { bevel: 0.0014, holes: [fillet([[-0.036, B - 0.028], [-0.036, B - 0.046], [-0.077, B - 0.047], [-0.081, B - 0.043], [-0.081, B - 0.028]], [0, 0.008, 0.002, 0.003, 0])] });
  triggerBlade(b, B - 0.026, -0.05, SURF.poly);
  const palm = pistolGrip(b, B - 0.022, 0.006, frame, 0.32, 0.105, 0.03, 0.05);
  b.prism(fillet([[0.012, B - 0.012], [0.026, B - 0.016], [0.012, B - 0.024]], 0.003), 0.024, frame, { bevel: 0.002 });
  // Slide stop (left), magazine release (left behind the guard), takedown lever.
  b.prism(fillet([[-0.06, B - 0.012], [-0.06, B - 0.016], [-0.095, B - 0.018], [-0.098, B - 0.013]], 0.001), 0.0025, SURF.steel, { x: -0.0125, bevel: 0.0005 });
  b.box([0.003, 0.008, 0.008], [-0.0125, B - 0.032, -0.027], SURF.poly, 0.0015);
  // Magazine (mag bone): a steel body inside the grip with a polymer baseplate below it; seat at the top of the grip.
  const MZ = -0.012, MY = B - 0.026;
  { const m0 = b.mark; b.bone = WB.mag;
    b.prism(fillet([[0.012, 0], [0.012 + 0.032, -0.1], [-0.018 + 0.032, -0.1], [-0.018, 0]], 0.003), 0.019, SURF.steel, { bevel: 0.0012 });
    b.box([0.028, 0.011, 0.05], [0, -0.106, 0.026], SURF.poly, 0.003, [0.32, 0, 0]);
    b.transformSince(m0, new THREE.Matrix4().makeTranslation(0, MY, MZ)); b.bone = WB.root; }
  casings(b, 'pistol', [0.014, B + 0.017, -0.07]);
  const geo = b.build({ aoRange: 0.02, aoSkipBones: [WB.case0, WB.case0 + 1, WB.case0 + 2] });
  return { geo, lens: null, triangles: geo.index!.count / 3, sockets: {
    grip: { p: palm, r: [-0.32, 0, 0] }, support: { p: [-0.02, B - 0.06, 0.0], r: [0, 0, 0] },
    mag: [0, MY, MZ], muzzle: [0, B, -0.192], eject: [0.014, B + 0.017, -0.07], handle: [0, B + 0.004, -0.02],
    boltTravel: 0.032, handleTravel: 0.032, trigger: [0, B - 0.038, -0.052], bore: -B,
  } };
}

const BUILDERS: Partial<Record<WeaponId, (lod: number) => Omit<WeaponModel, 'id'>>> = { ar: marrowAR5, carbine: ternC8, smg: wren9, shotgun: halden12, dmr: corvinDMR, pistol: p11 };
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
