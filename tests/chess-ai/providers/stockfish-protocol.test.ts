import { describe, expect, it } from 'vitest';
import type { ChessAIPosition } from '../../../src/chess-ai/types';
import { parseInfo, positionCommand, searchBudget, stockfishSettings } from '../../../src/chess-ai/providers/stockfish/uci';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const position = (overrides: Partial<ChessAIPosition> = {}): ChessAIPosition => ({
  fen: START, startFen: START, moveHistoryUci: [], legalMovesUci: ['e2e4'], positionRevision: 1, ...overrides,
});

describe('Stockfish UCI analysis parsing', () => {
  it('preserves White scores and reports depth, line order and complete PV', () => {
    expect(parseInfo('info depth 18 seldepth 25 multipv 2 score cp 43 nodes 9000 time 60 pv d2d4 d7d5 c2c4', true)).toEqual({
      depth: 18, multiPv: 2, evaluationCp: 43, pvUci: ['d2d4', 'd7d5', 'c2c4'],
    });
  });

  it('converts a Black advantage into a negative White evaluation', () => {
    expect(parseInfo('info depth 12 score cp 91 pv e7e5 g1f3', false)).toMatchObject({ evaluationCp: -91, depth: 12 });
    expect(parseInfo('info depth 12 score cp -91 pv e7e5 g1f3', false)).toMatchObject({ evaluationCp: 91 });
  });

  it('converts mate scores from the side to move into White orientation', () => {
    expect(parseInfo('info depth 8 score mate 3 pv h2h1q', false)).toMatchObject({ mateIn: -3 });
    expect(parseInfo('info depth 8 score mate -4 pv a1a2', false)).toMatchObject({ mateIn: 4 });
    expect(parseInfo('info depth 8 score mate 3 pv f7f8q', true)).toMatchObject({ mateIn: 3 });
  });

  it.each([
    'info string NNUE evaluation using nn-61e7af4bb97d.nnue enabled',
    'info depth 10 score cp 42 lowerbound pv e2e4',
    'info depth 10 score cp -42 upperbound pv e2e4',
    'info depth 10 score cp 42',
    'info score cp 42 pv e2e4',
    'info depth broken score cp 42 pv e2e4',
    'info depth 10 score cp NaN pv e2e4',
    'info depth 10 score cp 42 pv e9e4',
    'info depth 10 score cp 42 pv e2e4 junk',
  ])('does not expose malformed or incomplete analysis: %s', (line) => {
    expect(parseInfo(line, true)).toBeUndefined();
  });
});

describe('Stockfish strength settings', () => {
  it.each([2200, 2600, 3000])('uses the actual engine limit for %i, with full Skill Level', (elo) => {
    const settings = stockfishSettings(`elo-${elo}`);
    expect(settings).toContain('setoption name UCI_LimitStrength value true');
    expect(settings).toContain(`setoption name UCI_Elo value ${elo}`);
    expect(settings).toContain('setoption name Skill Level value 20');
  });

  it('removes intentional weakening for unrestricted play', () => {
    const settings = stockfishSettings('max');
    expect(settings).toContain('setoption name UCI_LimitStrength value false');
    expect(settings).toContain('setoption name Skill Level value 20');
  });

  it('does not silently use Stockfish for a beginner or unknown opponent', () => {
    expect(() => stockfishSettings('elo-300')).toThrow();
    expect(() => stockfishSettings('not-an-opponent')).toThrow();
  });
});

describe('Stockfish position commands', () => {
  it('transmits game history so the engine can recognize repetition', () => {
    expect(positionCommand(position({ fen: AFTER_E4, moveHistoryUci: ['e2e4'] })))
      .toBe(`position fen ${START} moves e2e4`);
  });

  it('supports a standalone FEN when no history is supplied', () => {
    expect(positionCommand(position({ fen: AFTER_E4 }))).toBe(`position fen ${AFTER_E4}`);
  });

  it.each([
    '',
    'not a FEN',
    '8/8/8/8/8/8/8/8 w - - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1',
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - -1 1',
    `${START}\ngo infinite`,
  ])('rejects invalid FEN before it reaches the engine: %s', (fen) => {
    expect(() => positionCommand(position({ fen }))).toThrow();
  });

  it('rejects invalid start FEN and malformed move history', () => {
    expect(() => positionCommand(position({ startFen: 'bad', moveHistoryUci: ['e2e4'] }))).toThrow();
    expect(() => positionCommand(position({ moveHistoryUci: ['e2e4\ngo infinite'] }))).toThrow();
  });
});

describe('Stockfish search clock budget', () => {
  it('honors the caller budget without extending a short request', () => {
    expect(searchBudget({ thinkingTimeMs: 350 })).toBe(350);
    expect(searchBudget({ thinkingTimeMs: 15, clock: { remainingMs: 50_000, incrementMs: 2000 } })).toBeLessThanOrEqual(15);
  });

  it('caps one search and reserves time under clock pressure', () => {
    expect(searchBudget({ thinkingTimeMs: 500_000 })).toBeLessThanOrEqual(30_000);
    const ms = searchBudget({ thinkingTimeMs: 10_000, clock: { remainingMs: 1000, incrementMs: 0 } });
    expect(ms).toBeGreaterThanOrEqual(1);
    expect(ms).toBeLessThanOrEqual(80);
  });

  it('never spends the final milliseconds even with a large increment', () => {
    expect(searchBudget({ thinkingTimeMs: 1000, clock: { remainingMs: 30, incrementMs: 10_000 } })).toBeLessThanOrEqual(15);
    expect(searchBudget({ thinkingTimeMs: 1000, clock: { remainingMs: 0, incrementMs: 0 } })).toBe(1);
  });
});
