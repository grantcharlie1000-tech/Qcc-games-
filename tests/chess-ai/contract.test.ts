import { describe, expect, it } from 'vitest';
import {
  CHESS_AI_OPPONENTS,
  ChessAIError,
  createChessAIRegistry,
  discoverProviders,
  getChessAIRegistry,
  type ChessAIMoveInput,
} from '../../src/chess-ai';
import { pairProviderModules } from '../../src/chess-ai/loader';
import { createMockProviderSource } from '../../src/chess-ai/testing/mock-provider';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_MOVES = ['a2a3', 'a2a4', 'b2b3', 'b2b4', 'c2c3', 'c2c4', 'd2d3', 'd2d4', 'e2e3', 'e2e4', 'f2f3', 'f2f4', 'g2g3', 'g2g4', 'h2h3', 'h2h4', 'b1a3', 'b1c3', 'g1f3', 'g1h3'];
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const position = (over: Partial<ChessAIMoveInput> = {}): ChessAIMoveInput => ({
  fen: START, startFen: START, moveHistoryUci: [], legalMovesUci: START_MOVES, positionRevision: 1, ...over,
});

const codeOf = async (p: Promise<unknown>) => {
  try { await p; return 'resolved'; } catch (e) { return e instanceof ChessAIError ? e.code : `other: ${String(e)}`; }
};

describe('chess AI catalog and discovery', () => {
  it('defines the planned tiers in order with unique ids', () => {
    expect(CHESS_AI_OPPONENTS.map((o) => o.targetElo)).toEqual([300, 500, 700, 900, 1100, 1300, 1600, 1900, 2200, 2600, 3000, null, null]);
    expect(new Set(CHESS_AI_OPPONENTS.map((o) => o.id)).size).toBe(CHESS_AI_OPPONENTS.length);
    expect(CHESS_AI_OPPONENTS.find((o) => o.id === 'leela-expert')?.plannedEngines).toEqual(['leela']);
  });

  it('reports every opponent unavailable when no provider is installed', () => {
    const { sources } = discoverProviders();
    const real = getChessAIRegistry();
    // This holds until the engine agent adds providers; then each opponent must name a real provider.
    for (const status of real.opponents()) {
      const declared = sources.some((s) => s.manifest.opponents.includes(status.opponent.id));
      expect(status.availability.state).toBe(declared ? 'available' : 'unavailable');
    }
    expect(real.rejected).toEqual([]);
  });

  it('pairs provider folders and rejects broken ones without throwing', () => {
    const good = { manifest: { id: 'good', name: 'Good', version: '1', engine: 'custom', license: 'MIT', opponents: ['elo-300'], analysis: false } };
    const { sources, rejected } = pairProviderModules(
      {
        './providers/good/manifest.ts': good,
        './providers/bad/manifest.ts': { manifest: { id: 'Bad Id' } },
        './providers/lonely/manifest.ts': good,
        './providers/copy/manifest.ts': { manifest: { ...good.manifest, id: 'dup' } },
        './providers/copy2/manifest.ts': { manifest: { ...good.manifest, id: 'dup' } },
      },
      {
        './providers/good/index.ts': async () => ({ createProvider: () => ({}) }),
        './providers/bad/index.ts': async () => ({}),
        './providers/copy/index.ts': async () => ({}),
        './providers/copy2/index.ts': async () => ({}),
        './providers/orphan/index.ts': async () => ({}),
      },
    );
    expect(sources.map((s) => s.manifest.id)).toEqual(['good']);
    expect(rejected.map((r) => r.path).sort()).toEqual(['./providers/bad', './providers/copy', './providers/copy2', './providers/lonely', './providers/orphan']);
  });

  it('marks only declared opponents available and prefers higher priority', () => {
    const low = createMockProviderSource({ manifest: { id: 'low', opponents: ['elo-300', 'elo-500'] } });
    const high = createMockProviderSource({ manifest: { id: 'high', opponents: ['elo-500'], priority: 5 } });
    const registry = createChessAIRegistry([low.source, high.source]);
    expect(registry.availability('elo-300')).toMatchObject({ state: 'available', provider: { id: 'low' } });
    expect(registry.availability('elo-500')).toMatchObject({ state: 'available', provider: { id: 'high' } });
    expect(registry.availability('elo-3000')).toEqual({ state: 'unavailable' });
    expect(registry.analysisProvider()).toBeUndefined();
  });
});

describe('chess AI sessions', () => {
  it('sends the exact position and opponent and returns a validated move', async () => {
    const { source, probe } = createMockProviderSource({ choose: () => ({ moveUci: 'E2E4', evaluationCp: 30, depth: 8, pvUci: ['e2e4', 'e7e5'] }) });
    const progress: string[] = [];
    const session = await createChessAIRegistry([source]).openOpponent('elo-300', { onProgress: (p) => progress.push(`${p.provider.id}:${p.phase}`) });
    const move = await session.requestMove(position({ moveHistoryUci: [], positionRevision: 4 }));
    expect(move).toEqual({ moveUci: 'e2e4', evaluationCp: 30, depth: 8, pvUci: ['e2e4', 'e7e5'] });
    expect(progress).toEqual(['mock:download', 'mock:warmup']);
    const req = probe.requests[0];
    expect(req).toMatchObject({ opponentId: 'elo-300', fen: START, positionRevision: 4, thinkingTimeMs: 400 });
    expect(req.legalMovesUci).toEqual(START_MOVES);
    expect(Object.isFrozen(req.legalMovesUci)).toBe(true);
  });

  it('rejects an illegal or malformed engine move', async () => {
    const illegal = createMockProviderSource({ choose: () => ({ moveUci: 'e2e5' }) });
    const s1 = await createChessAIRegistry([illegal.source]).openOpponent('elo-300');
    expect(await codeOf(s1.requestMove(position()))).toBe('illegal-move');
    const junk = createMockProviderSource({ choose: () => ({ moveUci: 'castle' }) });
    const s2 = await createChessAIRegistry([junk.source]).openOpponent('elo-300');
    expect(await codeOf(s2.requestMove(position()))).toBe('engine-error');
    const nan = createMockProviderSource({ choose: () => ({ moveUci: 'e2e4', evaluationCp: Number.NaN }) });
    const s3 = await createChessAIRegistry([nan.source]).openOpponent('elo-300');
    expect(await codeOf(s3.requestMove(position()))).toBe('engine-error');
  });

  it('rejects a superseded request as stale and answers the new position', async () => {
    const { source, probe } = createMockProviderSource({ delayMs: 30 });
    const session = await createChessAIRegistry([source]).openOpponent('elo-300');
    const old = session.requestMove(position({ positionRevision: 1 }));
    const fresh = session.requestMove(position({ fen: AFTER_E4, legalMovesUci: ['e7e5', 'c7c5'], moveHistoryUci: ['e2e4'], positionRevision: 2 }));
    expect(await codeOf(old)).toBe('stale');
    expect((await fresh).moveUci).toBe('e7e5');
    expect(probe.requests[0].signal.aborted).toBe(true);
    expect(probe.cancelled).toBeGreaterThan(0);
  });

  it('cancels through the session and through the caller signal', async () => {
    const { source, probe } = createMockProviderSource({ delayMs: 1000 });
    const session = await createChessAIRegistry([source]).openOpponent('elo-300');
    const a = session.requestMove(position());
    session.cancel();
    expect(await codeOf(a)).toBe('aborted');
    const controller = new AbortController();
    const b = session.requestMove(position({ signal: controller.signal }));
    controller.abort();
    expect(await codeOf(b)).toBe('aborted');
    expect(probe.requests.every((r) => r.signal.aborted)).toBe(true);
  });

  it('times out an engine that never answers', async () => {
    const { source } = createMockProviderSource({ choose: () => new Promise(() => {}) });
    const session = await createChessAIRegistry([source], { graceMs: 20 }).openOpponent('elo-300');
    expect(await codeOf(session.requestMove(position({ thinkingTimeMs: 10 })))).toBe('timeout');
  });

  it('reports initialization and load failures, and falls back to the next provider', async () => {
    const broken = createMockProviderSource({ manifest: { id: 'broken', priority: 2 }, failInit: 'no WebAssembly' });
    expect(await codeOf(createChessAIRegistry([broken.source]).openOpponent('elo-300'))).toBe('init-failed');
    expect(broken.probe.disposed).toBe(1);
    const missing = createMockProviderSource({ manifest: { id: 'missing', priority: 1 }, failLoad: 'chunk 404' });
    const backup = createMockProviderSource({ manifest: { id: 'backup' } });
    const session = await createChessAIRegistry([broken.source, missing.source, backup.source]).openOpponent('elo-300');
    expect(session.provider.id).toBe('backup');
    await expect(createChessAIRegistry([broken.source]).openOpponent('elo-300')).rejects.toThrow(/no WebAssembly/);
  });

  it('refuses unavailable opponents and aborted opening', async () => {
    const { source, probe } = createMockProviderSource();
    const registry = createChessAIRegistry([source]);
    expect(await codeOf(registry.openOpponent('elo-3000'))).toBe('unavailable');
    expect(await codeOf(registry.openOpponent('nobody'))).toBe('unavailable');
    expect(await codeOf(registry.openAnalysis())).toBe('unavailable');
    const controller = new AbortController();
    controller.abort();
    expect(await codeOf(registry.openOpponent('elo-300', { signal: controller.signal }))).toBe('aborted');
    expect(probe.initialized).toBe(0);
  });

  it('disposes the provider once and refuses later requests', async () => {
    const { source, probe } = createMockProviderSource({ delayMs: 1000 });
    const session = await createChessAIRegistry([source]).openOpponent('elo-300');
    const pending = session.requestMove(position());
    session.dispose();
    session.dispose();
    expect(await codeOf(pending)).toBe('disposed');
    expect(await codeOf(session.requestMove(position()))).toBe('disposed');
    expect(probe.disposed).toBe(1);
  });

  it('analysis keeps only lines that start with a legal move', async () => {
    const { source, probe } = createMockProviderSource({
      manifest: { id: 'analyst', opponents: [] },
      analyze: () => ({ depth: 12, lines: [
        { pvUci: ['e2e4', 'e7e5'], evaluationCp: 35 },
        { pvUci: ['e2e5'], evaluationCp: 900 },
        { pvUci: ['d2d4'] },
        { pvUci: ['g1f3'], mateIn: -3 },
      ] }),
    });
    const registry = createChessAIRegistry([source]);
    expect(registry.analysisProvider()?.id).toBe('analyst');
    const session = await registry.openAnalysis();
    const result = await session.analyze({ ...position(), thinkingTimeMs: 100, multiPv: 9 });
    expect(result.lines.map((l) => l.pvUci[0])).toEqual(['e2e4', 'g1f3']);
    expect(probe.analysisRequests[0].multiPv).toBe(5);
  });
});
