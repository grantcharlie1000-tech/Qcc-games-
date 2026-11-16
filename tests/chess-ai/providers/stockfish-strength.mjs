/** Genuine bundled Stockfish WASM versus the normal calibrated beginner core.
 * Run: node tests/chess-ai/providers/stockfish-strength.mjs
 * No provider mocks, arbitrary position adjudication or test-only weakening.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, release, platform, arch } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { Chess } from '../../../src/chess-ai/providers/beginner/vendor/chess.js';

const config = {
  games: Number(process.env.STOCKFISH_STRENGTH_GAMES || 6),
  customBudgetMs: 75,
  stockfishBudgetMs: 50,
  maxPlies: 300,
  baseSeed: 147331,
  hashMiB: 16,
  threads: 1,
  customOpponent: 'elo-900',
  stockfishStrengthLimited: false,
  stockfishSkillLevel: 20,
  depthLimit: null,
  nodeLimit: null,
};
if (!Number.isInteger(config.games) || config.games < 6 || config.games % 2) throw new Error('Use an even STOCKFISH_STRENGTH_GAMES value, at least six.');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const corePath = new URL('../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url);
const asset = new URL('../../../public/chess-engines/stockfish/', import.meta.url);
const sourceSha256 = sha256(await readFile(corePath));
const stockfishJsSha256 = sha256(await readFile(new URL('stockfish-19-lite-single.js', asset)));
const stockfishWasmSha256 = sha256(await readFile(new URL('stockfish-19-lite-single.wasm', asset)));
const rulesSha256 = sha256(await readFile(new URL('../../../src/chess-ai/providers/beginner/vendor/chess.js', import.meta.url)));
const directory = await mkdtemp(join(tmpdir(), 'qcc-strength-'));
await copyFile(new URL('stockfish-19-lite-single.js', asset), join(directory, 'engine.cjs'));
await copyFile(new URL('stockfish-19-lite-single.wasm', asset), join(directory, 'engine.wasm'));
const engine = spawn(process.execPath, [join(directory, 'engine.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let pending;
let stderr = '';
engine.stderr.on('data', (chunk) => { stderr += String(chunk); });
engine.stdout.on('data', (chunk) => {
  buffer += String(chunk);
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n');
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!pending) continue;
    pending.lines.push(line);
    if (pending.until(line)) {
      const done = pending;
      pending = undefined;
      clearTimeout(done.timer);
      done.resolve(done.lines);
    }
  }
});
engine.on('error', (error) => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined; } });
engine.on('exit', (code) => { if (pending) { clearTimeout(pending.timer); pending.reject(new Error(`Stockfish exited ${code}: ${stderr}`)); pending = undefined; } });
function command(text, until) {
  if (pending) throw new Error('Overlapping UCI commands');
  return new Promise((resolve, reject) => {
    pending = { lines: [], resolve, reject, until,
      timer: setTimeout(() => { pending = undefined; reject(new Error(`UCI timeout: ${text}: ${stderr}`)); }, 30_000) };
    engine.stdin.write(text + '\n');
  });
}
const send = (text) => engine.stdin.write(text + '\n');
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const apply = (game, move) => game.move({ from: move.slice(0, 2), to: move.slice(2, 4), ...(move[4] ? { promotion: move[4] } : {}) });
const openingLines = [[], ['e2e4', 'e7e5', 'g1f3', 'b8c6'], ['d2d4', 'd7d5', 'c2c4', 'e7e6']];
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * p)] ?? null;
const timing = (times) => ({ moves: times.length, meanMs: times.reduce((a, b) => a + b, 0) / Math.max(1, times.length), p50Ms: percentile(times, .5), p95Ms: percentile(times, .95), maxMs: Math.max(0, ...times) });
async function engineRss() {
  try { return Number((await readFile(`/proc/${engine.pid}/status`, 'utf8')).match(/^VmRSS:\s+(\d+)/m)?.[1]) * 1024 || null; }
  catch { return null; }
}
const stockfishTimes = [];
const customTimes = [];
const games = [];
const started = performance.now();
const cpuStarted = process.cpuUsage();
const rssBefore = process.memoryUsage().rss;
let enginePeakRss = 0;
let handshake;
try {
  const { computeMove } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
  handshake = await command('uci', (line) => line === 'uciok');
  for (const setting of ['setoption name Hash value 16', 'setoption name Threads value 1', 'setoption name Ponder value false', 'setoption name MultiPV value 1', 'setoption name UCI_LimitStrength value false', 'setoption name Skill Level value 20']) send(setting);
  await command('isready', (line) => line === 'readyok');
  for (let index = 0; index < config.games; index++) {
    const game = new Chess();
    const pairIndex = Math.floor(index / 2);
    const opening = openingLines[pairIndex % openingLines.length];
    const history = [];
    for (const move of opening) { apply(game, move); history.push(move); }
    const stockfishColor = index % 2 ? 'b' : 'w';
    const white = stockfishColor === 'w' ? 'stockfish-max' : config.customOpponent;
    const black = stockfishColor === 'b' ? 'stockfish-max' : config.customOpponent;
    send('ucinewgame');
    await command('isready', (line) => line === 'readyok');
    const gameStarted = performance.now();
    const moveMetrics = [];
    let failure;
    try {
      while (!game.isGameOver() && history.length < config.maxPlies) {
        const ply = history.length;
        const legalMovesUci = game.moves({ verbose: true }).map((move) => move.lan);
        let moveUci;
        const tick = performance.now();
        if (game.turn() === stockfishColor) {
          send(`position fen ${new Chess().fen()}${history.length ? ` moves ${history.join(' ')}` : ''}`);
          const output = await command(`go movetime ${config.stockfishBudgetMs}`, (line) => line.startsWith('bestmove '));
          moveUci = output.at(-1).split(' ')[1];
          const elapsedMs = performance.now() - tick;
          stockfishTimes.push(elapsedMs);
          const lastInfo = output.filter((line) => line.startsWith('info depth ')).at(-1);
          moveMetrics.push({ ply, engine: 'stockfish-max', moveUci, elapsedMs,
            depth: Number(lastInfo?.match(/\bdepth (\d+)/)?.[1]) || null,
            nodes: Number(lastInfo?.match(/\bnodes (\d+)/)?.[1]) || null });
          enginePeakRss = Math.max(enginePeakRss, await engineRss() || 0);
        } else {
          const seed = (config.baseSeed + pairIndex * 65537 + ply * 8191) >>> 0;
          const answer = computeMove({ fen: game.fen(), startFen: new Chess().fen(), moveHistoryUci: history,
            legalMovesUci, opponentId: config.customOpponent, thinkingTimeMs: config.customBudgetMs }, seed);
          moveUci = answer.moveUci;
          const elapsedMs = performance.now() - tick;
          customTimes.push(elapsedMs);
          moveMetrics.push({ ply, engine: config.customOpponent, moveUci, elapsedMs, nodes: answer.nodes, seed });
        }
        if (!legalMovesUci.includes(moveUci)) throw new Error(`Illegal move from ${game.turn() === stockfishColor ? 'Stockfish' : 'custom'}: ${moveUci}`);
        apply(game, moveUci);
        history.push(moveUci);
      }
    } catch (error) { failure = String(error); }
    const result = failure ? 'failure' : game.isCheckmate() ? (game.turn() === 'w' ? 'black' : 'white') : game.isDraw() ? 'draw' : 'unfinished';
    const winner = result === 'white' ? white : result === 'black' ? black : undefined;
    games.push({ index, opening, white, black, result, ...(winner ? { winner } : {}), ...(failure ? { failure } : {}),
      elapsedMs: performance.now() - gameStarted, plies: history.length, finalFen: game.fen(), moves: history, moveMetrics });
    console.log(`${index + 1}/${config.games}: ${result}${winner ? ` ${winner}` : ''}, ${history.length} plies`);
  }
  const wins = games.filter((game) => game.winner === 'stockfish-max').length;
  const losses = games.filter((game) => game.winner === config.customOpponent).length;
  const draws = games.filter((game) => game.result === 'draw').length;
  const failures = games.filter((game) => game.result === 'failure').length;
  const unfinished = games.filter((game) => game.result === 'unfinished').length;
  const finished = wins + draws + losses;
  const score = finished ? (wins + draws / 2) / finished : null;
  const z = 1.96;
  const denominator = 1 + z * z / Math.max(1, finished);
  const center = score === null ? null : (score + z * z / (2 * finished)) / denominator;
  const half = score === null ? null : z * Math.sqrt(score * (1 - score) / finished + z * z / (4 * finished * finished)) / denominator;
  const sourceSha256After = sha256(await readFile(corePath));
  const cpuUsed = process.cpuUsage(cpuStarted);
  const report = {
    generatedAt: new Date().toISOString(), sourceSha256, sourceSha256After, sourceUnchanged: sourceSha256 === sourceSha256After,
    rulesSha256, stockfishJsSha256, stockfishWasmSha256, config,
    engine: 'Stockfish 19 Lite WASM, stockfish.js19.0.1 unmodified bundled binary, child Node process',
    handshake,
    environment: { node: process.version, platform: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model, logicalCpus: cpus().length },
    method: 'Serial full legal games from three paired opening lines, colors reversed. Ordinary custom75ms core search versus genuine unrestricted Stockfish50ms movetime; no pacing or browser overhead. Shared fixed seeds; time-based cutoff makes sequences machine-load dependent. Draws use chess.js rules only. Unfinished caps are reported, never adjudicated as wins. Six games detect gross strength inversion, not online Elo equivalence; the score interval is approximate Wilson, and opening-paired games are correlated.',
    summary: { wins, losses, draws, failures, unfinished, finished, stockfishScore: score,
      approximate95PercentScoreInterval: center === null ? null : [center - half, center + half] },
    elapsedMs: performance.now() - started,
    nodeParentCpuMs: (cpuUsed.user + cpuUsed.system) / 1000,
    nodeParentCpuCaveat: 'Includes custom core/rules/Vite but excludes child Stockfish CPU.',
    rssBeforeBytes: rssBefore, rssAfterBytes: process.memoryUsage().rss,
    stockfishPeakSampledRssBytes: enginePeakRss || null,
    memoryCaveat: 'Sampled Linux child-process RSS after each Stockfish move, not total browser memory or allocated WASM capacity.',
    timing: { stockfish: timing(stockfishTimes), custom: timing(customTimes) }, games,
  };
  await writeFile(new URL('./stockfish-strength-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary: report.summary, timing: report.timing, sourceSha256, sourceUnchanged: report.sourceUnchanged }, null, 2));
  if (!report.sourceUnchanged || failures || unfinished || wins < 5) process.exitCode = 1;
} finally {
  if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Benchmark stopped.')); pending = undefined; }
  engine.kill();
  await server.close();
  await rm(directory, { recursive: true, force: true });
}
