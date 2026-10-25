import { describe, expect, it } from 'vitest';
import { CONFIG, DIFFICULTIES, STEP, type Run } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, runSpeed, step } from '../../../src/games/ball-run/model';
import { botStats, capDistance, describeRun, driveBot, placeRun, safeStart, spans } from './bot';

/** The fairness proof: a look-ahead bot drives the real simulation through every
 * difficulty, from the start and at the speed cap, and must never die. */
describe('Ball Run look-ahead bot', () => {
  /** Where and why the run ended, and how often the bot found no line clear of the whole horizon. */
  const failure = (run: Run) => `${describeRun(run)}; ${botStats.failedPlans} of ${botStats.plans} plans fell short`;
  // Each matrix test takes a few seconds; leave room for a loaded machine.
  const timeout = 60000;

  for (const difficulty of DIFFICULTIES) {
    it(`survives 3000 m from the start on 12 ${difficulty} seeds`, { timeout }, () => {
      const failures: string[] = [];
      for (let seed = 1; seed <= 12; seed++) {
        const run = createRun(seed, 1, difficulty);
        run.phase = 'running';
        const result = driveBot(run, 3000);
        expect(result.run).toBe(run);
        if (run.phase !== 'running' || run.distance < 3000) failures.push(failure(run));
        else expect(result.steps * STEP).toBeGreaterThan(3000 / CONFIG[difficulty].maxSpeed);
      }
      expect(failures).toEqual([]);
    });

    it(`survives 1500 m at the ${CONFIG[difficulty].maxSpeed} m/s cap on 4 ${difficulty} seeds`, { timeout }, () => {
      const failures: string[] = [];
      for (let seed = 1; seed <= 4; seed++) {
        const course = getCourse(seed, difficulty), start = safeStart(course, capDistance(course) + 200);
        const run: Run = placeRun(seed, difficulty, start);
        expect(runSpeed(run)).toBe(CONFIG[difficulty].maxSpeed);
        driveBot(run, 1500);
        if (run.phase !== 'running' || run.distance < start + 1500) failures.push(failure(run));
        expect(runSpeed(run)).toBe(CONFIG[difficulty].maxSpeed);
      }
      expect(failures).toEqual([]);
    });
  }

  it('places a run within a step of a drop lip moving with the road it is on, not with the far side of the gap', () => {
    // A cap sweep's safe start fell 0.5 m before a lip (Medium seed 244 at 12467 m); the step ahead
    // then crossed the gap and gave the ball the road's 2.7 m fall in one step as its speed.
    for (const difficulty of DIFFICULTIES) {
      const course = getCourse(1, difficulty), drop = spans(course, 8000).find(s => s.kind === 'drop')!;
      let lip = drop.start;
      while (course.sample(lip).ground) lip += .001;
      const at = lip - .05, run = placeRun(1, difficulty, at), v = course.speed(at);
      expect(course.sample(at + v * STEP).ground).toBe(false);
      expect(run.vy).toBeCloseTo(course.sample(at).gradient * v, 1);
      for (let i = 0; i < 4; i++) step(run, 0, STEP);
      expect(run.phase, describeRun(run)).toBe('running');
      expect(run.vy).toBeGreaterThan(course.sample(at).gradient * v - 1);
    }
  });

  it('survives 3000 m at the Hard cap on seeds 37, 39 and 89, through dense scatter', { timeout }, () => {
    // Regression cases from a 100-seed cap sweep: each spot is passable, but the point-by-point
    // searches fell short there. On 39 they never found the side of an earlier block that leads
    // past a later one; on 37 and 89 a re-plan lost the full line the previous plan had found.
    const failures: string[] = [];
    for (const seed of [37, 39, 89]) {
      const course = getCourse(seed, 'hard'), start = safeStart(course, capDistance(course) + 200);
      const run: Run = placeRun(seed, 'hard', start);
      driveBot(run, 3000);
      if (run.phase !== 'running' || run.distance < start + 3000) failures.push(failure(run));
      expect(runSpeed(run)).toBe(CONFIG.hard.maxSpeed);
    }
    expect(failures).toEqual([]);
  });
});
