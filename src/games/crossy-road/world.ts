/** The row cache over the generator: the `LaneSource` the rules and the renderer read. Pure: no DOM and no Three.js.
 * `lane()` is called hundreds of times per frame, so a cached row is a single Map lookup and allocates nothing. */
import type { GrassLane, Lane, LaneSource } from './config';
import { generateChunk, hedgeLane, initialState, type GenState } from './generator';

/** A pruned row: plain grass with nothing on it, so a stray look behind the cut is harmless. */
function openGrassLane(row: number): GrassLane {
  const lane = hedgeLane(row);
  lane.blocked.fill(false);
  lane.obstacles.fill(null);
  lane.variant.fill(0);
  lane.edge.fill(null);
  return lane;
}

function cloneLane(lane: Lane): Lane {
  switch (lane.kind) {
    case 'grass': return { ...lane, blocked: lane.blocked.slice(), obstacles: lane.obstacles.slice(), variant: lane.variant.slice(), edge: lane.edge.slice() };
    case 'road': return { ...lane, movers: lane.movers.map((m) => ({ ...m })) };
    case 'river': return { ...lane, movers: lane.movers.map((m) => ({ ...m })) };
    case 'lily': return { ...lane, pads: lane.pads.slice() };
    case 'rail': return { ...lane };
  }
}

function requireRow(row: number): void {
  if (!Number.isInteger(row)) throw new RangeError(`CrossyRoad rows are integers, got ${row}`);
}

export class World implements LaneSource {
  /** The seed as an unsigned 32-bit integer, the same normalisation `initialState` applies. */
  readonly seed: number;
  /** Generated (and overridden) rows that have not been pruned. */
  private readonly rows = new Map<number, Lane>();
  /** Rows below the start and pruned rows are made on first request and kept, so asking again never allocates. */
  private readonly hedges = new Map<number, Lane>();
  private readonly opens = new Map<number, Lane>();
  private state: GenState;
  private top = -1;
  /** Rows below this were pruned. It only rises. */
  private floor = 0;

  constructor(seed: number, version: 1 | 2 | 3 | 4 = 4) {
    this.state = initialState(seed, version);
    this.seed = this.state.seed;
  }

  /** Highest generated row index, or -1 before any. */
  get generatedTo(): number {
    return this.top;
  }

  lane(row: number): Lane {
    const hit = this.rows.get(row);
    return hit !== undefined ? hit : this.miss(row);
  }

  /** Generates whole chunks until `row` exists. Rows below the prune line are not kept. */
  ensure(row: number): void {
    requireRow(row);
    while (this.top < row) {
      const out = generateChunk(this.state);
      this.state = out.state;
      for (const lane of out.lanes) if (lane.row >= this.floor) this.rows.set(lane.row, lane);
      this.top = out.state.nextRow - 1;
    }
  }

  /** Forgets cached rows below `belowRow` (never a row at or above it). Asking for one later gives an open grass lane. */
  prune(belowRow: number): void {
    if (belowRow > this.floor) this.floor = belowRow;
    for (const row of this.rows.keys()) if (row < belowRow) this.rows.delete(row);
  }

  /** TEST HOOK ONLY: generates through the highest given row, then replaces exactly those rows with deep copies. */
  override(lanes: readonly Lane[]): void {
    let highest = -1;
    for (const lane of lanes) {
      requireRow(lane.row);
      highest = Math.max(highest, lane.row);
    }
    this.ensure(highest);
    for (const lane of lanes) this.rows.set(lane.row, cloneLane(lane));
  }

  private miss(row: number): Lane {
    requireRow(row);
    if (row < 0) return this.made(this.hedges, row, hedgeLane);
    if (row < this.floor) return this.made(this.opens, row, openGrassLane);
    this.ensure(row);
    return this.rows.get(row) as Lane;
  }

  private made(cache: Map<number, Lane>, row: number, make: (row: number) => Lane): Lane {
    let lane = cache.get(row);
    if (lane === undefined) {
      lane = make(row);
      cache.set(row, lane);
    }
    return lane;
  }
}
