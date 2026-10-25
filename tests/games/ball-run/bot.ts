/** Test helpers and a look-ahead bot for Ball Run. The bot shares nothing with the
 * course generator's reachability code: it plans its own interval reachability over
 * the course's public API, then drives the real simulation through `step`. */
import {
  BANK_DRIFT, CONFIG, EDGE_SUPPORT, RADIUS, STEER_RESPONSE, STEP, lateralSpeed,
  type Course, type Difficulty, type Obstacle, type ObstaclePose, type Run, type SegmentKind, type TrackSample,
} from '../../../src/games/ball-run/config';
import { sweepSphereBox } from '../../../src/core/collision';
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
  // The surface's vertical speed over the step ahead, or the step behind when a drop's gap is ahead.
  const dt = course.sample(distance + v * STEP).ground ? STEP : -STEP;
  run.vy = (restHeight(course, distance + v * dt, run.x) - run.height) / dt;
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
//
// Under the model's analytic steering the lag-free position p = x + vx / STEER_RESPONSE moves at
// exactly the commanded lateral speed plus bank drift, and x follows p as a LAG-second
// exponential average (x' = (p − x) / LAG + drift). So the bot plans a line for p, which it can
// follow exactly, and checks the exact x that line produces.
//
// 1. Viability: interval sets of p from which the end of a window of road can still be reached,
//    by backward reachability with a fraction of the real lateral authority, in three tiers from
//    comfortable to bare. A constraint on x at distance D applies to p at D − v·LAG (x trails p by
//    about LAG), shifted against the drift. These depend only on the course, so a window three
//    horizons long is computed once and shared by every re-plan inside it: a cache, whose sets
//    therefore reach one to three horizons past the ball rather than exactly one. (Rebuilding to
//    exactly one horizon on every re-plan also passes the bot matrix, at about three times the cost.)
// 2. Line: every REPLAN steps, from the ball's state, p is chosen point by point (the most
//    comfortable viable choice first), never moving faster than 0.85 of the lateral authority, and
//    every choice is checked by the exact x it produces: on the road, and clear of every block
//    (sliding blocks close their whole sweep). Where x fails, a shooting pass pushes p toward the
//    side x needs over the two lags before and re-runs; if that does not clear the horizon, a
//    depth-first search with backtracking tries. Both decide point by point, so neither can go
//    back to a choice made more than a few metres before the failure (which side of an earlier
//    block to take). When both fall short, the previous re-plan's line is tried again (extended
//    greedily), and then a breadth-first beam over (x, p) states, which keeps both sides of every
//    block open at once.
// 3. Control: the input (full authority available) puts p back on the line after every step.
//
// The plan's first design (an x line backtracked from a single reachability pass, followed by a
// look-ahead P controller) could not keep up with the 0.1 s steering lag or bank drift and died
// on most seeds; see the Task 3 report.

/** Viability tiers, most comfortable first. The middle one is the generator's own reach safety and
 * clearances; the last relies on 0.85 of the real lateral authority with bare clearances. */
const TIERS = [
  { authority: .55, clear: RADIUS + .16, edge: EDGE_SUPPORT + .16 },
  { authority: .7, clear: RADIUS + .06, edge: EDGE_SUPPORT + .12 },
  { authority: .85, clear: RADIUS + .02, edge: EDGE_SUPPORT + .03 },
] as const;
const HARD = TIERS.length - 1;
/** Margins for the exact x of a searched line: comfortable (square corners), then bare (the ball's
 * real round contact with a block's corner). */
const X_MARGINS = [{ clear: RADIUS + .05, edge: EDGE_SUPPORT + .05 }, { clear: RADIUS + .01, edge: EDGE_SUPPORT + .01 }] as const;
const REPLAN = 6;
/** Steering lag (s): x trails p by about this long. */
const LAG = 1 / STEER_RESPONSE;
/** Search budget: candidates tried per point. */
const BUDGET = 40;
/** Repairs tried by the shooting search before it falls back to the depth-first search. */
const REPAIRS = 30;
/** The exact search looks this far ahead (s, at least SEARCH_MIN m); the viability sets cover the rest of the horizon. */
const SEARCH = 2.5, SEARCH_MIN = 50;
const MAX_POINTS = 4096, MAX_SPANS = 32, MAX_CANDS = 16;
/** Beam search: states kept per point, one per cell of x and p (m), and the moves of p tried from
 * each, as fractions of the reach. */
const BEAM = 256, CELL_X = .03, CELL_P = .06, MOVES = [-1, -.75, -.5, -.25, 0, .25, .5, .75, 1];

/** A block's footprint without clearance; a sliding block covers its whole sweep. */
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

/** Course data and viability sets over a stretch of road. */
class Window {
  from = 0;
  to = -Infinity;
  n = 0;
  readonly at = new Float64Array(MAX_POINTS);
  readonly speed = new Float64Array(MAX_POINTS);
  readonly bank = new Float64Array(MAX_POINTS);
  /** The road at the point itself, for x. */
  readonly roadC = new Float64Array(MAX_POINTS);
  readonly roadW = new Float64Array(MAX_POINTS);
  readonly roadT = new Uint8Array(MAX_POINTS);
  /** Bank drift and tier reach over the step that ends at each point. */
  readonly shift = new Float64Array(MAX_POINTS);
  readonly reach = TIERS.map(() => new Float64Array(MAX_POINTS));
  readonly viable = TIERS.map(() => new Sets());
  /** Blocks near each point (indices into `blocks`), for the exact x check. */
  readonly near = new Int32Array(MAX_POINTS * MAX_SPANS);
  readonly nearCount = new Int32Array(MAX_POINTS);
  readonly blocks: Footprint[] = [];
  /** Where the constraints on p come from (one lag later), the road there and the drift offset of x from p. */
  private readonly check = new Float64Array(MAX_POINTS);
  private readonly center = new Float64Array(MAX_POINTS);
  private readonly width = new Float64Array(MAX_POINTS);
  private readonly offset = new Float64Array(MAX_POINTS);
  private readonly tunnel = new Uint8Array(MAX_POINTS);
  private readonly sample = blankSample();
  private readonly pose = blankPose();
  private readonly tl = new Float64Array(MAX_SPANS * 3);
  private readonly th = new Float64Array(MAX_SPANS * 3);

  build(course: Course, from: number, to: number): void {
    const pose = this.pose, blocks = this.blocks, reachOut = TIERS[0].clear;
    this.from = from; this.to = to;
    blocks.length = 0;
    course.forEachObstacle(from - reachOut, to + reachOut, (o: Obstacle) => {
      course.pose(o, 0, pose);
      const out = pose.halfWidth * Math.abs(Math.cos(pose.roll)) + pose.halfHeight * Math.abs(Math.sin(pose.roll));
      let lo = pose.x, hi = pose.x;
      if (o.slide) {
        const quarter = (Math.PI / 2 - o.slide.phase) / (2 * Math.PI) * o.slide.period;
        const a = course.pose(o, quarter, pose).x, b = course.pose(o, quarter + o.slide.period / 2, pose).x;
        lo = Math.min(a, b); hi = Math.max(a, b);
      }
      blocks.push({ from: pose.distance - pose.halfDepth, to: pose.distance + pose.halfDepth, lo: lo - out, hi: hi + out });
    });
    // Points: every whole metre, and where each widened block starts and ends, for x and (one lag earlier) for p.
    const at = this.at;
    let n = 0;
    at[n++] = from;
    for (let d = Math.floor(from) + 1; d <= to && n < MAX_POINTS; d++) at[n++] = d;
    for (const b of blocks) {
      for (const tier of TIERS) for (const edge of [b.from - tier.clear, b.to + tier.clear]) {
        const e = edge - LAG * course.speed(edge);
        if (e > from && e < to && n < MAX_POINTS) at[n++] = e;
      }
      // The rounded footprint for x starts and ends here.
      const c = X_MARGINS[0].clear;
      for (const e of [b.from - c, b.to + c]) if (e > from && e < to && n < MAX_POINTS) at[n++] = e;
    }
    at.subarray(0, n).sort();
    this.n = n;
    const s = this.sample;
    for (let i = 0; i < n; i++) {
      const v = this.speed[i] = course.speed(at[i]);
      course.sample(at[i], s);
      this.roadC[i] = s.center; this.roadW[i] = s.width; this.roadT[i] = s.tunnel ? 1 : 0; this.bank[i] = s.bank;
      course.sample(this.check[i] = at[i] + LAG * v, s);
      this.center[i] = s.center; this.width[i] = s.width; this.tunnel[i] = s.tunnel ? 1 : 0;
      this.offset[i] = -LAG * BANK_DRIFT * Math.sin(s.bank);
      // Blocks whose rounded footprint the step ending here can touch.
      let near = 0;
      const a = i ? at[i - 1] : at[i], c = X_MARGINS[0].clear;
      for (let b = 0; b < blocks.length && near < MAX_SPANS; b++) {
        if (blocks[b].from - c <= at[i] && a <= blocks[b].to + c) this.near[i * MAX_SPANS + near++] = b;
      }
      this.nearCount[i] = near;
      if (i === 0) continue;
      const dd = at[i] - at[i - 1];
      this.shift[i] = BANK_DRIFT * Math.sin(this.bank[i - 1]) * dd / v;
      for (let t = 0; t < TIERS.length; t++) this.reach[t][i] = TIERS[t].authority * lateralSpeed(v) * dd / v;
    }
    // Backward viability, hardest tier first so softer tiers can fall back to it where they find no room.
    for (let t = HARD; t >= 0; t--) {
      const sets = this.viable[t];
      this.allowed(n - 1, t, sets);
      for (let i = n - 2; i >= 0; i--) {
        this.back(i, t, sets);
        if (sets.count[i]) continue;
        if (t < HARD) sets.copy(i, this.viable[t + 1]);
        else this.allowed(i, t, sets);
      }
    }
  }

  /** Index of the first point after d. */
  after(d: number): number {
    let lo = 0, hi = this.n;
    while (lo < hi) { const mid = lo + hi >> 1; if (this.at[mid] <= d) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /** Road band at point i for a tier, minus the blocks active there. */
  private allowed(i: number, t: number, sets: Sets): void {
    const m = this.tunnel[i] ? RADIUS + .01 : TIERS[t].edge, c = this.center[i] + this.offset[i];
    this.tl[0] = c - this.width[i] / 2 + m; this.th[0] = c + this.width[i] / 2 - m;
    this.store(i, sets, this.cut(i, t, this.tl[0] <= this.th[0] ? 1 : 0));
  }

  /** viable[i] ← ((viable[i+1] ⊕ reach) − shift) ∩ allowed[i]. */
  private back(i: number, t: number, sets: Sets): void {
    const r = this.reach[t][i + 1], shift = this.shift[i + 1], b = (i + 1) * MAX_SPANS, tl = this.tl, th = this.th;
    let k = 0;
    for (let j = 0; j < sets.count[i + 1]; j++) {
      const lo = sets.lo[b + j] - shift - r, hi = sets.hi[b + j] - shift + r;
      if (k && lo <= th[k - 1]) th[k - 1] = Math.max(th[k - 1], hi);
      else { tl[k] = lo; th[k] = hi; k++; }
    }
    const m = this.tunnel[i] ? RADIUS + .01 : TIERS[t].edge, c = this.center[i] + this.offset[i];
    const bandLo = c - this.width[i] / 2 + m, bandHi = c + this.width[i] / 2 - m;
    let w = 0;
    for (let j = 0; j < k; j++) {
      const lo = Math.max(tl[j], bandLo), hi = Math.min(th[j], bandHi);
      if (lo <= hi) { tl[w] = lo; th[w] = hi; w++; }
    }
    this.store(i, sets, this.cut(i, t, w));
  }

  /** Removes the tier-widened blocks active at point i from tl/th[0..k); returns the new count. */
  private cut(i: number, t: number, k: number): number {
    const d = this.check[i], c = TIERS[t].clear, shift = this.offset[i], tl = this.tl, th = this.th, o = MAX_SPANS;
    for (const b of this.blocks) {
      if (b.from - c > d || b.to + c < d) continue;
      const blo = b.lo - c + shift, bhi = b.hi + c + shift;
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
}

class Planner {
  readonly window = new Window();
  /** Plan points: the ball, then the window's points over the horizon (plan point k ≥ 1 is window point first + k − 1). */
  readonly at = new Float64Array(MAX_POINTS);
  /** The line for p, and the exact x it gives. */
  readonly path = new Float64Array(MAX_POINTS);
  readonly xs = new Float64Array(MAX_POINTS);
  n = 0;
  private first = 0;
  private readonly speed = new Float64Array(MAX_POINTS);
  private readonly bank = new Float64Array(MAX_POINTS);
  private readonly shift = new Float64Array(MAX_POINTS);
  private readonly reach = TIERS.map(() => new Float64Array(MAX_POINTS));
  private readonly cand = new Float64Array(MAX_POINTS * MAX_CANDS);
  private readonly candN = new Int32Array(MAX_POINTS);
  /** Whether a point's fallback candidates have been generated yet. */
  private readonly full = new Uint8Array(MAX_POINTS);
  private readonly pick = new Int32Array(MAX_POINTS);
  private readonly best = new Float64Array(MAX_POINTS);
  /** Bounds on p set by repairs. */
  private readonly lower = new Float64Array(MAX_POINTS);
  private readonly upper = new Float64Array(MAX_POINTS);
  /** Set when `clear` fails: the side x must move to (±1), and how far. */
  private needSide = 0;
  private needBy = 0;
  private readonly sample = blankSample();
  private cursor = 0;

  /** Plans a line from the run's state; false when no line clears the whole horizon (the line
   * then runs as far as one was found). */
  plan(run: Run, course: Course): boolean {
    const d0 = run.distance, v0 = runSpeed(run), horizon = Math.max(120, 2.5 * v0), w = this.window;
    if (w.from > d0 || w.to < d0 + horizon) w.build(course, d0, d0 + 3 * horizon);
    this.first = w.after(d0 + 1e-9);
    const at = this.at, ahead = d0 + Math.min(horizon, Math.max(SEARCH_MIN, SEARCH * v0));
    at[0] = d0; this.speed[0] = v0; this.bank[0] = course.sample(d0, this.sample).bank;
    let n = 1;
    for (let j = this.first; j < w.n && w.at[j] <= ahead && n < MAX_POINTS; j++, n++) {
      at[n] = w.at[j]; this.speed[n] = w.speed[j]; this.bank[n] = w.bank[j];
      if (n === 1) {
        const dd = at[1] - d0, v = this.speed[1];
        this.shift[1] = BANK_DRIFT * Math.sin(this.bank[0]) * dd / v;
        for (let t = 0; t < TIERS.length; t++) this.reach[t][1] = TIERS[t].authority * lateralSpeed(v) * dd / v;
      } else {
        this.shift[n] = w.shift[j];
        for (let t = 0; t < TIERS.length; t++) this.reach[t][n] = w.reach[t][j];
      }
    }
    // Comfortable margins first, then bare ones; the greedy searches first, then the previous line
    // and the beam. Keep whichever line runs furthest.
    const x0 = run.x, p0 = run.x + LAG * run.vx;
    let reached = -1, keep: Float64Array | null = null;
    for (const [method, margin] of this.methods) {
      if (reached === n - 1) break;
      const got = method.call(this, x0, p0, margin, n);
      if (got > reached) { reached = got; keep = this.path.slice(0, got + 1); }
    }
    this.path.set(keep!);
    this.n = reached + 1;
    this.cursor = 0;
    this.previous.set(this.path.subarray(0, this.n));
    this.previousAt.set(at.subarray(0, this.n));
    this.previousN = this.n;
    return reached === n - 1;
  }
  private readonly methods: [(x0: number, p0: number, margin: number, n: number) => number, number][] = [
    [this.shoot, 0], [this.search, 0], [this.shoot, 1], [this.search, 1], [this.reuse, 0], [this.reuse, 1], [this.beam, 0], [this.beam, 1],
  ];
  /** The last plan's line, for `reuse`. */
  private readonly previous = new Float64Array(MAX_POINTS);
  private readonly previousAt = new Float64Array(MAX_POINTS);
  private previousN = 0;

  /** The previous plan's line where it reaches (the ball has been following it), then greedy
   * choices beyond. Returns the last point reached. */
  private reuse(x0: number, p0: number, margin: number, n: number): number {
    if (this.previousN < 2) return 0;
    const path = this.path, xs = this.xs, end = this.previousAt[this.previousN - 1];
    path[0] = p0; xs[0] = x0;
    let k = 1;
    for (; k < n; k++) {
      const base = path[k - 1] + this.shift[k], all = this.reach[HARD][k] + 1e-7;
      const want = this.at[k] <= end ? interpolate(this.previousAt, this.previous, this.previousN, this.at[k]) : this.settle(k, base);
      const p = clamp(want, base - all, base + all), x = this.follow(k, xs[k - 1], path[k - 1], p, 1);
      if (!this.clear(k, xs[k - 1], path[k - 1], p, x, margin)) break;
      path[k] = p; xs[k] = x;
    }
    return k - 1;
  }

  // Beam storage: every point's states (x, p, parent index), BEAM per point.
  private beamX = new Float64Array(0);
  private beamP = new Float64Array(0);
  private beamFrom = new Int32Array(0);
  private readonly beamCount = new Int32Array(MAX_POINTS);

  /** Breadth-first search: every point keeps up to BEAM states (x, p), at most one per cell, each
   * extended by MOVES of p across 0.85 of the lateral authority and checked like every other line.
   * Where more cells survive than BEAM, an even spread across x and p is kept. Returns the last
   * point reached; at the horizon it prefers an end inside the most comfortable viability set. */
  private beam(x0: number, p0: number, margin: number, n: number): number {
    if (this.beamX.length < n * BEAM) {
      this.beamX = new Float64Array(n * BEAM); this.beamP = new Float64Array(n * BEAM); this.beamFrom = new Int32Array(n * BEAM);
    }
    const bx = this.beamX, bp = this.beamP, from = this.beamFrom, count = this.beamCount, seen = new Map<number, number>();
    const nx: number[] = [], np: number[] = [], nf: number[] = [], keys: number[] = [];
    bx[0] = x0; bp[0] = p0; from[0] = -1; count[0] = 1;
    let k = 1;
    for (; k < n; k++) {
      seen.clear(); nx.length = np.length = nf.length = keys.length = 0;
      const r = this.reach[HARD][k], shift = this.shift[k], prev = (k - 1) * BEAM;
      for (let s = 0; s < count[k - 1]; s++) {
        const xa = bx[prev + s], pa = bp[prev + s];
        for (const move of MOVES) {
          const p = pa + shift + move * r, x = this.follow(k, xa, pa, p, 1);
          const key = Math.round(x / CELL_X) * 1e5 + Math.round(p / CELL_P);
          if (seen.has(key) || !this.clear(k, xa, pa, p, x, margin)) continue;
          seen.set(key, nx.length);
          nx.push(x); np.push(p); nf.push(prev + s); keys.push(key);
        }
      }
      if (!nx.length) break;
      const base = k * BEAM;
      if (nx.length <= BEAM) {
        for (let i = 0; i < nx.length; i++) { bx[base + i] = nx[i]; bp[base + i] = np[i]; from[base + i] = nf[i]; }
        count[k] = nx.length;
      } else {
        const order = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b]);
        for (let i = 0; i < BEAM; i++) {
          const j = order[Math.floor(i * nx.length / BEAM)];
          bx[base + i] = nx[j]; bp[base + i] = np[j]; from[base + i] = nf[j];
        }
        count[k] = BEAM;
      }
    }
    const last = k - 1;
    let pick = last * BEAM;
    if (last === n - 1) {
      let best = Infinity;
      for (let s = 0; s < count[last]; s++) {
        const score = this.comfort(last, bp[last * BEAM + s]);
        if (score < best) { best = score; pick = last * BEAM + s; }
      }
    }
    for (let i = pick, j = last; j >= 0; i = from[i], j--) { this.path[j] = bp[i]; this.xs[j] = bx[i]; }
    return last;
  }

  /** Lower is more comfortable: the index of the most comfortable tier whose viability set at
   * point k holds p (TIERS.length when none does), less how deep inside that set p lies. */
  private comfort(k: number, p: number): number {
    const j0 = this.first + k - 1, b = j0 * MAX_SPANS;
    for (let t = 0; t < TIERS.length; t++) {
      const sets = this.window.viable[t];
      for (let j = 0; j < sets.count[j0]; j++) {
        const inside = Math.min(p - sets.lo[b + j], sets.hi[b + j] - p);
        if (inside >= 0) return t + 1 - Math.min(1, inside) * .999;
      }
    }
    return TIERS.length + 1;
  }

  /** Greedy line with exact x, repaired where x fails: p is pushed toward the side x needs over
   * the two lags before the failure (where x is mostly decided), and the line re-run from there.
   * Returns the last point reached. */
  private shoot(x0: number, p0: number, margin: number, n: number): number {
    const path = this.path, xs = this.xs, lower = this.lower, upper = this.upper;
    lower.fill(-Infinity, 0, n); upper.fill(Infinity, 0, n);
    path[0] = p0; xs[0] = x0;
    let from = 1, deepest = 0;
    for (let repair = 0; ; repair++) {
      let k = from, tried = 0;
      for (; k < n; k++) {
        const base = path[k - 1] + this.shift[k], all = this.reach[HARD][k] + 1e-7;
        const want = clamp(this.settle(k, base), lower[k], upper[k]), p = tried = clamp(want, base - all, base + all);
        // A bound out of reach is met as far as possible, and moves the repair earlier.
        if (p !== want) { this.needSide = Math.sign(want - p); this.needBy = Math.abs(want - p); break; }
        const x = this.follow(k, xs[k - 1], path[k - 1], p, 1);
        if (!this.clear(k, xs[k - 1], path[k - 1], p, x, margin)) break;
        path[k] = p; xs[k] = x;
      }
      if (k - 1 > deepest) { deepest = k - 1; this.best.set(path.subarray(0, k)); }
      if (k === n) return n - 1;
      if (repair >= REPAIRS) break;
      const back = this.at[k] - 2 * LAG * this.speed[k], by = 1.2 * this.needBy + .005;
      let j = k;
      while (j > 1 && this.at[j - 1] >= back) j--;
      for (let i = j; i <= k; i++) {
        const ref = i < k ? path[i] : tried;
        if (this.needSide > 0) lower[i] = Math.max(lower[i], ref + by); else upper[i] = Math.min(upper[i], ref - by);
      }
      from = j;
    }
    path.set(this.best.subarray(0, deepest + 1));
    return deepest;
  }

  /** Depth-first search for a line through all n points; returns the last point reached (the
   * line in `path` runs that far). */
  private search(x0: number, p0: number, margin: number, n: number): number {
    const path = this.path, xs = this.xs, pick = this.pick, cand = this.cand;
    path[0] = p0; xs[0] = x0;
    let i = 0, deepest = 0, budget = BUDGET * n;
    if (n > 1) this.start(1);
    while (i < n - 1) {
      const k = i + 1;
      let advanced = false;
      for (;;) {
        if (pick[k] >= this.candN[k]) { if (this.full[k]) break; this.fallbacks(k); continue; }
        if (budget-- <= 0) break;
        const p = cand[k * MAX_CANDS + pick[k]], x = this.follow(k, xs[i], path[i], p, 1);
        if (this.clear(k, xs[i], path[i], p, x, margin)) {
          path[k] = p; xs[k] = x; i = k;
          if (k + 1 < n) this.start(k + 1);
          advanced = true;
          break;
        }
        pick[k]++;
      }
      if (advanced) {
        if (i > deepest) { deepest = i; this.best.set(path.subarray(0, i + 1)); }
        continue;
      }
      if (budget <= 0 || i === 0) break;
      // Every continuation from point i failed: try its next candidate.
      pick[i]++;
      i--;
    }
    if (i < n - 1) path.set(this.best.subarray(0, deepest + 1));
    return i === n - 1 ? i : deepest;
  }

  /** Exact x after fraction f of the step to point k, while p moves linearly from p0 to p1. */
  private follow(k: number, x0: number, p0: number, p1: number, f: number): number {
    const dt = (this.at[k] - this.at[k - 1]) / this.speed[k], drift = BANK_DRIFT * Math.sin(this.bank[k - 1]);
    const slope = dt > 0 ? (p1 - p0) / dt : 0, decay = Math.exp(-f * dt / LAG);
    return p0 + slope * f * dt - LAG * slope + LAG * drift + (x0 - p0 + LAG * slope - LAG * drift) * decay;
  }

  /** x at point k is on the road, and the step to it from x0 at point k − 1 (checked as two
   * chords through the exact midpoint) keeps the ball's centre c from every block's footprint:
   * with square corners on the comfortable pass, and round ones (the ball is a sphere) on the bare pass. */
  private clear(k: number, x0: number, p0: number, p1: number, x: number, margin: number): boolean {
    const w = this.window, j = this.first + k - 1, c = X_MARGINS[margin].clear, a = this.segment[0], b = this.segment[1], m = this.segment[2];
    const halfRoad = w.roadW[j] / 2 - (w.roadT[j] ? RADIUS : X_MARGINS[margin].edge), off = x - w.roadC[j];
    if (Math.abs(off) > halfRoad) { this.needSide = -Math.sign(off); this.needBy = Math.abs(off) - halfRoad; return false; }
    if (!w.nearCount[j]) return true;
    a[0] = x0; a[1] = this.at[k - 1]; b[0] = x; b[1] = this.at[k];
    m[0] = this.follow(k, x0, p0, p1, .5); m[1] = (a[1] + b[1]) / 2;
    for (let i = 0; i < w.nearCount[j]; i++) {
      const block = w.blocks[w.near[j * MAX_SPANS + i]];
      this.box[0] = (block.lo + block.hi) / 2; this.box[1] = (block.from + block.to) / 2;
      const square = margin === 0 ? c : 0, round = c - square;
      this.half[0] = (block.hi - block.lo) / 2 + square; this.half[1] = (block.to - block.from) / 2 + square;
      if (sweepSphereBox(a, m, this.box, this.half, round) || sweepSphereBox(m, b, this.box, this.half, round)) {
        // Leave by the nearer side that is on the road.
        const left = block.lo - c - .01, right = block.hi + c + .01, onRoad = (v: number) => Math.abs(v - w.roadC[j]) <= halfRoad;
        const goLeft = onRoad(left) && (!onRoad(right) || x - left <= right - x);
        this.needSide = goLeft ? -1 : 1;
        this.needBy = Math.max(.03, goLeft ? x - left : right - x);
        return false;
      }
    }
    return true;
  }
  private readonly segment = [[0, 0], [0, 0], [0, 0]];
  private readonly box = [0, 0];
  private readonly half = [0, 0];

  /** The first candidate at point k: the most comfortable viable choice. */
  private start(k: number): void {
    this.cand[k * MAX_CANDS] = this.settle(k, this.path[k - 1] + this.shift[k]);
    this.candN[k] = 1; this.full[k] = 0; this.pick[k] = 0;
  }

  /** Fallback candidates at point k, after the first: the middle and ends of every viable
   * corridor in reach, then straight on and the reach limits (0.85 of the lateral authority). */
  private fallbacks(k: number): void {
    const base = this.path[k - 1] + this.shift[k], r = this.reach[HARD][k] + 1e-7, j0 = this.first + k - 1, b = j0 * MAX_SPANS;
    for (const sets of this.window.viable) for (let j = 0; j < sets.count[j0]; j++) {
      const lo = Math.max(sets.lo[b + j], base - r), hi = Math.min(sets.hi[b + j], base + r);
      if (lo > hi) continue;
      this.add(k, clamp((sets.lo[b + j] + sets.hi[b + j]) / 2, lo, hi)); this.add(k, lo); this.add(k, hi);
    }
    this.add(k, base); this.add(k, base - r); this.add(k, base + r);
    this.full[k] = 1;
  }

  private add(k: number, p: number): void {
    const o = k * MAX_CANDS, m = this.candN[k];
    if (m >= MAX_CANDS) return;
    for (let j = 0; j < m; j++) if (Math.abs(this.cand[o + j] - p) < .005) return;
    this.cand[o + m] = p;
    this.candN[k] = m + 1;
  }

  /** Within the last tier's reach of p, the point toward the middle of the nearest corridor of
   * the most comfortable tier that has one in reach. */
  private settle(k: number, p: number): number {
    const j0 = this.first + k - 1, b = j0 * MAX_SPANS, reach = this.reach[HARD][k] + 1e-7;
    for (let t = 0; t < TIERS.length; t++) {
      const sets = this.window.viable[t], r = this.reach[t][k], count = sets.count[j0];
      let nearest = -1, gap = Infinity;
      for (let j = 0; j < count; j++) {
        const g = Math.max(0, sets.lo[b + j] - p, p - sets.hi[b + j]);
        if (g < gap) { gap = g; nearest = j; }
      }
      if (nearest < 0 || gap > reach) continue;
      const q = p + clamp((sets.lo[b + nearest] + sets.hi[b + nearest]) / 2 - p, -r, r);
      let best = NaN, miss = Infinity;
      for (let j = 0; j < count; j++) {
        const lo = Math.max(sets.lo[b + j], p - reach), hi = Math.min(sets.hi[b + j], p + reach);
        if (lo > hi) continue;
        const x = clamp(q, lo, hi);
        if (Math.abs(x - q) < miss) { miss = Math.abs(x - q); best = x; }
      }
      if (!Number.isNaN(best)) return best;
    }
    return p;
  }

  /** The planned line at a distance (linear between points). */
  lineAt(d: number): number {
    const at = this.at, n = this.n;
    if (d <= at[0] || n < 2) return this.path[0];
    if (d >= at[n - 1]) return this.path[n - 1];
    let i = this.cursor;
    if (at[i] > d) i = 0;
    while (i + 1 < n && at[i + 1] <= d) i++;
    this.cursor = i;
    const t = (d - at[i]) / (at[i + 1] - at[i] || 1);
    return this.path[i] + (this.path[i + 1] - this.path[i]) * t;
  }
}

/** A line through n points (at, path) at distance d: linear between points, flat beyond them. */
function interpolate(at: Float64Array, path: Float64Array, n: number, d: number): number {
  if (d <= at[0] || n < 2) return path[0];
  if (d >= at[n - 1]) return path[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = lo + hi >> 1; if (at[mid] <= d) lo = mid; else hi = mid; }
  return path[lo] + (path[hi] - path[lo]) * (d - at[lo]) / (at[hi] - at[lo] || 1);
}

/** Statistics from the last driveBot call, for diagnosing a failure. */
export const botStats = { plans: 0, failedPlans: 0 };

/** Drives a running run with the look-ahead bot until it has travelled `metres` or stops
 * running, calling `observe` after every step. Mutates and returns the same run. */
export function driveBot(run: Run, metres: number, observe?: (run: Run) => void): { run: Run; steps: number } {
  const course = getCourse(run.seed, run.difficulty), planner = new Planner(), target = run.distance + metres, sample = blankSample();
  botStats.plans = botStats.failedPlans = 0;
  let steps = 0;
  while (run.phase === 'running' && run.distance < target) {
    if (steps % REPLAN === 0) {
      botStats.plans++;
      if (!planner.plan(run, course)) botStats.failedPlans++;
    }
    // p moves at exactly the commanded lateral speed plus drift: put it on the line after this step.
    const v = runSpeed(run), p = run.x + LAG * run.vx, drift = BANK_DRIFT * Math.sin(course.sample(run.distance, sample).bank);
    step(run, clamp(((planner.lineAt(run.distance + v * STEP) - p) / STEP - drift) / lateralSpeed(v), -1, 1), STEP);
    steps++;
    observe?.(run);
  }
  return { run, steps };
}
