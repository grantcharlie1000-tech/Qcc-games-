export interface NativeFileIoMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
}

/** Individual native IO-vtable, CRT and allocator leaves. Callbacks may mutate memory. */
export interface NativeFileIoDependencies {
  read?(target: bigint, io: bigint, destination: bigint, bytes: bigint): bigint;
  write?(target: bigint, io: bigint, source: bigint, bytes: bigint): bigint;
  seek?(target: bigint, io: bigint, offset: bigint): number;
  tell?(target: bigint, io: bigint): bigint;
  length?(target: bigint, io: bigint): bigint;
  flush?(target: bigint, io: bigint): number;
  destroy?(target: bigint, io: bigint): void;
  reallocate?(target: bigint, pointer: bigint, bytes: bigint): bigint;
  free?(target: bigint, pointer: bigint): void;
  /** CRT copy leaf 0x1426079d0, over valid supplied source/destination extents. */
  copy1426079d0?(destination: bigint, source: bigint, bytes: bigint): void;
  lock1425a3b80?(mutex: bigint): number;
  unlock1425a3b88?(mutex: bigint): void;
  initializeHeader1425a0588?(guard: bigint): void;
  initializeFooter1425a051c?(guard: bigint): void;
}

export type NativeFileIoResult<T extends bigint | number> =
  | { readonly kind: 'returned'; readonly value: T }
  | { readonly kind: 'runtime-required'; readonly boundary: string; readonly nativeAddress: bigint; readonly callSite: bigint }
  | { readonly kind: 'native-exception'; readonly code: 5 | 6; readonly nativeAddress: 0x1425a3dfcn };

type Stop = Exclude<NativeFileIoResult<number>, { kind: 'returned' }>;
class NativeIoStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const i64 = (value: bigint) => BigInt.asIntN(64, value);

/**
 * Recovered supplied-handle IO, not a mounted-file provider. Valid native memory,
 * container extents and callback ABIs are required. Stops preserve earlier effects;
 * they do not implement continuation or native exception unwinding.
 */
export class NativeFileIo {
  constructor(
    private readonly memory: NativeFileIoMemory,
    private readonly dependencies: NativeFileIoDependencies,
    private readonly gsBase: bigint,
  ) {}

  private at(address: bigint, offset: bigint): bigint { return u64(address + offset); }
  private q(address: bigint): bigint { return u64(this.memory.readQword(u64(address))); }
  private byte(address: bigint): number { return this.memory.readByte(u64(address)) & 255; }
  private int(address: bigint): number { return this.memory.readDword(u64(address)) | 0; }
  private put(address: bigint, value: bigint): void { this.memory.writeQword(u64(address), u64(value)); }
  private required(boundary: string, nativeAddress: bigint, callSite: bigint): never {
    const stop: Stop = { kind: 'runtime-required', boundary, nativeAddress, callSite };
    throw new NativeIoStop(stop);
  }
  private run<T extends bigint | number>(operation: () => T): NativeFileIoResult<T> {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) {
      if (error instanceof NativeIoStop) return error.result;
      throw error;
    }
  }
  private tls(): bigint {
    const index = this.memory.readDword(0x143693a98n) >>> 0;
    return this.q(this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(index) * 8n));
  }
  private error(code: number): void { this.memory.writeDword(this.at(this.tls(), 0x20e4n), code); }
  private ioCall64(role: 'read' | 'write', io: bigint, slot: bigint, pointer: bigint, bytes: bigint, site: bigint): bigint {
    const target = this.q(this.at(io, slot));
    const call = this.dependencies[role];
    if (!call) return this.required('io-' + role, target, site);
    return i64(call(target, io, u64(pointer), u64(bytes)));
  }
  private positionCall(role: 'tell' | 'length', io: bigint, slot: bigint, site: bigint): bigint {
    const target = this.q(this.at(io, slot));
    const call = this.dependencies[role];
    if (!call) return this.required('io-' + role, target, site);
    return i64(call(target, io));
  }
  private seekCall(io: bigint, offset: bigint, site: bigint): number {
    const target = this.q(this.at(io, 0x20n));
    if (!this.dependencies.seek) return this.required('io-seek', target, site);
    return this.dependencies.seek(target, io, u64(offset)) | 0;
  }
  private free(pointer: bigint, site: bigint): void {
    const target = this.q(0x1436918b0n);
    if (!this.dependencies.free) return this.required('allocator-free', target, site);
    this.dependencies.free(target, pointer);
  }

  /** Complete VA 0x14257a870. The size guard precedes the file dereference. */
  readBytes(file: bigint, destination: bigint, bytes: bigint): NativeFileIoResult<bigint> {
    return this.run(() => {
      bytes = u64(bytes); destination = u64(destination); file = u64(file);
      if (bytes > 0x7fffffffffffffffn) { this.error(9); return -1n; }
      if (!this.byte(this.at(file, 8n))) { this.error(15); return -1n; }
      if (bytes === 0n) return 0n;
      if (this.q(this.at(file, 0x18n)) === 0n) return this.ioCall64('read', this.q(file), 0x10n, destination, bytes, 0x14257a9d9n);
      let total = 0n;
      while (bytes !== 0n) {
        const position = this.q(this.at(file, 0x30n));
        let available = u64(this.q(this.at(file, 0x28n)) - position);
        const buffer = this.q(this.at(file, 0x18n));
        if (available !== 0n) {
          if (bytes < available) available = bytes;
          if (!this.dependencies.copy1426079d0) return this.required('crt-copy', 0x1426079d0n, 0x14257a951n);
          this.dependencies.copy1426079d0(destination, this.at(buffer, position), available);
          this.put(this.at(file, 0x30n), this.q(this.at(file, 0x30n)) + available);
          destination = u64(destination + available); bytes = u64(bytes - available); total = u64(total + available);
        } else {
          const count = this.ioCall64('read', this.q(file), 0x10n, buffer, this.q(this.at(file, 0x20n)), 0x14257a98en);
          this.put(this.at(file, 0x30n), 0n);
          if (count <= 0n) {
            this.put(this.at(file, 0x28n), 0n);
            return total === 0n ? count : i64(total);
          }
          this.put(this.at(file, 0x28n), count);
        }
      }
      return i64(total);
    });
  }

  /** Engine wrapper VA 0x14255fe10: handle at +0x10, negative reads become zero. */
  readEngineFile(object: bigint, destination: bigint, bytes: bigint): NativeFileIoResult<bigint> {
    const result = this.readBytes(this.q(this.at(object, 0x10n)), destination, bytes);
    return result.kind === 'returned' && result.value < 0n ? { kind: 'returned', value: 0n } : result;
  }

  /** Complete VA 0x14257b9c0; fields are reloaded after the provider callback. */
  private tellValue(file: bigint): bigint {
    const value = this.positionCall('tell', this.q(file), 0x28n, 0x14257b9d0n);
    return this.byte(this.at(file, 8n))
      ? i64(this.q(this.at(file, 0x30n)) - this.q(this.at(file, 0x28n)) + value)
      : i64(this.q(this.at(file, 0x28n)) + value);
  }
  tell(file: bigint): NativeFileIoResult<bigint> { return this.run(() => this.tellValue(u64(file))); }
  /** Complete VA 0x142578fe0. */
  fileLength(file: bigint): NativeFileIoResult<bigint> {
    return this.run(() => this.positionCall('length', this.q(file), 0x30n, 0x142578fe7n));
  }
  /** Complete VA 0x142578f60; both callbacks use the captured IO pointer. */
  eof(file: bigint): NativeFileIoResult<number> {
    return this.run(() => {
      if (!this.byte(this.at(file, 8n)) || this.q(this.at(file, 0x30n)) !== this.q(this.at(file, 0x28n))) return 0;
      const io = this.q(file);
      const position = this.positionCall('tell', io, 0x28n, 0x142578f85n);
      const length = this.positionCall('length', io, 0x30n, 0x142578f91n);
      return position >= 0n && length >= 0n && position >= length ? 1 : 0;
    });
  }
  /** Inline buffered-write branch shared by flush, seek and setBuffer. */
  private writePending(file: bigint, site: bigint): boolean {
    if (this.byte(this.at(file, 8n))) return true;
    const position = this.q(this.at(file, 0x30n)), fill = this.q(this.at(file, 0x28n));
    if (position === fill) return true;
    const count = this.ioCall64('write', this.q(file), 0x18n, this.q(this.at(file, 0x18n)) + position, fill - position, site);
    if (count <= 0n) return false;
    this.put(this.at(file, 0x28n), 0n); this.put(this.at(file, 0x30n), 0n);
    return true;
  }
  /** Complete VA 0x142578ff0; any positive write clears the whole pending buffer. */
  flush(file: bigint): NativeFileIoResult<number> { return this.run(() => this.writePending(file, 0x14257901an) ? 1 : 0); }
  /** Complete VA 0x14257ab60, including in-buffer backward and forward seeks. */
  seek(file: bigint, offset: bigint): NativeFileIoResult<number> {
    return this.run(() => {
      offset = u64(offset);
      if (!this.writePending(file, 0x14257abaan)) return 0;
      if (this.q(this.at(file, 0x18n)) !== 0n && this.byte(this.at(file, 8n))) {
        const current = this.tellValue(file);
        const position = this.q(this.at(file, 0x30n));
        const delta = u64(offset - current);
        if (i64(delta) < 0n ? u64(-delta) <= position : delta <= u64(this.q(this.at(file, 0x28n)) - position)) {
          this.put(this.at(file, 0x30n), position + delta);
          return 1;
        }
      }
      const io = this.q(file);
      this.put(this.at(file, 0x30n), 0n); this.put(this.at(file, 0x28n), 0n);
      return this.seekCall(io, offset, 0x14257ac04n);
    });
  }
  /** Complete VA 0x14257add0. Reallocation failure preserves earlier seek/write effects. */
  setBuffer(file: bigint, bytes: bigint): NativeFileIoResult<number> {
    return this.run(() => {
      bytes = u64(bytes);
      if (!this.writePending(file, 0x14257ae1en)) return 0;
      if (this.byte(this.at(file, 8n)) && this.q(this.at(file, 0x28n)) !== this.q(this.at(file, 0x30n))) {
        const value = this.positionCall('tell', this.q(file), 0x28n, 0x14257ae51n);
        if (value === -1n) return 0;
        const position = this.q(this.at(file, 0x30n));
        const io = this.q(file);
        const offset = u64(position - this.q(this.at(file, 0x28n)) + value);
        if (this.seekCall(io, offset, 0x14257ae69n) === 0) return 0;
      }
      const old = this.q(this.at(file, 0x18n));
      if (bytes === 0n) {
        if (old !== 0n) { this.free(old, 0x14257ae85n); this.put(this.at(file, 0x18n), 0n); }
      } else {
        const target = this.q(0x1436918a8n);
        if (!this.dependencies.reallocate) return this.required('allocator-reallocate', target, 0x14257ae9bn);
        const buffer = u64(this.dependencies.reallocate(target, old, bytes));
        if (buffer === 0n) { this.error(2); return 0; }
        this.put(this.at(file, 0x18n), buffer);
      }
      this.put(this.at(file, 0x20n), bytes);
      this.put(this.at(file, 0x30n), 0n); this.put(this.at(file, 0x28n), 0n);
      return 1;
    });
  }

  /** Complete state accessor VA 0x14257bd90 with individual CRT once-guard leaves. */
  private state(): bigint {
    if (this.int(0x1436919c0n) > this.int(this.at(this.tls(), 0x20ecn))) {
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
        this.memory.writeByte(0x1436919b8n, 0); this.memory.writeByte(0x1436919b9n, 0);
        clear16(0x143691970n); this.memory.writeByte(0x1436919ban, 0);
        if (!this.dependencies.initializeFooter1425a051c) return this.required('initialize-footer', 0x1425a051cn, 0x14257be97n);
        this.dependencies.initializeFooter1425a051c(0x1436919c0n);
      }
    }
    return 0x1436918c0n;
  }
  /** Complete list-removal helper VA 0x14257ca30. */
  private closeFromList(head: bigint, file: bigint): number {
    let previous = 0n, node = this.q(head);
    while (node !== 0n && node !== file) { previous = node; node = this.q(this.at(node, 0x38n)); }
    if (node === 0n) return 0;
    const buffer = this.q(this.at(file, 0x18n)), io = this.q(file);
    if (!this.byte(this.at(file, 8n))) {
      const position = this.q(this.at(file, 0x30n)), fill = this.q(this.at(file, 0x28n));
      if (position !== fill) {
        if (this.ioCall64('write', io, 0x18n, buffer + position, fill - position, 0x14257caa6n) <= 0n) return -1;
        this.put(this.at(file, 0x28n), 0n); this.put(this.at(file, 0x30n), 0n);
      }
      const target = this.q(this.at(io, 0x40n));
      if (target !== 0n) {
        if (!this.dependencies.flush) return this.required('io-flush', target, 0x14257cac9n);
        if ((this.dependencies.flush(target, io) | 0) === 0) return -1;
      }
    }
    const destroy = this.q(this.at(io, 0x48n));
    if (!this.dependencies.destroy) return this.required('io-destroy', destroy, 0x14257caf2n);
    this.dependencies.destroy(destroy, io);
    if (buffer !== 0n) this.free(buffer, 0x14257cafdn);
    const next = this.q(this.at(file, 0x38n));
    this.put(previous === 0n ? head : this.at(previous, 0x38n), next);
    this.free(file, previous === 0n ? 0x14257cb12n : 0x14257cb26n);
    return 1;
  }
  /** Complete VA 0x1425784a0, including the state accessor and list-removal helper. */
  close(file: bigint): NativeFileIoResult<number> {
    return this.run(() => {
      file = u64(file);
      const state = this.state(), mutex = this.at(state, 0xa8n);
      if (!this.dependencies.lock1425a3b80) return this.required('mutex-lock', 0x1425a3b80n, 0x1425784d9n);
      if ((this.dependencies.lock1425a3b80(mutex) | 0) !== 0) {
        const stop: Stop = { kind: 'native-exception', code: 5, nativeAddress: 0x1425a3dfcn }; throw new NativeIoStop(stop);
      }
      if (this.int(this.at(mutex, 0x4cn)) === 0x7fffffff) {
        this.memory.writeDword(this.at(mutex, 0x4cn), 0x7ffffffe);
        const stop: Stop = { kind: 'native-exception', code: 6, nativeAddress: 0x1425a3dfcn }; throw new NativeIoStop(stop);
      }
      let result = this.closeFromList(this.at(state, 0x50n), file);
      if (result === 0) result = this.closeFromList(this.at(state, 0x48n), file);
      if (!this.dependencies.unlock1425a3b88) return this.required('mutex-unlock', 0x1425a3b88n, result === -1 ? 0x142578550n : 0x14257851cn);
      this.dependencies.unlock1425a3b88(mutex);
      if (result === -1) return 0;
      if (result === 0) { this.error(9); return 0; }
      return 1;
    });
  }
}
