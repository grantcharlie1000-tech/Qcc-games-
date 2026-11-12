// Proof sheet for job 2.1: the cleaned Tactical soldier (public/game-art/breachline/patch/tactical) beside the
// original, both levels, the tint-mask recolour (coyote fatigues, olive kit), the mask itself, and the capped cuts.
// Usage: node soldier-clean.mjs <glbDir> <outFile>
import { open } from './lib.mjs';
import { compose } from './sheet.mjs';

const [glbDir, out] = process.argv.slice(2);
const t = await open({ glbDir });
console.log(await t.call('load', 'tactical', 'soldier', 1.72, 0));
const L = (n, node, o) => t.call('loadPrepared', n, 'tactical', 'body.glb', node, o);
console.log(await L('clean0', 'body_lod0', {}), await L('clean1', 'body_lod1', { size: 1024 }));
await L('coyote', 'body_lod0', { tint: [0x6b5133, 0x464b2c] });
await L('maskview', 'body_lod0', { tint: [0x9a9a9a, 0xc0302a] });
await L('wire', 'body_lod1', { plain: true });
const full = (name, yaw, cap) => t.shot({ show: [{ name }], w: 360, h: 640, at: [0, 0.88, 0], yaw, pitch: 3, dist: 4.4, fov: 30 }).then(buf => ({ buf, caption: cap }));
const close = (name, at, yaw, pitch, dist, cap) => t.shot({ show: [{ name }], w: 450, h: 400, at, yaw, pitch, dist, fov: 30 }).then(buf => ({ buf, caption: cap }));
const rows = [
  { title: 'Original (Patch web variant) | cleaned LOD0: metalness 0, head and hands cut and capped', cells: [await full('tactical', 35, 'original, three-quarter'), await full('clean0', 0, 'LOD0 front (12,000 tris)'), await full('clean0', 35, 'LOD0 three-quarter'), await full('clean0', 150, 'LOD0 rear three-quarter'), await full('clean0', 90, 'LOD0 side')] },
  { title: 'LOD1 and the second-squad recolour through the tint mask (coyote fatigues, olive kit)', cells: [await full('clean1', 0, 'LOD1 front (5,000 tris, 1024 maps)'), await full('clean1', 35, 'LOD1 three-quarter'), await full('coyote', 0, 'recolour, front'), await full('coyote', 35, 'recolour, three-quarter'), await full('coyote', 180, 'recolour, back')] },
  { title: 'The mask (red = kit, grey = fatigues) and the capped cuts', cells: [await close('maskview', [0, 1.0, 0], 0, 0, 2.6, 'mask, front'), await close('maskview', [0, 1.0, 0], 180, 0, 2.6, 'mask, back'), await close('clean0', [0, 1.45, 0], 20, 35, 0.9, 'neck cap (our balaclava/helmet attach here)'), await close('clean0', [0.39, 0.93, 0.09], 60, -20, 0.6, 'wrist cap (our gloved hands attach here)')] },
];
console.log(await compose(rows, { width: 1800, title: 'Tactical soldier, cleaned (job 2.1). Same light as the trial sheets. Textures loaded from the shipped KTX2 files through ArtLoader.', out, jpeg: 80 }));
await t.browser.close();
