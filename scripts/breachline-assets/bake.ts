/** Offline light baker for Breachline's asset renderer. Run with:
 *
 *   npx vite-node scripts/breachline-assets/bake.ts
 *
 * For each region in render/levelgeo.ts it ray-traces a lightmap atlas: the ceiling panels as soft area lights,
 * two bounces of diffuse light (bounce colour from each material's average albedo), contact occlusion from the props,
 * a dominant-light direction per texel (so normal maps can shade the baked light), L1 spherical-harmonic light probes
 * for things that move, and light at every destructible panel's cell corners. Deterministic: fixed seeds, fixed order.
 *
 * Units: a baked value V is what a white surface reflects, so a surface shows albedo x V (the old vertex bake used
 * the same scale). Lightmaps store sqrt-ish sRGB of V / LM_SCALE, so values up to LM_SCALE survive without clipping. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { CELL, WALL_H } from '../../src/games/breachline/config';
import type { FaceRec } from '../../src/games/breachline/levelmesh';
import { newWorld } from '../../src/games/breachline/map';
import { PAD, REGIONS, collectFaces, normalOf, packAtlas, pointOn, texelST, type Atlas, type Chart } from '../../src/games/breachline/render/levelgeo';
import { FIXTURE_Y, bakeLights } from '../../src/games/breachline/render/fixtures';
import { PROPS } from '../../src/games/breachline/render/props';
import { DEFAULT_ALBEDO, PROCEDURAL_ALBEDO, SURFACES } from '../../src/games/breachline/render/surfaces';
import type { TexId } from '../../src/games/breachline/textures';
import { PANEL_T, panelPoint } from '../../src/games/breachline/world';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'public', 'game-art', 'breachline');
type V3 = [number, number, number];

export const LM_SCALE = 4;
const DENSITY = Number(process.env.BAKE_DENSITY ?? 16);
const LAMP_SAMPLES = 12, BOUNCE_RAYS = Number(process.env.BAKE_RAYS ?? 96), PROBE_RAYS = 384;
/** Lamp panel brightness (V-units of radiance x 1/pi); tuned so the floor under a lamp reads about 1.1. */
const LAMP_POWER = 14;
/** Troffer beams are tighter than a flat Lambert panel: cos^2 about the downward axis (normalised to the same power). */
const BEAM = 1.5;
/** The bright margin a recessed fitting throws on the ceiling tiles around it, and how fast it falls away (m). */
const HALO = 0.9, HALO_FALL = 0.28;
/** Contact occlusion on bounced light: rays that hit something closer than this darken corners and prop footprints. */
const CONTACT = 0.4, CONTACT_STRENGTH = 0.75;
const LAMP_Y = FIXTURE_Y;
const LIGHTS = bakeLights();

// ---- deterministic random ----
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---- materials ----
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
async function averageAlbedo(file: string): Promise<V3> {
  const { data } = await sharp(file).resize(64, 64).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const s: V3 = [0, 0, 0];
  for (let i = 0; i < data.length; i += 3) for (let k = 0; k < 3; k++) s[k] += toLinear(data[i + k] / 255);
  return s.map(v => v / (data.length / 3)) as V3;
}
const setAlbedo = new Map<string, V3>();
async function albedoOf(tex: TexId, tint: V3): Promise<V3> {
  const s = SURFACES[tex];
  let base: V3;
  if (s) {
    if (!setAlbedo.has(s.set)) setAlbedo.set(s.set, await averageAlbedo(join(HERE, '.cache', s.set, `${s.set}_diff.jpg`)));
    base = setAlbedo.get(s.set)!;
    const t = s.tint ?? [1, 1, 1];
    base = [base[0] * t[0], base[1] * t[1], base[2] * t[2]];
  } else base = PROCEDURAL_ALBEDO[tex] ?? DEFAULT_ALBEDO;
  return [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
}

// ---- scene triangles ----
interface Tri { albedo: V3; n: V3; chart: number; region: number }
const tris: Tri[] = [];
const pos: number[] = [], triOf: number[] = [];
function addTri(a: V3, b: V3, c: V3, t: Tri) {
  const id = tris.length; tris.push(t);
  pos.push(...a, ...b, ...c); triOf.push(id, id, id);
}
function addQuad(p: V3[], t: Tri) { addTri(p[0], p[1], p[2], t); addTri(p[0], p[2], p[3], t); }
function addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, albedo: V3) {
  const c = (x: number, y: number, z: number): V3 => [x, y, z];
  const faces: [V3[], V3][] = [
    [[c(x1, y0, z1), c(x1, y0, z0), c(x1, y1, z0), c(x1, y1, z1)], [1, 0, 0]],
    [[c(x0, y0, z0), c(x0, y0, z1), c(x0, y1, z1), c(x0, y1, z0)], [-1, 0, 0]],
    [[c(x0, y1, z1), c(x1, y1, z1), c(x1, y1, z0), c(x0, y1, z0)], [0, 1, 0]],
    [[c(x0, y0, z0), c(x1, y0, z0), c(x1, y0, z1), c(x0, y0, z1)], [0, -1, 0]],
    [[c(x0, y0, z1), c(x1, y0, z1), c(x1, y1, z1), c(x0, y1, z1)], [0, 0, 1]],
    [[c(x1, y0, z0), c(x0, y0, z0), c(x0, y1, z0), c(x1, y1, z0)], [0, 0, -1]],
  ];
  for (const [q, n] of faces) addQuad(q, { albedo, n, chart: -1, region: -1 });
}

/** Triangles of a binary glTF with every node transform applied, then the placement. */
async function glbTriangles(file: string, place: THREE.Matrix4): Promise<V3[][]> {
  const buf = await readFile(file);
  const jlen = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
  const bin = buf.subarray(20 + jlen + 8);
  const acc = (i: number) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'SCALAR']!, size = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[a.componentType as 5126]!;
    const stride = v.byteStride || comps * size, out: number[] = [];
    const read = (at: number) => (a.componentType === 5126 ? bin.readFloatLE(at) : a.componentType === 5125 ? bin.readUInt32LE(at) : a.componentType === 5123 ? bin.readUInt16LE(at) : bin.readUInt8(at));
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comps; c++) out.push(read(off + k * stride + c * size));
    return out;
  };
  const out: V3[][] = [];
  const visit = (ni: number, parent: THREE.Matrix4) => {
    const n = json.nodes[ni], m = new THREE.Matrix4();
    if (n.matrix) m.fromArray(n.matrix);
    else m.compose(new THREE.Vector3(...(n.translation ?? [0, 0, 0])), new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(n.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(m);
    if (n.mesh !== undefined) for (const p of json.meshes[n.mesh].primitives) {
      const P = acc(p.attributes.POSITION), I = p.indices !== undefined ? acc(p.indices) : [...Array(P.length / 3).keys()];
      const v = new THREE.Vector3();
      const at = (k: number): V3 => { v.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]).applyMatrix4(world); return [v.x, v.y, v.z]; };
      for (let k = 0; k < I.length; k += 3) out.push([at(I[k]), at(I[k + 1]), at(I[k + 2])]);
    }
    for (const c of n.children ?? []) visit(c, world);
  };
  for (const r of json.scenes[json.scene ?? 0].nodes) visit(r, place);
  return out;
}
export const placementMatrix = (p: { x: number; y: number; z: number; yaw: number; scale?: number }) =>
  new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw), new THREE.Vector3().setScalar(p.scale ?? 1));

// ---- ray casting ----
let bvh: MeshBVH, index: THREE.BufferAttribute;
const ray = new THREE.Ray(), o3 = new THREE.Vector3(), d3 = new THREE.Vector3();
function cast(o: V3, d: V3, far = Infinity): { t: number; tri: number; p: V3 } | null {
  ray.origin.set(o[0], o[1], o[2]); ray.direction.set(d[0], d[1], d[2]);
  const h = bvh.raycastFirst(ray, THREE.DoubleSide, 0, far);
  if (!h) return null;
  return { t: h.distance, tri: triOf[index.getX(h.faceIndex! * 3)], p: [h.point.x, h.point.y, h.point.z] };
}
const occluded = (o: V3, p: V3) => {
  const d: V3 = [p[0] - o[0], p[1] - o[1], p[2] - o[2]], len = Math.hypot(...d);
  ray.origin.set(o[0], o[1], o[2]); ray.direction.set(d[0] / len, d[1] / len, d[2] / len);
  return !!bvh.raycastFirst(ray, THREE.DoubleSide, 0, len - 0.01);
};
void o3; void d3;

/** Cosine-weighted direction about n. */
function cosineDir(n: V3, u1: number, u2: number): V3 {
  const r = Math.sqrt(u1), a = 2 * Math.PI * u2, x = r * Math.cos(a), y = r * Math.sin(a), z = Math.sqrt(Math.max(0, 1 - u1));
  const t: V3 = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const b1: V3 = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]], l = Math.hypot(...b1);
  b1[0] /= l; b1[1] /= l; b1[2] /= l;
  const b2: V3 = [n[1] * b1[2] - n[2] * b1[1], n[2] * b1[0] - n[0] * b1[2], n[0] * b1[1] - n[1] * b1[0]];
  return [b1[0] * x + b2[0] * y + n[0] * z, b1[1] * x + b2[1] * y + n[1] * z, b1[2] * x + b2[2] * y + n[2] * z];
}

/** Direct light from the ceiling panels at p (normal n). Also returns the light-weighted direction. */
function direct(p: V3, n: V3, samples: number): { v: V3; dir: V3 } {
  const v: V3 = [0, 0, 0], dir: V3 = [0, 0, 0];
  const sx = Math.max(1, Math.round(Math.sqrt(samples * 2))), sz = Math.max(1, Math.round(samples / sx));
  for (const l of LIGHTS) {
    const dx0 = l.x - p[0], dz0 = l.z - p[2], LAMP_W = l.w, LAMP_D = l.d;
    if (dx0 * dx0 + dz0 * dz0 > (l.range + 3) ** 2) continue;
    let acc = 0;
    for (let i = 0; i < sx; i++) for (let j = 0; j < sz; j++) {
      const q: V3 = [l.x + ((i + rnd()) / sx - 0.5) * LAMP_W, LAMP_Y, l.z + ((j + rnd()) / sz - 0.5) * LAMP_D];
      const d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], dl = Math.sqrt(d2);
      const cs = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / dl, cl = d[1] / dl; // lamp faces down
      if (cs <= 0 || cl <= 0) continue;
      if (occluded(p, q)) continue;
      const w = cs * cl * cl * BEAM / Math.max(d2, 0.05);
      acc += w;
      dir[0] += w * d[0] / dl; dir[1] += w * d[1] / dl; dir[2] += w * d[2] / dl;
    }
    let k = LAMP_POWER * LAMP_W * LAMP_D / (sx * sz) * acc;
    // Ceiling just around the fitting: the housing's lip and diffuser spill.
    if (n[1] < -0.5 && p[1] > LAMP_Y - 0.1) {
      const ox = Math.max(0, Math.abs(p[0] - l.x) - LAMP_W / 2), oz = Math.max(0, Math.abs(p[2] - l.z) - LAMP_D / 2);
      k += HALO * Math.exp(-Math.hypot(ox, oz) / HALO_FALL);
    }
    v[0] += k * l.color[0]; v[1] += k * l.color[1]; v[2] += k * l.color[2];
  }
  return { v, dir };
}

// ---- main ----
async function main() {
  const t0 = performance.now();
  const { byRegion, rest } = collectFaces();
  const atlases: Atlas[] = byRegion.map(f => packAtlas(f.filter(x => !x.glow), DENSITY));
  // Static faces. Lamp panels are left out: the light samples sit just under them.
  const faceTri = async (f: FaceRec, chart: number, region: number) => {
    if (f.glow) return;
    const n = normalOf(f), albedo = await albedoOf(f.tex, f.tint);
    addQuad([pointOn(f, 0, 0), pointOn(f, f.lu, 0), pointOn(f, f.lu, f.lv), pointOn(f, 0, f.lv)], { albedo, n, chart, region });
  };
  for (const [r, a] of atlases.entries()) for (const [i, c] of a.charts.entries()) await faceTri(c.face, i, r);
  for (const f of rest) await faceTri(f, -1, -1);
  // Destructible panels as a round starts: shut ones are solid, open doorways are not.
  const world = newWorld(), plaster = await albedoOf('drywall', [1, 1, 1]), wood: V3 = [0.3, 0.2, 0.12];
  for (const p of world.panels) {
    if (!p.intact) continue;
    const half = (p.kind === 'wall' ? PANEL_T : 0.07) / 2, a = panelPoint(p, p.u0, p.y0, -half), b = panelPoint(p, p.u0 + p.cols * CELL, p.y0 + p.rows * CELL, half);
    addBox(Math.min(a.x, b.x), a.y, Math.min(a.z, b.z), Math.max(a.x, b.x), b.y, Math.max(a.z, b.z), p.kind === 'wall' ? plaster : wood);
  }
  // Props occlude and bounce.
  for (const pl of PROPS) {
    const file = join(OUT, 'models', `${pl.model}.glb`), albedo = await averageAlbedo(join(HERE, '.cache', pl.model, 'textures', (await readFile(join(HERE, '.cache', pl.model, `${pl.model}.gltf`), 'utf8')).match(/textures\/([^"]*diff[^"]*)"/)![1]));
    for (const [a, b, c] of await glbTriangles(file, placementMatrix(pl))) {
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n) || 1;
      addTri(a, b, c, { albedo, n: [n[0] / l, n[1] / l, n[2] / l], chart: -1, region: -1 });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  bvh = new MeshBVH(geo);
  index = geo.index!;
  console.log(`scene: ${tris.length} triangles, BVH in ${(performance.now() - t0).toFixed(0)} ms`);
  if (process.env.BAKE_PROBE) {
    { const p: V3 = [-1, 1.5, -9.8], q: V3 = [-3.5, LAMP_Y, -6], d: V3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], l = Math.hypot(...d); const h = cast(p, [d[0] / l, d[1] / l, d[2] / l]); console.log('hit', h, h && tris[h.tri], l); }
    for (const [p, n] of [[[-1, 0.03, -8], [0, 1, 0]], [[-5.9, 1.5, -8], [1, 0, 0]], [[-1, 1.5, -9.84], [0, 0, 1]], [[-3.5, 0.01, -4.5], [0, 1, 0]]] as [V3, V3][]) console.log(p, direct(p, n, 64).v.map(v => v.toFixed(3)));
    return;
  }

  for (const [r, region] of REGIONS.entries()) {
    const atlas = atlases[r], W = atlas.width, H = atlas.height, N = W * H;
    const dirV = new Float32Array(N * 3), indirect = new Float32Array(N * 3), dirW = new Float32Array(N * 3);
    const direct3 = new Float32Array(N * 3), valid = new Uint8Array(N), chartAt = new Int32Array(N).fill(-1), contact = new Float32Array(N).fill(1);
    const texel = (c: Chart, i: number, j: number) => (c.y + PAD + j) * W + c.x + PAD + i;
    const t1 = performance.now();
    let texels = 0;
    // Direct light, and which texels are buried inside other geometry (floor under a bench, say).
    for (const [ci, c] of atlas.charts.entries()) {
      const n = normalOf(c.face);
      for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) {
        const [s, t] = texelST(c, i, j), q = pointOn(c.face, s, t), p: V3 = [q[0] + n[0] * 0.01, q[1] + n[1] * 0.01, q[2] + n[2] * 0.01];
        const k = texel(c, i, j);
        chartAt[k] = ci; texels++;
        // Buried: a short ray along the normal hits the back of something.
        let buried = 0;
        for (let m = 0; m < 6; m++) {
          const d = cosineDir(n, rnd() * 0.9, rnd()), h = cast(p, d, 0.25);
          if (h && tris[h.tri].n[0] * d[0] + tris[h.tri].n[1] * d[1] + tris[h.tri].n[2] * d[2] > 0) buried++;
        }
        if (buried >= 3) continue;
        valid[k] = 1;
        const dl = direct(p, n, LAMP_SAMPLES);
        direct3.set(dl.v, k * 3);
        const lum = dl.v[0] * 0.3 + dl.v[1] * 0.59 + dl.v[2] * 0.11, dlen = Math.hypot(...dl.dir) || 1;
        for (let m = 0; m < 3; m++) dirW[k * 3 + m] = dl.dir[m] / dlen * lum;
      }
    }
    console.log(`${region.name}: ${texels} texels (${W}x${H}), direct in ${((performance.now() - t1) / 1000).toFixed(1)} s`);
    // Light leaving a point a bounce ray hit: from this region's atlas where it has one, else computed there.
    const outgoing = (h: { tri: number; p: V3 }, field: Float32Array | null): V3 => {
      const T = tris[h.tri];
      if (T.region === r && field) {
        const c = atlas.charts[T.chart], f = c.face, d = [h.p[0] - f.o[0], h.p[1] - f.o[1], h.p[2] - f.o[2]];
        const s = d[0] * f.u[0] + d[1] * f.u[1] + d[2] * f.u[2], t = d[0] * f.v[0] + d[1] * f.v[1] + d[2] * f.v[2];
        const i = Math.min(c.w - 1, Math.max(0, Math.floor(s / f.lu * c.w))), j = Math.min(c.h - 1, Math.max(0, Math.floor(t / f.lv * c.h)));
        const k = texel(c, i, j);
        if (valid[k]) return [field[k * 3] * T.albedo[0], field[k * 3 + 1] * T.albedo[1], field[k * 3 + 2] * T.albedo[2]];
      }
      const n = T.n, p: V3 = [h.p[0] + n[0] * 0.01, h.p[1] + n[1] * 0.01, h.p[2] + n[2] * 0.01];
      // Hit from behind (a double-sided prop): light the side the ray came from.
      const v = direct(p, n, 2).v;
      return [v[0] * T.albedo[0], v[1] * T.albedo[1], v[2] * T.albedo[2]];
    };
    // Two bounces: gather direct-lit surroundings, then gather again from (direct + first bounce).
    let field = direct3;
    for (let bounce = 0; bounce < 2; bounce++) {
      const t2 = performance.now(), next = new Float32Array(N * 3);
      for (const c of atlas.charts) {
        const n = normalOf(c.face);
        for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) {
          const k = texel(c, i, j);
          if (!valid[k]) continue;
          const [s, t] = texelST(c, i, j), q = pointOn(c.face, s, t), p: V3 = [q[0] + n[0] * 0.01, q[1] + n[1] * 0.01, q[2] + n[2] * 0.01];
          const acc: V3 = [0, 0, 0];
          const sq = Math.round(Math.sqrt(BOUNCE_RAYS));
          let near = 0;
          for (let a = 0; a < sq; a++) for (let b = 0; b < sq; b++) {
            const d = cosineDir(n, (a + rnd()) / sq, (b + rnd()) / sq), h = cast(p, d);
            if (!h) continue;
            if (h.t < CONTACT) near += 1 - h.t / CONTACT;
            const L = outgoing(h, field);
            acc[0] += L[0]; acc[1] += L[1]; acc[2] += L[2];
            if (bounce === 1) { const w = (L[0] * 0.3 + L[1] * 0.59 + L[2] * 0.11) / (sq * sq); dirW[k * 3] += d[0] * w; dirW[k * 3 + 1] += d[1] * w; dirW[k * 3 + 2] += d[2] * w; }
          }
          for (let m = 0; m < 3; m++) next[k * 3 + m] = acc[m] / (sq * sq);
          if (bounce === 0) contact[k] = 1 - CONTACT_STRENGTH * Math.min(1, near / (sq * sq) * 2.5);
        }
      }
      // Smooth the noisy gather inside each chart before it feeds the next bounce.
      denoise(atlas, next, valid, W);
      // Contact occlusion is applied after the blur so it stays sharp in corners and under props.
      for (let k = 0; k < N; k++) for (let m = 0; m < 3; m++) next[k * 3 + m] *= contact[k];
      for (let k = 0; k < N * 3; k++) indirect[k] = next[k];
      field = new Float32Array(N * 3);
      for (let k = 0; k < N * 3; k++) field[k] = direct3[k] + next[k];
      console.log(`${region.name}: bounce ${bounce + 1} in ${((performance.now() - t2) / 1000).toFixed(1)} s`);
    }
    for (let k = 0; k < N * 3; k++) dirV[k] = field[k];
    // Mean baked light over the room's surfaces: what reflections are normalised against (specular occlusion).
    let meanLight = 0, meanN = 0;
    for (let k = 0; k < N; k++) if (valid[k]) { meanLight += field[k * 3] * 0.3 + field[k * 3 + 1] * 0.59 + field[k * 3 + 2] * 0.11; meanN++; }
    meanLight /= Math.max(1, meanN);
    dilate(atlas, dirV, valid, W); dilate(atlas, dirW, valid, W);
    await writeAtlas(join(OUT, 'bake', `${region.name}-light.png`), dirV, W, H, v => srgb(v / LM_SCALE));
    // Direction: light-weighted mean direction; its length is how directional the light is.
    const dirOut = new Float32Array(N * 3);
    for (let k = 0; k < N; k++) {
      const lum = dirV[k * 3] * 0.3 + dirV[k * 3 + 1] * 0.59 + dirV[k * 3 + 2] * 0.11;
      for (let m = 0; m < 3; m++) dirOut[k * 3 + m] = (lum > 1e-5 ? dirW[k * 3 + m] / lum : 0) * 0.5 + 0.5;
    }
    await writeAtlas(join(OUT, 'bake', `${region.name}-dir.png`), dirOut, W, H, v => v);

    // Light probes for props, fighters and the weapon: per prop, and a 1 m grid at two heights.
    const probe = (p: V3) => {
      const sh = new Float32Array(12);
      for (let m = 0; m < PROBE_RAYS; m++) {
        const z = 1 - 2 * (m + 0.5) / PROBE_RAYS, rr = Math.sqrt(1 - z * z), a = m * 2.399963 + rnd() * 0.01, d: V3 = [rr * Math.cos(a), z, rr * Math.sin(a)];
        let L: V3 = [0, 0, 0];
        const h = cast(p, d);
        // Rays that reach a lamp panel see the lamp.
        const tl = d[1] > 0 ? (LAMP_Y - p[1]) / d[1] : Infinity;
        let lit = false;
        if (tl < (h ? h.t : Infinity)) {
          const x = p[0] + d[0] * tl, zz = p[2] + d[2] * tl;
          for (const l of LIGHTS) if (Math.abs(x - l.x) < l.w / 2 && Math.abs(zz - l.z) < l.d / 2) { L = [l.color[0] * LAMP_POWER * Math.PI, l.color[1] * LAMP_POWER * Math.PI, l.color[2] * LAMP_POWER * Math.PI]; lit = true; break; }
        }
        if (!lit && h) L = outgoing(h, field);
        const Y = [0.282095, 0.488603 * d[1], 0.488603 * d[2], 0.488603 * d[0]];
        for (let c = 0; c < 4; c++) for (let ch = 0; ch < 3; ch++) sh[c * 3 + ch] += L[ch] * Y[c] * 4 * Math.PI / PROBE_RAYS;
      }
      return [...sh].map(v => +v.toFixed(4));
    };
    const props = PROPS.map(pl => probe([pl.x, pl.y + 0.4, pl.z]));
    const grid: number[][] = [], gx = Math.round(region.x1 - region.x0), gz = Math.round(region.z1 - region.z0);
    for (const y of [0.6, 1.6]) for (let j = 0; j <= gz; j++) for (let i = 0; i <= gx; i++) grid.push(probe([region.x0 + Math.min(Math.max(i, 0.25), gx - 0.25), y, region.z0 + Math.min(Math.max(j, 0.25), gz - 0.25)]));
    // Destructible panels that face into the region: light at each cell corner, on the side facing in.
    const panels: { index: number; side: number; light: number[] }[] = [];
    world.panels.forEach((p, index) => {
      for (const side of [1, -1]) {
        const n: V3 = p.axis === 'x' ? [0, 0, side] : [side, 0, 0], c = panelPoint(p, p.u0 + p.cols * CELL / 2, p.y0 + 0.5, side * 0.2);
        if (!(c.x > region.x0 && c.x < region.x1 && c.z > region.z0 && c.z < region.z1)) continue;
        const light: number[] = [];
        for (let rr = 0; rr <= p.rows; rr++) for (let cc = 0; cc <= p.cols; cc++) {
          // Corners on the panel's rim sit in the floor, the header or a post; sample just inside them.
          const u = Math.min(Math.max(p.u0 + cc * CELL, p.u0 + 0.14), p.u0 + p.cols * CELL - 0.14), yy = Math.min(Math.max(p.y0 + rr * CELL, Math.max(p.y0, 0.03) + 0.04), p.y0 + p.rows * CELL - 0.04);
          const w = panelPoint(p, u, yy, side * (PANEL_T / 2 + 0.012)), q: V3 = [w.x, w.y, w.z];
          const dl = direct(q, n, LAMP_SAMPLES).v, acc: V3 = [0, 0, 0], R = 48;
          for (let m = 0; m < R; m++) { const d = cosineDir(n, (m + rnd()) / R, rnd()), h = cast(q, d); if (h) { const L = outgoing(h, field); acc[0] += L[0]; acc[1] += L[1]; acc[2] += L[2]; } }
          light.push(...[0, 1, 2].map(k => +(dl[k] + acc[k] / R).toFixed(4)));
        }
        panels.push({ index, side, light });
      }
    });
    await mkdir(join(OUT, 'bake'), { recursive: true });
    await writeFile(join(OUT, 'bake', `${region.name}.json`), JSON.stringify({
      version: 1, region: region.name, meanLight: +meanLight.toFixed(4), rect: [region.x0, region.z0, region.x1, region.z1], width: W, height: H, density: DENSITY, scale: LM_SCALE,
      props, grid: { x0: region.x0, z0: region.z0, nx: gx + 1, nz: gz + 1, heights: [0.6, 1.6], sh: grid }, panels,
    }) + '\n');
    console.log(`${region.name}: probes and panels done, total ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
}

const srgb = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
async function writeAtlas(file: string, data: Float32Array, W: number, H: number, enc: (v: number) => number) {
  const px = Buffer.alloc(W * H * 4);
  for (let k = 0; k < W * H; k++) { for (let m = 0; m < 3; m++) px[k * 4 + m] = Math.round(Math.min(1, Math.max(0, enc(data[k * 3 + m]))) * 255); px[k * 4 + 3] = 255; }
  await mkdir(dirname(file), { recursive: true });
  await sharp(px, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
}

/** Edge-aware blur of a gathered field, within each chart, over texels that are not buried. */
function denoise(atlas: Atlas, f: Float32Array, valid: Uint8Array, W: number) {
  const R = 2;
  for (const c of atlas.charts) {
    const x0 = c.x + PAD, y0 = c.y + PAD, src = new Float32Array(c.w * c.h * 3);
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) for (let m = 0; m < 3; m++) src[(j * c.w + i) * 3 + m] = f[((y0 + j) * W + x0 + i) * 3 + m];
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) {
      const k = (y0 + j) * W + x0 + i;
      if (!valid[k]) continue;
      const me = src[(j * c.w + i) * 3] + src[(j * c.w + i) * 3 + 1] + src[(j * c.w + i) * 3 + 2];
      const acc = [0, 0, 0];
      let wsum = 0;
      for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) {
        const ii = i + a, jj = j + b;
        if (ii < 0 || jj < 0 || ii >= c.w || jj >= c.h || !valid[(y0 + jj) * W + x0 + ii]) continue;
        const q = (jj * c.w + ii) * 3, them = src[q] + src[q + 1] + src[q + 2];
        const w = Math.exp(-(a * a + b * b) / 4) * Math.exp(-((them - me) ** 2) / (2 * (0.25 * me + 0.02) ** 2));
        acc[0] += src[q] * w; acc[1] += src[q + 1] * w; acc[2] += src[q + 2] * w; wsum += w;
      }
      for (let m = 0; m < 3; m++) f[k * 3 + m] = acc[m] / wsum;
    }
  }
}

/** Fills buried texels and each chart's border from the nearest good texel, so filtering never reads black. */
function dilate(atlas: Atlas, f: Float32Array, valid: Uint8Array, W: number) {
  for (const c of atlas.charts) {
    const w = c.w + PAD * 2, h = c.h + PAD * 2, ok = new Uint8Array(w * h);
    for (let j = 0; j < c.h; j++) for (let i = 0; i < c.w; i++) ok[(j + PAD) * w + i + PAD] = valid[(c.y + PAD + j) * W + c.x + PAD + i];
    if (!ok.some(v => v)) continue;
    for (let pass = 0; pass < w + h; pass++) {
      let changed = false;
      const next = ok.slice();
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        if (ok[j * w + i]) continue;
        const acc = [0, 0, 0];
        let n = 0;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + a, jj = j + b;
          if (ii < 0 || jj < 0 || ii >= w || jj >= h || !ok[jj * w + ii]) continue;
          const q = ((c.y + jj) * W + c.x + ii) * 3;
          acc[0] += f[q]; acc[1] += f[q + 1]; acc[2] += f[q + 2]; n++;
        }
        if (!n) continue;
        const q = ((c.y + j) * W + c.x + i) * 3;
        f[q] = acc[0] / n; f[q + 1] = acc[1] / n; f[q + 2] = acc[2] / n; next[j * w + i] = 1; changed = true;
      }
      ok.set(next);
      if (!changed) break;
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
