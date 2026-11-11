/** Which photo-sourced material each old texture id becomes, at what real-world size. Pure data, shared by the
 * baker (for bounce colour) and the browser. Ids without an entry keep their procedural texture under the lightmap. */
import type { RGB } from '../lightbake';
import type { TexId } from '../textures';

export interface Surface {
  /** Texture set under public/game-art/breachline/tex/. */
  set: string;
  /** Multiplies the texture's roughness (below 1 is glossier). */
  gloss?: number;
  /** Polished-floor wear (see artMaterial). */
  wear?: { axis: 'x' | 'z'; centre: number; half: number };
  /** Normal-map strength (1 = as authored). */
  normal?: number;
  /** Multiplies the reflection (polished or sealed surfaces read stronger than the bare physics gives at this exposure). */
  spec?: number;
  /** A painted lower band (wainscot) up to this height, in this tint, with a dark rail at its top. */
  band?: { height: number; tint: RGB };
  /** Metres one repeat of the texture covers. */
  size: number;
  /** Rotation of the pattern, radians. */
  rotate?: number;
  tint?: RGB;
}

/** Barricade boards on doorways and windows in art rooms (destructible panels). */
export const PLANKS: Surface = { set: 'raw_plank_wall', size: 1.87, tint: [0.85, 0.8, 0.75] };

export const SURFACES: Partial<Record<TexId, Surface>> = {
  // Archive floor: worn timber boards; tables and desks in the same wood, darker.
  floorboards: { set: 'wood_planks', size: 1.5, gloss: 0.6, spec: 1.2, tint: [0.85, 0.8, 0.75] },
  wood: { set: 'wood_planks', size: 0.6, gloss: 0.35, spec: 1.3, tint: [0.3, 0.22, 0.17] },
  // Shelving carcasses: dark painted steel behind the modelled uprights and boxes.
  shelf: { set: 'painted_plaster_wall', size: 1, tint: [0.18, 0.19, 0.21] },
  // Polished terrazzo in the corridor: cool grey, glossy enough to carry the fittings' reflections.
  lino: { set: 'terrazzo_tiles', size: 2, gloss: 0.3, spec: 2, tint: [0.66, 0.7, 0.8], wear: { axis: 'z', centre: -0.5, half: 1.5 } },
  // Mineral-fibre ceiling tiles, 600 mm, six to a repeat, joints on the T-bar grid.
  ceiling: { set: 'OfficeCeiling001', size: 3.6, normal: 1.5, tint: [0.92, 0.92, 0.9] },
  // Square ceramic tiles; the source is laid diagonally, so turn it square and make each tile 47 cm.
  tile: { set: 'interior_tiles', size: 0.95 * Math.SQRT2 / 2, rotate: Math.PI / 4, gloss: 0.12, spec: 2.6, tint: [0.66, 0.64, 0.62] },
  drywall: { set: 'painted_plaster_wall', size: 2, normal: 2.2, band: { height: 1.05, tint: [0.42, 0.5, 0.6] } },
  cinder: { set: 'painted_plaster_wall', size: 2, normal: 2.2, tint: [0.86, 0.88, 0.9], band: { height: 1.05, tint: [0.42, 0.5, 0.6] } },
  // Carcasses sit behind the modelled doors: dark, so the gaps between doors read as gaps.
  counter: { set: 'blue_metal_plate', size: 1.25, tint: [0.55, 0.55, 0.55] },
  // Locker carcasses (doors are modelled in render/labdress.ts).
  steel: { set: 'painted_plaster_wall', size: 1.5, tint: [0.5, 0.56, 0.5] },
  // Posts and frames: painted steel a few shades darker than the walls, so the bays read without stripes of black.
  trim: { set: 'painted_plaster_wall', size: 1, tint: [0.52, 0.53, 0.52] },
  // Bench tops: dark epoxy resin, sealed and semi-gloss.
  paint: { set: 'painted_plaster_wall', size: 1, tint: [0.26, 0.27, 0.28], gloss: 0.4, spec: 1.6 },
};

/** Average linear albedo of each texture set, measured by the baker from the source images (build output). Used
 * for bounce light. Ids with no set use these rough values for their procedural texture. */
export const PROCEDURAL_ALBEDO: Partial<Record<TexId, RGB>> = {
  ceiling: [0.62, 0.62, 0.6], lamp: [0.8, 0.8, 0.8], trim: [0.05, 0.05, 0.06], paint: [0.5, 0.5, 0.5], brick: [0.25, 0.12, 0.08],
  concrete: [0.35, 0.34, 0.32], roof: [0.15, 0.15, 0.15],
};
export const DEFAULT_ALBEDO: RGB = [0.4, 0.4, 0.4];
