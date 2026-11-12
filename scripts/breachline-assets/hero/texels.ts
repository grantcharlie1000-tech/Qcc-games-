/** Texel helpers shared by the weapon and glove bakes: rasterising a mesh's UVs into texel records (position in mm,
 * normal, part, tangent frame), encoding a normal for the shader's derivative tangent frame, value noise, colour
 * conversions and dilation. */
import type { MeshArrays } from '../../../src/games/breachline/render/hero/meshbin';

export const hash = (x: number, y: number, z: number) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz), l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), sx), l(c(0, 1, 0), c(1, 1, 0), sx), sy), l(l(c(0, 0, 1), c(1, 0, 1), sx), l(c(0, 1, 1), c(1, 1, 1), sx), sy), sz);
}
export const fbm = (x: number, y: number, z: number, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1, z * f + i * 3.7); f *= 2.03; a *= 0.5; } return s; };
export const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lin = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map(c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }) as [number, number, number];
export const srgb8 = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));

export function dilate(img: Buffer, cov: Uint8Array, S: number, passes: number) {
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

export const STRIDE = 13;
/** Rasterises the mesh's UVs at S x S. Per covered texel: position (mm, y shifted by `yOff`), normal, part, one-texel
 * steps along u and v (mm) in `rec` (STRIDE floats), and the shader's tangent and bitangent in `tan` (6 floats). */
export function texelFrames(m: MeshArrays & { part: Uint8Array }, S: number, yOff = 0) {
  const P = m.pos, N = m.nor, UV = m.uv, ix = m.idx, nt = ix.length / 3;
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
  const n = list.length, rec = new Float32Array(n * STRIDE), tan = new Float32Array(n * 6);
  for (let j = 0; j < n; j++) {
    const k = list[j], t = tid[k], i0 = ix[t * 3], i1 = ix[t * 3 + 1], i2 = ix[t * 3 + 2];
    let a = Math.max(0, w0a[k]), b = Math.max(0, w1a[k]), c = Math.max(0, 1 - w0a[k] - w1a[k]); const ws = a + b + c; a /= ws; b /= ws; c /= ws;
    const o = j * STRIDE, pv = (q: number) => P[i0 * 3 + q] * a + P[i1 * 3 + q] * b + P[i2 * 3 + q] * c;
    rec[o] = pv(0) * 1000; rec[o + 1] = pv(1) * 1000 + yOff; rec[o + 2] = pv(2) * 1000;
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
  // The triangle and barycentric weights behind each texel.
  const tri = new Int32Array(n), bary = new Float32Array(n * 2);
  for (let j = 0; j < n; j++) { tri[j] = tid[list[j]]; bary[j * 2] = w0a[list[j]]; bary[j * 2 + 1] = w1a[list[j]]; }
  return { list, n, rec, tan, tri, bary };
}

/** Tangent-space normal bytes for the shader's frame [T B N]: solve, normalise, keep it in front. */
export function encodeNormal(T: number[], B: number[], Nn: number[], hn: number[], out: Buffer, k: number) {
  const det3 = T[0] * (B[1] * Nn[2] - B[2] * Nn[1]) - B[0] * (T[1] * Nn[2] - T[2] * Nn[1]) + Nn[0] * (T[1] * B[2] - T[2] * B[1]);
  let a = 0, bb = 0, c = 1;
  if (Math.abs(det3) > 1e-6) {
    a = (hn[0] * (B[1] * Nn[2] - B[2] * Nn[1]) - B[0] * (hn[1] * Nn[2] - hn[2] * Nn[1]) + Nn[0] * (hn[1] * B[2] - hn[2] * B[1])) / det3;
    bb = (T[0] * (hn[1] * Nn[2] - hn[2] * Nn[1]) - hn[0] * (T[1] * Nn[2] - T[2] * Nn[1]) + Nn[0] * (T[1] * hn[2] - T[2] * hn[1])) / det3;
    c = (T[0] * (B[1] * hn[2] - B[2] * hn[1]) - B[0] * (T[1] * hn[2] - T[2] * hn[1]) + hn[0] * (T[1] * B[2] - T[2] * B[1])) / det3;
  }
  if (c < 0.08) c = 0.08;
  const l = Math.hypot(a, bb, c); a /= l; bb /= l; c /= l;
  out[k * 4] = Math.round((a * 0.5 + 0.5) * 255); out[k * 4 + 1] = Math.round((bb * 0.5 + 0.5) * 255); out[k * 4 + 2] = Math.round((c * 0.5 + 0.5) * 255); out[k * 4 + 3] = 255;
}
