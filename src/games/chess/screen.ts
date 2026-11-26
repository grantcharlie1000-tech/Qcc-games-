import type { ChessAIRegistry } from '../../chess-ai';
import { GameAnalysis, evalGraph, evalText, winChance } from './analysis';
import { BoardView, premoveTargets, type BoardPosition } from './board';
import { copyText, download, esc, ico, sheet } from './dom';
import { TERMINATION_TEXT } from './match';
import { PIECE_NAMES, pieceSvg } from './pieces';
import { ChessRules, MATERIAL, type Color, type Outcome, type Piece, type PieceType } from './rules';
import type { Session, SessionView } from './session';
import { playChessSound, type ChessSound } from './sound';
import { formatClock } from './time-control';

export interface Prefs {
  theme: 'wood' | 'neutral' | 'dark' | 'contrast';
  pieces: 'classic' | 'glass';
  coords: boolean;
  hints: boolean;
  premove: boolean;
  autoFlip: boolean;
}

export interface ScreenHost {
  readonly root: HTMLElement;
  prefs(): Prefs;
  sound(): boolean;
  reducedMotion(): boolean;
  announce(text: string): void;
  setStatus(text: string): void;
  registry(): Promise<ChessAIRegistry>;
  /** Hint engine for computer games, when enabled and installed. */
  hintsEnabled(): boolean;
  /** Called once when a game ends, with its final view. */
  finished(session: Session, view: SessionView, durationMs: number): void;
  actions(session: Session): { label: string; act: () => void; primary?: boolean }[];
  openSettings(): void;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const SETTINGS_ITEM = `<button type="button" class="ch-act" data-act="settings" aria-label="Board settings">${ico('board')}<span>Board</span></button>`;
const COLOR_NAME: Record<Color, string> = { w: 'White', b: 'Black' };
const START_COUNT: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

export function resultText(o: Outcome, me: Color | null): string {
  if (o.termination === 'aborted') return 'Game aborted';
  if (!o.winner) return 'Draw';
  if (me) return o.winner === me ? 'You won' : 'You lost';
  return `${COLOR_NAME[o.winner]} wins`;
}

/** The playing and review screen for one session. */
export class GameScreen {
  readonly el = document.createElement('div');
  private readonly board: BoardView;
  private rules: ChessRules;
  private viewPly: number | null = null;
  private premove: string | null = null;
  private lastCount = -1;
  private lastOutcome: Outcome | null = null;
  private timer = 0;
  private started = performance.now();
  private resignArmed = 0;
  private analysis?: GameAnalysis;
  private hint: string | null = null;
  private movesKey = '';
  private lowWarned = false;
  private scrollFrame = 0;
  private disposed = false;
  private readonly $ = <T extends Element>(s: string) => this.el.querySelector<T>(s)!;

  constructor(private readonly host: ScreenHost, readonly session: Session, private review = false) {
    const v = session.view(performance.now());
    this.rules = new ChessRules(v.startFen);
    this.el.className = 'ch-game';
    this.el.innerHTML = `
      <div class="ch-col">
        <div class="ch-player" data-pos="top"></div>
        <div class="ch-boardwrap"><div class="ch-evalbar" hidden><div class="ch-evalfill"></div><span class="ch-evaltext"></span></div><div class="ch-boardslot"></div></div>
        <div class="ch-player" data-pos="bottom"></div>
      </div>
      <aside class="ch-panel" aria-label="Game panel">
        <div class="ch-panel-head"><p class="ch-state" role="status" aria-live="polite"></p><button type="button" class="ch-iconbtn" data-act="settings" aria-label="Board settings">${ico('board')}</button></div>
        <div class="ch-banner" hidden></div>
        <ol class="ch-moves" aria-label="Moves"></ol>
        <div class="ch-review" hidden></div>
        <div class="ch-nav" role="group" aria-label="Move navigation">
          <button type="button" class="ch-iconbtn" data-nav="first" aria-label="First move">${ico('first')}</button>
          <button type="button" class="ch-iconbtn" data-nav="prev" aria-label="Previous move">${ico('prev')}</button>
          <button type="button" class="ch-iconbtn" data-nav="next" aria-label="Next move">${ico('next')}</button>
          <button type="button" class="ch-iconbtn" data-nav="last" aria-label="Latest move">${ico('last')}</button>
        </div>
        <div class="ch-actions"></div>
      </aside>
      <nav class="ch-mbar" aria-label="Game actions">
        <button type="button" class="ch-mbtn" data-act="options" aria-label="Options">${ico('menu')}<span>Options</span></button>
        <button type="button" class="ch-mbtn ch-mbar-extra"></button>
        <button type="button" class="ch-mbtn" data-nav="prev" aria-label="Back">${ico('prev')}<span>Back</span></button>
        <button type="button" class="ch-mbtn" data-nav="next" aria-label="Forward">${ico('next')}<span>Forward</span></button>
      </nav>`;
    this.board = new BoardView({
      legalFrom: (sq) => this.isLive() && this.session.controls().includes(this.rules.turn) ? this.rules.legalFrom(sq) : [],
      premoveFrom: (sq) => {
        const mover = this.myColor();
        if (!this.isLive() || !this.session.premoves || !this.host.prefs().premove || !mover || this.rules.turn === mover || !this.session.controls().includes(mover)) return [];
        return premoveTargets(this.piecesOf(this.rules), sq);
      },
      mover: () => {
        if (!this.isLive()) return null;
        const c = this.session.controls();
        return c.includes(this.rules.turn) ? this.rules.turn : c[0] ?? null;
      },
      turn: () => this.rules.turn,
      onMove: (uci) => {
        this.hint = null;
        this.board.setGuide(null);
        return this.session.move(uci);
      },
      onPremove: (uci) => { this.premove = uci; this.renderState(); },
      onInvalid: () => playChessSound('invalid', this.host.sound()),
      announce: (t) => this.host.announce(t),
    });
    this.$('.ch-boardslot').append(this.board.root);
    this.applyPrefs();
    this.board.setOrientation(session.perspective);
    this.el.addEventListener('click', this.click);
    this.el.addEventListener('keydown', this.keys);
    session.onChange = () => this.render();
    this.render(false);
    this.timer = window.setInterval(() => this.tick(), 100);
    if (review) this.openReview();
    else playChessSound('start', host.sound());
  }

  applyPrefs() {
    const p = this.host.prefs();
    this.el.dataset.theme = p.theme;
    this.el.dataset.pieces = p.pieces;
    this.board.setCoordinates(p.coords);
    this.board.setHints(p.hints);
    this.el.classList.toggle('ch-reduced', this.host.reducedMotion());
  }

  focusBoard() { this.board.root.focus({ preventScroll: true }); }

  private isLive() { return !this.review && (this.viewPly === null) && !this.session.view(performance.now()).outcome; }
  private myColor(): Color | null {
    const c = this.session.controls();
    if (this.session.kind === 'local') return null;
    return c[0] ?? (this.session.kind === 'archive' ? null : this.session.perspective);
  }

  private piecesOf(r: ChessRules): Map<string, Piece> {
    const map = new Map<string, Piece>();
    r.board().forEach((row, y) => row.forEach((p, x) => { if (p) map.set('abcdefgh'[x] + (8 - y), p); }));
    return map;
  }

  /** Keeps the cached rules in step with the session's moves. */
  private sync(v: SessionView): boolean {
    const have = this.rules.historyUci;
    const same = have.length <= v.moves.length && have.every((m, i) => m === v.moves[i]) && this.rules.start === v.startFen;
    try {
      if (!same) this.rules = new ChessRules(v.startFen);
      for (let i = this.rules.ply; i < v.moves.length; i++) if (!this.rules.move(v.moves[i])) throw new Error('bad move');
      return true;
    } catch {
      return false;
    }
  }

  private shownRules(): ChessRules {
    if (this.viewPly === null || this.viewPly >= this.rules.ply) return this.rules;
    return new ChessRules(this.rules.start, this.rules.historyUci.slice(0, this.viewPly));
  }

  render(animate = true) {
    if (this.disposed) return;
    const v = this.session.view(performance.now());
    // A rematch in the same session starts a fresh game: leave review mode.
    if (!v.moves.length && !v.outcome && this.lastCount > 0 && this.session.kind !== 'archive') {
      this.review = false;
      this.analysis?.dispose();
      this.analysis = undefined;
      this.viewPly = null;
      this.hint = null;
      this.board.setGuide(null);
      this.el.classList.remove('ch-reviewing');
      this.started = performance.now();
      this.lowWarned = false;
      this.board.setOrientation(this.session.perspective);
    }
    this.sync(v);
    const count = this.rules.ply;
    const grew = count === this.lastCount + 1 && this.lastCount >= 0;
    if (count !== this.lastCount) {
      if (grew) this.moveSound();
      if (this.viewPly !== null && this.viewPly >= count) this.viewPly = null;
      if (this.session.kind === 'local' && this.host.prefs().autoFlip && !v.outcome) this.board.setOrientation(this.rules.turn);
      this.lastCount = count;
      this.analysisLine();
    }
    // Premoves: play the queued move once it is our turn, if it is legal now.
    const me = this.myColor();
    if (this.premove && me && this.rules.turn === me && this.isLive()) {
      const pm = this.premove;
      this.premove = null;
      this.board.setPremove(null);
      const legal = this.rules.legalMovesUci();
      if (legal.includes(pm)) { queueMicrotask(() => this.session.move(pm)); }
      else { this.host.announce('Premove cancelled. It is not legal now.'); }
    }
    const shown = this.shownRules();
    const last = shown.history.at(-1);
    const check = shown.inCheck() ? shown.kingSquare(shown.turn) : undefined;
    const pos: BoardPosition = { pieces: this.piecesOf(shown), ...(last ? { lastMove: { from: last.from, to: last.to } } : {}), ...(check ? { check } : {}) };
    this.board.setPosition(pos, animate && !this.host.reducedMotion());
    this.board.setPremove(this.premove);
    this.renderPlayers(v, shown);
    this.renderMoves();
    this.renderState();
    this.renderActions(v);
    this.renderReview();
    if (v.outcome && !this.lastOutcome) {
      this.lastOutcome = v.outcome;
      this.premove = null;
      playChessSound('end', this.host.sound());
      this.host.finished(this.session, v, performance.now() - this.started);
    } else if (!v.outcome) this.lastOutcome = null;
  }

  private moveSound() {
    const r = this.rules.history.at(-1);
    if (!r) return;
    const kind: ChessSound = r.san.includes('+') || r.san.includes('#') ? 'check' : r.captured ? 'capture' : r.rook ? 'castle' : 'move';
    playChessSound(kind, this.host.sound());
    this.host.announce(`${COLOR_NAME[r.color]} ${r.san.replace('#', ' checkmate').replace('+', ' check').replace('O-O-O', 'castles queenside').replace('O-O', 'castles kingside')}`);
  }

  private renderPlayers(v: SessionView, shown: ChessRules) {
    const bottom = this.board.orientation, top = other(bottom);
    const players = this.session.players();
    const pieces = this.piecesOf(shown);
    const count = (c: Color, t: PieceType) => [...pieces.values()].filter((p) => p.color === c && p.type === t).length;
    const material = (c: Color) => (Object.keys(MATERIAL) as PieceType[]).reduce((s, t) => s + MATERIAL[t] * count(c, t), 0);
    for (const [pos, color] of [['top', top], ['bottom', bottom]] as const) {
      const el = this.$<HTMLElement>(`.ch-player[data-pos="${pos}"]`);
      const p = players[color];
      const taken = (['q', 'r', 'b', 'n', 'p'] as PieceType[]).flatMap((t) => Array(Math.max(0, START_COUNT[t] - count(other(color), t))).fill(t) as PieceType[]);
      const diff = material(color) - material(other(color));
      const clock = v.clock ? v.clock[color] : null;
      const running = v.clock?.running === color;
      const low = clock !== null && this.session.tc && clock < Math.min(20000, this.session.tc.baseMs * 0.1);
      const toMove = !v.outcome && this.rules.turn === color;
      const key = JSON.stringify([p.name, p.rating, p.change, taken, diff, color, toMove]);
      if (el.dataset.key !== key) {
        el.dataset.key = key;
        el.innerHTML = `<span class="ch-avatar ch-avatar-${color}" aria-hidden="true">${pieceSvg(color, p.kind === 'ai' ? 'n' : 'k')}</span>
          <span class="ch-pinfo"><span class="ch-pname"><b>${esc(p.name)}</b>${p.rating ? ` <span class="ch-prating">${Math.round(p.rating)}${p.provisional ? '?' : ''}</span>` : ''}${p.change ? ` <span class="ch-delta ${p.change > 0 ? 'ch-up' : 'ch-down'}">${p.change > 0 ? '+' : ''}${Math.round(p.change)}</span>` : ''}</span>
          <span class="ch-capt" aria-label="Captured ${taken.map((t) => PIECE_NAMES[t]).join(', ') || 'none'}">${taken.map((t) => `<i class="ch-cp">${pieceSvg(other(color), t)}</i>`).join('')}${diff > 0 ? `<em>+${diff}</em>` : ''}</span></span>
          <span class="ch-clock" role="timer" aria-label="${COLOR_NAME[color]} clock"></span>`;
      }
      el.classList.toggle('ch-turn', toMove);
      const clockEl = el.querySelector<HTMLElement>('.ch-clock')!;
      clockEl.hidden = clock === null;
      if (clock !== null) {
        const text = formatClock(clock);
        if (clockEl.textContent !== text) clockEl.textContent = text;
        clockEl.classList.toggle('ch-running', running);
        clockEl.classList.toggle('ch-low', !!low);
        if (low && running && color === this.myColor() && !this.lowWarned) { this.lowWarned = true; playChessSound('low', this.host.sound()); }
      }
    }
  }

  private renderMoves() {
    const list = this.$<HTMLOListElement>('.ch-moves');
    const h = this.rules.history;
    const current = this.viewPly ?? h.length;
    const key = h.map((r) => r.san).join(' ') + '|' + (this.analysis?.done ? 'a' : '');
    if (key !== this.movesKey) {
      this.movesKey = key;
      const blackFirst = this.rules.start.split(' ')[1] === 'b';
      const startNo = Number(this.rules.start.split(' ')[5]) || 1;
      let html = '';
      const cells = blackFirst ? [null, ...h] : [...h];
      for (let i = 0; i < cells.length; i += 2) {
        const cell = (r: typeof h[number] | null | undefined, ply: number) => {
          if (r === undefined) return '<span></span>';
          if (r === null) return '<span class="ch-mv-empty">…</span>';
          const j = this.analysis?.judgement(ply);
          return `<button type="button" class="ch-mv${j ? ` ch-${j}` : ''}" data-ply="${ply}">${esc(r.san)}${j ? `<i class="ch-judge" aria-label="${j}">${j === 'blunder' ? '??' : j === 'mistake' ? '?' : '?!'}</i>` : ''}</button>`;
        };
        const p1 = i + 1 - (blackFirst ? 1 : 0), p2 = p1 + 1;
        html += `<li><span class="ch-mvno">${startNo + i / 2}.</span>${cell(cells[i], p1)}${cell(cells[i + 1], p2)}</li>`;
      }
      list.innerHTML = html || '<li class="ch-mv-none">No moves yet</li>';
    }
    for (const b of list.querySelectorAll<HTMLElement>('.ch-mv')) {
      const on = Number(b.dataset.ply) === current;
      b.classList.toggle('ch-mv-current', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    }
    // Scroll in the next frame, so reading layout never forces it in the middle of a move.
    cancelAnimationFrame(this.scrollFrame);
    this.scrollFrame = requestAnimationFrame(() => {
      const cur = list.querySelector<HTMLElement>('.ch-mv-current');
      if (cur) {
        const lr = list.getBoundingClientRect(), cr = cur.getBoundingClientRect();
        if (cr.top < lr.top || cr.bottom > lr.bottom || cr.left < lr.left || cr.right > lr.right) {
          list.scrollTo({ top: list.scrollTop + cr.top - lr.top - lr.height / 2, left: list.scrollLeft + cr.left - lr.left - lr.width / 2, behavior: this.host.reducedMotion() ? 'auto' : 'smooth' });
        }
      } else if (current === h.length) list.scrollTo({ top: list.scrollHeight, left: list.scrollWidth });
    });
  }

  private renderState() {
    const v = this.session.view(performance.now());
    let text: string;
    if (this.viewPly !== null && this.viewPly < this.rules.ply) text = `Viewing move ${this.viewPly} of ${this.rules.ply}`;
    else if (v.outcome) text = `${resultText(v.outcome, this.session.kind === 'local' || this.session.kind === 'archive' ? null : this.session.perspective)} · ${TERMINATION_TEXT[v.outcome.termination] ?? ''}`;
    else {
      const s = this.session.status();
      const turn = this.rules.turn;
      const me = this.myColor();
      text = s || (me ? (turn === me ? 'Your move' : 'Opponent to move') : `${COLOR_NAME[turn]} to move`);
      if (!s && this.rules.inCheck()) text += ' · Check';
      if (this.premove) text += ' · Premove set';
    }
    const state = this.$('.ch-state');
    if (state.textContent !== text) { state.textContent = text; this.host.setStatus(text); }
    // Draw offer and claim prompts.
    const banner = this.$<HTMLElement>('.ch-banner');
    let html = '';
    const me = this.session.kind === 'local' ? this.rules.turn : this.myColor();
    if (!v.outcome && v.drawOffer && me && v.drawOffer !== me && this.viewPly === null) {
      html = `<span>${this.session.kind === 'local' ? `${COLOR_NAME[v.drawOffer]} offers a draw` : 'Draw offered'}</span><button type="button" class="ch-pill ch-pill-primary" data-act="accept-draw">Accept</button><button type="button" class="ch-pill" data-act="decline-draw">Decline</button>`;
    } else if (!v.outcome && this.isLive() && me && this.rules.turn === me && this.session.controls().includes(me) && this.rules.claimable().length) {
      html = `<span>${this.rules.claimable()[0] === 'threefold' ? 'Threefold repetition' : '50-move rule'}</span><button type="button" class="ch-pill ch-pill-primary" data-act="claim-draw">Claim draw</button>`;
    } else if (this.session.kind === 'computer' && /Engine|illegal/.test(this.session.status())) {
      html = `<span>${esc(this.session.status())}</span><button type="button" class="ch-pill" data-act="retry">Retry</button>`;
    }
    if (banner.innerHTML !== html) { banner.innerHTML = html; banner.hidden = !html; }
  }

  private renderActions(v: SessionView) {
    const bar = this.$<HTMLElement>('.ch-actions');
    const live = !this.review && !v.outcome;
    const k = this.session.kind;
    const items: string[] = [`<button type="button" class="ch-act" data-act="flip" aria-label="Flip board">${ico('flip')}<span>Flip</span></button>`];
    if (live) {
      if (this.session.canTakeback()) items.push(`<button type="button" class="ch-act" data-act="takeback" aria-label="Undo">${ico('undo')}<span>Undo</span></button>`);
      if (k === 'computer' && this.host.hintsEnabled()) items.push(`<button type="button" class="ch-act" data-act="hint" aria-label="Hint">${ico('bulb')}<span>Hint</span></button>`);
      if ((k === 'local' || k === 'friend' || k === 'ranked') && this.rules.ply >= (k === 'ranked' ? 2 : 1) && v.drawOffer !== this.myColor()) items.push(`<button type="button" class="ch-act" data-act="offer-draw" aria-label="Draw">${ico('draw')}<span>Draw</span></button>`);
      const abort = k === 'ranked' && this.rules.ply < 2;
      const armed = performance.now() < this.resignArmed;
      const resignLabel = armed ? 'Confirm' : abort ? 'Abort' : 'Resign';
      items.push(`<button type="button" class="ch-act${armed ? ' ch-armed' : ''}" data-act="resign" aria-label="${resignLabel}">${ico('flag')}<span>${resignLabel}</span></button>`);
    } else {
      for (const [i, a] of this.host.actions(this.session).entries()) items.push(`<button type="button" class="ch-act${a.primary ? ' ch-act-primary' : ''}" data-host-act="${i}" aria-label="${esc(a.label)}"><span>${esc(a.label)}</span></button>`);
      if (!this.review) items.push(`<button type="button" class="ch-act" data-act="review" aria-label="Review">${ico('chart')}<span>Review</span></button>`);
    }
    items.push(`<button type="button" class="ch-act" data-act="export" aria-label="Share or export">${ico('share')}<span>Share</span></button>`);
    const html = items.join('');
    if (bar.dataset.html !== html) { bar.dataset.html = html; bar.innerHTML = html; }
    if (this.options) this.options.el.querySelector('.ch-optlist')!.innerHTML = html + SETTINGS_ITEM;
    // On phones one extra action sits beside Back and Forward: Undo, else Hint, else Flip.
    const extra = this.$<HTMLButtonElement>('.ch-mbar-extra');
    const pick: [string, string, string] = live && this.session.canTakeback() ? ['takeback', 'undo', 'Undo'] : live && k === 'computer' && this.host.hintsEnabled() ? ['hint', 'bulb', 'Hint'] : ['flip', 'flip', 'Flip'];
    if (extra.dataset.act !== pick[0]) { extra.dataset.act = pick[0]; extra.setAttribute('aria-label', pick[2]); extra.innerHTML = `${ico(pick[1])}<span>${pick[2]}</span>`; }
  }

  private options?: { el: HTMLDialogElement; close: () => void };

  /** Phones keep every game action in one sheet so the board has the screen. */
  private openOptions() {
    const bar = this.$<HTMLElement>('.ch-actions');
    this.options = sheet(this.host.root, `<form method="dialog" class="dialog-head"><h2>Options</h2><button class="icon-button" aria-label="Close">${ico('close')}</button></form><div class="ch-optlist">${bar.dataset.html ?? ''}${SETTINGS_ITEM}</div>`, { label: 'Game options', onClose: () => { this.options = undefined; } });
    this.options.el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-host-act]');
      if (!target) return;
      const resign = target.dataset.act === 'resign';
      const close = this.options!.close;
      if (!resign) close();
      this.click(e);
      // Resigning asks for a second press inside the sheet.
      if (resign && !(performance.now() < this.resignArmed)) close();
    });
  }

  dismissMenu(): boolean {
    if (this.share) { this.share.close(); return true; }
    if (this.options) { this.options.close(); return true; }
    return false;
  }

  // Review ---------------------------------------------------------------

  private async openReview() {
    this.el.classList.add('ch-reviewing');
    const registry = await this.host.registry();
    if (this.disposed) return;
    this.analysis = new GameAnalysis(registry, this.rules.start, this.rules.historyUci);
    this.analysis.onChange = () => { this.movesKey = ''; this.renderMoves(); this.renderReview(); this.analysisLine(); };
    this.viewPly ??= this.rules.ply;
    this.render(false);
  }

  private renderReview() {
    const box = this.$<HTMLElement>('.ch-review');
    const bar = this.$<HTMLElement>('.ch-evalbar');
    const a = this.analysis;
    if (!a) { box.hidden = true; bar.hidden = true; return; }
    box.hidden = false;
    const ply = this.viewPly ?? this.rules.ply;
    const e = a.evals[ply];
    bar.hidden = !e;
    if (e) {
      bar.querySelector<HTMLElement>('.ch-evalfill')!.style.height = `${winChance(e)}%`;
      bar.querySelector('.ch-evaltext')!.textContent = evalText(e);
      bar.classList.toggle('ch-eval-flip', this.board.orientation === 'b');
    }
    let html: string;
    if (!a.available) html = '<p class="ch-muted">Engine analysis is not installed.</p>';
    else if (a.running) html = `<p class="ch-muted">Analyzing with ${esc(a.engineName)} · ${Math.round(a.progress * 100)}%</p><div class="ch-progress"><i style="width:${a.progress * 100}%"></i></div>`;
    else if (a.error) html = `<p class="ch-muted">${esc(a.error)}</p><button type="button" class="ch-pill" data-act="analyze">Try again</button>`;
    else if (!a.evals.length) html = `<button type="button" class="ch-pill ch-pill-primary" data-act="analyze">${ico('chart')} Analyze with ${esc(a.engineName)}</button>`;
    else html = '';
    if (a.evals.length) {
      const best = e?.best ? (() => { try { const r = this.shownRules().clone(); const m = r.move(e.best!); return m?.san; } catch { return undefined; } })() : undefined;
      html += `<svg class="ch-graph" viewBox="0 0 300 60" preserveAspectRatio="none" aria-label="Evaluation graph"><path d="${evalGraph(a.evals, 300, 60)}"/><line x1="0" y1="30" x2="300" y2="30"/><line class="ch-graph-at" x1="${(ply / Math.max(1, this.rules.ply)) * 300}" y1="0" x2="${(ply / Math.max(1, this.rules.ply)) * 300}" y2="60"/></svg>`;
      if (e) html += `<p class="ch-evalline"><b>${evalText(e)}</b>${best ? ` · Best: ${esc(best)}` : ''}</p>`;
    }
    if (box.dataset.html !== html) { box.dataset.html = html; box.innerHTML = html; }
  }

  private analysisLine() {
    const a = this.analysis;
    const ply = this.viewPly ?? this.rules.ply;
    const best = a?.evals[ply]?.best ?? this.hint;
    this.board.setGuide(best ?? null);
  }

  // Input ----------------------------------------------------------------

  private goto(ply: number | null) {
    if (ply !== null && (ply < 0 || ply > this.rules.ply)) return;
    this.viewPly = ply === this.rules.ply && !this.analysis ? null : ply;
    this.analysisLine();
    this.render(true);
  }

  private click = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const ply = t.closest<HTMLElement>('[data-ply]');
    if (ply) { this.goto(Number(ply.dataset.ply)); return; }
    const nav = t.closest<HTMLElement>('[data-nav]')?.dataset.nav;
    if (nav) {
      const cur = this.viewPly ?? this.rules.ply;
      this.goto(nav === 'first' ? 0 : nav === 'prev' ? Math.max(0, cur - 1) : nav === 'next' ? Math.min(this.rules.ply, cur + 1) : this.rules.ply);
      return;
    }
    const hostAct = t.closest<HTMLElement>('[data-host-act]');
    if (hostAct) { this.host.actions(this.session)[Number(hostAct.dataset.hostAct)]?.act(); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    const s = this.session;
    switch (act) {
      case 'flip': this.board.setOrientation(other(this.board.orientation)); this.render(false); break;
      case 'takeback': this.premove = null; s.takeback(); break;
      case 'offer-draw': s.offerDraw(); this.host.announce('Draw offered.'); this.render(); break;
      case 'accept-draw': s.acceptDraw(); break;
      case 'decline-draw': s.declineDraw(); break;
      case 'claim-draw': s.claimDraw(); break;
      case 'retry': (s as unknown as { retry?: () => void }).retry?.(); break;
      case 'resign':
        if (performance.now() < this.resignArmed) { this.resignArmed = 0; s.resign(); }
        else { this.resignArmed = performance.now() + 3000; this.host.announce('Press again to confirm.'); }
        this.render(false);
        break;
      case 'hint': void this.showHint(); break;
      case 'review': this.review = true; void this.openReview(); break;
      case 'analyze': void this.analysis?.run(); break;
      case 'export': this.exportSheet(); break;
      case 'settings': this.host.openSettings(); break;
      case 'options': this.openOptions(); break;
    }
  };

  private async showHint() {
    const registry = await this.host.registry();
    const a = new GameAnalysis(registry, this.rules.start, []);
    if (!a.available) { this.host.announce('Hints need an analysis engine.'); return; }
    this.host.announce('Finding a hint.');
    try {
      const session = await registry.openAnalysis();
      try {
        const r = await session.analyze({ fen: this.rules.fen, startFen: this.rules.start, moveHistoryUci: this.rules.historyUci, legalMovesUci: this.rules.legalMovesUci(), positionRevision: this.rules.ply, thinkingTimeMs: 500, multiPv: 1 });
        this.hint = r.lines[0]?.pvUci[0] ?? null;
        if (this.hint && !this.disposed) this.analysisLine();
      } finally { session.dispose(); }
    } catch (e) { this.host.announce(e instanceof Error ? e.message : 'No hint available.'); }
  }

  private keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,textarea,select,.ch-board')) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const cur = this.viewPly ?? this.rules.ply;
      this.goto(Math.max(0, Math.min(this.rules.ply, cur + (e.key === 'ArrowLeft' ? -1 : 1))));
    }
  };

  pgn(): string {
    const p = this.session.players();
    const o = this.session.view(performance.now()).outcome;
    return this.rules.pgn({ White: p.w.name, Black: p.b.name, Event: this.session.rated ? 'Rated game' : 'Casual game', ...(this.session.tc ? { TimeControl: `${this.session.tc.baseMs / 1000}+${this.session.tc.incrementMs / 1000}` } : {}), ...(o ? { Termination: TERMINATION_TEXT[o.termination] ?? o.termination } : {}) }, o?.result ?? '*');
  }

  private share?: { el: HTMLDialogElement; close: () => void };

  private exportSheet() {
    if (this.share) return;
    const fen = this.shownRules().fen;
    const pgn = this.pgn();
    const s = this.share = sheet(this.host.root, `<form method="dialog" class="dialog-head"><h2>Share game</h2><button class="icon-button" aria-label="Close">${ico('close')}</button></form>
      <div class="ch-share-body">
      <label class="ch-field"><span>FEN</span><input readonly value="${esc(fen)}"></label>
      <div class="ch-row"><button type="button" class="ch-pill" data-x="fen">${ico('copy')} Copy FEN</button><button type="button" class="ch-pill" data-x="pgn">${ico('copy')} Copy PGN</button><button type="button" class="ch-pill" data-x="file">Download PGN</button></div>
      ${'share' in navigator ? '<div class="ch-row"><button type="button" class="ch-pill" data-x="share">Share</button></div>' : ''}
      <p class="ch-muted ch-x-status" role="status"></p></div>`, { label: 'Share game', onClose: () => { this.share = undefined; } });
    s.el.addEventListener('click', async (e) => {
      const x = (e.target as HTMLElement).closest<HTMLElement>('[data-x]')?.dataset.x;
      const status = s.el.querySelector('.ch-x-status')!;
      if (x === 'fen') status.textContent = (await copyText(fen)) ? 'FEN copied.' : 'Copy failed.';
      if (x === 'pgn') status.textContent = (await copyText(pgn)) ? 'PGN copied.' : 'Copy failed.';
      if (x === 'file') download('qcc-chess.pgn', pgn);
      if (x === 'share') { try { await navigator.share({ title: 'Chess game', text: pgn }); } catch { /* cancelled */ } }
    });
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    this.session.tick(now);
    const v = this.session.view(now);
    if (v.clock?.running || this.session.status().startsWith('Move within')) {
      this.renderPlayers(v, this.shownRules());
      if (this.session.status().startsWith('Move within')) this.renderState();
    }
    if (this.resignArmed && now > this.resignArmed) { this.resignArmed = 0; this.renderActions(v); }
  }

  dispose() {
    this.disposed = true;
    this.share?.close();
    this.options?.close();
    clearInterval(this.timer);
    cancelAnimationFrame(this.scrollFrame);
    this.el.removeEventListener('click', this.click);
    this.el.removeEventListener('keydown', this.keys);
    this.analysis?.dispose();
    this.board.dispose();
    this.session.dispose();
    this.el.remove();
  }
}
