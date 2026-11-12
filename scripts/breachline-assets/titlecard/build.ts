/** Writes public/game-art/breachline/{cover,title}.svg. Run: node --experimental-strip-types scripts/breachline-assets/titlecard/build.ts */
import { writeFileSync } from 'node:fs';
import { generateCover } from './svg.ts';
import { generateTitle } from './title.ts';

const root = new URL('../../../', import.meta.url);
for (const [name, built] of [['cover', generateCover()], ['title', generateTitle()]] as const) {
  writeFileSync(new URL(`public/game-art/breachline/${name}.svg`, root), built.svg);
  console.log(`${name}.svg: ${built.polygons} polygons, ${(built.svg.length / 1024).toFixed(1)} KB`);
}
