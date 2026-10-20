export interface RuntimeFeatures {
  secure: boolean;
  isolated: boolean;
  sharedMemory: boolean;
  offscreenCanvas: boolean;
  jspi: boolean;
  webgl2: boolean;
}
export function capabilityProblem(features: RuntimeFeatures): string | null;
export function observeRuntimeErrors(surface: EventTarget, runtimeDirectory: string | URL, report: (error: Error) => void): () => void;
export function startNativeOperation<T>(work: () => T | PromiseLike<T>): {promise: Promise<T>; fail: (reason?: unknown) => void};
export function nativeSaveProblem(output: unknown): string | null;
export function nativeExitProblem(status: number, reportedFailure: string | null): string | null;
export interface ParentCommand {
  type: 'QCC_VOXELIBRE_COMMAND';
  command: 'pause' | 'resume' | 'quit' | 'settings';
  requestId?: string;
  settings?: {sound: boolean; reducedMotion: boolean};
}
export function parseParentCommand(event: {source: unknown; origin: string; data: unknown}, origin: string, parentWindow: unknown): ParentCommand | null;
export interface WorldZipEntry {
  path: string;
  method: number;
  size: number;
  compressed: number;
  start: number;
}
export interface WorldZipInfo {
  prefix: string;
  count: number;
  expanded: number;
  marker: WorldZipEntry;
}
export function inspectWorldZip(buffer: ArrayBuffer | Uint8Array, limits?: {maxCompressed?: number; maxExpanded?: number; maxEntries?: number}): WorldZipInfo;
export function readWorldMetadata(buffer: ArrayBuffer | Uint8Array, info: WorldZipInfo): Promise<{gameid: 'mineclone2'; name: string}>;
