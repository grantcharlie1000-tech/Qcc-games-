/** What a stopped round hit, and how that material answers (map-fill plan, section 10.1). Pure; used by scene.ts. */
import { WALL_H } from '../config';
import { MAP } from '../map';
import { MARK } from '../textures';

/** Each material's mark in the atlas (textures.ts `makeMarks`), its tint, the chips it throws (none for fabric and
 * earth, which give a puff instead), and the mark's size in metres. */
export const MARKS: Record<string, { cell: number; tint: [number, number, number]; chips: [number, number, number] | null; size: number }> = {
  wall: { cell: MARK.crater, tint: [1, 1, 1], chips: [0.88, 0.86, 0.8], size: 0.09 },
  concrete: { cell: MARK.crater, tint: [0.85, 0.85, 0.85], chips: [0.6, 0.6, 0.58], size: 0.08 },
  brick: { cell: MARK.brick, tint: [1, 1, 1], chips: [0.62, 0.34, 0.24], size: 0.09 },
  wood: { cell: MARK.wood, tint: [1, 1, 1], chips: [0.72, 0.56, 0.36], size: 0.1 },
  fabric: { cell: MARK.fabric, tint: [1.2, 1.15, 1.1], chips: null, size: 0.13 },
  earth: { cell: MARK.earth, tint: [1, 1, 1], chips: null, size: 0.14 },
  ceiling: { cell: MARK.ceiling, tint: [1, 1, 1], chips: [0.92, 0.9, 0.86], size: 0.1 },
  tile: { cell: MARK.tile, tint: [0.8, 0.8, 0.8], chips: [0.9, 0.9, 0.88], size: 0.12 },
  plastic: { cell: MARK.crater, tint: [0.35, 0.35, 0.36], chips: [0.18, 0.18, 0.2], size: 0.06 },
  glass: { cell: MARK.glass, tint: [1, 1, 1], chips: [0.75, 0.85, 0.9], size: 0.09 },
  cardboard: { cell: MARK.fabric, tint: [0.75, 0.6, 0.45], chips: [0.7, 0.58, 0.42], size: 0.07 },
  leaf: { cell: -1, tint: [1, 1, 1], chips: [0.3, 0.5, 0.25], size: 0 },
};
/** Materials of dressing pieces by their material key (render/labdress.ts DressKey). */
const KEY_MAT: Record<string, string> = {
  chassis: 'plastic', plastic: 'plastic', casing: 'plastic', kick: 'plastic', socket: 'plastic', roomsign: 'plastic', led: 'plastic', ledAmber: 'plastic', amber: 'plastic',
  alarm: 'plastic', exit: 'plastic', clock: 'plastic', sign: 'plastic', fire: 'plastic', screen: 'glass', glass: 'glass', bulb: 'glass',
  steel: 'metal', chrome: 'metal', conduit: 'metal', handle: 'metal', door: 'metal', locker: 'metal', grid: 'metal', trim: 'metal',
  card: 'cardboard', paper: 'cardboard', binder: 'cardboard', label: 'cardboard', cork: 'wood', aid: 'leaf',
};
/** Materials of the modelled props. */
const PROP_MAT: Record<string, string> = {
  covered_car: 'fabric', barrel_03: 'metal', metal_jerrycan_green: 'metal', wooden_military_crate: 'wood', old_military_crate: 'wood',
  metal_tool_chest: 'metal', korean_fire_extinguisher_01: 'metal', metal_stool_01: 'metal', security_camera_01: 'plastic',
  sofa_02: 'fabric', worn_metal_rack: 'metal', wooden_crate_02: 'wood', Barrel_02: 'metal', concrete_road_barrier_02: 'concrete',
  compost_bags: 'plastic', cement_bag: 'cardboard', trashbag: 'plastic', cardboard_box_01: 'cardboard',
};
/** Materials of the set pieces drawn in code, by family. */
const FAMILY_MAT: Record<string, string> = {
  sofa: 'fabric', trailer: 'fabric', lowtable: 'wood', crates: 'wood', pallets: 'wood', binstore: 'wood', lowwall: 'concrete', planter: 'concrete', materials: 'wood',
};
export const familyMaterial = (family: string) => FAMILY_MAT[family] ?? 'metal';
export const dressMaterial = (key: string) => KEY_MAT[key] ?? 'plastic';
export const propMaterial = (model: string) => PROP_MAT[model] ?? 'plastic';
type Proxy = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; key: string };
/** The first dressing piece a ray passes through before `tmax` (slab test on each piece's box), with the face normal. */
export function firstDressing(list: readonly Proxy[], ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, tmax: number): { t: number; nx: number; ny: number; nz: number; key: string } | null {
  let best: { t: number; nx: number; ny: number; nz: number; key: string } | null = null;
  const inv = [1 / dx, 1 / dy, 1 / dz], o = [ox, oy, oz];
  for (const b of list) {
    const lo = [b.x0, b.y0, b.z0], hi = [b.x1, b.y1, b.z1];
    let t0 = 0.05, t1 = best ? best.t : tmax - 0.02, axis = -1, sign = 0;
    for (let k = 0; k < 3; k++) {
      let a = (lo[k] - o[k]) * inv[k], c = (hi[k] - o[k]) * inv[k], sg = -1;
      if (a > c) { const tt = a; a = c; c = tt; sg = 1; }
      if (a > t0) { t0 = a; axis = k; sign = sg; }
      if (c < t1) t1 = c;
      if (t0 > t1) break;
    }
    if (t0 > t1 || axis < 0) continue;
    best = { t: t0, nx: axis === 0 ? sign : 0, ny: axis === 1 ? sign : 0, nz: axis === 2 ? sign : 0, key: b.key };
  }
  return best;
}
/** What covers the ground in each floor area. */
const FLOOR_KIND: Record<string, string> = { asphalt: 'earth', grass: 'earth', slab: 'concrete', tile: 'tile', lino: 'tile', check: 'tile', raised: 'tile', carpet: 'fabric', planks: 'wood' };
/** The material at a stopped round's end: the box it struck, or for the ground and the ceiling slab what covers them
 * there. Returns one of the MARKS keys, or 'metal' (a scar and sparks, never a hole). */
export function surfaceAt(box: { mat: string; y0: number } | null, x: number, y: number, z: number, ny: number): string {
  if (box && box.y0 >= WALL_H - 0.01 && ny < -0.5) return 'ceiling';
  if (!box || (y < 0.05 && ny > 0.5)) {
    if (y > WALL_H - 0.1) return 'ceiling';
    let kind = 'concrete';
    for (const f of MAP.floors) if (x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) kind = FLOOR_KIND[f.mat] ?? 'concrete';
    return kind;
  }
  const m = box.mat;
  // The brick shell is painted block on its inside face: a round from indoors chips paint and block, not brick.
  const B = MAP.building, indoors = x > B.x0 && x < B.x1 && z > B.z0 && z < B.z1;
  if (m === 'brick' && indoors) return 'concrete';
  return m === 'brick' ? 'brick' : m === 'wood' || m === 'crate' || m === 'trim' || m === 'shelf' ? 'wood' : m === 'concrete' ? 'concrete' : m === 'plaster' ? 'wall' : m === 'fabric' || m === 'van' ? 'fabric' : 'metal';
}
