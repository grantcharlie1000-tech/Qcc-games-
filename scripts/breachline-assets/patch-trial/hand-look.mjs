// Job 3.7: a quick look at Polyfork's "Base Hand" (CC-BY) as a base for a baked first-person glove, beside our current
// glove from render/hero (its studio page, untouched). Usage: node hand-look.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';
import { chromium } from 'playwright';
import sharp from 'sharp';

const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
const GLOVE = 0x24262a;
await t.call('baseHand', 'open', { curl: [0, 0, 0], thumb: [0, 0, 0], color: GLOVE });
await t.call('baseHand', 'fist', { palmSign: -1, curl: [1.45, 1.3, 0.8], thumb: [0.9, 0.6, 0.4], color: GLOVE });
await t.call('loadPrepared', 'rifleW', 'rifle-scifi', 'rifle.glb', '*', { rotY: 0, norSize: 1024 });
await t.call('baseHand', 'L', { palmSign: -1, curl: [1.25, 1.1, 0.7], thumb: [0.3, 0.4, 0.3], color: GLOVE, target: { p: [0, -0.078, -0.25], n: [0, 1, 0], f: [1, 0, 0] } });
await t.call('baseHand', 'R', { palmSign: -1, mirror: true, curl: [1.45, 1.3, 0.8], thumb: [0.9, 0.6, 0.4], color: GLOVE, target: { p: [0.032, -0.075, 0.19], n: [-1, 0, 0], f: [0, -0.34, -0.94] } });
await t.call('group', 'rig', [{ name: 'rifleW' }, { name: 'L' }, { name: 'R' }]);
const base = [
  { buf: await t.shot({ show: [{ name: 'open' }], w: 300, h: 300, at: [0, 0.02, 0.07], yaw: 0, pitch: 70, dist: 0.45, fov: 30 }), caption: 'base hand, open, back' },
  { buf: await t.shot({ show: [{ name: 'open' }], w: 300, h: 300, at: [0, 0.02, 0.07], yaw: 60, pitch: 15, dist: 0.45, fov: 30 }), caption: 'base hand, open, side' },
  { buf: await t.shot({ show: [{ name: 'fist' }], w: 300, h: 300, at: [0, 0.0, 0.06], yaw: 90, pitch: 10, dist: 0.4, fov: 30 }), caption: 'base hand, curled' },
  { buf: await t.shot({ show: [{ name: 'rig' }], w: 300, h: 300, at: [0.02, -0.08, 0.2], yaw: 70, pitch: 10, dist: 0.45, fov: 30 }), caption: 'base hand on the Patch rifle grip' },
  { buf: await t.shot({ show: [{ name: 'rig' }], w: 300, h: 300, at: [0, -0.06, -0.25], yaw: -110, pitch: -15, dist: 0.45, fov: 30 }), caption: 'base hand under the handguard' },
];
const fpFull = await t.shot({ show: [{ name: 'rig', x: 0.15, y: -0.15, z: -0.5, yaw: 3, roll: -4 }], w: 1280, h: 720, pos: [0, 0, 0], look: [0, 0, -1], fov: 55 });
await t.browser.close();
// Ours, from the hero studio (render/hero/studio), same sizes.
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pg = await b.newPage({ viewport: { width: 300, height: 300 }, deviceScaleFactor: 1 });
await pg.goto('http://127.0.0.1:5391/src/games/breachline/render/hero/studio/index.html');
await pg.waitForFunction(() => window.__heroReady === true, null, { timeout: 300000 });
const hero = async (fn, w, h, ...args) => { await pg.setViewportSize({ width: w, height: h }); await pg.evaluate(([fn, args]) => window.__breachlineHero[fn](...args), [fn, args]); return pg.locator('#c').screenshot(); };
const ours = [
  { buf: await hero('hand', 300, 300, { pose: 'open', yaw: 0, pitch: 70, dist: 0.45 }), caption: 'ours (render/hero), open, back' },
  { buf: await hero('hand', 300, 300, { pose: 'open', yaw: 60, pitch: 15, dist: 0.45 }), caption: 'ours, open, side' },
  { buf: await hero('hand', 300, 300, { pose: 'fist', yaw: 90, pitch: 10, dist: 0.4 }), caption: 'ours, fist' },
  { buf: await hero('fp', 300, 300, 'ar', { orbit: true, yaw: 70, pitch: 10, dist: 0.45, at: [0, -0.07, 0.18] }), caption: 'ours on the AR-5 grip' },
  { buf: await hero('fp', 300, 300, 'ar', { orbit: true, yaw: -110, pitch: -15, dist: 0.45, at: [0, -0.04, -0.25] }), caption: 'ours under the handguard' },
];
const oursFp = await hero('fp', 1280, 720, 'ar', {});
await b.close();
const half = async (buf, cap) => ({ buf: await sharp(buf).resize(900, 506).png().toBuffer(), caption: cap });
const rows = [
  { title: 'Polyfork "Base Hand" (3,000 triangles, 25 joints, CC-BY), posed by this page (dark glove colour, no texture)', cells: base },
  { title: 'Our current glove (render/hero), same views', cells: ours },
  { title: 'First person (1280x720, shown at 70%): base hands on the Patch rifle | our rig on the AR-5', cells: [await half(fpFull, 'base hand'), await half(oursFp, 'ours')] },
];
console.log(await compose(rows, { width: 1800, title: 'Job 3.7: first-person hands, quick look', out, jpeg: 82 }));
