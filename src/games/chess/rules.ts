import { Chess, type Move as ChessJsMove, type Square } from 'chess.js';

/** Trusted rules layer shared by every mode and the server. Wraps chess.js. */
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece { readonly color: Color; readonly type: PieceType }
export interface MoveRecord {
  readonly uci: string;
  readonly san: string;
  readonly from: string;
  readonly to: string;
  readonly color: Color;
  readonly piece: PieceType;
  readonly captured?: PieceType;
  readonly promotion?: PieceType;
  /** Square of the captured piece (differs from `to` for en passant). */
  readonly captureSquare?: string;
  /** Rook move for castling. */
  readonly rook?: { readonly from: string; readonly to: string };
  readonly fen: string;
}

export type Termination =
  | 'checkmate' | 'stalemate' | 'insufficient' | 'fivefold' | 'seventy-five'
  | 'threefold' | 'fifty-move' | 'agreement' | 'resignation' | 'timeout' | 'timeout-vs-insufficient' | 'abandoned' | 'aborted';
export type Result = '1-0' | '0-1' | '1/2-1/2';
export interface Outcome { readonly result: Result; readonly termination: Termination; readonly winner?: Color }

const UCI = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/;
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
/** Position identity for repetition: placement, side, castling, legal en passant (chess.js only writes legal ones). */
const positionKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

export class ChessRules {
  private chess: Chess;
  private readonly startFen: string;
  private records: MoveRecord[] = [];
  private keys: string[] = [];

  constructor(startFen = START_FEN, movesUci: readonly string[] = []) {
    this.startFen = startFen;
    this.chess = new Chess(startFen);
    this.keys = [positionKey(this.chess.fen())];
    for (const m of movesUci) if (!this.move(m)) throw new Error(`Illegal move in history: ${m}`);
  }

  get fen(): string { return this.chess.fen(); }
  get start(): string { return this.startFen; }
  get turn(): Color { return this.chess.turn(); }
  get history(): readonly MoveRecord[] { return this.records; }
  get historyUci(): string[] { return this.records.map((r) => r.uci); }
  get ply(): number { return this.records.length; }
  get halfmoveClock(): number { return Number(this.fen.split(' ')[4]); }
  inCheck(): boolean { return this.chess.inCheck(); }

  board(): (Piece | null)[][] {
    return this.chess.board().map((row) => row.map((p) => (p ? { color: p.color, type: p.type } : null)));
  }
  pieceAt(square: string): Piece | null {
    const p = this.chess.get(square as Square);
    return p ? { color: p.color, type: p.type } : null;
  }
  kingSquare(color: Color): string | undefined {
    return this.chess.findPiece({ color, type: 'k' })[0];
  }

  legalMovesUci(): string[] {
    return this.chess.moves({ verbose: true }).map(toUci);
  }
  legalFrom(square: string): string[] {
    return this.chess.moves({ square: square as Square, verbose: true }).map(toUci);
  }
  isLegal(uci: string): boolean { return this.legalMovesUci().includes(uci); }
  isPromotion(from: string, to: string): boolean {
    return this.legalMovesUci().some((m) => m.startsWith(from + to) && m.length === 5);
  }

  /** Plays a UCI move if legal. Returns the record, or null and leaves the position unchanged. */
  move(uci: string): MoveRecord | null {
    const m = UCI.exec(typeof uci === 'string' ? uci : '');
    if (!m || this.outcome()?.termination && isAutomatic(this.outcome()!.termination)) return null;
    let played: ChessJsMove;
    try { played = this.chess.move({ from: m[1], to: m[2], promotion: m[3] }); } catch { return null; }
    if (!played || (played.promotion && !m[3])) { if (played) this.chess.undo(); return null; }
    const record = toRecord(played, this.chess.fen());
    this.records.push(record);
    this.keys.push(positionKey(record.fen));
    return record;
  }

  undo(): MoveRecord | null {
    if (!this.records.length) return null;
    this.chess.undo();
    this.keys.pop();
    return this.records.pop() ?? null;
  }

  repetitions(): number {
    const now = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === now).length;
  }

  /** Draws a player may claim now (on their turn). */
  claimable(): ('threefold' | 'fifty-move')[] {
    const claims: ('threefold' | 'fifty-move')[] = [];
    if (this.repetitions() >= 3) claims.push('threefold');
    if (this.halfmoveClock >= 100) claims.push('fifty-move');
    return claims;
  }

  /** Board outcome that ends the game without any claim. */
  outcome(): Outcome | null {
    if (this.chess.isCheckmate()) {
      const winner = other(this.turn);
      return { result: winner === 'w' ? '1-0' : '0-1', termination: 'checkmate', winner };
    }
    if (this.chess.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
    if (this.chess.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient' };
    if (this.repetitions() >= 5) return { result: '1/2-1/2', termination: 'fivefold' };
    if (this.halfmoveClock >= 150) return { result: '1/2-1/2', termination: 'seventy-five' };
    return null;
  }

  /** Whether `color` has any sequence of legal moves that could mate (FIDE 6.9 approximation by material). */
  canMate(color: Color): boolean {
    const pieces = this.board().flat().filter((p): p is Piece => !!p && p.color === color && p.type !== 'k');
    if (pieces.some((p) => p.type === 'p' || p.type === 'q' || p.type === 'r')) return true;
    const minors = pieces.filter((p) => p.type === 'n' || p.type === 'b');
    if (minors.length >= 2) return true;
    if (minors.length === 0) return false;
    // A lone minor can mate only with help from opponent material that can block.
    const opponent = this.board().flat().filter((p): p is Piece => !!p && p.color !== color && p.type !== 'k');
    return opponent.length > 0;
  }

  /** Outcome when `color` runs out of time. */
  timeoutOutcome(color: Color): Outcome {
    const winner = other(color);
    if (!this.canMate(winner)) return { result: '1/2-1/2', termination: 'timeout-vs-insufficient' };
    return { result: winner === 'w' ? '1-0' : '0-1', termination: 'timeout', winner };
  }

  pgn(headers: Record<string, string> = {}, result: Result | '*' = '*'): string {
    const tags: Record<string, string> = { Event: 'Casual game', Site: 'QCC Games', Date: pgnDate(new Date()), Round: '-', White: '?', Black: '?', ...headers, Result: result };
    if (this.startFen !== START_FEN) { tags.SetUp = '1'; tags.FEN = this.startFen; }
    const head = Object.entries(tags).map(([k, v]) => `[${k} "${v.replace(/["\\]/g, '')}"]`).join('\n');
    const startMove = Number(this.startFen.split(' ')[5]) || 1;
    const blackFirst = this.startFen.split(' ')[1] === 'b';
    const parts: string[] = [];
    this.records.forEach((r, i) => {
      const n = startMove + Math.floor((i + (blackFirst ? 1 : 0)) / 2);
      if (r.color === 'w') parts.push(`${n}. ${r.san}`);
      else parts.push(i === 0 ? `${n}... ${r.san}` : r.san);
    });
    parts.push(result);
    return `${head}\n\n${wrap(parts.join(' '))}\n`;
  }

  clone(): ChessRules { return new ChessRules(this.startFen, this.historyUci); }
}

export const isAutomatic = (t: Termination) => ['checkmate', 'stalemate', 'insufficient', 'fivefold', 'seventy-five'].includes(t);

function toUci(m: ChessJsMove): string { return m.from + m.to + (m.promotion ?? ''); }

function toRecord(m: ChessJsMove, fen: string): MoveRecord {
  const ep = m.flags.includes('e');
  const rank = m.to[1];
  const rook = m.flags.includes('k') ? { from: 'h' + rank, to: 'f' + rank } : m.flags.includes('q') ? { from: 'a' + rank, to: 'd' + rank } : undefined;
  return Object.freeze({
    uci: toUci(m), san: m.san, from: m.from, to: m.to, color: m.color, piece: m.piece,
    ...(m.captured ? { captured: m.captured, captureSquare: ep ? m.to[0] + m.from[1] : m.to } : {}),
    ...(m.promotion ? { promotion: m.promotion } : {}),
    ...(rook ? { rook } : {}),
    fen,
  });
}

function pgnDate(d: Date): string {
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
function wrap(text: string): string {
  const lines: string[] = []; let line = '';
  for (const w of text.split(' ')) { if (line && line.length + w.length + 1 > 79) { lines.push(line); line = w; } else line = line ? `${line} ${w}` : w; }
  if (line) lines.push(line);
  return lines.join('\n');
}

export const MATERIAL: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
