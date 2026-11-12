// Planner's follow-up to job 2.2: weight fixes (before/after), the luminance-remap recolour for both squads, our head
// and hands attached, and the finished figure at 2, 8 and 20 m from a 1280x720, 70-degree camera beside our rifleman.
// Usage: node soldier-finish.mjs <glbDir> <outDir>   (glbDir must hold bodyskinnedold.glb: the pre-fix skinned file)
import { open } from './lib.mjs';
import { compose, enlarge } from './sheet.mjs';
import path from 'node:path';

const B = { upperL: 7, foreL: 8, upperR: 11, thighR: 18, shinL: 15, head: 5, handL: 9, handR: 13 };
const [glbDir, outDir] = process.argv.slice(2);
const t = await open({ glbDir });
const head = 'Same light as the trial sheets. Stock fighter animator, our AR in hand.';
const pose = (rig, script, time) => t.call('pose', rig, script, time);
const close = async (rig, script, time, bone, yaw, pitch, label, dist = 0.85, w = 300, h = 300) => {
  await pose(rig, script, time); const j = await t.call('joint', rig, bone);
  return { buf: await t.shot({ show: [{ name: rig }], w, h, at: j, yaw, pitch, dist, fov: 30 }), caption: label };
};
const full = async (rig, script, time, yaw, label, w = 300, h = 520) => {
  await pose(rig, script, time); const p = await t.call('joint', rig, 1);
  return { buf: await t.shot({ show: [{ name: rig }], w, h, at: [p[0], 0.9, p[2]], yaw, pitch: 3, dist: 4.0, fov: 30 }), caption: label };
};

// 1. Weight fixes, before and after.
await t.call('loadSkinned', 'before', 'body_lod0', false, null, null, '/patch-dl/bodyskinnedold.glb');
await t.call('loadSkinned', 'after');
const fixes = [];
for (const [script, time, bone, yaw, pitch, label] of [['aim', 0.5, B.upperR, -35, 15, 'right shoulder, aiming'], ['aim', 0.5, B.upperL, 35, 15, 'left shoulder, aiming'], ['crouch', 0.6, B.thighR, -70, 10, 'right hip, crouch']]) {
  fixes.push(await close('before', script, time, bone, yaw, pitch, `before: ${label}`), await close('after', script, time, bone, yaw, pitch, `after: ${label}`));
}
console.log(await compose([{ title: 'Weight fixes: shoulder cap to the shoulder helper (aim); holster and thigh pockets rigid to the thigh (crouch)', cells: fixes }],
  { width: 1800, title: head, out: path.join(outDir, 'job2-5-weight-fixes.jpg'), jpeg: 82 }));

// 2. Looks: squad B (coyote/olive) and squad A as it ships (very dark slate fatigues, near-black kit), no attachments.
for (const [look, title, file] of [['B', 'Squad B: coyote fatigues, olive kit (luminance remap, weave, stains)', 'job2-5-look-squad-b.jpg'], ['A', 'Squad A as it ships: very dark slate fatigues, near-black kit', 'job2-5-look-squad-a.jpg']]) {
  const n = `look${look}`; await t.call('loadSkinned', n, 'body_lod0', false, look);
  const rows = [
    { title, cells: [await full(n, 'idle', 0, 0, 'front'), await full(n, 'idle', 0, 35, 'three-quarter'), await full(n, 'idle', 0, 180, 'back'), await full(n, 'aim', 0.5, 35, 'aiming'), await full(n, 'crouch', 0.6, 60, 'crouch'), await full(n, 'walk', 0.33, 90, 'walk')] },
    { cells: [await close(n, 'idle', 0, 3, 10, 10, 'chest rig', 0.75, 450, 400), await close(n, 'idle', 0, B.thighR, -30, 5, 'thigh, holster, pocket', 0.75, 450, 400), await close(n, 'idle', 0, 16, 15, 15, 'knee and boot', 0.75, 450, 400), await close(n, 'idle', 0, 3, 180, 10, 'back panel', 0.75, 450, 400)] },
  ];
  console.log(await compose(rows, { width: 1800, title: head, out: path.join(outDir, file), jpeg: 80 }));
}

// 3. Our head and hands attached, both squads.
const att = [];
for (const [sq, look] of [[0, 'A'], [1, 'B']]) {
  const n = `full${sq}`; console.log(n, await t.call('loadSkinned', n, 'body_lod0', false, look, sq));
  att.push({ title: `Squad ${look}: our helmet, balaclava, goggles and gloved hands (squad ${sq} set) on the soldier`, cells: [
    await full(n, 'idle', 0, 0, 'front'), await full(n, 'idle', 0, 35, 'three-quarter'),
    await close(n, 'idle', 0, B.head, 20, 5, 'head and neck', 0.7, 300, 520), await close(n, 'idle', 0, B.head, 110, 5, 'neck, side', 0.7, 300, 520),
    await close(n, 'aim', 0.5, B.handL, 60, 10, 'support hand and cuff, aiming', 0.6, 300, 520), await close(n, 'idle', 0, B.handR, -60, 0, 'firing hand and cuff', 0.6, 300, 520)] });
}
console.log(await compose(att, { width: 1800, title: head, out: path.join(outDir, 'job2-5-head-hands.jpg'), jpeg: 80 }));

// 4. Game distance: exact pixels of a 1280x720, 70-degree camera at eye height 1.6 m, figure straight ahead.
await t.call('ourRig', 'ours0', 0); await t.call('ourRig', 'ours1', 1);
const rows = [];
for (const d of [2, 8, 20]) {
  const half = Math.tan(35 * Math.PI / 180) * d, px = y => Math.round(360 - (y - 1.6) / half * 360);
  const top = Math.max(0, px(1.95)), bot = Math.min(720, px(-0.05)), h = bot - top, w = Math.max(24, Math.round(h * 0.62) + 8), x0 = 640 - Math.round(w / 2);
  const k = d === 2 ? 1 : d === 8 ? 3 : 6, cells = [];
  for (const [rig, label] of [['full0', 'soldier, squad A'], ['ours0', 'ours, squad 0'], ['full1', 'soldier, squad B'], ['ours1', 'ours, squad 1']]) {
    await pose(rig, 'idle', 0);
    const raw = await t.shot({ show: [{ name: rig }], w, h, pos: [0, 1.6, d], look: [0, 1.6, 0], fov: 70, view: [x0, top, w, h, 1280, 720] });
    cells.push({ buf: k === 1 ? raw : await enlarge(raw, k), caption: `${label}, ${d} m${k > 1 ? ` (1:1, shown ${k}x)` : ' (1:1)'}` });
  }
  rows.push({ title: `${d} m: figure about ${Math.round(1.8 / (2 * half) * 720)} px tall in a 720 px frame`, cells });
}
console.log(await compose(rows, { width: 1800, title: 'Game distance: exact pixels of a 1280x720 frame, 70-degree vertical FOV, eye 1.6 m, same light', out: path.join(outDir, 'job2-5-distance.jpg'), jpeg: 84 }));
await t.browser.close();
