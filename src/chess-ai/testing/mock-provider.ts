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
}

export interface MockProviderProbe {
  readonly requests: ChessAIMoveRequest[];
  readonly analysisRequests: ChessAIAnalysisRequest[];
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
  const probe: MockProviderProbe = { requests: [], analysisRequests: [], created: 0, initialized: 0, cancelled: 0, disposed: 0 };

  const wait = (signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (!options.delayMs) return resolve();
    const t = setTimeout(resolve, options.delayMs);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });

  const createProvider = (): ChessAIProvider => {
    probe.created++;
    const provider: ChessAIProvider = {
      manifest,
      async initialize({ onProgress }) {
        onProgress({ phase: 'download', fraction: 0.5, loadedBytes: 1, totalBytes: 2 });
        if (options.failInit) throw new Error(options.failInit);
        onProgress({ phase: 'warmup', fraction: 1 });
        probe.initialized++;
      },
      async chooseMove(request) {
        probe.requests.push(request);
        await wait(request.signal);
        if (options.choose) return options.choose(request);
        return { moveUci: request.legalMovesUci[0] };
      },
      cancel() { probe.cancelled++; },
      dispose() { probe.disposed++; },
    };
    if (options.analyze) {
      const analyze = options.analyze;
      provider.analyze = async (request) => {
        probe.analysisRequests.push(request);
        await wait(request.signal);
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
