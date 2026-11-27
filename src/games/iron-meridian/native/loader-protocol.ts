import type { LuaValue } from './defines';
import type { RawWorldData } from './world-data';
import type { NativeBaseFileReport } from './base-files';

export interface CapturedBaseSource {
  readonly scope: 'base-loose-explicit';
  readonly label: string;
  readonly acquisition: 'directory-input';
  readonly directoryCoverage: 'inferred-from-files';
  readonly directories: readonly string[];
  readonly files: readonly { readonly path: string; readonly blob: Blob }[];
}

export interface NativeInputIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface NativeBaseManifest {
  readonly schema: 1;
  readonly scope: 'base-loose-explicit';
  readonly snapshotId: string;
  /** A version label for the adapter contract, not a hash of all app source. */
  readonly loaderBuildId: 'base-loose-explicit-v3';
  readonly recoveryTargetSha256: string;
  readonly directoryCoverage: 'inferred-from-files';
  readonly directories: readonly string[];
  readonly inputs: readonly NativeInputIdentity[];
  readonly definePathsInExecutionOrder: readonly string[];
  readonly statePathsInAdapterOrder: readonly string[];
  readonly mapPaths: { readonly defaultMap: 'map/default.map'; readonly definitions: string; readonly provinces: string };
  readonly vfsInput: { readonly searchRoots: readonly []; readonly replacementPairs: readonly [] };
  readonly fileAccess: NativeBaseFileReport;
  readonly luaRuntime: { readonly candidate: 'Lua 5.1.1'; readonly bytes: number; readonly sha256: string };
  readonly assumptions: readonly string[];
}

export type NativeLoaderPhase = 'capture' | 'select' | 'read' | 'hash' | 'runtime' | 'lua' | 'world' | 'query';
export interface NativeLoaderFailure {
  readonly phase: NativeLoaderPhase;
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export class NativeLoaderError extends Error {
  constructor(readonly detail: NativeLoaderFailure) {
    super(detail.message);
    this.name = 'NativeLoaderError';
  }
}

export interface NativeLoaderProgress {
  readonly phase: NativeLoaderPhase;
  readonly done: number;
  readonly total?: number;
}

export type NativeLoaderRequest =
  | { readonly type: 'load'; readonly sessionId: number; readonly source: CapturedBaseSource }
  | { readonly type: 'query-define'; readonly sessionId: number; readonly requestId: number; readonly root: string; readonly section?: string; readonly key?: string }
  | { readonly type: 'close'; readonly sessionId: number };

export type NativeLoaderResponse =
  | ({ readonly type: 'progress'; readonly sessionId: number } & NativeLoaderProgress)
  | { readonly type: 'ready'; readonly sessionId: number; readonly manifest: NativeBaseManifest; readonly world: RawWorldData }
  | { readonly type: 'define-result'; readonly sessionId: number; readonly requestId: number; readonly value: LuaValue }
  | { readonly type: 'failed'; readonly sessionId: number; readonly requestId?: number; readonly error: NativeLoaderFailure };
