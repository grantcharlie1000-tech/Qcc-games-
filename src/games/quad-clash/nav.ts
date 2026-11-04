/** Navigation grid for the bots: one node per standable floor per metre cell, joined by walk, jump and drop links.
 * Built once per map from the same boxes the physics uses, so every link is one a body can really take. */
import { BODY } from './config';
import { floorAt, overlaps, type World } from './physics';

export interface NavNode { readonly id: number; readonly x: number; readonly y: number; readonly z: number; readonly links: number[]; readonly costs: number[]; component: number }
export interface Nav { readonly nodes: NavNode[]; readonly cells: Map<number, number[]>; readonly hx: number; readonly hz: number; readonly main: number }

const CELL = 1;
const CLEAR_R = 0.42;
const JUMP_UP = 1.05;
const DROP = 4.2;
const key = (ix: number, iz: number) => (ix + 512) * 1024 + (iz + 512);

const cache = new WeakMap<World, Nav>();
export function navFor(w: World): Nav {
  let nav = cache.get(w);
  if (!nav) { nav = build(w); cache.set(w, nav); }
  return nav;
}

function build(w: World): Nav {
  const { hx, hz } = w.map;
  const nodes: NavNode[] = [], cells = new Map<number, number[]>();
  const b = w.b;
  for (let ix = Math.ceil(-hx); ix < Math.floor(hx); ix++) {
    for (let iz = Math.ceil(-hz); iz < Math.floor(hz); iz++) {
      // Cell centres sit on half metres so that box edges on whole metres never fall on a centre.
      const x = (ix + 0.5) * CELL, z = (iz + 0.5) * CELL;
      const heights = [0];
      for (let i = 0; i < w.n * 6; i += 6) if (x > b[i] && x < b[i + 3] && z > b[i + 2] && z < b[i + 5]) heights.push(b[i + 4]);
      heights.sort((p, q) => p - q);
      const list: number[] = [];
      let last = -1;
      for (const y of heights) {
        if (y - last < 0.05) continue;
        last = y;
        if (overlaps(w, x, y + 0.01, z, CLEAR_R)) continue;
        if (Math.abs(floorAt(w, x, z, y + 0.01, 0.05) - y) > 0.02) continue;
        const node: NavNode = { id: nodes.length, x, y, z, links: [], costs: [], component: -1 };
        nodes.push(node);
        list.push(node.id);
      }
      if (list.length) cells.set(key(ix, iz), list);
    }
  }
  for (const n of nodes) {
    const ix = Math.floor(n.x / CELL), iz = Math.floor(n.z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const list = cells.get(key(ix + dx, iz + dz));
      if (!list) continue;
      for (const id of list) {
        const m = nodes[id], dy = m.y - n.y, mx = (n.x + m.x) / 2, mz = (n.z + m.z) / 2, flat = Math.hypot(dx, dz) * CELL;
        // Diagonal links also need both orthogonal neighbours open, or the corner clips.
        if (dx && dz && (overlaps(w, n.x + dx * CELL, Math.max(n.y, m.y) + 0.02, n.z, BODY.radius) || overlaps(w, n.x, Math.max(n.y, m.y) + 0.02, n.z + dz * CELL, BODY.radius))) continue;
        let cost = -1;
        if (Math.abs(dy) <= BODY.step) {
          if (!overlaps(w, mx, Math.max(n.y, m.y) + 0.02, mz, BODY.radius)) cost = flat;
        } else if (dy > 0 && dy <= JUMP_UP) {
          if (!overlaps(w, n.x, m.y + 0.05, n.z, BODY.radius) && !overlaps(w, mx, m.y + 0.05, mz, BODY.radius)) cost = flat + 1.5;
        } else if (dy < 0 && dy >= -DROP) {
          if (!overlaps(w, mx, n.y + 0.02, mz, BODY.radius)) cost = flat + 0.5;
        }
        if (cost > 0) { n.links.push(m.id); n.costs.push(cost); }
      }
    }
  }
  // Components over links in both directions that exist both ways (drops are one-way, so use strongly reachable sets
  // approximately: union only mutual walk/jump links).
  let comp = 0;
  const sizes: number[] = [];
  for (const start of nodes) {
    if (start.component >= 0) continue;
    const stack = [start.id];
    start.component = comp;
    let size = 0;
    while (stack.length) {
      const n = nodes[stack.pop()!];
      size++;
      for (const id of n.links) {
        const m = nodes[id];
        if (m.component < 0 && m.links.includes(n.id)) { m.component = comp; stack.push(id); }
      }
    }
    sizes.push(size);
    comp++;
  }
  let main = 0;
  sizes.forEach((s, i) => { if (s > sizes[main]) main = i; });
  return { nodes, cells, hx, hz, main };
}

/** The node under a position: same or nearest cell, the highest floor not above the feet (plus a step). */
export function nearestNode(nav: Nav, x: number, y: number, z: number, mainOnly = false): NavNode | null {
  const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
  let best: NavNode | null = null, bestScore = Infinity;
  for (let ring = 0; ring <= 3 && !best; ring++) {
    for (let dx = -ring; dx <= ring; dx++) for (let dz = -ring; dz <= ring; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
      const list = nav.cells.get(key(ix + dx, iz + dz));
      if (!list) continue;
      for (const id of list) {
        const n = nav.nodes[id];
        if (mainOnly && n.component !== nav.main) continue;
        if (n.y > y + BODY.step + 0.1) continue;
        const score = Math.hypot(n.x - x, n.z - z) + (y - n.y) * 0.8;
        if (score < bestScore) { bestScore = score; best = n; }
      }
    }
  }
  return best;
}

/** A* over the grid. Returns node ids from start to goal, or [] when unreachable. Bounded so a bad request stays cheap. */
export function findPath(nav: Nav, start: number, goal: number, maxExpand = 6000): number[] {
  if (start === goal) return [goal];
  const nodes = nav.nodes, g = new Map<number, number>(), from = new Map<number, number>();
  const target = nodes[goal];
  const h = (id: number) => { const n = nodes[id]; return Math.hypot(n.x - target.x, n.z - target.z, (n.y - target.y) * 0.5); };
  const heap: [number, number][] = [[h(start), start]];
  g.set(start, 0);
  const closed = new Set<number>();
  let expanded = 0;
  while (heap.length && expanded < maxExpand) {
    const [, cur] = pop(heap);
    if (closed.has(cur)) continue;
    if (cur === goal) {
      const path = [cur];
      let c = cur;
      while (from.has(c)) { c = from.get(c)!; path.push(c); }
      return path.reverse();
    }
    closed.add(cur);
    expanded++;
    const n = nodes[cur], gc = g.get(cur)!;
    for (let i = 0; i < n.links.length; i++) {
      const m = n.links[i], ng = gc + n.costs[i];
      if (ng < (g.get(m) ?? Infinity)) { g.set(m, ng); from.set(m, cur); push(heap, [ng + h(m), m]); }
    }
  }
  return [];
}

function push(heap: [number, number][], item: [number, number]) {
  heap.push(item);
  let i = heap.length - 1;
  while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; }
}
function pop(heap: [number, number][]): [number, number] {
  const top = heap[0], last = heap.pop()!;
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
      if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
      if (m === i) break;
      [heap[m], heap[i]] = [heap[i], heap[m]];
      i = m;
    }
  }
  return top;
}

/** Random node in the main component (seeded by the caller's random value in [0, 1)). */
export function randomNode(nav: Nav, rnd: number): NavNode {
  const n = nav.nodes.length;
  let i = Math.floor(rnd * n) % n;
  for (let k = 0; k < n; k++, i = (i + 1) % n) if (nav.nodes[i].component === nav.main) return nav.nodes[i];
  return nav.nodes[0];
}
