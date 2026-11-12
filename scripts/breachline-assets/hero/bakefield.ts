#!/usr/bin/env -S npx vite-node
/** One slice of a weapon's field bake (run by sculpt.ts, four at a time).
 *   npx vite-node scripts/breachline-assets/hero/bakefield.ts <id> <slice> <slices>
 * Reads .cache/hero-bake/<id>-texels.bin (per covered texel: position mm, normal, part, one-texel steps along u and
 * v), and for texels t with t % slices == slice writes [normal x, y, z (high detail, world), occlusion, curvature at
 * 0.35 mm, curvature at 1.5 mm, distance from the low mesh to the high surface] to .cache/hero-bake/<id>-out-<slice>.bin. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { haldenParts } from '../../../src/games/breachline/render/hero/sculpt/halden12';
import { TERN } from '../../../src/games/breachline/render/hero/sculpt/designs';
import { ar5Parts } from '../../../src/games/breachline/render/hero/sculpt/ar5';
import type { Fn } from '../../../src/games/breachline/render/hero/sculpt/sdf';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const [id, sliceS, slicesS] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const slice = Number(sliceS), slices = Number(slicesS);
const PARTS: Record<string, (hi: boolean) => { f: Fn; bone: number }[]> = {
  ar5: hi => ar5Parts(hi).map(p => ({ f: p.s.f, bone: p.bone })),
  halden12: hi => haldenParts(hi).map(p => ({ f: p.s.f, bone: p.bone })),
  tern: hi => ar5Parts(hi, TERN).map(p => ({ f: p.s.f, bone: p.bone })),
};

const buf = await readFile(join(ROOT, '.cache/hero-bake', `${id}-texels.bin`));
const T = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4), STRIDE = 13, n = T.length / STRIDE;
const hi = PARTS[id](true), lo = PARTS[id](false);
// Occlusion: everything at rest except the casings (lo detail is enough at this scale).
// Occlusion from the weapon at rest: not the loading shell (aux) or the spent cases.
const occl = lo.filter(p => p.bone < 5).map(p => p.f), no = occl.length;
const F = (x: number, y: number, z: number) => { let d = 1e9; for (let i = 0; i < no; i++) { const v = occl[i](x, y, z); if (v < d) d = v; } return d; };
// Fixed ray set: cosine-weighted, rotated per texel.
const RAYS = 14, ray: number[][] = [];
for (let i = 0; i < RAYS; i++) { const u = (i + 0.5) / RAYS, a = i * 2.39996323; const r = Math.sqrt(u); ray.push([Math.cos(a) * r, Math.sin(a) * r, Math.sqrt(1 - u)]); }
const out = new Float32Array(Math.ceil((n - slice) / slices) * 7);
const g = [0, 0, 0];
const grad = (f: Fn, x: number, y: number, z: number, e: number) => { g[0] = f(x + e, y, z) - f(x - e, y, z); g[1] = f(x, y + e, z) - f(x, y - e, z); g[2] = f(x, y, z + e) - f(x, y, z - e); const l = Math.hypot(g[0], g[1], g[2]) || 1; g[0] /= l; g[1] /= l; g[2] /= l; };
const t0 = Date.now();
let k = 0;
for (let t = slice; t < n; t += slices, k++) {
  const o = t * STRIDE, px = T[o], py = T[o + 1], pz = T[o + 2], nx = T[o + 3], ny = T[o + 4], nz = T[o + 5], part = T[o + 6];
  const f = hi[part]?.f;
  let ax = 0, ay = 0, az = 0, qx = px, qy = py, qz = pz, dist = 0;
  if (f) {
    // Four sub-texel samples, each found along the low mesh's normal (a cage of 2 mm out, 4 mm in).
    for (let s = 0; s < 4; s++) {
      const su = (s & 1 ? 0.25 : -0.25), sv = (s & 2 ? 0.25 : -0.25);
      const sx = px + T[o + 7] * su + T[o + 10] * sv, sy = py + T[o + 8] * su + T[o + 11] * sv, sz = pz + T[o + 9] * su + T[o + 12] * sv;
      let h = -2, hit = false;
      let d0 = f(sx - nx * h, sy - ny * h, sz - nz * h);
      if (d0 > 0) {
        for (let i = 0; i < 40 && h < 4; i++) { const d = f(sx - nx * h, sy - ny * h, sz - nz * h); if (d < 0.004) { hit = true; break; } h += Math.max(d, 0.01); }
      } else {
        // Started inside: step outward to the surface.
        for (let i = 0; i < 40 && h > -6; i++) { const d = f(sx - nx * h, sy - ny * h, sz - nz * h); if (d > -0.004) { hit = true; break; } h += d; d0 = d; }
      }
      let x = sx - nx * h, y = sy - ny * h, z = sz - nz * h;
      if (!hit) { for (let it = 0; it < 4; it++) { const d = f(x, y, z); grad(f, x, y, z, 0.03); x -= g[0] * d; y -= g[1] * d; z -= g[2] * d; } }
      grad(f, x, y, z, 0.04);
      ax += g[0]; ay += g[1]; az += g[2];
      if (s === 0) { qx = x; qy = y; qz = z; dist = h; }
    }
  } else { ax = nx; ay = ny; az = nz; }
  const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
  // Occlusion from the surface point along the high-detail normal.
  let occ = 0;
  if (f) {
    // Basis around the normal, rotated per texel.
    const rot = (t * 0.6180339887) % 1 * Math.PI * 2, cr = Math.cos(rot), sr = Math.sin(rot);
    let bx = Math.abs(ax) < 0.9 ? 1 : 0, by = bx ? 0 : 1, bz = 0;
    const dd = bx * ax + by * ay + bz * az; bx -= ax * dd; by -= ay * dd; bz -= az * dd; const bl = Math.hypot(bx, by, bz); bx /= bl; by /= bl; bz /= bl;
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    const ox = qx + ax * 0.2, oy = qy + ay * 0.2, oz = qz + az * 0.2;
    for (const [r0, r1, r2] of ray) {
      const u = r0 * cr - r1 * sr, v = r0 * sr + r1 * cr;
      const dx = bx * u + cx * v + ax * r2, dy = by * u + cy * v + ay * r2, dz = bz * u + cz * v + az * r2;
      let h = 0.3;
      for (let i = 0; i < 26; i++) {
        const d = F(ox + dx * h, oy + dy * h, oz + dz * h);
        if (d < 0.06) { occ += 1 - Math.min(1, h / 32) * 0.6; break; }
        h += Math.max(d, 0.25);
        if (h > 32) break;
      }
    }
    occ /= RAYS;
  }
  // Curvature: the field's Laplacian at two scales (positive on convex edges).
  let c1 = 0, c2 = 0;
  if (f) {
    const f0 = f(qx, qy, qz);
    for (const [e, w] of [[0.35, 1], [1.5, 2]] as const) {
      const L = (f(qx + e, qy, qz) + f(qx - e, qy, qz) + f(qx, qy + e, qz) + f(qx, qy - e, qz) + f(qx, qy, qz + e) + f(qx, qy, qz - e) - 6 * f0) / (e * e);
      if (w === 1) c1 = L; else c2 = L;
    }
  }
  out.set([ax, ay, az, 1 - occ, c1, c2, dist], k * 7);
  if (slice === 0 && k % 50000 === 0) console.log(`  slice 0: ${k} / ${Math.ceil(n / slices)} texels, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await writeFile(join(ROOT, '.cache/hero-bake', `${id}-out-${slice}.bin`), Buffer.from(out.buffer));
