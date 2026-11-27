import type { InputObjectMemory, InputObjectServices } from './input-object';
import type { ParserConstantsServices } from './parser-constants';
import type { TechnologyFieldResult } from './technology-fields';
type Failure = Exclude<TechnologyFieldResult, { kind: 'complete' }>;
export class DatabasePrimitiveStop { constructor(readonly result: Failure) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);
/** Concrete string/hash and record relocation closure shared by actual database insertion. */
export class NativeDatabasePrimitives {
  constructor(readonly memory: InputObjectMemory, readonly services: ParserConstantsServices & InputObjectServices, readonly budget = 1_000_000) {}
  q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  int(a: bigint) { return this.d(a) | 0; }
  b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  bytes(a: bigint, n: number) { return Uint8Array.from({ length: n }, (_, i) => this.b(a + BigInt(i))); }
  write(a: bigint, raw: Uint8Array) { for (let i = 0; i < raw.length; i++) this.wb(a + BigInt(i), raw[i]!); }
  zero(a: bigint, n: number) { this.write(a, new Uint8Array(n)); }
  stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new DatabasePrimitiveStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  accept<T>(result: { kind: 'returned'; value: T } | { kind: 'complete' } | Failure): T {
    if (result.kind === 'runtime-required') throw new DatabasePrimitiveStop(result);
    if (result.kind !== 'returned') throw Error('Native helper returned no value');
    return result.value;
  }
  copy(dst: bigint, src: bigint, n: bigint, site: bigint) {
    if (!this.services.copy) this.stop('copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(n));
  }
  malloc(n: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crtAllocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(n)));
  }
  free(pointer: bigint, site = 0x14222f060n) {
    if (!this.services.crtFree) this.stop('crtFree', 0x1425cec00n, site);
    this.services.crtFree(u64(pointer));
  }
  backing(a: bigint, site: bigint) {
    const target = this.q(this.q(a) + 0x38n);
    if (target === 0x1401693c0n) return this.q(a + 0x20n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, a));
  }
  allocate(a: bigint, n: bigint, alignment: number, site: bigint): bigint {
    const target = this.q(this.q(a) + 8n);
    if (target === 0x140121d20n) return this.allocate(this.backing(a, 0x140121d33n), n, alignment, 0x140121d50n);
    if (target === 0x14011d540n) return this.malloc(n, 0x14011d547n);
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, a, u64(n), alignment));
  }
  release(a: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.q(a) + 0x10n);
    if (target === 0x140122500n) { if (pointer !== u64(a + 8n)) this.release(this.backing(a, 0x140122515n), pointer, 0x140122526n); }
    else if (target === 0x14011d560n) { if (pointer !== 0n) this.free(pointer); }
    else { if (!this.services.release) this.stop('allocator-release', target, site); this.services.release(target, a, pointer); }
  }
  growth(capacity: number, needed: number, factor?: number) {
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.d(0x142795988n), true);
    const value = Math.fround(Math.fround(capacity) * (factor ?? view.getFloat32(0, true)));
    const converted = !Number.isFinite(value) || value >= 2147483648 || value < -2147483648 ? -2147483648 : Math.trunc(value);
    return converted < needed ? needed : converted;
  }
  stringPointer(s: bigint) { return this.q(s + 24n) > 15n ? this.q(s) : s; }
  stringFree(s: bigint, invalid: bigint) {
    let n = this.q(s + 24n) + 1n; if (n <= 16n) return;
    let pointer = this.q(s);
    if (n >= 0x1000n) { n += 0x27n; const raw = this.q(pointer - 8n); if (u64(pointer - raw - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, invalid); pointer = raw; }
    this.free(pointer);
  }
  stringAllocate(capacity: bigint, copied: boolean) {
    if (capacity + 1n < 0x1000n) return this.malloc(capacity + 1n, copied ? 0x14011f83en : 0x14011f0ecn);
    const raw = this.malloc(capacity + 0x28n, copied ? 0x14011f7f7n : 0x14011f0a4n);
    if (raw === 0n) this.stop('invalid-parameter', 0x1425c7db4n, copied ? 0x14011f876n : 0x14011f12cn);
    const pointer = u64(raw + 0x27n) & ~31n; this.wq(pointer - 8n, raw); return pointer;
  }
  stringConstruct(s: bigint, src: bigint, n: bigint) {
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (n <= 15n) { this.wq(s + 16n, n); this.wq(s + 24n, 15n); this.copy(s, src, n, 0x14011f073n); this.wb(s + n, 0); return; }
    let capacity = n | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
    const pointer = this.stringAllocate(capacity, false); this.wq(s, pointer); this.wq(s + 16n, n); this.wq(s + 24n, capacity);
    this.copy(pointer, src, n, 0x14011f108n); this.wb(pointer + n, 0);
  }
  stringCopy(dst: bigint, src: bigint) {
    this.zero(dst, 16); this.wq(dst + 16n, 0n); this.wq(dst + 24n, 0n);
    const n = this.q(src + 16n), pointer = this.stringPointer(src);
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f882n);
    if (n <= 15n) { this.wq(dst + 16n, n); this.wq(dst + 24n, 15n); this.write(dst, this.bytes(pointer, 16)); }
    else { let capacity = n | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
      const buffer = this.stringAllocate(capacity, true); this.wq(dst, buffer); this.wq(dst + 16n, n); this.wq(dst + 24n, capacity); this.copy(buffer, pointer, n + 1n, 0x14011f858n); }
  }
  /** 140C1F080 captures the input span before clearing the output header. */
  hashRecord(out: bigint, span: bigint) {
    const n = this.q(span + 8n), pointer = this.q(span);
    this.zero(out, 16); this.wq(out + 16n, 0n); this.wq(out + 24n, 0n); this.stringConstruct(out, pointer, n);
    let at = this.stringPointer(out), hash = 0x811c9dc5; const count = this.int(out + 16n);
    for (let i = 0; i < count; i++) { const byte = this.b(at++); hash = Math.imul(hash ^ (byte >= 65 && byte <= 90 ? byte + 32 : byte), 0x1000193) >>> 0; }
    this.wd(out + 32n, hash);
  }
  /** 14019DA20 moves records during vector growth, retaining retired bytes. */
  moveRecords(first: bigint, end: bigint, destination: bigint) {
    let steps = 0;
    while (first !== end) {
      if (++steps > this.budget) this.stop('category-record-growth-budget', 0x14019da50n, 0x14019dad9n);
      this.zero(destination, 16); this.wq(destination + 16n, 0n); this.wq(destination + 24n, 0n);
      this.write(destination, this.bytes(first, 16)); this.write(destination + 16n, this.bytes(first + 16n, 16));
      this.wq(first + 16n, 0n); this.wq(first + 24n, 15n); this.wb(first, 0);
      this.wd(destination + 32n, this.d(first + 32n)); this.stringFree(first, 0x14019daf4n);
      this.wq(first + 16n, 0n); this.wq(first + 24n, 15n); this.wb(first, 0);
      first += 40n; destination += 40n;
    }
  }
  appendRecord(vector: bigint, source: bigint, factor?: number) {
    const count = this.int(vector + 12n), capacity = this.int(vector + 8n);
    if (count !== capacity) {
      const out = this.q(vector) + BigInt(count) * 40n; this.stringCopy(out, source); this.wd(out + 32n, this.d(source + 32n)); this.wd(vector + 12n, this.d(vector + 12n) + 1); return;
    }
    const next = this.growth(capacity, (count + 1) | 0, factor), pointer = this.allocate(this.q(vector + 16n), BigInt(next) * 40n, 8, 0x140b1fc17n);
    const out = pointer + BigInt(this.int(vector + 12n)) * 40n;
    this.stringCopy(out, source); this.wd(out + 32n, this.d(source + 32n));
    const old = this.q(vector), end = old + BigInt(this.int(vector + 12n)) * 40n; this.moveRecords(old, end, pointer);
    const length = (this.int(vector + 12n) + 1) | 0; this.wd(vector + 12n, 0);
    this.release(this.q(vector + 16n), this.q(vector), 0x14066a2a5n);
    this.wq(vector, pointer); this.wd(vector + 8n, next); this.wd(vector + 12n, length);
  }
}
