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
import { MAT, ar5Parts, type Part } from '../../../src/games/breachline/render/hero/sculpt/ar5';
import { AR5, HALDEN, TERN, WREN } from '../../../src/games/breachline/render/hero/sculpt/designs';
import { haldenParts } from '../../../src/games/breachline/render/hero/sculpt/halden12';
import { packMeshBin, type MeshArrays } from '../../../src/games/breachline/render/hero/meshbin';
import { meshField, type RawMesh } from './mesher';
import { chartUnwrap } from './chart';
import { writeSet } from './ktx';
import { spawn } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const CLAY = process.argv.includes('--clay');

export interface Weapon { id: string; dir: string; parts: (hi: boolean) => Part[]; sightH: number; budget: number; grid: number; lens?: { r: number; u: number[] }; lensRect?: { w: number; h: number; u: number[] }; dot?: { u: number; r: number; y?: number }; ring?: { u: number; r0: number; r1: number }; src?: string }
export const WEAPONS: Record<string, Weapon> = {
  wren: { id: 'wren', dir: 'wren', src: 'ar5', parts: hi => ar5Parts(hi, WREN), sightH: WREN.sightH, budget: 10500, grid: 0.4, lensRect: { w: WREN.reflex!.window[0] - 1, h: WREN.reflex!.window[1] - 1, u: [WREN.reflex!.u1 - 5] }, dot: { u: WREN.reflex!.u1 - 6.5, r: 0.75 } },
  tern: { id: 'tern', dir: 'tern', src: 'ar5', parts: hi => ar5Parts(hi, TERN), sightH: TERN.sightH, budget: 11500, grid: 0.4, lensRect: { w: TERN.holo!.window[0] - 1, h: TERN.holo!.window[1] - 1, u: [TERN.holo!.u0 + 6, TERN.holo!.u1 - 6] }, dot: { u: TERN.holo!.u1 - 10, r: 0.7 }, ring: { u: TERN.holo!.u1 - 10, r0: 6.4, r1: 7.4 } },
  halden12: { id: 'halden12', dir: 'halden12', parts: haldenParts, sightH: HALDEN.sightH, budget: 10500, grid: 0.4, dot: { u: 661, r: 0.9, y: HALDEN.sightH - 2.2 } },
  ar5: { id: 'ar5', dir: 'ar5', parts: ar5Parts, sightH: AR5.sightH, budget: 12500, grid: 0.4, lens: { r: AR5.optic.bore, u: [AR5.optic.u0 + 2.5, AR5.optic.u1 - 2.5] }, dot: { u: AR5.optic.dot, r: AR5.optic.dotR } },
};

/** Meshes each part (cached by the sculpt sources' hash) and pre-simplifies to 0.03 mm. */
async function meshParts(w: Weapon, parts: Part[]): Promise<RawMesh[]> {
  const src = await Promise.all(['src/games/breachline/render/hero/sculpt/sdf.ts', `src/games/breachline/render/hero/sculpt/${w.src ?? w.id}.ts`, 'src/games/breachline/render/hero/sculpt/kit.ts', 'src/games/breachline/render/hero/sculpt/designs.ts', 'scripts/breachline-assets/hero/mesher.ts'].map(f => readFile(join(ROOT, f))));
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

/** A rectangle facing +Z at (0, y, u), w × h mm. */
function rect(y: number, u: number, w: number, h: number): RawMesh {
  return { pos: new Float32Array([-w / 2, y - h / 2, -u, w / 2, y - h / 2, -u, w / 2, y + h / 2, -u, -w / 2, y + h / 2, -u]), nor: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), idx: new Uint32Array([0, 1, 2, 0, 2, 3]) };
}
/** A flat ring facing +Z at (0, y, u). */
function annulus(y: number, u: number, r0: number, r1: number, n: number): RawMesh {
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pos.push(Math.cos(a) * r0, y + Math.sin(a) * r0, -u, Math.cos(a) * r1, y + Math.sin(a) * r1, -u); nor.push(0, 0, 1, 0, 0, 1); const j = (i + 1) % n; idx.push(i * 2, i * 2 + 1, j * 2 + 1, i * 2, j * 2 + 1, j * 2); }
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
  if (w.dot) list.push({ m: disc(w.dot.y ?? w.sightH, w.dot.u, w.dot.r, 10), bone: 0, flag: 1, part: 255 });
  if (w.ring) list.push({ m: annulus(w.sightH, w.ring.u, w.ring.r0, w.ring.r1, 40), bone: 0, flag: 1, part: 255 });
  const game = creased(merge(list, w.sightH), 40);
  const lens = w.lens ? merge(w.lens.u.map(u => ({ m: disc(w.sightH, u, w.lens!.r, 32), bone: 0, flag: 0, part: 254 })), w.sightH)
    : w.lensRect ? merge(w.lensRect.u.map(u => ({ m: rect(w.sightH, u, w.lensRect!.w, w.lensRect!.h), bone: 0, flag: 0, part: 254 })), w.sightH) : null;
  return { parts, game, lens };
}

// ---- Bake and paint ---------------------------------------------------------------------------------------------

const hash = (x: number, y: number, z: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz), l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
const fbm = (x: number, y: number, z: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 3.7); f *= 2.03; a *= 0.5; } return s; };
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lin = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
const srgb8 = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

/** Finishes: base colour (sRGB hex), roughness, metalness, what bare edges turn into, how readily edges wear. */
const FINISH: Record<number, { c: number; r: number; m: number; edge: number; edgeR: number; edgeM: number; wear: number }> = {
  [MAT.anod]: { c: 0x676b70, r: 0.42, m: 0.16, edge: 0x8c9095, edgeR: 0.3, edgeM: 0.9, wear: 0.8 },
  [MAT.cerakote]: { c: 0x6d604e, r: 0.58, m: 0.05, edge: 0x86837d, edgeR: 0.35, edgeM: 0.75, wear: 0.6 },
  [MAT.polymer]: { c: 0x4f514e, r: 0.72, m: 0, edge: 0x5e605c, edgeR: 0.6, edgeM: 0, wear: 0.5 },
  [MAT.polymerFde]: { c: 0x70644f, r: 0.68, m: 0, edge: 0x857a66, edgeR: 0.6, edgeM: 0, wear: 0.5 },
  [MAT.steel]: { c: 0x505254, r: 0.48, m: 0.55, edge: 0x8a8b8c, edgeR: 0.28, edgeM: 1, wear: 0.9 },
  [MAT.rubber]: { c: 0x434442, r: 0.86, m: 0, edge: 0x4a4b49, edgeR: 0.8, edgeM: 0, wear: 0.2 },
  [MAT.brass]: { c: 0xb08d57, r: 0.34, m: 1, edge: 0xd4b07a, edgeR: 0.25, edgeM: 1, wear: 0.4 },
  [MAT.dark]: { c: 0x161616, r: 0.9, m: 0, edge: 0x161616, edgeR: 0.9, edgeM: 0, wear: 0 },
  [MAT.blued]: { c: 0x3f4145, r: 0.36, m: 0.55, edge: 0x7a7c80, edgeR: 0.28, edgeM: 0.95, wear: 0.8 },
  [MAT.hull]: { c: 0x8c2c23, r: 0.5, m: 0, edge: 0xa3443a, edgeR: 0.45, edgeM: 0, wear: 0.3 },
  [MAT.glow]: { c: 0xff3a22, r: 0.5, m: 0, edge: 0xff3a22, edgeR: 0.5, edgeM: 0, wear: 0 },
};

/** A 5×7 font for the engraved markings (Breachline's own: model, calibre, serial, maker, selector). */
const GLYPH: Record<string, string> = {
  A: '01110100011000111111100011000110001', C: '01110100011000010000100001000101110', E: '11111100001000011110100001000011111',
  F: '11111100001000011110100001000010000', I: '01110001000010000100001000010001110', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001110011010110011100011000110001', O: '01110100011000110001100011000101110',
  R: '11110100011000111110101001001010001', S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100',
  U: '10001100011000110001100011000101110', W: '10001100011000110101101011010101010', H: '10001100011000111111100011000110001',
  K: '10001100101010011000101001001010001', '-': '00000000000000011111000000000000000', '.': '00000000000000000000000000110001100',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111',
  '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110',
  '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', '3': '11110000010000101110000010000111110',
  D: '11110100011000110001100011000111110', G: '01110100011000010111100011000101110', ' ': '00000000000000000000000000000000000',
};
/** Engraved lines on a flat side, in design mm: text reads left to right seen from that side. */
const MARKS: { part: string; side: -1 | 1; u: number; y: number; h: number; text: string; w?: string }[] = [
  { part: 'lower', side: -1, u: 171, y: -27, h: 3.4, text: 'MARROW AR-5', w: 'ar5' },
  { part: 'lower', side: -1, u: 171, y: -33.5, h: 2.6, text: 'CAL 5.56', w: 'ar5' },
  { part: 'lower', side: -1, u: 171, y: -39, h: 2.6, text: 'M5-04217', w: 'ar5' },
  { part: 'lower', side: -1, u: 171, y: -47, h: 2.2, text: 'MRW WORKS', w: 'ar5' },
  { part: 'lower', side: -1, u: 66, y: -21, h: 1.9, text: 'SAFE SEMI AUTO', w: 'ar5' },
  { part: 'optic mount', side: -1, u: 92, y: 37.5, h: 2, text: 'MRW', w: 'ar5' },
  { part: 'lower', side: -1, u: 171, y: -27, h: 3.4, text: 'TERN C8', w: 'tern' },
  { part: 'lower', side: -1, u: 171, y: -33.5, h: 2.6, text: 'CAL 5.56', w: 'tern' },
  { part: 'lower', side: -1, u: 171, y: -39, h: 2.6, text: 'T8-20633', w: 'tern' },
  { part: 'lower', side: -1, u: 66, y: -21, h: 1.9, text: 'SAFE SEMI AUTO', w: 'tern' },
  { part: 'lower', side: -1, u: 124, y: -16, h: 2.8, text: 'WREN-9', w: 'wren' },
  { part: 'lower', side: -1, u: 124, y: -21.5, h: 2.2, text: 'CAL 9MM', w: 'wren' },
  { part: 'lower', side: -1, u: 66, y: -21, h: 1.9, text: 'SAFE SEMI AUTO', w: 'wren' },
  { part: 'receiver', side: -1, u: 182, y: 9, h: 3.6, text: 'HALDEN 12' },
  { part: 'receiver', side: -1, u: 182, y: 2.5, h: 2.6, text: '12 GA 3 IN' },
  { part: 'receiver', side: -1, u: 182, y: -3.5, h: 2.6, text: 'HN-31740' },
  { part: 'receiver', side: -1, u: 182, y: -9.5, h: 2.2, text: 'MRW WORKS' },
];
function marked(id: string, name: string, x: number, y: number, z: number, nx: number): boolean {
  for (const m of MARKS) {
    if ((m.w && m.w !== id) || m.part !== name || Math.sign(nx) !== m.side || Math.abs(nx) < 0.85) continue;
    const cw = m.h * 5 / 7, pitch = cw * 1.25, u = -z, along = m.side < 0 ? m.u - u : u - m.u, down = m.y - y;
    if (down < 0 || down >= m.h || along < 0) continue;
    const ci = Math.floor(along / pitch), g = GLYPH[m.text[ci] ?? ' '];
    if (!g || ci >= m.text.length) continue;
    const col = Math.floor((along - ci * pitch) / (cw / 5)), row = Math.floor(down / (m.h / 7));
    if (col < 5 && row < 7 && g[row * 5 + col] === '1') return true;
  }
  void x; return false;
}

function dilate(img: Buffer, cov: Uint8Array, S: number, passes: number) {
  const filled = new Uint8Array(cov);
  for (let p = 0; p < passes; p++) {
    const next = new Uint8Array(filled);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const k = y * S + x; if (filled[k]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
        const kk = yy * S + xx; if (!filled[kk]) continue;
        img.copy(img, k * 4, kk * 4, kk * 4 + 4); next[k] = 1; break;
      }
    }
    filled.set(next);
  }
}

async function bakeSet(w: Weapon, parts: Part[], m: MeshArrays & { part: Uint8Array }, S: number) {
  const t0 = Date.now(), P = m.pos, N = m.nor, UV = m.uv, ix = m.idx, nt = ix.length / 3, SH = w.sightH;
  const tid = new Int32Array(S * S).fill(-1), cov = new Uint8Array(S * S), w0a = new Float32Array(S * S), w1a = new Float32Array(S * S);
  // Rasterise: conservative coverage, texels whose centre is inside a triangle win over ones only near it.
  for (let t = 0; t < nt; t++) {
    const i0 = ix[t * 3], i1 = ix[t * 3 + 1], i2 = ix[t * 3 + 2];
    const ax = UV[i0 * 2] * S, ay = UV[i0 * 2 + 1] * S, bx = UV[i1 * 2] * S, by = UV[i1 * 2 + 1] * S, cx = UV[i2 * 2] * S, cy = UV[i2 * 2 + 1] * S;
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay); if (Math.abs(area) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)) - 1), x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)) + 1), y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)) - 1), y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)) + 1);
    const tol = 0.75 / Math.sqrt(Math.abs(area));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const w0 = ((bx - px) * (cy - py) - (cx - px) * (by - py)) / area, w1 = ((cx - px) * (ay - py) - (ax - px) * (cy - py)) / area, w2 = 1 - w0 - w1;
      if (w0 < -tol || w1 < -tol || w2 < -tol) continue;
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0, k = y * S + x;
      if (cov[k] === 2 && !inside) continue;
      cov[k] = inside ? 2 : 1; tid[k] = t; w0a[k] = w0; w1a[k] = w1;
    }
  }
  // Texel records: position (mm, design frame), normal, part, one-texel steps along u and v (mm); and tangent frames.
  const list: number[] = []; for (let k = 0; k < S * S; k++) if (tid[k] >= 0) list.push(k);
  const n = list.length, STRIDE = 13, rec = new Float32Array(n * STRIDE), tan = new Float32Array(n * 6);
  for (let j = 0; j < n; j++) {
    const k = list[j], t = tid[k], i0 = ix[t * 3], i1 = ix[t * 3 + 1], i2 = ix[t * 3 + 2];
    let a = Math.max(0, w0a[k]), b = Math.max(0, w1a[k]), c = Math.max(0, 1 - w0a[k] - w1a[k]); const ws = a + b + c; a /= ws; b /= ws; c /= ws;
    const o = j * STRIDE, pv = (q: number) => P[i0 * 3 + q] * a + P[i1 * 3 + q] * b + P[i2 * 3 + q] * c;
    rec[o] = pv(0) * 1000; rec[o + 1] = pv(1) * 1000 + SH; rec[o + 2] = pv(2) * 1000;
    let nx = N[i0 * 3] * a + N[i1 * 3] * b + N[i2 * 3] * c, ny = N[i0 * 3 + 1] * a + N[i1 * 3 + 1] * b + N[i2 * 3 + 1] * c, nz = N[i0 * 3 + 2] * a + N[i1 * 3 + 2] * b + N[i2 * 3 + 2] * c;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    rec[o + 3] = nx; rec[o + 4] = ny; rec[o + 5] = nz; rec[o + 6] = m.part[i0];
    // Edges (mm) and UV deltas (texels).
    const e1 = [0, 1, 2].map(q => (P[i1 * 3 + q] - P[i0 * 3 + q]) * 1000), e2 = [0, 1, 2].map(q => (P[i2 * 3 + q] - P[i0 * 3 + q]) * 1000);
    const du1 = (UV[i1 * 2] - UV[i0 * 2]) * S, dv1 = (UV[i1 * 2 + 1] - UV[i0 * 2 + 1]) * S, du2 = (UV[i2 * 2] - UV[i0 * 2]) * S, dv2 = (UV[i2 * 2 + 1] - UV[i0 * 2 + 1]) * S;
    const det = du1 * dv2 - du2 * dv1 || 1e-9;
    for (let q = 0; q < 3; q++) { rec[o + 7 + q] = (e1[q] * dv2 - e2[q] * dv1) / det; rec[o + 10 + q] = (e2[q] * du1 - e1[q] * du2) / det; }
    // Gradients of u and v in the triangle's plane, projected off the shading normal (the shader's frame).
    const fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], f2 = fn[0] ** 2 + fn[1] ** 2 + fn[2] ** 2 || 1e-12;
    const c1 = [e2[1] * fn[2] - e2[2] * fn[1], e2[2] * fn[0] - e2[0] * fn[2], e2[0] * fn[1] - e2[1] * fn[0]], c2 = [fn[1] * e1[2] - fn[2] * e1[1], fn[2] * e1[0] - fn[0] * e1[2], fn[0] * e1[1] - fn[1] * e1[0]];
    const gu = [0, 1, 2].map(q => (du1 * c1[q] + du2 * c2[q]) / f2), gv = [0, 1, 2].map(q => (dv1 * c1[q] + dv2 * c2[q]) / f2);
    const du = gu[0] * nx + gu[1] * ny + gu[2] * nz, dv = gv[0] * nx + gv[1] * ny + gv[2] * nz;
    const T = [gu[0] - nx * du, gu[1] - ny * du, gu[2] - nz * du], B = [gv[0] - nx * dv, gv[1] - ny * dv, gv[2] - nz * dv];
    const sc = 1 / Math.sqrt(Math.max(T[0] ** 2 + T[1] ** 2 + T[2] ** 2, B[0] ** 2 + B[1] ** 2 + B[2] ** 2) || 1e-12);
    for (let q = 0; q < 3; q++) { tan[j * 6 + q] = T[q] * sc; tan[j * 6 + 3 + q] = B[q] * sc; }
  }
  console.log(`  rasterised ${n} texels (${(n / (S * S) * 100).toFixed(0)} %) in ${Date.now() - t0} ms`);
  const cache = join(ROOT, '.cache/hero-bake'); await mkdir(cache, { recursive: true });
  const texels = Buffer.from(rec.buffer), key = createHash('sha256').update(texels).update(await readFile(join(ROOT, `src/games/breachline/render/hero/sculpt/${w.src ?? w.id}.ts`))).update(await readFile(join(ROOT, 'scripts/breachline-assets/hero/bakefield.ts'))).digest('hex');
  const keyFile = join(cache, `${w.id}-out.key`), SL = 4;
  let same = false; try { same = (await readFile(keyFile, 'utf8')) === key; } catch { /* first bake */ }
  if (same) console.log('  field bake unchanged: reusing it');
  else await writeFile(join(cache, `${w.id}-texels.bin`), texels);
  if (!same) await Promise.all(Array.from({ length: SL }, (_, k) => new Promise<void>((res, rej) => {
    const ch = spawn('npx', ['vite-node', 'scripts/breachline-assets/hero/bakefield.ts', w.id, String(k), String(SL)], { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    ch.on('exit', code => (code === 0 ? res() : rej(new Error(`bake slice ${k} exited ${code}`))));
  })));
  if (!same) await writeFile(keyFile, key);
  const res = new Float32Array(n * 7);
  for (let k = 0; k < SL; k++) { const b = await readFile(join(cache, `${w.id}-out-${k}.bin`)), o = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4); for (let i = 0, t = k; t < n; t += SL, i++) res.set(o.subarray(i * 7, i * 7 + 7), t * 7); }
  console.log(`  field bake done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  // Paint.
  const diff = Buffer.alloc(S * S * 4), nor = Buffer.alloc(S * S * 4), arm = Buffer.alloc(S * S * 4), filled = new Uint8Array(S * S);
  const O = AR5.optic;
  for (let j = 0; j < n; j++) {
    const k = list[j], o = j * STRIDE, x = rec[o], y = rec[o + 1], z = rec[o + 2], part = rec[o + 6];
    const hn = [res[j * 7], res[j * 7 + 1], res[j * 7 + 2]], ao = res[j * 7 + 3], cF = res[j * 7 + 4], cB = res[j * 7 + 5];
    const p = parts[part], name = p?.name ?? 'reticle';
    let mat = part === 255 ? MAT.glow : p.mat;
    // The optic's bore and lens hoods inside are matt black.
    if (name === 'optic' && Math.hypot(x, y - SH) < O.bore + 0.8 && (hn[0] * x + hn[1] * (y - SH)) < 0) mat = MAT.dark;
    const F = FINISH[mat], base = lin(F.c), edgeC = lin(F.edge);
    const edge = sstep(0.7, 2.4, cF) * 0.85 + sstep(0.25, 0.9, cB) * 0.25, cavity = sstep(0.5, 2.5, -cF) * 0.7 + sstep(0.3, 1.2, -cB) * 0.5;
    const blot = fbm(x * 0.05, y * 0.05, z * 0.05, 3), fine = fbm(x * 0.7, y * 0.7, z * 0.7, 2), chip = fbm(x * 0.35 + 7, y * 0.35, z * 0.35, 3);
    // Bare metal only on the sharpest edges, broken up, thin: a gleam, not a stripe.
    const wear = Math.min(0.8, sstep(0.6, 0.9, edge) * sstep(0.45, 0.65, chip) * F.wear);
    const tint = 1 + (blot - 0.5) * 0.12 + (fine - 0.5) * 0.05;
    const dust = lin(0x6e6656), up = Math.max(0, hn[1]);
    // Mid-frequency drift on the coated parts: colour wander, handling polish where the support hand sits, scuffs
    // along the bottom edges where the rifle is set down.
    const drift = fbm(x * 0.02 + 3, y * 0.02, z * 0.02, 3), scuff = (mat === MAT.cerakote || mat === MAT.polymerFde) ? sstep(0.55, 0.8, fbm(x * 0.6, y * 0.6, z * 0.08, 3)) * sstep(-2, -16, y - (name === 'magazine' ? -150 : 0)) * 0.6 : 0;
    const handPolish = name === 'handguard' && -z > 330 && -z < 470 && y < 0 ? 0.5 : 0;
    const engraved = marked(w.id, name, x, y, z, hn[0]);
    const alb = [0, 1, 2].map(q => {
      let v = base[q] * (tint + (drift - 0.5) * 0.16);
      v = v + (lin(0x9a9184)[q] - v) * scuff * 0.35;
      if (engraved) v = v + (lin(0xc9c4b8)[q] - v) * 0.75;
      v = v + (edgeC[q] - v) * wear;
      v *= 1 - cavity * 0.3;
      v = v + (dust[q] - v) * Math.min(0.35, cavity * 0.25 + up * 0.04 * blot);
      return v * (0.75 + 0.25 * ao);
    });
    let rough = F.r + (blot - 0.5) * 0.1 + (fine - 0.5) * 0.06 + cavity * 0.12;
    rough = rough + (F.edgeR - rough) * wear + (drift - 0.5) * 0.12 - handPolish * 0.12 + scuff * 0.1;
    if (engraved) rough = 0.65;
    // Machining marks along the receiver and rail: faint lengthwise streaks in the roughness.
    if (mat === MAT.anod) rough += 0.03 * (fbm(x * 0.9, y * 0.9, z * 0.04, 2) - 0.5);
    // Handling polish where hands go.
    if (name === 'grip' || name === 'charging handle' || name === 'magazine') rough -= 0.06 * sstep(0.4, 0.7, blot);
    const metal = F.m + (F.edgeM - F.m) * wear;
    diff[k * 4] = srgb8(alb[0]); diff[k * 4 + 1] = srgb8(alb[1]); diff[k * 4 + 2] = srgb8(alb[2]); diff[k * 4 + 3] = 255;
    arm[k * 4] = Math.round(255 * Math.min(1, Math.max(0.05, ao))); arm[k * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0.08, rough))); arm[k * 4 + 2] = Math.round(255 * Math.min(1, Math.max(0, metal))); arm[k * 4 + 3] = 255;
    // Tangent-space normal for the shader's frame [T B N]: solve, normalise, keep it in front.
    const T = [tan[j * 6], tan[j * 6 + 1], tan[j * 6 + 2]], B = [tan[j * 6 + 3], tan[j * 6 + 4], tan[j * 6 + 5]], Nn = [rec[o + 3], rec[o + 4], rec[o + 5]];
    const det3 = T[0] * (B[1] * Nn[2] - B[2] * Nn[1]) - B[0] * (T[1] * Nn[2] - T[2] * Nn[1]) + Nn[0] * (T[1] * B[2] - T[2] * B[1]);
    let a = 0, bb = 0, c = 1;
    if (Math.abs(det3) > 1e-6) {
      a = (hn[0] * (B[1] * Nn[2] - B[2] * Nn[1]) - B[0] * (hn[1] * Nn[2] - hn[2] * Nn[1]) + Nn[0] * (hn[1] * B[2] - hn[2] * B[1])) / det3;
      bb = (T[0] * (hn[1] * Nn[2] - hn[2] * Nn[1]) - hn[0] * (T[1] * Nn[2] - T[2] * Nn[1]) + Nn[0] * (T[1] * hn[2] - T[2] * hn[1])) / det3;
      c = (T[0] * (B[1] * hn[2] - B[2] * hn[1]) - B[0] * (T[1] * hn[2] - T[2] * hn[1]) + hn[0] * (T[1] * B[2] - T[2] * B[1])) / det3;
    }
    if (c < 0.08) c = 0.08;
    const l = Math.hypot(a, bb, c); a /= l; bb /= l; c /= l;
    nor[k * 4] = Math.round((a * 0.5 + 0.5) * 255); nor[k * 4 + 1] = Math.round((bb * 0.5 + 0.5) * 255); nor[k * 4 + 2] = Math.round((c * 0.5 + 0.5) * 255); nor[k * 4 + 3] = 255;
    filled[k] = 1;
  }
  for (const img of [diff, nor, arm]) dilate(img, filled, S, 6);
  // Empty atlas space: neutral values (mip blending at island borders stays sane).
  for (let k = 0; k < S * S; k++) if (nor[k * 4 + 3] === 0) { nor[k * 4] = 128; nor[k * 4 + 1] = 128; nor[k * 4 + 2] = 255; nor[k * 4 + 3] = 255; diff[k * 4 + 3] = 255; arm[k * 4] = 255; arm[k * 4 + 1] = 160; arm[k * 4 + 3] = 255; }
  console.log(`  painted in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const bytes = await writeSet(ROOT, w.dir, S, { diff, nor, arm }, [2048, 1024]);
  console.log(`  texture set written (${(bytes / 1048576).toFixed(2)} MB) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}

async function main() {
  const ids = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
  for (const id of ids.length ? ids : ['ar5']) {
    const w = WEAPONS[id]; w.budget = Number(arg('budget', String(w.budget)));
    const { parts, game: raw, lens } = await buildGameMesh(w);
    const S = Number(arg('size', '2048'));
    const u = chartUnwrap(raw, { size: S, pad: 4, axisWeight: [0.85, 1.35, 1.25, 0.75, 0.95, 0.8], partWeight: k => (k === 255 ? 14 : Math.min(1.5, Math.max(0.7, Math.sqrt(parts[k]?.weight ?? 0.2)))) });
    const game = u.mesh, tris = game.idx.length / 3;
    console.log(`${id}: ${tris} triangles, ${game.pos.length / 3} vertices, ${u.charts} charts, ${u.density.toFixed(0)} texels/m, ${(u.coverage * 100).toFixed(0)} % of the atlas`);
    const out = join(ROOT, 'public/game-art/breachline/hero', w.dir);
    await mkdir(out, { recursive: true });
    const bin = packMeshBin([{ name: 'weapon', m: game }, ...(lens ? [{ name: 'lens', m: lens }] : [])], { triangles: tris, texelDensity: Math.round(u.density), parts: parts.map(p => p.name) });
    await writeFile(join(out, 'mesh.bin'), bin);
    console.log(`wrote ${join(out, 'mesh.bin')} (${(bin.length / 1024).toFixed(0)} KB)`);
    if (!CLAY) await bakeSet(w, parts, game, S);
  }
}
await main();
