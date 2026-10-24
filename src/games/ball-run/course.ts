/** Seeded Ball Run course. The road is a sequence of segments and the obstacles a
 * sequence of rows; each comes from its own PRNG stream and is generated lazily and
 * strictly in order, so a seed and difficulty give the same course however it is
 * queried. A row is kept only if interval reachability, using the ball's real
 * lateral authority scaled by REACH_SAFETY, still leaves a route through it. */
import {
  BANK_DRIFT, CENTER_LIMIT, CONFIG, DIFFICULTIES, EDGE_SUPPORT, GRAVITY, RADIUS, REACH_SAFETY, SLOPE, WARMUP,
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
const ROW_SPACING = .35;
const GATE_LENGTH = 30, STRAIGHT_RISE = .3;

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
  /** Obstacle-free zones, flat [start, end, ...], sorted and merged. */
  private readonly zones: number[] = [];
  private roadEnd = 0;
  private sinceGate = 0;
  private gateDue: number;
  private hint = 0;

  private readonly blocks: Block[] = [];
  private rowCursor = WARMUP + 10;
  private rowCount = 0;
  private rowsSinceRest = 0;
  private restDue: number;
  private zoneIndex = 0;
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
    if (!previous) seg = make('warmup', WARMUP);
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
      if (kind === 'drop') {
        const approach = r.range(20, 30) * scale, height = r.range(2, 4), gap = r.range(2, 4), flight = Math.sqrt(2 * height / GRAVITY);
        for (let k = 0; k < 3 && !seg; k++) {
          const lip = approach * 1.5 ** k, g = Math.min(gap, this.speedNow(start + lip) * flight - 1.2);
          seg = this.traversable(make('drop', lip + g + Math.max(20, cfg.maxSpeed * flight + 12), height, c0, lip, g));
        }
      } else {
        // Crests and dips keep their length at any speed, so a fast ball leaves the road over them
        // (reference page 04, "drop and flight"); the other kinds stretch with speed.
        const length = r.range(LENGTH[kind][0], LENGTH[kind][1]) * (kind === 'crest' || kind === 'dip' ? 1 : scale);
        let amp = 0, c1 = c0;
        if (kind === 'straight') amp = STRAIGHT_RISE;
        else if (kind === 'bend') amp = r.sign() * r.range(.8, Math.min(2, room));
        else if (kind === 'ribbonBend') amp = r.sign() * r.range(.6, Math.min(1.2, room));
        else if (kind === 'bank') amp = r.sign() * r.range(.5, 1) * cfg.maxBank;
        else if (kind === 'crest') amp = r.range(1.5, 3.5);
        else if (kind === 'dip') amp = -r.range(1, 2);
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
    const length = seg.end - seg.start;
    if (seg.kind === 'warmup') this.zone(0, WARMUP);
    else if (seg.kind === 'gate') this.zone(seg.start - 5, this.gates[this.gates.length - 1].clearEnd);
    else if (seg.kind === 'ribbon' || seg.kind === 'ribbonBend') this.zone(seg.start, seg.end);
    else if (seg.kind === 'crest' || seg.kind === 'dip') this.zone(seg.start + .3 * length, seg.start + .7 * length);
    else if (seg.kind === 'drop') {
      // Clear until 12 m past where the ball lands at the speed there (the pad is longer: it fits maxSpeed).
      const lip = seg.start + seg.approach;
      this.zone(lip - 8, lip + this.speedNow(lip) * Math.sqrt(2 * seg.amp / GRAVITY) + 12);
    }
  }

  private zone(lo: number, hi: number): void {
    const z = this.zones, n = z.length;
    if (n && lo <= z[n - 1]) z[n - 1] = Math.max(z[n - 1], hi);
    else z.push(lo, hi);
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

  /** End of the obstacle-free zone containing d, or -1. */
  private zoneEnd(d: number): number {
    const z = this.zones;
    while (this.zoneIndex < z.length && z[this.zoneIndex + 1] <= d) this.zoneIndex += 2;
    return this.zoneIndex < z.length && z[this.zoneIndex] <= d ? z[this.zoneIndex + 1] : -1;
  }

  private addRow(): void {
    const cfg = this.cfg, r = this.rowRandom;
    let d = this.rowCursor;
    for (;;) {
      this.ensureRoad(d);
      const end = this.zoneEnd(d);
      if (end < 0) break;
      d = end;
    }
    // Only zones within LOOK_AHEAD are final whatever has been generated, so stop there.
    const limit = Math.min(d + LOOK_AHEAD, this.zoneIndex < this.zones.length ? this.zones[this.zoneIndex] : Infinity);
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
          center += r.range(.35, .5) * v;
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
          center += r.range(.4, .6) * v;
        }
        break;
      }
      case 'scatter': {
        const span = r.range(1, 1.5) * v;
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
          center += r.range(.45, .7) * v;
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
