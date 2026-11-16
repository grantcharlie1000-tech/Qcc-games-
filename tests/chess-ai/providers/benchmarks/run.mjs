/** Offline, deterministic-seed calibration. No browser pacing is included. */
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const config = {
  gamesPerPair: Number(process.env.CALIBRATION_GAMES || 40),
  thinkingTimeMs: Number(process.env.CALIBRATION_MS || 75),
  maxPlies: Number(process.env.CALIBRATION_PLIES || 400),
  baseSeed: Number(process.env.CALIBRATION_SEED || 147331),
};
if (!Number.isInteger(config.gamesPerPair) || config.gamesPerPair < 2 || config.gamesPerPair % 2) throw new Error('CALIBRATION_GAMES must be positive and even');
if (!Number.isFinite(config.thinkingTimeMs) || config.thinkingTimeMs <= 0 || !Number.isInteger(config.maxPlies) || config.maxPlies < 20) throw new Error('Invalid calibration search budget or ply cap');
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const sourceSha256 = createHash('sha256').update(await readFile(new URL('../../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url))).digest('hex');
const { computeMove } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
const pairs = process.env.CALIBRATION_PAIRS ? process.env.CALIBRATION_PAIRS.split(',').map(pair => pair.split(':').map(id => `elo-${id}`)) : [['elo-300', 'elo-500'], ['elo-500', 'elo-700'], ['elo-700', 'elo-900']];
const openings = [[], ['e2e4', 'e7e5'], ['d2d4', 'd7d5'], ['c2c4', 'e7e5'], ['g1f3', 'd7d5']];
const uci = move => move.from + move.to + (move.promotion || '');
const apply = (game, move) => game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] ?? 0;
const memoryBefore = process.memoryUsage();
const cpuBefore = process.cpuUsage();
const started = performance.now();
const timings = Object.fromEntries(['elo-300', 'elo-500', 'elo-700', 'elo-900'].map(id => [id, []]));
const firstChoices = Object.fromEntries(Object.keys(timings).map(id => [id, {}]));
const completed = [];
const results = [];
try {
  for (const [weaker, stronger] of pairs) {
    const games = [];
    for (let index = 0; index < config.gamesPerPair; index++) {
      const game = new Chess();
      const history = [];
      const pairIndex = Math.floor(index / 2);
      for (const move of openings[pairIndex % openings.length]) { apply(game, move); history.push(move); }
      const white = index % 2 ? stronger : weaker;
      const black = index % 2 ? weaker : stronger;
      let failure;
      let nodes = 0;
      for (let ply = history.length; ply < config.maxPlies && !game.isGameOver(); ply++) {
        const id = game.turn() === 'w' ? white : black;
        const legalMovesUci = game.moves({ verbose: true }).map(uci);
        const tick = performance.now();
        try {
          const answer = computeMove({ fen: game.fen(), startFen: new Chess().fen(), moveHistoryUci: history, legalMovesUci, opponentId: id, thinkingTimeMs: config.thinkingTimeMs }, (config.baseSeed + pairIndex * 65537 + ply * 8191) >>> 0);
          timings[id].push(performance.now() - tick);
          nodes += answer.nodes || 0;
          if (!legalMovesUci.includes(answer.moveUci)) throw new Error(`Illegal answer ${answer.moveUci}`);
          if (ply < 6) firstChoices[id][answer.moveUci] = (firstChoices[id][answer.moveUci] || 0) + 1;
          apply(game, answer.moveUci);
          history.push(answer.moveUci);
        } catch (error) { failure = String(error); break; }
      }
      let result = 'unfinished';
      if (failure) result = 'failure';
      else if (game.isCheckmate()) result = game.turn() === 'w' ? 'black' : 'white';
      else if (game.isDraw()) result = 'draw';
      const winner = result === 'white' ? white : result === 'black' ? black : undefined;
      const record = { index, white, black, result, ...(winner ? { winner } : {}), plies: history.length, nodes, finalFen: game.fen(), ...(failure ? { failure } : {}), moves: history };
      games.push(record);
      process.stdout.write(`${weaker}/${stronger} ${index + 1}/${config.gamesPerPair}: ${result}${winner ? ` ${winner}` : ''} (${history.length} plies)\n`);
    }
    const wins = games.filter(g => g.winner === stronger).length;
    const losses = games.filter(g => g.winner === weaker).length;
    const draws = games.filter(g => g.result === 'draw').length;
    const failures = games.filter(g => g.result === 'failure').length;
    const unfinished = games.filter(g => g.result === 'unfinished').length;
    const finished = wins + losses + draws;
    const score = finished ? (wins + draws / 2) / finished : null;
    // Wilson interval treats half-point draws as fractional successes; descriptive only.
    const z = 1.96;
    const denominator = 1 + z * z / Math.max(1, finished);
    const center = score === null ? null : (score + z * z / (2 * finished)) / denominator;
    const half = score === null ? null : z * Math.sqrt(score * (1 - score) / finished + z * z / (4 * finished * finished)) / denominator;
    results.push({ weaker, stronger, wins, losses, draws, unfinished, failures, finished, score, approximate95PercentScoreInterval: center === null ? null : [center - half, center + half], allGamesScoreBounds: [(wins + draws / 2) / games.length, (wins + draws / 2 + unfinished) / games.length], meanPlies: games.reduce((a, g) => a + g.plies, 0) / games.length });
    completed.push(...games);
  }
  const elapsedMs = performance.now() - started;
  const cpu = process.cpuUsage(cpuBefore);
  const report = {
    generatedAt: new Date().toISOString(), sourceSha256, config,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()} ${os.arch()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    timingPolicy: 'Single-thread serial Node core search; excludes browser Worker startup and human pacing. Seed is paired by opening, color and ply. Search budget is a wall-clock ceiling, so exact game sequences may vary with host contention.',
    elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000,
    rssBeforeBytes: memoryBefore.rss, rssAfterBytes: process.memoryUsage().rss,
    timing: Object.fromEntries(Object.entries(timings).map(([id, times]) => [id, { moves: times.length, meanMs: times.reduce((a, b) => a + b, 0) / times.length, p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), maxMs: Math.max(...times) }])),
    openingMoveChoices: firstChoices, pairs: results, games: completed,
  };
  await writeFile(new URL(`./${process.env.CALIBRATION_REPORT || 'results.json'}`, import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ elapsedMs, pairs: results, timing: report.timing }, null, 2));
} finally { await server.close(); }
