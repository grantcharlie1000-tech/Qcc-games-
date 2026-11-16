import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProvider } from '../../../src/chess-ai/providers/maia';
import type { ChessAIMoveRequest } from '../../../src/chess-ai/types';
import type { MaiaCommand, MaiaReply } from '../../../src/chess-ai/providers/maia/protocol';

// Unit transport fault injection. Genuine WASM/model execution is separately
// covered by tests/chess-ai/providers/browser/run.mjs.
class FaultWorker {
  onmessage?: (event: { data: MaiaReply }) => void;
  onerror?: (event: { message: string }) => void;
  onmessageerror?: () => void;
  static instances: FaultWorker[] = [];
  static stallInitialization = false;
  static readyDelayMs = 0;
  commands: MaiaCommand[] = [];
  constructor() { FaultWorker.instances.push(this); }
  postMessage(command: MaiaCommand) {
    this.commands.push(command);
    if (command.type === 'init' && !FaultWorker.stallInitialization) {
      if (FaultWorker.readyDelayMs) setTimeout(() => this.send({ type: 'ready', id: command.id }), FaultWorker.readyDelayMs);
      else queueMicrotask(() => this.send({ type: 'ready', id: command.id }));
    }
  }
  send(data: MaiaReply) { this.onmessage?.({ data }); }
  terminate() {}
}
const position = (revision = 1): ChessAIMoveRequest => ({
  opponentId: 'elo-1300', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  legalMovesUci: ['e2e4'], moveHistoryUci: [], positionRevision: revision,
  thinkingTimeMs: 500, signal: new AbortController().signal,
});
function setup() {
  FaultWorker.instances = [];
  FaultWorker.stallInitialization = false;
  FaultWorker.readyDelayMs = 0;
  vi.stubGlobal('Worker', FaultWorker);
  vi.stubGlobal('document', { baseURI: 'http://localhost/Qcc-games-/index.html' });
  return createProvider();
}
async function tick() { await new Promise((resolve) => setTimeout(resolve, 0)); }
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Maia provider cancellation and transport failures', () => {
  it('finishes one inference beyond the soft thinking target without reloading the model', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const result = provider.chooseMove({ ...position(), thinkingTimeMs: 20 }).then(value => value, error => error);
    await new Promise(resolve => setTimeout(resolve, 50));
    const worker = FaultWorker.instances[0];
    const command = worker.commands.at(-1)!;
    worker.send({ type: 'move', id: command.id, revision: 1, moveUci: 'e2e4', inferenceMs: 50 });
    expect(await result).toEqual({ moveUci: 'e2e4' });
    provider.dispose();
  });
  it('rejects a response arriving after the clock deadline even before its timer runs', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    const result = provider.chooseMove({ ...position(), clock: { remainingMs: 1_000, incrementMs: 0 } });
    await tick();
    const worker = FaultWorker.instances[0];
    const command = worker.commands.at(-1)!;
    now.mockReturnValue(1_100); // UI thread resumed beyond its 925 ms clock reserve.
    worker.send({ type: 'move', id: command.id, revision: 1, moveUci: 'e2e4', inferenceMs: 1 });
    await expect(result).rejects.toMatchObject({ code: 'timeout' });
    provider.dispose();
  });
  it('cancels synchronously before a warm-start continuation sends the search', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const result = provider.chooseMove(position());
    provider.cancel();
    await expect(result).rejects.toMatchObject({ code: 'aborted' });
    const fresh = provider.chooseMove(position(2));
    await tick();
    const worker = FaultWorker.instances[0];
    const command = worker.commands.at(-1)!;
    worker.send({ type: 'move', id: command.id, revision: 2, moveUci: 'e2e4', inferenceMs: 1 });
    expect(await fresh).toEqual({ moveUci: 'e2e4' });
    provider.dispose();
  });
  it('cancels a request and ignores the retired Worker while a new request loads', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const oldWorker = FaultWorker.instances[0];
    const old = provider.chooseMove(position()).catch((e) => e);
    await tick();
    const oldCommand = oldWorker.commands.at(-1)!;
    provider.cancel();
    expect(await old).toMatchObject({ code: 'aborted' });
    const fresh = provider.chooseMove(position(2));
    await tick();
    const newWorker = FaultWorker.instances[1];
    const newCommand = newWorker.commands.at(-1)!;
    oldWorker.send({ type: 'move', id: oldCommand.id, revision: 1, moveUci: 'a1a8', inferenceMs: 1 });
    newWorker.send({ type: 'move', id: newCommand.id, revision: 2, moveUci: 'e2e4', inferenceMs: 1 });
    expect(await fresh).toEqual({ moveUci: 'e2e4' });
    provider.dispose();
  });
  it('includes model reload time in the available chess clock budget', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const interrupted = provider.chooseMove(position()).catch((e) => e);
    await tick();
    provider.cancel();
    expect(await interrupted).toMatchObject({ code: 'aborted' });
    FaultWorker.stallInitialization = true;
    const started = performance.now();
    await expect(provider.chooseMove({ ...position(), clock: { remainingMs: 40, incrementMs: 0 } })).rejects.toMatchObject({ code: 'timeout' });
    expect(performance.now() - started).toBeLessThan(180);
    provider.dispose();
  });
  it('recovers a canceled model when reload is longer than the soft thinking budget', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const interrupted = provider.chooseMove(position()).catch((e) => e);
    await tick();
    provider.cancel();
    expect(await interrupted).toMatchObject({ code: 'aborted' });
    FaultWorker.readyDelayMs = 70;
    const next = provider.chooseMove({ ...position(2), thinkingTimeMs: 30 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const current = FaultWorker.instances[1];
    const command = current.commands.at(-1)!;
    current.send({ type: 'move', id: command.id, revision: 2, moveUci: 'e2e4', inferenceMs: 1 });
    expect(await next).toEqual({ moveUci: 'e2e4' });
    provider.dispose();
  });
  it('reports missing runtime and worker failures instead of producing a move', async () => {
    const provider = setup();
    await provider.initialize({ signal: new AbortController().signal, onProgress() {} });
    const move = provider.chooseMove(position());
    await tick();
    FaultWorker.instances[0].onerror?.({ message: 'Missing WASM asset' });
    await expect(move).rejects.toThrow('Missing WASM asset');
    provider.dispose();
    await expect(provider.chooseMove(position(2))).rejects.toMatchObject({ code: 'disposed' });
  });
});
