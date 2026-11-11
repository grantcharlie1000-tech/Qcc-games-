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
  fabric: { cell: MARK.fabric, tint: [1.45, 1.4, 1.35], chips: null, size: 0.085 },
  earth: { cell: MARK.earth, tint: [1, 1, 1], chips: null, size: 0.14 },
  ceiling: { cell: MARK.ceiling, tint: [1, 1, 1], chips: [0.92, 0.9, 0.86], size: 0.1 },
  tile: { cell: MARK.tile, tint: [0.8, 0.8, 0.8], chips: [0.9, 0.9, 0.88], size: 0.12 },
};
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
