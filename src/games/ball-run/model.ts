/** Pure Ball Run simulation: one fixed step of the ball on a seeded course, and the
 * save format. Speed comes from the course (a function of distance); the ball only
 * chooses its lateral line. Collision uses the same obstacle poses as rendering. */
import { sweepSphereBox } from '../../core/collision';
import {
  BANK_DRIFT, COURSE_REVISION, DYING_DURATION, FALL_DEPTH, GATE_FEEDBACK, GATE_WALL_HEIGHT, GRAVITY, RADIUS, STEER_RESPONSE,
  lateralSpeed,
  type Course, type Difficulty, type Obstacle, type ObstaclePose, type Phase, type Run, type TrackSample,
} from './config';
import { getCourse } from './course';
import { emptyRecords, restoreRecords, type Records } from './records';

export interface Snapshot { version: 4; difficulty: Difficulty; records: Records; run: Run | null }

/** Restored runs never go beyond this: generating a course out to the 1e8 m save limit would take seconds and gigabytes. */
const MAX_RESTORE_DISTANCE = 1e6;
const MAX_SCORE = 2147483647;

const blankSample = (): TrackSample => ({ center: 0, width: 0, elevation: 0, gradient: 0, bank: 0, ground: true, tunnel: false, kind: 'warmup', segment: 0 });
const blankPose = (): ObstaclePose => ({ x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ball-centre height resting on the sampled road at world x. */
const restOn = (s: TrackSample, x: number) => s.elevation - (x - s.center) * Math.tan(s.bank) + RADIUS / Math.cos(s.bank);

/** Contact lies one radius down the bank's normal from the ball centre. The rendered
 * top spans the full course width; the generator's inset is only a route safety margin. */
const hasSupport = (s: TrackSample, x: number) => s.ground && Math.abs(x - RADIUS * Math.sin(s.bank) - s.center) <= s.width / 2;

export function createRun(seed: number, run: number, difficulty: Difficulty): Run {
  const course = getCourse(seed, difficulty), s = course.sample(0);
  return {
    version: 4, courseRevision: COURSE_REVISION, difficulty, seed, run, phase: 'ready', distance: 0, x: 0, vx: 0,
    // Moving with the road surface, so the first step does not read as a launch.
    height: restOn(s, 0), vy: s.gradient * course.speed(0), grounded: true,
    elapsed: 0, speedUpTime: 0, gateIndex: -1, dyingTime: 0, score: 0, reason: '',
  };
}

export function runSpeed(run: Run): number {
  return getCourse(run.seed, run.difficulty).speed(run.distance);
}

/** Analytic first-order response toward input × lateral, exact for any dt. */
export function steer(body: { x: number; vx: number }, input: number, dt: number, lateral: number): void {
  const target = clamp(input, -1, 1) * lateral, decay = Math.exp(-STEER_RESPONSE * dt), old = body.vx;
  body.vx = target + (old - target) * decay;
  body.x += target * dt + (old - target) * (1 - decay) / STEER_RESPONSE;
}

// Step scratch: reused so a step allocates nothing in steady state.
const before = blankSample(), after = blankSample(), behind = blankSample(), poseA = blankPose(), poseB = blankPose();
const sweepFrom = [0, 0, 0], sweepTo = [0, 0, 0], origin = [0, 0, 0] as const, half = [0, 0, 0];
/** The step being tested against blocks: elapsed before and after, then the ball's old and new
 * x, height and distance. A typed array, because module-level number variables box every write. */
const sweep = new Float64Array(8);
let hitCourse: Course, hit = false, hitFraction = 1;
const sweepMid = [0, 0, 0];

/** Moves world point (x, y, d) into the frame of a box posed at `p` (rolled about the forward axis). */
function local(p: ObstaclePose, x: number, y: number, d: number, out: number[]): void {
  const dx = x - p.x, dy = y - p.y, c = Math.cos(p.roll), s = Math.sin(p.roll);
  out[0] = dx * c - dy * s;
  out[1] = dx * s + dy * c;
  out[2] = d - p.distance;
}

/** Does the ball's swept path from the old to the new state touch this block? */
function testBlock(o: Obstacle): void {
  hitCourse.pose(o, sweep[0], poseA);
  const p = o.slide ? hitCourse.pose(o, sweep[1], poseB) : poseA;
  local(poseA, sweep[2], sweep[3], sweep[4], sweepFrom);
  local(p, sweep[5], sweep[6], sweep[7], sweepTo);
  half[0] = p.halfWidth; half[1] = p.halfHeight; half[2] = p.halfDepth;
  // Swept bounding-box rejection first: the exact test allocates.
  let gap = 0;
  for (let axis = 0; axis < 3; axis++) {
    const lo = Math.min(sweepFrom[axis], sweepTo[axis]), hi = Math.max(sweepFrom[axis], sweepTo[axis]);
    const d = Math.max(0, -half[axis] - hi, lo - half[axis]);
    gap += d * d;
  }
  if (gap > RADIUS * RADIUS) return;
  if (!sweepSphereBox(sweepFrom, sweepTo, origin, half, RADIUS)) return;
  hit = true;
  // The existing sweep defines a straight path in the moving box frame. Search
  // its first touching point without changing the hit/miss decision.
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const t = (lo + hi) / 2;
    for (let axis = 0; axis < 3; axis++) sweepMid[axis] = sweepFrom[axis] + (sweepTo[axis] - sweepFrom[axis]) * t;
    if (sweepSphereBox(sweepFrom, sweepMid, origin, half, RADIUS)) hi = t; else lo = t;
  }
  hitFraction = Math.min(hitFraction, hi);
}

function die(run: Run, reason: 'block' | 'fall', score: number): void {
  run.phase = 'dying';
  run.reason = reason;
  run.dyingTime = 0;
  run.score = Math.min(MAX_SCORE, Math.floor(score));
}

/** Advances a run by dt seconds. Ignores non-finite input, and dt outside (0, 0.05]. */
export function step(run: Run, input: number, dt: number): void {
  if (!(dt > 0 && dt <= .05) || !Number.isFinite(input)) return;
  if (run.phase === 'dying') { stepDying(run, dt); return; }
  if (run.phase !== 'running') return;
  const course = getCourse(run.seed, run.difficulty), v = course.speed(run.distance);
  const d0 = run.distance, x0 = run.x, vx0 = run.vx, h0 = run.height, vy0 = run.vy, grounded0 = run.grounded;
  const e0 = run.elapsed, speedUp0 = run.speedUpTime, gate0 = run.gateIndex;
  course.sample(d0, before);
  const rest0 = restOn(before, x0);

  steer(run, input, dt, lateralSpeed(v));
  run.x += BANK_DRIFT * Math.sin(before.bank) * dt;
  run.distance = d0 + v * dt;
  run.elapsed = e0 + dt;
  run.speedUpTime = Math.max(0, speedUp0 - dt);
  const passed = course.gatesBefore(run.distance) - 1;
  if (passed > run.gateIndex) { run.gateIndex = passed; run.speedUpTime = GATE_FEEDBACK; }

  const s = course.sample(run.distance, after);
  // Arch walls are solid but harmless, for a ball that was over the road.
  const flightDelta = vy0 * dt - GRAVITY * dt * dt / 2;
  const overlapsWallHeight = h0 + Math.min(0, flightDelta) - RADIUS <= Math.max(before.elevation, s.elevation) + GATE_WALL_HEIGHT &&
    h0 + Math.max(0, flightDelta) + RADIUS >= Math.min(before.elevation, s.elevation);
  if (s.tunnel && overlapsWallHeight && Math.abs(x0 - before.center) <= before.width / 2) {
    const room = s.width / 2 - RADIUS;
    if (Math.abs(run.x - s.center) > room) { run.x = s.center + Math.sign(run.x - s.center) * room; run.vx = 0; }
  }
  const supported = hasSupport(s, run.x);
  const rest = restOn(s, run.x), surfaceVy = (rest - rest0) / dt;
  if (run.grounded) {
    // Stay on the road unless it curves away faster than gravity can follow. The curve is measured
    // along the ball's line at its current speed (the step mirrored behind it), so a change of speed
    // (a gate) or of lateral speed (steering on a bank) moves the ball along the surface, not off it.
    // Before the start the road continues the warm-up's straight slope.
    const back = d0 - v * dt, behindRest = restOn(course.sample(back, behind), 2 * x0 - run.x) + Math.min(0, back) * behind.gradient;
    const away = (rest - 2 * rest0 + behindRest) / (dt * dt) < -GRAVITY && h0 + run.vy * dt - GRAVITY * dt * dt / 2 > rest;
    if (supported && !away) { run.height = rest; run.vy = surfaceVy; }
    else run.grounded = false;
  } else if (supported && h0 + run.vy * dt - GRAVITY * dt * dt / 2 <= rest && h0 >= rest0 - .05) {
    run.height = rest; run.vy = surfaceVy; run.grounded = true;
  }
  if (!run.grounded) {
    run.height = h0 + run.vy * dt - GRAVITY * dt * dt / 2;
    run.vy -= GRAVITY * dt;
  }

  hitCourse = course; hit = false; hitFraction = 1;
  sweep[0] = e0; sweep[1] = run.elapsed; sweep[2] = x0; sweep[3] = h0; sweep[4] = d0; sweep[5] = run.x; sweep[6] = run.height; sweep[7] = run.distance;
  course.forEachObstacle(d0 - RADIUS - course.maxDepth, run.distance + RADIUS + course.maxDepth, testBlock);
  if (hit) {
    // Stop at the first contact along the same swept path that decided the hit.
    const t = hitFraction;
    run.distance = d0 + (run.distance - d0) * t;
    run.x = x0 + (run.x - x0) * t;
    run.height = h0 + (run.height - h0) * t;
    run.vx = vx0 + (run.vx - vx0) * t;
    run.vy = vy0 + (run.vy - vy0) * t;
    const contactRoad = course.sample(run.distance, after);
    run.grounded = grounded0 && hasSupport(contactRoad, run.x) && Math.abs(run.height - restOn(contactRoad, run.x)) <= .01;
    run.elapsed = e0 + dt * t;
    run.speedUpTime = Math.max(0, speedUp0 - dt * t); run.gateIndex = gate0;
    die(run, 'block', d0);
    return;
  }
  if (!run.grounded) {
    const edge = clamp(run.x, s.center - s.width / 2, s.center + s.width / 2);
    if (run.height < restOn(s, edge) - FALL_DEPTH) { die(run, 'fall', run.distance); return; }
  }
  run.score = Math.min(MAX_SCORE, Math.floor(run.distance));
}

/** A fall keeps flying forward and down; a block hit stays where it stopped. */
function stepDying(run: Run, dt: number): void {
  if (run.reason === 'fall') {
    run.distance += runSpeed(run) * dt;
    run.x += run.vx * dt;
    run.height += run.vy * dt - GRAVITY * dt * dt / 2;
    run.vy -= GRAVITY * dt;
    run.elapsed += dt;
    run.speedUpTime = Math.max(0, run.speedUpTime - dt);
  }
  run.dyingTime += dt;
  if (run.dyingTime >= DYING_DURATION - 1e-9) run.phase = 'over';
}

// Saves -----------------------------------------------------------------------

const PHASES: readonly Phase[] = ['ready', 'running', 'dying', 'over'];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number => isNumber(v) && Number.isInteger(v) && v >= lo && v <= hi;

/** A fresh, fully checked copy of a saved v4 run, or null. Cheap checks come first, so a
 * damaged save never makes the course generate far ahead. Beyond the plan's list (ratified):
 * distance ≤ 1e6; elapsed ≤ 1e7; reason matches the phase; dyingTime is 0 while live and at most
 * DYING_DURATION + 0.05; a dead run's gateIndex lies between the gates behind its score and those
 * behind its distance (a falling ball keeps moving); a grounded ball is also supported; a running
 * airborne ball is not already below the fall depth; height is within 100 m of the road; and
 * run.difficulty equals the snapshot's. */
function restoreRun(value: unknown, difficulty: Difficulty): Run | null {
  if (!isObject(value)) return null;
  const r = value;
  if (r.version !== 4 || r.courseRevision !== COURSE_REVISION || r.difficulty !== difficulty || !PHASES.includes(r.phase as Phase) || typeof r.grounded !== 'boolean') return null;
  for (const key of ['distance', 'x', 'vx', 'height', 'vy', 'elapsed', 'speedUpTime', 'gateIndex', 'dyingTime', 'score'] as const) if (!isNumber(r[key])) return null;
  const phase = r.phase as Phase, distance = r.distance as number, score = r.score as number, gateIndex = r.gateIndex as number;
  const live = phase === 'ready' || phase === 'running';
  if (!isInt(r.seed, 1, 0xffffffff) || !isInt(r.run, 1, 1e8)) return null;
  if (distance < 0 || distance > MAX_RESTORE_DISTANCE || Math.abs(r.x as number) > 50 || Math.abs(r.vx as number) > 40 || Math.abs(r.vy as number) > 200) return null;
  if ((r.elapsed as number) < 0 || (r.elapsed as number) > 1e7 || (r.speedUpTime as number) < 0 || (r.speedUpTime as number) > GATE_FEEDBACK) return null;
  if ((r.dyingTime as number) < 0 || (r.dyingTime as number) > DYING_DURATION + .05 || (live && r.dyingTime !== 0)) return null;
  if (live ? r.reason !== '' : r.reason !== 'block' && r.reason !== 'fall') return null;
  if (!Number.isInteger(score) || !Number.isInteger(gateIndex) || score < 0 || score > Math.floor(distance) || (live && score !== Math.floor(distance))) return null;

  const course = getCourse(r.seed as number, difficulty), s = course.sample(distance), rest = restOn(s, r.x as number);
  // Every gate spans the road: a live run has passed exactly the gates behind it; a dead
  // one passed those behind the point where it died and no more.
  const passed = course.gatesBefore(distance) - 1;
  if (live ? gateIndex !== passed : gateIndex < course.gatesBefore(score) - 1 || gateIndex > passed) return null;
  const height = r.height as number;
  if (Math.abs(height - rest) > 100) return null;
  if (r.grounded) {
    if (!hasSupport(s, r.x as number) || Math.abs(height - rest) > .01) return null;
  } else if (phase === 'running' && height < restOn(s, clamp(r.x as number, s.center - s.width / 2, s.center + s.width / 2)) - FALL_DEPTH) return null;

  return {
    version: 4, courseRevision: COURSE_REVISION, difficulty, seed: r.seed as number, run: r.run as number, phase: phase === 'dying' ? 'over' : phase,
    distance, x: r.x as number, vx: r.vx as number, height, vy: r.vy as number, grounded: r.grounded,
    elapsed: r.elapsed as number, speedUpTime: r.speedUpTime as number, gateIndex,
    dyingTime: phase === 'dying' ? DYING_DURATION : r.dyingTime as number, score, reason: r.reason as Run['reason'],
  };
}

/** Restore Hard records and compatible Hard runs; older courses cannot be resumed. */
export function restoreSnapshot(value: unknown): { difficulty: Difficulty; records: Records; run: Run | null; migrated: boolean } | null {
  try {
    if (!isObject(value)) return null;
    if (value.version === 4) {
      const records = restoreRecords(value.records);
      let run: Run | null = null;
      try { run = restoreRun(value.run, 'hard'); } catch { run = null; }
      return { difficulty: 'hard', records, run, migrated: false };
    }
    if ((value.version === 1 || value.version === 2 || value.version === 3) && isNumber(value.best) && value.best >= 0) {
      return { difficulty: 'hard', records: emptyRecords(), run: null, migrated: true };
    }
    return null;
  } catch {
    return null;
  }
}
