import { describe, expect, it } from 'vitest';
import { createChessAIRegistry } from '../../../src/chess-ai';
import { createMockProviderSource } from '../../../src/chess-ai/testing/mock-provider';
import { judge, winChance } from '../../../src/games/chess/analysis';
import { LocalMatch } from '../../../src/games/chess/match';
import { START_FEN } from '../../../src/games/chess/rules';
import { LocalSession } from '../../../src/games/chess/session';

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let clock = 0;
const now = () => clock;

function computer(options: Parameters<typeof createMockProviderSource>[0] = {}, human: 'w' | 'b' = 'w', tc = null as null | { id: string; baseMs: number; incrementMs: number }) {
  const { source, probe } = createMockProviderSource({ manifest: { opponents: ['elo-300'] }, ...options });
  const session = new LocalSession(new LocalMatch(tc), { kind: 'computer', human, opponentId: 'elo-300', registry: createChessAIRegistry([source]), takebacks: true }, now);
  return { session, probe };
}

describe('computer games through the AI contract', () => {
  it('sends the exact position, legal moves and opponent, and plays the validated reply', async () => {
    const { session, probe } = computer();
    await session.start();
    expect(session.move('e2e4')).toBe(true);
    await flush();
    const req = probe.requests[0];
    expect(req.opponentId).toBe('elo-300');
    expect(req.fen).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(req.startFen).toBe(START_FEN);
    expect(req.moveHistoryUci).toEqual(['e2e4']);
    expect(req.legalMovesUci).toHaveLength(20);
    expect(session.match.rules.historyUci).toEqual(['e2e4', req.legalMovesUci[0]]);
  });

  it('lets the engine open when the player takes Black', async () => {
    const { session } = computer({}, 'b');
    await session.start();
    await flush();
    expect(session.match.rules.ply).toBe(1);
    expect(session.controls()).toEqual(['b']);
  });

  it('never plays an illegal engine move', async () => {
    const { session } = computer({ choose: () => ({ moveUci: 'e7e4' }) });
    await session.start();
    session.move('e2e4');
    await flush();
    expect(session.match.rules.ply).toBe(1);
    expect(session.status()).toMatch(/Engine error/);
  });

  it('drops a reply for a position that was taken back', async () => {
    const { session, probe } = computer({ delayMs: 30 });
    await session.start();
    session.move('e2e4');
    session.takeback();
    await flush(60);
    expect(session.match.rules.ply).toBe(0);
    expect(probe.requests[0].signal.aborted).toBe(true);
    expect(probe.cancelled).toBeGreaterThan(0);
  });

  it('reports a failed engine start and an uninstalled opponent truthfully', async () => {
    const broken = computer({ failInit: 'no WebAssembly' });
    await broken.session.start();
    expect(broken.session.status()).toMatch(/Engine failed to start/);
    const session = new LocalSession(new LocalMatch(null), { kind: 'computer', human: 'w', opponentId: 'elo-3000', registry: createChessAIRegistry([]) }, now);
    await session.start();
    expect(session.status()).toBe('This opponent is not installed.');
  });

  it('disposes the engine when the game is left', async () => {
    const { session, probe } = computer({ delayMs: 1000 });
    await session.start();
    session.move('e2e4');
    session.dispose();
    await flush();
    expect(probe.disposed).toBe(1);
    expect(session.match.rules.ply).toBe(1);
  });
});

describe('local match', () => {
  it('runs clocks from the first move, adds increments and flags', () => {
    clock = 0;
    const m = new LocalMatch({ id: '1+2', baseMs: 60000, incrementMs: 2000 });
    m.move('e2e4', 5000);
    expect(m.remaining('w', 9000)).toBe(60000);
    expect(m.remaining('b', 9000)).toBe(56000);
    m.move('e7e5', 10000);
    expect(m.remaining('b', 10000)).toBe(57000);
    expect(m.tick(80000)).toBe(true);
    expect(m.outcome).toEqual({ result: '0-1', termination: 'timeout', winner: 'b' });
    expect(m.move('d2d4', 80001)).toBeNull();
  });

  it('pauses the clock and restores a saved game paused', () => {
    const m = new LocalMatch({ id: '3+0', baseMs: 180000, incrementMs: 0 });
    m.move('e2e4', 0);
    m.pause(1000);
    expect(m.remaining('b', 999999)).toBe(179000);
    const saved = JSON.parse(JSON.stringify(m.snapshot(1000)));
    const r = LocalMatch.restore(saved, 0)!;
    expect(r.rules.historyUci).toEqual(['e2e4']);
    expect(r.isPaused).toBe(true);
    expect(r.remaining('b', 5000)).toBe(179000);
    expect(LocalMatch.restore({ ...saved, moves: ['e2e4', 'e2e4'] }, 0)).toBeNull();
    expect(LocalMatch.restore({ ...saved, clock: { w: -1, b: 0 } }, 0)).toBeNull();
    expect(LocalMatch.restore('junk', 0)).toBeNull();
  });

  it('handles draw offers, claims and resignation', () => {
    const m = new LocalMatch(null);
    for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8']) m.move(u, 0);
    expect(m.claimDraw(0)).toBe(true);
    expect(m.outcome?.termination).toBe('threefold');
    const d = new LocalMatch(null);
    d.move('e2e4', 0);
    d.offerDraw('w');
    expect(d.acceptDraw('w', 0)).toBe(false);
    expect(d.acceptDraw('b', 0)).toBe(true);
    const r = new LocalMatch(null);
    r.move('e2e4', 0);
    r.resign('b', 0);
    expect(r.outcome).toEqual({ result: '1-0', termination: 'resignation', winner: 'w' });
  });
});

describe('analysis judgement', () => {
  it('classifies only real evaluation drops', () => {
    expect(winChance({ cp: 0 })).toBeCloseTo(50);
    expect(judge({ cp: 30 }, { cp: 10 }, 'w')).toBeNull();
    expect(judge({ cp: 50 }, { cp: -300 }, 'w')).toBe('mistake');
    expect(judge({ cp: 50 }, { cp: -400 }, 'w')).toBe('blunder');
    expect(judge({ cp: -20 }, { cp: 150 }, 'b')).toBe('inaccuracy');
    expect(judge({ cp: 0 }, { cp: 250 }, 'b')).toBe('mistake');
    expect(judge({ cp: 0 }, { mate: 3 }, 'b')).toBe('blunder');
  });
});
