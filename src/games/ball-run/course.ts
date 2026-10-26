/** Seeded Ball Run course. The road is a sequence of segments and the obstacles a
 * sequence of rows; each comes from its own PRNG stream and is generated lazily and
 * strictly in order, so a seed and difficulty give the same course however it is
 * queried. A row is kept only if interval reachability, using the ball's real
 * lateral authority scaled by REACH_SAFETY, still leaves a route through it. A point
 * mass run along the road as it is built predicts every flight off a crest, dip or
 * drop; blocks and gate entrances stay out of each one. */
import {
  BANK_DRIFT, CENTER_LIMIT, CONFIG, DIFFICULTIES, EDGE_SUPPORT, GRAVITY, RADIUS, REACH_SAFETY, SLOPE, STEP, WARMUP,
  lateralSpeed, speedAt,
  type Course, type Difficulty, type DifficultyConfig, type Gate, type Obstacle, type ObstaclePose, type PatternKind,
  type SegmentKind, type TrackSample,
} from './config';

export interface CourseObstacle extends Obstacle {
  /** The row (one placed pattern) this block belongs to, counted in course order. */
  readonly row: number;
}

/** Lateral metres the generator relies on the ball covering over `metres` of track at `speed`. */
export function reachStep(speed: number, metres: number): number {
  return REACH_SAFETY * lateralSpeed(speed) * metres / speed;
}

const ROAD_AHEAD = 400, ROWS_AHEAD = 300, LOOK_AHEAD = 300, CACHE_SIZE = 6, ATTEMPTS = 6;
/** Ball-centre clearance from a box face, and the margin kept inside the road edge. */
const CLEAR = RADIUS + .06, EDGE_MARGIN = EDGE_SUPPORT + .12;
/** Narrowest reachable set allowed beside any block. */
const MIN_ROUTE = .25;
/** Least time from a row's last block to the next row: the tightest spacing inside a pattern. */
const ROW_SPACING = .525;
const GATE_LENGTH = 30, STRAIGHT_RISE = .3;
/** Crests and dips are low enough that the road launches a ball at most this fast upward off the base
 * slope (m/s): under about a second in the air (it leaves the road partway up). Never lower than
 * CREST_LEAST / DIP_LEAST (m). */
const LAUNCH_SPEED = 8, CREST_LEAST = 1, DIP_LEAST = .6;
/** Block-free road before a predicted take-off and after its landing (m), and what the prediction
 * allows a real ball (another step phase, steering on a bank) on either side (m). */
const FLIGHT_BEFORE = 5, FLIGHT_AFTER = 12, FLIGHT_MARGIN = 1;
/** The shortest run-out that defers a due gate past a flight (m). */
const RUN_OUT = 5;

type Drawn = Exclude<SegmentKind, 'warmup' | 'gate'>;
const DRAWN: readonly Drawn[] = ['straight', 'bend', 'offset', 'ribbon', 'ribbonBend', 'bank', 'crest', 'dip', 'drop'];
const LENGTH: Readonly<Record<Exclude<Drawn, 'drop'>, readonly [number, number]>> = {
  straight: [24, 48], bend: [40, 70], offset: [18, 28], ribbon: [40, 70], ribbonBend: [50, 80], bank: [30, 50], crest: [30, 60], dip: [30, 50],
};
const PATTERNS: readonly PatternKind[] = ['single', 'pair', 'gate', 'doubleGate', 'slalom', 'zigzag', 'scatter', 'slider', 'wallRun', 'bigBlock'];
const MAX_DEPTH: Readonly<Record<PatternKind, number>> = {
  single: 1.6, pair: 1.6, gate: 1.2, doubleGate: 1.2, slalom: 1.4, zigzag: 1.2, scatter: .9, slider: 1.3, wallRun: 14, bigBlock: 3,
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
const smoother = (t: number) => t * t * t * (t * (6 * t - 15) + 10);
const smootherSlope = (t: number) => 30 * t * t * (t - 1) * (t - 1);
const ribbonEase = (t: number) => t < .25 ? smooth(t * 4) : t > .75 ? smooth((1 - t) * 4) : 1;
const blankSample = (): TrackSample => ({ center: 0, width: 0, elevation: 0, gradient: 0, bank: 0, ground: true, tunnel: false, kind: 'warmup', segment: 0 });
/** Smootherstep's steepest downward curvature, 10/√3, rounded up: a drop's approach of length a rising h
 * curves down at most this × h/a². */
const APPROACH_BEND = 5.78;

function hash(a: number, b: number): number {
  let h = (a ^ Math.imul(b + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ h >>> 16, 0x21f0aaad);
  h = Math.imul(h ^ h >>> 15, 0x735a2d97);
  return (h ^ h >>> 15) >>> 0;
}

/** mulberry32. */
class Random {
  private state: number;
  constructor(seed: number) { this.state = seed >>> 0; }
  next(): number {
    let t = this.state = this.state + 0x6d2b79f5 | 0;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
  int(lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  sign(): number { return this.next() < .5 ? -1 : 1; }
}

/** Sorted, disjoint world-x intervals for the ball centre, in a fixed buffer. */
class Intervals {
  readonly v = new Float64Array(256);
  n = 0;
  set(lo: number, hi: number): void { this.v[0] = lo; this.v[1] = hi; this.n = lo <= hi ? 1 : 0; }
  copy(from: Intervals): void { for (let i = 0; i < 2 * from.n; i++) this.v[i] = from.v[i]; this.n = from.n; }
  cut(lo: number, hi: number, tmp: Intervals): void {
    const v = this.v, t = tmp.v;
    let k = 0;
    for (let i = 0; i < 2 * this.n; i += 2) {
      const a = v[i], b = v[i + 1];
      if (b <= lo || a >= hi) { t[k++] = a; t[k++] = b; continue; }
      if (a < lo) { t[k++] = a; t[k++] = lo; }
      if (b > hi) { t[k++] = hi; t[k++] = b; }
    }
    tmp.n = k / 2;
    this.copy(tmp);
  }
  /** Drops openings narrower than `min`: a gap under the minimum is not a route. */
  prune(min: number): void {
    const v = this.v;
    let k = 0;
    for (let i = 0; i < 2 * this.n; i += 2) if (v[i + 1] - v[i] >= min) { v[k++] = v[i]; v[k++] = v[i + 1]; }
    this.n = k / 2;
  }
  /** this ← ((this + shift) dilated by r) ∩ allowed. */
  advance(shift: number, r: number, allowed: Intervals, tmp: Intervals): void {
    const v = this.v, t = tmp.v, w = allowed.v;
    let k = 0;
    for (let i = 0; i < 2 * this.n; i += 2) {
      const lo = v[i] + shift - r, hi = v[i + 1] + shift + r;
      if (k && lo <= t[k - 1]) { if (hi > t[k - 1]) t[k - 1] = hi; } else { t[k++] = lo; t[k++] = hi; }
    }
    const nt = k;
    k = 0;
    for (let i = 0, j = 0; i < nt && j < 2 * allowed.n;) {
      const lo = Math.max(t[i], w[j]), hi = Math.min(t[i + 1], w[j + 1]);
      if (lo <= hi) { v[k++] = lo; v[k++] = hi; }
      if (t[i + 1] < w[j + 1]) i += 2; else j += 2;
    }
    this.n = k / 2;
  }
  meets(lo: number, hi: number): boolean { for (let i = 0; i < 2 * this.n; i += 2) if (this.v[i] <= hi && this.v[i + 1] >= lo) return true; return false; }
}

/** Obstacle-free zones, flat [start, end, ...], sorted and merged, read through a cursor that only moves forward. */
class Zones {
  private readonly z: number[] = [];
  private at = 0;
  /** Zones arrive in order of their start. */
  add(lo: number, hi: number): void {
    const z = this.z, n = z.length;
    if (n && lo <= z[n - 1]) z[n - 1] = Math.max(z[n - 1], hi);
    else z.push(lo, hi);
  }
  /** End of the zone containing d, or -1. d never decreases between calls. */
  end(d: number): number {
    const z = this.z;
    while (this.at < z.length && z[this.at + 1] <= d) this.at += 2;
    return this.at < z.length && z[this.at] <= d ? z[this.at + 1] : -1;
  }
  /** Start of the first zone not yet passed (after end(d) found d outside every zone: the next one past d). */
  next(): number { return this.at < this.z.length ? this.z[this.at] : Infinity; }
  /** End of the last zone, or -Infinity. */
  last(): number { return this.z.length ? this.z[this.z.length - 1] : -Infinity; }
}

/** A point-mass ball the generator runs along the road's centre line at the course speed, with the
 * simulation's fixed step and lift-off rule, to predict where a real ball flies. */
interface Ghost {
  d: number;
  /** Ball-centre height and vertical speed. */
  h: number;
  vy: number;
  grounded: boolean;
  /** Where the current flight left the road (last grounded distance). */
  takeoff: number;
}

interface Segment {
  readonly kind: SegmentKind;
  readonly index: number;
  readonly start: number;
  readonly end: number;
  /** Centre at the start and at the end (they differ only for offsets). */
  readonly c0: number;
  readonly c1: number;
  /** Sway (bend, ribbonBend), local rise (straight, crest, dip, drop lip) or roll (bank). */
  readonly amp: number;
  /** Drop: approach to the lip, then the gap. */
  readonly approach: number;
  readonly gap: number;
}

function shape(seg: Segment, d: number, roadWidth: number, ribbonWidth: number, out: TrackSample): TrackSample {
  const length = seg.end - seg.start, u = d - seg.start, t = clamp(u / length, 0, 1);
  let center = seg.c0, width = roadWidth, local = 0, slope = 0, bank = 0, ground = true;
  switch (seg.kind) {
    case 'straight': case 'crest': case 'dip': {
      const s = Math.sin(Math.PI * t);
      local = seg.amp * s * s;
      slope = seg.amp * Math.PI / length * Math.sin(2 * Math.PI * t);
      break;
    }
    case 'bend': center += seg.amp * Math.sin(2 * Math.PI * t); break;
    case 'offset': center += (seg.c1 - seg.c0) * smooth(t); break;
    case 'ribbon': width += (ribbonWidth - roadWidth) * ribbonEase(t); break;
    case 'ribbonBend':
      center += seg.amp * Math.sin(2 * Math.PI * t);
      width += (ribbonWidth - roadWidth) * ribbonEase(t);
      break;
    case 'bank': { const s = Math.sin(Math.PI * t); bank = seg.amp * s * s; break; }
    case 'drop':
      if (u < seg.approach) {
        const a = clamp(u / seg.approach, 0, 1);
        local = seg.amp * smoother(a);
        slope = seg.amp * smootherSlope(a) / seg.approach;
      } else if (u < seg.approach + seg.gap) ground = false;
      break;
  }
  out.center = center;
  out.width = width;
  out.elevation = -SLOPE * d + local;
  out.gradient = -SLOPE + slope;
  out.bank = bank;
  out.ground = ground;
  out.tunnel = seg.kind === 'gate';
  out.kind = seg.kind;
  out.segment = seg.index;
  return out;
}

/** A candidate block while its row is being tested. */
interface Draft {
  pattern: PatternKind;
  distance: number;
  offset: number;
  width: number;
  height: number;
  depth: number;
  slide: Obstacle['slide'];
  roadX: number; roadY: number; bank: number; sin: number; cos: number; tan: number;
  sink: number; lift: number;
  /** Depth span and world-x footprint (whole sweep) widened by the ball clearance. */
  from: number; to: number; lo: number; hi: number;
}

/** Stored block: the road under its centre is fixed, so poses need no track lookup. */
interface Block extends CourseObstacle {
  readonly roadX: number;
  readonly roadY: number;
  readonly bank: number;
  readonly sin: number;
  readonly cos: number;
  readonly tan: number;
  /** Extra box height below and above, so the box meets the road along its whole footprint. */
  readonly sink: number;
  readonly lift: number;
}

class CourseImpl implements Course {
  readonly maxDepth: number;
  private readonly cfg: DifficultyConfig;
  private readonly roadRandom: Random;
  private readonly rowRandom: Random;
  private readonly patternTotal: number;
  private readonly gapRoute: number;
  /** Each drawn kind's share of CONFIG.segments, and the scheduler's running credit per kind. */
  private readonly share = new Float64Array(DRAWN.length);
  private readonly credit = new Float64Array(DRAWN.length);

  private readonly segments: Segment[] = [];
  private readonly gateStarts: number[] = [];
  private readonly gates: Gate[] = [];
  /** Obstacle-free zones from the road's segments, and around every predicted flight. */
  private readonly zones = new Zones();
  private readonly flightZones = new Zones();
  /** The flight predictor: it has run over all the road built so far, but for its last step. */
  private readonly ghost: Ghost = { d: 0, h: 0, vy: 0, grounded: true, takeoff: 0 };
  private roadEnd = 0;
  private sinceGate = 0;
  private gateDue: number;
  private hint = 0;

  private readonly blocks: Block[] = [];
  private rowCursor = WARMUP + 10;
  private rowCount = 0;
  private rowsSinceRest = 0;
  private restDue: number;
  /** Exact reachable set at frontierAt; no obstacle has yet been placed past it. */
  private frontierAt = 0;
  private readonly frontier = new Intervals();
  private readonly work = new Intervals();
  private readonly allowed = new Intervals();
  private readonly tmp = new Intervals();
  private readonly snapshot = new Intervals();
  private snapshotAt = 0;
  private readonly events: number[] = [];
  /** Backward-reachable [lo, hi] per metre of one segment, and which segment it holds. */
  private reach = new Float64Array(1024);
  private reachOf = -1;

  private readonly probe = blankSample();
  private readonly lookup = blankSample();
  private readonly scratch = blankSample();
  private readonly ghostSample = blankSample();
  /** fly()'s own sample of the road where a ghost step ends: no other ghostRest() call writes it. */
  private readonly ghostAhead = blankSample();

  constructor(readonly seed: number, readonly difficulty: Difficulty) {
    const cfg = this.cfg = CONFIG[difficulty], index = DIFFICULTIES.indexOf(difficulty);
    this.roadRandom = new Random(hash(seed, 2 * index + 11));
    this.rowRandom = new Random(hash(seed, 2 * index + 12));
    this.gateDue = this.roadRandom.range(cfg.gate.interval[0], cfg.gate.interval[1]);
    this.restDue = this.rowRandom.int(cfg.restEvery[0], cfg.restEvery[1]);
    const segmentTotal = DRAWN.reduce((sum, kind) => sum + cfg.segments[kind], 0);
    DRAWN.forEach((kind, i) => { this.share[i] = cfg.segments[kind] / segmentTotal; });
    let total = 0, depth = 0;
    for (const kind of PATTERNS) if (cfg.patterns[kind] > 0) { total += cfg.patterns[kind]; depth = Math.max(depth, MAX_DEPTH[kind]); }
    this.patternTotal = total;
    this.maxDepth = depth;
    this.gapRoute = cfg.minGap - 2 * CLEAR - 1e-6;
    const half = cfg.roadWidth / 2 - EDGE_MARGIN;
    this.frontier.set(-half, half);
  }

  sample(distance: number, out: TrackSample = blankSample()): TrackSample {
    const d = distance > 0 && distance < Infinity ? distance : 0;
    this.ensureRoad(d);
    return shape(this.find(d), d, this.cfg.roadWidth, this.cfg.ribbonWidth, out);
  }

  surfaceHeight(distance: number, x: number): number {
    const s = this.sample(distance, this.scratch);
    return s.elevation - (x - s.center) * Math.tan(s.bank);
  }

  forEachObstacle(from: number, to: number, fn: (obstacle: Obstacle) => void): void {
    if (!(to >= 0 && to < Infinity)) return;
    this.ensureRows(to);
    const list = this.blocks, half = this.maxDepth / 2, start = from - half;
    let lo = 0, hi = list.length;
    while (lo < hi) { const mid = lo + hi >> 1; if (list[mid].distance < start) lo = mid + 1; else hi = mid; }
    for (let i = lo; i < list.length; i++) {
      const o = list[i];
      if (o.distance - half > to) break;
      if (o.distance - o.depth / 2 <= to && o.distance + o.depth / 2 >= from) fn(o);
    }
  }

  pose(obstacle: Obstacle, elapsed: number, out: ObstaclePose): ObstaclePose {
    const o = obstacle as Block, s = o.slide;
    const u = o.offset + (s ? s.amplitude * Math.sin(2 * Math.PI * elapsed / s.period + s.phase) : 0);
    const n = (o.height + o.lift - o.sink) / 2;
    out.x = o.roadX + u + o.sin * n;
    out.y = o.roadY - u * o.tan + o.cos * n;
    out.distance = o.distance;
    out.roll = o.bank;
    out.halfWidth = o.width / 2;
    out.halfHeight = (o.height + o.sink + o.lift) / 2;
    out.halfDepth = o.depth / 2;
    return out;
  }

  forEachGate(from: number, to: number, fn: (gate: Gate) => void): void {
    if (!(to >= 0 && to < Infinity)) return;
    this.ensureRoad(to);
    for (const gate of this.gates) {
      if (gate.start > to) break;
      if (gate.end >= from) fn(gate);
    }
  }

  gatesBefore(distance: number): number {
    if (!(distance >= 0 && distance < Infinity)) return 0;
    this.ensureRoad(distance);
    return this.countGates(distance);
  }

  speed(distance: number): number {
    return speedAt(this.difficulty, distance, this.gatesBefore(distance));
  }

  // Road -------------------------------------------------------------------

  private ensureRoad(d: number): void {
    while (this.roadEnd < d + ROAD_AHEAD) this.addSegment();
  }

  private find(d: number): Segment {
    const segs = this.segments;
    let i = this.hint;
    if (d >= segs[i].start && d < segs[i].end) return segs[i];
    if (++i < segs.length && d >= segs[i].start && d < segs[i].end) { this.hint = i; return segs[i]; }
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) { const mid = lo + hi + 1 >> 1; if (segs[mid].start <= d) lo = mid; else hi = mid - 1; }
    this.hint = lo;
    return segs[lo];
  }

  private countGates(d: number): number {
    const s = this.gateStarts;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = lo + hi >> 1; if (s[mid] <= d) lo = mid + 1; else hi = mid; }
    return lo;
  }

  /** course.speed without generation: valid for distances already generated. */
  private speedNow(d: number): number {
    return speedAt(this.difficulty, d, this.countGates(d));
  }

  /** Running time over [from, to] at the current gate count (no gate starts inside). */
  private runTime(from: number, to: number): number {
    const c = this.cfg, k = c.gate.speedGain * this.gateStarts.length, a = c.acceleration, v0 = c.startSpeed, cap = c.maxSpeed;
    const capAt = cap - k <= v0 ? 0 : ((cap - k) ** 2 - v0 * v0) / (2 * a);
    // ∫ dd / (u + k) with u = sqrt(v0² + 2ad) is (u − k·ln(u + k)) / a.
    const f = (d: number) => { const u = Math.sqrt(v0 * v0 + 2 * a * d); return (u - k * Math.log(u + k)) / a; };
    let t = 0;
    const ramp = Math.min(to, capAt), flat = Math.max(from, capAt);
    if (ramp > from) t += f(ramp) - f(from);
    if (to > flat) t += (to - flat) / cap;
    return t;
  }

  /** Exact-proportion scheduler: every segment adds each kind's share of CONFIG.segments to its
   * credit and the kind built pays 1, so counts track the weights and no kind waits long. The draw
   * is among positive credits in proportion to credit; after a drop, drop is left out (a redraw).
   * A forced kind (the straight after a gate) pays the same way. */
  private schedule(previous: SegmentKind, forced: Drawn | null): Drawn {
    const credit = this.credit, open = (i: number) => this.share[i] > 0 && !(previous === 'drop' && DRAWN[i] === 'drop');
    let sum = 0, best = -1;
    for (let i = 0; i < DRAWN.length; i++) {
      credit[i] += this.share[i];
      if (!open(i)) continue;
      if (credit[i] > 0) sum += credit[i];
      if (best < 0 || credit[i] > credit[best]) best = i;
    }
    let pick = forced ? DRAWN.indexOf(forced) : Math.max(0, best);
    if (!forced && sum > 0) {
      let x = this.roadRandom.next() * sum;
      for (let i = 0; i < DRAWN.length; i++) if (open(i) && credit[i] > 0 && (x -= credit[i]) < 0) { pick = i; break; }
    }
    credit[pick] -= 1;
    return DRAWN[pick];
  }

  /** A drawn kind was built as another: move the cost so the weights describe the road as built. */
  private recharge(from: Drawn, to: Drawn): Drawn {
    this.credit[DRAWN.indexOf(from)] += 1;
    this.credit[DRAWN.indexOf(to)] -= 1;
    return to;
  }

  private addSegment(): void {
    const cfg = this.cfg, r = this.roadRandom, index = this.segments.length, start = this.roadEnd, previous = this.segments[index - 1];
    const c0 = previous ? previous.c1 : 0;
    const make = (type: SegmentKind, length: number, amp = 0, c1 = c0, approach = 0, gap = 0): Segment =>
      ({ kind: type, index, start, end: start + length, c0, c1, amp, approach, gap });
    let seg: Segment | null = null;
    // Where the road is next clear of predicted flights: past `start` when a flight is over it.
    const clear = previous ? Math.max(this.flightZones.last(), this.flightsOver()) : -Infinity;
    if (!previous) seg = make('warmup', WARMUP);
    // A gate falls due inside a predicted flight: run out flat until past it, then open the gate.
    else if (previous.kind !== 'gate' && this.sinceGate >= this.gateDue && clear > start) {
      seg = make(this.schedule(previous.kind, 'straight'), Math.max(RUN_OUT, clear - start));
    }
    else if (previous.kind !== 'gate' && this.sinceGate >= this.gateDue) {
      this.gateStarts.push(start);
      seg = make('gate', GATE_LENGTH);
      const end = start + GATE_LENGTH;
      this.gates.push({ index: this.gates.length, start, end, clearEnd: end + this.speedNow(end) });
      this.sinceGate = 0;
      this.gateDue = r.range(cfg.gate.interval[0], cfg.gate.interval[1]);
    } else {
      const scale = clamp(this.speedNow(start) / 14, 1, 3.5), room = CENTER_LIMIT - Math.abs(c0);
      let kind = this.schedule(previous.kind, previous.kind === 'gate' ? 'straight' : null);
      // Offsets keep |c| ≤ CENTER_LIMIT − 0.8, so a bend always has room; without it, move toward the centre first.
      if (kind === 'bend' && room < .8 || kind === 'ribbonBend' && room < .6) kind = this.recharge(kind, 'offset');
      // A crest or dip under a flight, or just after its landing, would stretch it or launch the ball
      // again at once (one flight chained onto the next): land the ball on a straight instead.
      if ((kind === 'crest' || kind === 'dip') && clear > start) kind = this.recharge(kind, 'straight');
      if (kind === 'drop') {
        const approach = r.range(20, 30) * scale, height = r.range(2, 4), gap = r.range(2, 4), flight = Math.sqrt(2 * height / GRAVITY);
        // Keep the approach's downward curvature below gravity (with 2% margin), so
        // faster balls launch at the lip instead of grazing the ramp and launching twice.
        // cap * curveTime bounds the distance needed even at top speed; the speed
        // there therefore bounds the lip speed whenever this minimum extends a ramp.
        const curveTime = Math.sqrt(APPROACH_BEND * height / (GRAVITY * .98));
        const minimum = this.speedNow(start + cfg.maxSpeed * curveTime) * curveTime;
        for (let k = 0; k < 3 && !seg; k++) {
          const lip = Math.max(approach * 1.5 ** k, minimum), g = Math.min(gap, this.speedNow(start + lip) * flight - 1.2);
          seg = this.traversable(make('drop', lip + g + Math.max(20, cfg.maxSpeed * flight + 12), height, c0, lip, g));
        }
      } else {
        // Crests and dips keep their length at any speed, so a fast ball leaves the road over them
        // (reference page 04, "drop and flight"); the other kinds stretch with speed. Their height is
        // capped by the speed there instead, so a launch stays short and low.
        const length = r.range(LENGTH[kind][0], LENGTH[kind][1]) * (kind === 'crest' || kind === 'dip' ? 1 : scale);
        const highest = LAUNCH_SPEED * length / (Math.PI * this.speedNow(start + length));
        let amp = 0, c1 = c0;
        if (kind === 'straight') amp = STRAIGHT_RISE;
        else if (kind === 'bend') amp = r.sign() * r.range(.8, Math.min(2, room));
        else if (kind === 'ribbonBend') amp = r.sign() * r.range(.6, Math.min(1.2, room));
        else if (kind === 'bank') amp = r.sign() * r.range(.5, 1) * cfg.maxBank;
        else if (kind === 'crest') amp = Math.min(r.range(1.5, 3.5), Math.max(CREST_LEAST, highest));
        else if (kind === 'dip') amp = -Math.min(r.range(1, 2), Math.max(DIP_LEAST, highest));
        else if (kind === 'offset') {
          // Uniform over [-limit, c0 - 1.2] ∪ [c0 + 1.2, limit], limit = CENTER_LIMIT − 0.8 (from the centre line: ±limit).
          const limit = CENTER_LIMIT - .8, below = Math.max(0, c0 - 1.2 + limit), above = Math.max(0, limit - c0 - 1.2);
          if (below + above > 0) { const pick = r.range(0, below + above); c1 = pick < below ? -limit + pick : c0 + 1.2 + (pick - below); }
          else c1 = r.sign() * limit;
        }
        for (let k = 0; k < 3 && !seg; k++) seg = this.traversable(make(kind, length * 1.5 ** k, amp, c1));
      }
      // A flat straight at constant centre and width is traversable by construction.
      if (!seg) seg = make(this.recharge(kind, 'straight'), r.range(LENGTH.straight[0], LENGTH.straight[1]) * scale, STRAIGHT_RISE);
    }
    this.segments.push(seg);
    this.roadEnd = seg.end;
    this.sinceGate += this.runTime(seg.start, seg.end);
    const length = seg.end - seg.start, zones = this.zones;
    if (seg.kind === 'warmup') zones.add(0, WARMUP);
    else if (seg.kind === 'gate') zones.add(seg.start - 5, this.gates[this.gates.length - 1].clearEnd);
    else if (seg.kind === 'ribbon' || seg.kind === 'ribbonBend') zones.add(seg.start, seg.end);
    else if (seg.kind === 'crest' || seg.kind === 'dip') zones.add(seg.start + .3 * length, seg.start + .7 * length);
    else if (seg.kind === 'drop') {
      // Clear until 12 m past where the ball lands at the speed there (the pad is longer: it fits maxSpeed).
      const lip = seg.start + seg.approach;
      zones.add(lip - 8, lip + this.speedNow(lip) * Math.sqrt(2 * seg.amp / GRAVITY) + 12);
    }
    this.fly(this.ghost, false);
  }

  // Flights ------------------------------------------------------------------

  /** Ball-centre height resting on the centre line at d (or, if `low`, at the low edge of a bank, where a
   * ball that steered there lands last). `at` receives the road sample there; only its `ground` is set
   * beyond the road built so far, where the road continues flat (only asked for by flightsOver's look
   * past the end). */
  private ghostRest(d: number, low = false, at: TrackSample = this.ghostSample): number {
    if (d >= this.roadEnd) { at.ground = true; return -SLOPE * d + RADIUS; }
    const s = shape(this.find(d), d, this.cfg.roadWidth, this.cfg.ribbonWidth, at);
    return s.elevation - (low ? (s.width / 2 - EDGE_SUPPORT) * Math.abs(Math.tan(s.bank)) : 0) + RADIUS / Math.cos(s.bank);
  }

  /** Puts a ghost on the road at d, moving with it. */
  private settle(g: Ghost, d: number): void {
    const v = this.speedNow(d);
    g.d = d;
    g.h = this.ghostRest(d);
    g.vy = (g.h - this.ghostRest(d - v * STEP)) / STEP;
    g.grounded = true;
  }

  /** Where a grounded ghost at d may skip to without passing a take-off: 2 m before the end of the
   * stretch of its segment around d whose road cannot fall away faster than gravity, or d itself if
   * there is none. Only crests (their middle half), dips (their first and last quarters) and drops (the
   * lip, and an approach that curves down too sharply for the speed at its lip) can launch the ball;
   * a drop's pad is flat. The 2 m margins keep the lift-off test's three road samples on that stretch. */
  private calm(seg: Segment, d: number): number {
    const u = d - seg.start, length = seg.end - seg.start;
    let from = 0, to = length;
    if (seg.kind === 'crest') { if (u < length / 4) to = length / 4; else from = 3 * length / 4; }
    else if (seg.kind === 'dip') { from = length / 4; to = 3 * length / 4; }
    else if (seg.kind === 'drop') {
      const v = this.speedNow(seg.start + seg.approach);
      if (u >= seg.approach) from = seg.approach + seg.gap;
      else if (seg.amp * APPROACH_BEND * v * v < GRAVITY * seg.approach * seg.approach) to = seg.approach;
      else return d;
    }
    return u >= from + 2 && u < to - 2 ? seg.start + to - 2 : d;
  }

  /** Runs a ghost over the road built so far (and, if `flat`, on along flat road until it is on the
   * road again 2 m past the end), as model.step moves a ball on the centre line: it stays on the road
   * unless the road falls away faster than gravity can follow, or ends, and lands where the lowest
   * point across the road meets it. Each flight it finishes adds its clear zone; the furthest end of
   * those zones is returned. Where the road cannot launch it (calm()), a grounded ghost skips ahead. */
  private fly(g: Ghost, flat: boolean): number {
    let furthest = -Infinity;
    for (;;) {
      const seg = this.find(g.d);
      if (flat && g.grounded && g.d >= this.roadEnd + 2) return furthest;
      if (g.grounded) { const to = this.calm(seg, g.d); if (to > g.d) { this.settle(g, to); continue; } }
      const v = this.speedNow(g.d), d0 = g.d, d1 = d0 + v * STEP;
      if (!flat && d1 >= this.roadEnd) return furthest;
      const fall = g.h + g.vy * STEP - GRAVITY * STEP * STEP / 2;
      g.d = d1;
      if (g.grounded) {
        // It leaves the road where the road ends, or where the road falls away faster than gravity and
        // below where the ghost would fall (the road is sampled behind only then).
        const rest0 = this.ghostRest(d0), rest = this.ghostRest(d1, false, this.ghostAhead);
        if (this.ghostAhead.ground && !(fall > rest && (rest - 2 * rest0 + this.ghostRest(d0 - v * STEP)) / (STEP * STEP) < -GRAVITY)) {
          g.h = rest; g.vy = (rest - rest0) / STEP;
          continue;
        }
        g.grounded = false; g.takeoff = d0;
      } else {
        // In the air only the lowest point across the road ahead matters, until the ghost meets it.
        const low = this.ghostRest(d1, true, this.ghostAhead);
        if (this.ghostAhead.ground && fall <= low && g.h >= this.ghostRest(d0, true) - .05) {
          const rest0 = this.ghostRest(d0), rest = this.ghostRest(d1);
          g.h = rest; g.vy = (rest - rest0) / STEP; g.grounded = true;
          const lo = g.takeoff - FLIGHT_BEFORE - FLIGHT_MARGIN, hi = d1 + FLIGHT_AFTER + FLIGHT_MARGIN;
          if (g === this.ghost) this.flightZones.add(lo, hi);
          furthest = Math.max(furthest, hi);
          continue;
        }
        // Unreachable (every drop is cleared at the speed there); never fly on forever. The centre line
        // is under 10 m above the road's low edge, so it is only looked at below that edge.
        if (fall < low && fall < this.ghostRest(d1) - 10) { this.settle(g, d1); continue; }
      }
      g.h = fall; g.vy -= GRAVITY * STEP;
    }
  }

  /** The furthest end of the clear zones of flights a copy of the ghost finishes when the road goes on
   * flat from its end, as a gate or a run-out would: it covers the flight the ghost is in, or is about
   * to begin within its last step. -Infinity if there is none. Every segment ends level and, but for a
   * dip, curving up (or not at all), so only a dip's end can launch a ghost that is on the road there. */
  private flightsOver(): number {
    const g = this.ghost;
    if (g.grounded && this.segments[this.segments.length - 1].kind !== 'dip') return -Infinity;
    return this.fly({ d: g.d, h: g.h, vy: g.vy, grounded: g.grounded, takeoff: g.takeoff }, true);
  }

  private traversable(seg: Segment): Segment | null {
    return this.backward(seg) ? seg : null;
  }

  /** Backward reachability from the whole road band at the segment's end, every metre.
   * True when every position across the band at its start can still reach the end.
   * Leaves the per-metre sets in `reach`. Each step uses the speed just before its far end,
   * so a gate starting where the segment ends never changes the result: it is the same
   * whenever it is computed. */
  private backward(seg: Segment): boolean {
    const cfg = this.cfg, s = this.probe, n = Math.ceil(seg.end - seg.start - 1e-9);
    if (this.reach.length < 2 * n + 2) this.reach = new Float64Array(4 * n + 4);
    const reach = this.reach;
    this.reachOf = -1;
    shape(seg, seg.end, cfg.roadWidth, cfg.ribbonWidth, s);
    let m = s.tunnel ? RADIUS : EDGE_MARGIN, lo = s.center - s.width / 2 + m, hi = s.center + s.width / 2 - m;
    reach[2 * n] = lo; reach[2 * n + 1] = hi;
    let bank = s.bank;
    for (let k = n - 1; k >= 0; k--) {
      const a = seg.start + k, b = Math.min(a + 1, seg.end), dd = b - a, v = this.speedNow(Math.max(a, b - 1e-7));
      const drift = BANK_DRIFT * Math.sin(bank) * dd / v, r = reachStep(v, dd);
      shape(seg, a, cfg.roadWidth, cfg.ribbonWidth, s);
      m = s.tunnel ? RADIUS : EDGE_MARGIN;
      const bandLo = s.center - s.width / 2 + m, bandHi = s.center + s.width / 2 - m;
      lo = Math.max(bandLo, reach[2 * k + 2] - drift - r);
      hi = Math.min(bandHi, reach[2 * k + 3] - drift + r);
      if (lo > hi) return false;
      reach[2 * k] = lo; reach[2 * k + 1] = hi;
      if (k === 0 && (lo > bandLo + 1e-9 || hi < bandHi - 1e-9)) return false;
      bank = s.bank;
    }
    this.reachOf = seg.index;
    return true;
  }

  // Rows -------------------------------------------------------------------

  private ensureRows(d: number): void {
    while (this.rowCursor < d + ROWS_AHEAD) this.addRow();
  }

  /** Builds road until every flight taking off before d has landed. */
  private ensureFlights(d: number): void {
    while (this.ghost.d < d || !this.ghost.grounded) this.addSegment();
  }

  private addRow(): void {
    const cfg = this.cfg, r = this.rowRandom;
    let d = this.rowCursor;
    for (;;) {
      this.ensureRoad(d);
      this.ensureFlights(d + LOOK_AHEAD + FLIGHT_BEFORE + FLIGHT_MARGIN);
      const end = Math.max(this.zones.end(d), this.flightZones.end(d));
      if (end < 0) break;
      d = end;
    }
    // Only zones within LOOK_AHEAD are final whatever has been generated, so stop there.
    const limit = Math.min(d + LOOK_AHEAD, this.zones.next(), this.flightZones.next());
    const v = this.speedNow(d), p = clamp((d - WARMUP) / cfg.rampDistance, 0, 1);
    const gap = r.range(lerp(cfg.introInterval[0], cfg.rowInterval[0], p), lerp(cfg.introInterval[1], cfg.rowInterval[1], p)) * v;
    // Stop short of the row so its first block's widened front is itself a blocked step.
    this.advance(d - CLEAR - .01);
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const drafts = this.build(this.pick(), d, v);
      if (drafts && this.fits(drafts, d, limit) && this.passable(drafts)) { this.commit(drafts, d, gap, v); return; }
    }
    this.rowCursor = d + gap / 2;
  }

  private pick(): PatternKind {
    let x = this.rowRandom.next() * this.patternTotal;
    for (const kind of PATTERNS) {
      const weight = this.cfg.patterns[kind];
      if (weight > 0 && (x -= weight) < 0) return kind;
    }
    return 'single';
  }

  /** Lays a pattern out from its front face at d. Offsets stay within hw − 0.05 and
   * every opening between blocks at one distance is at least minGap. */
  private build(kind: PatternKind, d: number, v: number): Draft[] | null {
    const r = this.rowRandom, g = this.cfg.minGap, hw = this.sample(d, this.lookup).width / 2, H = hw - .05;
    const out: Draft[] = [];
    const add = (pattern: PatternKind, front: number, offset: number, width: number, height: number, depth: number, slide: Obstacle['slide'] = null) => {
      out.push({ pattern, distance: front + depth / 2, offset, width, height, depth, slide, roadX: 0, roadY: 0, bank: 0, sin: 0, cos: 1, tan: 0, sink: 0, lift: 0, from: 0, to: 0, lo: 0, hi: 0 });
    };
    /** Blocks from each road edge to a gap; a side narrower than 0.3 m is left open. */
    const wall = (pattern: PatternKind, front: number, depth: number, gapWidth: number, gapCenter: number) => {
      const height = r.range(1, 1.8), left = gapCenter - gapWidth / 2 + H, right = H - gapCenter - gapWidth / 2;
      if (left >= .3) add(pattern, front, -H + left / 2, left, height, depth);
      if (right >= .3) add(pattern, front, H - right / 2, right, height, depth);
    };
    switch (kind) {
      case 'single': {
        const w = r.range(.8, 1.6);
        add(kind, d, r.range(-(H - w / 2), H - w / 2), w, r.range(.9, 2.2), r.range(.8, 1.6));
        break;
      }
      case 'bigBlock': {
        const top = Math.min(2.8, 2 * hw - g - .2);
        if (top < 1.8) return null;
        const w = r.range(1.8, top), far = H - w / 2, near = Math.max(0, g + w / 2 - hw);
        if (near > far) return null;
        add(kind, d, r.sign() * r.range(near, far), w, r.range(2.2, 3.2), r.range(1.6, 3));
        break;
      }
      case 'pair': {
        const w1 = r.range(.8, 1.6), w2 = r.range(.8, 1.6), slack = 2 * H - w1 - w2 - g;
        if (slack < 0) return null;
        const left = r.range(0, slack), extra = r.range(0, slack - left), flip = r.sign();
        const d1 = r.range(.8, 1.6), d2 = r.range(.8, 1.6), deep = Math.max(d1, d2);
        add(kind, d + (deep - d1) / 2, flip * (-H + left + w1 / 2), w1, r.range(.9, 2.2), d1);
        add(kind, d + (deep - d2) / 2, flip * (-H + left + w1 + g + extra + w2 / 2), w2, r.range(.9, 2.2), d2);
        break;
      }
      case 'gate': {
        const gw = Math.min(r.range(g, g + .9), 2 * H);
        wall(kind, d, r.range(.7, 1.2), gw, r.range(-H + gw / 2, H - gw / 2));
        break;
      }
      case 'doubleGate': {
        let g1 = r.range(g, g + .9), g2 = r.range(g, g + .9);
        if (g1 + g2 + .6 > 2 * H) g1 = g2 = g;
        if (g1 + g2 + .6 > 2 * H) return this.build('gate', d, v);
        const slack = 2 * H - g1 - g2 - .6, a = r.next(), b = r.next(), c = r.next(), sum = a + b + c || 1;
        const left = slack * a / sum, middle = .6 + slack * b / sum, right = slack * c / sum, height = r.range(1, 1.8), depth = r.range(.7, 1.2);
        if (left >= .3) add(kind, d, -H + left / 2, left, height, depth);
        add(kind, d, -H + left + g1 + middle / 2, middle, height, depth);
        if (right >= .3) add(kind, d, H - right / 2, right, height, depth);
        break;
      }
      case 'slalom': {
        let side = r.sign(), center = d;
        for (let i = r.int(3, 5); i > 0; i--) {
          const w = Math.min(r.range(.45, .6) * 2 * hw, 2 * H - g), depth = r.range(.8, 1.4);
          if (center === d) center += depth / 2;
          add(kind, center - depth / 2, side * (H - w / 2), w, r.range(1, 2), depth);
          side = -side;
          center += r.range(.525, .75) * v;
        }
        break;
      }
      case 'zigzag': {
        let side = r.sign(), center = d;
        for (let i = r.int(3, 4); i > 0; i--) {
          const gw = r.range(g, g + .9), near = .3 * hw, far = H - gw / 2, depth = r.range(.7, 1.2);
          if (far < near) return null;
          if (center === d) center += depth / 2;
          wall(kind, center - depth / 2, depth, gw, side * r.range(near, far));
          side = -side;
          center += r.range(.6, .9) * v;
        }
        break;
      }
      case 'scatter': {
        const span = r.range(1.5, 2.25) * v;
        for (let i = r.int(4, 7); i > 0; i--) for (let tries = 0; tries < 8; tries++) {
          const s = r.range(.6, .9), u = r.range(-(H - s / 2), H - s / 2), front = d + r.range(0, span - s);
          if (out.some(o => Math.abs(o.offset - u) < (o.width + s) / 2 + .1 && Math.abs(o.distance - front - s / 2) < (o.depth + s) / 2 + .1)) continue;
          add(kind, front, u, s, s, s);
          break;
        }
        break;
      }
      case 'slider': {
        let center = d;
        for (let i = this.difficulty === 'hard' ? r.int(1, 2) : 1; i > 0; i--) {
          const w = r.range(.9, 1.4), depth = r.range(.8, 1.3), height = r.range(1, 1.8);
          // Keep the sweep clear of one edge by at least minGap.
          const amplitude = Math.min(r.range(.6, 1.6), (2 * H - g - w) / 2);
          if (amplitude < .2) return null;
          const far = H - amplitude - w / 2, near = Math.max(0, g + amplitude + w / 2 - hw);
          if (near > far) return null;
          if (center === d) center += depth / 2;
          add(kind, center - depth / 2, r.sign() * r.range(near, far), w, height, depth,
            { amplitude, period: r.range(1.4, 2.6), phase: r.range(0, 2 * Math.PI) });
          center += r.range(.675, 1.05) * v;
        }
        break;
      }
      case 'wallRun': {
        const w = r.range(.35, .5) * 2 * hw;
        add(kind, d, r.sign() * (H - w / 2), w, r.range(1, 1.8), r.range(6, 14));
        break;
      }
    }
    if (!out.length) return null;
    return out.sort((a, b) => a.distance - b.distance);
  }

  /** Every block on the road ahead of the next clear zone, on ground that does not
   * shift or twist under it. Computes its pose data and blocked footprint. */
  private fits(drafts: Draft[], d: number, limit: number): boolean {
    const s = this.lookup;
    for (const o of drafts) {
      const amp = o.slide ? o.slide.amplitude : 0, half = o.depth / 2;
      if (o.distance - half < d - 1e-9 || o.distance + half > limit) return false;
      this.sample(o.distance, s);
      if (Math.abs(o.offset) + o.width / 2 + amp > s.width / 2 - .05 + 1e-9) return false;
      o.roadX = s.center; o.roadY = s.elevation; o.bank = s.bank;
      o.sin = Math.sin(s.bank); o.cos = Math.cos(s.bank); o.tan = Math.tan(s.bank);
      // Signed height of the road under the footprint above the box's base plane (lateral
      // reach padded by 1 m so the extremes cover the rolled box's true corners).
      let low = 0, high = 0;
      const steps = Math.max(4, Math.ceil(2 * o.depth));
      for (let i = 0; i <= steps; i++) {
        const at = o.distance - half + o.depth * i / steps;
        this.sample(at, s);
        if (!s.ground || Math.abs(s.center - o.roadX) > .3 || Math.abs(s.bank - o.bank) > .12) return false;
        const tan = Math.tan(s.bank);
        for (const slide of [-amp, amp]) for (const side of [-(o.width / 2 + 1), o.width / 2 + 1]) {
          const u = o.offset + slide, x = o.roadX + u + side;
          const delta = side * o.sin + (s.elevation - (x - s.center) * tan - (o.roadY - u * o.tan)) * o.cos;
          low = Math.min(low, delta); high = Math.max(high, delta);
        }
      }
      o.sink = -low;
      if (o.sink + high > .3 + .15 * o.depth) return false;
      // low and high are measured along the box's up axis, but heights are vertical: on a bank the box
      // must reach (high + sink)/cos² − sink above its base for its top to stand o.height clear of the road.
      o.lift = (high + o.sink) / (o.cos * o.cos) - o.sink;
      const n = (o.height + o.lift - o.sink) / 2, hh = (o.height + o.sink + o.lift) / 2;
      const x = o.roadX + o.offset + o.sin * n, extent = o.width / 2 * o.cos + hh * Math.abs(o.sin) + amp;
      o.from = o.distance - half - CLEAR; o.to = o.distance + half + CLEAR;
      o.lo = x - extent - CLEAR; o.hi = x + extent + CLEAR;
    }
    return true;
  }

  /** One reachability step to b; returns how many blocks were active there. */
  private step(set: Intervals, a: number, b: number, drafts: Draft[] | null): number {
    const s = this.sample(b, this.probe), v = this.speedNow(b), dd = b - a, m = s.tunnel ? RADIUS : EDGE_MARGIN;
    const allowed = this.allowed;
    allowed.set(s.center - s.width / 2 + m, s.center + s.width / 2 - m);
    let active = 0;
    if (drafts) for (const o of drafts) if (o.from <= b && b <= o.to) { allowed.cut(o.lo, o.hi, this.tmp); active++; }
    if (active) allowed.prune(this.gapRoute);
    set.advance(BANK_DRIFT * Math.sin(s.bank) * dd / v, reachStep(v, dd), allowed, this.tmp);
    return active;
  }

  /** Moves the obstacle-free frontier forward to `target`. */
  private advance(target: number): void {
    while (this.frontierAt < target) {
      const b = Math.min(this.frontierAt + 1, target);
      this.step(this.frontier, this.frontierAt, b, null);
      this.frontierAt = b;
      // Unreachable by construction; recover rather than poison every later row.
      if (!this.frontier.n) {
        const s = this.sample(b, this.probe), half = s.width / 2 - (s.tunnel ? RADIUS : EDGE_MARGIN);
        this.frontier.set(s.center - half, s.center + half);
      }
    }
  }

  /** The row keeps a route that is at least MIN_ROUTE wide wherever a block stands, and
   * from there the end of the segment it finishes in is still reachable. */
  private passable(drafts: Draft[]): boolean {
    const set = this.work, events = this.events;
    set.copy(this.frontier);
    events.length = 0;
    let end = 0;
    for (const o of drafts) { events.push(o.from, o.to); end = Math.max(end, o.to); }
    events.sort((a, b) => a - b);
    let at = this.frontierAt, e = 0;
    while (at < end) {
      while (e < events.length && events[e] <= at) e++;
      const next = Math.min(at + 1, e < events.length ? events[e] : end, end);
      // Slivers are dropped, not just outvoted by a wider interval that may be a dead end.
      if (this.step(set, at, next, drafts)) set.prune(MIN_ROUTE);
      if (!set.n) return false;
      at = next;
    }
    this.snapshot.copy(set);
    this.snapshotAt = end;
    const seg = this.find(end), k = Math.ceil(end - seg.start - 1e-9), grid = Math.min(seg.start + k, seg.end);
    if (grid > end) this.step(set, end, grid, null);
    if (this.reachOf !== seg.index) this.backward(seg);
    return set.meets(this.reach[2 * k], this.reach[2 * k + 1]);
  }

  /** Rows start `gap` apart, but never sooner than ROW_SPACING seconds after the last block of a long pattern. */
  private commit(drafts: Draft[], d: number, gap: number, v: number): void {
    const row = this.rowCount++;
    let back = 0;
    for (const o of drafts) {
      const block: Block = {
        id: this.blocks.length, kind: o.slide ? 'slider' : 'block', pattern: o.pattern, distance: o.distance, offset: o.offset,
        width: o.width, height: o.height, depth: o.depth, slide: o.slide, row,
        roadX: o.roadX, roadY: o.roadY, bank: o.bank, sin: o.sin, cos: o.cos, tan: o.tan, sink: o.sink, lift: o.lift,
      };
      this.blocks.push(block);
      back = Math.max(back, o.distance + o.depth / 2);
    }
    this.frontier.copy(this.snapshot);
    this.frontierAt = this.snapshotAt;
    this.rowCursor = Math.max(d + gap, back + ROW_SPACING * v);
    if (++this.rowsSinceRest >= this.restDue) {
      const cfg = this.cfg;
      this.rowCursor += this.rowRandom.range(cfg.restSeconds[0], cfg.restSeconds[1]) * this.speedNow(back);
      this.rowsSinceRest = 0;
      this.restDue = this.rowRandom.int(cfg.restEvery[0], cfg.restEvery[1]);
    }
  }
}

const cache = new Map<string, CourseImpl>();
let last: CourseImpl | null = null;

/** The course for a seed and difficulty, memoised for the six most recently used. */
export function getCourse(seed: number, difficulty: Difficulty): Course {
  if (last && last.seed === seed && last.difficulty === difficulty) return last;
  const key = `${seed}:${difficulty}`;
  let course = cache.get(key);
  if (course) cache.delete(key);
  else course = new CourseImpl(seed, difficulty);
  cache.set(key, course);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return last = course;
}
