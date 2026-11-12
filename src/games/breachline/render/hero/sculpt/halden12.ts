/** The Halden 12 pump shotgun as a high-detail signed-distance sculpt (offline only). Every dimension comes from
 * `HALDEN` in designs.ts. Moving parts: the pump (handle bone), the bolt seen in the port, the trigger, the loading
 * shell (aux bone) and three spent hulls (case bones). */
import { HALDEN as H } from './designs';
import { BONE, MAT, pistolGrip, rail, ridgesU, screwX, stipple, type Part } from './kit';
import { alongZ, box, cut, cutChamfer, cutRound, cylX, cylY, cylZ, fillet, lathe, mirrorX, relief, repeatU, round2, sideX, union, type Shape } from './sdf';

/** A 12-gauge shell lying along the bore direction: brass head toward the rear. */
function shellZ(x: number, y: number, u0: number): Shape[] {
  return [cylZ(x, y, 10.3, u0 + 12, u0 + 70, 1.2), lathe([[0, u0], [10.9, u0], [10.9, u0 + 1.4], [10.4, u0 + 2], [10.4, u0 + 13], [0, u0 + 13]], x, y)];
}

export function haldenParts(hi: boolean): Part[] {
  const parts: Part[] = [];
  const add = (name: string, bone: number, mat: number, s: Shape, weight = 1) => parts.push({ name, bone, mat, s, weight });
  const R = H.receiver, sh = H.sightH;

  // Receiver: a flat-sided alloy box with a machined panel on the left, the ejection port on the right, the loading port
  // underneath, a short rail on top and the ghost-ring rear sight with protective ears at the rear.
  {
    let s = sideX(round2([[R.u0, R.bottom], [R.u1, R.bottom], [R.u1, R.top], [16, R.top], [R.u0, 14]], [2, 2, 1, 6, 2]), -R.half, R.half, -0.8);
    s = cutChamfer(s, box(-17, -12, 22, -14.2, 12, 190), 0.8);
    s = cutChamfer(s, box(6, H.port.y0, H.port.u0, 17, H.port.y1, H.port.u1), 0.6);
    s = cutChamfer(s, box(-H.loading.half, R.bottom - 6, H.loading.u0, H.loading.half, -12, H.loading.u1), 1.5);
    for (const u of [30, 178]) { let pin = cylX(-18, u, 3.6, -R.half - 0.8, R.half + 0.8, -0.3); if (hi) pin = cut(pin, cylX(-18, u, 1.1, -R.half - 2, -R.half + 0.2)); s = union(s, pin); }
    // Bolt release on the left, in front of the trigger housing.
    let rel = sideX(round2([[100, -22], [116, -22], [116, -16], [100, -16]], 2), -R.half - 2.2, -R.half + 0.5, -0.4);
    if (hi) rel = relief(rel, (x, y, z) => (x < -R.half - 1.9 ? ridgesU(0.9, 0.18)(x, y, z) : 0), 0.25);
    s = union(s, rel);
    // A raised machined rib along the lower edge of each side, a flared loading port and a stock tang at the rear.
    s = union(s, mirrorX(sideX(round2([[6, R.bottom], [R.u1 - 6, R.bottom], [R.u1 - 6, R.bottom + 5], [6, R.bottom + 5]], 1.5), R.half - 1, R.half + 0.9, -0.5)));
    s = union(s, sideX(round2([[R.u0 - 22, -20], [R.u0 + 2, -20], [R.u0 + 2, 10], [R.u0 - 22, 8]], 3), -12, 12, -0.8));
    add('receiver', BONE.root, MAT.blued, s, 1.4);
    add('receiver rail', BONE.root, MAT.blued, rail(44, 180, hi, 30, R.top), 1.4);
    // Ghost ring: an aperture on a post between two ears.
    let gr = union(lathe([[3.8, 14], [6.9, 14], [6.9, 21], [3.8, 21]], 0, sh), box(-2.4, R.top, 14, 2.4, sh - 6.2, 21, -0.4), box(-8, R.top - 1, 6, 8, R.top + 5, 32, -0.6));
    gr = union(gr, mirrorX(sideX(round2([[10, R.top + 4], [28, R.top + 4], [26, sh + 3], [14, sh + 4.5]], [0, 0, 3, 3]), 7.5, 9.2, -0.4)));
    add('ghost ring', BONE.root, MAT.blued, gr, 2);
  }
  // Bolt, seen in the port (bolt bone).
  add('bolt', BONE.bolt, MAT.steel, union(box(-8, -5, 40, 9, 11, 150, -0.5), cylX(4, 112, 2.6, 6, 12, -0.3)), 0.5);
  // Trigger housing and guard (polymer), trigger (trigger bone), grip.
  {
    let s = sideX(round2([[4, R.bottom + 1], [124, R.bottom + 1], [124, -36], [4, -36]], 3), -12.5, 12.5, 2);
    const out = round2([[112, -34], [112, -48], [104, -57], [54, -57], [46, -48], [46, -34]], [0, 3, 3, 3, 3, 0]);
    const inn = round2([[106.5, -33], [106.5, -46.5], [101, -52], [57, -52], [52.5, -46.5], [52.5, -33]], [0, 3, 2.5, 2.5, 3, 0]);
    s = fillet(s, cut(sideX(out, -5.5, 5.5, 1.4), sideX(inn, -7, 7, 0)), 1.5);
    s = union(s, cylX(-30, 120, 3, -13.2, 13.2, -0.3));
    add('trigger housing', BONE.root, MAT.polymer, s, 0.9);
    add('trigger', BONE.trigger, MAT.steel, sideX(round2([[70.5, -33], [75, -33], [74, -42], [71, -49], [66, -54.5], [64.5, -53], [68, -47], [70, -41]], [0, 0, 2, 3, 1.2, 1.2, 3, 2]), -2.7, 2.7, 0.7), 0.4);
    add('grip', BONE.root, MAT.polymer, pistolGrip(H.grip.pivot, H.grip.rake, H.grip.width, hi), 0.8);
  }
  // Stock with a comb and a recessed panel, ribbed butt pad.
  {
    let st = sideX(round2([[3, 14], [-40, 16], [-200, 14], [-322, 12], [-331, 8], [-331, -90], [-320, -96], [-250, -78], [-120, -46], [-56, -38], [-30, -36], [3, -27]], [3, 30, 40, 6, 3, 3, 6, 40, 30, 10, 6, 3]), -17, 17, 7);
    st = cutRound(st, mirrorX(sideX(round2([[-120, -10], [-285, -8], [-300, -28], [-288, -68], [-140, -38]], 10), 15.6, 30)), 1.6);
    st = cutRound(st, sideX(round2([[-298, -80], [-312, -80], [-312, -66], [-298, -66]], 3), -30, 30), 1);
    add('stock', BONE.root, MAT.polymerFde, st, 0.35);
    let pad = sideX(round2([[-331, 11], [-347, 12], [-348, -95], [-331, -95]], [3, 5, 5, 3]), -19, 19, 5);
    if (hi) pad = relief(pad, (_x, y, z) => (-z < -339 ? -0.35 * Math.max(0, Math.sin(y * Math.PI / 4)) : 0), 0.4);
    add('butt pad', BONE.root, MAT.rubber, pad, 0.25);
  }
  // Barrel, front sight ramp with a post, magazine tube with its cap and a sling loop, the barrel clamp.
  {
    const B = H.barrel;
    add('barrel', BONE.root, MAT.steel, cut(union(cylZ(0, 0, B.r, B.u0 - 4, B.u1, -0.8), lathe([[B.r, B.u0 - 4], [15, B.u0 - 4], [15.5, B.u0 - 2], [15.5, B.u0 + 8], [B.r, B.u0 + 14]])), cylZ(0, 0, 9.2, B.u1 - 30, B.u1 + 2)), 0.6);
    let fs = sideX(round2([[640, B.r - 2], [672, B.r - 2], [672, B.r + 4], [664, sh], [659, sh], [652, B.r + 4]], [2, 1, 2, 1, 1, 6]), -2.2, 2.2, -0.4);
    fs = union(fs, sideX(round2([[636, B.r - 3], [674, B.r - 3], [674, B.r + 3], [636, B.r + 3]], 2), -5.5, 5.5, -0.5));
    add('front sight', BONE.root, MAT.steel, fs, 1.2);
    const T = H.tube;
    let tube = union(cylZ(0, T.y, T.r, B.u0, T.u1, -0.5), lathe([[0, T.u1], [T.r + 0.6, T.u1], [T.r + 0.6, T.u1 + 12], [T.r - 1.5, T.u1 + 15], [0, T.u1 + 15]], 0, T.y));
    if (hi) tube = relief(tube, (x, y, z) => (-z > T.u1 + 1 && -z < T.u1 + 11 ? ridgesU(1.2, 0.2)(x, y, z) : 0), 0.3);
    tube = union(tube, cut(cylX(T.y - 14, T.u1 + 7, 4.5, -3, 3, -0.4), cylX(T.y - 14, T.u1 + 7, 2.4, -5, 5)), box(-2.6, T.y - 14, T.u1 + 3, 2.6, T.y - 8, T.u1 + 11, -0.4));
    add('magazine tube', BONE.root, MAT.steel, tube, 0.6);
    let clamp = sideX(round2([[582, -38], [600, -38], [600, 14], [582, 14]], 3), -13, 13, 2);
    clamp = cut(clamp, cylZ(0, 0, B.r + 0.1, 570, 610), cylZ(0, T.y, T.r + 0.1, 570, 610));
    clamp = union(clamp, screwX(-12, 591, 13, 1, 3, 1.6, hi));
    add('barrel clamp', BONE.root, MAT.blued, clamp, 0.6);
  }
  // Pump: a ribbed polymer forend round the tube (handle bone).
  {
    const P = H.pump, sec = round2([[-P.half, P.bottom], [P.half, P.bottom], [P.half, P.top], [-P.half, P.top]], 9);
    let pump = alongZ(sec, P.u0, P.u1, 3);
    for (const u0 of [P.u0 + 30, P.u0 + 110]) {
      const groove = repeatU(cut(alongZ(sec, u0, u0 + 4, 0, -1), alongZ(sec, u0 - 1, u0 + 5, 0, 2.2)), 13, 6);
      pump = cutRound(pump, groove, 0.6);
    }
    if (hi) pump = relief(pump, (x, y, z) => (Math.abs(x) > P.half - 0.6 ? stipple(x, y, z) * 0.6 : 0), 0.3);
    pump = cut(pump, cylZ(0, H.tube.y, H.tube.r + 0.6, P.u0 - 5, P.u1 + 5));
    add('pump', BONE.handle, MAT.polymerFde, pump, 1.2);
  }
  // Side saddle on the left: a plate, a strap and five shells, brass up.
  {
    const S = H.saddle;
    let plate = sideX(round2([[S.u0, -26], [S.u1, -26], [S.u1, 4], [S.u0, 4]], 4), -R.half - 4, -R.half + 0.3, 1.2);
    for (const [u, y] of [[S.u0 + 8, -18], [S.u1 - 8, -18], [S.u0 + 8, -4], [S.u1 - 8, -4]]) plate = union(plate, screwX(y, u, -R.half - 4, -1, 2.6, 1.4, hi));
    plate = union(plate, sideX(round2([[S.u0 - 2, -16], [S.u1 + 2, -16], [S.u1 + 2, -8], [S.u0 - 2, -8]], 2), -R.half - 26.5, -R.half - 3.8, 1.5));
    add('side saddle', BONE.root, MAT.polymer, plate, 1.1);
    const hulls: Shape[] = [], heads: Shape[] = [];
    for (let i = 0; i < S.shells; i++) {
      const u = S.u0 + 11 + i * 19.5, x = -R.half - 15;
      hulls.push(cylY(x, u, 9.6, -46, 4, 1));
      heads.push(latheYHead(x, u));
    }
    add('saddle hulls', BONE.root, MAT.hull, union(...hulls), 0.9);
    add('saddle heads', BONE.root, MAT.brass, union(...heads), 0.9);
  }
  // Loading shell (aux bone) under the port, and three spent hulls on the case bones.
  {
    const [hull, head] = shellZ(0, -50, 86);
    add('loading hull', BONE.aux, MAT.hull, hull, 0.4);
    add('loading head', BONE.aux, MAT.brass, head, 0.4);
    for (let i = 0; i < 3; i++) {
      const [ch, cb] = shellZ(20, 2, 76);
      add(`case hull ${i}`, 6 + i, MAT.hull, ch, 0.3);
      add(`case head ${i}`, 6 + i, MAT.brass, cb, 0.3);
    }
  }
  return parts;
}

/** A shell's brass head, upward, on a saddle shell at (x, u). */
function latheYHead(x: number, u: number): Shape {
  return cylY(x, u, 10.3, 3, 14, -0.8);
}
