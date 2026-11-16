import { CHESS_AI_OPPONENTS } from './catalog';
import {
  ChessAIError,
  type ChessAIAnalysis,
  type ChessAIAnalysisLine,
  type ChessAIAvailability,
  type ChessAIClock,
  type ChessAIMoveResponse,
  type ChessAIOpponent,
  type ChessAIOpponentStatus,
  type ChessAIPosition,
  type ChessAIProgress,
  type ChessAIProvider,
  type ChessAIProviderManifest,
  type ChessAIProviderModule,
  type ChessEngineFamily,
} from './types';

/** A discovered provider: its eager manifest and its lazy module. */
export interface ChessAIProviderSource {
  readonly manifest: ChessAIProviderManifest;
  load(): Promise<ChessAIProviderModule>;
}

/** A provider folder that could not be used, with the reason. */
export interface ChessAIRejectedProvider {
  readonly path: string;
  readonly reason: string;
}

export interface ChessAIOpenOptions {
  readonly signal?: AbortSignal;
  onProgress?(progress: ChessAIProgress & { readonly provider: ChessAIProviderManifest }): void;
}

export interface ChessAIMoveInput extends ChessAIPosition {
  /** Defaults to the opponent's `defaultThinkingTimeMs`. */
  readonly thinkingTimeMs?: number;
  readonly clock?: ChessAIClock;
  readonly signal?: AbortSignal;
}

export interface ChessAIAnalysisInput extends ChessAIPosition {
  readonly thinkingTimeMs: number;
  readonly multiPv?: number;
  readonly signal?: AbortSignal;
}

/** A ready engine playing one opponent. */
export interface ChessAIOpponentSession {
  readonly opponent: ChessAIOpponent;
  readonly provider: ChessAIProviderManifest;
  /**
   * Ask for a move. A newer request rejects the older one with `stale`.
   * Resolves only with a move from `legalMovesUci`.
   */
  requestMove(input: ChessAIMoveInput): Promise<ChessAIMoveResponse>;
  /** Abort the pending request, if any, with `aborted`. */
  cancel(): void;
  dispose(): void;
}

/** A ready engine for post-game analysis. */
export interface ChessAIAnalysisSession {
  readonly provider: ChessAIProviderManifest;
  analyze(input: ChessAIAnalysisInput): Promise<ChessAIAnalysis>;
  cancel(): void;
  dispose(): void;
}

export interface ChessAIRegistry {
  /** Every catalog opponent with its real availability. */
  opponents(): readonly ChessAIOpponentStatus[];
  availability(opponentId: string): ChessAIAvailability;
  /** Manifest of the best analysis provider, if any. */
  analysisProvider(): ChessAIProviderManifest | undefined;
  /** Provider folders ignored because their manifest or module was invalid. */
  readonly rejected: readonly ChessAIRejectedProvider[];
  openOpponent(opponentId: string, options?: ChessAIOpenOptions): Promise<ChessAIOpponentSession>;
  openAnalysis(options?: ChessAIOpenOptions): Promise<ChessAIAnalysisSession>;
}

export interface ChessAIRegistryOptions {
  readonly opponents?: readonly ChessAIOpponent[];
  /** Extra time after `thinkingTimeMs` before a request fails with `timeout`. */
  readonly graceMs?: number;
  /** Folders rejected during discovery, reported through `rejected`. */
  readonly rejected?: readonly ChessAIRejectedProvider[];
}

const ENGINES: readonly ChessEngineFamily[] = ['custom', 'lightweight', 'dala', 'maia', 'stockfish', 'leela'];
const UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const DEFAULT_GRACE_MS = 10_000;

/** Checks an unknown value against the manifest contract. Returns a reason or undefined. */
export function manifestProblem(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return 'manifest is not an object';
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(m.id)) return 'id must be lowercase letters, digits and hyphens';
  for (const key of ['name', 'version', 'license'] as const) {
    if (typeof m[key] !== 'string' || !(m[key] as string).trim()) return `${key} must be a non-empty string`;
  }
  if (!ENGINES.includes(m.engine as never)) return 'engine is not a known engine family';
  if (!Array.isArray(m.opponents) || !m.opponents.every((o) => typeof o === 'string')) return 'opponents must be a string array';
  if (typeof m.analysis !== 'boolean') return 'analysis must be a boolean';
  if (m.downloadBytes !== undefined && !(Number.isFinite(m.downloadBytes) && (m.downloadBytes as number) >= 0)) return 'downloadBytes must be a nonnegative number';
  if (m.priority !== undefined && !Number.isFinite(m.priority)) return 'priority must be a number';
  return undefined;
}

type GlobMap<T> = Record<string, T>;

/**
 * Pairs `providers/<folder>/manifest.ts` (eager, data only) with
 * `providers/<folder>/index.ts` (lazy). Exported for tests; production uses
 * `discoverProviders()`.
 */
export function pairProviderModules(
  manifests: GlobMap<{ manifest?: unknown }>,
  modules: GlobMap<() => Promise<unknown>>,
): { sources: ChessAIProviderSource[]; rejected: ChessAIRejectedProvider[] } {
  const folderOf = (path: string) => path.replace(/\/(manifest|index)\.ts$/, '');
  const sources: ChessAIProviderSource[] = [];
  const folderOfSource = new Map<ChessAIProviderSource, string>();
  const rejected: ChessAIRejectedProvider[] = [];
  const folders = new Set([...Object.keys(manifests), ...Object.keys(modules)].map(folderOf));
  for (const folder of [...folders].sort()) {
    const manifest = manifests[`${folder}/manifest.ts`]?.manifest;
    const load = modules[`${folder}/index.ts`];
    if (!load) { rejected.push({ path: folder, reason: 'index.ts is missing' }); continue; }
    const problem = manifestProblem(manifest);
    if (problem) { rejected.push({ path: folder, reason: problem }); continue; }
    const m = manifest as ChessAIProviderManifest;
    const source: ChessAIProviderSource = {
      manifest: Object.freeze({ ...m, opponents: Object.freeze([...m.opponents]) }),
      async load() {
        const mod = (await load()) as Partial<ChessAIProviderModule> | undefined;
        if (typeof mod?.createProvider !== 'function') throw new Error(`${folder}/index.ts does not export createProvider()`);
        return mod as ChessAIProviderModule;
      },
    };
    sources.push(source);
    folderOfSource.set(source, folder);
  }
  // Two folders claiming one id are ambiguous, so neither is used.
  const count = new Map<string, number>();
  for (const s of sources) count.set(s.manifest.id, (count.get(s.manifest.id) ?? 0) + 1);
  for (const s of sources) if (count.get(s.manifest.id)! > 1) rejected.push({ path: folderOfSource.get(s)!, reason: `duplicate provider id ${s.manifest.id}` });
  return { sources: sources.filter((s) => count.get(s.manifest.id) === 1), rejected };
}

/** Finds every provider folder under ./providers using Vite's import.meta.glob. */
export function discoverProviders(): { sources: ChessAIProviderSource[]; rejected: ChessAIRejectedProvider[] } {
  return pairProviderModules(
    import.meta.glob<{ manifest?: unknown }>('./providers/*/manifest.ts', { eager: true }),
    import.meta.glob('./providers/*/index.ts'),
  );
}

function abortError(signal: AbortSignal | undefined): ChessAIError {
  const reason = signal?.reason;
  return reason instanceof ChessAIError ? reason : new ChessAIError('aborted', 'The request was aborted.');
}

/** Resolves or rejects with `work`, but rejects as soon as `signal` aborts. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    work.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

function linkSignal(controller: AbortController, outer: AbortSignal | undefined): () => void {
  if (!outer) return () => {};
  const forward = () => controller.abort(new ChessAIError('aborted', 'The request was aborted.'));
  if (outer.aborted) { forward(); return () => {}; }
  outer.addEventListener('abort', forward, { once: true });
  return () => outer.removeEventListener('abort', forward);
}

function optionalNumber(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value));
}

function checkPosition(input: ChessAIPosition): void {
  if (typeof input.fen !== 'string' || !input.fen) throw new ChessAIError('engine-error', 'fen is required.');
  if (!Array.isArray(input.legalMovesUci)) throw new ChessAIError('engine-error', 'legalMovesUci is required.');
  if (!Number.isInteger(input.positionRevision)) throw new ChessAIError('engine-error', 'positionRevision must be an integer.');
}

/** Validates a provider answer against the position the game sent. */
export function validateMoveResponse(value: unknown, legalMovesUci: readonly string[]): ChessAIMoveResponse {
  if (!value || typeof value !== 'object') throw new ChessAIError('engine-error', 'The engine returned no move.');
  const r = value as Record<string, unknown>;
  const move = typeof r.moveUci === 'string' ? r.moveUci.trim().toLowerCase() : '';
  if (!UCI.test(move)) throw new ChessAIError('engine-error', `The engine returned a malformed move: ${String(r.moveUci)}`);
  if (!legalMovesUci.includes(move)) throw new ChessAIError('illegal-move', `The engine returned an illegal move: ${move}`);
  if (!optionalNumber(r.evaluationCp) || !optionalNumber(r.mateIn) || !optionalNumber(r.depth)) {
    throw new ChessAIError('engine-error', 'The engine returned a malformed evaluation.');
  }
  const pv = Array.isArray(r.pvUci) && r.pvUci.every((m) => typeof m === 'string' && UCI.test(m)) && r.pvUci[0] === move
    ? Object.freeze([...(r.pvUci as string[])]) : undefined;
  return Object.freeze({
    moveUci: move,
    ...(r.evaluationCp !== undefined ? { evaluationCp: r.evaluationCp as number } : {}),
    ...(r.mateIn !== undefined ? { mateIn: r.mateIn as number } : {}),
    ...(r.depth !== undefined ? { depth: r.depth as number } : {}),
    ...(pv ? { pvUci: pv } : {}),
  });
}

/** Keeps analysis lines whose first move is legal; drops malformed ones. */
export function validateAnalysis(value: unknown, legalMovesUci: readonly string[]): ChessAIAnalysis {
  if (!value || typeof value !== 'object') throw new ChessAIError('engine-error', 'The engine returned no analysis.');
  const a = value as Record<string, unknown>;
  if (!Number.isFinite(a.depth) || !Array.isArray(a.lines)) throw new ChessAIError('engine-error', 'The engine returned malformed analysis.');
  const lines: ChessAIAnalysisLine[] = [];
  for (const raw of a.lines as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const l = raw as Record<string, unknown>;
    if (!Array.isArray(l.pvUci) || !l.pvUci.length || !l.pvUci.every((m) => typeof m === 'string' && UCI.test(m))) continue;
    if (!legalMovesUci.includes(l.pvUci[0] as string)) continue;
    if (!optionalNumber(l.evaluationCp) || !optionalNumber(l.mateIn)) continue;
    if (l.evaluationCp === undefined && l.mateIn === undefined) continue;
    lines.push(Object.freeze({
      pvUci: Object.freeze([...(l.pvUci as string[])]),
      ...(l.evaluationCp !== undefined ? { evaluationCp: l.evaluationCp as number } : {}),
      ...(l.mateIn !== undefined ? { mateIn: l.mateIn as number } : {}),
    }));
  }
  if (!lines.length && legalMovesUci.length) throw new ChessAIError('engine-error', 'The engine returned no usable line.');
  return Object.freeze({ depth: a.depth as number, lines: Object.freeze(lines) });
}

/**
 * Runs requests one at a time against one provider. A new request supersedes
 * the old one (`stale`); cancel aborts it (`aborted`); dispose ends everything.
 */
class RequestRunner {
  private current?: { controller: AbortController; revision: number };
  private disposed = false;
  constructor(private readonly provider: ChessAIProvider, private readonly graceMs: number) {}

  async run<T>(revision: number, budgetMs: number, outer: AbortSignal | undefined, call: (signal: AbortSignal) => Promise<unknown>, validate: (raw: unknown) => T): Promise<T> {
    if (this.disposed) throw new ChessAIError('disposed', 'The engine has been closed.');
    if (this.current) this.abortCurrent(new ChessAIError('stale', 'A newer position replaced this request.'));
    const controller = new AbortController();
    const entry = { controller, revision };
    this.current = entry;
    const unlink = linkSignal(controller, outer);
    const timer = setTimeout(() => controller.abort(new ChessAIError('timeout', 'The engine took too long.')), Math.max(0, budgetMs) + this.graceMs);
    try {
      let work: Promise<unknown>;
      try { work = Promise.resolve(call(controller.signal)); } catch (e) { work = Promise.reject(e); }
      const raw = await raceAbort(work.catch((e: unknown) => {
        if (e instanceof ChessAIError) throw e;
        throw new ChessAIError('engine-error', e instanceof Error ? e.message : 'The engine failed.', { cause: e });
      }), controller.signal);
      if (controller.signal.aborted) throw abortError(controller.signal);
      return validate(raw);
    } catch (e) {
      if (controller.signal.aborted) {
        try { this.provider.cancel(); } catch { /* provider cleanup is best effort */ }
      }
      throw e;
    } finally {
      clearTimeout(timer);
      unlink();
      if (this.current === entry) this.current = undefined;
    }
  }

  abortCurrent(reason: ChessAIError): void {
    const c = this.current;
    this.current = undefined;
    c?.controller.abort(reason);
  }

  dispose(): void {
    if (this.disposed) return;
    this.abortCurrent(new ChessAIError('disposed', 'The engine has been closed.'));
    this.disposed = true;
    try { this.provider.dispose(); } catch { /* provider cleanup is best effort */ }
  }
}

async function startProvider(candidates: readonly ChessAIProviderSource[], options: ChessAIOpenOptions | undefined): Promise<ChessAIProvider> {
  const signal = options?.signal;
  const failures: string[] = [];
  for (const source of candidates) {
    if (signal?.aborted) throw abortError(signal);
    let provider: ChessAIProvider | undefined;
    try {
      const mod = await source.load();
      if (signal?.aborted) throw abortError(signal);
      provider = mod.createProvider();
      if (!provider || typeof provider.initialize !== 'function' || typeof provider.chooseMove !== 'function'
        || typeof provider.cancel !== 'function' || typeof provider.dispose !== 'function') {
        provider = undefined;
        throw new Error('createProvider() did not return a ChessAIProvider');
      }
      const controller = new AbortController();
      const unlink = linkSignal(controller, signal);
      const started = provider;
      try {
        await raceAbort(Promise.resolve(started.initialize({
          signal: controller.signal,
          onProgress: (p) => { if (!controller.signal.aborted) options?.onProgress?.({ ...p, provider: source.manifest }); },
        })), controller.signal);
      } finally { unlink(); }
      return provider;
    } catch (e) {
      try { provider?.dispose(); } catch { /* best effort */ }
      if (signal?.aborted) throw abortError(signal);
      failures.push(`${source.manifest.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new ChessAIError('init-failed', `The engine could not start. ${failures.join('; ')}`.trim());
}

const byPriority = (a: ChessAIProviderSource, b: ChessAIProviderSource) =>
  (b.manifest.priority ?? 0) - (a.manifest.priority ?? 0) || a.manifest.id.localeCompare(b.manifest.id);

export function createChessAIRegistry(sources: readonly ChessAIProviderSource[], options: ChessAIRegistryOptions = {}): ChessAIRegistry {
  const opponents = options.opponents ?? CHESS_AI_OPPONENTS;
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const sorted = [...sources].sort(byPriority);
  const playersOf = (id: string) => sorted.filter((s) => s.manifest.opponents.includes(id));
  const analysts = () => sorted.filter((s) => s.manifest.analysis);

  const availability = (id: string): ChessAIAvailability => {
    const best = playersOf(id)[0];
    return best ? Object.freeze({ state: 'available', provider: best.manifest }) : Object.freeze({ state: 'unavailable' });
  };

  return {
    rejected: Object.freeze([...(options.rejected ?? [])]),
    opponents: () => opponents.map((opponent) => Object.freeze({ opponent, availability: availability(opponent.id) })),
    availability,
    analysisProvider: () => analysts()[0]?.manifest,

    async openOpponent(opponentId, openOptions) {
      const opponent = opponents.find((o) => o.id === opponentId);
      if (!opponent) throw new ChessAIError('unavailable', `Unknown opponent ${opponentId}.`);
      const candidates = playersOf(opponentId);
      if (!candidates.length) throw new ChessAIError('unavailable', `${opponent.name} is not installed.`);
      const provider = await startProvider(candidates, openOptions);
      const runner = new RequestRunner(provider, graceMs);
      return Object.freeze({
        opponent,
        provider: provider.manifest ?? candidates[0].manifest,
        requestMove(input: ChessAIMoveInput) {
          checkPosition(input);
          const thinkingTimeMs = input.thinkingTimeMs ?? opponent.defaultThinkingTimeMs;
          const legal = Object.freeze([...input.legalMovesUci]);
          return runner.run(input.positionRevision, thinkingTimeMs, input.signal, (signal) => provider.chooseMove(Object.freeze({
            opponentId,
            fen: input.fen,
            startFen: input.startFen,
            moveHistoryUci: Object.freeze([...input.moveHistoryUci]),
            legalMovesUci: legal,
            positionRevision: input.positionRevision,
            thinkingTimeMs,
            ...(input.clock ? { clock: Object.freeze({ ...input.clock }) } : {}),
            signal,
          })), (raw) => validateMoveResponse(raw, legal));
        },
        cancel: () => runner.abortCurrent(new ChessAIError('aborted', 'The request was cancelled.')),
        dispose: () => runner.dispose(),
      });
    },

    async openAnalysis(openOptions) {
      const candidates = analysts();
      if (!candidates.length) throw new ChessAIError('unavailable', 'Analysis is not installed.');
      const provider = await startProvider(candidates, openOptions);
      if (typeof provider.analyze !== 'function') {
        try { provider.dispose(); } catch { /* best effort */ }
        throw new ChessAIError('init-failed', 'The analysis engine does not implement analyze().');
      }
      const runner = new RequestRunner(provider, graceMs);
      return Object.freeze({
        provider: provider.manifest ?? candidates[0].manifest,
        analyze(input: ChessAIAnalysisInput) {
          checkPosition(input);
          const legal = Object.freeze([...input.legalMovesUci]);
          return runner.run(input.positionRevision, input.thinkingTimeMs, input.signal, (signal) => provider.analyze!(Object.freeze({
            fen: input.fen,
            startFen: input.startFen,
            moveHistoryUci: Object.freeze([...input.moveHistoryUci]),
            legalMovesUci: legal,
            positionRevision: input.positionRevision,
            thinkingTimeMs: input.thinkingTimeMs,
            multiPv: Math.max(1, Math.min(5, Math.floor(input.multiPv ?? 1))),
            signal,
          })), (raw) => validateAnalysis(raw, legal));
        },
        cancel: () => runner.abortCurrent(new ChessAIError('aborted', 'The request was cancelled.')),
        dispose: () => runner.dispose(),
      });
    },
  };
}
