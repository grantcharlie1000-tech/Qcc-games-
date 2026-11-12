/** Job 2.3: the Patch sci-fi rifle made usable. Run with `npx vite-node scripts/breachline-assets/patch-trial/prep-rifle.ts`
 * (env RIFLE = the web-lod2 GLB, SCRATCH = a scratch folder). Steps:
 * 1. Normalise (0.88 m long; Patch's 1.90 m is an estimate) and turn into our weapon frame: muzzle toward -Z, +Y up,
 *    +X the right side, origin at the bounding-box centre.
 * 2. Decimate the 151k-triangle mesh (welded) to about 15k; cut the magazine off as its own capped part.
 * 3. Crease normals, unwrap with the hero weapons' own unwrapper (large axis-projected islands, 2048 atlas).
 * 4. Bake from the 151k mesh by closest point: colour and roughness/metal through its UVs, and its smooth normals
 *    into the new tangent space. Then paint out the glowing blue windows, the orange stripes and light-on-dark text.
 * Imports from src/ are read-only. */
import * as THREE from 'three';
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { MeshBVH } from 'three-mesh-bvh';
import { MeshoptSimplifier } from 'meshoptimizer';
import { unwrap, WEAPON_WEIGHT } from '../../../src/games/breachline/render/hero/unwrap';
import { crease } from '../../../src/games/breachline/render/hero/geom';
// @ts-expect-error plain JS modules
import { readGlb, primitive, writeGlb } from './glb.mjs';
// @ts-expect-error plain JS modules
import { cut, compact } from './mesh.mjs';
// @ts-expect-error plain JS modules
import { ktx2, jpeg } from './ktx.mjs';

const OUT = 'public/game-art/breachline/patch/rifle-scifi', SCRATCH = process.env.SCRATCH!, SIZE = 2048, TARGET = 15000, LENGTH = 0.88;

async function main() {
  await mkdir(OUT, { recursive: true }); await mkdir(SCRATCH, { recursive: true });
  await MeshoptSimplifier.ready;
  const g = await readGlb(process.env.RIFLE!), p = primitive(g, 0), n = p.pos.length / 3;
  // 1. Normalise into the file's orientation first (muzzle -X), then turn: file (x, y, z) -> ours (-z, y, x).
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p.pos[i * 3 + c]); mx[c] = Math.max(mx[c], p.pos[i * 3 + c]); }
  const k = LENGTH / (mx[0] - mn[0]), cen = mn.map((v, c) => (v + mx[c]) / 2);
  const hiPos = new Float32Array(n * 3), hiNrm = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = (p.pos[i * 3] - cen[0]) * k, y = (p.pos[i * 3 + 1] - cen[1]) * k, z = (p.pos[i * 3 + 2] - cen[2]) * k;
    hiPos.set([-z, y, x], i * 3); hiNrm.set([-p.nrm[i * 3 + 2], p.nrm[i * 3 + 1], p.nrm[i * 3]], i * 3);
  }
  // 2. Decimate welded (the 151k mesh's UV seams would otherwise pin the simplifier).
  const key = (i: number) => `${Math.round(hiPos[i * 3] * 1e5)},${Math.round(hiPos[i * 3 + 1] * 1e5)},${Math.round(hiPos[i * 3 + 2] * 1e5)}`;
  const weld = new Map<string, number>(), wid = new Uint32Array(n), wpos: number[] = [];
  for (let i = 0; i < n; i++) { const kk = key(i); let w = weld.get(kk); if (w === undefined) { w = wpos.length / 3; weld.set(kk, w); wpos.push(hiPos[i * 3], hiPos[i * 3 + 1], hiPos[i * 3 + 2]); } wid[i] = w; }
  const WP = new Float32Array(wpos), widx = Uint32Array.from(p.idx, (i: number) => wid[i]);
  const [sidx, err] = MeshoptSimplifier.simplify(widx, WP, 3, TARGET * 3, 1, []);
  let low = compact({ pos: WP, nrm: new Float32Array(WP.length), uv: new Float32Array(WP.length / 3 * 2), idx: new Uint32Array(sidx) });
  console.log('decimated', p.idx.length / 3, '->', low.idx.length / 3, 'error', err.toFixed(4));
  // Magazine: below the magazine well (y < -0.04) between z -0.115 and +0.015 (measured on the side profile).
  const MAG = { y: -0.04, z0: -0.115, z1: 0.015 };
  const inMag = (c: number[]) => c[2] > MAG.z0 && c[2] < MAG.z1 && c[1] < MAG.y + 0.03;
  const body = cut(low, [0, MAG.y, 0], [0, -1, 0], inMag, [0, 0]).mesh;
  let mag = cut(low, [0, MAG.y, 0], [0, 1, 0], () => true, [0, 0]).mesh;
  // Keep only magazine triangles (the second cut removed everything above the plane; drop what is outside the well).
  { const keep: number[] = []; for (let t = 0; t < mag.idx.length; t += 3) { const c = [0, 1, 2].map(q => (mag.pos[mag.idx[t] * 3 + q] + mag.pos[mag.idx[t + 1] * 3 + q] + mag.pos[mag.idx[t + 2] * 3 + q]) / 3); if (c[2] > MAG.z0 && c[2] < MAG.z1) keep.push(mag.idx[t], mag.idx[t + 1], mag.idx[t + 2]); } mag = compact({ ...mag, idx: new Uint32Array(keep) }); }
  console.log('body', body.idx.length / 3, 'magazine', mag.idx.length / 3);
  // 3. One geometry with a `part` attribute (0 body, 1 magazine), creased, unwrapped.
  const geo = new THREE.BufferGeometry(), nb = body.pos.length / 3, nm = mag.pos.length / 3;
  const pos = new Float32Array((nb + nm) * 3); pos.set(body.pos); pos.set(mag.pos, nb * 3);
  const part = new Float32Array(nb + nm); part.fill(1, nb);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('part', new THREE.BufferAttribute(part, 1));
  geo.setIndex(new THREE.BufferAttribute(Uint32Array.from([...body.idx, ...Array.from(mag.idx as Uint32Array, (i: number) => i + nb)]), 1));
  const creased = crease(geo, 0.6);
  const u = unwrap(creased, { size: SIZE, pad: 8, weight: WEAPON_WEIGHT });
  const lg = u.geo; lg.computeTangents();
  console.log('unwrapped', u.islands, 'islands, density', u.density.toFixed(0), 'texels/m');
  // 4. Bake.
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(hiPos, 3)); hg.setAttribute('normal', new THREE.BufferAttribute(hiNrm, 3)); hg.setAttribute('uv', new THREE.BufferAttribute(p.uv, 2)); hg.setIndex(new THREE.BufferAttribute(p.idx, 1));
  const bvh = new MeshBVH(hg);
  const mat = g.json.materials[0], img = (i: number) => g.image(g.json.textures[i].source);
  const raw = async (b: Buffer) => { const r = await sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true }); return { d: r.data, w: r.info.width, h: r.info.height }; };
  const hiCol = await raw(img(mat.pbrMetallicRoughness.baseColorTexture.index)), hiMR = await raw(img(mat.pbrMetallicRoughness.metallicRoughnessTexture.index));
  const sample = (t: { d: Buffer; w: number; h: number }, u0: number, v0: number, out: number[]) => {
    const x = (u0 - Math.floor(u0)) * t.w - 0.5, y = (v0 - Math.floor(v0)) * t.h - 0.5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const at = (xx: number, yy: number, c: number) => t.d[((Math.min(t.h - 1, Math.max(0, yy))) * t.w + Math.min(t.w - 1, Math.max(0, xx))) * 3 + c];
    for (let c = 0; c < 3; c++) out[c] = (at(x0, y0, c) * (1 - fx) + at(x0 + 1, y0, c) * fx) * (1 - fy) + (at(x0, y0 + 1, c) * (1 - fx) + at(x0 + 1, y0 + 1, c) * fx) * fy;
    return out;
  };
  const col = new Uint8Array(SIZE * SIZE * 3), nor = new Uint8Array(SIZE * SIZE * 3), arm = new Uint8Array(SIZE * SIZE * 3), cover = new Uint8Array(SIZE * SIZE);
  const LP = lg.getAttribute('position'), LN = lg.getAttribute('normal'), LU = lg.getAttribute('uv'), LT = lg.getAttribute('tangent'), LI = lg.index!.array;
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }, P3 = new THREE.Vector3(), N3 = new THREE.Vector3(), T3 = new THREE.Vector3(), B3 = new THREE.Vector3(), HN = new THREE.Vector3();
  const tri = new THREE.Triangle(), bary = new THREE.Vector3(), tmp = [0, 0, 0], tmp2 = [0, 0, 0];
  const HI = hg.index!.array, HP = hg.getAttribute('position'), HU = hg.getAttribute('uv');
  let far = 0, texels = 0; const t0 = Date.now();
  for (let t = 0; t < LI.length; t += 3) {
    const a = LI[t], b = LI[t + 1], c = LI[t + 2];
    const ax = LU.getX(a) * SIZE, ay = LU.getY(a) * SIZE, bx = LU.getX(b) * SIZE, by = LU.getY(b) * SIZE, cx = LU.getX(c) * SIZE, cy = LU.getY(c) * SIZE;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-9) continue;
    for (let py = Math.max(0, Math.floor(Math.min(ay, by, cy))); py <= Math.min(SIZE - 1, Math.ceil(Math.max(ay, by, cy))); py++)
      for (let px = Math.max(0, Math.floor(Math.min(ax, bx, cx))); px <= Math.min(SIZE - 1, Math.ceil(Math.max(ax, bx, cx))); px++) {
        const sx = px + 0.5, sy = py + 0.5;
        const w0 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / den, w1 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / den, w2 = 1 - w0 - w1;
        if (w0 < -0.01 || w1 < -0.01 || w2 < -0.01) continue;
        const o = py * SIZE + px; if (cover[o]) continue; cover[o] = 1; texels++;
        const lerp = (A: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, v: THREE.Vector3) => v.set(w0 * A.getX(a) + w1 * A.getX(b) + w2 * A.getX(c), w0 * A.getY(a) + w1 * A.getY(b) + w2 * A.getY(c), w0 * A.getZ(a) + w1 * A.getZ(b) + w2 * A.getZ(c));
        lerp(LP, P3); lerp(LN, N3).normalize(); lerp(LT, T3); T3.addScaledVector(N3, -T3.dot(N3)).normalize(); B3.crossVectors(N3, T3).multiplyScalar(LT.getW(a) < 0 ? -1 : 1);
        bvh.closestPointToPoint(P3, target as never);
        if (target.distance > 0.006) far++;
        const f = target.faceIndex, i0 = HI[f * 3], i1 = HI[f * 3 + 1], i2 = HI[f * 3 + 2];
        tri.setFromAttributeAndIndices(HP as THREE.BufferAttribute, i0, i1, i2); tri.getBarycoord(target.point, bary);
        const hu = bary.x * HU.getX(i0) + bary.y * HU.getX(i1) + bary.z * HU.getX(i2), hv = bary.x * HU.getY(i0) + bary.y * HU.getY(i1) + bary.z * HU.getY(i2);
        sample(hiCol, hu, hv, tmp); col.set(tmp.map(Math.round), o * 3);
        sample(hiMR, hu, hv, tmp2); arm.set([255, Math.round(tmp2[1]), Math.round(tmp2[2])], o * 3);
        HN.set(0, 0, 0).addScaledVector(new THREE.Vector3(hiNrm[i0 * 3], hiNrm[i0 * 3 + 1], hiNrm[i0 * 3 + 2]), bary.x).addScaledVector(new THREE.Vector3(hiNrm[i1 * 3], hiNrm[i1 * 3 + 1], hiNrm[i1 * 3 + 2]), bary.y).addScaledVector(new THREE.Vector3(hiNrm[i2 * 3], hiNrm[i2 * 3 + 1], hiNrm[i2 * 3 + 2]), bary.z).normalize();
        if (HN.dot(N3) < 0.2) HN.copy(N3);  // the closest point is on another surface (thin parts): keep the low normal
        nor.set([Math.round((HN.dot(T3) * 0.5 + 0.5) * 255), Math.round((HN.dot(B3) * 0.5 + 0.5) * 255), Math.round((HN.dot(N3) * 0.5 + 0.5) * 255)], o * 3);
      }
  }
  console.log('baked', texels, 'texels in', ((Date.now() - t0) / 1000).toFixed(0), 's;', (far / texels * 100).toFixed(1) + '% more than 6 mm from the 151k surface');
  // Paint-out, in the colour: blue glow -> dark anodised panel; orange accents -> dark polymer; light marks on dark
  // panels (text, numbers) -> the local panel colour.
  const counts = { glow: 0, orange: 0, marks: 0 };
  const hsv = (r: number, g2: number, b: number) => { const M = Math.max(r, g2, b), m = Math.min(r, g2, b), d = M - m; let h = 0; if (d) h = M === r ? ((g2 - b) / d) % 6 : M === g2 ? (b - r) / d + 2 : (r - g2) / d + 4; return [(h * 60 + 360) % 360, M ? d / M : 0, M / 255]; };
  const kind = new Uint8Array(SIZE * SIZE);
  for (let o = 0; o < SIZE * SIZE; o++) { if (!cover[o]) continue; const [h, s, v] = hsv(col[o * 3], col[o * 3 + 1], col[o * 3 + 2]);
    if (h > 170 && h < 240 && s > 0.3 && v > 0.22) kind[o] = 1; else if (h > 8 && h < 50 && s > 0.4 && v > 0.25) kind[o] = 2; else if (s < 0.3 && v > 0.42) kind[o] = 3; }
  // Grow the glow and orange areas by 2 texels (their soft fringes).
  for (let pass = 0; pass < 2; pass++) { const nk = kind.slice(); for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) { const o = y * SIZE + x; if (kind[o] || !cover[o]) continue; for (const q of [o - 1, o + 1, o - SIZE, o + SIZE]) if (kind[q] === 1 || kind[q] === 2) { nk[o] = kind[q]; break; } } kind.set(nk); }
  // Local panel colour: mean of unmarked covered texels in a 15x15 window (summed-area tables).
  const W = SIZE + 1, sum = [new Float64Array(W * W), new Float64Array(W * W), new Float64Array(W * W)], cnt = new Float64Array(W * W);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const o = y * SIZE + x, ok = cover[o] && !kind[o] ? 1 : 0, q = (y + 1) * W + x + 1;
    for (let c = 0; c < 3; c++) sum[c][q] = col[o * 3 + c] * ok + sum[c][q - 1] + sum[c][q - W] - sum[c][q - W - 1]; cnt[q] = ok + cnt[q - 1] + cnt[q - W] - cnt[q - W - 1]; }
  const box = (arr: Float64Array, x0: number, y0: number, x1: number, y1: number) => arr[y1 * W + x1] - arr[y0 * W + x1] - arr[y1 * W + x0] + arr[y0 * W + x0];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const o = y * SIZE + x; if (!kind[o]) continue;
    const x0 = Math.max(0, x - 7), y0 = Math.max(0, y - 7), x1 = Math.min(SIZE, x + 8), y1 = Math.min(SIZE, y + 8), nn = box(cnt, x0, y0, x1, y1);
    const local = nn > 4 ? [0, 1, 2].map(c => box(sum[c], x0, y0, x1, y1) / nn) : [34, 36, 38];
    if (kind[o] === 1) { col.set([24, 27, 31], o * 3); arm[o * 3 + 1] = 110; arm[o * 3 + 2] = 200; counts.glow++; }       // anodised: smoother, metallic
    else if (kind[o] === 2) { col.set([38, 39, 41], o * 3); arm[o * 3 + 2] = 0; counts.orange++; }
    else { col.set(local.map(v => Math.round(Math.min(v, 70))), o * 3); counts.marks++; }
  }
  console.log('painted out', counts);
  // Dilate every map 8 texels into the gutters so mipmaps do not pull in black.
  for (let pass = 0; pass < 8; pass++) { const nc = cover.slice(); for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const o = y * SIZE + x; if (cover[o]) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= SIZE || Y >= SIZE) continue; const q = Y * SIZE + X; if (cover[q]) { for (const A of [col, nor, arm]) A.set(A.subarray(q * 3, q * 3 + 3), o * 3); nc[o] = 1; break; } } } cover.set(nc); }
  for (let o = 0; o < SIZE * SIZE; o++) if (!cover[o]) { nor.set([128, 128, 255], o * 3); arm.set([255, 200, 0], o * 3); }
  const png = (d: Uint8Array) => sharp(Buffer.from(d), { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toBuffer();
  const [colPng, norPng, armPng] = await Promise.all([png(col), png(nor), png(arm)]);
  await Promise.all([writeFile(`${SCRATCH}/rifle-diff.png`, colPng), writeFile(`${SCRATCH}/rifle-nor.png`, norPng), writeFile(`${SCRATCH}/rifle-arm.png`, armPng)]);
  // Geometry: body and magazine as separate meshes; the magazine's origin is the top centre of its well (its seat).
  const PA = lg.getAttribute('position'), NA = lg.getAttribute('normal'), UA = lg.getAttribute('uv'), TA = lg.getAttribute('tangent'), PR = lg.getAttribute('part'), ix = lg.index!.array;
  const magSeat = [0, MAG.y, (MAG.z0 + MAG.z1) / 2];
  const split = (which: number, origin: number[]) => {
    const map = new Map<number, number>(), P: number[] = [], N: number[] = [], U: number[] = [], T: number[] = [], I: number[] = [];
    for (let t = 0; t < ix.length; t += 3) { if (Math.round(PR.getX(ix[t])) !== which) continue;
      for (let q = 0; q < 3; q++) { const v = ix[t + q]; let m = map.get(v); if (m === undefined) { m = P.length / 3; map.set(v, m); P.push(PA.getX(v) - origin[0], PA.getY(v) - origin[1], PA.getZ(v) - origin[2]); N.push(NA.getX(v), NA.getY(v), NA.getZ(v)); U.push(UA.getX(v), UA.getY(v)); T.push(TA.getX(v), TA.getY(v), TA.getZ(v), TA.getW(v)); } I.push(m); } }
    return { attributes: { POSITION: new Float32Array(P), NORMAL: new Float32Array(N), TANGENT: new Float32Array(T), TEXCOORD_0: new Float32Array(U) }, indices: new Uint32Array(I), tris: I.length / 3 };
  };
  const bodyM = split(0, [0, 0, 0]), magM = split(1, magSeat);
  const sockets = {
    frame: 'metres; muzzle toward -Z, +Y up, +X right; origin at the bounding-box centre; lengths after scaling to 0.88 m',
    muzzle: [0, 0.03, -0.44], bore: [0, 0.03], sightLine: { rear: [0, 0.148, 0.04], front: [0, 0.148, -0.06], heightAboveBore: 0.118 },
    grip: { palm: [0, -0.07, 0.185], axisDeg: 20, note: 'pistol-grip centre, grip raked 20 degrees back from vertical' },
    support: { palm: [0, -0.045, -0.25], note: 'under the handguard' },
    trigger: [0, -0.03, 0.095], mag: { seat: magSeat, node: 'magazine', note: 'the magazine mesh origin is this point; drop it along -Y' },
    eject: [0.042, 0.06, 0.04], handle: [0, 0.11, 0.13],
    measured: 'by eye from the side profile and renders; see STATUS.md',
  };
  await writeGlb(`${OUT}/rifle.glb`, [{ name: 'body', ...bodyM }, { name: 'magazine', ...magM, translation: magSeat }], { source: 'patch.gg scenario:asset_kHXqk4QynhrkbnpiD9C8A5zo (web-lod2)', license: 'CC-BY-4.0', sockets, normalMap: 'tangent space, +Y up (glTF), use with the TANGENT attribute' });
  await writeFile(`${OUT}/sockets.json`, JSON.stringify(sockets, null, 1));
  const files: Record<string, number> = {}, put = async (name: string, buf: Buffer) => { await writeFile(`${OUT}/${name}`, buf); files[name] = buf.length; };
  for (const [kd, im] of [['diff', colPng], ['nor', norPng], ['arm', armPng]] as const) {
    // Budget (4 MB): the normal map at 2048 alone was 1.6 MB, so normals and the packed map ship at 1024; colour at 2048.
    for (const s of kd === 'diff' ? [2048, 1024] : [1024]) await put(`${kd}-${s}.ktx2`, await ktx2(im, s, kd));
    await put(`${kd}-512.jpg`, await jpeg(im, 512, kd === 'diff' ? 82 : 90));
  }
  const { statSync } = await import('node:fs'); files['rifle.glb'] = statSync(`${OUT}/rifle.glb`).size;
  const total = Object.values(files).reduce((x, y) => x + y, 0);
  console.log('triangles body', bodyM.tris, 'magazine', magM.tris, JSON.stringify(files), (total / 1e6).toFixed(2), 'MB');
}
main();
