/**
 * Smoothed territory outlines. Pure: no DOM, no Canvas.
 *
 * The owner grid is read as a binary field (1 where owner === id) sampled at cell centres, contoured with marching
 * squares at iso 0.5 (midpoint interpolation, which for a binary field puts every vertex halfway between two
 * samples), traced into closed loops, relaxed with a short triangle-weighted moving average (which rounds corners
 * over about two cells but leaves straight edges where they are) and finished with two Chaikin corner-cutting passes.
 *
 * Output loops are flat [x0, y0, x1, y1, ...] in cell units where a cell centre is (cx + .5, cy + .5). Every loop is
 * explicitly closed: its last point equals its first. Loops keep the owned side on the right in screen coordinates
 * (y down), so outer rings and holes wind in opposite directions and fill correctly with 'evenodd'.
 */

type Edge = 0 | 1 | 2 | 3; // top, right, bottom, left of a sampling square
const T = 0, R = 1, B = 2, L = 3;

/**
 * Directed segments per corner mask (TL = 1, TR = 2, BR = 4, BL = 8), owned corners on the right of travel.
 * The two saddle cases (5 and 10) deterministically keep diagonal neighbours separate.
 */
const SEGMENTS: readonly (readonly [Edge, Edge][])[] = [
  [], [[T, L]], [[R, T]], [[R, L]], [[B, R]], [[T, L], [B, R]], [[B, T]], [[B, L]],
  [[L, B]], [[T, B]], [[R, T], [L, B]], [[R, B]], [[L, R]], [[T, R]], [[L, T]], [],
];

export const CHAIKIN_PASSES = 2;

/** Triangle-weighted moving average over +-k neighbours of a closed ring; k shrinks for small rings so they never collapse. */
function relax(points: number[]): number[] {
  const n = points.length / 2;
  const k = n >= 16 ? 2 : n >= 8 ? 1 : 0;
  if (!k) return points;
  const out: number[] = new Array(points.length);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, total = 0;
    for (let o = -k; o <= k; o++) {
      const w = k + 1 - Math.abs(o), j = ((i + o) % n + n) % n;
      x += points[j * 2] * w; y += points[j * 2 + 1] * w; total += w;
    }
    out[i * 2] = x / total; out[i * 2 + 1] = y / total;
  }
  return out;
}

/** Closed Chaikin corner cutting of a ring given without a repeated end point. */
function chaikin(points: number[], passes: number): number[] {
  let ring = points;
  for (let pass = 0; pass < passes; pass++) {
    const n = ring.length / 2;
    const next: number[] = new Array(n * 4);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = ring[i * 2], ay = ring[i * 2 + 1], bx = ring[j * 2], by = ring[j * 2 + 1];
      next[i * 4] = ax * 0.75 + bx * 0.25; next[i * 4 + 1] = ay * 0.75 + by * 0.25;
      next[i * 4 + 2] = ax * 0.25 + bx * 0.75; next[i * 4 + 3] = ay * 0.25 + by * 0.75;
    }
    ring = next;
  }
  return ring;
}

/** Closed, smoothed loops around every connected owned region and hole of `id`. Empty when nothing is owned. */
export function ownerLoops(owner: Uint8Array, grid: number, id: number): number[][] {
  const width = 2 * grid + 8;
  const key = (x2: number, y2: number) => (y2 + 2) * width + (x2 + 2);
  const next = new Map<number, number>();
  const at = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < grid && cy < grid && owner[cy * grid + cx] === id ? 1 : 0;
  // Doubled sample coordinates of the midpoint of each edge of the square whose top-left sample is (i, j).
  const edgeKey = (i: number, j: number, e: Edge) =>
    e === T ? key(2 * i + 1, 2 * j) : e === R ? key(2 * i + 2, 2 * j + 1) : e === B ? key(2 * i + 1, 2 * j + 2) : key(2 * i, 2 * j + 1);
  // Squares reach one sample past the grid so shapes touching the border still close.
  for (let j = -1; j < grid; j++) {
    for (let i = -1; i < grid; i++) {
      const mask = at(i, j) | (at(i + 1, j) << 1) | (at(i + 1, j + 1) << 2) | (at(i, j + 1) << 3);
      for (const [from, to] of SEGMENTS[mask]) next.set(edgeKey(i, j, from), edgeKey(i, j, to));
    }
  }
  const loops: number[][] = [];
  const seen = new Set<number>();
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const ring: number[] = [];
    let k = start;
    do {
      seen.add(k);
      const x2 = (k % width) - 2, y2 = Math.floor(k / width) - 2;
      ring.push(x2 / 2 + 0.5, y2 / 2 + 0.5);
      const following = next.get(k);
      if (following === undefined) break;
      k = following;
    } while (k !== start && !seen.has(k));
    if (ring.length < 6) continue;
    const smooth = chaikin(relax(ring), CHAIKIN_PASSES);
    smooth.push(smooth[0], smooth[1]);
    loops.push(smooth);
  }
  return loops;
}

/** Signed shoelace area of a loop in cell units squared (screen winding: owned regions are positive). */
export function loopArea(loop: number[]): number {
  let sum = 0;
  for (let i = 0; i + 3 < loop.length; i += 2) sum += loop[i] * loop[i + 3] - loop[i + 2] * loop[i + 1];
  return sum / 2;
}
