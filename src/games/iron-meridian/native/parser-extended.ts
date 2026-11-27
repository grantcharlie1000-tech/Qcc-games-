import type { KeywordRecordMemory } from './keyword-record';
import { NativeKeywordRecord } from './keyword-record';
import { NativeTokenizer } from './tokenizer';
import type { NativeParserConstants, ParserConstantsServices } from './parser-constants';

export type ParserExtendedResult = { kind: 'complete' }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type RuntimeStop = Exclude<ParserExtendedResult, { kind: 'complete' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Original142543FD0, composing concrete lexer and variable helpers. */
export class NativeParserExtended {
  constructor(private readonly memory: KeywordRecordMemory, private readonly services: ParserConstantsServices,
    private readonly tokenizer: NativeTokenizer, private readonly constants: NativeParserConstants, private readonly loopBudget = 1_000_000) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private backing(allocator: bigint, site: bigint): bigint {
    const target = this.q(this.q(allocator) + 0x38n);
    if (target === 0x1401693c0n) return this.q(allocator + 0x20n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private allocate(allocator: bigint, bytes: bigint, site: bigint): bigint {
    const target = this.q(this.q(allocator) + 8n);
    if (target === 0x140121d20n) return this.allocate(this.backing(allocator, 0x140121d33n), bytes, 0x140121d50n);
    if (target === 0x14011d540n) {
      if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, 0x14011d547n);
      return u64(this.services.crtAllocate(bytes));
    }
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, bytes, 1));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.q(allocator) + 0x10n);
    if (target === 0x140122500n) {
      if (pointer !== u64(allocator + 8n)) this.release(this.backing(allocator, 0x140122515n), pointer, 0x140122526n);
    } else if (target === 0x14011d560n) {
      if (pointer !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(pointer);
      }
    } else {
      if (!this.services.release) this.stop('allocator-release', target, site);
      this.services.release(target, allocator, pointer);
    }
  }
  private copy(destination: bigint, source: bigint, count: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(destination, source, count);
  }
  /** Actual142547B30. The span length is reloaded after resizing, then captured across copy. */
  private setTokenSpan(token: bigint, kind: number, span: bigint) {
    this.wb(token + 4n, 0); this.wd(token, kind);
    const result = new NativeKeywordRecord(this.memory, this.services, 0n).resize(token, (this.int(span + 8n) + 1) | 0);
    if (result.kind !== 'returned') throw new Stop(result);
    const length = this.q(span + 8n), destination = result.value;
    this.copy(destination, this.q(span), length, 0x142547b63n); this.wb(destination + length, 0);
  }
  private resizeBytes(vector: bigint, requested: number) {
    requested |= 0;
    if (requested <= this.int(vector + 12n) || requested <= this.int(vector + 8n)) { this.wd(vector + 12n, requested); return; }
    const allocator = this.q(vector + 16n), oldCapacity = this.int(vector + 8n);
    const f = new DataView(new ArrayBuffer(4)); f.setUint32(0, this.d(0x142795988n), true);
    const product = Math.fround(Math.fround(oldCapacity) * f.getFloat32(0, true));
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    const capacity = converted < requested ? requested : converted;
    const destination = this.allocate(allocator, BigInt(capacity >>> 0), 0x1401b157cn);
    this.copy(destination, this.q(vector), u64(BigInt(this.int(vector + 12n))), 0x1401b158cn);
    this.release(this.q(vector + 16n), this.q(vector), 0x1401b159bn);
    this.wq(vector, destination); this.wd(vector + 8n, capacity); this.wd(vector + 12n, requested);
  }
  /** Actual1401625C0. Captures source count/pointer before resize callbacks. */
  assignToken(destination: bigint, source: bigint): ParserExtendedResult {
    try { this.assign(u64(destination), u64(source)); return { kind: 'complete' }; }
    catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
  private assign(destination: bigint, source: bigint) {
    this.wd(destination, this.d(source)); this.wb(destination + 4n, this.b(source + 4n));
    if (u64(destination + 8n) === u64(source + 8n)) return;
    const count = this.int(source + 0x14n), pointer = this.q(source + 8n);
    this.wd(destination + 0x14n, 0); this.resizeBytes(u64(destination + 8n), count);
    this.copy(this.q(destination + 8n), pointer, u64(BigInt(count)), 0x140162612n);
  }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n);
    if (target !== 0x14253f460n) this.stop('input-next-token', target, site);
    const result = this.tokenizer.next(input, entry);
    if (result.kind !== 'returned') throw new Stop(result);
    return result.value >>> 0;
  }
  consume(parser: bigint, strictByte: number, entryStack: bigint): ParserExtendedResult {
    parser = u64(parser); strictByte &= 255; entryStack = u64(entryStack);
    const child = u64(entryStack - 0x90n), stack = u64(entryStack - 0x88n); let steps = 0;
    const current = () => u64(this.q(parser + 0x28n) + 0x18n);
    // The original diagnostic prefix has no semantic writes before its first dependency.
    const diagnostic = (_site: bigint) => this.stop('lexer-diagnostic-context', 0x14254bce0n, 0x142542cb5n);
    try {
      let available = this.next(this.q(parser + 0x28n), child, 0x142543ffan);
      if (available !== 0) {
        while (true) {
          if (++steps > this.loopBudget) this.stop('parser-consumption-loop-budget', 0x142544010n, 0x142544010n);
          const token = current(), text = this.int(token + 0x14n) === 0 ? 0x14279471dn : this.q(token + 8n);
          if (this.b(text) !== 64) break;
          const defined = this.constants.define(parser, child);
          if (defined.kind === 'runtime-required') throw new Stop(defined);
          available = this.next(this.q(parser + 0x28n), child, 0x14254403cn);
          if (available === 0) {
            if (strictByte !== 0) diagnostic(0x14254413dn);
            return { kind: 'complete' };
          }
        }
        this.assign(u64(parser + 0x30n), current());
        available = this.next(this.q(parser + 0x28n), child, 0x142544064n);
        if (available !== 0 && (this.int(current()) === 1 || this.int(current()) === 0x1d3 || this.int(current()) === 0x1d4)) {
          this.assign(u64(parser + 0x78n), current());
          const kind = this.d(parser + 0x78n);
          if (strictByte !== 0 && kind !== 1 && ((kind - 0x1d3) >>> 0) > 1) diagnostic(0x1425440d2n);
          const input = this.q(parser + 0x28n);
          if (this.b(input + 0x64n) === 0) {
            const result = this.next(input, child, 0x1425440e8n);
            this.wd(input + 0x10n, result);
            if (result === 0) this.wd(input + 0x18n, 0x13);
            this.wb(input + 0x64n, 1);
          }
          if (this.int(input + 0x18n) === 4) {
            this.wq(stack + 0x20n, 0x14279471dn); this.wq(stack + 0x28n, 0n);
            //142544118 re-stores the loaded sixteen-byte descriptor.
            const pointer = this.q(stack + 0x20n), count = this.q(stack + 0x28n);
            this.wq(stack + 0x20n, pointer); this.wq(stack + 0x28n, count);
            this.setTokenSpan(u64(parser + 0xc0n), 0, stack + 0x20n);
            if (strictByte !== 0) diagnostic(0x14254413dn);
            return { kind: 'complete' };
          }
          const text = this.int(input + 0x2cn) !== 0 ? this.q(input + 0x20n) : 0x14279471dn;
          if (this.b(text) === 64) {
            this.next(this.q(parser + 0x28n), child, 0x14254415en);
            const temporary = u64(stack + 0x30n), resolved = this.constants.resolve(parser, temporary, child);
            if (resolved.kind === 'runtime-required') throw new Stop(resolved);
            if (resolved.kind !== 'returned') throw new Error('Resolution returned no native token');
            const value = resolved.value;
            this.wd(parser + 0xc0n, this.d(value)); this.wb(parser + 0xc4n, this.b(value + 4n));
            const moved = this.constants.moveBytes(parser + 0xc8n, value + 8n, child);
            if (moved.kind === 'runtime-required') throw new Stop(moved);
            const pointer = this.q(stack + 0x38n);
            if (pointer !== 0n) {
              this.wd(stack + 0x44n, 0);
              this.release(this.q(stack + 0x48n), pointer, 0x1425441aan);
            }
            return { kind: 'complete' };
          }
          this.next(this.q(parser + 0x28n), child, 0x1425441afn);
          this.assign(u64(parser + 0xc0n), current());
          return { kind: 'complete' };
        }
      }
      if (strictByte !== 0) diagnostic(0x14254413dn);
      return { kind: 'complete' };
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
