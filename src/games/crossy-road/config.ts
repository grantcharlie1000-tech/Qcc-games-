/** CrossyRoad's shared contract: the types and tunable constants used by the pure modules (lanes,
 * generator, world, rules), the renderer and the game module. Pure: no DOM and no Three.js. */

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Obstacle = 'tree' | 'rock' | null;
export type LaneKind = 'grass' | 'road' | 'river' | 'lily' | 'rail';
export type Phase = 'ready' | 'running' | 'dying' | 'over';
export type DeathCause = 'car' | 'train' | 'water' | 'swept' | 'ufo-idle' | 'ufo-behind';
export type Quality = 'high' | 'low';
export type WorldVersion = 1 | 2 | 3 | 4 | 5 | 6;
/** The generation revision new runs use. Saved runs keep replaying the revision they were made with. */
export const CURRENT_WORLD: WorldVersion = 6;

/** One vehicle or log in a moving lane's repeating pattern. `offset` is its left edge inside the
 * pattern (tiles, 0 ≤ offset < cycle), `len` its length in tiles and `color` a palette index. */
export interface Mover { offset: number; len: number; color: number }

export interface GrassLane {
  kind: 'grass'; row: number;
  /** Revision five's stateless horizontal terrain and open connecting bank. */
  seed?: number; clearing?: boolean;
  /** Two greens alternate by row parity. */
  shade: 0 | 1;
  /** Columns 0..8. A tree or rock blocks its column: `blocked[c] === (obstacles[c] !== null)`. */
  blocked: boolean[]; obstacles: Obstacle[];
  /** Visual variant 0..2 (tree height, rock shape), or 3 for a short tree stump. */
  variant: number[];
  /** Decorative obstacles outside the band (never stepped on): indices 0..5 are x = −6..−1, 6..11 are x = 9..14. */
  edge: Obstacle[];
}
export type CarStyle = 'compact' | 'sedan' | 'taxi';
/** Vehicles: one type and one direction per lane. `movers` repeat every `cycle` tiles. */
export interface RoadLane { kind: 'road'; row: number; dir: -1 | 1; speed: number; vehicle: 'car' | 'truck'; style?: CarStyle; cycle: number; phase: number; movers: Mover[] }
/** Logs: they carry the player at `dir·speed` tiles/s. */
export interface RiverLane { kind: 'river'; row: number; dir: -1 | 1; speed: number; cycle: number; phase: number; movers: Mover[] }
/** Static lily pads on columns 0..8; the rest of the row is water. */
export interface LilyLane { kind: 'lily'; row: number; pads: boolean[]; seed?: number }
/** One train every `period` seconds; `phase` is the first entry time (see lanes.ts). */
export interface RailLane { kind: 'rail'; row: number; dir: -1 | 1; speed: number; length: number; period: number; phase: number; color: number }
export type Lane = GrassLane | RoadLane | RiverLane | LilyLane | RailLane;
export type MovingLane = RoadLane | RiverLane;

/** Anything that answers "which lane is row r": the World, or a hand-built map in tests. */
export interface LaneSource { lane(row: number): Lane }

export interface Death { cause: DeathCause; t: number; row: number; x: number; dir: -1 | 1;
  /** Presentation at impact; optional for saves from before the fidelity pass. */
  contact?: {row: number; z: number; lift: number; mode: 'side' | 'hop-in'};
}

/** The whole run. Plain JSON-safe data so it can be serialized; rules.ts owns every transition. */
export interface RunState {
  v: 1;
  seed: number;
  /** Old saves without a revision replay the original generator. */
  worldVersion?: WorldVersion;
  /** World time in seconds; hazards are pure functions of it. */
  t: number;
  phase: Phase;
  /** Logical position (the target while a hop runs): an integer column on land, continuous on a log. */
  row: number; x: number;
  /** Where the current hop started. */
  fromRow: number; fromX: number;
  /** Seconds into the current hop, or −1 when grounded. */
  hop: number; hopDir: Dir; facing: Dir;
  /** The one buffered input. */
  queued: Dir | null;
  /** Score: the furthest row reached. */
  maxRow: number;
  /** t of the last new best row (or of the first hop). */
  lastProgress: number;
  /** Auto-scroll safe line in rows. It only rises. */
  safeLine: number;
  /** False until the first hop: no auto-scroll and no UFO before it. */
  started: boolean;
  /** t and direction of the last blocked move (visual bonk); −1e9 when none. */
  bonkAt: number; bonkDir: Dir;
  /** t of the last landing (visual squash); −1e9 when none. */
  landedAt: number;
  death: Death | null;
}

/** Where to draw the player: z is the continuous row, lift the hop arc height in tiles. */
export interface PlayerPose { x: number; z: number; lift: number; facing: Dir; progress: number }

/** What one rules.step() call did, for sound, announcements and the score. */
export interface StepEvents { landed: boolean; newMax: boolean; chime: boolean; died: DeathCause | null; over: boolean; ufoWarn: boolean }

/** One frame for the renderer. */
export interface SceneFrame {
  state: RunState;
  pose: PlayerPose;
  world: LaneSource;
  /** Real seconds since the previous rendered frame (0 for the first): camera smoothing and particles only. */
  dt: number;
  reducedMotion: boolean;
  colorBlind: boolean;
  /** Idle warning showing: spotlight ring and pulse. */
  ufoWarn: boolean;
  /** Contact-down squash before a tap/swipe direction is committed. */
  pressed?: boolean;
}
export interface SceneStats { calls: number; triangles: number; geometries: number; textures: number; programs: number; quality: Quality }
export interface CrossyRoadScene {
  resize(width: number, height: number): void;
  render(frame: SceneFrame): void;
  setQuality(quality: Quality): void;
  /** Adaptive resolution leaves model detail and directional shadows intact. */
  setResolutionCap(cap: number): void;
  readonly stats: SceneStats;
  /** Snap the camera to the player on the next render (new run or restore). */
  reset(): void;
  dispose(): void;
}

// The original nine-column seed window. Logical x is unbounded; these edges anchor legacy train timing.
export const COLS = 9;
export const START_COL = 4;
export const BAND_MIN = -0.5;
export const BAND_MAX = 8.5;
export const EDGE_COLS = 6;

// Hop feel (REFERENCE §3).
export const HOP_TIME = 0.12;
export const HOP_HEIGHT = 0.5;
export const SQUASH_TIME = 0.04;

// Collision (REFERENCE §4). The landing grace is our choice for forgiving log landings.
export const PLAYER_HALF = 0.3;
export const VEHICLE_INSET = 0.1;
export const PLATFORM_GRACE = 0.2;

// Stall rules (D5, D6) and auto-scroll (§6).
export const IDLE_LIMIT = 7;
export const IDLE_WARN = 5;
export const BACK_LIMIT = 3;
export const SAFE_LAG = 2;
export const SCROLL_MIN = 0.35;
export const SCROLL_MAX = 0.9;

// Generation (§5).
export const DIFFICULTY_ROWS = 300;
export const SAFE_ROWS = 5;
/** Presentation units: one logical row has this depth, measured against t047/t119 road boundaries. */
export const ROW_DEPTH = 1.38;
/** Near-side vehicle placement keeps their elevated silhouettes inside their own rendered row. */
export const TRAFFIC_ROW_Z = 0.32;
export const TRAIN_BASE_Y = 0.13;
export const AHEAD_ROWS = 40;
export const BEHIND_ROWS = 20;
export const MOVERS = 3;
/** The furthest row a saved run may claim. Restoring regenerates every row up to it, so the cap keeps a tampered save
 * from freezing the tab; at about three rows a second it is hours beyond any real run. */
export const MAX_ROW = 50_000;
/** Every road gap leaves a standing player clear for at least this long (s). */
export const CROSS_WINDOW = 3 * HOP_TIME + 0.25;
/** A fixed column is never without a log for longer than this (s). */
export const RIVER_WAIT = 2.5;

// Rail (D2, F5).
export const TRAIN_SPEED = 18;
export const TRAIN_MIN = 12;
export const TRAIN_MAX = 20;
export const WARN_LEAD = 1.1;
export const WARN_FLOOR = 1.0;
export const RAIL_PERIOD_MIN = 5;
/** The light keeps flashing this long after the train's back leaves the band. */
export const WARN_TAIL = 0.15;

// Death and loop.
export const DEATH_TIME = 0.9;
export const DEATH_TIME_REDUCED = 0.3;
export const STEP = 1 / 60;

// Render span for lanes and hazards (tiles). No camera shows beyond it, even at the band's edge on a 1366 px landscape
// view with the camera's yaw; only what is inside the camera's window is drawn, so a wider span costs nothing.
export const RENDER_X_MIN = -40;
export const RENDER_X_MAX = 48;
export const VEHICLE_PALETTE = 7;
/** Charlie's reference proportions: longer car silhouette; collision uses this same span. */
export const CAR_LENGTH = 1.5;
export const TRAIN_PALETTE = 4;
export const LOG_PALETTE = 3;

export const DIRS: Readonly<Record<Dir, { readonly dr: number; readonly dc: number }>> = {
  up: { dr: 1, dc: 0 }, down: { dr: -1, dc: 0 }, left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 },
};

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Difficulty 0..1, reached at row 300. */
export const difficulty = (row: number): number => clamp(row / DIFFICULTY_ROWS, 0, 1);
/** Auto-scroll speed of the safe line (rows/s) once the best row is `row`. */
export const scrollRate = (row: number): number => lerp(SCROLL_MIN, SCROLL_MAX, difficulty(row));
/** Smallest road gap (tiles, back of one vehicle to the front of the next) at a speed: at least 3 tiles,
 * and long enough that a player standing in the lane is clear for CROSS_WINDOW seconds. */
export const roadGapMin = (speed: number): number => Math.max(3, 2 * PLAYER_HALF - 2 * VEHICLE_INSET + speed * CROSS_WINDOW);
/** Largest river gap at a speed: no more than 4 tiles, and a fixed column waits at most RIVER_WAIT seconds for a log. */
export const riverGapMax = (speed: number): number => Math.min(4, 2 * PLATFORM_GRACE + RIVER_WAIT * speed);
/** Revision six: adjacent log rows always slide past each other at least this fast (tiles/s), so a rider on the lower
 * row sweeps across the upper row's gaps and finds a landing within (largest gap − 2·grace) / LOG_SLIP seconds. */
export const LOG_SLIP = 0.8;
/** Revision six: the largest log gap at a difficulty (also bounded by riverGapMax for the lane's speed). */
export const logGapCap = (d: number): number => lerp(1.8, 2.6, clamp(d, 0, 1));
