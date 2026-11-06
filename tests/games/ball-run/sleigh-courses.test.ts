import { describe, expect, it, vi } from 'vitest';
// The bot drives model.step() directly; here every step collides as the Christmas sleigh's box instead of the
// ball, to show empirically what course.ts's CLEAR argument promises: every course stays passable with it.
vi.mock('../../../src/games/ball-run/model', async () => {
  const actual = await vi.importActual<typeof import('../../../src/games/ball-run/model')>('../../../src/games/ball-run/model');
  const { SLEIGH_BODY } = await vi.importActual<typeof import('../../../src/games/ball-run/config')>('../../../src/games/ball-run/config');
  return { ...actual, step: (run: Parameters<typeof actual.step>[0], input: number, dt: number) => actual.step(run, input, dt, SLEIGH_BODY) };
});
import { DIFFICULTIES, type Run } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun } from '../../../src/games/ball-run/model';
import { botStats, capDistance, describeRun, driveBot, placeRun, safeStart } from './bot';

describe('Ball Run courses with the Christmas sleigh', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`the bot finishes every ${difficulty} run, from the start and at the speed cap, as the sleigh`, { timeout: 600000 }, () => {
      const failures: string[] = [];
      for (let seed = 1; seed <= 80; seed++) {
        const run = createRun(seed, 1, difficulty);
        run.phase = 'running';
        driveBot(run, 3000);
        if (run.phase !== 'running' || run.distance < 3000) failures.push(describeRun(run) + ` plans ${botStats.failedPlans}/${botStats.plans}`);
      }
      for (let seed = 1; seed <= 30; seed++) {
        const course = getCourse(seed, difficulty), start = safeStart(course, capDistance(course) + 200);
        const run: Run = placeRun(seed, difficulty, start);
        driveBot(run, 1500);
        if (run.phase !== 'running' || run.distance < start + 1500) failures.push('cap ' + describeRun(run));
      }
      expect(failures).toEqual([]);
    });
  }
});
