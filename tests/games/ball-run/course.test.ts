import { describe, expect, it } from 'vitest';
import { getCourse, reachStep, type CourseObstacle } from '../../../src/games/ball-run/course';
import {
  BANK_DRIFT, CENTER_LIMIT, CONFIG, DIFFICULTIES, EDGE_SUPPORT, GRAVITY, RADIUS, REACH_SAFETY, SLOPE, WARMUP,
  lateralSpeed, speedAt, type Course, type Difficulty, type Gate, type ObstaclePose, type PatternKind, type SegmentKind, type TrackSample,
} from '../../../src/games/ball-run/config';

const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);
const CASES = DIFFICULTIES.flatMap(difficulty => SEEDS.map(seed => ({ seed, difficulty })));
const CLEAR = RADIUS + .06;
const SPAN = 6000;

const held = new Map<string, Course>();
/** One instance per course for the whole file, so the six-course memo never forces regeneration here. */
function course(seed: number, difficulty: Difficulty): Course {
  const key = `${seed}:${difficulty}`;
  let c = held.get(key);
  if (!c) held.set(key, c = getCourse(seed, difficulty));
  return c;
}
const blank = (): TrackSample => ({ center: 0, width: 0, elevation: 0, gradient: 0, bank: 0, ground: true, tunnel: false, kind: 'warmup', segment: 0 });
const blankPose = (): ObstaclePose => ({ x: 0, y: 0, distance: 0, roll: 0, halfWidth: 0, halfHeight: 0, halfDepth: 0 });

interface Span { index: number; kind: SegmentKind; start: number; end: number }
const spanCache = new WeakMap<Course, Span[]>();
/** Complete segments up to SPAN; boundaries found by bisecting on the sample's segment index. */
function segments(c: Course): Span[] {
  const cached = spanCache.get(c);
  if (cached) return cached;
  const s = blank(), out: Span[] = [];
  c.sample(0, s);
  let index = s.segment, kind = s.kind, start = 0;
  for (let k = 1; k <= SPAN * 2; k++) {
    const d = k / 2;
    if (c.sample(d, s).segment === index) continue;
    let lo = d - .5, hi = d;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (c.sample(m, s).segment === index) lo = m; else hi = m; }
    out.push({ index, kind, start, end: hi });
    c.sample(d, s);
    index = s.segment; kind = s.kind; start = hi;
  }
  spanCache.set(c, out);
  return out;
}
function obstacles(c: Course, from = 0, to = SPAN): CourseObstacle[] {
  const out: CourseObstacle[] = [];
  c.forEachObstacle(from, to, o => out.push(o as CourseObstacle));
  return out;
}
function gates(c: Course, to = SPAN): Gate[] {
  const out: Gate[] = [];
  c.forEachGate(0, to, g => out.push(g));
  return out;
}
/** Seconds of running between two distances at the course's own speed. */
function runTime(c: Course, a: number, b: number, step = .5): number {
  let t = 0;
  for (let d = a; d < b; d += step) { const e = Math.min(b, d + step); t += (e - d) / c.speed((d + e) / 2); }
  return t;
}
interface Drop { lip: number; gapEnd: number; padEnd: number; height: number; lipElevation: number }
function drops(c: Course): Drop[] {
  const s = blank();
  const edge = (from: number, ground: boolean) => {
    let d = from;
    while (c.sample(d, s).ground === ground) d += .02;
    let lo = d - .02, hi = d;
    for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (c.sample(m, s).ground === ground) lo = m; else hi = m; }
    return { lo, hi };
  };
  return segments(c).filter(seg => seg.kind === 'drop').map(seg => {
    const lip = edge(seg.start, true), gapEnd = edge(lip.hi, false).hi;
    const lipElevation = c.sample(lip.lo, s).elevation;
    return { lip: lip.hi, gapEnd, padEnd: seg.end, lipElevation, height: lipElevation - c.sample(lip.hi, s).elevation };
  });
}
function clearZones(c: Course): [number, number][] {
  const zones: [number, number][] = [[0, WARMUP]];
  for (const g of gates(c)) zones.push([g.start - 5, g.clearEnd]);
  for (const seg of segments(c)) {
    if (seg.kind === 'ribbon' || seg.kind === 'ribbonBend') zones.push([seg.start, seg.end]);
    if (seg.kind === 'crest' || seg.kind === 'dip') { const l = seg.end - seg.start; zones.push([seg.start + .3 * l, seg.start + .7 * l]); }
  }
  // A drop stays clear until 12 m past where the ball lands at the speed there.
  for (const d of drops(c)) zones.push([d.lip - 8, d.lip + c.speed(d.lip) * Math.sqrt(2 * d.height / GRAVITY) + 12]);
  return zones;
}

// Interval sets for the independent reachability check: flat [lo, hi, lo, hi, ...], sorted and disjoint.
function dilate(set: number[], shift: number, r: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < set.length; i += 2) {
    const lo = set[i] + shift - r, hi = set[i + 1] + shift + r;
    if (out.length && lo <= out[out.length - 1]) out[out.length - 1] = Math.max(out[out.length - 1], hi);
    else out.push(lo, hi);
  }
  return out;
}
function intersect(a: number[], b: number[]): number[] {
  const out: number[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const lo = Math.max(a[i], b[j]), hi = Math.min(a[i + 1], b[j + 1]);
    if (lo <= hi) out.push(lo, hi);
    if (a[i + 1] < b[j + 1]) i += 2; else j += 2;
  }
  return out;
}
function subtract(set: number[], lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < set.length; i += 2) {
    if (set[i + 1] <= lo || set[i] >= hi) { out.push(set[i], set[i + 1]); continue; }
    if (set[i] < lo) out.push(set[i], lo);
    if (set[i + 1] > hi) out.push(hi, set[i + 1]);
  }
  return out;
}
interface Blocked { from: number; to: number; lo: number; hi: number }
/** World-x footprint of an obstacle's box (whole sweep for sliders), widened by the ball clearance. */
function blocked(c: Course, o: CourseObstacle): Blocked {
  const p = blankPose();
  const footprint = (elapsed: number) => {
    c.pose(o, elapsed, p);
    const half = p.halfWidth * Math.cos(p.roll) + p.halfHeight * Math.abs(Math.sin(p.roll));
    return [p.x - half, p.x + half];
  };
  let [lo, hi] = footprint(0);
  if (o.slide) {
    const { period, phase } = o.slide;
    for (const peak of [Math.PI / 2, -Math.PI / 2]) {
      const [a, b] = footprint((peak - phase) * period / (2 * Math.PI));
      lo = Math.min(lo, a); hi = Math.max(hi, b);
    }
  }
  return { from: o.distance - o.depth / 2 - CLEAR, to: o.distance + o.depth / 2 + CLEAR, lo: lo - CLEAR, hi: hi + CLEAR };
}
/** Forward interval reachability from distance 0, written independently of the generator.
 * Returns the distance where no lateral position remains, or null if a route survives to `to`. */
function closesAt(c: Course, to: number, factor: number): number | null {
  const blocks = obstacles(c, 0, to + 20).map(o => blocked(c, o)).sort((a, b) => a.from - b.from);
  const events = blocks.flatMap(b => [b.from, b.to]).sort((a, b) => a - b);
  const s = blank(), band = () => {
    const m = s.tunnel ? RADIUS : EDGE_SUPPORT + .12;
    return [s.center - s.width / 2 + m, s.center + s.width / 2 - m];
  };
  c.sample(0, s);
  let set = band(), d = 0, e = 0, next = 0, active: Blocked[] = [];
  while (d < to) {
    while (e < events.length && events[e] <= d) e++;
    const step = Math.min(d + 1, e < events.length ? events[e] : Infinity);
    while (next < blocks.length && blocks[next].from <= step) active.push(blocks[next++]);
    active = active.filter(b => b.to >= step);
    c.sample(step, s);
    const v = c.speed(step), dd = step - d;
    let allowed = band();
    for (const b of active) if (b.from <= step) allowed = subtract(allowed, b.lo, b.hi);
    set = intersect(dilate(set, BANK_DRIFT * Math.sin(s.bank) * dd / v, factor * reachStep(v, dd)), allowed);
    if (!set.length) return step;
    d = step;
  }
  return null;
}

describe('Ball Run course generator', () => {
  it('exposes the reach the generator relies on: REACH_SAFETY of the lateral authority per metre', () => {
    expect(reachStep(30, 2)).toBeCloseTo(REACH_SAFETY * lateralSpeed(30) * 2 / 30, 12);
    expect(reachStep(12, 1)).toBeCloseTo(.7 * 6 / 12, 12);
    expect(reachStep(62, 1)).toBeLessThan(reachStep(13, 1));
  });

  it('memoises a course by seed and difficulty and keeps only the six most recent', () => {
    const a = getCourse(501, 'hard');
    expect(getCourse(501, 'hard')).toBe(a);
    expect(getCourse(501, 'easy')).not.toBe(a);
    for (let i = 0; i < 7; i++) getCourse(600 + i, 'medium');
    expect(getCourse(501, 'hard')).not.toBe(a);
    expect(a.seed).toBe(501);
    expect(a.difficulty).toBe('hard');
  });

  // Heavier tests get room for a loaded machine (other suites may share the CPU).
  it('is identical for a seed and difficulty however far ahead or in what order it is queried', { timeout: 30000 }, () => {
    let state = 12345;
    const random = () => ((state = Math.imul(state, 1664525) + 1013904223 >>> 0) / 2 ** 32);
    const distances = Array.from({ length: 500 }, () => random() * 4000);
    for (const { seed, difficulty } of CASES) {
      const near = getCourse(seed, difficulty);
      const nearSamples = distances.map(d => near.sample(d, blank()));
      const nearBlocks = obstacles(near, 0, 3000);
      for (let i = 0; i < 7; i++) getCourse(90000 + i, difficulty);
      const far = getCourse(seed, difficulty);
      expect(far).not.toBe(near);
      const farGates = far.gatesBefore(3900);
      const farBlocks = obstacles(far, 2900, 3000);
      const farSamples = distances.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d).map(({ d, i }) => ({ i, s: far.sample(d) }));
      expect(farGates).toBe(near.gatesBefore(3900));
      for (const { i, s } of farSamples) expect(s).toEqual(nearSamples[i]);
      expect(farBlocks).toEqual(nearBlocks.filter(o => o.distance + o.depth / 2 >= 2900 && o.distance - o.depth / 2 <= 3000));
      expect(obstacles(far, 0, 3000)).toEqual(nearBlocks);
      // Incremental, as a running game asks: a few metres at a time before anything far ahead.
      for (let i = 0; i < 7; i++) getCourse(91000 + i, difficulty);
      const step = getCourse(seed, difficulty), seen = new Map<number, CourseObstacle>();
      expect(step).not.toBe(near);
      expect(step).not.toBe(far);
      for (let d = 0; d <= 3000; d++) step.forEachObstacle(d, d + 5, o => seen.set(o.id, o as CourseObstacle));
      expect([...seen.values()].filter(o => o.distance - o.depth / 2 <= 3000).sort((a, b) => a.id - b.id)).toEqual(nearBlocks);
      for (const [i, d] of distances.entries()) expect(step.sample(d)).toEqual(nearSamples[i]);
      expect(obstacles(step, 0, 3000)).toEqual(nearBlocks);
      expect(step.gatesBefore(3900)).toBe(near.gatesBefore(3900));
    }
  });

  // Sampled every 0.05 m: the steepest decided feature (ribbon taper, 0.54 m per metre) changes by
  // 0.027 per step, well under the 0.05 bound, which is still far below any real jump.
  it('keeps the road continuous, centred within the canyon and inside its width and bank limits', { timeout: 30000 }, () => {
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty), cfg = CONFIG[difficulty], a = blank(), b = blank(), label = `${difficulty} seed ${seed}`;
      // Extremes are gathered first: an expect per sample would cost minutes over 7 million samples.
      let center = 0, widthLow = Infinity, widthHigh = 0, bank = 0, jump = { center: 0, width: 0, bank: 0, elevation: 0 };
      c.sample(0, a);
      for (let k = 1; k <= 5000 * 20; k++) {
        c.sample(k / 20, b);
        center = Math.max(center, Math.abs(b.center));
        widthLow = Math.min(widthLow, b.width); widthHigh = Math.max(widthHigh, b.width);
        bank = Math.max(bank, Math.abs(b.bank));
        jump.center = Math.max(jump.center, Math.abs(b.center - a.center));
        jump.width = Math.max(jump.width, Math.abs(b.width - a.width));
        jump.bank = Math.max(jump.bank, Math.abs(b.bank - a.bank));
        if (!(a.ground && !b.ground)) jump.elevation = Math.max(jump.elevation, Math.abs(b.elevation - a.elevation));
        a.center = b.center; a.width = b.width; a.bank = b.bank; a.elevation = b.elevation; a.ground = b.ground;
      }
      expect(center, label).toBeLessThanOrEqual(CENTER_LIMIT + 1e-9);
      expect(widthLow, label).toBeGreaterThanOrEqual(cfg.ribbonWidth - 1e-9);
      expect(widthHigh, label).toBeLessThanOrEqual(cfg.roadWidth + 1e-9);
      expect(bank, label).toBeLessThanOrEqual(cfg.maxBank + 1e-9);
      for (const delta of Object.values(jump)) expect(delta, label).toBeLessThan(.05);
      for (const seg of segments(c)) {
        if (seg.end > 5000) break;
        const at = (t: number) => c.sample(seg.start + t * (seg.end - seg.start)).center;
        const sway = Math.max(Math.abs(at(.25) - at(0)), Math.abs(at(.75) - at(0)));
        if (seg.kind === 'bend') expect(sway, `${label} bend at ${seg.start.toFixed(1)}`).toBeGreaterThanOrEqual(.8 - 1e-6);
        if (seg.kind === 'ribbonBend') expect(sway, `${label} ribbonBend at ${seg.start.toFixed(1)}`).toBeGreaterThanOrEqual(.6 - 1e-6);
        if (seg.kind === 'offset') {
          expect(Math.abs(at(1)), `${label} offset at ${seg.start.toFixed(1)}`).toBeLessThanOrEqual(CENTER_LIMIT - .8 + 1e-9);
          expect(Math.abs(at(1) - at(0)), `${label} offset at ${seg.start.toFixed(1)}`).toBeGreaterThanOrEqual(1.2 - 1e-9);
        }
        for (const at of [seg.start, seg.end]) {
          c.sample(at - 1e-7, a); c.sample(at, b);
          expect(Math.abs(b.center - a.center)).toBeLessThan(1e-4);
          expect(Math.abs(b.elevation - a.elevation)).toBeLessThan(1e-4);
          expect(b.width).toBeCloseTo(cfg.roadWidth, 6);
          expect(b.bank).toBeCloseTo(0, 6);
          expect(b.elevation).toBeCloseTo(-SLOPE * at, 6);
        }
      }
    }
  });

  it('opens with a clear, flat, straight warm-up on the centre line', () => {
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty), s = blank();
      expect(c.sample(0).center).toBe(0);
      expect(c.sample(-25)).toEqual(c.sample(0));
      for (let d = 0; d < WARMUP; d += .5) {
        c.sample(d, s);
        expect(s.kind).toBe('warmup');
        expect(s.center).toBe(0);
        expect(s.width).toBe(CONFIG[difficulty].roadWidth);
        expect(s.bank).toBe(0);
        expect(s.ground).toBe(true);
        expect(s.elevation).toBeCloseTo(-SLOPE * d, 9);
      }
      expect(obstacles(c, 0, WARMUP)).toEqual([]);
    }
  });

  it('uses the whole track vocabulary and schedules a gate every gate.interval seconds of running', () => {
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty), cfg = CONFIG[difficulty], segs = segments(c), kinds = new Set(segs.map(s => s.kind));
      const expected: SegmentKind[] = ['bend', 'offset', 'ribbon', 'bank', 'crest', 'drop', 'gate'];
      if (difficulty !== 'easy') expected.push('ribbonBend');
      for (const kind of expected) expect(kinds, `${difficulty} seed ${seed} lacks ${kind}`).toContain(kind);
      expect(segs[0].kind).toBe('warmup');
      const list = gates(c);
      expect(list.length).toBeGreaterThan(2);
      let previous = 0;
      list.forEach((gate, i) => {
        expect(gate.index).toBe(i);
        expect(gate.end - gate.start).toBeCloseTo(30, 9);
        expect(gate.clearEnd).toBeCloseTo(gate.end + c.speed(gate.end), 9);
        const at = segs.findIndex(s => Math.abs(s.start - gate.start) < 1e-6);
        if (at < 0 || at + 1 >= segs.length) return;
        expect(segs[at].kind).toBe('gate');
        expect(segs[at + 1].kind).toBe('straight');
        const s = c.sample(gate.start + 15);
        expect(s.tunnel).toBe(true);
        expect(s.width).toBe(cfg.roadWidth);
        const before = segs[at - 1], seconds = runTime(c, previous, gate.start);
        expect(seconds, `${difficulty} seed ${seed} gate ${i}`).toBeGreaterThanOrEqual(cfg.gate.interval[0] - .02);
        expect(seconds - runTime(c, before.start, before.end), `${difficulty} seed ${seed} gate ${i}`).toBeLessThan(cfg.gate.interval[1] + .02);
        previous = gate.start;
      });
      expect(c.sample(list[0].start - 1).tunnel).toBe(false);
    }
  });

  it('builds the segments between gates in the proportions of CONFIG.segments', () => {
    for (const difficulty of DIFFICULTIES) {
      const weights = CONFIG[difficulty].segments, total = Object.values(weights).reduce((a, b) => a + b, 0);
      for (const seed of SEEDS) {
        const c = getCourse(seed, difficulty), s = blank(), counts = new Map<SegmentKind, number>();
        let segment = -1, n = 0, previous: SegmentKind = 'warmup';
        for (let d = 0; n < 200; d++) {
          c.sample(d, s);
          if (s.segment === segment) continue;
          segment = s.segment;
          if (s.kind === 'drop') expect(previous, `${difficulty} seed ${seed} drop after drop`).not.toBe('drop');
          previous = s.kind;
          if (s.kind === 'warmup' || s.kind === 'gate') continue;
          counts.set(s.kind, (counts.get(s.kind) ?? 0) + 1);
          n++;
        }
        for (const [kind, weight] of Object.entries(weights) as [SegmentKind, number][]) {
          expect(Math.abs((counts.get(kind) ?? 0) / n - weight / total), `${difficulty} seed ${seed} ${kind}`).toBeLessThanOrEqual(.03);
        }
      }
    }
  });

  it('keeps every block on the road and out of the warm-up, gate run-outs, ribbons, drops and crest tops', () => {
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty), zones = clearZones(c), list = obstacles(c);
      expect(list.length).toBeGreaterThan(50);
      const misplaced: string[] = [];
      for (const o of list) {
        const a = o.distance - o.depth / 2, b = o.distance + o.depth / 2;
        for (const [lo, hi] of zones) if (a < hi - 1e-6 && b > lo + 1e-6) misplaced.push(`block ${o.id} [${a.toFixed(2)}, ${b.toFixed(2)}] in zone [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
        if (Math.abs(o.offset) + o.width / 2 + (o.slide?.amplitude ?? 0) > c.sample(o.distance).width / 2 + 1e-9) misplaced.push(`block ${o.id} off the road`);
        if (o.kind !== (o.slide ? 'slider' : 'block')) misplaced.push(`block ${o.id} kind ${o.kind}`);
      }
      expect(misplaced, `${difficulty} seed ${seed}`).toEqual([]);
    }
  });

  it('makes every drop clearable at the speed there, block-free until past the landing, and landable on its pad at the speed cap', () => {
    let count = 0;
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty);
      for (const drop of drops(c)) {
        count++;
        expect(drop.height).toBeGreaterThanOrEqual(2 - 1e-6);
        expect(drop.height).toBeLessThanOrEqual(4 + 1e-6);
        for (const v of [c.speed(drop.lip), CONFIG[difficulty].maxSpeed]) {
          let x = 0;
          for (; x < 400; x += .01) {
            const y = drop.lipElevation - SLOPE * x - GRAVITY * x * x / (2 * v * v);
            if (y <= c.sample(drop.lip + x).elevation) break;
          }
          const where = `${difficulty} seed ${seed} drop at ${drop.lip.toFixed(1)}, ${v} m/s`;
          expect(drop.lip + x, where).toBeGreaterThanOrEqual(drop.gapEnd + 1);
          expect(drop.lip + x + 12, where).toBeLessThanOrEqual(drop.padEnd);
          // At the speed there, nothing stands from 8 m before the lip to 12 m past the landing.
          if (v === c.speed(drop.lip)) expect(obstacles(c, drop.lip - 8, drop.lip + x + 11.9).map(o => o.id), where).toEqual([]);
        }
      }
    }
    expect(count).toBeGreaterThan(72);
  });

  // Pooled per difficulty over all 24 seeds, with every seed held to 85 % of each threshold.
  it('packs many more rows and blocks per second, increasing with difficulty', () => {
    const thresholds = { easy: { blocks: .6, rows: .35 }, medium: { blocks: .9, rows: .5 }, hard: { blocks: 1.3, rows: .65 } };
    const totals: Record<Difficulty, { seconds: number; blocks: number; rows: number }> = {
      easy: { seconds: 0, blocks: 0, rows: 0 }, medium: { seconds: 0, blocks: 0, rows: 0 }, hard: { seconds: 0, blocks: 0, rows: 0 },
    };
    for (const { seed, difficulty } of CASES) {
      const c = course(seed, difficulty), seconds = runTime(c, 1000, 6000), want = thresholds[difficulty], total = totals[difficulty];
      const list = obstacles(c, 1000, 6000).filter(o => o.distance >= 1000 && o.distance < 6000), rows = new Set(list.map(o => o.row)).size;
      expect(list.length / seconds, `${difficulty} seed ${seed} blocks/s`).toBeGreaterThanOrEqual(.85 * want.blocks);
      expect(rows / seconds, `${difficulty} seed ${seed} rows/s`).toBeGreaterThanOrEqual(.85 * want.rows);
      total.seconds += seconds; total.blocks += list.length; total.rows += rows;
    }
    const rate = (d: Difficulty, k: 'blocks' | 'rows') => totals[d][k] / totals[d].seconds;
    for (const d of DIFFICULTIES) {
      expect(rate(d, 'blocks'), `${d} blocks/s`).toBeGreaterThanOrEqual(thresholds[d].blocks);
      expect(rate(d, 'rows'), `${d} rows/s`).toBeGreaterThanOrEqual(thresholds[d].rows);
    }
    expect(rate('hard', 'blocks')).toBeGreaterThan(rate('medium', 'blocks'));
    expect(rate('medium', 'blocks')).toBeGreaterThan(rate('easy', 'blocks'));
    expect(rate('hard', 'rows')).toBeGreaterThan(rate('medium', 'rows'));
    expect(rate('medium', 'rows')).toBeGreaterThan(rate('easy', 'rows'));
  });

  it('composes rows from many patterns, with sliders only on Medium and Hard, differently for every seed', () => {
    for (const { seed, difficulty } of CASES) {
      const list = obstacles(course(seed, difficulty)), patterns = new Set<PatternKind>(list.map(o => o.pattern));
      if (difficulty === 'hard') expect(patterns.size, `hard seed ${seed}`).toBeGreaterThanOrEqual(8);
      expect(list.some(o => o.kind === 'slider')).toBe(difficulty !== 'easy');
      list.forEach((o, i) => expect(o.id).toBe(i));
    }
    for (const difficulty of DIFFICULTIES) {
      const layouts = new Set<string>();
      for (let seed = 1; seed <= 32; seed++) {
        layouts.add(obstacles(getCourse(seed, difficulty), 0, 2000).filter(o => o.row < 5)
          .map(o => `${o.pattern}:${o.offset.toFixed(2)}:${o.width.toFixed(2)}:${o.distance.toFixed(1)}`).join('|'));
      }
      expect(layouts.size).toBeGreaterThanOrEqual(28);
    }
  });

  it('always leaves a route open for 0.95 of the reach the generator assumes', () => {
    for (const { seed, difficulty } of CASES) {
      expect(closesAt(course(seed, difficulty), SPAN, .95), `${difficulty} seed ${seed}`).toBeNull();
    }
  });

  it('derives speed from the ramp plus every gate entrance passed', () => {
    for (const difficulty of DIFFICULTIES) {
      const c = course(3, difficulty);
      for (const gate of gates(c)) {
        expect(c.gatesBefore(gate.start)).toBe(gate.index + 1);
        expect(c.gatesBefore(gate.start - 1e-6)).toBe(gate.index);
        expect(c.speed(gate.start)).toBe(speedAt(difficulty, gate.start, gate.index + 1));
      }
      for (let d = 0; d < SPAN; d += 7.3) expect(c.speed(d)).toBe(speedAt(difficulty, d, c.gatesBefore(d)));
      expect(c.gatesBefore(-5)).toBe(0);
    }
  });

  it('reports obstacles in distance order exactly when their depth overlaps the query', () => {
    for (const difficulty of DIFFICULTIES) {
      const c = course(5, difficulty), all = obstacles(c, 0, SPAN);
      for (let i = 1; i < all.length; i++) expect(all[i].distance).toBeGreaterThanOrEqual(all[i - 1].distance);
      for (const o of all) expect(o.depth).toBeLessThanOrEqual(c.maxDepth);
      for (let from = 0; from < 5000; from += 137.7) {
        const to = from + 3.1, want = all.filter(o => o.distance - o.depth / 2 <= to && o.distance + o.depth / 2 >= from);
        expect(obstacles(c, from, to)).toEqual(want);
      }
    }
  });

  it('poses each block on the road surface it stands on, sliding blocks within their sweep', () => {
    for (const difficulty of DIFFICULTIES) for (const seed of [2, 9]) {
      const c = course(seed, difficulty), p = blankPose(), q = blankPose(), s = blank();
      for (const o of obstacles(c)) {
        expect(c.pose(o, 0, p)).toBe(p);
        c.sample(o.distance, s);
        expect(p.roll).toBe(s.bank);
        expect(p.distance).toBe(o.distance);
        expect(p.halfWidth).toBe(o.width / 2);
        expect(p.halfDepth).toBe(o.depth / 2);
        // The box rests on the road along its whole footprint: never floating, never sunk below its height.
        const up = [Math.sin(p.roll), Math.cos(p.roll)], side = [Math.cos(p.roll), -Math.sin(p.roll)];
        for (const along of [-1, -.5, 0, .5, 1]) for (const across of [-1, 0, 1]) {
          const at = o.distance + along * p.halfDepth;
          const bx = p.x + across * p.halfWidth * side[0] - p.halfHeight * up[0], by = p.y + across * p.halfWidth * side[1] - p.halfHeight * up[1];
          const ground = c.surfaceHeight(at, bx);
          expect(by, `${difficulty} seed ${seed} block ${o.id} floats`).toBeLessThanOrEqual(ground + .02);
          expect(by + 2 * p.halfHeight * up[1] - ground, `${difficulty} seed ${seed} block ${o.id} sunk`).toBeGreaterThanOrEqual(o.height * up[1] - .02);
        }
        c.pose(o, 37.3, q);
        if (!o.slide) { expect(q).toEqual(p); continue; }
        const { amplitude, period, phase } = o.slide, wave = (t: number) => amplitude * Math.sin(2 * Math.PI * t / period + phase);
        expect(q.x - p.x).toBeCloseTo(wave(37.3) - wave(0), 9);
      }
    }
  });

  it('samples into the caller\'s object and agrees with surfaceHeight on banks', () => {
    const c = course(4, 'hard'), out = blank();
    expect(c.sample(1234.5, out)).toBe(out);
    for (let d = 100; d < SPAN; d += 11.1) {
      c.sample(d, out);
      expect(c.surfaceHeight(d, out.center + 1)).toBeCloseTo(out.elevation - Math.tan(out.bank), 9);
    }
  });

  it('generates twenty kilometres of Hard course in well under a second', () => {
    const c = getCourse(777001, 'hard'), started = performance.now();
    c.forEachObstacle(19990, 20000, () => {});
    c.sample(20000);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
