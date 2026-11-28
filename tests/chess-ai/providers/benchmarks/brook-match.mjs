/** Paired full games against the frozen, unmodified original Brook. */
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const folder = new URL('./hillclimb-900/', import.meta.url);
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const { computeMove: candidate } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
const { searchBudget } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/index.ts');
const { computeMove: original } = await server.ssrLoadModule('/tests/chess-ai/providers/benchmarks/hillclimb-900/baseline-engine.ts');
const games = [], times = { candidate: [], original: [] };
const openings = [[], ['e2e4','e7e5','g1f3','b8c6'], ['d2d4','d7d5','c2c4','e7e6'], ['e2e4','c7c5','g1f3','d7d6'], ['g1f3','d7d5','g2g3','g8f6']];
const sourceFiles = ['engine.ts','brook.ts','index.ts'].map(file => `src/chess-ai/providers/beginner/${file}`);
const sourceHash = async () => createHash('sha256').update(Buffer.concat(await Promise.all(sourceFiles.map(file => readFile(file))))).digest('hex');
const sourceSha256 = await sourceHash();
try {
  for (let index = 0; index < 20; index++) {
    const chess = new Chess(), history = [...openings[Math.floor(index/2) % openings.length]];
    for (const move of history) chess.move(move);
    const candidateColor = index % 2 ? 'b' : 'w';
    while (!chess.isGameOver() && history.length < 400) {
      const id = chess.turn() === candidateColor ? 'candidate' : 'original';
      const legal = chess.moves({ verbose: true }).map(move => move.lan);
      const tick = performance.now();
      const answer = (id === 'candidate' ? candidate : original)({ fen: chess.fen(), moveHistoryUci: history, legalMovesUci: legal, opponentId: 'elo-900', thinkingTimeMs: id === 'candidate' ? searchBudget('elo-900',500) : 75 }, (147331 + Math.floor(index/2)*65537 + history.length*8191) >>> 0);
      times[id].push(performance.now() - tick);
      if (!legal.includes(answer.moveUci)) throw new Error(`Illegal ${id} move`);
      chess.move(answer.moveUci); history.push(answer.moveUci);
    }
    const result = chess.isCheckmate() ? (chess.turn() !== candidateColor ? 'win' : 'loss') : chess.isDraw() ? 'draw' : 'unfinished';
    games.push({ index, candidateColor, result, plies: history.length, finalFen: chess.fen(), moves: history });
    console.log(`${index+1}/20: ${result}, ${history.length} plies`);
  }
  const summary = Object.fromEntries(['win','loss','draw','unfinished'].map(result => [result, games.filter(game => game.result === result).length]));
  summary.score = (summary.win + summary.draw*.5)/games.length;
  if (await sourceHash() !== sourceSha256) throw new Error('Source changed during match');
  const report = { generatedAt: new Date().toISOString(), sourceSha256, method: '20 full legal games, ten pairs with colors reversed, five openings repeated with different fixed seeds. Same normal 500ms move allowance, with shipped compute allocation (legacy 75ms, current searchBudget); excludes worker pacing. Rules-confirmed outcomes only, no resignation or material adjudication. Unfinished games remain unfinished. Improvement evidence, not a platform Elo measurement.', summary,
    timings: Object.fromEntries(Object.entries(times).map(([id, values]) => { const sorted = values.sort((a,b) => a-b); return [id, { count: sorted.length, p50Ms: sorted[Math.floor(sorted.length*.5)], p95Ms: sorted[Math.floor(sorted.length*.95)], maxMs: sorted.at(-1) }]; })), games };
  await writeFile(new URL('match.json', folder), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(summary));
  if (summary.unfinished) process.exitCode = 1;
} finally { await server.close(); }
