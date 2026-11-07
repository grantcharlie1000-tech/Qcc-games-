import { describe, expect, test } from 'vitest';
import { buildCourse, ZONES } from '../../../src/games/femboy-obby/stages';
import { createRun, solidOffset, step } from '../../../src/games/femboy-obby/sim';
import { playStage } from './autopilot';
import type { Surface } from '../../../src/games/femboy-obby/types';

const course = buildCourse();

describe('stage data', () => {
  test('thirty ordered stages across six zones of five', () => {
    expect(course.stages).toHaveLength(30);
    expect(course.stages.map(s => s.index)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(ZONES).toHaveLength(6);
    ZONES.forEach((z, i) => expect(course.stages.slice(i * 5, i * 5 + 5).every(s => s.zone === z.id)).toBe(true));
    expect(new Set(course.stages.map(s => s.name)).size).toBe(30);
  });

  test('every stage ends on its own checkpoint; checkpoint spawns stand on their pads', () => {
    expect(course.checkpoints).toHaveLength(31);
    course.checkpoints.forEach((cp, i) => {
      expect(cp.index).toBe(i);
      const s = course.solids[cp.solid];
      expect(s.surface).toBe('checkpoint');
      expect(s.motion).toBeUndefined();
      expect(cp.y).toBeCloseTo(s.y + s.hy, 9);
      expect(Math.abs(cp.x - s.x)).toBeLessThan(s.hx - 1);
      expect(Math.abs(cp.z - s.z)).toBeLessThan(s.hz - 1);
      expect(s.hx * 2).toBeGreaterThanOrEqual(6);
    });
    for (const st of course.stages) {
      expect(st.checkpoint).toBe(st.index);
      expect(st.route.at(-1)!.id).toBe(course.checkpoints[st.index].solid);
      for (const r of st.route) expect(course.solids[r.id], `stage ${st.index}`).toBeDefined();
    }
  });

  test('a fresh spawn at every checkpoint is safe for three seconds of standing still', () => {
    for (let i = 0; i < course.checkpoints.length; i++) {
      const r = createRun(course, { checkpoint: i });
      for (let k = 0; k < 180; k++) step(r, course, { mx: 0, mz: 0, jump: false });
      expect(r.deaths, `checkpoint ${i}`).toBe(0);
    }
  });

  test('one uniquely named optional star per stage, each floating above a surface', () => {
    expect(course.stars).toHaveLength(30);
    expect(new Set(course.stars.map(s => s.id)).size).toBe(30);
    course.stars.forEach((star, i) => {
      expect(star.id).toBe(`frosthop-v1:stage-${String(i + 1).padStart(2, '0')}:star`);
      expect(star.stage).toBe(i + 1);
      const under = course.solids.filter(s => { const o = solidOffset(s, 0); return Math.abs(star.x - o.x) <= s.hx && Math.abs(star.z - o.z) <= s.hz && star.y - o.y > 0.4 && star.y - o.y < 2.3; });
      expect(under.length, star.id).toBeGreaterThan(0);
    });
  });

  test('each mechanic is taught alone before it is combined', () => {
    const first = (pred: (stage: number) => boolean) => course.stages.find(s => pred(s.index))?.index ?? 99;
    const has = (surface: Surface) => (stage: number) => course.solids.some(s => s.stage === stage && s.surface === surface);
    const moving = (stage: number) => course.solids.some(s => s.stage === stage && s.motion);
    const sweep = (stage: number) => course.sweepers.some(w => w.stage === stage);
    const snow = (stage: number) => course.snowballs.some(w => w.stage === stage);
    const order = { moving: first(moving), conveyor: first(has('conveyor')), ice: first(has('ice')), crumble: first(has('crumble')), spring: first(has('spring')), sweeper: first(sweep), snowball: first(snow) };
    expect(order).toEqual({ sweeper: 8, moving: 11, conveyor: 13, ice: 16, snowball: 18, crumble: 19, spring: 22 });
    // A stage that introduces a family contains no other non-static family.
    const families = [moving, has('conveyor'), has('ice'), has('crumble'), has('spring'), sweep, snow];
    for (const intro of Object.values(order)) expect(families.filter(f => f(intro)).length, `stage ${intro}`).toBe(1);
    // Stage 1 is plain hops.
    expect(families.some(f => f(1))).toBe(false);
  });

  test('ids are unique and hazards belong to stages', () => {
    expect(new Set(course.solids.map(s => s.id)).size).toBe(course.solids.length);
    for (const w of course.sweepers) expect(w.stage).toBeGreaterThan(0);
    for (const b of course.snowballs) expect(b.stage).toBeGreaterThan(0);
    expect(course.version).toBe('frosthop-v1');
  });
});

describe('every stage is completable with ordinary controls', () => {
  test.each(Array.from({ length: 30 }, (_, i) => i + 1))('stage %i', stage => {
    const result = playStage(course, stage);
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, deaths: 0 });
    expect(result.seconds).toBeLessThan(40);
  });

  test.each([8, 12, 19, 22, 25, 29])('stage %i with assistance on', stage => {
    expect(playStage(course, stage, { assist: true }).ok).toBe(true);
  });
});
