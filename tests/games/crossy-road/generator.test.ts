import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  BAND_MAX, BAND_MIN, COLS, CROSS_WINDOW, HOP_TIME, LOG_PALETTE, MOVERS, PLATFORM_GRACE, PLAYER_HALF, RAIL_PERIOD_MIN, RIVER_WAIT,
  START_COL, TRAIN_PALETTE, VEHICLE_INSET, VEHICLE_PALETTE, WARN_FLOOR, WARN_LEAD, riverGapMax, roadGapMin,
  type GrassLane, type Lane, type LaneKind, type MovingLane, type Obstacle, type RailLane, type RiverLane, type RoadLane,
} from '../../../src/games/crossy-road/config';
import {
  chunkRng, fitLogRow, generate, generateChunk, hedgeLane, initialState, logBridgeOk, mix, repairGrass, type LogShape,
} from '../../../src/games/crossy-road/generator';
import * as laneMath from '../../../src/games/crossy-road/lanes';
import { forEachMover, platformAt, railWarning, trainClear, trainSpan } from '../../../src/games/crossy-road/lanes';
import { World } from '../../../src/games/crossy-road/world';
import { mulberry32 } from '../../../src/core/random';

/** The fairness properties F1-F7 of PLAN.md checked over SEEDS worlds of at least ROWS rows each. Time-invariant properties are
 * checked analytically on every lane of every seed; time-sampled properties run on the first SAMPLED seeds. One streaming sweep
 * generates every seed once and records violations per property, so each property still gets its own named test. */
const SEEDS = 2000;
const ROWS = 400;
const SAMPLED = 200;
const EPS = 1e-9;

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 });

/** Collects violations without calling expect() millions of times; reports the first few on failure. */
class Bad {
  count = 0;
  readonly first: string[] = [];
  add(message: string): void {
    this.count++;
    if (this.first.length < 6) this.first.push(message);
  }
}
const expectNone = (bad: Bad): void => {
  expect(bad.count, `${bad.count} violation(s); first:\n  ${bad.first.join('\n  ')}`).toBe(0);
};
const near = (actual: number, expected: number, tolerance: number, label: string): void => {
  expect(Math.abs(actual - expected), `${label}: got ${actual}, expected ${expected} +- ${tolerance}`).toBeLessThanOrEqual(tolerance);
};

interface Stat { n: number; sum: number }

const family = (kind: LaneKind): 'grass' | 'road' | 'river' | 'rail' => (kind === 'lily' ? 'river' : kind);
/** Whole chunks, so at least ROWS lanes and no chunk is cut in half. */
const lanesOf = (seed: number): Lane[] => generate(initialState(seed), ROWS).lanes;
const first400 = (lanes: readonly Lane[]): string => JSON.stringify(lanes.slice(0, ROWS));
const isInt = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v);
const inRange = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const grassOf = (lane: Lane): GrassLane => {
  if (lane.kind !== 'grass') throw new Error(`row ${lane.row} is ${lane.kind}, not grass`);
  return lane;
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.freeze(value);
    for (const inner of Object.values(value)) deepFreeze(inner);
  }
  return value;
}

/** Index and a short dump of the first lane two lane lists disagree on, or null when they agree on the first ROWS rows. */
function firstDifference(a: readonly Lane[], b: readonly Lane[]): string | null {
  for (let r = 0; r < ROWS; r++) {
    const x = JSON.stringify(a[r]), y = JSON.stringify(b[r]);
    if (x !== y) return `row ${r}:\n  ${x}\n  ${y}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Independent reachability. Written from the rules alone (PLAN.md "Repair"): it shares nothing with the generator.
// ---------------------------------------------------------------------------------------------------------------------------

function startReach(): boolean[] {
  const reach = new Array<boolean>(COLS).fill(false);
  reach[START_COL] = true;
  return reach;
}

/** Columns the player can stand on in `lane`, given the columns reachable in the row before it. */
function nextReach(prev: readonly boolean[], lane: Lane): boolean[] {
  if (lane.kind === 'lily') return lane.pads.slice();
  if (lane.kind !== 'grass') return new Array<boolean>(COLS).fill(prev.some(Boolean));
  const seen = new Array<boolean>(COLS).fill(false);
  const stack: number[] = [];
  for (let c = 0; c < COLS; c++) if (prev[c] && lane.obstacles[c] === null) { seen[c] = true; stack.push(c); }
  while (stack.length > 0) {
    const c = stack.pop() as number;
    for (let n = c - 1; n <= c + 1; n += 2) {
      if (n >= 0 && n < COLS && lane.obstacles[n] === null && !seen[n]) { seen[n] = true; stack.push(n); }
    }
  }
  return seen;
}

function reachAfterEachRow(lanes: readonly Lane[]): boolean[][] {
  const out: boolean[][] = [];
  let reach = startReach();
  for (const lane of lanes) { reach = nextReach(reach, lane); out.push(reach); }
  return out;
}

const sameBools = (a: readonly boolean[], b: readonly boolean[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

// ---------------------------------------------------------------------------------------------------------------------------
// The sweep.
// ---------------------------------------------------------------------------------------------------------------------------

interface Sweep {
  crash: Bad; shapes: Bad; f1: Bad; f2: Bad; f3: Bad; f4: Bad; f4b: Bad; f5: Bad; f6: Bad; f7: Bad; runs: Bad; chunks: Bad;
  /** How many times each rule was exercised, so a green run cannot be vacuous. */
  seen: Record<string, number>;
  stats: Record<string, Stat>;
  cache: Map<number, Lane[]>;
}

function newSweep(): Sweep {
  return {
    crash: new Bad(), shapes: new Bad(), f1: new Bad(), f2: new Bad(), f3: new Bad(), f4: new Bad(), f4b: new Bad(), f5: new Bad(),
    f6: new Bad(), f7: new Bad(), runs: new Bad(), chunks: new Bad(), seen: {}, stats: {}, cache: new Map(),
  };
}
const count = (S: Sweep, key: string, by = 1): void => { S.seen[key] = (S.seen[key] ?? 0) + by; };
const note = (S: Sweep, key: string, value: number): void => {
  const s = (S.stats[key] ??= { n: 0, sum: 0 });
  s.n++;
  s.sum += value;
};
const mean = (S: Sweep, key: string): number => {
  const s = S.stats[key];
  return s === undefined || s.n === 0 ? NaN : s.sum / s.n;
};
/** Early rows (difficulty about 0.04) versus rows from 300 on (difficulty 1). */
const phase = (row: number): 'early' | 'mid' | 'late' => (row < 20 ? 'early' : row >= 300 ? 'late' : 'mid');

/** Gap after each mover, the last one wrapping around the cycle to the first mover. */
function gapsOf(lane: MovingLane): number[] {
  const m = lane.movers, gaps: number[] = [];
  for (let i = 0; i < m.length; i++) {
    const next = i + 1 < m.length ? m[i + 1].offset : lane.cycle + m[0].offset;
    gaps.push(next - (m[i].offset + m[i].len));
  }
  return gaps;
}

function checkMovers(S: Sweep, bad: Bad, at: string, lane: MovingLane, palette: number, label: string): void {
  if (lane.dir !== 1 && lane.dir !== -1) bad.add(`${at}: dir ${lane.dir}`);
  if (lane.movers.length !== MOVERS) bad.add(`${at}: ${lane.movers.length} movers`);
  if (!(lane.cycle > 0) || !(lane.phase >= 0 && lane.phase < lane.cycle)) bad.add(`${at}: cycle ${lane.cycle} phase ${lane.phase}`);
  let previous = -Infinity;
  for (const m of lane.movers) {
    if (!(m.offset >= 0 && m.offset < lane.cycle && m.offset > previous)) bad.add(`${at}: offset ${m.offset} not sorted inside [0, ${lane.cycle})`);
    if (!isInt(m.color) || m.color < 0 || m.color >= palette) bad.add(`${at}: colour ${m.color}`);
    count(S, `colour.${label}.${m.color}`);
    previous = m.offset;
  }
  for (const gap of gapsOf(lane)) if (!(gap >= 0)) bad.add(`${at}: movers overlap (gap ${gap})`);
}

function checkGrass(S: Sweep, at: string, lane: GrassLane, r: number): void {
  count(S, 'grass');
  if (lane.blocked.length !== COLS || lane.obstacles.length !== COLS || lane.variant.length !== COLS) S.shapes.add(`${at}: grass arrays must have ${COLS} entries`);
  if (lane.edge.length !== 12) S.shapes.add(`${at}: edge has ${lane.edge.length} entries`);
  if (lane.shade !== r % 2) S.shapes.add(`${at}: shade ${lane.shade}`);
  let blocked = 0;
  for (let c = 0; c < COLS; c++) {
    const o = lane.obstacles[c];
    if (o !== null && o !== 'tree' && o !== 'rock') S.shapes.add(`${at}: obstacle ${String(o)}`);
    if (lane.blocked[c] !== (o !== null)) S.shapes.add(`${at}: blocked[${c}] disagrees with obstacles[${c}]`);
    const v = lane.variant[c];
    if (v !== 0 && v !== 1 && v !== 2) S.shapes.add(`${at}: variant ${v}`);
    if (o !== null) { blocked++; note(S, 'tree', o === 'tree' ? 1 : 0); }
    if (r < 5 && (c < 2 || c > 6)) note(S, 'startEdge', o !== null ? 1 : 0);
    note(S, 'variantTwo', v === 2 ? 1 : 0);
  }
  for (const e of lane.edge) {
    if (e !== null && e !== 'tree' && e !== 'rock') S.shapes.add(`${at}: edge ${String(e)}`);
    note(S, 'edgeDecor', e !== null ? 1 : 0);
    if (e !== null) note(S, 'edgeTree', e === 'tree' ? 1 : 0);
  }
  if (r >= 5) note(S, `density.${phase(r)}`, blocked / COLS);
  let open = 0;
  for (let c = 0; c < COLS; c++) if (lane.obstacles[c] === null) open++;
  if (open < 3) S.f2.add(`${at}: only ${open} open column(s)`);
  if (r < 5) for (let c = 2; c <= 6; c++) if (lane.obstacles[c] !== null) S.f2.add(`${at}: start row blocked at column ${c}`);
}

function checkRoad(S: Sweep, at: string, lane: RoadLane, r: number): void {
  count(S, 'road');
  checkMovers(S, S.f3, at, lane, VEHICLE_PALETTE, 'vehicle');
  if (!inRange(lane.speed, 1.5 * 0.85, 4.5 * 1.15)) S.shapes.add(`${at}: road speed ${lane.speed}`);
  const truck = lane.vehicle === 'truck';
  if (!truck && lane.vehicle !== 'car') S.shapes.add(`${at}: vehicle ${String(lane.vehicle)}`);
  if (truck) count(S, 'truck');
  for (const m of lane.movers) if (truck ? !(m.len === 2 || m.len === 3) : m.len !== 1.5) S.shapes.add(`${at}: ${lane.vehicle} of length ${m.len}`);
  const min = roadGapMin(lane.speed);
  for (const gap of gapsOf(lane)) {
    if (gap < min - EPS || gap < 3 - EPS) S.f3.add(`${at}: road gap ${gap} below ${min}`);
    if ((gap - 2 * PLAYER_HALF + 2 * VEHICLE_INSET) / lane.speed < CROSS_WINDOW - EPS) S.f3.add(`${at}: safe window ${(gap - 0.4) / lane.speed} s`);
    if (r < 20) note(S, 'roadGap.early', gap);
  }
  note(S, `roadSpeed.${phase(r)}`, lane.speed);
  note(S, `truck.${phase(r)}`, truck ? 1 : 0);
}

function checkRiver(S: Sweep, at: string, lane: RiverLane, before: Lane | undefined, r: number): void {
  count(S, 'river');
  checkMovers(S, S.shapes, at, lane, LOG_PALETTE, 'log');
  if (!inRange(lane.speed, 0.85, 2.6 * 1.15)) S.shapes.add(`${at}: river speed ${lane.speed}`);
  for (const m of lane.movers) {
    if (m.len !== 2 && m.len !== 3 && m.len !== 4) S.shapes.add(`${at}: log of length ${m.len}`);
    note(S, `logLen.${phase(r)}`, m.len);
  }
  for (const gap of gapsOf(lane)) {
    if (!inRange(gap, 2, 4)) S.shapes.add(`${at}: river gap ${gap}`);
    note(S, `riverGap.${phase(r)}`, gap);
    // F4 (every log row, so also every land to river entry): a fixed column is never without a log for more than RIVER_WAIT seconds.
    if ((gap - 2 * PLATFORM_GRACE) / lane.speed > RIVER_WAIT + EPS) S.f4.add(`${at}: column uncovered for ${(gap - 0.4) / lane.speed} s`);
    if (gap > riverGapMax(lane.speed) + EPS) S.f4.add(`${at}: gap ${gap} above riverGapMax ${riverGapMax(lane.speed)}`);
  }
  note(S, `riverSpeed.${phase(r)}`, lane.speed);
  if (before === undefined) return;
  if (before.kind === 'river') {
    count(S, 'riverPairs');
    if (before.dir !== -lane.dir) S.f4b.add(`${at}: dir ${lane.dir} follows a log row with dir ${before.dir}`);
    // A passing log covers a point of the other row for (len + 2*grace) / (speedA + speedB) seconds.
    for (const log of [...before.movers.map((m) => m.len), ...lane.movers.map((m) => m.len)]) {
      if ((log + 2 * PLATFORM_GRACE) / (before.speed + lane.speed) < 0.4 - EPS) S.f4b.add(`${at}: a log of ${log} passes in ${(log + 0.4) / (before.speed + lane.speed)} s`);
    }
  } else if (before.kind === 'lily') count(S, 'lilyToRiver');
  else count(S, 'landToRiver');
}

function checkRail(S: Sweep, at: string, lane: RailLane, r: number): void {
  count(S, 'rail');
  note(S, 'railDir', lane.dir === 1 ? 1 : 0);
  if (lane.dir !== 1 && lane.dir !== -1) S.shapes.add(`${at}: dir ${lane.dir}`);
  if (lane.speed !== 18) S.shapes.add(`${at}: train speed ${lane.speed}`);
  if (!isInt(lane.length) || lane.length < 12 || lane.length > 20) S.shapes.add(`${at}: train length ${lane.length}`);
  if (!isInt(lane.color) || lane.color < 0 || lane.color >= TRAIN_PALETTE) S.shapes.add(`${at}: colour ${lane.color}`);
  count(S, `colour.train.${lane.color}`);
  if (!(lane.phase >= 0 && lane.phase < lane.period)) S.shapes.add(`${at}: phase ${lane.phase} period ${lane.period}`);
  // F5, analytic: the light leads by WARN_LEAD >= WARN_FLOOR (constant) and every pass leaves at least 2 s of quiet.
  if (lane.period < RAIL_PERIOD_MIN - EPS) S.f5.add(`${at}: period ${lane.period}`);
  const quiet = lane.period - (WARN_LEAD + trainClear(lane));
  if (quiet < 2 - EPS) S.f5.add(`${at}: only ${quiet} s of quiet (period ${lane.period}, length ${lane.length})`);
  note(S, `railPeriod.${phase(r)}`, lane.period);
}

function checkLane(S: Sweep, seed: number, lanes: readonly Lane[], r: number): void {
  const lane = lanes[r], at = `seed ${seed} row ${r}`;
  if (lane.row !== r) S.shapes.add(`${at}: lane.row is ${lane.row}`);
  switch (lane.kind) {
    case 'grass': checkGrass(S, at, lane, r); break;
    case 'road': checkRoad(S, at, lane, r); break;
    case 'river': checkRiver(S, at, lane, lanes[r - 1], r); break;
    case 'rail': checkRail(S, at, lane, r); break;
    case 'lily': {
      count(S, 'lily');
      const pads = lane.pads;
      const n = pads.filter(Boolean).length;
      if (pads.length !== COLS || !pads.every((p) => typeof p === 'boolean')) S.f7.add(`${at}: ${pads.length} pad flags`);
      if (n < 3 || n > 5) S.f7.add(`${at}: ${n} pads`);
      note(S, 'pads', n);
      pads.forEach((on, c) => { if (on) note(S, 'padColumn', c); });
      if (lanes[r - 1]?.kind !== 'river' || lanes[r + 1]?.kind !== 'river') S.f7.add(`${at}: lily between ${lanes[r - 1]?.kind} and ${lanes[r + 1]?.kind}`);
      break;
    }
  }
}

/** F1 and F2 by the independent BFS. Returns the reachable columns after every row for the chunk bookkeeping check. */
function checkReach(S: Sweep, seed: number, lanes: readonly Lane[]): boolean[][] {
  const reaches: boolean[][] = [];
  let reach = startReach();
  for (let r = 0; r < lanes.length; r++) {
    const lane = lanes[r];
    const entry = lane.kind === 'grass' && reach.some((on, c) => on && lane.obstacles[c] === null);
    if (lane.kind === 'grass' && !entry) S.f1.add(`seed ${seed} row ${r}: no reachable open column in a grass row`);
    reach = nextReach(reach, lane);
    if (!reach.some(Boolean)) S.f1.add(`seed ${seed} row ${r}: nothing reachable`);
    reaches.push(reach);
    if (r < 5 && lane.kind !== 'grass') S.f2.add(`seed ${seed} row ${r}: start row is ${lane.kind}`);
  }
  return reaches;
}

/** The brief's chunk rules, phrased on maximal runs of one family (a lily counts as river). */
function checkRuns(S: Sweep, seed: number, lanes: readonly Lane[]): void {
  let hazards = 0;
  for (let start = SAFE_START; start < lanes.length;) {
    const fam = family(lanes[start].kind);
    let end = start;
    while (end + 1 < lanes.length && family(lanes[end + 1].kind) === fam) end++;
    const len = end - start + 1, at = `seed ${seed} ${fam} run rows ${start}..${end}`;
    if (fam === 'rail') {
      if (len !== 1 && !(len === 2 && start >= 120)) S.runs.add(`${at}: ${len} tracks`);
      if (start >= 120) { note(S, 'doubleRail', len === 2 ? 1 : 0); if (len === 2) count(S, 'doubleRail'); }
    } else if (fam === 'road') {
      if (len > (start < 20 ? 2 : 4)) S.runs.add(`${at}: ${len} rows`);
      for (let r = start + 1; r <= end; r++) {
        note(S, 'roadFlip', (lanes[r] as RoadLane).dir !== (lanes[r - 1] as RoadLane).dir ? 1 : 0);
      }
      note(S, 'roadFirstDir', (lanes[start] as RoadLane).dir === 1 ? 1 : 0);
    } else if (fam === 'grass') {
      if (len > (start < 20 ? 5 : 3)) S.runs.add(`${at}: ${len} rows`);
    } else {
      let lilies = 0, lastLog: RiverLane | null = null;
      for (let r = start; r <= end; r++) {
        const lane = lanes[r];
        if (lane.kind === 'lily') {
          lilies++;
          if (r === start || r === end) S.runs.add(`${at}: lily at row ${r} is first or last`);
        } else if (lane.kind === 'river') {
          if (lastLog !== null && lane.dir !== -lastLog.dir) S.runs.add(`${at}: log rows ${lastLog.row} and ${r} do not alternate`);
          if (lastLog === null) note(S, 'logFirstDir', lane.dir === 1 ? 1 : 0);
          lastLog = lane;
        }
      }
      if (len > 3) S.runs.add(`${at}: ${len} rows`);
      if (lilies > 1) S.runs.add(`${at}: ${lilies} lilies`);
      if (len === 3) note(S, 'lilyInThree', lilies);
    }
    if (fam === 'grass') hazards = 0;
    else {
      hazards++;
      if (hazards > 3) S.runs.add(`${at}: hazard run number ${hazards}`);
      if (hazards === 3) { count(S, 'hazardTriples'); if (start < 60) S.runs.add(`${at}: third hazard run starts before row 60`); }
    }
    start = end + 1;
  }
}
const SAFE_START = 5;

/** F6 (batch independence) and the chunk-level bookkeeping, by generating the same seed chunk by chunk and through World. */
function checkChunks(S: Sweep, seed: number, lanes: readonly Lane[], reaches: readonly boolean[][]): void {
  const reference = first400(lanes);

  const world = new World(seed);
  for (const to of [37, 120, 399]) world.ensure(to);
  const viaWorld: Lane[] = [];
  for (let r = 0; r < ROWS; r++) viaWorld.push(world.lane(r));
  if (first400(viaWorld) !== reference) S.f6.add(`seed ${seed}: World.ensure steps differ at ${firstDifference(viaWorld, lanes)}`);

  let state = initialState(seed), previous = '';
  const viaChunks: Lane[] = [];
  while (viaChunks.length < ROWS) {
    const before = state;
    const snapshot = seed <= SAMPLED ? JSON.stringify(before) : '';
    const out = generateChunk(before);
    const after = out.state, n = out.lanes.length, start = before.nextRow, kind = family(out.lanes[0].kind);
    const at = `seed ${seed} chunk ${before.chunk} rows ${start}..${start + n - 1} (${kind})`;
    count(S, 'chunks');
    if (seed <= SAMPLED && JSON.stringify(before) !== snapshot) S.chunks.add(`${at}: the input state was mutated`);
    for (let j = 0; j < n; j++) {
      if (out.lanes[j].row !== start + j) S.chunks.add(`${at}: lane ${j} has row ${out.lanes[j].row}`);
      if (family(out.lanes[j].kind) !== kind) S.chunks.add(`${at}: mixed kinds`);
    }
    if (after.seed !== before.seed || after.chunk !== before.chunk + 1 || after.nextRow !== start + n) S.chunks.add(`${at}: bad counters ${JSON.stringify({ ...after, reach: undefined })}`);
    if (after.prevKind !== kind) S.chunks.add(`${at}: prevKind ${after.prevKind}`);
    if (after.hazardRun !== (kind === 'grass' ? 0 : before.hazardRun + 1)) S.chunks.add(`${at}: hazardRun ${before.hazardRun} -> ${after.hazardRun}`);
    if (before.chunk === 0) {
      if (kind !== 'grass' || n !== 5) S.chunks.add(`${at}: the first chunk must be five grass rows`);
    } else {
      note(S, `thickness.${kind}.${start < 20 ? 'early' : 'later'}`, n);
      if (before.chunk === 1) count(S, `first.${kind}`);
      // Kind transitions where nothing but the weights decides: rows from 300 (difficulty 1), no cap in force.
      if (start >= 300 && before.hazardRun < 3) { count(S, `from.${previous}`); count(S, `to.${previous}.${kind}`); }
      if (kind === previous) S.chunks.add(`${at}: same kind as the chunk before`);
      if (kind !== 'grass' && before.hazardRun >= (start < 60 ? 2 : 3)) S.chunks.add(`${at}: hazard cap exceeded (run ${before.hazardRun})`);
      const ok = kind === 'grass' ? n >= 1 && n <= (start < 20 ? 5 : 3)
        : kind === 'road' ? n >= 1 && n <= (start < 20 ? 2 : 4)
          : kind === 'river' ? n >= 1 && n <= 3
            : n === 1 || (n === 2 && start >= 120);
      if (!ok) S.chunks.add(`${at}: thickness ${n}`);
    }
    // The state's reach must equal the independent BFS of the chunk's last row.
    if (start + n - 1 < reaches.length && !sameBools(after.reach, reaches[start + n - 1])) S.chunks.add(`${at}: state.reach ${JSON.stringify(after.reach)} but BFS says ${JSON.stringify(reaches[start + n - 1])}`);
    previous = kind;
    viaChunks.push(...out.lanes);
    state = after;
  }
  if (first400(viaChunks) !== reference) S.f6.add(`seed ${seed}: chunk-by-chunk generation differs at ${firstDifference(viaChunks, lanes)}`);
}

/** No two lanes may share an array or a mover object. */
function checkFresh(S: Sweep, seed: number, lanes: readonly Lane[]): void {
  const seen = new Set<object>();
  const claim = (o: object, at: string): void => {
    if (seen.has(o)) S.shapes.add(`${at}: shares an array or object with another lane`);
    seen.add(o);
  };
  for (const lane of lanes) {
    const at = `seed ${seed} row ${lane.row}`;
    if (lane.kind === 'grass') { claim(lane.blocked, at); claim(lane.obstacles, at); claim(lane.variant, at); claim(lane.edge, at); }
    else if (lane.kind === 'lily') claim(lane.pads, at);
    else if (lane.kind !== 'rail') { claim(lane.movers, at); for (const m of lane.movers) claim(m, at); }
  }
}

function checkSeed(S: Sweep, seed: number): void {
  const lanes = lanesOf(seed);
  if (lanes.length < ROWS) S.shapes.add(`seed ${seed}: generate() returned ${lanes.length} < ${ROWS} lanes`);
  for (let r = 0; r < lanes.length; r++) checkLane(S, seed, lanes, r);
  const reaches = checkReach(S, seed, lanes);
  checkRuns(S, seed, lanes);
  checkChunks(S, seed, lanes, reaches);
  if (seed <= SAMPLED) { checkFresh(S, seed, lanes); S.cache.set(seed, lanes); }
}

function sweep(): Sweep {
  const S = newSweep();
  for (let seed = 1; seed <= SEEDS; seed++) {
    try { checkSeed(S, seed); } catch (error) { S.crash.add(`seed ${seed}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`); }
  }
  return S;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Time-sampled helpers.
// ---------------------------------------------------------------------------------------------------------------------------

const spanX0 = new Float64Array(256), spanX1 = new Float64Array(256);
let spanCount = 0;
const collectSpan = (x0: number, x1: number): void => { spanX0[spanCount] = x0; spanX1[spanCount] = x1; spanCount++; };

/** Length of the vehicle-free stretch containing column c (0 when a vehicle covers c, or when the window has no vehicle on a side). */
function freeStretch(c: number): number {
  let left = -Infinity, right = Infinity;
  for (let i = 0; i < spanCount; i++) {
    if (spanX0[i] <= c && c <= spanX1[i]) return 0;
    if (spanX1[i] < c) left = Math.max(left, spanX1[i]); else right = Math.min(right, spanX0[i]);
  }
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : 0;
}

/** The literal F4b definition from the brief, deliberately naive. */
function bridgeLiteral(a: RiverLane, b: RiverLane): boolean {
  for (let w = 0; w <= 40; w++) {
    const t0 = w * 0.5;
    let ok = false;
    for (let k = 0; k <= 60 && !ok; k++) {
      const t = t0 + k * 0.05;
      for (let j = 0; j <= 80; j++) {
        const x = j * 0.1;
        if (platformAt(a, x, t) && platformAt(b, x, t) && platformAt(b, x, t + HOP_TIME)) { ok = true; break; }
      }
    }
    if (!ok) return false;
  }
  return true;
}

/** Every position of every vehicle, log and train at time t, as one flat list of numbers. */
function hazardSnapshot(lanes: readonly Lane[], t: number): number[] {
  const out: number[] = [], train = { x0: 0, x1: 0 };
  for (const lane of lanes) {
    if (lane.kind === 'road' || lane.kind === 'river') forEachMover(lane, t, -20, 30, (x0, x1, _mover, index) => out.push(lane.row, index, x0, x1));
    else if (lane.kind === 'rail') {
      const span = trainSpan(lane, t, train);
      out.push(lane.row, span === null ? -1e9 : span.x0, span === null ? -1e9 : span.x1);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Tests.
// ---------------------------------------------------------------------------------------------------------------------------

describe('mix and chunkRng', () => {
  it('mix returns the same unsigned 32-bit integer every time', () => {
    for (const [seed, k] of [[1, 0], [99, 5], [0xffffffff, 1234]]) {
      const h = mix(seed, k);
      expect(mix(seed, k)).toBe(h);
      expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
    }
  });

  it('mix keeps its known answers: a changed hash would silently re-roll every saved seed', () => {
    expect(mix(1, 0)).toBe(3950124170);
    expect(mix(1, 1)).toBe(350525680);
    expect(mix(2, 0)).toBe(140556409);
    expect(mix(12345, 7)).toBe(400063486);
    expect(mix(0xffffffff, 100)).toBe(1674134485);
    expect(mix(0, 0)).toBe(1684164658);
  });

  it('mix has no collisions across 5000 chunks of one seed or 5000 seeds of one chunk', () => {
    const byChunk = new Set<number>(), bySeed = new Set<number>();
    for (let i = 0; i < 5000; i++) { byChunk.add(mix(7, i)); bySeed.add(mix(i, 3)); }
    expect(byChunk.size).toBe(5000);
    expect(bySeed.size).toBe(5000);
  });

  it('mix flips about half of its output bits when any single input bit flips', () => {
    let flipped = 0, trials = 0;
    const popcount = (v: number): number => { let n = 0; for (let x = v >>> 0; x !== 0; x &= x - 1) n++; return n; };
    for (let seed = 1; seed <= 64; seed++) {
      for (let bit = 0; bit < 32; bit++) { flipped += popcount(mix(seed, 5) ^ mix((seed ^ (1 << bit)) >>> 0, 5)); trials++; }
    }
    const average = flipped / trials;
    expect(average).toBeGreaterThan(14);
    expect(average).toBeLessThan(18);
  });

  it('mix does not treat (seed, chunk) as interchangeable', () => {
    expect(mix(1, 2)).not.toBe(mix(2, 1));
  });

  it('chunkRng is mulberry32 seeded with mix(seed, chunk)', () => {
    const a = chunkRng(77, 4), b = mulberry32(mix(77, 4));
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it('chunkRng gives each chunk of a seed its own stream', () => {
    expect(chunkRng(77, 4)()).not.toBe(chunkRng(77, 5)());
    expect(chunkRng(77, 4)()).not.toBe(chunkRng(78, 4)());
  });
});

describe('initialState', () => {
  it('starts at row 0, chunk 0, after grass, with only the start column reachable', () => {
    expect(initialState(7)).toEqual({
      seed: 7, nextRow: 0, chunk: 0, prevKind: 'grass', hazardRun: 0,
      reach: [false, false, false, false, true, false, false, false, false],
    });
  });

  it('normalises the seed to an unsigned 32-bit integer', () => {
    expect(initialState(-1).seed).toBe(4294967295);
    expect(initialState(2 ** 32 + 5).seed).toBe(5);
    expect(initialState(1.9).seed).toBe(1);
  });

  it('returns a fresh reach array each time', () => {
    expect(initialState(1).reach).not.toBe(initialState(1).reach);
  });
});

describe('hedgeLane', () => {
  it('is a fully blocked row of trees with trees all along both edges', () => {
    for (const row of [-1, -3, -20]) {
      const lane = hedgeLane(row);
      expect(lane.kind).toBe('grass');
      expect(lane.row).toBe(row);
      expect(lane.blocked).toEqual(new Array(9).fill(true));
      expect(lane.obstacles).toEqual(new Array(9).fill('tree'));
      expect(lane.edge).toEqual(new Array(12).fill('tree'));
      expect(lane.variant).toHaveLength(9);
      expect(lane.variant.every((v) => v === 0 || v === 1 || v === 2)).toBe(true);
    }
  });

  it('alternates shade by row parity, also for negative rows', () => {
    expect(hedgeLane(-1).shade).toBe(1);
    expect(hedgeLane(-2).shade).toBe(0);
    expect(hedgeLane(-3).shade).toBe(1);
  });

  it('shares no array between lanes', () => {
    const a = hedgeLane(-1), b = hedgeLane(-1);
    expect(a.blocked).not.toBe(b.blocked);
    expect(a.obstacles).not.toBe(b.obstacles);
    expect(a.variant).not.toBe(b.variant);
    expect(a.edge).not.toBe(b.edge);
  });
});

describe('repairGrass', () => {
  // Hand-derived from the brief: (a) if no column is both reachable and open, clear the reachable column nearest column 4
  // (ties to the smaller); (b) while fewer than 3 columns are open, clear the blocked column nearest column 4 (ties to the
  // smaller); (c) the new reach floods along open cells from the open columns that were reachable.
  const blockedAt = (...columns: number[]): Obstacle[] => Array.from({ length: COLS }, (_, c) => (columns.includes(c) ? 'tree' : null));
  const openOnly = (...columns: number[]): Obstacle[] => Array.from({ length: COLS }, (_, c) => (columns.includes(c) ? null : 'rock'));
  const reachAt = (...columns: number[]): boolean[] => Array.from({ length: COLS }, (_, c) => columns.includes(c));
  const openColumns = (row: readonly Obstacle[]): number[] => row.flatMap((o, c) => (o === null ? [c] : []));

  it('leaves an open row alone and floods all of it', () => {
    const row = blockedAt();
    expect(repairGrass(row, reachAt(4))).toEqual(reachAt(0, 1, 2, 3, 4, 5, 6, 7, 8));
    expect(row).toEqual(blockedAt());
  });

  it('(a) clears the entry column when the only reachable column is blocked', () => {
    const row = blockedAt(4);
    expect(repairGrass(row, reachAt(4))).toEqual(reachAt(0, 1, 2, 3, 4, 5, 6, 7, 8));
    expect(row[4]).toBeNull();
  });

  it('(a) treats a rock like a tree', () => {
    const row: Obstacle[] = blockedAt();
    row[4] = 'rock';
    repairGrass(row, reachAt(4));
    expect(row[4]).toBeNull();
  });

  it('(a) clears the reachable column nearest the start column, not the leftmost or rightmost', () => {
    const row = blockedAt(0, 3, 8);
    expect(repairGrass(row, reachAt(0, 3, 8))).toEqual(reachAt(1, 2, 3, 4, 5, 6, 7));
    expect(row).toEqual(blockedAt(0, 8)); // only column 3 was cleared
  });

  it('(a) breaks a tie between equally near reachable columns towards the smaller column', () => {
    const row = blockedAt(2, 6);
    // Column 2 is cleared; the flood from it runs left to the edge and right up to the tree on column 6.
    expect(repairGrass(row, reachAt(2, 6))).toEqual(reachAt(0, 1, 2, 3, 4, 5));
    expect(row).toEqual(blockedAt(6));
  });

  it('(b) opens the blocked columns nearest the start column, ties to the smaller, until 3 are open', () => {
    const row = openOnly(0); // columns 1..8 blocked, entry column 0 open
    // Open columns 4 (distance 0) then 3 (tie with 5 at distance 1, the smaller wins). The player is still only in the pocket at 0.
    expect(repairGrass(row, reachAt(0))).toEqual(reachAt(0));
    expect(openColumns(row)).toEqual([0, 3, 4]);
  });

  it('(b) runs after (a) and counts the column (a) opened', () => {
    const row = blockedAt(0, 1, 2, 3, 4, 5, 6, 7, 8);
    // (a) opens reachable column 2; (b) then needs two more: column 4, then column 3 (tie with 5). Columns 2-4 form one open segment.
    expect(repairGrass(row, reachAt(2))).toEqual(reachAt(2, 3, 4));
    expect(openColumns(row)).toEqual([2, 3, 4]);
  });

  it('does not open anything when 3 columns are already open and the entry is reachable', () => {
    const row = openOnly(0, 1, 2);
    expect(repairGrass(row, reachAt(0))).toEqual(reachAt(0, 1, 2));
    expect(openColumns(row)).toEqual([0, 1, 2]);
  });

  it('(c) floods from every reachable open column but not past an obstacle', () => {
    const row = blockedAt(2, 6);
    // Columns 3-5 are open but cut off from both reachable pockets, so they are not reachable.
    expect(repairGrass(row, reachAt(0, 8))).toEqual(reachAt(0, 1, 7, 8));
    expect(row).toEqual(blockedAt(2, 6));
  });

  it('never modifies the reach it is given and returns a new array', () => {
    const reach = Object.freeze(reachAt(4));
    const out = repairGrass(blockedAt(4), reach);
    expect(out).not.toBe(reach);
    expect(reach).toEqual(reachAt(4));
  });
});

describe('generateChunk and generate', () => {
  it('the first chunk is rows 0 to 4, all grass, and advances the state past them', () => {
    const { lanes, state } = generateChunk(initialState(3));
    expect(lanes.map((l) => l.row)).toEqual([0, 1, 2, 3, 4]);
    expect(lanes.every((l) => l.kind === 'grass')).toBe(true);
    expect(state.nextRow).toBe(5);
    expect(state.chunk).toBe(1);
    expect(state.prevKind).toBe('grass');
    expect(state.hazardRun).toBe(0);
  });

  it('never mutates the state it is given, and returns a fresh state', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      let frozen = deepFreeze(initialState(seed)), plain = initialState(seed);
      for (let i = 0; i < 60; i++) {
        const a = generateChunk(frozen), b = generateChunk(plain);
        expect(a).toEqual(b);
        expect(a.state).not.toBe(frozen);
        expect(a.state.reach).not.toBe(frozen.reach);
        frozen = deepFreeze(a.state);
        plain = b.state;
      }
    }
  });

  it('generate() produces whole chunks until it has at least the requested rows', () => {
    const state = initialState(9);
    expect(generate(state, 0).lanes).toHaveLength(0);
    expect(generate(state, 1).lanes).toHaveLength(5); // one chunk
    expect(generate(state, 5).lanes).toHaveLength(5);
    const more = generate(state, 6);
    expect(more.lanes.length).toBeGreaterThanOrEqual(6);
    expect(more.state.nextRow).toBe(more.lanes.length);
    const big = generate(state, ROWS);
    expect(big.lanes.length).toBeGreaterThanOrEqual(ROWS);
    expect(big.state.nextRow).toBe(big.lanes.length);
    expect(big.lanes.map((l) => l.row)).toEqual(big.lanes.map((_, i) => i));
  });

  it('generate() refuses a row count it could never reach instead of generating forever', () => {
    expect(() => generate(initialState(1), Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => generate(initialState(1), Number.NaN)).toThrow(RangeError);
  });

  it('generate() hands back a state of its own, even when it generated nothing', () => {
    const state = deepFreeze(initialState(4));
    const out = generate(state, 0);
    expect(out.state).toEqual(state);
    expect(out.state).not.toBe(state);
    expect(out.state.reach).not.toBe(state.reach);
  });

  it('gives identical lanes however generate() batches are sized (first 50 seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const whole = generate(initialState(seed), ROWS).lanes;
      let state = initialState(seed);
      const parts: Lane[] = [];
      for (const n of [1, 37, 83, 1, 250]) {
        const out = generate(state, n);
        parts.push(...out.lanes);
        state = out.state;
      }
      const common = Math.min(parts.length, whole.length);
      expect(common).toBeGreaterThanOrEqual(372);
      expect(JSON.stringify(parts.slice(0, common)) === JSON.stringify(whole.slice(0, common)), `seed ${seed}`).toBe(true);
    }
  });
});

describe('logBridgeOk', () => {
  const log = (over: Partial<RiverLane> = {}): RiverLane => ({
    kind: 'river', row: 1, dir: 1, speed: 1, cycle: 8, phase: 0, movers: [{ offset: 0, len: 4, color: 0 }], ...over,
  });

  it('accepts two dense rows moving against each other: a shared column exists in every 3 s window', () => {
    const a = log(), b = log({ row: 2, dir: -1 });
    expect(logBridgeOk(a, b)).toBe(true);
    expect(bridgeLiteral(a, b)).toBe(true);
  });

  it('rejects rows that move together with complementary logs: no column is ever covered by both', () => {
    const a = log({ movers: [{ offset: 0, len: 2, color: 0 }] });
    const b = log({ row: 2, movers: [{ offset: 4, len: 2, color: 0 }] });
    expect(logBridgeOk(a, b)).toBe(false);
    expect(bridgeLiteral(a, b)).toBe(false);
  });

  it('rejects rows that bridge at the start but drift apart: some 3 s window has no bridge', () => {
    // One log per 40 tiles, moving against each other at 1 tile/s: they overlap in the band only during the first ~1.2 s.
    const a = log({ cycle: 40, movers: [{ offset: 0, len: 2, color: 0 }] });
    const b = log({ row: 2, dir: -1, cycle: 40, movers: [{ offset: 0, len: 2, color: 0 }] });
    expect(logBridgeOk(a, b)).toBe(false);
    expect(bridgeLiteral(a, b)).toBe(false);
  });

  it('also needs the lower row under the landing point one hop later, not just at take-off', () => {
    // Row b's logs (2 tiles + grace) move 3.6 tiles during one hop at speed 30, so no x is covered both at t and at t + HOP_TIME.
    const a = log({ cycle: 8 });
    const b = log({ row: 2, dir: -1, speed: 30, cycle: 20, movers: [{ offset: 0, len: 2, color: 0 }] });
    expect(logBridgeOk(a, b)).toBe(false);
    expect(bridgeLiteral(a, b)).toBe(false);
  });

  it('agrees with the literal definition on 300 random pairs, whether they bridge or not', () => {
    // Sparse, short-logged, slow and fast rows in either direction: about half of these pairs miss some 3 s window.
    const rng = mulberry32(2024);
    const randomRow = (dir: -1 | 1): RiverLane => {
      const n = 1 + Math.floor(rng() * 3);
      const movers: RiverLane['movers'] = [];
      let cycle = 0;
      for (let i = 0; i < n; i++) {
        const len = 0.3 + rng() * 1.2;
        movers.push({ offset: cycle, len, color: 0 });
        cycle += len + 3 + rng() * 9;
      }
      return { kind: 'river', row: 1, dir, speed: 0.5 + rng() * 3.5, cycle, phase: rng() * cycle, movers };
    };
    let bridging = 0;
    for (let i = 0; i < 300; i++) {
      const a = randomRow(1), b = randomRow(rng() < 0.75 ? -1 : 1);
      const expected = bridgeLiteral(a, b);
      if (expected) bridging++;
      expect(logBridgeOk(a, b), `pair ${i}`).toBe(expected);
    }
    expect(bridging).toBeGreaterThan(90);
    expect(bridging).toBeLessThan(210);
  });
});

describe('fitLogRow', () => {
  // Random rows essentially never fail the bridge check, so the enforcement tiers are driven with a scripted rng and a
  // scripted predicate. Shape: logs 2, 3, 4 with gaps 3, 2.5, 3.5 -> offsets 0, 5, 10.5 and cycle 18. With every gap at the
  // minimum (2) the cycle is 15 and the offsets are 0, 4, 9.
  const shape: LogShape = { speed: 1.5, lens: [2, 3, 4], gaps: [3, 2.5, 3.5], colors: [0, 1, 2] };
  const below: RiverLane = { kind: 'river', row: 8, dir: 1, speed: 1, cycle: 8, phase: 0, movers: [{ offset: 0, len: 4, color: 0 }] };
  const isTight = (lane: RiverLane): boolean => lane.cycle === 15;

  function scripted(values: readonly number[]): { rng: () => number; used: () => number } {
    let i = 0;
    return {
      rng: () => {
        if (i >= values.length) throw new Error(`the rng was asked for draw ${i + 1} but only ${values.length} were scripted`);
        return values[i++];
      },
      used: () => i,
    };
  }
  function spy(accept: (lane: RiverLane) => boolean): { ok: (a: RiverLane, b: RiverLane) => boolean; tried: RiverLane[] } {
    const tried: RiverLane[] = [];
    return { ok: (_a, b) => { tried.push({ ...b }); return accept(b); }, tried };
  }

  it('lays the shape out cumulatively and draws one phase when there is no log row below', () => {
    const { rng, used } = scripted([0.25]);
    const { ok, tried } = spy(() => false);
    const lane = fitLogRow(shape, 9, -1, null, rng, ok);
    expect(lane).toEqual({
      kind: 'river', row: 9, dir: -1, speed: 1.5, cycle: 18, phase: 4.5,
      movers: [{ offset: 0, len: 2, color: 0 }, { offset: 5, len: 3, color: 1 }, { offset: 10.5, len: 4, color: 2 }],
    });
    expect(used()).toBe(1);
    expect(tried).toHaveLength(0); // nothing to bridge, so the check is never consulted
  });

  it('keeps the first draw when it already bridges', () => {
    const { rng, used } = scripted([0.25, 0.5]);
    const { ok, tried } = spy(() => true);
    const lane = fitLogRow(shape, 9, 1, below, rng, ok);
    expect(lane.phase).toBe(4.5);
    expect(used()).toBe(1);
    expect(tried).toHaveLength(1);
  });

  it('re-rolls only the phase, with the chunk rng, until the pair bridges', () => {
    const { rng, used } = scripted([0.125, 0.25, 0.625, 0.875]);
    const { ok, tried } = spy((lane) => lane.phase >= 9);
    const lane = fitLogRow(shape, 9, 1, below, rng, ok);
    expect(tried.map((l) => l.phase)).toEqual([2.25, 4.5, 11.25]);
    expect(lane.phase).toBe(11.25);
    expect(lane.cycle).toBe(18);
    expect(lane.movers.map((m) => m.offset)).toEqual([0, 5, 10.5]); // the gaps were not touched
    expect(used()).toBe(3);
  });

  it('gives up on a shape after 8 phase re-rolls and falls back to minimum gaps', () => {
    // Nine phases (the draw and 8 re-rolls) are tried on the original gaps, then one on the tight layout, which passes.
    const draws = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.0625, 0.9375, 0.25, 0.99];
    const { rng, used } = scripted(draws);
    const { ok, tried } = spy(isTight);
    const lane = fitLogRow(shape, 9, 1, below, rng, ok);
    expect(tried).toHaveLength(10);
    expect(tried.slice(0, 9).every((l) => l.cycle === 18)).toBe(true);
    expect(tried[9].cycle).toBe(15);
    expect(lane).toEqual({
      kind: 'river', row: 9, dir: 1, speed: 1.5, cycle: 15, phase: 3.75,
      movers: [{ offset: 0, len: 2, color: 0 }, { offset: 4, len: 3, color: 1 }, { offset: 9, len: 4, color: 2 }],
    });
    expect(used()).toBe(10);
  });

  it('re-rolls the phase of the minimum-gap layout too, up to 8 more times', () => {
    // Tight layout from the 10th draw (0.25 -> 3.75, rejected), then re-rolls until the phase reaches 12.
    const draws = [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.25, 0.375, 0.5, 0.875, 0.99];
    const { rng, used } = scripted(draws);
    const { ok, tried } = spy((lane) => isTight(lane) && lane.phase >= 12);
    const lane = fitLogRow(shape, 9, 1, below, rng, ok);
    expect(lane.phase).toBe(13.125);
    expect(lane.cycle).toBe(15);
    expect(tried.slice(9).map((l) => l.phase)).toEqual([3.75, 5.625, 7.5, 13.125]);
    expect(used()).toBe(13);
  });

  it('returns the last candidate, a valid minimum-gap row, after 18 draws when nothing bridges', () => {
    const draws = Array.from({ length: 18 }, (_, i) => (i + 1) / 32);
    const { rng, used } = scripted([...draws, 0.5]);
    const { ok, tried } = spy(() => false);
    const lane = fitLogRow(shape, 9, -1, below, rng, ok);
    expect(used()).toBe(18); // 1 + 8 on the original gaps, 1 + 8 on the tight ones
    expect(tried).toHaveLength(18);
    expect(lane.cycle).toBe(15);
    expect(lane.phase).toBe((18 / 32) * 15);
    expect(lane.row).toBe(9);
    expect(lane.dir).toBe(-1);
    expect(lane.movers.map((m) => m.len)).toEqual([2, 3, 4]);
  });

  it('terminates with the real check even when no row could ever bridge', () => {
    // `below` has one log per 40 tiles: during some 3 s window the band holds none of it, whatever this row does.
    const sparse: RiverLane = { kind: 'river', row: 8, dir: 1, speed: 1, cycle: 40, phase: 0, movers: [{ offset: 0, len: 2, color: 0 }] };
    const { rng, used } = scripted(Array.from({ length: 40 }, (_, i) => ((i * 7) % 20) / 20));
    const lane = fitLogRow(shape, 9, 1, sparse, rng);
    expect(used()).toBe(18);
    expect(lane.movers).toHaveLength(3);
    expect(Number.isFinite(lane.phase)).toBe(true);
  });

  it('with the real check and a dense row below, the first draw is kept', () => {
    const dense: RiverLane = { kind: 'river', row: 8, dir: -1, speed: 1, cycle: 8, phase: 0, movers: [{ offset: 0, len: 4, color: 0 }] };
    const { rng, used } = scripted([0.37]);
    const lane = fitLogRow(shape, 9, 1, dense, rng);
    expect(used()).toBe(1);
    expect(logBridgeOk(dense, lane)).toBe(true);
  });
});

describe('river chunks and the bridge check', () => {
  it('checks every pair of adjacent log rows, and only those, never across a lily row or against land', () => {
    // Random rows essentially never fail the check, so this watches the check being asked: platformAt is its only caller here.
    const spy = vi.spyOn(laneMath, 'platformAt');
    try {
      let pairs = 0, withLily = 0;
      for (let seed = 1; seed <= 60; seed++) {
        spy.mockClear();
        const lanes = generate(initialState(seed), 200).lanes;
        const asked = new Set<number>();
        for (const call of spy.mock.calls) asked.add((call[0] as { row: number }).row);
        const expected = new Set<number>();
        for (let r = 1; r < lanes.length; r++) {
          if (lanes[r - 1].kind === 'river' && lanes[r].kind === 'river') { expected.add(r - 1); expected.add(r); pairs++; }
          if (lanes[r].kind === 'lily') withLily++;
        }
        expect([...asked].sort((x, y) => x - y), `seed ${seed}`).toEqual([...expected].sort((x, y) => x - y));
      }
      expect(pairs).toBeGreaterThan(20);
      expect(withLily).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('World', () => {
  const trees = (lane: Lane): GrassLane => grassOf(lane);

  it('keeps the seed (as an unsigned integer) and starts with nothing generated', () => {
    expect(new World(5).seed).toBe(5);
    expect(new World(-1).seed).toBe(4294967295);
    expect(new World(5).generatedTo).toBe(-1);
  });

  it('generates whole chunks on demand and reports the last generated row', () => {
    const world = new World(11);
    world.ensure(0);
    expect(world.generatedTo).toBe(4); // chunk 0 is rows 0..4
    world.ensure(4);
    expect(world.generatedTo).toBe(4);
    world.ensure(5);
    expect(world.generatedTo).toBeGreaterThanOrEqual(5);
    const reference = generate(initialState(11), 6);
    expect(world.generatedTo).toBe(reference.lanes.length - 1); // exactly the chunks generate() needs for six rows
  });

  it('lane() generates what it needs, even when the first request is far ahead', () => {
    const reference = generate(initialState(21), ROWS).lanes;
    const world = new World(21);
    expect(JSON.stringify(world.lane(399))).toBe(JSON.stringify(reference[399]));
    expect(world.generatedTo).toBeGreaterThanOrEqual(399);
    expect(JSON.stringify(world.lane(0))).toBe(JSON.stringify(reference[0]));
  });

  it('caches: every call for a row returns the same lane object', () => {
    const world = new World(3);
    expect(world.lane(10)).toBe(world.lane(10));
    expect(world.lane(-4)).toBe(world.lane(-4));
    world.prune(100);
    expect(world.lane(2)).toBe(world.lane(2));
  });

  it('lane(-3) is a fully blocked hedge', () => {
    const lane = trees(new World(3).lane(-3));
    expect(lane.row).toBe(-3);
    expect(lane).toEqual(hedgeLane(-3));
    expect(lane.blocked.every(Boolean)).toBe(true);
    expect(lane.obstacles.every((o) => o === 'tree')).toBe(true);
  });

  it('prune(100) turns lane(50) into an obstacle-free grass lane and keeps rows from 100 up untouched', () => {
    const world = new World(8);
    world.ensure(160);
    const kept = [100, 101, 130, 160].map((r) => world.lane(r));
    const wasGenerated = JSON.stringify(world.lane(50));
    world.prune(100);
    const open = trees(world.lane(50));
    expect(open.kind).toBe('grass');
    expect(open.row).toBe(50);
    expect(open.shade).toBe(0);
    expect(open.blocked.some(Boolean)).toBe(false);
    expect(open.obstacles.every((o) => o === null)).toBe(true);
    expect(open.edge.every((o) => o === null)).toBe(true);
    expect(JSON.stringify(open)).not.toBe(wasGenerated);
    expect(trees(world.lane(99)).obstacles.every((o) => o === null)).toBe(true);
    expect([100, 101, 130, 160].map((r) => world.lane(r))).toEqual(kept);
    [100, 101, 130, 160].forEach((r, i) => expect(world.lane(r)).toBe(kept[i]));
  });

  it('prune also works before anything above the cut was generated, and a smaller cut later forgets nothing more', () => {
    const world = new World(8);
    world.prune(100);
    expect(trees(world.lane(50)).obstacles.every((o) => o === null)).toBe(true);
    expect(world.generatedTo).toBe(-1); // no generation was needed to answer for a pruned row
    const at150 = world.lane(150);
    const at120 = world.lane(120);
    expect(world.generatedTo).toBeGreaterThanOrEqual(150);
    // Generating up to 150 produced rows 0..99 on the way; they are below the cut, so they are not kept: every one reads as open grass.
    for (let r = 0; r < 100; r++) {
      const lane = trees(world.lane(r)); // throws unless the row is grass
      expect(lane.obstacles.every((o) => o === null) && lane.edge.every((e) => e === null), `row ${r}`).toBe(true);
    }
    world.prune(10);
    expect(world.lane(150)).toBe(at150);
    expect(world.lane(120)).toBe(at120);
    expect(trees(world.lane(50)).obstacles.every((o) => o === null)).toBe(true); // the cut stayed at 100
  });

  it('pruning never changes the rows generated afterwards', () => {
    const plain = new World(13), pruned = new World(13);
    plain.ensure(300);
    pruned.ensure(300);
    pruned.prune(250);
    plain.ensure(480);
    pruned.ensure(480);
    for (let r = 250; r <= 480; r++) expect(JSON.stringify(pruned.lane(r)), `row ${r}`).toBe(JSON.stringify(plain.lane(r)));
  });

  it('override replaces exactly the given rows with deep copies and leaves every other row alone', () => {
    const reference = generate(initialState(5), 30).lanes;
    const world = new World(5);
    const road: RoadLane = { kind: 'road', row: 7, dir: -1, speed: 2, vehicle: 'car', cycle: 12, phase: 1, movers: [{ offset: 0, len: 1, color: 0 }, { offset: 4, len: 1, color: 1 }, { offset: 8, len: 1, color: 2 }] };
    const rail: RailLane = { kind: 'rail', row: 9, dir: 1, speed: 18, length: 12, period: 6, phase: 2, color: 1 };
    world.override([road, rail]);
    expect(world.generatedTo).toBeGreaterThanOrEqual(9);
    expect(world.lane(7)).toEqual(road);
    expect(world.lane(9)).toEqual(rail);
    expect(world.lane(7)).not.toBe(road);
    for (const row of [0, 1, 2, 3, 4, 5, 6, 8]) expect(JSON.stringify(world.lane(row)), `row ${row}`).toBe(JSON.stringify(reference[row]));
    // The world owns its copies: later edits of the caller's objects do not leak in.
    road.movers[0].offset = 3;
    road.dir = 1;
    expect((world.lane(7) as RoadLane).movers[0].offset).toBe(0);
    expect((world.lane(7) as RoadLane).dir).toBe(-1);
    // Rows beyond the override are still the generated ones.
    expect(JSON.stringify(world.lane(20))).toBe(JSON.stringify(generate(initialState(5), 30).lanes[20]));
  });

  it('override deep-copies every kind of lane, down to the nested arrays and movers', () => {
    const grass: GrassLane = {
      kind: 'grass', row: 1, shade: 1, blocked: [true, ...Array(8).fill(false)], obstacles: ['tree', ...Array(8).fill(null)],
      variant: Array(9).fill(1), edge: Array(12).fill(null),
    };
    const river: RiverLane = { kind: 'river', row: 2, dir: 1, speed: 1.5, cycle: 12, phase: 3, movers: [{ offset: 0, len: 2, color: 1 }] };
    const lily: Lane = { kind: 'lily', row: 3, pads: [true, ...Array(8).fill(false)] };
    const rail: RailLane = { kind: 'rail', row: 4, dir: -1, speed: 18, length: 14, period: 6, phase: 1, color: 2 };
    const road: RoadLane = { kind: 'road', row: 5, dir: 1, speed: 3, vehicle: 'truck', cycle: 16, phase: 4, movers: [{ offset: 0, len: 3, color: 0 }] };
    const given: Lane[] = [grass, river, lily, rail, road];
    const snapshot = JSON.stringify(given);
    const world = new World(2);
    world.override(given);
    for (const lane of given) expect(world.lane(lane.row)).toEqual(lane);
    // Edit every nested part of the caller's lanes; the world must not notice.
    grass.blocked[0] = false; grass.obstacles[0] = null; grass.variant[0] = 2; grass.edge[0] = 'rock';
    river.movers[0].len = 4; river.speed = 9;
    (lily as { pads: boolean[] }).pads[0] = false;
    rail.length = 20;
    road.movers[0].offset = 5; road.vehicle = 'car';
    expect(JSON.stringify(given.map((lane) => world.lane(lane.row)))).toBe(snapshot);
  });

  it('rejects rows that are not integers instead of generating forever', () => {
    const world = new World(1);
    expect(() => world.lane(1.5)).toThrow(RangeError);
    expect(() => world.lane(-1.5)).toThrow(RangeError);
    expect(() => world.lane(Number.NaN)).toThrow(RangeError);
    expect(() => world.ensure(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(world.generatedTo).toBe(-1); // nothing was generated on the way
  });

  it('override can replace a hedge row behind the start, and only that row', () => {
    const world = new World(1);
    const gap: GrassLane = { ...hedgeLane(-2), blocked: Array(9).fill(false), obstacles: Array(9).fill(null) };
    world.override([gap]);
    expect(world.lane(-2)).toEqual(gap);
    expect(world.lane(-2)).not.toBe(gap);
    expect(trees(world.lane(-1)).blocked.every(Boolean)).toBe(true);
    expect(trees(world.lane(-3)).blocked.every(Boolean)).toBe(true);
  });

  it('override validates every row before it changes anything', () => {
    const world = new World(1);
    const rail: RailLane = { kind: 'rail', row: 2, dir: 1, speed: 18, length: 12, period: 6, phase: 2, color: 0 };
    // The highest row (3) is fine, so only checking every row catches 2.5.
    expect(() => world.override([{ ...rail, row: 2.5 }, { ...rail, row: 3 }])).toThrow(RangeError);
    expect(world.generatedTo).toBe(-1);
    expect(world.lane(3).kind).not.toBe('rail'); // the valid lane was not stored either
  });
});

describe('the world a seed produces stays the same', () => {
  // Crossy Road starts its own save namespace. These first-release pins include
  // the 1.5-tile car silhouette; saves under any previous game id are not imported.
  // GOLDEN MASTER. A saved run stores only its seed and rebuilds its world from it. Rows 0-59 of seeds 1 and 2024 are pinned to
  // a fingerprint of the generator as it is now. If this fails, "changing this means saved runs replay a different world: bump
  // the save version or migrate" (and only then update the constants below).
  const GOLDEN: ReadonlyArray<readonly [seed: number, fingerprint: string]> = [
    [1, '1d9a2a2a'],
    [2024, '76f3dd25'],
  ];

  /** Numbers rounded to 1e-9 and object keys sorted, so only a change to the world (not float noise below 1e-9, nor the order
   * fields are written in) changes the text that gets hashed. */
  const canonical = (_key: string, value: unknown): unknown => {
    if (typeof value === 'number') return Math.round(value * 1e9) / 1e9;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return value;
  };
  /** FNV-1a, 32 bits, over the UTF-16 code units of the text, as 8 hex digits. */
  const fnv1a = (text: string): string => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  const fingerprint = (value: unknown): string => fnv1a(JSON.stringify(value, canonical));

  for (const [seed, expected] of GOLDEN) {
    it(`seed ${seed}: rows 0-59 are the world saved runs expect`, () => {
      const lanes = generate(initialState(seed), 60).lanes.slice(0, 60);
      expect(lanes).toHaveLength(60);
      const actual = fingerprint(lanes);
      expect(actual, `seed ${seed} now builds a different world (fingerprint ${actual}): changing this means saved runs replay a different world: bump the save version or migrate`).toBe(expected);
    });
  }

  it('the fingerprint hash is FNV-1a: it reproduces the published 32-bit test vectors', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(fnv1a('foobar')).toBe('bf9cf968');
  });

  it('the fingerprint reacts to any real change but ignores key order and float noise below 1e-9', () => {
    const rail = { kind: 'rail', row: 7, dir: 1, speed: 18, length: 14, period: 6, phase: 2.5, color: 1 };
    const base = fingerprint([rail]);
    expect(fingerprint([{ ...rail, phase: 2.5 + 1e-12 }])).toBe(base);
    expect(fingerprint([{ color: 1, phase: 2.5, period: 6, length: 14, speed: 18, dir: 1, row: 7, kind: 'rail' }])).toBe(base);
    expect(fingerprint([{ ...rail, phase: 2.5 + 1e-8 }])).not.toBe(base);
    expect(fingerprint([{ ...rail, color: 2 }])).not.toBe(base);
    expect(fingerprint([{ ...rail, row: 8 }])).not.toBe(base);
    expect(fingerprint([rail, rail])).not.toBe(base);
  });

  it('the two pinned seeds are different worlds, so the pins are not the same constant twice', () => {
    expect(fingerprint(generate(initialState(1), 60).lanes.slice(0, 60))).not.toBe(fingerprint(generate(initialState(2024), 60).lanes.slice(0, 60)));
  });
});

describe('F6 determinism: hazards', () => {
  it('two independent generations give identical positions for every vehicle, log and train at t = 12.345 (50 seeds)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const a = hazardSnapshot(lanesOf(seed), 12.345), b = hazardSnapshot(lanesOf(seed), 12.345);
      expect(a.length).toBeGreaterThan(200);
      expect(a, `seed ${seed}`).toEqual(b);
    }
  });

  it('different seeds give different worlds', () => {
    const worlds = [1, 2, 3, 4, 5, 6].map((seed) => first400(lanesOf(seed)));
    expect(new Set(worlds).size).toBe(worlds.length);
    const starts = [1, 2, 3, 4, 5, 6].map((seed) => JSON.stringify(lanesOf(seed).slice(0, 5)));
    expect(new Set(starts).size).toBe(starts.length);
  });
});

it('generated cars have the longer 1.5-tile reference silhouette with matching collision spans', () => {
  const cars = lanesOf(7).filter((l): l is RoadLane => l.kind === 'road' && l.vehicle === 'car');
  expect(cars.length).toBeGreaterThan(0);
  for (const lane of cars) for (const mover of lane.movers) expect(mover.len).toBe(1.5);
});

describe(`CrossyRoad worlds over ${SEEDS} seeds x ${ROWS} rows`, () => {
  let S!: Sweep;
  beforeAll(() => { S = sweep(); });

  it('generates every seed without throwing, and every sweep rule was exercised many times', () => {
    expectNone(S.crash);
    expect(S.seen.chunks).toBeGreaterThan(100_000);
    for (const [key, atLeast] of [
      ['grass', 100_000], ['road', 100_000], ['truck', 10_000], ['river', 50_000], ['lily', 1_000], ['rail', 30_000], ['doubleRail', 500],
      ['landToRiver', 10_000], ['lilyToRiver', 1_000], ['riverPairs', 10_000], ['hazardTriples', 5_000],
    ] as const) expect(S.seen[key] ?? 0, key).toBeGreaterThanOrEqual(atLeast);
  });

  it('F6: World.ensure steps (37, 120, 399) and chunk-by-chunk generation reproduce generate() on every seed', () => {
    expectNone(S.f6);
  });

  it('F1: every row has a reachable column, and every grass row a reachable open column (independent BFS)', () => {
    expectNone(S.f1);
  });

  it('F2: every grass row has at least 3 open columns, and rows 0-4 are grass with columns 2-6 open', () => {
    expectNone(S.f2);
  });

  it('F3: every road gap is at least roadGapMin(speed) and 3 tiles, and leaves a standing player CROSS_WINDOW seconds', () => {
    expectNone(S.f3);
  });

  it('F4 land to river: no fixed column is without a log for more than RIVER_WAIT seconds', () => {
    expectNone(S.f4);
  });

  it('F4b river to river: adjacent log rows run in opposite directions and every passing log covers 0.4 s', () => {
    expectNone(S.f4b);
  });

  it('F5: every rail lane has period >= 5 and leaves 2 s of quiet after the light lead and the train clearing the band', () => {
    expect(WARN_LEAD).toBeGreaterThanOrEqual(WARN_FLOOR);
    expectNone(S.f5);
  });

  it('F7: every lily row has 9 pad flags with 3-5 pads and river rows on both sides', () => {
    expect(S.seen.lily).toBeGreaterThan(1_000);
    expectNone(S.f7);
  });

  it('chunk rules: run lengths, no repeated kinds, hazard caps, lily placement, direction alternation', () => {
    expectNone(S.runs);
    expectNone(S.chunks);
  });

  it('shapes and ranges: lane.row, array sizes, blocked/obstacles agreement, speeds, lengths, gaps, palettes, no shared arrays', () => {
    expectNone(S.shapes);
  });

  it('parameters follow the brief: difficulty ramps speeds and density, and the random choices have the stated odds', () => {
    // Early rows (5..19) have difficulty about 0.04, rows from 300 have difficulty 1. Jitter averages 1.
    expect(mean(S, 'roadSpeed.early')).toBeGreaterThan(1.55);
    expect(mean(S, 'roadSpeed.early')).toBeLessThan(1.7);
    expect(mean(S, 'roadSpeed.late')).toBeGreaterThan(4.4);
    expect(mean(S, 'roadSpeed.late')).toBeLessThan(4.6);
    expect(mean(S, 'riverSpeed.early')).toBeGreaterThan(1.0);
    expect(mean(S, 'riverSpeed.early')).toBeLessThan(1.15);
    expect(mean(S, 'riverSpeed.late')).toBeGreaterThan(2.5);
    expect(mean(S, 'riverSpeed.late')).toBeLessThan(2.7);
    expect(mean(S, 'railPeriod.early')).toBeGreaterThan(8.3);
    expect(mean(S, 'railPeriod.early')).toBeLessThan(9.1);
    expect(mean(S, 'railPeriod.late')).toBeGreaterThan(5);
    expect(mean(S, 'railPeriod.late')).toBeLessThan(5.4);
    expect(mean(S, 'truck.early')).toBeGreaterThan(0.17);
    expect(mean(S, 'truck.early')).toBeLessThan(0.25);
    expect(mean(S, 'truck.late')).toBeGreaterThan(0.37);
    expect(mean(S, 'truck.late')).toBeLessThan(0.43);
    expect(mean(S, 'density.early')).toBeGreaterThan(0.08);
    expect(mean(S, 'density.early')).toBeLessThan(0.14);
    expect(mean(S, 'density.late')).toBeGreaterThan(0.27);
    expect(mean(S, 'density.late')).toBeLessThan(0.31);
    expect(mean(S, 'tree')).toBeGreaterThan(0.67); // trees are 70 % of obstacles
    expect(mean(S, 'tree')).toBeLessThan(0.73);
    expect(mean(S, 'startEdge')).toBeGreaterThan(0.31); // chunk 0: columns 0, 1, 7, 8 hold an obstacle with p 0.35
    expect(mean(S, 'startEdge')).toBeLessThan(0.39);
    expect(mean(S, 'roadFlip')).toBeGreaterThan(0.66); // later road rows flip direction with p 0.7
    expect(mean(S, 'roadFlip')).toBeLessThan(0.74);
    expect(mean(S, 'roadFirstDir')).toBeGreaterThan(0.47);
    expect(mean(S, 'roadFirstDir')).toBeLessThan(0.53);
    expect(mean(S, 'lilyInThree')).toBeGreaterThan(0.26); // a three-row river has a lily row with p 0.3
    expect(mean(S, 'lilyInThree')).toBeLessThan(0.34);
    expect(mean(S, 'doubleRail')).toBeGreaterThan(0.21); // from row 120 a rail chunk has two tracks with p 0.25
    expect(mean(S, 'doubleRail')).toBeLessThan(0.29);
  });

  it('parameters follow the brief: gaps, log lengths, decoration, pads and thickness have the stated distributions', () => {
    // Road gaps before row 20: lerp(6, 3, d) * (0.85 + 0.6 u) with d about 0.04, never clamped there: mean about 5.88 * 1.15.
    near(mean(S, 'roadGap.early'), 6.76, 0.1, 'early road gap');
    // River gaps: clamp(lerp(2, 4, d) * jitter, 2, max). Early (d about 0.04) the clamp at 2 lifts the mean to about 2.12; at d = 1
    // the cap at 4 gives 0.5 * 3.7 + 0.5 * 4 = 3.85.
    near(mean(S, 'riverGap.early'), 2.12, 0.05, 'early river gap');
    near(mean(S, 'riverGap.late'), 3.85, 0.05, 'late river gap');
    // Log lengths 2/3/4 with weights (lerp(.1,.6,d), .3, lerp(.6,.1,d)): mean 3.5 - d.
    near(mean(S, 'logLen.early'), 3.46, 0.07, 'early log length');
    near(mean(S, 'logLen.late'), 2.5, 0.03, 'late log length');
    near(mean(S, 'variantTwo'), 1 / 3, 0.01, 'share of variant 2');
    near(mean(S, 'edgeDecor'), 0.45, 0.005, 'edge decoration density');
    near(mean(S, 'edgeTree'), 0.7, 0.005, 'edge decoration tree share');
    near(mean(S, 'pads'), 4, 0.06, 'pads per lily row'); // uniform on 3, 4, 5
    near(mean(S, 'padColumn'), 4, 0.06, 'mean pad column'); // distinct columns drawn uniformly from 0..8
    near(mean(S, 'railDir'), 0.5, 0.02, 'share of right-moving trains');
    near(mean(S, 'logFirstDir'), 0.5, 0.02, 'share of right-moving first log rows');
    // Thickness is uniform on 1..N: grass 1..5 before row 20 then 1..3, road 1..2 then 1..4, river 1..3.
    near(mean(S, 'thickness.grass.early'), 3, 0.15, 'early grass thickness');
    near(mean(S, 'thickness.grass.later'), 2, 0.03, 'grass thickness');
    near(mean(S, 'thickness.road.early'), 1.5, 0.06, 'early road thickness');
    near(mean(S, 'thickness.road.later'), 2.5, 0.03, 'road thickness');
    near(mean(S, 'thickness.river.later'), 2, 0.03, 'river thickness');
  });

  it('every palette colour is used by vehicles, logs and trains, and chunk 1 and later kinds follow the weights', () => {
    for (const [label, palette] of [['vehicle', VEHICLE_PALETTE], ['log', LOG_PALETTE], ['train', TRAIN_PALETTE]] as const) {
      for (let k = 0; k < palette; k++) expect(S.seen[`colour.${label}.${k}`] ?? 0, `${label} colour ${k}`).toBeGreaterThan(1_000);
    }
    // Chunk 1 follows grass, so a grass pick becomes road: P(road) = grass + road, with weights at difficulty 5/300.
    const first = (kind: string): number => (S.seen[`first.${kind}`] ?? 0) / SEEDS;
    expect(first('grass')).toBe(0);
    near(first('road'), 0.718, 0.04, 'chunk 1 road');
    near(first('river'), 0.161, 0.04, 'chunk 1 river');
    near(first('rail'), 0.121, 0.04, 'chunk 1 rail');
    // From row 300 the weights are grass .22, road .38, river .22, rail .18; a pick equal to the previous kind becomes
    // grass (road after grass). Chunks forced to grass by the hazard cap are not counted.
    const late: Record<string, Record<string, number>> = {
      grass: { grass: 0, road: 0.6, river: 0.22, rail: 0.18 },
      road: { grass: 0.6, road: 0, river: 0.22, rail: 0.18 },
      river: { grass: 0.44, road: 0.38, river: 0, rail: 0.18 },
      rail: { grass: 0.4, road: 0.38, river: 0.22, rail: 0 },
    };
    for (const [from, row] of Object.entries(late)) {
      expect(S.seen[`from.${from}`] ?? 0, `chunks after ${from}`).toBeGreaterThan(3_000);
      for (const [to, p] of Object.entries(row)) near((S.seen[`to.${from}.${to}`] ?? 0) / S.seen[`from.${from}`], p, 0.02, `${from} -> ${to}`);
    }
  });

  describe(`time-sampled checks on the first ${SAMPLED} seeds`, () => {
    it('F3: at every 0.05 s over 20 s some column sits in a vehicle-free stretch of at least 2.5 tiles', () => {
      const bad = new Bad();
      let checked = 0;
      for (const [seed, lanes] of S.cache) {
        for (const lane of lanes) {
          if (lane.kind !== 'road') continue;
          for (let i = 0; i <= 400; i++) {
            const t = i * 0.05;
            spanCount = 0;
            forEachMover(lane, t, -20, 30, collectSpan);
            let best = 0;
            for (let c = 0; c < COLS && best < 2.5; c++) best = Math.max(best, freeStretch(c));
            if (best < 2.5) bad.add(`seed ${seed} row ${lane.row} t ${t}: best free stretch ${best}`);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(1_000_000);
      expectNone(bad);
    });

    it('F4: from the columns reachable in the row before, a log is under some column in every 3 s window', () => {
      const bad = new Bad();
      let rows = 0;
      for (const [seed, lanes] of S.cache) {
        const reaches = reachAfterEachRow(lanes);
        for (let r = 1; r < lanes.length; r++) {
          const lane = lanes[r];
          if (lane.kind !== 'river' || lanes[r - 1].kind === 'river') continue;
          const columns: number[] = [];
          reaches[r - 1].forEach((on, c) => { if (on) columns.push(c); });
          rows++;
          for (let w = 0; w <= 40; w++) {
            const t0 = w * 0.5;
            let found = false;
            for (let k = 0; k <= 60 && !found; k++) {
              const t = t0 + k * 0.05;
              for (const c of columns) if (platformAt(lane, c, t)) { found = true; break; }
            }
            if (!found) bad.add(`seed ${seed} row ${r}: no log over columns [${columns}] in [${t0}, ${t0 + 3}]`);
          }
        }
      }
      expect(rows).toBeGreaterThan(2_000);
      expectNone(bad);
    });

    it('F4b: logBridgeOk is true for every adjacent log pair (the generator enforces it on each pair)', () => {
      const bad = new Bad();
      let pairs = 0;
      for (const [seed, lanes] of S.cache) {
        for (let r = 1; r < lanes.length; r++) {
          const a = lanes[r - 1], b = lanes[r];
          if (a.kind !== 'river' || b.kind !== 'river') continue;
          pairs++;
          if (!logBridgeOk(a, b)) bad.add(`seed ${seed} rows ${r - 1}/${r}: no log-to-log bridge in some 3 s window`);
        }
      }
      expect(pairs).toBeGreaterThan(1_000);
      expectNone(bad);
    });

    it('F4b: the literal definition (3 s windows, x in steps of 0.1, hop of HOP_TIME) agrees on the first 40 seeds', () => {
      const bad = new Bad();
      let pairs = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const lanes = S.cache.get(seed) as Lane[];
        for (let r = 1; r < lanes.length; r++) {
          const a = lanes[r - 1], b = lanes[r];
          if (a.kind !== 'river' || b.kind !== 'river') continue;
          pairs++;
          if (!bridgeLiteral(a, b)) bad.add(`seed ${seed} rows ${r - 1}/${r}: the literal definition fails`);
          if (logBridgeOk(a, b) !== bridgeLiteral(a, b)) bad.add(`seed ${seed} rows ${r - 1}/${r}: logBridgeOk and the literal definition disagree`);
        }
      }
      expect(pairs).toBeGreaterThan(200);
      expectNone(bad);
    });

    it('F5: whenever a train overlaps the band the light was already on WARN_FLOOR seconds earlier', () => {
      const bad = new Bad();
      const out = { x0: 0, x1: 0 };
      let samples = 0, inBand = 0;
      for (const [seed, lanes] of S.cache) {
        for (const lane of lanes) {
          if (lane.kind !== 'rail') continue;
          const n = Math.ceil((3 * lane.period) / 0.01);
          for (let i = 0; i <= n; i++) {
            const t = i * 0.01;
            samples++;
            const span = trainSpan(lane, t, out);
            if (span === null || span.x1 < BAND_MIN || span.x0 > BAND_MAX) continue;
            inBand++;
            if (!railWarning(lane, t - WARN_FLOOR)) bad.add(`seed ${seed} row ${lane.row} t ${t}: train in the band but no warning at t - ${WARN_FLOOR}`);
          }
        }
      }
      expect(samples).toBeGreaterThan(1_000_000);
      expect(inBand).toBeGreaterThan(100_000);
      expectNone(bad);
    });
  });
});
