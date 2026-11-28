import type { KeywordRecordMemory, KeywordRecordServices } from './keyword-record';

export type TokenBufferResult = { kind: 'complete' }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type RuntimeStop = Exclude<TokenBufferResult, { kind: 'complete' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);

/** Actual14253E630 token-byte append and140678EB0 count reset. */
export class NativeTokenBuffer {
  constructor(private readonly memory: KeywordRecordMemory, private readonly services: KeywordRecordServices) {}
  private at(pointer: bigint, offset: bigint) { return u64(pointer + offset); }
  private q(pointer: bigint) { return u64(this.memory.readQword(u64(pointer))); }
  private int(pointer: bigint) { return this.memory.readDword(u64(pointer)) | 0; }
  private wd(pointer: bigint, value: number) { this.memory.writeDword(u64(pointer), value >>> 0); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private backing(allocator: bigint, site: bigint) {
    const target = this.q(this.at(this.q(allocator), 0x38n));
    if (target === 0x1401693c0n) return this.q(this.at(allocator, 0x20n));
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private allocate(allocator: bigint, bytes: bigint, site: bigint): bigint {
    const target = this.q(this.at(this.q(allocator), 8n));
    if (target === 0x140121d20n) return this.allocate(this.backing(allocator, 0x140121d33n), bytes, 0x140121d50n);
    if (target === 0x14011d540n) {
      if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, 0x14011d547n);
      return u64(this.services.crtAllocate(bytes));
    }
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, bytes, 1));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.at(this.q(allocator), 0x10n));
    if (target === 0x140122500n) {
      if (pointer !== this.at(allocator, 8n)) this.release(this.backing(allocator, 0x140122515n), pointer, 0x140122526n);
      return;
    }
    if (target === 0x14011d560n) {
      if (pointer !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(pointer);
      }
      return;
    }
    if (!this.services.release) this.stop('allocator-release', target, site);
    this.services.release(target, allocator, pointer);
  }
  append(token: bigint, value: number): TokenBufferResult {
    token = u64(token); value &= 255;
    try {
      const count = this.int(this.at(token, 0x14n)), capacity = this.int(this.at(token, 0x10n));
      if (count !== capacity) {
        this.memory.writeByte(this.at(this.q(this.at(token, 8n)), BigInt(count)), value);
        this.wd(this.at(token, 0x14n), (this.int(this.at(token, 0x14n)) + 1) | 0);
        return { kind: 'complete' };
      }
      const required = (count + 1) | 0, allocator = this.q(this.at(token, 0x18n));
      const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.memory.readDword(0x142795988n), true);
      const product = Math.fround(Math.fround(capacity) * view.getFloat32(0, true));
      const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
      const nextCapacity = converted < required ? required : converted;
      const destination = this.allocate(allocator, BigInt(nextCapacity >>> 0), 0x14253e682n);
      this.memory.writeByte(this.at(destination, BigInt(this.int(this.at(token, 0x14n)))), value);
      const copyCount = u64(BigInt(this.int(this.at(token, 0x14n)))), source = this.q(this.at(token, 8n));
      if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, 0x14253e69an);
      this.services.copy(destination, source, copyCount);
      const finalCount = (this.int(this.at(token, 0x14n)) + 1) | 0;
      //14253E6A2/6A8 capture both release arguments before6AC clears count.
      const releaseAllocator = this.q(this.at(token, 0x18n)), released = this.q(this.at(token, 8n));
      this.wd(this.at(token, 0x14n), 0); this.release(releaseAllocator, released, 0x14253e6b6n);
      this.memory.writeQword(this.at(token, 8n), destination); this.wd(this.at(token, 0x10n), nextCapacity); this.wd(this.at(token, 0x14n), finalCount);
      return { kind: 'complete' };
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
  clear(token: bigint): TokenBufferResult { this.wd(this.at(token, 0x14n), 0); return { kind: 'complete' }; }
}
