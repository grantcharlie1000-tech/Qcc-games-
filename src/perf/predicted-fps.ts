import type { FrameSnapshot } from './types';

/**
 * Fixed costs for one weak device class. They are source constants, not fitted
 * to a live frame, a rAF interval, or a GPU timer.
 *
 * An empty frame stays under 16.67 ms. Either 400 draw calls or 2,000,000
 * shaded triangles, with nothing else, goes over that budget at the reference
 * 1280×720 floor target. Draw-call and triangle costs do not get cheaper when
 * the CSS layout is smaller; fill does, because it is pixel work.
 */
export const FLOOR_COSTS = {
  baseMs: 0.5,
  drawMs: 0.0415,
  triangleMs: 0.0000083,
  fillPixelsPerMs: 500_000,
  allocationMs: 0.0015,
  animatedDomMs: 0.04,
  layoutReadMs: 0.2,
  readbackMs: 1.2,
} as const;

export const EMPTY_FRAME: FrameSnapshot = {
  draws: 0,
  triangles: 0,
  fillPixels: 0,
  allocations: 0,
  animatedDom: 0,
  layoutReads: 0,
  gpuReadbacks: 0,
};

export const REFERENCE_DRAW_OVERLOAD = 400;
export const REFERENCE_TRIANGLE_OVERLOAD = 2_000_000;

function nonneg(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Predicted milliseconds for one displayed frame on the floor device. */
export function frameMilliseconds(cost: FrameSnapshot): number {
  const c = FLOOR_COSTS;
  return c.baseMs
    + nonneg(cost.draws) * c.drawMs
    + nonneg(cost.triangles) * c.triangleMs
    + nonneg(cost.fillPixels) / c.fillPixelsPerMs
    + nonneg(cost.allocations) * c.allocationMs
    + nonneg(cost.animatedDom) * c.animatedDomMs
    + nonneg(cost.layoutReads) * c.layoutReadMs
    + nonneg(cost.gpuReadbacks) * c.readbackMs;
}

/** Predicted frames per second. Not a measured frame interval. */
export function predictFps(cost: FrameSnapshot): number {
  return 1000 / frameMilliseconds(cost);
}
