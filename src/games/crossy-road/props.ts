/** Scenery that blocks a cell, beside the bare trees and boulders in models.ts. Each model stands inside one
 * tile with its origin at the bottom centre, and carries snow. The camera sees the +z and +x faces, so faces
 * and decorations point that way. Baked colours: the instance tint stays white. */
import type * as THREE from 'three';
import {timber, voxel, type Part, type Rgb} from './models';

const BARK = 0x94664c, BARK_SIDE = 0x80543e, SNOW = 0xf6faff, SNOW_SIDE = 0xd9e3f1;
const PINE = 0x2f8a55, PINE_SIDE = 0x227348, FIR = 0x3d9d63, FIR_SIDE = 0x2a8050, HOLLY = 0x3a9a58, HOLLY_SIDE = 0x257544, RED = 0xd8263a, RED_SIDE = 0xa81b2d, GOLD = 0xffd84a;

/** Layers of boughs on a trunk, from a snow mound to a tip. Each layer is a cross-shaped skirt of boughs over a
 * smaller core, in one of two greens, with snow on the four bough ends. Returns the height of the tip. */
function tiers(parts: Part[], widths: readonly number[]): number {
  parts.push([0, 0, 0, 0.52, 0.07, 0.52, SNOW, 0, 0, SNOW_SIDE], [0, 0, 0, 0.18, 0.3, 0.18, BARK, 0, 0, BARK_SIDE]);
  let y = 0.22;
  widths.forEach((w, i) => {
    const green = i % 2 ? FIR : PINE, side = i % 2 ? FIR_SIDE : PINE_SIDE, core = w * 0.62;
    parts.push([0, y, 0, w, 0.1, core, green, 0, 0, side], [0, y, 0, core, 0.1, w, green, 0, 0, side], [0, y + 0.1, 0, core, 0.12, core, green, 0, 0, side]);
    for (const s of [-1, 1]) parts.push([s * w * 0.41, y + 0.1, 0, w * 0.18, 0.035, core * 0.8, SNOW, 0, 0, SNOW_SIDE], [0, y + 0.1, s * w * 0.41, core * 0.8, 0.035, w * 0.18, SNOW, 0, 0, SNOW_SIDE]);
    y += 0.22;
  });
  parts.push([0, y, 0, 0.14, 0.14, 0.14, PINE, 0, 0, PINE_SIDE]);
  return y + 0.14;
}

/** A snowy pine: four layers (about 1.25 tall) or five (about 1.5). */
export function pineGeometry(tall: boolean): THREE.BufferGeometry {
  const parts: Part[] = [], tip = tiers(parts, tall ? [0.9, 0.76, 0.6, 0.44, 0.28] : [0.78, 0.6, 0.42, 0.26]);
  parts.push([0, tip, 0, 0.16, 0.04, 0.16, SNOW, 0, 0, SNOW_SIDE]);
  return voxel(parts, 0.9);
}

/** A decorated Christmas tree: a pine with baubles on the boughs the camera sees and a gold star. */
export function decoratedTreeGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [], widths = [0.84, 0.66, 0.48, 0.3], tip = tiers(parts, widths), baubles = [RED, GOLD, 0x3a86ff, 0xff8fc0];
  widths.forEach((w, t) => {
    const y = 0.23 + t * 0.22, n = t < 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const at = ((i + 0.5) / n - 0.5) * w * 0.5;
      parts.push([at, y, w / 2 + 0.02, 0.08, 0.08, 0.04, baubles[(i + t) % 4]], [w / 2 + 0.02, y, -at, 0.04, 0.08, 0.08, baubles[(i + t + 2) % 4]]);
    }
  });
  const glow: Rgb = [1.6, 1.25, 0.3];
  parts.push([0, tip, 0, 0.2, 0.2, 0.06, glow], [0, tip + 0.02, 0, 0.16, 0.16, 0.07, glow, Math.PI / 4]);
  return voxel(parts, 0.9);
}

/** A snowman facing the camera: three stacked blocks, a top hat, a carrot nose, coal eyes and buttons, a red
 * scarf and two stick arms. */
export function snowmanGeometry(): THREE.BufferGeometry {
  const coal = 0x23252e;
  return voxel([
    [0, 0, 0, 0.58, 0.36, 0.58, SNOW, 0, 0, SNOW_SIDE], [0, 0.36, 0, 0.44, 0.3, 0.44, SNOW, 0, 0, SNOW_SIDE], [0, 0.72, 0, 0.32, 0.26, 0.32, SNOW, 0, 0, SNOW_SIDE],
    [0, 0.98, 0, 0.4, 0.04, 0.4, coal], [0, 1.02, 0, 0.26, 0.2, 0.26, 0x343844, 0, 0, coal], [0, 1.03, 0, 0.27, 0.05, 0.27, RED],
    [0, 0.8, 0.2, 0.06, 0.06, 0.12, 0xf28a25], [-0.075, 0.88, 0.163, 0.05, 0.05, 0.01, coal], [0.075, 0.88, 0.163, 0.05, 0.05, 0.01, coal],
    [0, 0.44, 0.223, 0.06, 0.06, 0.01, coal], [0, 0.56, 0.223, 0.06, 0.06, 0.01, coal],
    [0, 0.66, 0, 0.36, 0.08, 0.36, RED, 0, 0, RED_SIDE], [0.14, 0.5, 0.2, 0.09, 0.18, 0.05, RED, 0, 0, RED_SIDE],
    [-0.34, 0.52, 0, 0.26, 0.04, 0.04, BARK, -0.5], [0.34, 0.52, 0, 0.26, 0.04, 0.04, BARK, 0.5],
  ], 0.92);
}

/** A holly bush: stepped green blocks with snow on top and red berries. */
export function bushGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    [0, 0, 0, 0.74, 0.3, 0.62, HOLLY, 0, 0, HOLLY_SIDE], [-0.08, 0.3, 0.02, 0.5, 0.2, 0.44, HOLLY, 0, 0, HOLLY_SIDE], [0.24, 0.3, -0.12, 0.18, 0.1, 0.22, HOLLY, 0, 0, HOLLY_SIDE],
    [-0.08, 0.5, 0.02, 0.42, 0.05, 0.36, SNOW, 0, 0, SNOW_SIDE], [0.24, 0.4, -0.12, 0.14, 0.04, 0.18, SNOW, 0, 0, SNOW_SIDE], [0.22, 0.3, 0.2, 0.2, 0.03, 0.14, SNOW, 0, 0, SNOW_SIDE],
  ];
  for (const [x, y] of [[-0.24, 0.1], [0.02, 0.19], [0.24, 0.08], [-0.1, 0.38]] as const) parts.push([x, y, y > 0.3 ? 0.245 : 0.315, 0.06, 0.06, 0.012, RED]);
  for (const [z, y] of [[0.14, 0.16], [-0.12, 0.08]] as const) parts.push([0.375, y, z, 0.012, 0.06, 0.06, RED]);
  return voxel(parts, 0.9);
}

/** A stack of cut logs on the snow: three below, two above and one on top. */
export function logPileGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [[0, 0, 0, 0.86, 0.05, 0.72, SNOW, 0, 0, SNOW_SIDE]];
  timber(parts, 0, 0, 0.74, false);
  return voxel(parts, 0.9);
}

/** Three wrapped presents: a big red one, a green one beside it and a blue one on top, each with ribbon. */
export function giftsGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  const gift = (x: number, y: number, z: number, w: number, h: number, color: number, side: number, ribbon: number): void => {
    parts.push([x, y, z, w, h, w, color, 0, 0, side], [x, y, z, w + 0.012, h + 0.006, 0.07, ribbon], [x, y, z, 0.07, h + 0.006, w + 0.012, ribbon]);
  };
  gift(-0.1, 0, -0.06, 0.52, 0.4, RED, RED_SIDE, GOLD);
  gift(0.24, 0, 0.22, 0.3, 0.26, 0x2c9a55, 0x1f7a42, 0xffffff);
  gift(-0.12, 0.406, -0.06, 0.3, 0.22, 0x3a86ff, 0x2a63c4, GOLD);
  parts.push([-0.12, 0.632, -0.06, 0.16, 0.06, 0.07, GOLD], [0.24, 0.266, 0.22, 0.14, 0.05, 0.07, 0xffffff]);
  return voxel(parts, 0.9);
}
