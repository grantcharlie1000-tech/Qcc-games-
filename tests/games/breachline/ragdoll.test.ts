// Job 12.6: a fighter who dies ends below standing height, at rest, and inside the map (ragdoll in render/patchfighters).
import { describe, expect, it } from 'vitest';
import { MAP, newWorld } from '../../../src/games/breachline/map';
import { HEAD_CENTRE, JOINT, B, SCALE } from '../../../src/games/breachline/render/fighters/skeleton';
import { MAX_TIME, P, POINTS, advance, createRagdoll, point, push, type Ragdoll } from '../../../src/games/breachline/render/patchfighters/ragdoll';
import type { World } from '../../../src/games/breachline/world';

const BONE = [B.pelvis, B.spine2, B.neck, B.head, B.upperL, B.upperR, B.foreL, B.foreR, B.handL, B.handR, B.thighL, B.thighR, B.shinL, B.shinR, B.footL, B.footR];
/** The bind pose standing at (x, z), turned to `yaw` (facing -Z at yaw 0), as the game draws it (scaled). */
function standing(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return BONE.map((b, i) => {
    const j = JOINT[b].clone(); if (i === P.head) j.add(HEAD_CENTRE);
    j.multiplyScalar(SCALE);
    return { x: x + j.x * c + j.z * s, y: j.y, z: z - j.x * s + j.z * c };
  });
}
function run(r: Ragdoll, w: World) {
  let t = 0;
  while (t < MAX_TIME + 1 && advance(r, w, 1 / 60)) t += 1 / 60;
  return t;
}
function settledInside(r: Ragdoll, w: World, label: string) {
  expect(r.asleep, `${label}: asleep`).toBe(true);
  const v = { x: 0, y: 0, z: 0 };
  let top = 0;
  for (let i = 0; i < POINTS; i++) {
    point(r, i, v); top = Math.max(top, v.y);
    expect(v.y, `${label}: point ${i} above the floor`).toBeGreaterThan(0.01);
    expect(v.x > w.bounds.x0 && v.x < w.bounds.x1 && v.z > w.bounds.z0 && v.z < w.bounds.z1, `${label}: point ${i} inside the bounds`).toBe(true);
    for (const b of w.boxes) {
      if (!b.solid) continue;
      const inside = v.x > b.x0 + 0.01 && v.x < b.x1 - 0.01 && v.y > b.y0 + 0.01 && v.y < b.y1 - 0.01 && v.z > b.z0 + 0.01 && v.z < b.z1 - 0.01;
      expect(inside, `${label}: point ${i} inside a solid box`).toBe(false);
    }
  }
  // Lying down: nothing near standing height; a body draped on furniture can still sit higher than on the floor.
  expect(top, `${label}: highest point`).toBeLessThan(1.25);
  point(r, P.head, v);
  expect(v.y, `${label}: head height`).toBeLessThan(1.1);
}

describe('ragdoll', () => {
  // Every spawn and roaming point, facing its spawn direction (roaming points have none, so 0).
  const spots = [...MAP.attackSpawns.flatMap(g => g.points), ...MAP.defendSpawns, ...MAP.roam].map(s => ({ x: s.x, z: s.z, yaw: 'yaw' in s ? s.yaw : 0 }));
  it('ends every death below standing height, at rest, inside the map', () => {
    spots.forEach((s, n) => {
      const w = newWorld(), r = createRagdoll(standing(s.x, s.z, s.yaw), { x: 0, y: 0, z: 0 });
      // Alternate a chest shot from the front, a head shot from the side and a blast from behind.
      const kind = n % 3, a = s.yaw + [0, Math.PI / 2, Math.PI][kind], dx = Math.sin(a), dz = Math.cos(a);
      const hit = kind === 1 ? P.head : P.chest, v = kind === 2 ? 7 : 3;
      push(r, hit, dx * v, kind === 2 ? 4 : 0, dz * v);
      if (kind === 2) for (let i = 0; i < POINTS; i++) push(r, i, dx * 5, 3, dz * 5);
      push(r, P.knL, -Math.sin(s.yaw) * 0.6, 0, -Math.cos(s.yaw) * 0.6);
      const t = run(r, w);
      expect(t, `spot ${n}: settles within the time limit`).toBeLessThanOrEqual(MAX_TIME + 0.05);
      settledInside(r, w, `spot ${n} (${s.x.toFixed(1)}, ${s.z.toFixed(1)})`);
    });
  });
  it('stops against a wall instead of passing through it', () => {
    const w = newWorld(), b = w.boxes.find(x => x.solid && x.y1 > 2 && x.x1 - x.x0 > 1.5 && x.z1 - x.z0 < 0.6)!;
    const x = (b.x0 + b.x1) / 2, z = b.z1 + 0.5, r = createRagdoll(standing(x, z, 0), { x: 0, y: 0, z: 0 });
    for (let i = 0; i < POINTS; i++) push(r, i, 0, 0, -6);
    run(r, w);
    settledInside(r, w, 'against a wall');
    const v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < POINTS; i++) expect(point(r, i, v).z, `point ${i} stays on its side of the wall`).toBeGreaterThan(b.z1);
  });
  it('is the same every time from the same start', () => {
    const go = () => { const w = newWorld(), s = spots[0], r = createRagdoll(standing(s.x, s.z, s.yaw), { x: 0.5, y: 0, z: 0 }); push(r, P.chest, 0, 0, 3); run(r, w); return point(r, P.pelvis, { x: 0, y: 0, z: 0 }); };
    expect(go()).toEqual(go());
  });
});
