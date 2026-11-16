import { Room, type RoomEvent, type RosterEntry } from '../../../multiplayer/room';
import { LocalMatch } from '../match';
import { ChessRules, START_FEN, type Color, type Outcome } from '../rules';
import type { PlayerInfo, Session, SessionView } from '../session';
import { parseTimeControl, type TimeControl } from '../time-control';

/**
 * Casual friend games over the shared WebRTC room. The host's device runs the
 * only LocalMatch and validates every guest command. Never rated.
 */
export const ROOM_GAME = 'chess';
export const ROOM_VERSION = '1';

export interface FriendSetup { readonly tc: TimeControl | null; readonly hostColor: Color | 'random' }

interface StateMessage {
  t: 'state'; rev: number; startFen: string; moves: string[]; outcome: Outcome | null; drawOffer: Color | null;
  clock: { w: number; b: number; running: Color | null } | null; tc: string | null; hostColor: Color; names: { w: string; b: string };
  rematch: Color | null;
}
type GuestCommand =
  | { t: 'move'; uci: string; rev: number }
  | { t: 'resign' } | { t: 'offer-draw' } | { t: 'accept-draw' } | { t: 'decline-draw' } | { t: 'claim-draw' } | { t: 'rematch' };

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const RESULTS = ['1-0', '0-1', '1/2-1/2'];
const TERMINATIONS = ['checkmate', 'stalemate', 'insufficient', 'fivefold', 'seventy-five', 'threefold', 'fifty-move', 'agreement', 'resignation', 'timeout', 'timeout-vs-insufficient', 'abandoned', 'aborted'];
const side = (c: unknown): c is Color => c === 'w' || c === 'b';
const ms = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 864e5;

/** The guest trusts nothing from the host it cannot check: every field is validated before use. */
export function validState(data: unknown): StateMessage | null {
  const s = data as Partial<StateMessage>;
  if (!s || s.t !== 'state' || !Number.isSafeInteger(s.rev) || typeof s.startFen !== 'string' || s.startFen.length > 100) return null;
  if (!Array.isArray(s.moves) || s.moves.length > 2000 || !s.moves.every((m) => typeof m === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m))) return null;
  let rules: ChessRules;
  try { rules = new ChessRules(s.startFen, s.moves); } catch { return null; }
  const o = s.outcome;
  if (o !== null && (!o || !RESULTS.includes(o.result) || !TERMINATIONS.includes(o.termination) || (o.winner !== undefined && !side(o.winner)))) return null;
  if (s.drawOffer !== null && !side(s.drawOffer)) return null;
  if (s.rematch !== null && !side(s.rematch)) return null;
  if (!side(s.hostColor)) return null;
  const c = s.clock;
  if (c !== null && (!c || !ms(c.w) || !ms(c.b) || (c.running !== null && !side(c.running)))) return null;
  if (s.tc !== null && (typeof s.tc !== 'string' || !parseTimeControl(s.tc))) return null;
  const names = s.names;
  if (!names || typeof names.w !== 'string' || typeof names.b !== 'string') return null;
  void rules;
  return {
    t: 'state', rev: s.rev!, startFen: s.startFen, moves: [...s.moves], outcome: o ? { result: o.result, termination: o.termination, ...(o.winner ? { winner: o.winner } : {}) } : null,
    drawOffer: s.drawOffer ?? null, clock: c ? { w: c.w, b: c.b, running: c.running } : null, tc: s.tc ?? null, hostColor: s.hostColor!,
    names: { w: names.w.slice(0, 16), b: names.b.slice(0, 16) }, rematch: s.rematch ?? null,
  };
}

export class FriendSession implements Session {
  readonly kind = 'friend' as const;
  readonly rated = false;
  readonly pausable = false;
  readonly premoves = true;
  onChange?: () => void;
  private match?: LocalMatch;
  private state?: StateMessage;
  private received = 0;
  private rev = 0;
  private hostColor: Color = 'w';
  private guest: RosterEntry | null = null;
  private guestName = '';
  private connection = '';
  private rematchOffer: Color | null = null;
  private off: () => void;

  constructor(readonly room: Room, private readonly setup: FriendSetup | null, private readonly now: () => number, private readonly random = Math.random) {
    this.off = room.on((e) => this.event(e));
    if (room.role === 'host') {
      this.hostColor = setup?.hostColor === 'random' || !setup ? (this.random() < 0.5 ? 'w' : 'b') : setup.hostColor;
      this.connection = 'Waiting for your friend';
    } else this.connection = 'Connecting';
  }

  get isHost() { return this.room.role === 'host'; }
  get tc(): TimeControl | null { return this.isHost ? this.setup?.tc ?? null : (this.state?.tc ? parseTimeControl(this.state.tc) : null); }
  get myColor(): Color { return this.isHost ? this.hostColor : other(this.state?.hostColor ?? 'w'); }
  get perspective(): Color { return this.myColor; }
  get started(): boolean { return this.isHost ? !!this.match : !!this.state; }
  get pendingRematch(): Color | null { return this.isHost ? this.rematchOffer : this.state?.rematch ?? null; }

  players(): { w: PlayerInfo; b: PlayerInfo } {
    const names = this.names();
    const me = this.myColor;
    const info = (c: Color): PlayerInfo => ({ name: names[c], kind: c === me ? 'human' : 'remote' });
    return { w: info('w'), b: info('b') };
  }

  private names(): { w: string; b: string } {
    if (!this.isHost) return this.state?.names ?? { w: 'White', b: 'Black' };
    const host = this.room.self?.name ?? 'Host', guest = this.guestName || 'Friend';
    return this.hostColor === 'w' ? { w: host, b: guest } : { w: guest, b: host };
  }

  controls(): Color[] {
    if (!this.started || this.view(this.now()).outcome || this.room.closed) return [];
    return [this.myColor];
  }

  view(now: number): SessionView {
    if (this.isHost) {
      const m = this.match;
      if (!m) return { startFen: START_FEN, moves: [], outcome: null, drawOffer: null, clock: null };
      return { startFen: m.rules.start, moves: m.rules.historyUci, outcome: m.outcome, drawOffer: m.drawOffer,
        clock: m.clock ? { w: m.remaining('w', now)!, b: m.remaining('b', now)!, running: m.over ? null : m.clock.running } : null };
    }
    const s = this.state;
    if (!s) return { startFen: START_FEN, moves: [], outcome: null, drawOffer: null, clock: null };
    let clock = s.clock;
    if (clock?.running) {
      const spent = now - this.received;
      clock = { ...clock, [clock.running]: Math.max(0, clock[clock.running] - spent) };
    }
    return { startFen: s.startFen, moves: s.moves, outcome: s.outcome, drawOffer: s.drawOffer, clock };
  }

  status(): string { return this.connection; }

  // Host ------------------------------------------------------------------

  private startMatch() {
    this.match = new LocalMatch(this.setup?.tc ?? null);
    this.rematchOffer = null;
    this.rev++;
    this.connection = '';
    this.broadcast();
  }

  private broadcast(to?: string) {
    if (!this.isHost || !this.match) return;
    const v = this.view(this.now());
    const msg: StateMessage = { t: 'state', rev: this.rev, startFen: v.startFen, moves: [...v.moves], outcome: v.outcome, drawOffer: v.drawOffer,
      clock: v.clock, tc: this.setup?.tc?.id ?? null, hostColor: this.hostColor, names: this.names(), rematch: this.rematchOffer };
    this.room.send(msg, to);
    this.changed();
  }

  private hostCommand(from: RosterEntry, data: unknown) {
    const m = this.match;
    if (!m || !this.guest || from.id !== this.guest.id || !data || typeof data !== 'object') return;
    const c = data as GuestCommand;
    const guestColor = other(this.hostColor);
    const now = this.now();
    let changed = true;
    switch (c.t) {
      case 'move':
        changed = typeof c.uci === 'string' && c.rev === this.rev && m.turn === guestColor && !!m.move(c.uci, now);
        break;
      case 'resign': m.resign(guestColor, now); break;
      case 'offer-draw': m.offerDraw(guestColor); break;
      case 'accept-draw': changed = m.acceptDraw(guestColor, now); break;
      case 'decline-draw': if (m.drawOffer === this.hostColor) m.declineDraw(); else changed = false; break;
      case 'claim-draw': changed = m.turn === guestColor && m.claimDraw(now); break;
      case 'rematch': this.offerRematch(guestColor); return;
      default: changed = false;
    }
    if (changed) this.rev++;
    // Always answer, so a refused command snaps the guest back to the true position.
    this.broadcast();
  }

  private offerRematch(by: Color) {
    if (!this.match?.over) return;
    if (this.rematchOffer && this.rematchOffer !== by) {
      this.hostColor = other(this.hostColor);
      this.startMatch();
      return;
    }
    this.rematchOffer = by;
    this.broadcast();
  }

  // Shared ------------------------------------------------------------------

  private event(e: RoomEvent) {
    if (this.isHost) {
      if (e.type === 'joined' && !e.player.host) {
        // One guest seat. A guest who drops can rejoin the same room and keep their colour.
        if (this.guest && this.room.players.some((p) => p.id === this.guest!.id)) return;
        this.guest = e.player;
        this.guestName = e.player.name;
        this.connection = '';
        if (!this.match) this.startMatch(); else this.broadcast();
      } else if (e.type === 'left' && this.guest && e.player.id === this.guest.id) {
        this.guest = null;
        this.connection = 'Friend disconnected. Waiting for them to rejoin';
        this.changed();
      } else if (e.type === 'message') this.hostCommand(e.from, e.data);
      else if (e.type === 'closed') { this.connection = e.message; this.changed(); }
      return;
    }
    if (e.type === 'message' && e.data && typeof e.data === 'object' && (e.data as StateMessage).t === 'state') {
      const s = validState(e.data);
      if (!s) return;
      this.state = s;
      this.rev = s.rev;
      this.received = this.now();
      this.connection = '';
      this.changed();
    } else if (e.type === 'closed') { this.connection = e.message; this.changed(); }
  }

  move(uci: string): boolean {
    if (this.isHost) {
      const m = this.match;
      if (!m || m.turn !== this.hostColor || !m.move(uci, this.now())) return false;
      this.rev++;
      this.broadcast();
      return true;
    }
    const s = this.state;
    if (!s || s.outcome || this.room.closed) return false;
    const turn: Color = (s.moves.length + (s.startFen.split(' ')[1] === 'b' ? 1 : 0)) % 2 === 0 ? 'w' : 'b';
    if (turn !== this.myColor) return false;
    this.room.send({ t: 'move', uci, rev: this.rev });
    // Show the move at once; the host's next state confirms or reverts it.
    this.state = { ...s, moves: [...s.moves, uci], clock: s.clock ? { ...this.view(this.now()).clock!, running: other(turn) } : null };
    this.received = this.now();
    this.changed();
    return true;
  }

  private guestSend(cmd: GuestCommand) { if (!this.room.closed) this.room.send(cmd); }

  resign() { if (this.isHost) { this.match?.resign(this.hostColor, this.now()); this.rev++; this.broadcast(); } else this.guestSend({ t: 'resign' }); }
  offerDraw() { if (this.isHost) { this.match?.offerDraw(this.hostColor); this.rev++; this.broadcast(); } else this.guestSend({ t: 'offer-draw' }); }
  acceptDraw() { if (this.isHost) { if (this.match?.acceptDraw(this.hostColor, this.now())) { this.rev++; this.broadcast(); } } else this.guestSend({ t: 'accept-draw' }); }
  declineDraw() { if (this.isHost) { if (this.match?.drawOffer === other(this.hostColor)) { this.match.declineDraw(); this.rev++; this.broadcast(); } } else this.guestSend({ t: 'decline-draw' }); }
  claimDraw() { if (this.isHost) { if (this.match?.turn === this.hostColor && this.match.claimDraw(this.now())) { this.rev++; this.broadcast(); } } else this.guestSend({ t: 'claim-draw' }); }
  rematch() { if (this.isHost) this.offerRematch(this.hostColor); else this.guestSend({ t: 'rematch' }); }
  canTakeback() { return false; }
  takeback() {}

  tick(now: number) {
    if (this.isHost && this.match?.tick(now)) { this.rev++; this.broadcast(); }
  }
  pause() {}
  resume() { if (this.isHost) this.broadcast(); }

  leave() { this.room.close('left'); }

  dispose() {
    this.off();
    if (!this.room.closed) this.room.close('left');
    this.onChange = undefined;
  }

  private changed() { this.onChange?.(); }
}
