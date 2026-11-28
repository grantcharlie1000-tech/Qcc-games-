import { LuaConfigurationError, OrderedDefines } from './defines';
import type { OrderedLuaChunk } from './defines';
import { validateCapturedBaseSource, validateNativeBasePath } from './local-source';
import { NativeLoaderError } from './loader-protocol';
import type { CapturedBaseSource, NativeBaseManifest, NativeInputIdentity, NativeLoaderFailure, NativeLoaderPhase, NativeLoaderProgress } from './loader-protocol';
import { enumerateNativeVirtualFiles } from './virtual-files';
import type { NativeVfsDependencies } from './virtual-files';
import { clausewitzAssignments, ingestRawWorld, parseClausewitz } from './world-data';
import type { RawWorldData } from './world-data';
import { NativeBaseFiles } from './base-files';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
const recoveryTargetSha256 = '709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148';
const assumptions = [
  'One explicitly selected loose base tree; active launcher selections, DLC, archives and mods are unresolved.',
  'PHYSFS listings are supplied by the captured browser index, with regular-file/directory types and empty metadata.',
  'Search roots and replacement pairs are explicitly empty; no active native mount state is inferred.',
  'Stat, owning-stream construction, buffering, read-all and stream/vector destruction use recovered callers over one authored browser mount; File/Blob metadata and bytes supply individual provider leaves.',
  'Paths are ASCII; authored world text uses fatal UTF-8; Lua chunk and result strings preserve bytes.',
  'Lua 5.1.1 is a candidate dependency with recovered adapters, not whole embedded-VM or host-binding parity.',
  'World parsing joins raw declarations and pixels; history, ownership, localization and native state are unresolved.',
  'loaderBuildId is an adapter version label, not a source-code digest or executable identity of imported files.',
];

const fail = (phase: NativeLoaderPhase, code: string, message: string, path?: string): never => {
  throw new NativeLoaderError({ phase, code, message, ...(path === undefined ? {} : { path }) });
};

export function nativeLoaderFailure(error: unknown, phase: NativeLoaderPhase): NativeLoaderFailure {
  if (error instanceof NativeLoaderError) return error.detail;
  if (error instanceof LuaConfigurationError) return { phase: error.phase === 'read' ? 'query' : 'lua', code: 'lua-failed', path: error.path, message: error.message };
  return { phase, code: 'unexpected-error', message: error instanceof Error ? error.message : 'Content loading failed.' };
}

async function digest(bytes: Uint8Array, path?: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) fail('hash', 'hash-unavailable', 'Content hashing is unavailable.', path);
    // This owned copy also prevents a caller from mutating supplied runtime bytes during hashing.
    const buffer = new Uint8Array(bytes).buffer;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(value => value.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    if (error instanceof NativeLoaderError) throw error;
    return fail('hash', 'hash-failed', 'Content hashing failed.', path);
  }
}

function text(bytes: Uint8Array, path: string): string {
  try { return decoder.decode(bytes); }
  catch { return fail('world', 'invalid-text', 'World text is not valid UTF-8.', path); }
}

export interface NativeBaseLoaderOptions {
  readonly runtimeBytes: Uint8Array;
  readonly onProgress?: (progress: NativeLoaderProgress) => void;
}

export class LoadedNativeBaseInspection {
  constructor(readonly manifest: NativeBaseManifest, readonly world: RawWorldData, readonly defines: OrderedDefines) {}
  close(): void { this.defines.close(); }
}

/** New integration plumbing over recovered VFS/Lua components and an authored raw-world adapter. */
export async function loadNativeBaseInspection(source: CapturedBaseSource, options: NativeBaseLoaderOptions): Promise<LoadedNativeBaseInspection> {
  const captured = validateCapturedBaseSource(source);
  const progress = options.onProgress ?? (() => {});
  progress({ phase: 'capture', done: captured.files.length, total: captured.files.length });
  const files = new Map(captured.files.map(file => [file.path, file.blob]));
  const nativeFiles = new NativeBaseFiles(captured);
  const listings = new Map<string, { name: Uint8Array; rawFileType: number; rawMetadata: Uint8Array }[]>();
  for (const directory of captured.directories) listings.set(directory, []);
  const append = (path: string, rawFileType: number) => {
    const slash = path.lastIndexOf('/');
    const parent = path.slice(0, slash), name = path.slice(slash + 1);
    listings.get(parent)?.push({ name: encoder.encode(name), rawFileType, rawMetadata: new Uint8Array() });
  };
  for (const directory of captured.directories) append(directory, 1);
  for (const file of captured.files) append(file.path, 0);
  const dependencies: NativeVfsDependencies = {
    enumerate(directory) {
      const entries = listings.get(decoder.decode(directory));
      return { succeeded: entries !== undefined, entries: entries ?? [] };
    },
    stat() { return fail('select', 'unexpected-stat', 'Unexpected stat request in the supplied loose-tree model.'); },
    getRealDir() { return fail('select', 'unexpected-root-resolution', 'Unexpected physical-root request in the supplied loose-tree model.'); },
  };
  const select = (directory: string, suffix: string, maximumDepth: number): string[] => {
    const result = enumerateNativeVirtualFiles({ directory: encoder.encode(directory), outputPrefix: new Uint8Array(), suffix: encoder.encode(suffix), contains: null, currentDepth: 0, maximumDepth }, { searchRoots: [], replacementPairs: [] }, dependencies);
    if (result.kind !== 'returned' || result.diagnostics.length) fail('select', 'enumeration-failed', 'Base file enumeration failed.', directory);
    return result.files.map(file => {
      const path = directory + '/' + decoder.decode(file.name);
      if (!files.has(path)) fail('select', 'missing-selected-file', 'Selected file is absent from the captured index.', path);
      return path;
    });
  };
  progress({ phase: 'select', done: 0, total: 1 });
  const definePathsInExecutionOrder = select('common/defines', 'lua', -1);
  const statePathsInAdapterOrder = select('history/states', '.txt', 0);
  if (!definePathsInExecutionOrder.length) fail('select', 'missing-defines', 'No base define chunks were selected.', 'common/defines');
  if (!statePathsInAdapterOrder.length) fail('select', 'missing-states', 'No base state files were selected.', 'history/states');
  progress({ phase: 'select', done: 1, total: 1 });

  const identities = new Map<string, NativeInputIdentity>();
  const contents = new Map<string, Uint8Array>();
  let readTotal: number | undefined;
  const read = async (path: string): Promise<Uint8Array> => {
    const cached = contents.get(path);
    if (cached) return cached;
    const bytes = await nativeFiles.read(path);
    const sha256 = await digest(bytes, path);
    contents.set(path, bytes);
    identities.set(path, { path, bytes: bytes.byteLength, sha256 });
    progress({ phase: 'read', done: identities.size, ...(readTotal === undefined ? {} : { total: readTotal }) });
    return bytes;
  };
  const defaultPath = 'map/default.map';
  const defaultBytes = await read(defaultPath);
  let mapPaths: NativeBaseManifest['mapPaths'];
  try {
    const document = parseClausewitz(text(defaultBytes, defaultPath), defaultPath);
    const declared = (key: string): string => {
      const matches = clausewitzAssignments(document, key);
      const assignment = matches[0];
      if (matches.length !== 1 || !assignment || assignment.operator !== '=' || assignment.value.kind !== 'scalar') {
        return fail('world', 'invalid-map-declaration', `Expected one ${key} declaration.`, defaultPath);
      }
      const relative = assignment.value.text;
      try { validateNativeBasePath(relative); }
      catch { return fail('world', 'invalid-map-path', 'Map declaration must stay beneath map/.', defaultPath); }
      return 'map/' + relative;
    };
    mapPaths = { defaultMap: defaultPath, definitions: declared('definitions'), provinces: declared('provinces') };
  } catch (error) {
    if (error instanceof NativeLoaderError) throw error;
    return fail('world', 'invalid-default-map', error instanceof Error ? error.message : 'Invalid map/default.map.', defaultPath);
  }
  readTotal = new Set([defaultPath, ...definePathsInExecutionOrder, mapPaths.definitions, mapPaths.provinces, ...statePathsInAdapterOrder]).size;
  progress({ phase: 'read', done: identities.size, total: readTotal });
  const chunks: OrderedLuaChunk[] = [];
  for (const path of definePathsInExecutionOrder) chunks.push({ path, source: await read(path) });
  const definitions = text(await read(mapPaths.definitions), mapPaths.definitions);
  const bitmap = await read(mapPaths.provinces);
  const stateFiles: { source: string; text: string }[] = [];
  for (const path of statePathsInAdapterOrder) stateFiles.push({ source: path, text: text(await read(path), path) });

  const runtimeBytes = new Uint8Array(options.runtimeBytes);
  progress({ phase: 'runtime', done: 0, total: 1 });
  const runtimeSha256 = await digest(runtimeBytes, 'lua51/runtime.wasm');
  let defines: OrderedDefines;
  try {
    progress({ phase: 'lua', done: 0, total: chunks.length });
    defines = await OrderedDefines.load(chunks, { wasmBinary: runtimeBytes });
  } catch (error) {
    if (error instanceof LuaConfigurationError) throw new NativeLoaderError(nativeLoaderFailure(error, 'lua'));
    return fail('runtime', 'runtime-failed', error instanceof Error ? error.message : 'Lua runtime initialization failed.');
  }
  try {
    progress({ phase: 'runtime', done: 1, total: 1 });
    progress({ phase: 'lua', done: chunks.length, total: chunks.length });
    progress({ phase: 'world', done: 0, total: 1 });
    let world: RawWorldData;
    try { world = ingestRawWorld(definitions, bitmap, stateFiles); }
    catch (error) { return fail('world', 'invalid-world', error instanceof Error ? error.message : 'World parsing failed.'); }
    const errors = world.issues.filter(issue => issue.severity === 'error');
    if (errors.length) fail('world', 'world-validation', errors.slice(0, 3).map(issue => issue.detail).join('\n'));
    progress({ phase: 'world', done: 1, total: 1 });
    const payload: Omit<NativeBaseManifest, 'snapshotId'> = {
      schema: 1, scope: 'base-loose-explicit', loaderBuildId: 'base-loose-explicit-v3', recoveryTargetSha256,
      directoryCoverage: 'inferred-from-files', directories: captured.directories,
      inputs: [...identities.values()].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0),
      definePathsInExecutionOrder, statePathsInAdapterOrder, mapPaths,
      vfsInput: { searchRoots: [], replacementPairs: [] },
      fileAccess: nativeFiles.report,
      luaRuntime: { candidate: 'Lua 5.1.1', bytes: runtimeBytes.byteLength, sha256: runtimeSha256 }, assumptions,
    };
    const manifest: NativeBaseManifest = { ...payload, snapshotId: await digest(encoder.encode(JSON.stringify(payload))) };
    return new LoadedNativeBaseInspection(manifest, world, defines);
  } catch (error) {
    defines.close();
    throw error;
  }
}
