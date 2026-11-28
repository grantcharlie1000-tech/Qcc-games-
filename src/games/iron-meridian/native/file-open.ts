import type { NativeFileIoDependencies, NativeFileIoMemory } from './file-io';

export interface NativeFileOpenDependencies extends NativeFileIoDependencies {
  allocate?(target: bigint, bytes: bigint): bigint;
  openRead?(target: bigint, opaque: bigint, path: bigint): bigint;
  stat?(target: bigint, opaque: bigint, path: bigint, output: bigint): number;
  comparePrefix1425ceb80?(left: bigint, right: bigint, count: bigint): number;
  findSlash1425c3c70?(path: bigint, byte: 47): bigint;
  probeStack1425a07d0?(bytes: bigint): void;
}

/** Host-owned temporary memory, valid for the translated native accesses. */
export interface NativeFileOpenWorkspace {
  readonly stackHeader: bigint;
  readonly pathPointer: bigint;
  readonly stat: bigint;
}

export type NativeFileOpenResult =
  | { readonly kind: 'returned'; readonly value: bigint }
  | { readonly kind: 'runtime-required'; readonly boundary: string; readonly nativeAddress: bigint; readonly callSite: bigint }
  | { readonly kind: 'native-exception'; readonly code: 5 | 6; readonly nativeAddress: 0x1425a3dfcn }
  | { readonly kind: 'native-assertion'; readonly line: 0x826; readonly nativeAddress: 0x1425c85a8n }
  | { readonly kind: 'native-memory-fault'; readonly nativeAddress: 0x14257a707n; readonly address: 0n; readonly access: 'write'; readonly bytes: 16 };
type Stop = Exclude<NativeFileOpenResult, { kind: 'returned' }>;
class OpenStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);

/** Original openRead/path acceptance over valid supplied native state and individual leaves. */
export class NativeFileOpen {
  constructor(private readonly memory: NativeFileIoMemory, private readonly dependencies: NativeFileOpenDependencies, private readonly gsBase: bigint) {}
  private at(address: bigint, offset: bigint): bigint { return u64(address + offset); }
  private q(address: bigint): bigint { return u64(this.memory.readQword(u64(address))); }
  private byte(address: bigint): number { return this.memory.readByte(u64(address)) & 255; }
  private int(address: bigint): number { return this.memory.readDword(u64(address)) | 0; }
  private put(address: bigint, value: bigint): void { this.memory.writeQword(u64(address), u64(value)); }
  private putByte(address: bigint, value: number): void { this.memory.writeByte(u64(address), value & 255); }
  private stop(result: Stop): never { throw new OpenStop(result); }
  private required(boundary: string, nativeAddress: bigint, callSite: bigint): never {
    return this.stop({ kind: 'runtime-required', boundary, nativeAddress, callSite });
  }
  private run(operation: () => bigint): NativeFileOpenResult {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof OpenStop) return error.result; throw error; }
  }
  private tlsEntry(): bigint {
    return this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(this.memory.readDword(0x143693a98n) >>> 0) * 8n);
  }
  private error(value: number): void { this.memory.writeDword(this.at(this.q(this.tlsEntry()), 0x20e4n), value); }
  private length(path: bigint): bigint {
    let length = 0n;
    while (this.byte(this.at(path, length)) !== 0) length = u64(length + 1n);
    return length;
  }
  /** Same complete accessor as the independently verified supplied-handle IO slice. */
  private state(): bigint {
    if (this.int(0x1436919c0n) > this.int(this.at(this.q(this.tlsEntry()), 0x20ecn))) {
      if (!this.dependencies.initializeHeader1425a0588) return this.required('initialize-header', 0x1425a0588n, 0x14257bdcan);
      this.dependencies.initializeHeader1425a0588(0x1436919c0n);
      if (this.int(0x1436919c0n) === -1) {
        const clear16 = (address: bigint) => { this.put(address, 0n); this.put(this.at(address, 8n), 0n); };
        this.memory.writeDword(0x143691960n, -1);
        clear16(0x1436918c0n); clear16(0x1436918e0n); clear16(0x1436918d0n);
        this.put(0x1436918f0n, 0n); this.put(0x1436918f8n, 0n); clear16(0x143691900n);
        this.put(0x143691910n, 0n); clear16(0x143691930n);
        this.memory.writeDword(0x143691918n, 0x102); clear16(0x143691940n);
        this.memory.writeDword(0x143691964n, 0); clear16(0x143691950n);
        this.memory.writeDword(0x1436919b0n, -1); clear16(0x143691920n); clear16(0x143691980n);
        this.memory.writeDword(0x143691968n, 0x102); clear16(0x143691990n);
        this.memory.writeDword(0x1436919b4n, 0); clear16(0x1436919a0n);
        this.putByte(0x1436919b8n, 0); this.putByte(0x1436919b9n, 0);
        clear16(0x143691970n); this.putByte(0x1436919ban, 0);
        if (!this.dependencies.initializeFooter1425a051c) return this.required('initialize-footer', 0x1425a051cn, 0x14257be97n);
        this.dependencies.initializeFooter1425a051c(0x1436919c0n);
      }
    }
    return 0x1436918c0n;
  }
  private lock(mutex: bigint, site: bigint): void {
    if (!this.dependencies.lock1425a3b80) return this.required('mutex-lock', 0x1425a3b80n, site);
    if ((this.dependencies.lock1425a3b80(mutex) | 0) !== 0) return this.stop({ kind: 'native-exception', code: 5, nativeAddress: 0x1425a3dfcn });
    if (this.int(this.at(mutex, 0x4cn)) === 0x7fffffff) {
      this.memory.writeDword(this.at(mutex, 0x4cn), 0x7ffffffe);
      return this.stop({ kind: 'native-exception', code: 6, nativeAddress: 0x1425a3dfcn });
    }
  }
  private unlock(mutex: bigint, site: bigint): void {
    if (!this.dependencies.unlock1425a3b88) return this.required('mutex-unlock', 0x1425a3b88n, site);
    this.dependencies.unlock1425a3b88(mutex);
  }
  private allocate(bytes: bigint, site: bigint): bigint {
    const target = this.q(0x1436918a0n);
    if (!this.dependencies.allocate) return this.required('allocator-allocate', target, site);
    return u64(this.dependencies.allocate(target, u64(bytes)));
  }
  private free(pointer: bigint, site: bigint): void {
    const target = this.q(0x1436918b0n);
    if (!this.dependencies.free) return this.required('allocator-free', target, site);
    this.dependencies.free(target, pointer);
  }

  /** Complete byte converter VA0x14257ea30; final dot components follow its actual branch structure. */
  private convertValue(input: bigint, output: bigint): bigint {
    while (this.byte(input) === 47) input = this.at(input, 1n);
    const dot = (path: bigint) => this.byte(path) === 46
      && (this.byte(this.at(path, 1n)) === 0 || this.byte(this.at(path, 1n)) === 46 && this.byte(this.at(path, 2n)) === 0);
    if (dot(input)) { this.error(23); return 0n; }
    let component = output;
    while (true) {
      const byte = this.byte(input); input = this.at(input, 1n);
      if (byte === 58 || byte === 92) { this.error(23); return 0n; }
      if (byte !== 47) {
        this.putByte(output, byte); output = this.at(output, 1n);
        if (byte === 0) return 1n;
      } else {
        this.putByte(output, 0);
        if (dot(component)) { this.error(23); return 0n; }
        while (this.byte(input) === 47) input = this.at(input, 1n);
        if (this.byte(input) === 0) return 1n;
        component = this.at(output, 1n); this.putByte(output, 47); output = this.at(output, 1n);
      }
    }
  }
  convertPath(input: bigint, output: bigint): NativeFileOpenResult { return this.run(() => this.convertValue(u64(input), u64(output))); }

  /** Complete acceptance helper VA0x14257ec90; caller openRead supplies allowMissing=0. */
  private acceptValue(mount: bigint, pathPointer: bigint, allowMissing: number, statOutput: bigint): bigint {
    let path = this.q(pathPointer);
    if (this.byte(path) === 0 && this.q(this.at(mount, 0x18n)) === 0n) return 1n;
    if (this.q(this.at(mount, 0x10n)) !== 0n) {
      const mountLength = this.length(this.q(this.at(mount, 0x10n))), pathLength = this.length(path);
      if (mountLength <= 1n) return this.stop({ kind: 'native-assertion', line: 0x826, nativeAddress: 0x1425c85a8n });
      const prefixLength = u64(mountLength - 1n);
      let matches = pathLength >= prefixLength;
      if (matches) {
        if (!this.dependencies.comparePrefix1425ceb80) return this.required('crt-compare-prefix', 0x1425ceb80n, 0x14257ed3bn);
        matches = (this.dependencies.comparePrefix1425ceb80(this.q(this.at(mount, 0x10n)), path, prefixLength) | 0) === 0;
      }
      if (!matches || pathLength > prefixLength && this.byte(this.at(path, prefixLength)) !== 47) { this.error(11); return 0n; }
      path = this.at(path, mountLength);
      if (this.byte(this.at(path, -1n)) !== 47) path = this.at(path, -1n);
      this.put(pathPointer, path);
    }
    let root = this.q(this.at(mount, 0x18n));
    if (root !== 0n) {
      const first = this.byte(path);
      path = this.at(path, 1n - this.q(this.at(mount, 0x20n)));
      let destination = path;
      while (true) {
        const byte = this.byte(root); root = this.at(root, 1n);
        this.putByte(destination, byte); destination = this.at(destination, 1n);
        if (byte === 0) break;
      }
      if (first !== 0) this.putByte(this.at(path, this.q(this.at(mount, 0x20n)) - 2n), 47);
      this.put(pathPointer, path);
    }
    if (this.byte(this.at(this.state(), 0xf9n)) !== 0) return 1n;
    const tlsEntry = this.tlsEntry();
    let cursor = path;
    while (true) {
      if (!this.dependencies.findSlash1425c3c70) return this.required('crt-find-slash', 0x1425c3c70n, 0x14257ee08n);
      const slash = u64(this.dependencies.findSlash1425c3c70(cursor, 47));
      if (slash !== 0n) this.putByte(slash, 0);
      const target = this.q(this.at(this.q(this.at(mount, 0x28n)), 0x68n));
      if (!this.dependencies.stat) return this.required('provider-stat', target, 0x14257ee2bn);
      const result = this.dependencies.stat(target, this.q(mount), path, statOutput) | 0;
      const link = result !== 0 && this.int(this.at(statOutput, 0x20n)) === 2;
      const missing = result === 0 && this.int(this.at(this.q(tlsEntry), 0x20e4n)) === 11;
      if (slash !== 0n) this.putByte(slash, 47);
      if (link) { this.error(12); return 0n; }
      if (missing) return slash === 0n || (allowMissing | 0) !== 0 ? 1n : 0n;
      if (slash === 0n) return 1n;
      cursor = this.at(slash, 1n);
    }
  }
  acceptMountPath(mount: bigint, pathPointer: bigint, allowMissing: number, statOutput: bigint): NativeFileOpenResult {
    return this.run(() => this.acceptValue(u64(mount), u64(pathPointer), allowMissing, u64(statOutput)));
  }

  /** Complete opener VA0x14257a500, including its observed null-allocation fault. */
  openRead(path: bigint, workspace: NativeFileOpenWorkspace): NativeFileOpenResult {
    return this.run(() => {
      path = u64(path);
      if (path === 0n) { this.error(9); return 0n; }
      const state = this.state(), mountHead = this.at(state, 8n), mountMutex = this.at(state, 0x58n);
      const frozen = this.byte(this.at(state, 0xfan));
      if (frozen === 0) this.lock(mountMutex, 0x14257a577n);
      if (this.q(mountHead) === 0n) {
        this.error(11);
        if (frozen === 0) this.unlock(mountMutex, 0x14257a7b3n);
        return 0n;
      }
      const size = u64(this.length(path) + this.q(this.at(state, 0x40n)) + 1n);
      let header: bigint;
      const heap = size >= 512n;
      if (heap) header = this.allocate(u64(size + 8n), 0x14257a62cn);
      else {
        const stackBytes = (size + 23n) & ~15n;
        if (!this.dependencies.probeStack1425a07d0) return this.required('crt-stack-probe', 0x1425a07d0n, 0x14257a5ffn);
        this.dependencies.probeStack1425a07d0(stackBytes);
        header = u64(workspace.stackHeader);
      }
      if (header === 0n) {
        this.error(2);
        if (frozen === 0) this.unlock(mountMutex, 0x14257a7b3n);
        return 0n;
      }
      this.put(header, heap ? 1n : 0n);
      const prefix = this.at(header, 8n);
      const converted = this.at(prefix, this.q(this.at(state, 0x40n)));
      let handle = 0n;
      if (this.convertValue(path, converted) !== 0n) {
        let mount = this.q(mountHead), io = 0n;
        while (mount !== 0n) {
          this.put(workspace.pathPointer, converted);
          if (this.acceptValue(mount, workspace.pathPointer, 0, workspace.stat) !== 0n) {
            const target = this.q(this.at(this.q(this.at(mount, 0x28n)), 0x40n));
            if (!this.dependencies.openRead) return this.required('provider-open-read', target, 0x14257a6a6n);
            io = u64(this.dependencies.openRead(target, this.q(mount), this.q(workspace.pathPointer)));
            if (io !== 0n) break;
          }
          mount = this.q(this.at(mount, 0x30n));
        }
        if (io !== 0n) {
          handle = this.allocate(64n, 0x14257a6cfn);
          if (handle === 0n) {
            const target = this.q(this.at(io, 0x48n));
            if (!this.dependencies.destroy) return this.required('io-destroy', target, 0x14257a6e0n);
            this.dependencies.destroy(target, io); this.error(2);
            return this.stop({ kind: 'native-memory-fault', nativeAddress: 0x14257a707n, address: 0n, access: 'write', bytes: 16 });
          }
          for (let offset = 0n; offset < 64n; offset += 8n) this.put(this.at(handle, offset), 0n);
          this.put(handle, io); this.putByte(this.at(handle, 8n), 1); this.put(this.at(handle, 0x10n), mount);
          const currentState = this.state(), listMutex = this.at(currentState, 0xa8n);
          this.lock(listMutex, 0x14257a730n);
          this.put(this.at(handle, 0x38n), this.q(this.at(currentState, 0x50n)));
          this.put(this.at(currentState, 0x50n), handle);
          this.unlock(listMutex, 0x14257a761n);
        }
      }
      if (frozen === 0) this.unlock(mountMutex, 0x14257a770n);
      if (this.q(header) !== 0n) this.free(header, 0x14257a77fn);
      return handle;
    });
  }
}
