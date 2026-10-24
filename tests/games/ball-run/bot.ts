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

/** Planning tiers, most comfortable first. The middle one is the generator's own guarantee
 * (its reach safety and clearances); the last relies on 0.85 of the real lateral authority
 * with bare clearances. The real controller always has full authority to absorb tracking error. */
const TIERS = [
  { authority: .55, clear: RADIUS + .16, edge: EDGE_SUPPORT + .16 },
  { authority: .7, clear: RADIUS + .06, edge: EDGE_SUPPORT + .12 },
  { authority: .85, clear: RADIUS + .02, edge: EDGE_SUPPORT + .03 },
] as const;
const HARD = TIERS.length - 1;
const REPLAN = 6;
/** Steering look-ahead (s): a little longer than the steering response time. */
const LEAD = .12;
/** Unforced drift toward the middle of the viable corridor, as a share of the tier's reach. */
const SETTLE = .35;
const MAX_POINTS = 4096, MAX_SPANS = 32;

/** A block's footprint without clearance; sliding blocks cover their whole sweep. */
interface Footprint { from: number; to: number; lo: number; hi: number }

/** Interval sets for every point, stored flat. */
class Sets {
  readonly lo = new Float64Array(MAX_POINTS * MAX_SPANS);
  readonly hi = new Float64Array(MAX_POINTS * MAX_SPANS);
  readonly count = new Int32Array(MAX_POINTS);
  copy(i: number, from: Sets): void {
    const b = i * MAX_SPANS;
    this.count[i] = from.count[i];
    for (let j = 0; j < from.count[i]; j++) { this.lo[b + j] = from.lo[b + j]; this.hi[b + j] = from.hi[b + j]; }
  }
}

export class Planner {
  readonly at = new Float64Array(MAX_POINTS);
  /** Bank drift over the step that ends at point i. */
  readonly shift = new Float64Array(MAX_POINTS);
  readonly reach = TIERS.map(() => new Float64Array(MAX_POINTS));
  /** Viable positions: from here the end of the horizon can still be reached. */
  readonly viable = TIERS.map(() => new Sets());
  readonly path = new Float64Array(MAX_POINTS);
  private readonly center = new Float64Array(MAX_POINTS);
  private readonly width = new Float64Array(MAX_POINTS);
  private readonly tunnel = new Uint8Array(MAX_POINTS);
  n = 0;
  failed = false;
  private cursor = 0;
  private readonly sample = blankSample();
  private readonly pose = blankPose();
  private readonly blocks: Footprint[] = [];
  private readonly tl = new Float64Array(MAX_SPANS * 3);
  private readonly th = new Float64Array(MAX_SPANS * 3);

  /** Plans a line from the run's state; false when even the last tier found no route somewhere on the horizon. */
  plan(run: Run, course: Course): boolean {
    const d0 = run.distance, end = d0 + Math.max(120, 2.5 * runSpeed(run)), pose = this.pose, blocks = this.blocks;
    blocks.length = 0;
    course.forEachObstacle(d0 - TIERS[0].clear, end + TIERS[0].clear, (o: Obstacle) => {
      course.pose(o, run.elapsed, pose);
      const out = pose.halfWidth * Math.abs(Math.cos(pose.roll)) + pose.halfHeight * Math.abs(Math.sin(pose.roll));
      let lo = pose.x, hi = pose.x;
      if (o.slide) {
        const quarter = (Math.PI / 2 - o.slide.phase) / (2 * Math.PI) * o.slide.period;
        const a = course.pose(o, quarter, pose).x, b = course.pose(o, quarter + o.slide.period / 2, pose).x;
        lo = Math.min(a, b); hi = Math.max(a, b);
      }
      blocks.push({ from: pose.distance - pose.halfDepth, to: pose.distance + pose.halfDepth, lo: lo - out, hi: hi + out });
    });
    // Points: the ball, every whole metre, and where each tier's widened block starts and ends.
    const at = this.at;
    let n = 0;
    at[n++] = d0;
    for (let d = Math.floor(d0) + 1; d <= end && n < MAX_POINTS; d++) at[n++] = d;
    for (const b of blocks) for (const tier of TIERS) for (const e of [b.from - tier.clear, b.to + tier.clear]) if (e > d0 && e < end && n < MAX_POINTS) at[n++] = e;
    at.subarray(1, n).sort();
    this.n = n;
    const s = this.sample;
    for (let i = 0; i < n; i++) {
      course.sample(at[i], s);
      this.center[i] = s.center; this.width[i] = s.width; this.tunnel[i] = s.tunnel ? 1 : 0;
      if (i === 0) continue;
      const dd = at[i] - at[i - 1], v = course.speed(at[i]);
      this.shift[i] = BANK_DRIFT * Math.sin(s.bank) * dd / v;
      for (let t = 0; t < TIERS.length; t++) this.reach[t][i] = TIERS[t].authority * lateralSpeed(v) * dd / v;
    }
    // Backward viability, hardest tier first so softer tiers can fall back to it where they find no room.
    this.failed = false;
    for (let t = HARD; t >= 0; t--) {
      const sets = this.viable[t];
      this.allowed(n - 1, t, sets);
      for (let i = n - 2; i >= 0; i--) {
        this.back(i, t, sets);
        if (sets.count[i]) continue;
        if (t < HARD) sets.copy(i, this.viable[t + 1]);
        else { this.failed = true; this.allowed(i, t, sets); }
      }
    }
    // Forward line: stay in the most comfortable viable set the reach allows, settling toward its middle.
    const path = this.path;
    path[0] = run.x;
    for (let i = 0; i + 1 < n; i++) path[i + 1] = this.next(i + 1, path[i] + this.shift[i + 1]);
    this.cursor = 0;
    return !this.failed;
  }

  /** Road band at point i for a tier, minus the blocks active there. */
  private allowed(i: number, t: number, sets: Sets): void {
    const tier = TIERS[t], m = this.tunnel[i] ? RADIUS + .01 : tier.edge;
    const tl = this.tl, th = this.th;
    tl[0] = this.center[i] - this.width[i] / 2 + m; th[0] = this.center[i] + this.width[i] / 2 - m;
    this.store(i, sets, this.cut(i, t, tl[0] <= th[0] ? 1 : 0));
  }

  /** viable[i] ← ((viable[i+1] ⊕ reach) − shift) ∩ allowed[i]; the ball's own point is not cut. */
  private back(i: number, t: number, sets: Sets): void {
    const r = this.reach[t][i + 1], shift = this.shift[i + 1], b = (i + 1) * MAX_SPANS, tl = this.tl, th = this.th;
    let k = 0;
    for (let j = 0; j < sets.count[i + 1]; j++) {
      const lo = sets.lo[b + j] - shift - r, hi = sets.hi[b + j] - shift + r;
      if (k && lo <= th[k - 1]) th[k - 1] = Math.max(th[k - 1], hi);
      else { tl[k] = lo; th[k] = hi; k++; }
    }
    if (i > 0) {
      const tier = TIERS[t], m = this.tunnel[i] ? RADIUS + .01 : tier.edge;
      const bandLo = this.center[i] - this.width[i] / 2 + m, bandHi = this.center[i] + this.width[i] / 2 - m;
      let w = 0;
      for (let j = 0; j < k; j++) {
        const lo = Math.max(tl[j], bandLo), hi = Math.min(th[j], bandHi);
        if (lo <= hi) { tl[w] = lo; th[w] = hi; w++; }
      }
      k = this.cut(i, t, w);
    }
    this.store(i, sets, k);
  }

  /** Removes the tier-widened blocks active at point i from tl/th[0..k); returns the new count. */
  private cut(i: number, t: number, k: number): number {
    const d = this.at[i], c = TIERS[t].clear, tl = this.tl, th = this.th, o = MAX_SPANS;
    for (const b of this.blocks) {
      if (b.from - c > d || b.to + c < d) continue;
      const blo = b.lo - c, bhi = b.hi + c;
      let w = 0;
      for (let j = 0; j < k; j++) {
        const lo = tl[j], hi = th[j];
        if (hi <= blo || lo >= bhi) { tl[o + w] = lo; th[o + w] = hi; w++; continue; }
        if (lo < blo) { tl[o + w] = lo; th[o + w] = blo; w++; }
        if (hi > bhi) { tl[o + w] = bhi; th[o + w] = hi; w++; }
      }
      k = Math.min(w, MAX_SPANS);
      for (let j = 0; j < k; j++) { tl[j] = tl[o + j]; th[j] = th[o + j]; }
    }
    return k;
  }

  private store(i: number, sets: Sets, k: number): void {
    const b = i * MAX_SPANS;
    sets.count[i] = k;
    for (let j = 0; j < k; j++) { sets.lo[b + j] = this.tl[j]; sets.hi[b + j] = this.th[j]; }
  }

  /** Next line position at point i from the drifted previous one, `p`. */
  private next(i: number, p: number): number {
    const b = i * MAX_SPANS;
    for (let t = 0; t < TIERS.length; t++) {
      const sets = this.viable[t], r = this.reach[t][i], count = sets.count[i];
      // The corridor nearest p, and a target a little way toward its middle.
      let nearest = -1, gap = Infinity;
      for (let j = 0; j < count; j++) {
        const g = Math.max(0, sets.lo[b + j] - p, p - sets.hi[b + j]);
        if (g < gap) { gap = g; nearest = j; }
      }
      // A line that rides a corridor's edge must not drop to a harder tier on rounding alone.
      const reach = r + 1e-7;
      if (nearest < 0 || gap > reach) continue;
      const middle = (sets.lo[b + nearest] + sets.hi[b + nearest]) / 2, q = p + clamp(middle - p, -SETTLE * r, SETTLE * r);
      let best = NaN, miss = Infinity;
      for (let j = 0; j < count; j++) {
        const lo = Math.max(sets.lo[b + j], p - reach), hi = Math.min(sets.hi[b + j], p + reach);
        if (lo > hi) continue;
        const x = clamp(q, lo, hi);
        if (Math.abs(x - q) < miss) { miss = Math.abs(x - q); best = x; }
      }
      if (!Number.isNaN(best)) return best;
    }
    // Not viable even on the last tier: head for the nearest place that is.
    const sets = this.viable[HARD];
    let best = p, miss = Infinity;
    for (let j = 0; j < sets.count[i]; j++) {
      const x = clamp(p, sets.lo[b + j], sets.hi[b + j]);
      if (Math.abs(x - p) < miss) { miss = Math.abs(x - p); best = x; }
    }
    return best;
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
      if (!planner.plan(run, course)) botStats.failedPlans++;
    }
    const v = runSpeed(run), aim = planner.lineAt(run.distance + LEAD * v);
    step(run, clamp((aim - run.x) / (LEAD * lateralSpeed(v)) - .02 * run.vx, -1, 1), STEP);
    steps++;
    observe?.(run);
  }
  return { run, steps };
}
