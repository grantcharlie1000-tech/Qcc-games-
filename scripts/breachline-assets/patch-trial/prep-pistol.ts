/** Job 2.4: the Poly Haven Service Pistol (variant A) as separate parts with pivots, for our sidearm. Run with
 * `npx vite-node scripts/breachline-assets/patch-trial/prep-pistol.ts` (env PISTOL = the Patch `web` GLB).
 * Writes public/game-art/breachline/patch/pistol/: pistol.glb (nodes frame, slide, magazine, hammer, trigger, each
 * with its pivot as the node translation), KTX2 textures at 1024 with 512 JPEG fallbacks, sockets.json.
 * Our weapon frame: metres, muzzle toward -Z, +Y up, +X right; origin at the bounding-box centre of the assembled
 * pistol. The file has the muzzle at +X: file (x, y, z) -> ours (z, y, -x). */
import * as THREE from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { MeshoptSimplifier } from 'meshoptimizer';
// @ts-expect-error plain JS modules
import { compact } from './mesh.mjs';
// @ts-expect-error plain JS modules
import { readGlb, primitive, writeGlb } from './glb.mjs';
// @ts-expect-error plain JS modules
import { ktx2, jpeg } from './ktx.mjs';

const OUT = 'public/game-art/breachline/patch/pistol';
/** Variant A's parts; the loaded magazine sits 0.1 m behind the pistol in the file and is moved into the grip. */
const PARTS = [
  { name: 'frame', node: 'service_pistol_pistol_a', move: [0, 0, 0], pivot: null as number[] | null },
  { name: 'slide', node: 'service_pistol_slide_a', move: [0, 0, 0], pivot: null },
  { name: 'magazine', node: 'service_pistol_magazine_loaded', move: [0.1, 0, 0], pivot: [-0.0225, 0.107, 0] },
  { name: 'hammer', node: 'service_pistol_hammer_a', move: [0, 0, 0], pivot: [-0.0525, 0.1025, 0] },
  { name: 'trigger', node: 'service_pistol_trigger_a', move: [0, 0, 0], pivot: [0.027, 0.094, 0] },
];
const toOurs = (x: number, y: number, z: number, c: number[]) => [z - c[2], y - c[1], -(x - c[0])];

async function main() {
  await mkdir(OUT, { recursive: true }); await MeshoptSimplifier.ready;
  const g = await readGlb(process.env.PISTOL!);
  const parts = PARTS.map(P => { const i = g.json.nodes.findIndex((n: { name: string }) => n.name === P.node), p = primitive(g, i), t = p.node.translation ?? [0, 0, 0];
    const pos = new Float32Array(p.pos.length); for (let k = 0; k < pos.length; k += 3) for (let c = 0; c < 3; c++) pos[k + c] = p.pos[k + c] + t[c] + P.move[c];
    // Budget (2 MB): the loaded magazine carries 9k triangles of rounds that sit inside the grip; simplify it.
    if (P.name === 'magazine') { const [ix] = MeshoptSimplifier.simplify(p.idx, pos, 3, 1500 * 3, 0.02, []); const c = compact({ pos, nrm: p.nrm, uv: p.uv, idx: new Uint32Array(ix) }); return { ...P, pos: c.pos, nrm: c.nrm, uv: c.uv, idx: c.idx }; }
    return { ...P, pos, nrm: p.nrm, uv: p.uv, idx: p.idx }; });
  // Bounding box of the assembly (file frame).
  const mn = [9, 9, 9], mx = [-9, -9, -9];
  for (const q of parts) for (let k = 0; k < q.pos.length; k += 3) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], q.pos[k + c]); mx[c] = Math.max(mx[c], q.pos[k + c]); }
  const cen = mn.map((v, c) => (v + mx[c]) / 2);
  const meshes = [];
  for (const q of parts) {
    // Pivot: given, else the part's own bounding-box centre (frame and slide).
    let pv = q.pivot; if (!pv) { const a = [9, 9, 9], b = [-9, -9, -9]; for (let k = 0; k < q.pos.length; k += 3) for (let c = 0; c < 3; c++) { a[c] = Math.min(a[c], q.pos[k + c]); b[c] = Math.max(b[c], q.pos[k + c]); } pv = a.map((v, c) => (v + b[c]) / 2); }
    const pvo = toOurs(pv[0], pv[1], pv[2], cen), n = q.pos.length / 3, P = new Float32Array(n * 3), N = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const o = toOurs(q.pos[i * 3], q.pos[i * 3 + 1], q.pos[i * 3 + 2], cen); P.set([o[0] - pvo[0], o[1] - pvo[1], o[2] - pvo[2]], i * 3); N.set([q.nrm[i * 3 + 2], q.nrm[i * 3 + 1], -q.nrm[i * 3]], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(q.uv, 2)); geo.setIndex(new THREE.BufferAttribute(q.idx, 1));
    geo.computeTangents();
    meshes.push({ name: q.name, translation: pvo.map(v => +v.toFixed(5)), attributes: { POSITION: P, NORMAL: N, TANGENT: geo.getAttribute('tangent').array as Float32Array, TEXCOORD_0: q.uv }, indices: q.idx, tris: q.idx.length / 3 });
  }
  const f = (x: number, y: number, z: number) => toOurs(x, y, z, cen).map(v => +v.toFixed(4));
  const sockets = {
    frame: 'metres; muzzle toward -Z, +Y up, +X right; origin at the bounding-box centre of the assembled pistol',
    muzzle: f(0.151, 0.117, 0), bore: 0.018,
    grip: { palm: f(-0.03, 0.06, 0), axisDeg: 18 }, support: { palm: f(-0.03, 0.045, -0.035), note: 'wrapped round the firing hand, left side' },
    trigger: f(0.032, 0.075, 0), mag: { seat: f(-0.0225, 0.107, 0), node: 'magazine', note: 'node origin = seat; drop along -Y' },
    eject: f(0.02, 0.118, 0.016), handle: f(-0.045, 0.115, 0), slide: { node: 'slide', travel: 0.035, axis: '+Z (rearward)' },
    hammer: { node: 'hammer', axis: 'X', cockedDeg: 'rotate back about X to cock' }, triggerPivot: { node: 'trigger', axis: 'X' },
    measured: 'from part bounding boxes and the side profile; fine-tune with the hands in place',
  };
  await writeGlb(`${OUT}/pistol.glb`, meshes, { source: 'patch.gg polyhaven:service_pistol (web)', license: 'CC0-1.0', sockets, normalMap: 'tangent space, +Y up (glTF), with the TANGENT attribute' });
  await writeFile(`${OUT}/sockets.json`, JSON.stringify(sockets, null, 1));
  // Textures: base colour, normal, and metal/roughness as our packed map (R = 1, G = roughness, B = metalness).
  const mat = g.json.materials[0], img = (i: number) => g.image(g.json.textures[i].source);
  const mr = await sharp(img(mat.pbrMetallicRoughness.metallicRoughnessTexture.index)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < mr.data.length; i += 3) mr.data[i] = 255;
  const armPng = await sharp(mr.data, { raw: { width: mr.info.width, height: mr.info.height, channels: 3 } }).png().toBuffer();
  const files: Record<string, number> = {}, put = async (name: string, buf: Buffer) => { await writeFile(`${OUT}/${name}`, buf); files[name] = buf.length; };
  for (const [kd, im] of [['diff', img(mat.pbrMetallicRoughness.baseColorTexture.index)], ['nor', img(mat.normalTexture.index)], ['arm', armPng]] as const) {
    // Budget: the packed roughness/metal map ships at 512 (0.85 MB at 1024).
    const size = kd === 'arm' ? 512 : 1024; await put(`${kd}-${size}.ktx2`, await ktx2(im, size, kd)); await put(`${kd}-512.jpg`, await jpeg(im, 512, kd === 'diff' ? 82 : 90));
  }
  files['pistol.glb'] = statSync(`${OUT}/pistol.glb`).size;
  console.log(meshes.map(m => `${m.name} ${m.tris} @${m.translation}`).join(' | '), JSON.stringify(files), (Object.values(files).reduce((a, b) => a + b, 0) / 1e6).toFixed(2), 'MB');
}
main();
