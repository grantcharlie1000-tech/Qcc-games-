/** Unwrap in code: every triangle is projected along its dominant axis; connected triangles with the same axis form an
 * island; islands are shelf-packed into one square atlas with padding, at a texel density weighted toward what the
 * player sees. Deterministic, so the offline baker and the run time produce the same UVs from the same geometry. */
import * as THREE from 'three';

export interface UnwrapOptions {
  /** Atlas size in texels (the bake size; lower mips use the same UVs). */
  size: number;
  /** Padding between islands, in texels. */
  pad: number;
  /** Relative texel density for faces whose dominant axis is 0..5 (+X, -X, +Y, -Y, +Z, -Z). */
  weight: readonly number[];
  /** Side (m) of the smallest chart painted on its own; smaller layers share a chart. */
  minChart?: number;
}

/** Returns a new geometry (vertices duplicated along island borders) with a `uv` attribute in 0..1 and the
 * achieved density in texels per metre. All other attributes are carried across. */
export function unwrap(src: THREE.BufferGeometry, o: UnwrapOptions): { geo: THREE.BufferGeometry; density: number; islands: number } {
  const P = src.getAttribute('position'), ix = src.index!.array, nt = ix.length / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const axis = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) {
    a.fromBufferAttribute(P, ix[t * 3]); b.fromBufferAttribute(P, ix[t * 3 + 1]); c.fromBufferAttribute(P, ix[t * 3 + 2]);
    n.subVectors(b, a).cross(c.sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    axis[t] = ax >= ay && ax >= az ? (n.x >= 0 ? 0 : 1) : ay >= az ? (n.y >= 0 ? 2 : 3) : (n.z >= 0 ? 4 : 5);
  }
  // Charts per part: each part's triangles grouped by dominant axis, then split into depth layers along that axis so
  // opposite walls do not overlap; bevels join the face they lean toward. Layers too small to paint on their own
  // (teeth, pins, glyphs) share one chart per part and axis (overlap accepted: they take the same paint).
  const PT = src.getAttribute('part'), depth = new Float32Array(nt), area = new Float32Array(nt);
  for (let t = 0; t < nt; t++) {
    a.fromBufferAttribute(P, ix[t * 3]); b.fromBufferAttribute(P, ix[t * 3 + 1]); c.fromBufferAttribute(P, ix[t * 3 + 2]);
    const ax = axis[t] >> 1, cen = (a.getComponent(ax) + b.getComponent(ax) + c.getComponent(ax)) / 3;
    depth[t] = cen; area[t] = n.subVectors(b, a).cross(c.clone().sub(a)).length() / 2;
  }
  const byKey = new Map<string, number[]>();
  for (let t = 0; t < nt; t++) { const key = `${PT ? PT.getX(ix[t * 3]) : 0}|${axis[t]}`; const l = byKey.get(key); if (l) l.push(t); else byKey.set(key, [t]); }
  const groups = new Map<number, number[]>();
  let gid = 0;
  const MIN_AREA = (o.minChart ?? 0.008) ** 2;
  for (const tris of byKey.values()) {
    tris.sort((p, q) => depth[p] - depth[q]);
    const layers: number[][] = [];
    let cur: number[] = [];
    for (let i = 0; i < tris.length; i++) {
      if (cur.length && depth[tris[i]] - depth[tris[i - 1]] > 0.004) { layers.push(cur); cur = []; }
      cur.push(tris[i]);
    }
    if (cur.length) layers.push(cur);
    const small: number[] = [];
    for (const l of layers) { let ar = 0; for (const t of l) ar += area[t]; if (ar < MIN_AREA) small.push(...l); else groups.set(gid++, l); }
    if (small.length) groups.set(gid++, small);
  }
  // Projected coordinates per island (metres), and bounds.
  const proj = (ax: number, x: number, y: number, z: number): [number, number] =>
    ax === 0 ? [-z, y] : ax === 1 ? [z, y] : ax === 2 ? [x, -z] : ax === 3 ? [x, z] : ax === 4 ? [x, y] : [-x, y];
  interface Island { tris: number[]; ax: number; u0: number; v0: number; w: number; h: number; x: number; y: number; k: number; rot: boolean }
  const islands: Island[] = [];
  for (const tris of groups.values()) {
    const ax = axis[tris[0]];
    let u0 = 1e9, v0 = 1e9, u1 = -1e9, v1 = -1e9;
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = ix[t * 3 + k], [u, w] = proj(ax, P.getX(v), P.getY(v), P.getZ(v)); u0 = Math.min(u0, u); v0 = Math.min(v0, w); u1 = Math.max(u1, u); v1 = Math.max(v1, w); }
    const w = Math.max(1e-5, u1 - u0), h = Math.max(1e-5, v1 - v0), rot = h > w;
    // Islands are laid landscape so the shelves stay low.
    islands.push({ tris, ax, u0, v0, w: rot ? h : w, h: rot ? w : h, x: 0, y: 0, k: o.weight[ax] ?? 1, rot });
  }
  // Shelf packing at density d (texels/metre); find the largest d that fits.
  const order = [...islands].sort((p, q) => q.h * q.k - p.h * p.k);
  const pack = (d: number): boolean => {
    let x = 0, y = 0, row = 0;
    for (const isl of order) {
      const w = Math.ceil(isl.w * d * isl.k) + o.pad * 2, h = Math.ceil(isl.h * d * isl.k) + o.pad * 2;
      if (w > o.size) return false;
      if (x + w > o.size) { x = 0; y += row; row = 0; }
      isl.x = x + o.pad; isl.y = y + o.pad; x += w; row = Math.max(row, h);
      if (y + row > o.size) return false;
    }
    return true;
  };
  let lo = 10, hi = 40000;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (pack(mid)) lo = mid; else hi = mid; }
  pack(lo);
  // Rebuild with duplicated vertices per island.
  const names = Object.keys(src.attributes);
  const out: Record<string, number[]> = Object.fromEntries(names.map(k => [k, []]));
  const uv: number[] = [], idx: number[] = [];
  for (const isl of islands) {
    const map = new Map<number, number>();
    for (const t of isl.tris) for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k];
      let m = map.get(v);
      if (m === undefined) {
        m = uv.length / 2; map.set(v, m);
        for (const name of names) { const A = src.getAttribute(name); for (let q = 0; q < A.itemSize; q++) out[name].push(A.array[v * A.itemSize + q]); }
        const [u, w] = proj(isl.ax, P.getX(v), P.getY(v), P.getZ(v));
        const du = (u - isl.u0) * lo * isl.k, dv = (w - isl.v0) * lo * isl.k;
        uv.push((isl.x + (isl.rot ? dv : du)) / o.size, (isl.y + (isl.rot ? du : dv)) / o.size);
      }
      idx.push(m);
    }
  }
  const geo = new THREE.BufferGeometry();
  for (const name of names) {
    const A = src.getAttribute(name), Ctor = A.array.constructor as Float32ArrayConstructor;
    geo.setAttribute(name, new THREE.BufferAttribute(new Ctor(out[name]), A.itemSize, A.normalized));
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return { geo, density: lo, islands: islands.length };
}

/** Texel density weights: the left side and top of a weapon are what the player sees at the hip and aimed. */
export const WEAPON_WEIGHT = [0.85, 1.35, 1.25, 0.75, 0.9, 0.8] as const;
