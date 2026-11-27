export interface NativeReplacementPair {
  readonly physicalRoot: Uint8Array;
  readonly virtualDirectory: Uint8Array;
}

export interface NativeVfsState {
  readonly searchRoots: readonly Uint8Array[];
  readonly replacementPairs: readonly NativeReplacementPair[];
}

export interface NativeVfsEntry {
  readonly name: Uint8Array;
  readonly rawFileType: number;
  readonly rawMetadata: Uint8Array;
}

export interface NativeVfsDependencies {
  enumerate(directory: Uint8Array): { readonly succeeded: boolean; readonly entries: readonly NativeVfsEntry[] };
  stat(path: Uint8Array): { readonly succeeded: boolean; readonly rawFileType: number };
  getRealDir(path: Uint8Array): Uint8Array | null;
}

export interface NativeVirtualFile {
  readonly name: Uint8Array;
  readonly rawMetadata: Uint8Array;
}

export interface NativeVfsDiagnostic {
  readonly kind: 'enumerate-failed' | 'stat-failed';
  readonly path: Uint8Array;
}

export interface NativeVfsRequest {
  readonly directory: Uint8Array;
  readonly outputPrefix: Uint8Array;
  readonly suffix: Uint8Array | null;
  readonly contains: Uint8Array | null;
  readonly currentDepth: number;
  readonly maximumDepth: number;
}

export type NativeVfsResult = {
  readonly files: readonly NativeVirtualFile[];
  readonly diagnostics: readonly NativeVfsDiagnostic[];
} & (
  | { readonly kind: 'returned' }
  | { readonly kind: 'depth-exceeded'; readonly directory: Uint8Array; readonly depth: number; readonly maximumDepth: number }
);

const cString = (bytes: Uint8Array): Uint8Array => {
  const end = bytes.indexOf(0);
  return bytes.slice(0, end < 0 ? bytes.length : end);
};

const join = (...parts: readonly Uint8Array[]): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
};

/** VA 0x1426078D0 plus the callers' common-prefix length comparison. */
export function compareNativeVfsNames(left: Uint8Array, right: Uint8Array): -1 | 0 | 1 {
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    if (left[index] !== right[index]) return left[index]! < right[index]! ? -1 : 1;
  }
  return left.length < right.length ? -1 : left.length > right.length ? 1 : 0;
}

const same = (left: Uint8Array, right: Uint8Array) => compareNativeVfsNames(left, right) === 0;

/** Byte search used by the recovered substring helpers. No case or locale conversion. */
export function findNativeVfsBytes(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let index = 0; index <= haystack.length - needle.length; index++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return -1;
}

/** VA 0x14254E4B0 for ordinary C-string filename/suffix lengths below INT32_MAX. */
export function hasNativeVfsSuffix(name: Uint8Array, suffix: Uint8Array): boolean {
  if (name.length < suffix.length) return false;
  return same(name.subarray(name.length - suffix.length), suffix);
}

/** Root setter 0x14255FE50 and pair writer 0x14255FF40, with supplied inputs. */
export function nativeVfsStateAfterWrites(
  searchRoots: readonly Uint8Array[],
  writes: readonly { readonly virtualDirectory: Uint8Array; readonly physicalRoot: Uint8Array }[],
): NativeVfsState {
  const normalize = (bytes: Uint8Array) => cString(bytes).map(byte => byte === 92 ? 47 : byte);
  return {
    searchRoots: searchRoots.map(normalize),
    replacementPairs: writes.map(pair => ({ physicalRoot: normalize(pair.physicalRoot), virtualDirectory: normalize(pair.virtualDirectory) })),
  };
}

/** Port of the supplied-listing selection path at VA 0x14255E970 and callback 0x14255F720.
 * Native allocation, logging and exception representations are not reproduced.
 */
export function enumerateNativeVirtualFiles(
  request: NativeVfsRequest,
  state: NativeVfsState,
  dependencies: NativeVfsDependencies,
): NativeVfsResult {
  const files: NativeVirtualFile[] = [];
  const diagnostics: NativeVfsDiagnostic[] = [];
  const maximumDepth = request.maximumDepth | 0;
  const suffix = request.suffix === null ? null : cString(request.suffix);
  const contains = request.contains === null ? null : cString(request.contains);
  const slash = new Uint8Array([47]);
  let exceeded: { kind: 'depth-exceeded'; directory: Uint8Array; depth: number; maximumDepth: number } | undefined;

  function visit(directory: Uint8Array, outputPrefix: Uint8Array, depth: number): void {
    if (maximumDepth >= 1 && depth > maximumDepth) {
      exceeded = { kind: 'depth-exceeded', directory: directory.slice(), depth, maximumDepth };
      return;
    }
    let rootBound = 0x7fff_ffff;
    for (const pair of state.replacementPairs) {
      if (!same(pair.virtualDirectory, directory)) continue;
      const index = state.searchRoots.findIndex(root => same(pair.physicalRoot, cString(root)));
      if (index >= 0 && index < rootBound) rootBound = index;
    }

    const listing = dependencies.enumerate(directory.slice());
    const filesByName = new Map<string, NativeVirtualFile>();
    const directories: Uint8Array[] = [];
    // Callbacks can occur before PHYSFS_enumerate reports failure.
    for (const entry of listing.entries) {
      const name = cString(entry.name);
      let type = entry.rawFileType | 0;
      let metadata = entry.rawMetadata;
      if (type === 4) {
        const path = join(directory, slash, name);
        const resolved = dependencies.stat(path);
        if (!resolved.succeeded) { diagnostics.push({ kind: 'stat-failed', path }); continue; }
        type = resolved.rawFileType | 0;
        if (type !== 0 && type !== 1) continue;
        metadata = new Uint8Array();
      }
      if (type === 1) directories.push(name);
      else if (type === 0 || type === 2 || type === 3) {
        const identity = name.join(',');
        if (!filesByName.has(identity)) filesByName.set(identity, { name, rawMetadata: metadata.slice() });
      }
    }
    if (!listing.succeeded) { diagnostics.push({ kind: 'enumerate-failed', path: directory.slice() }); return; }

    const currentFiles = [...filesByName.values()].sort((left, right) => compareNativeVfsNames(left.name, right.name));
    for (const file of currentFiles) {
      if (suffix !== null && !hasNativeVfsSuffix(file.name, suffix)) continue;
      if (contains !== null && (findNativeVfsBytes(file.name, contains) | 0) < 0) continue;
      if (rootBound !== 0x7fff_ffff) {
        const realDir = dependencies.getRealDir(join(directory, slash, file.name));
        if (realDir === null) continue;
        let accepted = false;
        for (let index = 0; index <= rootBound; index++) {
          if (findNativeVfsBytes(cString(realDir), cString(state.searchRoots[index]!)) >= 0) { accepted = true; break; }
        }
        if (!accepted) continue;
      }
      files.push({ name: join(outputPrefix, file.name), rawMetadata: file.rawMetadata });
    }
    if (maximumDepth === 0) return;
    directories.sort(compareNativeVfsNames);
    let previous: Uint8Array | undefined;
    for (const name of directories) {
      if (previous !== undefined && same(previous, name)) continue;
      previous = name;
      visit(join(directory, slash, name), join(outputPrefix, name, slash), (depth + 1) | 0);
      if (exceeded) return;
    }
  }

  visit(cString(request.directory), request.outputPrefix.slice(), request.currentDepth | 0);
  return { ...(exceeded ?? { kind: 'returned' }), files, diagnostics };
}
