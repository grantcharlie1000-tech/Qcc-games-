/** Geometry toolkit for the hero models: bevelled extrusions, lathes, rounded boxes and tubes, merged into one
 * buffer per mesh with per-vertex surface parameters (albedo, roughness, metalness, wear, surface pattern), a bone
 * index for rigid parts and baked ambient occlusion. Everything is plain three.js geometry built at load. */
import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Resolves when the mesh simplifier (WebAssembly, bundled) is ready; organic meshes are decimated with it. */
export const heroReady: Promise<void> = MeshoptSimplifier.ready;

/** Decimates an indexed geometry to about `targetTris` triangles (vertices are kept, so every attribute survives),
 * then drops unused vertices. */
export function simplify(g: THREE.BufferGeometry, targetTris: number, maxError = 0.004): THREE.BufferGeometry {
  const P = g.getAttribute('position').array as Float32Array, src = new Uint32Array(g.index!.array);
  const [idx] = MeshoptSimplifier.simplify(src, P, 3, Math.min(src.length, targetTris * 3), maxError, []);
  const remap = new Int32Array(g.getAttribute('position').count).fill(-1);
  let n = 0;
  for (const i of idx) if (remap[i] < 0) remap[i] = n++;
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(g.attributes)) {
    const A = g.getAttribute(name), arr = new (A.array.constructor as Float32ArrayConstructor)(n * A.itemSize);
    for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) for (let k = 0; k < A.itemSize; k++) arr[remap[v] * A.itemSize + k] = A.array[v * A.itemSize + k];
    out.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize, A.normalized));
  }
  out.setIndex(new THREE.BufferAttribute(Uint32Array.from(idx, i => remap[i]), 1));
  return out;
}

/** Surface patterns the material's shader understands (fourth component of the `pbr` attribute). */
export const PAT = { metal: 0, polymer: 1, wood: 2, fabric: 3, leather: 4, skin: 5, rubber: 6, glass: 7, emissive: 8 } as const;
export interface Surface { color: number; rough: number; metal: number; wear: number; pat: number }
const S = (color: number, rough: number, metal: number, wear: number, pat: number): Surface => ({ color, rough, metal, wear, pat });

/** Material families. Wear is how strongly edges are worn back to bare metal or lighter substrate. */
export const SURF = {
  park: S(0x3b3d40, 0.62, 0.5, 0.6, PAT.metal), // parkerised steel
  steel: S(0x4d5562, 0.42, 0.8, 0.5, PAT.metal), // blued / nitrided steel
  bright: S(0x8d8f91, 0.3, 1, 0.2, PAT.metal), // machined steel: bolt, pins, springs
  anod: S(0x3a3c40, 0.32, 0.4, 0.9, PAT.metal), // black anodised aluminium
  anodFde: S(0x8a7556, 0.66, 0.05, 0.8, PAT.metal), // flat dark earth cerakote on aluminium
  anodOd: S(0x4b5240, 0.68, 0.05, 0.8, PAT.metal), // olive cerakote
  anodGrey: S(0x62666b, 0.36, 0.4, 0.9, PAT.metal), // tungsten grey cerakote
  poly: S(0x3a3b3c, 0.82, 0, 0.35, PAT.polymer),
  polyFde: S(0x86724f, 0.75, 0, 0.35, PAT.polymer),
  polyOd: S(0x4a5040, 0.75, 0, 0.35, PAT.polymer),
  rubber: S(0x2a2a2b, 0.92, 0, 0.1, PAT.rubber),
  wood: S(0x6a3f22, 0.5, 0, 0.45, PAT.wood),
  brass: S(0xb08a45, 0.28, 1, 0.1, PAT.metal),
  lens: S(0x0d1418, 0.06, 0.6, 0, PAT.glass),
  lensAmber: S(0x3a2a12, 0.05, 0.6, 0, PAT.glass),
  red: S(0xff2a1a, 0.3, 0, 0, PAT.emissive),
  tritium: S(0xb8ff7a, 0.3, 0, 0, PAT.emissive),
  white: S(0xd9d6cf, 0.6, 0, 0.1, PAT.polymer),
  // Soft goods.
  glove: S(0x7c6c53, 0.85, 0, 0.25, PAT.leather),
  gloveTan: S(0x3e3a33, 0.8, 0, 0.35, PAT.leather),
  knuckle: S(0x2e2f2d, 0.8, 0, 0.3, PAT.rubber),
  skin: S(0xb98a6a, 0.6, 0, 0, PAT.skin),
  cloth: S(0x3c4334, 0.95, 0, 0.15, PAT.fabric),
  clothDark: S(0x34382f, 0.95, 0, 0.15, PAT.fabric),
  webbing: S(0x4b4f3e, 0.9, 0, 0.2, PAT.fabric),
  plate: S(0x5a5d4c, 0.85, 0, 0.3, PAT.fabric),
  boot: S(0x2a2724, 0.7, 0, 0.3, PAT.leather),
  sole: S(0x161616, 0.95, 0, 0.1, PAT.rubber),
  helmet: S(0x4e5446, 0.7, 0, 0.45, PAT.polymer),
} as const;
export const surf = (base: Surface, over: Partial<Surface>): Surface => ({ ...base, ...over });

interface Piece { geo: THREE.BufferGeometry; s: Surface; bone: number; ao: number; tag: string; surfs?: readonly Surface[] }

/** Accumulates parts and merges them into one indexed buffer. Coordinates are metres. */
export class Builder {
  readonly pieces: Piece[] = [];
  /** Optional label applied to pieces (for triangle accounting). */
  tag = '';
  /** Bone index applied to everything added until changed. */
  bone = 0;
  /** Detail level: 0 full, 1 medium, 2 low. Builders read it to pick segment counts. */
  constructor(public lod = 0) { filletSegs = lod ? 1 : 3; }
  seg(full: number, min = 3): number { return Math.max(min, Math.round(full / (1 + this.lod * 0.9))); }

  add(geo: THREE.BufferGeometry, s: Surface, m?: THREE.Matrix4 | null, ao = 1): THREE.BufferGeometry {
    if (m) geo.applyMatrix4(m);
    this.pieces.push({ geo, s, bone: this.bone, ao, tag: this.tag });
    return geo;
  }

  /** Adds a geometry whose float `tag` attribute picks a surface per vertex from `surfs`. */
  addTagged(geo: THREE.BufferGeometry, surfs: readonly Surface[]) {
    this.pieces.push({ geo, s: surfs[0], bone: this.bone, ao: 1, tag: this.tag, surfs });
    return geo;
  }

  /** A side profile (z forward is negative, y up) extruded across the width (x), bevelled on every edge. */
  prism(profile: readonly (readonly [number, number])[], width: number, s: Surface, opt: { x?: number; bevel?: number; seg?: number; holes?: (readonly (readonly [number, number])[])[] } = {}) {
    const bevel = this.lod ? 0 : Math.min(opt.bevel ?? 0.0015, width * 0.3), shape = new THREE.Shape();
    // Shape coordinates are (forward distance, height); forward distance = -z.
    profile.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
    for (const h of this.lod >= 2 ? [] : opt.holes ?? []) { const path = new THREE.Path(); h.forEach(([z, y], i) => (i ? path.lineTo(-z, y) : path.moveTo(-z, y))); shape.holes.push(path); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: this.lod ? 1 : opt.seg ?? 2, curveSegments: this.seg(8) });
    // Shape x (forward) -> -z, extrusion -> x.
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    geo.translate((opt.x ?? 0) - (width - bevel * 2) / 2, 0, 0);
    return this.add(crease(geo), s);
  }

  /** A cross-section (x across, y up) extruded along the bore from z0 back to z1 (z1 < z0 is forward). */
  extrudeZ(section: readonly (readonly [number, number])[], z0: number, z1: number, s: Surface, bevel = 0.001, holes?: (readonly (readonly [number, number])[])[], segs = 2) {
    const shape = new THREE.Shape(), len = Math.abs(z0 - z1), b = this.lod ? 0 : Math.min(bevel, len * 0.3);
    section.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
    for (const h of holes ?? []) { const path = new THREE.Path(); h.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); shape.holes.push(path); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, len - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: this.lod ? 1 : segs, curveSegments: this.seg(8) });
    geo.translate(0, 0, Math.min(z0, z1) + b);
    return this.add(crease(geo), s);
  }

  /** A top-view outline (x across, z along) extruded upward from y0 to y1. */
  slab(outline: readonly (readonly [number, number])[], y0: number, y1: number, s: Surface, bevel = 0.001) {
    const shape = new THREE.Shape();
    outline.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const h = y1 - y0, b = this.lod ? 0 : Math.min(bevel, h * 0.3);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, h - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: this.lod ? 1 : 2, curveSegments: this.seg(8) });
    geo.rotateX(-Math.PI / 2); // shape y (= -z) -> -z ; extrusion -> +y
    geo.translate(0, y0 + b, 0);
    return this.add(crease(geo), s);
  }

  /** A body of revolution around the Z axis: profile points are (radius, forward distance), forward = -z. */
  lathe(profile: readonly (readonly [number, number])[], s: Surface, at: [number, number, number] = [0, 0, 0], seg = 20) {
    seg = Math.round(seg * 0.8);
    const pts = profile.map(([r, d]) => new THREE.Vector2(Math.max(0, r), d));
    const geo = new THREE.LatheGeometry(pts, this.seg(seg, 6));
    geo.rotateX(-Math.PI / 2);
    geo.translate(at[0], at[1], at[2]);
    return this.add(crease(geo, 0.7), s);
  }

  /** A rounded box centred at p. */
  box(size: readonly [number, number, number], p: readonly [number, number, number], s: Surface, r = 0.0015, rot?: readonly [number, number, number]) {
    const rr = this.lod ? 0 : Math.min(r, Math.min(...size) * 0.3);
    let geo: THREE.BufferGeometry;
    if (rr > 0.0002) {
      // A filleted rectangle extruded with a bevel: flats stay flat, every edge is rounded.
      const hx = size[0] / 2 - rr * 0.9, hy = size[1] / 2 - rr * 0.9, shape = new THREE.Shape();
      fillet([[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]], rr * 0.9, this.lod ? 1 : 2).forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
      geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, size[2] - rr * 2), bevelEnabled: true, bevelThickness: rr, bevelSize: rr * 0.9, bevelSegments: this.lod ? 1 : 2, curveSegments: 2 });
      geo.translate(0, 0, -size[2] / 2 + rr);
      geo = crease(geo);
    } else geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    geo.translate(p[0], p[1], p[2]);
    return this.add(geo, s);
  }

  /** A cylinder along an axis ('x', 'y' or 'z') centred at p. */
  cyl(r: number, len: number, axis: 'x' | 'y' | 'z', p: readonly [number, number, number], s: Surface, seg = 12, r2 = r) {
    seg = Math.max(6, Math.round(seg * 0.8));
    const geo = new THREE.CylinderGeometry(r2, r, len, this.seg(seg, 5), 1);
    if (axis === 'x') geo.rotateZ(-Math.PI / 2); else if (axis === 'z') geo.rotateX(-Math.PI / 2);
    geo.translate(p[0], p[1], p[2]);
    return this.add(crease(geo, 0.7), s);
  }

  /** A tube along a polyline of points, smoothed with a Catmull-Rom curve. */
  tube(points: readonly (readonly [number, number, number])[], r: number, s: Surface, seg = 24, radial = 8, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])), closed, 'centripetal');
    return this.add(new THREE.TubeGeometry(curve, this.seg(seg, 4), r, this.seg(radial, 4), closed), s);
  }

  sphere(r: number, p: readonly [number, number, number], s: Surface, seg = 12, scale: readonly [number, number, number] = [1, 1, 1]) {
    const geo = new THREE.SphereGeometry(r, this.seg(seg, 5), this.seg(Math.ceil(seg * 0.7), 4));
    geo.scale(scale[0], scale[1], scale[2]);
    geo.translate(p[0], p[1], p[2]);
    return this.add(geo, s);
  }

  /** Repeats `fn` and mirrors its output across x = 0 (for symmetric pins, rails, controls). */
  mirrorX(fn: () => void) {
    const n = this.pieces.length;
    fn();
    const m = new THREE.Matrix4().makeScale(-1, 1, 1);
    for (const p of this.pieces.slice(n)) {
      const g = p.geo.clone().applyMatrix4(m);
      flipWinding(g);
      this.pieces.push({ ...p, geo: g });
    }
  }

  /** Applies a transform to everything added since `mark`. */
  transformSince(mark: number, m: THREE.Matrix4) { for (const p of this.pieces.slice(mark)) p.geo.applyMatrix4(m); }
  get mark() { return this.pieces.length; }

  /** Merges every piece into one geometry with attributes position, normal, color, pbr (rough, metal, wear, pattern),
   * skinIndex and skinWeight (rigid: one bone per piece), and ao (baked occlusion, 1 = open). */
  /** Triangles per tag, for budget work. */
  census(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.pieces) out[p.tag] = (out[p.tag] ?? 0) + (p.geo.index ? p.geo.index.count : p.geo.getAttribute('position').count) / 3;
    return out;
  }

  build(opt: { ao?: boolean; aoRange?: number; aoSkipBones?: number[] } = {}): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], col: number[] = [], pbr: number[] = [], si: number[] = [], sw: number[] = [], ao: number[] = [], part: number[] = [], idx: number[] = [];
    const c = new THREE.Color(), parts = new Map<string, number>();
    // Lower levels of detail drop parts too small to see at their distance (pins, knurls, casings, lettering).
    const minR = this.lod >= 2 ? 0.009 : this.lod >= 1 ? 0.004 : 0;
    for (const p of this.pieces) {
      let g = p.geo;
      if (minR > 0) { if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere!.radius < minR) continue; }
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.index) g = indexed(g, !!p.surfs);
      const P = g.getAttribute('position'), N = g.getAttribute('normal'), base = pos.length / 3;
      c.setHex(p.s.color, THREE.SRGBColorSpace);
      const W = g.getAttribute('skinWeight'), I = g.getAttribute('skinIndex'), T = p.surfs ? g.getAttribute('tag') : null;
      const cols = p.surfs?.map(s => new THREE.Color().setHex(s.color, THREE.SRGBColorSpace));
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i));
        const ti = T ? Math.round(T.getX(i)) : -1, s = ti >= 0 && p.surfs ? p.surfs[ti] ?? p.s : p.s, cc = ti >= 0 && cols ? cols[ti] ?? c : c;
        col.push(cc.r, cc.g, cc.b); pbr.push(s.rough, s.metal, s.wear, s.pat);
        if (W && I) { si.push(I.getX(i), I.getY(i), I.getZ(i), I.getW(i)); sw.push(W.getX(i), W.getY(i), W.getZ(i), W.getW(i)); }
        else { si.push(p.bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
        ao.push(p.ao);
        // Part id: the piece's tag plus its bone, so moving parts never share a chart with the frame.
        const pk = `${p.tag}|${p.bone}`; let pid = parts.get(pk); if (pid === undefined) { pid = parts.size; parts.set(pk, pid); }
        part.push(pid);
      }
      const ix = g.index!.array;
      for (let i = 0; i < ix.length; i++) idx.push(base + ix[i]);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    out.setAttribute('pbr', new THREE.Float32BufferAttribute(pbr, 4));
    out.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    out.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    out.setAttribute('ao', new THREE.Float32BufferAttribute(ao, 1));
    out.setAttribute('part', new THREE.Float32BufferAttribute(part, 1));
    out.setIndex(idx);
    curvature(out);
    if (opt.ao !== false) bakeAO(out, opt.aoRange ?? 0.05, opt.aoSkipBones);
    out.computeBoundingSphere(); out.computeBoundingBox();
    return out;
  }
}

/** Welds vertices and recomputes normals so bevels shade smoothly while corners above the angle stay sharp. */
export function crease(g: THREE.BufferGeometry, angle = 0.6): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  const flat = g.index ? g.toNonIndexed() : g;
  const out = toCreasedNormals(flat, angle);
  return mergeVertices(out, 1e-5);
}
function indexed(g: THREE.BufferGeometry, keep = false): THREE.BufferGeometry { if (!keep) g.deleteAttribute('uv'); return mergeVertices(g, 1e-6); }
function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else { const P = g.getAttribute('position'), N = g.getAttribute('normal'); for (const A of [P, N]) { if (!A) continue; for (let i = 0; i < A.count; i += 3) { for (let k = 0; k < A.itemSize; k++) { const t = A.array[(i + 1) * A.itemSize + k]; (A.array as Float32Array)[(i + 1) * A.itemSize + k] = A.array[(i + 2) * A.itemSize + k]; (A.array as Float32Array)[(i + 2) * A.itemSize + k] = t; } } } }
}

/** Convex curvature per vertex (1/m) from the change of normal along each triangle edge, mapped to 0..1 edge wear in
 * the `edge` attribute: bevels and corners light up, flats stay 0. */
export function curvature(g: THREE.BufferGeometry) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), ix = g.index!.array, n = P.count;
  const k = new Float32Array(n);
  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), na = new THREE.Vector3(), nb = new THREE.Vector3();
  const edge = (a: number, b: number) => {
    pa.fromBufferAttribute(P, a); pb.fromBufferAttribute(P, b); na.fromBufferAttribute(N, a); nb.fromBufferAttribute(N, b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y, dz = pb.z - pa.z, l2 = dx * dx + dy * dy + dz * dz;
    if (l2 < 1e-12) return;
    const c = ((nb.x - na.x) * dx + (nb.y - na.y) * dy + (nb.z - na.z) * dz) / l2;
    if (c > k[a]) k[a] = c; if (c > k[b]) k[b] = c;
  };
  for (let t = 0; t < ix.length; t += 3) { edge(ix[t], ix[t + 1]); edge(ix[t + 1], ix[t + 2]); edge(ix[t + 2], ix[t]); }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = THREE.MathUtils.smoothstep(k[i], 60, 420);
  g.setAttribute('edge', new THREE.Float32BufferAttribute(out, 1));
}

/** Ambient occlusion per vertex from a voxelised copy of the mesh: a few rays per vertex against the occupancy grid,
 * multiplied into the `ao` attribute. Recesses (between rails, under the optic, around the magazine well) darken. */
export function bakeAO(g: THREE.BufferGeometry, range: number, skip: number[] = []) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), A = g.getAttribute('ao'), ix = g.index!.array, SI = g.getAttribute('skinIndex');
  const skipped = (v: number) => skip.length > 0 && skip.includes(SI.getX(v));
  g.computeBoundingBox();
  const bb = g.boundingBox!, size = new THREE.Vector3(); bb.getSize(size);
  const cell = Math.max(0.0025, Math.max(size.x, size.y, size.z) / 320);
  const nx = Math.ceil(size.x / cell) + 2, ny = Math.ceil(size.y / cell) + 2, nz = Math.ceil(size.z / cell) + 2;
  const grid = new Uint8Array(nx * ny * nz);
  const ox = bb.min.x - cell, oy = bb.min.y - cell, oz = bb.min.z - cell;
  const mark = (x: number, y: number, z: number) => { const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell); if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[(k * ny + j) * nx + i] = 1; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
    if (skipped(ix[t])) continue;
    a.fromBufferAttribute(P, ix[t]); b.fromBufferAttribute(P, ix[t + 1]); c.fromBufferAttribute(P, ix[t + 2]);
    const n = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / cell * 1.4));
    for (let u = 0; u <= n; u++) for (let v = 0; v <= n - u; v++) { const w = n - u - v; mark((a.x * u + b.x * v + c.x * w) / n, (a.y * u + b.y * v + c.y * w) / n, (a.z * u + b.z * v + c.z * w) / n); }
  }
  const solid = (x: number, y: number, z: number) => { const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell); return i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && grid[(k * ny + j) * nx + i] === 1; };
  // Fixed hemisphere directions (cosine-ish), rotated into each vertex's frame.
  const dirs: THREE.Vector3[] = [];
  for (let i = 0; i < 10; i++) { const phi = i * 2.399963, ct = 0.25 + 0.7 * ((i + 0.5) / 10), st = Math.sqrt(1 - ct * ct); dirs.push(new THREE.Vector3(Math.cos(phi) * st, Math.sin(phi) * st, ct)); }
  const n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), d = new THREE.Vector3(), p = new THREE.Vector3();
  const steps = Math.max(3, Math.round(range / cell));
  for (let v = 0; v < P.count; v++) {
    n.fromBufferAttribute(N, v).normalize();
    t1.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize(); t2.crossVectors(n, t1);
    let hit = 0;
    for (const s of dirs) {
      d.copy(t1).multiplyScalar(s.x).addScaledVector(t2, s.y).addScaledVector(n, s.z);
      for (let k = 2; k <= steps; k++) {
        p.fromBufferAttribute(P, v).addScaledVector(n, cell * 1.6).addScaledVector(d, k * cell);
        if (solid(p.x, p.y, p.z)) { hit += 1 - (k - 2) / steps * 0.6; break; }
      }
    }
    A.setX(v, A.getX(v) * (1 - Math.min(0.85, hit / dirs.length * 1.1)));
  }
  A.needsUpdate = true;
}

/** Rounds the corners of a polygon with fillet arcs (radius per corner or one for all). */
/** Arc points per fillet; the Builder lowers it for its lower levels of detail. */
let filletSegs = 3;
export function fillet(poly: readonly (readonly [number, number])[], r: number | readonly number[], segs = filletSegs): [number, number][] {
  segs = Math.min(segs, filletSegs);
  const out: [number, number][] = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const rr = typeof r === 'number' ? r : r[i] ?? 0, p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    if (rr <= 0) { out.push([p[0], p[1]]); continue; }
    const ax = a[0] - p[0], ay = a[1] - p[1], bx = b[0] - p[0], by = b[1] - p[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), d = Math.min(rr, la * 0.45, lb * 0.45);
    const s0: [number, number] = [p[0] + ax / la * d, p[1] + ay / la * d], s1: [number, number] = [p[0] + bx / lb * d, p[1] + by / lb * d];
    // Quadratic Bezier through the corner approximates the arc.
    for (let k = 0; k <= segs; k++) { const t = k / segs, u = 1 - t; out.push([u * u * s0[0] + 2 * u * t * p[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * p[1] + t * t * s1[1]]); }
  }
  return out;
}

/** A rectangle polygon from corners. */
export const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Counts triangles in a geometry. */
export const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
