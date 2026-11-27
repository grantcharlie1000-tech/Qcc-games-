import { NativeKeywordRecord } from './keyword-record';
import type { InputObjectMemory, InputObjectServices } from './input-object';
import type { NativeTokenizer } from './tokenizer';
import type { NativeParserConstants, ParserConstantsServices } from './parser-constants';
import type { NativeParserExtended } from './parser-extended';
import type { TechnologyFieldResult } from './technology-fields';

type Failure = Exclude<TechnologyFieldResult, { kind: 'complete' }>;
class Stop { constructor(readonly result: Failure) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Actual 140B25C90 categories, 140C1F080, 14066A1E0 and 14012E040. */
export class NativeTechnologyCategoryField {
  constructor(private readonly memory: InputObjectMemory, private readonly services: ParserConstantsServices & InputObjectServices,
    private readonly tokenizer: NativeTokenizer, private readonly constants: NativeParserConstants,
    private readonly parser: NativeParserExtended, private readonly gsBase: bigint, private readonly budget = 1_000_000) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private bytes(a: bigint, n: number) { return Uint8Array.from({ length: n }, (_, i) => this.b(a + BigInt(i))); }
  private write(a: bigint, raw: Uint8Array) { for (let i = 0; i < raw.length; i++) this.wb(a + BigInt(i), raw[i]!); }
  private zero(a: bigint, n: number) { this.write(a, new Uint8Array(n)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private accept<T>(result: { kind: 'returned'; value: T } | { kind: 'complete' } | Failure): T {
    if (result.kind === 'runtime-required') throw new Stop(result);
    if (result.kind !== 'returned') throw Error('Native helper returned no value');
    return result.value;
  }
  private copy(dst: bigint, src: bigint, n: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(n));
  }
  private malloc(n: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(n)));
  }
  private free(pointer: bigint, site = 0x14222f060n) {
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, site);
    this.services.crtFree(u64(pointer));
  }
  private backing(a: bigint, site: bigint) {
    const target = this.q(this.q(a) + 0x38n);
    if (target === 0x1401693c0n) return this.q(a + 0x20n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, a));
  }
  private allocate(a: bigint, n: bigint, alignment: number, site: bigint): bigint {
    const target = this.q(this.q(a) + 8n);
    if (target === 0x140121d20n) return this.allocate(this.backing(a, 0x140121d33n), n, alignment, 0x140121d50n);
    if (target === 0x14011d540n) return this.malloc(n, 0x14011d547n);
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, a, u64(n), alignment));
  }
  private release(a: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.q(a) + 0x10n);
    if (target === 0x140122500n) { if (pointer !== u64(a + 8n)) this.release(this.backing(a, 0x140122515n), pointer, 0x140122526n); }
    else if (target === 0x14011d560n) { if (pointer !== 0n) this.free(pointer); }
    else { if (!this.services.release) this.stop('allocator-release', target, site); this.services.release(target, a, pointer); }
  }
  private growth(capacity: number, needed: number) {
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.d(0x142795988n), true);
    const value = Math.fround(Math.fround(capacity) * view.getFloat32(0, true));
    const converted = !Number.isFinite(value) || value >= 2147483648 || value < -2147483648 ? -2147483648 : Math.trunc(value);
    return converted < needed ? needed : converted;
  }
  private stringPointer(s: bigint) { return this.q(s + 24n) > 15n ? this.q(s) : s; }
  private stringFree(s: bigint, invalid: bigint) {
    let n = this.q(s + 24n) + 1n; if (n <= 16n) return;
    let pointer = this.q(s);
    if (n >= 0x1000n) { n += 0x27n; const raw = this.q(pointer - 8n); if (u64(pointer - raw - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, invalid); pointer = raw; }
    this.free(pointer);
  }
  private stringAllocate(capacity: bigint, copied: boolean) {
    if (capacity + 1n < 0x1000n) return this.malloc(capacity + 1n, copied ? 0x14011f83en : 0x14011f0ecn);
    const raw = this.malloc(capacity + 0x28n, copied ? 0x14011f7f7n : 0x14011f0a4n);
    if (raw === 0n) this.stop('invalid-parameter', 0x1425c7db4n, copied ? 0x14011f876n : 0x14011f12cn);
    const pointer = u64(raw + 0x27n) & ~31n; this.wq(pointer - 8n, raw); return pointer;
  }
  private stringConstruct(s: bigint, src: bigint, n: bigint) {
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (n <= 15n) { this.wq(s + 16n, n); this.wq(s + 24n, 15n); this.copy(s, src, n, 0x14011f073n); this.wb(s + n, 0); return; }
    let capacity = n | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
    const pointer = this.stringAllocate(capacity, false); this.wq(s, pointer); this.wq(s + 16n, n); this.wq(s + 24n, capacity);
    this.copy(pointer, src, n, 0x14011f108n); this.wb(pointer + n, 0);
  }
  private stringCopy(dst: bigint, src: bigint) {
    this.zero(dst, 16); this.wq(dst + 16n, 0n); this.wq(dst + 24n, 0n);
    const n = this.q(src + 16n), pointer = this.stringPointer(src);
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f882n);
    if (n <= 15n) { this.wq(dst + 16n, n); this.wq(dst + 24n, 15n); this.write(dst, this.bytes(pointer, 16)); }
    else { let capacity = n | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
      const buffer = this.stringAllocate(capacity, true); this.wq(dst, buffer); this.wq(dst + 16n, n); this.wq(dst + 24n, capacity); this.copy(buffer, pointer, n + 1n, 0x14011f858n); }
  }
  /** 140C1F080 captures the input span before clearing the output header. */
  private hashRecord(out: bigint, span: bigint) {
    const n = this.q(span + 8n), pointer = this.q(span);
    this.zero(out, 16); this.wq(out + 16n, 0n); this.wq(out + 24n, 0n); this.stringConstruct(out, pointer, n);
    let at = this.stringPointer(out), hash = 0x811c9dc5; const count = this.int(out + 16n);
    for (let i = 0; i < count; i++) { const byte = this.b(at++); hash = Math.imul(hash ^ (byte >= 65 && byte <= 90 ? byte + 32 : byte), 0x1000193) >>> 0; }
    this.wd(out + 32n, hash);
  }
  /** 1425D0588 -> 1425D054C, the explicit no-locale path. */
  private same(left: bigint, right: bigint) {
    if (this.d(0x143694cccn) !== 0) this.stop('category-locale-comparison', 0x1425d05c2n, 0x1425d0593n);
    if (left === 0n || right === 0n) this.stop('crt-error-state', 0x1425dccf0n, 0x1425d059an);
    for (let steps = 0; steps < this.budget; steps++) {
      const a = this.b(left++), b = this.b(right++), foldedA = a >= 65 && a <= 90 ? a + 32 : a, foldedB = b >= 65 && b <= 90 ? b + 32 : b;
      if (foldedA !== foldedB) return false; if (foldedA === 0) return true;
    }
    this.stop('category-compare-budget', 0x1425d0552n, 0x1425d0585n);
  }
  /** 14019DA20 moves records during vector growth, retaining retired bytes. */
  private moveRecords(first: bigint, end: bigint, destination: bigint) {
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
  private appendRecord(vector: bigint, source: bigint) {
    const count = this.int(vector + 12n), capacity = this.int(vector + 8n);
    if (count !== capacity) {
      const out = this.q(vector) + BigInt(count) * 40n; this.stringCopy(out, source); this.wd(out + 32n, this.d(source + 32n)); this.wd(vector + 12n, this.d(vector + 12n) + 1); return;
    }
    const next = this.growth(capacity, (count + 1) | 0), pointer = this.allocate(this.q(vector + 16n), BigInt(next) * 40n, 8, 0x14066a23en);
    const out = pointer + BigInt(this.int(vector + 12n)) * 40n;
    this.stringCopy(out, source); this.wd(out + 32n, this.d(source + 32n));
    const old = this.q(vector), end = old + BigInt(this.int(vector + 12n)) * 40n; this.moveRecords(old, end, pointer);
    const length = (this.int(vector + 12n) + 1) | 0; this.wd(vector + 12n, 0);
    this.release(this.q(vector + 16n), this.q(vector), 0x14066a2a5n);
    this.wq(vector, pointer); this.wd(vector + 8n, next); this.wd(vector + 12n, length);
  }
  private appendKind(vector: bigint, source: bigint) {
    const count = this.int(vector + 12n), capacity = this.int(vector + 8n);
    if (count !== capacity) { this.wd(this.q(vector) + BigInt(count) * 4n, this.d(source)); this.wd(vector + 12n, this.d(vector + 12n) + 1); return; }
    const next = this.growth(capacity, (count + 1) | 0), pointer = this.allocate(this.q(vector + 16n), BigInt(next >>> 0) * 4n, 4, 0x14012e09cn);
    this.wd(pointer + BigInt(this.int(vector + 12n)) * 4n, this.d(source));
    this.copy(pointer, this.q(vector), BigInt(this.int(vector + 12n)) * 4n, 0x14012e0ban);
    const length = (this.int(vector + 12n) + 1) | 0; this.wd(vector + 12n, 0); this.release(this.q(vector + 16n), this.q(vector), 0x14012e0d5n);
    this.wq(vector, pointer); this.wd(vector + 8n, next); this.wd(vector + 12n, length);
  }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n); if (target !== 0x14253f460n) this.stop('input-next-token', target, site);
    return this.accept(this.tokenizer.next(input, entry));
  }
  private current(parser: bigint) { return this.q(parser + 0x28n) + 0x18n; }
  private token(dst: bigint, src: bigint) {
    this.wd(dst, this.d(src)); this.wb(dst + 4n, this.b(src + 4n)); const n = this.int(src + 20n), pointer = this.q(src + 8n);
    this.accept(new NativeKeywordRecord(this.memory, this.services, this.gsBase).initializeVector(dst + 8n));
    this.accept(this.constants.insertBytes(dst + 8n, this.int(dst + 20n), pointer, n));
  }
  private cleanToken(token: bigint, site: bigint) {
    const pointer = this.q(token + 8n); if (pointer !== 0n) { this.wd(token + 20n, 0); this.release(this.q(token + 24n), pointer, site); }
  }
  private resolve(parser: bigint, token: bigint, temporary: bigint, child: bigint, freeSite: bigint, assign: boolean) {
    const pointer = this.q(token + 8n); if (this.int(token + 20n) === 0 || this.b(pointer) !== 64) return;
    const value = this.accept(this.constants.resolve(parser, temporary, child)); this.wd(token, this.d(value)); this.wb(token + 4n, this.b(value + 4n));
    this.accept(this.constants.moveBytes(token + 8n, value + 8n, child)); this.cleanToken(temporary, freeSite);
    if (assign) { const result = this.parser.assignToken(this.current(parser), token); if (result.kind !== 'complete') throw new Stop(result as Failure); }
  }
  private diagnostic(parser: bigint, message: bigint, entry: bigint) {
    let handler = this.q(parser + 0x128n);
    if (handler !== 0n) {
      this.wb(handler + 8n, 1); handler = this.q(parser + 0x128n); const target = this.q(this.q(handler));
      if (!this.services.errorHandler) this.stop('parser-error-handler', target, 0x142544765n);
      if (this.services.errorHandler(target, handler, parser) & 255) { this.wb(this.q(parser + 0x128n) + 9n, 1); return; }
    }
    const sp = entry - 0x98n, name = sp + 32n, record = sp + 64n, token = this.current(parser), text = this.int(token + 20n) === 0 ? 0x14279471dn : this.q(token + 8n);
    this.zero(name, 16); this.zero(name + 16n, 16); let n = 0n; while (this.b(text + n) !== 0) n++;
    this.stringConstruct(name, text, n); const line = this.d(this.q(this.q(parser + 0x28n) + 8n) + 8n);
    this.stringCopy(record, message); this.wd(sp + 96n, line); this.stringCopy(sp + 104n, name);
    const oldTail = this.q(parser + 16n), node = this.malloc(96n, 0x1425447fbn); this.wq(sp + 160n, node);
    if (node !== 0n) {
      this.wq(sp + 176n, node); this.stringCopy(node, record); this.wd(node + 32n, this.d(sp + 96n)); this.stringCopy(node + 40n, sp + 104n);
      this.wq(node + 72n, oldTail); this.wq(node + 80n, 0n); this.wb(node + 88n, 0);
    }
    this.wq(parser + 16n, node); const oldCount = this.d(parser + 24n); this.wd(parser + 24n, oldCount + 1); if (oldCount === 0) this.wq(parser + 8n, node); else this.wq(oldTail + 80n, node);
    this.stringFree(record + 40n, 0x140a0afd3n); this.wq(record + 56n, 0n); this.wq(record + 64n, 15n); this.wb(record + 40n, 0);
    this.stringFree(record, 0x140a0afd3n); this.wq(record + 16n, 0n); this.wq(record + 24n, 15n); this.wb(record, 0);
    this.stringFree(name, 0x1425448can); this.wb(parser + 32n, 1);
  }
  dispatch(definition: bigint, parser: bigint, identifier: number, entryStack: bigint): TechnologyFieldResult {
    if ((identifier | 0) !== 0x2c58) return { kind: 'runtime-required', boundary: 'technology-category-field-untranslated', nativeAddress: 0x140b25c90n, callSite: 0x140b25c90n };
    definition = u64(definition); parser = u64(parser); const entry = u64(entryStack), sp = entry - 0x358n, fp = entry - 0x258n, child = entry - 0x360n;
    const peek = sp + 0x30n, token = fp + 0x70n, out = fp - 0x50n, span = fp - 0x80n; let steps = 0;
    try {
      while (true) {
        if (++steps > this.budget) this.stop('category-loop-budget', 0x140b26290n, 0x140b26290n);
        const input = this.q(parser + 0x28n);
        if (this.b(input + 0x64n) === 0) { const available = this.next(input, child, 0x140b262a4n); this.wd(input + 0x10n, available); if (available === 0) this.wd(input + 0x18n, 19); this.wb(input + 0x64n, 1); }
        this.token(peek, input + 0x18n); const kind = this.d(peek), ended = kind === 4 || kind === 19; this.cleanToken(peek, 0x140b26319n);
        if (ended) break;
        this.wd(fp + 0x270n, this.next(this.q(parser + 0x28n), child, 0x140b2632bn));
        this.token(token, this.current(parser)); this.resolve(parser, token, peek, child, 0x140b263cbn, true); this.cleanToken(token, 0x140b26437n);
        if (this.d(fp + 0x270n) === 0) break;
        const current = this.current(parser), text = this.int(current + 20n) === 0 ? 0x14279471dn : this.q(current + 8n); this.wq(span, text);
        let n = 0n; while (this.b(text + n) !== 0) n++; this.wq(span + 8n, n); this.write(fp - 0x70n, this.bytes(span, 16)); this.hashRecord(out, fp - 0x70n);
        let duplicate = false;
        for (let index = 0; index < this.int(definition + 0x2ccn); index++) {
          const record = this.q(definition + 0x2c0n) + BigInt(index) * 40n;
          if (this.d(record + 32n) === this.d(out + 32n) && this.same(this.stringPointer(record), this.stringPointer(out))) { duplicate = true; break; }
        }
        if (duplicate) {
          const message = fp - 0x70n; this.zero(message, 16); this.wq(message + 16n, 0n); this.wq(message + 24n, 0n);
          const buffer = this.malloc(32n, 0x140b26580n); this.wq(message, buffer); this.wq(message + 16n, 18n); this.wq(message + 24n, 31n);
          this.write(buffer, this.bytes(0x1429c1540n, 16)); this.write(buffer + 16n, this.bytes(0x1429c1550n, 2)); this.wb(buffer + 18n, 0);
          this.diagnostic(parser, message, child); this.stringFree(message, 0x140b279c2n);
        } else { this.appendRecord(definition + 0x2c0n, out); this.wd(fp + 0x270n, this.d(this.current(parser))); this.appendKind(definition + 0x2d8n, fp + 0x270n); }
        this.stringFree(out, 0x140b279c8n);
      }
      this.next(this.q(parser + 0x28n), child, 0x140b2660an); this.token(peek, this.current(parser));
      this.resolve(parser, peek, out, child, 0x140b2669an, true); this.cleanToken(peek, 0x140b266cfn);
      return { kind: 'complete' };
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
