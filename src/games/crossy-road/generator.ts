/** CrossyRoad's seeded lane generator. Pure: no DOM, no Three.js, and the only randomness is `mulberry32` seeded per chunk.
 *
 * Determinism contract: chunk k is a function of `chunkRng(seed, k)` and the GenState fields alone, so generating rows in
 * any batch sizes (or through World's cache) yields identical lanes. Every random draw below happens in a fixed order:
 *   chunk      kind pick, thickness, (multi-row river chunks: lily?), then the rows in order
 *   grass row  per column [obstacle?, tree?, variant] x 9, then per edge slot [obstacle?, tree?] x 12
 *   road row   direction, jitter, truck?, (v2 style/count), per mover [length (trucks), gap, colour], phase
 *   log row    direction (first of the chunk), speed jitter, per log [length, gap jitter, colour], phase (and any re-rolls)
 *   lily row   pad count, then a partial shuffle of the nine columns
 *   rail row   direction, length, period jitter, phase, colour
 * Fairness (F1-F7 in PLAN.md) is built into the rows: grass is repaired deterministically (no random draws), road and river
 * gaps are bounded by roadGapMin/riverGapMax, rail periods leave quiet time, and adjacent log rows are checked with logBridgeOk. */
import {
  CAR_LENGTH, COLS, EDGE_COLS, HOP_TIME, LOG_PALETTE, MOVERS, RAIL_PERIOD_MIN, SAFE_ROWS, START_COL, TRAIN_MAX, TRAIN_MIN, TRAIN_PALETTE, TRAIN_SPEED,
  VEHICLE_PALETTE, clamp, difficulty, lerp, riverGapMax, roadGapMin,
  type GrassLane, type Lane, type LaneKind, type LilyLane, type Mover, type Obstacle, type RailLane, type RiverLane, type RoadLane,
} from './config';
import { platformAt } from './lanes';
import { mulberry32 } from '../../core/random';

type Rng = () => number;
/** Which way a road, river or rail lane moves: +1 towards +x, -1 towards -x. */
type Heading = -1 | 1;
type Family = 'grass' | 'road' | 'river' | 'rail';

/** 32-bit avalanche hash of (seed, k): every output bit depends on every input bit. */
export function mix(seed: number, k: number): number {
  let h = (seed ^ Math.imul(k + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad);
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97);
  return (h ^ (h >>> 15)) >>> 0;
}

/** The random stream of chunk `chunk`: independent of every other chunk of the seed. */
export function chunkRng(seed: number, chunk: number): () => number {
  return mulberry32(mix(seed, chunk));
}

/** Everything the generator carries from one chunk to the next. `reach[c]` is true when column c of the last generated row can
 * be stood on by a player who started at (row 0, START_COL) and never died. */
export interface GenState {
  seed: number;
  version?: 1 | 2;
  /** Index of the next row to generate. */
  nextRow: number;
  /** Index of the next chunk to generate. */
  chunk: number;
  /** Kind of the last chunk (a river chunk with a lily row is still 'river'). */
  prevKind: LaneKind;
  /** Consecutive hazard chunks (road, river, rail) at the end. */
  hazardRun: number;
  reach: boolean[];
}

export function initialState(seed: number, version: 1 | 2 = 2): GenState {
  const reach = new Array<boolean>(COLS).fill(false);
  reach[START_COL] = true;
  return { seed: seed >>> 0, version, nextRow: 0, chunk: 0, prevKind: 'grass', hazardRun: 0, reach };
}

const shadeOf = (row: number): 0 | 1 => (((row % 2) + 2) % 2) as 0 | 1;
const family = (kind: LaneKind): Family => (kind === 'lily' ? 'river' : kind);
const jitter = (rng: Rng): number => 0.85 + 0.3 * rng();
const randomDir = (rng: Rng): Heading => (rng() < 0.5 ? 1 : -1);
const obstacle = (hit: boolean, tree: boolean): Obstacle => (hit ? (tree ? 'tree' : 'rock') : null);

/** Rows below the start: an impassable hedge, so the player can never walk off the back of the world. */
export function hedgeLane(row: number): GrassLane {
  return {
    kind: 'grass', row, shade: shadeOf(row),
    blocked: new Array<boolean>(COLS).fill(true),
    obstacles: new Array<Obstacle>(COLS).fill('tree'),
    variant: Array.from({ length: COLS }, (_, c) => (((c + row) % 3) + 3) % 3),
    edge: new Array<Obstacle>(2 * EDGE_COLS).fill('tree'),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Grass
// ---------------------------------------------------------------------------------------------------------------------------

/** Column nearest START_COL satisfying `pick`, ties going to the smaller column; -1 when there is none. */
function nearestToStart(pick: (c: number) => boolean): number {
  let best = -1;
  for (let c = 0; c < COLS; c++) if (pick(c) && (best < 0 || Math.abs(c - START_COL) < Math.abs(best - START_COL))) best = c;
  return best;
}

/** PLAN.md "Repair", with no random draws. Clears obstacles in place so that (a) some column of the row before that was
 * reachable is open here (clearing the reachable column nearest START_COL, ties to the smaller column), and (b) at least 3
 * columns are open (clearing the blocked column nearest START_COL, ties to the smaller column, until they are).
 * Returns the columns reachable in this row: (c) a flood along the row over open cells from the columns that were reachable
 * before. Never modifies `reach`. */
export function repairGrass(obstacles: Obstacle[], reach: readonly boolean[]): boolean[] {
  let entered = false;
  for (let c = 0; c < COLS && !entered; c++) entered = reach[c] && obstacles[c] === null;
  if (!entered) {
    const c = nearestToStart((i) => reach[i]);
    if (c >= 0) obstacles[c] = null;
  }
  let open = 0;
  for (let c = 0; c < COLS; c++) if (obstacles[c] === null) open++;
  while (open < 3) {
    obstacles[nearestToStart((i) => obstacles[i] !== null)] = null;
    open++;
  }
  // Flood along the row over open cells from the open columns that were reachable before: sweep right, then left.
  const next = new Array<boolean>(COLS).fill(false);
  let on = false;
  for (let c = 0; c < COLS; c++) {
    if (obstacles[c] !== null) on = false;
    else { if (reach[c]) on = true; next[c] = on; }
  }
  on = false;
  for (let c = COLS - 1; c >= 0; c--) {
    if (obstacles[c] !== null) on = false;
    else { if (reach[c]) on = true; if (on) next[c] = true; }
  }
  return next;
}

/** Chunk 0 keeps columns 2-6 clear and puts an obstacle on each of columns 0, 1, 7, 8 with p 0.35. */
function grassRow(row: number, rng: Rng, safe: boolean, reach: readonly boolean[], version: 1 | 2): { lane: GrassLane; reach: boolean[] } {
  const density = lerp(0.10, 0.30, difficulty(row));
  const obstacles = new Array<Obstacle>(COLS), variant = new Array<number>(COLS);
  for (let c = 0; c < COLS; c++) {
    const p = safe ? (c >= 2 && c <= 6 ? 0 : 0.35) : density;
    const hit = rng() < p, tree = rng() < 0.7;
    obstacles[c] = obstacle(hit, tree);
    const v = rng();
    variant[c] = version === 2 && tree && v < 0.10 ? 3 : Math.floor((version === 2 && tree ? (v - 0.10) / 0.90 : v) * 3);
  }
  const edge = new Array<Obstacle>(2 * EDGE_COLS);
  for (let i = 0; i < edge.length; i++) {
    const hit = rng() < 0.45, tree = rng() < 0.7;
    edge[i] = obstacle(hit, tree);
  }
  const next = repairGrass(obstacles, reach);
  return { lane: { kind: 'grass', row, shade: shadeOf(row), blocked: obstacles.map((o) => o !== null), obstacles, variant, edge }, reach: next };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Moving lanes
// ---------------------------------------------------------------------------------------------------------------------------

/** Cumulative layout: mover i starts where gap i-1 ended and mover 0 at offset 0, so the cycle is the sum of len + gap. */
function layout(lens: readonly number[], gaps: readonly number[], colors: readonly number[]): { movers: Mover[]; cycle: number } {
  const movers: Mover[] = [];
  let cycle = 0;
  for (let i = 0; i < lens.length; i++) {
    movers.push({ offset: cycle, len: lens[i], color: colors[i] });
    cycle += lens[i] + gaps[i];
  }
  return { movers, cycle };
}

function roadRow(row: number, rng: Rng, dir: Heading, version: 1 | 2): RoadLane {
  const d = difficulty(row);
  const speed = lerp(1.5, 4.5, d) * jitter(rng);
  const truck = rng() < lerp(0.2, 0.4, d);
  const style = version === 1 || truck ? undefined : (['compact', 'sedan', 'taxi'] as const)[Math.floor(rng() * 3)];
  const count = version === 1 ? MOVERS : 2 + Math.floor(rng() * 4);
  const lens: number[] = [], gaps: number[] = [], colors: number[] = [];
  const gapMin = roadGapMin(speed), gapScale = lerp(version === 1 ? 6 : 4.2, 3, d);
  for (let i = 0; i < count; i++) {
    lens.push(truck ? (rng() < 0.5 ? 2 : 3) : version === 1 ? CAR_LENGTH : style === 'compact' ? 1.2 : 1.8);
    gaps.push(Math.max(gapMin, gapScale * (0.85 + 0.6 * rng())));
    const color = Math.floor(rng() * VEHICLE_PALETTE);
    colors.push(style === 'taxi' ? 2 : color);
  }
  const { movers, cycle } = layout(lens, gaps, colors);
  return { kind: 'road', row, dir, speed, vehicle: truck ? 'truck' : 'car', ...(style ? {style} : {}), cycle, phase: rng() * cycle, movers };
}

/** Everything about a log row except its direction, row and phase. */
export interface LogShape {
  speed: number;
  lens: readonly number[];
  gaps: readonly number[];
  colors: readonly number[];
}

const MIN_LOG_GAP = 2;

function drawLogShape(rng: Rng, d: number, version: 1 | 2): LogShape {
  const speed = lerp(1.0, 2.6, d) * jitter(rng);
  const w2 = lerp(version === 1 ? 0.1 : 0.2, 0.6, d), w3 = version === 1 ? 0.3 : lerp(0.6, 0.3, d), w4 = version === 1 ? lerp(0.6, 0.1, d) : 1 - w2 - w3;
  const gapScale = lerp(2, 4, d), gapMax = riverGapMax(speed);
  const lens: number[] = [], gaps: number[] = [], colors: number[] = [];
  for (let i = 0; i < MOVERS; i++) {
    const u = rng() * (w2 + w3 + w4);
    lens.push(u < w2 ? 2 : u < w2 + w3 ? 3 : 4);
    gaps.push(clamp(gapScale * jitter(rng), MIN_LOG_GAP, gapMax));
    colors.push(Math.floor(rng() * LOG_PALETTE));
  }
  return { speed, lens, gaps, colors };
}

function logLane(shape: LogShape, row: number, dir: Heading, phase: number): RiverLane {
  const { movers, cycle } = layout(shape.lens, shape.gaps, shape.colors);
  return { kind: 'river', row, dir, speed: shape.speed, cycle, phase: phase * cycle, movers };
}

// F4b. A player on a log of row A hops up to row B (keeping x) and must find a log there when the hop lands. Over every 3 s
// window of the first 23 s some instant must have an x in 0..8 covered by A, by B, and by B one hop later.
const BRIDGE_X_STEPS = 80; // x = 0, 0.1, ..., 8
const BRIDGE_STEP = 0.05; // seconds between sampled instants
const BRIDGE_WINDOW_STEPS = 60; // 3 s
const BRIDGE_WINDOW_EVERY = 10; // window starts 0, 0.5, ..., 20
const BRIDGE_LAST_START = 40;

function bridgeAt(a: RiverLane, b: RiverLane, t: number): boolean {
  for (let j = 0; j <= BRIDGE_X_STEPS; j++) {
    const x = j * 0.1;
    if (platformAt(a, x, t) && platformAt(b, x, t) && platformAt(b, x, t + HOP_TIME)) return true;
  }
  return false;
}

/** F4b: for every window start t0 = 0, 0.5, ..., 20 some instant t in [t0, t0 + 3] (step 0.05) has an x in [0, 8] (step 0.1) with
 * platformAt(a, x, t) && platformAt(b, x, t) && platformAt(b, x, t + HOP_TIME). `a` is the row below `b`.
 * Equivalent to testing every (window, t, x) but scans each window from its right edge, because the latest bridging instant also
 * serves every later window that still contains it, and remembers each instant it has evaluated. */
export function logBridgeOk(a: RiverLane, b: RiverLane): boolean {
  const memo = new Int8Array(BRIDGE_WINDOW_EVERY * BRIDGE_LAST_START + BRIDGE_WINDOW_STEPS + 1); // 0 unknown, 1 bridge, 2 none
  for (let w = 0; w <= BRIDGE_LAST_START;) {
    let latest = -1;
    for (let i = BRIDGE_WINDOW_EVERY * w + BRIDGE_WINDOW_STEPS; i >= BRIDGE_WINDOW_EVERY * w; i--) {
      if (memo[i] === 0) memo[i] = bridgeAt(a, b, i * BRIDGE_STEP) ? 1 : 2;
      if (memo[i] === 1) { latest = i; break; }
    }
    if (latest < 0) return false;
    w = Math.floor(latest / BRIDGE_WINDOW_EVERY) + 1;
  }
  return true;
}

const PHASE_TRIES = 8;

/** Builds the log row `shape` at `row` and, when `below` is the log row directly under it, makes it bridge with `below`:
 * the drawn phase is re-rolled with the chunk rng up to 8 times; if none works the gaps are regenerated at their minimum (2)
 * and the phase is drawn and re-rolled up to 8 times again; if even that fails the last candidate is returned (best effort,
 * which random rows never needed in testing). Each try costs exactly one `rng()` draw, so the result is deterministic.
 * `ok` is a seam for tests; production always uses logBridgeOk. */
export function fitLogRow(shape: LogShape, row: number, dir: Heading, below: RiverLane | null, rng: Rng, ok: (a: RiverLane, b: RiverLane) => boolean = logBridgeOk): RiverLane {
  let lane = logLane(shape, row, dir, rng());
  if (below === null || ok(below, lane)) return lane;
  for (let tries = 0; tries < PHASE_TRIES; tries++) {
    lane.phase = rng() * lane.cycle;
    if (ok(below, lane)) return lane;
  }
  lane = logLane({ ...shape, gaps: shape.gaps.map(() => MIN_LOG_GAP) }, row, dir, rng());
  if (ok(below, lane)) return lane;
  for (let tries = 0; tries < PHASE_TRIES; tries++) {
    lane.phase = rng() * lane.cycle;
    if (ok(below, lane)) return lane;
  }
  return lane;
}

function lilyRow(row: number, rng: Rng): LilyLane {
  const pads = new Array<boolean>(COLS).fill(false);
  const columns = Array.from({ length: COLS }, (_, c) => c);
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (COLS - i));
    [columns[i], columns[j]] = [columns[j], columns[i]];
    pads[columns[i]] = true;
  }
  return { kind: 'lily', row, pads };
}

function railRow(row: number, rng: Rng): RailLane {
  const d = difficulty(row);
  const dir = randomDir(rng);
  const length = TRAIN_MIN + Math.floor(rng() * (TRAIN_MAX - TRAIN_MIN + 1));
  const period = Math.max(RAIL_PERIOD_MIN, lerp(9, 5, d) * jitter(rng));
  const phase = rng() * period;
  return { kind: 'rail', row, dir, speed: TRAIN_SPEED, length, period, phase, color: Math.floor(rng() * TRAIN_PALETTE) };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Chunks
// ---------------------------------------------------------------------------------------------------------------------------

const KIND_WEIGHTS: ReadonlyArray<readonly [Family, number, number]> = [
  ['grass', 0.40, 0.22], ['road', 0.32, 0.38], ['river', 0.16, 0.22], ['rail', 0.12, 0.18],
];

function chooseKind(rng: Rng, state: GenState): Family {
  const start = state.nextRow, d = difficulty(start);
  let total = 0;
  for (const [, easy, hard] of KIND_WEIGHTS) total += lerp(easy, hard, d);
  let u = rng() * total, kind: Family = 'rail';
  for (const [candidate, easy, hard] of KIND_WEIGHTS) {
    u -= lerp(easy, hard, d);
    if (u < 0) { kind = candidate; break; }
  }
  const prev = family(state.prevKind);
  if (kind === prev) kind = prev === 'grass' ? 'road' : 'grass';
  if (kind !== 'grass' && state.hazardRun >= (start < 60 ? 2 : 3)) kind = 'grass';
  return kind;
}

function chooseThickness(rng: Rng, kind: Family, start: number, version: 1 | 2): number {
  switch (kind) {
    case 'grass': return 1 + Math.floor(rng() * (start < 20 ? 5 : 3));
    case 'road': return 1 + Math.floor(rng() * (start < 20 ? 2 : 4));
    case 'river': {const u = rng(); return version === 1 ? 1 + Math.floor(u * 3) : u < 0.2 ? 1 : u < 0.8 ? 2 : 3;}
    case 'rail': {
      if (version === 1) return start >= 120 && rng() < 0.25 ? 2 : 1;
      const u = rng(); return u < 0.12 ? 3 : u < 0.37 ? 2 : 1;
    }
  }
}

/** Reach of a row that can be crossed from anywhere: all columns when the row before was reachable at all. */
const passable = (reach: readonly boolean[]): boolean[] => new Array<boolean>(COLS).fill(reach.some(Boolean));

/** Generates exactly one chunk. The input state is never modified, and the returned state shares no array with it. */
export function generateChunk(state: GenState): { lanes: Lane[]; state: GenState } {
  const rng = chunkRng(state.seed, state.chunk);
  const start = state.nextRow, version = state.version ?? 2;
  const safe = state.chunk === 0;
  const kind = safe ? 'grass' : chooseKind(rng, state);
  const n = safe ? SAFE_ROWS : chooseThickness(rng, kind, start, version);
  const lanes: Lane[] = [];
  let reach: readonly boolean[] = state.reach;
  if (kind === 'grass') {
    for (let i = 0; i < n; i++) {
      const out = grassRow(start + i, rng, safe, reach, version);
      lanes.push(out.lane);
      reach = out.reach;
    }
  } else if (kind === 'road') {
    let dir: Heading = 1;
    for (let i = 0; i < n; i++) {
      dir = i === 0 ? randomDir(rng) : rng() < 0.7 ? (dir === 1 ? -1 : 1) : dir;
      lanes.push(roadRow(start + i, rng, dir, version));
      reach = passable(reach);
    }
  } else if (kind === 'river') {
    const lily = (version === 1 ? n === 3 : n >= 2) && rng() < 0.3;
    let dir: Heading = 1, lastLog: RiverLane | null = null;
    for (let i = 0; i < n; i++) {
      const row = start + i;
      if (lily && i === 1) {
        const pads = lilyRow(row, rng);
        lanes.push(pads);
        reach = pads.pads.slice();
        continue;
      }
      dir = lastLog === null ? randomDir(rng) : dir === 1 ? -1 : 1;
      const below = i > 0 && lanes[i - 1].kind === 'river' ? (lanes[i - 1] as RiverLane) : null;
      lastLog = fitLogRow(drawLogShape(rng, difficulty(row), version), row, dir, below, rng);
      lanes.push(lastLog);
      reach = passable(reach);
    }
  } else {
    for (let i = 0; i < n; i++) {
      lanes.push(railRow(start + i, rng));
      reach = passable(reach);
    }
  }
  return {
    lanes,
    state: {
      seed: state.seed, version, nextRow: start + n, chunk: state.chunk + 1, prevKind: kind,
      hazardRun: kind === 'grass' ? 0 : state.hazardRun + 1, reach: reach.slice(),
    },
  };
}

/** Whole chunks until at least `minRows` lanes exist (none when minRows <= 0). */
export function generate(state: GenState, minRows: number): { lanes: Lane[]; state: GenState } {
  if (Number.isNaN(minRows) || minRows === Infinity) throw new RangeError(`generate: minRows must be finite, got ${minRows}`);
  const lanes: Lane[] = [];
  let current: GenState = { ...state, reach: state.reach.slice() };
  while (lanes.length < minRows) {
    const out = generateChunk(current);
    for (const lane of out.lanes) lanes.push(lane);
    current = out.state;
  }
  return { lanes, state: current };
}
