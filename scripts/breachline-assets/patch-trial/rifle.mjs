// Weapon sheets: five studio views per weapon, studio-scale detail crops of the candidate, and a first-person frame
// (1280x720, 55-degree FOV, weapon low right pointing away) with a 2x crop. Usage:
//   node rifle.mjs <glbDir> <outDir> <candidate> [--ours]
// With --ours, a second sheet adds our AR-5 and the Poly Haven Service Pistol under the same light.
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';
import sharp from 'sharp';
import path from 'node:path';

/** Muzzle toward -X after loading. `len` 0 keeps the file's scale (Poly Haven scales are measured). */
export const WEAPONS = {
  scifi: { title: 'Black sci-fi assault rifle (Patch scenario:asset_kHXqk4QynhrkbnpiD9C8A5zo, web-lod2, 151,030 triangles; scaled from an estimated 1.90 m to 0.88 m)',
    load: ['rifle', 'weapon', 0.88, 0], fp: [0.17, -0.19, -0.58],
    detail: [['receiver', [0.05, 0.02, 0], 0, 0.45], ['muzzle and handguard', [-0.28, 0.02, 0], -30, 0.45], ['grip and magazine', [0.02, -0.08, 0], 30, 0.4], ['stock', [0.33, 0.0, 0], 40, 0.4]] },
  bolt: { title: 'Bolt Action Rifle 7.62 (Patch polyhaven:bolt_action_rifle_7_62, web, 19,985 triangles, Poly Haven CC0, measured scale)',
    load: ['bolt', 'weapon', 0, 0, { hide: ['bolt_action_rifle_7_62_bolt_b', 'bolt_action_rifle_7_62_bullet_54mm'] }], fp: [0.17, -0.19, -0.75],
    detail: [['action and scope', [0.0, 0.05, 0], 0, 0.5], ['muzzle', [-0.5, 0.02, 0], -30, 0.4], ['grip and trigger', [0.12, -0.02, 0], 30, 0.4], ['butt', [0.45, -0.02, 0], 40, 0.4]] },
  pistol: { title: 'Service Pistol (Patch polyhaven:service_pistol, web, Poly Haven CC0, measured scale; variant A, magazine inserted)',
    load: ['pistol', 'weapon', 0, 0, { hide: ['service_pistol_pistol_b', 'service_pistol_slide_b', 'service_pistol_hammer_b', 'service_pistol_trigger_b', 'service_pistol_magazine_empty', 'service_pistol_bullet'], move: { service_pistol_magazine_loaded: [0.1, 0, 0] } }] },
  ar5: { title: 'Ours: AR-5 (render/hero, LOD0, baked 2048 texture set), 0.926 m', load: null, fp: [0.17, -0.19, -0.60] },
};
const VIEWS = [['side, muzzle left', 0, 4], ['side, muzzle right', 180, 4], ['three-quarter front', -40, 15], ['three-quarter rear', 40, 15], ['top', 0, 89]];

async function views(t, key, dist) {
  const name = WEAPONS[key].load ? WEAPONS[key].load[0] : 'ar5', cells = [];
  for (const [label, yaw, pitch] of VIEWS) cells.push({ buf: await t.shot({ show: [{ name }], w: 360, h: 240, at: [0, 0, 0], yaw, pitch, dist, fov: 30 }), caption: label });
  return cells;
}
async function detail(t, key) {
  const w = WEAPONS[key], cells = [];
  for (const [label, at, yaw, dist] of w.detail) cells.push({ buf: await t.shot({ show: [{ name: w.load[0] }], w: 450, h: 300, at, yaw, pitch: 10, dist, fov: 30 }), caption: `${label}: studio detail` });
  return cells;
}
/** First-person frame: camera at the origin looking down -Z, weapon turned muzzle-forward and placed low right. */
async function fp(t, key) {
  const w = WEAPONS[key], name = w.load ? w.load[0] : 'ar5', [x, y, z] = w.fp;
  const full = await t.shot({ show: [{ name, x, y, z, yaw: -90 + 3, roll: -4 }], w: 1280, h: 720, pos: [0, 0, 0], look: [0, 0, -1], fov: 55 });
  const small = await sharp(full).resize(900, 506).png().toBuffer();
  const crop = await sharp(full).extract({ left: 560, top: 400, width: 450, height: 253 }).resize(900, 506, { kernel: 'nearest' }).png().toBuffer();
  return [{ buf: small, caption: 'first person: 1280x720 frame, 55-degree FOV (shown at 70%)' }, { buf: crop, caption: 'first person: 2x crop of the same frame' }];
}

const [glbDir, outDir, key, flag] = process.argv.slice(2);
const t = await open({ glbDir });
const w = WEAPONS[key];
console.log(key, JSON.stringify(await t.call('load', ...w.load)));
const dist = w.load[2] === 0 && key === 'bolt' ? 1.75 : 1.32;
const head = 'Neutral three-point light, mid-grey backdrop, ACES. Studio views: 30-degree camera. Same light for every weapon.';
const cand = [{ title: w.title, cells: await views(t, key, dist) }, { cells: await detail(t, key) }, { cells: await fp(t, key) }];
console.log(await compose(cand, { width: 1800, title: head, out: path.join(outDir, `rifle-${key}.jpg`), jpeg: 80 }));
if (flag === '--ours') {
  console.log('ar5', JSON.stringify(await t.call('ourAr5')));
  console.log('pistol', JSON.stringify(await t.call('load', ...WEAPONS.pistol.load)));
  const rows = [
    { title: w.title, cells: await views(t, key, dist) },
    { title: WEAPONS.ar5.title, cells: await views(t, 'ar5', 1.38) },
    { title: WEAPONS.pistol.title + ' (shown at 2.9x the rifles\' scale)', cells: await views(t, 'pistol', 0.45) },
    { title: 'First person, candidate', cells: await fp(t, key) },
    { title: 'First person, ours (AR-5 alone, same placement, no hands)', cells: await fp(t, 'ar5') },
  ];
  console.log(await compose(rows, { width: 1800, title: head, out: path.join(outDir, `rifle-${key}-vs-ours.jpg`), jpeg: 76 }));
}
await t.browser.close();
