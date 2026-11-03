/** Development-only test hook, `window.__crossyRoadTest`. index.ts installs it only when
 * `import.meta.env.DEV` is true, so production builds drop this module entirely.
 * It lets browser tests set the seed, read state, step time deterministically and force lanes. */
import type { CrossyRoadScene, Lane, Quality, RunState, Dir } from './config';
import { railWarning } from './lanes';
import { idleTime, ufoWarning } from './rules';
import type { World } from './world';

export interface HookHost {
  run(): RunState;
  world(): World;
  scene(): CrossyRoadScene;
  /** A new run on this seed, in the ready phase. */
  setSeed(seed: number): void;
  /** Uses the game's validated restore path, including its Continue card. */
  restore(snapshot: unknown): void;
  /** While frozen, real time no longer advances the simulation (the loop keeps drawing). */
  freeze(on: boolean): void;
  /** Steps the simulation by `seconds` in fixed steps, then draws. */
  advance(seconds: number): void;
  redraw(): void;
  /** The same path as a key press or tap. */
  move(dir: Dir): void;
  quality(): Quality;
  setQuality(quality: Quality): void;
  fps(): number;
  /** Moving average of the main-thread milliseconds per frame. */
  cpuMs(): number;
  frames(): number;
  looping(): boolean;
}

export interface CrossyRoadTestApi {
  setSeed(seed: number): void;
  restore(snapshot: unknown): void;
  freeze(on: boolean): void;
  advance(seconds: number): void;
  hop(dir: Dir): void;
  state(): HookState;
  lanes(from: number, to: number): Lane[];
  forceLanes(lanes: Lane[]): void;
  stats(): { quality: Quality; fps: number; cpuMs: number; frames: number; looping: boolean; calls: number; triangles: number; geometries: number; textures: number; programs: number };
  setQuality(quality: Quality): void;
}

export interface HookState {
  seed: number; phase: RunState['phase']; row: number; col: number; x: number; maxRow: number; score: number;
  alive: boolean; deathCause: string | null; t: number; idle: number; ufoWarning: boolean; safeLine: number;
  hopping: boolean; queued: Dir | null; started: boolean;
  /** Rail rows from row−2 to row+8 whose signal is flashing now. */
  railWarnings: number[];
  /** Lanes from row−2 to row+8 (copies). */
  lanes: Lane[];
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function installTestHook(host: HookHost): () => void {
  const near = (from: number, to: number) => {
    const lanes: Lane[] = [];
    for (let r = from; r <= to; r++) lanes.push(copy(host.world().lane(r)));
    return lanes;
  };
  const api: CrossyRoadTestApi = {
    setSeed: seed => host.setSeed(seed),
    restore: snapshot => host.restore(snapshot),
    freeze: on => host.freeze(on),
    advance: seconds => { if (Number.isFinite(seconds) && seconds > 0) host.advance(seconds); },
    hop: dir => host.move(dir),
    state() {
      const s = host.run(), world = host.world();
      const railWarnings: number[] = [];
      for (let r = s.row - 2; r <= s.row + 8; r++) { const lane = world.lane(r); if (lane.kind === 'rail' && railWarning(lane, s.t, s.x)) railWarnings.push(r); }
      return {
        seed: s.seed, phase: s.phase, row: s.row, col: Math.round(s.x), x: s.x, maxRow: s.maxRow, score: s.maxRow,
        alive: s.phase === 'ready' || s.phase === 'running', deathCause: s.death?.cause ?? null, t: s.t, idle: idleTime(s),
        ufoWarning: ufoWarning(s), safeLine: s.safeLine, hopping: s.hop >= 0, queued: s.queued, started: s.started,
        railWarnings, lanes: near(s.row - 2, s.row + 8),
      };
    },
    lanes: (from, to) => near(Math.floor(from), Math.floor(to)),
    forceLanes(lanes) { host.world().override(copy(lanes)); host.redraw(); },
    stats() {
      const stats = host.scene().stats;
      return { quality: host.quality(), fps: host.fps(), cpuMs: host.cpuMs(), frames: host.frames(), looping: host.looping(), calls: stats.calls, triangles: stats.triangles, geometries: stats.geometries, textures: stats.textures, programs: stats.programs };
    },
    setQuality: quality => host.setQuality(quality),
  };
  const target = window as unknown as { __crossyRoadTest?: CrossyRoadTestApi };
  target.__crossyRoadTest = api;
  return () => { if (target.__crossyRoadTest === api) delete target.__crossyRoadTest; };
}
