/** Shared Ball Run contract: tuning, constants and the types that the course
 * generator, the simulation, the renderer and the UI all agree on. Pure data
 * and arithmetic only, so it runs unchanged under Vitest's node environment.
 * Every number here is a remake design call (the reference recording cannot
 * reveal them); see SPEC.md before changing one. */

export const RADIUS = .38;
/** Snappier than Earth gravity so flights read clearly at arcade speeds. */
export const GRAVITY = 20;
/** The course descends along this base slope; features return to it. */
export const SLOPE = .12;
/** Fixed simulation step (seconds). */
export const STEP = 1 / 120;
/** First-order response of lateral velocity to steering input (1/s). */
export const STEER_RESPONSE = 10;
/** Lateral drift on a banked surface, in m/s per unit sin(bank), toward the low side. */
export const BANK_DRIFT = 6;
/** The generator only relies on this fraction of the ball's lateral authority. */
export const REACH_SAFETY = .7;
/** Clear, wide, straight opening (m). */
export const WARMUP = 80;
/** Track centre stays within ±this many metres of x = 0 so the tower canyon frames it. */
export const CENTER_LIMIT = 2;
/** "Speed Up" label and trail after passing a gate (s). Feedback only: the speed gain itself is permanent. */
export const GATE_FEEDBACK = 1.2;
/** Collision burst / fall time before Game Over (s). */
export const DYING_DURATION = .9;
/** A ball this far below the road surface can no longer recover (m). */
export const FALL_DEPTH = 1.5;
/** The ball loses support once its centre passes this far inside the road edge (m). */
export const EDGE_SUPPORT = RADIUS * .35;

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = typeof DIFFICULTIES[number];

export type SegmentKind = 'warmup' | 'straight' | 'bend' | 'offset' | 'ribbon' | 'ribbonBend' | 'bank' | 'crest' | 'dip' | 'drop' | 'gate';
export type PatternKind = 'single' | 'pair' | 'gate' | 'doubleGate' | 'slalom' | 'zigzag' | 'scatter' | 'slider' | 'wallRun' | 'bigBlock';

export interface DifficultyConfig {
  readonly label: string;
  /** Speed at distance 0 (m/s). */
  readonly startSpeed: number;
  /** Slow continuous forward acceleration over time (m/s²). */
  readonly acceleration: number;
  /** Speed cap (m/s); nothing exceeds it. */
  readonly maxSpeed: number;
  readonly roadWidth: number;
  readonly ribbonWidth: number;
  /** Narrowest gap between blocks, edge to edge (m). The ball is 0.76 m wide. */
  readonly minGap: number;
  /** Seconds between obstacle rows at full intensity, [min, max]. */
  readonly rowInterval: readonly [number, number];
  /** Seconds between rows at the start of a run, easing to rowInterval over rampDistance. */
  readonly introInterval: readonly [number, number];
  readonly rampDistance: number;
  /** After this many rows (range), leave a recovery stretch of restSeconds with no rows. */
  readonly restEvery: readonly [number, number];
  readonly restSeconds: readonly [number, number];
  readonly maxBank: number;
  /** Boost gates: each one passed adds speedGain (m/s) permanently. A gate comes every interval seconds of running. */
  readonly gate: { readonly speedGain: number; readonly interval: readonly [number, number] };
  /** Weights for the segments between gates (gates are scheduled by time, not drawn). */
  readonly segments: Readonly<Record<Exclude<SegmentKind, 'warmup' | 'gate'>, number>>;
  readonly patterns: Readonly<Record<PatternKind, number>>;
  /** Difficulty badge and Play colour. Text labels always accompany it. */
  readonly color: string;
}

export const CONFIG: Readonly<Record<Difficulty, DifficultyConfig>> = {
  easy: {
    label: 'Easy', startSpeed: 9, acceleration: .03, maxSpeed: 40,
    roadWidth: 6.2, ribbonWidth: 2.6, minGap: 2,
    rowInterval: [1, 1.8], introInterval: [1.6, 2.4], rampDistance: 700,
    restEvery: [10, 14], restSeconds: [3, 4.5], maxBank: .2,
    gate: { speedGain: 1, interval: [30, 45] },
    segments: { straight: 30, bend: 20, offset: 15, ribbon: 8, ribbonBend: 0, bank: 8, crest: 8, dip: 4, drop: 4 },
    patterns: { single: 30, pair: 18, gate: 16, doubleGate: 10, slalom: 8, zigzag: 4, scatter: 6, slider: 0, wallRun: 6, bigBlock: 4 },
    color: '#2bb24c',
  },
  medium: {
    label: 'Medium', startSpeed: 11, acceleration: .045, maxSpeed: 50,
    roadWidth: 5.4, ribbonWidth: 2.2, minGap: 1.7,
    rowInterval: [.68, 1.2], introInterval: [1.3, 2], rampDistance: 600,
    restEvery: [12, 16], restSeconds: [2.5, 3.5], maxBank: .26,
    gate: { speedGain: 1.25, interval: [25, 40] },
    segments: { straight: 22, bend: 18, offset: 15, ribbon: 8, ribbonBend: 4, bank: 10, crest: 8, dip: 4, drop: 5 },
    patterns: { single: 18, pair: 14, gate: 16, doubleGate: 10, slalom: 10, zigzag: 8, scatter: 8, slider: 8, wallRun: 5, bigBlock: 5 },
    color: '#e2a21b',
  },
  hard: {
    label: 'Hard', startSpeed: 13, acceleration: .06, maxSpeed: 62,
    roadWidth: 4.8, ribbonWidth: 1.8, minGap: 1.45,
    rowInterval: [.48, .9], introInterval: [1, 1.6], rampDistance: 500,
    restEvery: [16, 20], restSeconds: [1.8, 2.6], maxBank: .32,
    gate: { speedGain: 1.5, interval: [20, 35] },
    segments: { straight: 15, bend: 16, offset: 15, ribbon: 9, ribbonBend: 6, bank: 12, crest: 8, dip: 4, drop: 6 },
    patterns: { single: 10, pair: 12, gate: 16, doubleGate: 10, slalom: 12, zigzag: 12, scatter: 9, slider: 12, wallRun: 5, bigBlock: 6 },
    color: '#f0524f',
  },
};

export function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value);
}

/** Forward speed after `gates` boost gates: a slow continuous ramp (constant
 * time-acceleration, so v² grows linearly with distance) plus a permanent gain
 * per gate, capped. Every gate spans the whole road, so a surviving run has
 * passed exactly the gates behind it and speed is a pure function of distance. */
export function speedAt(difficulty: Difficulty, distance: number, gates: number): number {
  const c = CONFIG[difficulty];
  const ramp = Math.sqrt(c.startSpeed * c.startSpeed + 2 * c.acceleration * Math.max(0, distance));
  return Math.min(c.maxSpeed, ramp + c.gate.speedGain * Math.max(0, gates));
}

/** Maximum lateral steering speed at a forward speed: more authority when faster,
 * but less per metre travelled, so each dodge costs more road at speed. */
export function lateralSpeed(speed: number): number {
  return Math.max(5, 6 + .16 * (speed - 12));
}

export type Phase = 'ready' | 'running' | 'dying' | 'over';
export type DeathReason = '' | 'block' | 'fall';

/** One run. Lateral `x` is world-space; the road centre moves under it. */
export interface Run {
  version: 4;
  difficulty: Difficulty;
  seed: number;
  /** Run counter; increments on every fresh course. */
  run: number;
  phase: Phase;
  distance: number;
  x: number;
  vx: number;
  /** World height of the ball centre. */
  height: number;
  vy: number;
  grounded: boolean;
  /** Seconds spent running (drives sliding blocks). */
  elapsed: number;
  /** Seconds of "Speed Up" feedback remaining; 0 when idle. The speed gain itself is permanent. */
  speedUpTime: number;
  /** Index of the last gate passed, -1 for none. Equals course.gatesBefore(distance) - 1. */
  gateIndex: number;
  /** Seconds since death while dying. */
  dyingTime: number;
  /** Whole metres; frozen at the moment of death. */
  score: number;
  reason: DeathReason;
}

export interface TrackSample {
  /** World x of the road centreline. */
  center: number;
  /** Full road width (m). */
  width: number;
  /** World height of the surface on the centreline. Inside a gap: the landing level. */
  elevation: number;
  /** d(elevation)/d(distance). */
  gradient: number;
  /** Roll (rad). Surface height at world x is elevation - (x - center) * tan(bank); positive lowers the +x side. */
  bank: number;
  /** False inside a drop gap. */
  ground: boolean;
  /** Inside a boost gate's arch: solid, harmless side walls keep the ball centre within width/2 - RADIUS. */
  tunnel: boolean;
  kind: SegmentKind;
  segment: number;
}

export type ObstacleKind = 'block' | 'slider';

export interface Obstacle {
  /** Position in course order; stable for a seed and difficulty. */
  readonly id: number;
  readonly kind: ObstacleKind;
  readonly pattern: PatternKind;
  /** Track distance of the box centre (m). */
  readonly distance: number;
  /** Lateral centre relative to the road centre at `distance`, before sliding (m). */
  readonly offset: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
  /** Sliding blocks move offset + amplitude * sin(2π·elapsed/period + phase). */
  readonly slide: null | { readonly amplitude: number; readonly period: number; readonly phase: number };
}

/** World pose of an obstacle box: shared by collision and rendering. */
export interface ObstaclePose {
  x: number;
  y: number;
  /** Track distance (render z is its negation relative to the camera origin). */
  distance: number;
  roll: number;
  halfWidth: number;
  halfHeight: number;
  halfDepth: number;
}

export interface Gate {
  /** 0 for the first gate on the course. */
  readonly index: number;
  /** Arch entrance: crossing it adds the permanent speed gain. */
  readonly start: number;
  /** Arch exit. */
  readonly end: number;
  /** No obstacles before this distance: one second of clear run-out after the exit. */
  readonly clearEnd: number;
}

export interface Course {
  readonly seed: number;
  readonly difficulty: Difficulty;
  /** Track at a distance (negative clamps to 0); generates lazily. Writes into `out` when given. */
  sample(distance: number, out?: TrackSample): TrackSample;
  /** Surface height at world x, bank included. */
  surfaceHeight(distance: number, x: number): number;
  /** Calls fn for each obstacle whose depth span overlaps [from, to], in distance order. */
  forEachObstacle(from: number, to: number, fn: (obstacle: Obstacle) => void): void;
  /** Pose at a run time; writes into `out`. Only accepts obstacles this course issued via forEachObstacle.
   * The box is extended down to stay seated on sloped road, so collision and rendering must use the
   * pose's half sizes, never `obstacle.height`. */
  pose(obstacle: Obstacle, elapsed: number, out: ObstaclePose): ObstaclePose;
  /** Calls fn for each gate overlapping [from, to]. */
  forEachGate(from: number, to: number, fn: (gate: Gate) => void): void;
  /** Number of gates whose entrance is at or before `distance`. */
  gatesBefore(distance: number): number;
  /** Forward speed at a distance on this course: speedAt(difficulty, distance, gatesBefore(distance)). */
  speed(distance: number): number;
  /** Largest obstacle depth on this course, to widen collision queries. */
  readonly maxDepth: number;
}
