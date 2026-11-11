/** Lofts: rings of cross-sections joined into a closed tube, with smooth skin weights from a callback. The fighter's
 * torso, limbs, boots and soft goods are lofts, so their triangle counts are set exactly per level of detail and their
 * weights blend smoothly across joints. */
import * as THREE from 'three';

export interface Ring {
  /** Centre of the ring. */
  c: THREE.Vector3;
  /** Cross-section axes: `u` across, `v` the other way (both unit, perpendicular to the loft's direction). */
  u: THREE.Vector3; v: THREE.Vector3;
  /** Offset in (u, v) of the section at angle `a` (0 along +u, pi/2 along +v). */
  at: (a: number) => [number, number];
}
export type Weights = [number, number][];

export interface LoftOptions {
  seg: number;
  weight: (p: THREE.Vector3, ring: number, a: number) => Weights;
  tag?: (p: THREE.Vector3, ring: number, a: number) => number;
  capStart?: boolean; capEnd?: boolean;
  /** Angle offset so the seam (a = 0) sits where it is hidden. */
  a0?: number;
}

const _p = new THREE.Vector3();

/** Builds an indexed geometry with position, normal, skinIndex, skinWeight and tag. */
export function loft(rings: Ring[], o: LoftOptions): THREE.BufferGeometry {
  const pos: number[] = [], si: number[] = [], sw: number[] = [], tag: number[] = [], idx: number[] = [];
  const push = (p: THREE.Vector3, r: number, a: number) => {
    pos.push(p.x, p.y, p.z);
    const w = o.weight(p, r, a).filter(e => e[1] > 1e-4).sort((x, y) => y[1] - x[1]).slice(0, 4);
    let sum = 0; for (const e of w) sum += e[1];
    for (let k = 0; k < 4; k++) { si.push(w[k] ? w[k][0] : 0); sw.push(w[k] ? w[k][1] / sum : 0); }
    tag.push(o.tag ? o.tag(p, r, a) : 0);
  };
  const n = o.seg, a0 = o.a0 ?? 0;
  rings.forEach((R, r) => {
    for (let j = 0; j < n; j++) {
      const a = a0 + (j / n) * Math.PI * 2, [x, y] = R.at(a);
      _p.copy(R.c).addScaledVector(R.u, x).addScaledVector(R.v, y);
      push(_p, r, a);
    }
  });
  for (let r = 0; r < rings.length - 1; r++) for (let j = 0; j < n; j++) {
    const a = r * n + j, b = r * n + (j + 1) % n, c = a + n, d = b + n;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (r: number, flip: boolean) => {
    const R = rings[r], centre = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < n; j++) { cx += pos[(r * n + j) * 3]; cy += pos[(r * n + j) * 3 + 1]; cz += pos[(r * n + j) * 3 + 2]; }
    void R;
    push(_p.set(cx / n, cy / n, cz / n), r, 0);
    for (let j = 0; j < n; j++) { const a = r * n + j, b = r * n + (j + 1) % n; if (flip) idx.push(centre, a, b); else idx.push(centre, b, a); }
  };
  if (o.capStart) cap(0, false);
  if (o.capEnd) cap(rings.length - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('tag', new THREE.Float32BufferAttribute(tag, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A ring frame for a loft along direction `dir`, with `front` (projected) as the section's +v axis. */
export function frame(c: THREE.Vector3, dir: THREE.Vector3, front: THREE.Vector3): { c: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 } {
  const d = dir.clone().normalize(), v = front.clone().addScaledVector(d, -front.dot(d)).normalize();
  const u = new THREE.Vector3().crossVectors(v, d).normalize();
  return { c: c.clone(), u, v };
}

/** Superellipse section with different extents to each side: +u `r`, -u `l`, +v `f`, -v `b`; `n` 2 is an ellipse,
 * higher is boxier. `bump` adds radial detail by angle. */
export function section(r: number, l: number, f: number, b: number, n = 2, bump?: (a: number) => number) {
  const e = 2 / n;
  return (a: number): [number, number] => {
    const c = Math.cos(a), s = Math.sin(a), k = 1 + (bump ? bump(a) : 0);
    return [(c >= 0 ? r : l) * Math.sign(c) * Math.pow(Math.abs(c), e) * k, (s >= 0 ? f : b) * Math.sign(s) * Math.pow(Math.abs(s), e) * k];
  };
}

/** Linear interpolation of a table of rows at `t` (rows sorted by their first column). */
export function table(rows: readonly (readonly number[])[], t: number): number[] {
  if (t <= rows[0][0]) return rows[0].slice(1);
  for (let i = 1; i < rows.length; i++) {
    if (t <= rows[i][0]) {
      const a = rows[i - 1], b = rows[i], k = (t - a[0]) / (b[0] - a[0]), s = k * k * (3 - 2 * k) * 0.35 + k * 0.65;
      return a.slice(1).map((v, j) => v + (b[j + 1] - v) * s);
    }
  }
  return rows[rows.length - 1].slice(1);
}

/** Smooth partition of unity along a chain: `centres` are [bone, t] sorted by ascending t. */
export function chain(centres: readonly (readonly [number, number])[], t: number): Weights {
  if (t <= centres[0][1]) return [[centres[0][0], 1]];
  for (let i = 1; i < centres.length; i++) {
    if (t <= centres[i][1]) {
      const a = centres[i - 1], b = centres[i], k = (t - a[1]) / (b[1] - a[1]), s = k * k * (3 - 2 * k);
      return [[a[0], 1 - s], [b[0], s]];
    }
  }
  return [[centres[centres.length - 1][0], 1]];
}

/** Concatenates indexed geometries with the same attributes. */
export function concat(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry(), names = Object.keys(list[0].attributes);
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.getAttribute('position').count; ni += g.index!.count; }
  for (const name of names) {
    const A0 = list[0].getAttribute(name), arr = new (A0.array.constructor as Float32ArrayConstructor)(nv * A0.itemSize);
    let o = 0;
    for (const g of list) { const A = g.getAttribute(name); arr.set(A.array as Float32Array, o); o += A.array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, A0.itemSize, A0.normalized));
  }
  const idx = new Uint32Array(ni);
  let o = 0, base = 0;
  for (const g of list) { const I = g.index!.array; for (let i = 0; i < I.length; i++) idx[o++] = I[i] + base; base += g.getAttribute('position').count; }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
