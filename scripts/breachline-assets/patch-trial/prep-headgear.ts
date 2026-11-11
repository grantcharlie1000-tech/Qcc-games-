/** Job 3.2: headgear from Patch, prepared for the fighters' head bone. Run with
 * `npx vite-node scripts/breachline-assets/patch-trial/prep-headgear.ts` (env HG = folder holding hg_<name>.glb).
 * Each prop is flattened (node transforms applied), turned, scaled and placed in head-bone space (bind axes: +Y up,
 * -Z forward; the head bone sits 1.565 m up in the authored figure), decimated where needed, and written as one GLB of
 * plain-coloured meshes: the colour, roughness, metalness and opacity of each are in its node's `extras`.
 * Writes public/game-art/breachline/patch/headgear/headgear.glb. */
import * as THREE from 'three';
import { mkdir, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
// @ts-expect-error plain JS modules
import { readGlb, writeGlb } from './glb.mjs';

const OUT = 'public/game-art/breachline/patch/headgear';
type Part = { match: RegExp; name: string; color: number; rough: number; metal: number; opacity?: number; tris?: number };
const PROPS: { file: string; set: string; width: number; at: [number, number, number]; rotY: number; parts: Part[] }[] = [
  { file: 'hg_helmet', set: 'helmetA', width: 0.27, at: [0, 0.055, 0.012], rotY: 0, parts: [
    { match: /net/i, name: 'helmet_net', color: 0x1d2023, rough: 0.95, metal: 0 }, { match: /.*/, name: 'helmet_shell', color: 0x2b3036, rough: 0.7, metal: 0.1 }] },
  { file: 'hg_goggles', set: 'gogglesA', width: 0.19, at: [0, 0.0, -0.085], rotY: Math.PI / 2, parts: [
    { match: /visor/i, name: 'goggles_lens', color: 0x2a2f35, rough: 0.08, metal: 0.4, opacity: 0.85, tris: 600 },
    { match: /strap/i, name: 'goggles_strap', color: 0x101112, rough: 0.9, metal: 0, tris: 500 },
    { match: /.*/, name: 'goggles_frame', color: 0x18191b, rough: 0.55, metal: 0, tris: 1400 }] },
  { file: 'hg_headset', set: 'headsetB', width: 0.205, at: [0, -0.045, 0.0], rotY: 0, parts: [{ match: /.*/, name: 'headset', color: 0x1b1c1e, rough: 0.6, metal: 0.05 }] },
];

async function main() {
  await mkdir(OUT, { recursive: true }); await MeshoptSimplifier.ready;
  const meshes: unknown[] = [], report: Record<string, unknown> = {};
  for (const pr of PROPS) {
    const g = await readGlb(`${process.env.HG}/${pr.file}.glb`), J = g.json;
    // World matrix of every node (TRS hierarchy).
    const world: THREE.Matrix4[] = [], local = (n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }) => n.matrix ? new THREE.Matrix4().fromArray(n.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
    const visit = (i: number, parent: THREE.Matrix4) => { world[i] = parent.clone().multiply(local(J.nodes[i])); for (const c of J.nodes[i].children ?? []) visit(c, world[i]); };
    for (const r of J.scenes[J.scene ?? 0].nodes) visit(r, new THREE.Matrix4());
    // Gather triangles per part (by node or mesh name).
    const parts = new Map<string, { pos: number[]; nrm: number[] }>();
    J.nodes.forEach((nd: { mesh?: number; name?: string }, i: number) => {
      if (nd.mesh === undefined || !world[i]) return;
      const mesh = J.meshes[nd.mesh], label = `${nd.name ?? ''} ${mesh.name ?? ''}`, part = pr.parts.find(p => p.match.test(label))!;
      const nm = new THREE.Matrix3().getNormalMatrix(world[i]);
      for (const prim of mesh.primitives) {
        const P = g.accessor(prim.attributes.POSITION), N = prim.attributes.NORMAL !== undefined ? g.accessor(prim.attributes.NORMAL) : null;
        const I = prim.indices !== undefined ? g.accessor(prim.indices) : Uint32Array.from({ length: P.length / 3 }, (_, k) => k);
        const e = parts.get(part.name) ?? { pos: [], nrm: [] }; parts.set(part.name, e);
        const v = new THREE.Vector3(), n = new THREE.Vector3();
        for (const k of I) { v.fromArray(P, k * 3).applyMatrix4(world[i]); e.pos.push(v.x, v.y, v.z); if (N) { n.fromArray(N, k * 3).applyMatrix3(nm).normalize(); e.nrm.push(n.x, n.y, n.z); } else e.nrm.push(0, 1, 0); }
      }
    });
    // Turn, then fit: width across X, bounding-box bottom at at[1], centred in x and z.
    const rot = new THREE.Matrix4().makeRotationY(pr.rotY), box = new THREE.Box3(), v = new THREE.Vector3();
    for (const e of parts.values()) for (let k = 0; k < e.pos.length; k += 3) box.expandByPoint(v.fromArray(e.pos, k).applyMatrix4(rot));
    const dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3()), s = pr.width / dim.x;
    const fit = new THREE.Matrix4().makeTranslation(pr.at[0] - c.x * s, pr.at[1] - box.min.y * s, pr.at[2] - c.z * s).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(rot);
    const nfit = new THREE.Matrix3().getNormalMatrix(fit);
    let tris = 0;
    for (const part of pr.parts) {
      const e = parts.get(part.name); if (!e) continue;
      const P = new Float32Array(e.pos.length), N = new Float32Array(e.nrm.length), n = new THREE.Vector3();
      for (let k = 0; k < e.pos.length; k += 3) { v.fromArray(e.pos, k).applyMatrix4(fit); P.set([v.x, v.y, v.z], k); n.fromArray(e.nrm, k).applyMatrix3(nfit).normalize(); N.set([n.x, n.y, n.z], k); }
      // Weld (the triangles were expanded), then simplify where a budget is set.
      const key = (k: number) => `${Math.round(P[k * 3] * 1e5)},${Math.round(P[k * 3 + 1] * 1e5)},${Math.round(P[k * 3 + 2] * 1e5)},${Math.round(N[k * 3] * 20)},${Math.round(N[k * 3 + 1] * 20)},${Math.round(N[k * 3 + 2] * 20)}`;
      const map = new Map<string, number>(), WP: number[] = [], WN: number[] = [], WI: number[] = [];
      for (let k = 0; k < P.length / 3; k++) { const kk = key(k); let w = map.get(kk); if (w === undefined) { w = WP.length / 3; map.set(kk, w); WP.push(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]); WN.push(N[k * 3], N[k * 3 + 1], N[k * 3 + 2]); } WI.push(w); }
      let idx = new Uint32Array(WI); const wp = new Float32Array(WP);
      if (part.tris && idx.length / 3 > part.tris) idx = new Uint32Array(MeshoptSimplifier.simplify(idx, wp, 3, part.tris * 3, 0.05, [])[0]);
      // Compact.
      const remap = new Int32Array(wp.length / 3).fill(-1); let m = 0; for (const i of idx) if (remap[i] < 0) remap[i] = m++;
      const cp = new Float32Array(m * 3), cn = new Float32Array(m * 3);
      for (let i = 0; i < remap.length; i++) if (remap[i] >= 0) { cp.set(wp.subarray(i * 3, i * 3 + 3), remap[i] * 3); cn.set(WN.slice(i * 3, i * 3 + 3), remap[i] * 3); }
      const ci = Uint32Array.from(idx, i => remap[i]);
      meshes.push({ name: `${pr.set}_${part.name}`, attributes: { POSITION: cp, NORMAL: cn }, indices: ci, extras: { set: pr.set, color: '#' + part.color.toString(16).padStart(6, '0'), roughness: part.rough, metalness: part.metal, opacity: part.opacity ?? 1 } });
      tris += ci.length / 3;
    }
    report[pr.set] = { source: pr.file, sourceTriangles: [...parts.values()].reduce((a, e) => a + e.pos.length / 9, 0), triangles: tris, scale: +s.toFixed(3) };
  }
  await writeGlb(`${OUT}/headgear.glb`, meshes, { frame: 'head-bone space of src/games/breachline/render/fighters/skeleton.ts (bind axes, +Y up, -Z forward); parent each mesh to the head bone', sets: { A: ['helmetA', 'gogglesA'], B: ['headsetB'] } });
  console.log(JSON.stringify(report), statSync(`${OUT}/headgear.glb`).size, 'bytes');
}
main();
