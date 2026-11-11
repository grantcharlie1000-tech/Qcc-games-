// Proof sheet for job 2.3: the sci-fi rifle decimated, re-unwrapped, baked and painted out
// (public/game-art/breachline/patch/rifle-scifi) beside the 151k original; magazine out; sockets; first person.
// Usage: node rifle-clean.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
console.log(await t.call('load', 'rifle', 'weapon', 0.88, 0));
const R = Math.PI / 2, L = (n, o = {}) => t.call('loadPrepared', n, 'rifle-scifi', 'rifle.glb', '*', { rotY: R, norSize: 1024, ...o });
console.log(await L('clean'), await L('clay', { plain: true }), await L('magout', { drop: { magazine: [0, -0.1, 0.02] } }));
const S = JSON.parse(await readFile('../../../public/game-art/breachline/patch/rifle-scifi/sockets.json', 'utf8'));
await t.call('markers', 'sockets', [S.muzzle, S.sightLine.rear, S.sightLine.front, S.grip.palm, S.support.palm, S.trigger, S.mag.seat, S.eject, S.handle], R);
const V = [['side, muzzle left', 0, 4], ['side, muzzle right', 180, 4], ['three-quarter front', -40, 15], ['three-quarter rear', 40, 15]];
const views = async (names, cap) => { const c = []; for (const [l, yaw, pitch] of V) c.push({ buf: await t.shot({ show: names.map(name => ({ name })), w: 450, h: 280, at: [0, 0, 0], yaw, pitch, dist: 1.25, fov: 30 }), caption: `${cap}: ${l}` }); return c; };
const fp = async name => { const full = await t.shot({ show: [{ name, x: 0.17, y: -0.19, z: -0.58, yaw: -87, roll: -4 }], w: 1280, h: 720, pos: [0, 0, 0], look: [0, 0, -1], fov: 55 });
  return [{ buf: await sharp(full).extract({ left: 560, top: 400, width: 450, height: 253 }).resize(900, 506, { kernel: 'nearest' }).png().toBuffer(), caption: `${name === 'rifle' ? 'original' : 'cleaned'}: first person, 2x crop (1280x720, 55-degree FOV)` }]; };
const detail = async (name, at, yaw, cap) => ({ buf: await t.shot({ show: [{ name }], w: 450, h: 300, at, yaw, pitch: 10, dist: 0.45, fov: 30 }), caption: cap });
const atlas = async (f, cap) => ({ buf: await sharp(f).resize(300, 300).png().toBuffer(), caption: cap });
const rows = [
  { title: 'Original: Patch web-lod2, 151,030 triangles, generated atlas', cells: await views(['rifle'], 'original') },
  { title: 'Cleaned: 15,258 triangles (body 14,426 + magazine 832), new 2048 atlas, glow, orange and text painted out', cells: await views(['clean'], 'cleaned') },
  { title: 'Detail, original vs cleaned (receiver with "X7A", handguard windows)', cells: [await detail('rifle', [0.02, 0.03, 0], 0, 'original receiver'), await detail('clean', [0.02, 0.03, 0], 0, 'cleaned receiver'), await detail('rifle', [-0.25, 0.03, 0], -25, 'original handguard'), await detail('clean', [-0.25, 0.03, 0], -25, 'cleaned handguard')] },
  { title: 'Magazine as its own capped mesh (dropped 10 cm), sockets (red), clay (normal map only)', cells: [
    { buf: await t.shot({ show: [{ name: 'magout' }], w: 450, h: 280, at: [0, -0.04, 0], yaw: -30, pitch: 10, dist: 1.1, fov: 30 }), caption: 'magazine out' },
    { buf: await t.shot({ show: [{ name: 'magout' }], w: 450, h: 280, at: [0.0, -0.06, 0], yaw: 20, pitch: -35, dist: 0.6, fov: 30 }), caption: 'magazine well and magazine top, from below' },
    { buf: await t.shot({ show: [{ name: 'clean' }, { name: 'sockets' }], w: 450, h: 280, at: [0, 0, 0], yaw: 0, pitch: 4, dist: 1.25, fov: 30 }), caption: 'sockets: muzzle, sight, grip, support, trigger, mag, eject, handle' },
    { buf: await t.shot({ show: [{ name: 'clay' }], w: 450, h: 280, at: [0, 0, 0], yaw: -40, pitch: 15, dist: 1.25, fov: 30 }), caption: 'clay: baked normal map on grey' }] },
  { cells: [...await fp('rifle'), ...await fp('clean')] },
];
console.log(await compose(rows, { width: 1800, title: 'Sci-fi rifle made usable (job 2.3). Same light as the trial sheets; textures from the shipped KTX2 files through ArtLoader.', out, jpeg: 80 }));
await t.browser.close();
