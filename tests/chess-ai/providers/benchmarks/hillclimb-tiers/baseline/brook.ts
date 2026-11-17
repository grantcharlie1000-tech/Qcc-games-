import type { Chess, Color, Move, PieceSymbol } from './vendor/chess.js';
import type { BeginnerSearchResult } from './engine';

interface SearchMove {
  color: Color; from: number; to: number; piece: PieceSymbol;
  captured?: PieceSymbol; promotion?: PieceSymbol; flags: number;
}
interface SearchBoard {
  _board: ({ color: Color; type: PieceSymbol } | undefined)[];
  _moves(options?: { legal: boolean }): SearchMove[];
  _isKingAttacked(color: Color): boolean;
  _makeMove(move: SearchMove): void;
  _undoMove(): SearchMove | null;
}
// This adapter is deliberately tied to the unmodified, vendored chess.js 1.4.0.
// Its legal generator and make/undo implement every special move. Bypassing SAN
// construction keeps shallow search within the worker's allocated compute budget.
// Public move/undo must not be mixed with these operations (repetition counters).
const VALUE: Record<PieceSymbol, number> = { p:100, n:310, b:330, r:500, q:900, k:0 };
const MATE = 100000;
const square = (index: number): string => String.fromCharCode(97 + (index & 7)) + (8 - (index >> 4));
const uci = (move: SearchMove): string => square(move.from) + square(move.to) + (move.promotion || '');
const gain = (move: SearchMove): number => VALUE[move.captured ?? 'k'] + (move.promotion ? VALUE[move.promotion] - VALUE.p : 0);

/** Up to four legal plies and capture continuations, with seeded move noise. */
export function searchBrook(
  chess: Chess, offered: readonly Move[], started: number, budgetMs: number,
  random: () => number, temperature: number, quiet: (move: Move) => number,
): BeginnerSearchResult {
  const mates = offered.filter(move => move.san.endsWith('#'));
  if (mates.length) return { moveUci: mates[Math.floor(random()*mates.length)].lan,
    nodes: offered.length, elapsedMs: performance.now()-started, depth: 1 };
  const board = chess as unknown as SearchBoard;
  const deadline = started + Math.min(200, budgetMs);
  const expired = Symbol('Brook search deadline');
  let nodes = 0, completedDepth = 0;
  function evaluate(): number {
    let white = 0, whiteForce = 0, blackForce = 0, whiteKing = 0, blackKing = 0;
    let whiteMajor = false, blackMajor = false;
    for (let index = 0; index < 128; index++) {
      if (index & 0x88) { index += 7; continue; }
      const piece = board._board[index];
      if (!piece) continue;
      if (piece.color === 'w') {
        whiteForce += VALUE[piece.type];
        if (piece.type === 'k') whiteKing = index;
        if (piece.type === 'q' || piece.type === 'r') whiteMajor = true;
      } else {
        blackForce += VALUE[piece.type];
        if (piece.type === 'k') blackKing = index;
        if (piece.type === 'q' || piece.type === 'r') blackMajor = true;
      }
      const file = index & 7, rank = index >> 4;
      const center = 7 - Math.abs(file - 3.5) - Math.abs(rank - 3.5);
      const advance = piece.color === 'w' ? 6 - rank : rank - 1;
      let positional = 0;
      if (piece.type === 'p') positional = advance * 8 + center * 3;
      if (piece.type === 'n') positional = center * 10;
      if (piece.type === 'b') positional = center * 6;
      if (piece.type === 'r') positional = advance === 6 ? 20 : 0;
      white += (VALUE[piece.type] + positional) * (piece.color === 'w' ? 1 : -1);
    }
    const matingSide = blackForce === 0 && whiteMajor ? 1 : whiteForce === 0 && blackMajor ? -1 : 0;
    if (matingSide) {
      const weakerKing = matingSide > 0 ? blackKing : whiteKing;
      const file = weakerKing & 7, rank = weakerKing >> 4;
      const edge = 3.5 - Math.min(file, 7-file, rank, 7-rank);
      const distance = Math.abs((whiteKing & 7) - (blackKing & 7)) + Math.abs((whiteKing >> 4) - (blackKing >> 4));
      white += matingSide * (edge * 32 + (14-distance) * 24);
    }
    return white * (chess.turn() === 'w' ? 1 : -1);
  }
  function search(depth: number, alpha: number, beta: number, ply: number, capturesLeft: number): number {
    if ((++nodes & 15) === 0 && performance.now() >= deadline) throw expired;
    const inCheck = chess.isCheck();
    const tacticalOnly = depth <= 0 && ply > 1 && !inCheck;
    const moves = board._moves(tacticalOnly ? { legal: false } : undefined);
    if (!moves.length) return inCheck ? -MATE + ply : 0;
    if (chess.isInsufficientMaterial()) return 0;
    const standing = evaluate();
    if (depth <= 0) {
      // Never stand pat while in check. Search legal evasions even at the capture
      // horizon, with an absolute ply bound for repeated checking sequences.
      if (ply >= 8) return standing;
      if (!inCheck) {
        if (standing >= beta) return standing;
        alpha = Math.max(alpha, standing);
        if (capturesLeft <= 0) return standing;
      }
    }
    moves.sort((a,b) => gain(b) * 10 - VALUE[b.piece] - (gain(a) * 10 - VALUE[a.piece]));
    let best = depth <= 0 && !inCheck ? standing : -MATE;
    for (const move of moves) {
      if (depth <= 0 && !inCheck && !move.captured && !move.promotion) continue;
      board._makeMove(move);
      if (tacticalOnly && board._isKingAttacked(move.color)) { board._undoMove(); continue; }
      let score: number;
      try { score = -search(depth - 1, -beta, -alpha, ply + 1, depth <= 0 ? capturesLeft - 1 : capturesLeft); }
      finally { board._undoMove(); }
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  const pretty = new Map(offered.map(move => [move.lan, move]));
  const roots = board._moves().filter(move => pretty.has(uci(move))).map(move => ({
    move, lan: uci(move), bonus: quiet(pretty.get(uci(move))!) * .15,
    noise: -Math.log(-Math.log(Math.max(.000001, random()))) * temperature,
  }));
  roots.sort((a,b) => gain(b.move) - gain(a.move) || b.bonus - a.bonus);
  // A whole completed iteration scores every supplied root. Time pressure never
  // compares deep scores for a few roots against shallow scores for the others.
  let scored = roots.map(root => ({ ...root, score: gain(root.move) + root.bonus }));
  let choice = [...scored].sort((a,b) => b.score + b.noise - a.score - a.noise)[0];
  for (let depth = 1; depth <= 4; depth++) {
    const iteration = [];
    let best = -MATE, bestRoot = choice;
    try {
      for (const root of roots) {
        if (performance.now() >= deadline) throw expired;
        board._makeMove(root.move);
        let score: number;
        // Include this root's fixed sampling offset in the bound. A pruned root
        // cannot beat the current sampled best, even after adding its noise.
        try { score = -search(depth - 1, -MATE, -best + root.bonus + root.noise, 1, 2); }
        finally { board._undoMove(); }
        iteration.push({ ...root, score: score + root.bonus });
        if (score + root.bonus + root.noise > best) {
          best = score + root.bonus + root.noise;
          bestRoot = iteration[iteration.length - 1];
        }
      }
      scored = iteration;
      choice = bestRoot;
      completedDepth = depth;
      roots.sort((a,b) => scored.find(item => item.lan === b.lan)!.score - scored.find(item => item.lan === a.lan)!.score);
    } catch (error) { if (error !== expired) throw error; break; }
  }
  return { moveUci: choice.lan, nodes, elapsedMs: performance.now() - started, depth: completedDepth };
}
