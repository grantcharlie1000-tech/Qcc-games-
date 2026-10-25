import { describe, expect, it } from 'vitest';
import { CONFIG, DIFFICULTIES } from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, runSpeed } from '../../../src/games/ball-run/model';
import { capDistance, describeRun, driveBot } from './bot';

describe('Ball Run combined boost/contact endurance', () => {
  for (const difficulty of DIFFICULTIES) {
    it(`${difficulty}: drives from rest through stacked boosts, flights and 4 km at the cap`, { timeout: 60000 }, () => {
      // Includes prior dense-scatter and near-drop-lip regression seeds. Drive the
      // whole course, rather than spawning a grounded ball after its earlier flights.
      for (const seed of [1, 7, 19, 37, 89, 244]) {
        const course = getCourse(seed, difficulty), end = capDistance(course) + 4000;
        const run = createRun(seed, 1, difficulty);
        run.phase = 'running';
        let grounded = true, landed = 0, passed = 0, gate = -1;
        driveBot(run, end, r => {
          if (!grounded && r.grounded) landed++;
          if (r.gateIndex > gate) passed++;
          grounded = r.grounded; gate = r.gateIndex;
        });
        expect(run.phase, describeRun(run)).toBe('running');
        expect(run.distance).toBeGreaterThanOrEqual(end);
        expect(runSpeed(run)).toBe(CONFIG[difficulty].maxSpeed);
        expect(passed).toBeGreaterThan(4);
        expect(landed).toBeGreaterThan(0);
      }
    });
  }
});
