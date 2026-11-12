/** The sculpt kit: signed-distance solids for the weapons' high-detail sources, in millimetres. Exact primitives
 * (boxes with chamfered or rounded edges, capped cylinders, extruded and revolved 2D outlines) combined with
 * chamfered and filleted unions and cuts, each shape carrying a bounding box so a field of a few hundred primitives
 * stays cheap: outside its box a shape returns the distance to the box, a valid lower bound.
 *
 * Axes (as at run time, but in mm): +X right, +Y up, -Z forward. The bore lies on Y = 0. Side outlines are written in
 * (u, y) with u = -z (distance forward of the receiver's rear face), which is how a design sheet is dimensioned.
 * Pure functions: the offline mesher and baker evaluate them in Node; the game never does. */

export type Fn = (x: number, y: number, z: number) => number;
/** Axis-aligned box [x0, y0, z0, x1, y1, z1]. */
export type Box = [number, number, number, number, number, number];
export interface Shape { f: Fn; b: Box }
export type P2 = readonly (readonly [number, number])[];

const SQ = Math.SQRT1_2;
const INF: Box = [-1e9, -1e9, -1e9, 1e9, 1e9, 1e9];

/** Distance from a point to a box (0 inside): a lower bound for any shape inside it. */
export function boxDist(b: Box, x: number, y: number, z: number): number {
  const dx = Math.max(b[0] - x, x - b[3], 0), dy = Math.max(b[1] - y, y - b[4], 0), dz = Math.max(b[2] - z, z - b[5], 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
const grow = (b: Box, m: number): Box => [b[0] - m, b[1] - m, b[2] - m, b[3] + m, b[4] + m, b[5] + m];
const join = (a: Box, b: Box): Box => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2]), Math.max(a[3], b[3]), Math.max(a[4], b[4]), Math.max(a[5], b[5])];
const meet = (a: Box, b: Box): Box => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2]), Math.min(a[3], b[3]), Math.min(a[4], b[4]), Math.min(a[5], b[5])];

/** Wraps a shape so points well outside its box skip the exact evaluation. */
export function bounded(s: Shape, margin = 2): Shape {
  const g = grow(s.b, margin), f = s.f;
  return { b: s.b, f: (x, y, z) => { const d = boxDist(g, x, y, z); return d > 0 ? d + margin * 0.5 : f(x, y, z); } };
}

// ---- 2D outlines -------------------------------------------------------------------------------------------------

/** Exact signed distance to a closed polygon (negative inside), as a function of two coordinates. */
export function poly2(pts: P2): (a: number, b: number) => number {
  const n = pts.length, vx = new Float64Array(n), vy = new Float64Array(n), ex = new Float64Array(n), ey = new Float64Array(n), ie = new Float64Array(n);
  for (let i = 0; i < n; i++) { vx[i] = pts[i][0]; vy[i] = pts[i][1]; }
  for (let i = 0, j = n - 1; i < n; j = i, i++) { ex[i] = vx[j] - vx[i]; ey[i] = vy[j] - vy[i]; ie[i] = 1 / (ex[i] * ex[i] + ey[i] * ey[i] || 1e-12); }
  return (px, py) => {
    let d = (px - vx[0]) ** 2 + (py - vy[0]) ** 2, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const wx = px - vx[i], wy = py - vy[i], t = Math.min(1, Math.max(0, (wx * ex[i] + wy * ey[i]) * ie[i]));
      const bx = wx - ex[i] * t, by = wy - ey[i] * t, dd = bx * bx + by * by;
      if (dd < d) d = dd;
      const c1 = py >= vy[i], c2 = py < vy[j], c3 = ex[i] * wy > ey[i] * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
}
const bounds2 = (pts: P2) => { let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9; for (const [a, b] of pts) { a0 = Math.min(a0, a); b0 = Math.min(b0, b); a1 = Math.max(a1, a); b1 = Math.max(b1, b); } return [a0, b0, a1, b1]; };

/** Rounds a polygon's corners with true circular arcs (radius per corner or one for all; 0 keeps the corner). */
export function round2(pts: P2, r: number | readonly number[], segs = 6): [number, number][] {
  const out: [number, number][] = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const rr = typeof r === 'number' ? r : r[i] ?? 0, p = pts[i], a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    if (rr <= 0) { out.push([p[0], p[1]]); continue; }
    let ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); ax /= la; ay /= la; bx /= lb; by /= lb;
    const half = Math.acos(Math.max(-1, Math.min(1, ax * bx + ay * by))) / 2;
    if (half < 1e-3 || half > Math.PI / 2 - 1e-3) { out.push([p[0], p[1]]); continue; }
    const t = Math.min(rr / Math.tan(half), la * 0.49, lb * 0.49), rad = t * Math.tan(half);
    const s0: [number, number] = [p[0] + ax * t, p[1] + ay * t], s1: [number, number] = [p[0] + bx * t, p[1] + by * t];
    const mx = ax + bx, my = ay + by, ml = Math.hypot(mx, my), cd = rad / Math.sin(half);
    const cx = p[0] + mx / ml * cd, cy = p[1] + my / ml * cd;
    const a0 = Math.atan2(s0[1] - cy, s0[0] - cx); let a1 = Math.atan2(s1[1] - cy, s1[0] - cx);
    let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; a1 = a0 + da;
    for (let k = 0; k <= segs; k++) { const ang = a0 + da * k / segs; out.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad]); }
  }
  return out;
}
/** A slot (stadium) outline centred at (a, b), length along a, width along b. */
export function stadium2(a: number, b: number, len: number, wid: number, segs = 6): [number, number][] {
  const r = wid / 2, h = Math.max(0, len / 2 - r), out: [number, number][] = [];
  for (let k = 0; k <= segs; k++) { const t = -Math.PI / 2 + Math.PI * k / segs; out.push([a + h + Math.cos(t) * r, b + Math.sin(t) * r]); }
  for (let k = 0; k <= segs; k++) { const t = Math.PI / 2 + Math.PI * k / segs; out.push([a - h + Math.cos(t) * r, b + Math.sin(t) * r]); }
  return out;
}

/** Combines a 2D distance and a distance across the extrusion: rounded (edge > 0) or chamfered (edge < 0) edges. */
function ext(d2: number, dz: number, edge: number): number {
  if (edge > 0) { const a = d2 + edge, b = dz + edge; return Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - edge; }
  if (edge < 0) return Math.max(d2, dz, (d2 + dz - edge) * SQ);
  return Math.max(d2, dz);
}

/** A side outline in (u, y) (u = -z) extruded across X from x0 to x1. */
export function sideX(pts: P2, x0: number, x1: number, edge = 0): Shape {
  const d = poly2(pts), [u0, y0, u1, y1] = bounds2(pts), xc = (x0 + x1) / 2, hw = (x1 - x0) / 2;
  return bounded({ b: [x0, y0, -u1, x1, y1, -u0], f: (x, y, z) => ext(d(-z, y), Math.abs(x - xc) - hw, edge) });
}
/** A cross-section in (x, y) extruded along the bore from u0 to u1 (forward distances). */
export function alongZ(pts: P2, u0: number, u1: number, edge = 0, inset = 0): Shape {
  const d = poly2(pts), [x0, y0, x1, y1] = bounds2(pts), uc = (u0 + u1) / 2, hl = (u1 - u0) / 2;
  return bounded({ b: [x0, y0, -u1, x1, y1, -u0], f: (x, y, z) => ext(d(x, y) + inset, Math.abs(-z - uc) - hl, edge) });
}
/** A top outline in (x, u) extruded vertically from y0 to y1. */
export function topY(pts: P2, y0: number, y1: number, edge = 0): Shape {
  const d = poly2(pts), [x0, u0, x1, u1] = bounds2(pts), yc = (y0 + y1) / 2, hh = (y1 - y0) / 2;
  return bounded({ b: [x0, y0, -u1, x1, y1, -u0], f: (x, y, z) => ext(d(x, -z), Math.abs(y - yc) - hh, edge) });
}
/** A profile in (r, u) revolved about an axis parallel to the bore through (cx, cy). Profiles include the axis side. */
export function lathe(pts: P2, cx = 0, cy = 0): Shape {
  const d = poly2(pts), [, u0, r1, u1] = bounds2(pts);
  return bounded({ b: [cx - r1, cy - r1, -u1, cx + r1, cy + r1, -u0], f: (x, y, z) => d(Math.hypot(x - cx, y - cy), -z) });
}
/** A profile in (r, h) revolved about the X axis through (y, u) — knobs, caps and pins seen from the side. */
export function latheX(pts: P2, y: number, u: number, x0 = 0, dir: 1 | -1 = 1): Shape {
  const d = poly2(pts), [, h0, r1, h1] = bounds2(pts);
  const xa = dir > 0 ? x0 + h0 : x0 - h1, xb = dir > 0 ? x0 + h1 : x0 - h0;
  return bounded({ b: [xa, y - r1, -u - r1, xb, y + r1, -u + r1], f: (px, py, pz) => d(Math.hypot(py - y, pz + u), (px - x0) * dir) });
}
/** A profile in (r, h) revolved about the Y axis through (x, u). */
export function latheY(pts: P2, x: number, u: number, y0 = 0): Shape {
  const d = poly2(pts), [, h0, r1, h1] = bounds2(pts);
  return bounded({ b: [x - r1, y0 + h0, -u - r1, x + r1, y0 + h1, -u + r1], f: (px, py, pz) => d(Math.hypot(px - x, pz + u), py - y0) });
}

// ---- Primitives ----------------------------------------------------------------------------------------------------

/** A box from corner to corner (mm), edges chamfered (edge < 0) or rounded (edge > 0). */
export function box(x0: number, y0: number, u0: number, x1: number, y1: number, u1: number, edge = 0): Shape {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = -(u0 + u1) / 2, hx = Math.abs(x1 - x0) / 2, hy = Math.abs(y1 - y0) / 2, hz = Math.abs(u1 - u0) / 2;
  const b: Box = [cx - hx, cy - hy, cz - hz, cx + hx, cy + hy, cz + hz];
  if (edge > 0) {
    const r = edge;
    return { b, f: (x, y, z) => { const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; } };
  }
  const c = -edge;
  return { b, f: (x, y, z) => {
    const qx = Math.abs(x - cx) - hx, qy = Math.abs(y - cy) - hy, qz = Math.abs(z - cz) - hz;
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
    return c > 0 ? Math.max(d, (qx + qy + c) * SQ, (qy + qz + c) * SQ, (qx + qz + c) * SQ) : d;
  } };
}
/** A capped cylinder along the bore axis direction, centre (x, y), from u0 to u1; edges rounded or chamfered. */
export function cylZ(x: number, y: number, r: number, u0: number, u1: number, edge = 0): Shape {
  const uc = (u0 + u1) / 2, hl = (u1 - u0) / 2;
  return { b: [x - r, y - r, -u1, x + r, y + r, -u0], f: (px, py, pz) => ext(Math.hypot(px - x, py - y) - r, Math.abs(-pz - uc) - hl, edge) };
}
/** A capped cylinder across the weapon (along X), centre (y, u), from x0 to x1. */
export function cylX(y: number, u: number, r: number, x0: number, x1: number, edge = 0): Shape {
  const xc = (x0 + x1) / 2, hl = (x1 - x0) / 2;
  return { b: [x0, y - r, -u - r, x1, y + r, -u + r], f: (px, py, pz) => ext(Math.hypot(py - y, pz + u) - r, Math.abs(px - xc) - hl, edge) };
}
/** A vertical capped cylinder (along Y), centre (x, u), from y0 to y1. */
export function cylY(x: number, u: number, r: number, y0: number, y1: number, edge = 0): Shape {
  const yc = (y0 + y1) / 2, hl = (y1 - y0) / 2;
  return { b: [x - r, y0, -u - r, x + r, y1, -u + r], f: (px, py, pz) => ext(Math.hypot(px - x, pz + u) - r, Math.abs(py - yc) - hl, edge) };
}
/** A capsule between two points (x, y, u). */
export function capsule(a: readonly [number, number, number], c: readonly [number, number, number], r: number): Shape {
  const ax = a[0], ay = a[1], az = -a[2], bx = c[0] - ax, by = c[1] - ay, bz = -c[2] - az, ib = 1 / (bx * bx + by * by + bz * bz || 1e-12);
  return { b: [Math.min(ax, c[0]) - r, Math.min(ay, c[1]) - r, Math.min(az, -c[2]) - r, Math.max(ax, c[0]) + r, Math.max(ay, c[1]) + r, Math.max(az, -c[2]) + r],
    f: (x, y, z) => { const px = x - ax, py = y - ay, pz = z - az, t = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) * ib)); return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - r; } };
}

// ---- Combinations --------------------------------------------------------------------------------------------------

/** Hard union. */
export function union(...s: Shape[]): Shape {
  const fs = s.map(q => q.f), n = fs.length;
  let b = s[0].b; for (const q of s) b = join(b, q.b);
  if (n === 1) return s[0];
  if (n === 2) { const [f0, f1] = fs; return { b, f: (x, y, z) => Math.min(f0(x, y, z), f1(x, y, z)) }; }
  return { b, f: (x, y, z) => { let d = 1e9; for (let i = 0; i < n; i++) { const v = fs[i](x, y, z); if (v < d) d = v; } return d; } };
}
/** Union with a fillet of radius r in the inside corners (moulded parts). Where the two shapes share a face the fillet
 * raises a ridge of up to r along it: use a hard union there. */
export function fillet(a: Shape, c: Shape, r: number): Shape {
  const fa = a.f, fc = c.f;
  return { b: grow(join(a.b, c.b), r), f: (x, y, z) => { const p = fa(x, y, z), q = fc(x, y, z), u = Math.max(r - p, 0), v = Math.max(r - q, 0); return Math.max(r, Math.min(p, q)) - Math.hypot(u, v); } };
}
/** Union with a 45° chamfer of leg r in the inside corners (welded or machined transitions). */
export function chamferJoin(a: Shape, c: Shape, r: number): Shape {
  const fa = a.f, fc = c.f;
  return { b: grow(join(a.b, c.b), r), f: (x, y, z) => { const p = fa(x, y, z), q = fc(x, y, z); return Math.min(p, q, (p - r + q) * SQ); } };
}
/** Cuts `c` out of `a` (hard edge). */
export function cut(a: Shape, ...c: Shape[]): Shape {
  const fa = a.f, cuts = c.map(q => bounded(q, 1));
  const fs = cuts.map(q => q.f), n = fs.length;
  return { b: a.b, f: (x, y, z) => { let d = fa(x, y, z); for (let i = 0; i < n; i++) { const v = -fs[i](x, y, z); if (v > d) d = v; } return d; } };
}
/** Cuts with the cut's rim chamfered (leg r): machined pockets, ports, slots. */
export function cutChamfer(a: Shape, c: Shape, r: number): Shape {
  const fa = a.f, fc = bounded(c, r + 1).f;
  return { b: a.b, f: (x, y, z) => { const p = fa(x, y, z), q = -fc(x, y, z); return Math.max(p, q, (p + r + q) * SQ); } };
}
/** Cuts with the cut's rim rounded (radius r): moulded openings. */
export function cutRound(a: Shape, c: Shape, r: number): Shape {
  const fa = a.f, fc = bounded(c, r + 1).f;
  return { b: a.b, f: (x, y, z) => { const p = fa(x, y, z), q = -fc(x, y, z), u = Math.max(r + p, 0), v = Math.max(r + q, 0); return Math.min(-r, Math.max(p, q)) + Math.hypot(u, v); } };
}
/** Intersection. */
export function inter(a: Shape, c: Shape): Shape {
  const fa = a.f, fc = c.f;
  return { b: meet(a.b, c.b), f: (x, y, z) => Math.max(fa(x, y, z), fc(x, y, z)) };
}
/** A surface layer: the shape grown (d > 0) or shrunk (d < 0). */
export function offset(a: Shape, d: number): Shape { const f = a.f; return { b: grow(a.b, Math.max(0, d)), f: (x, y, z) => f(x, y, z) - d }; }
/** Mirrors a shape across the X = 0 plane and keeps both. */
export function mirrorX(a: Shape): Shape { const f = a.f; return { b: [Math.min(a.b[0], -a.b[3]), a.b[1], a.b[2], Math.max(a.b[3], -a.b[0]), a.b[4], a.b[5]], f: (x, y, z) => f(Math.abs(x), y, z) }; }
/** `n` copies of a shape spaced `pitch` mm forward (copy 0 as authored). Pitch must exceed the shape's length. */
export function repeatU(a: Shape, pitch: number, n: number): Shape {
  const f = a.f, b: Box = [a.b[0], a.b[1], a.b[2] - pitch * (n - 1), a.b[3], a.b[4], a.b[5]];
  const zc = (a.b[2] + a.b[5]) / 2;
  return { b, f: (x, y, z) => { const k = Math.min(n - 1, Math.max(0, Math.round((zc - z) / pitch))); return f(x, y, z + k * pitch); } };
}
/** Moves a shape (mm; dz in u, i.e. forward). */
export function move(a: Shape, dx: number, dy: number, du: number): Shape { const f = a.f; return { b: [a.b[0] + dx, a.b[1] + dy, a.b[2] - du, a.b[3] + dx, a.b[4] + dy, a.b[5] - du], f: (x, y, z) => f(x - dx, y - dy, z + du) }; }
/** Rotates a shape about the X axis through (y, u) by `ang` radians (positive tips its front up). */
export function rotX(a: Shape, ang: number, y: number, u: number): Shape {
  const f = a.f, c = Math.cos(ang), s = Math.sin(ang);
  // Bound: rotate the box corners.
  let b: Box = [a.b[0], 1e9, 1e9, a.b[3], -1e9, -1e9];
  for (const yy of [a.b[1], a.b[4]]) for (const zz of [a.b[2], a.b[5]]) {
    const py = yy - y, pu = -zz - u, ry = py * c + pu * s, ru = -py * s + pu * c;
    b = [b[0], Math.min(b[1], ry + y), Math.min(b[2], -(ru + u)), b[3], Math.max(b[4], ry + y), Math.max(b[5], -(ru + u))];
  }
  return { b, f: (x, py, pz) => { const dy = py - y, du = -pz - u, ly = dy * c - du * s, lu = dy * s + du * c; return f(x, ly + y, -(lu + u)); } };
}
/** Rotates a shape about the Y axis through (x, u) by `ang` radians. */
export function rotY(a: Shape, ang: number, x: number, u: number): Shape {
  const f = a.f, c = Math.cos(ang), s = Math.sin(ang);
  const r = Math.hypot(Math.max(Math.abs(a.b[0] - x), Math.abs(a.b[3] - x)), Math.max(Math.abs(-a.b[2] - u), Math.abs(-a.b[5] - u)));
  return { b: [x - r, a.b[1], -u - r, x + r, a.b[4], -u + r], f: (px, py, pz) => { const dx = px - x, du = -pz - u, lx = dx * c + du * s, lu = -dx * s + du * c; return f(lx + x, py, -(lu + u)); } };
}
/** Rotates a shape about an axis parallel to the bore through (x, y) by `ang` radians (counter-clockwise seen from
 * behind the weapon, i.e. from +Z). */
export function rotZ(a: Shape, ang: number, x = 0, y = 0): Shape {
  const f = a.f, c = Math.cos(ang), s = Math.sin(ang);
  const r = Math.hypot(Math.max(Math.abs(a.b[0] - x), Math.abs(a.b[3] - x)), Math.max(Math.abs(a.b[1] - y), Math.abs(a.b[4] - y)));
  return { b: [x - r, y - r, a.b[2], x + r, y + r, a.b[5]], f: (px, py, pz) => { const dx = px - x, dy = py - y; return f(dx * c + dy * s + x, -dx * s + dy * c + y, pz); } };
}
/** A slot outline with its length along the second coordinate. */
export function stadiumB(a: number, b: number, len: number, wid: number, segs = 6): [number, number][] {
  return stadium2(b, a, len, wid, segs).map(([p, q]) => [q, p] as [number, number]);
}
/** Adds a fine relief to a surface: `h(x, y, z)` in mm, outward positive, faded out where the shape is far. */
export function relief(a: Shape, h: Fn, amp: number): Shape {
  const f = a.f;
  return { b: grow(a.b, amp), f: (x, y, z) => { const d = f(x, y, z); return d > amp * 3 ? d : d - h(x, y, z); } };
}

export const EMPTY: Shape = { b: [0, 0, 0, 0, 0, 0], f: () => 1e9 };
export { INF };

/** Gradient by central differences (unnormalised), written to `out`. */
export function grad(f: Fn, x: number, y: number, z: number, e: number, out: Float64Array | number[]): void {
  out[0] = f(x + e, y, z) - f(x - e, y, z); out[1] = f(x, y + e, z) - f(x, y - e, z); out[2] = f(x, y, z + e) - f(x, y, z - e);
}
