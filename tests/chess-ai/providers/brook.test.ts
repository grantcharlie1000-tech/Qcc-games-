import { describe, expect, it } from 'vitest';
import { Chess } from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import { computeMove } from '../../../src/chess-ai/providers/beginner/engine';

function play(fen: string, seed: number, thinkingTimeMs = 75): Chess {
  const chess = new Chess(fen);
  const answer = computeMove({ fen, moveHistoryUci: [], legalMovesUci: chess.moves({ verbose: true }).map(move => move.lan), opponentId: 'elo-900', thinkingTimeMs }, seed);
  chess.move(answer.moveUci);
  return chess;
}

describe('Brook elementary threat awareness', () => {
  it('usually moves its queen out of a knight attack', () => {
    const fen = '6k1/8/8/8/8/2n5/8/3Q2K1 w - - 0 1';
    let saves = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const chess = play(fen, seed);
      const queen = chess.findPiece({ color: 'w', type: 'q' })[0];
      if (queen && !chess.isAttacked(queen, 'b')) saves++;
    }
    expect(saves).toBeGreaterThanOrEqual(38);
  });

  it('usually prevents an immediate back-rank mate', () => {
    const fen = 'r5k1/5ppp/8/8/8/5R2/5PPP/6K1 w - - 0 1';
    let saves = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const chess = play(fen, seed);
      const allowsMate = chess.moves({ verbose: true }).some(reply => reply.san.endsWith('#'));
      if (!allowsMate) saves++;
    }
    expect(saves).toBeGreaterThanOrEqual(36);
  });

  it('usually blocks a pawn one move from promotion', () => {
    const fen = '7k/P7/8/8/8/8/6r1/7K b - - 0 1';
    let stops = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const chess = play(fen, seed);
      const winsQueen = chess.moves({ verbose: true }).some(reply => {
        if (!reply.promotion) return false;
        chess.move(reply);
        const recaptured = chess.moves({ verbose: true }).some(answer => answer.to === reply.to && answer.captured);
        chess.undo();
        return !recaptured;
      });
      if (!winsQueen) stops++;
    }
    expect(stops).toBeGreaterThanOrEqual(36);
  });

  it('brings its king up to finish a queen endgame', () => {
    const chess = new Chess('7k/8/8/8/3K4/8/8/3Q4 w - - 0 1');
    const history: string[] = [];
    while (!chess.isGameOver() && history.length < 40) {
      const answer = computeMove({ fen: chess.fen(), moveHistoryUci: history,
        legalMovesUci: chess.moves({ verbose: true }).map(move => move.lan),
        opponentId: chess.turn() === 'w' ? 'elo-900' : 'elo-700', thinkingTimeMs: 75 }, 147331 + history.length * 8191);
      chess.move(answer.moveUci); history.push(answer.moveUci);
    }
    expect(chess.isCheckmate()).toBe(true);
  }, 10000);
});
