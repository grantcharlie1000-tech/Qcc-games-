/** The P-11 sidearm as a high-detail signed-distance sculpt (offline only). Every dimension comes from `SIDEARM` in
 * designs.ts. Moving parts: the slide and the barrel hood seen in the port (bolt bone), the trigger, the magazine. */
import { SIDEARM } from './designs';
import { box, cut, cutChamfer, inter, lathe, mirrorX, move, relief, repeatU, rotX, round2, sideX, alongZ, union, fillet, type Shape } from './sdf';
import { MAT, pistolGrip, ridgesU, type Part } from './kit';

const BONE = { root: 0, mag: 1, bolt: 2, trigger: 3 } as const;

export function pistolParts(hi: boolean): Part[] {
  const D = SIDEARM, S = D.slide, F = D.frame, sh = D.sightH, parts: Part[] = [];
  const add = (name: string, bone: number, mat: number, s: Shape, weight = 1) => parts.push({ name, bone, mat, s, weight });

  // Slide: flat sides, a bevelled top, rear and front serrations, the ejection port on the right, sights on top.
  {
    let s = sideX(round2([[S.u0, S.bottom], [S.u1, S.bottom], [S.u1, S.top - 5], [S.u1 - 6, S.top], [S.u0 + 3, S.top], [S.u0, S.top - 3]], [1, 1, 2, 2, 1.5, 1]), -S.half, S.half, 1);
    s = inter(s, alongZ(round2([[-S.half, S.bottom - 1], [S.half, S.bottom - 1], [S.half, S.top - 5], [S.half - 4, S.top], [-(S.half - 4), S.top], [-S.half, S.top - 5]], 1.2), S.u0 - 1, S.u1 + 1));
    const groove = mirrorX(box(S.half - 0.9, S.bottom + 2, 0, S.half + 2, S.top - 4, 1.4));
    s = cut(s, move(repeatU(groove, 3.2, 9), 0, 0, 7), move(repeatU(groove, 3.2, 6), 0, 0, 142));
    s = cutChamfer(s, box(3, 5, D.port.u0, S.half + 2, S.top + 2, D.port.u1), 0.6);
    s = cut(s, lathe([[0, S.u1 - 4], [D.barrel.r + 0.3, S.u1 - 4], [D.barrel.r + 0.3, S.u1 + 2], [0, S.u1 + 2]], 0, 0));
    // Rear sight: a block with a square notch; front post. The sight line runs level over the rear sight's top and the
    // post's top, so the post sits in the notch with light either side.
    let rear = box(-8.5, S.top - 1, 3, 8.5, sh, 12, 0.8);
    rear = cut(rear, box(-2, sh - 3.5, 2, 2, sh + 2, 13));
    s = union(s, rear, box(-1.7, S.top - 1, S.u1 - 13, 1.7, sh, S.u1 - 7, 0.4));
    if (hi) s = relief(s, (x, y, z) => (y > sh - 0.2 && -z < 13 ? ridgesU(0.8, 0.15)(x, y, z) : 0), 0.2); // serrated rear face top
    add('slide', BONE.bolt, MAT.steel, s, 2);
    // Barrel hood seen in the port, moving with the slide.
    add('barrel hood', BONE.bolt, MAT.brass, box(-6.6, -4, D.port.u0 - 4, 6.6, 11.5, D.port.u1 + 2, 1.2), 0.5);
  }
  // Barrel crown at the muzzle.
  add('barrel', BONE.root, MAT.steel, lathe([[D.barrel.bore, S.u1 - 8], [D.barrel.r, S.u1 - 8], [D.barrel.r, S.u1 + 1], [D.barrel.r - 0.6, S.u1 + 1.6], [D.barrel.bore, S.u1 + 1.6]], 0, 0), 0.6);
  // Frame: dust cover with three rail slots, an undercut square trigger guard, the slide stop and takedown lever.
  {
    let s = sideX(round2([[F.u0, S.bottom + 0.5], [F.u1, S.bottom + 0.5], [F.u1, F.bottom + 3], [F.u1 - 5, F.bottom], [D.guard.u1, F.bottom], [D.guard.u0, F.bottom], [F.u0 + 4, F.bottom + 3], [F.u0, F.bottom + 8]], [0, 0, 2, 3, 2, 2, 4, 3]), -F.half, F.half, 1.2);
    s = cut(s, repeatU(box(-F.half - 2, F.bottom - 1, F.u1 - 50, F.half + 2, F.bottom + 2.6, F.u1 - 46), 11, 3));
    const G = D.guard;
    const out = round2([[G.u1, F.bottom + 1], [G.u1, F.bottom - 12], [G.u1 - 4, G.low], [G.u0 + 8, G.low], [G.u0, F.bottom - 18], [G.u0, F.bottom + 1]], [0, 2, 2, 4, 8, 0]);
    const inn = round2([[G.u1 - 5, F.bottom + 2], [G.u1 - 5, F.bottom - 10], [G.u1 - 7, G.low + 5], [G.u0 + 10, G.low + 5], [G.u0 + 4, F.bottom - 14], [G.u0 + 4, F.bottom + 2]], [0, 2, 2, 3, 6, 0]);
    s = fillet(s, cut(sideX(out, -5.2, 5.2, 1.2), sideX(inn, -7, 7, 0)), 1.5);
    add('frame', BONE.root, MAT.polymer, s, 1.4);
    add('grip', BONE.root, MAT.polymer, pistolGrip(D.grip.pivot, D.grip.rake, D.grip.width, hi), 1.2);
    let stop = sideX(round2([[58, S.bottom - 0.5], [86, S.bottom - 0.5], [89, S.bottom - 4], [62, S.bottom - 5.5]], 1.2), -F.half - 2, -F.half + 0.4, -0.3);
    if (hi) stop = relief(stop, (x, y, z) => (x < -F.half - 1.6 && -z > 80 ? ridgesU(0.9, 0.18)(x, y, z) : 0), 0.25);
    add('slide stop', BONE.root, MAT.steel, stop, 0.8);
    add('takedown', BONE.root, MAT.steel, mirrorX(box(F.half - 0.4, S.bottom - 6, 96, F.half + 1.4, S.bottom - 2, 106, 0.5)), 0.5);
    add('mag release', BONE.root, MAT.polymer, box(-F.half - 1.6, F.bottom - 6, G.u0 - 6, -F.half + 1, F.bottom + 1, G.u0 + 1, 1), 0.5);
  }
  // Trigger, with a safety blade.
  {
    let t = sideX(round2([[62, -22], [67, -22], [66.5, -31], [63.5, -38], [59, -42], [57.5, -40.5], [61, -33], [62, -27]], [0, 0, 2, 3, 1.2, 1.2, 3, 2]), -3, 3, 0.6);
    t = cut(t, box(-0.5, -40, 55, 0.5, -28, 64));
    t = union(t, sideX(round2([[61.5, -29], [63.5, -29], [62.5, -38], [60.5, -38]], 0.5), -0.45, 0.45, 0.2));
    add('trigger', BONE.trigger, MAT.dark, t, 0.4);
  }
  // Magazine: a steel body inside the grip with a polymer baseplate below it, both raked with the grip.
  {
    const [pu, py] = D.grip.pivot, rake = D.grip.rake;
    const body = sideX(round2([[6, -6], [36, -6], [36, -100], [6, -100]], 2), -D.mag.width / 2, D.mag.width / 2, 1);
    const plate = sideX(round2([[2, -103], [43, -103], [44, -107], [41, -112], [4, -112], [1, -107]], [1, 1, 1.5, 2, 2, 1.5]), -13.5, 13.5, 1.2);
    add('magazine', BONE.mag, MAT.steel, move(rotX(body, -rake, 0, 0), 0, py, pu), 0.3);
    add('mag plate', BONE.mag, MAT.polymer, move(rotX(plate, -rake, 0, 0), 0, py, pu), 0.6);
  }
  // A spent case for the ejection effect on each case bone, at the port.
  for (let i = 0; i < 3; i++) add(`case ${i}`, 6 + i, MAT.brass, lathe([[0, 60], [4.8, 60], [4.8, 79], [0, 79]], 4, 4), 0.5);
  return parts;
}
