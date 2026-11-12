// Job 3.3-3.5 proof: no capped cut visible anywhere (hips at 2 m), the crouch hip with the fill patch, and the finished
// figures (asset head and hands, Patch headgear, squad looks, our rifle) at 2, 8 and 20 m beside our rifleman.
// Usage: node job3-distance.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose, enlarge } from './sheet.mjs';

const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
for (const [n, look, sets] of [['sA', 'A', ['helmetA', 'gogglesA']], ['sB', 'B', ['headsetB']]]) { await t.call('loadSkinned', n, 'body_lod0', false, look); await t.call('headgear', n, sets); }
await t.call('ourRig', 'o0', 0); await t.call('ourRig', 'o1', 1);
const pose = (rig, s, tt) => t.call('pose', rig, s, tt);
const close = async (rig, script, time, bone, yaw, pitch, label, dist = 0.8) => { await pose(rig, script, time); const j = await t.call('joint', rig, bone);
  return { buf: await t.shot({ show: [{ name: rig }], w: 300, h: 300, at: j, yaw, pitch, dist, fov: 30 }), caption: label }; };
const rows = [{ title: 'Hips: the left hip at idle (where the cut forearm used to show), and the crouch hips with the fill patches', cells: [
  await close('sA', 'idle', 0, 14, 30, 5, 'left hip, idle, squad A'), await close('sB', 'idle', 0, 14, 30, 5, 'left hip, idle, squad B'),
  await close('sA', 'crouch', 0.6, 18, -70, 10, 'right hip, crouch, A'), await close('sB', 'crouch', 0.6, 18, -70, 10, 'right hip, crouch, B'),
  await close('sA', 'crouch', 0.6, 14, 70, 10, 'left hip, crouch, A'), await close('sA', 'crouchwalk', 0.4, 18, -90, 5, 'right hip, crouch walk, A')] }];
for (const d of [2, 8, 20]) {
  const half = Math.tan(35 * Math.PI / 180) * d, px = y => Math.round(360 - (y - 1.6) / half * 360);
  const top = Math.max(0, px(1.95)), bot = Math.min(720, px(-0.05)), h = bot - top, w = Math.max(24, Math.round(h * 0.62) + 8), x0 = 640 - Math.round(w / 2);
  const k = d === 2 ? 1 : d === 8 ? 3 : 6, cells = [];
  for (const [rig, label] of [['sA', 'Patch soldier, squad A'], ['o0', 'ours, squad 0'], ['sB', 'Patch soldier, squad B'], ['o1', 'ours, squad 1']]) {
    await pose(rig, 'idle', 0);
    const raw = await t.shot({ show: [{ name: rig }], w, h, pos: [0, 1.6, d], look: [0, 1.6, 0], fov: 70, view: [x0, top, w, h, 1280, 720] });
    cells.push({ buf: k === 1 ? raw : await enlarge(raw, k), caption: `${label}, ${d} m${k > 1 ? ` (1:1, ${k}x)` : ' (1:1)'}` });
  }
  rows.push({ title: `${d} m: about ${Math.round(1.8 / (2 * half) * 720)} px tall (exact pixels of a 1280x720, 70-degree frame, eye 1.6 m)`, cells });
}
console.log(await compose(rows, { width: 1800, title: 'Job 3.3-3.5: finished Patch figure vs our rifleman. Same light as the trial sheets.', out, jpeg: 82 }));
await t.browser.close();
