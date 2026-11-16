import { CHESS_AI_OPPONENTS, createChessAIRegistry, getChessAIRegistry, type ChessAIRegistry } from '../../chess-ai';

/**
 * The registry the game uses. Development builds can opt into the test-only
 * mock engine (localStorage "qcc:chess:mock-ai" = "1") so integration tests can
 * play without real engines. Production builds drop this branch entirely.
 */
export async function chessRegistry(): Promise<ChessAIRegistry> {
  if (import.meta.env.DEV) {
    let mock = false;
    try { mock = localStorage.getItem('qcc:chess:mock-ai') === '1'; } catch { /* storage blocked */ }
    if (mock) {
      const { createMockProviderSource } = await import('../../chess-ai/testing/mock-provider');
      const { source } = createMockProviderSource({
        manifest: { id: 'test-mock', name: 'Test engine', opponents: CHESS_AI_OPPONENTS.map((o) => o.id) },
        delayMs: 150,
        // Prefer captures so test games end, otherwise the first legal move.
        choose: (r) => ({ moveUci: r.legalMovesUci.find((m) => m.endsWith('q')) ?? r.legalMovesUci[0] }),
        analyze: (r) => ({ depth: 1, lines: r.legalMovesUci.length ? [{ pvUci: [r.legalMovesUci[0]], evaluationCp: 0 }] : [] }),
      });
      return createChessAIRegistry([source]);
    }
  }
  return getChessAIRegistry();
}
