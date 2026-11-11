#!/usr/bin/env -S npx vite-node
/** Bakes the weapon texture sets (plan: "Change of technique ... baked texture sets").
 *
 *   npx vite-node scripts/breachline-assets/hero/bake.ts [ar] [--size 2048] [--preview]
 *
 * For each texel of the weapon's atlas (UVs from render/hero/unwrap.ts, the same as at run time) it finds the surface
 * point, ray-casts ambient occlusion against the weapon (three-mesh-bvh), derives curvature, bakes a tangent-space
 * normal map from per-material height stamps that are too fine for triangles (polymer pebble, grip stipple, machining
 * lines, knurling, rail slot edges), then paints albedo and occlusion/roughness/metalness in layers: base finish, bare
 * metal on convex edges broken up by noise, dust and oil in cavities, handling polish where hands go, scratches along
 * the directions parts slide. Writes PNG masters (scratch .cache), KTX2 at 2048 and 1024 and 512 px JPEG fallbacks to
 * public/game-art/breachline/hero/<id>/, and preview PNGs for the evidence. Deterministic. */
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { encodeToKTX2 } from 'ktx2-encoder';
import type { WeaponId } from '../../../src/games/breachline/config';
import { PAT, heroReady } from '../../../src/games/breachline/render/hero/geom';
import { FORE, HAND, UPPER, digitRest, rightArm } from '../../../src/games/breachline/render/hero/hands';
import { DEFAULT_LOOK } from '../../../src/games/breachline/render/hero/rig';
import { WB, weaponModel } from '../../../src/games/breachline/render/hero/weapons';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d; };
const ids = process.argv.slice(2).filter(a => !a.startsWith('--') && !/^\d+$/.test(a));
const SIZE = Number(arg('size', '2048')), PREVIEW = process.argv.includes('--preview');

// ---- Noise (deterministic) --------------------------------------------------------------------------------------
const hash = (x: number, y: number, z: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
const fbm = (x: number, y: number, z: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 3.7); f *= 2.03; a *= 0.5; } return s; };
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

type Mode = 'weapon' | 'hands';
async function bake(id: string, geo: THREE.BufferGeometry, density: number, S: number, mode: Mode, sizes: number[]) {
  const t0 = Date.now(), model = { texelDensity: density };
  const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), UV = geo.getAttribute('uv'), C = geo.getAttribute('color'), PB = geo.getAttribute('pbr'), E = geo.getAttribute('edge'), SI = geo.getAttribute('skinIndex');
  const ix = geo.index!.array, nt = ix.length / 3, T = S * S;
  // Texel buffers.
  const pos = new Float32Array(T * 3), nor = new Float32Array(T * 3), alb = new Float32Array(T * 3), pbr = new Float32Array(T * 4), edge = new Float32Array(T), tan = new Float32Array(T * 3), bit = new Float32Array(T * 3), bone = new Uint8Array(T), cov = new Uint8Array(T);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tA = new THREE.Vector2(), tB = new THREE.Vector2(), tC = new THREE.Vector2();
  for (let t = 0; t < nt; t++) {
    const i0 = ix[t * 3], i1 = ix[t * 3 + 1], i2 = ix[t * 3 + 2];
    tA.set(UV.getX(i0) * S, UV.getY(i0) * S); tB.set(UV.getX(i1) * S, UV.getY(i1) * S); tC.set(UV.getX(i2) * S, UV.getY(i2) * S);
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    // Tangent frame from UV gradients (matches three's derivative-based normal mapping).
    const e1 = b.clone().sub(a), e2 = c.clone().sub(a), du1 = tB.x - tA.x, dv1 = tB.y - tA.y, du2 = tC.x - tA.x, dv2 = tC.y - tA.y;
    const r = 1 / (du1 * dv2 - du2 * dv1 || 1e-9);
    const Tg = e1.clone().multiplyScalar(dv2).addScaledVector(e2, -dv1).multiplyScalar(r).normalize();
    const Bt = e2.clone().multiplyScalar(du1).addScaledVector(e1, -du2).multiplyScalar(r).normalize();
    const x0 = Math.max(0, Math.floor(Math.min(tA.x, tB.x, tC.x)) - 1), x1 = Math.min(S - 1, Math.ceil(Math.max(tA.x, tB.x, tC.x)) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(tA.y, tB.y, tC.y)) - 1), y1 = Math.min(S - 1, Math.ceil(Math.max(tA.y, tB.y, tC.y)) + 1);
    const area = (tB.x - tA.x) * (tC.y - tA.y) - (tC.x - tA.x) * (tB.y - tA.y);
    if (Math.abs(area) < 1e-12) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((tB.x - px) * (tC.y - py) - (tC.x - px) * (tB.y - py)) / area, w1 = ((tC.x - px) * (tA.y - py) - (tA.x - px) * (tC.y - py)) / area, w2 = 1 - w0 - w1;
      // Conservative: accept texels whose centre is within half a texel outside, clamped to the triangle.
      const tol = 0.7 / Math.sqrt(Math.abs(area));
      if (w0 < -tol || w1 < -tol || w2 < -tol) continue;
      const inside = w0 >= 0 && w1 >= 0 && w2 >= 0, k = y * S + x;
      if (cov[k] === 2 && !inside) continue;
      w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2); const ws = w0 + w1 + w2; w0 /= ws; w1 /= ws; w2 /= ws;
      cov[k] = inside ? 2 : 1;
      for (let q = 0; q < 3; q++) {
        pos[k * 3 + q] = (P.getComponent(i0, q) * w0 + P.getComponent(i1, q) * w1 + P.getComponent(i2, q) * w2);
        nor[k * 3 + q] = (N.getComponent(i0, q) * w0 + N.getComponent(i1, q) * w1 + N.getComponent(i2, q) * w2);
        alb[k * 3 + q] = C.getComponent(i0, q) * w0 + C.getComponent(i1, q) * w1 + C.getComponent(i2, q) * w2;
        tan[k * 3 + q] = Tg.getComponent(q); bit[k * 3 + q] = Bt.getComponent(q);
      }
      for (let q = 0; q < 4; q++) pbr[k * 4 + q] = PB.getComponent(i0, q);
      edge[k] = E.getX(i0) * w0 + E.getX(i1) * w1 + E.getX(i2) * w2;
      bone[k] = SI.getX(i0);
    }
  }
  console.log(id, `rasterised in ${Date.now() - t0} ms, ${cov.reduce((s, v) => s + (v ? 1 : 0), 0)} texels covered, density ${model.texelDensity?.toFixed(0)} texels/m`);
  // Ambient occlusion: cosine rays against the weapon (casings excluded), at half resolution, then upsampled.
  const occl = new THREE.BufferGeometry(), keep: number[] = [];
  for (let t = 0; t < nt; t++) if (mode === 'hands' || SI.getX(ix[t * 3]) < WB.case0) keep.push(ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]);
  occl.setAttribute('position', P); occl.setIndex(keep);
  const bvh = new MeshBVH(occl), ray = new THREE.Ray(), RAYS = 40, RANGE = 0.05, H = S / 2;
  const aoH = new Float32Array(H * H).fill(1);
  const nn = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), o = new THREE.Vector3(), d = new THREE.Vector3();
  for (let y = 0; y < H; y++) for (let x = 0; x < H; x++) {
    const k = (y * 2) * S + x * 2;
    if (!cov[k]) continue;
    nn.set(nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]).normalize();
    t1.set(Math.abs(nn.x) < 0.9 ? 1 : 0, Math.abs(nn.x) < 0.9 ? 0 : 1, 0).cross(nn).normalize(); t2.crossVectors(nn, t1);
    o.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]).addScaledVector(nn, 0.0006);
    let open = 0;
    for (let i = 0; i < RAYS; i++) {
      const u = (i + hash(x, y, i)) / RAYS, phi = 2.39996 * i + hash(y, x, i) * 6.283, ct = Math.sqrt(1 - u), st = Math.sqrt(u);
      d.copy(t1).multiplyScalar(Math.cos(phi) * st).addScaledVector(t2, Math.sin(phi) * st).addScaledVector(nn, ct);
      ray.set(o, d);
      const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, RANGE);
      open += hit ? Math.min(1, hit.distance / RANGE) * 0.6 : 1;
    }
    aoH[y * H + x] = open / RAYS;
  }
  console.log(id, `occlusion in ${Date.now() - t0} ms`);
  const aoAt = (x: number, y: number) => { const fx = Math.min(H - 1, x / 2), fy = Math.min(H - 1, y / 2), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(H - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = fx - x0, ty = fy - y0; return (aoH[y0 * H + x0] * (1 - tx) + aoH[y0 * H + x1] * tx) * (1 - ty) + (aoH[y1 * H + x0] * (1 - tx) + aoH[y1 * H + x1] * tx) * ty; };
  // Height stamps (metres) by material and place, evaluated at the surface point.
  const height = (k: number) => {
    const x = pos[k * 3], y = pos[k * 3 + 1], z = pos[k * 3 + 2], pat = Math.round(pbr[k * 4 + 3]);
    if (mode === 'hands') return handHeight(x, y, z, pat, nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]);
    if (pat === PAT.polymer) {
      // Moulded pebble everywhere; aggressive stipple on the pistol grip and the magazine's ribs region.
      const grip = y < -0.11 && z > -0.04 && z < 0.06 && bone[k] === WB.root;
      const peb = fbm(x * 900, y * 900, z * 900, 2) * 0.00012;
      return peb + (grip ? sstep(0.4, 0.7, vnoise(x * 700, y * 700, z * 700)) * 0.0004 : 0);
    }
    if (pat === PAT.rubber) return Math.abs(Math.sin(y * 700)) * 0.0003 + vnoise(x * 1200, y * 1200, z * 1200) * 0.00008;
    if (pat === PAT.metal) {
      // Machining lines along the receiver (z), fine; a faint cast texture on coated parts.
      // Panel lines: a groove where the upper meets the handguard and around the receiver's flats.
      const groove = Math.exp(-Math.pow((z + 0.2375) / 0.0006, 2)) * -0.0005;
      return Math.sin(z * 2600 + vnoise(x * 300, y * 300, z * 30) * 3) * 0.000018 + fbm(x * 900, y * 900, z * 900, 2) * 0.00005 + groove;
    }
    return 0;
  };
  const hgt = new Float32Array(T);
  for (let k = 0; k < T; k++) if (cov[k]) hgt[k] = height(k);
  // Output images.
  const diff = Buffer.alloc(T * 4), nmap = Buffer.alloc(T * 4), arm = Buffer.alloc(T * 4);
  const lin2srgb = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)));
  const texel = 1 / (model.texelDensity ?? 1000);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, o4 = k * 4;
    if (!cov[k]) { diff.writeUInt32BE(0x404040ff, o4); nmap[o4] = 128; nmap[o4 + 1] = 128; nmap[o4 + 2] = 255; nmap[o4 + 3] = 255; arm[o4] = 255; arm[o4 + 1] = 200; arm[o4 + 2] = 0; arm[o4 + 3] = 255; continue; }
    const X = pos[k * 3], Y = pos[k * 3 + 1], Z = pos[k * 3 + 2], pat = Math.round(pbr[k * 4 + 3]);
    let r = alb[k * 3], g = alb[k * 3 + 1], bl = alb[k * 3 + 2], rough = pbr[k * 4], metal = pbr[k * 4 + 1];
    const wear = pbr[k * 4 + 2], ao = Math.min(1, aoAt(x, y)), cav = 1 - ao;
    // Normal from the height stamps (central differences in texel space).
    const hx = (x + 1 < S && cov[k + 1] ? hgt[k + 1] : hgt[k]) - (x > 0 && cov[k - 1] ? hgt[k - 1] : hgt[k]);
    const hy = (y + 1 < S && cov[k + S] ? hgt[k + S] : hgt[k]) - (y > 0 && cov[k - S] ? hgt[k - S] : hgt[k]);
    let nx = -hx / (2 * texel), ny = -hy / (2 * texel), nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    nmap[o4] = Math.round((nx * 0.5 + 0.5) * 255); nmap[o4 + 1] = Math.round((ny * 0.5 + 0.5) * 255); nmap[o4 + 2] = Math.round((nz * 0.5 + 0.5) * 255); nmap[o4 + 3] = 255;
    if (mode === 'hands') {
      // A detail map multiplied with the vertex colours (glove, sleeve, squad band): shading only.
      let v = 0.9 + 0.08 * (fbm(X * 160, Y * 160, Z * 160, 3) - 0.5);
      // Seams where the colour changes (panel borders): a dark groove line.
      let seam = 0;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
        const kk = (y + dy) * S + (x + dx);
        if (x + dx < 0 || y + dy < 0 || x + dx >= S || y + dy >= S || !cov[kk]) continue;
        seam = Math.max(seam, Math.abs(alb[kk * 3] - alb[k * 3]) + Math.abs(alb[kk * 3 + 1] - alb[k * 3 + 1]) + Math.abs(alb[kk * 3 + 2] - alb[k * 3 + 2]));
      }
      v *= 1 - Math.min(0.45, seam * 3);
      v *= 1 - 0.5 * crease(X, Y, Z);
      v *= 1 - cav * 0.6;
      const lin = Math.min(1, Math.max(0.05, v));
      diff[o4] = diff[o4 + 1] = diff[o4 + 2] = lin2srgb(lin); diff[o4 + 3] = 255;
      arm[o4] = Math.round(255 * Math.min(1, 0.35 + ao * 0.65)); arm[o4 + 1] = Math.round(255 * Math.min(1, rough + 0.05 * (fine0(X, Y, Z) - 0.5))); arm[o4 + 2] = 0; arm[o4 + 3] = 255;
      continue;
    }
    // Layers.
    const big = fbm(X * 25, Y * 25, Z * 25, 3), mid = fbm(X * 140, Y * 140, Z * 140, 3), fine = vnoise(X * 900, Y * 900, Z * 900);
    const isMetal = pat === PAT.metal, isPoly = pat === PAT.polymer, isRubber = pat === PAT.rubber, isGlow = pat === PAT.emissive;
    // Handling polish: grip, magazine well, charging handle, selector, the front of the handguard.
    const polish = (bone[k] === WB.root && Y < -0.1 && Z > -0.03 && Z < 0.05 ? 1 : 0) * 0.6 + (bone[k] === WB.handle ? 0.7 : 0) + (Y < -0.09 && Z < -0.08 && Z > -0.17 ? 0.35 : 0) + (Z < -0.3 && Z > -0.5 && Y < -0.08 ? 0.3 : 0);
    // Scratches along the slide direction (z), mostly on the lower half and the magazine.
    const scr = Math.max(0, vnoise(X * 1200, Y * 1200, Z * 40) - 0.82) / 0.18 * sstep(0.4, 0.7, big);
    const edgeW = sstep(0.08, 0.42, edge[k] * wear * (0.7 + mid) + scr * 0.6 * wear);
    if (isGlow) { /* keep */ }
    else if (isMetal) {
      const tint = 0.82 + 0.3 * big + 0.08 * (fine - 0.5);
      r *= tint; g *= tint; bl *= tint * 1.01;
      // Bare aluminium or steel showing through on edges and scratches.
      const bare = [0.42, 0.43, 0.45];
      r += (bare[0] - r) * edgeW; g += (bare[1] - g) * edgeW; bl += (bare[2] - bl) * edgeW;
      metal += (1 - metal) * edgeW; rough = rough * (0.85 + 0.3 * mid) - polish * 0.18 - edgeW * 0.3 + scr * 0.12;
    } else if (isPoly) {
      const tint = 0.92 + 0.1 * big;
      r *= tint; g *= tint; bl *= tint;
      // Scuffs whiten edges; polish darkens and sheens the grip.
      const scuff = sstep(0.3, 0.85, edge[k] * wear * (0.4 + mid));
      r += scuff * 0.06; g += scuff * 0.06; bl += scuff * 0.06;
      rough = rough * (0.9 + 0.2 * mid) - polish * 0.25 - scuff * 0.1;
    } else if (isRubber) { rough = 0.9 + 0.08 * mid; }
    // Dust and oil in cavities.
    const dust = cav * sstep(0.35, 0.65, mid);
    r = r * (1 - cav * 0.55) + 0.11 * dust * 0.5; g = g * (1 - cav * 0.55) + 0.1 * dust * 0.5; bl = bl * (1 - cav * 0.55) + 0.08 * dust * 0.5;
    rough = Math.min(1, Math.max(0.12, rough + dust * 0.3));
    diff[o4] = lin2srgb(r); diff[o4 + 1] = lin2srgb(g); diff[o4 + 2] = lin2srgb(bl); diff[o4 + 3] = 255;
    arm[o4] = Math.round(255 * Math.min(1, 0.35 + ao * 0.65)); arm[o4 + 1] = Math.round(255 * rough); arm[o4 + 2] = Math.round(255 * Math.min(1, Math.max(0, metal))); arm[o4 + 3] = 255;
  }
  // Dilate into the padding so mips and filtering never pull in the gutter colour.
  for (const img of [diff, nmap, arm]) dilate(img, cov, S, 6);
  console.log(id, `painted in ${Date.now() - t0} ms`);
  const out = join(ROOT, 'public/game-art/breachline/hero', id), cache = join(ROOT, '.cache/hero', id);
  await mkdir(out, { recursive: true }); await mkdir(cache, { recursive: true });
  const SETTINGS = {
    diff: { isUASTC: false, qualityLevel: 160, compressionLevel: 2, isSetKTX2SRGBTransferFunc: true, isPerceptual: true },
    nor: { isUASTC: true, isNormalMap: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 1.5, needSupercompression: true },
    arm: { isUASTC: true, isPerceptual: false, uastcLDRQualityLevel: 1, enableRDO: true, rdoQualityLevel: 3, needSupercompression: true },
  } as const;
  const imageDecoder = async (buf: Uint8Array) => { const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { width: info.width, height: info.height, data: new Uint8Array(data) }; };
  for (const [kind, img] of [['diff', diff], ['nor', nmap], ['arm', arm]] as const) {
    const master = await sharp(img, { raw: { width: S, height: S, channels: 4 } }).png().toBuffer();
    await writeFile(join(cache, `${kind}-${S}.png`), master);
    for (const size of sizes) {
      const png = size === S ? master : await sharp(master).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
      const key = createHash('sha256').update(png).update(kind).digest('hex').slice(0, 20), cached = join(cache, `${kind}-${size}-${key}.ktx2`);
      let ktx: Buffer;
      try { await stat(cached); ktx = await readFile(cached); } catch {
        const log = console.log; console.log = () => {};
        try { ktx = Buffer.from(await encodeToKTX2(new Uint8Array(png), { ...SETTINGS[kind], generateMipmap: true, isKTX2File: true, imageDecoder } as never)); } finally { console.log = log; }
        await writeFile(cached, ktx);
      }
      await writeFile(join(out, `${kind}-${size}.ktx2`), ktx);
    }
    await sharp(master).resize(512, 512).jpeg({ quality: 88 }).toFile(join(out, `${kind}-512.jpg`));
    if (PREVIEW) await sharp(master).resize(Math.min(1024, S), Math.min(1024, S)).png({ palette: true, colours: 200 }).toFile(join(cache, `preview-${kind}.png`));
  }
  console.log(id, `written in ${Date.now() - t0} ms`);
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

// ---- Hands: crease lines at the finger joints, seams, weave and pebble -------------------------------------------
const WRIST = -(UPPER + FORE);
const joints: { p: THREE.Vector3; d: THREE.Vector3; r: number }[] = [];
for (let dg = 0; dg < 5; dg++) {
  const h = HAND[dg], dir = new THREE.Vector3(0, 0, -1).applyQuaternion(digitRest(dg));
  let p = new THREE.Vector3(h.base[0], h.base[1], h.base[2] + WRIST);
  for (let s = 0; s < 3; s++) { joints.push({ p: p.clone(), d: dir.clone(), r: h.rad[s] * 1.5 }); p = p.clone().addScaledVector(dir, h.len[s]); }
}
const tmpV = new THREE.Vector3();
/** 0..1: how close a point is to a finger joint's crease line (a narrow band across the finger at each joint). */
function crease(x: number, y: number, z: number) {
  let c = 0;
  for (const j of joints) {
    tmpV.set(x, y, z).sub(j.p);
    const along = tmpV.dot(j.d), across = tmpV.addScaledVector(j.d, -along).length();
    if (across > j.r) continue;
    c = Math.max(c, Math.exp(-Math.pow(along / 0.0011, 2)) * 0.9, Math.exp(-Math.pow((along - 0.0035) / 0.0008, 2)) * 0.45);
  }
  return c;
}
const fine0 = (x: number, y: number, z: number) => vnoise(x * 900, y * 900, z * 900);
function handHeight(x: number, y: number, z: number, pat: number, _nx: number, ny: number, _nz: number) {
  const cr = -crease(x, y, z) * 0.0006;
  if (pat === PAT.fabric) {
    // Ripstop weave and a seam down the underside of the sleeve.
    const weave = (Math.sin(x * 4200) * Math.sin(z * 4200) + Math.sin(y * 4200) * Math.sin(z * 4200)) * 0.000025;
    const seam = ny < -0.85 && Math.abs(x) < 0.004 ? -0.0004 : 0;
    return weave + seam + fbm(x * 200, y * 200, z * 200, 2) * 0.0002;
  }
  if (pat === PAT.leather) return cr + fbm(x * 1400, y * 1400, z * 1400, 2) * 0.00006;
  if (pat === PAT.rubber) return cr + Math.abs(Math.sin(z * 900)) * 0.00015;
  return cr;
}

for (const id of ids.length ? ids : ['ar']) {
  if (id === 'hands') {
    await heroReady;
    const u = rightArm(DEFAULT_LOOK(0, 0x3d8bf2));
    await bake('hands', u.geo, u.density, 1024, 'hands', [1024]);
  } else {
    const model = weaponModel(id as WeaponId, 0);
    await bake(id, model.geo, model.texelDensity ?? 1000, SIZE, 'weapon', [2048, 1024]);
  }
}
