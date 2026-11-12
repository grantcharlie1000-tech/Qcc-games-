// Soldier sheet: four full-height views and four close-ups at game scale (1:1 pixels of a 1280x720, 70-degree camera
// 2 m away, shown 3x) plus studio-scale detail crops. Usage:
//   node soldier.mjs <glbDir> <outDir> <candidate> [--ours]
// <candidate> is a key of SUBJECTS. With --ours, a second sheet interleaves our rifleman's rows.
import { open } from './lib.mjs';
import { compose, enlarge } from './sheet.mjs';
import path from 'node:path';

/** Close-up targets in metres on the normalised model (feet at y = 0, facing +Z); yaw/pitch of the camera. */
export const SUBJECTS = {
  tactical: { title: 'Tactical soldier in black (Patch scenario:asset_e9xaKzrr8R1sMe2VMajWaAb1, web variant)', load: ['tactical', 'soldier', 1.72, 0],
    head: [0, 1.58, 0.02, 15, 0], hand: [-0.40, 0.83, 0.02, 25, 0], chest: [0, 1.28, 0.05, 15, 0], boots: [0, 0.10, 0.05, 15, 20] },
  armoured: { title: 'Weathered armoured soldier (Patch scenario:asset_ma3BPFTWWAETEfU8vh9zQFrM, web-lod2)', load: ['armoured', 'soldier', 1.78, -Math.PI / 2],
    head: [0, 1.63, 0.02, 15, 0], hand: [-0.40, 0.85, 0.02, 25, 0], chest: [0, 1.32, 0.05, 15, 0], boots: [0, 0.10, 0.05, 15, 20] },
  trooper: { title: 'Orange desert trooper (Patch scenario:asset_in3md75AeDtffS4gGsbWsrBM, web variant)', load: ['trooper', 'soldier', 1.78, 0],
    head: [0, 1.63, 0.02, 15, 0], hand: [-0.40, 0.85, 0.02, 25, 0], chest: [0, 1.32, 0.05, 15, 0], boots: [0, 0.10, 0.05, 15, 20] },
  rifleman: { title: 'Ours: current rifleman (render/fighters, squad 0, LOD0, baked textures, idle pose)', load: null,
    head: [0, 1.66, 0.02, 15, 0], hand: [-0.10, 1.03, 0.30, 35, 0], chest: [0, 1.34, 0.08, 15, 0], boots: [0, 0.10, 0.05, 15, 20] },
};
const VIEWS = [['front', 0], ['three-quarter', 35], ['side', 90], ['back', 180]];
const CLOSE = ['head', 'hand', 'chest', 'boots'];

async function rows(t, key) {
  const s = SUBJECTS[key], name = s.load ? s.load[0] : 'rifleman';
  const full = [], close = [], detail = [];
  for (const [label, yaw] of VIEWS) full.push({ buf: await t.shot({ show: [{ name }], w: 450, h: 800, at: [0, 0.9, 0], yaw, pitch: 3, dist: 4.4, fov: 30 }), caption: label });
  for (const c of CLOSE) {
    const [x, y, z, yaw, pitch] = s[c];
    // 150 x 150 px window at the centre of a 1280x720 frame, 70-degree vertical FOV, 2 m from the target.
    const raw = await t.shot({ show: [{ name }], w: 150, h: 150, at: [x, y, z], yaw, pitch, dist: 2, fov: 70, view: [565, 285, 150, 150, 1280, 720] });
    close.push({ buf: await enlarge(raw, 3), caption: `${c}: game scale at 2 m (1:1, shown 3x)` });
    detail.push({ buf: await t.shot({ show: [{ name }], w: 450, h: 450, at: [x, y, z], yaw, pitch, dist: c === 'boots' ? 1.1 : c === 'chest' ? 1.2 : 0.8, fov: 30 }), caption: `${c}: studio detail` });
  }
  return { title: s.title, full, close, detail };
}

const [glbDir, outDir, key, flag] = process.argv.slice(2);
const t = await open({ glbDir });
const s = SUBJECTS[key];
console.log(key, await t.call('load', ...s.load));
const a = await rows(t, key);
const sheet = (r, note) => [{ title: `${r.title}${note ?? ''}`, cells: r.full }, { cells: r.close }, { cells: r.detail }];
const caption = 'Neutral three-point light, mid-grey backdrop, ACES. Full-height views: 30-degree camera, 4.4 m. Close-up row: exact pixels of a 1280x720 game frame, 70-degree FOV, 2 m away.';
console.log(await compose(sheet(a), { width: 1800, title: caption, out: path.join(outDir, `soldier-${key}.jpg`), jpeg: 80 }));
if (flag === '--ours') {
  console.log('ours', await t.call('ourRifleman'));
  const b = await rows(t, 'rifleman');
  console.log(await compose([...sheet(a), ...sheet(b)], { width: 1800, title: caption, out: path.join(outDir, `soldier-${key}-vs-ours.jpg`), jpeg: 74 }));
}
await t.browser.close();
