import { ARENA_R, CENTER, GRID } from './types';

/** Pure grid and swept-circle geometry shared by the model, bots and tests. */
/** Index of the cell containing the point, or -1 when it lies off the grid. */
export function cellOf(x: number, y: number): number {
  const cx = Math.floor(x), cy = Math.floor(y);
  return cx < 0 || cy < 0 || cx >= GRID || cy >= GRID || x !== x || y !== y ? -1 : cy * GRID + cx;
}

/** Playable cells are those whose centre lies strictly within ARENA_R of CENTER. */
export function buildMask(): { mask: Uint8Array; playable: number } {
  const mask = new Uint8Array(GRID * GRID);
  let playable = 0;
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    const dx = cx + 0.5 - CENTER, dy = cy + 0.5 - CENTER;
    if (dx * dx + dy * dy < ARENA_R * ARENA_R) { mask[cy * GRID + cx] = 1; playable++; }
  }
  return { mask, playable };
}

/** Distance from a point to the closed segment AB. */
export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let u = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
}

/** Smallest t in [0,1] where |A + t*D - C|^2 = r^2 (entry into the circle), or Infinity. A must lie outside the circle. */
function rayCircle(ax: number, ay: number, dx: number, dy: number, cx: number, cy: number, r: number): number {
  const fx = ax - cx, fy = ay - cy;
  const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
  if (a <= 0) return Infinity;
  let disc = b * b - 4 * a * c;
  if (disc < 0) { if (disc < -1e-9 * Math.max(1, b * b)) return Infinity; disc = 0; }
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : Infinity;
}

/**
 * Earliest t in [0,1] at which the moving point A + t(B - A) comes within r of segment CD (swept circle vs capsule).
 * Returns 0 when A is already within r and Infinity when it never gets there. Analytic: the capsule boundary is the
 * two end circles plus the two lines offset by r, and every boundary crossing is a candidate; the earliest wins.
 */
export function sweepHit(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, r: number): number {
  if (distToSegment(ax, ay, cx, cy, dx, dy) <= r) return 0;
  const mx = bx - ax, my = by - ay;
  if (mx * mx + my * my <= 0) return Infinity;
  let best = Math.min(rayCircle(ax, ay, mx, my, cx, cy, r), rayCircle(ax, ay, mx, my, dx, dy, r));
  const sx = dx - cx, sy = dy - cy, len2 = sx * sx + sy * sy;
  if (len2 > 0) {
    const len = Math.sqrt(len2), nx = -sy / len, ny = sx / len;
    const h0 = (ax - cx) * nx + (ay - cy) * ny, slope = mx * nx + my * ny;
    if (Math.abs(slope) > 1e-12) {
      for (const off of [r, -r]) {
        const t = (off - h0) / slope;
        if (t < 0 || t > 1 || t >= best) continue;
        const u = ((ax + t * mx - cx) * sx + (ay + t * my - cy) * sy) / len2;
        if (u >= -1e-12 && u <= 1 + 1e-12) best = t;
      }
    }
  }
  return best;
}

/** Signed shortest rotation from one angle to another, in (-PI, PI]. */
export function angleTo(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let d = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi; else if (d <= -Math.PI) d += twoPi;
  return d;
}
