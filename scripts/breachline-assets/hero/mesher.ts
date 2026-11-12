/** Narrow-band surface nets for the sculpt kit's fields (mm). A coarse pass (every 4th grid point) finds where the
 * surface can be; only fine points near it are evaluated exactly, the rest take the coarse value's sign. Vertices are
 * projected onto the surface along the field gradient (kept inside their cell's neighbourhood) and given the gradient
 * as their normal. Returns an indexed triangle mesh, outward facing. */
import type { Box, Fn } from '../../../src/games/breachline/render/hero/sculpt/sdf';

export interface RawMesh { pos: Float32Array; nor: Float32Array; idx: Uint32Array }

export function meshField(f: Fn, b: Box, h: number): RawMesh {
  // Offset by odd fractions of a cell so flat faces never lie exactly on a grid plane (exact zeros pinch the mesh).
  const ox = b[0] - 1.913 * h, oy = b[1] - 1.871 * h, oz = b[2] - 1.937 * h;
  const nx = Math.ceil((b[3] - b[0]) / h) + 5, ny = Math.ceil((b[4] - b[1]) / h) + 5, nz = Math.ceil((b[5] - b[2]) / h) + 5;
  // Coarse grid every 4 points.
  const cx = Math.ceil(nx / 4) + 1, cy = Math.ceil(ny / 4) + 1, cz = Math.ceil(nz / 4) + 1, C = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) C[(k * cy + j) * cx + i] = f(ox + i * 4 * h, oy + j * 4 * h, oz + k * 4 * h);
  const near = 4 * h;
  const slice = (k: number, out: Float32Array) => {
    const kk = Math.min(cz - 1, Math.round(k / 4)), z = oz + k * h;
    for (let j = 0; j < ny; j++) {
      const jj = Math.min(cy - 1, Math.round(j / 4)), y = oy + j * h;
      for (let i = 0; i < nx; i++) {
        const c = C[(kk * cy + jj) * cx + Math.min(cx - 1, Math.round(i / 4))];
        out[j * nx + i] = Math.abs(c) > near ? c : f(ox + i * h, y, z);
      }
    }
  };
  let s0 = new Float32Array(nx * ny), s1 = new Float32Array(nx * ny);
  let vPrev = new Int32Array(nx * ny).fill(-1), vCur = new Int32Array(nx * ny).fill(-1);
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  const e = h * 0.2, g = [0, 0, 0];
  const gradAt = (x: number, y: number, z: number) => { g[0] = f(x + e, y, z) - f(x - e, y, z); g[1] = f(x, y + e, z) - f(x, y - e, z); g[2] = f(x, y, z + e) - f(x, y, z - e); };
  const corner = new Float64Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cxo = [0, 1, 0, 1, 0, 1, 0, 1], cyo = [0, 0, 1, 1, 0, 0, 1, 1], czo = [0, 0, 0, 0, 1, 1, 1, 1];
  const quad = (a: number, b2: number, c: number, d: number) => {
    // Split along the shorter diagonal.
    const dac = (pos[a * 3] - pos[c * 3]) ** 2 + (pos[a * 3 + 1] - pos[c * 3 + 1]) ** 2 + (pos[a * 3 + 2] - pos[c * 3 + 2]) ** 2;
    const dbd = (pos[b2 * 3] - pos[d * 3]) ** 2 + (pos[b2 * 3 + 1] - pos[d * 3 + 1]) ** 2 + (pos[b2 * 3 + 2] - pos[d * 3 + 2]) ** 2;
    if (dac <= dbd) idx.push(a, b2, c, a, c, d); else idx.push(a, b2, d, b2, c, d);
  };
  slice(0, s0);
  for (let k = 0; k < nz - 1; k++) {
    slice(k + 1, s1);
    vCur.fill(-1);
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) {
        const v = (czo[c] ? s1 : s0)[(j + cyo[c]) * nx + i + cxo[c]];
        corner[c] = v; if (v < 0) mask |= 1 << c;
      }
      if (mask === 0 || mask === 255) continue;
      // Vertex: mean of the edge crossings, then projected onto the surface.
      let px = 0, py = 0, pz = 0, cnt = 0;
      for (const [a, c] of EDGES) {
        const va = corner[a], vc = corner[c];
        if ((va < 0) === (vc < 0)) continue;
        const t = va / (va - vc);
        px += cxo[a] + (cxo[c] - cxo[a]) * t; py += cyo[a] + (cyo[c] - cyo[a]) * t; pz += czo[a] + (czo[c] - czo[a]) * t; cnt++;
      }
      let x = ox + (i + px / cnt) * h, y = oy + (j + py / cnt) * h, z = oz + (k + pz / cnt) * h;
      const x0 = ox + (i - 0.6) * h, x1 = ox + (i + 1.6) * h, y0 = oy + (j - 0.6) * h, y1 = oy + (j + 1.6) * h, z0 = oz + (k - 0.6) * h, z1 = oz + (k + 1.6) * h;
      for (let it = 0; it < 3; it++) {
        const d = f(x, y, z); gradAt(x, y, z);
        const gl = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
        if (gl < 1e-20) break;
        const sc = d * 2 * e / gl;
        x = Math.min(x1, Math.max(x0, x - g[0] * sc)); y = Math.min(y1, Math.max(y0, y - g[1] * sc)); z = Math.min(z1, Math.max(z0, z - g[2] * sc));
        if (Math.abs(d) < h * 0.01) break;
      }
      gradAt(x, y, z);
      const gl = Math.hypot(g[0], g[1], g[2]) || 1;
      const vi = pos.length / 3;
      pos.push(x, y, z); nor.push(g[0] / gl, g[1] / gl, g[2] / gl);
      vCur[j * nx + i] = vi;
      // Faces for the three edges leaving corner 0 of this cell.
      const inside = corner[0] < 0;
      if (j > 0 && k > 0 && (corner[0] < 0) !== (corner[1] < 0)) {
        const a = vPrev[(j - 1) * nx + i], b2 = vPrev[j * nx + i], c = vCur[j * nx + i], d = vCur[(j - 1) * nx + i];
        if (a >= 0 && b2 >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b2, c, d); else quad(a, d, c, b2); }
      }
      if (i > 0 && k > 0 && (corner[0] < 0) !== (corner[2] < 0)) {
        const a = vPrev[j * nx + i - 1], b2 = vCur[j * nx + i - 1], c = vCur[j * nx + i], d = vPrev[j * nx + i];
        if (a >= 0 && b2 >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b2, c, d); else quad(a, d, c, b2); }
      }
      if (i > 0 && j > 0 && (corner[0] < 0) !== (corner[4] < 0)) {
        const a = vCur[(j - 1) * nx + i - 1], b2 = vCur[(j - 1) * nx + i], c = vCur[j * nx + i], d = vCur[j * nx + i - 1];
        if (a >= 0 && b2 >= 0 && c >= 0 && d >= 0) { if (inside) quad(a, b2, c, d); else quad(a, d, c, b2); }
      }
    }
    [s0, s1] = [s1, s0]; [vPrev, vCur] = [vCur, vPrev];
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}
