import { describe, expect, it } from 'vitest';
import { rollAngle } from '../../../src/games/ball-run/roll';
import { RADIUS } from '../../../src/games/ball-run/config';

describe('rollAngle', () => {
  it('stays still without movement', () => expect(rollAngle(0)).toBe(0));
  it('turns by distance over radius and reverses with direction', () => {
    expect(rollAngle(1)).toBeCloseTo(1 / RADIUS);
    expect(rollAngle(-1)).toBeCloseTo(-1 / RADIUS);
  });
  it('ignores discontinuities and invalid movement', () => {
    expect(rollAngle(10)).toBe(0);
    expect(rollAngle(-10)).toBe(0);
    expect(rollAngle(NaN)).toBe(0);
  });
});
