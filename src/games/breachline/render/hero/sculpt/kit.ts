/** The shared kit for the weapon sculpts: finishes, bones, fine reliefs (stipple, knurling, serrations), the accessory
 * rail and socket-head screws. Millimetres, as in sdf.ts. */
import { AR5 as A } from './designs';
import { alongZ, box, cut, cutChamfer, latheX, relief, repeatU, rotX, round2, sideX, union, type Fn, type Shape } from './sdf';

/** Surface finishes the painter knows. */
export const MAT = { anod: 0, cerakote: 1, polymer: 2, steel: 3, rubber: 4, dark: 5, glow: 6, brass: 7, polymerFde: 8, hull: 9, blued: 10, scope: 11, glass: 12 } as const;
/** Bones as in weapons.ts `WB`. */
export const BONE = { root: 0, mag: 1, bolt: 2, trigger: 3, handle: 4, aux: 5 } as const;

export interface Part {
  name: string; bone: number; mat: number; s: Shape;
  /** Relative triangle budget weight when simplifying (detail nearest the camera gets more). */
  weight: number;
}

// ---- Fine relief ---------------------------------------------------------------------------------------------------
export const hash = (x: number, y: number, z: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz), l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
/** Moulded stipple: rounded bumps about 1 mm across. */
export const stipple = (x: number, y: number, z: number) => { const n = vnoise(x * 1.4, y * 1.4, z * 1.4); return Math.max(0, n - 0.45) * 0.32; };
/** Diamond knurl around a vertical axis through (cx, cu). */
export const knurlY = (cx: number, cu: number, pitch: number, depth: number): Fn => (x, y, z) => {
  const a = Math.atan2(-z - cu, x - cx), r = Math.hypot(x - cx, -z - cu), k = (Math.PI * 2 * r) / pitch;
  return -depth * Math.max(Math.abs(Math.sin(a * k / 2 + y * Math.PI / pitch)), Math.abs(Math.sin(a * k / 2 - y * Math.PI / pitch)));
};
/** Straight ridges across u (serrations on a latch or a paddle). */
export const ridgesU = (pitch: number, depth: number): Fn => (_x, _y, z) => -depth * Math.abs(Math.sin(-z * Math.PI / pitch));

// ---- Shared kit ----------------------------------------------------------------------------------------------------

/** An accessory rail (21.2 mm over the dovetails, 45° flanks, 5.2 mm slots on a 10 mm pitch, 3 mm deep). */
export function rail(u0: number, u1: number, hi: boolean, top = A.railTop, deck = A.deck): Shape {
  const h = A.railHalf, prof: [number, number][] = [
    [-11, deck - 0.4], [11, deck - 0.4], [11, deck + 0.5], [8.0, top - 5.4], [h, top - 2.8], [h, top - 2.4], [h - 2.4, top], [-(h - 2.4), top], [-h, top - 2.4], [-h, top - 2.8], [-8.0, top - 5.4], [-11, deck + 0.5],
  ];
  let s = alongZ(prof, u0, u1, -0.5);
  const first = u0 + 3.4, n = Math.floor((u1 - first - A.slotW) / A.slotPitch) + 1;
  const slot = repeatU(box(-12, top - A.slotDepth, first, 12, top + 1, first + A.slotW), A.slotPitch, n);
  s = hi ? cutChamfer(s, slot, 0.45) : cut(s, slot);
  return s;
}

/** A socket-head screw seen end on: head of radius r standing h proud of a face at x0 (dir ±1), hex socket in hi. */
export function screwX(y: number, u: number, x0: number, dir: 1 | -1, r: number, h: number, hi: boolean): Shape {
  let s = latheX([[0, -0.5], [r, -0.5], [r, h - 0.35], [r - 0.35, h], [0, h]], y, u, x0, dir);
  if (hi) s = cut(s, latheX([[0, h - 1.4], [r * 0.45, h - 1.4], [r * 0.45, h + 1], [0, h + 1]], y, u, x0, dir));
  return s;
}


/** A raked pistol grip with a beavertail, a finger swell, stippled side panels and a base cap; its top rear at `pivot`
 * (u, y), raked back by `rake` radians. */
export function pistolGrip(pivot: readonly [number, number], rake: number, width: number, hi: boolean): Shape {
  let s = sideX(round2([[0, 2], [44, 2], [44, -20], [46.5, -36], [43, -54], [45.5, -74], [42, -96], [41, -100], [5, -102], [1, -82], [-1, -40], [-5, -10], [-12, 0], [-10, 3]], [0, 2, 4, 9, 9, 9, 6, 3, 4, 20, 20, 8, 4, 2]), -width / 2, width / 2, 6);
  if (hi) s = relief(s, (x, y, z) => (Math.abs(x) > 9 && y < -10 && y > -92 ? stipple(x, y, z) : 0), 0.35);
  s = union(s, sideX(round2([[3, -97], [43, -95], [42, -104], [5, -106]], 2.5), -width / 2 + 0.6, width / 2 - 0.6, 2));
  s = rotX(s, -rake, 0, 0);
  const f = s.f, [pu, py] = pivot;
  return { b: [s.b[0], s.b[1] + py, s.b[2] - pu, s.b[3], s.b[4] + py, s.b[5] - pu], f: (x, y, z) => f(x, y - py, z + pu) };
}
