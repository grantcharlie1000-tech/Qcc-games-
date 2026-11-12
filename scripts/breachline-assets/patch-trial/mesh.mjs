// Mesh surgery for the Patch trial: plane cuts with capped openings, and helpers. A mesh is
// { pos: Float32Array(3n), nrm: Float32Array(3n), uv: Float32Array(2n), idx: Uint32Array }.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const V = { sub, dot, cross, norm };

class Builder {
  constructor(m) { this.pos = Array.from(m.pos); this.nrm = Array.from(m.nrm); this.uv = Array.from(m.uv); this.idx = []; }
  get count() { return this.pos.length / 3; }
  add(p, n, t) { this.pos.push(...p); this.nrm.push(...n); this.uv.push(...t); return this.count - 1; }
  P(i) { return [this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]]; }
  N(i) { return [this.nrm[i * 3], this.nrm[i * 3 + 1], this.nrm[i * 3 + 2]]; }
  T(i) { return [this.uv[i * 2], this.uv[i * 2 + 1]]; }
  done() { return compact({ pos: new Float32Array(this.pos), nrm: new Float32Array(this.nrm), uv: new Float32Array(this.uv), idx: new Uint32Array(this.idx) }); }
}

/** Drops unreferenced vertices. Extra per-vertex arrays in `m.extra` (name -> [array, width]) follow along. */
export function compact(m) {
  const n = m.pos.length / 3, map = new Int32Array(n).fill(-1); let k = 0;
  for (const i of m.idx) if (map[i] < 0) map[i] = k++;
  const out = { pos: new Float32Array(k * 3), nrm: new Float32Array(k * 3), uv: new Float32Array(k * 2), idx: new Uint32Array(m.idx.length), extra: {} };
  for (const [name, [arr, w]] of Object.entries(m.extra ?? {})) out.extra[name] = [new arr.constructor(k * w), w];
  for (let i = 0; i < n; i++) { const j = map[i]; if (j < 0) continue;
    out.pos.set(m.pos.subarray(i * 3, i * 3 + 3), j * 3); out.nrm.set(m.nrm.subarray(i * 3, i * 3 + 3), j * 3); out.uv.set(m.uv.subarray(i * 2, i * 2 + 2), j * 2);
    for (const [name, [arr, w]] of Object.entries(m.extra ?? {})) out.extra[name][0].set(arr.subarray(i * w, i * w + w), j * w);
  }
  for (let t = 0; t < m.idx.length; t++) out.idx[t] = map[m.idx[t]];
  if (!m.extra) delete out.extra;
  return out;
}

/** Cuts away the part of the mesh on the +n side of the plane through p, limited to triangles for which
 * `region(centroid)` is true, and caps every opening the cut leaves with a fan (normal +n, uv `capUv`).
 * Returns { mesh, loops, removed }. */
export function cut(m, p, n, region, capUv) {
  n = norm(n);
  const b = new Builder(m), d = i => dot(sub(b.P(i), p), n), edgeVert = new Map(), segs = [];
  let removed = 0;
  const mid = (i, j) => {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`; let v = edgeVert.get(key);
    if (v === undefined) {
      const di = d(i), dj = d(j), t = di / (di - dj), lerp = (a, c, w) => a.map((x, k) => x + (c[k] - x) * w);
      v = b.add(lerp(b.P(i), b.P(j), t), norm(lerp(b.N(i), b.N(j), t)), lerp(b.T(i), b.T(j), t)); edgeVert.set(key, v);
    }
    return v;
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const tri = [m.idx[t], m.idx[t + 1], m.idx[t + 2]], ds = tri.map(d);
    const c = [0, 1, 2].map(k => (b.P(tri[0])[k] + b.P(tri[1])[k] + b.P(tri[2])[k]) / 3);
    if (!region(c) || ds.every(x => x <= 0)) { b.idx.push(...tri); continue; }
    if (ds.every(x => x > 0)) { removed++; continue; }
    // Rotate so the triangle starts with the vertex alone on its side.
    const neg = ds.map(x => x <= 0), alone = neg.filter(Boolean).length === 1 ? neg.indexOf(true) : neg.indexOf(false);
    const [a0, a1, a2] = [tri[alone], tri[(alone + 1) % 3], tri[(alone + 2) % 3]];
    const m1 = mid(a0, a1), m2 = mid(a0, a2);
    if (neg[alone]) { b.idx.push(a0, m1, m2); segs.push([m1, m2]); }
    else { b.idx.push(m1, a1, a2, m1, a2, m2); segs.push([m2, m1]); }
    removed++;
  }
  // Chain cut segments into loops by position (UV seams duplicate vertices) and cap each with a fan.
  const q = i => b.P(i).map(x => Math.round(x * 1e5)).join(',');
  const next = new Map(); for (const [s, e] of segs) next.set(q(s), { s, e });
  const used = new Set(), loops = [];
  for (const [k0] of next) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0;
    while (k && !used.has(k) && next.has(k)) { used.add(k); const sg = next.get(k); loop.push(sg.s); k = q(sg.e); }
    if (loop.length >= 3) loops.push(loop);
  }
  for (const loop of loops) {
    const c = [0, 1, 2].map(k => loop.reduce((s, i) => s + b.P(i)[k], 0) / loop.length);
    const cv = b.add(c, n, capUv), ring = loop.map(i => b.add(b.P(i), n, capUv));
    for (let k = 0; k < ring.length; k++) {
      const i = ring[k], j = ring[(k + 1) % ring.length];
      const f = cross(sub(b.P(i), c), sub(b.P(j), c));
      if (dot(f, n) >= 0) b.idx.push(cv, i, j); else b.idx.push(cv, j, i);
    }
  }
  return { mesh: b.done(), loops: loops.length, removed };
}

export function transform(m, fn) { const pos = new Float32Array(m.pos), nrm = new Float32Array(m.nrm);
  for (let i = 0; i < pos.length; i += 3) { const [p, nn] = fn([pos[i], pos[i + 1], pos[i + 2]], [nrm[i], nrm[i + 1], nrm[i + 2]]); pos.set(p, i); nrm.set(nn, i); }
  return { ...m, pos, nrm }; }
