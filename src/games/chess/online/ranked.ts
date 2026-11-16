import * as store from '../../../core/storage';
import { START_FEN, type Color, type Outcome, type Result, type Termination } from '../rules';
import type { PlayerInfo, Session, SessionView } from '../session';
import type { TimeControl } from '../time-control';
import { CHESS_ENDPOINT, type LeaderboardView, type MeView, type ProfileView, type RankedCommand, type RankedGameView, type RankedQueueView } from './protocol';
import type { Category } from '../time-control';

export class ChessApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'ChessApiError'; }
}

/** The signed-in QCC account on this browser, read the same way the shared leaderboard does. */
export function accountSession(): { token: string; username: string } | null {
  const s = store.read<{ token?: string; username?: string } | null>('accounts:session', null);
  return s && typeof s.token === 'string' && /^acct_[a-f0-9]{64}$/.test(s.token) && typeof s.username === 'string' ? { token: s.token, username: s.username } : null;
}

const commandId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');

export class ChessApi {
  constructor(private readonly fetcher: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  private async call<T>(query: string, init: RequestInit = {}, auth = true): Promise<T> {
    const token = accountSession()?.token;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    if (init.body) headers['Content-Type'] = 'application/json';
    let response: Response;
    try {
      response = await this.fetcher(`${CHESS_ENDPOINT}?${query}`, { ...init, headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    } catch {
      throw new ChessApiError(0, 'network', 'No connection. Retrying.');
    }
    let body: any = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok) {
      const message = typeof body?.message === 'string' ? body.message : response.status === 401 ? 'Log in to play ranked.' : response.status === 503 || response.status === 404 && !body ? 'Ranked chess is not available right now.' : 'Something went wrong.';
      throw new ChessApiError(response.status, typeof body?.error === 'string' ? body.error : 'error', message);
    }
    return body as T;
  }

  me() { return this.call<MeView>('action=me'); }
  leaderboard(category: Category, q = '') { return this.call<LeaderboardView>(`action=leaderboard&category=${category}${q ? `&q=${encodeURIComponent(q)}` : ''}`); }
  profile(name: string) { return this.call<ProfileView>(`action=profile&name=${encodeURIComponent(name)}`, {}, false); }
  join(timeControl: string) { return this.call<RankedQueueView>('action=join', { method: 'POST', body: JSON.stringify({ timeControl }) }); }
  queue() { return this.call<RankedQueueView>('action=queue'); }
  leave() { return this.call<RankedQueueView>('action=leave', { method: 'POST', body: '{}' }); }
  game(id: string, since?: number) { return this.call<RankedGameView>(`action=game&id=${encodeURIComponent(id)}${since !== undefined ? `&since=${since}` : ''}`); }
  command(gameId: string, type: RankedCommand, revision: number, extra: Record<string, unknown> = {}, id = commandId()) {
    return this.call<RankedGameView>('action=command', { method: 'POST', body: JSON.stringify({ gameId, type, revision, commandId: id, ...extra }) });
  }
}

const RESULTS: Result[] = ['1-0', '0-1', '1/2-1/2'];

/** A live ranked game. The server is the authority; this mirrors it and sends commands. */
export class RankedSession implements Session {
  readonly kind = 'ranked' as const;
  readonly rated = true;
  readonly pausable = false;
  readonly premoves = true;
  onChange?: () => void;
  private game: RankedGameView & { moves: readonly string[] };
  private received: number;
  private timer = 0;
  private problem = '';
  private sending = false;
  private disposed = false;

  constructor(private readonly api: ChessApi, initial: RankedGameView, private readonly now: () => number) {
    this.game = { ...initial, moves: initial.moves ?? [] };
    this.received = now();
    this.schedule(0);
    document.addEventListener('visibilitychange', this.visible);
  }

  get id() { return this.game.id; }
  get tc(): TimeControl { return { id: `${this.game.baseMs / 60000}+${this.game.incrementMs / 1000}`, baseMs: this.game.baseMs, incrementMs: this.game.incrementMs }; }
  get perspective(): Color { return this.game.color ?? 'w'; }
  get category() { return this.game.category; }
  get firstMoveMsLeft(): number | null {
    const left = this.game.firstMoveMsLeft;
    return left === null ? null : Math.max(0, left - (this.now() - this.received));
  }
  get finishedView(): RankedGameView { return this.game; }

  players(): { w: PlayerInfo; b: PlayerInfo } {
    const g = this.game, me = g.color;
    const info = (c: Color): PlayerInfo => {
      const p = c === 'w' ? g.white : g.black;
      return { name: p.name, rating: p.rating ?? g.ratings?.[c] ?? null, change: p.change, kind: c === me ? 'human' : 'remote' };
    };
    return { w: info('w'), b: info('b') };
  }

  private get turn(): Color { return this.game.moves.length % 2 === 0 ? 'w' : 'b'; }

  controls(): Color[] { return this.game.status === 'active' && this.game.color && !this.sending ? [this.game.color] : []; }

  view(now: number): SessionView {
    const g = this.game;
    const running = g.status === 'active' && g.clock.running ? this.turn : null;
    const spent = now - this.received;
    const clock = { w: g.clock.w, b: g.clock.b, running };
    if (running) clock[running] = Math.max(0, clock[running] - spent);
    return { startFen: START_FEN, moves: g.moves, outcome: this.outcome(), drawOffer: g.drawOffer, clock };
  }

  private outcome(): Outcome | null {
    const g = this.game;
    if (g.status === 'aborted') return { result: '1/2-1/2', termination: 'aborted' };
    if (g.status !== 'finished' || !RESULTS.includes(g.result as Result)) return null;
    const result = g.result as Result;
    return { result, termination: (g.termination ?? 'resignation') as Termination, ...(result === '1-0' ? { winner: 'w' as const } : result === '0-1' ? { winner: 'b' as const } : {}) };
  }

  status(): string {
    if (this.problem) return this.problem;
    const left = this.firstMoveMsLeft;
    if (this.game.status === 'active' && left !== null && this.turn === this.game.color) return `Move within ${Math.ceil(left / 1000)} s or the game is aborted`;
    return '';
  }

  move(uci: string): boolean {
    const g = this.game;
    if (!this.controls().includes(this.turn)) return false;
    // Show the move now; the server answer replaces it, or a refusal restores the true position.
    const revision = g.revision;
    const v = this.view(this.now());
    this.game = { ...g, moves: [...g.moves, uci], drawOffer: g.drawOffer === g.color ? g.drawOffer : null,
      clock: { w: v.clock!.w, b: v.clock!.b, running: g.moves.length >= 1 } };
    this.received = this.now();
    void this.send('move', revision, { uci });
    this.changed();
    return true;
  }

  private async send(type: RankedCommand, revision: number, extra: Record<string, unknown> = {}) {
    this.sending = true;
    const id = commandId();
    for (let attempt = 0; attempt < 3 && !this.disposed; attempt++) {
      try {
        this.apply(await this.api.command(this.game.id, type, revision, extra, id));
        this.problem = '';
        break;
      } catch (e) {
        if (e instanceof ChessApiError && e.status === 0) { this.problem = 'Reconnecting'; this.changed(); await new Promise((r) => setTimeout(r, 800 * (attempt + 1))); continue; }
        this.problem = e instanceof ChessApiError && e.code !== 'stale' ? e.message : '';
        await this.refresh();
        break;
      }
    }
    this.sending = false;
    this.changed();
  }

  resign() { void this.send(this.game.moves.length < 2 ? 'abort' : 'resign', this.game.revision); }
  offerDraw() { void this.send('offer-draw', this.game.revision); }
  acceptDraw() { void this.send('offer-draw', this.game.revision); }
  declineDraw() { void this.send('decline-draw', this.game.revision); }
  claimDraw() { void this.send('claim-draw', this.game.revision); }
  canTakeback() { return false; }
  takeback() {}
  tick() {}
  pause() {}
  resume() { this.schedule(0); }

  private apply(view: RankedGameView) {
    const moves = view.unchanged ? this.game.moves : view.moves ?? this.game.moves;
    this.game = { ...view, moves };
    this.received = this.now();
    this.changed();
  }

  async refresh() {
    try {
      const v = await this.api.game(this.game.id, this.sending ? undefined : this.game.revision);
      if (this.disposed) return;
      if (v.unchanged && !this.sending) { this.game = { ...this.game, ...v, moves: this.game.moves }; this.received = this.now(); this.changed(); }
      else if (!v.unchanged) this.apply(v);
      if (this.problem === 'Reconnecting') this.problem = '';
    } catch (e) {
      if (this.disposed) return;
      this.problem = e instanceof ChessApiError && e.status === 0 ? 'Reconnecting' : e instanceof Error ? e.message : 'Connection problem';
      this.changed();
    }
  }

  private visible = () => { if (!document.hidden) this.schedule(0); };

  private schedule(ms: number) {
    clearTimeout(this.timer);
    if (this.disposed || this.game.status !== 'active') return;
    this.timer = window.setTimeout(async () => {
      if (!this.sending) await this.refresh();
      // Poll quickly while waiting for the opponent, slowly on our own turn or in a hidden tab.
      const waiting = this.turn !== this.game.color;
      this.schedule(document.hidden ? 5000 : waiting ? 700 : 2500);
    }, ms);
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    document.removeEventListener('visibilitychange', this.visible);
    this.onChange = undefined;
  }

  private changed() { this.onChange?.(); }
}
