import { describe, expect, it } from 'vitest';
import { CONFIG, DIFFICULTIES, STEP, type Run } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, runSpeed } from '../../../src/games/ball-run/model';
import { botStats, capDistance, describeRun, driveBot, placeRun, safeStart } from './bot';

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
});
