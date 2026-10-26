import { RADIUS } from './config';

/** Ignore discontinuities instead of spinning across a restored or skipped position. */
export function rollAngle(distance: number): number {
  return Number.isFinite(distance) && Math.abs(distance) <= 3 ? distance / RADIUS : 0;
}
