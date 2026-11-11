// Proof sheet for job 2.2: the skinned Tactical soldier on the fighters' skeleton and animator. Side strips of the
// walk, aimed stance, crouch and a death, the weights, and close-ups of shoulders, elbows, hips and knees at their
// worst frames. Usage: node skin-strips.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';

const B = { upperL: 7, foreL: 8, upperR: 11, foreR: 12, thighL: 14, shinL: 15, thighR: 18, shinR: 19, pelvis: 1 };
const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
console.log(await t.call('loadSkinned', 'soldier'), await t.call('loadSkinned', 'weights', 'body_lod0', true));
await t.call('ourRig', 'ours');
const cell = async (rig, script, time, yaw, o = {}) => {
  await t.call('pose', rig, script, time); const p = await t.call('joint', rig, 1);
  return t.shot({ show: [{ name: rig }], w: o.w ?? 300, h: o.h ?? 440, at: o.at ?? [p[0], o.lowAt ?? 0.85, p[2]], yaw, pitch: o.pitch ?? 3, dist: o.dist ?? 3.6, fov: 30 });
};
const strip = async (rig, script, times, yaw, label, o) => { const cells = []; for (const tt of times) cells.push({ buf: await cell(rig, script, tt, yaw, o), caption: `${label} t=${tt.toFixed(2)} s` }); return cells; };
const close = async (rig, script, time, bone, yaw, pitch, label) => {
  await t.call('pose', rig, script, time); const j = await t.call('joint', rig, bone);
  return { buf: await t.shot({ show: [{ name: rig }], w: 300, h: 300, at: j, yaw, pitch, dist: 0.85, fov: 30 }), caption: label };
};
const rows = [
  { title: 'Weights (colour = strongest bone) and bind pose; then the animator\'s idle, soldier beside our rifleman', cells: [
    { buf: await cell('weights', 'idle', 0, 0), caption: 'weights, idle front' }, { buf: await cell('weights', 'idle', 0, 180), caption: 'weights, idle back' },
    { buf: await cell('soldier', 'idle', 0, 30), caption: 'soldier idle' }, { buf: await cell('ours', 'idle', 0, 30), caption: 'ours idle' },
    { buf: await cell('soldier', 'aim', 0.5, 30), caption: 'soldier aiming' }, { buf: await cell('ours', 'aim', 0.5, 30), caption: 'ours aiming' }] },
  { title: 'Walk, side (one stride)', cells: await strip('soldier', 'walk', [0, 0.17, 0.33, 0.5, 0.67, 0.83], 90, 'walk') },
  { title: 'Aimed stance and crouch', cells: [
    { buf: await cell('soldier', 'aim', 0.5, 90), caption: 'aim, side' }, { buf: await cell('soldier', 'aim', 0.5, 0), caption: 'aim, front' }, { buf: await cell('soldier', 'aimUp', 0.5, 90), caption: 'aim up 0.5 rad, side' },
    { buf: await cell('soldier', 'crouch', 0.6, 90), caption: 'crouch, side' }, { buf: await cell('soldier', 'crouch', 0.6, 0), caption: 'crouch, front' }, { buf: await cell('soldier', 'crouchwalk', 0.4, 90), caption: 'crouch walk, side' }] },
  { title: 'Death 0, side', cells: await strip('soldier', 'death0', [0.1, 0.35, 0.6, 0.85, 1.2, 2.0], 90, 'death', { lowAt: 0.5 }) },
  { title: 'Close-ups at the worst frames found (0.85 m, 30-degree camera)', cells: [
    await close('soldier', 'aim', 0.5, B.upperR, -35, 15, 'right shoulder, aiming'), await close('soldier', 'aim', 0.5, B.upperL, 35, 15, 'left shoulder, aiming'),
    await close('soldier', 'aim', 0.5, B.foreL, 120, 0, 'left elbow, aiming (support arm)'), await close('soldier', 'aim', 0.5, B.foreR, -90, -10, 'right elbow, aiming'),
    await close('soldier', 'crouch', 0.6, B.thighR, -70, 10, 'right hip, crouch'), await close('soldier', 'crouch', 0.6, B.shinL, 20, 10, 'left knee, crouch')] },
];
console.log(await compose(rows, { width: 1800, title: 'Tactical soldier skinned to the fighters\' skeleton (job 2.2): stock animator, our AR in hand, no head or hands attached yet', out, jpeg: 78 }));
await t.browser.close();
