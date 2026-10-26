import { describe, expect, it } from 'vitest';
import { BANK_DRIFT, CONFIG, DIFFICULTIES, GATE_FEEDBACK, RADIUS, STEP, lateralSpeed, type Difficulty, type Gate } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, restoreSnapshot, runSpeed, step } from '../../../src/games/ball-run/model';
import { emptyRecords } from '../../../src/games/ball-run/records';
import { capDistance, placeRun, restHeight, spans } from './bot';

const reversal: Record<Difficulty, number> = { hard: 54 };
const gates = (seed: number, difficulty: Difficulty, to: number) => {
  const list: Gate[] = [];
  getCourse(seed, difficulty).forEachGate(0, to, g => list.push(g));
  return list;
};

describe('Ball Run physical road contact regressions', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: supports both measured reversals while the contact stays over the visible warm-up`, () => {
      const course = getCourse(1, difficulty);
      for (const side of [-1, 1]) {
        const run = createRun(1, 1, difficulty);
        run.phase = 'running';
        let furthest = 0;
        for (let i = 0; i < 132; i++) {
          step(run, side * (i < reversal[difficulty] ? 1 : -1), STEP);
          const s = course.sample(run.distance);
          furthest = Math.max(furthest, Math.abs(run.x - s.center));
          expect(s.kind).toBe('warmup');
          expect(furthest).toBeLessThan(s.width / 2);
          expect(run.phase).toBe('running');
          expect(run.grounded, `${difficulty} step ${i}, x=${run.x}`).toBe(true);
          expect(run.height).toBeCloseTo(restHeight(course, run.distance, run.x), 9);
        }
      }
    });

    it(`${difficulty}: supports the visible edge after gates at 30–144Hz, with stalls and at the cap`, () => {
      const course = getCourse(1, difficulty), cap = capDistance(course);
      const list = gates(1, difficulty, cap + 5000);
      for (const gate of [list[0], list.find(g => g.start > cap + 10)!]) {
        for (const side of [-1, 1]) for (const hz of [30, 60, 120, 144]) for (const stall of [false, true]) {
          const at = gate.end + .05, s = course.sample(at);
          const run = placeRun(1, difficulty, at, s.center + side * (s.width / 2 - .04));
          let accumulator = 0, frame = 0;
          while (run.elapsed < .4) {
            accumulator += Math.min(stall && frame++ === 2 ? .25 : 1 / hz, .1);
            while (accumulator >= STEP) {
              step(run, 0, STEP);
              accumulator -= STEP;
              const surface = course.sample(run.distance);
              expect(Math.abs(run.x - surface.center)).toBeLessThan(surface.width / 2);
              expect(run.phase).toBe('running');
              expect(run.grounded, `${difficulty} ${hz}Hz gate ${gate.index}, stall=${stall}`).toBe(true);
            }
          }
        }
      }
    });
  }

  it('restores a grounded ball in the visible edge strip, while rejecting a grounded ball beyond the actual edge', () => {
    for (const difficulty of DIFFICULTIES) for (const side of [-1, 1]) {
      const course = getCourse(1, difficulty), width = course.sample(10).width;
      const save = (x: number) => ({ version: 4, difficulty, records: emptyRecords(), run: placeRun(1, difficulty, 10, side * x) });
      expect(restoreSnapshot(save(width / 2 - .04))?.run?.grounded).toBe(true);
      expect(restoreSnapshot(save(width / 2 + .04))?.run).toBeNull();
    }
  });

  it('keeps records but starts a fresh course when a save predates the new speed-dependent track', () => {
    const run: Record<string, unknown> = { ...placeRun(1, 'hard', 40) };
    delete run.courseRevision;
    const records = emptyRecords();
    records.hard.allTime = 321;
    const restored = restoreSnapshot({ version: 4, difficulty: 'hard', records, run });
    expect(restored?.records.hard.allTime).toBe(321);
    expect(restored?.run).toBeNull();
  });

  it('uses the sphere contact point on both bank edges, rather than an inset centre band', () => {
    for (const difficulty of DIFFICULTIES) {
      const course = getCourse(1, difficulty);
      const bank = spans(course, 8000).find(seg => seg.kind === 'bank' && (() => {
        const mid = (seg.start + seg.end) / 2;
        let blocked = false;
        course.forEachObstacle(mid - 3, mid + 2, () => { blocked = true; });
        return !blocked;
      })())!;
      expect(bank).toBeDefined();
      const at = (bank.start + bank.end) / 2, s = course.sample(at);
      for (const side of [-1, 1]) {
        // The road's normal is (sin(bank), cos(bank)). The contact is one radius
        // down that normal from the centre, which need not be inside the road itself.
        const x = s.center + side * (s.width / 2 - .02) + RADIUS * Math.sin(s.bank);
        const run = placeRun(1, difficulty, at, x), drift = BANK_DRIFT * Math.sin(s.bank);
        run.vx = -drift;
        step(run, -drift / lateralSpeed(runSpeed(run)), STEP);
        expect(run.phase).toBe('running');
        expect(run.grounded).toBe(true);
        expect(run.height).toBeCloseTo(restHeight(course, run.distance, run.x), 9);
        const outside = placeRun(1, difficulty, at, s.center + side * (s.width / 2 + .04) + RADIUS * Math.sin(s.bank));
        outside.vx = -drift;
        step(outside, -drift / lateralSpeed(runSpeed(outside)), STEP);
        expect(outside.grounded).toBe(false);
      }
    }
  });
});

describe('Ball Run noticeable permanent boosts', () => {
  it('gives at least an 18% step at the first gate on every difficulty, then keeps that speed gain', () => {
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 8; seed++) {
      const course = getCourse(seed, difficulty), gate = gates(seed, difficulty, 2000)[0];
      const run = placeRun(seed, difficulty, gate.start - 1);
      let before = 0, after = 0, fired = 0;
      for (let i = 0; i < 500 && run.phase === 'running'; i++) {
        const old = run.gateIndex, speed = runSpeed(run);
        step(run, 0, STEP);
        if (run.gateIndex !== old) { before = speed; after = runSpeed(run); fired++; }
        if (fired && run.speedUpTime === 0) break;
      }
      expect(run.phase).toBe('running');
      expect(fired).toBe(1);
      expect(after / before).toBeGreaterThanOrEqual(1.18);
      expect(runSpeed(run)).toBeGreaterThanOrEqual(after);
      expect(run.speedUpTime).toBe(0);
      // More road covered in the feedback interval, not just a change to the label.
      expect(course.speed(gate.start + after * GATE_FEEDBACK)).toBeGreaterThan(before * 1.18);
    }
  });

  it('stacks two actual entrances and clips a partial final gain exactly to the cap', () => {
    for (const difficulty of DIFFICULTIES) {
      const course = getCourse(2, difficulty), cap = capDistance(course), list = gates(2, difficulty, cap + 5000);
      for (const gate of [list[0], list[1]]) {
        expect(gate).toBeDefined();
        const run = placeRun(2, difficulty, gate.start - .1), before = runSpeed(run);
        for (let i = 0; i < 120 && run.gateIndex < gate.index; i++) step(run, 0, STEP);
        expect(run.phase).toBe('running');
        expect(run.gateIndex).toBe(gate.index);
        expect(runSpeed(run)).toBeGreaterThan(before);
        expect(runSpeed(run)).toBeLessThanOrEqual(CONFIG[difficulty].maxSpeed);
        expect(run.speedUpTime).toBe(GATE_FEEDBACK);
      }
      let partial = false;
      for (let seed = 1; seed <= 16 && !partial; seed++) {
        const candidate = getCourse(seed, difficulty), atCap = capDistance(candidate);
        const gate = gates(seed, difficulty, atCap + 2000).find(g => candidate.speed(g.start - .001) < CONFIG[difficulty].maxSpeed && candidate.speed(g.start) === CONFIG[difficulty].maxSpeed);
        if (!gate) continue;
        const run = placeRun(seed, difficulty, gate.start - .1);
        expect(runSpeed(run)).toBeLessThan(CONFIG[difficulty].maxSpeed);
        for (let i = 0; i < 120 && run.gateIndex < gate.index; i++) step(run, 0, STEP);
        expect(run.phase).toBe('running');
        expect(run.gateIndex).toBe(gate.index);
        expect(runSpeed(run)).toBe(CONFIG[difficulty].maxSpeed);
        expect(run.speedUpTime).toBe(GATE_FEEDBACK);
        partial = true;
      }
      expect(partial, `${difficulty}: at least one gate supplies a partial final gain`).toBe(true);
    }
  });
});
