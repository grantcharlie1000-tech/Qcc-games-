/** Tidewater Annex: the one Breachline map. An original single-storey research annex inside a walled yard.
 * Outer walls are solid brick with barricaded doors and windows; almost every inner wall is destructible.
 * Coordinates are metres: +X east, +Z south, the floor is y = 0. Walls sit on a half-metre grid for navigation. */
import { CELL, SOFT_H, WALL_H } from './config';
import { createWorld, type Bounds, type Box, type Mat, type PanelDef, type World } from './world';

export type FloorMat = 'asphalt' | 'grass' | 'slab' | 'tile' | 'lino' | 'carpet' | 'planks' | 'raised' | 'check';
export interface Rect { x0: number; z0: number; x1: number; z1: number }
export interface Floor extends Rect { mat: FloorMat }
export interface Room extends Rect { name: string }
export interface Site extends Rect { id: 'A' | 'B'; name: string }
export interface Spawn { x: number; z: number; yaw: number }
export interface Lamp { x: number; y: number; z: number; color: readonly [number, number, number]; range: number }
export interface Post { x: number; z: number; lx: number; lz: number }
export interface MapDef {
  name: string;
  bounds: Bounds;
  building: Rect;
  boxes: Box[];
  panels: PanelDef[];
  floors: Floor[];
  rooms: Room[];
  sites: [Site, Site];
  attackSpawns: { name: string; points: Spawn[] }[];
  defendSpawns: Spawn[];
  lamps: Lamp[];
  /** Where defending bots hold, and where they look, for each site. */
  posts: [Post[], Post[]];
  roam: Post[];
  /** Points on the walls defending bots like to reinforce, for each site. */
  reinforce: [{ x: number; z: number }[], { x: number; z: number }[]];
}

interface Opening { a: number; b: number; type: 'door' | 'window' }
const DOOR_H = 2.25, SILL = 1, HARD_T = 0.3, SOFT_T = 0.14;

function build(): MapDef {
  const boxes: Box[] = [], panels: PanelDef[] = [], posts = new Set<string>();
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: Mat, solid = true, draw = true) => { boxes.push({ x0, y0, z0, x1, y1, z1, mat, solid, draw }); };
  /** A slab lying along a wall line. */
  const slab = (axis: 'x' | 'z', pos: number, a: number, b: number, y0: number, y1: number, t: number, mat: Mat) => {
    if (b - a < 1e-6 || y1 - y0 < 1e-6) return;
    if (axis === 'x') box(a, y0, pos - t / 2, b, y1, pos + t / 2, mat); else box(pos - t / 2, y0, a, pos + t / 2, y1, b, mat);
  };
  const post = (axis: 'x' | 'z', pos: number, u: number) => {
    const x = axis === 'x' ? u : pos, z = axis === 'x' ? pos : u, key = `${x},${z}`;
    if (posts.has(key)) return;
    posts.add(key);
    box(x - 0.11, 0, z - 0.11, x + 0.11, WALL_H, z + 0.11, 'trim');
  };
  const opening = (axis: 'x' | 'z', pos: number, o: Opening, closed: boolean, t: number, mat: Mat) => {
    const cols = Math.round((o.b - o.a) / CELL);
    if (o.type === 'door') {
      slab(axis, pos, o.a, o.b, DOOR_H, WALL_H, t, mat);
      panels.push({ axis, pos, u0: o.a, y0: 0, cols, rows: Math.round(DOOR_H / CELL), kind: 'door', closed });
    } else {
      slab(axis, pos, o.a, o.b, 0, SILL, t, mat);
      slab(axis, pos, o.a, o.b, DOOR_H, WALL_H, t, mat);
      panels.push({ axis, pos, u0: o.a, y0: SILL, cols, rows: Math.round((DOOR_H - SILL) / CELL), kind: 'window', closed });
    }
  };
  /** Solid outer wall with barricaded openings. */
  const hardWall = (axis: 'x' | 'z', pos: number, a: number, b: number, openings: Opening[]) => {
    let at = a;
    for (const o of [...openings].sort((p, q) => p.a - q.a)) {
      slab(axis, pos, at, o.a, 0, WALL_H + 0.5, HARD_T, 'brick');
      opening(axis, pos, o, true, HARD_T, 'brick');
      slab(axis, pos, o.a, o.b, WALL_H, WALL_H + 0.5, HARD_T, 'brick');
      at = o.b;
    }
    slab(axis, pos, at, b, 0, WALL_H + 0.5, HARD_T, 'brick');
  };
  /** Destructible inner wall: panels of at most four metres between posts, under a solid header. */
  const softWall = (axis: 'x' | 'z', pos: number, a: number, b: number, breaks: number[], openings: Opening[]) => {
    const sorted = [...openings].sort((p, q) => p.a - q.a);
    const cuts = [...new Set([a, b, ...breaks.filter(v => v > a && v < b), ...sorted.flatMap(o => [o.a, o.b])])].sort((p, q) => p - q);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const c0 = cuts[i], c1 = cuts[i + 1], o = sorted.find(v => v.a === c0 && v.b === c1);
      post(axis, pos, c0); post(axis, pos, c1);
      if (o) { opening(axis, pos, o, false, SOFT_T, 'plaster'); continue; }
      slab(axis, pos, c0, c1, SOFT_H, WALL_H, SOFT_T, 'plaster');
      const total = Math.round((c1 - c0) / CELL), n = Math.ceil((c1 - c0) / 4);
      for (let k = 0; k < n; k++) {
        const s = Math.floor(total * k / n), e = Math.floor(total * (k + 1) / n);
        panels.push({ axis, pos, u0: c0 + s * CELL, y0: 0, cols: e - s, rows: Math.round(SOFT_H / CELL), kind: 'wall', closed: true });
        if (k > 0) post(axis, pos, c0 + s * CELL);
      }
    }
  };
  const door = (a: number, b: number): Opening => ({ a, b, type: 'door' });
  const win = (a: number, b: number): Opening => ({ a, b, type: 'window' });

  // ---- Shell: 30 m x 20 m ----
  hardWall('x', -10, -15, 15, [win(-12, -10.5), win(-3.5, -2), win(1, 2.5), door(9, 10.5)]);
  hardWall('x', 10, -15, 15, [door(-12, -10.5), win(-4.5, -3), win(3, 4.5), win(11, 12.5)]);
  hardWall('z', -15, -10, 10, [door(-7.5, -4.5), win(-1.5, 0), win(4.5, 6)]);
  hardWall('z', 15, -10, 10, [win(-6.5, -5), door(-1.5, 0), win(5, 6.5)]);
  // Corner piers hide where the outer walls meet.
  for (const [x, z] of [[-15, -10], [15, -10], [-15, 10], [15, 10]]) box(x - 0.22, 0, z - 0.22, x + 0.22, WALL_H + 0.5, z + 0.22, 'concrete');

  // ---- Inner walls ----
  softWall('x', -2, -15, 15, [-6, 4], [door(-11, -9.5), door(-2, -0.5), door(8, 9.5)]);
  softWall('x', 1, -15, 15, [-7, 0, 8], [door(-9.5, -8), door(-3, -1.5), door(5.5, 7), door(9, 10.5)]);
  softWall('z', -6, -10, -2, [], [door(-7, -5.5)]);
  softWall('z', 4, -10, -2, [], [door(-5, -3.5)]);
  softWall('z', -7, 1, 10, [], [door(6, 7.5)]);
  softWall('z', 0, 1, 10, [], [door(3, 4.5)]);
  softWall('z', 8, 1, 10, [], [door(6.5, 8)]);

  // The ceiling stops grenades and stray rounds; it is drawn separately.
  box(-15, WALL_H, -10, 15, WALL_H + 0.3, 10, 'concrete', true, false);

  // ---- Furniture and cover (solid; low pieces can be shot over) ----
  // Garage
  box(-12.59, 0, -9.345, -8.21, 1.42, -7.555, 'van');
  box(-14.65, 0, -2.75, -12.1, 0.92, -2.15, 'counter');
  box(-7.5, 0, -3.5, -6.5, 1, -2.5, 'crate'); box(-7.4, 1, -3.4, -6.7, 1.7, -2.7, 'crate');
  box(-14.6, 0, -9.6, -13.6, 1, -8.6, 'crate');
  // Lab (site A)
  box(-4.2, 0, -6.6, -1.2, 0.95, -5.6, 'counter'); box(0.2, 0, -6.6, 3.2, 0.95, -5.6, 'counter');
  box(-1.5, 0, -9.8, 0.5, 2, -9.25, 'steel');
  box(-5.8, 0, -9.75, -5, 2, -8.95, 'steel');
  box(2.9, 0, -2.75, 3.75, 1.2, -2.2, 'rack');
  // Server room
  box(6, 0, -8.2, 10, 2.1, -7.4, 'rack'); box(6, 0, -5.4, 10, 2.1, -4.6, 'rack'); box(11.6, 0, -4.2, 14.2, 2.1, -3.4, 'rack');
  box(13.6, 0, -9.6, 14.6, 1, -8.6, 'crate');
  // Corridor
  box(13.85, 0, 0.2, 14.7, 1.95, 0.88, 'steel');
  box(-14.6, 0, 0.3, -13, 0.5, 0.85, 'wood');
  box(-0.5, 0, 0.42, 0.5, 1, 0.9, 'counter');
  // Lobby
  box(-12.6, 0, 4.2, -9.6, 1.1, 4.95, 'wood'); box(-12.6, 0, 4.95, -11.95, 1.1, 6.4, 'wood');
  box(-8.2, 0, 2.2, -7.3, 0.8, 4.4, 'fabric');
  box(-14.6, 0, 8.9, -13.9, 1, 9.6, 'crate');
  // Office
  box(-6.5, 0, 3.4, -4.9, 0.76, 4.2, 'wood'); box(-5.8, 0, 8.5, -4.2, 0.76, 9.3, 'wood'); box(-2.6, 0, 6.5, -1, 0.76, 7.3, 'wood');
  box(-0.65, 0, 7.6, -0.15, 1.35, 9.6, 'steel');
  // Archive (site B)
  box(1.4, 0, 5.6, 1.9, 2.2, 9.2, 'shelf'); box(5.4, 0, 5.2, 5.9, 2.2, 6.2, 'shelf'); box(5.4, 0, 8.4, 5.9, 2.2, 9.6, 'shelf');
  box(2.8, 0, 2.6, 4.6, 0.8, 3.6, 'wood');
  box(7.1, 0, 1.3, 7.8, 1.3, 2.5, 'steel');
  // Break room
  box(14.3, 0, 1.4, 14.85, 0.95, 4.4, 'counter'); box(10.4, 0, 4.6, 12.2, 0.78, 5.8, 'wood');
  box(14, 0, 8.9, 14.8, 2, 9.7, 'steel'); box(8.3, 0, 2, 9.15, 0.8, 4, 'fabric');

  // ---- Yard ----
  const B: Bounds = { x0: -28, z0: -22, x1: 28, z1: 22 };
  box(B.x0 - 0.6, 0, B.z0 - 0.6, B.x1 + 0.6, 3.4, B.z0, 'concrete'); box(B.x0 - 0.6, 0, B.z1, B.x1 + 0.6, 3.4, B.z1 + 0.6, 'concrete');
  box(B.x0 - 0.6, 0, B.z0, B.x0, 3.4, B.z1, 'concrete'); box(B.x1, 0, B.z0, B.x1 + 0.6, 3.4, B.z1, 'concrete');
  // South
  box(-6, 0, 14.5, 0, 2.6, 17, 'container'); box(5.11, 0, 14.26, 9.49, 1.42, 16.04, 'van');
  box(-13, 0, 13, -10.6, 0.95, 13.45, 'concrete'); box(9.6, 0, 12.5, 12, 0.95, 12.95, 'concrete');
  box(1.6, 0, 12.6, 2.8, 1.1, 13.8, 'crate');
  box(17, 0, 11.6, 19.2, 1.3, 12.8, 'steel');
  box(-21, 0, 15, -18.5, 2.6, 21, 'container');
  // West
  box(-21.5, 0, -9, -19, 2.6, -3, 'container'); box(-19.2, 0, 1.6, -18.75, 0.95, 4, 'concrete');
  box(-23, 0, 5.5, -21.1, 1.75, 10, 'van'); box(-18, 0, -1.4, -16.9, 1.1, -0.3, 'crate');
  // North and east
  box(14, 0, -15.5, 20, 2.6, -13, 'container'); box(8, 0, -13.5, 10.4, 0.95, -13.05, 'concrete');
  box(19.4, 0, -8.6, 20.6, 1.2, -7.4, 'crate'); box(19, 0, 1.5, 22.5, 2.6, 5, 'concrete');
  box(-24, 0, -18.5, -21.5, 3, -16, 'steel'); box(-4, 0, -14.6, -1.6, 0.95, -14.15, 'concrete');
  box(-9.5, 0, -17, -4.5, 2.6, -14.9, 'container'); box(17.6, 0, -2.5, 18.05, 0.95, -0.1, 'concrete');
  box(23.5, 0, 12, 25.9, 2.6, 18, 'container');

  const building: Rect = { x0: -15, z0: -10, x1: 15, z1: 10 };
  const rooms: Room[] = [
    { name: 'Garage', x0: -15, z0: -10, x1: -6, z1: -2 }, { name: 'Lab', x0: -6, z0: -10, x1: 4, z1: -2 }, { name: 'Server Room', x0: 4, z0: -10, x1: 15, z1: -2 },
    { name: 'Corridor', x0: -15, z0: -2, x1: 15, z1: 1 },
    { name: 'Lobby', x0: -15, z0: 1, x1: -7, z1: 10 }, { name: 'Office', x0: -7, z0: 1, x1: 0, z1: 10 }, { name: 'Archive', x0: 0, z0: 1, x1: 8, z1: 10 }, { name: 'Break Room', x0: 8, z0: 1, x1: 15, z1: 10 },
    { name: 'South Yard', x0: -28, z0: 10, x1: 28, z1: 22 }, { name: 'North Yard', x0: -28, z0: -22, x1: 28, z1: -10 }, { name: 'West Lot', x0: -28, z0: -10, x1: -15, z1: 10 }, { name: 'East Lane', x0: 15, z0: -10, x1: 28, z1: 10 },
  ];
  const floorMats: FloorMat[] = ['slab', 'tile', 'raised', 'lino', 'tile', 'carpet', 'planks', 'check'];
  const floors: Floor[] = [
    { ...B, mat: 'asphalt' },
    { x0: -28, z0: -22, x1: -17.5, z1: -11.5, mat: 'grass' }, { x0: 21, z0: 6.5, x1: 28, z1: 11, mat: 'grass' }, { x0: -28, z0: 11.5, x1: -22, z1: 22, mat: 'grass' }, { x0: 10.5, z0: 17.5, x1: 22, z1: 22, mat: 'grass' },
    ...rooms.slice(0, 8).map((r, i) => ({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, mat: floorMats[i] })),
  ];
  const warm = [1, 0.86, 0.66] as const, cool = [0.72, 0.86, 1] as const, white = [1, 0.96, 0.9] as const;
  const lamp = (x: number, z: number, color: readonly [number, number, number], range = 8.5): Lamp => ({ x, y: WALL_H - 0.15, z, color, range });
  const S = (x: number, z: number, yaw: number): Spawn => ({ x, z, yaw });
  const P = (x: number, z: number, lx: number, lz: number): Post => ({ x, z, lx, lz });
  return {
    name: 'Tidewater Annex', bounds: B, building, boxes, panels, floors, rooms,
    sites: [{ id: 'A', name: 'Lab', x0: -6, z0: -10, x1: 4, z1: -2 }, { id: 'B', name: 'Archive', x0: 0, z0: 1, x1: 8, z1: 10 }],
    attackSpawns: [
      { name: 'South Yard', points: [-2, -1, 0, 1, 2].map(i => S(2.5 + i * 1.1, 19.6, 0)) },
      { name: 'West Lot', points: [-2, -1, 0, 1, 2].map(i => S(-25.6, 0.5 + i * 1.1, -Math.PI / 2)) },
      { name: 'North Yard', points: [-2, -1, 0, 1, 2].map(i => S(22.5 + i * 1.1, -18.8, Math.PI * 0.75)) },
    ],
    defendSpawns: [S(-3, -3.4, Math.PI), S(1.2, -3.6, Math.PI), S(1, 2.2, 0), S(6.6, 3.2, 0), S(3.7, 4.8, 0), S(-1, -8, 0)],
    lamps: [
      lamp(-10.5, -6, white, 9.5), lamp(-3.5, -6, cool), lamp(1.5, -6, cool), lamp(7, -6.3, cool, 7.5), lamp(12, -6.3, cool, 7.5),
      lamp(-12, -0.5, white, 6.5), lamp(-6, -0.5, white, 6.5), lamp(0, -0.5, white, 6.5), lamp(6, -0.5, white, 6.5), lamp(12, -0.5, white, 6.5),
      lamp(-11, 3.4, warm), lamp(-11, 7.6, warm), lamp(-3.5, 3.4, warm), lamp(-3.5, 7.6, warm), lamp(3.4, 3.4, warm), lamp(4.2, 7.6, warm), lamp(11.5, 3.4, white), lamp(11.5, 7.6, white),
    ],
    posts: [
      [P(-5.3, -8.3, -1.2, -2), P(3.3, -8.8, -6, -6.2), P(-2.8, -7.3, 4, -4.2), P(2.3, -3.2, -2.7, -10), P(0.9, -7.4, -1.2, -2)],
      [P(0.7, 9.3, 6.2, 1), P(7.2, 9.2, 0, 3.7), P(7.3, 3.2, 0, 3.7), P(3.7, 4.5, 8, 7.2), P(0.7, 1.8, 3.7, 10)],
    ],
    roam: [P(-8, -0.5, 15, -0.5), P(-9, 8, -11.2, 10), P(12.6, -2.9, 9.7, -10), P(11, 8, 15, 5.7)],
    reinforce: [
      [{ x: -4, z: -2 }, { x: 2, z: -2 }, { x: -6, z: -4 }, { x: 4, z: -8 }, { x: -6, z: -8.5 }],
      [{ x: 2, z: 1 }, { x: 0, z: 7 }, { x: 8, z: 3 }, { x: 8, z: 9 }, { x: 4, z: 1 }],
    ],
  };
}

export const MAP: MapDef = build();
export const newWorld = (): World => createWorld(MAP.boxes, MAP.panels, MAP.bounds);
export function roomAt(x: number, z: number): string {
  for (const r of MAP.rooms) if (x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1) return r.name;
  return 'Yard';
}
export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 + pad && x <= r.x1 - pad && z >= r.z0 + pad && z <= r.z1 - pad;
export function siteAt(x: number, z: number): 0 | 1 | -1 {
  return inRect(MAP.sites[0], x, z, 0.4) ? 0 : inRect(MAP.sites[1], x, z, 0.4) ? 1 : -1;
}
