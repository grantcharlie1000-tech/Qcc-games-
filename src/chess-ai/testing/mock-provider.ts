import type { ChessAIProviderSource } from '../loader';
import type {
  ChessAIAnalysis,
  ChessAIAnalysisRequest,
  ChessAIMoveRequest,
  ChessAIMoveResponse,
  ChessAIProvider,
  ChessAIProviderManifest,
} from '../types';

/**
 * Test-only provider. It lives outside ./providers, so discovery never finds it
 * and it is never offered to players. It plays the first legal move unless told
 * otherwise, and records every request it receives.
 */
export interface MockProviderOptions {
  readonly manifest?: Partial<ChessAIProviderManifest>;
  /** Override the answer. Receives the request the registry sent. */
  readonly choose?: (request: ChessAIMoveRequest) => ChessAIMoveResponse | Promise<ChessAIMoveResponse>;
  readonly analyze?: (request: ChessAIAnalysisRequest) => ChessAIAnalysis | Promise<ChessAIAnalysis>;
  /** Milliseconds before answering. Honours abort. */
  readonly delayMs?: number;
  /** Reject initialize with this message. */
  readonly failInit?: string;
  /** Reject module loading with this message. */
  readonly failLoad?: string;
  /** Never finish initialize (until its signal aborts). */
  readonly hangInit?: boolean;
  /** Return a provider without analyze() even if `analyze` is given. */
  readonly omitAnalyze?: boolean;
}

export interface MockProviderProbe {
  readonly requests: ChessAIMoveRequest[];
  readonly analysisRequests: ChessAIAnalysisRequest[];
  /** Ordered lifecycle log: "go <revision>", "stop", "dispose". */
  readonly log: string[];
  created: number;
  initialized: number;
  cancelled: number;
  disposed: number;
}

export function createMockProviderSource(options: MockProviderOptions = {}): { source: ChessAIProviderSource; probe: MockProviderProbe } {
  const manifest: ChessAIProviderManifest = Object.freeze({
    id: 'mock',
    name: 'Mock engine',
    version: '0.0.0',
    engine: 'custom',
    license: 'MIT',
    opponents: ['elo-300'],
    analysis: Boolean(options.analyze),
    ...options.manifest,
  });
  const probe: MockProviderProbe = { requests: [], analysisRequests: [], log: [], created: 0, initialized: 0, cancelled: 0, disposed: 0 };

  const wait = (signal: AbortSignal, ms: number) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => { clearTimeout(t); reject(signal.reason); };
    const t = Number.isFinite(ms) ? setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms) : undefined;
    signal.addEventListener('abort', onAbort, { once: true });
  });

  const createProvider = (): ChessAIProvider => {
    probe.created++;
    const provider: ChessAIProvider = {
      manifest,
      async initialize({ onProgress, signal }) {
        onProgress({ phase: 'download', fraction: 0.5, loadedBytes: 1, totalBytes: 2 });
        if (options.failInit) throw new Error(options.failInit);
        if (options.hangInit) await wait(signal, Infinity);
        onProgress({ phase: 'warmup', fraction: 1 });
        probe.initialized++;
      },
      async chooseMove(request) {
        probe.requests.push(request);
        probe.log.push(`go ${request.positionRevision}`);
        await wait(request.signal, options.delayMs ?? 0);
        if (options.choose) return options.choose(request);
        return { moveUci: request.legalMovesUci[0] };
      },
      cancel() { probe.cancelled++; probe.log.push('stop'); },
      dispose() { probe.disposed++; probe.log.push('dispose'); },
    };
    if (options.analyze && !options.omitAnalyze) {
      const analyze = options.analyze;
      provider.analyze = async (request) => {
        probe.analysisRequests.push(request);
        await wait(request.signal, options.delayMs ?? 0);
        return analyze(request);
      };
    }
    return provider;
  };

  return {
    probe,
    source: {
      manifest,
      async load() {
        if (options.failLoad) throw new Error(options.failLoad);
        return { createProvider };
      },
    },
  };
}
