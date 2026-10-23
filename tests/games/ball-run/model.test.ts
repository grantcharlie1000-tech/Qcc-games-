import { describe, expect, it } from 'vitest';
import {
  CONFIG, DIFFICULTIES, DYING_DURATION, EDGE_SUPPORT, GATE_FEEDBACK, GRAVITY, RADIUS, SLOPE, STEP, WARMUP, lateralSpeed, speedAt,
  type Course, type Difficulty, type Gate, type Obstacle, type ObstaclePose, type Run,
} from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, restoreSnapshot, runSpeed, steer, step, type Snapshot } from '../../../src/games/ball-run/model';
import { commitScore, emptyRecords, type Records } from '../../../src/games/ball-run/records';
import { capDistance, driveBot, placeRun, restHeight, spans } from './bot';

const blankPose = (): ObstaclePose => ({ x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));
const courseOf = (run: Run) => getCourse(run.seed, run.difficulty);
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
    let tested = 0;
    for (const difficulty of DIFFICULTIES) for (let seed = 1; seed <= 12 && tested < DIFFICULTIES.indexOf(difficulty) + 1; seed++) {
      const course = getCourse(seed, difficulty);
      const bank = spans(course, 6000).find(s => s.kind === 'bank' && obstacles(course, s.start - 3, s.start + .6 * (s.end - s.start)).length === 0);
      if (!bank) continue;
      const run = placeRun(seed, difficulty, bank.start), x0 = run.x, side = Math.sign(course.sample((bank.start + bank.end) / 2).bank);
      let expected = 0;
      drive(run, r => r.distance >= bank.start + .5 * (bank.end - bank.start), r => { expected += 6 * Math.sin(course.sample(r.distance).bank) * STEP; return 0; });
      expect(run.phase).toBe('running');
      expect((run.x - x0) * side).toBeGreaterThan(.2);
      expect(run.x - x0).toBeCloseTo(expected, 1);
      tested++;
    }
    expect(tested).toBe(3);
  });
});

describe('Ball Run vertical motion', () => {
  it('keeps the ball grounded over crests at early-run speed', () => {
    for (const difficulty of DIFFICULTIES) {
      let crests = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const course = getCourse(seed, difficulty);
        for (const crest of spans(course, 2500).filter(s => s.kind === 'crest')) {
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

  it('lifts off over a sharp crest at the speed cap and lands again', () => {
    // Crest lengths scale with speed, so few crests are sharp enough: search for one.
    let found: { seed: number; start: number; end: number } | null = null;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const course = getCourse(seed, 'hard'), cap = capDistance(course);
      for (const crest of spans(course, cap + 8000, cap)) {
        if (crest.kind !== 'crest') continue;
        const length = crest.end - crest.start;
        let rise = 0;
        for (let d = crest.start; d <= crest.end; d += .25) rise = Math.max(rise, course.sample(d).elevation + SLOPE * d);
        const v = course.speed(crest.start + length / 2);
        if (2 * Math.PI ** 2 * rise / length ** 2 * v * v > 1.03 * GRAVITY) { found = { seed, start: crest.start, end: crest.end }; break; }
      }
    }
    expect(found, 'no crest sharp enough to leave the road at the cap in 40 Hard seeds').not.toBeNull();
    const { seed, start, end } = found!, length = end - start, run = placeRun(seed, 'hard', start + .3 * length + 1);
    expect(runSpeed(run)).toBe(CONFIG.hard.maxSpeed);
    let lifted = -1, landed = -1;
    // A barely-sharp crest lands the ball near the end of its block-free middle: the bot steers on from there.
    driveBot(run, .6 * length, r => {
      if (lifted < 0 && !r.grounded) lifted = r.distance;
      if (lifted > 0 && landed < 0 && r.grounded) landed = r.distance;
    });
    expect(run.phase).toBe('running');
    expect(lifted).toBeGreaterThan(start + .3 * length);
    expect(landed).toBeGreaterThan(lifted);
    expect(run.grounded).toBe(true);
  });

  it('carries the ball across every drop in the first 6 km on every difficulty', () => {
    // A fast ball lands beyond the block-free run-out, so the bot steers it past any blocks there.
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
          driveBot(run, far + 40 - run.distance, r => {
            if (!r.grounded && r.distance > lip && r.distance < far) flew = true;
            if (flew && landed < 0 && r.grounded) landed = r.distance;
          });
          expect(run.phase, `${difficulty} seed ${seed} drop at ${lip}`).toBe('running');
          expect(flew).toBe(true);
          expect(landed).toBeGreaterThan(far);
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
      while (run.phase === 'dying' && steps < 1000) { step(run, 1, STEP); steps++; expect(run.score).toBe(score); }
      expect(run.phase).toBe('over');
      expect(run.distance).toBeGreaterThan(distance);
      expect(Math.abs(steps * STEP - DYING_DURATION)).toBeLessThanOrEqual(STEP + 1e-9);
      const over = clone(run);
      step(run, 1, STEP);
      expect(run).toEqual(over);
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
      expect(jump.distance).toBe(start.distance);
      expect(jump.x).toBe(start.x);
      expect(jump.height).toBe(start.height);
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
    while (run.phase === 'dying') step(run, 0, STEP);
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
