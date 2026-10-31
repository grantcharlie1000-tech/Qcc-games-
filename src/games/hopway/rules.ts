/** Hopway's rules: the whole run as a pure state machine. Hops, the input buffer, collisions, the six deaths, score and
 * persistence live here and nowhere else. Pure: no DOM, no Three.js, no clock and no randomness, so a run can be replayed,
 * saved and tested at any time. Hazards are functions of the world time `t` (lanes.ts). */
import {
  BACK_LIMIT, BAND_MAX, BAND_MIN, COLS, DEATH_TIME, DEATH_TIME_REDUCED, DIRS, HOP_HEIGHT, HOP_TIME, IDLE_LIMIT, IDLE_WARN, SAFE_LAG,
  START_COL, lerp, scrollRate,
  type Death, type DeathCause, type Dir, type Lane, type LaneSource, type PlayerPose, type RunState, type StepEvents,
} from './config';
import { laneVelocity, platformAt, trainHit, vehicleHit } from './lanes';

/** A fresh run: row 0, column 4, not started. `seed` is stored as an unsigned 32-bit integer. */
export function createRun(seed: number): RunState {
  return {
    v: 1, seed: seed >>> 0, t: 0, phase: 'ready', row: 0, x: START_COL, fromRow: 0, fromX: START_COL, hop: -1, hopDir: 'up', facing: 'up',
    queued: null, maxRow: 0, lastProgress: 0, safeLine: 0, started: false, bonkAt: -1e9, bonkDir: 'up', landedAt: -1e9, death: null,
  };
}

/** Scratch result of `aimHop`, so that `input` and `step` never allocate. */
const aim = { row: 0, x: 0 };

/** Writes the hop target for a grounded player into `aim`; false when the move is blocked. */
function aimHop(s: RunState, dir: Dir, world: LaneSource): boolean {
  const { dr, dc } = DIRS[dir];
  const row = s.row + dr;
  if (row < 0) return false;
  let x: number;
  if (dc !== 0) {
    x = s.x + dc;
    const here = world.lane(s.row);
    if (here.kind === 'river') {
      // On a log x is continuous: the band edge is where it would snap to column 0 or 8.
      const col = Math.round(x);
      if (col < 0 || col > COLS - 1) return false;
    } else if (x < 0 || x > COLS - 1 || (here.kind === 'grass' && here.blocked[x])) return false;
  } else {
    const next = world.lane(row);
    if (next.kind === 'river') x = s.x;
    else {
      // Hopping off a log snaps to the nearest column. `+ 0` turns -0 into 0 so that a JSON round trip changes nothing.
      x = Math.round(s.x) + 0;
      if (x < 0 || x > COLS - 1 || (next.kind === 'grass' && next.blocked[x])) return false;
    }
  }
  aim.row = row; aim.x = x;
  return true;
}

/** Where a hop in `dir` would land, or null when the move is blocked (tree, rock, band edge, or row below 0). Only meaningful
 * while the player is grounded. */
export function hopTarget(s: RunState, dir: Dir, world: LaneSource): { row: number; x: number } | null {
  return aimHop(s, dir, world) ? { row: aim.row, x: aim.x } : null;
}

/** Starts the hop whose target is in `aim`. The logical position changes now; true when it is a new furthest row. */
function launch(s: RunState, dir: Dir): boolean {
  s.fromRow = s.row; s.fromX = s.x;
  s.row = aim.row; s.x = aim.x;
  s.hop = 0; s.hopDir = dir; s.facing = dir;
  if (s.row <= s.maxRow) return false;
  s.maxRow = s.row; s.lastProgress = s.t;
  return true;
}

/** One player input. While a hop runs one further input is buffered and the rest are dropped; the buffered hop starts at the exact
 * landing time. A blocked move is a bonk: it never starts the run, never resets the idle clock and is never a death. */
export function input(s: RunState, dir: Dir, world: LaneSource): 'hop' | 'queued' | 'dropped' | 'blocked' | 'ignored' {
  if (s.phase === 'dying' || s.phase === 'over') return 'ignored';
  if (s.hop >= 0) {
    if (s.queued !== null) return 'dropped';
    s.queued = dir;
    return 'queued';
  }
  if (!aimHop(s, dir, world)) {
    s.bonkAt = s.t; s.bonkDir = dir; s.facing = dir;
    return 'blocked';
  }
  if (s.phase === 'ready') { s.phase = 'running'; s.started = true; s.lastProgress = s.t; }
  launch(s, dir);
  return 'hop';
}

/** Ends the run: the hop (if any) is frozen where it was, so the pose is the death pose. */
function die(s: RunState, events: StepEvents, cause: DeathCause, lane: Lane): void {
  s.phase = 'dying'; s.queued = null;
  s.death = { cause, t: s.t, row: s.row, x: renderX(s), dir: lane.kind === 'road' || lane.kind === 'rail' || lane.kind === 'river' ? lane.dir : 1 };
  events.died = cause;
}

/** Advances the world by `dt` seconds. A hop lands at its exact time: `dt` is split there. Hazards are checked at the end of
 * every segment, so callers should step in increments well under HOP_TIME (the game loop uses STEP): a coarser step can carry a
 * vehicle past the player or skip a check between two buffered hops. Time `t` runs while ready, running and dying, and stops
 * once the run is over. */
export function step(s: RunState, dt: number, world: LaneSource, reducedMotion = false): StepEvents {
  const events: StepEvents = { landed: false, newMax: false, chime: false, died: null, over: false, ufoWarn: false };
  if (s.phase === 'over') return events;
  let remaining = dt;
  while (remaining > 1e-12 && s.phase !== 'over') {
    let seg = remaining;
    if (s.phase === 'running' && s.hop >= 0) seg = Math.min(seg, HOP_TIME - s.hop);
    s.t += seg;
    if (s.phase === 'running') {
      if (s.hop >= 0) s.hop += seg;
      else {
        const lane = world.lane(s.row);
        if (lane.kind === 'river') s.x += laneVelocity(lane) * seg; // D4: a log carries whoever stands on it
      }
      if (s.started) s.safeLine = Math.max(s.safeLine + scrollRate(s.maxRow) * seg, s.maxRow - SAFE_LAG);
    }
    remaining -= seg;
    if (s.phase === 'running') {
      if (s.hop >= HOP_TIME - 1e-9) {
        s.hop = -1; s.landedAt = s.t; events.landed = true;
        const landed = world.lane(s.row);
        if ((landed.kind === 'river' || landed.kind === 'lily') && !platformAt(landed, s.x, s.t)) die(s, events, 'water', landed); // D3
        else if (s.queued !== null) {
          // The buffered input starts now, exactly as input() would from the ground.
          const dir = s.queued;
          s.queued = null;
          if (!aimHop(s, dir, world)) { s.bonkAt = s.t; s.bonkDir = dir; s.facing = dir; }
          else if (launch(s, dir)) { events.newMax = true; events.chime = s.maxRow % 25 === 0; }
        }
      }
      if (s.phase === 'running') {
        const lane = world.lane(s.row);
        if (s.hop < 0 && lane.kind === 'river' && (s.x < BAND_MIN || s.x > BAND_MAX)) die(s, events, 'swept', lane); // D4
        else if (lane.kind === 'road' && vehicleHit(lane, renderX(s), s.t)) die(s, events, 'car', lane); // D1, also mid-hop
        else if (lane.kind === 'rail' && trainHit(lane, renderX(s), s.t)) die(s, events, 'train', lane); // D2
        else if (s.started && (s.row <= s.maxRow - BACK_LIMIT || s.row <= s.safeLine - BACK_LIMIT)) die(s, events, 'ufo-behind', lane); // D6
        else if (s.started && s.t - s.lastProgress >= IDLE_LIMIT - 1e-9) die(s, events, 'ufo-idle', lane); // D5
      }
    }
    // The 1e-9 absorbs the rounding of summing 1/60 s steps, so 0.9 s is exactly 54 of them.
    if (s.phase === 'dying' && s.death !== null && s.t - s.death.t >= (reducedMotion ? DEATH_TIME_REDUCED : DEATH_TIME) - 1e-9) {
      s.phase = 'over'; events.over = true;
    }
  }
  events.ufoWarn = ufoWarning(s);
  return events;
}

/** Seconds since the last new best row (or the first hop); 0 before the first hop. */
export function idleTime(s: RunState): number {
  return s.started ? s.t - s.lastProgress : 0;
}

/** The UFO's warning (spotlight ring and wobbling tone) is on from IDLE_WARN seconds of idle time until the run ends. */
export function ufoWarning(s: RunState): boolean {
  return s.started && s.phase === 'running' && idleTime(s) >= IDLE_WARN;
}

/** The x to draw and to test vehicles against: interpolated while a hop runs. */
export function renderX(s: RunState): number {
  return s.hop >= 0 ? lerp(s.fromX, s.x, Math.min(1, s.hop / HOP_TIME)) : s.x;
}

/** Where to draw the player this instant. */
export function pose(s: RunState): PlayerPose {
  const hopping = s.hop >= 0, p = hopping ? Math.min(1, s.hop / HOP_TIME) : 1;
  return {
    x: renderX(s), z: hopping ? lerp(s.fromRow, s.row, p) : s.row,
    lift: hopping ? Math.sin(p * Math.PI) * HOP_HEIGHT : 0, facing: s.facing, progress: hopping ? p : -1,
  };
}

/** The persisted form of a run: exactly the state that decides what happens next. Visual-only fields (`bonkAt`, `bonkDir`,
 * `landedAt`) are left out, and a `dying` run is written as `over` so that a restored run shows its card at once. */
export interface Snapshot {
  v: 1; seed: number; t: number; phase: 'ready' | 'running' | 'over';
  row: number; x: number; fromRow: number; fromX: number; hop: number; hopDir: Dir; facing: Dir; queued: Dir | null;
  maxRow: number; lastProgress: number; safeLine: number; started: boolean; death: Death | null;
}

/** A JSON-safe copy of the run. Never changes `s`. */
export function serialize(s: RunState): Snapshot {
  return {
    v: 1, seed: s.seed, t: s.t, phase: s.phase === 'dying' ? 'over' : s.phase,
    row: s.row, x: s.x, fromRow: s.fromRow, fromX: s.fromX, hop: s.hop, hopDir: s.hopDir, facing: s.facing, queued: s.queued,
    maxRow: s.maxRow, lastProgress: s.lastProgress, safeLine: s.safeLine, started: s.started,
    death: s.death === null ? null : { cause: s.death.cause, t: s.death.t, row: s.death.row, x: s.death.x, dir: s.death.dir },
  };
}

/** Every cause: a cause added to DeathCause without a line here is a type error, so restore cannot silently reject it. */
const CAUSES: Readonly<Record<DeathCause, true>> = { car: true, train: true, water: true, swept: true, 'ufo-idle': true, 'ufo-behind': true };
const isCause = (v: unknown): v is DeathCause => typeof v === 'string' && Object.hasOwn(CAUSES, v);
const isDir = (v: unknown): v is Dir => v === 'up' || v === 'down' || v === 'left' || v === 'right';
const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Rebuilds a run from untrusted data, or returns null when any field is off. Checks every field and cross-field rule (see the
 * Snapshot), ignores unknown keys, never throws, and shares nothing with `data`. Visual-only state starts over. */
export function restore(data: unknown): RunState | null {
  try {
    if (!isRecord(data)) return null;
    const { v, seed, t, phase, row, x, fromRow, fromX, hop, hopDir, facing, queued, maxRow, lastProgress, safeLine, started, death } = data;
    if (v !== 1 || !isInt(seed, 0, 4294967295) || !isNum(t, 0, 1e7)) return null;
    if (phase !== 'ready' && phase !== 'running' && phase !== 'over') return null;
    if (!isInt(row, 0, 1e6) || !isInt(maxRow, 0, 1e6) || !isInt(fromRow, 0, 1e6)) return null;
    if (maxRow - row < 0 || maxRow - row > BACK_LIMIT || Math.abs(fromRow - row) > 1) return null;
    if (!isNum(x, BAND_MIN - 1, BAND_MAX + 1) || !isNum(fromX, BAND_MIN - 1, BAND_MAX + 1)) return null;
    if (typeof hop !== 'number' || !(hop === -1 || (hop >= 0 && hop < HOP_TIME))) return null;
    // A hop is at most 1.5 long. Once grounded, fromX is only where a finished hop began: a log may have carried x anywhere since.
    if (hop >= 0 && Math.abs(fromX - x) > 1.5) return null;
    if (!isDir(hopDir) || !isDir(facing) || !(queued === null || (isDir(queued) && hop >= 0))) return null;
    if (!isNum(lastProgress, 0, t) || !isNum(safeLine, 0, maxRow + BACK_LIMIT + 1) || typeof started !== 'boolean') return null;
    if (phase === 'ready' && (started || row !== 0 || maxRow !== 0 || hop !== -1 || death !== null)) return null;
    if (phase === 'running' && (!started || death !== null)) return null;
    let restored: Death | null = null;
    if (phase === 'over') {
      if (!isRecord(death) || !isCause(death.cause) || !isNum(death.t, 0, t) || !isInt(death.row, 0, 1e6)) return null;
      if (!isNum(death.x, -Infinity, Infinity) || (death.dir !== -1 && death.dir !== 1)) return null;
      restored = { cause: death.cause, t: death.t, row: death.row, x: death.x, dir: death.dir };
    }
    return {
      v: 1, seed, t, phase, row, x, fromRow, fromX, hop, hopDir, facing, queued, maxRow, lastProgress, safeLine, started,
      bonkAt: -1e9, bonkDir: 'up', landedAt: -1e9, death: restored,
    };
  } catch {
    return null;
  }
}
