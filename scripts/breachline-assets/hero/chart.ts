/** Unwrap for the baked weapons' game meshes. Each triangle takes the dominant axis of its face normal; triangles of
 * the same part and axis that share an edge (by position, since crease splits duplicate vertices) form a chart,
 * projected flat along that axis. Charts are packed into one square atlas by shelves at the largest density that
 * fits, weighted toward what the player sees (the left side, the top and the rear) and toward the parts nearest the
 * camera. Vertices are split along chart borders. */
import type { MeshArrays } from '../../../src/games/breachline/render/hero/meshbin';

export interface ChartOptions { size: number; pad: number; axisWeight: readonly number[]; partWeight: (part: number) => number }

export function chartUnwrap(m: MeshArrays & { part: Uint8Array }, o: ChartOptions): { mesh: MeshArrays & { part: Uint8Array }; src: Uint32Array; density: number; charts: number; coverage: number } {
  const P = m.pos, ix = m.idx, nt = ix.length / 3;
  const axis = new Uint8Array(nt), area = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    area[t] = Math.hypot(nx, ny, nz) / 2;
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
    axis[t] = ax >= ay && ax >= az ? (nx >= 0 ? 0 : 1) : ay >= az ? (ny >= 0 ? 2 : 3) : (nz >= 0 ? 4 : 5);
  }
  // Position keys for edge adjacency across crease-split vertices.
  const key = new Int32Array(P.length / 3), keys = new Map<string, number>();
  for (let v = 0; v < key.length; v++) { const k = `${Math.round(P[v * 3] * 1e6)},${Math.round(P[v * 3 + 1] * 1e6)},${Math.round(P[v * 3 + 2] * 1e6)}`; let id = keys.get(k); if (id === undefined) { id = keys.size; keys.set(k, id); } key[v] = id; }
  const edgeTris = new Map<number, number[]>();
  const ek = (a: number, b: number) => (a < b ? a * 4194304 + b : b * 4194304 + a);
  for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) { const e = ek(key[ix[t * 3 + k]], key[ix[t * 3 + (k + 1) % 3]]); const l = edgeTris.get(e); if (l) l.push(t); else edgeTris.set(e, [t]); }
  // Connected components of same part and axis.
  const chart = new Int32Array(nt).fill(-1); let nc = 0;
  const stack: number[] = [];
  for (let s = 0; s < nt; s++) {
    if (chart[s] >= 0) continue;
    chart[s] = nc; stack.push(s);
    while (stack.length) {
      const t = stack.pop()!;
      for (let k = 0; k < 3; k++) for (const u of edgeTris.get(ek(key[ix[t * 3 + k]], key[ix[t * 3 + (k + 1) % 3]]))!) {
        if (chart[u] < 0 && axis[u] === axis[t] && m.part[ix[u * 3]] === m.part[ix[t * 3]]) { chart[u] = nc; stack.push(u); }
      }
    }
    nc++;
  }
  const proj = (ax: number, x: number, y: number, z: number): [number, number] =>
    ax === 0 ? [-z, y] : ax === 1 ? [z, y] : ax === 2 ? [x, -z] : ax === 3 ? [x, z] : ax === 4 ? [x, y] : [-x, y];
  interface Isl { tris: number[]; ax: number; u0: number; v0: number; w: number; h: number; x: number; y: number; k: number; rot: boolean }
  const isl: Isl[] = Array.from({ length: nc }, () => ({ tris: [], ax: 0, u0: 1e9, v0: 1e9, w: 0, h: 0, x: 0, y: 0, k: 1, rot: false }));
  for (let t = 0; t < nt; t++) isl[chart[t]].tris.push(t);
  let total = 0;
  for (const I of isl) {
    I.ax = axis[I.tris[0]];
    let u1 = -1e9, v1 = -1e9;
    for (const t of I.tris) for (let k = 0; k < 3; k++) { const v = ix[t * 3 + k], [u, w] = proj(I.ax, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); I.u0 = Math.min(I.u0, u); I.v0 = Math.min(I.v0, w); u1 = Math.max(u1, u); v1 = Math.max(v1, w); }
    const w = Math.max(1e-5, u1 - I.u0), h = Math.max(1e-5, v1 - I.v0);
    I.rot = h > w; I.w = I.rot ? h : w; I.h = I.rot ? w : h;
    I.k = o.axisWeight[I.ax] * o.partWeight(m.part[ix[I.tris[0] * 3]]);
    for (const t of I.tris) total += area[t];
  }
  const order = [...isl].sort((p, q) => q.h * q.k - p.h * p.k || q.w * q.k - p.w * p.k);
  const pack = (d: number): boolean => {
    let x = 0, y = 0, row = 0;
    for (const I of order) {
      const w = Math.ceil(I.w * d * I.k) + o.pad * 2, h = Math.ceil(I.h * d * I.k) + o.pad * 2;
      if (w > o.size) return false;
      if (x + w > o.size) { x = 0; y += row; row = 0; }
      I.x = x + o.pad; I.y = y + o.pad; x += w; row = Math.max(row, h);
      if (y + row > o.size) return false;
    }
    return true;
  };
  let lo = 10, hi = 100000;
  for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (pack(mid)) lo = mid; else hi = mid; }
  pack(lo);
  // Rebuild, splitting vertices per chart.
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], bone: number[] = [], flags: number[] = [], part: number[] = [], idx: number[] = [], src: number[] = [];
  let covered = 0;
  for (const I of isl) {
    const map = new Map<number, number>();
    for (const t of I.tris) for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k];
      let n = map.get(v);
      if (n === undefined) {
        n = pos.length / 3; map.set(v, n);
        pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(m.nor[v * 3], m.nor[v * 3 + 1], m.nor[v * 3 + 2]);
        bone.push(m.bone[v]); flags.push(m.flags[v]); part.push(m.part[v]); src.push(v);
        const [u, w] = proj(I.ax, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), du = (u - I.u0) * lo * I.k, dv = (w - I.v0) * lo * I.k;
        uv.push((I.x + (I.rot ? dv : du)) / o.size, (I.y + (I.rot ? du : dv)) / o.size);
      }
      idx.push(n);
    }
    for (const t of I.tris) covered += area[t] * (lo * I.k) ** 2;
  }
  return {
    mesh: { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv), bone: Uint8Array.from(bone), flags: Uint8Array.from(flags), part: Uint8Array.from(part), idx: Uint32Array.from(idx) },
    src: Uint32Array.from(src), density: lo, charts: nc, coverage: covered / (o.size * o.size),
  };
}
