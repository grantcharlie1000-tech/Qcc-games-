/** Fixed paired-position strength benchmark. Run before and after each change. */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, readdir, rm, writeFile, open, rename, unlink } from 'node:fs/promises';
import { tmpdir, cpus, loadavg } from 'node:os';
import { join } from 'node:path';
import {build,version as esbuildVersion} from 'esbuild';
import {pathToFileURL} from 'node:url';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const tier = Number(process.argv[2]);
if (![300,500,700,900].includes(tier)) throw Error('Invalid tier');
const label = process.argv[3];
if (!label || !/^[a-z0-9-]+$/.test(label)) throw new Error('Supply a report label.');
const split = process.argv[4] || 'tuning';
if (!['tuning', 'validation'].includes(split)) throw new Error('Invalid split');
const trials=Number(process.argv[6]||4);
if(![4,8].includes(trials))throw Error('Use four standard seeds or eight historical900regression seeds');
const folder = new URL('./hillclimb-tiers/', import.meta.url);
const lockPath=new URL('oracle.lock',folder);
const cleanup=[];
try {
const lock=await open(lockPath,'wx');
cleanup.unshift(async()=>{try{await lock.close();}finally{await unlink(lockPath);}});
await lock.writeFile(String(process.pid));
const corpusName = process.argv[5] || `human-${tier}.json`;
if (!/^[a-z0-9-]+\.json$/.test(corpusName)) throw new Error('Invalid corpus file');
const corpusBytes = await readFile(new URL(corpusName, folder));
const corpus = JSON.parse(corpusBytes);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const benchmarkSha256=hash(await readFile(new URL(import.meta.url)));
const paths = [label.startsWith('baseline') ? 'tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/engine.ts' : 'src/chess-ai/providers/beginner/engine.ts'];
const moduleRoot = label.startsWith('baseline') ? 'tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/' : 'src/chess-ai/providers/beginner/';
for (const name of (await readdir(moduleRoot)).filter(name=>name.endsWith('.ts') && name!=='engine.ts').sort()) paths.push(moduleRoot+name);
paths.push(moduleRoot+'vendor/chess.js');
// Include separate engine modules if later rounds introduce one.
const source = await Promise.all(paths.map(path => readFile(path)));
const sourceSha256 = hash(Buffer.concat(source));
const directory = await mkdtemp(join(tmpdir(), 'qcc-900-'));
cleanup.unshift(()=>rm(directory,{recursive:true,force:true}));
const compiled=await build({stdin:{contents:`export {computeMove} from './${paths[0]}';export {searchBudget} from './${moduleRoot}index.ts';`,resolveDir:process.cwd(),sourcefile:'calibration-entry.ts'},bundle:true,format:'esm',platform:'node',target:'node24',write:false,minify:false,treeShaking:false});
const modulePath=join(directory,'model.mjs');
await writeFile(modulePath,compiled.outputFiles[0].contents);
const loader={name:'esbuild',version:esbuildVersion,bundle:true,minify:false,treeShaking:false,sha256:hash(compiled.outputFiles[0].contents)};
const {computeMove,searchBudget}=await import(pathToFileURL(modulePath).href);
const moveAllowanceMs = tier<=500 ? 400 : 500;
const workerBudgetMs = searchBudget(`elo-${tier}`, moveAllowanceMs);
const assets = new URL('../../../../public/chess-engines/stockfish/', import.meta.url);
const oracle = { name: 'Stockfish 19 Lite', depth: 10, hashMiB: 16, threads: 1,
  jsSha256: hash(await readFile(new URL('stockfish-19-lite-single.js', assets))),
  wasmSha256: hash(await readFile(new URL('stockfish-19-lite-single.wasm', assets))) };
await copyFile(new URL('stockfish-19-lite-single.js', assets), join(directory, 'engine.cjs'));
await copyFile(new URL('stockfish-19-lite-single.wasm', assets), join(directory, 'engine.wasm'));
const engine = spawn(process.execPath, [join(directory, 'engine.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
const engineClosed=new Promise(resolve=>engine.once('close',resolve));
cleanup.unshift(async()=>{engine.kill();await engineClosed;});
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
try { cache = JSON.parse(await readFile(new URL('scores.json', folder))); } catch(error) { if(error.code!=='ENOENT')throw error; cache=JSON.parse(await readFile(new URL('./hillclimb-900/scores.json',import.meta.url))); }
const saveCache=async()=>{
  const temporary=new URL(`scores-${process.pid}.tmp`,folder);
  await writeFile(temporary,JSON.stringify(cache));
  await rename(temporary,new URL('scores.json',folder));
};
cleanup.unshift(()=>saveCache());
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
  await command('uci', line => line === 'uciok');
  for (const setting of ['Hash value 16','Threads value 1','MultiPV value 1','Skill Level value 20','UCI_LimitStrength value false']) send(`setoption name ${setting}`);
  await command('isready', line => line === 'readyok');
  const positions = corpus.positions.filter(position => position.split === split);
  for (const position of positions) {
    const chess = new Chess(position.fen), legal = chess.moves({ verbose: true }).map(move => move.lan);
    if (!legal.includes(position.humanMove)) throw new Error(`Bad corpus move: ${position.id}`);
    const unrestrictedBest = await evaluate(position.fen);
    // Compare every move with a forced search of the preferred root too. An
    // unrestricted selective search can miss a forced mate that appears when
    // that same root is searched alone. The preferred move must cost zero.
    const best = await evaluate(position.fen, unrestrictedBest.bestmove);
    const human = await evaluate(position.fen, position.humanMove);
    const moves = [];
    for (let trial = 0; trial < trials; trial++) {
      const tick = performance.now();
      const result = computeMove({ fen: position.fen, moveHistoryUci: position.history, legalMovesUci: legal, opponentId: `elo-${tier}`, thinkingTimeMs: workerBudgetMs }, 987123 + trial * 65537);
      times.push(performance.now() - tick);
      if (!legal.includes(result.moveUci)) throw new Error(`Illegal move: ${position.id} ${result.moveUci}`);
      const chosen = await evaluate(position.fen, result.moveUci);
      if (result.moveUci === unrestrictedBest.bestmove && loss(best, chosen) !== 0) throw Error('Preferred root must have zero loss');
      moves.push({ seed: 987123 + trial * 65537, move: result.moveUci, evaluation: chosen, loss: loss(best, chosen), nodes: result.nodes, depth: result.depth });
    }
    rows.push({ ...position, unrestrictedBest, best, human, humanLoss: loss(best, human), botLoss: mean(moves.map(move => move.loss)), moves });
    if (rows.length % 16 === 0) { console.log(`${tier} ${label}: ${rows.length}/${positions.length} positions`); await saveCache(); }
  }
  const summary = Object.fromEntries([split].map(split => {
    const selected = rows.filter(row => row.split === split);
    const humanLoss = mean(selected.map(row => row.humanLoss)), botLoss = mean(selected.map(row => row.botLoss));
    return [split, { positions: selected.length, humanMeanCappedCpLoss: humanLoss, botMeanCappedCpLoss: botLoss, ratio: botLoss / humanLoss,
      humanBlunderFraction: mean(selected.map(row => Number(row.humanLoss >= 200))), botBlunderFraction: mean(selected.flatMap(row => row.moves.map(move => Number(move.loss >= 200)))) }];
  }));
  const afterHash = hash(Buffer.concat(await Promise.all(paths.map(path => readFile(path)))));
  if (afterHash !== sourceSha256) throw new Error('Engine changed during benchmark');
  if(hash(await readFile(new URL(import.meta.url)))!==benchmarkSha256)throw Error('Benchmark changed during run');
  const report = { generatedAt: new Date().toISOString(), label, sourceSha256, benchmarkSha256, corpusSha256: hash(corpusBytes), oracle,loader,
    metricVersion: 2, seedsPerPosition:trials,
    method: `Paired same-position comparison against real Chess.com rapid moves within the tier interval. ${trials} fixed bot seeds, shipped allowance and worker allocation. Stockfish 19 Lite depth10, hash cleared. Anchor is a forced root search of the unrestricted preferred move, compared with identical forced root searches of human/bot moves; preferred-root loss is asserted zero. Loss capped at1000cp including mate transitions. Contributor accounts split before tuning. Mean loss ratio measures calibration distance, not competitive Elo. No skipped positions or failures.`,
    tier, moveAllowanceMs, workerBudgetMs,
    environment: { node: process.version, cpu: cpus()[0].model, logicalCpus: cpus().length, loadavg: loadavg() }, elapsedMs: performance.now() - started, failures: 0,
    summary, timing: timing(times), rows };
  await writeFile(new URL(`${tier}-${label}.json`, folder), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary, timing: report.timing }, null, 2));
} finally {
  for(const dispose of cleanup) {
    try {await dispose();}
    catch(error){console.error('Benchmark cleanup failed:',error);process.exitCode=1;}
  }
}
