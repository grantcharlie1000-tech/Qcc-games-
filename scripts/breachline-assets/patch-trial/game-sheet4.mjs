// Job 4 evidence: for each squad in each place, the game frame at full 1280x720 (stock left, Patch right) at 2 and 8 m,
// and a 2x crop of the centre (where the fighter stands) of each. Usage: node game-sheet4.mjs <stockDir> <patchDir> <outDir>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
const [sd, pd, outDir] = process.argv.slice(2);
const crop = f => sharp(f).extract({ left: 320, top: 180, width: 640, height: 360 }).resize(1280, 720, { kernel: 'lanczos3' }).png().toBuffer();
for (const sq of [0, 1]) for (const place of ['yard', 'lab']) {
  const rows = [];
  for (const d of [2, 8]) {
    const s = path.join(sd, `stock-sq${sq}-${place}-${d}m.png`), p = path.join(pd, `patch-sq${sq}-${place}-${d}m.png`);
    rows.push({ title: `${d} m: the game at 1280x720 (1:1)`, cells: [{ buf: await sharp(s).png().toBuffer(), caption: 'stock fighters' }, { buf: await sharp(p).png().toBuffer(), caption: '?fighters=patch' }] });
    rows.push({ title: `${d} m: 2x crop of the centre`, cells: [{ buf: await crop(s), caption: 'stock, 2x' }, { buf: await crop(p), caption: 'patch, 2x' }] });
  }
  console.log(await compose(rows, { width: 2560, title: `Job 4: squad ${sq} in the ${place === 'yard' ? 'south yard' : 'Lab'}, in the game (seed 7, high tier), stock left, Patch right`, out: path.join(outDir, `job4-sq${sq}-${place}.jpg`), jpeg: 72 }));
}
