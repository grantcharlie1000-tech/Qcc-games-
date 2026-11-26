import { getChessAIRegistry, type ChessAIMoveInput } from '../../../../src/chess-ai';
import { Chess, DEFAULT_POSITION } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';

const nativeWorker = window.Worker;
const liveWorkers = new Set<Worker>();
let peakWorkers = 0;
let lastMaiaInferenceMs = 0;
let onMaiaMovePosted: (() => void) | undefined;
class ObservedWorker extends nativeWorker {
  constructor(scriptURL: string | URL, options?: WorkerOptions) {
    super(scriptURL, options);
    liveWorkers.add(this);
    peakWorkers = Math.max(peakWorkers, liveWorkers.size);
    this.addEventListener('message', ({ data }) => {
      if (data?.type === 'move' && typeof data.inferenceMs === 'number') lastMaiaInferenceMs = data.inferenceMs;
    });
  }
  override terminate() { liveWorkers.delete(this); super.terminate(); }
  override postMessage(message: unknown, options: Transferable[] | StructuredSerializeOptions = []) {
    if (Array.isArray(options)) super.postMessage(message, options);
    else super.postMessage(message, options);
    if (message && typeof message === 'object' && 'type' in message && message.type === 'move') {
      const posted = onMaiaMovePosted;
      onMaiaMovePosted = undefined;
      posted?.();
    }
  }
}
window.Worker = ObservedWorker;

async function sampleMemory(label: string) {
  const observer = (window as Window & { qccRecordMemory?: (name: string) => Promise<unknown> }).qccRecordMemory;
  if (observer) await observer(label);
}

const registry = getChessAIRegistry();
const legal = (game: Chess) => game.moves({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
function position(game = new Chess(), revision = 1, startFen = DEFAULT_POSITION, history: string[] = []): ChessAIMoveInput {
  return { fen: game.fen(), startFen, moveHistoryUci: history, legalMovesUci: legal(game), positionRevision: revision, thinkingTimeMs: 500 };
}
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const codeOf = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : String(error);
async function rejects(work: Promise<unknown>, codes: string[]) {
  let rejected = false;
  try { await work; } catch (e) { rejected = true; assert(codes.includes(codeOf(e)), `Unexpected rejection: ${codeOf(e)}`); }
  assert(rejected, `Expected rejection: ${codes.join(',')}`);
}

type CaseResult = { name: string; ok: boolean; elapsedMs: number; detail?: unknown; error?: string };
const results: CaseResult[] = [];
async function check(name: string, fn: () => Promise<unknown> | unknown) {
  const start = performance.now();
  try { const detail = await fn(); results.push({ name, ok: true, elapsedMs: performance.now() - start, detail }); }
  catch (e) { results.push({ name, ok: false, elapsedMs: performance.now() - start, error: e instanceof Error ? e.stack : String(e) }); }
  document.querySelector('#result')!.textContent = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.name} (${Math.round(r.elapsedMs)}ms)`).join('\n');
}

async function run(fullGame = false, stockfishOnly = false) {
  const opponents = stockfishOnly ? ['max'] : ['elo-300', 'elo-700', 'max'];
  await check('discovery and honest metadata', () => {
    assert(registry.rejected.length === 0, JSON.stringify(registry.rejected));
    for (const id of ['elo-300', 'elo-500', 'elo-700', 'elo-900', 'elo-2200', 'elo-2600', 'elo-3000', 'max']) {
      assert(registry.availability(id).state === 'available', `${id} unavailable`);
    }
    assert(registry.analysisProvider()?.engine === 'stockfish', 'Real Stockfish analysis missing');
    return registry.opponents().map(({ opponent, availability }) => ({ id: opponent.id, targetElo: opponent.targetElo, engine: availability.state === 'available' ? availability.provider.engine : 'unavailable' }));
  });
  for (const id of opponents) {
    await check(`${id}: real initialize, legal move, pacing, disposal`, async () => {
      const progress: unknown[] = [];
      const began = performance.now();
      const session = await registry.openOpponent(id, { onProgress: (p) => progress.push(p) });
      const loadMs = performance.now() - began;
      await sampleMemory(`${id}:ready`);
      try {
        assert(progress.length > 0, 'No loading progress');
        const input = { ...position(), thinkingTimeMs: id === 'max' ? 35 : id === 'elo-300' ? 400 : 500 };
        const start = performance.now();
        const reply = await session.requestMove(input);
        const thinkingMs = performance.now() - start;
        assert(input.legalMovesUci.includes(reply.moveUci), 'Illegal actual move');
        assert(thinkingMs < 5000, `Unbounded thinking time ${thinkingMs}`);
        const emergency = performance.now();
        let emergencyOutcome = 'move';
        try {
          const emergencyReply = await session.requestMove({ ...position(new Chess(), 2), thinkingTimeMs: 600, clock: { remainingMs: 20, incrementMs: 0 } });
          assert(input.legalMovesUci.includes(emergencyReply.moveUci), 'Illegal emergency move');
        } catch (error) {
          assert(codeOf(error) === 'timeout', `Unexpected emergency error ${codeOf(error)}`);
          emergencyOutcome = 'timeout';
        }
        const emergencyMs = performance.now() - emergency;
        assert(emergencyMs < 250, `Clock budget ignored: ${emergencyMs}`);
        return { provider: session.provider, loadMs, thinkingMs, emergencyMs, emergencyOutcome, reply, progress };
      } finally { session.dispose(); session.dispose(); assert(liveWorkers.size === 0, `${liveWorkers.size} leaked workers`); await sampleMemory(`${id}:disposed`); }
    });
  }
  for (const id of opponents) {
    await check(`${id}: abort, stale requests, restart and independent games`, async () => {
      const a = await registry.openOpponent(id);
      const b = await registry.openOpponent(id);
      try {
        const old = a.requestMove({ ...position(), thinkingTimeMs: 600 }).then(() => 'resolved', codeOf);
        const fresh = a.requestMove(position(new Chess(), 2));
        assert(await old === 'stale', 'Outdated move escaped');
        assert(legal(new Chess()).includes((await fresh).moveUci), 'Restart move illegal');
        await rejects(a.requestMove(position(new Chess(), 1)), ['stale']);
        const controller = new AbortController();
        const aborted = a.requestMove({ ...position(new Chess(), 3), thinkingTimeMs: 600, signal: controller.signal });
        const caught = rejects(aborted, ['aborted']);
        controller.abort();
        await caught;
        const replies = await Promise.all([a.requestMove(position(new Chess(), 4)), b.requestMove(position())]);
        for (const reply of replies) assert(legal(new Chess()).includes(reply.moveUci), 'Cross-game invalid move');
        const late = a.requestMove({ ...position(new Chess(), 5), thinkingTimeMs: 600 });
        const disposed = rejects(late, ['disposed']);
        a.dispose(); await disposed;
        await rejects(a.requestMove(position(new Chess(), 6)), ['disposed']);
        return { concurrentReplies: replies, peakWorkers };
      } finally { a.dispose(); b.dispose(); assert(liveWorkers.size === 0, `Leaked ${liveWorkers.size} workers`); }
    });
  }
  const special = [
    { name: 'promotion', fen: '7k/P7/8/8/8/8/8/6K1 w - - 0 1', moves: ['a7a8q', 'a7a8r', 'a7a8b', 'a7a8n'] },
    { name: 'castling', fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', moves: ['e1g1', 'e1c1'] },
    { name: 'en passant', fen: '7k/8/8/3pP3/8/8/8/6K1 w - d6 0 1', moves: ['e5d6'] },
  ];
  for (const id of opponents) {
    await check(`${id}: promotion, castling, en passant and invalid FEN`, async () => {
      const session = await registry.openOpponent(id);
      try {
        const replies = [];
        let revision = 1;
        for (const fixture of special) {
          const game = new Chess(fixture.fen);
          for (const move of fixture.moves) assert(legal(game).includes(move), `Bad fixture ${move}`);
          const reply = await session.requestMove({ ...position(game, revision++, fixture.fen), legalMovesUci: fixture.moves });
          assert(fixture.moves.includes(reply.moveUci), `${fixture.name} failed`);
          replies.push({ name: fixture.name, move: reply.moveUci });
        }
        await rejects(session.requestMove({ ...position(new Chess(), revision++), fen: 'invalid fen' }), ['invalid-request', 'engine-error']);
        for (const fen of ['7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1']) {
          const finished = new Chess(fen);
          assert(legal(finished).length === 0, 'Terminal test has legal moves');
          await rejects(session.requestMove(position(finished, revision++, fen)), ['invalid-request', 'engine-error']);
        }
        return replies;
      } finally { session.dispose(); }
    });
  }
  await check('Stockfish real analysis and White score orientation', async () => {
    const analysis = await registry.openAnalysis();
    try {
      const game = new Chess('7k/8/8/8/8/8/5Q2/6K1 b - - 0 1');
      const report = await analysis.analyze({ ...position(game, 1, game.fen()), thinkingTimeMs: 100, multiPv: 2 });
      assert(report.depth > 0 && report.lines.length > 0, 'Missing genuine analysis');
      const best = report.lines[0];
      assert((best.evaluationCp ?? 0) > 0 || (best.mateIn ?? 0) > 0, 'Black-to-move score was not oriented to White');
      const terminal = new Chess('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
      assert(terminal.isCheckmate(), 'Invalid terminal fixture');
      const finished = await analysis.analyze({ ...position(terminal, 2, terminal.fen()), thinkingTimeMs: 35 });
      assert(finished.lines.length === 0, 'Terminal position returned fabricated line');
      return { report, finished };
    } finally { analysis.dispose(); }
  });
  if (fullGame) await check('Stockfish full legal game from standard start', async () => {
    const white = await registry.openOpponent('max');
    const black = await registry.openOpponent('elo-2200');
    const game = new Chess(); const history: string[] = []; const durations: number[] = [];
    try {
      while (!game.isGameOver() && history.length < 500) {
        const player = game.turn() === 'w' ? white : black;
        const input = { ...position(game, history.length + 1, DEFAULT_POSITION, history), thinkingTimeMs: 15 };
        const start = performance.now();
        const reply = await player.requestMove(input);
        durations.push(performance.now() - start);
        assert(legal(game).includes(reply.moveUci), `Illegal game move ${reply.moveUci}`);
        game.move({ from: reply.moveUci.slice(0, 2), to: reply.moveUci.slice(2, 4), promotion: reply.moveUci[4] });
        history.push(reply.moveUci);
      }
      assert(game.isGameOver(), `Game unfinished after ${history.length} plies`);
      return { plies: history.length, averageThinkingMs: durations.reduce((a, b) => a + b, 0) / durations.length, maxThinkingMs: Math.max(...durations), checkmate: game.isCheckmate(), draw: game.isDraw(), pgn: game.pgn(), history };
    } finally { white.dispose(); black.dispose(); }
  });
  assert(liveWorkers.size === 0, `Final ${liveWorkers.size} worker leaks`);
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  document.body.classList.add('ok');
  return { results, peakWorkers, remainingWorkers: liveWorkers.size, userAgent: navigator.userAgent, crossOriginIsolated, memory: memory ? { usedJSHeapSize: memory.usedJSHeapSize, jsHeapSizeLimit: memory.jsHeapSizeLimit } : null };
}

async function missing() {
  const start = performance.now();
  await rejects(registry.openOpponent('max'), ['init-failed']);
  assert(liveWorkers.size === 0, 'Failed startup leaked a worker');
  return { elapsedMs: performance.now() - start, remainingWorkers: liveWorkers.size };
}

Object.assign(window, { qccSmoke: { run, missing } });

async function neural() {
  await check('Maia3 real model initialization and rating-conditioned legal policy', async () => {
    const progress: unknown[] = [];
    const began = performance.now();
    const session = await registry.openOpponent('elo-1300', { onProgress: (p) => progress.push(p) });
    const loadMs = performance.now() - began;
    await sampleMemory('maia3:ready');
    try {
      assert(session.provider.engine === 'maia', 'An unrelated engine replaced Maia');
      const game = new Chess(); const history: string[] = []; const moves = [];
      for (let revision = 1; revision <= 3; revision++) {
        const input = { ...position(game, revision, DEFAULT_POSITION, history), thinkingTimeMs: 700 };
        const started = performance.now();
        const reply = await session.requestMove(input);
        const elapsedMs = performance.now() - started;
        assert(legal(game).includes(reply.moveUci), 'Invalid neural move');
        assert(elapsedMs - lastMaiaInferenceMs < 150, `Maia delayed a completed inference by ${elapsedMs - lastMaiaInferenceMs}ms`);
        game.move({ from: reply.moveUci.slice(0, 2), to: reply.moveUci.slice(2, 4), promotion: reply.moveUci[4] });
        history.push(reply.moveUci); moves.push({ moveUci: reply.moveUci, elapsedMs });
      }
      const controller = new AbortController();
      const dispatched = new Promise<void>((resolve) => { onMaiaMovePosted = resolve; });
      const pending = session.requestMove({ ...position(game, 4, DEFAULT_POSITION, history), thinkingTimeMs: 700, signal: controller.signal });
      const canceled = rejects(pending, ['aborted']);
      await dispatched;
      controller.abort(); await canceled;
      const recoveryStarted = performance.now();
      const recovered = await session.requestMove({ ...position(game, 5, DEFAULT_POSITION, history), thinkingTimeMs: 700 });
      assert(legal(game).includes(recovered.moveUci), 'Recovery move invalid');
      const recoveryMs = performance.now() - recoveryStarted;
      const warmWorker = [...liveWorkers][0];
      const softTargetStarted = performance.now();
      const softTargetMove = await session.requestMove({ ...position(game, 6, DEFAULT_POSITION, history), thinkingTimeMs: 1 });
      const softTargetMs = performance.now() - softTargetStarted;
      assert(legal(game).includes(softTargetMove.moveUci), 'Slow inference returned an invalid move');
      assert(liveWorkers.has(warmWorker), 'Soft thinking target discarded the warm model');
      await sampleMemory('maia3:recovered-after-cancel');
      return { provider: session.provider, loadMs, moves, recoveryMs, recovered, softTargetMs, softTargetMove, progress };
    } finally { session.dispose(); session.dispose(); assert(liveWorkers.size === 0, 'Maia Worker leaked'); await sampleMemory('maia3:disposed'); }
  });
  await check('Maia3 numerical parity with Python ONNX Runtime reference', async () => {
    const own = new Worker(new URL('../maia-parity.worker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Maia parity worker timed out')), 30000);
        own.onmessage = ({ data }) => { clearTimeout(timer); data.ok ? resolve(data) : reject(new Error(data.error)); };
        own.onerror = (event) => { clearTimeout(timer); event.preventDefault(); reject(new Error(event.message)); };
        own.postMessage({ assetBase: new URL('chess-engines/maia/', document.baseURI).href });
      });
    } finally { own.terminate(); }
  });
  return { results, peakWorkers, remainingWorkers: liveWorkers.size, userAgent: navigator.userAgent, crossOriginIsolated };
}
async function missingNeural() {
  const start = performance.now();
  await rejects(registry.openOpponent('elo-1300'), ['init-failed']);
  assert(liveWorkers.size === 0, 'Failed Maia startup leaked a worker');
  return { elapsedMs: performance.now() - start, remainingWorkers: liveWorkers.size };
}
Object.assign(window, { qccNeural: { run: neural, missing: missingNeural } });
