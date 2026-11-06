import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BALL, DIFFICULTIES, SLEIGH_BODY, type Run } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun } from '../../../src/games/ball-run/model';
import { botStats, capDistance, describeRun, driveBot, placeRun, safeStart, useBody } from './bot';

// The Christmas sleigh collides as its box and handles like a sleigh (slower steering response, so momentum
// carries; more slide down banks). course.ts's clearance and reach margins are meant to cover both; this shows it
// empirically: the bot, planning with the sleigh's own handling, finishes every run as the sleigh.
describe('Ball Run courses with the Christmas sleigh', () => {
  beforeAll(() => useBody(SLEIGH_BODY));
  afterAll(() => useBody(BALL));
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
