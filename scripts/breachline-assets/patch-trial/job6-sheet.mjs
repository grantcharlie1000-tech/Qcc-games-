// Job 6 sheet: corridor, hip and aimed, stock left and Patch right, with a 2x crop of the hip view.
// Usage: node job6-sheet.mjs <stockDir> <patchDir> <outFile>
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';
const [sd, pd, out] = process.argv.slice(2);
const c = async (d, f, cap, w = 640, h = 360) => ({ buf: await sharp(path.join(d, f)).resize(w, h).png().toBuffer(), caption: cap });
const k = async (d, f, cap) => ({ buf: await sharp(path.join(d, f)).extract({ left: 640, top: 360, width: 480, height: 270 }).resize(640, 360).png().toBuffer(), caption: cap });
console.log(await compose([
  { title: 'Hip', cells: [await c(sd, 'stock-corridor-hip.png', 'stock AR-5'), await c(pd, 'patch-corridor-hip.png', 'Patch rifle (job 6)')] },
  { title: 'Aimed', cells: [await c(sd, 'stock-corridor-aim.png', 'stock AR-5'), await c(pd, 'patch-corridor-aim.png', 'Patch rifle (job 6)')] },
  { title: 'Hip, 2x crop', cells: [await k(sd, 'stock-corridor-hip.png', 'stock'), await k(pd, 'patch-corridor-hip.png', 'Patch')] },
], { width: 1280, title: 'Job 6: the Patch rifle with the AR-5 optic, a dark-grey finish, narrower and lower; corridor, in the game', out, jpeg: 70 }));
