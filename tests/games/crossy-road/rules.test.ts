/** CrossyRoad rules: each death triggers exactly under its rule and not otherwise.
 *
 * Lanes are built by hand (no generator or world), and every expected time is derived from the geometry in the comments, not by
 * asking the code under test. Player hitbox is [x − 0.3, x + 0.3]; a vehicle or train box is its span less 0.1 per end; a log
 * supports centres within 0.2 of its ends; the band is [−0.5, 8.5]. */
import { describe, expect, it } from 'vitest';
import {
  BACK_LIMIT, COLS, DEATH_TIME, DEATH_TIME_REDUCED, HOP_HEIGHT, HOP_TIME, IDLE_LIMIT, IDLE_WARN, MAX_ROW, SAFE_LAG, STEP, scrollRate,
  type Dir, type GrassLane, type Lane, type LaneSource, type LilyLane, type Mover, type RailLane, type RiverLane, type RoadLane, type RunState, type StepEvents,
} from '../../../src/games/crossy-road/config';
import { railWarning, trainEntry } from '../../../src/games/crossy-road/lanes';
import { createRun, hopTarget, idleTime, input, pose, renderX, restore, serialize, step, ufoWarning, type Snapshot } from '../../../src/games/crossy-road/rules';

// ---- hand-built lanes ---------------------------------------------------------------------------------------------------
const mv = (offset: number, len = 1): Mover => ({ offset, len, color: 0 });

function grass(row: number, blockedCols: number[] = [], obstacle: 'tree' | 'rock' = 'tree'): GrassLane {
  const obstacles = Array.from({ length: COLS }, (_, c) => (blockedCols.includes(c) ? obstacle : null));
  return {
    kind: 'grass', row, shade: (row & 1) as 0 | 1, blocked: obstacles.map((o) => o !== null), obstacles,
    variant: obstacles.map(() => 0), edge: Array.from({ length: 12 }, () => null),
  };
}
interface MovingOpts { dir: -1 | 1; speed: number; movers?: Mover[]; cycle?: number; phase?: number }
const road = (row: number, o: MovingOpts): RoadLane => ({ kind: 'road', row, dir: o.dir, speed: o.speed, vehicle: 'car', cycle: o.cycle ?? 20, phase: o.phase ?? 0, movers: o.movers ?? [] });
const river = (row: number, o: MovingOpts): RiverLane => ({ kind: 'river', row, dir: o.dir, speed: o.speed, cycle: o.cycle ?? 20, phase: o.phase ?? 0, movers: o.movers ?? [] });
const lily = (row: number, padCols: number[]): LilyLane => ({ kind: 'lily', row, pads: Array.from({ length: COLS }, (_, c) => padCols.includes(c)) });
const rail = (row: number, o: { dir: -1 | 1; period: number; phase: number; speed?: number; length?: number }): RailLane =>
  ({ kind: 'rail', row, dir: o.dir, speed: o.speed ?? 18, length: o.length ?? 12, period: o.period, phase: o.phase, color: 0 });

const hedge = grass(-1, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
/** Rows not listed are open grass; rows below 0 are the fully blocked hedge. */
function source(lanes: Lane[] = []): LaneSource {
  const byRow = new Map<number, Lane>(lanes.map((l) => [l.row, l]));
  return { lane: (row) => (row < 0 ? hedge : byRow.get(row) ?? grass(row)) };
}

// ---- hand-built states and stepping -------------------------------------------------------------------------------------
/** A running state grounded on `row` at `x` at world time `t`, with the idle clock and score fresh. */
function standing(row: number, x: number, t = 0): RunState {
  const s = createRun(1);
  s.t = t; s.phase = 'running'; s.started = true;
  s.row = s.fromRow = s.maxRow = row;
  s.x = s.fromX = x;
  s.lastProgress = t;
  s.safeLine = Math.max(0, row - SAFE_LAG);
  return s;
}

/** Steps `seconds` of world time in STEP-sized steps (the last one shorter) and returns every step's events. */
function advance(s: RunState, world: LaneSource, seconds: number, reduced = false): StepEvents[] {
  const out: StepEvents[] = [];
  for (let left = seconds; left > 1e-12; left -= STEP) out.push(step(s, Math.min(STEP, left), world, reduced));
  return out;
}

/** Steps STEP at a time until the run stops running (or `limit` seconds of world time pass). `before` is the world time at the
 * start of the last step, so the player was alive at every instant up to and including it. */
function stepUntilDeath(s: RunState, world: LaneSource, limit = 30): { before: number; events: StepEvents } {
  let before = s.t, events: StepEvents = { landed: false, newMax: false, chime: false, died: null, over: false, ufoWarn: false };
  while (s.phase === 'running' && s.t < limit) { before = s.t; events = step(s, STEP, world); }
  return { before, events };
}

/** Hops one tile and lands it, with a single step of exactly HOP_TIME (hazards are not the subject). */
function hop(s: RunState, dir: Dir, world: LaneSource): void {
  expect(input(s, dir, world)).toBe('hop');
  step(s, HOP_TIME, world);
}

describe('createRun', () => {
  it('starts pristine on row 0, column 4, with the seed as an unsigned 32-bit integer', () => {
    expect(createRun(7)).toEqual({
      v: 1, worldVersion: 6, seed: 7, t: 0, phase: 'ready', row: 0, x: 4, fromRow: 0, fromX: 4, hop: -1, hopDir: 'up', facing: 'up', queued: null,
      maxRow: 0, lastProgress: 0, safeLine: 0, started: false, bonkAt: -1e9, bonkDir: 'up', landedAt: -1e9, death: null,
    });
    expect(createRun(-1).seed).toBe(4294967295);
    expect(createRun(2 ** 32 + 5).seed).toBe(5);
    expect(createRun(1.9).seed).toBe(1);
  });
});

describe('start', () => {
  it('only advances time while ready: no auto-scroll, no UFO, even after 60 s, and idle time is not counted', () => {
    const s = createRun(1), world = source();
    const events = advance(s, world, 60);
    expect(s.t).toBeCloseTo(60, 6);
    expect(s).toMatchObject({ phase: 'ready', started: false, safeLine: 0, lastProgress: 0, death: null, row: 0, maxRow: 0 });
    expect(events.every((e) => !e.ufoWarn && e.died === null && !e.over && !e.landed)).toBe(true);
    expect(input(s, 'up', world)).toBe('hop');
    expect(s.lastProgress).toBe(s.t); // the idle clock starts at the first hop, not at time 0
  });

  it('starts the run on the first successful hop, even a sideways one that raises no row', () => {
    const s = createRun(1), world = source();
    advance(s, world, 2.5);
    expect(input(s, 'left', world)).toBe('hop');
    expect(s).toMatchObject({ phase: 'running', started: true, maxRow: 0, row: 0, x: 3 });
    expect(s.lastProgress).toBe(s.t);
  });

  it('keeps the run ready when the first input is blocked, and a later hop still starts it', () => {
    const world = source([grass(1, [4])]);
    const s = createRun(1);
    advance(s, world, 1);
    expect(input(s, 'up', world)).toBe('blocked');
    expect(s).toMatchObject({ phase: 'ready', started: false, row: 0, x: 4, hop: -1, lastProgress: 0 });
    expect(input(s, 'left', world)).toBe('hop');
    expect(s.phase).toBe('running');
  });
});

describe('hop', () => {
  it('moves the logical position at hop start and lands after exactly HOP_TIME', () => {
    const s = createRun(1), world = source();
    expect(input(s, 'up', world)).toBe('hop');
    expect(s).toMatchObject({ row: 1, x: 4, fromRow: 0, fromX: 4, hop: 0, hopDir: 'up', facing: 'up', phase: 'running' });

    let events = step(s, HOP_TIME - 0.001, world);
    expect(events.landed).toBe(false);
    expect(s.hop).toBeCloseTo(HOP_TIME - 0.001, 9);

    events = step(s, 0.002, world); // the landing is 0.001 s into this step; the rest is spent grounded
    expect(events.landed).toBe(true);
    expect(s.hop).toBe(-1);
    expect(s.landedAt).toBeCloseTo(HOP_TIME, 9);
    expect(s.t).toBeCloseTo(HOP_TIME + 0.001, 9);
    expect(step(s, STEP, world).landed).toBe(false); // exactly one landing event per hop
  });

  it('snaps facing at once, including on a sideways hop', () => {
    const s = createRun(1), world = source();
    input(s, 'left', world);
    expect(s.facing).toBe('left');
    expect(s.hopDir).toBe('left');
  });

  it('draws a sine arc that peaks at HOP_HEIGHT halfway, with linear travel and z from fromRow to row', () => {
    const s = createRun(1), world = source();
    input(s, 'right', world); // column 4 to 5 on row 0
    expect(pose(s)).toMatchObject({ x: 4, z: 0, lift: 0, progress: 0, facing: 'right' });

    step(s, HOP_TIME / 4, world);
    expect(renderX(s)).toBeCloseTo(4.25, 9);
    expect(pose(s).lift).toBeCloseTo(Math.SQRT1_2 * HOP_HEIGHT, 9);
    expect(pose(s).progress).toBeCloseTo(0.25, 9);

    step(s, HOP_TIME / 4, world);
    const mid = pose(s);
    expect(mid.x).toBeCloseTo(4.5, 9);
    expect(mid.lift).toBeCloseTo(HOP_HEIGHT, 9);
    expect(mid.progress).toBeCloseTo(0.5, 9);

    step(s, HOP_TIME, world); // lands
    expect(pose(s)).toEqual({ x: 5, z: 0, lift: 0, facing: 'right', progress: -1 });
  });

  it('interpolates z between the rows of a forward hop', () => {
    const s = createRun(1), world = source();
    input(s, 'up', world);
    step(s, HOP_TIME / 2, world);
    expect(pose(s).z).toBeCloseTo(0.5, 9);
    expect(pose(s).x).toBe(4);
  });
});

describe('hopTarget', () => {
  // rows: 0 grass, 1 grass+tree@6, 2 log, 3 log, 4 grass, 5 lily(pad@2), 6 log, 7 lily(pad@3)
  const log = (row: number) => river(row, { dir: 1, speed: 1 });
  const world = source([grass(1, [6]), log(2), log(3), lily(5, [2]), log(6), lily(7, [3])]);
  // [description, state row, state x, dir, expected target (null = blocked)]
  const cases: Array<[string, number, number, Dir, { row: number; x: number } | null]> = [
    ['grass forward keeps the column', 0, 4, 'up', { row: 1, x: 4 }],
    ['grass sideways moves one column left', 0, 4, 'left', { row: 0, x: 3 }],
    ['grass sideways moves one column right', 0, 4, 'right', { row: 0, x: 5 }],
    ['the hedge below row 0 blocks down', 0, 4, 'down', null],
    ['column 0 allows left', 0, 0, 'left', {row:0,x:-1}],
    ['column 8 allows right', 0, 8, 'right', {row:0,x:9}],
    ['a tree ahead blocks forward', 0, 6, 'up', null],
    ['land into a log row keeps the integer column', 1, 4, 'up', { row: 2, x: 4 }],
    ['log to land rounds down: 6.4 lands on column 6', 3, 6.4, 'up', { row: 4, x: 6 }],
    ['log to land rounds up: 6.6 lands on column 7', 3, 6.6, 'up', { row: 4, x: 7 }],
    ['log to land at 8.45 rounds to column 8', 3, 8.45, 'up', { row: 4, x: 8 }],
    ['log to land at 8.5 rounds to column 9', 3, 8.5, 'up', {row:4,x:9}],
    ['log to land at -0.4 rounds to column 0', 3, -0.4, 'up', { row: 4, x: 0 }],
    ['log to land at -0.6 rounds to column -1', 3, -0.6, 'up', {row:4,x:-1}],
    ['log to land rounds onto a tree: 5.6 is column 6, blocked', 2, 5.6, 'down', null],
    ['log to land rounds off the tree: 5.4 is column 5, open', 2, 5.4, 'down', { row: 1, x: 5 }],
    ['log to log keeps the continuous x', 2, 5.37, 'up', { row: 3, x: 5.37 }],
    ['log to lily rounds to the nearest column', 6, 3.6, 'up', { row: 7, x: 4 }],
    ['sideways on a log moves exactly one tile', 2, 5.37, 'right', { row: 2, x: 6.37 }],
    ['sideways on a log reaching 8.4 is allowed', 2, 7.4, 'right', { row: 2, x: 8.4 }],
    ['sideways on a log reaching 8.6 is allowed', 2, 7.6, 'right', {row:2,x:8.6}],
    ['sideways on a log reaching -0.4 is allowed', 2, 0.6, 'left', { row: 2, x: -0.4 }],
    ['sideways on a log reaching -0.6 is allowed', 2, 0.4, 'left', {row:2,x:-0.6}],
    ['land to lily keeps the column, pad or not', 4, 4, 'up', { row: 5, x: 4 }],
    ['lily to log keeps the column', 5, 2, 'up', { row: 6, x: 2 }],
    ['sideways on a lily row is legal into open water', 5, 2, 'left', { row: 5, x: 1 }],
  ];
  it.each(cases)('%s', (_name, row, x, dir, expected) => {
    const s = standing(row, x);
    const target = hopTarget(s, dir, world);
    if (expected === null) expect(target).toBeNull();
    else {
      expect(target).not.toBeNull();
      expect(target!.row).toBe(expected.row);
      expect(target!.x).toBeCloseTo(expected.x, 9);
    }
  });

  it('returns a fresh object each call, so an earlier answer is never overwritten by a later one', () => {
    const s = standing(0, 4);
    const up = hopTarget(s, 'up', world)!, left = hopTarget(s, 'left', world)!;
    expect(up).toEqual({ row: 1, x: 4 });
    expect(left).toEqual({ row: 0, x: 3 });
    expect(up).not.toBe(left);
  });

  it('never moves the state and normalises a snapped column to +0', () => {
    const s = standing(3, -0.4);
    const before = JSON.stringify(s);
    const target = hopTarget(s, 'up', world)!;
    expect(JSON.stringify(s)).toBe(before);
    expect(Object.is(target.x, 0)).toBe(true); // Math.round(-0.4) is -0, which would not survive a JSON round trip
  });
});

describe('blocked moves', () => {
  // [description, lanes, row, x, dir]
  const cases: Array<[string, Lane[], number, number, Dir]> = [
    ['a tree ahead', [grass(1, [4])], 0, 4, 'up'],
    ['a rock beside', [grass(0, [5], 'rock')], 0, 4, 'right'],
    ['row 0 going down (the hedge)', [], 0, 4, 'down'],
  ];
  it.each(cases)('%s is a bonk: position, run and idle timer untouched, never a death', (_name, lanes, row, x, dir) => {
    const world = source(lanes);
    const s = standing(row, x, 3);
    s.lastProgress = 1.5;
    expect(input(s, dir, world)).toBe('blocked');
    expect(s).toMatchObject({ row, x, fromRow: row, fromX: x, hop: -1, phase: 'running', lastProgress: 1.5, maxRow: row, facing: dir, bonkDir: dir, bonkAt: 3, death: null, queued: null });
    expect(step(s, STEP, world).died).toBeNull();
  });
});

describe('pose after a bonk', () => {
  it('faces the direction of the blocked move while staying put', () => {
    const world = source([grass(1, [4])]);
    const s = standing(0, 4, 3);
    expect(input(s, 'up', world)).toBe('blocked');
    expect(pose(s)).toEqual({ x: 4, z: 0, lift: 0, facing: 'up', progress: -1 });
    hop(s, 'left', world);
    expect(input(s, 'up', source([grass(1, [3])]))).toBe('blocked');
    expect(pose(s).facing).toBe('up'); // the hop faced left; the bonk turns the bunny to the tree
    expect(s.hopDir).toBe('left');
  });
});

describe('the first row', () => {
  it('row 0 going down is blocked by the rules themselves, whatever the world has below it', () => {
    const openBelow: LaneSource = { lane: (row) => grass(row) }; // no hedge: row −1 is plain open grass here
    const s = standing(0, 4, 3);
    expect(hopTarget(s, 'down', openBelow)).toBeNull();
    expect(input(s, 'down', openBelow)).toBe('blocked');
    expect(s).toMatchObject({ row: 0, x: 4, hop: -1, bonkAt: 3, bonkDir: 'down', phase: 'running' });
  });
});

describe('score', () => {
  it('rises only on a new furthest row: up, up, down, up leaves maxRow at 2', () => {
    const world = source(), s = createRun(1);
    const after: Array<[number, number]> = [];
    for (const dir of ['up', 'up', 'down', 'up'] as const) { hop(s, dir, world); after.push([s.row, s.maxRow]); }
    expect(after).toEqual([[1, 1], [2, 2], [1, 2], [2, 2]]);
    hop(s, 'up', world);
    expect([s.row, s.maxRow]).toEqual([3, 3]);
  });
});

describe('D1: car', () => {
  // Player in column 4: box [3.7, 4.3]. A one-tile car has hitbox [x0 + 0.1, x0 + 0.9], so it overlaps while 2.8 < x0 < 4.2.
  const fromRight = road(1, { dir: -1, speed: 2.5, movers: [mv(10.3)] }); // x0 = 10.3 − 2.5t: x0 < 4.2 once t > 2.44
  const fromLeft = road(1, { dir: 1, speed: 2.5, movers: [mv(0.5)] });    // x0 = 0.5 + 2.5t: x0 > 2.8 once t > 0.92

  it.each([
    ['from the right', fromRight, 2.44],
    ['from the left', fromLeft, 0.92],
  ])('a car %s kills a player standing in column 4 within one step after the hitboxes overlap, and not before', (_name, lane, tHit) => {
    const world = source([lane]);
    const s = standing(1, 4);
    const { before, events } = stepUntilDeath(s, world);
    expect(before).toBeLessThanOrEqual(tHit); // alive at the last step that ended at or before the overlap
    expect(s.phase).toBe('dying');
    expect(s.death).toMatchObject({ cause: 'car', t: s.t, row: 1, x: 4, dir: lane.dir });
    expect(s.death!.t).toBeGreaterThan(tHit);
    expect(s.death!.t - tHit).toBeLessThanOrEqual(STEP + 1e-9);
    expect(events.died).toBe('car');

    const dead = JSON.stringify(s.death);
    for (const e of advance(s, world, 0.3)) expect(e.died).toBeNull(); // a death is reported once and never rewritten
    expect(JSON.stringify(s.death)).toBe(dead);
  });

  it('a gap passing over the player is harmless; the next car then kills at its own time', () => {
    // Car B leaves the box at x0 = 2.8 (t = 3.58). Car A: x0 = 20.2 − 2.5t reaches 4.2 at t = 6.4.
    const world = source([road(1, { dir: -1, speed: 2.5, movers: [mv(0.2), mv(11.75)] })]);
    const s = standing(1, 4, 3.63);
    advance(s, world, 6.35 - 3.63); // 2.72 s standing in the gap
    expect(s.phase).toBe('running');
    const { before } = stepUntilDeath(s, world);
    expect(s.death).toMatchObject({ cause: 'car' });
    expect(before).toBeLessThanOrEqual(6.4);
    expect(s.death!.t).toBeGreaterThan(6.4);
    expect(s.death!.t - 6.4).toBeLessThanOrEqual(STEP + 1e-9);
  });

  it('hopping into a row while a car overlaps column 4 dies within the first step of the hop', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(3.5)] })]); // hitbox [3.6, 4.4] overlaps [3.7, 4.3] now
    const s = createRun(1);
    expect(input(s, 'up', world)).toBe('hop'); // entering the lane is legal
    expect(s).toMatchObject({ row: 1, phase: 'running' }); // and the check belongs to step, not to the hop start
    const events = step(s, STEP, world);
    expect(events.died).toBe('car');
    expect(events.landed).toBe(false);
    expect(s.phase).toBe('dying');
    expect(s.death).toMatchObject({ cause: 'car', row: 1, x: 4, dir: -1 });
    expect(s.hop).toBeCloseTo(STEP, 9);
  });

  it('hopping into the same lane with the car clear of column 4 survives the hop and the landing', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(12)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    advance(s, world, HOP_TIME + 0.05);
    expect(s.phase).toBe('running');
    expect(s.hop).toBe(-1);
  });

  it('checks the interpolated x on a sideways hop, not the start or the target column', () => {
    // Hop 4 → 5. The car's hitbox edge is at 4.8 − 2τ; the player's right edge is 4.3 + τ/HOP_TIME. They meet at τ = 0.5 / (1/HOP_TIME + 2).
    // Using the target x (5) would kill in the first step; using the start x (4) would only kill at the landing, 0.12 s in.
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(4.7)] })]);
    const s = standing(1, 4);
    expect(input(s, 'right', world)).toBe('hop');
    const tau = 0.5 / (1 / HOP_TIME + 2);
    const { before } = stepUntilDeath(s, world);
    expect(s.death).toMatchObject({ cause: 'car', row: 1 });
    expect(before).toBeLessThanOrEqual(tau);
    expect(s.death!.t).toBeGreaterThan(tau);
    expect(s.death!.t - tau).toBeLessThanOrEqual(STEP + 1e-9);
    expect(s.death!.x).toBeCloseTo(4 + s.death!.t / HOP_TIME, 9);
  });

  it('after a hop forward out of a road row has started, the old row is no longer dangerous', () => {
    // The car in row 1 would kill a player standing in column 4 at t = 2.44. The player starts hopping to row 2 at t = 2.4.
    const world = source([road(1, { dir: -1, speed: 2.5, movers: [mv(10.3)] })]);
    const s = standing(1, 4, 2.4);
    expect(input(s, 'up', world)).toBe('hop');
    advance(s, world, 1); // the car crosses column 4 in the middle of the hop, one row behind
    expect(s).toMatchObject({ phase: 'running', row: 2, hop: -1 });
  });

  it('freezes the hop where it was at the moment of death, while time keeps running', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(3.5)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    step(s, STEP, world);
    const frozen = pose(s), hopAt = s.hop, tAt = s.t;
    expect(frozen.progress).toBeCloseTo(STEP / HOP_TIME, 9);
    expect(frozen.lift).toBeGreaterThan(0);
    advance(s, world, 0.5);
    expect(s.hop).toBe(hopAt);
    expect(pose(s)).toEqual(frozen);
    expect(s.t).toBeCloseTo(tAt + 0.5, 9);
    expect(s.phase).toBe('dying');
  });
});

describe('D2: train', () => {
  // A 12-tile train at 18 tiles/s: its front is at −0.5 + 18u (from the left) or 8.5 − 18u (from the right), u seconds after entry.
  // The player's box is [x − 0.3, x + 0.3] and the train's box is its span less 0.1: from the left it overlaps once the front
  // passes x − 0.2, from the right once it passes x + 0.2.
  it.each([
    ['from the left', rail(1, { dir: 1, period: 20, phase: 2 }), 2],  // front reaches 1.8:  2.3 tiles after the band edge
    ['from the right', rail(1, { dir: -1, period: 20, phase: 2 }), 6], // front reaches 6.2: 2.3 tiles after the band edge
  ])('a train %s kills at the exact overlap time, after the light has flashed for at least 1 s', (_name, lane, x) => {
    const entry = 2; // the first pass reaches the band at phase = 2
    expect(trainEntry(lane, 1.0)).toBe(entry);
    const tHit = entry + 2.3 / 18;
    const world = source([lane]);
    const s = standing(1, x);
    let lightOn: number | null = null; // world time of the first step of the current unbroken warning
    let before = s.t;
    while (s.phase === 'running' && s.t < 10) {
      before = s.t;
      step(s, STEP, world);
      if (railWarning(lane, s.t)) lightOn ??= s.t; else lightOn = null;
    }
    expect(before).toBeLessThanOrEqual(tHit);
    expect(s.phase).toBe('dying');
    expect(s.death).toMatchObject({ cause: 'train', t: s.t, row: 1, x, dir: lane.dir });
    expect(s.death!.t).toBeGreaterThan(tHit);
    expect(s.death!.t - tHit).toBeLessThanOrEqual(STEP + 1e-9);
    expect(lightOn).not.toBeNull();
    expect(s.death!.t - lightOn!).toBeGreaterThanOrEqual(1.0);
  });

  it('an empty track is safe: standing between two passes for 6 s never kills', () => {
    // The first train's back clears column 4 at t = 2 + (4.2 + 12.5)/18 = 2.93; the next pass enters at 22 with its light on from 20.9.
    const lane = rail(1, { dir: 1, period: 20, phase: 2 });
    const world = source([lane]);
    const s = standing(1, 4, 3);
    for (const e of advance(s, world, 6)) {
      expect(e.died).toBeNull();
      if (s.t > 3.4) expect(railWarning(lane, s.t)).toBe(false); // really between passes: the light is off
    }
    expect(s.phase).toBe('running');
  });

  it('checks the interpolated x on a sideways hop, as it does for cars', () => {
    // A train from the right has its front at 6.175 when the bunny hops right from column 4 (t = 10). The hitbox edge is front + 0.1
    // and the bunny's right edge is 4.3 + τ/HOP_TIME, so they meet at τ = (6.175 − 4.2) / (18 + 1/HOP_TIME) = 0.075 s.
    // Using the target column 5 would kill at 0.054 s, and using the start column 4 only at 0.110 s.
    const lane = rail(1, { dir: -1, period: 20, phase: 10 - (8.5 - 6.175) / 18 });
    const world = source([lane]);
    const s = standing(1, 4, 10);
    expect(input(s, 'right', world)).toBe('hop');
    const tau = 10 + (6.175 - 4.2) / (18 + 1 / HOP_TIME);
    const { before } = stepUntilDeath(s, world);
    expect(s.death).toMatchObject({ cause: 'train', row: 1, dir: -1 });
    expect(before).toBeLessThanOrEqual(tau);
    expect(s.death!.t).toBeGreaterThan(tau);
    expect(s.death!.t - tau).toBeLessThanOrEqual(STEP + 1e-9);
    expect(s.death!.x).toBeCloseTo(4 + (s.death!.t - 10) / HOP_TIME, 9);
  });

  it('hopping into a rail row under the train dies within the first step of the hop', () => {
    // At t = 2.4 the front of the left-to-right train is at −0.5 + 18·0.4 = 6.7, so its box [−5.2, 6.6] covers column 4.
    const world = source([rail(1, { dir: 1, period: 20, phase: 2 })]);
    const s = standing(0, 4, 2.4);
    expect(input(s, 'up', world)).toBe('hop');
    const events = step(s, STEP, world);
    expect(events.died).toBe('train');
    expect(s.death).toMatchObject({ cause: 'train', row: 1, x: 4, dir: 1 });
  });
});

describe('D3: water', () => {
  it('hopping into open water is legal, alive in the air and fatal exactly at the landing', () => {
    const world = source([river(1, { dir: 1, speed: 1.5, movers: [mv(10, 3)] })]); // the only log is far from column 4
    const s = createRun(1);
    expect(input(s, 'up', world)).toBe('hop'); // not blocked: there is no "blocked" water
    let events = step(s, 0.06, world); // halfway, over the water
    expect(events).toMatchObject({ died: null, landed: false });
    expect(s.phase).toBe('running');
    expect(s.hop).toBeCloseTo(0.06, 9);

    events = step(s, 0.06, world);
    expect(events).toMatchObject({ landed: true, died: 'water' });
    expect(s.phase).toBe('dying');
    expect(s.hop).toBe(-1);
    expect(s.death).toMatchObject({ cause: 'water', t: s.t, row: 1, x: 4, dir: 1 });
    expect(s.death!.t).toBeCloseTo(HOP_TIME, 9);
  });

  it.each([
    // Left-moving 1-tile logs at 4 tiles/s: x0 = offset − 4t. A centre at 4 is supported while x0 − 0.2 ≤ 4 ≤ x0 + 1.2.
    ['a log that arrives under column 4 before the landing', 4.5, false], // t = 0: x0 = 4.5 (unsupported); t = 0.12: x0 = 4.02 (supported)
    ['a log that has left column 4 by the landing', 3.0, true],           // t = 0: x0 = 3.0 (supported); t = 0.12: x0 = 2.52 (right end 3.52 + 0.2 < 4)
  ])('judges %s at the landing time, not at the hop start', (_name, offset, drowns) => {
    const world = source([river(1, { dir: -1, speed: 4, movers: [mv(offset)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    const events = step(s, HOP_TIME, world);
    expect(events.landed).toBe(true);
    expect(events.died).toBe(drowns ? 'water' : null);
    expect(s.phase).toBe(drowns ? 'dying' : 'running');
    if (drowns) expect(s.death).toMatchObject({ cause: 'water', dir: -1 });
  });

  it.each([
    ['carried right', 1, 3.32],  // x0 = 3.32 + 1.5t is 3.5 at the landing: log [3.5, 6.5] under column 4
    ['carried left', -1, 3.68],  // x0 = 3.68 − 1.5t is 3.5 at the landing
  ] as const)('landing on a log is safe, then the player is %s by dir·speed·dt', (_name, dir, offset) => {
    const world = source([river(1, { dir, speed: 1.5, movers: [mv(offset, 3)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    step(s, HOP_TIME, world);
    expect(s.phase).toBe('running');
    expect(s.x).toBe(4); // the player does not drift while hopping
    advance(s, world, 1);
    expect(s.phase).toBe('running');
    expect(s.x).toBeCloseTo(4 + dir * 1.5 * 1, 9);
  });

  it('a lily pad is safe and does not move; a column without a pad drowns', () => {
    const world = source([lily(1, [4, 5, 7])]);
    const safe = createRun(1);
    hop(safe, 'up', world);
    advance(safe, world, 3);
    expect(safe).toMatchObject({ phase: 'running', row: 1, x: 4 });

    const next = createRun(1), bare = createRun(1);
    hop(next, 'up', world);
    hop(next, 'right', world); // column 5 has a pad
    expect(next).toMatchObject({ phase: 'running', x: 5 });
    hop(bare, 'up', world);
    expect(input(bare, 'left', world)).toBe('hop'); // column 3 is open water: legal and fatal
    expect(bare.phase).toBe('running');
    expect(step(bare, HOP_TIME, world).died).toBe('water');
    expect(bare.death).toMatchObject({ cause: 'water', row: 1, x: 3, dir: 1 });
  });

  it('forward from a pad into a lily row with no pad there drowns at landing', () => {
    const world = source([lily(1, [4]), lily(2, [3])]);
    const s = createRun(1);
    hop(s, 'up', world);
    expect(s.phase).toBe('running');
    input(s, 'up', world);
    expect(step(s, HOP_TIME, world).died).toBe('water');
    expect(s.death).toMatchObject({ cause: 'water', row: 2, x: 4 });
  });

  it.each([
    // A 3-tile log [3, 6] moving right at 1.5: at the landing it is [3.18, 6.18], supporting centres up to 6.38.
    ['one tile along the log', 4.9, false], // target 5.9
    ['off the end of the log', 5.8, true],  // target 6.8
  ])('a sideways hop %s lands where it aimed and is judged there', (_name, x, drowns) => {
    const world = source([river(1, { dir: 1, speed: 1.5, movers: [mv(3, 3)] })]);
    const s = standing(1, x);
    expect(input(s, 'right', world)).toBe('hop');
    const events = step(s, HOP_TIME, world);
    expect(events.died).toBe(drowns ? 'water' : null);
    expect(s.x).toBeCloseTo(x + 1, 9); // no drift while hopping
    expect(s.phase).toBe(drowns ? 'dying' : 'running');
  });

  it.each([
    ['a log under the landing x', [mv(4, 3)], false], // x = 5.37 is inside [4.18, 7.18] at the landing
    ['no log under the landing x', [mv(14, 3)], true],
  ])('log to log keeps the continuous x and finds %s', (_name, movers, drowns) => {
    const world = source([river(1, { dir: 1, speed: 1.5 }), river(2, { dir: 1, speed: 1.5, movers })]);
    const s = standing(1, 5.37);
    input(s, 'up', world);
    expect(s.x).toBe(5.37);
    expect(step(s, HOP_TIME, world).died).toBe(drowns ? 'water' : null);
  });
});

describe('log carrying without horizontal boundaries', () => {
  it.each([['right',1,8],['left',-1,0]] as const)('riding %s carries the player beyond the original band', (_name,dir,x0) => {
    const world=source([river(1,{dir,speed:1.3})]), s=standing(1,x0);
    advance(s,world,2);
    expect(s.phase).toBe('running');expect(s.death).toBeNull();
    expect(s.x).toBeCloseTo(x0+dir*1.3*2,8);
  });
  it.each([8.5,-.6,10000.4,-10000.6])('hops from a log at %s to the nearest land column', x => {
    const world=source([river(1,{dir:1,speed:1.3})]), s=standing(1,x,2);
    expect(input(s,'up',world)).toBe('hop');step(s,HOP_TIME,world);
    expect(s).toMatchObject({row:2,x:Math.round(x),phase:'running',death:null});
  });
});

describe('idleTime and ufoWarning', () => {
  it('idle time is the time since the last new best row once started, and 0 before', () => {
    const waiting = createRun(1);
    waiting.t = 50;
    expect(idleTime(waiting)).toBe(0);
    const s = standing(3, 4, 12);
    s.lastProgress = 9;
    expect(idleTime(s)).toBe(3);
  });

  it.each([
    [4.99, false],
    [IDLE_WARN, true],
    [IDLE_WARN + 0.01, true],
    [6.9, true],
  ])('the warning at idle time %s s is %s', (idle, on) => {
    const s = standing(2, 4);
    s.t = idle; // lastProgress is 0
    expect(ufoWarning(s)).toBe(on);
  });

  it('is never on before the first hop or once the run has ended', () => {
    const ready = createRun(1);
    ready.t = 30;
    expect(ufoWarning(ready)).toBe(false);
    for (const phase of ['dying', 'over'] as const) {
      const s = standing(2, 4);
      s.t = 6; s.phase = phase;
      expect(ufoWarning(s)).toBe(false);
    }
  });
});

describe('auto-scroll safe line', () => {
  it('rises at scrollRate(maxRow) once started', () => {
    const world = source(), s = createRun(1);
    input(s, 'up', world); // maxRow 1, safe line 0 (the pull-up line is −1)
    advance(s, world, 2);
    expect(s.safeLine).toBeCloseTo(scrollRate(1) * 2, 9);
  });

  it('is faster on a deeper row: 0.9 rows/s once maxRow reaches 300', () => {
    const world = source();
    const s = standing(300, 4);
    expect(s.safeLine).toBe(298);
    advance(s, world, 1);
    expect(s.safeLine).toBeCloseTo(298.9, 9);
  });

  it('is pulled up to maxRow − SAFE_LAG by the next step once the best row is further ahead than that', () => {
    const world = source(), s = createRun(1);
    for (let i = 0; i < 10; i++) hop(s, 'up', world);
    expect(s.maxRow).toBe(10);
    expect(s.safeLine).toBe(10 - SAFE_LAG);
  });

  it('never decreases, whatever the player does', () => {
    const world = source(), s = createRun(1);
    let last = s.safeLine;
    for (const dir of ['up', 'up', 'up', 'down', 'left', 'down', 'up', 'right', 'up', 'up'] as const) {
      input(s, dir, world);
      for (const _ of advance(s, world, 0.5)) { expect(s.safeLine).toBeGreaterThanOrEqual(last); last = s.safeLine; }
    }
    expect(s.phase).toBe('running');
    expect(last).toBeGreaterThan(0);
  });
});

describe('D6: UFO behind', () => {
  it.each([3, 5, 40])('with maxRow %s, going back is fine down to maxRow − 2 and the third row back is fatal within one step', (max) => {
    const world = source();
    const s = standing(max, 4); // the safe line sits at max − 2, so only the best-row rule can fire
    hop(s, 'down', world);
    hop(s, 'down', world); // row max − 2
    expect(s.row).toBe(max - 2);
    advance(s, world, 1);
    expect(s.phase).toBe('running');

    expect(input(s, 'down', world)).toBe('hop'); // row max − BACK_LIMIT
    expect(s).toMatchObject({ row: max - BACK_LIMIT, phase: 'running' }); // the rule is applied by step
    const events = step(s, STEP, world);
    expect(events.died).toBe('ufo-behind');
    expect(s.phase).toBe('dying');
    expect(s.death).toMatchObject({ cause: 'ufo-behind', t: s.t, row: max - BACK_LIMIT, x: 4, dir: 1 });
    expect(s.hop).toBeCloseTo(STEP, 9); // taken in mid-air
  });

  it('the safe line takes the player when it reaches row + BACK_LIMIT, and not while it is under that', () => {
    const world = source();
    const onTheLine = standing(5, 4);
    onTheLine.safeLine = 5 + BACK_LIMIT;
    expect(step(onTheLine, 0.01, world).died).toBe('ufo-behind');
    expect(onTheLine.death).toMatchObject({ cause: 'ufo-behind', row: 5 });

    const under = standing(5, 4);
    under.safeLine = 5 + 2.9; // needs 0.1 rows of auto-scroll to reach the line
    const eta = 0.1 / scrollRate(5);
    advance(under, world, eta - 0.02);
    expect(under.phase).toBe('running');
    expect(step(under, 0.04, world).died).toBe('ufo-behind');
  });

  it('a buffered second hop back never starts once the first has put the player BACK_LIMIT rows behind', () => {
    const world = source();
    const s = standing(5, 4);
    hop(s, 'down', world);
    hop(s, 'down', world); // row 3, two behind
    expect(input(s, 'down', world)).toBe('hop'); // row 2: three behind, caught by the first step of the hop
    expect(input(s, 'down', world)).toBe('queued');
    advance(s, world, 0.5);
    expect(s.death).toMatchObject({ cause: 'ufo-behind', row: 2 }); // not row 1
    expect(s.queued).toBeNull();
  });

  it('a hop that stays within BACK_LIMIT of the best row never triggers it, however many sideways hops are made', () => {
    const world = source();
    const s = standing(6, 4);
    for (const dir of ['left', 'right', 'down', 'left', 'up', 'right'] as const) hop(s, dir, world);
    expect(s.phase).toBe('running');
  });
});

describe('D5: UFO idle', () => {
  it('warns from 5.0 s and takes the player at 7.0 s after the first hop, counting from the hop and not from the start', () => {
    const world = source();
    const s = createRun(1);
    advance(s, world, 3); // ready time does not count
    expect(input(s, 'left', world)).toBe('hop'); // a sideways first hop: no new best row, the clock starts here
    const t0 = s.t;
    expect(s.lastProgress).toBe(t0);

    for (const e of advance(s, world, 4.99)) expect(e.ufoWarn).toBe(false);
    expect(ufoWarning(s)).toBe(false);
    expect(s.t - t0).toBeCloseTo(4.99, 9);

    const warned = advance(s, world, 0.03); // idle 5.02
    expect(ufoWarning(s)).toBe(true);
    expect(warned.at(-1)!.ufoWarn).toBe(true);

    advance(s, world, 6.99 - 5.02);
    expect(s.phase).toBe('running');
    expect(s.t - t0).toBeCloseTo(6.99, 9);

    const { events } = stepUntilDeath(s, world);
    expect(events.died).toBe('ufo-idle');
    expect(s.phase).toBe('dying');
    expect(s.death!.t - t0).toBeGreaterThanOrEqual(IDLE_LIMIT - 1e-9);
    expect(s.death!.t - t0).toBeLessThan(IDLE_LIMIT + STEP + 1e-9);
    expect(s.death).toMatchObject({ cause: 'ufo-idle', t: s.t, row: 0, x: 3, dir: 1 });
  });

  it('sideways and backward hops and bonks never reset the idle clock', () => {
    const world = source([grass(1, [])]);
    const s = createRun(1);
    hop(s, 'up', world); // best row 1: the clock starts at this hop
    const t0 = s.lastProgress;
    advance(s, world, 2);
    hop(s, 'left', world);
    advance(s, world, 1);
    hop(s, 'down', world); // back to row 0, one row behind the best
    advance(s, world, 1);
    hop(s, 'up', world);   // back onto the best row, which is not a new one
    expect(s.lastProgress).toBe(t0);
    advance(s, world, 1.5);
    expect(input(s, 'down', world)).toBe('hop');
    step(s, HOP_TIME, world);
    advance(s, world, 0.6);
    expect(s.row).toBe(0);
    expect(input(s, 'down', world)).toBe('blocked'); // the hedge: a bonk is no progress either
    expect(s.lastProgress).toBe(t0);
    const { events } = stepUntilDeath(s, world);
    expect(events.died).toBe('ufo-idle');
    expect(s.death!.t - t0).toBeGreaterThanOrEqual(IDLE_LIMIT - 1e-9);
    expect(s.death!.t - t0).toBeLessThan(IDLE_LIMIT + STEP + 1e-9);
  });

  it('a new best row resets the clock', () => {
    const world = source();
    const s = createRun(1);
    hop(s, 'up', world);
    advance(s, world, 6);
    expect(ufoWarning(s)).toBe(true);
    expect(input(s, 'up', world)).toBe('hop'); // best row 2
    const t1 = s.t;
    expect(s.lastProgress).toBe(t1);
    expect(ufoWarning(s)).toBe(false);
    advance(s, world, 6.9);
    expect(s.phase).toBe('running');
    const { events } = stepUntilDeath(s, world);
    expect(events.died).toBe('ufo-idle');
    expect(s.death!.t - t1).toBeGreaterThanOrEqual(IDLE_LIMIT - 1e-9);
    expect(s.death!.t - t1).toBeLessThan(IDLE_LIMIT + STEP + 1e-9);
  });
});

describe('death precedence when several rules hold on the same step', () => {
  it('the camera fall-behind rule still applies while riding beyond the old band', () => {
    const world = source([river(5, { dir: 1, speed: 0 })]);
    const s = standing(5, 8.6);
    s.safeLine = 5 + BACK_LIMIT;
    expect(step(s, 0.01, world).died).toBe('ufo-behind');
  });

  it('a car before the UFO rules', () => {
    const world = source([road(1, { dir: -1, speed: 0, movers: [mv(3.5)] })]); // parked on column 4
    const s = standing(1, 4, 10);
    s.lastProgress = 2; // idle 8 s
    s.safeLine = 1 + BACK_LIMIT;
    expect(step(s, 0.01, world).died).toBe('car');
  });

  it('a train before the UFO rules', () => {
    const world = source([rail(1, { dir: 1, period: 20, phase: 9.6 })]); // at t = 10 the front is at 6.7: column 4 is under the train
    const s = standing(1, 4, 10);
    s.lastProgress = 2;
    s.safeLine = 1 + BACK_LIMIT;
    expect(step(s, 0.01, world).died).toBe('train');
  });

  it('UFO-behind before UFO-idle', () => {
    const world = source();
    const s = standing(5, 4, 10);
    s.lastProgress = 2;
    s.safeLine = 5 + BACK_LIMIT;
    expect(step(s, 0.01, world).died).toBe('ufo-behind');
  });
});

describe('input buffer', () => {
  it('queues exactly one input during a hop and drops the rest, keeping the first', () => {
    const world = source(), s = createRun(1);
    expect(input(s, 'up', world)).toBe('hop');
    expect(input(s, 'left', world)).toBe('queued');
    expect(s.queued).toBe('left');
    expect(input(s, 'right', world)).toBe('dropped');
    expect(input(s, 'up', world)).toBe('dropped');
    expect(s.queued).toBe('left');
    expect(s).toMatchObject({ row: 1, x: 4 }); // queueing moves nothing
    step(s, 0.2, world);
    expect(s).toMatchObject({ hopDir: 'left', x: 3, row: 1, queued: null });
  });

  it('starts the queued hop at the exact landing time', () => {
    const world = source(), s = createRun(1);
    input(s, 'up', world);
    input(s, 'up', world);
    const events = step(s, 0.2, world); // lands 0.12 s in; the queued hop is then 0.08 s along
    expect(events).toMatchObject({ landed: true, newMax: true, chime: false, died: null });
    expect(s).toMatchObject({ row: 2, fromRow: 1, hopDir: 'up', facing: 'up', queued: null, maxRow: 2 });
    expect(s.hop).toBeCloseTo(0.2 - HOP_TIME, 9);
    expect(s.landedAt).toBeCloseTo(HOP_TIME, 9);
    expect(s.lastProgress).toBeCloseTo(HOP_TIME, 9); // the new best row is stamped with the landing, not the end of the step
  });

  it.each([
    [23, true],  // queued hop reaches row 25
    [22, false], // row 24
    [24, false], // row 26 (row 25 was reached by the first hop, which input() reports through maxRow)
  ])('a queued hop from row %s that makes a new best row sets newMax, and chime only on a multiple of 25: %s', (from, chime) => {
    const world = source(), s = standing(from, 4);
    input(s, 'up', world);
    input(s, 'up', world);
    const events = step(s, 0.2, world);
    expect(events).toMatchObject({ newMax: true, chime });
    expect(s.maxRow).toBe(from + 2);
  });

  it('a queued sideways or backward hop is not a new best row', () => {
    const world = source(), s = standing(5, 4);
    input(s, 'down', world);
    input(s, 'down', world);
    const events = step(s, 0.2, world);
    expect(events).toMatchObject({ landed: true, newMax: false, chime: false });
    expect(s).toMatchObject({ row: 3, maxRow: 5, lastProgress: 0 });
  });

  it('a blocked queued input bonks at the landing time and the run goes on', () => {
    const world = source([grass(2, [4])]); // a tree in front of row 1
    const s = createRun(1);
    input(s, 'up', world);
    expect(input(s, 'up', world)).toBe('queued'); // accepted: whether it is blocked is only known at the landing
    const events = step(s, 0.2, world);
    expect(events).toMatchObject({ landed: true, newMax: false, died: null });
    expect(s).toMatchObject({ row: 1, hop: -1, queued: null, bonkDir: 'up', facing: 'up', phase: 'running', maxRow: 1, lastProgress: 0 });
    expect(s.bonkAt).toBeCloseTo(HOP_TIME, 9);
  });

  it('a landing in water takes the player before the queued hop can start', () => {
    const world = source([river(1, { dir: 1, speed: 1.5, movers: [mv(10, 3)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    input(s, 'up', world);
    const events = step(s, 0.2, world);
    expect(events).toMatchObject({ landed: true, died: 'water', newMax: false });
    expect(s).toMatchObject({ phase: 'dying', row: 1, queued: null });
  });

  it('a queued hop is checked from the instant it starts: into a parked car it dies at the landing time', () => {
    const world = source([road(2, { dir: -1, speed: 0, movers: [mv(3.5)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    input(s, 'up', world);
    const events = step(s, 0.2, world);
    expect(events.died).toBe('car');
    expect(s.death).toMatchObject({ cause: 'car', row: 2, x: 4 });
    expect(s.death!.t).toBeCloseTo(HOP_TIME, 9);
    expect(s.hop).toBe(0);
  });

  it.each(['dying', 'over'] as const)('ignores every input while %s and changes nothing', (phase) => {
    const world = source();
    const s = standing(5, 4, 20);
    s.safeLine = 8; // the UFO takes the player on the first step
    expect(step(s, 0.01, world).died).toBe('ufo-behind');
    if (phase === 'over') step(s, 5, world);
    expect(s.phase).toBe(phase);
    const before = JSON.stringify(s);
    for (const dir of ['up', 'down', 'left', 'right'] as const) expect(input(s, dir, world)).toBe('ignored');
    expect(JSON.stringify(s)).toBe(before);
  });

  it('ignores inputs while dying even when the death froze a hop in mid-air', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(3.5)] })]);
    const s = createRun(1);
    input(s, 'up', world);
    step(s, STEP, world);
    expect(s).toMatchObject({ phase: 'dying' });
    expect(s.hop).toBeGreaterThan(0);
    expect(input(s, 'left', world)).toBe('ignored');
    expect(s.queued).toBeNull();
  });
});

describe('dying to over', () => {
  /** A run that the UFO takes on the first step: it died at the returned state's `death.t`. */
  const dying = (): RunState => {
    const s = standing(5, 4, 20);
    s.safeLine = 8;
    expect(step(s, 0.01, source()).died).toBe('ufo-behind');
    return s;
  };

  it.each([
    ['', false, DEATH_TIME],
    [' with reduced motion', true, DEATH_TIME_REDUCED],
  ])('the run is over exactly after the death animation%s', (_label, reduced, wait) => {
    const world = source(), s = dying();
    const died = s.death!.t;
    let events = step(s, wait - 0.001, world, reduced);
    expect(events.over).toBe(false);
    expect(s.phase).toBe('dying');
    events = step(s, 0.002, world, reduced);
    expect(events.over).toBe(true);
    expect(s.phase).toBe('over');
    expect(s.t - died).toBeCloseTo(wait + 0.001, 9);
  });

  it.each([
    ['at 60 Hz the run is over on the 54th step after the death, with one over event', false, 54],
    ['with reduced motion it is over on the 18th step', true, 18],
  ])('%s', (_name, reduced, n) => {
    const world = source(), s = dying();
    const overAt: number[] = [];
    for (let i = 1; i <= n + 20; i++) if (step(s, STEP, world, reduced).over) overAt.push(i);
    expect(overAt).toEqual([n]);
  });

  it('reduced motion changes nothing but the length of the death animation: hop and UFO timers are the same', () => {
    const play = (reduced: boolean) => {
      const world = source(), s = createRun(1);
      input(s, 'up', world);
      const warned: number[] = [];
      let dyingAt = -1, overAt = -1;
      for (let i = 1; i <= 900; i++) {
        const events = step(s, STEP, world, reduced);
        if (events.ufoWarn && warned.length === 0) warned.push(s.t);
        if (events.died) dyingAt = s.t;
        if (events.over) { overAt = s.t; break; }
      }
      return { death: s.death, warned, dyingAt, overAt, landedAt: s.landedAt };
    };
    const normal = play(false), reduced = play(true);
    expect(normal.death).toMatchObject({ cause: 'ufo-idle' });
    expect(reduced.death).toEqual(normal.death);
    expect(reduced.warned).toEqual(normal.warned);
    expect(reduced.landedAt).toBe(normal.landedAt);
    expect(normal.overAt - normal.dyingAt).toBeCloseTo(DEATH_TIME, 9);
    expect(reduced.overAt - reduced.dyingAt).toBeCloseTo(DEATH_TIME_REDUCED, 9);
  });

  it('only advances time while dying: no hop progress, no auto-scroll, no second death, no warning', () => {
    const world = source(), s = dying();
    const { t: before, ...rest } = s;
    for (const e of advance(s, world, 0.5)) expect(e).toEqual({ landed: false, newMax: false, chime: false, died: null, over: false, ufoWarn: false });
    const { t: after, ...now } = s;
    expect(now).toEqual(rest);
    expect(after - before).toBeCloseTo(0.5, 9);
  });

  it('stops time once over: t no longer advances and nothing is reported', () => {
    const world = source(), s = dying();
    step(s, DEATH_TIME + 0.1, world);
    expect(s.phase).toBe('over');
    const t = s.t, frozen = JSON.stringify(s);
    expect(step(s, 3, world)).toEqual({ landed: false, newMax: false, chime: false, died: null, over: false, ufoWarn: false });
    expect(s.t).toBe(t);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('step edge cases', () => {
  it.each([0, -1, NaN])('a step of %s seconds changes nothing', (dt) => {
    const world = source(), s = standing(3, 4, 7);
    input(s, 'up', world);
    const before = JSON.stringify(s);
    const events = step(s, dt, world);
    expect(JSON.stringify(s)).toBe(before);
    expect(events).toEqual({ landed: false, newMax: false, chime: false, died: null, over: false, ufoWarn: false });
  });

  it('gives the same outcome however the same time is cut into steps: hops land at their exact time', () => {
    // safeLine is left out on purpose: it ratchets with max(), so its exact value depends on the step length by up to rate·dt.
    const script = (cuts: number[]) => {
      const world = source([grass(2, [4])]), s = createRun(1);
      input(s, 'up', world); input(s, 'left', world);
      for (const dt of cuts) step(s, dt, world);
      input(s, 'up', world); input(s, 'up', world); input(s, 'right', world);
      for (const dt of cuts) step(s, dt, world);
      return s;
    };
    const reference = script([0.5]);
    expect(reference).toMatchObject({ phase: 'running', row: 3, x: 3, maxRow: 3, hop: -1, queued: null });
    for (const cuts of [Array<number>(30).fill(STEP), [0.07, 0.13, 0.3], [0.2, 0.2, 0.1], [0.45, 0.05]]) {
      const s = script(cuts);
      expect(s).toMatchObject({ phase: reference.phase, row: reference.row, x: reference.x, maxRow: reference.maxRow, queued: reference.queued, hop: reference.hop });
      for (const k of ['t', 'lastProgress', 'landedAt'] as const) expect(s[k]).toBeCloseTo(reference[k], 9);
    }
  });
});

// Literal snapshots, one rule at a time: each invalid case below breaks exactly one rule of an otherwise valid snapshot.
const running = (): Snapshot => ({
  v: 1, seed: 7, t: 10, phase: 'running', row: 5, x: 4, fromRow: 5, fromX: 4, hop: -1, hopDir: 'up', facing: 'up', queued: null,
  maxRow: 5, lastProgress: 8, safeLine: 3, started: true, death: null,
});
const ready = (): Snapshot => ({ ...running(), t: 3, phase: 'ready', row: 0, fromRow: 0, maxRow: 0, lastProgress: 0, safeLine: 0, started: false });
const over = (): Snapshot => ({ ...running(), phase: 'over', death: { cause: 'car', t: 9.5, row: 5, x: 4, dir: -1 } });
const deathWith = (patch: Record<string, unknown>) => ({ ...over(), death: { ...over().death!, ...patch } });

describe('serialize and restore', () => {
  const roundTrip = (s: RunState): RunState | null => restore(JSON.parse(JSON.stringify(serialize(s))));
  /** A log arrives under column 4 at the landing: [3.5, 6.5] at t = 0.12, moving right at 1.5 tiles/s. */
  const logWorld = () => source([river(1, { dir: 1, speed: 1.5, movers: [mv(3.32, 3)] })]);
  const bareWorld = () => source([river(1, { dir: 1, speed: 1.5, movers: [mv(10, 3)] })]);

  const cases: Array<[string, () => { s: RunState; world: LaneSource }, number]> = [
    ['mid-hop over water, where a log arrives', () => { const world = logWorld(), s = createRun(5); input(s, 'up', world); step(s, 0.05, world); return { s, world }; }, 2],
    ['mid-hop over water, where the player will drown at the landing', () => { const world = bareWorld(), s = createRun(5); input(s, 'up', world); step(s, 0.05, world); return { s, world }; }, 2],
    ['mid-hop with an input queued', () => { const world = logWorld(), s = createRun(5); input(s, 'up', world); input(s, 'left', world); step(s, 0.05, world); return { s, world }; }, 2],
    ['riding a log for 1.3 s (carried 1.95 tiles) beyond the old edge', () => { const world = logWorld(), s = createRun(5); input(s, 'up', world); step(s, HOP_TIME + 1.3, world); return { s, world }; }, 4],
  ];
  it.each(cases)('round-trips a state %s through JSON and then plays on identically', (_name, make, seconds) => {
    const { s, world } = make();
    expect(s.phase).toBe('running');
    const snapshot = serialize(s);
    const copy = roundTrip(s)!;
    expect(copy).not.toBeNull();
    expect(serialize(copy)).toEqual(snapshot);
    expect(copy).toMatchObject({ bonkAt: -1e9, bonkDir: 'up', landedAt: -1e9 }); // visual-only state starts over
    for (let t = 0; t < seconds; t += STEP) {
      step(s, STEP, world);
      step(copy, STEP, world);
      expect(serialize(copy)).toEqual(serialize(s));
    }
    expect(copy.death).toEqual(s.death);
  });

  it('copies exactly the snapshot fields and nothing visual, all JSON-safe', () => {
    const world = logWorld(), s = createRun(5);
    input(s, 'up', world);
    input(s, 'left', world);
    step(s, 0.05, world);
    s.bonkAt = 3; s.landedAt = 2;
    const snapshot = serialize(s);
    expect(Object.keys(snapshot).sort()).toEqual(
      ['death', 'facing', 'fromRow', 'fromX', 'hop', 'hopDir', 'lastProgress', 'maxRow', 'phase', 'queued', 'row', 'safeLine', 'seed', 'started', 't', 'v', 'worldVersion', 'x'],
    );
    expect(snapshot).toMatchObject({ v: 1, seed: 5, phase: 'running', row: 1, fromRow: 0, queued: 'left', started: true, death: null });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('writes every snapshot field from the state, each with a non-default value', () => {
    const s = createRun(1234);
    Object.assign(s, {
      t: 12.5, phase: 'running', row: 7, x: 5.5, fromRow: 6, fromX: 4.5, hop: 0.07, hopDir: 'right', facing: 'left', queued: 'down',
      maxRow: 8, lastProgress: 9.25, safeLine: 6.5, started: true, bonkAt: 11, bonkDir: 'down', landedAt: 12,
    });
    expect(serialize(s)).toEqual({
      v: 1, worldVersion: 6, seed: 1234, t: 12.5, phase: 'running', row: 7, x: 5.5, fromRow: 6, fromX: 4.5, hop: 0.07, hopDir: 'right', facing: 'left', queued: 'down',
      maxRow: 8, lastProgress: 9.25, safeLine: 6.5, started: true, death: null,
    });
    s.phase = 'ready'; s.started = false;
    expect(serialize(s).phase).toBe('ready');
    s.phase = 'over'; s.death = { cause: 'water', t: 11.75, row: 7, x: 5.5, dir: -1 };
    expect(serialize(s)).toMatchObject({ phase: 'over', death: { cause: 'water', t: 11.75, row: 7, x: 5.5, dir: -1 } });
  });

  it('writes a dying state as over, with its death, and restores it as over', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(3.5)] })]);
    const s = createRun(5);
    input(s, 'up', world);
    step(s, STEP, world);
    expect(s.phase).toBe('dying');
    const snapshot = serialize(s);
    expect(snapshot.phase).toBe('over');
    expect(snapshot.death).toEqual(s.death);
    expect(snapshot.death).not.toBe(s.death); // a copy
    expect(snapshot.hop).toBe(s.hop);         // the frozen death pose survives
    expect(s.phase).toBe('dying');            // serializing never changes the run
    const copy = roundTrip(s)!;
    expect(copy).toMatchObject({ phase: 'over', hop: s.hop, row: 1 });
    expect(copy.death).toEqual(s.death);
  });

  it('pause and resume need no state change: serializing is pure and a zero-length step is a no-op', () => {
    const world = logWorld(), s = createRun(5);
    input(s, 'up', world);
    step(s, 0.05, world);
    const before = serialize(s), full = JSON.stringify(s);
    expect(serialize(s)).toEqual(before);
    step(s, 0, world);
    expect(serialize(s)).toEqual(before);
    expect(JSON.stringify(s)).toBe(full);
  });

  it('does not share objects with the snapshot it was restored from', () => {
    const snapshot = over();
    const copy = restore(snapshot)!;
    copy.death!.t = 0;
    expect(snapshot.death!.t).toBe(9.5);
  });

  it('ignores unknown extra keys', () => {
    const copy = restore({ ...running(), extra: 1, bonkAt: 5, landedAt: 6, constructor: 'x' })!;
    expect(copy).not.toBeNull();
    expect(copy).toMatchObject({ bonkAt: -1e9, landedAt: -1e9 });
    expect(Object.keys(serialize(copy))).not.toContain('extra');
  });
});

describe('restore accepts valid snapshots, boundaries included', () => {
  it.each<[string, unknown]>([
    ['a running state', running()],
    ['a ready state', ready()],
    ['an over state with a death', over()],
    ['seed 0', { ...running(), seed: 0 }],
    ['the largest seed', { ...running(), seed: 4294967295 }],
    ['t = 0', { ...running(), t: 0, lastProgress: 0 }],
    ['t = 1e7', { ...running(), t: 1e7, lastProgress: 1e7 }],
    ['lastProgress = t', { ...running(), lastProgress: 10 }],
    ['row = maxRow = fromRow = MAX_ROW', { ...running(), row: MAX_ROW, maxRow: MAX_ROW, fromRow: MAX_ROW }],
    ['three rows behind the best row', { ...running(), row: 2, fromRow: 2 }],
    ['a hop one row long', { ...running(), fromRow: 4 }],
    ['x at the band edge plus one: 9.5', { ...running(), x: 9.5, fromX: 9.5 }],
    ['x at the band edge minus one: -1.5', { ...running(), x: -1.5, fromX: -1.5 }],
    ['a hop 1.5 long', { ...running(), hop: 0.05, x: 4, fromX: 5.5 }],
    ['a grounded rider carried 5 tiles from where its last hop began', { ...running(), x: 8, fromX: 3 }],
    ['a grounded rider carried the other way', { ...running(), x: 0, fromX: 5 }],
    ['hop = 0', { ...running(), hop: 0 }],
    ['hop just under HOP_TIME', { ...running(), hop: HOP_TIME - 0.001 }],
    ['an input queued during a hop', { ...running(), hop: 0.05, queued: 'left' }],
    ['safeLine = 0', { ...running(), safeLine: 0 }],
    ['safeLine at its upper bound', { ...running(), safeLine: 5 + BACK_LIMIT + 1 }],
    ['a death exactly at t', deathWith({ t: 10 })],
    ['a death at t = 0', deathWith({ t: 0 })],
    ['a death with dir 1', deathWith({ dir: 1 })],
    ...(['car', 'train', 'water', 'swept', 'ufo-idle', 'ufo-behind'] as const).map((cause): [string, unknown] => [`death cause ${cause}`, deathWith({ cause })]),
    ['an over state that froze mid-hop', { ...over(), hop: 0.03, fromRow: 4 }],
  ])('%s', (_name, data) => {
    expect(restore(data)).not.toBeNull();
  });

  it('restores every field of a valid snapshot', () => {
    expect(restore({ ...running(), hop: 0.05, queued: 'left', hopDir: 'right', facing: 'down', fromRow: 4, fromX: 3.5 })).toEqual({
      v: 1, worldVersion: 1, seed: 7, t: 10, phase: 'running', row: 5, x: 4, fromRow: 4, fromX: 3.5, hop: 0.05, hopDir: 'right', facing: 'down', queued: 'left',
      maxRow: 5, lastProgress: 8, safeLine: 3, started: true, bonkAt: -1e9, bonkDir: 'up', landedAt: -1e9, death: null,
    });
  });
});

describe('restore rejects anything that is off, and never throws', () => {
  const invalid: Array<[string, unknown]> = [
    ['null', null], ['undefined', undefined], ['a number', 42], ['a string', 'x'], ['a boolean', true], ['an array', []], ['an empty object', {}],
    ['a function', () => running()], ['a bigint', 10n], ['an array carrying every field', Object.assign([], running())],
    ['version 2', { ...running(), v: 2 }], ['a string version', { ...running(), v: '1' }],
    ['a negative seed', { ...running(), seed: -1 }], ['a fractional seed', { ...running(), seed: 1.5 }], ['a seed above 2^32 - 1', { ...running(), seed: 2 ** 32 }],
    ['a NaN seed', { ...running(), seed: NaN }], ['a string seed', { ...running(), seed: '7' }],
    ['a NaN t', { ...running(), t: NaN }], ['an infinite t', { ...running(), t: Infinity }], ['a negative infinite t', { ...running(), t: -Infinity }],
    ['a negative t', { ...running(), t: -1, lastProgress: -1 }], ['t above 1e7', { ...running(), t: 1e7 + 1, lastProgress: 8 }], ['a string t', { ...running(), t: '10' }],
    ['the dying phase', { ...running(), phase: 'dying' }], ['an unknown phase', { ...running(), phase: 'paused' }], ['a numeric phase', { ...running(), phase: 3 }],
    ['a negative row', { ...running(), row: -1, fromRow: 0, maxRow: 0, safeLine: 0 }],
    ['a fractional row', { ...running(), row: 5.5, maxRow: 6, fromRow: 5 }],
    ['a fractional fromRow', { ...running(), fromRow: 5.5 }],
    ['a negative fromRow', { ...running(), row: 0, maxRow: 0, fromRow: -1, safeLine: 0 }],
    ['a fractional maxRow', { ...running(), maxRow: 5.5 }],
    ['a string row', { ...running(), row: '5' }],
    // A save is rebuilt by generating every row up to it, so an absurd row from a tampered save must not freeze the tab.
    ['a maxRow above MAX_ROW', { ...running(), maxRow: MAX_ROW + 1, row: MAX_ROW, fromRow: MAX_ROW, safeLine: 0 }],
    ['a fromRow above MAX_ROW', { ...running(), fromRow: MAX_ROW + 1, row: MAX_ROW, maxRow: MAX_ROW, safeLine: 0 }],
    ['a row of a million', { ...running(), row: 1e6, maxRow: 1e6, fromRow: 1e6, safeLine: 0 }],
    ['a row above the best row', { ...running(), row: 6 }],
    ['maxRow − row = 4', { ...running(), row: 1, fromRow: 1 }],
    ['a hop two rows long', { ...running(), fromRow: 3 }],
    ['a NaN x', { ...running(), x: NaN }], ['an infinite x', { ...running(), x: Infinity }],
    ['unrepresentable viewport coordinate', { ...running(), x: Number.MAX_SAFE_INTEGER, fromX: Number.MAX_SAFE_INTEGER }],
    ['a NaN fromX', { ...running(), fromX: NaN }], ['an infinite fromX', { ...running(), fromX: Infinity }],
    ['a hop 1.6 long', { ...running(), hop: 0.05, x: 4, fromX: 5.6 }],
    ['hop = 0.5', { ...running(), hop: 0.5 }], ['hop = HOP_TIME', { ...running(), hop: HOP_TIME }], ['hop = -0.5', { ...running(), hop: -0.5 }],
    ['hop = -2', { ...running(), hop: -2 }], ['a NaN hop', { ...running(), hop: NaN }], ['a string hop', { ...running(), hop: '0' }],
    ['a bad hopDir', { ...running(), hopDir: 'north' }], ['a null hopDir', { ...running(), hopDir: null }],
    ['a bad facing', { ...running(), facing: 'x' }], ['a numeric facing', { ...running(), facing: 1 }],
    ['a bad queued direction', { ...running(), hop: 0.05, queued: 'north' }], ['a numeric queued', { ...running(), hop: 0.05, queued: 5 }],
    ['an input queued while grounded', { ...running(), queued: 'up' }],
    ['a NaN lastProgress', { ...running(), lastProgress: NaN }], ['a negative lastProgress', { ...running(), lastProgress: -1 }],
    ['lastProgress after t', { ...running(), lastProgress: 10.001 }],
    ['a NaN safeLine', { ...running(), safeLine: NaN }], ['a negative safeLine', { ...running(), safeLine: -1 }],
    ['a safeLine above maxRow + BACK_LIMIT + 1', { ...running(), safeLine: 5 + BACK_LIMIT + 1.01 }],
    ['a numeric started', { ...running(), started: 1 }], ['a string started', { ...running(), started: 'true' }], ['a null started', { ...running(), started: null }],
    ['a ready state that has started', { ...ready(), started: true }],
    ['a ready state off row 0', { ...ready(), row: 1, fromRow: 1, maxRow: 1 }],
    ['a ready state with a best row', { ...ready(), maxRow: 1 }],
    ['a ready state mid-hop', { ...ready(), hop: 0.05 }],
    ['a ready state with a death', { ...ready(), death: over().death }],
    ['a running state that has not started', { ...running(), started: false }],
    ['a running state with a death', { ...running(), death: over().death }],
    ['an over state without a death', { ...over(), death: null }],
    // A run dies on the row it is in, so a death elsewhere is a hand-edited save (and could make restore build far rows).
    ['a death on a different row from the run', deathWith({ row: 4 })],
    ['a death far beyond the run', deathWith({ row: MAX_ROW })],
    ['an over state with no death key', (() => { const o: Partial<Snapshot> = over(); delete o.death; return o; })()],
    ['a death that is not an object', { ...over(), death: 'car' }], ['a death that is an array', { ...over(), death: [] }],
    ['a death that is an array carrying every field', { ...over(), death: Object.assign([], over().death) }],
    ['an unknown death cause', deathWith({ cause: 'boom' })], ['a death cause that is an Object.prototype name', deathWith({ cause: 'toString' })], ['a death cause of __proto__', deathWith({ cause: '__proto__' })], ['a numeric death cause', deathWith({ cause: 1 })], ['a missing death cause', deathWith({ cause: undefined })],
    ['a NaN death t', deathWith({ t: NaN })], ['a death after t', deathWith({ t: 10.001 })], ['a negative death t', deathWith({ t: -1 })], ['a string death t', deathWith({ t: '9' })],
    ['a fractional death row', deathWith({ row: 1.5 })], ['a negative death row', deathWith({ row: -1 })], ['a string death row', deathWith({ row: '5' })],
    ['a NaN death x', deathWith({ x: NaN })], ['an infinite death x', deathWith({ x: Infinity })], ['a string death x', deathWith({ x: '4' })],
    ['a death dir of 0', deathWith({ dir: 0 })], ['a death dir of 2', deathWith({ dir: 2 })], ['a string death dir', deathWith({ dir: '1' })], ['a missing death dir', deathWith({ dir: undefined })],
  ];
  it.each(invalid)('returns null for %s', (_name, data) => {
    expect(restore(data)).toBeNull();
  });

  it.each(Object.keys(running()))('returns null when the %s field is missing', (key) => {
    const data: Record<string, unknown> = { ...running() };
    delete data[key];
    expect(restore(data)).toBeNull();
  });

  it('never throws, even for objects that explode when read', () => {
    const hostile = new Proxy({}, { get() { throw new Error('boom'); }, has() { throw new Error('boom'); }, ownKeys() { throw new Error('boom'); } });
    const getter = { ...running(), get t(): number { throw new Error('boom'); } };
    for (const data of [hostile, getter, Object.create(null), new Date(), new Map(), Symbol('s')]) expect(() => restore(data)).not.toThrow();
    expect(restore(hostile)).toBeNull();
    expect(restore(getter)).toBeNull();
  });
});

describe('restart', () => {
  it('createRun after a death, even mid-animation, gives a pristine run that shares nothing with the old one', () => {
    const world = source([road(1, { dir: -1, speed: 2, movers: [mv(3.5)] })]);
    const old = createRun(9);
    input(old, 'up', world);
    step(old, STEP, world);
    expect(old.phase).toBe('dying');
    const frozen = JSON.stringify(old);

    const fresh = createRun(9);
    expect(fresh).toEqual(createRun(9));
    expect(fresh).toMatchObject({ phase: 'ready', t: 0, row: 0, x: 4, maxRow: 0, started: false, hop: -1, queued: null, death: null, bonkAt: -1e9, landedAt: -1e9 });
    expect(fresh).not.toBe(old);
    expect(JSON.stringify(old)).toBe(frozen); // the old run is untouched
    expect(input(fresh, 'up', source())).toBe('hop'); // and it plays
  });
});

/** A busy world: roads, logs, lily pads, a railway and trees, for the random-player tests. */
const busyWorld = source([
  road(1, { dir: 1, speed: 3, cycle: 14, movers: [mv(0), mv(7, 2)] }),
  grass(2, [3, 6]),
  river(3, { dir: -1, speed: 1.2, cycle: 12, movers: [mv(0, 3), mv(6, 4)] }),
  river(4, { dir: 1, speed: 1.7, cycle: 12, movers: [mv(2, 2), mv(8, 3)] }),
  grass(5),
  lily(6, [1, 3, 4, 7]),
  river(7, { dir: -1, speed: 0.9, cycle: 10, movers: [mv(1, 3), mv(6, 3)] }),
  grass(8, [0, 8], 'rock'),
  rail(9, { dir: 1, period: 9, phase: 3 }),
  grass(10),
  road(11, { dir: -1, speed: 2.2, cycle: 20, movers: [mv(3), mv(9), mv(15, 2)] }),
]);

describe('step robustness', () => {
  /** Plays 40 random runs on the busy world with step lengths drawn from `dts`; returns descriptions of any broken invariant. */
  const play = (dts: number[], mustRestore: boolean): string[] => {
    let lcg = 77;
    const rnd = () => (lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const dirs: Dir[] = ['up', 'up', 'up', 'left', 'right', 'down'];
    const problems: string[] = [];
    for (let run = 0; run < 40; run++) {
      const s = createRun(run);
      for (let i = 0; i < 400 && s.phase !== 'over'; i++) {
        if (rnd() < 0.4) input(s, dirs[Math.floor(rnd() * dirs.length)], busyWorld);
        const before = s.t;
        step(s, dts[Math.floor(rnd() * dts.length)], busyWorld, rnd() < 0.5);
        const hopOk = s.hop === -1 || (s.hop >= 0 && s.hop < HOP_TIME);
        if (!(Number.isFinite(s.t) && s.t >= before && s.row >= 0 && s.maxRow >= s.row && hopOk && (!mustRestore || restore(serialize(s)) !== null))) {
          problems.push(`run ${run} step ${i}: ${JSON.stringify(s)}`);
        }
      }
    }
    return problems;
  };

  it('terminates and keeps its basic invariants for any step length, tiny, huge or an exact multiple of HOP_TIME', () => {
    const dts = [1e-13, 5e-13, 1e-12, 2e-12, 1e-9, 0.001, STEP, 0.05, HOP_TIME - 1e-12, HOP_TIME, HOP_TIME + 1e-12, 2 * HOP_TIME, 0.3, 0.5];
    expect(play(dts, false).slice(0, 3)).toEqual([]);
  });

  it('keeps every state restorable when each step is shorter than a hop', () => {
    // A step of a whole hop or more can skip a death check between two buffered hops, ending a run four rows back, which restore
    // rightly refuses; the game loop steps by STEP, so only these finer steps are promised to stay restorable.
    const dts = [1e-13, 1e-12, 2e-12, 1e-9, 0.001, STEP, 0.05, 0.1, HOP_TIME - 1e-12];
    expect(play(dts, true).slice(0, 3)).toEqual([]);
  });
});

describe('every state the rules can reach survives a JSON round trip', () => {
  it('serialize then JSON then restore returns the same snapshot at every step of 150 random runs', () => {
    let lcg = 20241031;
    const rnd = () => (lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const dirs: Dir[] = ['up', 'up', 'up', 'up', 'left', 'right', 'down'];
    const problems: string[] = [];
    const causes = new Set<string>();
    let steps = 0;
    for (let run = 0; run < 150; run++) {
      const s = createRun(run);
      const eagerness = [0.12, 0.04, 0.01][run % 3]; // frantic, steady and idle players, so long rides and long waits happen too
      for (let i = 0; i < 2500 && s.phase !== 'over'; i++) {
        if (rnd() < eagerness) input(s, dirs[Math.floor(rnd() * dirs.length)], busyWorld);
        const before = s.t, bestBefore = s.maxRow;
        step(s, STEP, busyWorld);
        steps++;
        const snapshot = serialize(s), copy = restore(JSON.parse(JSON.stringify(snapshot)));
        if (copy === null || JSON.stringify(serialize(copy)) !== JSON.stringify(snapshot)) problems.push(`run ${run} step ${i}: ${JSON.stringify(snapshot)}`);
        // The safe line is pulled up at the start of each segment, so a best row made by a queued hop inside this step is caught up by the next one.
        const lag = s.maxRow === bestBefore ? 0 : 1;
        if (!(s.row >= 0 && s.maxRow >= s.row && s.t >= before && s.safeLine >= s.maxRow - SAFE_LAG - lag && s.lastProgress <= s.t)) problems.push(`run ${run} step ${i}: invariant ${JSON.stringify(s)}`);
        if (s.death) causes.add(s.death.cause);
      }
    }
    expect(problems.slice(0, 3)).toEqual([]);
    expect(steps).toBeGreaterThan(5000);
    expect(causes.size).toBeGreaterThanOrEqual(3); // the walk really does reach several kinds of death
  });
});
