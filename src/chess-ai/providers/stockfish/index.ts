// SPDX-License-Identifier: GPL-3.0-only
import {
  ChessAIError,
  type ChessAIAnalysis,
  type ChessAIAnalysisRequest,
  type ChessAIInitOptions,
  type ChessAIMoveRequest,
  type ChessAIMoveResponse,
  type ChessAIProvider,
} from '../../types';
import { manifest } from './manifest';
import { parseInfo, positionCommand, searchBudget, stockfishSettings, type UciInfo } from './uci';

const abortError = () => new ChessAIError('aborted', 'Stockfish search cancelled.');

/** Each session owns exactly one WASM Worker. There are no shared search queues. */
export function createProvider(): ChessAIProvider {
  let worker: Worker | undefined;
  let boot: Promise<void> | undefined;
  let closeBoot: ((error: Error) => void) | undefined;
  let progress: ChessAIInitOptions['onProgress'] = () => {};
  let disposed = false;
  let generation = 0;
  let active: { line(text: string): void; fail(error: Error): void } | undefined;
  let closeProgress: (() => void) | undefined;

  function terminate(error: Error): void {
    ++generation;
    const oldActive = active;
    active = undefined;
    oldActive?.fail(error);
    closeBoot?.(error);
    closeBoot = undefined;
    worker?.terminate();
    worker = undefined;
    boot = undefined;
    closeProgress?.();
    closeProgress = undefined;
  }

  function ready(): Promise<void> {
    if (disposed) return Promise.reject(new ChessAIError('disposed', 'Stockfish is closed.'));
    if (boot) return boot;
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      return Promise.reject(new Error('Stockfish requires Web Workers and WebAssembly.'));
    }
    progress({ phase: 'download', fraction: 0, totalBytes: manifest.downloadBytes });
    boot = new Promise<void>((resolve, reject) => {
      let phase: 'uci' | 'ready' | 'done' = 'uci';
      const assetController = new AbortController();
      const timer = setTimeout(() => terminate(new Error('Stockfish initialization timed out.')), 30_000);
      closeBoot = (error) => { assetController.abort(); clearTimeout(timer); reject(error); };
      void (async () => { try {
        const path = `${import.meta.env.BASE_URL}chess-engines/stockfish/stockfish-19-lite-single.js`;
        // Emscripten can leave a rejected custom instantiate promise pending.
        // A tiny HEAD request makes missing assets fail immediately and also
        // catches a static host returning HTML for an unknown WASM URL.
        const wasmUrl = new URL(path.replace(/\.js$/, '.wasm'), document.baseURI);
        const current = new Worker(new URL(path, document.baseURI), { type: 'module', name: 'qcc-stockfish' });
        worker = current;
        current.onmessage = (event: MessageEvent<unknown>) => {
          if (worker !== current || typeof event.data !== 'string') return;
          for (const line of event.data.split('\n')) {
            if (phase === 'uci' && line === 'uciok') {
              phase = 'ready';
              progress({ phase: 'warmup', fraction: 0 });
              current.postMessage('setoption name Hash value 16');
              current.postMessage('setoption name Threads value 1');
              current.postMessage('setoption name Ponder value false');
              current.postMessage('ucinewgame');
              current.postMessage('isready');
            } else if (phase === 'ready' && line === 'readyok') {
              phase = 'done';
              clearTimeout(timer);
              closeBoot = undefined;
              closeProgress?.();
              closeProgress = undefined;
              progress({ phase: 'warmup', fraction: 1 });
              resolve();
            } else if (phase === 'done') active?.line(line);
          }
        };
        current.onerror = (event) => {
          event.preventDefault();
          if (worker === current) terminate(new Error(`Stockfish Worker failed: ${event.message || 'missing JS/WASM or unsupported device'}`));
        };
        current.onmessageerror = () => {
          if (worker === current) terminate(new Error('Stockfish Worker communication failed.'));
        };
        const channel = new MessageChannel();
        channel.port1.onmessage = (event: MessageEvent<{ loaded: number; total: number; percent: number }>) => {
          const p = event.data;
          if (worker !== current || phase !== 'uci') return;
          progress({ phase: p.percent >= 1 ? 'compile' : 'download', fraction: Math.max(0, Math.min(1, p.percent)),
            loadedBytes: p.loaded, totalBytes: p.total });
        };
        closeProgress = () => { channel.port1.close(); channel.port2.close(); };
        current.postMessage({ progressPort: channel.port2 }, [channel.port2]);
        // Worker compilation overlaps the preflight network round trip. Gate
        // the handshake on validation so broken asset hosts still fail early.
        const asset = await fetch(wasmUrl, { method: 'HEAD', signal: assetController.signal });
        if (!asset.ok || !asset.headers.get('content-type')?.includes('application/wasm')) {
          throw new Error(`Stockfish WASM unavailable or served with an incorrect MIME type (${asset.status}).`);
        }
        if (assetController.signal.aborted) throw abortError();
        current.postMessage('uci');
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      } })();
    });
    const opening = boot;
    const guarded = opening.catch((error: unknown) => {
      // Recovery searches also initialize lazily. Release a failed worker and
      // its progress ports here, including when initialize() was not called.
      if (boot === guarded) terminate(error instanceof Error ? error : new Error(String(error)));
      throw error;
    });
    boot = guarded;
    return guarded;
  }

  async function search(request: ChessAIMoveRequest | ChessAIAnalysisRequest, analyzing: boolean): Promise<ChessAIMoveResponse | ChessAIAnalysis> {
    const receivedAt = performance.now();
    if (request.signal.aborted) throw abortError();
    if (disposed) throw new ChessAIError('disposed', 'Stockfish is closed.');
    const command = positionCommand(request);
    if (!request.legalMovesUci.length) {
      if (analyzing) return { depth: 0, lines: [] };
      throw new Error('There are no legal moves in this position.');
    }
    if (active) terminate(abortError());
    const token = generation;
    const onAbort = () => terminate(abortError());
    request.signal.addEventListener('abort', onAbort, { once: true });
    const clock = 'clock' in request ? request.clock : undefined;
    const clockDeadline = clock ? receivedAt + Math.max(1, clock.remainingMs - 15) : undefined;
    const clockError = () => new ChessAIError('timeout', 'Stockfish could not answer before the chess clock deadline.');
    const clockTimer = clockDeadline === undefined ? undefined
      : setTimeout(() => terminate(clockError()), Math.max(1, clockDeadline - performance.now()));
    try {
      if (!analyzing && request.legalMovesUci.length === 1) {
        stockfishSettings((request as ChessAIMoveRequest).opponentId);
        const moveUci = request.legalMovesUci[0];
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveUci)) throw new Error('Invalid legal move.');
        if (clockDeadline !== undefined && performance.now() >= clockDeadline) throw clockError();
        return { moveUci };
      }
      await ready();
      if (request.signal.aborted || token !== generation) throw abortError();
      if (clockDeadline !== undefined && performance.now() >= clockDeadline) throw clockError();
      const current = worker!;
      const budget = Math.max(1, Math.floor(searchBudget(request) - (performance.now() - receivedAt)));
      const multiPv = analyzing ? Math.max(1, Math.min(5, Math.floor((request as ChessAIAnalysisRequest).multiPv))) : 1;
      const infos = new Map<number, UciInfo>();
      const result = await new Promise<ChessAIMoveResponse | ChessAIAnalysis>((resolve, reject) => {
        let settled = false;
        const finish = (error?: Error, value?: ChessAIMoveResponse | ChessAIAnalysis) => {
          if (settled) return;
          settled = true;
          clearTimeout(stopTimer);
          clearTimeout(timer);
          active = undefined;
          error ? reject(error) : resolve(value!);
        };
        const stopTimer = setTimeout(() => current.postMessage('stop'), budget + 50);
        const timer = setTimeout(() => terminate(new ChessAIError('timeout', 'Stockfish did not stop within its search budget.')), budget + 2_000);
        active = {
          fail: (error) => finish(error),
          line(line) {
            if (worker !== current || token !== generation) return;
            if (clockDeadline !== undefined && performance.now() >= clockDeadline) { terminate(clockError()); return; }
            const info = parseInfo(line, request.fen.split(' ')[1] === 'w');
            if (info && request.legalMovesUci.includes(info.pvUci[0]) && info.multiPv <= multiPv) infos.set(info.multiPv, info);
            if (!line.startsWith('bestmove ')) return;
            const moveUci = line.split(/\s+/)[1];
            if (!request.legalMovesUci.includes(moveUci)) {
              finish(new Error(`Stockfish returned an invalid best move: ${moveUci}`));
              return;
            }
            if (analyzing) {
              const best = infos.get(1);
              if (!best) { finish(new Error('Stockfish returned no complete analysis line.')); return; }
              // Return only the deepest complete iteration, never a mixture of depths.
              const lines = [...infos.values()].filter((i) => i.depth === best.depth).sort((a, b) => a.multiPv - b.multiPv);
              finish(undefined, { depth: best.depth, lines: lines.map(({ pvUci, evaluationCp, mateIn }) => ({ pvUci,
                ...(evaluationCp === undefined ? {} : { evaluationCp }), ...(mateIn === undefined ? {} : { mateIn }) })) });
            } else {
              const best = infos.get(1);
              // LimitStrength can deliberately choose a move outside the strongest PV.
              // Never attach that PV or score to the weaker selected move.
              finish(undefined, { moveUci, ...(best?.pvUci[0] === moveUci ? {
                depth: best.depth, pvUci: best.pvUci,
                ...(best.evaluationCp === undefined ? {} : { evaluationCp: best.evaluationCp }),
                ...(best.mateIn === undefined ? {} : { mateIn: best.mateIn }),
              } : {}) });
            }
          },
        };
        const settings = analyzing ? stockfishSettings('max') : stockfishSettings((request as ChessAIMoveRequest).opponentId);
        for (const setting of settings) current.postMessage(setting);
        current.postMessage(`setoption name MultiPV value ${multiPv}`);
        current.postMessage(command);
        current.postMessage(`go movetime ${budget} searchmoves ${request.legalMovesUci.join(' ')}`);
      });
      return result;
    } finally { clearTimeout(clockTimer); request.signal.removeEventListener('abort', onAbort); }
  }

  return {
    manifest,
    async initialize(options) {
      if (options.signal.aborted) throw abortError();
      progress = options.onProgress;
      const abort = () => terminate(abortError());
      options.signal.addEventListener('abort', abort, { once: true });
      try { await ready(); } catch (error) { terminate(error instanceof Error ? error : new Error(String(error))); throw error; }
      finally { options.signal.removeEventListener('abort', abort); }
    },
    chooseMove: (request) => search(request, false) as Promise<ChessAIMoveResponse>,
    analyze: (request) => search(request, true) as Promise<ChessAIAnalysis>,
    cancel() {
      // Also invalidate a request awaiting an already-resolved initialization
      // promise, before its search callback has had a chance to run.
      // Termination guarantees immediate release even on throttled mobile tabs.
      worker?.postMessage('stop');
      terminate(abortError());
    },
    dispose() { if (!disposed) { disposed = true; terminate(new ChessAIError('disposed', 'Stockfish is closed.')); } },
  };
}
