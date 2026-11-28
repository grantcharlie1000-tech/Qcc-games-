import { describe, expect, it } from 'vitest';
import { ChessRules, START_FEN } from '../../../src/games/chess/rules';

const play = (moves: string, fen = START_FEN) => new ChessRules(fen, moves.split(' ').filter(Boolean));

describe('chess rules', () => {
  it('generates the 20 opening moves and enforces turns', () => {
    const g = new ChessRules();
    expect(g.legalMovesUci()).toHaveLength(20);
    expect(g.move('e7e5')).toBeNull();
    expect(g.move('e2e4')?.san).toBe('e4');
    expect(g.turn).toBe('b');
    expect(g.move('e2e3')).toBeNull();
  });

  it('moves every piece type legally and rejects illegal moves', () => {
    const g = new ChessRules('4k3/8/8/8/3QR3/8/1N3B2/4K3 w - - 0 1');
    expect(g.legalFrom('b2').sort()).toEqual(['b2a4', 'b2c4', 'b2d1', 'b2d3']);
    expect(g.legalFrom('f2')).toContain('f2h4');
    expect(g.legalFrom('e4')).not.toContain('e4e8x');
    expect(g.isLegal('d4h8')).toBe(true);
    expect(g.isLegal('d4e6')).toBe(false);
    expect(g.isLegal('e1e2')).toBe(true);
    expect(g.move('xx')).toBeNull();
    expect(g.move('d4e6')).toBeNull();
    expect(g.ply).toBe(0);
  });

  it('castles both ways and records the rook move', () => {
    const g = new ChessRules('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const k = g.move('e1g1');
    expect(k?.san).toBe('O-O');
    expect(k?.rook).toEqual({ from: 'h1', to: 'f1' });
    const q = g.move('e8c8');
    expect(q?.san).toBe('O-O-O');
    expect(q?.rook).toEqual({ from: 'a8', to: 'd8' });
  });

  it('forbids castling out of, through or into check', () => {
    expect(new ChessRules('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1').isLegal('e1g1')).toBe(true);
    expect(new ChessRules('4k3/8/8/8/8/8/4r3/R3K2R w KQ - 0 1').isLegal('e1g1')).toBe(false); // in check
    expect(new ChessRules('4k3/8/8/8/8/8/5r2/R3K2R w KQ - 0 1').isLegal('e1g1')).toBe(false); // through f1
    expect(new ChessRules('4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1').isLegal('e1g1')).toBe(false); // into g1
    expect(new ChessRules('4k3/8/8/8/8/8/3r4/R3K2R w KQ - 0 1').isLegal('e1c1')).toBe(false); // through d1
    expect(new ChessRules('4k3/8/8/8/8/8/1r6/R3K2R w KQ - 0 1').isLegal('e1c1')).toBe(true); // b1 attacked is fine
  });

  it('captures en passant only immediately, removing the passed pawn', () => {
    const g = play('e2e4 a7a6 e4e5 d7d5');
    expect(g.fen.split(' ')[3]).toBe('d6');
    const ep = g.move('e5d6');
    expect(ep?.captured).toBe('p');
    expect(ep?.captureSquare).toBe('d5');
    expect(g.pieceAt('d5')).toBeNull();
    const late = play('e2e4 a7a6 e4e5 d7d5 h2h3 h7h6');
    expect(late.isLegal('e5d6')).toBe(false);
  });

  it('promotes and underpromotes, requiring a piece choice', () => {
    const g = new ChessRules('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    expect(g.isPromotion('a7', 'a8')).toBe(true);
    expect(g.move('a7a8')).toBeNull();
    expect(g.legalFrom('a7').sort()).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
    const n = g.move('a7a8n');
    expect(n?.san).toBe('a8=N');
    expect(g.pieceAt('a8')).toEqual({ color: 'w', type: 'n' });
  });

  it('detects check, checkmate and stalemate', () => {
    const mate = play('f2f3 e7e5 g2g4 d8h4');
    expect(mate.history.at(-1)?.san).toBe('Qh4#');
    expect(mate.inCheck()).toBe(true);
    expect(mate.outcome()).toEqual({ result: '0-1', termination: 'checkmate', winner: 'b' });
    expect(mate.move('a2a3')).toBeNull();
    const stale = new ChessRules('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(stale.outcome()).toEqual({ result: '1/2-1/2', termination: 'stalemate' });
  });

  it('allows a threefold claim and ends the game at fivefold', () => {
    const cycle = 'g1f3 g8f6 f3g1 f6g8 ';
    const g = play(cycle + cycle);
    expect(g.repetitions()).toBe(3);
    expect(g.claimable()).toContain('threefold');
    expect(g.outcome()).toBeNull();
    const five = play(cycle.repeat(4));
    expect(five.outcome()).toEqual({ result: '1/2-1/2', termination: 'fivefold' });
  });

  it('allows a 50-move claim and ends the game at 75 moves', () => {
    const fifty = new ChessRules('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
    expect(fifty.claimable()).toEqual([]);
    fifty.move('a1a2');
    expect(fifty.claimable()).toContain('fifty-move');
    expect(fifty.outcome()).toBeNull();
    const sevenFive = new ChessRules('4k3/8/8/8/8/8/8/R3K3 w - - 149 100');
    sevenFive.move('a1a2');
    expect(sevenFive.outcome()).toEqual({ result: '1/2-1/2', termination: 'seventy-five' });
    // A pawn move or capture resets the count.
    const reset = new ChessRules('4k3/8/8/8/8/8/P7/4K3 w - - 120 100');
    reset.move('a2a3');
    expect(reset.halfmoveClock).toBe(0);
  });

  it('detects insufficient material and handles flag fall against a bare king', () => {
    expect(new ChessRules('4k3/8/8/8/8/8/8/4KB2 w - - 0 1').outcome()?.termination).toBe('insufficient');
    expect(new ChessRules('4k3/8/8/8/8/8/8/4KN2 w - - 0 1').outcome()?.termination).toBe('insufficient');
    const kq = new ChessRules('4k3/8/8/8/8/8/8/3QK3 b - - 0 1');
    expect(kq.timeoutOutcome('b')).toEqual({ result: '1-0', termination: 'timeout', winner: 'w' });
    // White runs out of time but Black has only a king: draw.
    expect(kq.timeoutOutcome('w')).toEqual({ result: '1/2-1/2', termination: 'timeout-vs-insufficient' });
  });

  it('round-trips FEN and history, undoes, and clones', () => {
    const g = play('e2e4 c7c5 g1f3');
    const copy = new ChessRules(START_FEN, g.historyUci);
    expect(copy.fen).toBe(g.fen);
    expect(g.clone().fen).toBe(g.fen);
    expect(g.undo()?.uci).toBe('g1f3');
    expect(g.fen).toBe('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(() => new ChessRules(START_FEN, ['e2e5'])).toThrow();
  });

  it('writes PGN with move numbers, checks, mate and result', () => {
    const g = play('e2e4 e7e5 d1h5 b8c6 f1c4 g8f6 h5f7');
    const pgn = g.pgn({ White: 'Ana', Black: 'Ben' }, '1-0');
    expect(pgn).toContain('[White "Ana"]');
    expect(pgn).toContain('[Result "1-0"]');
    expect(pgn).toContain('1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0');
    const fromBlack = new ChessRules('4k3/8/8/8/8/8/4p3/K7 b - - 0 40', ['e2e1q']);
    expect(fromBlack.pgn({}, '*')).toContain('[FEN "4k3/8/8/8/8/8/4p3/K7 b - - 0 40"]');
    expect(fromBlack.pgn({}, '*')).toContain('40... e1=Q+');
  });
});
