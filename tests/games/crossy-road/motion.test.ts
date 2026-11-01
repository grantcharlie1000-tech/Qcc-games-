import {describe, expect, it} from 'vitest';
import {ufoFlight} from '../../../src/games/crossy-road/motion';

describe('UFO swoop', () => {
  it('enters from above, reaches the bird in a quarter second and carries it off by 0.7 seconds', () => {
    const start = ufoFlight(0), grab = ufoFlight(0.25), carried = ufoFlight(0.4), gone = ufoFlight(0.7);
    expect(start.height).toBeGreaterThan(12);
    expect(start.forward).toBeLessThan(-5);
    expect(grab.height).toBeLessThan(2);
    expect(grab.beam).toBeGreaterThan(0);
    expect(carried.birdLift).toBeGreaterThan(1);
    expect(carried.birdScale).toBeGreaterThanOrEqual(0.8);
    expect(gone.height).toBeGreaterThan(15);
    expect(gone.birdLift).toBeGreaterThan(12);
    expect(gone.visible).toBe(false);
  });

  it('holds a static saucer and fades the bird in reduced motion', () => {
    const a = ufoFlight(0, true), b = ufoFlight(0.15, true), c = ufoFlight(0.3, true);
    expect(a.height).toBe(b.height);
    expect(a.forward).toBe(b.forward);
    expect(b.birdLift).toBe(0);
    expect(b.birdScale).toBe(1);
    expect(b.birdAlpha).toBeCloseTo(0.5);
    expect(c.visible).toBe(false);
  });
});
