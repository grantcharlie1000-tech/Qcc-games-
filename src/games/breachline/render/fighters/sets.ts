/** Names of the fighters' baked texture sets, shared by the offline bake and the game. */
export const FIGHTER_SETS = ['rifleman-azure', 'rifleman-ember'] as const;
/** Which squads have a baked set so far (the others keep the procedural material). */
export const BAKED: readonly boolean[] = [true, true];

export interface FighterSetMeta {
  variant: string;
  levels: { lod: number; size: number; /** Shipped sizes of diff, nor, arm. */ sizes: number[]; vertices: number; outVertices: number; indices: number; wide: boolean }[];
}
