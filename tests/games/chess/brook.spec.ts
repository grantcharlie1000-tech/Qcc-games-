import { test, expect } from '../../fixtures';
import { test as workerTest } from '@playwright/test';
import { Chess } from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import { prepareCustomModules } from '../../chess-ai/providers/browser/prepare';

let serverPreparation:Awaited<ReturnType<typeof prepareCustomModules>>;
test.beforeAll(async({baseURL})=>{
  test.setTimeout(180000);
  serverPreparation=await prepareCustomModules(baseURL!);
});

// This isolated page needs no app fixtures. Request routing disables HTTP cache
// and would turn cancellation recovery into repeated dev-module transfers.
workerTest('Brook cancels its actual worker and recovers inside its move allowance', async ({ page }, info) => {
  test.setTimeout(60000);
  await page.goto('/tests/chess-ai/providers/browser/custom.html', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const providerPath = '/src/chess-ai/providers/beginner/index.ts';
    const rulesPath = '/src/chess-ai/providers/beginner/vendor/chess.js';
    const importStarted=performance.now();
    const { createProvider } = await import(providerPath);
    const { Chess: Rules } = await import(rulesPath);
    const moduleImportMs=performance.now()-importStarted;
    const NativeWorker = window.Worker;
    let onSearchPosted: (() => void) | undefined;
    class ObservedWorker extends NativeWorker {
      override postMessage(message: unknown) {
        super.postMessage(message);
        if ((message as {type?: string}).type === 'search') onSearchPosted?.();
      }
    }
    window.Worker = ObservedWorker;
    const provider = createProvider(), chess = new Rules();
    const input = { fen: chess.fen(), startFen: chess.fen(), moveHistoryUci: [],
      legalMovesUci: chess.moves({ verbose: true }).map((move: { lan: string }) => move.lan),
      opponentId: 'elo-900', thinkingTimeMs: 500 };
    const errorCode = (error: unknown) => (error as { code?: string }).code;
    try {
      const initializeStarted = performance.now();
      await provider.initialize({ signal: new AbortController().signal, onProgress: () => {} });
      const initializeMs = performance.now() - initializeStarted;
      const controller = new AbortController();
      onSearchPosted = () => { onSearchPosted = undefined; controller.abort(); };
      const pending = provider.chooseMove({ ...input, positionRevision: 1, signal: controller.signal })
        .then(() => 'unexpected-move', errorCode);
      const cancelled = await pending;
      const recoveryStarted = performance.now();
      const recovered = await provider.chooseMove({ ...input, positionRevision: 2, signal: new AbortController().signal });
      const recoveryMs = performance.now() - recoveryStarted;
      const began = performance.now();
      const reply = await provider.chooseMove({ ...input, positionRevision: 3, signal: new AbortController().signal });
      const normalMs = performance.now() - began;
      const emergencyStart = performance.now();
      const emergency = await provider.chooseMove({ ...input, positionRevision: 4,
        clock: { remainingMs: 20, incrementMs: 0 }, signal: new AbortController().signal })
        .then((answer: { moveUci: string }) => input.legalMovesUci.includes(answer.moveUci) ? 'legal-move' : 'illegal-move', errorCode);
      return { cancelled, moduleImportMs, initializeMs, recoveryLegal: input.legalMovesUci.includes(recovered.moveUci), recoveryMs,
        legal: input.legalMovesUci.includes(reply.moveUci), normalMs,
        emergency, emergencyMs: performance.now() - emergencyStart };
    } finally { provider.dispose(); window.Worker = NativeWorker; }
  });
  await info.attach('real-worker-timing', { body: JSON.stringify({...result,serverPreparation}), contentType: 'application/json' });
  expect(result.cancelled).toBe('aborted');
  expect(result.recoveryLegal).toBe(true);
  expect(result.recoveryMs).toBeLessThan(750);
  expect(result.legal).toBe(true);
  expect(result.normalMs).toBeLessThan(250);
  expect(['legal-move', 'timeout']).toContain(result.emergency);
  expect(result.emergencyMs).toBeLessThan(250);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Brook uses its real worker at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    const errors: string[] = [], requests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('/#/game/chess');
    await page.getByRole('button', { name: /Computer/ }).click();
    const brook = page.locator('.ch-opp[data-value="elo-900"]');
    await expect(brook).toContainText('QCC Beginner');
    await brook.click();
    await page.getByRole('radio', { name: 'White', exact: true }).click();
    await page.screenshot({ path: `tests/games/chess/evidence/brook-setup-${viewport.width}.png` });
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    const cells = page.locator('.ch-moves .ch-mv');
    const game = new Chess();
    for (let turn = 0; turn < 6 && !game.isGameOver(); turn++) {
      const human = game.moves({ verbose: true }).sort((a,b) => Number(!!b.captured) - Number(!!a.captured))[0];
      await page.locator(`#ch-sq-${human.from}`).click();
      await page.locator(`#ch-sq-${human.to}`).click();
      if (human.promotion) await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: 'queen', exact: true }).click();
      game.move(human.lan);
      if (game.isGameOver()) break;
      await expect(cells).toHaveCount((turn + 1) * 2, { timeout: 10000 });
      const replySan = await cells.last().evaluate(element => element.childNodes[0].textContent || '');
      // chess.js independently verifies the move the actual worker played.
      game.move(replySan);
    }
    expect(requests.some(url => /engine\.worker/.test(url))).toBe(true);
    expect(requests.filter(url => /chess-engines\/(maia|stockfish)/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `tests/games/chess/evidence/brook-game-${viewport.width}.png` });
  });
}
