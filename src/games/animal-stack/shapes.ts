/** Authored convex pieces in sprite coordinates, one module per species in `species/`.
 * No concave auto-decomposition or hull fallback; gaps between limbs are intentional. */
import { SPECIES } from './species';
export type { Point } from './species/types';
export type ShapeKind=keyof typeof SPECIES;
export const SHAPES=Object.fromEntries(Object.entries(SPECIES).map(([kind,def])=>[kind,def.shapes])) as Record<ShapeKind,typeof SPECIES[ShapeKind]['shapes']>;
