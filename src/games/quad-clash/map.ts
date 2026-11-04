/** Quad Clash arenas as plain axis-aligned boxes, plus spawns, objective zones, pickup spots and decoration.
 * Every collider is a box; the renderer draws the same boxes, so what you see is what blocks you. */

import { CAMPUS_BUILDINGS, CAMPUS_COURTS, CAMPUS_POOL, campusPoint, campusRect } from './campus-layout';

export type Material = 'brick' | 'concrete' | 'wood' | 'metal' | 'locker' | 'planter' | 'roof' | 'crate' | 'bleacher' | 'trunk' | 'glass' | 'stage' | 'turf' | 'pillar' | 'cladding' | 'campus-roof' | 'fence' | 'roof-light' | 'roof-muted' | 'pool-edge' | 'bin' | 'recycling';
export interface Box { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; mat: Material }
export interface Spawn { x: number; z: number; yaw: number; team: 0 | 1 }
export interface Zone { x: number; z: number; r: number; y: number; name: string }
export interface PickupSpot { x: number; y: number; z: number; kind: 'ammo' | 'grenade' }
export interface Tree { x: number; z: number; h: number }
export interface Sign { x: number; y: number; z: number; w: number; h: number; face: 'n' | 's' | 'e' | 'w'; text: string; sub?: string }
export type MapId = 'quad' | 'field' | 'campus';
export interface Surface { x0: number; z0: number; x1: number; z1: number; kind: 'paving' | 'court' | 'asphalt' | 'timber' | 'pool' | 'grass' | 'parking'; orientation?: 'x' | 'z'; divisions?: number }
export interface MapDef {
  readonly id: MapId;
  readonly name: string;
  readonly revision?: number;
  readonly blurb: string;
  readonly hx: number;
  readonly hz: number;
  readonly wallHeight: number;
  readonly boundPlayers?: boolean;
  readonly ground: 'courtyard' | 'field' | 'campus';
  readonly surfaces?: readonly Surface[];
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

/** School furniture uses the same batched boxes as the arena walls, keeping collision and visuals aligned. */
function addCampusClutter(b: Box[], signs: Sign[]) {
  const bench = (x: number, z: number, along: 'x'|'z' = 'x') => {
    const part = (dx: number, dz: number, w: number, d: number, h: number, mat: Material, y = 0) =>
      b.push(along === 'x' ? at(x+dx,z+dz,w,d,h,mat,y) : at(x+dz,z+dx,d,w,h,mat,y));
    part(0,0,2.3,0.5,0.12,'wood',0.42);
    for(const x of [-0.85,0.85]) { part(x,0,0.14,0.45,0.42,'metal');part(x,0.27,0.12,0.12,0.95,'metal'); }
    part(0,0.27,2.3,0.12,0.42,'wood',0.58);
  };
  const table = (x: number, z: number, seats = false) => {
    b.push(at(x,z,2.6,1.1,0.12,'wood',0.8));
    for(const dx of [-0.95,0.95]) for(const dz of [-0.35,0.35]) b.push(at(x+dx,z+dz,0.14,0.14,0.8,'metal'));
    if(seats) {
      for(const dz of [-0.95,0.95]) b.push(at(x,z+dz,2.6,0.35,0.12,'wood',0.42));
      for(const dx of [-0.95,0.95]) b.push(at(x+dx,z,0.14,2.25,0.12,'metal',0.2));
    }
  };
  // Benches sit beside paths rather than in doorway axes or the roof staircase.
  for(const [x,z] of [[-29,-22],[-5,-24],[18,-23],[18.5,24.5],[-39,41.1],[-29,41.1],[38,37]] as const) bench(x,z);
  bench(-47,25,'z');bench(-47,32.5,'z');
  for(const [x,z] of [[-24,-35],[25,-35],[7.5,22.2]] as const) table(x,z,true);
  // Desks and locker banks furnish the larger interiors while leaving their centre routes open.
  for(const [x,z] of [[-5,-7.8],[4,3],[25,13],[31,29]] as const) table(x,z);
  b.push(at(-9.3,-7,0.65,3.0,1.8,'locker'),at(-9.3,3,0.65,2.4,1.8,'locker'));
  // Small colour-coded bins have lids and wheels; labels are procedural textures.
  for(const [i,[x,z]] of [[-27,-20],[20,-21],[-46.5,17],[-30.5,15],[-21.5,54.4],[19.4,26],[35,11],[44.4,39.3]].entries()) {
    const mat: Material = i%2 ? 'recycling' : 'bin';
    b.push(at(x,z,0.65,0.65,0.9,mat,0.08),at(x,z,0.73,0.73,0.09,'metal',0.98),
      at(x-0.22,z+0.23,0.12,0.18,0.14,'metal'),at(x+0.22,z+0.23,0.12,0.18,0.14,'metal'));
  }
  // A bank of U-shaped bike racks north of the courts.
  for(let i=0;i<4;i++) {
    const x=-36+i*1.2,z=14.5;
    b.push(at(x,z-0.65,0.12,0.12,0.9,'metal'),at(x,z+0.65,0.12,0.12,0.9,'metal'),at(x,z,0.12,1.42,0.12,'metal',0.9));
  }
  // Green planters add both softer scenery and low cover to the paved areas.
  for(const [x,z,w,d] of [[-13,-18,3,1],[11,-15.5,3,1],[-31,10,2.8,0.9],[18.5,22,2.4,1],[-21,39,2.4,0.9],[32,37,2.4,0.9]] as const)
    b.push(at(x,z,w,d,0.72,'planter'));
  // Sports storage carts: a low case, chunky wheels and an exposed handle.
  for(const [x,z] of [[-30,-29],[30,-30]] as const) {
    b.push(at(x,z,1.6,0.9,0.65,'crate',0.2),at(x+0.7,z,0.1,0.75,0.1,'metal',1.1));
    for(const dz of [-0.35,0.35]) {
      b.push(at(x+0.7,z+dz,0.1,0.1,0.9,'metal',0.2));
      for(const dx of [-0.55,0.55]) b.push(at(x+dx,z+dz,0.22,0.18,0.25,'metal'));
    }
  }
  // Stackable equipment cases beside the field and inside the long west hall.
  for(const [x,z] of [[-33,-40],[33,-41],[-7.5,13.5],[-1.5,30]] as const) {
    b.push(at(x,z,1.4,1,0.65,'crate'),at(x+0.15,z,1.0,0.8,0.6,'crate',0.65));
  }
  for(const [x,z,face,text,sub] of [[-28,15.7,'s','SPORTS','EQUIPMENT RETURN'],[9,56.5,'n','QCC','KIA KAHA']] as const) {
    b.push(at(x,z,2,0.15,1.2,'wood',0.9),at(x-0.85,z,0.12,0.15,2.05,'metal'),at(x+0.85,z,0.12,0.15,2.05,'metal'));
    signs.push({x,y:1.5,z:z+(face==='s'?0.08:-0.08),w:1.85,h:1.05,face,text,sub});
  }
}

/** Satellite-screenshot layout. Building outlines, courts, pool and field follow the supplied image;
 * dimensions are scaled for play and all heights/interiors/doors remain estimates. */
function campusMap(): MapDef {
  const hx = 50, hz = 60, b: Box[] = [];
  b.push(box(-51, -61, 51, -60, 3.2, 'fence'), box(-51, 60, 51, 61, 3.2, 'fence'),
    box(-51, -60, -50, 60, 3.2, 'fence'), box(50, -60, 51, 60, 3.2, 'fence'));
  const signs: Sign[] = [];
  for (const building of CAMPUS_BUILDINGS) {
    const {x0,z0,x1,z1} = campusRect(building.rect), h = building.height;
    const cx = (x0+x1)/2, cz = (z0+z1)/2, t = 0.28;
    // Doorways are inferred for play, sized to retain the narrow annex footprints without inverted walls.
    const doorX = Math.min(1.55, (x1-x0-2*t)/2), doorZ = Math.min(1.55, (z1-z0-2*t)/2);
    for (const z of [z0,z1-t]) {
      b.push(box(x0,z,cx-doorX,z+t,h,'cladding'), box(cx+doorX,z,x1,z+t,h,'cladding'),
        box(cx-doorX,z,cx+doorX,z+t,h-2.4,'cladding',2.4));
    }
    for (const x of [x0,x1-t]) {
      b.push(box(x,z0+t,x+t,cz-doorZ,h,'cladding'), box(x,cz+doorZ,x+t,z1-t,h,'cladding'),
        box(x,cz-doorZ,x+t,cz+doorZ,h-2.4,'cladding',2.4));
    }
    const roof: Material = building.roof === 'light' ? 'roof-light' : building.roof === 'muted' ? 'roof-muted' : 'campus-roof';
    b.push(box(x0-0.12,z0-0.12,x1+0.12,z1+0.12,0.2,roof,h));
    // Only the larger buildings need labels; spatial names avoid inventing actual school room uses.
    if(x1-x0>6 && z1-z0>6) signs.push({x:cx,y:h-0.3,z:z1,w:Math.min(7,x1-x0-0.6),h:0.5,face:'s',text:building.name});
  }
  // A gameplay staircase beside the bright west hall gives its roof a route from the courts.
  const hall = campusRect(CAMPUS_BUILDINGS.find(v=>v.id==='west-hall')!.rect);
  b.push(...stairs('x',1,hall.x0-4.95,32.5,34.9,9,0.5,0.55,'concrete'));
  // The pool remains at ground level: a shallow raised rim surrounds it, while the blue basin is floor art.
  const pool = campusRect(CAMPUS_POOL), rim = 0.3;
  b.push(box(pool.x0-rim,pool.z0-rim,pool.x1+rim,pool.z0,0.8,'pool-edge'),
    box(pool.x0-rim,pool.z1,pool.x1+rim,pool.z1+rim,0.8,'pool-edge'),
    box(pool.x0-rim,pool.z0,pool.x0,pool.z1,0.8,'pool-edge'),
    box(pool.x1,pool.z0,pool.x1+rim,pool.z1,0.8,'pool-edge'));
  addCampusClutter(b,signs);
  for(const [x,z] of [[-8,-3],[4,-3],[24,16],[14,40],[-19,2]] as const) b.push(at(x,z,1.3,0.9,0.9,'crate'));
  // Rows of parked vehicles use solid boxes, so the parking area offers real cover.
  for(const [x,z] of [[39,13],[39,20],[39,27],[-14,44],[-14,51]] as const) b.push(at(x,z,1.8,3.6,1.25,'metal'));
  const trees: Tree[] = [
    {x:-45,z:-54,h:5.5},{x:-25,z:-54,h:5.1},{x:-6,z:-54,h:5.5},{x:16,z:-54,h:5.8},{x:40,z:-54,h:5.3},
    {x:47,z:-3,h:5},{x:47,z:43,h:5.5},{x:-47,z:40,h:4.5},{x:4,z:55,h:4.5},{x:27,z:55,h:4.8},
  ];
  for(const t of trees) b.push(at(t.x,t.z,0.6,0.6,t.h*0.6,'trunk'));
  signs.push({x:0,y:2.1,z:-59.8,w:12,h:1.1,face:'s',text:'ENDEAVOUR PARK',sub:'JOSEPH SULLIVAN DRIVE'},
    {x:12,y:2.1,z:59.8,w:11,h:1.1,face:'n',text:'QUEEN CHARLOTTE COLLEGE',sub:'SOUTH ENTRANCE'});
  const surface = (rect: readonly [number,number,number,number], kind: Surface['kind'], opts: Partial<Surface> = {}): Surface => ({...campusRect(rect),kind,...opts});
  const spawn = (px: number,py: number,team: 0|1,yaw: number): Spawn => ({...campusPoint(px,py),team,yaw});
  return {
    id:'campus',revision:2,name:'QCC Campus',blurb:'Based on your satellite image: north field, west courts and pool, and the closely grouped school wings. Heights and interiors are simplified.',
    hx,hz,wallHeight:3.2,boundPlayers:true,ground:'campus',boxes:b,trees,signs,
    surfaces:[
      surface([5,94,585,350],'grass'),
      surface([5,84,585,108],'asphalt'),
      surface([135,365,570,768],'paving'),
      surface([30,538,225,674],'asphalt'),
      surface([20,678,190,765],'paving'),
      surface([184,677,301,758],'parking'),
      surface([507,493,571,635],'parking'),
      surface([300,757,340,790],'asphalt'),
      surface(CAMPUS_COURTS,'court',{orientation:'x',divisions:3}),
      surface(CAMPUS_POOL,'pool',{orientation:'x'}),
    ],
    spawns:[
      spawn(45,374,0,-Math.PI/2),spawn(78,516,0,-Math.PI/2),spawn(104,670,0,-Math.PI/2),
      spawn(215,680,0,-Math.PI/2),spawn(190,350,0,Math.PI),spawn(225,474,0,-Math.PI/2),
      spawn(550,372,1,Math.PI/2),spawn(552,569,1,Math.PI/2),spawn(567,699,1,Math.PI/2),
      spawn(470,765,1,0),spawn(444,350,1,Math.PI),spawn(412,578,1,Math.PI/2),
    ],
    zones:[
      {...campusPoint(373,581),y:0,r:3.1,name:'Central Courtyard'},
      {...campusPoint(116,603),y:0,r:4,name:'West Courts'},
      {...campusPoint(291,421),y:0,r:4.5,name:'North Hall'},
      {...campusPoint(198,713),y:0,r:3,name:'Pool-side Parking'},
      {...campusPoint(267,607),y:4.4,r:3.2,name:'West Hall Roof'},
    ],
    pickups:[
      {...campusPoint(373,581),y:0,kind:'grenade'},{...campusPoint(116,603),y:0,kind:'ammo'},
      {...campusPoint(291,421),y:0,kind:'ammo'},{...campusPoint(267,607),y:0,kind:'ammo'},
      {...campusPoint(267,607),y:4.4,kind:'grenade'},{...campusPoint(463,563),y:0,kind:'ammo'},
      {...campusPoint(198,713),y:0,kind:'ammo'},{...campusPoint(285,318),y:0,kind:'grenade'},
    ],
  };
}

const MAPS: Readonly<Record<MapId, MapDef>> = Object.freeze({ quad: quadMap(), field: fieldMap(), campus: campusMap() });
export const MAP_IDS: readonly MapId[] = ['campus', 'quad', 'field'];
export const isMapId = (v: unknown): v is MapId => v === 'quad' || v === 'field' || v === 'campus';
export const getMap = (id: MapId): MapDef => MAPS[id];
