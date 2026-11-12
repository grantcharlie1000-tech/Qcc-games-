#!/usr/bin/env -S npx vite-node
/** Second-build weapon pipeline (plan: "Hero models, second build"; "Weapons rebuild resumes").
 *
 *   npx vite-node scripts/breachline-assets/hero/sculpt.ts ar5 [--clay] [--budget 12000] [--size 2048]
 *
 * 1. The weapon's high-detail solid is a signed-distance field (render/hero/sculpt/<id>.ts) built from its design
 *    parameters. 2. The game mesh is that field without its finest detail, meshed per part with narrow-band surface
 *    nets and simplified to the triangle budget, with more triangles where the camera is closest (part weights).
 *    Moving parts keep their own bone. 3. (Unless --clay) unwrap, then bake normal, occlusion and curvature straight
 *    from the high-detail field, paint, and write KTX2 (bake.ts's writer). Writes public/game-art/breachline/hero/<dir>/mesh.bin. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ar5Parts, type Part } from '../../../src/games/breachline/render/hero/sculpt/ar5';
import { AR5 } from '../../../src/games/breachline/render/hero/sculpt/designs';
import { packMeshBin, type MeshArrays } from '../../../src/games/breachline/render/hero/meshbin';
import { meshField, type RawMesh } from './mesher';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const CLAY = process.argv.includes('--clay');

export interface Weapon { id: string; dir: string; parts: (hi: boolean) => Part[]; sightH: number; budget: number; grid: number; lens?: { r: number; u: number[] }; dot?: { u: number; r: number } }
export const WEAPONS: Record<string, Weapon> = {
  ar5: { id: 'ar5', dir: 'ar5', parts: ar5Parts, sightH: AR5.sightH, budget: 12500, grid: 0.4, lens: { r: AR5.optic.bore, u: [AR5.optic.u0 + 2.5, AR5.optic.u1 - 2.5] }, dot: { u: AR5.optic.dot, r: AR5.optic.dotR } },
};

/** Meshes each part (cached by the sculpt sources' hash) and pre-simplifies to 0.03 mm. */
async function meshParts(w: Weapon, parts: Part[]): Promise<RawMesh[]> {
  const src = await Promise.all(['src/games/breachline/render/hero/sculpt/sdf.ts', `src/games/breachline/render/hero/sculpt/${w.id}.ts`, 'src/games/breachline/render/hero/sculpt/designs.ts', 'scripts/breachline-assets/hero/mesher.ts'].map(f => readFile(join(ROOT, f))));
  const key = createHash('sha256').update(Buffer.concat(src)).update(String(w.grid)).digest('hex').slice(0, 16);
  const cache = join(ROOT, '.cache/hero-sculpt', `${w.id}-${key}.json`);
  try { const j = JSON.parse(await readFile(cache, 'utf8')); return j.map((m: { pos: number[]; nor: number[]; idx: number[] }) => ({ pos: new Float32Array(m.pos), nor: new Float32Array(m.nor), idx: new Uint32Array(m.idx) })); } catch { /* build */ }
  const out: RawMesh[] = [];
  for (const p of parts) {
    const t0 = Date.now(), raw = meshField(p.s.f, p.s.b, w.grid);
    const [idx] = MeshoptSimplifier.simplify(raw.idx, raw.pos, 3, 0, 0.03, ['ErrorAbsolute']);
    out.push(compact(raw, idx));
    console.log(`  ${p.name.padEnd(18)} ${String(raw.idx.length / 3).padStart(8)} -> ${String(idx.length / 3).padStart(6)} tris  ${Date.now() - t0} ms`);
  }
  await mkdir(dirname(cache), { recursive: true });
  await writeFile(cache, JSON.stringify(out.map(m => ({ pos: [...m.pos].map(v => Math.round(v * 1e4) / 1e4), nor: [...m.nor].map(v => Math.round(v * 1e4) / 1e4), idx: [...m.idx] }))));
  return out;
}
/** Drops vertices no index uses. */
export function compact(m: RawMesh, idx: Uint32Array): RawMesh {
  const remap = new Int32Array(m.pos.length / 3).fill(-1); let n = 0;
  for (const i of idx) if (remap[i] < 0) remap[i] = n++;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let k = 0; k < 3; k++) { pos[remap[v] * 3 + k] = m.pos[v * 3 + k]; nor[remap[v] * 3 + k] = m.nor[v * 3 + k]; }
  return { pos, nor, idx: Uint32Array.from(idx, i => remap[i]) };
}

/** Simplifies every part with error e / weight, searching e so the total meets the budget. */
function toBudget(meshes: RawMesh[], parts: Part[], budget: number): RawMesh[] {
  const run = (e: number) => meshes.map((m, k) => MeshoptSimplifier.simplify(m.idx, m.pos, 3, 0, e / parts[k].weight, ['ErrorAbsolute'])[0]);
  let lo = 0.01, hi = 4;
  for (let it = 0; it < 22; it++) {
    const mid = Math.sqrt(lo * hi), n = run(mid).reduce((s, i) => s + i.length / 3, 0);
    if (n > budget) lo = mid; else hi = mid;
  }
  console.log(`  simplification error ${hi.toFixed(3)} mm (weight 1)`);
  return run(hi).map((idx, k) => compact(meshes[k], idx));
}

/** A disc facing +Z (toward the eye) at (0, y, u), `n` segments: mm. */
function disc(y: number, u: number, r: number, n: number): RawMesh {
  const pos = [0, y, -u], nor = [0, 0, 1], idx: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pos.push(Math.cos(a) * r, y + Math.sin(a) * r, -u); nor.push(0, 0, 1); idx.push(0, 1 + i, 1 + ((i + 1) % n)); }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}

/** Merges part meshes into one mesh in the sight-line frame (metres). */
function merge(list: { m: RawMesh; bone: number; flag: number; part: number }[], sightH: number): MeshArrays & { part: Uint8Array } {
  let nv = 0, ni = 0; for (const { m } of list) { nv += m.pos.length / 3; ni += m.idx.length; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), bone = new Uint8Array(nv), flags = new Uint8Array(nv), part = new Uint8Array(nv), idx = new Uint32Array(ni);
  let v0 = 0, i0 = 0;
  for (const { m, bone: b, flag, part: p } of list) {
    const n = m.pos.length / 3;
    for (let v = 0; v < n; v++) {
      pos[(v0 + v) * 3] = m.pos[v * 3] / 1000; pos[(v0 + v) * 3 + 1] = (m.pos[v * 3 + 1] - sightH) / 1000; pos[(v0 + v) * 3 + 2] = m.pos[v * 3 + 2] / 1000;
      for (let k = 0; k < 3; k++) nor[(v0 + v) * 3 + k] = m.nor[v * 3 + k];
      bone[v0 + v] = b; flags[v0 + v] = flag; part[v0 + v] = p;
    }
    for (let i = 0; i < m.idx.length; i++) idx[i0 + i] = m.idx[i] + v0;
    v0 += n; i0 += m.idx.length;
  }
  return { pos, nor, uv, bone, flags, part, idx };
}

/** Normals from the faces, smooth within each part except across edges sharper than `deg` (the simplified mesh's
 * large flat faces keep flat normals; chamfer strips stay crisp). Re-indexes, splitting vertices at creases. */
function creased(m: MeshArrays & { part: Uint8Array }, deg: number): MeshArrays & { part: Uint8Array } {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
  // Parts never share smoothing: offset each part's copy far apart while computing, by keying on the part id.
  g.setAttribute('key', new THREE.BufferAttribute(Float32Array.from(m.part, (p, i) => p * 1000 + m.bone[i] * 10 + m.flags[i]), 1));
  g.setIndex(new THREE.BufferAttribute(m.idx, 1));
  const flat = g.toNonIndexed(), P = flat.getAttribute('position') as THREE.BufferAttribute, K = flat.getAttribute('key');
  // Move parts apart so creased smoothing never averages across two parts touching at one point.
  const keys = [...new Set(Array.from(K.array as Float32Array))].sort((a, b) => a - b), slot = new Map(keys.map((k, i) => [k, i * 2]));
  for (let v = 0; v < P.count; v++) P.setX(v, P.getX(v) + slot.get(K.getX(v))!);
  const cg = toCreasedNormals(flat, THREE.MathUtils.degToRad(deg));
  cg.deleteAttribute('uv');
  const merged = mergeVertices(cg, 1e-7);
  const MP = merged.getAttribute('position'), MN = merged.getAttribute('normal'), MK = merged.getAttribute('key'), n = MP.count;
  const out = { pos: new Float32Array(n * 3), nor: new Float32Array(n * 3), uv: new Float32Array(n * 2), bone: new Uint8Array(n), flags: new Uint8Array(n), part: new Uint8Array(n), idx: new Uint32Array(merged.index!.array) };
  for (let v = 0; v < n; v++) {
    const k = Math.round(MK.getX(v)), part = Math.floor(k / 1000);
    out.pos[v * 3] = MP.getX(v) - slot.get(MK.getX(v))!; out.pos[v * 3 + 1] = MP.getY(v); out.pos[v * 3 + 2] = MP.getZ(v);
    out.nor[v * 3] = MN.getX(v); out.nor[v * 3 + 1] = MN.getY(v); out.nor[v * 3 + 2] = MN.getZ(v);
    out.part[v] = part; out.bone[v] = Math.floor((k % 1000) / 10); out.flags[v] = k % 10;
  }
  return out;
}

export async function buildGameMesh(w: Weapon) {
  await MeshoptSimplifier.ready;
  const parts = w.parts(false);
  console.log(`${w.id}: meshing ${parts.length} parts`);
  const meshes = toBudget(await meshParts(w, parts), parts, w.budget);
  parts.forEach((p, k) => console.log(`  ${p.name.padEnd(18)} ${String(meshes[k].idx.length / 3).padStart(6)} tris`));
  const list = meshes.map((m, k) => ({ m, bone: parts[k].bone, flag: 0, part: k }));
  if (w.dot) list.push({ m: disc(w.sightH, w.dot.u, w.dot.r, 10), bone: 0, flag: 1, part: 255 });
  const game = creased(merge(list, w.sightH), 40);
  const lens = w.lens ? merge(w.lens.u.map(u => ({ m: disc(w.sightH, u, w.lens!.r, 32), bone: 0, flag: 0, part: 254 })), w.sightH) : null;
  return { parts, game, lens };
}

async function main() {
  const ids = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
  for (const id of ids.length ? ids : ['ar5']) {
    const w = WEAPONS[id]; w.budget = Number(arg('budget', String(w.budget)));
    const { game, lens } = await buildGameMesh(w);
    const tris = game.idx.length / 3;
    console.log(`${id}: ${tris} triangles, ${game.pos.length / 3} vertices`);
    if (CLAY || true) {
      const out = join(ROOT, 'public/game-art/breachline/hero', w.dir);
      await mkdir(out, { recursive: true });
      const bin = packMeshBin([{ name: 'weapon', m: game }, ...(lens ? [{ name: 'lens', m: lens }] : [])], { triangles: tris, clay: CLAY });
      await writeFile(join(out, 'mesh.bin'), bin);
      console.log(`wrote ${join(out, 'mesh.bin')} (${(bin.length / 1024).toFixed(0)} KB)`);
    }
  }
}
await main();
