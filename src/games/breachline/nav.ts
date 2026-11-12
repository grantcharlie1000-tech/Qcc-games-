/** Navigation for bots: a half-metre grid over the yard. Furniture and solid walls block cells; destructible panels
 * sit on the lines between cells, so a route can cross a hole, a broken barricade, or (at a price) a wall worth breaching. */
import { MAP } from './map';
import { panelOpen, type Panel, type World } from './world';

export const NAV = 0.5;
const W = Math.round((MAP.bounds.x1 - MAP.bounds.x0) / NAV), H = Math.round((MAP.bounds.z1 - MAP.bounds.z0) / NAV), N = W * H;
const R = 0.2;

export interface Nav {
  world: World;
  blocked: Uint8Array;
  /** Extra cost for hugging walls, so routes run down the middle of rooms and doorways. */
  cost: Float32Array;
  /** Panel id + 1 on the line to the east / south neighbour, 0 when none; and the first panel column of that edge. */
  east: Int16Array; south: Int16Array; eastCol: Int16Array; southCol: Int16Array;
  /** Search scratch. */
  g: Float32Array; from: Int32Array; stamp: Int32Array; closed: Int32Array; run: number;
}
export const cellOf = (x: number, z: number) => Math.max(0, Math.min(W - 1, Math.floor((x - MAP.bounds.x0) / NAV))) + Math.max(0, Math.min(H - 1, Math.floor((z - MAP.bounds.z0) / NAV))) * W;
export const cellX = (c: number) => MAP.bounds.x0 + ((c % W) + 0.5) * NAV;
export const cellZ = (c: number) => MAP.bounds.z0 + (Math.floor(c / W) + 0.5) * NAV;

export function createNav(world: World): Nav {
  const nav: Nav = { world, blocked: new Uint8Array(N), cost: new Float32Array(N), east: new Int16Array(N), south: new Int16Array(N), eastCol: new Int16Array(N), southCol: new Int16Array(N), g: new Float32Array(N), from: new Int32Array(N), stamp: new Int32Array(N), closed: new Int32Array(N), run: 0 };
  for (let c = 0; c < N; c++) {
    const x = cellX(c), z = cellZ(c);
    for (const b of world.boxes) {
      if (!b.solid || b.y1 <= 0.3 || b.y0 >= 1.78) continue;
      const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      if (dx * dx + dz * dz < R * R) { nav.blocked[c] = 1; break; }
    }
  }
  for (const p of world.panels) {
    const line = p.axis === 'x' ? Math.round((p.pos - MAP.bounds.z0) / NAV) : Math.round((p.pos - MAP.bounds.x0) / NAV);
    const off = p.axis === 'x' ? MAP.bounds.x0 : MAP.bounds.z0;
    const a = Math.floor((p.u0 - off) / NAV + 1e-6), b = Math.ceil((p.u0 + p.cols * 0.25 - off) / NAV - 1e-6);
    for (let i = a; i < b; i++) {
      // The cell just before the line owns the edge.
      const cell = p.axis === 'x' ? i + (line - 1) * W : (line - 1) + i * W;
      if (cell < 0 || cell >= N) continue;
      const col = Math.round((off + i * NAV - p.u0) / 0.25);
      if (p.axis === 'x') { nav.south[cell] = p.id + 1; nav.southCol[cell] = col; } else { nav.east[cell] = p.id + 1; nav.eastCol[cell] = col; }
    }
  }
  for (let c = 0; c < N; c++) {
    if (nav.blocked[c]) continue;
    const x = c % W, z = Math.floor(c / W);
    let near = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H || nav.blocked[nx + nz * W]) near++;
    }
    if (nav.east[c] || nav.south[c] || (x > 0 && nav.east[c - 1]) || (z > 0 && nav.south[c - W])) near += 2;
    nav.cost[c] = near * 0.35;
  }
  return nav;
}

export interface Crossing { panel: Panel; open: boolean }
/** The panel on the line between two side-by-side cells, if any, and whether a standing fighter fits through there. */
export function crossing(nav: Nav, a: number, b: number): Crossing | null {
  const lo = Math.min(a, b), d = Math.abs(a - b);
  const id = d === 1 ? nav.east[lo] : d === W ? nav.south[lo] : 0;
  if (!id) return null;
  const panel = nav.world.panels[id - 1], col = d === 1 ? nav.eastCol[lo] : nav.southCol[lo];
  if (panel.kind === 'window') return { panel, open: false };
  return { panel, open: panelOpen(panel, col - 1, col + 2, 0.3, 1.78) };
}
/** The centre of an intact cell that still blocks the line between two cells, for a bot to knock out. */
export function blocker(nav: Nav, a: number, b: number): { u: number; y: number } | null {
  const lo = Math.min(a, b), d = Math.abs(a - b), id = d === 1 ? nav.east[lo] : d === W ? nav.south[lo] : 0;
  if (!id) return null;
  const p = nav.world.panels[id - 1], col = d === 1 ? nav.eastCol[lo] : nav.southCol[lo];
  const r0 = Math.max(0, Math.floor((0.3 - p.y0) / 0.25)), r1 = Math.min(p.rows - 1, Math.ceil((1.78 - p.y0) / 0.25) - 1);
  let best: { u: number; y: number } | null = null, bd = Infinity;
  for (let r = r0; r <= r1; r++) for (let c = Math.max(0, col - 1); c <= Math.min(p.cols - 1, col + 2); c++) {
    if (!p.cells[r * p.cols + c]) continue;
    // Prefer cells near the middle of the gap, so each swing clears as much as possible.
    const score = Math.abs(c - col - 0.5) + Math.abs(r - (r0 + r1) / 2) * 0.2;
    if (score < bd) { bd = score; best = { u: p.u0 + (c + 0.5) * 0.25, y: p.y0 + (r + 0.5) * 0.25 }; }
  }
  return best;
}
export interface RouteOptions {
  /** Cost of breaking through a barricade; Infinity to refuse. */
  barricade: number;
  /** Cost of breaching a soft wall; Infinity to refuse. */
  wall: number;
}
function edgeCost(nav: Nav, a: number, b: number, o: RouteOptions): number {
  const x = crossing(nav, a, b);
  if (!x || x.open) return 0;
  if (x.panel.reinforced || x.panel.kind === 'window') return Infinity;
  return x.panel.kind === 'door' ? o.barricade : o.wall;
}
/** Nearest walkable cell to a point (spirals out a little). */
export function freeCell(nav: Nav, x: number, z: number): number {
  const c = cellOf(x, z);
  if (!nav.blocked[c]) return c;
  const cx = c % W, cz = Math.floor(c / W);
  let best = -1, bd = Infinity;
  for (let r = 1; r <= 4 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const nx = cx + dx, nz = cz + dz;
    if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
    const n = nx + nz * W, d = (cellX(n) - x) ** 2 + (cellZ(n) - z) ** 2;
    if (!nav.blocked[n] && d < bd) { bd = d; best = n; }
  }
  return best < 0 ? c : best;
}

const heap: number[] = [];
/** A* from one point to another. Returns cell indices from start to goal, or null when there is no route. */
export function route(nav: Nav, sx: number, sz: number, gx: number, gz: number, o: RouteOptions): number[] | null {
  const start = freeCell(nav, sx, sz), goal = freeCell(nav, gx, gz), run = ++nav.run, { g, from, stamp, closed, blocked, cost } = nav;
  if (start === goal) return [start];
  const gX = goal % W, gZ = Math.floor(goal / W);
  const h = (c: number) => { const dx = Math.abs((c % W) - gX), dz = Math.abs(Math.floor(c / W) - gZ); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * NAV; };
  const f = (c: number) => g[c] + h(c);
  heap.length = 0;
  const push = (c: number) => { let i = heap.length; heap.push(c); const fc = f(c); while (i > 0) { const p = (i - 1) >> 1; if (f(heap[p]) <= fc) break; heap[i] = heap[p]; i = p; } heap[i] = c; };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      let i = 0; const fl = f(last);
      for (;;) { let k = i * 2 + 1; if (k >= heap.length) break; if (k + 1 < heap.length && f(heap[k + 1]) < f(heap[k])) k++; if (f(heap[k]) >= fl) break; heap[i] = heap[k]; i = k; }
      heap[i] = last;
    }
    return top;
  };
  g[start] = 0; from[start] = -1; stamp[start] = run; push(start);
  while (heap.length) {
    const c = pop();
    if (closed[c] === run) continue;
    closed[c] = run;
    if (c === goal) {
      const path: number[] = [];
      for (let n = c; n >= 0; n = from[n]) path.push(n);
      return path.reverse();
    }
    const x = c % W, z = Math.floor(c / W);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= W || nz >= H) continue;
      const n = nx + nz * W;
      if (blocked[n] || closed[n] === run) continue;
      let extra: number;
      if (dx && dz) {
        // Diagonals only across four free cells with nothing on any of the lines between them.
        const s1 = x + dx + z * W, s2 = x + (z + dz) * W;
        if (blocked[s1] || blocked[s2] || crossing(nav, c, s1) || crossing(nav, c, s2) || crossing(nav, s1, n) || crossing(nav, s2, n)) continue;
        extra = 0;
      } else extra = edgeCost(nav, c, n, o);
      if (extra === Infinity) continue;
      const ng = g[c] + (dx && dz ? 1.414 : 1) * NAV + cost[n] + extra;
      if (stamp[n] !== run || ng < g[n]) { g[n] = ng; from[n] = c; stamp[n] = run; push(n); }
    }
  }
  return null;
}
