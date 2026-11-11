/** Static level geometry for the asset renderer, with a second UV set for lightmaps. Pure: no DOM, no renderer.
 * The offline baker (scripts/breachline-assets/bake.ts) and the browser both build from here, so the lightmap lands
 * on exactly the surfaces it was baked for. tests/games/breachline/levelgeo.test.ts holds the two to that. */
import { WALL_H } from '../config';
import { LevelBuilder, emitLevel, type FaceRec } from '../levelmesh';
import type { Bake } from '../lightbake';
import { MAP, type Rect } from '../map';

export interface Region extends Rect { name: string }
/** Rooms handed to the asset renderer. Phase 0 proves the route on the Lab alone. */
const room = (name: string, id: string): Region => ({ ...MAP.rooms.find(r => r.name === name)!, name: id });
export const REGIONS: Region[] = [room('Lab', 'lab'), room('Corridor', 'corridor'), room('Archive', 'archive')];

const NEAR = 0.05;
const span = (o: number, d: number, len: number, lo: number, hi: number): [number, number] => {
  // The part of [0, len] where o + d * s lies in [lo, hi]; d is -1, 0 or 1.
  if (d === 0) return o >= lo && o <= hi ? [0, len] : [0, 0];
  const a = (lo - o) / d, b = (hi - o) / d;
  return [Math.max(0, Math.min(a, b)), Math.min(len, Math.max(a, b))];
};
const piece = (f: FaceRec, s0: number, s1: number, t0: number, t1: number): FaceRec => ({
  ...f,
  o: [f.o[0] + f.u[0] * s0 + f.v[0] * t0, f.o[1] + f.u[1] * s0 + f.v[1] * t0, f.o[2] + f.u[2] * s0 + f.v[2] * t0],
  lu: s1 - s0, lv: t1 - t0,
});
export const normalOf = (f: FaceRec): [number, number, number] => [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];

/** Splits an axis-aligned face into the part that faces into `r` and the rest. The roof and outside faces stay out. */
export function splitFace(f: FaceRec, r: Rect): { inside: FaceRec[]; outside: FaceRec[] } {
  const n = normalOf(f), ox = f.o[0] + n[0] * NEAR, oy = f.o[1] + n[1] * NEAR, oz = f.o[2] + n[2] * NEAR;
  if (oy > WALL_H + 0.01) return { inside: [], outside: [f] };
  if (f.mode === 'fit') {
    const cx = ox + (f.u[0] * f.lu + f.v[0] * f.lv) / 2, cz = oz + (f.u[2] * f.lu + f.v[2] * f.lv) / 2;
    return cx > r.x0 && cx < r.x1 && cz > r.z0 && cz < r.z1 ? { inside: [f], outside: [] } : { inside: [], outside: [f] };
  }
  // Each horizontal axis varies along at most one of U and V (faces are axis-aligned); clip that one.
  let s0 = 0, s1 = f.lu, t0 = 0, t1 = f.lv;
  for (const [k, o, lo, hi] of [[0, ox, r.x0, r.x1], [2, oz, r.z0, r.z1]] as const) {
    if (f.u[k] !== 0) { const [a, b] = span(o, f.u[k], f.lu, lo, hi); s0 = Math.max(s0, a); s1 = Math.min(s1, b); }
    else if (f.v[k] !== 0) { const [a, b] = span(o, f.v[k], f.lv, lo, hi); t0 = Math.max(t0, a); t1 = Math.min(t1, b); }
    else if (o < lo || o > hi) return { inside: [], outside: [f] };
  }
  if (s1 - s0 < 1e-4 || t1 - t0 < 1e-4) return { inside: [], outside: [f] };
  const outside: FaceRec[] = [];
  if (s0 > 1e-4) outside.push(piece(f, 0, s0, 0, f.lv));
  if (f.lu - s1 > 1e-4) outside.push(piece(f, s1, f.lu, 0, f.lv));
  if (t0 > 1e-4) outside.push(piece(f, s0, s1, 0, t0));
  if (f.lv - t1 > 1e-4) outside.push(piece(f, s0, s1, t1, f.lv));
  return { inside: [piece(f, s0, s1, t0, t1)], outside };
}

const NO_BAKE: Bake = { light: () => [1, 1, 1], probe: () => [1, 1, 1] };
/** Every static face of the level, sorted into the regions that claim them; `rest` is everything else. */
export function collectFaces(regions: readonly Region[] = REGIONS): { byRegion: FaceRec[][]; rest: FaceRec[] } {
  const byRegion: FaceRec[][] = regions.map(() => []), rest: FaceRec[] = [];
  const L = new LevelBuilder(NO_BAKE, f => {
    let left = [f];
    regions.forEach((r, i) => {
      const next: FaceRec[] = [];
      for (const g of left) { const s = splitFace(g, r); byRegion[i].push(...s.inside); next.push(...s.outside); }
      left = next;
    });
    rest.push(...left);
    return [];
  });
  emitLevel(L);
  return { byRegion, rest };
}

/** A face's rectangle in the lightmap atlas, in texels; `pad` texels of border on each side. */
export interface Chart { face: FaceRec; x: number; y: number; w: number; h: number }
export const PAD = 2;
export interface Atlas { width: number; height: number; density: number; charts: Chart[] }

/** Packs one chart per face into rows (tallest first). Deterministic for a given face list. */
export function packAtlas(faces: readonly FaceRec[], density: number, width = 512): Atlas {
  const charts = faces.map(face => ({ face, x: 0, y: 0, w: Math.max(2, Math.ceil(face.lu * density)), h: Math.max(2, Math.ceil(face.lv * density)) }));
  const order = charts.map((_, i) => i).sort((a, b) => charts[b].h - charts[a].h || charts[b].w - charts[a].w || a - b);
  let x = 0, y = 0, row = 0;
  for (const i of order) {
    const c = charts[i], cw = c.w + PAD * 2, ch = c.h + PAD * 2;
    if (cw > width) throw new Error(`chart ${cw} texels wide does not fit an atlas ${width} wide`);
    if (x + cw > width) { x = 0; y += row; row = 0; }
    c.x = x; c.y = y; x += cw; row = Math.max(row, ch);
  }
  const height = Math.ceil((y + row) / 4) * 4;
  return { width, height, density, charts };
}

/** Where texel (i, j) of a chart's interior sits on its face, as (s, t) in metres. */
export const texelST = (c: Chart, i: number, j: number): [number, number] => [(i + 0.5) / c.w * c.face.lu, (j + 0.5) / c.h * c.face.lv];
export const pointOn = (f: FaceRec, s: number, t: number): [number, number, number] => [f.o[0] + f.u[0] * s + f.v[0] * t, f.o[1] + f.u[1] * s + f.v[1] * t, f.o[2] + f.u[2] * s + f.v[2] * t];

/** Plain triangle arrays for a set of charted faces: one quad per face. `uv` is in metres (world-aligned, as the
 * old builder maps it); `uv1` is the lightmap coordinate; `color` the face's tint. */
export interface GeoArrays { position: number[]; normal: number[]; uv: number[]; uv1: number[]; color: number[]; index: number[] }
export function faceArrays(atlas: Atlas, keep: (f: FaceRec) => boolean = () => true): GeoArrays {
  const g: GeoArrays = { position: [], normal: [], uv: [], uv1: [], color: [], index: [] };
  for (const c of atlas.charts) {
    const f = c.face;
    if (!keep(f)) continue;
    const n = normalOf(f), base = g.position.length / 3;
    for (const [s, t] of [[0, 0], [f.lu, 0], [f.lu, f.lv], [0, f.lv]]) {
      const p = pointOn(f, s, t);
      g.position.push(...p); g.normal.push(...n); g.color.push(...f.tint);
      if (f.mode === 'fit') g.uv.push(s / f.lu, t / f.lv);
      else if (Math.abs(n[1]) > 0.5) g.uv.push(p[0], -p[2]);
      else g.uv.push(Math.abs(n[0]) > 0.5 ? -p[2] * Math.sign(n[0]) : p[0] * Math.sign(n[2]), p[1]);
      g.uv1.push((c.x + PAD + (s / f.lu) * c.w) / atlas.width, (c.y + PAD + (t / f.lv) * c.h) / atlas.height);
    }
    g.index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return g;
}
