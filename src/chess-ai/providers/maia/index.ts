import { ChessAIError, type ChessAIInitOptions, type ChessAIMoveRequest, type ChessAIMoveResponse, type ChessAIProvider } from '../../types';
import { manifest } from './manifest';
import type { MaiaCommand, MaiaReply } from './protocol';

const RATINGS: Readonly<Record<string, number>> = { 'elo-1100': 1100, 'elo-1300': 1300, 'elo-1600': 1600, 'elo-1900': 1900 };

interface Pending {
  id: number;
  revision?: number;
  resolve(reply: MaiaReply): void;
  reject(error: Error): void;
  cleanup(): void;
}

/** Every instance owns its model memory and Worker; cancellation destroys both. */
export function createProvider(): ChessAIProvider {
  let worker: Worker | undefined;
  let pending: Pending | undefined;
  let ready = false;
  let disposed = false;
  let sequence = 0;
  let latestRevision = -1;
  let progress: ChessAIInitOptions['onProgress'] = () => {};
  let activeChoice: { error?: ChessAIError } | undefined;

  function stop(error: Error) {
    ready = false;
    worker?.terminate();
    worker = undefined;
    const job = pending;
    pending = undefined;
    job?.cleanup();
    job?.reject(error);
  }

  function request(command: MaiaCommand, signal: AbortSignal, timeoutMs: number): Promise<MaiaReply> {
    if (signal.aborted) return Promise.reject(new ChessAIError('aborted', 'Maia3 request canceled.'));
    return new Promise((resolve, reject) => {
      const abort = () => stop(new ChessAIError('aborted', 'Maia3 request canceled.'));
      const timer = setTimeout(() => stop(new ChessAIError('timeout', command.type === 'init' ? 'Maia3 initialization timed out.' : 'Maia3 exceeded the available thinking budget.')), timeoutMs);
      signal.addEventListener('abort', abort, { once: true });
      pending = {
        id: command.id,
        revision: command.type === 'move' ? command.revision : undefined,
        resolve,
        reject,
        cleanup() { clearTimeout(timer); signal.removeEventListener('abort', abort); },
      };
      try { worker!.postMessage(command); } catch (error) { stop(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  async function start(signal: AbortSignal) {
    if (disposed) throw new ChessAIError('disposed', 'Maia3 has been closed.');
    if (signal.aborted) throw new ChessAIError('aborted', 'Maia3 loading canceled.');
    if (ready) return;
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') throw new ChessAIError('unavailable', 'Maia3 requires Web Workers and WebAssembly.');
    const own = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker = own;
    own.onmessage = ({ data }: MessageEvent<MaiaReply>) => {
      if (worker !== own || !pending || data.id !== pending.id) return;
      if (data.type === 'progress') { progress(data.progress); return; }
      if (data.type === 'error') { stop(new ChessAIError('engine-error', `Maia3: ${data.message}`)); return; }
      if (data.type === 'move' && data.revision !== pending.revision) return;
      const job = pending;
      pending = undefined;
      job.cleanup();
      job.resolve(data);
    };
    own.onerror = (event) => {
      if (worker === own) stop(new ChessAIError('engine-error', `Maia3 Worker failed: ${event.message || 'unknown error'}`));
    };
    own.onmessageerror = () => { if (worker === own) stop(new ChessAIError('engine-error', 'Maia3 Worker response could not be decoded.')); };
    const assetBase = new URL(`${import.meta.env.BASE_URL}chess-engines/maia/`, document.baseURI).href;
    const reply = await request({ type: 'init', id: ++sequence, assetBase }, signal, 115_000);
    if (reply.type !== 'ready' || worker !== own || disposed) throw new ChessAIError('engine-error', 'Maia3 did not become ready.');
    ready = true;
  }

  return {
    manifest,
    async initialize(options) {
      progress = options.onProgress;
      await start(options.signal);
    },
    async chooseMove(input: ChessAIMoveRequest): Promise<ChessAIMoveResponse> {
      if (disposed) throw new ChessAIError('disposed', 'Maia3 has been closed.');
      if (input.positionRevision < latestRevision) throw new ChessAIError('stale', 'Maia3 received an outdated position.');
      if (activeChoice) activeChoice.error = new ChessAIError('stale', 'Maia3 request superseded.');
      if (pending) stop(new ChessAIError('stale', 'Maia3 request superseded.'));
      latestRevision = input.positionRevision;
      const rating = RATINGS[input.opponentId];
      if (rating === undefined || !input.legalMovesUci.length) throw new ChessAIError('invalid-request', 'Unsupported Maia3 opponent or terminal position.');
      const clockBudget = input.clock ? Math.max(0, input.clock.remainingMs - Math.min(75, input.clock.remainingMs * 0.1)) : Infinity;
      const budget = input.thinkingTimeMs;
      if (!Number.isFinite(budget) || budget <= 0) throw new ChessAIError('invalid-request', 'Maia3 needs a positive thinking budget.');
      // A policy inference is fixed work, unlike an interruptible tree search.
      // Allow that one inference and any cold reload inside the loader's grace,
      // bounded by the actual remaining chess clock. Cutting it off at the soft
      // target repeatedly discards the loaded model on slower devices.
      const wallBudget = Math.min(budget + 9_000, clockBudget);
      if (wallBudget <= 0) throw new ChessAIError('timeout', 'Maia3 has no chess clock time remaining.');
      // Mark active synchronously, before awaiting even an already warm start.
      const choice: { error?: ChessAIError } = {};
      activeChoice = choice;
      const started = performance.now();
      const wallTimer = setTimeout(() => stop(new ChessAIError('timeout', 'Maia3 exhausted the available chess clock or recovery deadline.')), wallBudget);
      try {
        await start(input.signal);
        if (choice.error) throw choice.error;
        if (input.positionRevision !== latestRevision || input.signal.aborted) throw new ChessAIError('stale', 'Maia3 position changed while loading.');
        const left = wallBudget - (performance.now() - started);
        if (left <= 0) throw new ChessAIError('timeout', 'Maia3 reloading exhausted the thinking budget.');
        const randomBytes = new Uint32Array(1);
        crypto.getRandomValues(randomBytes);
        const reply = await request({
          type: 'move', id: ++sequence, revision: input.positionRevision,
          fen: input.fen, legalMovesUci: input.legalMovesUci, rating,
          random: randomBytes[0] / 0x1_0000_0000,
        }, input.signal, Math.max(1, left));
        if (choice.error) throw choice.error;
        // A throttled/backgrounded UI thread can deliver a response before an
        // overdue timer callback. The absolute clock deadline still applies.
        if (performance.now() - started >= wallBudget) {
          const error = new ChessAIError('timeout', 'Maia3 response arrived after the available chess clock or recovery deadline.');
          stop(error);
          throw error;
        }
        if (reply.type !== 'move' || !input.legalMovesUci.includes(reply.moveUci)) throw new ChessAIError('illegal-move', 'Maia3 returned an invalid move.');
        return { moveUci: reply.moveUci };
      } finally {
        clearTimeout(wallTimer);
        if (activeChoice === choice) activeChoice = undefined;
      }
    },
    cancel() {
      const error = new ChessAIError('aborted', 'Maia3 search canceled.');
      if (activeChoice) activeChoice.error = error;
      if (pending) stop(error);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (activeChoice) activeChoice.error = new ChessAIError('disposed', 'Maia3 has been closed.');
      progress = () => {};
      stop(new ChessAIError('disposed', 'Maia3 has been closed.'));
    },
  };
}
