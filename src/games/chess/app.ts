import type { ChessAIRegistry } from '../../chess-ai';
import type { GameContext, GameInstance } from '../../core/types';
import * as store from '../../core/storage';
import { cleanName } from '../../multiplayer/protocol';
import { inviteCodeFromHash } from '../../multiplayer/panel';
import { Room } from '../../multiplayer/room';
import { chessRegistry } from './ai';
import { copyText, esc, ico, sheet } from './dom';
import { LocalMatch, TERMINATION_TEXT } from './match';
import { FriendSession, ROOM_GAME, ROOM_VERSION } from './online/friend';
import { ChessApi, ChessApiError, RankedSession, accountSession } from './online/ranked';
import type { LeaderboardView, MeView, RankedGameView } from './online/protocol';
import { pieceSprite, pieceSvg } from './pieces';
import { START_FEN, type Color, type Outcome } from './rules';
import { GameScreen, resultText, type Prefs } from './screen';
import { ArchiveSession, LocalSession, type LocalSaved, type Session, type SessionView } from './session';
import { CATEGORY_LABEL, PRESETS, RANKED_CONTROLS, categoryOf, parseTimeControl, type Category, type TimeControl } from './time-control';

interface Setup { opponentId: string; color: Color | 'random'; tc: string; hints: boolean; takebacks: boolean; localTc: string; friendTc: string; friendColor: Color | 'random'; rankedTc: string }
interface Archived { id: string; kind: 'local' | 'computer' | 'friend'; startFen: string; moves: string[]; outcome: Outcome; names: { w: string; b: string }; perspective: Color; tc: string; at: number }
interface Saved { v: 1; prefs: Prefs; setup: Setup; resume: LocalSaved | null; archive: Archived[] }

const DEFAULT_PREFS: Prefs = { theme: 'wood', pieces: 'classic', coords: false, hints: true, premove: true, autoFlip: false };
const DEFAULT_SETUP: Setup = { opponentId: 'elo-1100', color: 'w', tc: 'none', hints: false, takebacks: true, localTc: 'none', friendTc: '5+3', friendColor: 'random', rankedTc: '5+0' };
const THEMES: Prefs['theme'][] = ['wood', 'neutral', 'dark', 'contrast'];
const THEME_LABEL: Record<Prefs['theme'], string> = { wood: 'Classic', neutral: 'Neutral', dark: 'Dark', contrast: 'High contrast' };
const tcOf = (id: string): TimeControl | null => (id === 'none' ? null : parseTimeControl(id));
const now = () => performance.now();

export class ChessApp implements GameInstance {
  readonly root = document.createElement('div');
  private readonly view = document.createElement('div');
  private prefs: Prefs = { ...DEFAULT_PREFS };
  private setup: Setup = { ...DEFAULT_SETUP };
  private resumeGame: LocalSaved | null = null;
  private archive: Archived[] = [];
  private screen?: GameScreen;
  private registryPromise?: Promise<ChessAIRegistry>;
  private api = new ChessApi();
  private screenName = 'home';
  private cleanup: (() => void)[] = [];
  private openSheet?: { close: () => void };
  private disposed = false;
  private searchTimer = 0;
  private lastPausedHeading: string | null = null;

  constructor(container: HTMLElement, private readonly context: GameContext) {
    this.root.className = 'ch';
    this.root.innerHTML = pieceSprite();
    this.view.className = 'ch-view';
    this.root.append(this.view);
    container.append(this.root);
    this.root.addEventListener('click', this.click);
    this.root.addEventListener('submit', (e) => {
      if (!(e.target instanceof HTMLFormElement) || e.target.method !== 'dialog') e.preventDefault();
    });
    this.applyPrefs();
    const invite = inviteCodeFromHash(location.hash);
    if (invite) this.friendLobby(invite); else this.home();
    void this.checkRankedGame();
  }

  // Lifecycle ----------------------------------------------------------------

  pause() {
    this.screen?.session.pause(now());
    // Online clocks never stop. Say so on the shell's pause overlay.
    const s = this.screen?.session;
    const h = document.querySelector<HTMLElement>('#pause-overlay h2');
    if (h && s && !s.pausable && !s.view(now()).outcome && s.kind !== 'archive') { this.lastPausedHeading ??= h.textContent; h.textContent = 'Your clock is still running'; }
  }

  resume() {
    this.screen?.session.resume(now());
    this.restoreHeading();
    this.save();
  }

  private restoreHeading() {
    const h = document.querySelector<HTMLElement>('#pause-overlay h2');
    if (h && this.lastPausedHeading !== null) h.textContent = this.lastPausedHeading;
    this.lastPausedHeading = null;
  }

  restart() {
    const s = this.screen?.session;
    if (s instanceof LocalSession) { this.startLocal(s.kind, true); return true; }
    if (s && (s.kind === 'ranked' || s.kind === 'friend') && !s.view(now()).outcome) { this.context.announce('Resign or finish the online game first.'); return false; }
    this.home();
    return true;
  }

  serialize(): Saved {
    const s = this.screen?.session;
    if (s instanceof LocalSession && !s.match.over) this.resumeGame = s.saved();
    return { v: 1, prefs: this.prefs, setup: this.setup, resume: this.resumeGame, archive: this.archive };
  }

  restore(data: unknown) {
    if (!data || typeof data !== 'object') return;
    const d = data as Partial<Saved>;
    if (d.v !== 1) return;
    if (d.prefs && typeof d.prefs === 'object') {
      const p = d.prefs;
      this.prefs = {
        theme: THEMES.includes(p.theme) ? p.theme : DEFAULT_PREFS.theme, pieces: p.pieces === 'glass' ? 'glass' : 'classic',
        coords: typeof p.coords === 'boolean' ? p.coords : DEFAULT_PREFS.coords, hints: p.hints !== false, premove: p.premove !== false, autoFlip: p.autoFlip === true,
      };
    }
    if (d.setup && typeof d.setup === 'object') {
      const s = { ...DEFAULT_SETUP, ...d.setup };
      const tcOk = (id: unknown) => id === 'none' || (typeof id === 'string' && !!parseTimeControl(id));
      const col = (c: unknown): Color | 'random' => (c === 'w' || c === 'b' || c === 'random' ? c : 'random');
      this.setup = { opponentId: typeof s.opponentId === 'string' ? s.opponentId : DEFAULT_SETUP.opponentId, color: col(s.color), tc: tcOk(s.tc) ? s.tc : 'none', hints: !!s.hints, takebacks: s.takebacks !== false,
        localTc: tcOk(s.localTc) ? s.localTc : 'none', friendTc: tcOk(s.friendTc) ? s.friendTc : '5+3', friendColor: col(s.friendColor), rankedTc: RANKED_CONTROLS.some((c) => c.id === s.rankedTc) ? s.rankedTc : '5+0' };
    }
    if (d.resume && typeof d.resume === 'object' && LocalMatch.restore((d.resume as LocalSaved).match, now())) this.resumeGame = d.resume as LocalSaved;
    if (Array.isArray(d.archive)) this.archive = d.archive.filter((a) => a && typeof a === 'object' && Array.isArray(a.moves) && typeof a.startFen === 'string' && a.outcome).slice(0, 30);
    this.applyPrefs();
    if (this.screenName === 'home') this.home();
  }

  openMenu() { this.settingsSheet(); }
  dismissMenu(): boolean {
    if (this.openSheet) { this.openSheet.close(); return true; }
    if (this.screen?.dismissMenu()) return true;
    return false;
  }

  /** Opened from the shell's Leaderboards button. */
  openLeaderboard() { this.leaderboard(); }

  dispose() {
    this.disposed = true;
    this.restoreHeading();
    clearTimeout(this.searchTimer);
    this.openSheet?.close();
    this.leaveScreen();
    this.root.remove();
  }

  private save() { this.context.save(this.serialize()); }

  // Helpers ------------------------------------------------------------------

  private registry() { return (this.registryPromise ??= chessRegistry()); }

  private applyPrefs() {
    this.root.dataset.theme = this.prefs.theme;
    this.root.dataset.pieces = this.prefs.pieces;
    this.root.classList.toggle('ch-reduced', this.context.settings.reducedMotion);
    this.screen?.applyPrefs();
  }

  private leaveScreen() {
    for (const f of this.cleanup.splice(0)) f();
    if (this.screen) {
      const s = this.screen.session;
      if (s instanceof LocalSession) this.resumeGame = s.match.over ? null : s.saved();
      this.screen.dispose();
      this.screen = undefined;
    }
  }

  private show(name: string, html: string) {
    this.leaveScreen();
    this.screenName = name;
    this.root.dataset.screen = name;
    this.view.innerHTML = html;
    this.view.classList.remove('ch-enter');
    void this.view.offsetWidth;
    this.view.classList.add('ch-enter');
    this.view.querySelector<HTMLElement>('[autofocus], h1, h2')?.focus({ preventScroll: true });
  }

  private header(title: string, back = 'home') {
    return `<header class="ch-head"><button type="button" class="ch-iconbtn" data-go="${back}" aria-label="Back">${ico('back')}</button><h1 tabindex="-1">${esc(title)}</h1></header>`;
  }

  private chips(name: string, items: { value: string; label: string; disabled?: boolean }[], current: string) {
    return `<div class="ch-chips" role="radiogroup">${items.map((i) => `<button type="button" role="radio" class="ch-chip" data-pick="${name}" data-value="${esc(i.value)}" aria-checked="${i.value === current}"${i.disabled ? ' disabled' : ''}>${esc(i.label)}</button>`).join('')}</div>`;
  }

  private tcChips(name: string, current: string, untimed = true, list: readonly TimeControl[] = PRESETS) {
    return this.chips(name, [...(untimed ? [{ value: 'none', label: 'No clock' }] : []), ...list.map((t) => ({ value: t.id, label: t.id.replace('+', ' | ') }))], current);
  }

  private playerName(): string {
    return cleanName(accountSession()?.username) ?? cleanName(store.read<string>('mp:name', '')) ?? 'Player';
  }

  // Screens ------------------------------------------------------------------

  private home() {
    const resume = this.resumeGame;
    const resumeLabel = resume ? (resume.kind === 'computer' ? 'Continue vs computer' : 'Continue pass and play') : '';
    this.show('home', `
      <section class="ch-home">
        <div class="ch-hero" aria-hidden="true">${['wr', 'wn', 'wb', 'wq', 'wk', 'bp'].map((p, i) => `<i style="--i:${i}">${pieceSvg(p[0] as Color, p[1] as never)}</i>`).join('')}</div>
        <h1 class="ch-title" tabindex="-1">Chess</h1>
        ${resume ? `<button type="button" class="ch-card ch-card-resume" data-go="resume"><b>${resumeLabel}</b><span>${resume.match.moves.length} moves</span></button>` : ''}
        <div class="ch-cards">
          <button type="button" class="ch-card" data-go="computer"><b>Computer</b><span>Play an engine</span></button>
          <button type="button" class="ch-card" data-go="local"><b>Pass and play</b><span>Two players, one device</span></button>
          <button type="button" class="ch-card" data-go="friend"><b>Friend</b><span>Private online game</span></button>
          <button type="button" class="ch-card ch-card-ranked" data-go="ranked"><b>Ranked</b><span>Rated online match</span></button>
        </div>
        <div class="ch-links">
          <button type="button" class="ch-pill" data-go="leaderboard">${ico('chart')} Leaderboard</button>
          <button type="button" class="ch-pill" data-go="history">My games</button>
          <button type="button" class="ch-pill" data-go="settings">${ico('board')} Board</button>
        </div>
      </section>`);
    this.context.setLevel('Chess');
    this.context.setStatus('Choose a mode');
  }

  private async computerSetup() {
    const registry = await this.registry();
    if (this.disposed) return;
    const statuses = registry.opponents();
    const any = statuses.some((s) => s.availability.state === 'available');
    const analysis = !!registry.analysisProvider();
    if (!statuses.some((s) => s.opponent.id === this.setup.opponentId && s.availability.state === 'available')) {
      this.setup.opponentId = statuses.find((s) => s.availability.state === 'available')?.opponent.id ?? this.setup.opponentId;
    }
    this.show('computer', `${this.header('Computer')}
      <section class="ch-setup">
        ${any ? '' : '<p class="ch-note">No engines are installed yet.</p>'}
        <div class="ch-opponents" role="radiogroup" aria-label="Opponent">
          ${statuses.map(({ opponent: o, availability: a }) => `<button type="button" role="radio" class="ch-opp" data-pick="opponent" data-value="${esc(o.id)}" aria-checked="${o.id === this.setup.opponentId && a.state === 'available'}" ${a.state === 'available' ? '' : 'disabled'}>
            <span class="ch-opp-elo">${o.targetElo ?? 'Max'}</span><b>${esc(o.name)}</b><small>${a.state === 'available' ? esc(a.provider.name) : 'Not installed'}</small></button>`).join('')}
        </div>
        <p class="ch-muted ch-fine">Ratings are target strengths.</p>
        <h2>Play as</h2>${this.chips('color', [{ value: 'w', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'b', label: 'Black' }], this.setup.color)}
        <h2>Time</h2>${this.tcChips('tc', this.setup.tc)}
        <div class="ch-toggles">
          <label><span>Takebacks</span><input type="checkbox" data-set="takebacks" ${this.setup.takebacks ? 'checked' : ''}></label>
          ${analysis ? `<label><span>Hints</span><input type="checkbox" data-set="hints" ${this.setup.hints ? 'checked' : ''}></label>` : ''}
        </div>
        <button type="button" class="ch-primary" data-go="start-computer" ${any ? '' : 'disabled'}>Play</button>
      </section>`);
  }

  private localSetup() {
    this.show('local', `${this.header('Pass and play')}
      <section class="ch-setup">
        <h2>Time</h2>${this.tcChips('localTc', this.setup.localTc)}
        <div class="ch-toggles"><label><span>Flip board each turn</span><input type="checkbox" data-pref="autoFlip" ${this.prefs.autoFlip ? 'checked' : ''}></label></div>
        <button type="button" class="ch-primary" data-go="start-local">Play</button>
      </section>`);
  }

  private startLocal(kind: 'local' | 'computer', fresh = false, saved?: LocalSaved) {
    void (async () => {
      const registry = kind === 'computer' ? await this.registry() : undefined;
      if (this.disposed) return;
      let match: LocalMatch;
      let human: Color | undefined;
      let opponentId: string | undefined;
      let takebacks = this.setup.takebacks;
      if (saved && !fresh) {
        match = LocalMatch.restore(saved.match, now())!;
        human = saved.human; opponentId = saved.opponentId; takebacks = saved.takebacks ?? true;
        match.resume(now());
      } else {
        match = new LocalMatch(tcOf(kind === 'computer' ? this.setup.tc : this.setup.localTc));
        if (kind === 'computer') {
          human = this.setup.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : this.setup.color;
          opponentId = this.setup.opponentId;
        }
      }
      const session = new LocalSession(match, { kind, human, opponentId, registry, takebacks }, now);
      this.resumeGame = null;
      this.play(session);
      void session.start();
    })();
  }

  private play(session: Session, review = false) {
    this.show(review ? 'review' : 'game', '');
    const screen = new GameScreen({
      root: this.root,
      prefs: () => this.prefs,
      sound: () => this.context.settings.sound,
      reducedMotion: () => this.context.settings.reducedMotion,
      announce: (t) => this.context.announce(t),
      setStatus: (t) => this.context.setStatus(t),
      registry: () => this.registry(),
      hintsEnabled: () => this.setup.hints,
      finished: (s, v, ms) => this.finished(s, v, ms),
      actions: (s) => this.endActions(s),
      openSettings: () => this.settingsSheet(),
    }, session, review);
    this.screen = screen;
    this.view.append(screen.el);
    this.context.setLevel(session.kind === 'ranked' ? `Ranked ${session.tc ? session.tc.id : ''}` : session.kind === 'computer' ? 'Computer' : session.kind === 'friend' ? 'Friend' : session.kind === 'local' ? 'Pass and play' : 'Review');
    requestAnimationFrame(() => screen.focusBoard());
  }

  private endActions(s: Session): { label: string; act: () => void; primary?: boolean }[] {
    const out: { label: string; act: () => void; primary?: boolean }[] = [];
    if (s instanceof LocalSession) out.push({ label: 'Rematch', act: () => this.startLocal(s.kind, true), primary: true });
    if (s instanceof FriendSession && !s.room.closed) out.push({ label: s.pendingRematch && s.pendingRematch !== s.myColor ? 'Accept rematch' : 'Rematch', act: () => { s.rematch(); this.context.announce('Rematch offered.'); }, primary: true });
    if (s.kind === 'ranked') out.push({ label: 'New opponent', act: () => this.rankedLobby(true), primary: true });
    out.push({ label: 'Menu', act: () => this.home() });
    return out;
  }

  private finished(s: Session, v: SessionView, ms: number) {
    const o = v.outcome!;
    const players = s.players();
    if (s.kind === 'local' || s.kind === 'computer' || s.kind === 'friend') {
      this.archive.unshift({ id: String(Date.now()), kind: s.kind, startFen: v.startFen, moves: [...v.moves], outcome: o, names: { w: players.w.name, b: players.b.name }, perspective: s.perspective, tc: s.tc?.id ?? 'none', at: Date.now() });
      this.archive = this.archive.slice(0, 30);
      if (s instanceof LocalSession) this.resumeGame = null;
      this.save();
    }
    const me = s.kind === 'local' || s.kind === 'archive' ? null : s.perspective;
    if (me && o.winner) this.context.sound(o.winner === me ? 'success' : 'lose');
    const duration = s instanceof RankedSession && s.finishedView.finishedAt ? s.finishedView.finishedAt - s.finishedView.createdAt : ms;
    const row = (c: Color) => {
      const p = players[c];
      return `<div class="ch-res-player${o.winner === c ? ' ch-res-win' : ''}"><span class="ch-avatar ch-avatar-${c}">${pieceSvg(c, 'k')}</span><b>${esc(p.name)}</b>${p.rating ? `<span>${Math.round(p.rating)}</span>` : ''}${typeof p.change === 'number' ? `<span class="ch-delta ${p.change >= 0 ? 'ch-up' : 'ch-down'}">${p.change >= 0 ? '+' : ''}${Math.round(p.change)}</span>` : ''}</div>`;
    };
    const mins = Math.floor(duration / 60000), secs = Math.floor((duration % 60000) / 1000);
    const actions = this.endActions(s);
    const sh = sheet(this.root, `<div class="ch-result">
      <p class="ch-res-kicker">${s.rated ? 'Rated' : 'Casual'}${s.tc ? ` · ${esc(s.tc.id)}` : ''}</p>
      <h2>${esc(resultText(o, me))}</h2>
      <p class="ch-res-reason">${esc(TERMINATION_TEXT[o.termination] ?? o.termination)}</p>
      <div class="ch-res-players">${row('w')}<span class="ch-res-score">${esc(o.result.replace(/1\/2/g, '½'))}</span>${row('b')}</div>
      <p class="ch-muted">${Math.ceil(v.moves.length / 2)} moves · ${mins}:${String(secs).padStart(2, '0')}</p>
      <div class="ch-row">${actions.map((a, i) => `<button type="button" class="ch-pill${a.primary ? ' ch-pill-primary' : ''}" data-res="${i}">${esc(a.label)}</button>`).join('')}<button type="button" class="ch-pill" data-res="review">Review</button></div>
    </div>`, { label: 'Game over', className: 'ch-result-sheet', onClose: () => { this.openSheet = undefined; } });
    this.openSheet = sh;
    sh.el.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest<HTMLElement>('[data-res]')?.dataset.res;
      if (r === undefined) return;
      sh.close();
      if (r === 'review') this.screen?.el.querySelector<HTMLElement>('[data-act="review"]')?.click();
      else actions[Number(r)]?.act();
    });
  }

  // Friend games ---------------------------------------------------------------

  private friendLobby(code = '') {
    this.show('friend', `${this.header('Play a friend')}
      <section class="ch-setup ch-friend">
        <label class="ch-field"><span>Your name</span><input class="ch-name" maxlength="16" autocomplete="nickname" spellcheck="false" value="${esc(this.playerName())}"></label>
        <div class="ch-split">
          <div class="ch-box">
            <h2>Create</h2>
            ${this.tcChips('friendTc', this.setup.friendTc)}
            ${this.chips('friendColor', [{ value: 'w', label: 'White' }, { value: 'random', label: 'Random' }, { value: 'b', label: 'Black' }], this.setup.friendColor)}
            <button type="button" class="ch-primary" data-go="create-room">Create game</button>
          </div>
          <div class="ch-box">
            <h2>Join</h2>
            <label class="ch-field"><span>Code</span><input class="ch-code" maxlength="8" autocapitalize="characters" spellcheck="false" value="${esc(code)}" placeholder="K7Q2MX"></label>
            <button type="button" class="ch-primary" data-go="join-room">Join</button>
          </div>
        </div>
        <p class="ch-muted ch-lobby-status" role="status"></p>
        <p class="ch-muted ch-fine">Friend games are unrated.</p>
      </section>`);
    if (code) this.view.querySelector<HTMLElement>('[data-go="join-room"]')?.focus();
  }

  private async openRoom(join: boolean) {
    const status = this.view.querySelector<HTMLElement>('.ch-lobby-status')!;
    const name = cleanName(this.view.querySelector<HTMLInputElement>('.ch-name')!.value);
    if (!name) { status.textContent = 'Choose a name of 1 to 16 characters.'; return; }
    store.write('mp:name', name);
    const opts = { game: ROOM_GAME, version: ROOM_VERSION, maxPlayers: 2, name };
    for (const b of this.view.querySelectorAll<HTMLButtonElement>('.ch-primary')) b.disabled = true;
    status.textContent = join ? 'Joining' : 'Creating';
    try {
      const room = join ? await Room.join(opts, this.view.querySelector<HTMLInputElement>('.ch-code')!.value) : await Room.create(opts);
      if (this.disposed || this.screenName !== 'friend') { room.close('left'); return; }
      const session = new FriendSession(room, join ? null : { tc: tcOf(this.setup.friendTc), hostColor: this.setup.friendColor }, now);
      if (join) { this.play(session); return; }
      this.waitingRoom(session);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : 'Could not connect.';
      for (const b of this.view.querySelectorAll<HTMLButtonElement>('.ch-primary')) b.disabled = false;
    }
  }

  private waitingRoom(session: FriendSession) {
    const room = session.room;
    this.show('friend-wait', `${this.header('Waiting for friend', 'friend')}
      <section class="ch-setup ch-wait">
        <div class="ch-pulse" aria-hidden="true"></div>
        <p class="ch-code-big" aria-label="Room code ${room.code.split('').join(' ')}">${room.code}</p>
        <div class="ch-row"><button type="button" class="ch-pill ch-pill-primary" data-go="copy-invite">${ico('copy')} Copy invite link</button>${'share' in navigator ? `<button type="button" class="ch-pill" data-go="share-invite">${ico('share')} Share</button>` : ''}</div>
        <p class="ch-muted" role="status">Send the code or link to your friend.</p>
      </section>`);
    const off = room.on((e) => {
      if (e.type === 'joined' && !e.player.host && session.started) { off(); this.cleanup.splice(this.cleanup.indexOf(stop), 1); this.play(session); }
    });
    const stop = () => { off(); session.dispose(); };
    this.cleanup.push(stop);
    (this.view as HTMLElement & { _room?: Room })._room = room;
  }

  // Ranked -----------------------------------------------------------------

  private async checkRankedGame() {
    if (!accountSession()) return;
    try {
      const me = await this.api.me();
      if (me.activeGameId && !this.disposed && this.screenName === 'home') await this.openRanked(me.activeGameId);
    } catch { /* ranked service may be unavailable; the lobby reports it */ }
  }

  private async openRanked(id: string) {
    const game = await this.api.game(id);
    if (this.disposed) return;
    this.play(new RankedSession(this.api, game, now));
  }

  private async rankedLobby(search = false) {
    const session = accountSession();
    if (!session) {
      this.show('ranked', `${this.header('Ranked')}<section class="ch-setup"><p class="ch-note">Log in to play ranked games.</p><button type="button" class="ch-primary" data-go="login">Log in</button></section>`);
      return;
    }
    this.show('ranked', `${this.header('Ranked')}<section class="ch-setup"><div class="ch-skeleton"></div></section>`);
    let me: MeView;
    try { me = await this.api.me(); } catch (e) {
      if (this.screenName !== 'ranked') return;
      this.view.querySelector('.ch-setup')!.innerHTML = `<p class="ch-note">${esc(e instanceof Error ? e.message : 'Ranked chess is not available right now.')}</p><button type="button" class="ch-pill" data-go="ranked">Try again</button>`;
      return;
    }
    if (this.screenName !== 'ranked' || this.disposed) return;
    if (me.activeGameId) { await this.openRanked(me.activeGameId); return; }
    const cats: Category[] = ['bullet', 'blitz', 'rapid', 'classical'];
    this.view.querySelector('.ch-setup')!.innerHTML = `
      <p class="ch-muted">${esc(me.name)}</p>
      <div class="ch-ratings">${cats.map((c) => { const r = me.ratings[c]; return `<div class="ch-rating-card"><small>${CATEGORY_LABEL[c]}</small><b>${r.rating}${r.provisional ? '?' : ''}</b><span>${r.games} games</span></div>`; }).join('')}</div>
      <h2>Time</h2>${this.tcChips('rankedTc', this.setup.rankedTc, false, RANKED_CONTROLS)}
      <button type="button" class="ch-primary" data-go="find">Find opponent</button>
      <p class="ch-muted ch-fine">QCC chess ratings (Glicko-2). Separate from other sites.</p>`;
    if (search) this.findOpponent();
  }

  private async findOpponent() {
    const tc = this.setup.rankedTc;
    const cat = categoryOf(parseTimeControl(tc)!);
    this.show('searching', `<section class="ch-setup ch-wait">
        <div class="ch-pulse" aria-hidden="true"></div>
        <h1 tabindex="-1">Finding opponent</h1>
        <p class="ch-muted"><span>${esc(tc.replace('+', ' | '))} ${CATEGORY_LABEL[cat]}</span> · <span class="ch-search-time">0:00</span></p>
        <p class="ch-muted ch-search-range" role="status"></p>
        <button type="button" class="ch-pill" data-go="cancel-search">Cancel</button>
      </section>`);
    let stopped = false, matched = false, failures = 0;
    let joining: Promise<unknown> = Promise.resolve();
    const started = Date.now();
    // Leave only after the join has answered, so a late join cannot re-queue a player who cancelled.
    const stop = () => { if (!stopped && !matched) void joining.catch(() => {}).then(() => this.api.leave()).catch(() => {}); stopped = true; clearTimeout(this.searchTimer); };
    this.cleanup.push(stop);
    const poll = async (first: boolean) => {
      if (stopped || this.disposed) return;
      try {
        const request = first ? this.api.join(tc) : this.api.queue();
        if (first) joining = request;
        const q = await request;
        if (stopped) return;
        failures = 0;
        if (q.state === 'matched') {
          matched = true;
          stop();
          try {
            const game = await this.api.game(q.gameId);
            if (!this.disposed) this.opponentFound(game);
          } catch {
            // The lobby reopens any active game on its own.
            if (!this.disposed) void this.rankedLobby();
          }
          return;
        }
        if (q.state === 'idle') { this.rankedLobby(); return; }
        const t = Math.floor((Date.now() - started) / 1000);
        const el = this.view.querySelector('.ch-search-time');
        if (el) el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
        const range = this.view.querySelector('.ch-search-range');
        if (range) range.textContent = `Rating range ±${q.range}`;
      } catch (e) {
        // Network blips and busy servers are retried; refusals (bad request, logged out) end the search.
        const retry = e instanceof ChessApiError && (e.status === 0 || e.status >= 500) && ++failures < 6;
        if (!retry) {
          const el = this.view.querySelector('.ch-search-range');
          if (el) el.textContent = e instanceof Error ? e.message : 'Search stopped.';
          stop();
          return;
        }
      }
      this.searchTimer = window.setTimeout(() => void poll(first && failures > 0), 1500);
    };
    void poll(true);
  }

  private opponentFound(game: RankedGameView) {
    const me = game.color ?? 'w';
    const opp = me === 'w' ? game.black : game.white;
    const r = game.ratings;
    this.show('found', `<section class="ch-setup ch-found">
      <p class="ch-res-kicker">Opponent found</p>
      <div class="ch-versus"><span class="ch-avatar ch-avatar-${me}">${pieceSvg(me, 'k')}</span><b>vs</b><span class="ch-avatar ch-avatar-${me === 'w' ? 'b' : 'w'}">${pieceSvg(me === 'w' ? 'b' : 'w', 'k')}</span></div>
      <h1 tabindex="-1">${esc(opp.name)}</h1><p class="ch-muted">${r ? (me === 'w' ? r.b : r.w) : ''} · You play ${me === 'w' ? 'White' : 'Black'}</p></section>`);
    const t = window.setTimeout(() => { if (this.screenName === 'found') this.play(new RankedSession(this.api, game, now)); }, this.context.settings.reducedMotion ? 300 : 1200);
    this.cleanup.push(() => clearTimeout(t));
  }

  // Leaderboard and history ------------------------------------------------------

  private leaderboard(category: Category = 'blitz', q = '') {
    const cats: Category[] = ['bullet', 'blitz', 'rapid', 'classical'];
    this.show('leaderboard', `${this.header('Leaderboard')}
      <section class="ch-setup ch-board-list">
        ${this.chips('lbcat', cats.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })), category)}
        <label class="ch-search">${ico('search')}<input type="search" class="ch-lb-q" placeholder="Search players" value="${esc(q)}" aria-label="Search players" maxlength="24"></label>
        <ol class="ch-lb" aria-busy="true"><li class="ch-skeleton"></li><li class="ch-skeleton"></li><li class="ch-skeleton"></li></ol>
        <div class="ch-lb-me"></div>
      </section>`);
    this.root.dataset.lbcat = category;
    const input = this.view.querySelector<HTMLInputElement>('.ch-lb-q')!;
    input.addEventListener('input', () => { clearTimeout(this.searchTimer); this.searchTimer = window.setTimeout(() => this.loadBoard(category, input.value.trim()), 300); });
    void this.loadBoard(category, q);
  }

  private async loadBoard(category: Category, q: string) {
    const list = this.view.querySelector<HTMLElement>('.ch-lb');
    if (!list) return;
    let data: LeaderboardView;
    try { data = await this.api.leaderboard(category, q); } catch (e) {
      if (this.screenName !== 'leaderboard') return;
      list.setAttribute('aria-busy', 'false');
      list.innerHTML = `<li class="ch-empty">${esc(e instanceof Error ? e.message : 'Could not load.')} <button type="button" class="ch-pill" data-go="leaderboard">Retry</button></li>`;
      return;
    }
    if (this.screenName !== 'leaderboard' || this.root.dataset.lbcat !== category) return;
    const row = (e: LeaderboardView['entries'][number], mine = false) => `<li${mine ? ' class="ch-lb-mine"' : ''}><button type="button" class="ch-lb-row" data-profile="${esc(e.name)}">
      <span class="ch-lb-rank">${e.rank}</span><b class="ch-lb-name">${esc(e.name)}</b><span class="ch-lb-wld">${e.wins}/${e.losses}/${e.draws}</span>
      <span class="ch-lb-rating">${e.rating}${e.provisional ? '?' : ''}</span><span class="ch-delta ${e.change > 0 ? 'ch-up' : e.change < 0 ? 'ch-down' : ''}">${e.change > 0 ? '▲' + e.change : e.change < 0 ? '▼' + -e.change : ''}</span></button></li>`;
    list.setAttribute('aria-busy', 'false');
    list.innerHTML = data.entries.length ? data.entries.map((e) => row(e, e.name === data.me?.name)).join('') : `<li class="ch-empty">${q ? 'No players found.' : 'No ranked games yet.'}</li>`;
    const meBox = this.view.querySelector<HTMLElement>('.ch-lb-me')!;
    meBox.innerHTML = data.me && !data.entries.some((e) => e.name === data.me!.name) ? `<ol class="ch-lb">${row(data.me, true)}</ol>` : '';
  }

  private async profile(name: string) {
    const sh = sheet(this.root, `<form method="dialog" class="dialog-head"><h2>${esc(name)}</h2><button class="icon-button" aria-label="Close">${ico('close')}</button></form><div class="ch-profile"><div class="ch-skeleton"></div></div>`, { label: name, onClose: () => { this.openSheet = undefined; } });
    this.openSheet = sh;
    try {
      const p = await this.api.profile(name);
      const cats: Category[] = ['bullet', 'blitz', 'rapid', 'classical'];
      sh.el.querySelector('.ch-profile')!.innerHTML = `<div class="ch-ratings">${cats.map((c) => { const r = p.ratings[c]; return `<div class="ch-rating-card"><small>${CATEGORY_LABEL[c]}</small><b>${r.rating}${r.provisional ? '?' : ''}</b><span>${r.wins}/${r.losses}/${r.draws}</span>${r.games ? `<span>Best ${r.best}${r.streak ? ` · Streak ${r.streak > 0 ? '+' : ''}${r.streak}` : ''}</span>` : ''}</div>`; }).join('')}</div>
        <h3>Recent</h3><ul class="ch-recent">${p.recent.length ? p.recent.map((g) => `<li><span class="ch-res-dot ch-res-${g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (g.color === 'w') ? 'w' : 'l'}"></span>vs ${esc(g.opponent)} <small>${esc(g.timeControl)}</small>${typeof g.change === 'number' ? `<span class="ch-delta ${g.change >= 0 ? 'ch-up' : 'ch-down'}">${g.change >= 0 ? '+' : ''}${Math.round(g.change)}</span>` : ''}</li>`).join('') : '<li class="ch-muted">No games yet.</li>'}</ul>`;
    } catch (e) { sh.el.querySelector('.ch-profile')!.textContent = e instanceof Error ? e.message : 'Could not load.'; }
  }

  private async history() {
    this.show('history', `${this.header('My games')}<section class="ch-setup"><h2>On this device</h2><ul class="ch-history">${this.archive.length ? this.archive.map((a, i) => `<li><button type="button" class="ch-hist" data-archive="${i}"><span class="ch-res-dot ch-res-${!a.outcome.winner ? 'd' : a.kind === 'local' ? 'n' : a.outcome.winner === a.perspective ? 'w' : 'l'}"></span><b>${esc(a.names.w)} vs ${esc(a.names.b)}</b><small>${esc(a.outcome.result)} · ${esc(TERMINATION_TEXT[a.outcome.termination] ?? '')} · ${new Date(a.at).toLocaleDateString()}</small></button></li>`).join('') : '<li class="ch-empty">No finished games yet.</li>'}</ul><div class="ch-ranked-history"></div></section>`);
    const box = this.view.querySelector<HTMLElement>('.ch-ranked-history')!;
    if (!accountSession()) return;
    box.innerHTML = '<h2>Ranked</h2><div class="ch-skeleton"></div>';
    try {
      const me = await this.api.me();
      if (this.screenName !== 'history') return;
      box.innerHTML = `<h2>Ranked</h2><ul class="ch-history">${me.recent.length ? me.recent.map((g) => `<li><button type="button" class="ch-hist" data-ranked="${esc(g.id)}"><span class="ch-res-dot ch-res-${g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (g.color === 'w') ? 'w' : 'l'}"></span><b>vs ${esc(g.opponent)}</b><small>${esc(g.result)} · ${esc(g.timeControl)}${typeof g.change === 'number' ? ` · ${g.change >= 0 ? '+' : ''}${Math.round(g.change)}` : ''}</small></button></li>`).join('') : '<li class="ch-empty">No ranked games yet.</li>'}</ul>`;
    } catch (e) { box.innerHTML = `<h2>Ranked</h2><p class="ch-muted">${esc(e instanceof Error ? e.message : '')}</p>`; }
  }

  private async reviewRanked(id: string) {
    try {
      const g = await this.api.game(id);
      const me = g.color ?? 'w';
      const result = g.result as Outcome['result'];
      const outcome: Outcome = { result, termination: (g.termination ?? 'resignation') as Outcome['termination'], ...(result === '1-0' ? { winner: 'w' as const } : result === '0-1' ? { winner: 'b' as const } : {}) };
      this.play(new ArchiveSession({ startFen: START_FEN, moves: g.moves ?? [], outcome, rated: true, perspective: me, tc: { id: `${g.baseMs / 60000}+${g.incrementMs / 1000}`, baseMs: g.baseMs, incrementMs: g.incrementMs },
        players: { w: { name: g.white.name, rating: g.white.rating, change: g.white.change, kind: me === 'w' ? 'human' : 'remote' }, b: { name: g.black.name, rating: g.black.rating, change: g.black.change, kind: me === 'b' ? 'human' : 'remote' } } }), true);
    } catch (e) { this.context.announce(e instanceof Error ? e.message : 'Could not open that game.'); }
  }

  private settingsSheet() {
    this.openSheet?.close();
    const p = this.prefs;
    const sh = sheet(this.root, `<form method="dialog" class="dialog-head"><h2>Board</h2><button class="icon-button" aria-label="Close">${ico('close')}</button></form>
      <div class="ch-theme-grid" role="radiogroup" aria-label="Board theme">${THEMES.map((t) => `<button type="button" role="radio" class="ch-theme-swatch" data-theme-pick="${t}" data-theme="${t}" aria-checked="${p.theme === t}"><i></i><i></i><i></i><i></i><span>${THEME_LABEL[t]}</span></button>`).join('')}</div>
      <h3>Pieces</h3>${this.chips('pieces', [{ value: 'classic', label: 'Classic' }, { value: 'glass', label: 'Glass' }], p.pieces)}
      <div class="ch-toggles">
        <label><span>Coordinates</span><input type="checkbox" data-pref="coords" ${p.coords ? 'checked' : ''}></label>
        <label><span>Show legal moves</span><input type="checkbox" data-pref="hints" ${p.hints ? 'checked' : ''}></label>
        <label><span>Premoves</span><input type="checkbox" data-pref="premove" ${p.premove ? 'checked' : ''}></label>
        <label><span>Flip board each turn (pass and play)</span><input type="checkbox" data-pref="autoFlip" ${p.autoFlip ? 'checked' : ''}></label>
      </div>
      <p class="ch-muted ch-fine">Sound follows the game menu setting.</p>`, { label: 'Board settings', onClose: () => { this.openSheet = undefined; } });
    this.openSheet = sh;
    sh.el.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-pick]');
      if (t) { this.prefs.theme = t.dataset.themePick as Prefs['theme']; for (const b of sh.el.querySelectorAll('[data-theme-pick]')) b.setAttribute('aria-checked', String(b === t)); this.applyPrefs(); this.save(); }
    });
  }

  // Events -------------------------------------------------------------------

  private click = (e: Event) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick && !(pick as HTMLButtonElement).disabled) {
      const name = pick.dataset.pick!, value = pick.dataset.value!;
      for (const b of pick.parentElement!.querySelectorAll('[data-pick]')) b.setAttribute('aria-checked', String(b === pick));
      if (name === 'pieces') { this.prefs.pieces = value as Prefs['pieces']; this.applyPrefs(); }
      else if (name === 'lbcat') { this.leaderboard(value as Category, this.view.querySelector<HTMLInputElement>('.ch-lb-q')?.value.trim() ?? ''); return; }
      else (this.setup as unknown as Record<string, string>)[name === 'opponent' ? 'opponentId' : name] = value;
      this.save();
      return;
    }
    const setting = t.closest<HTMLInputElement>('input[data-set]');
    if (setting) { (this.setup as unknown as Record<string, boolean>)[setting.dataset.set!] = setting.checked; this.save(); return; }
    const pref = t.closest<HTMLInputElement>('input[data-pref]');
    if (pref) { (this.prefs as unknown as Record<string, boolean>)[pref.dataset.pref!] = pref.checked; this.applyPrefs(); this.save(); return; }
    const profile = t.closest<HTMLElement>('[data-profile]');
    if (profile) { void this.profile(profile.dataset.profile!); return; }
    const arch = t.closest<HTMLElement>('[data-archive]');
    if (arch) {
      const a = this.archive[Number(arch.dataset.archive)];
      if (a) this.play(new ArchiveSession({ startFen: a.startFen, moves: a.moves, outcome: a.outcome, perspective: a.perspective, tc: tcOf(a.tc), players: { w: { name: a.names.w, kind: 'human' }, b: { name: a.names.b, kind: 'human' } } }), true);
      return;
    }
    const ranked = t.closest<HTMLElement>('[data-ranked]');
    if (ranked) { void this.reviewRanked(ranked.dataset.ranked!); return; }
    const go = t.closest<HTMLElement>('[data-go]')?.dataset.go;
    if (!go) return;
    switch (go) {
      case 'home': this.home(); break;
      case 'computer': void this.computerSetup(); break;
      case 'local': this.localSetup(); break;
      case 'friend': this.friendLobby(); break;
      case 'ranked': void this.rankedLobby(); break;
      case 'leaderboard': this.leaderboard(); break;
      case 'history': void this.history(); break;
      case 'settings': this.settingsSheet(); break;
      case 'resume': if (this.resumeGame) this.startLocal(this.resumeGame.kind, false, this.resumeGame); break;
      case 'start-computer': this.startLocal('computer', true); break;
      case 'start-local': this.startLocal('local', true); break;
      case 'create-room': void this.openRoom(false); break;
      case 'join-room': void this.openRoom(true); break;
      case 'copy-invite': {
        const room = (this.view as HTMLElement & { _room?: Room })._room;
        if (room) void copyText(room.inviteLink).then((ok) => this.context.announce(ok ? 'Invite link copied.' : 'Copy failed.'));
        break;
      }
      case 'share-invite': {
        const room = (this.view as HTMLElement & { _room?: Room })._room;
        if (room) void navigator.share?.({ title: 'Play chess', url: room.inviteLink }).catch(() => {});
        break;
      }
      case 'find': void this.findOpponent(); break;
      case 'cancel-search': void this.rankedLobby(); break;
      case 'login': this.context.openAppMenu?.(); break;
    }
  };
}
