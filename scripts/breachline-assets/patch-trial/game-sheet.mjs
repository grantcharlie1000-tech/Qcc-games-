// Composes the in-game comparison (game-test.mjs output): stock fighters vs ?fighters=patch, same seed, same spots.
// Usage: node game-sheet.mjs <gameDir> <outFile>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
const [dir, out] = process.argv.slice(2);
const cell = async (f, cap) => ({ buf: await sharp(path.join(dir, f)).resize(900, 506).png().toBuffer(), caption: cap });
const rows = [];
for (const [sq, a2, a8] of [[0, 2, 1], [1, 1, 1]]) for (const [d, a] of [[2, a2], [8, a8]])
  rows.push({ title: `Squad ${sq}, ${d} m (the game at 1280x720, high tier, shown at 70%)`, cells: [await cell(`game-stock-sq${sq}-${d}m-${a}.png`, 'stock fighters'), await cell(`game-patch-sq${sq}-${d}m-${a}.png`, '?fighters=patch')] });
console.log(await compose(rows, { width: 1800, title: 'Job 3.6: in the game, same seed and spots: stock fighters (left) and the Patch fighters (right)', out, jpeg: 80 }));
