/** Ceiling light fixtures in the asset-rendered rooms. These replace the map's lamp list inside those rooms for the
 * bake and the picture (the map's list still lights everything else, and the fallback look). Pure data. */
import { WALL_H } from '../config';
import type { Lamp } from '../map';
import { MAP } from '../map';
import { REGIONS } from './levelgeo';

/** A recessed 1200 x 600 troffer, long side along X, at the ceiling. */
export interface Fixture { x: number; z: number; color: readonly [number, number, number]; w: number; d: number; /** A lamp below the ceiling (a desk lamp): its height, and a gain for its small, bright source. */ y?: number; gain?: number }
const COOL = [0.9, 0.97, 1] as const;
const troffer = (x: number, z: number, color: readonly [number, number, number] = COOL): Fixture => ({ x, z, color, w: 1.2, d: 0.6 });

export const FIXTURES: Record<string, Fixture[]> = {
  // Two rows over the walkways either side of the benches: the benches throw shadow between them.
  lab: [-2.7, 1.7].flatMap(x => [-8.2, -4.2].map(z => troffer(x, z))),
  // One line down the middle of the corridor every 4.5 m, so the walls get pools and falloff; warmer than the Lab.
  // The Archive: four fittings between the shelving runs, a slightly warm white.
  archive: [...[3.3, 6.9].flatMap(x => [3.2, 7.6].map(z => troffer(x, z, [1, 0.97, 0.91]))),
    // A desk lamp on the reading table: a warm local pool on the table and the floor round it.
    { x: 4.25, z: 2.85, color: [1.3, 0.92, 0.55], w: 0.14, d: 0.14, y: 1.12, gain: 26 }],
  // Tubes replaced at different times: older ones gone warm, two new cold ones, so the corridor's light is not one
  // flat colour along its length.
  corridor: [-12.75, -8.25, -3.75, 0.75, 5.25, 9.75, 13.5].map((x, i) => troffer(x, -0.5, ([[1.06, 0.9, 0.72], [1, 0.95, 0.86], [0.88, 0.95, 1.06], [1, 0.95, 0.86], [1.06, 0.9, 0.72], [1, 0.95, 0.86], [0.88, 0.95, 1.06]] as const)[i])),
};
/** Where the baker's light samples sit: just under the diffuser of the modelled fitting (render/fixturemesh.ts). */
export const FIXTURE_Y = WALL_H - 0.062;

const inside = (x: number, z: number) => REGIONS.some(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
/** Every light the baker uses: map lamps outside art rooms (as 1200 x 600 panels) and the art rooms' fixtures. */
export function bakeLights(): (Fixture & { range: number })[] {
  const out = MAP.lamps.filter((l: Lamp) => !inside(l.x, l.z)).map(l => ({ x: l.x, z: l.z, color: l.color, w: 1.2, d: 0.6, range: l.range }));
  for (const r of REGIONS) for (const f of FIXTURES[r.name] ?? []) out.push({ ...f, range: 9 });
  return out;
}
