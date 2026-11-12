/** Prints our fighters' triangle counts per level (body + kit, and the world weapon), for the Patch budget. */
import { heroReady } from '../../../src/games/breachline/render/hero/geom';
import { figureGeometry } from '../../../src/games/breachline/render/fighters/figure';
import { weaponFor } from '../../../src/games/breachline/render/fighters/weapon';
import { LOD_DIST, LOD0_MAX } from '../../../src/games/breachline/render/fighters/index';
async function main() { await heroReady; for (const sq of [0, 1] as const) console.log('squad', sq, [0, 1, 2].map(l => figureGeometry(sq, l).triangles)); console.log('ar weapon lod1/2', weaponFor('ar', 1).triangles, weaponFor('ar', 2).triangles, 'LOD_DIST', LOD_DIST, 'LOD0_MAX', LOD0_MAX); }
main();
