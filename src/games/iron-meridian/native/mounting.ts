import { compareNativeVfsNames } from './virtual-files';

export interface NativeMountMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
  /** Successful native C++ string storage, including capacity changes. Copies value. */
  writeString(address: bigint, value: Uint8Array): void;
  /** Successful global replacement-vector storage. Copies both normalized strings. */
  appendReplacement(virtualDirectory: Uint8Array, physicalRoot: Uint8Array): void;
}

export type NativeMountDiagnosticKind = 'dlc-without-path' | 'missing-mod-archive' | 'missing-mod-folder';

export interface NativeMountDependencies {
  exists142561180?(path: Uint8Array): boolean;
  openArchive1425e1aec?(path: Uint8Array, mode: Uint8Array, shareMode: number): bigint;
  closeArchive1425d1944?(handle: bigint): void;
  directory14257fdb0?(path: Uint8Array): boolean;
  physfsMount14257a1c0?(path: Uint8Array, mountPoint: null, appendToPath: 0): number;
  freeList142579040?(list: bigint): void;
  getSearchPath1425798f0?(): bigint;
  diagnostic14254ab40?(kind: NativeMountDiagnosticKind): { readonly onceValue: number; readonly shouldBreak: boolean };
  log14254b900?(kind: Exclude<NativeMountDiagnosticKind, 'dlc-without-path'>, descriptor: bigint): void;
}

export interface NativeMountOptions {
  readonly gsBase: bigint;
  /** Counts entries at original PC 0x1420dd5d0, before each source-record visit. */
  readonly dependencyVisitBudget: number;
}

export interface NativeMountRecord {
  readonly descriptor: bigint;
  readonly priority: number;
}

export type NativeMountResult = {
  readonly selected: readonly NativeMountRecord[];
  readonly dependencyVisits: number;
  readonly mountRequests: readonly Uint8Array[];
  readonly replacementWrites: readonly { readonly virtualDirectory: Uint8Array; readonly physicalRoot: Uint8Array }[];
} & (
  | { readonly kind: 'returned' }
  | { readonly kind: 'execution-budget-exhausted'; readonly nativeAddress: bigint }
  | { readonly kind: 'runtime-required'; readonly boundary: string; readonly nativeAddress: bigint }
  | { readonly kind: 'diagnostic-break'; readonly nativeAddress: bigint }
);

const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);
const cString = (value: Uint8Array) => {
  const end = value.indexOf(0);
  return value.slice(0, end < 0 ? value.length : end);
};
const normalize = (value: Uint8Array) => value.map(byte => byte === 92 ? 47 : byte);
const joinBytes = (...parts: readonly Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
};

/** VA 0x14256c490. The byte before ':' need not be a drive letter. */
export function isNativeMountAbsolutePath(path: Uint8Array): boolean {
  return path[0] === 47 || path[0] === 92
    || ((path[0] ?? 0) !== 0 && path[1] === 58 && (path[2] === 47 || path[2] === 92));
}

/** VA 0x1420e2ef0, with successful string storage supplied by the host. */
export function joinNativeMountPath(prefix: Uint8Array, path: Uint8Array): Uint8Array {
  if (prefix.length === 0) return normalize(path);
  if (path.length === 0) return normalize(prefix);
  const tail = prefix[prefix.length - 1];
  return normalize(joinBytes(prefix, tail === 47 || tail === 92 ? new Uint8Array() : new Uint8Array([47]), path));
}

/** Original signed CMP/JL and dword DEC at 0x1420dd64c..0x1420dd65a. */
export function adjustNativeMountDependencyPriority(source: number, target: number): number {
  source |= 0; target |= 0;
  return target < source ? target : (target - 1) | 0;
}

/**
 * Planner 0x1420dd340 over valid supplied native trees/descriptors. Allocation
 * failures and native exception representations are outside this storage contract.
 * No effective mounts or active selections are synthesized by this function.
 */
export function mountNativeSelection(
  memory: NativeMountMemory, manager: bigint, dependencies: NativeMountDependencies, options: NativeMountOptions,
): NativeMountResult {
  const byte = (address: bigint) => memory.readByte(u64(address)) & 255;
  const int = (address: bigint) => memory.readDword(u64(address)) | 0;
  const pointer = (address: bigint) => u64(memory.readQword(u64(address)));
  const string = (address: bigint): Uint8Array => {
    const size = pointer(at(address, 16n));
    const data = pointer(at(address, 24n)) > 15n ? pointer(address) : address;
    return Uint8Array.from({ length: Number(size) }, (_, index) => byte(at(data, BigInt(index))));
  };
  const next = (node: bigint): bigint => {
    let right = pointer(at(node, 16n));
    if (byte(at(right, 25n)) !== 0) {
      let parent = pointer(at(node, 8n));
      while (byte(at(parent, 25n)) === 0 && node === pointer(at(parent, 16n))) {
        node = parent; parent = pointer(at(parent, 8n));
      }
      return parent;
    }
    let left = pointer(right);
    while (byte(at(left, 25n)) === 0) { right = left; left = pointer(left); }
    return right;
  };
  const selected: { descriptor: bigint; priority: number }[] = [];
  const mountRequests: Uint8Array[] = [];
  const replacementWrites: { virtualDirectory: Uint8Array; physicalRoot: Uint8Array }[] = [];
  let dependencyVisits = 0;
  type Stop = Extract<NativeMountResult, { kind: 'runtime-required' | 'diagnostic-break' }>;
  const required = (boundary: string, nativeAddress: bigint): Stop => ({ kind: 'runtime-required', boundary, nativeAddress, selected, dependencyVisits, mountRequests, replacementWrites });
  const result = (stop?: Stop): NativeMountResult => ({ ...(stop ?? { kind: 'returned' }), selected: selected.map(record => ({ ...record })), dependencyVisits, mountRequests, replacementWrites });
  const tlsIndex = memory.readDword(0x143693a98n) >>> 0;
  const tls = pointer(at(pointer(at(options.gsBase, 0x58n)), BigInt(tlsIndex) * 8n));
  if (int(0x1433dd120n) > int(at(tls, 0x20ecn))) return result(required('allocator-initialization', 0x1425a0588n));

  for (const [treeOffset, vectorOffset, initialPriority] of [[0xa0n, 0x50n, 0], [0xb0n, 0x68n, 10000]] as const) {
    const head = pointer(at(manager, treeOffset));
    for (let node = pointer(head); node !== head; node = next(node)) {
      if (initialPriority === 0 && byte(at(node, 0x2d8n)) === 0) continue;
      let found = false;
      const count = int(at(manager, vectorOffset + 12n));
      const data = pointer(at(manager, vectorOffset));
      for (let index = 0; index < count; index++) {
        if (compareNativeVfsNames(string(at(data, BigInt(index) * 32n)), string(at(node, 0x88n))) === 0) { found = true; break; }
      }
      if ((initialPriority === 0 && !found) || (initialPriority !== 0 && found)) selected.push({ descriptor: at(node, 0x40n), priority: initialPriority });
    }
  }
  const budget = Math.max(0, Math.floor(options.dependencyVisitBudget));
  if (!Number.isFinite(budget)) throw new RangeError('dependencyVisitBudget must be finite');
  let changed: boolean;
  do {
    changed = false;
    for (const source of selected) {
      if (dependencyVisits >= budget) return { ...result(), kind: 'execution-budget-exhausted', nativeAddress: 0x1420dd5d0n };
      dependencyVisits++;
      const priority = source.priority;
      let dependency = pointer(at(source.descriptor, 0xa8n));
      const end = at(dependency, BigInt(int(at(source.descriptor, 0xb4n))) * 32n);
      while (dependency !== end) {
        for (const target of selected) {
          if (compareNativeVfsNames(string(at(target.descriptor, 8n)), string(dependency)) === 0) {
            const adjusted = adjustNativeMountDependencyPriority(priority, target.priority);
            if (adjusted !== target.priority) { target.priority = adjusted; changed = true; }
          }
        }
        dependency = at(dependency, 32n);
      }
    }
  } while (changed);
  // The recovered insertion/merge family is stable under this complete comparator.
  selected.sort((left, right) => left.priority === right.priority
    ? compareNativeVfsNames(string(at(left.descriptor, 0x48n)), string(at(right.descriptor, 0x48n)))
    : left.priority < right.priority ? -1 : 1);
  memory.writeString(at(manager, 0x80n), new Uint8Array());

  const exists = (path: Uint8Array): boolean | Stop => {
    path = cString(path);
    if (path.length === 0) return false;
    if (!dependencies.exists142561180) return required('vfs-exists', 0x142561180n);
    return dependencies.exists142561180(path);
  };
  const mount = (path: Uint8Array): Stop | undefined => {
    path = cString(path);
    if (!dependencies.physfsMount14257a1c0) return required('physfs-mount', 0x14257a1c0n);
    mountRequests.push(path.slice());
    dependencies.physfsMount14257a1c0(path, null, 0);
    const previous = pointer(0x1436917a8n);
    if (previous !== 0n) {
      if (!dependencies.freeList142579040) return required('free-search-path', 0x142579040n);
      dependencies.freeList142579040(previous);
      memory.writeQword(0x1436917a8n, 0n);
    }
    if (!dependencies.getSearchPath1425798f0) return required('get-search-path', 0x1425798f0n);
    let roots = u64(dependencies.getSearchPath1425798f0());
    memory.writeQword(0x1436917a8n, roots);
    for (let root = pointer(roots); root !== 0n; roots = at(roots, 8n), root = pointer(roots)) {
      for (; byte(root) !== 0; root = at(root, 1n)) if (byte(root) === 92) memory.writeByte(root, 47);
    }
  };
  const diagnostic = (kind: NativeMountDiagnosticKind): Stop | undefined => {
    const first = kind === 'dlc-without-path';
    const once = kind === 'dlc-without-path' ? 0x1434f83b0n : kind === 'missing-mod-archive' ? 0x1434f83b1n : 0x1434f83b2n;
    if (byte(first ? 0x14368f611n : 0x14368f610n) === 0 || byte(once) !== 0) return;
    if (!dependencies.diagnostic14254ab40) return required('diagnostic', 0x14254ab40n);
    const answer = dependencies.diagnostic14254ab40(kind);
    memory.writeByte(once, answer.onceValue & 255);
    if (answer.shouldBreak) return { ...required('', 0n), kind: 'diagnostic-break', nativeAddress: first ? 0x1420dd974n : kind === 'missing-mod-archive' ? 0x1420dda64n : 0x1420ddbe4n };
  };
  const log = (kind: Exclude<NativeMountDiagnosticKind, 'dlc-without-path'>, descriptor: bigint): Stop | undefined => {
    if (!dependencies.log14254b900) return required('log', 0x14254b900n);
    dependencies.log14254b900(kind, descriptor);
  };
  for (const record of selected) {
    const descriptor = record.descriptor;
    let stop: Stop | undefined;
    if (int(at(descriptor, 0x248n)) === 1) {
      if (pointer(at(descriptor, 0x98n)) !== 0n) stop = mount(joinNativeMountPath(string(at(descriptor, 0x118n)), string(at(descriptor, 0x88n))));
      else if (pointer(at(descriptor, 0x78n)) !== 0n) stop = mount(joinNativeMountPath(string(at(descriptor, 0x118n)), string(at(descriptor, 0x68n))));
      else stop = diagnostic('dlc-without-path');
    }
    else {
      if (pointer(at(descriptor, 0x98n)) !== 0n) {
        const archive = string(at(descriptor, 0x88n));
        const present = exists(archive);
        if (typeof present !== 'boolean') return result(present);
        if (present) stop = mount(joinNativeMountPath(string(at(descriptor, 0x118n)), string(at(descriptor, 0x88n))));
        else {
          if (!dependencies.openArchive1425e1aec) return result(required('archive-open', 0x1425e1aecn));
          const handle = u64(dependencies.openArchive1425e1aec(cString(string(at(descriptor, 0x88n))), new Uint8Array([114]), 0x40));
          if (handle !== 0n) {
            if (!dependencies.closeArchive1425d1944) return result(required('archive-close', 0x1425d1944n));
            dependencies.closeArchive1425d1944(handle);
            stop = mount(joinNativeMountPath(new Uint8Array(), string(at(descriptor, 0x88n))));
          }
          else stop = diagnostic('missing-mod-archive') ?? log('missing-mod-archive', descriptor);
        }
      }
      else if (pointer(at(descriptor, 0x78n)) !== 0n) {
        let path: Uint8Array = new Uint8Array();
        const present = exists(string(at(descriptor, 0x68n)));
        if (typeof present !== 'boolean') return result(present);
        if (present) path = joinNativeMountPath(string(at(descriptor, 0x118n)), string(at(descriptor, 0x68n)));
        else {
          const folder = string(at(descriptor, 0x68n));
          let valid = false;
          if (isNativeMountAbsolutePath(cString(folder))) {
            if (!dependencies.directory14257fdb0) return result(required('directory-status', 0x14257fdb0n));
            valid = dependencies.directory14257fdb0(cString(folder));
          }
          if (valid) path = string(at(descriptor, 0x68n));
          else stop = log('missing-mod-folder', descriptor) ?? diagnostic('missing-mod-folder');
        }
        if (!stop && path.length !== 0) stop = mount(path);
      }
      if (!stop && pointer(at(descriptor, 0xe8n)) !== 0n) {
        const current = string(at(manager, 0x80n));
        if (current.length !== 0) memory.writeString(at(manager, 0x80n), joinBytes(current, new Uint8Array([95])));
        memory.writeString(at(manager, 0x80n), joinBytes(string(at(manager, 0x80n)), string(at(descriptor, 0xd8n))));
      }
    }
    if (stop) return result(stop);
  }
  for (const { descriptor } of selected) {
    if (int(at(descriptor, 0xccn)) === 0) continue;
    let path: Uint8Array;
    if (pointer(at(descriptor, 0x98n)) !== 0n) path = string(at(descriptor, 0x88n));
    else if (pointer(at(descriptor, 0x78n)) !== 0n) path = string(at(descriptor, 0x68n));
    else continue;
    if (path.length === 0) continue;
    const physicalRoot = isNativeMountAbsolutePath(cString(path)) ? path : joinNativeMountPath(string(at(descriptor, 0x118n)), path);
    let item = pointer(at(descriptor, 0xc0n));
    const end = at(item, BigInt(int(at(descriptor, 0xccn))) * 32n);
    for (; item !== end; item = at(item, 32n)) {
      if (pointer(at(item, 16n)) === 0n) continue;
      const virtualDirectory = normalize(cString(string(item)));
      const root = normalize(cString(physicalRoot));
      memory.appendReplacement(virtualDirectory.slice(), root.slice());
      replacementWrites.push({ virtualDirectory, physicalRoot: root });
    }
  }
  return result();
}
