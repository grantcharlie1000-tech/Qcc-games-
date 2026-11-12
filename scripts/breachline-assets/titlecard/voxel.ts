/** A small isometric voxel renderer that writes SVG paths.
 *
 *  Projection: screen X = x - y, screen Y = ((x + y) / 2 - z), so every visible voxel face (top, +y, +x)
 *  covers two triangles of one fixed screen lattice. Each lattice triangle keeps only its frontmost face,
 *  so there is no overdraw, and same-colour triangles are merged into polygons by cancelling shared edges. */
import { LIGHT, P, type Material } from './palette.ts';

export type Vox = { m: Material; noShadow?: boolean };
/** A point light; with `dir` and `cut` it is a spot whose cone ends where cos(angle) = cut. */
export type PointLight = { x: number; y: number; z: number; rgb: readonly number[]; range: number; power: number; dir?: readonly number[]; cut?: number };

const EMISSIVE = new Set<Material>(['uplinkGlow', 'screen', 'fire']);
const K = (x: number, y: number, z: number) => ((x + 128) * 512 + (y + 128)) * 512 + (z + 128);

/** Deterministic hash noise in [0, 1). */
export function hash(x: number, y: number, z = 0, seed = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 144665)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Grid {
  v = new Map<number, { x: number; y: number; z: number; vox: Vox }>();
  lights: PointLight[] = [];
  set(x: number, y: number, z: number, m: Material | null, o: Partial<Vox> = {}): this {
    if (m) this.v.set(K(x, y, z), { x, y, z, vox: { m, ...o } });
    else this.v.delete(K(x, y, z));
    return this;
  }
  get(x: number, y: number, z: number) { return this.v.get(K(x, y, z))?.vox; }
  box(x0: number, y0: number, z0: number, dx: number, dy: number, dz: number, m: Material | null | ((x: number, y: number, z: number) => Material | null), o?: Partial<Vox>): this {
    for (let x = x0; x < x0 + dx; x++) for (let y = y0; y < y0 + dy; y++) for (let z = z0; z < z0 + dz; z++)
      this.set(x, y, z, typeof m === 'function' ? m(x, y, z) : m, o);
    return this;
  }
}

// ---------- colour ----------
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const hex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
export const luminance = (h: string) => { const [r, g, b] = rgb(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// ---------- lighting ----------
type Face = 0 | 1 | 2; // top, left (+y), right (+x)
const NORMAL: readonly (readonly [number, number, number])[] = [[0, 0, 1], [0, 1, 0], [1, 0, 0]];

function shade(g: Grid, x: number, y: number, z: number, f: Face, vox: Vox): string {
  const base = P[vox.m][f];
  if (EMISSIVE.has(vox.m)) return base;
  const n = NORMAL[f];
  const cx = x + 0.5 + n[0] * 0.5, cy = y + 0.5 + n[1] * 0.5, cz = z + 0.5 + n[2] * 0.5;
  // Ambient occlusion: occupied cells touching the face's outer layer.
  const ox = x + n[0], oy = y + n[1], oz = z + n[2];
  const side = f === 0 ? [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]] : f === 1 ? [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]] : [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let occ = 0;
  for (const [a, b, c] of side) if (g.get(ox + a, oy + b, oz + c)) occ++;
  const ao = 1 - Math.min(2, occ) * 0.09;
  const light = LIGHT.ambient.map((a, i) => (a + LIGHT.fill[i]) * ao);
  for (const L of g.lights) {
    const dx = L.x - cx, dy = L.y - cy, dz = L.z - cz, d = Math.hypot(dx, dy, dz);
    const ndl = (dx * n[0] + dy * n[1] + dz * n[2]) / d;
    if (ndl <= 0) continue;
    let k = L.power * ndl / (1 + (d / L.range) ** 2);
    if (L.dir && L.cut !== undefined) k *= Math.max(0, Math.min(1, (-(dx * L.dir[0] + dy * L.dir[1] + dz * L.dir[2]) / d - L.cut) / ((1 - L.cut) * 0.5)));
    if (k < 0.04) continue;
    // Shadow ray through the voxel grid.
    const steps = Math.ceil(d / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps, px = Math.floor(cx + n[0] * 0.01 + dx * t), py = Math.floor(cy + n[1] * 0.01 + dy * t), pz = Math.floor(cz + n[2] * 0.01 + dz * t);
      if (px === x && py === y && pz === z) continue;
      const o = g.get(px, py, pz);
      if (o && !o.noShadow && !EMISSIVE.has(o.m)) { k = 0; break; }
    }
    k = Math.min(1.4, Math.round(k * 5) / 5); // quantised, so equal surfaces share a colour
    if (k) for (let i = 0; i < 3; i++) light[i] += L.rgb[i] * k;
  }
  const c = rgb(base).map((v, i) => v * light[i]);
  // Keep hue when a channel overflows, then let very bright light bloom toward white.
  const peak = Math.max(...c), over = Math.max(0, peak - 1);
  return hex(c.map((v) => v / Math.max(1, peak) + over * 0.25));
}

// ---------- lattice triangles ----------
type Tri = { fill: string; depth: number };

export type Polys = { fill: string; loops: [number, number][][] }[];

/** Visible, merged polygons of the grid, in lattice units (X, 2·Y). */
export function rasterise(g: Grid): Polys {
  const tris = new Map<string, Tri & { X: number; top: number; dir: number }>();
  const put = (X: number, top: number, dir: number, fill: string, depth: number) => {
    const k = `${X},${top},${dir}`, o = tris.get(k);
    if (!o || depth > o.depth) tris.set(k, { X, top, dir, fill, depth });
  };
  const solid = (x: number, y: number, z: number) => !!g.get(x, y, z);
  for (const { x, y, z, vox } of g.v.values()) {
    const X = x - y, Y = x + y - 2 * z, s = x + y + z;
    if (!solid(x, y, z + 1)) { const c = shade(g, x, y, z, 0, vox); put(X, Y - 2, 1, c, s + 2); put(X, Y - 2, -1, c, s + 2); }
    if (!solid(x, y + 1, z)) { const c = shade(g, x, y, z, 1, vox); put(X - 1, Y - 1, 1, c, s + 2); put(X, Y, -1, c, s + 2); }
    if (!solid(x + 1, y, z)) { const c = shade(g, x, y, z, 2, vox); put(X + 1, Y - 1, -1, c, s + 2); put(X, Y, 1, c, s + 2); }
  }
  const byFill = new Map<string, [number, number, number][]>();
  for (const t of tris.values()) {
    const l = byFill.get(t.fill) ?? []; l.push([t.X, t.top, t.dir]); byFill.set(t.fill, l);
  }
  const out: Polys = [];
  for (const [fill, list] of [...byFill].sort((a, b) => luminance(a[0]) - luminance(b[0]) || (a[0] < b[0] ? -1 : 1))) {
    out.push({ fill, loops: mergeTriangles(list) });
  }
  return out;
}

const VK = (x: number, y: number) => (x + 4096) * 16384 + (y + 8192);
const unVK = (k: number): [number, number] => [Math.floor(k / 16384) - 4096, (k % 16384) - 8192];

/** Union of lattice triangles: shared edges cancel, the rest chain into loops. */
export function mergeTriangles(list: readonly (readonly [number, number, number])[]): [number, number][][] {
  const edges = new Map<string, [number, number]>();
  const add = (a: number, b: number) => { const back = `${b}>${a}`; if (edges.has(back)) edges.delete(back); else edges.set(`${a}>${b}`, [a, b]); };
  for (const [X, top, dir] of list) {
    const v0 = VK(X, top), v1 = VK(X, top + 2), v2 = VK(X + dir, top + 1);
    const ring = dir > 0 ? [v0, v1, v2] : [v0, v2, v1];
    add(ring[0], ring[1]); add(ring[1], ring[2]); add(ring[2], ring[0]);
  }
  const next = new Map<number, number[]>();
  for (const [a, b] of [...edges.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1])) { const l = next.get(a) ?? []; l.push(b); next.set(a, l); }
  const loops: [number, number][][] = [];
  for (const start of [...next.keys()].sort((a, b) => a - b)) {
    while ((next.get(start)?.length ?? 0) > 0) {
      const ring: number[] = [];
      let v = start;
      do { ring.push(v); const l = next.get(v)!; v = l.shift()!; } while (v !== start);
      const pts = ring.map(unVK);
      // Drop collinear points.
      const simple = pts.filter((p, i) => {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[(i + 1) % pts.length];
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      loops.push(simple);
    }
  }
  return loops;
}

export type View = { s: number; ox: number; oy: number };
const n1 = (v: number) => { const r = Math.round(v * 10) / 10; return Object.is(r, -0) ? '0' : String(r); };

/** Lattice point to screen point. */
export const toScreen = (v: View, X: number, Y2: number): [number, number] => [v.ox + X * v.s, v.oy + Y2 * v.s / 2];

/** Paths, one per colour. Faces are stroked in their own colour to hide anti-aliasing seams. */
export function pathsSvg(polys: Polys, v: View, stroke = 0.45): string {
  const body = polys.map(({ fill, loops }) => {
    const d = loops.map((l) => 'M' + l.map(([X, Y]) => { const [a, b] = toScreen(v, X, Y); return `${n1(a)} ${n1(b)}`; }).join(' ') + 'Z').join('');
    return `<path fill="${fill}" stroke="${fill}" d="${d}"/>`;
  }).join('');
  return `<g stroke-width="${stroke}" stroke-linejoin="round">${body}</g>`;
}

export const polygonCount = (polys: Polys) => polys.reduce((n, p) => n + p.loops.length, 0);
