import { describe, expect, it } from 'vitest';
import { RENDER_X_MAX, RENDER_X_MIN, type GrassLane, type LilyLane, type RailLane, type RiverLane, type RoadLane } from '../../../src/games/hopway/config';
import {
  forEachMover, laneVelocity, mod, moverBase, platformAt, railWarning, trainClear, trainEntry, trainHit, trainSpan, vehicleHit,
} from '../../../src/games/hopway/lanes';

// Every expectation below is derived by hand from the lane parameters. Numbers are chosen so spans are exact
// binary fractions wherever the assertion is an exact edge; the touching-edge cases also probe both sides.

type Span = [x0: number, x1: number, index: number];
const spans = (lane: RoadLane | RiverLane, t: number, xMin: number, xMax: number): Span[] => {
  const out: Span[] = [];
  forEachMover(lane, t, xMin, xMax, (x0, x1, _mover, index) => out.push([x0, x1, index]));
  return out;
};

const road = (over: Partial<RoadLane> = {}): RoadLane => ({
  kind: 'road', row: 1, dir: 1, speed: 2, vehicle: 'car', cycle: 10, phase: 0,
  movers: [{ offset: 0, len: 2, color: 0 }, { offset: 5, len: 1, color: 1 }], ...over,
});
const river = (over: Partial<RiverLane> = {}): RiverLane => ({
  kind: 'river', row: 2, dir: 1, speed: 1, cycle: 20, phase: 0, movers: [{ offset: 2, len: 2, color: 0 }], ...over,
});
const rail = (over: Partial<RailLane> = {}): RailLane => ({
  kind: 'rail', row: 4, dir: 1, speed: 18, length: 12, period: 6, phase: 2, color: 0, ...over,
});

describe('mod', () => {
  it('is the Euclidean modulo, staying in [0, m) for negative inputs', () => {
    expect(mod(7, 5)).toBe(2);
    expect(mod(-1, 5)).toBe(4);
    expect(mod(-7.5, 5)).toBe(2.5);
    expect(mod(-0.25, 1)).toBe(0.75);
    expect(mod(12.5, 5)).toBe(2.5);
  });

  it('maps exact multiples to +0, never -0 or m', () => {
    expect(mod(0, 5)).toBe(0);
    expect(mod(5, 5)).toBe(0);
    expect(mod(-5, 5)).toBe(0);
    expect(mod(-10, 5)).toBe(0);
  });
});

describe('moverBase', () => {
  it('slides with dir*speed*t and wraps into [0, cycle)', () => {
    const lane = road({ dir: -1, speed: 2, cycle: 10, phase: 1 });
    const mover = { offset: 5, len: 1, color: 0 };
    expect(moverBase(lane, mover, 0)).toBe(6);
    expect(moverBase(lane, mover, 2)).toBe(2);
    expect(moverBase(lane, mover, 4)).toBe(8); // 1 + 5 - 8 = -2 wraps to 8
  });
});

describe('forEachMover', () => {
  it('lists every copy meeting the window for a right-moving lane at t = 0', () => {
    expect(spans(road(), 0, -3, 12)).toEqual([[0, 2, 0], [10, 12, 0], [5, 6, 1]]);
  });

  it('shifts rigidly by dir*speed*t and picks up the wrapped copy on the left at a later t', () => {
    // t = 1.5 shifts +3: mover 0 base 3, mover 1 base 8 with a wrapped copy at -2.
    expect(spans(road(), 1.5, -3, 12)).toEqual([[3, 5, 0], [-2, -1, 1], [8, 9, 1]]);
  });

  it('handles a left-moving lane, including a copy touching xMin and one starting exactly at xMax', () => {
    const lane = road({ dir: -1, phase: 1 });
    // t = 0: bases 1 and 6; mover 1 also has a copy [-4, -3] whose right end touches xMin = -3.
    expect(spans(lane, 0, -3, 12)).toEqual([[1, 3, 0], [11, 13, 0], [-4, -3, 1], [6, 7, 1]]);
    // t = 2 shifts -4: bases 7 and 2; mover 0 has a copy at -3, mover 1 has a copy starting at xMax = 12.
    expect(spans(lane, 2, -3, 12)).toEqual([[-3, -1, 0], [7, 9, 0], [2, 3, 1], [12, 13, 1]]);
  });

  it('reports only spans that meet the window', () => {
    expect(spans(road(), 0, 4, 4.5)).toEqual([]);
    expect(spans(road(), 0, 5.5, 5.5)).toEqual([[5, 6, 1]]);
  });

  it('passes the mover object itself and its index', () => {
    const lane = road();
    const seen: unknown[] = [];
    forEachMover(lane, 0, 0, 3, (_x0, _x1, mover, index) => seen.push([mover, index]));
    expect(seen).toHaveLength(1);
    expect((seen[0] as [unknown, number])[0]).toBe(lane.movers[0]);
    expect((seen[0] as [unknown, number])[1]).toBe(0);
  });
});

describe('vehicleHit', () => {
  const car = road({ cycle: 12, movers: [{ offset: 3, len: 1, color: 0 }] }); // span [3, 4] at t = 0, hitbox [3.1, 3.9]

  it('hits a player standing under the vehicle', () => {
    expect(vehicleHit(car, 3, 0)).toBe(true);
    expect(vehicleHit(car, 3.5, 0)).toBe(true);
  });

  it('does not count touching edges: the left edge of the hitbox is 3.1, the player reaches x + 0.3', () => {
    expect(vehicleHit(car, 2.8, 0)).toBe(false);
    expect(vehicleHit(car, 2.79, 0)).toBe(false);
    expect(vehicleHit(car, 2.81, 0)).toBe(true);
  });

  it('does not count touching edges on the right: the hitbox ends at 3.9, the player starts at x - 0.3', () => {
    expect(vehicleHit(car, 4.19, 0)).toBe(true);
    expect(vehicleHit(car, 4.2, 0)).toBe(false);
    expect(vehicleHit(car, 4.21, 0)).toBe(false);
  });

  it('treats an exact touch as a miss on both sides, and a 0.01 overlap as a hit', () => {
    // Span [0.5, 1.5], hitbox [0.6, 1.4]. In IEEE arithmetic 0.5 + 0.1 and 0.3 + 0.3 are both the double nearest
    // 0.6, and 1.7 - 0.3 and 1.5 - 0.1 are both the double nearest 1.4, so these are true touches (not near misses).
    const edge = road({ cycle: 12, movers: [{ offset: 0.5, len: 1, color: 0 }] });
    expect(vehicleHit(edge, 0.3, 0)).toBe(false);
    expect(vehicleHit(edge, 0.31, 0)).toBe(true);
    expect(vehicleHit(edge, 1.7, 0)).toBe(false);
    expect(vehicleHit(edge, 1.69, 0)).toBe(true);
  });

  it('misses a distant player', () => {
    expect(vehicleHit(car, 0, 0)).toBe(false);
    expect(vehicleHit(car, 8, 0)).toBe(false);
  });

  it('follows the vehicle as time passes', () => {
    // dir 1, speed 2: at t = 1 the span is [5, 6].
    expect(vehicleHit(car, 5.5, 1)).toBe(true);
    expect(vehicleHit(car, 3.5, 1)).toBe(false);
  });

  it('sees wrapped copies on the left of the pattern', () => {
    const left = road({ dir: -1, cycle: 12, movers: [{ offset: 3, len: 1, color: 0 }] });
    // t = 2.5: base = (3 - 5) mod 12 = 10, so copies [10, 11] and [-2, -1].
    expect(vehicleHit(left, -1.2, 2.5)).toBe(true);
    expect(vehicleHit(left, 10.5, 2.5)).toBe(true);
    expect(vehicleHit(left, 5, 2.5)).toBe(false);
  });

  it('uses the full length of a truck minus the inset on both ends', () => {
    const truck = road({ vehicle: 'truck', cycle: 12, movers: [{ offset: 0, len: 3, color: 0 }] }); // hitbox [0.1, 2.9]
    expect(vehicleHit(truck, 3.19, 0)).toBe(true);
    expect(vehicleHit(truck, 3.21, 0)).toBe(false);
    expect(vehicleHit(truck, -0.19, 0)).toBe(true);
    expect(vehicleHit(truck, -0.21, 0)).toBe(false);
  });

  it('checks every mover of the lane', () => {
    const two = road({ cycle: 20, movers: [{ offset: 0, len: 1, color: 0 }, { offset: 8, len: 1, color: 0 }] });
    expect(vehicleHit(two, 8.5, 0)).toBe(true);
    expect(vehicleHit(two, 5, 0)).toBe(false);
  });
});

describe('platformAt', () => {
  const log = river(); // log [2, 4] at t = 0

  it('supports the log widened by the 0.2 grace on both ends, exactly', () => {
    expect(platformAt(log, 3, 0)).toBe(true);
    expect(platformAt(log, 1.8, 0)).toBe(true);
    expect(platformAt(log, 1.79, 0)).toBe(false);
    expect(platformAt(log, 4.2, 0)).toBe(true);
    expect(platformAt(log, 4.21, 0)).toBe(false);
    expect(platformAt(log, 0, 0)).toBe(false);
    expect(platformAt(log, 10, 0)).toBe(false);
  });

  it('moves with the lane', () => {
    // dir 1, speed 1, t = 3: the log is [5, 7].
    expect(platformAt(log, 3, 3)).toBe(false);
    expect(platformAt(log, 6, 3)).toBe(true);
    expect(platformAt(log, 4.81, 3)).toBe(true);
    expect(platformAt(log, 4.79, 3)).toBe(false);
    // dir -1, t = 3: base = (2 - 3) mod 20 = 19, a log [19, 21] with a wrapped copy [-1, 1].
    const back = river({ dir: -1 });
    expect(platformAt(back, 0.5, 3)).toBe(true);
    expect(platformAt(back, 1.19, 3)).toBe(true);
    expect(platformAt(back, 1.21, 3)).toBe(false);
    expect(platformAt(back, 20, 3)).toBe(true);
  });

  it('supports across the wrap of the pattern', () => {
    const wrap = river({ cycle: 20, movers: [{ offset: 18, len: 4, color: 0 }] }); // [18, 22] and [-2, 2]
    expect(platformAt(wrap, 0.5, 0)).toBe(true);
    expect(platformAt(wrap, 2.19, 0)).toBe(true);
    expect(platformAt(wrap, 2.21, 0)).toBe(false);
    expect(platformAt(wrap, 19, 0)).toBe(true);
    expect(platformAt(wrap, 3, 0)).toBe(false);
  });

  it('checks every log of the lane', () => {
    const two = river({ cycle: 20, movers: [{ offset: 2, len: 2, color: 0 }, { offset: 10, len: 3, color: 1 }] });
    expect(platformAt(two, 11, 0)).toBe(true);
    expect(platformAt(two, 7, 0)).toBe(false);
  });

  it('supports a lily pad only on its own column and rounds x to the nearest column', () => {
    const pads = [true, false, true, false, false, false, true, false, true];
    const lily: LilyLane = { kind: 'lily', row: 3, pads };
    expect(platformAt(lily, 0, 0)).toBe(true);
    expect(platformAt(lily, 2, 99)).toBe(true); // time is irrelevant
    expect(platformAt(lily, 2.4, 0)).toBe(true);
    expect(platformAt(lily, 2.6, 0)).toBe(false); // rounds to column 3
    expect(platformAt(lily, 1, 0)).toBe(false);
    expect(platformAt(lily, -0.4, 0)).toBe(true); // rounds to column 0
    expect(platformAt(lily, -0.6, 0)).toBe(false); // rounds to column -1: off the row
    expect(platformAt(lily, 8.4, 0)).toBe(true);
    expect(platformAt(lily, 8.6, 0)).toBe(false); // column 9: off the row
  });

  it('ignores a pad flag past column 8: the row ends at the band', () => {
    const long: LilyLane = { kind: 'lily', row: 3, pads: [...Array(9).fill(false), true] };
    expect(platformAt(long, 9, 0)).toBe(false);
    expect(platformAt(long, 8, 0)).toBe(false);
  });
});

describe('laneVelocity', () => {
  it('carries a player only on a river, signed by direction', () => {
    expect(laneVelocity(river({ dir: 1, speed: 2.5 }))).toBe(2.5);
    expect(laneVelocity(river({ dir: -1, speed: 1.5 }))).toBe(-1.5);
  });

  it('is zero on every other lane', () => {
    const grass: GrassLane = {
      kind: 'grass', row: 0, shade: 0, blocked: Array(9).fill(false), obstacles: Array(9).fill(null),
      variant: Array(9).fill(0), edge: Array(12).fill(null),
    };
    expect(laneVelocity(road({ dir: 1, speed: 4 }))).toBe(0);
    expect(laneVelocity(rail())).toBe(0);
    expect(laneVelocity({ kind: 'lily', row: 1, pads: Array(9).fill(true) })).toBe(0);
    expect(laneVelocity(grass)).toBe(0);
  });
});

describe('rail timeline', () => {
  const lane = rail(); // entries at 2, 8, 14, ...; the light turns on 1.1 s before each
  const clear = 21 / 18; // (8.5 - (-0.5) + 12) / 18 seconds from front entering the band to back leaving it

  it('computes the clear time as band width plus train length over speed', () => {
    expect(trainClear(lane)).toBe(clear);
    expect(trainClear(rail({ length: 20, speed: 20 }))).toBe(29 / 20);
  });

  it('picks the pass whose warning has most recently started', () => {
    expect(trainEntry(lane, 0.9)).toBe(2); // exactly 1.1 s before the entry
    expect(trainEntry(lane, 0.89)).toBe(-4); // still the previous pass
    expect(trainEntry(lane, 2)).toBe(2);
    expect(trainEntry(lane, 6.91)).toBe(8);
    expect(trainEntry(lane, 6.89)).toBe(2);
    expect(trainEntry(lane, -3)).toBe(-4);
  });

  it('turns the warning on exactly 1.1 s before the train enters the band', () => {
    expect(railWarning(lane, 0.9)).toBe(true);
    expect(railWarning(lane, 0.89)).toBe(false);
    expect(railWarning(lane, 6.91)).toBe(true);
    expect(railWarning(lane, 6.89)).toBe(false);
  });

  it('keeps the warning on while the train crosses and for 0.15 s after its back leaves the band', () => {
    const off = 2 + clear + 0.15;
    expect(railWarning(lane, 2)).toBe(true);
    expect(railWarning(lane, 3)).toBe(true);
    expect(railWarning(lane, 2 + clear + 0.05)).toBe(true); // back already out, light still flashing
    expect(railWarning(lane, off - 0.01)).toBe(true);
    expect(railWarning(lane, off + 0.01)).toBe(false);
    expect(railWarning(lane, 5)).toBe(false); // quiet between passes
  });

  it('places a right-moving train with its front at the left band edge on entry', () => {
    expect(trainSpan(lane, 2)).toEqual({ x0: -12.5, x1: -0.5 });
    expect(trainSpan(lane, 2.5)).toEqual({ x0: -3.5, x1: 8.5 });
    expect(trainSpan(lane, 3)).toEqual({ x0: 5.5, x1: 17.5 });
  });

  it('places a left-moving train with its front at x = 8.5 on entry', () => {
    const left = rail({ dir: -1 });
    expect(trainSpan(left, 2)).toEqual({ x0: 8.5, x1: 20.5 });
    expect(trainSpan(left, 2.5)).toEqual({ x0: -0.5, x1: 11.5 });
    expect(railWarning(left, 0.91)).toBe(true);
    expect(railWarning(left, 0.89)).toBe(false);
  });

  it('returns null once the whole train has left the render span on its far side', () => {
    // Heading right the front is at -0.5 + 18u (u = t - 2), so x0 = front - 12 passes RENDER_X_MAX at u = (RENDER_X_MAX + 12.5) / 18.
    const atWarning = trainSpan(lane, 0.9)!; // the warning starts with the train already inside the render span
    expect(atWarning.x0).toBeCloseTo(-32.3, 9);
    expect(atWarning.x1).toBeCloseTo(-20.3, 9);
    expect(trainSpan(lane, 1.5)).toEqual({ x0: -21.5, x1: -9.5 });
    expect(trainSpan(lane, 4)).toEqual({ x0: 23.5, x1: 35.5 });
    const rightOut = 2 + (RENDER_X_MAX + 12.5) / 18;
    expect(trainSpan(lane, rightOut - 0.01)).not.toBeNull();
    expect(trainSpan(lane, rightOut + 0.01)).toBeNull();
    // Heading left the front is at 8.5 - 18u and x1 = front + 12 passes RENDER_X_MIN at u = (8.5 + 12 - RENDER_X_MIN) / 18.
    const left = rail({ dir: -1 }), leftOut = 2 + (20.5 - RENDER_X_MIN) / 18;
    const leftAtWarning = trainSpan(left, 0.9)!;
    expect(leftAtWarning.x0).toBeCloseTo(28.3, 9);
    expect(leftAtWarning.x1).toBeCloseTo(40.3, 9);
    expect(trainSpan(left, leftOut - 0.01)).not.toBeNull();
    expect(trainSpan(left, leftOut + 0.01)).toBeNull();
  });

  it('writes into the supplied object and returns it, and allocates a fresh one otherwise', () => {
    const out = { x0: 99, x1: 99 };
    expect(trainSpan(lane, 2, out)).toBe(out);
    expect(out).toEqual({ x0: -12.5, x1: -0.5 });
    const a = trainSpan(lane, 2), b = trainSpan(lane, 2);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });

  it('hits at the exact moment the hitbox (span minus 0.1 per end) reaches the player', () => {
    expect(trainHit(lane, 0, 2.0)).toBe(false); // back of the hitbox is at -0.6, player starts at -0.3
    expect(trainHit(lane, 0, 2.05)).toBe(true); // span [-11.6, 0.4]: hitbox end 0.3 > -0.3
    expect(trainHit(lane, 0, 2.7)).toBe(true); // span [0.1, 12.1]: hitbox start 0.2 < 0.3
    expect(trainHit(lane, 0, 2.72)).toBe(false); // span [0.46, ...]: hitbox start 0.56 > 0.3
    expect(trainHit(lane, 0, 3)).toBe(false);
  });

  it('applies the 0.1 inset at both ends of the train: the 0.1 between span and hitbox is harmless', () => {
    // t = 2.014: span [-12.248, -0.248]; the span end is past the player's left edge (-0.3) but the hitbox end (-0.348) is not.
    expect(trainHit(lane, 0, 2.014)).toBe(false);
    expect(trainHit(lane, 0, 2.02)).toBe(true); // span end -0.14, hitbox end -0.24 > -0.3
    // t = 2.708: span [0.244, 12.244]; the span start is left of the player's right edge (0.3) but the hitbox start (0.344) is not.
    expect(trainHit(lane, 0, 2.708)).toBe(false);
    expect(trainHit(lane, 0, 2.7)).toBe(true);
  });

  it('never hits while the train is out of the render span', () => {
    expect(trainHit(lane, 4, 0.9)).toBe(false);
    expect(trainHit(lane, 4, 5)).toBe(false);
  });
});
