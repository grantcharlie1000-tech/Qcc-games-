/** Which photo-sourced material each old texture id becomes, at what real-world size. Pure data, shared by the
 * baker (for bounce colour) and the browser. Ids without an entry keep their procedural texture under the lightmap. */
import type { RGB } from '../lightbake';
import type { TexId } from '../textures';

export interface Surface {
  /** Texture set under public/game-art/breachline/tex/. */
  set: string;
  /** Multiplies the texture's roughness (below 1 is glossier). */
  gloss?: number;
  /** A painted lower band (wainscot) up to this height, in this tint, with a dark rail at its top. */
  band?: { height: number; tint: RGB };
  /** Metres one repeat of the texture covers. */
  size: number;
  /** Rotation of the pattern, radians. */
  rotate?: number;
  tint?: RGB;
}

export const SURFACES: Partial<Record<TexId, Surface>> = {
  // Square ceramic tiles; the source is laid diagonally, so turn it square and make each tile 47 cm.
  tile: { set: 'interior_tiles', size: 0.95 * Math.SQRT2 / 2, rotate: Math.PI / 4, gloss: 0.5 },
  drywall: { set: 'painted_plaster_wall', size: 2, band: { height: 1.05, tint: [0.42, 0.5, 0.6] } },
  cinder: { set: 'painted_plaster_wall', size: 2, tint: [0.86, 0.88, 0.9], band: { height: 1.05, tint: [0.42, 0.5, 0.6] } },
  counter: { set: 'blue_metal_plate', size: 1.25, tint: [1.9, 1.9, 1.9] },
  trim: { set: 'blue_metal_plate', size: 1.25, tint: [0.7, 0.7, 0.7] },
  paint: { set: 'painted_plaster_wall', size: 1, tint: [0.32, 0.33, 0.34] },
};

/** Average linear albedo of each texture set, measured by the baker from the source images (build output). Used
 * for bounce light. Ids with no set use these rough values for their procedural texture. */
export const PROCEDURAL_ALBEDO: Partial<Record<TexId, RGB>> = {
  ceiling: [0.62, 0.62, 0.6], lamp: [0.8, 0.8, 0.8], trim: [0.05, 0.05, 0.06], paint: [0.5, 0.5, 0.5], brick: [0.25, 0.12, 0.08],
  concrete: [0.35, 0.34, 0.32], roof: [0.15, 0.15, 0.15],
};
export const DEFAULT_ALBEDO: RGB = [0.4, 0.4, 0.4];
