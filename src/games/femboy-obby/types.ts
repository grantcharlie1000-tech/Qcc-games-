/** Femboy Frosthop data model. The course is fixed data; the run is plain, cloneable state. Forward is -z. */

export type Surface =
  | 'snow' | 'gift' | 'candy' | 'ribbon' | 'knit' | 'ornament' | 'roof'
  | 'ice' | 'conveyor' | 'crumble' | 'spring' | 'checkpoint' | 'lift' | 'tray' | 'post';

export type ZoneId = 'giftwrap' | 'candycane' | 'knit' | 'rink' | 'skyway' | 'northpole';

/** Ping-pong translation from the base position to base + d, with a pause at each end. */
export interface Motion { dx: number; dy: number; dz: number; period: number; phase: number; dwell: number }

export interface Solid {
  id: number;
  stage: number;
  surface: Surface;
  /** Centre of the box at motion time 0. */
  x: number; y: number; z: number;
  hx: number; hy: number; hz: number;
  motion?: Motion;
  belt?: { x: number; z: number };
  /** Base colour (0xRRGGBB) and accent for the renderer; collision ignores them. */
  color: number;
  accent: number;
}

export interface Sweeper { id: number; stage: number; x: number; y: number; z: number; length: number; radius: number; omega: number; phase: number; arms: 1 | 2 }

export interface Snowball { id: number; stage: number; ax: number; ay: number; az: number; bx: number; by: number; bz: number; radius: number; travel: number; gap: number; phase: number }

export interface Checkpoint { index: number; x: number; y: number; z: number; yaw: number; solid: number }

export interface Star { id: string; stage: number; x: number; y: number; z: number }

export interface Decor { kind: 'tree' | 'gift' | 'cane' | 'lamp' | 'house' | 'bauble' | 'yarn' | 'chimney' | 'sleigh' | 'snowman' | 'flag' | 'island' | 'banner'; x: number; y: number; z: number; s: number; r: number; color: number }

export interface StageInfo {
  index: number; // 1..30
  zone: ZoneId;
  name: string;
  /** Checkpoint index this stage finishes on (equal to index). */
  checkpoint: number;
  /** Solid ids along the intended path, in order, ending at the checkpoint pad. Pass-through ids are flagged. */
  route: { id: number; through?: boolean }[];
}

export interface ZoneInfo { id: ZoneId; name: string; sky: number; fog: number; ground: number }

export interface Course {
  version: string;
  solids: Solid[];
  sweepers: Sweeper[];
  snowballs: Snowball[];
  checkpoints: Checkpoint[];
  stars: Star[];
  stages: StageInfo[];
  decor: Decor[];
  startLine: { z: number; x0: number; x1: number };
  /** Fail plane while checkpoint i is the latest one reached. */
  killY: number[];
  /** Solids grouped by the stage they belong to (index 0 = start plaza). */
  byStage: number[][];
}

export interface Intent { mx: number; mz: number; jump: boolean }

export interface Player {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Velocity inherited from a moving platform at take-off, cleared on landing. */
  ex: number; ez: number;
  grounded: boolean;
  support: number;
  coyote: number;
  buffer: number;
  jumpHeld: boolean;
  /** The current rise came from a jump and can still be shortened by releasing the button. */
  cut: boolean;
  facing: number;
}

export type CrumblePhase = 0 | 1 | 2; // idle, warning, gone

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land'; surface: Surface }
  | { type: 'spring' }
  | { type: 'death'; cause: 'fall' | 'sweeper' | 'snowball' }
  | { type: 'respawn' }
  | { type: 'checkpoint'; index: number }
  | { type: 'star'; id: string; stage: number }
  | { type: 'start-line' }
  | { type: 'crumble'; id: number };

export interface Run {
  /** Simulation steps since the run began. */
  steps: number;
  /** Motion time: advances more slowly while gameplay assistance is on. */
  mt: number;
  assist: boolean;
  player: Player;
  checkpoint: number;
  crumble: { id: number; phase: CrumblePhase; time: number }[];
  /** Seconds until respawn while dead; 0 when alive. */
  dead: number;
  deaths: number;
  stageFails: number;
  startCrossed: boolean;
  stars: string[];
  events: SimEvent[];
}
