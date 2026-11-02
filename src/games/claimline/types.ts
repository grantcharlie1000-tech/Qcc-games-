/**
 * Claimline core data model (lead-designed contract). Pure data: no DOM, no Canvas, no Date/Math.random.
 * All distances are in grid cells. The arena is a circle of radius ARENA_R centred at (CENTER, CENTER).
 * Cell (cx, cy) covers [cx, cx+1) x [cy, cy+1); its centre is (cx+.5, cy+.5); index = cy * GRID + cx.
 */

/** Fixed simulation step in seconds. */
export const STEP = 1 / 60;
/** Longest frame gap simulated after a stall (seconds). Longer gaps are dropped, but every simulated step is swept. */
export const MAX_FRAME = 0.25;
/** Arena radius in cells. A cell is playable when its centre lies strictly within ARENA_R of CENTER. */
export const ARENA_R = 56;
/** Grid side in cells (a ring of non-playable cells always surrounds the circle). */
export const GRID = 2 * ARENA_R + 4;
export const CENTER = GRID / 2;
/** Heads are clamped to this radius and slide along it (see SPEC: edge sealing proof). */
export const HEAD_EDGE_R = ARENA_R - 0.25;
/** Identical for every player, human or bot. */
export const SPEED = 8; // cells per second
export const TURN_RATE = 4.2; // radians per second
/** A head hits a trail when its centre comes within HIT_R of the trail's centreline. */
export const HIT_R = 0.6;
/** On capture, every cell whose centre is within STAMP_R of the trail polyline becomes the owner's. */
export const STAMP_R = 1.0;
/** Trail points are appended once the head is this far from the last stored point. */
export const TRAIL_SPACING = 0.5;
/** Radius of the starting disc of land. */
export const START_R = 3;
export const HUMAN = 1;
export const BOT_COUNT = 6;
export const PLAYER_COUNT = 1 + BOT_COUNT;
/** Bots that lose come back after this long, on a free neutral disc, if one exists. */
export const RESPAWN_SECONDS = 3;
/** Owner value for neutral (and for every non-playable cell). Players use 1..PLAYER_COUNT. */
export const NEUTRAL = 0;

export type Phase = 'ready' | 'running' | 'over';
export type EndReason = 'cut' | 'land' | 'won';

export interface BotBrain {
  /** 0..1, higher means longer excursions and more intercepts. */
  aggression: number;
  /** Typical loop reach in cells. */
  loopSize: number;
  /** Seconds between replans (0.1..0.2 = 5-10 Hz). */
  reaction: number;
  /** Simulation time (seconds) of the next replan. */
  nextPlanAt: number;
  mode: 'home' | 'out' | 'return' | 'intercept';
  /** Remaining waypoints for the current excursion, flat [x0,y0,x1,y1,...]. */
  waypoints: number[];
  /** Player id being chased while intercepting, else 0. */
  targetId: number;
}

export interface Player {
  id: number; // 1..PLAYER_COUNT, also the owner value in the grid and the palette index
  name: string; // fixed local constant, never user or network data
  isBot: boolean;
  x: number; y: number;
  /** Position before the latest step, for render interpolation. */
  px: number; py: number;
  angle: number; // heading, radians
  target: number; // desired heading; persists when input is released
  alive: boolean;
  /** Exposed trail centreline, flat [x0,y0,x1,y1,...]; starts where the head left its land. Empty when home. The live segment runs from the last point to (x, y). */
  trail: number[];
  /** Highest territory share reached this life, in basis points (hundredths of a percent). */
  peak: number;
  kills: number;
  /** Simulation time (seconds) at which a defeated bot may respawn; Infinity for the human. */
  respawnAt: number;
  brain: BotBrain | null;
}

export type GameEvent =
  | { kind: 'capture'; id: number; cells: number[]; stolen: number }
  | { kind: 'defeat'; id: number; by: number; reason: EndReason; x: number; y: number }
  | { kind: 'takeover'; from: number; to: number; cells: number[] }
  | { kind: 'respawn'; id: number };

export interface World {
  seed: number;
  /** Mulberry32 state so a snapshot resumes the exact same random sequence. */
  rngState: number;
  tick: number;
  /** Simulation seconds elapsed while running. */
  time: number;
  accumulator: number;
  phase: Phase;
  /** 1 for playable cells, 0 outside the circle. */
  mask: Uint8Array;
  /** Owner per cell: NEUTRAL or a player id. Always NEUTRAL where mask is 0. */
  owner: Uint8Array;
  /** Number of playable cells (denominator of every percentage). */
  playable: number;
  /** counts[id] = owned playable cells; index 0 = neutral playable cells. Maintained incrementally. */
  counts: Int32Array;
  players: Player[]; // players[i].id === i + 1; players[0] is the human
  /** Bumped on every ownership change; renderers redraw when it differs. */
  landVersion: number;
  /** Cell-space bounding box [x0, y0, x1, y1] (inclusive) of ownership changes since the renderer last cleared it, or null. */
  dirty: [number, number, number, number] | null;
  /** Events since the UI last drained them (not serialized). */
  events: GameEvent[];
  result: { reason: EndReason; by: number } | null;
}
