import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  EMPTY_FRAME,
  REFERENCE_DRAW_OVERLOAD,
  REFERENCE_TRIANGLE_OVERLOAD,
  frameMilliseconds,
  predictFps,
} from '../../src/perf/predicted-fps';
import type { FrameSnapshot } from '../../src/perf/types';

const source = readFileSync(new URL('../../src/perf/predicted-fps.ts', import.meta.url), 'utf8');

test('the predictor is a fixed cost model and does not sample frame timers', () => {
  expect(source.includes('requestAnimationFrame')).toBe(false);
  expect(source.includes('performance.now')).toBe(false);
  expect(source.includes('performance')).toBe(false);
});

test('an empty frame predicts at least 60 and the reference overload predicts below 60', () => {
  expect(predictFps(EMPTY_FRAME)).toBeGreaterThanOrEqual(60);
  expect(frameMilliseconds(EMPTY_FRAME)).toBeLessThanOrEqual(1000 / 60);

  const draws: FrameSnapshot = { ...EMPTY_FRAME, draws: REFERENCE_DRAW_OVERLOAD };
  const triangles: FrameSnapshot = { ...EMPTY_FRAME, triangles: REFERENCE_TRIANGLE_OVERLOAD };
  expect(predictFps(draws)).toBeLessThan(60);
  expect(predictFps(triangles)).toBeLessThan(60);
  expect(REFERENCE_DRAW_OVERLOAD).toBe(400);
  expect(REFERENCE_TRIANGLE_OVERLOAD).toBe(2_000_000);
});

test('negative counts cannot buy frame time', () => {
  expect(predictFps({ ...EMPTY_FRAME, draws: -1000, triangles: -1 })).toBe(predictFps(EMPTY_FRAME));
});
