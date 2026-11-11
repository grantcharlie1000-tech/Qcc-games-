// Job 3.1 proof: the asset's own head (repainted as a knitted balaclava with an eye band) and hands (bare fingertips
// repainted as glove), skinned to the fighters' skeleton; both squads; hands on our rifle at 2 m.
// Usage: node job3-head-hands.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';

const B = { head: 5, handL: 9, handR: 13 };
const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
const pose = (rig, s, tt) => t.call('pose', rig, s, tt);
const full = async (rig, script, time, yaw, label) => { await pose(rig, script, time); const p = await t.call('joint', rig, 1);
  return { buf: await t.shot({ show: [{ name: rig }], w: 300, h: 520, at: [p[0], 0.9, p[2]], yaw, pitch: 3, dist: 4.0, fov: 30 }), caption: label }; };
const close = async (rig, script, time, bone, yaw, pitch, label, dist = 0.6) => { await pose(rig, script, time); const j = await t.call('joint', rig, bone);
  return { buf: await t.shot({ show: [{ name: rig }], w: 300, h: 360, at: j, yaw, pitch, dist, fov: 30 }), caption: label }; };
const game = async (rig, script, time, label) => { await pose(rig, script, time);
  // Exact pixels of a 1280x720, 70-degree camera 2 m in front at eye height, the window around the hands and rifle.
  return { buf: await t.shot({ show: [{ name: rig }], w: 300, h: 360, pos: [0, 1.6, 2], look: [0, 1.6, 0], fov: 70, view: [530, 290, 300, 360, 1280, 720] }), caption: label }; };
const rows = [];
for (const look of ['A', 'B']) {
  const n = `s${look}`; await t.call('loadSkinned', n, 'body_lod0', false, look);
  console.log(look, 'headgear triangles', await t.call('headgear', n, look === 'A' ? ['helmetA', 'gogglesA'] : ['headsetB']));
  rows.push({ title: `Squad ${look}: the asset's own head and hands, repainted (balaclava with eye band; gloves), with ${look === 'A' ? 'steel helmet and goggles' : 'headset over the bare balaclava'} from Patch`, cells: [
    await full(n, 'idle', 0, 0, 'front'), await full(n, 'idle', 0, 35, 'three-quarter'),
    await close(n, 'idle', 0, B.head, 0, 0, 'head, front', 0.55), await close(n, 'idle', 0, B.head, 70, 0, 'head, side', 0.55),
    await close(n, 'aim', 0.5, B.handL, 50, 10, 'support hand on the handguard'), await game(n, 'idle', 0, 'hands at 2 m, game pixels (1:1)')] });
}
console.log(await compose(rows, { width: 1800, title: 'Jobs 3.1 and 3.2. Same light as the trial sheets; stock animator, our AR in hand.', out, jpeg: 82 }));
await t.browser.close();
