/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it } from 'vitest';
import { FLOOR_LAYOUTS } from '../../src/perf/floor';
import { predictFps } from '../../src/perf/predicted-fps';
import { collector as movies } from '../../src/perf/surfaces/movies';
import { collector as tv } from '../../src/perf/surfaces/tv';
import { collector as study } from '../../src/perf/surfaces/study';
import { collector as accounts } from '../../src/perf/surfaces/accounts';
import { collector as leaderboards } from '../../src/perf/surfaces/leaderboards';
import { collector as chat } from '../../src/perf/surfaces/chat';
import { collector as social } from '../../src/perf/surfaces/social';
import { collector as predictions } from '../../src/perf/surfaces/predictions';
import { collector as election } from '../../src/perf/surfaces/election';
import { collector as santa } from '../../src/perf/surfaces/santa';
import { collector as downloads } from '../../src/perf/surfaces/downloads';

const collectors = [movies, tv, study, accounts, leaderboards, chat, social, predictions, election, santa, downloads];

describe('apps floor fps', () => {
  it('predicts at least 60 fps at both floor layouts', () => {
    for (const collector of collectors) {
      for (const layout of FLOOR_LAYOUTS) {
        const snap = collector.collect(layout);
        const painted = snap.draws + snap.triangles + snap.fillPixels + snap.animatedDom + snap.allocations;
        expect(painted, collector.id).toBeGreaterThan(0);
        expect(predictFps(snap), `${collector.id} ${layout.cssWidth}`).toBeGreaterThanOrEqual(60);
      }
    }
  });
});
