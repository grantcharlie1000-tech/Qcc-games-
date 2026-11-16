import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from '../../../src/chess-ai/providers/stockfish';
import type { ChessAIProvider } from '../../../src/chess-ai/types';

class TestWorker {
  static instances: TestWorker[] = [];
  onmessage?: (event: { data: string }) => void;
  onerror?: (event: { preventDefault(): void; message: string }) => void;
  onmessageerror?: () => void;
  commands: string[] = [];
  terminated = false;
  constructor() { TestWorker.instances.push(this); }
  postMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    this.commands.push(data);
    if (data === 'uci') queueMicrotask(() => this.reply('uciok'));
    if (data === 'isready') queueMicrotask(() => this.reply('readyok'));
  }
  reply(data: string): void { this.onmessage?.({ data }); }
  terminate(): void { this.terminated = true; }
}

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const request = () => ({ fen, startFen: fen, moveHistoryUci: [], legalMovesUci: ['e2e4', 'd2d4'],
  positionRevision: 1, thinkingTimeMs: 200, opponentId: 'max', signal: new AbortController().signal });
let provider: ChessAIProvider;

beforeEach(() => {
  TestWorker.instances = [];
  vi.stubGlobal('Worker', TestWorker);
  vi.stubGlobal('document', { baseURI: 'https://example.test/Qcc-games-/index.html' });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { headers: { 'content-type': 'application/wasm' } })));
  provider = createProvider();
});
afterEach(() => { provider.dispose(); vi.unstubAllGlobals(); });
const init = async () => provider.initialize({ signal: new AbortController().signal, onProgress() {} });
const flush = async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); };

describe('Stockfish session lifecycle', () => {
  it('handshakes before search and preserves White perspective analysis', async () => {
    await init();
    const w = TestWorker.instances[0];
    expect(w.commands).toEqual(expect.arrayContaining(['uci', 'ucinewgame', 'isready']));
    const work = provider.chooseMove(request());
    await flush();
    w.reply('info depth 12 score cp 30 pv e2e4 e7e5');
    w.reply('bestmove e2e4 ponder e7e5');
    await expect(work).resolves.toMatchObject({ moveUci: 'e2e4', evaluationCp: 30, depth: 12 });
    expect(w.commands).toContain('setoption name UCI_LimitStrength value false');
  });

  it('does not attach a stronger PV evaluation to a limited-strength move', async () => {
    await init();
    const work = provider.chooseMove({ ...request(), opponentId: 'elo-2200' });
    await flush();
    TestWorker.instances[0].reply('info depth 12 score cp 30 pv e2e4 e7e5');
    TestWorker.instances[0].reply('bestmove d2d4');
    await expect(work).resolves.toEqual({ moveUci: 'd2d4' });
  });

  it('terminates on cancellation and rejects output from the previous Worker', async () => {
    await init();
    const old = TestWorker.instances[0];
    const first = provider.chooseMove(request());
    const rejected = expect(first).rejects.toMatchObject({ code: 'aborted' });
    await flush();
    provider.cancel();
    await rejected;
    expect(old.terminated).toBe(true);
    const second = provider.chooseMove(request());
    await flush();
    old.reply('bestmove e2e4');
    TestWorker.instances[1].reply('bestmove d2d4');
    await expect(second).resolves.toEqual({ moveUci: 'd2d4' });
  });

  it('cancels a request before its first asynchronous search callback runs', async () => {
    await init();
    const first = provider.chooseMove(request());
    provider.cancel();
    await expect(first).rejects.toMatchObject({ code: 'aborted' });
    expect(TestWorker.instances[0].commands.some((c) => c.startsWith('go '))).toBe(false);
  });

  it('isolates simultaneous games and disposes each Worker once', async () => {
    const other = createProvider();
    await Promise.all([init(), other.initialize({ signal: new AbortController().signal, onProgress() {} })]);
    const first = provider.chooseMove(request());
    const second = other.chooseMove(request());
    await flush();
    TestWorker.instances[1].reply('bestmove d2d4');
    TestWorker.instances[0].reply('bestmove e2e4');
    await expect(first).resolves.toMatchObject({ moveUci: 'e2e4' });
    await expect(second).resolves.toMatchObject({ moveUci: 'd2d4' });
    other.dispose(); other.dispose();
    expect(TestWorker.instances[1].terminated).toBe(true);
  });

  it('rejects illegal bestmoves and handles Worker crashes', async () => {
    await init();
    const illegal = provider.chooseMove(request());
    const rejection = expect(illegal).rejects.toThrow('invalid best move');
    await flush();
    TestWorker.instances[0].reply('bestmove a7a5');
    await rejection;
    const failed = provider.chooseMove(request());
    const crash = expect(failed).rejects.toThrow('Worker failed');
    await flush();
    TestWorker.instances[0].onerror?.({ preventDefault() {}, message: 'crash' });
    await crash;
    expect(TestWorker.instances[0].terminated).toBe(true);
  });

  it('rejects missing WASM and wrong MIME without searching', async () => {
    vi.stubGlobal('fetch', async () => new Response('not found', { status: 404 }));
    await expect(init()).rejects.toThrow('WASM unavailable');
    expect(TestWorker.instances).toHaveLength(0);
  });

  it('settles an aborted initialize and rejects calls after disposal', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(provider.initialize({ signal: controller.signal, onProgress() {} })).rejects.toMatchObject({ code: 'aborted' });
    provider.dispose();
    await expect(provider.chooseMove(request())).rejects.toMatchObject({ code: 'disposed' });
  });

  it('subtracts cold startup from the requested search budget', async () => {
    vi.stubGlobal('fetch', async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return new Response(null, { headers: { 'content-type': 'application/wasm' } });
    });
    const work = provider.chooseMove({ ...request(), thinkingTimeMs: 100 });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const w = TestWorker.instances[0];
    const go = w.commands.find((command) => command.startsWith('go movetime'))!;
    const milliseconds = Number(go.split(' ')[2]);
    expect(milliseconds).toBeLessThan(90);
    expect(milliseconds).toBeGreaterThan(0);
    w.reply('bestmove e2e4');
    await expect(work).resolves.toMatchObject({ moveUci: 'e2e4' });
  });

  it('includes cold startup in a hard remaining-clock deadline', async () => {
    vi.stubGlobal('fetch', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(null, { headers: { 'content-type': 'application/wasm' } });
    });
    await expect(provider.chooseMove({ ...request(), clock: { remainingMs: 25, incrementMs: 0 } }))
      .rejects.toMatchObject({ code: 'timeout' });
    await new Promise((resolve) => setTimeout(resolve, 55));
    expect(TestWorker.instances).toHaveLength(0);
  });
});
