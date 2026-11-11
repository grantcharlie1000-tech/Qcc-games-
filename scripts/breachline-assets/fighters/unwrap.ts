/** UV unwrap for a fighter mesh (offline, used by the fighter bake). Faces are grown into planar charts over shared
 * vertices while their normals stay within a cone of the chart's seed; each chart is projected onto its seed plane
 * (never mirrored, so tangent frames keep one handedness), rotated to its smallest box, scaled by a texel-density
 * weight, and shelf-packed into the unit square with padding. A vertex on a chart border is split, so the result is
 * a new, non-indexed-compatible vertex list: `remap[i]` is the source vertex of output vertex `i`. */
import * as THREE from 'three';

export interface Unwrap {
  /** Output vertex i copies source vertex remap[i]. */
  remap: Uint32Array;
  uv: Float32Array;
  index: Uint32Array;
  charts: number;
  /** Texels per metre at the given atlas size, for the reference density weight of 1. */
  density: number;
}

/** Density weight for a vertex position (bind pose): what players look at gets more texels. */
export type Weight = (p: THREE.Vector3) => number;

export function unwrap(geo: THREE.BufferGeometry, size: number, padTexels: number, weight: Weight, cone = 0.72): Unwrap {
  const P = geo.getAttribute('position'), I = geo.index!.array, nf = I.length / 3;
  const fn = new Float32Array(nf * 3), fa = new Float32Array(nf);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let f = 0; f < nf; f++) {
    a.fromBufferAttribute(P, I[f * 3]); b.fromBufferAttribute(P, I[f * 3 + 1]); c.fromBufferAttribute(P, I[f * 3 + 2]);
    n.subVectors(b, a).cross(c.clone().sub(a)); fa[f] = n.length() / 2; n.normalize();
    fn[f * 3] = n.x; fn[f * 3 + 1] = n.y; fn[f * 3 + 2] = n.z;
  }
  // Face adjacency over shared edges.
  const edgeMap = new Map<string, number[]>();
  const key = (u: number, v: number) => (u < v ? `${u},${v}` : `${v},${u}`);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) { const e = key(I[f * 3 + k], I[f * 3 + (k + 1) % 3]); const l = edgeMap.get(e); if (l) l.push(f); else edgeMap.set(e, [f]); }
  const adj: number[][] = Array.from({ length: nf }, () => []);
  for (const l of edgeMap.values()) for (const x of l) for (const y of l) if (x !== y) adj[x].push(y);
  // Grow charts, largest faces first as seeds.
  const chart = new Int32Array(nf).fill(-1), order = Array.from({ length: nf }, (_, f) => f).sort((x, y) => fa[y] - fa[x]);
  const seeds: number[] = [];
  for (const s of order) {
    if (chart[s] >= 0) continue;
    const id = seeds.length; seeds.push(s); chart[s] = id;
    // Average normal of the chart so far, so it can bend gently.
    const sum = new THREE.Vector3(fn[s * 3], fn[s * 3 + 1], fn[s * 3 + 2]).multiplyScalar(fa[s]);
    const stack = [s];
    while (stack.length) {
      const f = stack.pop()!;
      const avg = sum.clone().normalize();
      for (const g of adj[f]) {
        if (chart[g] >= 0) continue;
        const d = fn[g * 3] * avg.x + fn[g * 3 + 1] * avg.y + fn[g * 3 + 2] * avg.z;
        const ds = fn[g * 3] * fn[s * 3] + fn[g * 3 + 1] * fn[s * 3 + 1] + fn[g * 3 + 2] * fn[s * 3 + 2];
        if (d < cone || ds < cone - 0.1) continue;
        chart[g] = id; sum.addScaledVector(new THREE.Vector3(fn[g * 3], fn[g * 3 + 1], fn[g * 3 + 2]), fa[g]); stack.push(g);
      }
    }
  }
  const nc = seeds.length;
  // Per chart: projection axes from the area-weighted normal, vertices split per chart.
  const cn = Array.from({ length: nc }, () => new THREE.Vector3());
  for (let f = 0; f < nf; f++) cn[chart[f]].add(new THREE.Vector3(fn[f * 3], fn[f * 3 + 1], fn[f * 3 + 2]).multiplyScalar(fa[f]));
  const verts: { src: number; c: number; x: number; y: number }[] = [], vmap = new Map<string, number>(), index = new Uint32Array(nf * 3);
  const axes = cn.map(v => {
    v.normalize(); const t = Math.abs(v.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const e1 = new THREE.Vector3().crossVectors(t, v).normalize(), e2 = new THREE.Vector3().crossVectors(v, e1);
    return { e1, e2 };
  });
  const wsum = new Float64Array(nc), warea = new Float64Array(nc);
  for (let f = 0; f < nf; f++) {
    const id = chart[f], { e1, e2 } = axes[id];
    for (let k = 0; k < 3; k++) {
      const v = I[f * 3 + k], kk = `${v}:${id}`;
      let o = vmap.get(kk);
      if (o === undefined) { a.fromBufferAttribute(P, v); o = verts.length; verts.push({ src: v, c: id, x: a.dot(e1), y: a.dot(e2) }); vmap.set(kk, o); }
      index[f * 3 + k] = o;
    }
    a.fromBufferAttribute(P, I[f * 3]); b.fromBufferAttribute(P, I[f * 3 + 1]); c.fromBufferAttribute(P, I[f * 3 + 2]);
    const centre = a.add(b).add(c).multiplyScalar(1 / 3);
    wsum[id] += weight(centre) * fa[f]; warea[id] += fa[f];
  }
  // Each chart: rotate to its smallest bounding box (try 16 angles), then size in metres times its weight.
  interface Box { id: number; w: number; h: number; ang: number; minx: number; miny: number; k: number }
  const members: number[][] = Array.from({ length: nc }, () => []);
  verts.forEach((v, i) => members[v.c].push(i));
  const boxes: Box[] = [];
  for (let id = 0; id < nc; id++) {
    let best: Box | null = null;
    for (let s = 0; s < 16; s++) {
      const ang = (s / 16) * Math.PI / 2, co = Math.cos(ang), si = Math.sin(ang);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const i of members[id]) { const v = verts[i], x = v.x * co - v.y * si, y = v.x * si + v.y * co; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (!best || (x1 - x0) * (y1 - y0) < best.w * best.h) best = { id, w: x1 - x0, h: y1 - y0, ang, minx: x0, miny: y0, k: Math.sqrt(wsum[id] / Math.max(1e-12, warea[id])) };
    }
    boxes.push(best!);
  }
  // Find the largest scale (texels per metre) at which every chart packs into the square.
  const pack = (scale: number) => {
    const sorted = [...boxes].sort((x, y) => y.h * y.k - x.h * x.k);
    const place = new Map<number, [number, number]>();
    let x = padTexels, y = padTexels, rowH = 0;
    for (const bx of sorted) {
      const w = Math.ceil(bx.w * bx.k * scale) + padTexels * 2, h = Math.ceil(bx.h * bx.k * scale) + padTexels * 2;
      if (x + w > size) { x = padTexels; y += rowH; rowH = 0; }
      if (y + h > size || w > size) return null;
      place.set(bx.id, [x + padTexels, y + padTexels]); x += w; rowH = Math.max(rowH, h);
    }
    return place;
  };
  let lo = 10, hi = 20000;
  for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (pack(mid)) lo = mid; else hi = mid; }
  const scale = lo, place = pack(scale)!;
  const uv = new Float32Array(verts.length * 2), remap = new Uint32Array(verts.length);
  verts.forEach((v, i) => {
    const bx = boxes[v.c], co = Math.cos(bx.ang), si = Math.sin(bx.ang), [px, py] = place.get(v.c)!;
    const x = (v.x * co - v.y * si - bx.minx) * bx.k * scale + px, y = (v.x * si + v.y * co - bx.miny) * bx.k * scale + py;
    uv[i * 2] = x / size; uv[i * 2 + 1] = y / size; remap[i] = v.src;
  });
  return { remap, uv, index, charts: nc, density: scale };
}
