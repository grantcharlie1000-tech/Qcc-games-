import { describe, expect, it } from 'vitest';
import {
  BANK_DRIFT, CONFIG, DIFFICULTIES, DYING_DURATION, EDGE_SUPPORT, FALL_DEPTH, GATE_FEEDBACK, GRAVITY, RADIUS, STEP, WARMUP,
  lateralSpeed, speedAt,
  type Course, type Difficulty, type Gate, type Obstacle, type ObstaclePose, type Phase, type Run,
} from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, restoreSnapshot, runSpeed, steer, step, type Snapshot } from '../../../src/games/ball-run/model';
import { commitScore, emptyRecords, type Records } from '../../../src/games/ball-run/records';
import { capDistance, describeRun, driveBot, placeRun, restHeight, safeStart, spans } from './bot';

const blankPose = (): ObstaclePose => ({ x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const courseOf = (run: Run) => getCourse(run.seed, run.difficulty);
/** Read through a function so TypeScript does not narrow the phase across steps. */
const phaseOf = (run: Run): Phase => run.phase;
/** Simple centre-line steering for obstacle-free stretches. */
const toCentre = (run: Run) => clamp1((courseOf(run).sample(run.distance + 2).center - run.x) * 1.5 - run.vx * .05);
const gateList = (course: Course, to: number) => { const list: Gate[] = []; course.forEachGate(0, to, gate => list.push(gate)); return list; };
const obstacles = (course: Course, from: number, to: number) => { const list: Obstacle[] = []; course.forEachObstacle(from, to, o => list.push(o)); return list; };
const poseOf = (course: Course, o: Obstacle, elapsed = 0) => course.pose(o, elapsed, blankPose());
const clone = (run: Run): Run => JSON.parse(JSON.stringify(run)) as Run;
const snapshotOf = (run: Run | null, records: Records, difficulty: Difficulty = run?.difficulty ?? 'medium'): unknown =>
  JSON.parse(JSON.stringify({ version: 4, difficulty, records, run } satisfies Snapshot));
/** Steps until `until` holds, or the run stops running; returns the steps taken. */
function drive(run: Run, until: (run: Run) => boolean, input: (run: Run) => number = toCentre, dt = STEP, limit = 100000): number {
  let n = 0;
  while (n < limit && run.phase === 'running' && !until(run)) { step(run, input(run), dt); n++; }
  return n;
}

/** Banks (seeds 1–12, first 6 km) with no block from 3 m before them to 60 % of the way along. */
function freeBanks(difficulty: Difficulty, count: number): Array<{ seed: number; course: Course; start: number; end: number }> {
  const found: Array<{ seed: number; course: Course; start: number; end: number }> = [];
  for (let seed = 1; seed <= 12 && found.length < count; seed++) {
    const course = getCourse(seed, difficulty);
    for (const s of spans(course, 6000)) {
      if (found.length < count && s.kind === 'bank' && obstacles(course, s.start - 3, s.start + .6 * (s.end - s.start)).length === 0) found.push({ seed, course, start: s.start, end: s.end });
    }
  }
  return found;
}

/** The road's vertical acceleration under a ball moving at the course speed, from the course API:
 * the most negative value over [from, to] (`fall`), where it is reached (`deepest`), and the first
 * distance where it is below −GRAVITY (`first`; Infinity if never). */
function roadFall(course: Course, from: number, to: number): { fall: number; deepest: number; first: number } {
  const h = .25, e = (d: number) => course.sample(d).elevation;
  let fall = 0, deepest = from, first = Infinity;
  for (let d = from + h; d <= to - h; d += h / 2) {
    const a = course.speed(d) ** 2 * (e(d + h) - 2 * e(d) + e(d - h)) / (h * h);
    if (a < fall) { fall = a; deepest = d; }
    if (a < -GRAVITY && first === Infinity) first = d;
  }
  return { fall, deepest, first };
}

/** Drives a run with the bot to `to`, watching a crest that starts at `start`: whether the run
 * entered it grounded, where it first left the road past `start` (and its state the step before),
 * and where it next landed (−1 when it did not). */
function flyOver(run: Run, start: number, to: number): { entered: boolean; lifted: number; landed: number; before: Run | null } {
  let previous: Run = { ...run }, before: Run | null = null, lifted = -1, landed = -1, entered = false;
  driveBot(run, to - run.distance, r => {
    if (r.distance >= start && previous.distance < start) entered = r.grounded;
    if (lifted < 0 && previous.distance >= start && previous.grounded && !r.grounded) { lifted = r.distance; before = previous; }
    else if (lifted >= 0 && landed < 0 && r.grounded) landed = r.distance;
    previous = { ...r };
  });
  return { entered, lifted, landed, before };
}

type Point = readonly [x: number, y: number, d: number];
/** A world point in a posed box's frame, from the documented convention alone (positive roll lowers
 * the +x side, so the box's across axis is (cos, −sin) and its up axis (sin, cos)), not from the model. */
function inBox(p: ObstaclePose, [x, y, d]: Point): Point {
  const dx = x - p.x, dy = y - p.y, c = Math.cos(p.roll), s = Math.sin(p.roll);
  return [dx * c - dy * s, dx * s + dy * c, d - p.distance];
}
/** Least distance from the ball's centre on the straight path a → b to a block, with a taken in the
 * block's frame at elapsed e0 and b in its frame at e1 (finely sampled, so independent of sweepSphereBox). */
function pathGap(course: Course, o: Obstacle, e0: number, e1: number, a: Point, b: Point): number {
  const p0 = poseOf(course, o, e0), p1 = poseOf(course, o, e1), la = inBox(p0, a), lb = inBox(p1, b);
  let gap = Infinity;
  for (let i = 0; i <= 1000; i++) {
    const t = i / 1000, u = la[0] + (lb[0] - la[0]) * t, w = la[1] + (lb[1] - la[1]) * t, z = la[2] + (lb[2] - la[2]) * t;
    gap = Math.min(gap, Math.hypot(Math.max(0, Math.abs(u) - p1.halfWidth), Math.max(0, Math.abs(w) - p1.halfHeight), Math.max(0, Math.abs(z) - p1.halfDepth)));
  }
  return gap;
}
/** Where a run with no lateral speed goes in one step of input 0 if nothing stops it. */
function freePath(run: Run, dt: number): [Point, Point] {
  const course = courseOf(run), x = run.x + BANK_DRIFT * Math.sin(course.sample(run.distance).bank) * dt, d = run.distance + runSpeed(run) * dt;
  const h = run.grounded ? restHeight(course, d, x) : run.height + run.vy * dt - GRAVITY * dt * dt / 2;
  return [[run.x, run.height, run.distance], [x, h, d]];
}
/** Least gap from a path to every block near it except `skip`. */
function othersGap(course: Course, skip: Obstacle, e0: number, e1: number, [a, b]: [Point, Point]): number {
  let gap = Infinity;
  for (const o of obstacles(course, Math.min(a[2], b[2]) - course.maxDepth - 1, Math.max(a[2], b[2]) + course.maxDepth + 1)) {
    if (o.id !== skip.id) gap = Math.min(gap, pathGap(course, o, e0, e1, a, b));
  }
  return gap;
}
/** The point between `inside` (f < 0) and `outside` (f ≥ 0) where f changes sign. */
function boundary(f: (v: number) => number, inside: number, outside: number): number {
  for (let i = 0; i < 40; i++) { const mid = (inside + outside) / 2; if (f(mid) < 0) inside = mid; else outside = mid; }
  return (inside + outside) / 2;
}
const onRoad = (course: Course, x: number, d: number) => { const s = course.sample(d); return s.ground && Math.abs(x - s.center) <= s.width / 2 - EDGE_SUPPORT - .02; };
/** One step of input 0; true when it ends in a block hit. A miss must land exactly where freePath said. */
function hits(run: Run, dt: number): boolean {
  const [, end] = freePath(run, dt);
  step(run, 0, dt);
  if (run.phase === 'dying') return run.reason === 'block';
  expect(run.phase).toBe('running');
  expect(run.x).toBeCloseTo(end[0], 9);
  expect(run.height).toBeCloseTo(end[1], 9);
  expect(run.distance).toBeCloseTo(end[2], 9);
  return false;
}

describe('Ball Run speed', () => {
  it('accelerates more slowly than the old game over the first minute, gates included', () => {
    const slower: string[] = [];
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 8; seed++) {
      const course = getCourse(seed, difficulty);
      let d = 0, old = 0;
      for (let i = 1; i <= 7200; i++) {
        d += course.speed(d) * STEP;
        old += Math.min(22, 12 + .012 * old) * STEP;
        if ((i === 3600 || i === 7200) && !(course.speed(d) < Math.min(22, 12 + .012 * old))) slower.push(`${difficulty} seed ${seed} at ${i * STEP} s: ${course.speed(d)}`);
      }
    }
    expect(slower).toEqual([]);
  });

  it('never slows down, passes the old 22 m/s cap and settles exactly on 40 / 50 / 62 m/s', () => {
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 3; seed++) {
      const course = getCourse(seed, difficulty), max = CONFIG[difficulty].maxSpeed, cap = capDistance(course);
      let previous = 0, top = 0, decreases = 0, past22 = -1;
      for (let d = 0; d <= cap + 3000; d++) {
        const v = course.speed(d);
        if (v < previous) decreases++;
        if (past22 < 0 && v > 22) past22 = d;
        previous = v; top = Math.max(top, v);
      }
      expect(decreases).toBe(0);
      expect(past22).toBeGreaterThan(WARMUP);
      expect(top).toBe(max);
      expect(course.speed(cap - .01)).toBeLessThan(max);
      expect(course.speed(cap + 20000)).toBe(max);
    }
  });
});

describe('Ball Run boost gates', () => {
  it('gives Speed Up feedback once at gate 0 and a speed gain that lasts', () => {
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 3; seed++) {
      const course = getCourse(seed, difficulty), gain = CONFIG[difficulty].gate.speedGain, gate = gateList(course, 4000)[0];
      const run = placeRun(seed, difficulty, gate.start - 4);
      expect(run.gateIndex).toBe(-1);
      let fired = 0, before = 0, after = 0, from = 0;
      for (let i = 0; i < 2000 && run.distance < gate.start + 12; i++) {
        const v = runSpeed(run), d = run.distance, index = run.gateIndex;
        step(run, toCentre(run), STEP);
        if (run.gateIndex !== index) { fired++; before = v; after = runSpeed(run); from = d; expect(run.speedUpTime).toBe(GATE_FEEDBACK); }
      }
      expect(run.phase).toBe('running');
      expect(fired).toBe(1);
      expect(run.gateIndex).toBe(0);
      const ramp = speedAt(difficulty, from + 1, 0) - speedAt(difficulty, from, 0);
      expect(after - before).toBeGreaterThanOrEqual(gain - 1e-9);
      expect(after - before).toBeLessThanOrEqual(gain + ramp + 1e-9);
      // The feedback runs out after GATE_FEEDBACK seconds; the gain does not.
      const steps = drive(run, r => r.speedUpTime === 0);
      expect(run.phase).toBe('running');
      expect(steps * STEP).toBeLessThanOrEqual(GATE_FEEDBACK);
      expect(run.gateIndex).toBe(0);
      let d = run.distance;
      for (let t = 0; t < 10; t += STEP) d += course.speed(d) * STEP;
      expect(course.speed(d) - speedAt(difficulty, d, 0)).toBeGreaterThanOrEqual(gain - 1e-9);
    }
  });

  it('still fires feedback at the cap, but adds no speed beyond it', () => {
    for (const difficulty of DIFFICULTIES) {
      const course = getCourse(1, difficulty), max = CONFIG[difficulty].maxSpeed, cap = capDistance(course);
      const gate = gateList(course, cap + 5000).find(g => g.start > cap + 10)!;
      expect(gate).toBeDefined();
      const run = placeRun(1, difficulty, gate.start - 4);
      expect(runSpeed(run)).toBe(max);
      drive(run, r => r.gateIndex === gate.index);
      expect(run.phase).toBe('running');
      expect(run.speedUpTime).toBe(GATE_FEEDBACK);
      expect(runSpeed(run)).toBe(max);
      for (let i = 0; i < 120; i++) { step(run, toCentre(run), STEP); expect(runSpeed(run)).toBeLessThanOrEqual(max); }
    }
  });
});

describe('Ball Run steering', () => {
  it('responds identically at 30 Hz and 144 Hz, with input clamped to ±1', () => {
    const slow = { x: 0, vx: 0 }, fast = { x: 0, vx: 0 }, clamped = { x: 0, vx: 0 };
    for (const [input, seconds] of [[.7, .5], [-1, .5], [.25, 1]] as const) {
      for (let i = 0; i < 30 * seconds; i++) steer(slow, input, 1 / 30, 9);
      for (let i = 0; i < 144 * seconds; i++) steer(fast, input, 1 / 144, 9);
    }
    expect(Math.abs(slow.x - fast.x)).toBeLessThan(1e-10);
    expect(Math.abs(slow.vx - fast.vx)).toBeLessThan(1e-10);
    for (let i = 0; i < 120; i++) steer(clamped, 5, STEP, 9);
    expect(clamped.vx).toBeLessThanOrEqual(9);
    expect(clamped.vx).toBeGreaterThan(8.99);
  });

  it('has more than 12 m/s of lateral authority at 50 m/s', () => {
    const body = { x: 0, vx: 0 };
    for (let i = 0; i < 120; i++) steer(body, 1, STEP, lateralSpeed(50));
    expect(body.vx).toBeGreaterThan(12);
  });

  it('holds its line on flat road and drifts toward the low side of a bank', () => {
    const straight = placeRun(1, 'medium', 5);
    drive(straight, r => r.distance > 70, () => 0);
    expect(straight.x).toBe(0);
    for (const difficulty of DIFFICULTIES) {
      const banks = freeBanks(difficulty, 1);
      expect(banks).toHaveLength(1);
      const { seed, course, start, end } = banks[0], run = placeRun(seed, difficulty, start), x0 = run.x, side = Math.sign(course.sample((start + end) / 2).bank);
      let expected = 0;
      drive(run, r => r.distance >= start + .5 * (end - start), r => { expected += BANK_DRIFT * Math.sin(course.sample(r.distance).bank) * STEP; return 0; });
      expect(run.phase).toBe('running');
      expect((run.x - x0) * side).toBeGreaterThan(.2);
      expect(run.x - x0).toBeCloseTo(expected, 1);
    }
  });
});

describe('Ball Run vertical motion', () => {
  it('keeps the ball grounded over early crests that curve away more gently than gravity at their speed', () => {
    for (const difficulty of DIFFICULTIES) {
      let crests = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const course = getCourse(seed, difficulty);
        for (const crest of spans(course, 2500).filter(s => s.kind === 'crest')) {
          if (roadFall(course, crest.start, crest.end).fall < -.95 * GRAVITY) continue;
          // Blocks may touch the block-free middle 40 %, so stay a ball's width and a step inside it.
          const length = crest.end - crest.start, run = placeRun(seed, difficulty, crest.start + .3 * length + 1);
          let airborne = 0;
          drive(run, r => r.distance >= crest.start + .7 * length - 1.5, r => { if (!r.grounded) airborne++; return toCentre(r); });
          expect(run.phase).toBe('running');
          expect(run.grounded).toBe(true);
          expect(airborne).toBe(0);
          crests++;
        }
      }
      expect(crests).toBeGreaterThan(0);
    }
  });

  it('stays on the road through every gate below the cap, and while steering hard across a bank', () => {
    // Only road curving away lifts the ball. A gate's speed gain, or a full steering reversal on a
    // bank, changes how fast the ball moves along the surface, not whether it stays on it.
    for (const difficulty of DIFFICULTIES) {
      let gates = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const course = getCourse(seed, difficulty);
        for (const gate of gateList(course, 3000)) {
          const run = placeRun(seed, difficulty, gate.start - 3);
          expect(runSpeed(run)).toBeLessThan(CONFIG[difficulty].maxSpeed);
          let airborne = 0;
          drive(run, r => r.distance > gate.start + 3, r => { if (!r.grounded) airborne++; return toCentre(r); });
          expect(run.phase).toBe('running');
          expect(run.gateIndex).toBe(gate.index);
          expect(airborne + (run.grounded ? 0 : 1), `${difficulty} seed ${seed} gate ${gate.index} at ${gate.start}`).toBe(0);
          gates++;
        }
      }
      expect(gates).toBeGreaterThan(6);
      for (const { seed, course, start, end } of freeBanks(difficulty, 2)) {
        const run = placeRun(seed, difficulty, start + .2 * (end - start));
        let airborne = 0, reversals = 0, heading = 0;
        drive(run, r => r.distance >= start + .6 * (end - start) - 1, r => {
          if (!r.grounded) airborne++;
          if (Math.sign(r.vx) !== heading) { reversals++; heading = Math.sign(r.vx); }
          return r.x > course.sample(r.distance).center ? -1 : 1;
        });
        expect(run.phase).toBe('running');
        expect(reversals).toBeGreaterThan(4);
        expect(airborne + (run.grounded ? 0 : 1), `${difficulty} seed ${seed} bank at ${start}`).toBe(0);
      }
    }
  });

  it('lifts off over the first crest that curves away faster than gravity at its speed, and lands again', () => {
    // Found from the course API alone: the first crest on Hard seed 1 whose road, at the course's speed
    // there, falls away from a ball faster than gravity can follow (with a margin for the fixed step).
    const seed = 1, course = getCourse(seed, 'hard');
    const crest = spans(course, 8000).find(s => s.kind === 'crest' && roadFall(course, s.start, s.end).fall < -1.05 * GRAVITY);
    expect(crest, 'course: no crest leaves the road at its speed in 8 km of Hard seed 1').toBeDefined();
    const { start, end } = crest!, { first, deepest } = roadFall(course, start, end);
    // Driven from the start of a real run; the bot steers round the blocks on the way.
    const run = createRun(seed, 1, 'hard');
    run.phase = 'running';
    const { entered, lifted, landed, before } = flyOver(run, start, end + 200);
    expect(run.phase, describeRun(run)).toBe('running');
    expect(entered).toBe(true);
    // It leaves the road inside the crest, once the road there falls away faster than gravity.
    expect(lifted).toBeGreaterThan(first - runSpeed(before!) * STEP - .3);
    expect(lifted).toBeLessThanOrEqual(deepest);
    // ...and only because its flight clears the road: moving down 1 m/s faster there, it stays on.
    const pressed = clone(before!);
    pressed.vy -= 1;
    step(pressed, 0, STEP);
    expect(pressed.phase).toBe('running');
    expect(pressed.grounded).toBe(true);
    expect(landed).toBeGreaterThan(lifted + 1);
    expect(run.grounded).toBe(true);
  });

  it('lifts off at the speed cap over the first crest past it that curves away faster than gravity, and lands again, on every difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      // The first crest past the cap whose road, at the cap, falls away faster than gravity.
      const seed = 1, course = getCourse(seed, difficulty), cap = capDistance(course), max = CONFIG[difficulty].maxSpeed;
      const crest = spans(course, cap + 8000, cap).find(s => s.kind === 'crest' && roadFall(course, s.start, s.end).fall < -1.05 * GRAVITY);
      expect(crest, `course: no crest leaves the road in 8 km past the ${difficulty} cap on seed 1`).toBeDefined();
      const { start, end } = crest!, { first, deepest } = roadFall(course, start, end), label = `${difficulty} crest ${start.toFixed(1)}–${end.toFixed(1)}`;
      // From a safe start before it, the bot drives a running ball over it and on past its landing.
      const from = safeStart(course, start - 500);
      expect(from, label).toBeLessThan(start - 30);
      const run = placeRun(seed, difficulty, from);
      const { entered, lifted, landed, before } = flyOver(run, start, end + 200);
      expect(run.phase, describeRun(run)).toBe('running');
      expect(entered, label).toBe(true);
      expect(runSpeed(before!), label).toBe(max);
      expect(lifted, label).toBeGreaterThan(first - max * STEP - .3);
      expect(lifted, label).toBeLessThanOrEqual(deepest);
      const pressed = clone(before!);
      pressed.vy -= 1;
      step(pressed, 0, STEP);
      expect(pressed.grounded, label).toBe(true);
      expect(landed, label).toBeGreaterThan(lifted + 1);
      expect(run.grounded, label).toBe(true);
    }
  });

  it('carries a ball steering to the road centre across every drop in the first 6 km on every difficulty', () => {
    // A drop keeps blocks away from 8 m before its lip to 12 m past where a ball at that speed lands,
    // so steering to the centre is enough. The ball is followed to 10 m past where it really lands:
    // its front stays inside that zone while the real landing trails the analytic one by under a
    // metre (measured over 1,114 drops to the cap: at most 0.48 m, less than one step).
    for (const difficulty of DIFFICULTIES) {
      let drops = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const course = getCourse(seed, difficulty);
        for (const drop of spans(course, 6000).filter(s => s.kind === 'drop')) {
          let lip = drop.start;
          while (course.sample(lip).ground) lip += .01;
          let far = lip;
          while (!course.sample(far).ground) far += .01;
          const run = placeRun(seed, difficulty, lip - 7.5);
          let flew = false, landed = -1;
          drive(run, r => landed >= 0 && r.distance >= landed + 10, r => {
            if (!r.grounded && r.distance > lip && r.distance < far) flew = true;
            if (flew && landed < 0 && r.grounded) landed = r.distance;
            return toCentre(r);
          });
          expect(run.phase, `${difficulty} seed ${seed} drop at ${lip}: ${describeRun(run)}`).toBe('running');
          expect(flew).toBe(true);
          expect(landed).toBeGreaterThan(far);
          expect(run.distance).toBeGreaterThanOrEqual(landed + 10);
          expect(run.grounded).toBe(true);
          drops++;
        }
      }
      expect(drops).toBeGreaterThan(0);
    }
  });
});

describe('Ball Run hazards', () => {
  it('rolls along a gate arch wall instead of leaving the road', () => {
    for (const difficulty of DIFFICULTIES) for (const input of [1, -1]) {
      const course = getCourse(1, difficulty), gate = gateList(course, 4000)[0], run = placeRun(1, difficulty, gate.start + 1);
      expect(run.gateIndex).toBe(0);
      drive(run, r => r.distance >= gate.end - 1, r => {
        const s = course.sample(r.distance);
        expect(Math.abs(r.x - s.center)).toBeLessThanOrEqual(s.width / 2 - RADIUS + 1e-9);
        return input;
      });
      const s = course.sample(run.distance);
      expect(run.phase).toBe('running');
      expect(run.grounded).toBe(true);
      expect(run.x).toBeCloseTo(s.center + input * (s.width / 2 - RADIUS), 9);
      expect(run.vx).toBe(0);
    }
  });

  it('does not clamp a ball flying above a gate wall', () => {
    const course = getCourse(1, 'medium'), gate = gateList(course, 4000)[0];
    const d = gate.start + 1, s = course.sample(d), edge = s.center + s.width / 2 - RADIUS;
    const run = placeRun(1, 'medium', d, edge);
    run.height = s.elevation + 3;
    run.vy = 0; run.vx = 4; run.grounded = false;
    step(run, 1, STEP);
    expect(run.x).toBeGreaterThan(edge + .01);
  });

  it('falls off the edge, freezes the score, and ends the run after the dying time', () => {
    for (const difficulty of DIFFICULTIES) {
      const run = createRun(1, 1, difficulty);
      run.phase = 'running';
      drive(run, () => false, () => 1);
      expect(run.phase).toBe('dying');
      expect(run.reason).toBe('fall');
      const score = run.score, distance = run.distance;
      expect(score).toBe(Math.floor(distance));
      expect(Math.abs(run.x)).toBeGreaterThan(CONFIG[difficulty].roadWidth / 2 - EDGE_SUPPORT);
      let steps = 0;
      while (phaseOf(run) === 'dying' && steps < 1000) { step(run, 1, STEP); steps++; expect(run.score).toBe(score); }
      expect(run.phase).toBe('over');
      expect(run.distance).toBeGreaterThan(distance);
      expect(Math.abs(steps * STEP - DYING_DURATION)).toBeLessThanOrEqual(STEP + 1e-9);
      const over = clone(run);
      step(run, 1, STEP);
      expect(run).toEqual(over);
    }
  });

  it('never lets a ball that slipped below the road edge pop back up onto it', () => {
    // Landing needs the ball to have been on or above the road a step earlier: one steered back
    // under the edge keeps falling instead of being rescued onto the surface.
    for (const difficulty of DIFFICULTIES) for (const below of [.03, .06]) {
      const course = getCourse(1, difficulty), run = createRun(1, 1, difficulty);
      run.phase = 'running';
      drive(run, r => !r.grounded && restHeight(course, r.distance, r.x) - r.height >= below, () => 1);
      expect(run.phase).toBe('running');
      let back = false, landed = false;
      drive(run, () => false, r => {
        if (onRoad(course, r.x, r.distance)) back = true;
        if (r.grounded) landed = true;
        return -1;
      });
      expect(back, `${difficulty}, ${below} m below`).toBe(true);
      expect(landed).toBe(false);
      expect(run.phase).toBe('dying');
      expect(run.reason).toBe('fall');
    }
  });

  it('measures a fall from the nearest road edge, off the high and the low side of a bank', () => {
    for (const difficulty of DIFFICULTIES) {
      const { seed, course, start, end } = freeBanks(difficulty, 1)[0];
      for (const side of [-1, 1]) {
        const at = start + .3 * (end - start), s = course.sample(at);
        const run = placeRun(seed, difficulty, at, s.center + side * (s.width / 2 - EDGE_SUPPORT - .2));
        // Somewhere the road's tilted plane, extended out under the ball, would give another answer.
        let tilted = false;
        while (run.phase === 'running') {
          step(run, side, STEP);
          const t = course.sample(run.distance), edge = Math.min(t.center + t.width / 2, Math.max(t.center - t.width / 2, run.x));
          const fallen = !run.grounded && run.height < restHeight(course, run.distance, edge) - FALL_DEPTH;
          if (fallen !== (!run.grounded && run.height < restHeight(course, run.distance, run.x) - FALL_DEPTH)) tilted = true;
          expect(run.phase, `${difficulty} seed ${seed} side ${side} at ${run.distance}`).toBe(fallen ? 'dying' : 'running');
        }
        expect(run.reason).toBe('fall');
        expect(tilted).toBe(true);
      }
    }
  });

  it('stops dead at a thin block at the speed cap, even across a long step', () => {
    for (const difficulty of DIFFICULTIES) {
      let target: { seed: number; o: Obstacle; pose: ObstaclePose } | null = null;
      for (let seed = 1; seed <= 10 && !target; seed++) {
        const course = getCourse(seed, difficulty), cap = capDistance(course);
        for (const o of obstacles(course, cap + 20, cap + 3000)) {
          const pose = poseOf(course, o);
          if (!o.slide && o.depth <= .8 && pose.halfWidth >= .4 && Math.abs(pose.roll) < .02) { target = { seed, o, pose }; break; }
        }
      }
      expect(target).not.toBeNull();
      const { seed, pose } = target!, front = pose.distance - pose.halfDepth, max = CONFIG[difficulty].maxSpeed;
      // One 0.05 s step (2–3 m at the cap) carries the ball from just short of the block to past its far face.
      const jump = placeRun(seed, difficulty, front - RADIUS - .2, pose.x);
      expect(runSpeed(jump)).toBe(max);
      expect(max * .05).toBeGreaterThan(.2 + 2 * pose.halfDepth + 2 * RADIUS);
      const start = clone(jump);
      step(jump, 0, .05);
      expect(jump.phase).toBe('dying');
      expect(jump.reason).toBe('block');
      expect(jump.distance).toBeCloseTo(front - RADIUS, 6);
      expect(jump.distance).toBeGreaterThan(start.distance);
      expect(jump.score).toBe(Math.floor(start.distance));
      // At the fixed step the ball stops within one step of the face, and stays there.
      const run = placeRun(seed, difficulty, front - RADIUS - 6, pose.x);
      drive(run, () => false, () => 0);
      expect(run.phase).toBe('dying');
      expect(run.reason).toBe('block');
      expect(run.distance).toBeLessThanOrEqual(front - RADIUS + 1e-9);
      expect(run.distance).toBeGreaterThan(front - RADIUS - max * STEP - 1e-9);
      const frozen = { distance: run.distance, x: run.x, height: run.height, score: run.score };
      let steps = 0;
      while (run.phase === 'dying' && steps < 1000) { step(run, 1, STEP); steps++; }
      expect(run.phase).toBe('over');
      expect({ distance: run.distance, x: run.x, height: run.height, score: run.score }).toEqual(frozen);
    }
  });

  it('lets the ball pass close beside a block without a collision', () => {
    let passed = 0;
    for (const difficulty of DIFFICULTIES) {
      const course = getCourse(2, difficulty);
      for (const o of obstacles(course, 300, 3000)) {
        const pose = poseOf(course, o), s = course.sample(pose.distance);
        if (o.pattern !== 'single' || Math.abs(pose.roll) > 1e-9) continue;
        for (const side of [-1, 1]) {
          const x = pose.x + side * (pose.halfWidth + RADIUS + .03);
          if (Math.abs(x - s.center) > s.width / 2 - EDGE_SUPPORT - .1) continue;
          const back = pose.distance + pose.halfDepth, run = placeRun(2, difficulty, pose.distance - pose.halfDepth - RADIUS - 1, x);
          drive(run, r => r.distance > back + RADIUS + .5, () => 0);
          expect(run.phase).toBe('running');
          passed++;
          break;
        }
        if (passed >= DIFFICULTIES.indexOf(difficulty) + 1) break;
      }
    }
    expect(passed).toBe(3);
  });

  it('meets a rolled block in its own frame, 2.5 cm either side of where it first touches', () => {
    for (const difficulty of DIFFICULTIES) {
      let pairs = 0;
      for (let seed = 1; seed <= 8 && pairs < 4; seed++) {
        const course = getCourse(seed, difficulty);
        for (const o of obstacles(course, 300, 5000)) {
          const p = poseOf(course, o), c = Math.cos(p.roll), s = Math.sin(p.roll);
          if (o.slide || Math.abs(p.roll) < .6 * CONFIG[difficulty].maxBank || pairs >= 4) continue;
          // The reference axes match the road: both bottom corners sit on the banked surface.
          for (const side of [-1, 1]) {
            const above = p.y - side * p.halfWidth * s - p.halfHeight * c - course.surfaceHeight(p.distance, p.x + side * p.halfWidth * c - p.halfHeight * s);
            expect(above).toBeLessThan(.005);
            expect(above).toBeGreaterThan(-.31 - .15 * o.depth);
          }
          // One long step from just in front of the block, beside each side face.
          const d0 = p.distance - p.halfDepth - RADIUS - .02, path = (x: number) => freePath(placeRun(seed, difficulty, d0, x), .05);
          const gap = (x: number) => pathGap(course, o, 0, 0, ...path(x)) - RADIUS;
          for (const side of [-1, 1]) {
            const touch = boundary(gap, p.x, p.x + side * (p.halfWidth + p.halfHeight + RADIUS + .5)), near = touch - side * .025, far = touch + side * .025;
            const end = path(far)[1];
            if (!onRoad(course, near, d0) || !onRoad(course, far, d0) || !onRoad(course, end[0], end[2]) || othersGap(course, o, 0, 0, path(near)) < RADIUS + .05) continue;
            expect(gap(near)).toBeLessThan(-.01);
            expect(gap(far)).toBeGreaterThan(.01);
            const where = `${difficulty} seed ${seed} block #${o.id} roll ${p.roll.toFixed(3)} side ${side}`;
            expect(hits(placeRun(seed, difficulty, d0, near), .05), where).toBe(true);
            expect(hits(placeRun(seed, difficulty, d0, far), .05), where).toBe(false);
            pairs++;
          }
        }
      }
      expect(pairs).toBeGreaterThanOrEqual(4);
    }
  });

  it('clears a block in flight only above its posed top, which stands above obstacle.height on a slope', () => {
    for (const difficulty of DIFFICULTIES) {
      let pairs = 0;
      for (let seed = 1; seed <= 4 && pairs < 2; seed++) {
        const course = getCourse(seed, difficulty);
        for (const o of obstacles(course, 300, 3000)) {
          const p = poseOf(course, o);
          if (o.slide || Math.abs(p.roll) > .02 || p.halfHeight - o.height / 2 < .04 || pairs >= 2) continue;
          // Level flight over one long step, from just in front of the block, over its middle.
          const d0 = p.distance - p.halfDepth - RADIUS - .02;
          const flying = (y: number) => Object.assign(placeRun(seed, difficulty, d0, p.x), { grounded: false, height: y, vy: GRAVITY * .05 / 2 });
          const gap = (y: number) => pathGap(course, o, 0, 0, ...freePath(flying(y), .05)) - RADIUS;
          const top = p.y + p.halfHeight, touch = boundary(gap, top, top + RADIUS + 1);
          if (othersGap(course, o, 0, 0, freePath(flying(touch - .02), .05)) < RADIUS + .05) continue;
          expect(touch).toBeCloseTo(top + RADIUS, 3);
          const where = `${difficulty} seed ${seed} block #${o.id}`;
          expect(hits(flying(touch - .02), .05), where).toBe(true);
          expect(hits(flying(touch + .02), .05), where).toBe(false);
          pairs++;
        }
      }
      expect(pairs).toBe(2);
    }
  });

  it('hits a sliding block at one time and misses it half a period later', () => {
    for (const difficulty of ['medium', 'hard'] as const) {
      let target: { seed: number; o: Obstacle } | null = null;
      for (let seed = 1; seed <= 10 && !target; seed++) {
        const course = getCourse(seed, difficulty);
        for (const o of obstacles(course, 300, 6000)) {
          const pose = poseOf(course, o);
          if (o.slide && 2 * o.slide.amplitude > 2 * pose.halfWidth + 2 * RADIUS + .3 && Math.abs(pose.roll) < .02) { target = { seed, o }; break; }
        }
      }
      expect(target).not.toBeNull();
      const { seed, o } = target!, slide = o.slide!, course = getCourse(seed, difficulty);
      const at = poseOf(course, o), front = at.distance - at.halfDepth, start = front - RADIUS - 1, v = course.speed(start);
      // Arrive at the front face just as the block reaches the +amplitude end of its sweep.
      let arrive = (Math.PI / 2 - slide.phase) / (2 * Math.PI) * slide.period;
      while (arrive < 2 / v) arrive += slide.period;
      const x = poseOf(course, o, arrive).x;
      const hit = placeRun(seed, difficulty, start, x, arrive - 1 / v);
      drive(hit, r => r.distance > at.distance + at.halfDepth + RADIUS + .5, () => 0);
      expect(hit.phase).toBe('dying');
      expect(hit.reason).toBe('block');
      const miss = placeRun(seed, difficulty, start, x, arrive - 1 / v + slide.period / 2);
      drive(miss, r => r.distance > at.distance + at.halfDepth + RADIUS + .5, () => 0);
      expect(miss.phase).toBe('running');
    }
  });

  it('sweeps a sliding block from where it was to where it is across a step', () => {
    // Moving into the ball: only the block's new place reaches the end of the ball's path.
    // Moving off the path: only its old place is in front of the ball as the step starts.
    for (const difficulty of ['medium', 'hard'] as const) {
      const cases = [0, 0];
      for (let seed = 1; seed <= 10 && Math.min(...cases) < 2; seed++) {
        const course = getCourse(seed, difficulty);
        for (const o of obstacles(course, 300, 6000)) {
          const slide = o.slide;
          if (Math.min(...cases) >= 2) break;
          if (!slide || Math.abs(poseOf(course, o).roll) > .02 || 2 * Math.PI * slide.amplitude / slide.period * .05 < .15) continue;
          // Mid-sweep, where the block moves fastest, over one 0.05 s step.
          let mid = -slide.phase / (2 * Math.PI) * slide.period;
          while (mid < 1) mid += slide.period / 2;
          const e0 = mid - .025, e1 = mid + .025, a = poseOf(course, o, e0), b = poseOf(course, o, e1), dir = Math.sign(b.x - a.x);
          const d0 = a.distance - a.halfDepth - RADIUS - .02, centre = (a.x + b.x) / 2, reach = a.halfWidth + RADIUS + 1;
          const path = (x: number) => freePath(placeRun(seed, difficulty, d0, x, e0), .05);
          const moving = (x: number) => pathGap(course, o, e0, e1, ...path(x)) - RADIUS;
          for (const [k, side, only] of [[0, dir, e0], [1, -dir, e1]] as const) {
            if (cases[k] >= 2) continue;
            const fixed = (x: number) => pathGap(course, o, only, only, ...path(x)) - RADIUS;
            const x = (boundary(moving, centre, centre + side * reach) + boundary(fixed, centre, centre + side * reach)) / 2;
            if (!onRoad(course, x, d0) || othersGap(course, o, e0, e1, path(x)) < RADIUS + .05) continue;
            expect(moving(x)).toBeLessThan(-.01);
            expect(fixed(x)).toBeGreaterThan(.01);
            expect(hits(placeRun(seed, difficulty, d0, x, e0), .05), `${difficulty} seed ${seed} slider #${o.id} case ${k}`).toBe(true);
            cases[k]++;
          }
        }
      }
      expect(cases).toEqual([2, 2]);
    }
  });

  it('ignores non-finite or out-of-range input and steps, and does nothing outside a run', () => {
    const run = placeRun(1, 'medium', 40), before = clone(run);
    for (const [input, dt] of [[NaN, STEP], [Infinity, STEP], [-Infinity, STEP], [0, NaN], [0, Infinity], [0, -STEP], [0, 0], [0, .0501]]) {
      step(run, input, dt);
      expect(run).toEqual(before);
    }
    const ready = createRun(5, 2, 'easy'), fresh = clone(ready);
    step(ready, 1, STEP);
    expect(ready).toEqual(fresh);
  });
});

describe('Ball Run new runs', () => {
  it('starts ready, on the centre line, resting on the road and moving with it', () => {
    for (const difficulty of DIFFICULTIES) {
      const run = createRun(77, 3, difficulty), course = getCourse(77, difficulty);
      expect(run).toMatchObject({ version: 4, difficulty, seed: 77, run: 3, phase: 'ready', distance: 0, x: 0, vx: 0, grounded: true, elapsed: 0, speedUpTime: 0, gateIndex: -1, dyingTime: 0, score: 0, reason: '' });
      expect(run.height).toBeCloseTo(restHeight(course, 0, 0), 12);
      expect(runSpeed(run)).toBe(CONFIG[difficulty].startSpeed);
      run.phase = 'running';
      for (let i = 0; i < 240; i++) { step(run, 0, STEP); expect(run.grounded).toBe(true); }
      expect(run.height).toBeCloseTo(restHeight(course, run.distance, 0), 9);
      // Only the road's shape lifts the ball, right from the start: one saved with no vertical speed stays on.
      const still = { ...createRun(77, 3, difficulty), phase: 'running', vy: 0 } as Run;
      step(still, 0, STEP);
      expect(still.grounded).toBe(true);
      expect(still.height).toBeCloseTo(restHeight(course, still.distance, 0), 9);
    }
  });
});

describe('Ball Run saves', () => {
  const records = commitScore(commitScore(emptyRecords(), 'hard', 812, new Date(2026, 9, 21)), 'medium', 303, new Date(2026, 9, 23));

  function continuesIdentically(run: Run) {
    const restored = restoreSnapshot(snapshotOf(run, records));
    expect(restored).not.toBeNull();
    expect(restored!.migrated).toBe(false);
    expect(restored!.difficulty).toBe(run.difficulty);
    expect(restored!.records).toEqual(records);
    const copy = restored!.run!;
    expect(copy).toEqual(run);
    expect(copy).not.toBe(run);
    for (let i = 0; i < 300; i++) {
      const input = Math.sin(i / 17);
      step(run, input, STEP);
      step(copy, input, STEP);
    }
    expect(copy).toEqual(run);
  }

  it('restores a ready, a running, an airborne and a Speed Up run exactly', () => {
    continuesIdentically(createRun(9, 4, 'easy'));
    const running = createRun(9, 4, 'medium');
    running.phase = 'running';
    drive(running, r => r.distance > 40);
    continuesIdentically(running);
    const course = getCourse(1, 'hard'), drop = spans(course, 6000).find(s => s.kind === 'drop')!;
    let lip = drop.start;
    while (course.sample(lip).ground) lip += .01;
    const airborne = placeRun(1, 'hard', lip - 7.5);
    drive(airborne, r => !r.grounded && r.distance > lip + .3);
    expect(airborne.grounded).toBe(false);
    continuesIdentically(airborne);
    const gate = gateList(getCourse(1, 'medium'), 4000)[0], boosted = placeRun(1, 'medium', gate.start - 2);
    drive(boosted, r => r.speedUpTime > 0 && r.speedUpTime < GATE_FEEDBACK - .2);
    expect(boosted.gateIndex).toBe(0);
    continuesIdentically(boosted);
  });

  it('turns a dying run into a finished one and keeps a finished one', () => {
    const run = createRun(3, 2, 'hard');
    run.phase = 'running';
    drive(run, () => false, () => -1);
    expect(run.phase).toBe('dying');
    step(run, 0, STEP);
    const restored = restoreSnapshot(snapshotOf(run, records))!;
    expect(restored.run).toMatchObject({ phase: 'over', reason: 'fall', score: run.score, distance: run.distance });
    while (phaseOf(run) === 'dying') step(run, 0, STEP);
    expect(restoreSnapshot(snapshotOf(run, records))!.run).toEqual(run);
  });

  it('drops an invalid run but keeps the records', () => {
    const base = createRun(11, 5, 'medium');
    base.phase = 'running';
    drive(base, r => r.distance > 30);
    const good = restoreSnapshot(snapshotOf(base, records));
    expect(good!.run).toEqual(base);
    const bad: Array<[keyof Run, unknown]> = [
      ['version', 3], ['version', '4'], ['difficulty', 'expert'], ['difficulty', 'hard'], ['seed', 0], ['seed', 1.5], ['seed', 2 ** 32], ['seed', '11'],
      ['run', 0], ['run', 1e8 + 1], ['run', 2.5], ['phase', 'paused'], ['distance', -1], ['distance', NaN], ['distance', 2e6], ['distance', 1e9],
      ['x', 50.5], ['x', null], ['vx', 41], ['vy', -201], ['height', base.height + .05], ['height', 'high'], ['grounded', 'true'], ['elapsed', -1],
      ['speedUpTime', -.1], ['speedUpTime', GATE_FEEDBACK + .1], ['gateIndex', 0], ['gateIndex', -.5], ['dyingTime', -1], ['dyingTime', NaN],
      ['score', base.score + 1], ['score', base.score - 1], ['reason', 'block'], ['reason', 'lava'],
    ];
    for (const [field, value] of bad) {
      const run = { ...clone(base), [field]: value } as Run;
      const restored = restoreSnapshot(snapshotOf(run, records, 'medium'));
      expect(restored, `${field} = ${String(value)}`).not.toBeNull();
      expect(restored!.run, `${field} = ${String(value)}`).toBeNull();
      expect(restored!.records).toEqual(records);
      expect(restored!.difficulty).toBe('medium');
    }
    for (const run of [5, 'run', [], { version: 4 }]) expect(restoreSnapshot({ version: 4, difficulty: 'easy', records, run })).toMatchObject({ difficulty: 'easy', records, run: null });
    const missing = clone(base) as Partial<Run>;
    delete missing.vy;
    expect(restoreSnapshot(snapshotOf(missing as Run, records))!.run).toBeNull();
    // A grounded ball must rest on road that holds it.
    const offRoad = placeRun(11, 'medium', 40, CONFIG.medium.roadWidth / 2 + 1);
    expect(restoreSnapshot(snapshotOf(offRoad, records))!.run).toBeNull();
  });

  it('rejects absurd distances before generating any course', () => {
    const run = { ...createRun(424242, 1, 'hard'), phase: 'running', distance: 1e8 - 1, score: 1e8 - 1, gateIndex: 5 } as Run;
    const started = performance.now();
    const restored = restoreSnapshot(snapshotOf(run, records));
    expect(performance.now() - started).toBeLessThan(250);
    expect(restored!.run).toBeNull();
    expect(restored!.records).toEqual(records);
  });

  it('migrates v1–v3 saves into a Medium all-time record without resuming them', () => {
    const legacy = { seed: 5, run: 3, phase: 'running', distance: 120, x: 0, vx: 0, height: .38, vy: 0, grounded: true, elapsed: 9, reason: '' };
    for (const version of [1, 2, 3]) {
      const restored = restoreSnapshot({ ...legacy, version, course: 2, best: 143.6 });
      const expected = emptyRecords();
      expected.medium.allTime = 143;
      expect(restored).toEqual({ difficulty: 'medium', records: expected, run: null, migrated: true });
    }
    expect(restoreSnapshot({ ...legacy, version: 2, best: 1e12 })!.records.medium.allTime).toBe(2147483647);
    expect(restoreSnapshot({ ...legacy, version: 1, best: 0 })!.records).toEqual(emptyRecords());
  });

  it('never throws on garbage and keeps a v4 save whose difficulty is damaged', () => {
    for (const value of [null, undefined, 0, 42, 'save', [], {}, { version: 5 }, { version: 0, best: 10 }, { version: 2, best: -1 }, { version: 3, best: NaN }, { version: 3 }, { version: 1, best: '143' }]) {
      expect(restoreSnapshot(value)).toBeNull();
    }
    expect(restoreSnapshot({ version: 4 })).toEqual({ difficulty: 'medium', records: emptyRecords(), run: null, migrated: false });
    expect(restoreSnapshot({ version: 4, difficulty: 'nightmare', records, run: null })).toEqual({ difficulty: 'medium', records, run: null, migrated: false });
  });
});
