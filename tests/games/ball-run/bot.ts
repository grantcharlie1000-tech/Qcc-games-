/** Test helpers and a look-ahead bot for Ball Run. The bot shares nothing with the
 * course generator's reachability code: it plans its own interval reachability over
 * the course's public API, then drives the real simulation through `step`. */
import {
  BANK_DRIFT, CONFIG, EDGE_SUPPORT, RADIUS, STEP, lateralSpeed,
  type Course, type Difficulty, type Obstacle, type ObstaclePose, type Run, type SegmentKind, type TrackSample,
} from '../../../src/games/ball-run/config';
import { getCourse } from '../../../src/games/ball-run/course';
import { createRun, runSpeed, step } from '../../../src/games/ball-run/model';

const blankSample = (): TrackSample => ({ center: 0, width: 0, elevation: 0, gradient: 0, bank: 0, ground: true, tunnel: false, kind: 'warmup', segment: 0 });
const blankPose = (): ObstaclePose => ({ x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Height of a resting ball centre: the surface under it plus the radius along the bank normal. */
export function restHeight(course: Course, distance: number, x: number): number {
  return course.surfaceHeight(distance, x) + RADIUS / Math.cos(course.sample(distance).bank);
}

/** A running run placed on the road at `distance` (on the centre line unless `x` is given),
 * grounded and moving with the surface, with the gates behind it already passed. */
export function placeRun(seed: number, difficulty: Difficulty, distance: number, x?: number, elapsed = 0): Run {
  const course = getCourse(seed, difficulty), run = createRun(seed, 1, difficulty), v = course.speed(distance);
  run.phase = 'running';
  run.distance = distance;
  run.x = x ?? course.sample(distance).center;
  run.vx = 0;
  run.elapsed = elapsed;
  run.gateIndex = course.gatesBefore(distance) - 1;
  run.score = Math.floor(distance);
  run.height = restHeight(course, distance, run.x);
  run.vy = (restHeight(course, distance + v * STEP, run.x) - run.height) / STEP;
  run.grounded = true;
  return run;
}

export interface Span { kind: SegmentKind; segment: number; start: number; end: number }

/** Whole segments between `from` and `to`, with boundaries found to 1e-9 m. */
export function spans(course: Course, to: number, from = 0): Span[] {
  const out: Span[] = [], s = course.sample(from), step = .25;
  let segment = s.segment, kind = s.kind, start = from === 0 ? 0 : -1;
  for (let d = from + step; d <= to; d += step) {
    const t = course.sample(d);
    if (t.segment === segment) continue;
    let lo = d - step, hi = d;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (course.sample(mid).segment === t.segment) hi = mid; else lo = mid; }
    if (start >= 0) out.push({ kind, segment, start, end: hi });
    segment = t.segment; kind = t.kind; start = hi;
  }
  return out;
}

/** First distance at which the course reaches its speed cap. */
export function capDistance(course: Course): number {
  const max = CONFIG[course.difficulty].maxSpeed;
  let hi = 1000;
  while (course.speed(hi) < max) hi += 1000;
  let lo = hi - 1000;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (course.speed(mid) >= max) hi = mid; else lo = mid; }
  return hi;
}

/** First whole metre at or after `from` with ground underfoot and no block from 3 m behind to
 * 0.6 s ahead: from there the centre line can reach any route the generator kept. */
export function safeStart(course: Course, from: number): number {
  for (let d = Math.ceil(from); ; d++) {
    let blocked = false;
    course.forEachObstacle(d - 3, d + Math.max(25, .6 * course.speed(d)), () => { blocked = true; });
    if (!blocked && course.sample(d).ground) return d;
  }
}

/** Seed, difficulty, where and how the run ended, and the blocks around it. */
export function describeRun(run: Run): string {
  const course = getCourse(run.seed, run.difficulty), s = course.sample(run.distance), pose = blankPose(), near: string[] = [];
  course.forEachObstacle(run.distance - 15, run.distance + 15, o => {
    course.pose(o, run.elapsed, pose);
    near.push(`#${o.id} ${o.pattern} d=${pose.distance.toFixed(2)}±${pose.halfDepth.toFixed(2)} x=${pose.x.toFixed(2)}±${pose.halfWidth.toFixed(2)}`
      + ` y=${pose.y.toFixed(2)}±${pose.halfHeight.toFixed(2)} roll=${pose.roll.toFixed(3)}${o.slide ? ` slide A=${o.slide.amplitude.toFixed(2)} P=${o.slide.period.toFixed(2)}` : ''}`);
  });
  return `${run.difficulty} seed ${run.seed}: ${run.phase}${run.reason ? ` (${run.reason})` : ''} at d=${run.distance.toFixed(2)}`
    + ` x=${run.x.toFixed(3)} vx=${run.vx.toFixed(2)} h-rest=${(run.height - restHeight(course, run.distance, run.x)).toFixed(3)}`
    + ` road ${s.kind}#${s.segment} c=${s.center.toFixed(3)} w=${s.width.toFixed(2)} bank=${s.bank.toFixed(3)} ground=${s.ground}`
    + ` v=${runSpeed(run).toFixed(2)} t=${run.elapsed.toFixed(2)}; near: ${near.join('; ') || 'none'}`;
}

// The bot -------------------------------------------------------------------

/** Fraction of the real lateral authority the planner relies on; the rest absorbs tracking error. */
const AUTHORITY = .85;
const REPLAN = 6;
/** Steering look-ahead (s); a little longer than the steering response time. */
const LEAD = .12;
const MAX_POINTS = 2048, MAX_SPANS = 32;
/** Planning margins: comfortable first, then the bare minimum the physics allows. */
const MARGINS = [{ clear: RADIUS + .05, edge: EDGE_SUPPORT + .06, comfort: .2 }, { clear: RADIUS + .005, edge: EDGE_SUPPORT + .005, comfort: 0 }] as const;

interface Footprint { from: number; to: number; lo: number; hi: number }

class Planner {
  readonly at = new Float64Array(MAX_POINTS);
  readonly shift = new Float64Array(MAX_POINTS);
  readonly reach = new Float64Array(MAX_POINTS);
  readonly lo = new Float64Array(MAX_POINTS * MAX_SPANS);
  readonly hi = new Float64Array(MAX_POINTS * MAX_SPANS);
  readonly count = new Int32Array(MAX_POINTS);
  readonly path = new Float64Array(MAX_POINTS);
  readonly center = new Float64Array(MAX_POINTS);
  n = 0;
  /** Index of the path point at or before the last query. */
  private cursor = 0;
  private readonly sample = blankSample();
  private readonly pose = blankPose();
  private readonly blocks: Footprint[] = [];
  private readonly tmpLo = new Float64Array(MAX_SPANS * 3);
  private readonly tmpHi = new Float64Array(MAX_SPANS * 3);

  /** Plans a route from the run's state. False when even the bare margins find no route over
   * the whole horizon; the line then runs as far as a route was found. */
  plan(run: Run, course: Course): boolean {
    for (const margin of MARGINS) if (this.attempt(run, course, margin)) return true;
    return false;
  }

  private attempt(run: Run, course: Course, margin: typeof MARGINS[number]): boolean {
    const d0 = run.distance, end = d0 + Math.max(120, 2.5 * runSpeed(run)), pose = this.pose, blocks = this.blocks;
    blocks.length = 0;
    course.forEachObstacle(d0 - margin.clear, end + margin.clear, (o: Obstacle) => {
      course.pose(o, run.elapsed, pose);
      const reachOut = pose.halfWidth * Math.abs(Math.cos(pose.roll)) + pose.halfHeight * Math.abs(Math.sin(pose.roll)) + margin.clear;
      let lo = pose.x - reachOut, hi = pose.x + reachOut;
      if (o.slide) {
        // A sliding block closes its whole sweep.
        const quarter = (Math.PI / 2 - o.slide.phase) / (2 * Math.PI) * o.slide.period;
        const a = course.pose(o, quarter, pose).x, b = course.pose(o, quarter + o.slide.period / 2, pose).x;
        lo = Math.min(a, b) - reachOut; hi = Math.max(a, b) + reachOut;
      }
      blocks.push({ from: pose.distance - pose.halfDepth - margin.clear, to: pose.distance + pose.halfDepth + margin.clear, lo, hi });
    });
    // Points: the ball, every whole metre, and both ends of every widened block.
    const at = this.at;
    let n = 0;
    at[n++] = d0;
    for (let d = Math.floor(d0) + 1; d <= end && n < MAX_POINTS; d++) at[n++] = d;
    for (const b of blocks) for (const e of [b.from, b.to]) if (e > d0 && e < end && n < MAX_POINTS) at[n++] = e;
    at.subarray(1, n).sort();
    this.n = n;
    // Forward reachable sets.
    const s = this.sample;
    this.count[0] = 1; this.lo[0] = run.x; this.hi[0] = run.x;
    this.center[0] = course.sample(d0, s).center;
    let complete = true;
    for (let i = 1; i < n; i++) {
      const a = at[i - 1], b = at[i], dd = b - a, v = course.speed(b);
      course.sample(b, s);
      this.center[i] = s.center;
      this.shift[i] = BANK_DRIFT * Math.sin(s.bank) * dd / v;
      this.reach[i] = AUTHORITY * lateralSpeed(v) * dd / v;
      const m = s.tunnel ? RADIUS + .002 : margin.edge;
      if (!this.advance(i, s.center - s.width / 2 + m, s.center + s.width / 2 - m, b)) {
        // Keep the line as far as it goes only on the last tier.
        if (margin !== MARGINS[MARGINS.length - 1]) return false;
        this.n = n = i;
        complete = false;
        break;
      }
    }
    // Back-track a concrete line, ending nearest the centre of the road.
    const path = this.path;
    path[n - 1] = this.pick(n - 1, this.center[n - 1], Infinity, margin.comfort);
    for (let i = n - 2; i >= 0; i--) path[i] = this.pick(i, path[i + 1] - this.shift[i + 1], this.reach[i + 1] + 1e-9, margin.comfort);
    this.cursor = 0;
    return complete;
  }

  /** set[i] ← ((set[i−1] + shift) ⊕ reach) ∩ band, minus the blocks active at the point. */
  private advance(i: number, bandLo: number, bandHi: number, at: number): boolean {
    const base = (i - 1) * MAX_SPANS, out = i * MAX_SPANS, shift = this.shift[i], r = this.reach[i];
    const tl = this.tmpLo, th = this.tmpHi;
    // Dilate and merge.
    let k = 0;
    for (let j = 0; j < this.count[i - 1]; j++) {
      const lo = this.lo[base + j] + shift - r, hi = this.hi[base + j] + shift + r;
      if (k && lo <= th[k - 1]) th[k - 1] = Math.max(th[k - 1], hi);
      else { tl[k] = lo; th[k] = hi; k++; }
    }
    // Clip to the band.
    let m = 0;
    for (let j = 0; j < k; j++) {
      const lo = Math.max(tl[j], bandLo), hi = Math.min(th[j], bandHi);
      if (lo <= hi) { tl[m] = lo; th[m] = hi; m++; }
    }
    // Cut each active block.
    for (const b of this.blocks) {
      if (b.from > at || b.to < at) continue;
      let w = 0;
      for (let j = 0; j < m; j++) {
        const lo = tl[j], hi = th[j];
        if (hi <= b.lo || lo >= b.hi) { tl[MAX_SPANS + w] = lo; th[MAX_SPANS + w] = hi; w++; continue; }
        if (lo < b.lo) { tl[MAX_SPANS + w] = lo; th[MAX_SPANS + w] = b.lo; w++; }
        if (hi > b.hi) { tl[MAX_SPANS + w] = b.hi; th[MAX_SPANS + w] = hi; w++; }
      }
      for (let j = 0; j < w; j++) { tl[j] = tl[MAX_SPANS + j]; th[j] = th[MAX_SPANS + j]; }
      m = Math.min(w, MAX_SPANS);
    }
    this.count[i] = m;
    for (let j = 0; j < m; j++) { this.lo[out + j] = tl[j]; this.hi[out + j] = th[j]; }
    return m > 0;
  }

  /** The point of set[i] within `r` of `target` that is closest to it, kept `comfort` inside its interval when it can be. */
  private pick(i: number, target: number, r: number, comfort: number): number {
    const base = i * MAX_SPANS;
    let best = NaN, gap = Infinity;
    for (let j = 0; j < this.count[i]; j++) {
      const lo = this.lo[base + j], hi = this.hi[base + j];
      const a = Math.max(lo, target - r), b = Math.min(hi, target + r);
      if (a > b) continue;
      let x: number;
      const ca = Math.max(a, lo + comfort), cb = Math.min(b, hi - comfort);
      if (ca <= cb) x = clamp(target, ca, cb);
      else x = clamp((lo + hi) / 2, a, b);
      if (Math.abs(x - target) < gap) { gap = Math.abs(x - target); best = x; }
    }
    return Number.isNaN(best) ? clamp(target, this.lo[base], this.hi[base + this.count[i] - 1]) : best;
  }

  /** The planned line at a distance (linear between points). */
  lineAt(d: number): number {
    const at = this.at, n = this.n;
    if (d <= at[0]) return this.path[0];
    if (d >= at[n - 1]) return this.path[n - 1];
    let i = this.cursor;
    if (at[i] > d) i = 0;
    while (i + 1 < n && at[i + 1] <= d) i++;
    this.cursor = i;
    const t = (d - at[i]) / (at[i + 1] - at[i] || 1);
    return this.path[i] + (this.path[i + 1] - this.path[i]) * t;
  }
}

/** Statistics from the last driveBot call, for diagnosing a failure. */
export const botStats = { plans: 0, failedPlans: 0 };

/** Drives a running run with the look-ahead bot until it has travelled `metres` or stops
 * running, calling `observe` after every step. Mutates and returns the same run. */
export function driveBot(run: Run, metres: number, observe?: (run: Run) => void): { run: Run; steps: number } {
  const course = getCourse(run.seed, run.difficulty), planner = new Planner(), target = run.distance + metres;
  botStats.plans = botStats.failedPlans = 0;
  let steps = 0;
  while (run.phase === 'running' && run.distance < target) {
    if (steps % REPLAN === 0) {
      botStats.plans++;
      // A failed plan still leaves the line as far as a route was found.
      if (!planner.plan(run, course)) botStats.failedPlans++;
    }
    const v = runSpeed(run), aim = planner.lineAt(run.distance + LEAD * v);
    step(run, clamp((aim - run.x) / (LEAD * lateralSpeed(v)) - .02 * run.vx, -1, 1), STEP);
    steps++;
    observe?.(run);
  }
  return { run, steps };
}
