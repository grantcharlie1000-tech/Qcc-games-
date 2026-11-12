/** The Marrow AR-5 as a high-detail signed-distance sculpt (offline only: the mesher and baker in
 * scripts/breachline-assets/hero/ read it; the game loads the baked result). Every dimension comes from `AR5` in
 * designs.ts. `hi` adds what is too fine for triangles and goes into the normal map: stipple, knurling, serrations,
 * screw sockets, pin dimples, slot-edge chamfers. Moving parts are separate parts with their own bone. */
import { AR5, type RifleDesign } from './designs';
import {
  alongZ, box, chamferJoin, cut, cutChamfer, cutRound, cylX, cylY, cylZ, fillet, inter, lathe, latheX, latheY, mirrorX, relief,
  move, repeatU, rotX, rotZ, round2, sideX, stadium2, stadiumB, topY, union, type Shape,
} from './sdf';
import { MAT, knurlY, pistolGrip, rail, ridgesU, screwX, stipple, type Part } from './kit';
export { MAT, type Part };

const BONE = { root: 0, mag: 1, bolt: 2, trigger: 3, handle: 4 } as const;

// ---- The rifle ------------------------------------------------------------------------------------------------------

export function ar5Parts(hi: boolean, A: RifleDesign = AR5): Part[] {
  const furn = A.furniture === 'polymerFde' ? MAT.polymerFde : MAT.polymer;
  const parts: Part[] = [];
  const add = (name: string, bone: number, mat: number, s: Shape, weight = 1) => parts.push({ name, bone, mat, s, weight });
  const U = A.upper, L = A.lower, W = A.well, H = A.handguard, P = A.port;

  // Upper receiver: a slim forging with a machined pocket on the left, the ejection port on the right with a brass
  // deflector behind it, and the charging-handle channel at the rear of the deck.
  {
    let s = sideX(round2([[U.u0, U.bottom], [U.u1, U.bottom], [U.u1, A.deck], [U.u0, A.deck]], [1.5, 1.5, 0, 0]), -U.half, U.half, -0.8);
    s = chamferJoin(s, cylZ(0, 1, 15.5, 178, 189, -0.6), 0.8);
    s = chamferJoin(s, sideX(round2([[52, 2], [68, 2], [68, 9], [61, 17], [52, 17]], [0, 1, 2, 2, 1]), 12, 18.5, -0.8), 0.8);
    s = cutChamfer(s, box(-15, 3, 20, -12.6, 15, 172), 0.8);
    s = cutChamfer(s, box(4, P.y0, P.u0, 16, P.y1, P.u1), 0.5);
    s = cut(s, box(-4.6, 14.6, -1, 4.6, 23, 44));
    if (hi) s = cut(s, cylX(16.5, 186, 1.2, -14.5, -12.8)); // a witness hole on the left of the barrel-nut seat
    add('upper', BONE.root, MAT.anod, s, 1.4);
    add('upper rail', BONE.root, MAT.anod, rail(-1, U.u1, hi), 1.6);
    // Ejection port door, open (hanging from its hinge rod under the port), and the hinge rod.
    add('port door', BONE.root, MAT.anod, union(box(13.3, -24.5, 72, 14.7, -8.6, 134, -0.3), cylZ(14.2, -8.2, 1.15, 66, 140, -0.3)), 0.4);
  }
  // Bolt carrier, seen through the port (bolt bone).
  {
    let s = cylZ(0, 1, 8.6, 30, 152, -0.6);
    s = cut(s, box(6.5, -3, 60, 10, 5, 150));
    s = union(s, cylZ(0, 1, 6.6, 152, 166, -0.4), cylX(9, 120, 2.9, 4, 9.3, -0.3));
    add('bolt carrier', BONE.bolt, MAT.steel, s, 0.6);
  }
  // Charging handle: a T behind the deck with latches on both wings (handle bone).
  {
    let s = topY(round2([[-23, -13], [23, -13], [24.5, -9], [21, -4.5], [4.3, -4], [4.3, 44], [-4.3, 44], [-4.3, -4], [-21, -4.5], [-24.5, -9]], [3, 3, 2, 1, 0, 0, 0, 0, 1, 2]), 15.3, 21.6, -0.7);
    let latch = topY(round2([[-25.5, -16], [-14, -15], [-12.5, -6], [-22, -5], [-26.5, -10]], 1.6), 16.0, 23.4, -0.6);
    if (hi) latch = relief(latch, (x, y, z) => (y > 22.8 ? ridgesU(1.1, 0.22)(x, y, z) : 0), 0.3);
    s = union(s, mirrorX(latch));
    add('charging handle', BONE.handle, MAT.anod, s, 1.5);
  }
  // Lower receiver: flared magazine well, trigger guard, bolt catch, selector, takedown pins, magazine release.
  {
    let s = sideX(round2([[L.u0, -13], [L.u1, -13], [L.u1, -20], [176, -27], [104, -28], [14, -28], [0, -24], [L.u0, -19]], [0, 0, 2, 3, 0, 2, 3, 2]), -L.half, L.half, -0.7);
    const well = sideX(round2([[W.u0, -13], [W.u1, -13], [W.u1, -55], [W.u1 + 3, W.mouth], [W.u0 - 2, W.mouth], [W.u0, -55]], [0, 0, 2, 1, 1, 2]), -W.half, W.half, -0.8);
    s = union(s, well);
    s = union(s, sideX(round2([[W.u0 - 4, -56.5], [W.u1 + 5, -56.5], [W.u1 + 5, W.mouth], [W.u0 - 4, W.mouth]], 1.5), -W.half - 1, W.half + 1, -0.9));
    const mid = (W.u0 + W.u1) / 2;
    s = cutChamfer(s, box(-W.open[0] / 2, W.mouth - 8, mid - W.open[1] / 2, W.open[0] / 2, -8, mid + W.open[1] / 2), 2.6);
    // Trigger guard loop.
    const guardOut = round2([[106, -27], [106, -43], [98, -52], [54, -52], [47, -44], [47, -27]], [0, 3, 3, 3, 3, 0]);
    const guardIn = round2([[100.5, -26], [100.5, -41.5], [95, -47], [57, -47], [52.5, -41.5], [52.5, -26]], [0, 3, 2.5, 2.5, 3, 0]);
    s = fillet(s, cut(sideX(guardOut, -5.5, 5.5, 1.4), sideX(guardIn, -7, 7, 0)), 1.5);
    // Takedown and pivot pins (both sides), magazine release and its fence (right), selector and bolt catch (left).
    for (const pu of [4, 181]) {
      let pin = union(cylX(-17.5, pu, 4.4, -13.4, 13.4, -0.4));
      if (hi) pin = cut(pin, cylX(-17.5, pu, 1.3, -15, -12.6));
      s = union(s, pin);
    }
    s = chamferJoin(s, sideX(round2([[89, -28], [100, -28], [100, -14.5], [89, -14.5]], 2), W.half - 4, W.half - 1.8, -0.6), 0.6); // release fence
    s = union(s, latheX([[0, 0], [5, 0], [5, 2.4], [4.4, 3], [0, 3]], -21.5, 94.5, L.half, 1));
    add('lower', BONE.root, MAT.anod, s, 1.1);
    // Selector: a lever on a boss, pointing forward (fire), serrated thumb pad.
    let sel = union(latheX([[0, 0], [6.2, 0], [6.2, 1.8], [5.4, 2.6], [0, 2.6]], -19, 30, -L.half, -1), sideX(round2([[29, -22.5], [50, -16.5], [53, -18], [52, -21], [31, -25.5]], [2, 2, 2, 2, 2]), -L.half - 3.4, -L.half - 1.2, -0.5));
    if (hi) sel = relief(sel, (x, y, z) => (-z > 42 && x < -L.half - 3.2 ? ridgesU(1.0, 0.2)(x, y, z) : 0), 0.3);
    add('selector', BONE.root, MAT.steel, sel, 0.9);
    let bc = sideX(round2([[84, -14.5], [99, -14.5], [100, -19], [93, -26], [86, -25]], 1.8), -L.half - 2.6, -L.half + 0.5, -0.5);
    if (hi) bc = relief(bc, (x, y, z) => (y < -20 && x < -L.half - 2.3 ? ridgesU(0.9, 0.2)(x, y, z) : 0), 0.3);
    add('bolt catch', BONE.root, MAT.anod, bc, 0.7);
  }
  // Trigger (trigger bone).
  add('trigger', BONE.trigger, MAT.steel, sideX(round2([[78.5, -26], [83, -26], [82, -35], [79, -42], [74, -47.5], [72.5, -46], [76, -40], [78, -34]], [0, 0, 2, 3, 1.2, 1.2, 3, 2]), -2.7, 2.7, 0.7), 0.4);
  // Pistol grip: raked, a beavertail, a finger swell, stippled side panels and a base cap.
  add('grip', BONE.root, furn, pistolGrip(A.grip.pivot, A.grip.rake, A.grip.width, hi), 0.9);
  // Receiver extension, lock nut and end plate with a sling socket; the stock with cheek rest and butt pad.
  {
    const S = A.stock;
    let tube = union(cylZ(0, S.tubeY, S.tubeR, -236, -2, -0.8), box(-3.8, S.tubeY + 10, -230, 3.8, S.tubeY + 16.6, -12, -0.5));
    tube = cut(tube, repeatU(box(-2.2, S.tubeY - 16, -226, 2.2, S.tubeY - 12.4, -222.5, -0.3), 11, 6));
    add('buffer tube', BONE.root, MAT.anod, tube, 0.3);
    add('lock nut', BONE.root, MAT.steel, union(lathe([[S.tubeR - 1, -13], [17.2, -13], [17.8, -12], [17.8, -5], [17.2, -4], [S.tubeR - 1, -4]], 0, S.tubeY)), 0.4);
    let plate = alongZ(round2([[-14.5, -21], [14.5, -21], [14.5, 15], [-14.5, 15]], 4), -4, -1, -0.5);
    plate = union(plate, cut(cylX(-9, -2.5, 5.6, -20.5, -13, -0.5), cylX(-9, -2.5, 3.1, -22, -17)));
    add('end plate', BONE.root, MAT.anod, plate, 0.4);
    // An adjustable carbine stock: a blunt collar round the tube, a raised cheek surface, an open lower frame, a latch
    // lever under the tube, a sling slot at the toe; rounded everywhere, nothing pointed.
    let stock = sideX(round2([[-95, -19], [-95, 16], [-104, 23], [-240, 25], [-249, 20], [-249, -84], [-239, -88], [-214, -72], [-152, -32], [-112, -22]], [6, 6, 10, 6, 3, 3, 6, 18, 18, 8]), -16.5, 16.5, 6);
    stock = inter(stock, topY(round2([[-14, -92], [14, -92], [16.5, -140], [16.5, -252], [-16.5, -252], [-16.5, -140]], [3, 3, 30, 0, 0, 30]), -100, 40));
    stock = fillet(stock, sideX(round2([[-128, 22], [-226, 24], [-226, 29.5], [-138, 27.5]], 3), -14, 14, 3.5), 2.5);
    // A shallow recessed panel each side instead of a through window (a window left pointed struts).
    stock = cutRound(stock, mirrorX(sideX(round2([[-150, -22], [-214, -22], [-230, -48], [-230, -66], [-214, -64], [-162, -34]], 7), 14.6, 25)), 1.5);
    stock = cutRound(stock, sideX(stadiumB(-238, -50, 22, 6), -25, 25), 1.2);
    // A round collar where the stock rides on the tube.
    stock = fillet(stock, cylZ(0, S.tubeY, 20, -132, -94, 4), 3);
    stock = cutRound(stock, cylZ(0, S.tubeY, S.tubeR + 0.4, -250, -60), 0.8);
    stock = union(stock, sideX(round2([[-100, -19], [-127, -23], [-129, -28.5], [-102, -25]], 2), -4.5, 4.5, 1.4));
    const sd = A.stock.butt - AR5.stock.butt; // a collapsed stock slides forward on the tube
    add('stock', BONE.root, furn, move(stock, 0, 0, sd), 0.35);
    let pad = sideX(round2([[-246, 21], [-262, 22], [-263, -82], [-246, -82]], [3, 5, 5, 3]), -21, 21, 5);
    if (hi) pad = relief(pad, (_x, y, z) => (-z < -254 ? -0.35 * Math.max(0, Math.sin(y * Math.PI / 4)) : 0), 0.4);
    add('butt pad', BONE.root, MAT.rubber, move(pad, 0, 0, A.stock.butt - AR5.stock.butt), 0.25);
  }
  // Handguard: an octagonal tube 44 mm across with rounded-end slots on the sides and bottom, a sling socket, and an
  // integral top rail continuous with the receiver's.
  {
    const sec = round2([[-10, H.bottom], [10, H.bottom], [H.half, -9], [H.half, 10], [15, A.deck], [-15, A.deck], [-H.half, 10], [-H.half, -9]], 3);
    let s = alongZ(sec, H.u0, H.u1, -1.1);
    s = cut(s, alongZ(sec, H.u0 + 7, H.u1 + 2, 0, 2.6));
    const first = 232;
    const side = repeatU(mirrorX(sideX(stadium2(first, 0.5, H.slot[0], H.slot[1]), 15, 26)), H.slotPitch, H.slots);
    const bottom = repeatU(topY(stadiumB(0, first + 20, H.slot[0] - 6, H.slot[1]), H.bottom - 3, H.bottom + 5), H.slotPitch, H.slots - 1);
    s = hi ? cutChamfer(cutChamfer(s, side, 0.7), bottom, 0.7) : cut(s, side, bottom);
    // Angled lower faces get one long vent each.
    const vent = rotZ(sideX(stadium2(330, 0, 120, 6), 13, 30), -0.785, 0, 0);
    s = cut(s, vent, mirrorX(vent));
    s = union(s, cut(cylX(-2, 206, 6.2, -H.half - 3.6, -H.half + 1, -0.5), cylX(-2, 206, 3.3, -H.half - 5, -H.half - 1)));
    // Index ring at the rear.
    s = union(s, alongZ(round2([[-10.5, H.bottom - 1], [10.5, H.bottom - 1], [H.half + 1, -9.5], [H.half + 1, 10], [15.5, A.deck], [-15.5, A.deck], [-H.half - 1, 10], [-H.half - 1, -9.5]], 3), H.u0, H.u0 + 7, -0.8));
    add('handguard', BONE.root, MAT.cerakote, s, 1.2);
    add('handguard rail', BONE.root, MAT.cerakote, rail(H.u0 + 0.5, H.u1, hi), 1.3);
  }
  // Barrel, nut, muzzle device with three ports and wrench flats.
  {
    add('barrel', BONE.root, MAT.steel, union(cylZ(0, 0, A.barrel.r, 186, A.barrel.muzzle, -0.5), lathe([[A.barrel.r, 182], [16.4, 182], [16.8, 183], [16.8, 189], [16.4, 190], [A.barrel.r, 190]])), 0.5);
    const M = A.muzzle;
    let s = lathe([[2.9, M.u0], [M.r - 0.6, M.u0], [M.r, M.u0 + 1.2], [M.r, M.u1 - 4], [M.r - 1.6, M.u1], [2.9, M.u1]]);
    const slot = topY(stadiumB(0, M.u0 + 27, Math.min(26, M.u1 - M.u0 - 22), 4.6), 2, 14);
    s = hi ? cutChamfer(s, slot, 0.5) : cut(s, slot);
    s = cut(s, rotZ(slot, 1.05), rotZ(slot, -1.05));
    s = cut(s, box(9.6, -12, M.u0 - 1, 14, 12, M.u0 + 9), box(-14, -12, M.u0 - 1, -9.6, 12, M.u0 + 9));
    add('muzzle device', BONE.root, MAT.steel, s, 0.6);
  }
  if (A.scope) {
    // Variable scope: a 30 mm tube with an ocular bell (eyepiece and knurled power ring) at the rear, an objective
    // bell at the front, a turret saddle with elevation (top) and windage (right) caps and an illumination knob
    // (left), on two tall rings clamped to the rail.
    const Sc = A.scope, cy = A.sightH, R = Sc.r, oc = Sc.ocular, ob = Sc.objective, u0 = Sc.u0, u1 = Sc.u1, tu = Sc.turret;
    let tube = lathe([[Sc.bore, u0], [oc - 1, u0], [oc, u0 + 1.5], [oc, u0 + 34], [oc - 1.5, u0 + 36], [oc - 1.5, u0 + 58], [oc - 3, u0 + 60], [R, u0 + 78],
      [R, u1 - 92], [R + 1.5, u1 - 80], [ob - 0.5, u1 - 44], [ob, u1 - 40], [ob, u1 - 2], [ob - 1, u1], [Sc.bore + 2, u1], [Sc.bore, u1 - 6]], 0, cy);
    if (hi) tube = relief(tube, (x, y, z) => (-z > u0 + 38 && -z < u0 + 56 ? -0.3 * Math.max(0, Math.cos(Math.atan2(y - cy, x) * 30)) : 0), 0.35);
    let saddle = box(-R - 3, cy - R + 2, tu - 22, R + 3, cy + R + 3, tu + 22, 5);
    saddle = union(saddle, latheY([[0, 0], [10, 0], [10, 3], [9, 4], [0, 4]], 0, tu, cy + R + 2));
    let capY = latheY([[0, 0], [9.2, 0], [9.2, 11], [8.4, 12], [0, 12]], 0, tu, cy + R + 6);
    let capX = latheX([[0, 0], [9.2, 0], [9.2, 10], [8.4, 11], [0, 11]], cy, tu, R + 4, 1);
    let knob = latheX([[0, 0], [10, 0], [10, 8], [9.2, 9], [0, 9]], cy, tu, -(R + 4), -1);
    if (hi) { capY = relief(capY, (x, y, z) => (y > cy + R + 8 ? knurlY(0, tu, 1.0, 0.2)(x, y, z) : 0), 0.25); knob = relief(knob, (x, y, z) => (x < -(R + 6) ? -0.25 * Math.max(0, Math.cos(Math.atan2(y - cy, -z - tu) * 20)) : 0), 0.3); }
    saddle = union(saddle, latheX([[0, 0], [10, 0], [10, 3], [0, 3]], cy, tu, R + 2, 1), latheX([[0, 0], [10, 0], [10, 3], [0, 3]], cy, tu, -(R + 2), -1));
    tube = union(fillet(tube, saddle, 2), capY, capX, knob);
    add('scope', BONE.root, MAT.scope, tube, 4);
    // Coated lenses seen at the hip: dark glass a little inside each end, not a hollow ring.
    add('scope lenses', BONE.root, MAT.glass, union(cylZ(0, cy, Sc.bore + 0.3, u0 + 5, u0 + 6.5), cylZ(0, cy, Sc.bore + 0.3, u1 - 9, u1 - 7.5)), 1);
    const rings = Sc.rings.map(ru => {
      let ring = cylZ(0, cy, R + 3.2, ru, ru + 13, -0.6);
      ring = cut(ring, box(-40, cy - 0.3, ru - 1, 40, cy + 0.3, ru + 14));
      let base = box(-9, A.railTop, ru - 1, 9, cy - R + 1, ru + 14, -0.8);
      base = union(base, mirrorX(box(9.4, A.railTop - 5.6, ru, 12.6, A.railTop + 1, ru + 13, -0.5)), latheX([[0, 0], [5, 0], [5, 3.6], [4.4, 4.2], [0, 4.2]], A.railTop - 2.4, ru + 6.5, 12.2, 1));
      ring = fillet(ring, base, 2);
      for (const sx of [1, -1] as const) ring = union(ring, screwX(cy + 5, ru + 6.5, sx * (R + 2.6), sx, 2, 1.4, hi));
      return ring;
    });
    let mount = union(...rings);
    mount = cut(mount, cylZ(0, cy, R + 0.05, u0, u1));
    add('scope rings', BONE.root, MAT.scope, mount, 2);
  } else if (A.reflex) {
    // Open reflex sight: a low base on the rail and a single thin window frame, tilted back a little, with a hood over
    // the top edge and an adjustment screw on the right.
    const Rf = A.reflex, cy = A.sightH, [ww, wh] = Rf.window, fu = Rf.u1 - 6;
    let base = box(-11, A.railTop, Rf.u0, 11, A.railTop + 7, Rf.u1, -0.8);
    base = union(base, mirrorX(box(9.4, A.railTop - 5.6, Rf.u0 + 3, 12.6, A.railTop + 1, Rf.u1 - 3, -0.5)));
    let frame = box(-ww / 2 - 2.6, A.railTop + 4, fu - 2, ww / 2 + 2.6, cy + wh / 2 + 2.6, fu + 2, 1.2);
    frame = cutRound(frame, box(-ww / 2, cy - wh / 2, fu - 5, ww / 2, cy + wh / 2, fu + 5), 1.5);
    frame = rotX(frame, -0.12, A.railTop + 4, fu);
    base = union(base, frame, screwX(A.railTop + 3.5, (Rf.u0 + Rf.u1) / 2, 11, 1, 2.6, 1.6, hi), screwX(A.railTop + 3.5, (Rf.u0 + Rf.u1) / 2, -11, -1, 3.6, 1.6, hi));
    add('reflex sight', BONE.root, MAT.anod, base, 3);
  } else if (A.holo) {
    // Holographic sight: a squared housing with a wide rectangular window, a hood over it, buttons on the rear face,
    // a battery cap on the right, a clamp lever on the left; the reticle (ring and dot) floats in the window.
    const Hs = A.holo, cy = A.sightH, [ww, wh] = Hs.window;
    let body = box(-Hs.half, A.railTop, Hs.u0, Hs.half, Hs.top, Hs.u1, 3);
    body = cutRound(body, box(-ww / 2, cy - wh / 2, Hs.u0 - 5, ww / 2, cy + wh / 2, Hs.u1 + 5), 2.2);
    body = cutRound(body, box(-Hs.half - 2, A.railTop + 3, Hs.u0 + 14, Hs.half + 2, cy - wh / 2 - 3, Hs.u1 - 10), 1.5);
    body = union(body, box(-Hs.half + 3, A.railTop + 3, Hs.u0 + 14, Hs.half - 3, cy - wh / 2 - 3, Hs.u1 - 10, 1));
    for (const bx of [-6, 0, 6]) body = union(body, box(bx - 2.2, A.railTop + 5, Hs.u0 - 1.4, bx + 2.2, A.railTop + 9, Hs.u0 + 1, 0.8));
    body = union(body, latheX([[0, 0], [6.5, 0], [6.5, 7], [5.8, 8], [0, 8]], A.railTop + 12, (Hs.u0 + Hs.u1) / 2 + 12, Hs.half - 1, 1));
    let lever = sideX(round2([[Hs.u0 + 20, A.railTop - 2], [Hs.u0 + 50, A.railTop - 2], [Hs.u0 + 52, A.railTop + 6], [Hs.u0 + 20, A.railTop + 5]], 2), -Hs.half - 3, -Hs.half + 0.5, -0.5);
    if (hi) lever = relief(lever, (x, y, z) => (x < -Hs.half - 2.6 ? ridgesU(1.1, 0.2)(x, y, z) : 0), 0.3);
    body = union(body, lever, mirrorX(box(9.4, A.railTop - 5.6, Hs.u0 + 6, 12.6, A.railTop + 1, Hs.u1 - 6, -0.5)));
    if (hi) body = cut(body, latheX([[0, -1], [2.4, -1], [2.4, 0.5], [0, 0.5]], A.railTop + 12, (Hs.u0 + Hs.u1) / 2 + 12, Hs.half + 7, 1));
    add('holo sight', BONE.root, MAT.anod, body, 3);
  } else {
  // Red-dot sight: a compact 22 mm window in a 26 mm body with thin-rimmed lens hoods, elevation and windage caps, a
  // battery and brightness knob on the left, on a low single-piece riser with two rings, clamp screws and a cross bolt.
  {
    const O = A.optic, cy = A.sightH, tu = (O.u0 + O.u1) / 2, R = O.r, L = O.u1 - O.u0;
    let tube = lathe([[O.bore, O.u0], [R + 0.5, O.u0], [R + 0.9, O.u0 + 0.8], [R + 0.9, O.u0 + 5], [R - 0.3, O.u0 + 6.2], [R - 0.3, O.u1 - 6.2], [R + 0.9, O.u1 - 5], [R + 0.9, O.u1 - 0.8], [R + 0.5, O.u1], [O.bore, O.u1]], 0, cy);
    const turret = (axis: 'y' | 'x', sx: 1 | -1) => {
      const base: [number, number][] = [[0, 0], [7.6, 0], [7.6, 3], [7, 3.6], [0, 3.6]], cap: [number, number][] = [[0, 0], [6.3, 0], [6.3, 5.2], [5.8, 5.8], [0, 5.8]];
      return axis === 'y' ? [latheY(base, 0, tu, cy + R - 1.5), latheY(cap, 0, tu, cy + R + 1.9)] : [latheX(base, cy, tu, sx * (R - 1.5), sx), latheX(cap, cy, tu, sx * (R + 1.9), sx)];
    };
    const [tY, capY0] = turret('y', 1), [tX, capX] = turret('x', 1);
    let capY = capY0;
    if (hi) capY = relief(capY, (x, y, z) => (y < cy + R + 7.2 && y > cy + R + 2.4 ? knurlY(0, tu, 0.9, 0.18)(x, y, z) : 0), 0.25);
    tube = union(fillet(tube, tY, 1.2), capY);
    tube = union(fillet(tube, tX, 1.2), capX);
    // Battery cap and brightness knob on the left, toward the eye.
    let knob = latheX([[0, 0], [6.2, 0], [6.2, 6.4], [5.6, 7.1], [0, 7.1]], cy, tu - 3, -(R - 1.5), -1);
    if (hi) knob = relief(knob, (x, y, z) => (x < -(R + 1.2) ? -0.2 * Math.max(0, Math.cos(Math.atan2(y - cy, -z - (tu - 3)) * 14)) : 0), 0.25);
    tube = fillet(tube, knob, 1.1);
    if (hi) tube = cut(tube, latheX([[0, -1], [2.2, -1], [2.2, 0.6], [0, 0.6]], cy, tu - 3, -(R - 1.5) - 7.1, -1));
    if (hi) tube = cut(tube, cylZ(0, cy, R + 2, O.u0 + 2.6, O.u0 + 3), cylZ(0, cy, R + 2, O.u1 - 3, O.u1 - 2.6));
    add('optic', BONE.root, MAT.anod, tube, 4);
    // Low riser and rings.
    const ringR = R + 2.2, r0 = O.u0 + 6.5, r1 = O.u1 - 14.5;
    let mount = box(-11.4, A.railTop, O.u0 + 4, 11.4, cy - ringR + 3, O.u1 - 4, -0.9);
    if (hi) mount = cutChamfer(mount, mirrorX(box(10.4, A.railTop + 3, O.u0 + 10, 14, A.railTop + 7.5, O.u1 - 10)), 0.5);
    mount = chamferJoin(mount, mirrorX(box(9.4, A.railTop - 5.6, O.u0 + 6, 12.6, A.railTop + 1, O.u1 - 6, -0.5)), 0.4);
    for (const ru of [r0, r1]) {
      let ring = cylZ(0, cy, ringR, ru, ru + 8, -0.6);
      ring = cut(ring, box(-30, cy - 0.3, ru - 1, 30, cy + 0.3, ru + 9));
      mount = fillet(mount, ring, 1.6);
      for (const sx of [1, -1] as const) mount = union(mount, screwX(cy + 4.2, ru + 4, sx * (ringR - 1), sx, 1.9, 1.4, hi));
    }
    mount = cut(mount, cylZ(0, cy, R + 0.05, O.u0, O.u1));
    mount = union(mount, latheX([[0, 0], [5.6, 0], [5.6, 4], [5, 4.7], [0, 4.7]], A.railTop - 2.4, tu, 12.2, 1), screwX(A.railTop - 2.4, tu, -12.2, -1, 3.8, 1.4, hi));
    add('optic mount', BONE.root, MAT.anod, mount, 2.4);
    void L;
  }
  }
  // Back-up sights, folded flat on the rail: the aperture at the rear, the post at the front.
  {
    let rear = box(-10.8, A.railTop - 3, 2, 10.8, A.railTop + 7, 30, -0.7);
    rear = chamferJoin(rear, box(-8.4, A.railTop + 6, 5, 8.4, A.railTop + 9.6, 28.5, -0.6), 0.4);
    if (hi) rear = cut(rear, cylY(0, 12, 1.4, A.railTop + 8, A.railTop + 11), cylX(A.railTop + 3, 26, 1.2, -12, 12));
    rear = union(rear, latheX([[0, 0], [3.4, 0], [3.4, 2], [2.8, 2.6], [0, 2.6]], A.railTop + 2, 16, 10.8, 1));
    add('rear sight', BONE.root, MAT.anod, rear, 1.2);
    const fu = A.handguard.u1;
    let front = box(-10.8, A.railTop - 3, fu - 30, 10.8, A.railTop + 3.5, fu - 2, -0.7);
    front = chamferJoin(front, box(-7, A.railTop + 3, fu - 28, 7, A.railTop + 5, fu - 4, -0.6), 0.4);
    if (hi) front = cut(front, cylX(A.railTop + 1, fu - 26, 1.2, -12, 12));
    add('front sight', BONE.root, MAT.anod, front, 0.7);
  }
  // Magazine: curved (rifle) or straight (submachine gun), polymer body with ribs low on the sides, a wider floorplate,
  // and the top round (mag bone). Front and rear faces follow the well.
  {
    const M = A.mag, n = 12, top = -12, len = M.length - 10, F = A.well.u1 - 5.4, Rr = A.well.u0 + 5, bendMax = A.magBend ?? 34;
    const bendAt = (t: number) => bendMax * Math.pow(t, 1.7);
    const fr: [number, number][] = [], rr: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = top - len * t, bend = bendAt(t);
      fr.push([F + bend, y]); rr.push([Rr + bend * 0.9 + 1.6 * t, y]);
    }
    let body = sideX(round2([...fr, ...rr.reverse()], [0, ...Array(n - 1).fill(0), 3, 3, ...Array(n - 1).fill(0), 0]), -M.width / 2, M.width / 2, 1.6);
    // Ribs: raised bands across the lower side panels.
    for (const t of [0.56, 0.66, 0.76]) {
      const y = top - len * t, b0 = bendAt(t);
      body = fillet(body, sideX(round2([[Rr + 2 + b0 * 0.9, y + 1.6], [F - 1.6 + b0, y + 1.6], [F - 1.6 + b0, y - 1.6], [Rr + 2 + b0 * 0.9, y - 1.6]], 1.2), -M.width / 2 - 0.9, M.width / 2 + 0.9, 0.8), 0.8);
    }
    const yb = top - len, bb = bendMax;
    const floor = sideX(round2([[Rr - 2 + bb * 0.9, yb + 5], [F + 3.4 + bb, yb + 5], [F + 5.4 + bb, yb - 2], [F + 1.4 + bb, yb - 6], [Rr - 3 + bb * 0.9, yb - 6]], [1, 2, 2, 2, 2]), -M.width / 2 - 2, M.width / 2 + 2, -1);
    body = union(body, floor);
    if (hi) body = relief(body, (x, y, z) => (Math.abs(x) > M.width / 2 - 0.4 && y < top - 20 && y > top - 85 ? stipple(x, y, z) * 0.6 : 0), 0.3);
    add('magazine', BONE.mag, MAT.polymerFde, body, 0.9);
    const rr0 = Rr + 6, rr1 = Rr + 6 + (F - Rr) * 0.6, rad = M.width < 21 ? 4.4 : 4.7;
    add('top round', BONE.mag, MAT.brass, union(cylZ(-2.8, top + 3.6, rad, rr0, rr1, -0.4), lathe([[0, rr1], [rad - 0.4, rr1], [rad - 1.3, rr1 + 8], [1.6, rr1 + 14], [0, rr1 + 15]], -2.8, top + 3.6)), 0.15);
  }
  // Spent cases for the ejection effect: one per case bone, at the port (the bone's offset is the flight).
  for (let i = 0; i < 3; i++) add(`case ${i}`, 6 + i, MAT.brass, union(lathe([[0, 82], [4.8, 82], [4.8, 116], [3.2, 122], [3.0, 127], [0, 127]], 16, 1)), 0.5);
  return parts;
}
