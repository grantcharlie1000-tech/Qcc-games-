/** Small modelled detail that sits on a baked surface (cabinet doors, handles, skirting, sockets, conduit, a tap):
 * every vertex takes the lightmap coordinate of the parent surface behind it, so detail shows exactly the baked
 * light and shadow of where it stands, with no extra bake and no extra lights. Pure geometry, no renderer. */
import type { FaceRec } from '../levelmesh';
import { PAD, normalOf, type Atlas, type Chart, type GeoArrays } from './levelgeo';

type V3 = [number, number, number];
const dot = (a: V3 | number[], b: V3 | number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Finds the baked face a point sits on (normal `n`, point at most `reach` in front of it). */
export function parentChart(atlas: Atlas, p: V3, n: V3, reach = 0.6): Chart | null {
  let best: Chart | null = null, bestD = Infinity;
  for (const c of atlas.charts) {
    const f = c.face, fn = normalOf(f);
    if (dot(fn, n) < 0.99) continue;
    const d = dot([p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]], fn);
    if (d < -0.02 || d > reach) continue;
    const rel = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]], s = dot(rel, f.u), t = dot(rel, f.v);
    if (s < -0.01 || t < -0.01 || s > f.lu + 0.01 || t > f.lv + 0.01) continue;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

/** Lightmap coordinate of a point projected onto a chart's face, kept inside the chart. */
export function chartUv(atlas: Atlas, c: Chart, p: V3): [number, number] {
  const f: FaceRec = c.face, rel = [p[0] - f.o[0], p[1] - f.o[1], p[2] - f.o[2]];
  const s = Math.min(Math.max(dot(rel, f.u), 0.001), f.lu - 0.001), t = Math.min(Math.max(dot(rel, f.v), 0.001), f.lv - 0.001);
  return [(c.x + PAD + (s / f.lu) * c.w) / atlas.width, (c.y + PAD + (t / f.lv) * c.h) / atlas.height];
}

/** Collects detail geometry per material key. Each piece names the surface it stands on by a point and normal. */
export class DetailBuilder {
  readonly parts = new Map<string, GeoArrays>();
  missed = 0;
  readonly misses: string[] = [];
  /** Archive boxes to draw instanced (render/archivebox.ts): front centre-bottom on the shelf face, a turn about the
   * vertical, a tilt, the box front's width and height, its depth out from the face, a tint and a label variant. */
  readonly boxes: { x: number; y: number; z: number; yaw: number; tilt: number; w: number; h: number; depth: number; tint: V3; label: number }[] = [];
  constructor(private atlas: Atlas) {}
  private arrays(key: string) {
    let a = this.parts.get(key);
    if (!a) { a = { position: [], normal: [], uv: [], uv1: [], color: [], index: [] }; this.parts.set(key, a); }
    return a;
  }
  /** An axis-aligned box standing on the surface through `on` with normal `n`. `tint` multiplies the material. */
  box(key: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, on: V3, n: V3, tint: V3 = [1, 1, 1], skipBack = true) {
    const c = parentChart(this.atlas, on, n);
    if (!c) { this.missed++; this.misses.push(`${key}@${on.map(v => v.toFixed(2))}`); return; }
    const a = this.arrays(key);
    const faces: [V3, V3, V3, V3, V3][] = [
      [[1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
      [[-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
      [[0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
      [[0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]],
      [[0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
      [[0, 0, -1], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    ];
    for (const [fn, ...q] of faces) {
      if (skipBack && dot(fn, n) < -0.99) continue;
      const b = a.position.length / 3;
      for (const p of q) {
        a.position.push(...p); a.normal.push(...fn); a.color.push(...tint);
        // Metre UVs by the face's own axis, as the level builder maps them.
        if (Math.abs(fn[1]) > 0.5) a.uv.push(p[0], -p[2]); else a.uv.push(Math.abs(fn[0]) > 0.5 ? -p[2] * Math.sign(fn[0]) : p[0] * Math.sign(fn[2]), p[1]);
        a.uv1.push(...chartUv(this.atlas, c, p));
      }
      a.index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  /** Any indexed mesh (lathe, tube) placed in the world, standing on the surface through `on`. */
  mesh(key: string, position: ArrayLike<number>, normal: ArrayLike<number>, index: ArrayLike<number> | null, on: V3, n: V3, tint: V3 = [1, 1, 1], uv?: ArrayLike<number>) {
    const c = parentChart(this.atlas, on, n);
    if (!c) { this.missed++; this.misses.push(`${key}@${on.map(v => v.toFixed(2))}`); return; }
    const a = this.arrays(key), b = a.position.length / 3, count = position.length / 3;
    for (let i = 0; i < count; i++) {
      const p: V3 = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]];
      a.position.push(...p); a.normal.push(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]); a.color.push(...tint);
      if (uv) a.uv.push(uv[i * 2], uv[i * 2 + 1]); else a.uv.push(p[0] + p[2], p[1]);
      a.uv1.push(...chartUv(this.atlas, c, p));
    }
    if (index) for (let i = 0; i < index.length; i++) a.index.push(b + index[i]);
    else for (let i = 0; i < count; i++) a.index.push(b + i);
  }
}
