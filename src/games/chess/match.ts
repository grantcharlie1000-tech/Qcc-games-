import { ChessRules, START_FEN, type Color, type MoveRecord, type Outcome, type Result, type Termination } from './rules';
import { flagged, newClock, pressClock, remaining, startClock, stopClock, type ClockState, type TimeControl } from './time-control';

/**
 * A game played on this device (local, computer, or hosted friend game).
 * Rules come from ChessRules; time from a monotonic clock passed in.
 */
export interface MatchSnapshot {
  readonly v: 1;
  readonly startFen: string;
  readonly moves: readonly string[];
  readonly tc: TimeControl | null;
  /** Remaining time when saved; the clock is stopped in a snapshot. */
  readonly clock: { readonly w: number; readonly b: number } | null;
  readonly outcome: Outcome | null;
  readonly drawOffer: Color | null;
}

const RESULTS: readonly Result[] = ['1-0', '0-1', '1/2-1/2'];
const TERMINATIONS: readonly Termination[] = ['checkmate', 'stalemate', 'insufficient', 'fivefold', 'seventy-five', 'threefold', 'fifty-move', 'agreement', 'resignation', 'timeout', 'timeout-vs-insufficient', 'abandoned', 'aborted'];

export class LocalMatch {
  rules: ChessRules;
  clock: ClockState | null;
  outcome: Outcome | null = null;
  drawOffer: Color | null = null;
  readonly tc: TimeControl | null;
  private paused = false;

  constructor(tc: TimeControl | null, startFen = START_FEN) {
    this.tc = tc;
    this.rules = new ChessRules(startFen);
    this.clock = tc ? newClock(tc) : null;
  }

  get over(): boolean { return !!this.outcome; }
  get turn(): Color { return this.rules.turn; }
  /** Clocks run from White's first move, like over-the-board play with the clock started by Black. */
  get clockStarted(): boolean { return this.rules.ply >= 1; }

  remaining(side: Color, now: number): number | null {
    return this.clock ? remaining(this.clock, side, now) : null;
  }

  move(uci: string, now: number): MoveRecord | null {
    if (this.outcome || this.paused) return null;
    this.tick(now);
    if (this.outcome) return null;
    const mover = this.rules.turn;
    const record = this.rules.move(uci);
    if (!record) return null;
    if (this.clock) {
      this.clock = this.rules.ply === 1 ? startClock(this.clock, this.rules.turn, now) : pressClock(this.clock, mover, now);
    }
    if (this.drawOffer && this.drawOffer !== mover) this.drawOffer = null;
    const o = this.rules.outcome();
    if (o) this.finish(o, now);
    return record;
  }

  /** Applies a time forfeit if the running side has run out. */
  tick(now: number): boolean {
    if (!this.clock || this.outcome || this.paused) return false;
    const side = flagged(this.clock, now);
    if (!side) return false;
    this.clock = { ...stopClock(this.clock, now), [side]: 0 };
    this.outcome = this.rules.timeoutOutcome(side);
    return true;
  }

  resign(color: Color, now: number) {
    if (this.outcome) return;
    this.finish(this.rules.ply < 2 && this.tc ? { result: '1/2-1/2', termination: 'aborted' } : { result: color === 'w' ? '0-1' : '1-0', termination: 'resignation', winner: color === 'w' ? 'b' : 'w' }, now);
  }

  offerDraw(color: Color) { if (!this.outcome) this.drawOffer = color; }
  acceptDraw(color: Color, now: number): boolean {
    if (this.outcome || !this.drawOffer || this.drawOffer === color) return false;
    this.finish({ result: '1/2-1/2', termination: 'agreement' }, now);
    return true;
  }
  declineDraw() { this.drawOffer = null; }

  /** Claims threefold or 50-move for the side to move. */
  claimDraw(now: number): boolean {
    const claim = this.rules.claimable()[0];
    if (this.outcome || !claim) return false;
    this.finish({ result: '1/2-1/2', termination: claim }, now);
    return true;
  }

  /** Takes back `plies` moves and reopens a finished game. Clocks keep their current times. */
  takeback(plies: number, now: number): number {
    let undone = 0;
    while (undone < plies && this.rules.ply > 0) { this.rules.undo(); undone++; }
    if (!undone) return 0;
    this.outcome = null;
    this.drawOffer = null;
    if (this.clock) {
      const stopped = stopClock(this.clock, now);
      this.clock = this.rules.ply >= 1 && !this.paused ? startClock(stopped, this.rules.turn, now) : stopped;
    }
    return undone;
  }

  pause(now: number) {
    if (this.paused) return;
    this.paused = true;
    if (this.clock) this.clock = stopClock(this.clock, now);
  }

  resume(now: number) {
    if (!this.paused) return;
    this.paused = false;
    if (this.clock && !this.outcome && this.clockStarted) this.clock = startClock(this.clock, this.rules.turn, now);
  }

  get isPaused() { return this.paused; }

  private finish(o: Outcome, now: number) {
    this.outcome = o;
    this.drawOffer = null;
    if (this.clock) this.clock = stopClock(this.clock, now);
  }

  snapshot(now: number): MatchSnapshot {
    const c = this.clock ? stopClock(this.clock, now) : null;
    return { v: 1, startFen: this.rules.start, moves: this.rules.historyUci, tc: this.tc, clock: c ? { w: c.w, b: c.b } : null, outcome: this.outcome, drawOffer: this.drawOffer };
  }

  /** Rebuilds a match from untrusted saved data; returns null if anything is invalid. Restored games start paused. */
  static restore(data: unknown, now: number): LocalMatch | null {
    if (!data || typeof data !== 'object') return null;
    const s = data as Partial<MatchSnapshot>;
    if (s.v !== 1 || typeof s.startFen !== 'string' || !Array.isArray(s.moves) || s.moves.length > 2000) return null;
    const tc = s.tc === null ? null : validTc(s.tc);
    if (tc === undefined) return null;
    let m: LocalMatch;
    try {
      m = new LocalMatch(tc, s.startFen);
      for (const u of s.moves) if (typeof u !== 'string' || !m.rules.move(u)) return null;
    } catch { return null; }
    if (tc) {
      const c = s.clock;
      if (!c || !validMs(c.w) || !validMs(c.b)) return null;
      m.clock = { ...newClock(tc), w: c.w, b: c.b };
    }
    if (s.outcome) {
      const o = s.outcome;
      if (!RESULTS.includes(o.result) || !TERMINATIONS.includes(o.termination)) return null;
      m.outcome = { result: o.result, termination: o.termination, ...(o.winner === 'w' || o.winner === 'b' ? { winner: o.winner } : {}) };
    } else {
      const auto = m.rules.outcome();
      if (auto) m.outcome = auto;
    }
    m.drawOffer = s.drawOffer === 'w' || s.drawOffer === 'b' ? s.drawOffer : null;
    m.paused = true;
    void now;
    return m;
  }
}

const validMs = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 24 * 3600_000;
function validTc(tc: unknown): TimeControl | undefined {
  if (!tc || typeof tc !== 'object') return undefined;
  const t = tc as TimeControl;
  if (typeof t.id !== 'string' || !validMs(t.baseMs) || t.baseMs < 1000 || !validMs(t.incrementMs)) return undefined;
  return { id: t.id, baseMs: t.baseMs, incrementMs: t.incrementMs };
}

export const TERMINATION_TEXT: Record<Termination | string, string> = {
  checkmate: 'Checkmate', stalemate: 'Stalemate', insufficient: 'Insufficient material', fivefold: 'Fivefold repetition',
  'seventy-five': '75-move rule', threefold: 'Threefold repetition', 'fifty-move': '50-move rule', agreement: 'Draw agreed',
  resignation: 'Resignation', timeout: 'Time out', 'timeout-vs-insufficient': 'Time out, no mating material', abandoned: 'Abandoned',
  aborted: 'Aborted', 'no-first-move': 'Aborted',
};
