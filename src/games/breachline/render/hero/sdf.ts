/** Signed-distance modelling for organic hero parts (hands, bodies): primitives grouped and blended with smooth
 * minimum, meshed once with surface nets, and skinned by each primitive's bone. Meshing the same field at a coarser
 * grid gives the lower levels of detail. */
import * as THREE from 'three';

export type Vec = [number, number, number];
export interface Prim {
  kind: 'cone' | 'ell' | 'box';
  /** cone: segment a-b with radii ra, rb. ell: centre a, radii r (in the frame q). box: centre a, half size r, edge radius ra. */
  a: Vec; b: Vec; ra: number; rb: number; r: Vec; q: THREE.Quaternion | null;
  bone: number; group: number;
  /** Surface tag carried to the mesh (material region). */
  tag: number;
  /** Bounding sphere for early outs. */
  c: Vec; cr: number;
}
export function cone(a: Vec, b: Vec, ra: number, rb: number, bone: number, group: number, tag = 0): Prim {
  const c: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return { kind: 'cone', a, b, ra, rb, r: [0, 0, 0], q: null, bone, group, tag, c, cr: Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2 + Math.max(ra, rb) };
}
export function ell(center: Vec, radii: Vec, bone: number, group: number, tag = 0, rot?: THREE.Euler | THREE.Quaternion): Prim {
  const q = rot ? (rot instanceof THREE.Quaternion ? rot.clone() : new THREE.Quaternion().setFromEuler(rot)).invert() : null;
  return { kind: 'ell', a: center, b: center, ra: 0, rb: 0, r: radii, q, bone, group, tag, c: center, cr: Math.max(...radii) };
}
export function rbox(center: Vec, half: Vec, round: number, bone: number, group: number, tag = 0, rot?: THREE.Euler): Prim {
  const q = rot ? new THREE.Quaternion().setFromEuler(rot).invert() : null;
  return { kind: 'box', a: center, b: center, ra: round, rb: 0, r: half, q, bone, group, tag, c: center, cr: Math.hypot(...half) + round };
}

const tv = new THREE.Vector3();
/** Distance from p to one primitive. */
export function primDist(p: Prim, x: number, y: number, z: number): number {
  if (p.kind === 'cone') {
    // Round cone (capsule with two radii), the standard exact formulation.
    const bax = p.b[0] - p.a[0], bay = p.b[1] - p.a[1], baz = p.b[2] - p.a[2];
    const pax = x - p.a[0], pay = y - p.a[1], paz = z - p.a[2];
    const l2 = bax * bax + bay * bay + baz * baz, rr = p.ra - p.rb, a2 = l2 - rr * rr;
    const yv = pax * bax + pay * bay + paz * baz, zv = yv - l2;
    const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yv * yv * l2, z2 = zv * zv * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) / l2 - p.rb;
    if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) / l2 - p.ra;
    return (Math.sqrt(x2 * a2 / l2) + yv * rr) / l2 - p.ra;
  }
  tv.set(x - p.a[0], y - p.a[1], z - p.a[2]);
  if (p.q) tv.applyQuaternion(p.q);
  if (p.kind === 'ell') {
    // Ellipsoid, the k0 * (k0 - 1) / k1 bound.
    const k0 = Math.hypot(tv.x / p.r[0], tv.y / p.r[1], tv.z / p.r[2]), k1 = Math.hypot(tv.x / (p.r[0] * p.r[0]), tv.y / (p.r[1] * p.r[1]), tv.z / (p.r[2] * p.r[2]));
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(...p.r);
  }
  const qx = Math.abs(tv.x) - p.r[0], qy = Math.abs(tv.y) - p.r[1], qz = Math.abs(tv.z) - p.r[2];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - p.ra;
}

export const smin = (a: number, b: number, k: number) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };

/** How groups combine: each group is smooth-blended internally with `k`; then groups are folded in order, each with
 * `join` (smooth) into the running shape, or `hard` groups min'd together first (fingers that must not fuse). */
export interface Field {
  prims: Prim[];
  groups: { k: number; join: number; hardSet?: number }[];
  /** Optional displacement added to the final distance (folds, wrinkles). */
  displace?: (x: number, y: number, z: number) => number;
}

/** Evaluates the field. `exclude` is a scratch buffer of per-group distances. */
export function evalField(f: Field, x: number, y: number, z: number, band: number, gd: Float64Array): number {
  gd.fill(1e9);
  for (const p of f.prims) {
    const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.cr > band + f.groups[p.group].k) continue;
    const d = primDist(p, x, y, z);
    gd[p.group] = smin(gd[p.group], d, f.groups[p.group].k);
  }
  // Hard sets: min within each set, then the set joins like a group.
  let out = 1e9;
  const sets = new Map<number, { d: number; join: number }>();
  for (let g = 0; g < f.groups.length; g++) {
    const G = f.groups[g];
    if (G.hardSet !== undefined) { const s = sets.get(G.hardSet); if (s) s.d = Math.min(s.d, gd[g]); else sets.set(G.hardSet, { d: gd[g], join: G.join }); continue; }
    out = g === 0 ? gd[g] : smin(out, gd[g], G.join);
  }
  for (const s of sets.values()) out = smin(out, s.d, s.join);
  if (f.displace && out < band * 2) out += f.displace(x, y, z);
  return out;
}

export interface SdfMesh { geo: THREE.BufferGeometry; tags: Uint8Array }

/** Meshes the field with surface nets over its primitives' bounds at cell size h, then skins each vertex to the bones
 * of nearby primitives (weights from distance, restricted to the dominant bone's neighbours, smoothed over the mesh).
 * `neighbours(bone)` lists bones a vertex dominated by `bone` may also take weight from. */
export function meshField(f: Field, h: number, neighbours: (bone: number) => readonly number[]): SdfMesh {
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const p of f.prims) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.c[i] - p.cr); hi[i] = Math.max(hi[i], p.c[i] + p.cr); }
  for (let i = 0; i < 3; i++) { lo[i] -= h * 2; hi[i] += h * 2; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const gd = new Float64Array(f.groups.length), band = h * 1.8;
  const val = new Float32Array(nx * ny * nz);
  const at = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[at(i, j, k)] = evalField(f, lo[0] + i * h, lo[1] + j * h, lo[2] + k * h, band, gd);
  // One vertex per cell that straddles the surface.
  const vid = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cat = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos: number[] = [];
  const corner = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { cv[c] = val[at(i + corner[c][0], j + corner[c][1], k + corner[c][2])]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      if ((cv[a] < 0) === (cv[b] < 0)) continue;
      const t = cv[a] / (cv[a] - cv[b]);
      sx += corner[a][0] + (corner[b][0] - corner[a][0]) * t; sy += corner[a][1] + (corner[b][1] - corner[a][1]) * t; sz += corner[a][2] + (corner[b][2] - corner[a][2]) * t; n++;
    }
    vid[cat(i, j, k)] = pos.length / 3;
    pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
  }
  // Quads across every grid edge with a sign change.
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = val[at(i, j, k)], v1 = val[at(i + 1, j, k)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(vid[cat(i, j - 1, k - 1)], vid[cat(i, j, k - 1)], vid[cat(i, j, k)], vid[cat(i, j - 1, k)], v0 < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[at(i, j, k)], v1 = val[at(i, j + 1, k)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(vid[cat(i - 1, j, k - 1)], vid[cat(i - 1, j, k)], vid[cat(i, j, k)], vid[cat(i, j, k - 1)], v0 < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = val[at(i, j, k)], v1 = val[at(i, j, k + 1)];
    if ((v0 < 0) === (v1 < 0)) continue;
    quad(vid[cat(i - 1, j - 1, k)], vid[cat(i, j - 1, k)], vid[cat(i, j, k)], vid[cat(i - 1, j, k)], v0 < 0);
  }
  // Project each vertex onto the surface (two Newton steps) and take normals from the field gradient.
  const nv = pos.length / 3, nor = new Float32Array(nv * 3), e = h * 0.25;
  const F = (x: number, y: number, z: number) => evalField(f, x, y, z, band, gd);
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = F(x, y, z);
      gx = F(x + e, y, z) - F(x - e, y, z); gy = F(x, y + e, z) - F(x, y - e, z); gz = F(x, y, z + e) - F(x, y, z - e);
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e);
      if (it < 2 && g2 > 1e-8) { const s = d / g2 / (2 * e); x -= gx * s; y -= gy * s; z -= gz * s; }
    }
    const gl = Math.hypot(gx, gy, gz) || 1;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    nor[v * 3] = gx / gl; nor[v * 3 + 1] = gy / gl; nor[v * 3 + 2] = gz / gl;
  }
  // Skin weights and surface tags from the primitives.
  const nb = Math.max(...f.prims.map(p => p.bone)) + 1, W = new Float32Array(nv * nb), tags = new Uint8Array(nv);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    let best = 1e9, bestBone = 0;
    const local = new Float32Array(nb);
    for (const p of f.prims) {
      const dx = x - p.c[0], dy = y - p.c[1], dz = z - p.c[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - p.cr > 0.03) continue;
      const d = primDist(p, x, y, z);
      if (d < best) { best = d; bestBone = p.bone; tags[v] = p.tag; }
      const R = Math.max(0.006, (p.kind === 'cone' ? Math.max(p.ra, p.rb) : Math.min(...p.r)) * 0.9);
      const w = 1 - THREE.MathUtils.smoothstep(d, 0, R);
      if (w > local[p.bone]) local[p.bone] = w;
    }
    const allow = new Set([bestBone, ...neighbours(bestBone)]);
    for (let b = 0; b < nb; b++) W[v * nb + b] = allow.has(b) ? local[b] : 0;
    if (W[v * nb + bestBone] < 0.05) W[v * nb + bestBone] = 1;
  }
  // Smooth weights across mesh edges.
  const adj: number[][] = Array.from({ length: nv }, () => []);
  for (let t = 0; t < idx.length; t += 3) for (let q = 0; q < 3; q++) { const a = idx[t + q], b = idx[t + (q + 1) % 3]; adj[a].push(b); adj[b].push(a); }
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(W);
    for (let v = 0; v < nv; v++) {
      const l = adj[v]; if (!l.length) continue;
      for (let b = 0; b < nb; b++) { let s = 0; for (const u of l) s += W[u * nb + b]; next[v * nb + b] = W[v * nb + b] * 0.5 + s / l.length * 0.5; }
    }
    W.set(next);
  }
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const order = Array.from({ length: nb }, (_, b) => b).sort((a, b) => W[v * nb + b] - W[v * nb + a]).slice(0, 4);
    let sum = 0; for (const b of order) sum += W[v * nb + b];
    order.forEach((b, i) => { si[v * 4 + i] = b; sw[v * 4 + i] = sum > 0 ? W[v * nb + b] / sum : i === 0 ? 1 : 0; });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  return { geo, tags };
}
