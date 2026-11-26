import { PIECE_NAMES, pieceSvg } from './pieces';
import type { Color, Piece, PieceType } from './rules';

/**
 * DOM chessboard. It draws a position it is given and reports move intents.
 * It never decides legality: the controller passes legal destinations and
 * the authoritative position back after every change.
 */
export interface BoardPosition {
  readonly pieces: ReadonlyMap<string, Piece>;
  readonly lastMove?: { from: string; to: string };
  readonly check?: string;
}

export interface BoardOptions {
  /** Destinations (UCI) for a piece the player may move now. */
  legalFrom(square: string): readonly string[];
  /** Premove destinations for a piece of the side not to move, or [] to disallow. */
  premoveFrom(square: string): readonly string[];
  /** Which colour the player controls now; null when the board is read-only. */
  mover(): Color | null;
  /** Whose turn it is in the shown position. */
  turn(): Color;
  /** A move the player made. Return false if it was refused. */
  onMove(uci: string): boolean;
  onPremove(uci: string | null): void;
  onInvalid?(): void;
  announce(text: string): void;
}

const FILES = 'abcdefgh';
export const squareName = (file: number, rank: number) => FILES[file] + String(rank + 1);
const fileOf = (sq: string) => FILES.indexOf(sq[0]);
const rankOf = (sq: string) => Number(sq[1]) - 1;

interface PieceNode { el: HTMLElement; color: Color; type: PieceType; square: string }

export class BoardView {
  readonly root = document.createElement('div');
  private readonly squares = new Map<string, HTMLElement>();
  private readonly layer = document.createElement('div');
  private readonly arrowLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly promo = document.createElement('div');
  private nodes: PieceNode[] = [];
  private flipped = false;
  private position: BoardPosition = { pieces: new Map() };
  private selected: string | null = null;
  private targets: readonly string[] = [];
  private premoveTargets = false;
  private premove: string | null = null;
  private cursor = 'e2';
  private drag?: { node: PieceNode; id: number; x: number; y: number; moved: boolean; rect: DOMRect; wasSelected: boolean };
  private arrows = new Map<string, { from: string; to: string }>();
  private marks = new Set<string>();
  private rightFrom: string | null = null;
  private guide: string | null = null;
  private pendingPromotion?: { from: string; to: string; premove: boolean };
  private readonly abort = new AbortController();

  constructor(private readonly options: BoardOptions) {
    const r = this.root;
    r.className = 'ch-board';
    r.tabIndex = 0;
    r.setAttribute('role', 'application');
    r.setAttribute('aria-roledescription', 'chessboard');
    r.setAttribute('aria-label', 'Chessboard. Arrow keys move, Enter selects.');
    const grid = document.createElement('div');
    grid.className = 'ch-squares';
    for (let i = 0; i < 64; i++) {
      const s = document.createElement('div');
      s.className = 'ch-sq';
      grid.append(s);
    }
    this.layer.className = 'ch-pieces';
    this.arrowLayer.setAttribute('class', 'ch-arrows');
    this.arrowLayer.setAttribute('viewBox', '0 0 800 800');
    this.arrowLayer.setAttribute('aria-hidden', 'true');
    this.promo.className = 'ch-promo';
    this.promo.hidden = true;
    r.append(grid, this.layer, this.arrowLayer, this.promo);
    this.layoutSquares();
    const signal = this.abort.signal;
    r.addEventListener('pointerdown', (e) => this.pointerDown(e), { signal });
    r.addEventListener('pointermove', (e) => this.pointerMove(e), { signal });
    r.addEventListener('pointerup', (e) => this.pointerUp(e), { signal });
    r.addEventListener('pointercancel', () => this.cancelDrag(), { signal });
    r.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    r.addEventListener('keydown', (e) => this.key(e), { signal });
    r.addEventListener('focus', () => this.paintCursor(), { signal });
    r.addEventListener('blur', () => this.paintCursor(), { signal });
  }

  get orientation(): Color { return this.flipped ? 'b' : 'w'; }
  setOrientation(color: Color) {
    if (this.orientation === color) return;
    this.flipped = color === 'b';
    this.root.classList.add('ch-flipping');
    this.layoutSquares();
    for (const n of this.nodes) this.place(n.el, n.square);
    this.drawArrows();
    this.paintHighlights();
    window.setTimeout(() => this.root.classList.remove('ch-flipping'), 260);
  }

  setCoordinates(show: boolean) { this.root.classList.toggle('ch-coords-off', !show); }
  setHints(show: boolean) { this.root.classList.toggle('ch-hints-off', !show); }

  /** Shows a position. Pieces that moved slide; new ones fade in; removed ones fade out. */
  setPosition(position: BoardPosition, animate = true) {
    this.position = position;
    if (!animate) this.layer.classList.add('ch-instant');
    const want = [...position.pieces.entries()].map(([square, p]) => ({ square, ...p }));
    const free = [...this.nodes];
    const next: PieceNode[] = [];
    const take = (pred: (n: PieceNode) => boolean) => {
      const i = free.findIndex(pred);
      return i < 0 ? undefined : free.splice(i, 1)[0];
    };
    const pending: typeof want = [];
    for (const w of want) {
      const same = take((n) => n.square === w.square && n.color === w.color && n.type === w.type);
      if (same) next.push(same); else pending.push(w);
    }
    for (const w of pending) {
      // Prefer the nearest unused piece of the same kind, so a move slides from its origin square.
      let best: PieceNode | undefined; let bestD = Infinity;
      for (const n of free) {
        if (n.color !== w.color || n.type !== w.type) continue;
        const d = Math.abs(fileOf(n.square) - fileOf(w.square)) + Math.abs(rankOf(n.square) - rankOf(w.square));
        if (d < bestD) { bestD = d; best = n; }
      }
      // A promoted piece slides from the pawn's square.
      if (!best && position.lastMove?.to === w.square) best = free.find((n) => n.square === position.lastMove!.from && n.type === 'p');
      if (best) {
        free.splice(free.indexOf(best), 1);
        if (best.type !== w.type) { best.type = w.type; best.el.innerHTML = pieceSvg(w.color, w.type); }
        best.square = w.square;
        this.place(best.el, w.square);
        next.push(best);
      } else {
        const el = document.createElement('div');
        el.className = `ch-piece ch-piece-${w.color}`;
        el.innerHTML = pieceSvg(w.color, w.type);
        this.place(el, w.square);
        if (animate) el.classList.add('ch-enter');
        this.layer.append(el);
        next.push({ el, color: w.color, type: w.type, square: w.square });
      }
    }
    for (const gone of free) {
      delete gone.el.dataset.square;
      if (animate) {
        gone.el.classList.add('ch-captured');
        gone.el.addEventListener('animationend', () => gone.el.remove(), { once: true });
        window.setTimeout(() => gone.el.remove(), 400);
      } else gone.el.remove();
    }
    this.nodes = next;
    for (const n of next) n.el.dataset.square = n.square;
    if (!animate) { void this.layer.offsetWidth; this.layer.classList.remove('ch-instant'); }
    if (this.selected && !(position.pieces.get(this.selected)?.color === this.options.mover() || this.premoveTargets)) this.select(null);
    else if (this.selected) this.select(this.selected);
    this.hidePromotion();
    this.paintHighlights();
  }

  setPremove(uci: string | null) { this.premove = uci; this.paintHighlights(); }

  /** An engine suggestion (hint or best move), drawn apart from the player's own arrows. */
  setGuide(uci: string | null) { if (uci !== this.guide) { this.guide = uci; this.drawArrows(); } }

  clearAnnotations() { this.arrows.clear(); this.marks.clear(); this.drawArrows(); this.paintHighlights(); }

  /** Arrows and circles drawn by the player, for saving. */
  annotations(): { arrows: string[]; marks: string[] } {
    return { arrows: [...this.arrows.keys()], marks: [...this.marks] };
  }

  shake() {
    this.root.classList.remove('ch-shake');
    void this.root.offsetWidth;
    this.root.classList.add('ch-shake');
  }

  dispose() { this.abort.abort(); this.root.remove(); }

  // Geometry --------------------------------------------------------------

  private xy(square: string): [number, number] {
    const f = fileOf(square), r = rankOf(square);
    return this.flipped ? [7 - f, r] : [f, 7 - r];
  }

  private place(el: HTMLElement, square: string) {
    const [x, y] = this.xy(square);
    el.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
  }

  private layoutSquares() {
    const cells = this.root.querySelector('.ch-squares')!.children;
    this.squares.clear();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const file = this.flipped ? 7 - x : x, rank = this.flipped ? y : 7 - y;
      const sq = squareName(file, rank);
      const el = cells[y * 8 + x] as HTMLElement;
      el.className = `ch-sq ${(file + rank) % 2 ? 'ch-light' : 'ch-dark'}`;
      el.dataset.square = sq;
      el.id = `ch-sq-${sq}`;
      el.innerHTML = (x === 0 ? `<span class="ch-rank">${rank + 1}</span>` : '') + (y === 7 ? `<span class="ch-file">${FILES[file]}</span>` : '');
      this.squares.set(sq, el);
    }
  }

  private squareAt(clientX: number, clientY: number, rect = this.root.getBoundingClientRect()): string | null {
    const x = Math.floor(((clientX - rect.left) / rect.width) * 8), y = Math.floor(((clientY - rect.top) / rect.height) * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return this.flipped ? squareName(7 - x, y) : squareName(x, 7 - y);
  }

  // Selection and moves ---------------------------------------------------

  private canPick(square: string): 'move' | 'premove' | null {
    const piece = this.position.pieces.get(square);
    const mover = this.options.mover();
    if (!piece || !mover || piece.color !== mover) return null;
    if (this.options.turn() === mover) return 'move';
    return this.options.premoveFrom(square).length ? 'premove' : null;
  }

  private select(square: string | null) {
    this.selected = square;
    const kind = square ? this.canPick(square) : null;
    this.premoveTargets = kind === 'premove';
    this.targets = !square || !kind ? [] : (kind === 'move' ? this.options.legalFrom(square) : this.options.premoveFrom(square)).map((m) => m.slice(2, 4));
    if (!kind) this.selected = null;
    this.paintHighlights();
  }

  /** Try to move the selected piece to `to`. Returns true if handled. */
  private attempt(from: string, to: string): boolean {
    const kind = this.canPick(from);
    if (!kind) return false;
    const list = kind === 'move' ? this.options.legalFrom(from) : this.options.premoveFrom(from);
    const matches = list.filter((m) => m.slice(2, 4) === to);
    if (!matches.length) return false;
    if (matches.length > 1 || matches[0].length === 5) {
      this.showPromotion(from, to, kind === 'premove');
      return true;
    }
    this.commit(matches[0], kind === 'premove');
    return true;
  }

  private commit(uci: string, premove: boolean) {
    this.select(null);
    if (premove) { this.premove = uci; this.options.onPremove(uci); this.paintHighlights(); return; }
    if (!this.options.onMove(uci)) { this.shake(); this.options.onInvalid?.(); }
  }

  private showPromotion(from: string, to: string, premove: boolean) {
    this.pendingPromotion = { from, to, premove };
    const color = this.position.pieces.get(from)!.color;
    const [x, y] = this.xy(to);
    this.promo.innerHTML = `<div class="ch-promo-card" role="dialog" aria-label="Promote to" style="--px:${x};--py:${y < 4 ? 0 : 1}">${(['q', 'n', 'r', 'b'] as PieceType[]).map((t) =>
      `<button type="button" data-promo="${t}" aria-label="${PIECE_NAMES[t]}">${pieceSvg(color, t)}</button>`).join('')}<button type="button" class="ch-promo-cancel" data-promo="" aria-label="Cancel">×</button></div>`;
    this.promo.hidden = false;
    this.promo.querySelector<HTMLButtonElement>('button')!.focus();
    this.options.announce('Choose a promotion piece.');
  }

  private hidePromotion() {
    if (this.promo.hidden) return;
    this.promo.hidden = true;
    this.promo.innerHTML = '';
    this.pendingPromotion = undefined;
  }

  private pickPromotion(type: string) {
    const p = this.pendingPromotion;
    this.hidePromotion();
    this.root.focus({ preventScroll: true });
    if (!p || !type) { this.select(null); return; }
    this.commit(p.from + p.to + type, p.premove);
  }

  // Pointer ---------------------------------------------------------------

  private pointerDown(e: PointerEvent) {
    const promo = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-promo]');
    if (promo) { e.preventDefault(); this.pickPromotion(promo.dataset.promo ?? ''); return; }
    if (!this.promo.hidden) { this.pickPromotion(''); return; }
    const rect = this.root.getBoundingClientRect();
    const sq = this.squareAt(e.clientX, e.clientY, rect);
    if (!sq) return;
    if (e.button === 2) { this.rightFrom = sq; return; }
    if (e.button !== 0) return;
    if (this.arrows.size || this.marks.size) this.clearAnnotations();
    this.cursor = sq;
    // A tap on a destination finishes a move started by tap.
    if (this.selected && this.selected !== sq && this.targets.includes(sq)) {
      e.preventDefault();
      this.attempt(this.selected, sq);
      return;
    }
    if (this.premove && !this.selected) { this.premove = null; this.options.onPremove(null); }
    const node = this.nodes.find((n) => n.square === sq);
    if (node && this.canPick(sq)) {
      e.preventDefault();
      const wasSelected = this.selected === sq;
      this.select(sq);
      this.root.setPointerCapture(e.pointerId);
      this.drag = { node, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, rect, wasSelected };
      return;
    }
    if (this.selected) {
      if (this.selected !== sq) { this.shake(); this.options.onInvalid?.(); }
      this.select(null);
    }
  }

  private pointerMove(e: PointerEvent) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) return;
    if (!d.moved) { d.moved = true; d.node.el.classList.add('ch-dragging'); }
    const size = d.rect.width / 8;
    const x = e.clientX - d.rect.left - size / 2, y = e.clientY - d.rect.top - size / 2 - (e.pointerType === 'touch' ? size * 0.35 : 0);
    d.node.el.style.transform = `translate(${x}px, ${y}px)`;
    const over = this.squareAt(e.clientX, e.clientY, d.rect);
    for (const s of this.squares.values()) s.classList.toggle('ch-over', s.dataset.square === over && this.targets.includes(over));
  }

  private pointerUp(e: PointerEvent) {
    if (e.button === 2 && this.rightFrom) {
      const to = this.squareAt(e.clientX, e.clientY);
      if (to) this.annotate(this.rightFrom, to);
      this.rightFrom = null;
      return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = undefined;
    for (const s of this.squares.values()) s.classList.remove('ch-over');
    d.node.el.classList.remove('ch-dragging');
    if (!d.moved) {
      // A second tap on the selected piece deselects it.
      if (d.wasSelected) this.select(null);
      return;
    }
    const to = this.squareAt(e.clientX, e.clientY, d.rect);
    const from = d.node.square;
    this.place(d.node.el, from);
    if (to && to !== from && this.attempt(from, to)) return;
    if (to && to !== from) { this.shake(); this.options.onInvalid?.(); this.select(null); }
  }

  private cancelDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = undefined;
    d.node.el.classList.remove('ch-dragging');
    this.place(d.node.el, d.node.square);
  }

  private annotate(from: string, to: string) {
    if (from === to) { if (!this.marks.delete(from)) this.marks.add(from); }
    else { const k = from + to; if (!this.arrows.delete(k)) this.arrows.set(k, { from, to }); }
    this.drawArrows();
    this.paintHighlights();
  }

  private drawArrows() {
    const c = (sq: string) => { const [x, y] = this.xy(sq); return [x * 100 + 50, y * 100 + 50]; };
    this.arrowLayer.innerHTML = `<defs><marker id="ch-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0 L10 5 L0 10 z"/></marker></defs>` +
      [...this.arrows.values(), ...(this.guide ? [{ from: this.guide.slice(0, 2), to: this.guide.slice(2, 4), guide: true }] : [])].map((a) => {
        const [x1, y1] = c(a.from), [x2, y2] = c(a.to);
        const len = Math.hypot(x2 - x1, y2 - y1), k = (len - 32) / len;
        return `<line${'guide' in a ? ' class="ch-guide"' : ''} x1="${x1}" y1="${y1}" x2="${x1 + (x2 - x1) * k}" y2="${y1 + (y2 - y1) * k}" marker-end="url(#ch-head)"/>`;
      }).join('');
  }

  // Keyboard --------------------------------------------------------------

  private key(e: KeyboardEvent) {
    if (!this.promo.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); this.pickPromotion(''); }
      return;
    }
    const step: Record<string, [number, number]> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (step[e.key]) {
      e.preventDefault();
      let [df, dr] = step[e.key];
      if (this.flipped) { df = -df; dr = -dr; }
      const f = Math.min(7, Math.max(0, fileOf(this.cursor) + df)), r = Math.min(7, Math.max(0, rankOf(this.cursor) + dr));
      this.cursor = squareName(f, r);
      this.paintCursor();
      const p = this.position.pieces.get(this.cursor);
      this.options.announce(`${this.cursor}${p ? `, ${p.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[p.type]}` : ''}${this.targets.includes(this.cursor) ? ', legal move' : ''}`);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const sq = this.cursor;
      if (this.selected && this.targets.includes(sq)) { this.attempt(this.selected, sq); return; }
      if (this.canPick(sq)) {
        this.select(this.selected === sq ? null : sq);
        if (this.selected) this.options.announce(`${PIECE_NAMES[this.position.pieces.get(sq)!.type]} selected. ${this.targets.length} moves: ${this.targets.join(', ')}`);
        return;
      }
      if (this.selected) { this.shake(); this.options.onInvalid?.(); this.select(null); }
      return;
    }
    if (e.key === 'Escape' && (this.selected || this.premove)) {
      e.preventDefault(); e.stopPropagation();
      this.select(null);
      if (this.premove) { this.premove = null; this.options.onPremove(null); this.paintHighlights(); }
    }
  }

  private paintCursor() {
    const focused = document.activeElement === this.root && this.root.matches(':focus-visible');
    for (const s of this.squares.values()) s.classList.toggle('ch-cursor', focused && s.dataset.square === this.cursor);
    this.root.setAttribute('aria-activedescendant', `ch-sq-${this.cursor}`);
  }

  private paintHighlights() {
    const last = this.position.lastMove;
    const pre = this.premove;
    for (const [sq, el] of this.squares) {
      const t = this.targets.includes(sq);
      el.classList.toggle('ch-last', !!last && (last.from === sq || last.to === sq));
      el.classList.toggle('ch-selected', this.selected === sq);
      el.classList.toggle('ch-target', t && !this.position.pieces.has(sq));
      el.classList.toggle('ch-capture', t && this.position.pieces.has(sq));
      el.classList.toggle('ch-pre-target', t && this.premoveTargets);
      el.classList.toggle('ch-premove', !!pre && (pre.slice(0, 2) === sq || pre.slice(2, 4) === sq));
      el.classList.toggle('ch-check', this.position.check === sq);
      el.classList.toggle('ch-mark', this.marks.has(sq));
    }
    for (const n of this.nodes) n.el.classList.toggle('ch-lifted', n.square === this.selected);
    this.paintCursor();
  }
}

/** Squares a piece could reach on an empty board; used to offer premoves. */
export function premoveTargets(pieces: ReadonlyMap<string, Piece>, from: string): string[] {
  const p = pieces.get(from);
  if (!p) return [];
  const f = fileOf(from), r = rankOf(from);
  const out: string[] = [];
  const add = (df: number, dr: number) => { const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) out.push(squareName(nf, nr)); };
  const ray = (dirs: [number, number][]) => { for (const [df, dr] of dirs) for (let i = 1; i < 8; i++) add(df * i, dr * i); };
  const straight: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]], diag: [number, number][] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  switch (p.type) {
    case 'n': for (const [a, b] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) add(a, b); break;
    case 'b': ray(diag); break;
    case 'r': ray(straight); break;
    case 'q': ray(straight); ray(diag); break;
    case 'k':
      for (const [a, b] of [...straight, ...diag]) add(a, b);
      if (from === (p.color === 'w' ? 'e1' : 'e8')) { add(2, 0); add(-2, 0); }
      break;
    case 'p': {
      const dir = p.color === 'w' ? 1 : -1;
      add(0, dir); add(-1, dir); add(1, dir);
      if (r === (p.color === 'w' ? 1 : 6)) add(0, 2 * dir);
    }
  }
  const lastRank = p.color === 'w' ? 7 : 0;
  return out.filter((to) => pieces.get(to)?.color !== p.color)
    .flatMap((to) => p.type === 'p' && rankOf(to) === lastRank ? ['q', 'r', 'b', 'n'].map((t) => from + to + t) : [from + to]);
}
