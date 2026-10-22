import type { Board, Pour } from './rules';
import { boardKey, cloneBoard, legalPours, pour, won } from './rules';
import { LEVELS } from './levels';
import { solve } from './solver';
/** Best clear of one level: fewest pours, then fewest assists (hints and undos). */
export interface Best { pours: number; assists: number }
/** `best` is campaign progress keyed by level index: it survives restarts and level switches. */
export interface State { version: 1; level: number; tubes: Board; history: Board[]; assists: number; best: Record<string, Best> }
export type Hint = {kind:'pour';from:number;to:number;remaining:number} | {kind:'undo';steps:number} | {kind:'done'};
const freshState = (level: number, best: Record<string, Best> = {}): State => ({ version: 1, level, tubes: cloneBoard(LEVELS[level].board), history: [], assists: 0, best: { ...best } });
/** Base grows with colours and scramble depth; par is the shipped witness length. Each assist costs a tenth of base from the bonus. */
export function levelPoints(level: number, best: Best): number {
  const { colours, witness } = LEVELS[level], base = 50 * colours * (witness.length / 3 + 2);
  return base + Math.max(0, Math.round(base * Math.min(1, witness.length / Math.max(1, best.pours))) - best.assists * Math.round(base / 10));
}
export const campaignScore = (best: Record<string, Best>): number => Object.entries(best).reduce((sum, [level, b]) => sum + levelPoints(Number(level), b), 0);
/** A won board updates its level's record only when that scores higher. */
export function recordWin(state: State): State {
  if (!won(state.tubes)) return state;
  const next = { pours: state.history.length, assists: state.assists }, old = state.best[state.level];
  return old && levelPoints(state.level, old) >= levelPoints(state.level, next) ? state : { ...state, best: { ...state.best, [state.level]: next } };
}
const count = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
/** Old snapshots lack `best`; malformed entries are dropped. */
export function readBest(value: unknown): Record<string, Best> {
  const best: Record<string, Best> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return best;
  for (const [key, entry] of Object.entries(value)) {
    const b = entry as Partial<Best> | null;
    if (/^\d+$/.test(key) && LEVELS[Number(key)] && b && typeof b === 'object' && count(b.pours, 5000) && b.pours! > 0 && count(b.assists, 1e6)) best[Number(key)] = { pours: b.pours!, assists: b.assists! };
  }
  return best;
}
function validBoard(value: unknown, colours: number): value is number[][] {
  if (!Array.isArray(value) || value.length !== colours + 2) return false;
  const counts = Array<number>(colours).fill(0);
  for (const tube of value) {
    if (!Array.isArray(tube) || tube.length > 4) return false;
    for (const c of tube) {
      if (!Number.isInteger(c) || c < 0 || c >= colours) return false;
      counts[c]++;
    }
  }
  return counts.every(count => count === 4);
}
export function readSnapshot(data: unknown): State | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Partial<State>;
  if (value.version !== 1 || !Number.isInteger(value.level) || !LEVELS[value.level!]) return null;
  const level = value.level!, colours = LEVELS[level].colours;
  if (!validBoard(value.tubes, colours) || !Array.isArray(value.history) || value.history.length > 5000) return null;
  let previous = LEVELS[level].board;
  const chain = [...value.history, value.tubes];
  for (let index = 0; index < chain.length; index++) {
    const board = chain[index];
    if (!validBoard(board, colours)) return null;
    // First history item must be the shipped board; each later one must be a
    // real maximal-run move. Zero-history snapshots cannot forge a victory.
    if (index === 0) {
      if (boardKey(board) !== boardKey(previous)) return null;
    } else if (won(previous) || !legalPours(previous).some(move => boardKey(move.board) === boardKey(board))) return null;
    previous = board;
  }
  return recordWin({ version:1, level, tubes:cloneBoard(value.tubes), history:value.history.map(cloneBoard), assists:count(value.assists, 1e6) ? value.assists : 0, best:readBest(value.best) });
}
export function hintFor(state: State): Hint {
  if (won(state.tubes)) return { kind:'done' };
  const path = solve(state.tubes);
  if (path?.length) return { kind:'pour', from:path[0][0], to:path[0][1], remaining:path.length };
  for (let i = state.history.length - 1; i >= 0; i--) {
    if (solve(state.history[i])) return { kind:'undo', steps:state.history.length - i };
  }
  // Valid states always have their reverse-constructed start in their history.
  return { kind:'undo', steps:state.history.length };
}
export class Session {
  state: State;
  paused = false;
  pending: {move:Pour;elapsed:number;duration:number} | null = null;
  constructor(level = 0, best: Record<string, Best> = {}) { this.state = freshState(LEVELS[level] ? level : 0, best); }
  begin(from:number, to:number, duration=260): boolean {
    if (this.paused || this.pending || won(this.state.tubes) || this.state.history.length >= 5000) return false;
    const move = pour(this.state.tubes, from, to);
    if (!move) return false;
    this.pending = { move, elapsed:0, duration:Math.max(0,duration) };
    return true;
  }
  advance(ms:number): boolean {
    if (this.paused || !this.pending) return false;
    this.pending.elapsed += Math.max(0, ms);
    if (this.pending.elapsed < this.pending.duration) return false;
    this.state = recordWin({ ...this.state, tubes:this.pending.move.board, history:[...this.state.history, cloneBoard(this.state.tubes)] });
    this.pending = null;
    return true;
  }
  undo(): boolean {
    if (this.paused || this.pending || !this.state.history.length) return false;
    const history = [...this.state.history];
    const tubes = history.pop()!;
    this.state = { ...this.state, tubes:cloneBoard(tubes), history, assists:this.state.assists + 1 };
    return true;
  }
  hint(): Hint { if (!won(this.state.tubes)) this.state = { ...this.state, assists:this.state.assists + 1 }; return hintFor(this.state); }
  restart(): void { this.pending = null; this.state = freshState(this.state.level, this.state.best); }
}
