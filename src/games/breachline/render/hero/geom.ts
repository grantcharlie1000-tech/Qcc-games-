/** Geometry toolkit for the hero models: bevelled extrusions, lathes, rounded boxes and tubes, merged into one
 * buffer per mesh with per-vertex surface parameters (albedo, roughness, metalness, wear, surface pattern), a bone
 * index for rigid parts and baked ambient occlusion. Everything is plain three.js geometry built at load. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Surface patterns the material's shader understands (fourth component of the `pbr` attribute). */
export const PAT = { metal: 0, polymer: 1, wood: 2, fabric: 3, leather: 4, skin: 5, rubber: 6, glass: 7, emissive: 8 } as const;
export interface Surface { color: number; rough: number; metal: number; wear: number; pat: number }
const S = (color: number, rough: number, metal: number, wear: number, pat: number): Surface => ({ color, rough, metal, wear, pat });

/** Material families. Wear is how strongly edges are worn back to bare metal or lighter substrate. */
export const SURF = {
  park: S(0x2b2c2d, 0.62, 0.55, 0.7, PAT.metal), // parkerised steel
  steel: S(0x4a4c4f, 0.42, 0.9, 0.5, PAT.metal), // blued / nitrided steel
  bright: S(0x8d8f91, 0.3, 1, 0.2, PAT.metal), // machined steel: bolt, pins, springs
  anod: S(0x2a2b2d, 0.48, 0.45, 0.9, PAT.metal), // black anodised aluminium
  anodFde: S(0x8a7556, 0.55, 0.25, 0.8, PAT.metal), // flat dark earth cerakote on aluminium
  anodOd: S(0x4b5240, 0.58, 0.2, 0.8, PAT.metal), // olive cerakote
  anodGrey: S(0x55595c, 0.5, 0.45, 0.9, PAT.metal), // tungsten grey cerakote
  poly: S(0x262729, 0.72, 0, 0.35, PAT.polymer),
  polyFde: S(0x86724f, 0.75, 0, 0.35, PAT.polymer),
  polyOd: S(0x4a5040, 0.75, 0, 0.35, PAT.polymer),
  rubber: S(0x1b1b1c, 0.92, 0, 0.1, PAT.rubber),
  wood: S(0x6a3f22, 0.5, 0, 0.45, PAT.wood),
  brass: S(0xb08a45, 0.28, 1, 0.1, PAT.metal),
  lens: S(0x0d1418, 0.06, 0.6, 0, PAT.glass),
  lensAmber: S(0x3a2a12, 0.05, 0.6, 0, PAT.glass),
  red: S(0xff2a1a, 0.3, 0, 0, PAT.emissive),
  tritium: S(0xb8ff7a, 0.3, 0, 0, PAT.emissive),
  white: S(0xd9d6cf, 0.6, 0, 0.1, PAT.polymer),
  // Soft goods.
  glove: S(0x2d2f2c, 0.85, 0, 0.25, PAT.leather),
  gloveTan: S(0x6e6150, 0.85, 0, 0.25, PAT.leather),
  knuckle: S(0x222322, 0.8, 0, 0.3, PAT.rubber),
  skin: S(0xb98a6a, 0.6, 0, 0, PAT.skin),
  cloth: S(0x4f5546, 0.95, 0, 0.15, PAT.fabric),
  clothDark: S(0x34382f, 0.95, 0, 0.15, PAT.fabric),
  webbing: S(0x4b4f3e, 0.9, 0, 0.2, PAT.fabric),
  plate: S(0x5a5d4c, 0.85, 0, 0.3, PAT.fabric),
  boot: S(0x2a2724, 0.7, 0, 0.3, PAT.leather),
  sole: S(0x161616, 0.95, 0, 0.1, PAT.rubber),
  helmet: S(0x4e5446, 0.7, 0, 0.45, PAT.polymer),
} as const;
export const surf = (base: Surface, over: Partial<Surface>): Surface => ({ ...base, ...over });

interface Piece { geo: THREE.BufferGeometry; s: Surface; bone: number; ao: number }

/** Accumulates parts and merges them into one indexed buffer. Coordinates are metres. */
export class Builder {
  readonly pieces: Piece[] = [];
  /** Bone index applied to everything added until changed. */
  bone = 0;
  /** Detail level: 0 full, 1 medium, 2 low. Builders read it to pick segment counts. */
  constructor(public lod = 0) {}
  seg(full: number, min = 3): number { return Math.max(min, Math.round(full / (1 + this.lod * 0.9))); }

  add(geo: THREE.BufferGeometry, s: Surface, m?: THREE.Matrix4 | null, ao = 1): THREE.BufferGeometry {
    if (m) geo.applyMatrix4(m);
    this.pieces.push({ geo, s, bone: this.bone, ao });
    return geo;
  }

  /** A side profile (z forward is negative, y up) extruded across the width (x), bevelled on every edge. */
  prism(profile: readonly (readonly [number, number])[], width: number, s: Surface, opt: { x?: number; bevel?: number; seg?: number; holes?: (readonly (readonly [number, number])[])[] } = {}) {
    const bevel = Math.min(opt.bevel ?? 0.0015, width * 0.3), shape = new THREE.Shape();
    // Shape coordinates are (forward distance, height); forward distance = -z.
    profile.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
    for (const h of opt.holes ?? []) { const path = new THREE.Path(); h.forEach(([z, y], i) => (i ? path.lineTo(-z, y) : path.moveTo(-z, y))); shape.holes.push(path); }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: this.lod ? 1 : opt.seg ?? 2, curveSegments: this.seg(8) });
    // Shape x (forward) -> -z, extrusion -> x.
    geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1));
    geo.translate((opt.x ?? 0) - (width - bevel * 2) / 2, 0, 0);
    return this.add(crease(geo), s);
  }

  /** A top-view outline (x across, z along) extruded upward from y0 to y1. */
  slab(outline: readonly (readonly [number, number])[], y0: number, y1: number, s: Surface, bevel = 0.001) {
    const shape = new THREE.Shape();
    outline.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const h = y1 - y0, b = Math.min(bevel, h * 0.3);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, h - b * 2), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b * 0.9, bevelSegments: this.lod ? 1 : 2, curveSegments: this.seg(8) });
    geo.rotateX(-Math.PI / 2); // shape y (= -z) -> -z ; extrusion -> +y
    geo.translate(0, y0 + b, 0);
    return this.add(crease(geo), s);
  }

  /** A body of revolution around the Z axis: profile points are (radius, forward distance), forward = -z. */
  lathe(profile: readonly (readonly [number, number])[], s: Surface, at: [number, number, number] = [0, 0, 0], seg = 20) {
    const pts = profile.map(([r, d]) => new THREE.Vector2(Math.max(0, r), d));
    const geo = new THREE.LatheGeometry(pts, this.seg(seg, 6));
    geo.rotateX(-Math.PI / 2);
    geo.translate(at[0], at[1], at[2]);
    return this.add(crease(geo, 0.7), s);
  }

  /** A rounded box centred at p. */
  box(size: readonly [number, number, number], p: readonly [number, number, number], s: Surface, r = 0.0015, rot?: readonly [number, number, number]) {
    const rr = Math.min(r, Math.min(...size) * 0.45);
    const geo = rr > 0.0002 ? new RoundedBoxGeometry(size[0], size[1], size[2], this.lod ? 1 : 2, rr) : new THREE.BoxGeometry(size[0], size[1], size[2]);
    if (rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
    geo.translate(p[0], p[1], p[2]);
    return this.add(geo, s);
  }

  /** A cylinder along an axis ('x', 'y' or 'z') centred at p. */
  cyl(r: number, len: number, axis: 'x' | 'y' | 'z', p: readonly [number, number, number], s: Surface, seg = 12, r2 = r) {
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
  build(opt: { ao?: boolean; aoRange?: number } = {}): THREE.BufferGeometry {
    const pos: number[] = [], nor: number[] = [], col: number[] = [], pbr: number[] = [], si: number[] = [], sw: number[] = [], ao: number[] = [], idx: number[] = [];
    const c = new THREE.Color();
    for (const p of this.pieces) {
      let g = p.geo;
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.index) g = indexed(g);
      const P = g.getAttribute('position'), N = g.getAttribute('normal'), base = pos.length / 3;
      c.setHex(p.s.color, THREE.SRGBColorSpace);
      const W = g.getAttribute('skinWeight'), I = g.getAttribute('skinIndex');
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i));
        col.push(c.r, c.g, c.b); pbr.push(p.s.rough, p.s.metal, p.s.wear, p.s.pat);
        if (W && I) { si.push(I.getX(i), I.getY(i), I.getZ(i), I.getW(i)); sw.push(W.getX(i), W.getY(i), W.getZ(i), W.getW(i)); }
        else { si.push(p.bone, 0, 0, 0); sw.push(1, 0, 0, 0); }
        ao.push(p.ao);
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
    out.setIndex(idx);
    if (opt.ao !== false) bakeAO(out, opt.aoRange ?? 0.05);
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
function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry { g.deleteAttribute('uv'); return mergeVertices(g, 1e-6); }
function flipWinding(g: THREE.BufferGeometry) {
  if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; } g.index.needsUpdate = true; }
  else { const P = g.getAttribute('position'), N = g.getAttribute('normal'); for (const A of [P, N]) { if (!A) continue; for (let i = 0; i < A.count; i += 3) { for (let k = 0; k < A.itemSize; k++) { const t = A.array[(i + 1) * A.itemSize + k]; (A.array as Float32Array)[(i + 1) * A.itemSize + k] = A.array[(i + 2) * A.itemSize + k]; (A.array as Float32Array)[(i + 2) * A.itemSize + k] = t; } } } }
}

/** Ambient occlusion per vertex from a voxelised copy of the mesh: a few rays per vertex against the occupancy grid,
 * multiplied into the `ao` attribute. Recesses (between rails, under the optic, around the magazine well) darken. */
export function bakeAO(g: THREE.BufferGeometry, range: number) {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), A = g.getAttribute('ao'), ix = g.index!.array;
  g.computeBoundingBox();
  const bb = g.boundingBox!, size = new THREE.Vector3(); bb.getSize(size);
  const cell = Math.max(0.0035, Math.max(size.x, size.y, size.z) / 220);
  const nx = Math.ceil(size.x / cell) + 2, ny = Math.ceil(size.y / cell) + 2, nz = Math.ceil(size.z / cell) + 2;
  const grid = new Uint8Array(nx * ny * nz);
  const ox = bb.min.x - cell, oy = bb.min.y - cell, oz = bb.min.z - cell;
  const mark = (x: number, y: number, z: number) => { const i = Math.floor((x - ox) / cell), j = Math.floor((y - oy) / cell), k = Math.floor((z - oz) / cell); if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) grid[(k * ny + j) * nx + i] = 1; };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < ix.length; t += 3) {
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
        p.fromBufferAttribute(P, v).addScaledVector(n, cell * 0.9).addScaledVector(d, k * cell);
        if (solid(p.x, p.y, p.z)) { hit += 1 - (k - 2) / steps * 0.6; break; }
      }
    }
    A.setX(v, A.getX(v) * (1 - Math.min(0.85, hit / dirs.length * 1.1)));
  }
  A.needsUpdate = true;
}

/** Counts triangles in a geometry. */
export const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
