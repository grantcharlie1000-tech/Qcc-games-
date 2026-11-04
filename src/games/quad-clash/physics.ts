/** Box-world collision for Quad Clash: body movement with step-up, ray casts and floor queries. Pure functions over
 * a compiled array of boxes; the ground plane (y = 0) is solid everywhere. */
import { BODY } from './config';
import type { Box, MapDef } from './map';

export interface World {
  readonly map: MapDef;
  /** Six numbers per box: x0 y0 z0 x1 y1 z1. */
  readonly b: Float64Array;
  readonly n: number;
}

export function compile(map: MapDef): World {
  const b = new Float64Array(map.boxes.length * 6);
  map.boxes.forEach((box: Box, i) => b.set([box.x0, box.y0, box.z0, box.x1, box.y1, box.z1], i * 6));
  return { map, b, n: map.boxes.length };
}

const EPS = 1e-6;

/** Does the body box (footprint half-width r, from y to y + h) overlap any solid? */
export function overlaps(w: World, x: number, y: number, z: number, r: number = BODY.radius, h: number = BODY.height): boolean {
  if (y < -EPS) return true;
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r, y1 = y + h;
  for (let i = 0; i < w.n * 6; i += 6) {
    if (x1 > b[i] + EPS && x0 < b[i + 3] - EPS && y1 > b[i + 1] + EPS && y < b[i + 4] - EPS && z1 > b[i + 2] + EPS && z0 < b[i + 5] - EPS) return true;
  }
  return false;
}

/** Highest solid top under the footprint at or below `maxY` (0 for the ground). */
export function floorAt(w: World, x: number, z: number, maxY: number, r: number = BODY.radius): number {
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
  let top = 0;
  for (let i = 0; i < w.n * 6; i += 6) {
    const t = b[i + 4];
    if (t <= maxY + EPS && t > top && x1 > b[i] + EPS && x0 < b[i + 3] - EPS && z1 > b[i + 2] + EPS && z0 < b[i + 5] - EPS) top = t;
  }
  return top;
}

export interface Body { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean }

/** Moves a body one step: horizontal axes separately (so it slides along walls), stepping up low ledges when grounded,
 * then the vertical axis with landing and ceiling contact. Returns true if it stepped up. */
export function moveBody(w: World, p: Body, dt: number, r: number = BODY.radius, h: number = BODY.height): boolean {
  let stepped = false;
  const wasGrounded = p.grounded;
  for (const axis of ['x', 'z'] as const) {
    const v = axis === 'x' ? p.vx : p.vz;
    if (v === 0) continue;
    const from = p[axis], to = from + v * dt;
    const at = (val: number, y: number) => axis === 'x' ? overlaps(w, val, y, p.z, r, h) : overlaps(w, p.x, y, val, r, h);
    if (!at(to, p.y)) { p[axis] = to; continue; }
    if (p.grounded && !at(to, p.y + BODY.step) && !at(from, p.y + BODY.step)) {
      p[axis] = to;
      p.y = axis === 'x' ? floorAt(w, to, p.z, p.y + BODY.step, r) : floorAt(w, p.x, to, p.y + BODY.step, r);
      stepped = true;
      continue;
    }
    // Close the gap to the wall by bisection, then stop on this axis.
    let lo = 0, hi = 1;
    for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (at(from + (to - from) * mid, p.y)) hi = mid; else lo = mid; }
    p[axis] = from + (to - from) * lo;
    if (axis === 'x') p.vx = 0; else p.vz = 0;
  }
  const toY = p.y + p.vy * dt;
  if (!overlaps(w, p.x, toY, p.z, r, h)) p.y = toY;
  else if (p.vy <= 0) {
    p.y = floorAt(w, p.x, p.z, p.y + EPS * 10, r);
    p.vy = 0;
  } else {
    let lo = 0, hi = 1;
    for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2; if (overlaps(w, p.x, p.y + (toY - p.y) * mid, p.z, r, h)) hi = mid; else lo = mid; }
    p.y += (toY - p.y) * lo;
    p.vy = 0;
  }
  p.grounded = p.vy <= 0 && overlaps(w, p.x, p.y - 0.03, p.z, r, h);
  // Walking down stairs or off a kerb keeps the feet on the floor instead of hopping.
  if (!p.grounded && wasGrounded && p.vy <= 0) {
    const f = floorAt(w, p.x, p.z, p.y, r);
    if (p.y - f <= BODY.step && !overlaps(w, p.x, f, p.z, r, h)) { p.y = f; p.vy = 0; p.grounded = true; }
  }
  return stepped;
}

export interface RayHit { t: number; nx: number; ny: number; nz: number }

/** Nearest solid hit along a unit direction within maxT, or null. Includes the ground plane. */
export function rayWorld(w: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out?: RayHit): RayHit | null {
  let best = maxT, nx = 0, ny = 0, nz = 0, hit = false;
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; nx = 0; ny = 1; nz = 0; hit = true; } }
  const b = w.b, ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
  for (let i = 0; i < w.n * 6; i += 6) {
    let t0 = (b[i] - ox) * ix, t1 = (b[i + 3] - ox) * ix;
    let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1), axis = 0;
    t0 = (b[i + 1] - oy) * iy; t1 = (b[i + 4] - oy) * iy;
    let a = Math.min(t0, t1), c = Math.max(t0, t1);
    if (a > tmin) { tmin = a; axis = 1; }
    if (c < tmax) tmax = c;
    t0 = (b[i + 2] - oz) * iz; t1 = (b[i + 5] - oz) * iz;
    a = Math.min(t0, t1); c = Math.max(t0, t1);
    if (a > tmin) { tmin = a; axis = 2; }
    if (c < tmax) tmax = c;
    if (tmax < Math.max(tmin, 0) || tmin >= best) continue;
    if (tmin < 0) continue; // origin inside a box: ignore it (cannot happen for valid positions)
    best = tmin; hit = true;
    nx = axis === 0 ? -Math.sign(dx) : 0; ny = axis === 1 ? -Math.sign(dy) : 0; nz = axis === 2 ? -Math.sign(dz) : 0;
  }
  if (!hit) return null;
  const r = out ?? { t: 0, nx: 0, ny: 0, nz: 0 };
  r.t = best; r.nx = nx; r.ny = ny; r.nz = nz;
  return r;
}

/** True when nothing solid lies on the segment between two points. */
export function clearLine(w: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;
  return rayWorld(w, ax, ay, az, dx / len, dy / len, dz / len, len - 1e-3) === null;
}

/** Ray against a sphere; returns entry distance or -1. */
export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return -1;
  const th = Math.sqrt(r * r - d2), t = tc - th;
  return t >= 0 ? t : tc + th >= 0 ? 0 : -1;
}

/** Ray against an axis-aligned box; returns entry distance or -1. */
export function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number {
  const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
  let t0 = (x0 - ox) * ix, t1 = (x1 - ox) * ix;
  let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
  t0 = (y0 - oy) * iy; t1 = (y1 - oy) * iy;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  t0 = (z0 - oz) * iz; t1 = (z1 - oz) * iz;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  if (tmax < Math.max(tmin, 0)) return -1;
  return Math.max(tmin, 0);
}

/** Point inside any solid (for grenades and rockets). */
export function pointSolid(w: World, x: number, y: number, z: number, r = 0.1): boolean {
  return overlaps(w, x, y - r, z, r, r * 2);
}
