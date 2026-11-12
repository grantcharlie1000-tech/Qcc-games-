/** Design parameters for the weapons rebuilt from signed-distance sculpts (second build). Millimetres, bore on Y = 0,
 * u = distance forward of the upper receiver's rear face. The sculpt (`ar5.ts`, offline only), the design sheet and
 * the run-time sockets all read these numbers, so the drawing, the model and the hand placements cannot disagree.
 * Breachline's own designs; sizes follow published dimensions of real rifles of the class. */
import type { WeaponSockets } from '../weapons';

export const AR5 = {
  name: 'Marrow AR-5',
  /** Red-dot centre above the bore: the sight line. */
  sightH: 58,
  railTop: 30, deck: 22, railHalf: 10.6, slotW: 5.2, slotPitch: 10, slotDepth: 3,
  upper: { u0: 0, u1: 188, half: 13.5, bottom: -13 },
  lower: { u0: -3, u1: 186, half: 12.4 },
  well: { u0: 101, u1: 174, half: 15.4, mouth: -63, open: [23.4, 65.8] as const },
  port: { u0: 70, u1: 136, y0: -7, y1: 9 },
  handguard: { u0: 190, u1: 520, half: 22, bottom: -21, slot: [30, 7.2] as const, slotPitch: 40, slots: 7 },
  barrel: { r: 8.2, muzzle: 558 },
  muzzle: { u0: 556, u1: 612, r: 11 },
  grip: { pivot: [16, -28] as const, rake: 0.33, length: 102, width: 26 },
  mag: { width: 22.6, depth: 62, length: 182, seat: [137, -24] as const },
  stock: { tubeR: 14.6, tubeY: -2, butt: -262 },
  optic: { u0: 66, u1: 116, r: 12.8, bore: 11, dot: 110, dotR: 0.75 },
  bolt: { travel: 60 },
} as const;

/** Sight-line metres from design millimetres: x, y above the bore, u forward. */
export const at = (x: number, y: number, u: number, sightH: number = AR5.sightH): [number, number, number] => [x / 1000, (y - sightH) / 1000, -u / 1000];

/** The palm point on the grip: a third of the way down the raked grip, on its centre plane. */
function gripPoint(): [number, number] {
  const { pivot, rake } = AR5.grip, c = Math.cos(-rake), s = Math.sin(-rake), lu = 6, ly = -35;
  return [pivot[0] + (-ly * s + lu * c), pivot[1] + (ly * c + lu * s)];
}

export function ar5Sockets(): WeaponSockets {
  const [gu, gy] = gripPoint(), A = AR5;
  return {
    grip: { p: at(0, gy, gu), r: [-A.grip.rake, 0, 0] },
    support: { p: at(-4, A.handguard.bottom - 6.5, 400), r: [0, 0, 0] },
    mag: at(0, A.mag.seat[1], A.mag.seat[0]),
    muzzle: at(0, 0, A.muzzle.u1), eject: at(16, 1, 103),
    handle: at(-16, -20, 93),
    boltTravel: A.bolt.travel / 1000, handleTravel: 0,
    trigger: at(0, -36, 80), bore: A.sightH / 1000,
  };
}
