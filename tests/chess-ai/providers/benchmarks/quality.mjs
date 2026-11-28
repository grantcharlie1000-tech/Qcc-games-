/** Actual Stockfish WASM audit. The binary runs in a separate Node process. */
import { spawn } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { createHash } from 'node:crypto';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const dir = await mkdtemp(join(tmpdir(), 'qcc-quality-'));
const asset = new URL('../../../../public/chess-engines/stockfish/', import.meta.url);
await copyFile(new URL('stockfish-19-lite-single.js', asset), join(dir, 'engine.cjs'));
await copyFile(new URL('stockfish-19-lite-single.wasm', asset), join(dir, 'engine.wasm'));
const processEngine = spawn(process.execPath, [join(dir, 'engine.cjs')], { stdio: ['pipe', 'pipe', 'pipe'] });
let buffer = '';
let pending;
let engineError = '';
processEngine.stdout.on('data', chunk => {
  buffer += String(chunk);
  while (buffer.includes('\n')) {
    const index = buffer.indexOf('\n');
    const line = buffer.slice(0, index).trim(); buffer = buffer.slice(index + 1);
    if (pending) { pending.lines.push(line); if (pending.until(line)) { const done = pending; pending = undefined; clearTimeout(done.timer); done.resolve(done.lines); } }
  }
});
processEngine.stderr.on('data', chunk => { engineError += String(chunk); });
processEngine.on('exit', code => { if (pending) { clearTimeout(pending.timer); pending.reject(new Error(`Stockfish exited ${code}: ${engineError}`)); pending = undefined; } });
function command(text, until) {
  if (pending) throw new Error('Overlapping UCI command');
  return new Promise((resolve, reject) => {
    pending = { lines: [], resolve, reject, until, timer: setTimeout(() => { pending = undefined; reject(new Error(`UCI timeout after ${text}: ${engineError}`)); }, 30000) };
    processEngine.stdin.write(text + '\n');
  });
}
function send(text) { processEngine.stdin.write(text + '\n'); }
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
try {
  const sourceSha256 = createHash('sha256').update(await readFile(new URL('../../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url))).digest('hex');
const { computeMove } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
  await command('uci', line => line === 'uciok');
  send('setoption name Hash value 16'); send('setoption name Skill Level value 20'); send('setoption name UCI_LimitStrength value false');
  await command('isready', line => line === 'readyok');
  const lines = [
    ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'd3', 'Nf6'],
    ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
    ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
  ];
  const corpus = lines.map((moves, index) => { const game = new Chess(); const history = moves.map(m => { const move = game.move(m); return move.from + move.to + (move.promotion || ''); }); return { name: `opening-${index + 1}`, fen: game.fen(), history }; });
  corpus.push(
    { name: 'hanging-queen', fen: 'q5k1/8/8/8/8/8/8/R5K1 w - - 0 1', history: [] },
    { name: 'back-rank-threat', fen: 'r5k1/5ppp/8/8/8/5R2/5PPP/6K1 w - - 0 1', history: [] },
  );
  const depth = Number(process.env.QUALITY_DEPTH || 8);
  const samples = Number(process.env.QUALITY_SAMPLES || 20);
  const cache = new Map();
  async function evaluate(fen, move) {
    const key = fen + ':' + (move || '*'); if (cache.has(key)) return cache.get(key);
    send('ucinewgame'); send(`position fen ${fen}`);
    const output = await command(`go depth ${depth}${move ? ` searchmoves ${move}` : ''}`, line => line.startsWith('bestmove '));
    const info = output.filter(line => /^info .* score (cp|mate) -?\d+/.test(line)).at(-1);
    if (!info) throw new Error('Stockfish returned no score');
    const match = info.match(/ score (cp|mate) (-?\d+)/);
    const value = { kind: match[1], value: Number(match[2]), depth: Number(info.match(/ depth (\d+)/)?.[1]), bestmove: output.at(-1).split(' ')[1] };
    cache.set(key, value); return value;
  }
  const results = [];
  for (const position of corpus) {
    const game = new Chess(position.fen);
    const legalMovesUci = game.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const best = await evaluate(position.fen);
    for (const opponentId of ['elo-300', 'elo-500', 'elo-700', 'elo-900']) {
      let blunders = 0; let centipawnSamples = 0; let sumLoss = 0; let missedForcedMate = 0; let allowsForcedMate = 0;
      const choices = {};
      for (let seed = 0; seed < samples; seed++) {
        const answer = computeMove({ fen: position.fen, startFen: new Chess().fen(), moveHistoryUci: position.history, legalMovesUci, opponentId, thinkingTimeMs: 75 }, 987123 + seed * 65537);
        const selected = await evaluate(position.fen, answer.moveUci);
        choices[answer.moveUci] = (choices[answer.moveUci] || 0) + 1;
        if (best.kind === 'cp' && selected.kind === 'cp') { const loss = Math.max(0, best.value - selected.value); sumLoss += loss; centipawnSamples++; if (loss > 200) blunders++; }
        if (best.kind === 'mate' && best.value > 0 && !(selected.kind === 'mate' && selected.value > 0)) missedForcedMate++;
        if (!(best.kind === 'mate' && best.value < 0) && selected.kind === 'mate' && selected.value < 0) { allowsForcedMate++; blunders++; }
      }
      results.push({ position: position.name, fen: position.fen, opponentId, samples, best, centipawnSamples, meanCentipawnLoss: centipawnSamples ? sumLoss / centipawnSamples : null, blundersOver200CpOrAllowsMate: blunders, missedForcedMate, allowsForcedMate, choices });
      console.log(`${position.name} ${opponentId}: ${blunders}/${samples} >200cp or mate blunders`);
    }
  }
  const summary = ['elo-300', 'elo-500', 'elo-700', 'elo-900'].map(opponentId => {
    const group = results.filter(row => row.opponentId === opponentId);
    const count = group.reduce((sum, row) => sum + row.samples, 0);
    const cpCount = group.reduce((sum, row) => sum + row.centipawnSamples, 0);
    return { opponentId, samples: count, meanCentipawnLoss: group.reduce((sum, row) => sum + (row.meanCentipawnLoss || 0) * row.centipawnSamples, 0) / cpCount, blunderFraction: group.reduce((sum, row) => sum + row.blundersOver200CpOrAllowsMate, 0) / count };
  });
  const report = { generatedAt: new Date().toISOString(), sourceSha256, engine: 'Stockfish 19 Lite WASM from stockfish.js 19.0.1, unrestricted, 16MiB hash, one thread', depth, samplesPerPosition: samples, method: 'Six fixed positions, same seeds for all opponents. Root unrestricted best and forced chosen move each searched independently to stated depth. Scores are side-to-move. Centipawn loss clamped at zero; finite-depth search may be inconsistent. Not an Elo estimate or a representative game blunder rate.', summary, results };
  await writeFile(new URL('./quality-results.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
} finally { processEngine.kill(); await server.close(); await rm(dir, { recursive: true, force: true }); }
