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
//
// Under the model's analytic steering the lag-free position p = x + vx / STEER_RESPONSE moves at
// exactly the commanded lateral speed plus bank drift, and x follows p as a LAG-second
// exponential average (x' = (p − x) / LAG + drift). So the bot plans a line for p, which it can
// follow exactly, and checks the exact x that line produces.
//
// 1. Viability: interval sets of p from which the end of a window of road can still be reached,
//    by backward reachability with a fraction of the real lateral authority, in three tiers from
//    comfortable to bare. A constraint on x at distance D applies to p at D − v·LAG (x trails p by
//    about LAG), shifted against the drift. These depend only on the course, so each window is
//    computed once and shared by every re-plan inside it.
// 2. Line: every REPLAN steps a depth-first search from the ball's state picks p point by point,
//    the most comfortable viable choice first, and rejects any choice whose exact x leaves the
//    road or touches a block (sliding blocks close their whole sweep); dead ends backtrack.
// 3. Control: the input puts p back on the line after every step.

/** Viability tiers, most comfortable first. The middle one is the generator's own reach safety and
 * clearances; the last relies on 0.85 of the real lateral authority with bare clearances. */
const TIERS = [
  { authority: .55, clear: RADIUS + .16, edge: EDGE_SUPPORT + .16 },
  { authority: .7, clear: RADIUS + .06, edge: EDGE_SUPPORT + .12 },
  { authority: .85, clear: RADIUS + .02, edge: EDGE_SUPPORT + .03 },
] as const;
const HARD = TIERS.length - 1;
/** Margins for the exact x of a searched line: comfortable, then bare. */
const X_MARGINS = [{ clear: RADIUS + .05, edge: EDGE_SUPPORT + .05 }, { clear: RADIUS + .01, edge: EDGE_SUPPORT + .01 }] as const;
const REPLAN = 6;
/** Steering lag (s): x trails p by about this long. */
const LAG = 1 / STEER_RESPONSE;
/** Search budget: candidates tried per point. */
const BUDGET = 40;
/** The exact search looks this far ahead (s, at least SEARCH_MIN m); the viability sets cover the rest of the horizon. */
const SEARCH = 2.5, SEARCH_MIN = 50;
const MAX_POINTS = 4096, MAX_SPANS = 32, MAX_CANDS = 16;

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

export class Planner {
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
    // Comfortable margins first, then bare ones; keep whichever line runs further.
    const x0 = run.x, p0 = run.x + LAG * run.vx;
    let reached = this.search(x0, p0, 0, n);
    if (reached < n - 1) {
      const keep = this.path.slice(0, reached + 1), strict = reached;
      reached = this.search(x0, p0, 1, n);
      if (reached < strict) { this.path.set(keep); reached = strict; }
    }
    this.n = reached + 1;
    this.cursor = 0;
    return reached === n - 1;
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
   * chords through the exact midpoint) keeps the ball's centre c from every block's footprint
   * (the ball is a sphere, so corners are rounded). */
  private clear(k: number, x0: number, p0: number, p1: number, x: number, margin: number): boolean {
    const w = this.window, j = this.first + k - 1, c = X_MARGINS[margin].clear, a = this.segment[0], b = this.segment[1], m = this.segment[2];
    if (Math.abs(x - w.roadC[j]) > w.roadW[j] / 2 - (w.roadT[j] ? RADIUS : X_MARGINS[margin].edge)) return false;
    if (!w.nearCount[j]) return true;
    a[0] = x0; a[1] = this.at[k - 1]; b[0] = x; b[1] = this.at[k];
    m[0] = this.follow(k, x0, p0, p1, .5); m[1] = (a[1] + b[1]) / 2;
    for (let i = 0; i < w.nearCount[j]; i++) {
      const block = w.blocks[w.near[j * MAX_SPANS + i]];
      this.box[0] = (block.lo + block.hi) / 2; this.box[1] = (block.from + block.to) / 2;
      this.half[0] = (block.hi - block.lo) / 2; this.half[1] = (block.to - block.from) / 2;
      if (sweepSphereBox(a, m, this.box, this.half, c) || sweepSphereBox(m, b, this.box, this.half, c)) return false;
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
   * corridor in reach, then the reach limits, then (as a last resort) the full lateral authority. */
  private fallbacks(k: number): void {
    const base = this.path[k - 1] + this.shift[k], r = this.reach[HARD][k] + 1e-7, j0 = this.first + k - 1, b = j0 * MAX_SPANS;
    for (const sets of this.window.viable) for (let j = 0; j < sets.count[j0]; j++) {
      const lo = Math.max(sets.lo[b + j], base - r), hi = Math.min(sets.hi[b + j], base + r);
      if (lo > hi) continue;
      this.add(k, clamp((sets.lo[b + j] + sets.hi[b + j]) / 2, lo, hi)); this.add(k, lo); this.add(k, hi);
    }
    const all = lateralSpeed(this.speed[k]) * (this.at[k] - this.at[k - 1]) / this.speed[k] - 1e-9;
    this.add(k, base); this.add(k, base - r); this.add(k, base + r); this.add(k, base - all); this.add(k, base + all);
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
