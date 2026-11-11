/** The level as the simulation sees it: solid boxes on a flat floor, and thin destructible panels (soft walls and
 * barricades) made of square cells. Pure geometry: collision, bullet traces, sight lines and panel damage. */
import { BODY, CELL } from './config';

export type Mat = 'concrete' | 'brick' | 'plaster' | 'trim' | 'wood' | 'metal' | 'crate' | 'container' | 'van' | 'rack' | 'fabric' | 'steel' | 'counter';
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; mat: Mat; solid: boolean; draw: boolean }
export type PanelKind = 'wall' | 'door' | 'window';
export interface PanelDef {
  /** 'x': the surface runs along X at z = pos. 'z': it runs along Z at x = pos. */
  axis: 'x' | 'z';
  pos: number; u0: number; y0: number; cols: number; rows: number;
  kind: PanelKind;
  /** Barricades that start the round closed (outside doors and windows). */
  closed: boolean;
}
export interface Panel extends PanelDef {
  id: number;
  /** 1 = intact, 0 = open, row-major from the bottom-left. */
  cells: Uint8Array;
  intact: number;
  reinforced: boolean;
  /** Bumped on every change so meshes and navigation know to refresh. */
  version: number;
}
export interface Bounds { x0: number; z0: number; x1: number; z1: number }
export interface World { boxes: Box[]; panels: Panel[]; bounds: Bounds; version: number }

export const PANEL_T = 0.14;

export function createWorld(boxes: readonly Box[], panels: readonly PanelDef[], bounds: Bounds): World {
  const world: World = { boxes: boxes.map(b => ({ ...b })), panels: [], bounds: { ...bounds }, version: 0 };
  panels.forEach((d, id) => world.panels.push({ ...d, id, cells: new Uint8Array(d.cols * d.rows), intact: 0, reinforced: false, version: 0 }));
  resetPanels(world);
  return world;
}
/** Round start: walls whole, outside barricades up, inside doorways open, nothing reinforced. */
export function resetPanels(world: World) {
  for (const p of world.panels) {
    const on = p.kind === 'wall' || p.closed;
    p.cells.fill(on ? 1 : 0); p.intact = on ? p.cells.length : 0; p.reinforced = false; p.version++;
  }
  world.version++;
}

export const panelU = (p: Panel, x: number, z: number) => (p.axis === 'x' ? x : z);
export const panelV = (p: Panel, x: number, z: number) => (p.axis === 'x' ? z : x);
/** World position of a point on a panel. */
export function panelPoint(p: PanelDef, u: number, y: number, off = 0) {
  return p.axis === 'x' ? { x: u, y, z: p.pos + off } : { x: p.pos + off, y, z: u };
}
export function cellCenter(p: Panel, index: number) {
  const c = index % p.cols, r = (index - c) / p.cols;
  return panelPoint(p, p.u0 + (c + 0.5) * CELL, p.y0 + (r + 0.5) * CELL);
}
export const panelWidth = (p: PanelDef) => p.cols * CELL;
export const panelHeight = (p: PanelDef) => p.rows * CELL;
export function panelCenter(p: PanelDef) { return panelPoint(p, p.u0 + p.cols * CELL / 2, p.y0 + p.rows * CELL / 2); }

/** Removes every intact cell whose centre lies within `radius` of (u, y), and always the cell under the point. */
export function bite(world: World, p: Panel, u: number, y: number, radius: number): number[] {
  if (p.reinforced || !p.intact) return [];
  const out: number[] = [];
  const c0 = Math.max(0, Math.floor((u - radius - p.u0) / CELL)), c1 = Math.min(p.cols - 1, Math.floor((u + radius - p.u0) / CELL));
  const r0 = Math.max(0, Math.floor((y - radius - p.y0) / CELL)), r1 = Math.min(p.rows - 1, Math.floor((y + radius - p.y0) / CELL));
  const hc = Math.floor((u - p.u0) / CELL), hr = Math.floor((y - p.y0) / CELL), r2 = radius * radius;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const i = r * p.cols + c;
    if (!p.cells[i]) continue;
    const du = p.u0 + (c + 0.5) * CELL - u, dy = p.y0 + (r + 0.5) * CELL - y;
    if (du * du + dy * dy <= r2 || (c === hc && r === hr)) { p.cells[i] = 0; out.push(i); }
  }
  if (out.length) { p.intact -= out.length; p.version++; world.version++; }
  return out;
}
export function removeCells(world: World, p: Panel, indices: readonly number[]) {
  let n = 0;
  for (const i of indices) if (i >= 0 && i < p.cells.length && p.cells[i]) { p.cells[i] = 0; n++; }
  if (n) { p.intact -= n; p.version++; world.version++; }
}
/** Fills a panel (a rebuilt barricade, or a wall about to be reinforced). */
export function fillPanel(world: World, p: Panel, reinforced = false) {
  p.cells.fill(1); p.intact = p.cells.length; p.reinforced = reinforced; p.version++; world.version++;
}
/** True when no intact cell remains in the given columns between two heights. */
export function panelOpen(p: Panel, c0: number, c1: number, yLow: number, yHigh: number): boolean {
  if (!p.intact) return true;
  if (p.reinforced) return false;
  const r0 = Math.max(0, Math.floor((yLow - p.y0) / CELL)), r1 = Math.min(p.rows - 1, Math.ceil((yHigh - p.y0) / CELL) - 1);
  for (let c = Math.max(0, c0); c <= Math.min(p.cols - 1, c1); c++) for (let r = r0; r <= r1; r++) if (p.cells[r * p.cols + c]) return false;
  return true;
}

// ---- Collision: a vertical cylinder of BODY.radius standing on the floor --------------------------------------------
function pushOut(pos: { x: number; z: number }, x0: number, z0: number, x1: number, z1: number, r: number): boolean {
  const cx = Math.max(x0, Math.min(x1, pos.x)), cz = Math.max(z0, Math.min(z1, pos.z));
  const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; return true; }
  // Centre inside the rectangle: leave through the nearest side.
  const l = pos.x - x0, rr = x1 - pos.x, n = pos.z - z0, s = z1 - pos.z, m = Math.min(l, rr, n, s);
  if (m === l) pos.x = x0 - r; else if (m === rr) pos.x = x1 + r; else if (m === n) pos.z = z0 - r; else pos.z = z1 + r;
  return true;
}
/** Pushes a body of the given height out of walls, props and intact panel cells. */
export function resolve(world: World, pos: { x: number; z: number }, height: number, radius = BODY.radius) {
  const b = world.bounds;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const box of world.boxes) {
      if (!box.solid || box.y1 <= BODY.step || box.y0 >= height) continue;
      if (pos.x + radius <= box.x0 || pos.x - radius >= box.x1 || pos.z + radius <= box.z0 || pos.z - radius >= box.z1) continue;
      if (pushOut(pos, box.x0, box.z0, box.x1, box.z1, radius)) moved = true;
    }
    for (const p of world.panels) {
      if (!p.intact) continue;
      const u = panelU(p, pos.x, pos.z), v = panelV(p, pos.x, pos.z), half = PANEL_T / 2;
      if (Math.abs(v - p.pos) >= radius + half || u + radius <= p.u0 || u - radius >= p.u0 + p.cols * CELL) continue;
      const c0 = Math.max(0, Math.floor((u - radius - p.u0) / CELL)), c1 = Math.min(p.cols - 1, Math.floor((u + radius - p.u0) / CELL));
      const r0 = Math.max(0, Math.floor((BODY.step - p.y0) / CELL + 1e-6)), r1 = Math.min(p.rows - 1, Math.ceil((height - p.y0) / CELL) - 1);
      // Neighbouring blocked columns are merged into one slab so a body slides along a wall without snagging.
      let run = -1;
      for (let c = c0; c <= c1 + 1; c++) {
        let blocked = false;
        if (c <= c1) { if (p.reinforced) blocked = true; else for (let r = r0; r <= r1; r++) if (p.cells[r * p.cols + c]) { blocked = true; break; } }
        if (blocked) { if (run < 0) run = c; continue; }
        if (run < 0) continue;
        const a = p.u0 + run * CELL, e = p.u0 + c * CELL; run = -1;
        if (p.axis === 'x' ? pushOut(pos, a, p.pos - half, e, p.pos + half, radius) : pushOut(pos, p.pos - half, a, p.pos + half, e, radius)) moved = true;
      }
    }
    if (pos.x < b.x0 + radius) { pos.x = b.x0 + radius; moved = true; } else if (pos.x > b.x1 - radius) { pos.x = b.x1 - radius; moved = true; }
    if (pos.z < b.z0 + radius) { pos.z = b.z0 + radius; moved = true; } else if (pos.z > b.z1 - radius) { pos.z = b.z1 - radius; moved = true; }
    if (!moved) break;
  }
}
/** Moves in small steps so a fast body cannot skip through a thin panel. */
export function moveBody(world: World, pos: { x: number; z: number }, dx: number, dz: number, height: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.1));
  for (let i = 0; i < steps; i++) { pos.x += dx / steps; pos.z += dz / steps; resolve(world, pos, height); }
}
/** Whether a standing body fits here untouched (spawn checks and tests). */
export function fits(world: World, x: number, z: number, height: number = BODY.stand): boolean {
  const pos = { x, z };
  resolve(world, pos, height);
  return Math.abs(pos.x - x) < 1e-6 && Math.abs(pos.z - z) < 1e-6;
}

// ---- Rays ------------------------------------------------------------------------------------------------------------
export interface SoftHit { t: number; panel: Panel; cell: number }
export interface Trace {
  /** Distance to the first solid surface, or the range limit. */
  t: number;
  solid: boolean;
  box: Box | null;
  /** A reinforced panel stopped the ray. */
  panel: Panel | null;
  nx: number; ny: number; nz: number;
  /** Intact destructible cells crossed before the solid surface, nearest first. */
  soft: SoftHit[];
}
/** Ray against one box; distance or -1. Writes the entry axis (0 x, 1 y, 2 z) into `axisOut[0]`. */
const axisOut = [0];
function rayBoxT(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: Box, max: number): number {
  let t0 = 0, t1 = max, axis = -1;
  if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) return -1; }
  else { let a = (b.x0 - ox) / dx, c = (b.x1 - ox) / dx; if (a > c) { const s = a; a = c; c = s; } if (a > t0) { t0 = a; axis = 0; } if (c < t1) t1 = c; if (t0 > t1) return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) return -1; }
  else { let a = (b.y0 - oy) / dy, c = (b.y1 - oy) / dy; if (a > c) { const s = a; a = c; c = s; } if (a > t0) { t0 = a; axis = 1; } if (c < t1) t1 = c; if (t0 > t1) return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) return -1; }
  else { let a = (b.z0 - oz) / dz, c = (b.z1 - oz) / dz; if (a > c) { const s = a; a = c; c = s; } if (a > t0) { t0 = a; axis = 2; } if (c < t1) t1 = c; if (t0 > t1) return -1; }
  axisOut[0] = axis;
  return axis < 0 ? 0 : t0;
}
/** Follows a bullet: where it finally stops, and the destructible cells it crosses on the way. */
export function trace(world: World, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): Trace {
  const out: Trace = { t: max, solid: false, box: null, panel: null, nx: 0, ny: 1, nz: 0, soft: [] };
  // The floor and the sky limit.
  if (dy < -1e-9) { const t = -oy / dy; if (t < out.t) { out.t = t; out.solid = true; out.nx = 0; out.ny = 1; out.nz = 0; } }
  for (const b of world.boxes) {
    if (!b.solid) continue;
    const t = rayBoxT(ox, oy, oz, dx, dy, dz, b, out.t);
    if (t < 0 || t >= out.t) continue;
    out.t = t; out.solid = true; out.box = b; out.panel = null;
    const a = axisOut[0];
    out.nx = a === 0 ? -Math.sign(dx) : 0; out.ny = a === 1 ? -Math.sign(dy) : 0; out.nz = a === 2 ? -Math.sign(dz) : 0;
  }
  for (const p of world.panels) {
    if (!p.intact) continue;
    const dv = p.axis === 'x' ? dz : dx;
    if (Math.abs(dv) < 1e-9) continue;
    const t = (p.pos - (p.axis === 'x' ? oz : ox)) / dv;
    if (t <= 1e-4 || t >= out.t) continue;
    const u = (p.axis === 'x' ? ox + dx * t : oz + dz * t) - p.u0, y = oy + dy * t - p.y0;
    if (u < 0 || y < 0) continue;
    const c = Math.floor(u / CELL), r = Math.floor(y / CELL);
    if (c >= p.cols || r >= p.rows) continue;
    const cell = r * p.cols + c;
    if (!p.cells[cell]) continue;
    if (p.reinforced) {
      out.t = t; out.solid = true; out.box = null; out.panel = p;
      out.nx = p.axis === 'z' ? -Math.sign(dx) : 0; out.ny = 0; out.nz = p.axis === 'x' ? -Math.sign(dz) : 0;
    } else out.soft.push({ t, panel: p, cell });
  }
  if (out.soft.length) {
    out.soft = out.soft.filter(s => s.t < out.t);
    out.soft.sort((a, b) => a.t - b.t);
  }
  return out;
}
/** What lies between two points: 0 nothing, otherwise 1 per destructible layer and 4 for anything solid. */
export function obstruction(world: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  let dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return 0;
  dx /= len; dy /= len; dz /= len;
  for (const b of world.boxes) if (b.solid && rayBoxT(ax, ay, az, dx, dy, dz, b, len) >= 0) return 4;
  let soft = 0;
  for (const p of world.panels) {
    if (!p.intact) continue;
    const dv = p.axis === 'x' ? dz : dx;
    if (Math.abs(dv) < 1e-9) continue;
    const t = (p.pos - (p.axis === 'x' ? az : ax)) / dv;
    if (t <= 1e-4 || t >= len) continue;
    const u = (p.axis === 'x' ? ax + dx * t : az + dz * t) - p.u0, y = ay + dy * t - p.y0;
    if (u < 0 || y < 0) continue;
    const c = Math.floor(u / CELL), r = Math.floor(y / CELL);
    if (c >= p.cols || r >= p.rows || !p.cells[r * p.cols + c]) continue;
    if (p.reinforced) return 4;
    soft++;
  }
  return soft;
}
export const clearLine = (world: World, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => obstruction(world, ax, ay, az, bx, by, bz) === 0;

// ---- Bodies as targets -------------------------------------------------------------------------------------------------
export interface Pose { x: number; z: number; yaw: number; crouch: number; lean: number }
export const bodyHeight = (crouch: number) => BODY.stand + (BODY.crouch - BODY.stand) * crouch;
export const eyeHeight = (crouch: number) => BODY.eyeStand + (BODY.eyeCrouch - BODY.eyeStand) * crouch;
/** Unit view vector: yaw 0 looks along -Z, positive yaw turns left, positive pitch looks up. */
export function viewDir(yaw: number, pitch: number) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}
/** Eye position including the sideways lean. */
export function eyeOf(p: Pose) {
  const k = p.lean * BODY.lean;
  return { x: p.x + Math.cos(p.yaw) * k, y: eyeHeight(p.crouch) - Math.abs(p.lean) * 0.05, z: p.z - Math.sin(p.yaw) * k };
}
/** Ray against a fighter: a body cylinder and a head sphere. Returns the distance and whether the head was hit. */
export function rayBody(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, p: Pose, max: number): { t: number; head: boolean } | null {
  const eye = eyeOf(p), hx = eye.x, hy = eye.y + 0.02, hz = eye.z;
  let best = max, head = false;
  // Head.
  const lx = ox - hx, ly = oy - hy, lz = oz - hz, b = lx * dx + ly * dy + lz * dz, c = lx * lx + ly * ly + lz * lz - BODY.headR * BODY.headR, disc = b * b - c;
  if (disc >= 0) { const t = -b - Math.sqrt(disc); if (t >= 0 && t < best) { best = t; head = true; } }
  // Body: shifted a third of the way toward the lean.
  const bx = p.x + (hx - p.x) * 0.35, bz = p.z + (hz - p.z) * 0.35, top = hy - BODY.headR + 0.03, r = BODY.radius + 0.02;
  const fx = ox - bx, fz = oz - bz, a2 = dx * dx + dz * dz;
  if (a2 > 1e-9) {
    const b2 = fx * dx + fz * dz, c2 = fx * fx + fz * fz - r * r, d2 = b2 * b2 - a2 * c2;
    if (d2 >= 0) {
      const s = Math.sqrt(d2);
      let t = (-b2 - s) / a2;
      const y = oy + dy * t;
      if (t < 0 || y < 0 || y > top) {
        // Started inside the cylinder or entered through its top.
        t = -1;
        if (dy < -1e-9) { const tt = (top - oy) / dy, px = fx + dx * tt, pz = fz + dz * tt; if (tt >= 0 && px * px + pz * pz <= r * r) t = tt; }
      }
      if (t >= 0 && t < best) { best = t; head = false; }
    }
  } else if (fx * fx + fz * fz <= r * r && dy < 0 && oy > top) { const t = (top - oy) / dy; if (t < best) { best = t; head = false; } }
  return best < max ? { t: best, head } : null;
}

// ---- Panel state on the wire ---------------------------------------------------------------------------------------------
/** One entry per panel: 0 open, 1 whole, 2 reinforced, or a hex bitmask of intact cells. */
export type PanelState = 0 | 1 | 2 | string;
export function packPanels(world: World): PanelState[] {
  return world.panels.map(p => {
    if (p.reinforced) return 2;
    if (!p.intact) return 0;
    if (p.intact === p.cells.length) return 1;
    let hex = '';
    for (let i = 0; i < p.cells.length; i += 4) hex += ((p.cells[i] ? 1 : 0) | (p.cells[i + 1] ? 2 : 0) | (p.cells[i + 2] ? 4 : 0) | (p.cells[i + 3] ? 8 : 0)).toString(16);
    return hex;
  });
}
export function unpackPanels(world: World, states: unknown): boolean {
  if (!Array.isArray(states) || states.length !== world.panels.length) return false;
  world.panels.forEach((p, n) => {
    const s = states[n] as PanelState;
    if (typeof s === 'string') {
      let intact = 0;
      for (let i = 0; i < p.cells.length; i++) { const v = (parseInt(s[i >> 2] ?? '0', 16) >> (i & 3)) & 1; p.cells[i] = v; intact += v; }
      p.intact = intact; p.reinforced = false;
    } else { const on = s === 1 || s === 2; p.cells.fill(on ? 1 : 0); p.intact = on ? p.cells.length : 0; p.reinforced = s === 2; }
    p.version++;
  });
  world.version++;
  return true;
}
