import { describe, expect, it } from 'vitest';
import { Chess } from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import { computeMove, type BeginnerSearchInput } from '../../../src/chess-ai/providers/beginner/engine';

function position(fen?: string, opponentId = 'elo-900'): BeginnerSearchInput {
  const chess = new Chess(fen);
  return { fen: chess.fen(), moveHistoryUci: [], legalMovesUci: chess.moves({verbose:true}).map(m => m.lan), opponentId, thinkingTimeMs: 200 };
}

describe('beginner decision system', () => {
  it('replays a seeded choice and offers several sensible opening choices', () => {
    const input = position(undefined, 'elo-300');
    expect(computeMove(input, 42).moveUci).toBe(computeMove(input, 42).moveUci);
    const moves = new Set(Array.from({length:48}, (_,seed) => computeMove(input, seed + 1).moveUci));
    expect(moves.size).toBeGreaterThan(3);
    expect([...moves].every(m => input.legalMovesUci.includes(m))).toBe(true);
    const development = ['e2e4','d2d4','g1f3','b1c3','e2e3','d2d3','c2c4','g2g3'];
    expect([...moves].some(m=> development.includes(m))).toBe(true);
  });
  it('accepts forced promotions, castling and en passant from the legal list', () => {
    const positions = [
      ['8/P6k/8/8/8/8/8/7K w - - 0 1', 'a7a8q'],
      ['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1'],
      ['7k/8/8/3pP3/8/8/8/7K w - d6 0 1', 'e5d6'],
    ];
    for (const [fen, move] of positions) {
      const input = position(fen);
      expect(input.legalMovesUci).toContain(move);
      expect(computeMove({...input,legalMovesUci:[move]}, 7).moveUci).toBe(move);
    }
  });
  it('rejects invalid FEN, unknown levels, empty legal sets and inconsistent legal moves', () => {
    expect(()=>computeMove({...position(), fen:'invalid'}, 1)).toThrow();
    expect(()=>computeMove(position(undefined,'elo-999'), 1)).toThrow();
    expect(()=>computeMove({...position(),legalMovesUci:[]}, 1)).toThrow();
    expect(()=>computeMove({...position(),legalMovesUci:['a1a8']}, 1)).toThrow();
  });
  it('finds mate in one reliably at 900 while the 300 player sometimes misses it', () => {
    const fen = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    const mates = (level:string) => Array.from({length:40},(_,seed)=> {
      const input = position(fen,level);
      const reply = computeMove(input, seed+1);
      const board = new Chess(fen); board.move(reply.moveUci);
      return board.isCheckmate() ? 1 : 0;
    }).reduce<number>((a,b)=>a+b,0);
    const beginnerMates=mates('elo-300'),improvingMates=mates('elo-900');
    expect(beginnerMates).toBeGreaterThan(0);
    expect(beginnerMates).toBeLessThan(20);
    expect(improvingMates).toBeGreaterThan(24);
    expect(improvingMates).toBeGreaterThan(beginnerMates+12);
  });
  it('higher tiers capture a free queen more reliably than beginners', () => {
    const fen='7k/8/8/8/4q3/8/8/4R2K w - - 0 1';
    const captures = (level:string) => Array.from({length:80},(_,seed)=>computeMove(position(fen,level),seed+1).moveUci).filter(m=>m.endsWith('e4')).length;
    expect(captures('elo-900')).toBeGreaterThan(70);
    expect(captures('elo-900')).toBeGreaterThan(captures('elo-300'));
  });
  it('only returns the supplied legal moves through a seeded game', () => {
    const chess=new Chess();
    for(let ply=0;ply<120 && !chess.isGameOver();ply++) {
      const input = {...position(chess.fen(),['elo-300','elo-500','elo-700','elo-900'][ply%4]),moveHistoryUci:chess.history({verbose:true}).map(m=>m.lan)};
      const result=computeMove(input, ply+127);
      expect(input.legalMovesUci).toContain(result.moveUci);
      chess.move(result.moveUci);
    }
  },15_000);
});
