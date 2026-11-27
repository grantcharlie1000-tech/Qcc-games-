import { NativeFileIo } from './file-io';
import type { NativeFileIoDependencies, NativeFileIoMemory, NativeFileIoResult } from './file-io';
export interface NativeContentMemory extends NativeFileIoMemory { writeBytes(address: bigint, payload: Uint8Array): void }
export interface NativeContentDependencies {
  io: NativeFileIoDependencies;
  allocate?(target: bigint, allocator: bigint, bytes: bigint, alignment: number): bigint;
  release?(target: bigint, allocator: bigint, pointer: bigint): void;
  crtAllocate?(bytes: bigint): bigint;
  crtFree?(pointer: bigint, bytes: bigint): void;
  copy?(destination: bigint, source: bigint, bytes: bigint): void;
  zero?(destination: bigint, value: number, bytes: bigint): void;
}
export type NativeContentResult<T> = { kind: 'returned'; value: T } | Exclude<NativeFileIoResult<number>, { kind: 'returned' }>;
type Stop = Exclude<NativeContentResult<never>, { kind: 'returned' }>;
class ContentStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value), i64 = (value: bigint) => BigInt.asIntN(64, value);
export class NativeContentStream {
  private readonly io: NativeFileIo;
  constructor(private readonly memory: NativeContentMemory, private readonly dependencies: NativeContentDependencies, private readonly gsBase: bigint, private readonly entryStack: bigint) {
    this.io = new NativeFileIo(memory, dependencies.io, gsBase);
  }
  private at(address: bigint, offset: bigint) { return u64(address + offset); }
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private int(address: bigint) { return this.memory.readDword(u64(address)) | 0; }
  private byte(address: bigint) { return this.memory.readByte(u64(address)) & 255; }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private wd(address: bigint, value: number) { this.memory.writeDword(u64(address), value >>> 0); }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private run<T>(operation: () => T): NativeContentResult<T> {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof ContentStop) return error.result; throw error; }
  }
  private unwrap<T>(result: NativeContentResult<T>): T { if (result.kind !== 'returned') throw new ContentStop(result); return result.value; }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new ContentStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private assertion(site: bigint): never { return this.stop('diagnostic-assertion', 0x14254ab40n, site); }
  private tls(site: bigint) {
    const index = this.memory.readDword(0x143693a98n) >>> 0;
    const block = this.q(this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(index) * 8n));
    if (this.int(this.at(block, 0x20ecn)) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, site);
  }
  private growth() { const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.memory.readDword(0x142795988n), true); return view.getFloat32(0, true); }
  private capacity(old: number, minimum: number) {
    const product = Math.fround(Math.fround(old) * this.growth());
    const value = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    return value < minimum ? minimum : value;
  }
  private allocate(allocator: bigint, size: bigint, site: bigint) {
    const target = this.q(this.at(this.q(allocator), 8n));
    if (!this.dependencies.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.dependencies.allocate(target, allocator, u64(size), 1));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint) {
    const target = this.q(this.at(this.q(allocator), 0x10n));
    if (!this.dependencies.release) this.stop('allocator-release', target, site);
    this.dependencies.release(target, allocator, pointer);
  }
  private copy(destination: bigint, source: bigint, size: bigint, site: bigint) {
    if (!this.dependencies.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.dependencies.copy(u64(destination), u64(source), u64(size));
  }
  private zero(destination: bigint, size: bigint, site: bigint) {
    if (!this.dependencies.zero) this.stop('crt-zero', 0x142608070n, site);
    this.dependencies.zero(u64(destination), 0, u64(size));
  }
  private malloc(size: bigint) {
    if (!this.dependencies.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, size >= 0x1000n ? 0x14011f0a4n : 0x14011f0ecn);
    return u64(this.dependencies.crtAllocate(u64(size)));
  }
  private free(pointer: bigint, size: bigint, site: bigint) {
    if (!this.dependencies.crtFree) this.stop('crt-free', 0x1425a0218n, site);
    this.dependencies.crtFree(pointer, u64(size));
  }
  private engineLength(engine: bigint): bigint {
    if (engine === 0n) { if (this.byte(0x14368f610n) && !this.byte(0x1436917d0n)) this.assertion(0x142561bc8n); return 0n; }
    const target = this.q(this.at(this.q(engine), 0x20n));
    if (target !== 0x14255f580n) this.stop('engine-length', target, 0x142561b80n);
    const value = this.unwrap(this.io.fileLength(this.q(this.at(engine, 0x10n)))); return value < 0n ? 0n : value;
  }
  private engineRead(engine: bigint, destination: bigint, bytes: bigint): bigint {
    if (engine === 0n) { if (this.byte(0x14368f610n) && !this.byte(0x1436917cen)) this.assertion(0x1425627f8n); return 0n; }
    const target = this.q(this.at(this.q(engine), 8n));
    if (target !== 0x14255fe10n) this.stop('engine-read', target, 0x1425627b0n);
    return this.unwrap(this.io.readEngineFile(engine, destination, bytes));
  }
  private checkHandle(stream: bigint, flag: bigint, site: bigint) { if (this.byte(0x14368f611n) && !this.byte(flag) && this.q(this.at(stream, 8n)) === 0n) this.assertion(site); }
  streamLength(stream: bigint): NativeContentResult<bigint> { return this.run(() => { this.checkHandle(stream, 0x1436917e9n, 0x142564fb4n); return this.engineLength(this.q(this.at(stream, 8n))); }); }
  readInto(stream: bigint, destination: bigint, bytes: bigint): NativeContentResult<null> { return this.run(() => { this.checkHandle(stream, 0x1436917e5n, 0x1425658b3n); this.engineRead(this.q(this.at(stream, 8n)), destination, bytes); return null; }); }
  readAll(stream: bigint, vector: bigint): NativeContentResult<number> {
    return this.run(() => {
      this.checkHandle(stream, 0x1436917ecn, 0x142565954n); this.checkHandle(stream, 0x1436917e9n, 0x1425659b2n);
      const size = this.engineLength(this.q(this.at(stream, 8n))); this.resizeValue(vector, Number(BigInt.asIntN(32, size)));
      if (size === 0n) return 1;
      const destination = this.q(vector); this.checkHandle(stream, 0x1436917e5n, 0x142565a33n);
      return this.engineRead(this.q(this.at(stream, 8n)), destination, size) === size ? 1 : 0;
    });
  }
  private initialize(vector: bigint) { this.wq(vector, 0n); this.wq(this.at(vector, 8n), 0n); this.tls(0x14011f740n); this.wq(this.at(vector, 0x10n), 0x1430fd000n); }
  reserve(vector: bigint, count: number): NativeContentResult<bigint> {
    return this.run(() => {
      count |= 0; this.initialize(vector);
      if (this.int(this.at(vector, 8n)) < count) {
        const capacity = this.capacity(this.int(this.at(vector, 8n)), count);
        const pointer = this.allocate(this.q(this.at(vector, 0x10n)), BigInt(capacity >>> 0), 0x14255a088n);
        this.copy(pointer, this.q(vector), BigInt(this.int(this.at(vector, 0xcn))), 0x14255a098n);
        this.release(this.q(this.at(vector, 0x10n)), this.q(vector), 0x14255a0a7n); this.wd(this.at(vector, 8n), capacity); this.wq(vector, pointer);
      }
      return vector;
    });
  }
  private resizeValue(vector: bigint, count: number) {
    count |= 0;
    if (count <= this.int(this.at(vector, 0xcn))) { this.wd(this.at(vector, 0xcn), count); return; }
    if (this.int(this.at(vector, 8n)) < count) {
      const capacity = this.capacity(this.int(this.at(vector, 8n)), count), pointer = this.allocate(this.q(this.at(vector, 0x10n)), BigInt(capacity >>> 0), 0x14255abf1n);
      this.copy(pointer, this.q(vector), BigInt(this.int(this.at(vector, 0xcn))), 0x14255ac01n);
      this.release(this.q(this.at(vector, 0x10n)), this.q(vector), 0x14255ac10n); this.wq(vector, pointer); this.wd(this.at(vector, 8n), capacity);
    }
    const oldCount = this.int(this.at(vector, 0xcn)), delta = count - oldCount | 0;
    if (delta > 0) this.zero(this.at(this.q(vector), BigInt(oldCount)), BigInt(delta), 0x14255ac38n);
    this.wd(this.at(vector, 0xcn), count);
  }
  resize(vector: bigint, count: number): NativeContentResult<null> { return this.run(() => { this.resizeValue(vector, count); return null; }); }
  private insert(vector: bigint, position: number, source: bigint, count: number) {
    const wanted = this.int(this.at(vector, 0xcn)) + count | 0;
    if (this.int(this.at(vector, 8n)) < wanted) {
      const capacity = this.capacity(this.int(this.at(vector, 8n)), wanted), pointer = this.allocate(this.q(this.at(vector, 0x10n)), BigInt(capacity >>> 0), 0x14018e497n);
      this.copy(this.at(pointer, BigInt(position)), source, BigInt(count), 0x14018e4a7n); this.copy(pointer, this.q(vector), BigInt(position), 0x14018e4b5n);
      const tail = this.at(this.q(vector), BigInt(position));
      this.copy(this.at(pointer, BigInt(count) + BigInt(position)), tail, u64(this.at(this.q(vector), BigInt(this.int(this.at(vector, 0xcn)))) - tail), 0x14018e4d2n);
      const next = this.int(this.at(vector, 0xcn)) + count | 0;
      const allocator = this.q(this.at(vector, 0x10n)), oldPointer = this.q(vector); this.wd(this.at(vector, 0xcn), 0);
      this.release(allocator, oldPointer, 0x14018e4f0n); this.wd(this.at(vector, 8n), capacity); this.wq(vector, pointer); this.wd(this.at(vector, 0xcn), next); return;
    }
    this.copy(this.at(this.q(vector), BigInt(this.int(this.at(vector, 0xcn)))), source, BigInt(count), 0x14018e511n);
    const current = this.int(this.at(vector, 0xcn)), pointer = this.q(vector), middle = this.at(pointer, BigInt(position)), oldEnd = this.at(pointer, BigInt(current)), next = current + count | 0;
    this.wd(this.at(vector, 0xcn), next);
    if (middle !== oldEnd && oldEnd !== this.at(pointer, BigInt(next))) this.stop('byte-vector-rotate', 0x1425a30c0n, 0x14018e543n);
  }
  private string(output: bigint, source: bigint, size: bigint) {
    if (size > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (size <= 15n) { this.wq(this.at(output, 0x10n), size); this.wq(this.at(output, 0x18n), 15n); this.copy(output, source, size, 0x14011f073n); this.wb(this.at(output, size), 0); return; }
    let capacity = size | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
    let pointer: bigint;
    if (capacity + 1n < 0x1000n) pointer = this.malloc(capacity + 1n);
    else { const allocation = this.malloc(u64(capacity + 0x28n)); if (allocation === 0n) this.stop('invalid-parameter', 0x1425c7db4n, 0x14011f12cn); pointer = u64(allocation + 0x27n) & ~31n; this.wq(this.at(pointer, -8n), allocation); }
    this.wq(output, pointer); this.wq(this.at(output, 0x10n), size); this.wq(this.at(output, 0x18n), capacity); this.copy(pointer, source, size, 0x14011f108n); this.wb(this.at(pointer, size), 0);
  }
  convertFalse(vector: bigint, output: bigint): NativeContentResult<bigint> {
    return this.run(() => {
      this.wq(this.at(this.entryStack, 0x10n), output);
      const frame = this.at(this.entryStack, -0x38n), temporary = this.at(frame, -0x48n), cap = this.at(temporary, 8n), used = this.at(temporary, 0xcn), alloc = this.at(temporary, 0x10n);
      this.wq(cap, 0n); this.tls(0x14255ab3bn); this.wq(alloc, 0x1430fd000n);
      let start = 0, scan = 0n, position = 0; const count = this.int(this.at(vector, 0xcn)); this.wd(this.at(frame, 0x50n), count);
      if (count > 0) {
        const storage = this.allocate(0x1430fd000n, BigInt(count >>> 0), 0x14255a95dn);
        this.release(0x1430fd000n, 0n, 0x14255a973n); this.wq(temporary, storage); this.wd(cap, count); this.wq(this.at(frame, 0x58n), BigInt(count));
        while (true) {
          let found = start; const currentCount = this.int(this.at(vector, 0xcn));
          if (start < currentCount) {
            const source = this.q(vector);
            while (this.byte(this.at(source, scan)) !== 13) { found = found + 1 | 0; scan = i64(scan + 1n); if (scan >= BigInt(currentCount)) { found = -1; scan = -1n; break; } }
          } else { found = -1; scan = -1n; }
          const source = this.at(this.q(vector), BigInt(start));
          if (scan === -1n) {
            this.insert(temporary, position, source, this.int(this.at(frame, 0x50n)) - start | 0);
            const allocator = this.q(alloc), oldCount = this.int(used), oldCapacity = this.int(cap); let pointer: bigint;
            if (oldCount === oldCapacity) {
              const nextCount = oldCount + 1 | 0, capacity = this.capacity(oldCapacity, nextCount);
              pointer = this.allocate(allocator, BigInt(capacity >>> 0), 0x14255aa87n); this.wb(this.at(pointer, BigInt(oldCount)), 0);
              const previous = this.q(temporary); this.copy(pointer, previous, BigInt(oldCount), 0x14255aa9en); this.copy(pointer, previous, 0n, 0x14255aaafn);
              this.release(allocator, previous, 0x14255aaben); this.wq(temporary, pointer); this.wd(cap, capacity); this.wd(used, nextCount);
            } else { pointer = this.q(temporary); this.wb(this.at(pointer, BigInt(oldCount)), 0); this.wd(used, oldCount + 1); }
            const text = this.at(frame, -0x30n); this.wq(text, 0n); this.wq(this.at(text, 8n), 0n); this.wq(this.at(text, 0x10n), 0n); this.wq(this.at(text, 0x18n), 0n);
            let length = 0n; while (this.byte(this.at(pointer, length)) !== 0) length++;
            this.string(text, pointer, length);
            this.memory.writeBytes(output, Uint8Array.from({ length: 16 }, (_, index) => this.byte(this.at(text, BigInt(index)))));
            this.memory.writeBytes(this.at(output, 0x10n), Uint8Array.from({ length: 16 }, (_, index) => this.byte(this.at(text, 0x10n + BigInt(index)))));
            if (pointer !== 0n) this.release(allocator, pointer, 0x14255aa1fn); return output;
          }
          this.insert(temporary, position, source, found - start | 0); start = found + 1 | 0; scan = i64(scan + 1n);
          if (scan >= i64(this.q(this.at(frame, 0x58n)))) break;
          position = this.int(used);
        }
      }
      this.wq(this.at(output, 0x10n), 0n); this.wq(this.at(output, 0x18n), 0n); this.wq(output, 0n); this.wq(this.at(output, 8n), 0n); this.wq(this.at(output, 0x10n), 0n); this.wq(this.at(output, 0x18n), 15n); this.wb(output, 0);
      if (count > 0) { const pointer = this.q(temporary); if (pointer !== 0n) this.release(this.q(alloc), pointer, 0x14255aa1fn); }
      return output;
    });
  }
  destroyStream(stream: bigint): NativeContentResult<null> {
    return this.run(() => {
      this.wq(stream, 0x142c06138n); const engine = this.q(this.at(stream, 8n));
      if (engine !== 0n) {
        const target = this.q(this.q(engine)); if (target !== 0x14255e820n) this.stop('engine-destroy', target, 0x1401b5c5dn);
        this.wq(engine, 0x142c05ff8n); const result = this.unwrap(this.io.close(this.q(this.at(engine, 0x10n))));
        if (result === 0 && this.byte(0x14368f610n) && !this.byte(0x1436917c9n)) this.stop('engine-close-diagnostic', 0x142579480n, 0x14255e85an);
        this.free(engine, 24n, 0x14255e8bbn); this.wq(this.at(stream, 8n), 0n);
      }
      const capacity = this.q(this.at(stream, 0x28n));
      if (capacity > 15n) { let pointer = this.q(this.at(stream, 0x10n)), size = u64(capacity + 1n); if (size >= 0x1000n) { size = u64(size + 0x27n); const allocation = this.q(this.at(pointer, -8n)); if (u64(pointer - allocation - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, 0x142564c7an); pointer = allocation; } this.free(pointer, size, 0x142564c5bn); }
      this.wq(this.at(stream, 0x20n), 0n); this.wq(this.at(stream, 0x28n), 15n); this.wb(this.at(stream, 0x10n), 0); return null;
    });
  }
}
