export interface ReaderLifetimeMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
  writeBytes(address: bigint, value: Uint8Array): void;
}
export interface ReaderLifetimeServices {
  crtFree?(pointer: bigint): void;
  release?(target: bigint, allocator: bigint, pointer: bigint): void;
  allocatorGetter?(target: bigint, allocator: bigint): bigint;
}
export type ReaderLifetimeResult<T> = { kind: 'returned'; value: T } | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type Stop = Extract<ReaderLifetimeResult<never>, { kind: 'runtime-required' }>;
class LifetimeStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);
export class NativeReaderLifetime {
  constructor(private readonly memory: ReaderLifetimeMemory, private readonly services: ReaderLifetimeServices = {}) {}
  private at(address: bigint, offset: bigint) { return u64(address + offset); }
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private wd(address: bigint, value: number) { this.memory.writeDword(u64(address), value >>> 0); }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private run<T>(operation: () => T): ReaderLifetimeResult<T> {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof LifetimeStop) return error.result; throw error; }
  }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new LifetimeStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private free(pointer: bigint) {
    // Both original delete and global-free wrappers tail-jump to this same CRT free.
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(pointer);
  }
  private backing(allocator: bigint) {
    const target = this.q(this.at(this.q(allocator), 0x38n));
    if (target === 0x1401693c0n) return this.q(this.at(allocator, 0x20n));
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, 0x140122515n);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.at(this.q(allocator), 0x10n));
    if (target === 0x140122500n) {
      if (pointer !== this.at(allocator, 8n)) this.release(this.backing(allocator), pointer, 0x140122526n);
    } else if (target === 0x14011d560n) {
      if (pointer !== 0n) this.free(pointer);
    } else {
      if (!this.services.release) this.stop('allocator-release', target, site);
      this.services.release(target, allocator, pointer);
    }
  }
  private clearVector(vector: bigint) {
    const pointer = this.q(vector);
    if (pointer === 0n) return;
    this.wd(this.at(vector, 0xcn), 0);
    this.release(this.q(this.at(vector, 0x10n)), pointer, 0x14012032fn);
    this.wq(vector, 0n); this.wd(this.at(vector, 8n), 0);
  }
  private clearBase(reader: bigint) {
    this.wq(reader, 0x142c07950n);
    const capacity = this.q(this.at(reader, 0x30n));
    if (capacity > 15n) {
      let pointer = this.q(this.at(reader, 0x18n));
      if (u64(capacity + 1n) >= 4096n) {
        const allocation = this.q(this.at(pointer, -8n));
        if (u64(pointer - allocation - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, 0x142576b74n);
        pointer = allocation;
      }
      this.free(pointer);
    }
    this.wq(this.at(reader, 0x28n), 0n); this.wq(this.at(reader, 0x30n), 15n); this.wb(this.at(reader, 0x18n), 0);
  }
  destroyVector(vector: bigint): ReaderLifetimeResult<null> { return this.run(() => { this.clearVector(u64(vector)); return null; }); }
  destroyBase(reader: bigint): ReaderLifetimeResult<null> { return this.run(() => { this.clearBase(u64(reader)); return null; }); }
  destroyReader(reader: bigint, flags: number): ReaderLifetimeResult<bigint> {
    return this.run(() => {
      reader = u64(reader); flags >>>= 0;
      const ownsSource = (this.memory.readByte(this.at(reader, 0x55n)) & 255) !== 0;
      this.wq(reader, 0x142c06c80n);
      if (ownsSource) {
        this.free(this.q(this.at(reader, 0x40n)));
        const vector = this.q(this.at(reader, 0x38n));
        if (vector !== 0n) { this.clearVector(vector); this.free(vector); }
        this.wq(this.at(reader, 0x38n), 0n); this.wq(this.at(reader, 0x40n), 0n);
      }
      this.clearBase(reader);
      if ((flags & 1) !== 0) this.free(reader);
      return reader;
    });
  }
}
