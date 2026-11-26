import { ChessAIError, findOpponent, type ChessAIOpponentSession, type ChessAIRegistry } from '../../chess-ai';
import { LocalMatch, type MatchSnapshot } from './match';
import type { Color, Outcome } from './rules';
import type { TimeControl } from './time-control';

/** What the game screen needs from any kind of game. */
export interface PlayerInfo { readonly name: string; readonly rating?: number | null; readonly change?: number | null; readonly provisional?: boolean; readonly kind: 'human' | 'ai' | 'remote' }
export interface SessionView {
  readonly startFen: string;
  readonly moves: readonly string[];
  readonly outcome: Outcome | null;
  readonly drawOffer: Color | null;
  /** Remaining ms now, and which side is running; null for untimed games. */
  readonly clock: { readonly w: number; readonly b: number; readonly running: Color | null } | null;
}
export type SessionKind = 'local' | 'computer' | 'friend' | 'ranked' | 'archive';

export interface Session {
  readonly kind: SessionKind;
  readonly rated: boolean;
  readonly tc: TimeControl | null;
  players(): { w: PlayerInfo; b: PlayerInfo };
  /** Colours a person on this device may move right now (may be empty). */
  controls(): readonly Color[];
  /** The side shown at the bottom by default. */
  readonly perspective: Color;
  view(now: number): SessionView;
  /** A short status line, such as "Thinking", "Connecting", or an error. */
  status(): string;
  move(uci: string): boolean;
  resign(): void;
  offerDraw(): void;
  acceptDraw(): void;
  declineDraw(): void;
  claimDraw(): void;
  canTakeback(): boolean;
  takeback(): void;
  /** Whether premoves make sense (only against another player or engine). */
  readonly premoves: boolean;
  tick(now: number): void;
  pause(now: number): void;
  resume(now: number): void;
  /** Pausing stops the clock (casual games). False for online games. */
  readonly pausable: boolean;
  dispose(): void;
  onChange?: () => void;
}

export interface LocalSaved {
  readonly kind: 'local' | 'computer';
  readonly match: MatchSnapshot;
  readonly human?: Color;
  readonly opponentId?: string;
  readonly takebacks?: boolean;
  readonly names?: { w: string; b: string };
}

/** Same-device and computer games. The computer plays through the shared chess AI contract. */
export class LocalSession implements Session {
  readonly kind: 'local' | 'computer';
  readonly rated = false;
  readonly pausable = true;
  readonly premoves: boolean;
  readonly perspective: Color;
  onChange?: () => void;
  private revision = 0;
  private thinking = false;
  private error = '';
  private loading = '';
  private engine?: ChessAIOpponentSession;
  private opening?: AbortController;
  private disposed = false;

  constructor(
    readonly match: LocalMatch,
    private readonly opts: { kind: 'local' | 'computer'; human?: Color; opponentId?: string; registry?: ChessAIRegistry; takebacks?: boolean; names?: { w: string; b: string } },
    private readonly now: () => number,
  ) {
    this.kind = opts.kind;
    this.perspective = opts.human ?? 'w';
    this.premoves = opts.kind === 'computer';
  }

  get tc() { return this.match.tc; }

  players() {
    if (this.kind === 'local') {
      const n = this.opts.names ?? { w: 'White', b: 'Black' };
      return { w: { name: n.w, kind: 'human' as const }, b: { name: n.b, kind: 'human' as const } };
    }
    const o = findOpponent(this.opts.opponentId ?? '');
    const ai: PlayerInfo = { name: o?.name ?? 'Computer', rating: o?.targetElo ?? null, kind: 'ai' };
    const me: PlayerInfo = { name: 'You', kind: 'human' };
    return this.opts.human === 'w' ? { w: me, b: ai } : { w: ai, b: me };
  }

  controls(): Color[] {
    if (this.match.over || this.match.isPaused) return [];
    if (this.kind === 'local') return [this.match.turn];
    return [this.opts.human!];
  }

  view(now: number): SessionView {
    const m = this.match;
    const running = m.clock?.running ?? null;
    return {
      startFen: m.rules.start, moves: m.rules.historyUci, outcome: m.outcome, drawOffer: m.drawOffer,
      clock: m.clock ? { w: m.remaining('w', now)!, b: m.remaining('b', now)!, running: m.over ? null : running } : null,
    };
  }

  status(): string { return this.error || this.loading || (this.thinking ? 'Thinking' : ''); }

  /** Loads the engine, then lets it move if it is its turn. */
  async start(): Promise<void> {
    if (this.kind !== 'computer' || !this.opts.registry) return;
    this.opening = new AbortController();
    this.loading = 'Loading engine';
    this.changed();
    try {
      this.engine = await this.opts.registry.openOpponent(this.opts.opponentId!, {
        signal: this.opening.signal,
        onProgress: (p) => { this.loading = `Loading ${p.provider.name}${p.fraction !== undefined ? ` ${Math.round(p.fraction * 100)}%` : ''}`; this.changed(); },
      });
      this.loading = '';
      if (this.disposed) { this.engine.dispose(); this.engine = undefined; return; }
    } catch (e) {
      if (this.disposed) return;
      this.loading = '';
      this.error = e instanceof ChessAIError && e.code === 'unavailable' ? 'This opponent is not installed.' : `Engine failed to start. ${e instanceof Error ? e.message : ''}`.trim();
      this.changed();
      return;
    }
    this.changed();
    this.engineTurn();
  }

  retry() { this.error = ''; if (!this.engine) void this.start(); else this.engineTurn(); }

  move(uci: string): boolean {
    if (!this.controls().includes(this.match.turn)) return false;
    const r = this.match.move(uci, this.now());
    if (!r) return false;
    this.revision++;
    this.changed();
    this.engineTurn();
    return true;
  }

  private engineTurn() {
    const m = this.match;
    if (this.kind !== 'computer' || !this.engine || m.over || m.isPaused || m.turn === this.opts.human) return;
    const revision = ++this.revision;
    const left = m.remaining(m.turn, this.now());
    const base = this.engine.opponent.defaultThinkingTimeMs;
    const budget = left === null ? base : Math.max(100, Math.min(base, left / 30 + (m.tc?.incrementMs ?? 0) / 2));
    this.thinking = true;
    this.error = '';
    this.changed();
    this.engine.requestMove({
      fen: m.rules.fen, startFen: m.rules.start, moveHistoryUci: m.rules.historyUci, legalMovesUci: m.rules.legalMovesUci(),
      positionRevision: revision, thinkingTimeMs: budget,
      ...(left !== null ? { clock: { remainingMs: left, incrementMs: m.tc?.incrementMs ?? 0 } } : {}),
    }).then((reply) => {
      if (this.disposed || revision !== this.revision) return;
      this.thinking = false;
      // The rules layer re-checks the move; a refusal is an engine error, never forced.
      if (!m.move(reply.moveUci, this.now())) { this.error = 'The engine sent an illegal move.'; this.changed(); return; }
      this.revision++;
      this.changed();
    }, (e: unknown) => {
      if (this.disposed || revision !== this.revision) return;
      this.thinking = false;
      if (e instanceof ChessAIError && (e.code === 'stale' || e.code === 'aborted' || e.code === 'disposed')) { this.changed(); return; }
      this.error = `Engine error. ${e instanceof Error ? e.message : ''}`.trim();
      this.changed();
    });
  }

  resign() { this.match.resign(this.kind === 'local' ? this.match.turn : this.opts.human!, this.now()); this.stopEngine(); this.changed(); }
  offerDraw() {
    // A local opponent accepts on the same device through the draw prompt; engines do not take draw offers.
    if (this.kind === 'local') { this.match.offerDraw(this.match.turn); this.changed(); }
  }
  acceptDraw() { if (this.match.drawOffer) { this.match.acceptDraw(this.match.drawOffer === 'w' ? 'b' : 'w', this.now()); this.changed(); } }
  declineDraw() { this.match.declineDraw(); this.changed(); }
  claimDraw() { if (this.match.claimDraw(this.now())) { this.stopEngine(); this.changed(); } }

  canTakeback(): boolean {
    if (this.kind === 'local') return this.match.rules.ply > 0;
    return !!this.opts.takebacks && this.match.rules.ply > 0 && !this.loading;
  }

  takeback() {
    if (!this.canTakeback()) return;
    const m = this.match;
    let plies = 1;
    // Against the computer, take back to the player's own turn.
    if (this.kind === 'computer') plies = m.turn === this.opts.human && !this.thinking ? 2 : 1;
    this.stopEngine();
    m.takeback(Math.min(plies, m.rules.ply), this.now());
    this.revision++;
    this.changed();
    this.engineTurn();
  }

  tick(now: number) { if (this.match.tick(now)) { this.stopEngine(); this.changed(); } }
  pause(now: number) { this.match.pause(now); this.stopEngine(); this.changed(); }
  resume(now: number) { this.match.resume(now); this.changed(); this.engineTurn(); }

  private stopEngine() {
    this.revision++;
    this.thinking = false;
    this.engine?.cancel();
  }

  saved(): LocalSaved {
    return { kind: this.kind, match: this.match.snapshot(this.now()), human: this.opts.human, opponentId: this.opts.opponentId, takebacks: this.opts.takebacks, names: this.opts.names };
  }

  dispose() {
    this.disposed = true;
    this.opening?.abort();
    this.engine?.dispose();
    this.onChange = undefined;
  }

  private changed() { this.onChange?.(); }
}

/** A finished game opened for review. Read-only. */
export class ArchiveSession implements Session {
  readonly kind = 'archive' as const;
  readonly rated: boolean;
  readonly pausable = false;
  readonly premoves = false;
  readonly tc: TimeControl | null;
  readonly perspective: Color;
  constructor(private readonly game: { startFen: string; moves: readonly string[]; outcome: Outcome | null; players: { w: PlayerInfo; b: PlayerInfo }; rated?: boolean; tc?: TimeControl | null; perspective?: Color }) {
    this.rated = !!game.rated;
    this.tc = game.tc ?? null;
    this.perspective = game.perspective ?? 'w';
  }
  players() { return this.game.players; }
  controls() { return []; }
  view(): SessionView { return { startFen: this.game.startFen, moves: this.game.moves, outcome: this.game.outcome, drawOffer: null, clock: null }; }
  status() { return ''; }
  move() { return false; }
  resign() {}
  offerDraw() {}
  acceptDraw() {}
  declineDraw() {}
  claimDraw() {}
  canTakeback() { return false; }
  takeback() {}
  tick() {}
  pause() {}
  resume() {}
  dispose() {}
}
