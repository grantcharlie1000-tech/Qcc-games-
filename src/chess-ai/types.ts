/**
 * Shared chess AI contract. Frozen once merged: changes need agreement between
 * the game owner (src/games/chess) and the engine owner (src/chess-ai/providers).
 *
 * Moves are UCI strings in long algebraic form: "e2e4", "e7e8q", "e1g1" (castling
 * is the king's two-square move). Evaluations are always from White's point of view.
 */

/** Engine families named by the opponent catalog. Providers may use any other lowercase family name. */
export type KnownChessEngineFamily = 'custom' | 'lightweight' | 'dala' | 'maia' | 'stockfish' | 'leela';
export type ChessEngineFamily = KnownChessEngineFamily | (string & {});

/** One opponent the game can offer. Data only; who plays it is decided by providers. */
export interface ChessAIOpponent {
  readonly id: string;
  readonly name: string;
  /** Desired playing strength. `null` means unrestricted. Not a measured rating. */
  readonly targetElo: number | null;
  /** Engines planned for this tier, best fit first. Informational. */
  readonly plannedEngines: readonly ChessEngineFamily[];
  /** Default thinking budget per move when the game has no clock pressure. */
  readonly defaultThinkingTimeMs: number;
}

/**
 * Static, import-free description of a provider. Lives in
 * `providers/<folder>/manifest.ts` as `export const manifest`.
 * It is read eagerly, so it must not import engine code.
 */
export interface ChessAIProviderManifest {
  /** Unique, stable, lowercase id, for example "stockfish-wasm". */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly engine: ChessEngineFamily;
  /** SPDX licence identifier of the engine and its weights, for example "GPL-3.0-or-later". */
  readonly license: string;
  /** Catalog opponent ids this provider can play. Unknown ids are ignored. */
  readonly opponents: readonly string[];
  /** True if the provider implements `analyze`. */
  readonly analysis: boolean;
  /** Approximate bytes downloaded on first initialize, for display. */
  readonly downloadBytes?: number;
  /** Higher wins when several providers play the same opponent. Default 0. */
  readonly priority?: number;
}

export interface ChessAIProgress {
  readonly phase: 'download' | 'compile' | 'warmup';
  /** 0..1 when known. */
  readonly fraction?: number;
  readonly loadedBytes?: number;
  readonly totalBytes?: number;
}

export interface ChessAIInitOptions {
  readonly signal: AbortSignal;
  onProgress(progress: ChessAIProgress): void;
}

/** A position for the engine. The game builds it from its own trusted rules layer. */
export interface ChessAIPosition {
  /** Current position. */
  readonly fen: string;
  /** Start position of the game, usually the standard start FEN. */
  readonly startFen: string;
  /** Moves from `startFen` to `fen`. */
  readonly moveHistoryUci: readonly string[];
  /** Every legal move in `fen`. A response outside this list is rejected. */
  readonly legalMovesUci: readonly string[];
  /**
   * Increases on every change of the game position (move, takeback, restart).
   * A request with a lower revision than one already sent is rejected as `stale`.
   */
  readonly positionRevision: number;
}

export interface ChessAIClock {
  /** Engine side's remaining time and increment, when the game is timed. */
  readonly remainingMs: number;
  readonly incrementMs: number;
}

export interface ChessAIMoveRequest extends ChessAIPosition {
  readonly opponentId: string;
  /** Soft budget for this move. Providers should answer within it. */
  readonly thinkingTimeMs: number;
  readonly clock?: ChessAIClock;
  /** Aborted when the move is no longer wanted (stale position, leaving, cancel). */
  readonly signal: AbortSignal;
}

export interface ChessAIMoveResponse {
  readonly moveUci: string;
  /** Centipawns, White's point of view. */
  readonly evaluationCp?: number;
  /** Moves to mate, positive if White mates, negative if Black mates. */
  readonly mateIn?: number;
  readonly depth?: number;
  /** Principal variation starting with `moveUci`. */
  readonly pvUci?: readonly string[];
}

export interface ChessAIAnalysisRequest extends ChessAIPosition {
  readonly thinkingTimeMs: number;
  /** Number of lines wanted. Providers may return fewer. */
  readonly multiPv: number;
  readonly signal: AbortSignal;
}

export interface ChessAIAnalysisLine {
  readonly pvUci: readonly string[];
  readonly evaluationCp?: number;
  readonly mateIn?: number;
}

export interface ChessAIAnalysis {
  readonly depth: number;
  /** Best line first. Empty only in a finished position. */
  readonly lines: readonly ChessAIAnalysisLine[];
}

/**
 * One engine instance. Created by the provider factory, owned by one game,
 * disposed by that game. Heavy work must run off the UI thread (Worker).
 */
export interface ChessAIProvider {
  readonly manifest: ChessAIProviderManifest;
  /** Load and warm up. Rejects if the engine cannot run here. Called once. */
  initialize(options: ChessAIInitOptions): Promise<void>;
  /** Must settle promptly after `request.signal` aborts. */
  chooseMove(request: ChessAIMoveRequest): Promise<ChessAIMoveResponse>;
  /** Present only when `manifest.analysis` is true. */
  analyze?(request: ChessAIAnalysisRequest): Promise<ChessAIAnalysis>;
  /**
   * Stop the search in progress. The loader calls it synchronously when a
   * request's signal aborts, before any newer request is sent, so stopping
   * "whatever is running now" is correct. Safe to call at any time.
   */
  cancel(): void;
  /** Release Workers, memory and listeners. Safe to call twice. */
  dispose(): void;
}

/** Shape of `providers/<folder>/index.ts`. Loaded lazily. */
export interface ChessAIProviderModule {
  createProvider(): ChessAIProvider;
}

export type ChessAIErrorCode =
  | 'unavailable' // no provider declares the opponent, or analysis
  | 'init-failed' // provider failed to load or start
  | 'aborted' // caller aborted
  | 'stale' // a newer position replaced this request
  | 'timeout' // no answer within the hard deadline
  | 'illegal-move' // provider answered a move not in legalMovesUci
  | 'engine-error' // provider threw or returned malformed data
  | 'invalid-request' // the game sent a malformed position
  | 'disposed'; // session already disposed

export class ChessAIError extends Error {
  readonly code: ChessAIErrorCode;
  constructor(code: ChessAIErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ChessAIError';
    this.code = code;
  }
}

export type ChessAIAvailability =
  | { readonly state: 'unavailable' }
  | { readonly state: 'available'; readonly provider: ChessAIProviderManifest };

export interface ChessAIOpponentStatus {
  readonly opponent: ChessAIOpponent;
  readonly availability: ChessAIAvailability;
}
