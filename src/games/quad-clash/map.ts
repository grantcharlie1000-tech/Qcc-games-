/** Quad Clash arenas as plain axis-aligned boxes, plus spawns, objective zones, pickup spots and decoration.
 * Every collider is a box; the renderer draws the same boxes, so what you see is what blocks you. */

export type Material = 'brick' | 'concrete' | 'wood' | 'metal' | 'locker' | 'planter' | 'roof' | 'crate' | 'bleacher' | 'trunk' | 'glass' | 'stage' | 'turf' | 'pillar';
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; mat: Material }
export interface Spawn { x: number; z: number; yaw: number; team: 0 | 1 }
export interface Zone { x: number; z: number; r: number; y: number; name: string }
export interface PickupSpot { x: number; y: number; z: number; kind: 'ammo' | 'grenade' }
export interface Tree { x: number; z: number; h: number }
export interface Sign { x: number; y: number; z: number; w: number; h: number; face: 'n' | 's' | 'e' | 'w'; text: string; sub?: string }
export type MapId = 'quad' | 'field';
export interface MapDef {
  readonly id: MapId;
  readonly name: string;
  readonly blurb: string;
  readonly hx: number;
  readonly hz: number;
  readonly wallHeight: number;
  readonly ground: 'courtyard' | 'field';
  readonly boxes: readonly Box[];
  readonly spawns: readonly Spawn[];
  readonly zones: readonly Zone[];
  readonly pickups: readonly PickupSpot[];
  readonly trees: readonly Tree[];
  readonly signs: readonly Sign[];
}

const box = (x0: number, z0: number, x1: number, z1: number, h: number, mat: Material, y0 = 0): Box =>
  ({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0, y1: y0 + h, mat });
/** A solid box centred on (x, z). */
const at = (x: number, z: number, w: number, d: number, h: number, mat: Material, y0 = 0) => box(x - w / 2, z - d / 2, x + w / 2, z + d / 2, h, mat, y0);

/** A solid staircase: `count` steps of `rise` each, `run` deep, climbing along +axis or -axis from `start`. */
function stairs(axis: 'x' | 'z', dir: 1 | -1, start: number, across0: number, across1: number, count: number, rise: number, run: number, mat: Material, base = 0): Box[] {
  const out: Box[] = [];
  for (let i = 0; i < count; i++) {
    const a = start + dir * i * run, b = start + dir * (i + 1) * run, h = base + (i + 1) * rise;
    out.push(axis === 'z' ? box(across0, a, across1, b, h, mat) : box(a, across0, b, across1, h, mat));
  }
  return out;
}

/** Solid perimeter buildings, so no one can leave the arena. */
function perimeter(hx: number, hz: number, h: number, t = 4): Box[] {
  return [
    box(-hx - t, -hz - t, hx + t, -hz, h, 'brick'),
    box(-hx - t, hz, hx + t, hz + t, h, 'brick'),
    box(-hx - t, -hz, -hx, hz, h, 'brick'),
    box(hx, -hz, hx + t, hz, h, 'brick'),
  ];
}

function quadMap(): MapDef {
  const hx = 30, hz = 30, b: Box[] = perimeter(hx, hz, 7.5);
  // Central assembly stage with steps on all four sides: the main Hold the Quad zone.
  b.push(box(-5, -5, 5, 5, 1.5, 'stage'));
  b.push(box(-2, -6, 2, -5, 1, 'concrete'), box(-2, -7, 2, -6, 0.5, 'concrete'));
  b.push(box(-2, 5, 2, 6, 1, 'concrete'), box(-2, 6, 2, 7, 0.5, 'concrete'));
  b.push(box(-6, -2, -5, 2, 1, 'concrete'), box(-7, -2, -6, 2, 0.5, 'concrete'));
  b.push(box(5, -2, 6, 2, 1, 'concrete'), box(6, -2, 7, 2, 0.5, 'concrete'));
  // Lectern on the stage gives a little cover.
  b.push(at(0, -3.2, 1.6, 0.6, 1.1, 'wood', 1.5));
  // Planter boxes ringing the stage.
  for (const [x, z, w, d] of [[-10, -10, 4, 1.2], [10, -10, 4, 1.2], [-10, 10, 4, 1.2], [10, 10, 4, 1.2], [-10, -10, 1.2, 4], [10, 10, 1.2, 4]] as const) b.push(at(x, z, w, d, 0.95, 'planter'));
  // Low cover walls on the east and west lanes.
  b.push(at(-16, 0, 1, 7, 1.25, 'concrete'), at(16, 0, 1, 7, 1.25, 'concrete'));
  b.push(at(0, 16.5, 7, 1, 1.25, 'concrete'));
  // North-east library balcony at 3 m on pillars, with a railing and stairs down to the quad.
  b.push(box(12, -26, 26, -18, 0.35, 'concrete', 2.75));
  b.push(box(12, -18.3, 21, -18, 0.95, 'metal', 3.1));
  for (const [x, z] of [[12.3, -18.3], [18, -18.3], [12.3, -25.7]] as const) b.push(at(x, z, 0.6, 0.6, 2.75, 'pillar'));
  for (let i = 0; i < 6; i++) b.push(box(22, -18 + i, 25.5, -17 + i, 3.1 - i * (3.1 / 6), 'concrete'));
  // North-west locker hall.
  for (const [x0, x1, z] of [[-26, -19, -20], [-17, -12, -20], [-26, -21, -14], [-19, -12, -14]] as const) b.push(box(x0, z - 0.35, x1, z + 0.35, 2.2, 'locker'));
  // South-west bike shed: roof on posts.
  b.push(box(-25, 16, -15, 23, 0.25, 'roof', 2.6));
  for (const [x, z] of [[-24.7, 16.3], [-15.3, 16.3], [-24.7, 22.7], [-15.3, 22.7]] as const) b.push(at(x, z, 0.3, 0.3, 2.6, 'metal'));
  b.push(at(-20, 25.5, 6, 1.2, 1.2, 'crate'));
  // South-east cafeteria tables and a crate stack that climbs onto the canteen roof edge.
  for (const [x, z] of [[14, 14], [20, 14], [14, 20], [20, 20]] as const) b.push(at(x, z, 2.6, 1.1, 0.8, 'wood'));
  b.push(at(25, 25, 1.4, 1.4, 1.1, 'crate'), at(27.2, 25, 1.4, 1.4, 2.2, 'crate'));
  // Scattered crates.
  for (const [x, z, s] of [[-6, 21, 1.3], [7, -21, 1.3], [-22, 4, 1.2], [22, -5, 1.2], [-3, -14, 1.1], [4, 13, 1.1], [-13, 25, 1.3]] as const) b.push(at(x, z, s, s, s, 'crate'));
  // Tree trunks (the canopy is decoration only).
  const trees: Tree[] = [{ x: -8, z: 23, h: 5 }, { x: 8, z: -24, h: 5.5 }, { x: 22, z: 6, h: 5 }, { x: -22, z: -6, h: 4.6 }, { x: 25, z: -12, h: 5.2 }, { x: -25, z: 10, h: 4.8 }];
  for (const t of trees) b.push(at(t.x, t.z, 0.6, 0.6, t.h * 0.6, 'trunk'));
  const spawns: Spawn[] = [
    { x: -24, z: -3, yaw: -Math.PI / 2, team: 0 }, { x: -26, z: 2, yaw: -Math.PI / 2, team: 0 }, { x: -20, z: 9, yaw: -Math.PI / 2, team: 0 },
    { x: -20, z: -9, yaw: -Math.PI / 2, team: 0 }, { x: -27, z: 24, yaw: -Math.PI * 0.75, team: 0 }, { x: -27, z: -24, yaw: -Math.PI / 4, team: 0 },
    { x: 24, z: 3, yaw: Math.PI / 2, team: 1 }, { x: 26, z: -2, yaw: Math.PI / 2, team: 1 }, { x: 20, z: -9, yaw: Math.PI / 2, team: 1 },
    { x: 20, z: 9, yaw: Math.PI / 2, team: 1 }, { x: 27, z: 22, yaw: Math.PI * 0.75, team: 1 }, { x: 10, z: -27, yaw: Math.PI / 4, team: 1 },
  ];
  return {
    id: 'quad', name: 'The Quad', blurb: 'The QCC courtyard: assembly stage, library balcony, locker hall and bike shed.', hx, hz, wallHeight: 7.5, ground: 'courtyard', boxes: b, spawns, trees,
    zones: [{ x: 0, z: 0, r: 4.6, y: 1.5, name: 'Assembly Stage' }, { x: 19, z: -22, r: 3.8, y: 3.1, name: 'Library Balcony' }, { x: -20, z: 19.5, r: 3.8, y: 0, name: 'Bike Shed' }, { x: -19, z: -17, r: 3.6, y: 0, name: 'Locker Hall' }],
    pickups: [{ x: 0, y: 1.5, z: 0, kind: 'grenade' }, { x: 19, y: 3.1, z: -23, kind: 'ammo' }, { x: -20, y: 0, z: 19.5, kind: 'ammo' }, { x: -19, y: 0, z: -17, kind: 'grenade' }, { x: 17, y: 0, z: 17, kind: 'ammo' }, { x: 0, y: 0, z: -20, kind: 'ammo' }, { x: 0, y: 0, z: 22, kind: 'grenade' }],
    signs: [
      { x: 0, y: 5.2, z: -30, w: 9, h: 2.2, face: 's', text: 'QCC', sub: 'KIA KAHA' },
      { x: 0, y: 5.2, z: 30, w: 8, h: 1.8, face: 'n', text: 'QUAD CLASH', sub: 'ASSEMBLY 1PM' },
      { x: -30, y: 4.5, z: 0, w: 7, h: 1.6, face: 'e', text: 'KŌWHAI', sub: 'HOUSE' },
      { x: 30, y: 4.5, z: 0, w: 7, h: 1.6, face: 'w', text: 'MOANA', sub: 'HOUSE' },
    ],
  };
}

function fieldMap(): MapDef {
  const hx = 34, hz = 24, b: Box[] = perimeter(hx, hz, 6);
  // North grandstand: four rising bleacher rows, open to climb from the field.
  b.push(...stairs('z', -1, -15, -18, 18, 4, 0.55, 2, 'bleacher'));
  b.push(box(-18, -24, 18, -23, 3.2, 'concrete'));
  // South pavilion: a clubhouse with a flat roof deck at 3.5 m and an outside staircase.
  b.push(box(-7, 15, 7, 24, 3.5, 'brick'));
  b.push(box(-7, 14.7, 7, 15, 1, 'metal', 3.5));
  for (let i = 0; i < 7; i++) b.push(box(7 + i, 15, 8 + i, 18, 3.5 - i * 0.5, 'concrete'));
  // Goalposts at each end (thin posts and a crossbar).
  for (const x of [-30, 30]) {
    b.push(at(x, -3.6, 0.25, 0.25, 2.5, 'metal'), at(x, 3.6, 0.25, 0.25, 2.5, 'metal'), box(x - 0.12, -3.6, x + 0.12, 3.6, 0.2, 'metal', 2.5));
  }
  // Equipment cover: kit bags, crates and the line-marker cart across the pitch.
  for (const [x, z, w, d, h] of [[-18, -4, 3, 1.2, 1.1], [18, 4, 3, 1.2, 1.1], [-10, 8, 1.4, 1.4, 1.4], [10, -8, 1.4, 1.4, 1.4], [0, -7, 5, 1, 1.2], [0, 7, 5, 1, 1.2], [-24, 12, 2.4, 2.4, 1.2], [24, -12, 2.4, 2.4, 1.2], [-24, -10, 1.2, 4, 1.25], [24, 10, 1.2, 4, 1.25]] as const) {
    b.push(at(x, z, w, d, h, h > 1.3 ? 'crate' : 'concrete'));
  }
  // Two scoreboard towers with a ladder-free step stack.
  b.push(box(-30, -20.5, -27, -17.5, 3, 'brick'), box(-27, -20, -26, -18, 2, 'crate'), box(-26, -20, -24, -18, 1, 'crate'));
  b.push(box(27, 17.5, 30, 20.5, 3, 'brick'), box(26, 18, 27, 20, 2, 'crate'), box(24, 18, 26, 20, 1, 'crate'));
  const trees: Tree[] = [{ x: -31, z: 20, h: 5.5 }, { x: 31, z: -20, h: 5.5 }, { x: -12, z: 20, h: 4.6 }, { x: 13, z: -20.5, h: 4.4 }];
  for (const t of trees) b.push(at(t.x, t.z, 0.6, 0.6, t.h * 0.6, 'trunk'));
  const spawns: Spawn[] = [
    { x: -30, z: -8, yaw: -Math.PI / 2, team: 0 }, { x: -30, z: 8, yaw: -Math.PI / 2, team: 0 }, { x: -26, z: 0, yaw: -Math.PI / 2, team: 0 },
    { x: -20, z: 16, yaw: -Math.PI * 0.75, team: 0 }, { x: -22, z: -13, yaw: -Math.PI / 4, team: 0 }, { x: -14, z: 1, yaw: -Math.PI / 2, team: 0 },
    { x: 30, z: 8, yaw: Math.PI / 2, team: 1 }, { x: 30, z: -8, yaw: Math.PI / 2, team: 1 }, { x: 26, z: 0, yaw: Math.PI / 2, team: 1 },
    { x: 20, z: -16, yaw: Math.PI / 4, team: 1 }, { x: 22, z: 13, yaw: Math.PI * 0.75, team: 1 }, { x: 14, z: -1, yaw: Math.PI / 2, team: 1 },
  ];
  return {
    id: 'field', name: 'Sports Field', blurb: 'Grandstand, pavilion roof and goalposts. Long sightlines for the snipers.', hx, hz, wallHeight: 6, ground: 'field', boxes: b, spawns, trees,
    zones: [{ x: 0, z: 0, r: 5, y: 0, name: 'Centre Circle' }, { x: 0, z: 19.5, r: 4.2, y: 3.5, name: 'Pavilion Roof' }, { x: 0, z: -20, r: 4.4, y: 1.1, name: 'Grandstand' }],
    pickups: [{ x: 0, y: 0, z: 0, kind: 'grenade' }, { x: 0, y: 3.5, z: 20, kind: 'ammo' }, { x: 0, y: 2.2, z: -20, kind: 'ammo' }, { x: -28.5, y: 3, z: -19, kind: 'grenade' }, { x: 28.5, y: 3, z: 19, kind: 'grenade' }, { x: -20, y: 0, z: 0, kind: 'ammo' }, { x: 20, y: 0, z: 0, kind: 'ammo' }],
    signs: [
      { x: 0, y: 4.6, z: 24, w: 10, h: 1.7, face: 'n', text: 'QCC SPORTS', sub: 'PAVILION' },
      { x: 0, y: 4.4, z: -24, w: 12, h: 1.6, face: 's', text: 'GO QCC!', sub: 'HOME OF THE CLASH' },
    ],
  };
}

const MAPS: Readonly<Record<MapId, MapDef>> = Object.freeze({ quad: quadMap(), field: fieldMap() });
export const MAP_IDS: readonly MapId[] = ['quad', 'field'];
export const isMapId = (v: unknown): v is MapId => v === 'quad' || v === 'field';
export const getMap = (id: MapId): MapDef => MAPS[id];
