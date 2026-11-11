// Proof sheet for job 2.4: the Service Pistol split into parts with pivots (public/game-art/breachline/patch/pistol)
// beside the Patch original. Usage: node pistol-clean.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';
import { readFile } from 'node:fs/promises';

const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
const hide = ['service_pistol_pistol_b', 'service_pistol_slide_b', 'service_pistol_hammer_b', 'service_pistol_trigger_b', 'service_pistol_magazine_empty', 'service_pistol_bullet'];
console.log(await t.call('load', 'pistol', 'weapon', 0, Math.PI, { hide, move: { service_pistol_magazine_loaded: [0.1, 0, 0] } }));
const R = Math.PI / 2, L = (n, o = {}) => t.call('loadPrepared', n, 'pistol', 'pistol.glb', '*', { rotY: R, size: 1024, armSize: 512, ...o });
console.log(await L('parts'), await L('open', { drop: { slide: [0, 0, 0.035], magazine: [0, -0.09, 0] } }), await L('clay', { plain: true }));
const S = JSON.parse(await readFile('../../../public/game-art/breachline/patch/pistol/sockets.json', 'utf8'));
await t.call('markers', 'sockets', [S.muzzle, S.grip.palm, S.support.palm, S.trigger, S.mag.seat, S.eject, S.handle], R, 0.003);
const V = [['side, muzzle left', 0, 4], ['side, muzzle right', 180, 4], ['three-quarter front', -40, 15], ['three-quarter rear', 40, 15]];
const views = async (names, cap, at = [0, 0, 0], dist = 0.5) => { const c = []; for (const [l, yaw, pitch] of V) c.push({ buf: await t.shot({ show: names.map(name => ({ name })), w: 450, h: 300, at, yaw, pitch, dist, fov: 30 }), caption: `${cap}: ${l}` }); return c; };
const rows = [
  { title: 'Patch original (variant A, magazine moved into the grip), turned muzzle-left', cells: await views(['pistol'], 'original') },
  { title: 'Ours: frame, slide, magazine (1,822 tris, simplified from 9,094), hammer, trigger as separate nodes with pivots; KTX2 1024 (roughness/metal 512)', cells: await views(['parts'], 'parts') },
  { title: 'Slide back 35 mm, magazine dropped 90 mm (moving only the node translations), sockets, clay', cells: [
    ...(await views(['open'], 'open', [0, -0.03, 0], 0.6)).slice(0, 2),
    { buf: await t.shot({ show: [{ name: 'parts' }, { name: 'sockets' }], w: 450, h: 300, at: [0, 0, 0], yaw: 0, pitch: 4, dist: 0.5, fov: 30 }), caption: 'sockets: muzzle, grip, support, trigger, mag, eject, handle' },
    { buf: await t.shot({ show: [{ name: 'clay' }], w: 450, h: 300, at: [0, 0, 0], yaw: -40, pitch: 15, dist: 0.5, fov: 30 }), caption: 'clay: normal map with the TANGENT attribute' }] },
];
console.log(await compose(rows, { width: 1800, title: 'Service Pistol split for the sidearm (job 2.4). Same light as the trial sheets; textures through ArtLoader.', out, jpeg: 82 }));
await t.browser.close();
