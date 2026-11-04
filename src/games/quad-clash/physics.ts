/** Box-world collision for Quad Clash: body movement with step-up, ray casts and floor queries. Queries over
 * indexed static boxes with reusable scratch storage; the ground plane (y = 0) is solid everywhere. */
import { BODY } from './config';
import type { Box, MapDef } from './map';

const CELL = 8;
const cellKey = (x: number, z: number) => (x + 1024) * 2048 + z + 1024;
export interface World {
  readonly map: MapDef;
  /** Six numbers per box: x0 y0 z0 x1 y1 z1. */
  readonly b: Float64Array;
  readonly n: number;
  readonly cells: ReadonlyMap<number, readonly number[]>;
  readonly range: readonly [number, number, number, number];
  readonly all: readonly number[];
  readonly seen: Uint32Array;
  readonly scratch: number[];
  query: number;
}

export function compile(map: MapDef): World {
  const b = new Float64Array(map.boxes.length * 6), cells = new Map<number, number[]>();
  let xmin=Infinity,zmin=Infinity,xmax=-Infinity,zmax=-Infinity;
  map.boxes.forEach((box: Box, i) => {
    b.set([box.x0, box.y0, box.z0, box.x1, box.y1, box.z1], i * 6);
    const x0=Math.floor(box.x0/CELL),z0=Math.floor(box.z0/CELL),x1=Math.floor(box.x1/CELL),z1=Math.floor(box.z1/CELL);
    xmin=Math.min(xmin,x0);zmin=Math.min(zmin,z0);xmax=Math.max(xmax,x1);zmax=Math.max(zmax,z1);
    for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++) {
      const key=cellKey(x,z),list=cells.get(key);
      if(list)list.push(i);else cells.set(key,[i]);
    }
  });
  return {map,b,n:map.boxes.length,cells,range:[xmin,zmin,xmax,zmax],all:map.boxes.map((_,i)=>i),seen:new Uint32Array(map.boxes.length),scratch:[],query:0};
}

/** Conservative x/z broad phase. The borrowed result is valid only until this world's next query. */
export function boxesNear(w: World,x0: number,z0: number,x1: number,z1: number): readonly number[] {
  const ax=Math.max(w.range[0],Math.floor(x0/CELL)),az=Math.max(w.range[1],Math.floor(z0/CELL));
  const bx=Math.min(w.range[2],Math.floor(x1/CELL)),bz=Math.min(w.range[3],Math.floor(z1/CELL));
  const out=w.scratch;out.length=0;
  if(ax>bx||az>bz)return out;
  // Long diagonal shots are cheaper as one linear scan than hundreds of bucket lookups.
  if((bx-ax+1)*(bz-az+1)>48)return w.all;
  w.query=(w.query+1)>>>0;
  if(w.query===0){w.seen.fill(0);w.query=1;}
  for(let x=ax;x<=bx;x++)for(let z=az;z<=bz;z++) {
    const list=w.cells.get(cellKey(x,z));if(!list)continue;
    for(const id of list)if(w.seen[id]!==w.query){w.seen[id]=w.query;out.push(id);}
  }
  return out;
}

const EPS = 1e-6;

/** Does the body box (footprint half-width r, from y to y + h) overlap any solid? */
export function overlaps(w: World, x: number, y: number, z: number, r: number = BODY.radius, h: number = BODY.height): boolean {
  if (y < -EPS) return true;
  // Campus roofs are taller than the visible fence. Keep the arena edge solid at any jump height.
  if (w.map.boundPlayers && (x-r < -w.map.hx-EPS || x+r > w.map.hx+EPS || z-r < -w.map.hz-EPS || z+r > w.map.hz+EPS)) return true;
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r, y1 = y + h;
  for (const id of boxesNear(w,x0,z0,x1,z1)) {
    const i=id*6;
    if (x1 > b[i] + EPS && x0 < b[i + 3] - EPS && y1 > b[i + 1] + EPS && y < b[i + 4] - EPS && z1 > b[i + 2] + EPS && z0 < b[i + 5] - EPS) return true;
  }
  return false;
}

/** Highest solid top under the footprint at or below `maxY` (0 for the ground). */
export function floorAt(w: World, x: number, z: number, maxY: number, r: number = BODY.radius): number {
  const b = w.b, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r;
  let top = 0;
  for (const id of boxesNear(w,x0,z0,x1,z1)) {
    const i=id*6;
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
  let best = maxT, nx = 0, ny = 0, nz = 0, hit = false, bestIndex = -1;
  if (dy < 0) { const t = -oy / dy; if (t >= 0 && t < best) { best = t; nx = 0; ny = 1; nz = 0; hit = true; } }
  const b = w.b, ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12);
  const ex=ox+dx*maxT,ez=oz+dz*maxT;
  for (const id of boxesNear(w,Math.min(ox,ex),Math.min(oz,ez),Math.max(ox,ex),Math.max(oz,ez))) {
    const i=id*6;
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
    if (tmax < Math.max(tmin, 0) || tmin > best || (tmin === best && id >= bestIndex)) continue;
    if (tmin < 0) continue; // origin inside a box: ignore it (cannot happen for valid positions)
    best = tmin; bestIndex = id; hit = true;
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

/** Ray against an ellipsoid; keeps the egg's headshot region broad but below the shell crown. */
export function rayEllipsoid(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number): number {
  const x = (ox - cx) / rx, y = (oy - cy) / ry, z = (oz - cz) / rz;
  const vx = dx / rx, vy = dy / ry, vz = dz / rz;
  const a = vx * vx + vy * vy + vz * vz, b = x * vx + y * vy + z * vz, c = x * x + y * y + z * z - 1;
  const disc = b * b - a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / a;
  return t >= 0 ? t : (-b + Math.sqrt(disc)) / a >= 0 ? 0 : -1;
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
