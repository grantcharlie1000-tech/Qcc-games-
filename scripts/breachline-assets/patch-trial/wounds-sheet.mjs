// Job 12.2 sheet: crops around each fighter (2x of the game frame). Usage: node wounds-sheet.mjs <dir> <outFile>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
const [dir, out] = process.argv.slice(2);
const crop = (f, left) => sharp(path.join(dir, f)).extract({ left, top: 150, width: 200, height: 330 }).resize(250, 412).png().toBuffer();
const rows = [];
for (const [tag, left, name] of [['A', 650, 'Squad A (slate)'], ['B', 430, 'Squad B (coyote)']]) {
  const cells = [];
  for (const [k, cap] of [['chest', 'chest hit'], ['leg', '+ leg hit'], ['head', '+ head hit'], ['half', 'half health'], ['near-death', 'near death']]) cells.push({ buf: await crop(`${tag}-${k}.png`, left), caption: cap });
  rows.push({ title: name, cells });
}
rows.push({ title: 'Both dead: bodies stay, wounds included', cells: [{ buf: await sharp(path.join(dir, 'bodies.png')).extract({ left: 240, top: 220, width: 800, height: 450 }).resize(1250, 703).png().toBuffer(), caption: 'after death: B by real gunfire, A by the test kill (1.6x crop)' }] });
console.log(await compose(rows, { width: 1250, title: 'Job 12.2: wounds, hurt state and bodies, in the game (synthetic hit events through the fighters\' handle)', out, jpeg: 74 }));
