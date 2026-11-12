/** Job 12.6: a small position-based ragdoll for a fighter who dies, with no physics library. Points sit at the
 * skeleton's joints. Fixed-length sticks join them, and minimum distances stand in for joint limits. The points fall
 * under gravity and collide with the floor, the map's solid boxes, intact panel cells and the map bounds (the map
 * data is only read). Friction brings the body to rest. The ragdoll runs at a fixed step, so a client's frame rate
 * does not change where the body ends up. It sleeps when it has settled or after MAX_TIME, and stays as the body for
 * the round. Pure maths in world space (metres); `index.ts` turns the points into bone rotations. */
import { CELL } from '../../config';
import { PANEL_T, type Box, type Bounds, type Panel, type World } from '../../world';

export const P = { pelvis: 0, chest: 1, neck: 2, head: 3, shL: 4, shR: 5, elL: 6, elR: 7, haL: 8, haR: 9, hipL: 10, hipR: 11, knL: 12, knR: 13, ftL: 14, ftR: 15 } as const;
export const POINTS = 16;
export const STEP = 1 / 120;
export const MAX_TIME = 3;
const GRAVITY = 9.8, PASSES = 6, FRICTION = 0.22, DAMP = 0.998;

const RADIUS = [0.12, 0.13, 0.06, 0.1, 0.07, 0.07, 0.05, 0.05, 0.045, 0.045, 0.08, 0.08, 0.06, 0.06, 0.055, 0.055];
const MASS = [3, 3, 0.8, 1.2, 1, 1, 0.7, 0.7, 0.4, 0.4, 1.5, 1.5, 1, 1, 0.6, 0.6];
/** Bones, plus braces that keep the chest and the pelvis rigid. */
const STICKS: [number, number][] = [
  [P.pelvis, P.chest], [P.chest, P.neck], [P.neck, P.head],
  [P.chest, P.shL], [P.chest, P.shR], [P.shL, P.shR], [P.neck, P.shL], [P.neck, P.shR],
  [P.shL, P.elL], [P.elL, P.haL], [P.shR, P.elR], [P.elR, P.haR],
  [P.pelvis, P.hipL], [P.pelvis, P.hipR], [P.hipL, P.hipR],
  [P.hipL, P.knL], [P.knL, P.ftL], [P.hipR, P.knR], [P.knR, P.ftR],
  [P.shL, P.hipL], [P.shR, P.hipR], [P.shL, P.hipR], [P.shR, P.hipL], [P.chest, P.hipL], [P.chest, P.hipR],
];

export interface Vec { x: number; y: number; z: number }
interface Body {
  n: number; p: Float64Array; q: Float64Array; w: Float64Array; r: Float64Array;
  sticks: { a: number; b: number; len: number }[];
  mins: { a: number; b: number; len: number }[];
}
export interface Ragdoll {
  body: Body; gun: Body | null;
  t: number; acc: number; still: number; asleep: boolean;
  /** The map within REACH of the body, gathered again whenever the body has moved more than REACH - MARGIN. */
  near: { boxes: Box[]; panels: Panel[]; bounds: Bounds; x: number; z: number } | null;
}
const REACH = 3, MARGIN = 1.5;

function makeBody(pts: readonly Vec[], radius: readonly number[], mass: readonly number[], sticks: [number, number][]): Body {
  const n = pts.length, p = new Float64Array(n * 3);
  pts.forEach((v, i) => { p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z; });
  const b: Body = { n, p, q: p.slice(), w: Float64Array.from(mass, m => 1 / m), r: Float64Array.from(radius), sticks: [], mins: [] };
  for (const [a, c] of sticks) b.sticks.push({ a, b: c, len: dist(b, a, c) });
  return b;
}
const dist = (b: Body, i: number, j: number) => Math.hypot(b.p[i * 3] - b.p[j * 3], b.p[i * 3 + 1] - b.p[j * 3 + 1], b.p[i * 3 + 2] - b.p[j * 3 + 2]);

/** Joint limits as minimum distances, from the bone lengths so a crouched or aiming start pose does not loosen them. */
function limits(b: Body) {
  const L = (i: number, j: number) => b.sticks.find(s => (s.a === i && s.b === j) || (s.a === j && s.b === i))!.len;
  const add = (a: number, c: number, len: number) => b.mins.push({ a, b: c, len });
  for (const [sh, el, ha, hip, kn, ft] of [[P.shL, P.elL, P.haL, P.hipL, P.knL, P.ftL], [P.shR, P.elR, P.haR, P.hipR, P.knR, P.ftR]]) {
    add(sh, ha, 0.4 * (L(sh, el) + L(el, ha)));      // the elbow cannot fold flat
    add(hip, ft, 0.45 * (L(hip, kn) + L(kn, ft)));   // nor the knee
    add(kn, P.chest, 0.55 * (L(hip, kn) + L(P.pelvis, P.chest)));   // the hip folds only so far forward
    add(el, P.pelvis, 0.12); add(ha, P.chest, 0.1);
  }
  const neck = L(P.chest, P.neck) + L(P.neck, P.head);
  add(P.head, P.chest, 0.85 * neck); add(P.head, P.shL, 0.8 * Math.hypot(L(P.neck, P.shL), L(P.neck, P.head)));
  add(P.head, P.shR, 0.8 * Math.hypot(L(P.neck, P.shR), L(P.neck, P.head))); add(P.head, P.pelvis, 0.9 * (neck + L(P.pelvis, P.chest)));
  add(P.knL, P.knR, 0.13); add(P.ftL, P.ftR, 0.1); add(P.haL, P.haR, 0.08); add(P.elL, P.elR, 0.2);
}

/** A ragdoll from the live joint positions (POINTS of them, in P order) and the velocity each one already has. */
export function createRagdoll(pts: readonly Vec[], vel: Vec, gun?: readonly Vec[]): Ragdoll {
  const body = makeBody(pts, RADIUS, MASS, STICKS);
  limits(body);
  const g = gun ? makeBody(gun, [0.035, 0.035, 0.03], [0.6, 0.6, 0.4], [[0, 1], [1, 2], [0, 2]]) : null;
  const r: Ragdoll = { body, gun: g, t: 0, acc: 0, still: 0, asleep: false, near: null };
  for (let i = 0; i < body.n; i++) push(r, i, vel.x, vel.y, vel.z);
  if (g) for (let i = 0; i < 3; i++) { g.q[i * 3] -= vel.x * STEP; g.q[i * 3 + 1] -= vel.y * STEP; g.q[i * 3 + 2] -= vel.z * STEP; }
  return r;
}

/** Adds a velocity (m/s) to one point. */
export function push(r: Ragdoll, i: number, vx: number, vy: number, vz: number) {
  const q = r.body.q; q[i * 3] -= vx * STEP; q[i * 3 + 1] -= vy * STEP; q[i * 3 + 2] -= vz * STEP;
}
export function pushGun(r: Ragdoll, vx: number, vy: number, vz: number) {
  if (r.gun) for (let i = 0; i < 3; i++) { r.gun.q[i * 3] -= vx * STEP; r.gun.q[i * 3 + 1] -= vy * STEP; r.gun.q[i * 3 + 2] -= vz * STEP; }
}
export const point = (r: Ragdoll, i: number, out: Vec): Vec => { const p = r.body.p; out.x = p[i * 3]; out.y = p[i * 3 + 1]; out.z = p[i * 3 + 2]; return out; };
export const gunPoint = (r: Ragdoll, i: number, out: Vec): Vec => { const p = r.gun!.p; out.x = p[i * 3]; out.y = p[i * 3 + 1]; out.z = p[i * 3 + 2]; return out; };

/** Advances by dt of game time in fixed steps; returns true while still moving. */
export function advance(r: Ragdoll, world: World | null, dt: number): boolean {
  if (r.asleep) return false;
  r.acc += Math.min(dt, 0.1);
  while (r.acc >= STEP && !r.asleep) { r.acc -= STEP; step(r, world); }
  return !r.asleep;
}

function step(r: Ragdoll, world: World | null) {
  const b = r.body;
  const x = b.p[0], z = b.p[2];
  if (world && (!r.near || Math.hypot(x - r.near.x, z - r.near.z) > REACH - MARGIN)) {
    const R = REACH;
    r.near = {
      boxes: world.boxes.filter(bx => bx.solid && bx.x1 > x - R && bx.x0 < x + R && bx.z1 > z - R && bx.z0 < z + R),
      panels: world.panels.filter(pn => { const u = pn.axis === 'x' ? x : z, v = pn.axis === 'x' ? z : x; return Math.abs(pn.pos - v) < R && pn.u0 < u + R && pn.u0 + pn.cols * CELL > u - R; }),
      bounds: world.bounds, x, z,
    };
  }
  const near = r.near;
  integrate(b); if (r.gun) integrate(r.gun);
  for (let k = 0; k < PASSES; k++) {
    solve(b); knees(b); collide(b, near);
    if (r.gun) { solve(r.gun); collide(r.gun, near); }
  }
  r.t += STEP;
  let moved = 0;
  for (let i = 0; i < b.n * 3; i++) moved = Math.max(moved, Math.abs(b.p[i] - b.q[i]));
  r.still = moved < 0.0006 ? r.still + 1 : 0;
  if ((r.still > 36 && r.t > 0.5) || r.t >= MAX_TIME) r.asleep = true;
}

function integrate(b: Body) {
  const { p, q } = b, g = GRAVITY * STEP * STEP;
  for (let i = 0; i < b.n; i++) {
    const o = i * 3;
    for (let c = 0; c < 3; c++) { const v = (p[o + c] - q[o + c]) * DAMP; q[o + c] = p[o + c]; p[o + c] += v - (c === 1 ? g : 0); }
  }
}

function solve(b: Body) {
  const { p, w } = b;
  const fix = (a: number, c: number, len: number, min: boolean) => {
    const dx = p[c * 3] - p[a * 3], dy = p[c * 3 + 1] - p[a * 3 + 1], dz = p[c * 3 + 2] - p[a * 3 + 2], d = Math.hypot(dx, dy, dz);
    if (d < 1e-9 || (min && d >= len)) return;
    const k = (d - len) / d / (w[a] + w[c]);
    p[a * 3] += dx * k * w[a]; p[a * 3 + 1] += dy * k * w[a]; p[a * 3 + 2] += dz * k * w[a];
    p[c * 3] -= dx * k * w[c]; p[c * 3 + 1] -= dy * k * w[c]; p[c * 3 + 2] -= dz * k * w[c];
  };
  for (const s of b.sticks) fix(s.a, s.b, s.len, false);
  for (const s of b.mins) fix(s.a, s.b, s.len, true);
}

/** Knees bend forward only: a knee behind the hip-to-foot line is moved back in front of it. */
function knees(b: Body) {
  const p = b.p, at = (i: number, c: number) => p[i * 3 + c];
  const X = [at(P.hipR, 0) - at(P.hipL, 0), at(P.hipR, 1) - at(P.hipL, 1), at(P.hipR, 2) - at(P.hipL, 2)];
  const Y = [at(P.chest, 0) - at(P.pelvis, 0), at(P.chest, 1) - at(P.pelvis, 1), at(P.chest, 2) - at(P.pelvis, 2)];
  // Forward (the fighter faces -Z in the bind pose, with X to the right and Y up) is Y x X.
  const F = [Y[1] * X[2] - Y[2] * X[1], Y[2] * X[0] - Y[0] * X[2], Y[0] * X[1] - Y[1] * X[0]], fl = Math.hypot(F[0], F[1], F[2]);
  if (fl < 1e-6) return;
  for (const [hip, kn, ft] of [[P.hipL, P.knL, P.ftL], [P.hipR, P.knR, P.ftR]]) {
    let d = 0;
    for (let c = 0; c < 3; c++) d += (at(kn, c) - (at(hip, c) + at(ft, c)) / 2) * F[c] / fl;
    if (d >= 0.01) continue;
    const k = (0.01 - d) * 0.5;
    for (let c = 0; c < 3; c++) { p[kn * 3 + c] += F[c] / fl * k; p[hip * 3 + c] -= F[c] / fl * k * 0.25; p[ft * 3 + c] -= F[c] / fl * k * 0.25; }
  }
}

/** Pushes each point out of the floor, solid boxes, intact panel cells and the map bounds, removing the velocity
 * into the surface and some of the velocity along it (friction). */
function collide(b: Body, world: { boxes: Box[]; panels: Panel[]; bounds: Bounds } | null) {
  const { p, q, r } = b;
  for (let i = 0; i < b.n; i++) {
    const o = i * 3, rad = r[i];
    let nx = 0, ny = 0, nz = 0, hit = false;
    const out = (ax: number, ay: number, az: number, depth: number) => { p[o] += ax * depth; p[o + 1] += ay * depth; p[o + 2] += az * depth; nx += ax; ny += ay; nz += az; hit = true; };
    if (p[o + 1] < rad) out(0, 1, 0, rad - p[o + 1]);
    if (world) {
      for (const bx of world.boxes) {
        if (!bx.solid) continue;
        const x = p[o], y = p[o + 1], z = p[o + 2];
        if (x <= bx.x0 - rad || x >= bx.x1 + rad || y <= bx.y0 - rad || y >= bx.y1 + rad || z <= bx.z0 - rad || z >= bx.z1 + rad) continue;
        // Leave through the face the point came in by: the one nearest its last position, by penetration depth.
        const px = q[o], py = q[o + 1], pz = q[o + 2];
        const faces: [number, number, number, number, boolean][] = [
          [-1, 0, 0, x - (bx.x0 - rad), px <= bx.x0 - rad + 1e-4], [1, 0, 0, bx.x1 + rad - x, px >= bx.x1 + rad - 1e-4],
          [0, -1, 0, y - (bx.y0 - rad), py <= bx.y0 - rad + 1e-4], [0, 1, 0, bx.y1 + rad - y, py >= bx.y1 + rad - 1e-4],
          [0, 0, -1, z - (bx.z0 - rad), pz <= bx.z0 - rad + 1e-4], [0, 0, 1, bx.z1 + rad - z, pz >= bx.z1 + rad - 1e-4],
        ];
        let best = faces.filter(f => f[4]).sort((a, c) => a[3] - c[3])[0];
        best ??= faces.sort((a, c) => a[3] - c[3])[0];
        out(best[0], best[1], best[2], best[3]);
      }
      const half = PANEL_T / 2;
      for (const pn of world.panels) {
        if (!pn.intact) continue;
        const x = p[o], y = p[o + 1], z = p[o + 2], u = pn.axis === 'x' ? x : z, v = pn.axis === 'x' ? z : x;
        if (Math.abs(v - pn.pos) >= half + rad || u <= pn.u0 || u >= pn.u0 + pn.cols * CELL || y <= pn.y0 || y >= pn.y0 + pn.rows * CELL) continue;
        const c = Math.floor((u - pn.u0) / CELL), rw = Math.floor((y - pn.y0) / CELL);
        if (!pn.reinforced && !pn.cells[rw * pn.cols + c]) continue;
        const was = pn.axis === 'x' ? q[o + 2] : q[o], side = was >= pn.pos ? 1 : -1, depth = pn.pos + side * (half + rad) - v;
        if (pn.axis === 'x') out(0, 0, 1, depth); else out(1, 0, 0, depth);
      }
      const bd = world.bounds;
      if (p[o] < bd.x0 + rad) out(1, 0, 0, bd.x0 + rad - p[o]); else if (p[o] > bd.x1 - rad) out(-1, 0, 0, p[o] - (bd.x1 - rad));
      if (p[o + 2] < bd.z0 + rad) out(0, 0, 1, bd.z0 + rad - p[o + 2]); else if (p[o + 2] > bd.z1 - rad) out(0, 0, -1, p[o + 2] - (bd.z1 - rad));
    }
    if (!hit) continue;
    const nl = Math.hypot(nx, ny, nz); if (nl < 1e-9) continue;
    nx /= nl; ny /= nl; nz /= nl;
    let vx = p[o] - q[o], vy = p[o + 1] - q[o + 1], vz = p[o + 2] - q[o + 2];
    const vn = vx * nx + vy * ny + vz * nz;
    const tx = vx - nx * vn, ty = vy - ny * vn, tz = vz - nz * vn;
    const n = Math.max(0, vn);
    vx = nx * n + tx * (1 - FRICTION); vy = ny * n + ty * (1 - FRICTION); vz = nz * n + tz * (1 - FRICTION);
    q[o] = p[o] - vx; q[o + 1] = p[o + 1] - vy; q[o + 2] = p[o + 2] - vz;
  }
}

/** A small seeded random number generator (mulberry32), so a death plays out the same on every client. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
