// Job 2.1: the Tactical soldier, cleaned for Breachline. Reads the Patch `src` GLB (4096 px textures) and writes
// public/game-art/breachline/patch/tactical/: body.glb (two levels, head and hands cut off with capped openings),
// diff/nor/arm KTX2 at 2048 and 1024 with 512 JPEG fallbacks, and a tint mask (kit vs fatigues).
// Usage: node prep-soldier.mjs <tactical-src.glb> <outDir> <scratchDir>
import { readGlb, primitive, writeGlb } from './glb.mjs';
import { cut, compact, V } from './mesh.mjs';
import { ktx2, jpeg } from './ktx.mjs';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [srcFile, outDir, scratch] = process.argv.slice(2);
await mkdir(outDir, { recursive: true }); await mkdir(scratch, { recursive: true });
const g = await readGlb(srcFile), p = primitive(g, g.json.nodes.findIndex(n => n.mesh !== undefined));
// Feet on y = 0 (the file is centred on its bounding box); facing +Z as delivered.
let minY = Infinity; for (let i = 1; i < p.pos.length; i += 3) minY = Math.min(minY, p.pos[i]);
for (let i = 1; i < p.pos.length; i += 3) p.pos[i] -= minY;
let m = { pos: p.pos, nrm: p.nrm, uv: p.uv, idx: p.idx };
// Job 3: the hair's quiff would show as a bump under the balaclava; flatten the top and front of the head a little.
if (process.env.FULL === '1') for (let i = 0; i < m.pos.length; i += 3) { const x = m.pos[i], y = m.pos[i + 1], z = m.pos[i + 2];
  if (y > 1.64 && Math.hypot(x, z) < 0.16) { const k = Math.min(1, (y - 1.64) / 0.05); m.pos[i + 1] = 1.64 + (y - 1.64) * (1 - 0.35 * k); if (z > 0.02) m.pos[i + 2] = z - (z - 0.02) * 0.3 * k; } }
const tris0 = m.idx.length / 3;

// A cap UV on plain black cloth that the tint mask calls fatigues: the vertex nearest the outside of the right sleeve.
let best = 0, bd = Infinity;
for (let i = 0; i < m.pos.length / 3; i++) { const d = Math.hypot(m.pos[i * 3] - 0.36, m.pos[i * 3 + 1] - 1.2, m.pos[i * 3 + 2]); if (d < bd) { bd = d; best = i; } }
const capUv = [m.uv[best * 2], m.uv[best * 2 + 1]];

/** Measured on the mesh (see STATUS.md): neck narrowest at 1.54-1.62 m, chin at about 1.56 m; wrists at the glove
 * cuffs, forearm axis from elbow (0.34, 1.10, -0.02) to wrist (0.39, 0.945, 0.085). */
export const CUTS = {
  neck: { p: [0, 1.525, 0], n: [0, 1, 0] },
  wristL: { p: [-0.388, 0.95, 0.08], n: [-0.25, -0.80, 0.53] },
  wristR: { p: [0.388, 0.95, 0.08], n: [0.25, -0.80, 0.53] },
};
const log = {};
const FULL = process.env.FULL === '1';  // job 3: keep the asset's own head and hands (repainted below)
let r = { mesh: m, loops: 0, removed: 0 };
if (!FULL) {
r = cut(m, CUTS.neck.p, CUTS.neck.n, c => c[1] > 1.35 && Math.abs(c[0]) < 0.22, capUv); m = r.mesh; log.neck = { loops: r.loops, removed: r.removed };
for (const k of ['wristL', 'wristR']) {
  const w = CUTS[k]; r = cut(m, w.p, w.n, c => Math.hypot(...V.sub(c, w.p)) < 0.25 && Math.abs(c[0]) > 0.27, capUv); m = r.mesh; log[k] = { loops: r.loops, removed: r.removed };
}
}
console.log('cuts', JSON.stringify(log), 'triangles', tris0, '->', m.idx.length / 3);

// Levels of detail. meshoptimizer treats vertices that share a position as a UV seam and keeps them together.
await MeshoptSimplifier.ready;
function lod(mesh, target) {
  const [idx, err] = MeshoptSimplifier.simplify(mesh.idx, mesh.pos, 3, Math.floor(target / 1) * 3, 0.05, []);
  return { mesh: compact({ ...mesh, idx: new Uint32Array(idx) }), err };
}
/** Below about 10k the atlas's thousands of UV seams stop the simplifier, so the far level is simplified with the
 * vertices welded by position, then each corner takes the duplicate whose UV island the triangle's other corners share
 * (corners with no shared island keep any duplicate: those few triangles stretch texture across a seam; on this
 * near-black outfit, drawn from 7 m out, that is not visible). */
function lodWelded(mesh, target) {
  const n = mesh.pos.length / 3, key = i => `${Math.round(mesh.pos[i * 3] * 1e5)},${Math.round(mesh.pos[i * 3 + 1] * 1e5)},${Math.round(mesh.pos[i * 3 + 2] * 1e5)}`;
  const weld = new Uint32Array(n), first = new Map(), dups = [];
  for (let i = 0; i < n; i++) { const k = key(i); let w = first.get(k); if (w === undefined) { w = dups.length; first.set(k, w); dups.push([]); } weld[i] = w; dups[w].push(i); }
  // UV islands: connected components of triangles through shared vertex indices.
  const parent = Int32Array.from({ length: n }, (_, i) => i), find = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (let t = 0; t < mesh.idx.length; t += 3) { const a = find(mesh.idx[t]); parent[find(mesh.idx[t + 1])] = a; parent[find(mesh.idx[t + 2])] = a; }
  const wpos = new Float32Array(dups.length * 3); dups.forEach((d, w) => wpos.set(mesh.pos.subarray(d[0] * 3, d[0] * 3 + 3), w * 3));
  const widx = Uint32Array.from(mesh.idx, i => weld[i]);
  const [sidx, err] = MeshoptSimplifier.simplify(widx, wpos, 3, target * 3, 0.2, []);
  const idx = new Uint32Array(sidx.length); let stretched = 0;
  for (let t = 0; t < sidx.length; t += 3) {
    const c = [sidx[t], sidx[t + 1], sidx[t + 2]], isl = c.map(w => new Set(dups[w].map(find)));
    const count = new Map(); for (const s of isl) for (const x of s) count.set(x, (count.get(x) ?? 0) + 1);
    let bestIsland = -1, bestN = 0; for (const [x, k] of count) if (k > bestN) { bestN = k; bestIsland = x; }
    if (bestN < 3) stretched++;
    for (let k = 0; k < 3; k++) idx[t + k] = dups[c[k]].find(i => find(i) === bestIsland) ?? dups[c[k]][0];
  }
  return { mesh: compact({ ...mesh, idx }), err, stretched: stretched / (sidx.length / 3) };
}
// Job 3.6: the fighters' budget is about 7.9k / 3.7k / 1.4k triangles per level (body and kit), so in FULL mode the
// levels are 8,000 / 3,200 / 1,200.
const FULL_LODS = process.env.FULL === '1';
const l0 = lod(m, FULL_LODS ? 8000 : 12000), l1 = lodWelded(m, FULL_LODS ? 3200 : 5000), l2 = FULL_LODS ? lodWelded(m, 1200) : null;
console.log('lod1 triangles crossing a UV seam', (l1.stretched * 100).toFixed(1) + '%');
console.log('lod0', l0.mesh.idx.length / 3, 'err', l0.err.toFixed(4), 'lod1', l1.mesh.idx.length / 3, 'err', l1.err.toFixed(4));

// Textures. Which image is which comes from the material.
const mat = g.json.materials[p.material ?? 0], tex = i => g.image(g.json.textures[i].source);
const baseImg = tex(mat.pbrMetallicRoughness.baseColorTexture.index), mrImg = tex(mat.pbrMetallicRoughness.metallicRoughnessTexture.index), norImg = tex(mat.normalTexture.index);
const meta = await sharp(baseImg).metadata(), S = meta.width;
// Metal/roughness: glTF packs occlusion? (R, unused here), roughness (G), metalness (B). Everything on this figure is
// cloth, webbing, rubber or polymer at the size we draw it, so metalness goes to 0 and roughness gets a floor.
const mr = await sharp(mrImg).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const arm = Buffer.alloc(mr.info.width * mr.info.height * 4);
let metalSum = 0, roughLow = 0;
for (let i = 0; i < arm.length; i += 4) {
  const rough = mr.data[i + 1] / 255, metal = mr.data[i + 2] / 255; metalSum += metal; if (rough < 0.4) roughLow++;
  arm[i] = 255; arm[i + 1] = Math.round((0.55 + 0.4 * rough) * 255); arm[i + 2] = 0; arm[i + 3] = 255;
}
console.log('source metalness mean', (metalSum / (arm.length / 4)).toFixed(3), 'texels rougher-than-0.4 share', (1 - roughLow / (arm.length / 4)).toFixed(3));
const armPng = await sharp(arm, { raw: { width: mr.info.width, height: mr.info.height, channels: 4 } }).png().toBuffer();

// Tint mask: 255 = kit (plate carrier, belt, holster, knee pads, boots), 0 = fatigues. Rasterised in UV space from
// each texel's interpolated position and normal, by body region (the shredded atlas has no usable colour cue: it is
// all near-black). Islands are dilated so mipmaps do not bleed fatigues into kit.
export function isKit(x, y, z, nz) {
  if (y < 0.165) return true;                                            // boots
  if (y > 0.40 && y < 0.585 && nz > 0.35 && Math.abs(x) < 0.27) return true; // knee pads (front faces of the knees)
  if (y > 0.925 && y < 1.055 && Math.abs(x) < 0.265) return true;        // belt and its pouches
  if (y >= 1.055 && y < 1.455 && Math.abs(x) < 0.215) return true;       // plate carrier (torso inside the arms)
  if (x < -0.205 && y > 0.66 && y < 0.95 && Math.abs(z) < 0.12) return true; // drop holster on the right thigh
  return false;
}
const M = 2048, mask = new Uint8Array(M * M), cover = new Uint8Array(M * M);
/** Job 3 repaint regions (file frame, facing +Z): 1 = balaclava (head and neck), 2 = eye band (kept as is),
 * 3 = hand (bare fingertips become glove). Measured on renders: eyes at y 1.595, brows 1.61. */
const region = new Uint8Array(M * M), rpos = new Float32Array(M * M * 3);
function regionOf(x, y, z) {
  const r = Math.hypot(x, z + 0.005);
  if (FULL && ((y > 1.55 && r < 0.16) || (y > 1.49 && y <= 1.55 && z > 0.02 && r < 0.16 && Math.abs(x) < 0.09) || (y > 1.47 && y <= 1.55 && r < 0.09))) return y > 1.578 && y < 1.625 && z > 0.07 && z < 0.112 && Math.abs(x) < 0.062 ? 2 : 1;
  if (FULL && Math.abs(x) > 0.31 && y < 0.925 && y > 0.6) return 3;
  return 0;
}
{
  const { pos, nrm, uv, idx } = m;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const ax = uv[a * 2] * M, ay = uv[a * 2 + 1] * M, bx = uv[b * 2] * M, by = uv[b * 2 + 1] * M, cx = uv[c * 2] * M, cy = uv[c * 2 + 1] * M;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(M - 1, Math.ceil(Math.max(ax, bx, cx)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(M - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
      const sx = px + 0.5, sy = py + 0.5;
      const w0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den, w1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den, w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const P = k => w0 * pos[a * 3 + k] + w1 * pos[b * 3 + k] + w2 * pos[c * 3 + k], nz = w0 * nrm[a * 3 + 2] + w1 * nrm[b * 3 + 2] + w2 * nrm[c * 3 + 2];
      const o = py * M + px; cover[o] = 1; mask[o] = isKit(P(0), P(1), P(2), nz) ? 255 : 0; region[o] = regionOf(P(0), P(1), P(2)); rpos.set([P(0), P(1), P(2)], o * 3);
    }
  }
  for (let pass = 0; pass < 6; pass++) {  // dilate into uncovered texels
    const nc = cover.slice(), nm = mask.slice(), nr = region.slice();
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) { const o = y * M + x; if (cover[o]) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= M || Y >= M) continue; const q = Y * M + X; if (cover[q]) { nc[o] = 1; nm[o] = mask[q]; nr[o] = region[q]; rpos.set(rpos.subarray(q * 3, q * 3 + 3), o * 3); break; } } }
    cover.set(nc); mask.set(nm); region.set(nr);
  }
}
const maskRgb = Buffer.alloc(M * M * 3);
for (let o = 0; o < M * M; o++) { maskRgb[o * 3] = region[o] ? 0 : mask[o]; maskRgb[o * 3 + 1] = region[o] ? 255 : 0; }
// R = kit, G = keep (balaclava, eyes and gloves keep their own colour in every squad).
const maskPng = await sharp(maskRgb, { raw: { width: M, height: M, channels: 3 } }).blur(1.2).png().toBuffer();
// Repaint (job 3): at 2048, from the 4096 sources.
let baseImgOut = baseImg, norImgOut = norImg, armPngOut = armPng;
if (FULL) {
  const raw = async (b, ch) => (await sharp(b).resize(M, M, { kernel: 'lanczos3' }).removeAlpha().raw().toBuffer());
  const bc = await raw(baseImg), nr = await raw(norImg), am = await raw(armPng);
  const fr = x => x - Math.floor(x), h = (a, b) => fr(Math.sin(a * 12.9898 + b * 78.233) * 43758.5453);
  let head = 0, glove = 0;
  for (let o = 0; o < M * M; o++) {
    const rg = region[o]; if (!rg || rg === 2) continue;
    const x = rpos[o * 3], y = rpos[o * 3 + 1], z = rpos[o * 3 + 2];
    if (rg === 1) {
      // Dark knitted balaclava: vertical ribs 3.5 mm apart around the head, stitch rows 4.5 mm high.
      const sArc = Math.atan2(x, z + 0.005) * 0.11, rib = Math.sin(2 * Math.PI * sArc / 0.0035), row = Math.sin(2 * Math.PI * y / 0.0045 + (rib > 0 ? 0 : Math.PI));
      const knit = 0.5 + 0.25 * rib + 0.15 * row + 0.1 * (h(Math.round(sArc * 2000), Math.round(y * 2000)) - 0.5);
      const v = 15 + 14 * knit; bc[o * 3] = v; bc[o * 3 + 1] = v + 1; bc[o * 3 + 2] = v + 3;
      nr[o * 3] = Math.round(128 + 40 * Math.cos(2 * Math.PI * sArc / 0.0035)); nr[o * 3 + 1] = Math.round(128 + 22 * Math.cos(2 * Math.PI * y / 0.0045)); nr[o * 3 + 2] = 240;
      am[o * 3 + 1] = 245; am[o * 3 + 2] = 0; head++;
    } else {
      // Glove: only the bare skin (orange-pink) becomes black synthetic glove; the glove texels stay.
      const r = bc[o * 3], g = bc[o * 3 + 1], b = bc[o * 3 + 2];
      if (r > 70 && r > b + 25 && r >= g) { const v = 20 + 10 * h(x * 900, y * 900); bc[o * 3] = v; bc[o * 3 + 1] = v; bc[o * 3 + 2] = v + 2; am[o * 3 + 1] = 200; glove++; }
    }
  }
  console.log('repainted texels: balaclava', head, 'glove', glove);
  const png = d => sharp(d, { raw: { width: M, height: M, channels: 3 } }).png().toBuffer();
  [baseImgOut, norImgOut, armPngOut] = await Promise.all([png(bc), png(nr), png(am)]);
  await writeFile(path.join(scratch, 'diff-repainted.png'), baseImgOut);
}
// Reference luminance of each class in the colour texture, for luminance-preserving recolouring.
const base = await sharp(baseImg).resize(M, M).removeAlpha().raw().toBuffer();
const lum = [0, 0], cnt = [0, 0];
for (let o = 0; o < M * M; o++) { if (!cover[o] || region[o]) continue; const k = mask[o] > 127 ? 1 : 0, L = (0.2126 * base[o * 3] + 0.7152 * base[o * 3 + 1] + 0.0722 * base[o * 3 + 2]) / 255; lum[k] += L; cnt[k]++; }
const refLum = { fatigues: +(lum[0] / cnt[0]).toFixed(4), kit: +(lum[1] / cnt[1]).toFixed(4) };
// Luminance range per class, linear light (2nd and 98th percentiles and the median), for recolouring by remapping the
// source's dark range onto the target's range (so folds, seams and wear survive).
const hist = [new Uint32Array(1024), new Uint32Array(1024)];
for (let o = 0; o < M * M; o++) { if (!cover[o] || region[o]) continue; const k = mask[o] > 127 ? 1 : 0, lin = c => Math.pow(c / 255, 2.2), L = 0.2126 * lin(base[o * 3]) + 0.7152 * lin(base[o * 3 + 1]) + 0.0722 * lin(base[o * 3 + 2]); hist[k][Math.min(1023, Math.floor(L * 4096))]++; }
const pct = (h, q) => { let tot = 0; for (const v of h) tot += v; let acc = 0; for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc >= q * tot) return +(i / 4096).toFixed(5); } return 0.25; };
const lumRange = { fatigues: [pct(hist[0], 0.02), pct(hist[0], 0.5), pct(hist[0], 0.98)], kit: [pct(hist[1], 0.02), pct(hist[1], 0.5), pct(hist[1], 0.98)] };
console.log('linear luminance p2/p50/p98', JSON.stringify(lumRange));
console.log('reference luminance (sRGB)', refLum, 'kit share', (cnt[1] / (cnt[0] + cnt[1])).toFixed(3));

// Files.
const credit = g.json.asset?.extras?.credit ?? null;
const extras = { lumRange, source: 'patch.gg scenario:asset_e9xaKzrr8R1sMe2VMajWaAb1 (src variant)', license: 'CC-BY-4.0', changes: 'head cut at the neck and hands at the wrists (capped), metalness removed, roughness floored, simplified to two levels, tint mask added', up: '+Y', facing: '+Z', units: 'metres, feet on y = 0', cuts: CUTS, refLum };
const mk = (name, mm) => ({ name, attributes: { POSITION: mm.pos, NORMAL: mm.nrm, TEXCOORD_0: mm.uv }, indices: mm.idx });
// The static file stays in scratch (the skinned file in public carries the same levels).
await writeGlb(path.join(scratch, 'body.glb'), [mk('body_lod0', l0.mesh), mk('body_lod1', l1.mesh), ...(l2 ? [mk('body_lod2', l2.mesh)] : [])], extras);
// Uncut full-resolution mesh too, for the skinning step (scratch only).
await writeGlb(path.join(scratch, 'tactical-cut-full.glb'), [mk('body_full', m)], extras);
const files = {};
const put = async (name, buf) => { await writeFile(path.join(outDir, name), buf); files[name] = buf.length; };
for (const [kind, img] of [['diff', baseImgOut], ['nor', norImgOut], ['arm', armPngOut]]) {
  // Roughness alone is left in the packed map; at 2048 it cost 1.75 MB for no visible gain, so it ships at 1024 only.
  // Normals and the packed map at 1024 only (job 3.6: the fighters' own sets ship them at 1024 for the nearest level).
  for (const size of kind === 'diff' ? [2048, 1024] : [1024]) await put(`${kind}-${size}.ktx2`, await ktx2(img, size, kind));
  await put(`${kind}-512.jpg`, await jpeg(img, 512, kind === 'diff' ? 82 : 90));
}
await put('mask-1024.ktx2', await ktx2(maskPng, 1024, 'mask'));
await put('mask-256.png', await sharp(maskPng).resize(256, 256).png({ compressionLevel: 9 }).toBuffer());
await writeFile(path.join(scratch, 'mask-2048.png'), maskPng); await writeFile(path.join(scratch, 'arm-src.png'), armPng);
const { statSync, existsSync } = await import('node:fs');
if (existsSync(path.join(outDir, 'body-skinned.glb'))) files['body-skinned.glb'] = statSync(path.join(outDir, 'body-skinned.glb')).size;
const total = Object.values(files).reduce((a, b) => a + b, 0);
await writeFile(path.join(outDir, 'tactical.json'), JSON.stringify({ id: 'scenario:asset_e9xaKzrr8R1sMe2VMajWaAb1', variant: 'src', triangles: { source: tris0, lod0: l0.mesh.idx.length / 3, lod1: l1.mesh.idx.length / 3 }, refLum, lumRange, skinned: { file: 'body-skinned.glb', skeleton: 'fighters/skeleton.ts, 32 bones, JOINTS_0 = bone order B, weights normalised bytes', frame: 'fighters frame: facing -Z, bind pose, authored units (fighter group applies SCALE)' }, cuts: CUTS, files, bytes: total }, null, 1));
console.log(JSON.stringify(files), 'total', (total / 1e6).toFixed(2), 'MB');
