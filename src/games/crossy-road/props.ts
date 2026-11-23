/** Scenery that blocks a cell, beside the bare trees and boulders in models.ts. Each model stands inside one
 * tile with its origin at the bottom centre, and carries snow. The camera sees the +z and +x faces, so faces
 * and decorations point that way. Baked colours: the instance tint stays white. */
import type * as THREE from 'three';
import {voxel, type Part, type Rgb} from './models';

const BARK = 0x6a4636, BARK_SIDE = 0x523629, SNOW = 0xf6faff, SNOW_SIDE = 0xd9e3f1;
const PINE = 0x2f8a55, PINE_SIDE = 0x1f6b40, HOLLY = 0x3a9a58, HOLLY_SIDE = 0x257544, RED = 0xd8263a, RED_SIDE = 0xa81b2d, GOLD = 0xffd84a;

/** Stepped green tiers on a trunk, each tier with a snow ledge. Returns the height of the tip. */
function tiers(parts: Part[], widths: readonly number[]): number {
  parts.push([0, 0, 0, 0.5, 0.07, 0.5, SNOW, 0, 0, SNOW_SIDE], [0, 0, 0, 0.2, 0.3, 0.2, BARK, 0, 0, BARK_SIDE]);
  let y = 0.26;
  for (const w of widths) {
    parts.push([0, y, 0, w, 0.24, w, PINE, 0, 0, PINE_SIDE], [0, y + 0.24, 0, w, 0.05, w, SNOW, 0, 0, SNOW_SIDE]);
    y += 0.29;
  }
  parts.push([0, y, 0, 0.12, 0.1, 0.12, PINE, 0, 0, PINE_SIDE]);
  return y + 0.1;
}

/** A snowy pine: three tiers (about 1.2 tall) or four (about 1.5). */
export function pineGeometry(tall: boolean): THREE.BufferGeometry {
  const parts: Part[] = [], tip = tiers(parts, tall ? [0.86, 0.7, 0.52, 0.32] : [0.78, 0.56, 0.34]);
  parts.push([0, tip, 0, 0.14, 0.04, 0.14, SNOW, 0, 0, SNOW_SIDE]);
  return voxel(parts, 0.9);
}

/** A decorated Christmas tree: a pine with baubles on the faces the camera sees and a gold star. */
export function festiveTreeGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [], widths = [0.82, 0.6, 0.38], tip = tiers(parts, widths), baubles = [RED, GOLD, 0x3a86ff, 0xff8fc0];
  widths.forEach((w, t) => {
    const y = 0.33 + t * 0.29, n = 3 - t;
    for (let i = 0; i < n; i++) {
      const at = ((i + 0.5) / n - 0.5) * (w - 0.16), lift = (i % 2) * 0.07;
      parts.push([at, y + lift, w / 2 + 0.02, 0.08, 0.08, 0.04, baubles[(i + t) % 4]], [w / 2 + 0.02, y + 0.07 - lift, -at, 0.04, 0.08, 0.08, baubles[(i + t + 2) % 4]]);
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

/** A street lamp: an iron post on a plinth, a warm lantern under a snowy cap, and a wreath with a red bow. */
export function lampPostGeometry(): THREE.BufferGeometry {
  const iron = 0x3a3f4c, ironSide = 0x2b2e38, light: Rgb = [2.0, 1.55, 0.7];
  return voxel([
    [0, 0, 0, 0.44, 0.06, 0.44, SNOW, 0, 0, SNOW_SIDE], [0, 0, 0, 0.3, 0.14, 0.3, iron, 0, 0, ironSide], [0, 0.14, 0, 0.18, 0.06, 0.18, iron, 0, 0, ironSide],
    [0, 0.2, 0, 0.09, 0.92, 0.09, iron, 0, 0, ironSide], [0, 1.1, 0, 0.2, 0.04, 0.2, iron, 0, 0, ironSide],
    [0, 1.14, 0, 0.22, 0.24, 0.22, light],
    [0, 1.38, 0, 0.3, 0.05, 0.3, iron, 0, 0, ironSide], [0, 1.43, 0, 0.26, 0.05, 0.26, SNOW, 0, 0, SNOW_SIDE], [0, 1.48, 0, 0.08, 0.06, 0.08, iron],
    // The wreath: a square of green round the post with a bow at the front.
    [0, 0.62, 0, 0.3, 0.07, 0.16, HOLLY, 0, 0, HOLLY_SIDE], [0, 0.86, 0, 0.3, 0.07, 0.16, HOLLY, 0, 0, HOLLY_SIDE],
    [-0.13, 0.69, 0, 0.07, 0.17, 0.16, HOLLY, 0, 0, HOLLY_SIDE], [0.13, 0.69, 0, 0.07, 0.17, 0.16, HOLLY, 0, 0, HOLLY_SIDE],
    [0, 0.6, 0.085, 0.12, 0.08, 0.03, RED], [0, 0.54, 0.085, 0.05, 0.07, 0.03, RED],
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

/** A stack of cut logs: two below and one above, with pale end grain and snow. */
export function logPileGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [[0, 0, 0, 0.84, 0.05, 0.7, SNOW, 0, 0, SNOW_SIDE]];
  for (const [y, z] of [[0, -0.17], [0, 0.17], [0.26, 0]] as const) {
    parts.push([0, y, z, 0.78, 0.26, 0.32, 0x8a5a3c, 0, 0, 0x6a4230]);
    for (const s of [-1, 1]) parts.push([s * 0.394, y + 0.03, z, 0.008, 0.2, 0.26, 0xdcae7c], [s * 0.399, y + 0.09, z, 0.004, 0.08, 0.12, 0x9c6a43]);
  }
  parts.push([0, 0.52, 0, 0.66, 0.05, 0.26, SNOW, 0, 0, SNOW_SIDE], [-0.1, 0.26, 0.24, 0.4, 0.04, 0.14, SNOW, 0, 0, SNOW_SIDE]);
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

/** Ice crystals: leaning pale-blue shards on a frozen base. */
export function crystalGeometry(): THREE.BufferGeometry {
  const ice = 0xdaf3ff, side = 0x8fcbe6, deep = 0x6fb4d8;
  return voxel([
    [0, 0, 0, 0.6, 0.12, 0.54, 0xc4e8f8, 0, 0, side],
    [-0.08, 0.08, -0.02, 0.24, 0.86, 0.24, ice, 0.1, 0, side], [0.17, 0.08, 0.08, 0.18, 0.56, 0.18, ice, -0.22, 0, deep],
    [-0.24, 0.08, 0.12, 0.13, 0.36, 0.13, ice, 0.3, 0, side], [0.06, 0.08, -0.2, 0.14, 0.44, 0.14, ice, -0.08, 0.2, deep],
    [-0.16, 0.92, -0.02, 0.14, 0.05, 0.14, SNOW, 0.1],
  ], 0.9);
}
