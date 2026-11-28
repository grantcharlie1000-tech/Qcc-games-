/** Repeated seeded probes, not a rating estimate. */
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const sourceSha256 = createHash('sha256').update(await readFile(new URL('../../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url))).digest('hex');
const { computeMove } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
const trials = Number(process.env.CALIBRATION_TRIALS || 100);
const budgetMs = Number(process.env.CALIBRATION_MS || 75);
const cases = [
  { name: 'mate-in-one', fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1', test: game => game.isCheckmate() },
  { name: 'capture-free-queen', fen: 'q5k1/8/8/8/8/8/8/R5K1 w - - 0 1', test: (_game, move) => move === 'a1a8' },
  { name: 'queen-promotion', fen: '7k/P7/6K1/8/8/8/8/8 w - - 0 1', test: (_game, move) => move === 'a7a8q' },
  { name: 'avoid-mate-in-one', fen: 'r5k1/5ppp/8/8/8/5R2/5PPP/6K1 w - - 0 1', test: game => {
    for (const reply of game.moves({ verbose: true })) { game.move(reply); const mates = game.isCheckmate(); game.undo(); if (mates) return false; }
    return true;
  } },
];
const results = [];
try {
  for (const opponentId of ['elo-300', 'elo-500', 'elo-700', 'elo-900']) {
    for (const probe of cases) {
      let successes = 0;
      let failures = 0;
      const choices = {};
      const times = [];
      for (let trial = 0; trial < trials; trial++) {
        const game = new Chess(probe.fen);
        const legalMovesUci = game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
        const tick = performance.now();
        try {
          const answer = computeMove({ fen: probe.fen, startFen: probe.fen, moveHistoryUci: [], legalMovesUci, opponentId, thinkingTimeMs: budgetMs }, 76543 + trial * 65537);
          times.push(performance.now() - tick);
          if (!legalMovesUci.includes(answer.moveUci)) throw new Error(`Illegal ${answer.moveUci}`);
          game.move({ from: answer.moveUci.slice(0, 2), to: answer.moveUci.slice(2, 4), ...(answer.moveUci[4] ? { promotion: answer.moveUci[4] } : {}) });
          successes += Number(probe.test(game, answer.moveUci));
          choices[answer.moveUci] = (choices[answer.moveUci] || 0) + 1;
        } catch { failures++; }
      }
      results.push({ opponentId, probe: probe.name, fen: probe.fen, trials, successes, failures, successFraction: successes / trials, meanMs: times.reduce((a, b) => a + b, 0) / times.length, choices });
    }
  }
  const report = { generatedAt: new Date().toISOString(), sourceSha256, budgetMs, trials, results, note: 'Hand-authored elementary probes repeated with paired random seeds. Success fractions show behavior on these positions only, not general accuracy or calibrated Elo.' };
  await writeFile(new URL('./tactics-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await server.close(); }
