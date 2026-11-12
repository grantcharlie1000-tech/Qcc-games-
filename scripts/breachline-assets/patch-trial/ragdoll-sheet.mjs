// Job 12.6 sheet: one strip per death (frames over time from the kill), cropped to the middle of the game frame.
// Usage: node ragdoll-sheet.mjs <dir> <outFile>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
const [dir, out] = process.argv.slice(2);
const log = JSON.parse(readFileSync(path.join(dir, 'log.json'), 'utf8'));
const crop = f => sharp(path.join(dir, f)).extract({ left: 200, top: 150, width: 880, height: 520 }).resize(250, 148).png().toBuffer();
const NAMES = { rifle: 'Rifle (AR-5) to the chest', head: 'Head shot (DMR)', shotgun: 'Shotgun at 1.8 m', blast: 'Grenade blast' };
const times = ['kill', '0.15 s', '0.4 s', '0.9 s', '3.4 s, at rest'];
const rows = [];
for (const l of log) {
  if (l.alive || !existsSync(path.join(dir, `${l.tag}-0.png`))) continue;
  const cells = [];
  for (let i = 0; i < 5; i++) cells.push({ buf: await crop(`${l.tag}-${i}.png`), caption: times[i] });
  rows.push({ title: `${NAMES[l.tag]}: real kill, sim event w='${l.kill?.w}'${l.kill?.head ? ', head' : ''}`, cells });
}
console.log(await compose(rows, { width: 1250, title: 'Job 12.6: ragdoll on death, in the game (real kills by this player through the test hook)', out, jpeg: 72 }));
