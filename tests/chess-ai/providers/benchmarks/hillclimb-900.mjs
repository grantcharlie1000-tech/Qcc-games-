/** Fixed paired-position strength benchmark. Run before and after each change. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir, cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const label = process.argv[2];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Supply a report label.');
const split = process.argv[3] || 'tuning';
if (!['tuning', 'validation'].includes(split)) throw new Error('Invalid split');
const folder = new URL('./hillclimb-900/', import.meta.url);
const corpusName = process.argv[4] || 'human-900.json';
if (!/^[a-z0-9-]+\.json$/.test(corpusName)) throw new Error('Invalid corpus file');
const corpusBytes = await readFile(new URL(corpusName, folder));
const corpus = JSON.parse(corpusBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = [label.startsWith('baseline') ? 'tests/chess-ai/providers/benchmarks/hillclimb-900/baseline-engine.ts' : 'src/chess-ai/providers/beginner/engine.ts'];
if (!label.startsWith('baseline')) paths.push('src/chess-ai/providers/beginner/brook.ts', 'src/chess-ai/providers/beginner/index.ts');
// Include separate engine modules if later rounds introduce one.
const source = await Promise.all(paths.map(path => readFile(path)));
const sourceSha256 = hash(Buffer.concat(source));
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const { computeMove } = await server.ssrLoadModule(`/${paths[0]}`);
const { searchBudget } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/index.ts');
const workerBudgetMs = label.startsWith('baseline') ? 75 : searchBudget('elo-900', 500);
const directory = await mkdtemp(join(tmpdir(), 'qcc-900-'));
const assets = new URL('../../../../public/chess-engines/stockfish/', import.meta.url);
const oracle = { name: 'Stockfish 19 Lite', depth: 10, hashMiB: 16, threads: 1,
  jsSha256: hash(await readFile(new URL('stockfish-19-lite-single.js', assets))),
  wasmSha256: hash(await readFile(new URL('stockfish-19-lite-single.wasm', assets))) };
await copyFile(new URL('stockfish-19-lite-single.js', assets), join(directory, 'engine.cjs'));
await copyFile(new URL('stockfish-19-lite-single.wasm', assets), join(directory, 'engine.wasm'));
const engine = spawn(process.execPath, [join(directory, 'engine.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '', pending, stderr = '';
engine.stdout.on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\n')) {
    const end = buffer.indexOf('\n'), line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
    if (!pending) continue;
    pending.lines.push(line);
    if (pending.until(line)) { const done = pending; pending = undefined; clearTimeout(done.timer); done.resolve(done.lines); }
  }
});
engine.stderr.on('data', chunk => { stderr += chunk; });
const fail = error => { if (pending) { clearTimeout(pending.timer); pending.reject(error); pending = undefined; } };
engine.on('error', fail); engine.on('exit', code => fail(new Error(`Stockfish exited ${code}: ${stderr}`)));
const send = text => engine.stdin.write(text + '\n');
const command = (text, until) => new Promise((resolve, reject) => {
  if (pending) throw new Error('Overlapping UCI commands');
  pending = { lines: [], until, resolve, reject, timer: setTimeout(() => fail(new Error(`UCI timeout: ${text}: ${stderr}`)), 30000) };
  send(text);
});
let cache;
try { cache = JSON.parse(await readFile(new URL('scores.json', folder))); } catch { cache = {}; }
const evaluate = async (fen, move) => {
  const key = `${fen}|${move || '*'}|depth10`;
  if (cache[key]) return cache[key];
  send('ucinewgame'); await command('isready', line => line === 'readyok');
  send(`position fen ${fen}`);
  const lines = await command(`go depth 10${move ? ` searchmoves ${move}` : ''}`, line => line.startsWith('bestmove '));
  const last = lines.filter(line => / score (cp|mate) -?\d+/.test(line) && !/ (upperbound|lowerbound)/.test(line)).at(-1);
  if (!last) throw new Error(`No evaluation: ${lines.join('\n')}`);
  const [, kind, value] = last.match(/ score (cp|mate) (-?\d+)/);
  return cache[key] = { kind, value: Number(value), depth: Number(last.match(/ depth (\d+)/)?.[1]), bestmove: lines.at(-1).split(' ')[1] };
};
const score = evaluation => evaluation.kind === 'mate' ? Math.sign(evaluation.value) * 10000 : evaluation.value;
const loss = (best, chosen) => Math.min(1000, Math.max(0, score(best) - score(chosen)));
const mean = xs => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const timing = xs => { const sorted = [...xs].sort((a,b) => a-b); return { moves: xs.length, p50Ms: sorted[Math.floor(xs.length*.5)], p95Ms: sorted[Math.floor(xs.length*.95)], maxMs: sorted.at(-1) }; };
const started = performance.now(), rows = [], times = [];
try {
  await command('uci', line => line === 'uciok');
  for (const setting of ['Hash value 16','Threads value 1','MultiPV value 1','Skill Level value 20','UCI_LimitStrength value false']) send(`setoption name ${setting}`);
  await command('isready', line => line === 'readyok');
  const positions = corpus.positions.filter(position => position.split === split);
  for (const position of positions) {
    const chess = new Chess(position.fen), legal = chess.moves({ verbose: true }).map(move => move.lan);
    if (!legal.includes(position.humanMove)) throw new Error(`Bad corpus move: ${position.id}`);
    const best = await evaluate(position.fen);
    const human = await evaluate(position.fen, position.humanMove);
    const moves = [];
    for (let trial = 0; trial < 8; trial++) {
      const tick = performance.now();
      const result = computeMove({ fen: position.fen, moveHistoryUci: position.history, legalMovesUci: legal, opponentId: 'elo-900', thinkingTimeMs: workerBudgetMs }, 987123 + trial * 65537);
      times.push(performance.now() - tick);
      if (!legal.includes(result.moveUci)) throw new Error(`Illegal move: ${position.id} ${result.moveUci}`);
      const chosen = await evaluate(position.fen, result.moveUci);
      moves.push({ seed: 987123 + trial * 65537, move: result.moveUci, evaluation: chosen, loss: loss(best, chosen), nodes: result.nodes, depth: result.depth });
    }
    rows.push({ ...position, best, human, humanLoss: loss(best, human), botLoss: mean(moves.map(move => move.loss)), moves });
    if (rows.length % 16 === 0) { console.log(`${label}: ${rows.length}/${positions.length} positions`); await writeFile(new URL('scores.json', folder), JSON.stringify(cache)); }
  }
  const summary = Object.fromEntries([split].map(split => {
    const selected = rows.filter(row => row.split === split);
    const humanLoss = mean(selected.map(row => row.humanLoss)), botLoss = mean(selected.map(row => row.botLoss));
    return [split, { positions: selected.length, humanMeanCappedCpLoss: humanLoss, botMeanCappedCpLoss: botLoss, ratio: botLoss / humanLoss,
      humanBlunderFraction: mean(selected.map(row => Number(row.humanLoss >= 200))), botBlunderFraction: mean(selected.flatMap(row => row.moves.map(move => Number(move.loss >= 200)))) }];
  }));
  const afterHash = hash(Buffer.concat(await Promise.all(paths.map(path => readFile(path)))));
  if (afterHash !== sourceSha256) throw new Error('Engine changed during benchmark');
  const report = { generatedAt: new Date().toISOString(), label, sourceSha256, corpusSha256: hash(corpusBytes), oracle,
    method: 'Paired same-position comparison with actual Chess.com rapid 800-1000 human moves. Eight fixed bot seeds, normal 500ms move allowance with the shipped worker compute allocation (legacy 75ms, current searchBudget), Stockfish 19 Lite depth 10 independent unrestricted/forced root searches, cleared hash each search. Loss capped at 1000cp including mate transitions. Games split before tuning. This measures move quality on this corpus, not a competitive platform rating. No skipped positions or failures.',
    moveAllowanceMs: 500, workerBudgetMs,
    environment: { node: process.version, cpu: cpus()[0].model, logicalCpus: cpus().length, loadavg: loadavg() }, elapsedMs: performance.now() - started, failures: 0,
    summary, timing: timing(times), rows };
  await writeFile(new URL(`${label}.json`, folder), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary, timing: report.timing }, null, 2));
} finally {
  await writeFile(new URL('scores.json', folder), JSON.stringify(cache));
  fail(new Error('Benchmark stopped')); engine.kill(); await server.close();
  await rm(directory, { recursive: true, force: true });
}
