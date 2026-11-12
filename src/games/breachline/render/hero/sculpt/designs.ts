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

/** The palm point on a raked grip: a third of the way down, on its centre plane. */
function gripPoint(pivot: readonly [number, number] = AR5.grip.pivot, rake: number = AR5.grip.rake): [number, number] {
  const c = Math.cos(-rake), s = Math.sin(-rake), lu = 6, ly = -35;
  return [pivot[0] + (-ly * s + lu * c), pivot[1] + (ly * c + lu * s)];
}

/** A rifle design of the AR-5's family: the AR-5's table with some parts changed (the Tern C8 below). */
export type RifleDesign = typeof AR5 & { holo?: { u0: number; u1: number; half: number; top: number; window: [number, number] }; reflex?: { u0: number; u1: number; window: [number, number] }; scope?: { u0: number; u1: number; r: number; bore: number; ocular: number; objective: number; turret: number; rings: [number, number] }; magBend?: number; support?: number; furniture?: 'polymer' | 'polymerFde' };

export function ar5Sockets(A: RifleDesign = AR5): WeaponSockets {
  const [gu, gy] = gripPoint(A.grip.pivot, A.grip.rake), a = (x: number, y: number, u: number) => at(x, y, u, A.sightH);
  return {
    grip: { p: a(0, gy, gu), r: [-A.grip.rake, 0, 0] },
    support: { p: a(-4, A.handguard.bottom - 6.5, A.support ?? 360), r: [0, 0, 0] },
    mag: a(0, A.mag.seat[1], A.mag.seat[0]),
    muzzle: a(0, 0, A.muzzle.u1), eject: a(16, 1, 103),
    handle: a(-16, -20, 93),
    boltTravel: A.bolt.travel / 1000, handleTravel: 0,
    trigger: a(0, -36, 80), bore: A.sightH / 1000,
  };
}

/** Tern C8: the AR-5's compact sister (Breachline's own design): a 267 mm barrel under a 230 mm handguard, a short
 * muzzle brake, a holographic sight with a wide rectangular window, the stock collapsed one notch, dark-earth
 * furniture. About 720 mm overall. */
export const TERN = {
  ...AR5, name: 'Tern C8', sightH: 62,
  handguard: { ...AR5.handguard, u1: 420, slots: 5 },
  barrel: { ...AR5.barrel, muzzle: 455 },
  muzzle: { u0: 453, u1: 500, r: 11.5 },
  stock: { ...AR5.stock, butt: -232 },
  holo: { u0: 70, u1: 148, half: 17, top: 79, window: [31, 25] },
  optic: { ...AR5.optic, dot: 140, dotR: 0.7 },
  support: 330, furniture: 'polymerFde',
} as unknown as RifleDesign;
export const ternSockets = () => ar5Sockets(TERN);

/** Halden 12: a pump shotgun (Breachline's own design) with a ghost-ring rear sight on the receiver, a ramped front
 * post with a tritium dot, a tube magazine under the barrel, a ribbed pump, a six-shell side saddle on the left and a
 * polymer stock with a pistol grip. About 1015 mm overall with a 470 mm barrel. */
export const HALDEN = {
  name: 'Halden 12',
  sightH: 46,
  receiver: { u0: 0, u1: 205, half: 15, top: 22, bottom: -26 },
  port: { u0: 72, u1: 142, y0: -6, y1: 12 },
  loading: { u0: 70, u1: 150, half: 11.5 },
  barrel: { r: 10.5, u0: 205, u1: 675 },
  tube: { r: 11, y: -24, u1: 600 },
  pump: { u0: 300, u1: 515, half: 25, top: -8, bottom: -46, travel: 90 },
  grip: { pivot: [8, -30] as const, rake: 0.4, width: 26 },
  stock: { butt: -330 },
  saddle: { u0: 40, u1: 140, x: -15, shells: 5 },
  front: { u: 662 },
} as const;

export function haldenSockets(): WeaponSockets {
  const H = HALDEN, sh = H.sightH, [gu, gy] = gripPoint(H.grip.pivot, H.grip.rake);
  const a = (x: number, y: number, u: number) => at(x, y, u, sh);
  return {
    grip: { p: a(0, gy, gu), r: [-H.grip.rake, 0, 0] },
    support: { p: a(0, H.pump.bottom - 2, 405), r: [0, 0, 0] },
    mag: a(0, -50, 120), muzzle: a(0, 0, H.barrel.u1), eject: a(20, 2, 105),
    handle: a(0, -26, 405), boltTravel: 0.09, handleTravel: H.pump.travel / 1000,
    trigger: a(0, -40, 66), bore: sh / 1000, port: a(0, -45, 120),
  };
}

/** Wren-9: a 9 mm submachine gun of the same family (Breachline's own design): a 140 mm barrel under a short handguard,
 * a straight 32-round magazine in a narrow well, an open reflex sight, the stock collapsed. About 610 mm overall. */
export const WREN = {
  ...AR5, name: 'Wren-9', sightH: 58,
  well: { ...AR5.well, u0: 128, u1: 170, half: 13.6, open: [21, 38] },
  mag: { ...AR5.mag, width: 19.6, depth: 32, length: 210, seat: [149, -24] },
  handguard: { ...AR5.handguard, u1: 330, slots: 2 },
  barrel: { ...AR5.barrel, r: 7.4, muzzle: 345 },
  muzzle: { u0: 343, u1: 372, r: 10 },
  stock: { ...AR5.stock, butt: -205 },
  reflex: { u0: 60, u1: 100, window: [24, 18] },
  optic: { ...AR5.optic, dot: 94, dotR: 0.7 },
  magBend: 0, support: 290, furniture: 'polymer',
} as unknown as RifleDesign;
export const wrenSockets = () => ar5Sockets(WREN);

/** Corvin DMR: the family's 7.62 mm marksman rifle (Breachline's own design): a 500 mm heavy barrel under a long
 * handguard, a three-port brake, a 20-round box magazine in a deeper well, and a 30 mm variable scope (ocular and
 * objective bells, turrets, power ring) on tall rings. About 1010 mm overall. */
export const CORVIN = {
  ...AR5, name: 'Corvin DMR', sightH: 64,
  well: { ...AR5.well, u0: 98, u1: 178, half: 16.4, mouth: -66, open: [25.4, 72] },
  mag: { ...AR5.mag, width: 24.6, depth: 70, length: 150, seat: [138, -24] },
  handguard: { ...AR5.handguard, u1: 560, slots: 8 },
  barrel: { ...AR5.barrel, r: 9.6, muzzle: 690 },
  muzzle: { u0: 688, u1: 752, r: 13 },
  stock: { ...AR5.stock, butt: -282 },
  scope: { u0: 18, u1: 340, r: 15, bore: 11.5, ocular: 20, objective: 23, turret: 180, rings: [104, 250] },
  magBend: 10, support: 420, furniture: 'polymer',
} as unknown as RifleDesign;
export const corvinSockets = () => ar5Sockets(CORVIN);

/** P-11: a polymer-framed 9 mm sidearm (Breachline's own design): a 188 mm steel slide with front and rear serrations
 * and a square-notch rear sight, a dust cover with three rail slots, an undercut square trigger guard, a raked grip,
 * a 17-round magazine. Bore on Y = 0; u forward of the slide's rear face. */
export const SIDEARM = {
  name: 'P-11', sightH: 22,
  slide: { u0: 0, u1: 188, half: 12.4, top: 15, bottom: -9.5 },
  port: { u0: 48, u1: 92 },
  barrel: { r: 6.8, bore: 4.6 },
  frame: { u0: -6, u1: 176, bottom: -24, half: 11.6 },
  guard: { u0: 42, u1: 92, low: -50 },
  grip: { pivot: [2, -12] as const, rake: 0.3, width: 30 },
  mag: { width: 20 },
} as const;

export function sidearmSockets(): WeaponSockets {
  const D = SIDEARM, [gu, gy] = gripPoint(D.grip.pivot, D.grip.rake), a = (x: number, y: number, u: number) => at(x, y, u, D.sightH);
  return {
    grip: { p: a(0, gy, gu), r: [-D.grip.rake, 0, 0] },
    support: { p: a(-20, -60, 0), r: [0, 0, 0] },
    mag: a(0, -24, 20), muzzle: a(0, 0, D.slide.u1 + 1.6), eject: a(14, 12, 70), handle: a(0, 8, 20),
    boltTravel: 0.032, handleTravel: 0.032, trigger: a(0, -36, 62), bore: D.sightH / 1000,
  };
}
