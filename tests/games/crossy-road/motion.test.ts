import {describe, expect, it} from 'vitest';
import {carImpact, ufoFlight} from '../../../src/games/crossy-road/motion';

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

it('a mid-hop car impact preserves its initial height then settles within the road, with a compact pancake', () => {
  const at=carImpact(0,0.2,1,0.31,true), landed=carImpact(0.15,0.2,1,0.31,true);
  expect(at.row).toBe(0.2); expect(at.height).toBe(0.31);
  expect(landed.row).toBe(1); expect(landed.height).toBeCloseTo(0.012);
  expect(landed.sx).toBeLessThan(1.2); expect(landed.sy).toBeLessThan(0.15);
});
it('the carried bird clears the UFO underside and stays in front of the saucer', () => {
  const at=ufoFlight(0.37);
  expect(at.birdLift+0.855*at.birdScale).toBeLessThan(at.height);
  expect(at.birdForward).toBeGreaterThan(at.forward+0.3);
});
