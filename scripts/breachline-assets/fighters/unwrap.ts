/** UV unwrap for a fighter mesh (offline, used by the fighter bake), made for few, large, recognisable islands:
 *
 * - The mesh is split into its connected parts (each loft, each piece of kit).
 * - Long parts (torso, arms, legs, boot shafts, straps, the scarf) are unwrapped as one cylinder each about their
 *   principal axis, the seam on the side facing the body's centre (the inside of a limb), arc length across.
 * - Other parts are grown into planar charts with a loose normal cone, so bevels and chamfers join the face beside
 *   them; a part smaller than `SMALL` square metres is a single chart.
 * - Charts are rotated to their smallest box, scaled by a texel-density weight and packed with a skyline packer.
 *
 * A vertex on a chart border is split: `remap[i]` is the source vertex of output vertex `i`. */
import * as THREE from 'three';

export interface Unwrap { remap: Uint32Array; uv: Float32Array; index: Uint32Array; charts: number; density: number; coverage: number }
export type Weight = (p: THREE.Vector3) => number;

const SMALL = 0.003;

interface Chart { faces: number[]; /** Per face corner, the 2D point (metres). */ pts: Map<string, [number, number]>; weight: number; area: number }

export function unwrap(geo: THREE.BufferGeometry, size: number, pad: number, weight: Weight, cone = 0.3): Unwrap {
  const P = geo.getAttribute('position'), I = geo.index!.array, nf = I.length / 3, nv = P.count;
  const pos = (v: number) => new THREE.Vector3().fromBufferAttribute(P, v);
  const fn: THREE.Vector3[] = [], fa = new Float32Array(nf), fc: THREE.Vector3[] = [];
  for (let f = 0; f < nf; f++) {
    const a = pos(I[f * 3]), b = pos(I[f * 3 + 1]), c = pos(I[f * 3 + 2]);
    const n = b.clone().sub(a).cross(c.clone().sub(a)); fa[f] = n.length() / 2; fn.push(n.normalize()); fc.push(a.add(b).add(c).multiplyScalar(1 / 3));
  }
  // Connected parts over shared vertices (union-find).
  const parent = Int32Array.from({ length: nv }, (_, i) => i);
  const find = (x: number): number => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (let f = 0; f < nf; f++) { const a = find(I[f * 3]); for (let k = 1; k < 3; k++) { const b = find(I[f * 3 + k]); if (a !== b) parent[b] = a; } }
  const parts = new Map<number, number[]>();
  for (let f = 0; f < nf; f++) { const r = find(I[f * 3]); const l = parts.get(r); if (l) l.push(f); else parts.set(r, [f]); }
  // Face adjacency over shared edges, for growing planar charts.
  const edgeMap = new Map<number, number[]>();
  const key = (u: number, v: number) => (u < v ? u * nv + v : v * nv + u);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const e = key(I[f * 3 + k], I[f * 3 + (k + 1) % 3]); const l = edgeMap.get(e); if (l) l.push(f); else edgeMap.set(e, [f]); }
  const adj: number[][] = Array.from({ length: nf }, () => []);
  for (const l of edgeMap.values()) for (const x of l) for (const y of l) if (x !== y) adj[x].push(y);

  const charts: Chart[] = [];
  const chartOf = (faces: number[], project: (v: number, f: number) => [number, number]) => {
    const pts = new Map<string, [number, number]>(); let w = 0, area = 0;
    for (const f of faces) { for (let k = 0; k < 3; k++) pts.set(`${f}:${k}`, project(I[f * 3 + k], f)); w += weight(fc[f]) * fa[f]; area += fa[f]; }
    charts.push({ faces, pts, weight: Math.sqrt(w / Math.max(1e-12, area)), area });
  };
  const planar = (faces: number[], n: THREE.Vector3) => {
    const t = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(t, n).normalize(), e2 = new THREE.Vector3().crossVectors(n, e1);
    chartOf(faces, v => { const p = pos(v); return [p.dot(e1), p.dot(e2)]; });
  };
  for (const faces of parts.values()) {
    let area = 0; const c = new THREE.Vector3();
    for (const f of faces) { area += fa[f]; c.addScaledVector(fc[f], fa[f]); }
    c.multiplyScalar(1 / Math.max(1e-12, area));
    // Tube axis: the direction the normals are most perpendicular to (smallest eigenvector of their covariance, by
    // power iteration on trace - M). Right for limbs and for short wide bands alike.
    const M = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const f of faces) { const n = fn[f], w = fa[f], v = [n.x, n.y, n.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i * 3 + j] += v[i] * v[j] * w; }
    const tr = M[0] + M[4] + M[8];
    let ax = new THREE.Vector3(0.3, 1, 0.2).normalize();
    for (let it = 0; it < 40; it++) ax = new THREE.Vector3((tr - M[0]) * ax.x - M[1] * ax.y - M[2] * ax.z, -M[3] * ax.x + (tr - M[4]) * ax.y - M[5] * ax.z, -M[6] * ax.x - M[7] * ax.y + (tr - M[8]) * ax.z).normalize();
    let along = 0; for (const f of faces) along += fn[f].dot(ax) ** 2 * fa[f];
    // Spread round the axis: a tube's faces go all the way round it.
    const e1 = new THREE.Vector3(1, 0, 0).addScaledVector(ax, -ax.x); if (e1.lengthSq() < 0.01) e1.set(0, 0, 1).addScaledVector(ax, -ax.z); e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(ax, e1), sectors = new Set<number>();
    for (const f of faces) sectors.add(Math.floor((Math.atan2(fn[f].dot(e2), fn[f].dot(e1)) + Math.PI) / (Math.PI / 4)));
    const tube = area > 0.0006 && along / area < 0.18 && sectors.size >= 7;
    if (tube) {
      // Seam on the side facing the body's centre line: outward reference away from it.
      const out = new THREE.Vector3(Math.abs(c.x) > 0.04 ? Math.sign(c.x) : -1, 0, Math.abs(c.x) > 0.04 ? 0 : 0.0001);
      const r = out.addScaledVector(ax, -out.dot(ax)); if (r.lengthSq() < 1e-6) r.set(0, 0, -1).addScaledVector(ax, -ax.z); r.normalize();
      const b = new THREE.Vector3().crossVectors(ax, r);
      let rad = 0; for (const f of faces) { const d = fc[f].clone().sub(c); rad += d.addScaledVector(ax, -d.dot(ax)).length() * fa[f]; } rad /= area;
      const ang = (v: number) => { const d = pos(v).sub(c); return Math.atan2(d.dot(b), d.dot(r)); };
      chartOf(faces, (v, f) => {
        let th = ang(v);
        // Faces across the seam (at +-pi) take their vertices from one side.
        const ths = [0, 1, 2].map(k => ang(I[f * 3 + k]));
        if (Math.max(...ths) - Math.min(...ths) > Math.PI && th < 0) th += Math.PI * 2;
        return [th * rad, pos(v).sub(c).dot(ax)];
      });
      continue;
    }
    if (area < SMALL) {
      const n = new THREE.Vector3(); for (const f of faces) n.addScaledVector(fn[f], fa[f]);
      planar(faces, n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 0, 1));
      continue;
    }
    // Planar charts grown by a loose cone around the chart's mean normal (bevels join their faces).
    const inPart = new Set(faces), seen = new Set<number>();
    for (const s of [...faces].sort((x, y) => fa[y] - fa[x])) {
      if (seen.has(s)) continue;
      const list = [s], sum = fn[s].clone().multiplyScalar(fa[s]); seen.add(s);
      for (let i = 0; i < list.length; i++) for (const g of adj[list[i]]) {
        if (seen.has(g) || !inPart.has(g)) continue;
        const m = sum.clone().normalize();
        if (fn[g].dot(m) < cone || fn[g].dot(fn[s]) < cone - 0.15) continue;
        seen.add(g); list.push(g); sum.addScaledVector(fn[g], fa[g]);
      }
      planar(list, sum.normalize());
    }
  }
  // Output vertices: one per (source vertex, chart, wrapped side).
  const verts: { src: number; c: number; x: number; y: number }[] = [], vmap = new Map<string, number>(), index = new Uint32Array(nf * 3);
  charts.forEach((ch, id) => {
    for (const f of ch.faces) for (let k = 0; k < 3; k++) {
      const v = I[f * 3 + k], [x, y] = ch.pts.get(`${f}:${k}`)!, kk = `${v}:${id}:${Math.round(x * 1e4)}`;
      let o = vmap.get(kk);
      if (o === undefined) { o = verts.length; verts.push({ src: v, c: id, x, y }); vmap.set(kk, o); }
      index[f * 3 + k] = o;
    }
  });
  // Boxes: smallest of 0 and 90 degrees for tubes, 16 angles for planar charts.
  const members: number[][] = charts.map(() => []); verts.forEach((v, i) => members[v.c].push(i));
  const boxes = charts.map((ch, id) => {
    let best = { ang: 0, w: 0, h: 0, x0: 0, y0: 0, area: Infinity };
    for (let s = 0; s < 16; s++) {
      const ang = (s / 16) * Math.PI / 2, co = Math.cos(ang), si = Math.sin(ang);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const i of members[id]) { const v = verts[i], x = v.x * co - v.y * si, y = v.x * si + v.y * co; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      if ((x1 - x0) * (y1 - y0) < best.area) best = { ang, w: x1 - x0, h: y1 - y0, x0, y0, area: (x1 - x0) * (y1 - y0) };
    }
    return { id, ...best, k: ch.weight };
  });
  // Skyline packer: each box goes where its top would be lowest (trying both orientations).
  const pack = (scale: number) => {
    const sky = new Int32Array(size), place = new Map<number, { x: number; y: number; rot: boolean }>();
    const order = [...boxes].sort((a, b) => Math.max(b.w, b.h) * b.k - Math.max(a.w, a.h) * a.k);
    for (const bx of order) {
      let best: { x: number; y: number; rot: boolean } | null = null;
      for (const rot of [false, true]) {
        const w = Math.max(1, Math.ceil((rot ? bx.h : bx.w) * bx.k * scale)) + pad * 2, h = Math.max(1, Math.ceil((rot ? bx.w : bx.h) * bx.k * scale)) + pad * 2;
        if (w > size) continue;
        for (let x = 0; x + w <= size; x += 2) {
          let y = 0; for (let i = x; i < x + w; i++) if (sky[i] > y) y = sky[i];
          if (y + h <= size && (!best || y < best.y)) best = { x, y, rot };
        }
      }
      if (!best) return null;
      const w = Math.max(1, Math.ceil((best.rot ? bx.h : bx.w) * bx.k * scale)) + pad * 2, h = Math.max(1, Math.ceil((best.rot ? bx.w : bx.h) * bx.k * scale)) + pad * 2;
      for (let i = best.x; i < best.x + w; i++) sky[i] = best.y + h;
      place.set(bx.id, best);
    }
    return place;
  };
  let lo = 20, hi = 4000;
  for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (pack(mid)) lo = mid; else hi = mid; }
  const scale = lo, place = pack(scale)!;
  const uv = new Float32Array(verts.length * 2), remap = new Uint32Array(verts.length);
  let used = 0;
  for (const bx of boxes) used += bx.w * bx.h * bx.k * bx.k * scale * scale;
  verts.forEach((v, i) => {
    const bx = boxes[v.c], co = Math.cos(bx.ang), si = Math.sin(bx.ang), pl = place.get(v.c)!;
    let x = (v.x * co - v.y * si - bx.x0) * bx.k * scale, y = (v.x * si + v.y * co - bx.y0) * bx.k * scale;
    // A quarter turn (not a mirror, so tangent frames keep their handedness).
    if (pl.rot) { const t = x; x = y; y = bx.w * bx.k * scale - t; }
    uv[i * 2] = (x + pl.x + pad) / size; uv[i * 2 + 1] = (y + pl.y + pad) / size; remap[i] = v.src;
  });
  return { remap, uv, index, charts: charts.length, density: scale, coverage: used / (size * size) };
}
