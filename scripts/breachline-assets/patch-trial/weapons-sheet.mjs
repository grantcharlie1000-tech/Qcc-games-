// Job 5.4 evidence sheet from game-test-weapons.mjs: corridor and Lab, stock and Patch: hip, aimed, four reload frames,
// a 2x crop of the hip view, and the sidearm. Usage: node weapons-sheet.mjs <dir> <outFile>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
const [dir, out] = process.argv.slice(2);
const f = (tag, n) => path.join(dir, `${tag}-${n}.png`);
const small = async (tag, n, cap) => ({ buf: await sharp(f(tag, n)).resize(480, 270).png().toBuffer(), caption: cap });
const crop = async (tag, n, cap) => ({ buf: await sharp(f(tag, n)).extract({ left: 640, top: 360, width: 480, height: 270 }).resize(960, 540).png().toBuffer(), caption: cap });
const rows = [];
for (const place of ['corridor', 'lab']) {
  rows.push({ title: `${place === 'lab' ? 'Lab' : 'Corridor'}: hip and aimed (stock, Patch)`, cells: [await small('stock', `${place}-hip`, 'stock hip'), await small('patch', `${place}-hip`, 'Patch hip'), await small('stock', `${place}-aim`, 'stock aimed'), await small('patch', `${place}-aim`, 'Patch aimed')] });
  for (const tag of ['stock', 'patch']) rows.push({ cells: await Promise.all([0.35, 0.9, 1.5, 2.1].map(t => small(tag, `${place}-reload-${t}`, `${tag === 'patch' ? 'Patch' : 'stock'} reload, ${t} s`))) });
  rows.push({ cells: [await crop('stock', `${place}-hip`, 'stock hip, 2x crop'), await crop('patch', `${place}-hip`, 'Patch hip, 2x crop')] });
}
rows.push({ title: 'Sidearm at the hip, Lab', cells: [await small('stock', 'lab-pistol', 'stock pistol'), await small('patch', 'lab-pistol', 'Service Pistol')] });
console.log(await compose(rows, { width: 1920, title: 'Job 5: the weapon in hand in the game (seed 7, high tier), stock and ?weapons=patch', out, jpeg: 56 }));
