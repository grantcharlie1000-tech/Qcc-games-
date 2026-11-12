/** Greybox placement search for the map-fill pass (docs/superpowers/plans/2026-11-11-breachline-map-fill.md, 7.A.1).
 * For each area, proposes cover boxes on a grid, keeps those that pass every section 3 rule against everything
 * placed so far, and greedily takes the one that most shrinks the area's largest empty rectangle, until the area
 * meets its section 2 targets or nothing legal is left. Full-height pieces only stand against solid (brick or
 * perimeter) walls; waist-high pieces may stand free. Prints `box(...)` lines for the marked block in map.ts.
 *
 *   npx vite-node scripts/breachline-assets/mapfill-place.ts
 */
import { MAP, type Rect } from '../../src/games/breachline/map';
import { createNav, route } from '../../src/games/breachline/nav';
import { createWorld } from '../../src/games/breachline/world';
import { CELL } from '../../src/games/breachline/config';
import type { Box, Mat } from '../../src/games/breachline/world';
import { OUTDOOR, SITE_CORES, baseline, boxViolations, fits, gap, isFurniture, largestEmpty } from '../../tests/games/breachline/mapfill';

type Kind = { w: number; d: number; h: number; full: boolean };
const INDOOR: Kind[] = [
  { w: 1.0, d: 0.6, h: 2.0, full: true }, { w: 0.6, d: 1.0, h: 2.0, full: true }, { w: 0.75, d: 0.55, h: 2.0, full: true }, { w: 0.55, d: 0.75, h: 2.0, full: true },
  { w: 1.4, d: 0.7, h: 1.0, full: false }, { w: 0.7, d: 1.4, h: 1.0, full: false }, { w: 1.0, d: 1.0, h: 1.0, full: false },
];
const OUT: Kind[] = [
  { w: 2.4, d: 1.4, h: 1.9, full: true }, { w: 1.4, d: 2.4, h: 1.9, full: true },
  { w: 1.2, d: 1.2, h: 1.0, full: false }, { w: 3.0, d: 0.5, h: 1.0, full: false }, { w: 0.5, d: 3.0, h: 1.0, full: false },
];
/** Material per area and height: what the box will become in Phase B (it also picks the procedural look). */
const MATS: Record<string, [Mat, Mat]> = {
  Garage: ['crate', 'steel'], Lab: ['counter', 'steel'], 'Server Room': ['steel', 'rack'], Corridor: ['steel', 'steel'],
  Lobby: ['fabric', 'steel'], Office: ['wood', 'steel'], Archive: ['wood', 'shelf'], 'Break Room': ['wood', 'steel'],
};
const SOLID_WALL = (b: Box) => b.y0 < 0.3 && (b.mat === 'brick' || (b.mat === 'concrete' && b.y1 > 3));
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
const inside = (b: Rect, r: Rect) => b.x0 >= r.x0 && b.x1 <= r.x1 && b.z0 >= r.z0 && b.z1 <= r.z1;

/** Lines and points the existing core tests (world, sim, net) probe: kept clear so those tests keep testing what they
 * were written for. A full-height piece may not cross a line; nothing may stand on a point's disc. */
const PROBE_LINES: [number, number, number, number][] = [[-5, -5, -5, 15], [-1.25, -2, -3, -8.5]];
const PROBE_POINTS: [number, number, number][] = [[-4, -3.2, 1.6], [-3, -8.5, 1.2], [-4, -3.5, 1.2], [-4, -0.5, 1.2]];
/** Lines bodies walk in the core tests (any height blocks them). */
const WALK_LINES: [number, number, number, number][] = [[-4, -3, -4, 0], [-1.25, -3, -1.25, 0]];
function crossesProbe(b: Box): boolean {
  for (const [x, z, r] of PROBE_POINTS) if (gap(b, { x0: x, x1: x, z0: z, z1: z }) < r) return true;
  for (const [ax, az, bx, bz] of WALK_LINES) for (let t = 0; t <= 1; t += 0.01) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (x > b.x0 - 0.45 && x < b.x1 + 0.45 && z > b.z0 - 0.45 && z < b.z1 + 0.45) return true;
  }
  if (b.y1 < 1.4) return false;
  for (const [ax, az, bx, bz] of PROBE_LINES) for (let t = 0; t <= 1; t += 0.01) {
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
    if (x > b.x0 - 0.35 && x < b.x1 + 0.35 && z > b.z0 - 0.35 && z < b.z1 + 0.35) return true;
  }
  return false;
}

/** Every attack spawn still reaches both sites and both sides of every door (plan, rules 3 and 4). */
function routesOk(boxes: Box[]): boolean {
  const nav = createNav(createWorld(boxes, MAP.panels, MAP.bounds)), open = { barricade: 6, wall: Infinity };
  for (const g of MAP.attackSpawns) {
    const s = g.points[0];
    for (const site of MAP.sites) if (!route(nav, s.x, s.z, (site.x0 + site.x1) / 2, (site.z0 + site.z1) / 2, open)) return false;
    for (const p of MAP.panels) {
      if (p.kind !== 'door') continue;
      const u = p.u0 + p.cols * CELL / 2;
      for (const side of [-0.8, 0.8]) {
        const x = p.axis === 'x' ? u : p.pos + side, z = p.axis === 'x' ? p.pos + side : u;
        if (x < MAP.bounds.x0 || x > MAP.bounds.x1 || z < MAP.bounds.z0 || z > MAP.bounds.z1) continue;
        if (!route(nav, s.x, s.z, x, z, open)) return false;
      }
    }
  }
  return true;
}
const STRUCTURAL = (o: Box) => o.mat === 'brick' || o.mat === 'plaster' || o.mat === 'trim' || (o.mat === 'concrete' && o.y1 > 3);
const banned = new Set<string>();
const placed: Box[] = [], all: Box[] = [...baseline];
const order = ['Corridor', 'Lobby', 'Office', 'Archive', 'South Yard', 'North Yard', 'West Lot', 'East Lane', 'Server Room', 'Break Room', 'Lab', 'Garage'];
for (const name of order) {
  const r = MAP.rooms.find(q => q.name === name)!, outdoor = OUTDOOR.has(name), kinds = outdoor ? OUT : INDOOR, step = outdoor ? 0.5 : 0.25;
  // Yards aim tighter than the 12 x 5 m target so an attacker meets cover every 8-10 m (plan, rule 6).
  const lim = outdoor ? [10, 5] : [4, 3], perTarget = outdoor ? 0 : 1.4, maxNew = outdoor ? 16 : 12;
  const count = () => all.filter(b => isFurniture(b) && (b.x0 + b.x1) / 2 >= r.x0 && (b.x0 + b.x1) / 2 < r.x1 && (b.z0 + b.z1) / 2 >= r.z0 && (b.z0 + b.z1) / 2 < r.z1).length;
  let added = 0, hasFull = false, hasWaist = false, fulls = 0;
  for (;;) {
    const emptyOk = !fits(r, lim[0] + 0.25, lim[1] + 0.25, [...all, ...SITE_CORES]), countOk = count() / area(r) * 10 >= perTarget;
    if ((emptyOk && countOk && ((hasFull && hasWaist) || outdoor)) || added >= maxNew) break;
    let best: { b: Box; score: number } | null = null;
    for (const k of kinds) {
      if (k.full && hasFull && !outdoor && !(emptyOk && !countOk) && added > 3 && Math.random() < 0) continue;
      // Grid positions, plus positions flush with the faces of solid things nearby (to stand against walls and pieces).
      const near = all.filter(o => o.solid && o.y0 < 0.3 && o.y1 > 0.3 && o.x1 > r.x0 - 0.5 && o.x0 < r.x1 + 0.5 && o.z1 > r.z0 - 0.5 && o.z0 < r.z1 + 0.5);
      const xs = new Set<number>(), zs = new Set<number>();
      for (let x = r.x0; x + k.w <= r.x1 + 1e-6; x += step) xs.add(+x.toFixed(2));
      for (let z = r.z0; z + k.d <= r.z1 + 1e-6; z += step) zs.add(+z.toFixed(2));
      for (const o of near) { xs.add(+o.x1.toFixed(3)); xs.add(+(o.x0 - k.w).toFixed(3)); zs.add(+o.z1.toFixed(3)); zs.add(+(o.z0 - k.d).toFixed(3)); }
      for (const x of xs) for (const z of zs) {
        const mat: Mat = outdoor ? (k.full ? 'steel' : k.w > 2 || k.d > 2 ? 'concrete' : 'crate') : MATS[name][k.full ? 1 : 0];
        const b: Box = { x0: +x.toFixed(2), y0: 0, z0: +z.toFixed(2), x1: +(x + k.w).toFixed(2), y1: k.h, z1: +(z + k.d).toFixed(2), mat, solid: true, draw: true };
        if (!inside(b, r)) continue;
        // Full-height pieces stand against a solid wall (touching it), never free in the room.
        // (Full-height pieces may also stand free: shelving stubs and tall units break the long looks, rule 6.)
        if (all.some(o => o.solid && o.y1 > 0.3 && o.y0 < b.y1 && (o.x0 < b.x1 - 0.01 && o.x1 > b.x0 + 0.01 && o.z0 < b.z1 - 0.01 && o.z1 > b.z0 + 0.01))) continue;
        if (banned.has(`${b.x0},${b.z0},${b.x1},${b.z1}`) || crossesProbe(b)) continue;
        // No chains: a new piece may touch walls and at most one other piece of furniture.
        if (all.filter(o => o.solid && !STRUCTURAL(o) && o.y0 < 0.3 && gap(b, o) <= 0.02).length > 1) continue;
        if (boxViolations(b, [...all, b]).length) continue;
        // Mixed heights (rule 5): the first full-height piece is encouraged, then at most about a third are full.
        if (k.full && hasFull && fulls >= 1 + added / 3) continue;
        const e = largestEmpty(r, [...all, b, ...SITE_CORES]), score = e.w * e.h - (k.full && !hasFull ? 6 : 0) - (!k.full && !hasWaist ? 6 : 0) + (k.full ? 0.5 : 0) + (outdoor ? 0 : 0.01 * Math.hypot(x - (r.x0 + r.x1) / 2, z - (r.z0 + r.z1) / 2));
        if (!best || score < best.score - 1e-9) best = { b, score };
      }
    }
    if (!best) break;
    if (!routesOk([...all, best.b])) { banned.add(`${best.b.x0},${best.b.z0},${best.b.x1},${best.b.z1}`); continue; }
    placed.push(best.b); all.push(best.b); added++; if (best.b.y1 >= 1.8) { hasFull = true; fulls++; } else hasWaist = true;
  }
  const e = largestEmpty(r, [...all, ...SITE_CORES]);
  console.error(`${name}: +${added}, ${count()} objects, ${(count() / area(r) * 10).toFixed(2)} per 10 m2, largest empty ${e.w} x ${e.h}${!fits(r, lim[0] + 0.25, lim[1] + 0.25, [...all, ...SITE_CORES]) ? '' : ' (OVER TARGET)'}`);
}
for (const b of placed) console.log(`  box(${b.x0}, 0, ${b.z0}, ${b.x1}, ${b.y1}, ${b.z1}, '${b.mat}');`);
