/** The map-fill rules and measures (docs/superpowers/plans/2026-11-11-breachline-map-fill.md, sections 2 and 3),
 * computed from map data. Shared by mapfill.test.ts and scripts/breachline-assets/mapplan.ts (the plan image). */
import { readFileSync } from 'node:fs';
import { CELL, WALL_H } from '../../../src/games/breachline/config';
import { MAP, type Rect } from '../../../src/games/breachline/map';
import type { Box } from '../../../src/games/breachline/world';

type Row = [number, number, number, number, number, number, string, boolean, boolean];
const BASE: Row[] = JSON.parse(readFileSync(new URL('./fixtures/map-boxes-before-fill.json', import.meta.url), 'utf8'));
const asRow = (b: Box): Row => [b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, b.mat, b.solid, b.draw];
export const baseline: Box[] = BASE.map(([x0, y0, z0, x1, y1, z1, mat, solid, draw]) => ({ x0, y0, z0, x1, y1, z1, mat: mat as Box['mat'], solid, draw }));
/** True when every pre-fill box is still there, unchanged and in order, ahead of the fill. */
export const baselineIntact = () => BASE.length <= MAP.boxes.length && BASE.every((r, i) => JSON.stringify(asRow(MAP.boxes[i])) === JSON.stringify(r));
/** The boxes the fill pass added. */
export const fill = (): Box[] => MAP.boxes.slice(BASE.length);

const STRUCT = new Set(['brick', 'plaster', 'trim']);
/** Furniture and cover: solid, standing on the floor, not a wall, post, header, perimeter wall or the ceiling. */
export const isFurniture = (b: Box) => b.solid && !STRUCT.has(b.mat) && b.y0 < 0.3 && b.y1 < 3.2 && b.y1 > 0.3;

/** Gap between two footprints in plan (0 when they touch or overlap). */
export function gap(a: Rect, b: Rect): number {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0);
  return Math.hypot(dx, dz);
}
/** Each destructible panel (soft wall, door, window) as a thin footprint. */
export const panelRects = (): (Rect & { kind: string })[] => MAP.panels.map(p => {
  const a = p.u0, b = p.u0 + p.cols * CELL, t = 0.08;
  return p.axis === 'x' ? { x0: a, z0: p.pos - t, x1: b, z1: p.pos + t, kind: p.kind } : { x0: p.pos - t, z0: a, x1: p.pos + t, z1: b, kind: p.kind };
});

const centre = (r: Rect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
/** The two sites' 2.5 m plant cores, which must stay open; the empty-floor target excludes them (plan, section 2). */
export const SITE_CORES: Box[] = MAP.sites.map(s => { const c = centre(s); return { x0: c.x - 1.25, z0: c.z - 1.25, x1: c.x + 1.25, z1: c.z + 1.25, y0: 0, y1: 1, mat: 'concrete', solid: true, draw: false }; });
/** Boxes for empty-floor measures: everything solid, with the site cores counted as taken. */
export const forEmpty = (boxes: Box[] = MAP.boxes) => [...boxes, ...SITE_CORES];
const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0);
export const OUTDOOR = new Set(['South Yard', 'North Yard', 'West Lot', 'East Lane']);
const corridor = MAP.rooms.find(r => r.name === 'Corridor')!;

/** A corridor piece (plan 11.6): a solid box wholly inside the corridor, standing against one of its walls. */
export const isCorridorPiece = (b: Box) => b.solid && b.x0 >= corridor.x0 && b.x1 <= corridor.x1 && b.z0 >= corridor.z0 - 0.01 && b.z1 <= corridor.z1 + 0.01 && (b.z0 - corridor.z0 < 0.1 || corridor.z1 - b.z1 < 0.1) && !baseline.some(o => o.x0 === b.x0 && o.z0 === b.z0 && o.x1 === b.x1);
/** Whether the gap between two footprints is a way through (open at both ends) rather than a nook closed at one end
 * by something solid. Corner-to-corner gaps count as a way through only when narrower than a body (0.6 m). */
function passThrough(a: Rect, b: Rect, solid: Rect[]): boolean {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0), dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0);
  // The space between them, corner to corner: if a wall panel or a third solid thing lies in it, it is no way through.
  const between = { x0: Math.min(a.x1, b.x1), x1: Math.max(a.x0, b.x0), z0: Math.min(a.z1, b.z1), z1: Math.max(a.z0, b.z0) };
  const span = { x0: Math.min(between.x0, between.x1), x1: Math.max(between.x0, between.x1), z0: Math.min(between.z0, between.z1), z1: Math.max(between.z0, between.z1) };
  if (panelRects().some(p => p.x0 < span.x1 && p.x1 > span.x0 && p.z0 < span.z1 && p.z1 > span.z0)) return false;
  if (solid.some(o => o !== a && o !== b && o.x0 < span.x1 - 0.01 && o.x1 > span.x0 + 0.01 && o.z0 < span.z1 - 0.01 && o.z1 > span.z0 + 0.01)) return false;
  if (dx > 0 && dz > 0) return Math.hypot(dx, dz) < 0.6 && !solid.some(o => o !== a && o !== b && o.x0 < span.x1 && o.x1 > span.x0 && o.z0 < span.z1 && o.z1 > span.z0);
  // The strip between them, and a thin probe just beyond each of its two open ends.
  const strip = dx > 0
    ? { x0: Math.min(a.x1, b.x1), x1: Math.max(a.x0, b.x0), z0: Math.max(a.z0, b.z0), z1: Math.min(a.z1, b.z1) }
    : { x0: Math.max(a.x0, b.x0), x1: Math.min(a.x1, b.x1), z0: Math.min(a.z1, b.z1), z1: Math.max(a.z0, b.z0) };
  const ends = dx > 0
    ? [{ ...strip, z0: strip.z0 - 0.06, z1: strip.z0 - 0.01 }, { ...strip, z0: strip.z1 + 0.01, z1: strip.z1 + 0.06 }]
    : [{ ...strip, x0: strip.x0 - 0.06, x1: strip.x0 - 0.01 }, { ...strip, x0: strip.x1 + 0.01, x1: strip.x1 + 0.06 }];
  const shut = (e: Rect) => solid.some(o => o !== a && o !== b && o.x0 < e.x1 && o.x1 > e.x0 && o.z0 < e.z1 && o.z1 > e.z0);
  return !shut(ends[0]) && !shut(ends[1]);
}
/** Every rule in plan section 3 that can be checked from data for one new box against all boxes; one line per breach. */
export function boxViolations(b: Box, all: Box[]): string[] {
  const out: string[] = [], panels = panelRects();
  const name = (q: Box) => `${q.mat} (${q.x0},${q.z0})-(${q.x1},${q.z1}) h${q.y1}`;
  if (!b.solid) return out;
  // Section 11.6: the corridor's three waist-high pieces stand flush to its panels, under their own rules.
  if (isCorridorPiece(b)) {
    if (b.y1 > 1.0 || Math.min(b.x1 - b.x0, b.z1 - b.z0) > 0.5 + 1e-6 || Math.max(b.x1 - b.x0, b.z1 - b.z0) > 1.4 + 1e-6) out.push(`${name(b)}: corridor piece larger than 1.4 x 0.5 x 1.0 m`);
    const lane = Math.max(b.z0 - corridor.z0, corridor.z1 - b.z1) - 0.07;
    if (lane < 2.0) out.push(`${name(b)}: leaves ${lane.toFixed(2)} m of corridor lane`);
    for (const p of panels) if (p.kind === 'door' && gap(b, p) < 2) out.push(`${name(b)}: ${gap(b, p).toFixed(2)} m from a doorway`);
    for (const o of all) if (o !== b && o.solid && isCorridorPiece(o) && Math.abs((o.x0 + o.x1) - (b.x0 + b.x1)) / 2 < 6) out.push(`${name(b)}: under 6 m from another corridor piece`);
    return out;
  }
  // 2. 0.75 m from every destructible panel, door and window.
  for (const p of panels) { const d = gap(b, p); if (d < 0.75) out.push(`${name(b)}: ${d.toFixed(2)} m from a ${p.kind} panel`); }
  // 3. Clear width: against something (touching) or at least 1.2 m from every other solid thing on the floor.
  const floor = all.filter(o => o.solid && o.y1 > 0.3 && o.y0 < 1.78);
  for (const o of floor) {
    if (o === b) continue;
    const d = gap(b, o);
    if (!(d > 0.02 && d < 1.2) || !passThrough(b, o, floor)) continue;
    out.push(`${name(b)}: ${d.toFixed(2)} m from ${name(o)} (a squeeze under 1.2 m)`);
  }
  // 3. Corridor: leave 1.8 m along it; nothing within 1.5 m of a doorway's corridor side.
  if (gap(b, corridor) === 0 && b.x1 > corridor.x0 && b.x0 < corridor.x1 && b.z1 > corridor.z0 && b.z0 < corridor.z1) {
    const free = Math.max(b.z0 - corridor.z0, corridor.z1 - b.z1);
    if (free < 1.8) out.push(`${name(b)}: leaves ${free.toFixed(2)} m of corridor`);
    for (const p of MAP.panels) if (p.kind === 'door' && p.axis === 'x' && (Math.abs(p.pos - corridor.z0) < 0.2 || Math.abs(p.pos - corridor.z1) < 0.2)) {
      const d = gap(b, { x0: p.u0, x1: p.u0 + p.cols * CELL, z0: p.pos, z1: p.pos });
      if (d < 1.5) out.push(`${name(b)}: ${d.toFixed(2)} m from a corridor doorway`);
    }
  }
  // 4. Objectives, spawns and bot points.
  for (const s of MAP.sites) { const c = centre(s); if (gap(b, { x0: c.x - 1.25, x1: c.x + 1.25, z0: c.z - 1.25, z1: c.z + 1.25 }) === 0) out.push(`${name(b)}: in site ${s.id}'s core`); }
  const pt = (x: number, z: number, r: number, what: string) => { if (gap(b, { x0: x, x1: x, z0: z, z1: z }) < r) out.push(`${name(b)}: within ${r} m of ${what} (${x},${z})`); };
  for (const g of MAP.attackSpawns) for (const s of g.points) pt(s.x, s.z, 3, `attack spawn ${g.name}`);
  for (const s of MAP.defendSpawns) pt(s.x, s.z, 1, 'a defend spawn');
  for (const p of [...MAP.posts[0], ...MAP.posts[1], ...MAP.roam]) pt(p.x, p.z, 1, 'a bot post');
  for (const r of [...MAP.reinforce[0], ...MAP.reinforce[1]]) pt(r.x, r.z, 1, 'a reinforce point');
  // 5. Two heights: waist (0.9-1.1) or full (1.8+); nothing in between 1.2 and 1.7.
  if (b.y1 > 1.2 && b.y1 < 1.7) out.push(`${name(b)}: ambiguous height`);
  if (b.x0 < MAP.bounds.x0 || b.x1 > MAP.bounds.x1 || b.z0 < MAP.bounds.z0 || b.z1 > MAP.bounds.z1) out.push(`${name(b)}: outside the yard`);
  return out;
}
/** Every rule in plan section 3 that can be checked from data, over the whole fill; one line per breach. */
export function violations(): string[] {
  const out: string[] = [];
  if (!baselineIntact()) out.push('an existing box was moved, resized or removed');
  for (const b of fill()) out.push(...boxViolations(b, MAP.boxes));
  return out;
}

/** Occupancy of an area on a 0.25 m grid: solid things a body cannot stand in (furniture and walls). */
function grid(r: Rect, boxes: Box[] = MAP.boxes) {
  const S = 0.25, nx = Math.round((r.x1 - r.x0) / S), nz = Math.round((r.z1 - r.z0) / S), occ = new Uint8Array(nx * nz);
  for (const b of boxes) {
    if (!b.solid || b.y1 <= 0.3 || b.y0 >= 1.78) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - r.x0) / S + 1e-6)), i1 = Math.min(nx, Math.ceil((b.x1 - r.x0) / S - 1e-6));
    const j0 = Math.max(0, Math.floor((b.z0 - r.z0) / S + 1e-6)), j1 = Math.min(nz, Math.ceil((b.z1 - r.z0) / S - 1e-6));
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) occ[i + j * nx] = 1;
  }
  return { nx, nz, occ, S };
}
/** The largest empty rectangle (by area) in an area, in metres. */
export function largestEmpty(r: Rect, boxes: Box[] = MAP.boxes): { w: number; h: number } {
  const { nx, nz, occ, S } = grid(r, boxes), hgt = new Int32Array(nx);
  let best = { w: 0, h: 0, a: 0 };
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) hgt[i] = occ[i + j * nx] ? 0 : hgt[i] + 1;
    const st: number[] = [];
    for (let i = 0; i <= nx; i++) {
      const h = i < nx ? hgt[i] : 0;
      while (st.length && hgt[st[st.length - 1]] >= h) {
        const top = st.pop()!, hh = hgt[top], w = st.length ? i - st[st.length - 1] - 1 : i;
        if (w * hh > best.a) best = { w: w * S, h: hh * S, a: w * hh };
      }
      st.push(i);
    }
  }
  return { w: best.w, h: best.h };
}
/** Whether an empty rectangle of w by h metres (either way round) fits anywhere in the area. */
export function fits(r: Rect, w: number, h: number, boxes: Box[] = MAP.boxes): boolean {
  const { nx, nz, occ, S } = grid(r, boxes), P = new Int32Array((nx + 1) * (nz + 1));
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) P[(i + 1) + (j + 1) * (nx + 1)] = occ[i + j * nx] + P[i + (j + 1) * (nx + 1)] + P[(i + 1) + j * (nx + 1)] - P[i + j * (nx + 1)];
  const sum = (i0: number, j0: number, i1: number, j1: number) => P[i1 + j1 * (nx + 1)] - P[i0 + j1 * (nx + 1)] - P[i1 + j0 * (nx + 1)] + P[i0 + j0 * (nx + 1)];
  for (const [a, b] of [[w, h], [h, w]]) {
    const ci = Math.ceil(a / S - 1e-6), cj = Math.ceil(b / S - 1e-6);
    for (let j = 0; j + cj <= nz; j++) for (let i = 0; i + ci <= nx; i++) if (!sum(i, j, i + ci, j + cj)) return true;
  }
  return false;
}
/** The corridor's longest unbroken sight line along its length at standing eye height (1.6 m), and where. */
export function corridorSight(boxes: Box[] = MAP.boxes): { length: number; z: number; x0: number; x1: number } {
  let best = { length: 0, z: 0, x0: 0, x1: 0 };
  for (let z = corridor.z0 + 0.25; z < corridor.z1 - 0.1; z += 0.25) {
    let run = corridor.x0;
    const blockedAt = (x: number) => boxes.some(b => b.solid && b.y0 < 1.6 && b.y1 > 1.6 && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    for (let x = corridor.x0; x <= corridor.x1 + 1e-6; x += 0.05) {
      if (blockedAt(x) || x >= corridor.x1) { if (x - run > best.length) best = { length: x - run, z, x0: run, x1: x }; run = x + 0.05; }
    }
  }
  return best;
}
/** Plan section 2 measures for every area. */
export function measures() {
  return MAP.rooms.map(r => {
    const objs = MAP.boxes.filter(b => isFurniture(b) && (() => { const c = centre(b); return c.x >= r.x0 && c.x < r.x1 && c.z >= r.z0 && c.z < r.z1; })());
    const outdoor = OUTDOOR.has(r.name), floor = area(r) - (outdoor ? 0 : 0);
    const e = largestEmpty(r, forEmpty()), lim = outdoor ? [12, 5] : [4, 3];
    return { name: r.name, outdoor, floor: Math.round(floor), objects: objs.length, per10: +(objs.length / floor * 10).toFixed(2), empty: `${e.w.toFixed(2)} x ${e.h.toFixed(2)}`, withinTarget: !fits(r, lim[0] + 0.25, lim[1] + 0.25, forEmpty()) };
  });
}
export { WALL_H };
