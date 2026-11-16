import { expect, test } from '@playwright/test';

test('real Stockfish WASM starts, searches, cancels, restarts and analyzes', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const moduleUrl = '/src/chess-ai/providers/stockfish/index.ts';
    const { createProvider } = await import(moduleUrl) as typeof import('../../../src/chess-ai/providers/stockfish/index');
    const provider = createProvider();
    const controller = new AbortController();
    const phases: string[] = [];
    const started = performance.now();
    await provider.initialize({ signal: controller.signal, onProgress: (p) => phases.push(p.phase) });
    const loadMs = performance.now() - started;
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const legalMovesUci = ['a2a3','a2a4','b2b3','b2b4','c2c3','c2c4','d2d3','d2d4','e2e3','e2e4','f2f3','f2f4','g2g3','g2g4','h2h3','h2h4','b1a3','b1c3','g1f3','g1h3'];
    const request = { fen, startFen: fen, moveHistoryUci: [], legalMovesUci, positionRevision: 1,
      thinkingTimeMs: 120, opponentId: 'max', signal: controller.signal };
    const before = performance.now();
    const move = await provider.chooseMove(request);
    const thinkMs = performance.now() - before;
    const cancelled = provider.chooseMove({ ...request, thinkingTimeMs: 10_000 }).then(() => 'answered', () => 'aborted');
    setTimeout(() => provider.cancel(), 30);
    const cancelResult = await cancelled;
    const restarted = await provider.chooseMove(request);
    const analysis = await provider.analyze!({ ...request, multiPv: 2, thinkingTimeMs: 200 });
    provider.dispose();
    provider.dispose();
    const afterDispose = await provider.chooseMove(request).then(() => 'answered', () => 'rejected');
    return { loadMs, thinkMs, phases, move, restarted, analysis, cancelResult, afterDispose, legalMovesUci };
  });
  expect(result.legalMovesUci).toContain(result.move.moveUci);
  expect(result.legalMovesUci).toContain(result.restarted.moveUci);
  expect(result.phases).toContain('download');
  expect(result.phases).toContain('warmup');
  expect(result.cancelResult).toBe('aborted');
  expect(result.afterDispose).toBe('rejected');
  expect(result.analysis.depth).toBeGreaterThan(0);
  expect(result.analysis.lines).toHaveLength(2);
  for (const line of result.analysis.lines) expect(result.legalMovesUci).toContain(line.pvUci[0]);
  console.log(JSON.stringify({ stockfish: { loadMs: result.loadMs, thinkMs: result.thinkMs, depth: result.analysis.depth } }));
});

test('missing Stockfish WASM rejects initialization', async ({ page }) => {
  await page.route('**/chess-engines/stockfish/*.wasm', (route) => route.abort());
  await page.goto('/');
  const failed = await page.evaluate(async () => {
    const moduleUrl = '/src/chess-ai/providers/stockfish/index.ts';
    const { createProvider } = await import(moduleUrl) as typeof import('../../../src/chess-ai/providers/stockfish/index');
    const provider = createProvider();
    try { await provider.initialize({ signal: new AbortController().signal, onProgress() {} }); return false; }
    catch { return true; }
    finally { provider.dispose(); }
  });
  expect(failed).toBe(true);
});
